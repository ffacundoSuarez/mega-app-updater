/**
 * Orquestador de un job de QC del Limpiador.
 *
 * Port de `processCleaningJob` de `server.js` (Lightsail) a TypeScript local.
 * En lugar de un endpoint Express + un Set global de jobs activos, exponemos
 * `runCleaningJob(versionId, opts)` que devuelve un controller con:
 *   - `promise`: termina cuando el job acaba (completado, error o cancelado)
 *   - `cancel()`: pide cortar el job antes del próximo batch
 *   - `isCancelled`: estado actual del flag
 *
 * Compromiso de cancelación (decisión del equipo): el flag se chequea **entre
 * batches**. El batch en curso (incluida la llamada OpenAI y la persistencia
 * de flags) se completa; recién después se aborta. Esto replica el
 * comportamiento del servicio Lightsail original.
 *
 * Las keys (Supabase URL/anon, OpenAI) se leen del store al iniciar el job.
 * El motor escribe en `cleaning_versions` (status, processed_rows,
 * progress_percentage, completed_at, error_message) y `cleaning_flags` —
 * el contrato completo está en `docs/LIMPIADOR_QC_CONTRACT.md`.
 */

import { getOpenaiApiKey } from "@/lib/settings";
import { analyzeBatch, type PromptDebugEntry } from "./cleaning-service";
import {
  getAllRows,
  getDeterministicFlaggedRowIds,
  getMaxProcessedRow,
  getProjectRules,
  getRows,
  getVersion,
  saveFlags,
  updateFlagSimilarity,
  updateVersion,
} from "./cleaning-repository";
import {
  deterministicHitToResult,
  runDeterministicChecks,
} from "./pre-ai-checks";
import { detectSimilarRows } from "./similarity-detector";
import { getCleaningSupabaseClient } from "./supabase-client";
import type { CleaningRow, CleaningRule, FlagType } from "./types";

/** Tamaño del batch enviado a OpenAI. Mismo valor que el original (Lightsail). */
const DEFAULT_BATCH_SIZE = 10;
/** Pausa entre batches para no saturar OpenAI. Mismo valor que el original. */
const DEFAULT_BATCH_DELAY_MS = 2000;

export interface CleaningJobProgress {
  versionId: string;
  totalRows: number;
  processedRows: number;
  progressPercentage: number;
  totalFlagged: number;
  /** Cuántos flags se guardaron en el último batch (no acumulado). */
  lastBatchFlags: number;
  /** Cuántas filas tenía el último batch (no acumulado). */
  lastBatchRows: number;
}

export interface CleaningJobResult {
  versionId: string;
  status: "completed" | "error" | "cancelled";
  totalProcessed: number;
  totalFlagged: number;
  errorMessage?: string;
}

export interface CleaningJobOptions {
  /** Tamaño del batch. Default: 10. */
  batchSize?: number;
  /** Delay entre batches (ms). Default: 2000. */
  batchDelayMs?: number;
  /** Override del modelo OpenAI. Pasado tal cual a `analyzeBatch`. */
  model?: string;
  /** Callback de progreso, invocado tras cada batch (antes del delay). */
  onProgress?: (event: CleaningJobProgress) => void;
  /** Logger opcional; si no se pasa, todo va a console con prefijo. */
  onLog?: (level: "info" | "warn" | "error", message: string) => void;
  /**
   * Modo debug: si se pasa, recibe el prompt + respuesta cruda de OpenAI por
   * cada batch (con `batchIndex` 0-based). Útil para iterar el prompt.
   */
  debugPromptLogger?: (entry: PromptDebugEntry) => void;
}

export interface CleaningJobController {
  versionId: string;
  promise: Promise<CleaningJobResult>;
  cancel: () => void;
  readonly isCancelled: boolean;
}

class MissingOpenAiKeyError extends Error {
  constructor() {
    super(
      "Falta OpenAI API key en Ajustes. Configurala antes de ejecutar el Limpiador."
    );
    this.name = "MissingOpenAiKeyError";
  }
}

/**
 * Inicia un job de QC para `versionId`. No bloquea al caller: devuelve un
 * controller cuya `promise` resuelve cuando el job termina.
 *
 * Si el job ya está cancelado al primer chequeo, igual se actualiza la versión
 * a `processing` antes de salir; el caller decide si revierte el estado.
 */
export function runCleaningJob(
  versionId: string,
  options: CleaningJobOptions = {}
): CleaningJobController {
  const state = { cancelled: false };

  const promise = executeJob(versionId, options, state);

  return {
    versionId,
    promise,
    cancel: () => {
      state.cancelled = true;
    },
    get isCancelled() {
      return state.cancelled;
    },
  };
}

async function executeJob(
  versionId: string,
  options: CleaningJobOptions,
  state: { cancelled: boolean }
): Promise<CleaningJobResult> {
  const {
    batchSize = DEFAULT_BATCH_SIZE,
    batchDelayMs = DEFAULT_BATCH_DELAY_MS,
    model,
    onProgress,
    onLog,
    debugPromptLogger,
  } = options;

  const log = onLog ?? defaultLogger;
  let batchIndex = 0;

  let totalProcessed = 0;
  let totalFlagged = 0;

  // Acumulan las filas flagueadas durante el QC para alimentar la pasada de
  // similaridad por embeddings al final del job (paso 4).
  const flaggedRows: CleaningRow[] = [];
  const flaggedRowIds = new Set<string>();

  try {
    const apiKey = await getOpenaiApiKey();
    if (!apiKey) throw new MissingOpenAiKeyError();

    const client = await getCleaningSupabaseClient();

    log("info", `Processing cleaning job: ${versionId}`);
    await updateVersion(client, versionId, { status: "processing" });

    const version = await getVersion(client, versionId);
    log("info", `Version details fetched: ${version.filename}`);

    const rules: CleaningRule[] = await getProjectRules(client, version.project_id);
    log("info", `Found ${rules.length} active rules`);

    // ---- Capa pre-IA: chequeos determinísticos sobre TODAS las filas ----
    // Best-effort: si falla la carga/persistencia, seguimos sin pre-filtro
    // (la IA procesará todo, que es el fallback correcto).
    const deterministicRowIds = new Set<string>();
    try {
      const allRows = await getAllRows(client, versionId);
      const hits = runDeterministicChecks({
        rows: allRows,
        schema: version.schema,
        onLog: log,
      });
      if (hits.size > 0) {
        const rowById = new Map(allRows.map((r) => [r.id, r]));
        const detResults = [...hits.entries()]
          .map(([rowId, hit]) => {
            const r = rowById.get(rowId);
            return r ? deterministicHitToResult(hit, r) : null;
          })
          .filter((r): r is NonNullable<typeof r> => r !== null);
        // ignoreConflicts: un flag determinístico nunca pisa un juicio ya
        // tomado (IA o corrida previa) — caso de upgrade sobre job parcial.
        const saved = await saveFlags(client, versionId, detResults, {
          ignoreConflicts: true,
        });
        totalFlagged += saved;
        for (const [rowId] of hits) {
          deterministicRowIds.add(rowId);
          const r = rowById.get(rowId);
          if (r && !flaggedRowIds.has(rowId)) {
            flaggedRows.push(r);
            flaggedRowIds.add(rowId);
          }
        }
        log("info", `Pre-IA: ${saved} flags determinísticos persistidos.`);
      }
    } catch (preErr) {
      log(
        "warn",
        `Pre-IA: falló la pasada determinística, sigo sin pre-filtro: ${errorMessage(preErr)}`
      );
      // Aún así intentamos saber qué filas ya tienen flag determinístico de una
      // corrida previa, para no re-mandarlas a la IA al reanudar.
      try {
        const prev = await getDeterministicFlaggedRowIds(client, versionId);
        for (const id of prev) deterministicRowIds.add(id);
      } catch {
        /* ignore */
      }
    }

    // Resume: si processed_rows quedó atrás respecto a flags de IA ya guardados,
    // adelantamos el cursor para no reprocesar filas ya analizadas.
    let cursor = Number(version.processed_rows ?? 0);
    const maxProcessedRow = await getMaxProcessedRow(client, versionId);
    if (maxProcessedRow > cursor) {
      log("info", `Advancing cursor from ${cursor} → ${maxProcessedRow}`);
      cursor = maxProcessedRow;
    }

    while (true) {
      if (state.cancelled) {
        log("info", `Job ${versionId} cancelled before next batch`);
        await updateVersion(client, versionId, {
          status: "error",
          processed_rows: cursor,
          progress_percentage: progressPct(cursor, version.total_rows),
          error_message: "Cancelled by user",
        });
        return {
          versionId,
          status: "cancelled",
          totalProcessed,
          totalFlagged,
        };
      }

      const rows = await getRows(client, versionId, cursor, batchSize);
      if (rows.length === 0) break;

      // Las filas ya flagueadas por la capa pre-IA no se mandan a la IA.
      const aiRows = rows.filter((r) => !deterministicRowIds.has(r.id));
      const skipped = rows.length - aiRows.length;

      log(
        "info",
        `Processing batch: ${rows.length} rows starting at row ${cursor + 1}` +
          (skipped > 0 ? ` (${skipped} ya flagueadas por chequeos determinísticos, no van a la IA)` : "")
      );

      try {
        let flaggedCount = 0;
        let flagBreakdown = { red: 0, yellow: 0 };
        if (aiRows.length > 0) {
          const results = await analyzeBatch(
            { rows: aiRows, schema: version.schema, rules, apiKey },
            { model, onLog: log, debugPromptLogger, batchIndex }
          );
          batchIndex++;

          flaggedCount = await saveFlags(client, versionId, results);
          totalFlagged += flaggedCount;
          flagBreakdown = countFlagsByType(results);

          // Acumulamos filas flagueadas para la pasada de similaridad al final
          // (paso 4 — embeddings cross-row sobre preguntas abiertas).
          results.forEach((r, i) => {
            if (r.flag !== "none") {
              flaggedRows.push(aiRows[i]);
              flaggedRowIds.add(r.row_id);
            }
          });
        } else {
          log("info", "Batch sin filas para la IA (todas flagueadas determinísticamente); se saltea OpenAI.");
        }

        const currentMaxRow = Math.max(...rows.map((r) => r.row_number));
        const progressPercent = progressPct(currentMaxRow, version.total_rows);

        await updateVersion(client, versionId, {
          processed_rows: currentMaxRow,
          progress_percentage: progressPercent,
        });

        totalProcessed += rows.length;
        cursor = currentMaxRow;

        log(
          "info",
          `Progress: ${currentMaxRow}/${version.total_rows} (${progressPercent}%) ` +
            `- batch flags: ${flaggedCount} (red=${flagBreakdown.red}, yellow=${flagBreakdown.yellow}) ` +
            `- total flags: ${totalFlagged}`
        );

        onProgress?.({
          versionId,
          totalRows: version.total_rows,
          processedRows: currentMaxRow,
          progressPercentage: progressPercent,
          totalFlagged,
          lastBatchFlags: flaggedCount,
          lastBatchRows: rows.length,
        });
      } catch (batchError) {
        // Igual que el original: loguear y seguir con el siguiente batch.
        // El cursor NO avanza: el siguiente loop reintentará las mismas filas.
        log("error", `Error in batch: ${errorMessage(batchError)}`);
      }

      // Si el batch volvió incompleto, llegamos al final.
      if (rows.length < batchSize) break;

      // Pausa para no saturar OpenAI. Sólo si queda otro batch.
      if (batchDelayMs > 0) {
        await sleep(batchDelayMs);
      }
    }

    const isComplete = cursor >= version.total_rows;
    const finalStatus: "completed" | "error" = isComplete ? "completed" : "error";

    // Pasada de similaridad: best-effort. Sólo si terminamos OK, no nos
    // cancelaron, y hay flags sobre los que tenga sentido detectar similaridad.
    if (
      !state.cancelled &&
      isComplete &&
      flaggedRows.length > 0
    ) {
      log(
        "info",
        `Running similarity detection over ${flaggedRows.length} flagged rows…`
      );
      const simResult = await detectSimilarRows({
        rows: flaggedRows,
        schema: version.schema,
        apiKey,
        flaggedRowIds,
        onLog: log,
      });
      if (simResult.rowToSimilar.size > 0) {
        const updated = await updateFlagSimilarity(
          client,
          versionId,
          simResult.rowToSimilar
        );
        log(
          "info",
          `Similarity: ${updated} flags enriched with similar_response_ids`
        );
      } else if (!simResult.skipped) {
        log("info", "Similarity: no clusters above threshold; nothing to update.");
      }
    }

    await updateVersion(client, versionId, {
      status: finalStatus,
      processed_rows: cursor,
      progress_percentage: progressPct(cursor, version.total_rows),
      completed_at: isComplete ? new Date().toISOString() : null,
    });

    log(
      "info",
      `Cleaning job ${versionId} ${
        isComplete ? "completed" : "partially completed"
      }: ${totalFlagged} flags`
    );

    return {
      versionId,
      status: finalStatus,
      totalProcessed,
      totalFlagged,
    };
  } catch (err) {
    const message = errorMessage(err);
    log("error", `Error in cleaning job ${versionId}: ${message}`);

    // Best-effort: marcar la versión como error. Si esto también falla, lo
    // logueamos pero no enmascaramos el error original.
    try {
      const client = await getCleaningSupabaseClient();
      await updateVersion(client, versionId, {
        status: "error",
        error_message: message,
      });
    } catch (updateErr) {
      log(
        "error",
        `Failed to update version status after error: ${errorMessage(updateErr)}`
      );
    }

    return {
      versionId,
      status: "error",
      totalProcessed,
      totalFlagged,
      errorMessage: message,
    };
  }
}

// ---------- helpers ----------

function progressPct(processed: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.round((processed / total) * 100);
}

function countFlagsByType(
  results: Array<{ flag: FlagType | "none" }>
): { red: number; yellow: number } {
  let red = 0;
  let yellow = 0;
  for (const r of results) {
    if (r.flag === "red") red++;
    else if (r.flag === "yellow") yellow++;
  }
  return { red, yellow };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function defaultLogger(
  level: "info" | "warn" | "error",
  message: string
): void {
  const fn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  fn(`[cleaning-job] ${message}`);
}

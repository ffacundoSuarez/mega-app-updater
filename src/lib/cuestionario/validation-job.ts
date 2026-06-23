/**
 * Orquestador de validación de cuestionarios.
 *
 * Iteración 2: corre checks deterministicos (puros, baratos, sin IA).
 * Iteración 3: opcionalmente corre los checks semánticos con IA después de
 *              los deterministicos, emitiendo progreso por categoría.
 *
 * Contrato:
 *   - Recibe un `questionnaireId` + `Questionnaire`. El id se necesita para
 *     persistir el reporte y como prefijo del prompt_cache_key.
 *   - Devuelve el reporte. Si `persist` es true (default), lo inserta en
 *     `questionnaire_validations`. Pasar false sirve para previews/dry-runs.
 *   - Si un AI check falla (HTTP, JSON, etc.) emitimos `ai_check_failed` pero
 *     seguimos con los demás — no queremos perder la validación entera por un
 *     error puntual de la IA. La cancelación (AbortError) sí aborta todo.
 */

import {
  AI_CHECKS,
  AiCheckError,
  filterPedanticAiIssues,
  MissingOpenaiApiKeyError,
} from "./ai-checks";
import { runDeterministicChecks } from "./checks";
import { insertValidation } from "./questionnaire-repository";
import {
  getCuestionarioModel,
  getOpenaiApiKey,
} from "@/lib/settings";
import type {
  IssueCategory,
  IssueSeverity,
  QCIssue,
  Question,
  Questionnaire,
  QuestionnairePerQuestionIssues,
  QuestionnaireValidationReport,
} from "./types";

export interface RunValidationOptions {
  /** Si false, no persiste el reporte en `questionnaire_validations`. Default: true. */
  persist?: boolean;
  /** Marca de cuándo se parseó el cuestionario. Default: now(). */
  parsedAt?: string;
  /** Si true, después de los deterministicos corre los checks IA. Default: false. */
  runAiChecks?: boolean;
  /** Para cancelar la corrida (se propaga al fetch de OpenAI). */
  signal?: AbortSignal;
  /** Callback de progreso. Útil para mostrar status durante los AI checks. */
  onProgress?: (event: ValidationProgressEvent) => void;
}

export type ValidationProgressEvent =
  | { type: "start"; questionsCount: number; aiChecksPlanned: number }
  | { type: "deterministic_done"; count: number }
  | { type: "ai_check_start"; key: string; label: string }
  | { type: "ai_check_done"; key: string; label: string; count: number }
  | { type: "ai_check_failed"; key: string; label: string; error: string }
  | { type: "done"; report: QuestionnaireValidationReport };

/**
 * Corre la validación completa sobre un cuestionario y devuelve el reporte.
 * Si `persist` es true (default), también inserta una fila en
 * `questionnaire_validations`.
 */
export async function runValidation(
  questionnaireId: string,
  questionnaire: Questionnaire,
  options: RunValidationOptions = {}
): Promise<QuestionnaireValidationReport> {
  const {
    persist = true,
    parsedAt,
    runAiChecks = false,
    signal,
    onProgress,
  } = options;

  onProgress?.({
    type: "start",
    questionsCount: questionnaire.preguntas.length,
    aiChecksPlanned: runAiChecks ? AI_CHECKS.length : 0,
  });

  // 1) Checks deterministicos.
  const issues: QCIssue[] = runDeterministicChecks(questionnaire);
  onProgress?.({ type: "deterministic_done", count: issues.length });

  // 2) Checks IA (opcional).
  if (runAiChecks) {
    const apiKey = await getOpenaiApiKey();
    if (!apiKey) throw new MissingOpenaiApiKeyError();
    const model = await getCuestionarioModel();

    for (const def of AI_CHECKS) {
      // Cortar temprano si el usuario canceló entre checks.
      if (signal?.aborted) {
        const reason = signal.reason;
        throw reason instanceof Error
          ? reason
          : new DOMException("Validación cancelada", "AbortError");
      }

      onProgress?.({
        type: "ai_check_start",
        key: def.key,
        label: def.label,
      });
      try {
        const aiIssues = await def.run(questionnaire, {
          apiKey,
          model,
          signal,
          cacheKeyPrefix: questionnaireId,
        });
        issues.push(...aiIssues);
        onProgress?.({
          type: "ai_check_done",
          key: def.key,
          label: def.label,
          count: aiIssues.length,
        });
      } catch (err) {
        if (isAbortError(err)) throw err;
        const msg =
          err instanceof AiCheckError || err instanceof Error
            ? err.message
            : String(err);
        onProgress?.({
          type: "ai_check_failed",
          key: def.key,
          label: def.label,
          error: msg,
        });
        // No re-lanzamos: el resto de los AI checks puede igual aportar valor.
      }
    }
  }

  // 3) Armado del reporte + persistencia.
  const filteredIssues = applyReportIssueFilters(questionnaire, issues);
  const report = buildReport({
    questionnaireId,
    questionnaire,
    issues: filteredIssues,
    parsedAt: parsedAt ?? new Date().toISOString(),
  });

  if (persist) {
    await insertValidation(questionnaireId, report);
  }

  onProgress?.({ type: "done", report });
  return report;
}

/**
 * Re-aplica los filtros de ruido sobre un reporte ya persistido (p. ej. generado
 * antes de endurecer prompts/post-filtros). Mantiene fechas originales.
 */
export function sanitizeValidationReport(
  questionnaire: Questionnaire,
  report: QuestionnaireValidationReport
): QuestionnaireValidationReport {
  const allIssues = [
    ...report.issues_globales,
    ...report.issues_por_pregunta.flatMap((g) => g.issues),
  ];
  const filtered = applyReportIssueFilters(questionnaire, allIssues);
  const rebuilt = buildReport({
    questionnaireId: report.questionnaire_id,
    questionnaire,
    issues: filtered,
    parsedAt: report.parsed_at,
  });
  return {
    ...rebuilt,
    validated_at: report.validated_at,
  };
}

// ---------------------------------------------------------------------------
// Armado del reporte
// ---------------------------------------------------------------------------

interface BuildReportInput {
  questionnaireId: string;
  questionnaire: Questionnaire;
  issues: QCIssue[];
  parsedAt: string;
}

function buildReport(input: BuildReportInput): QuestionnaireValidationReport {
  const { questionnaireId, questionnaire, issues, parsedAt } = input;

  // Mapa pregunta_id → metadata para resolver el numero/texto en el reporte.
  const meta = new Map<string, { numero: number; texto: string }>();
  for (const p of questionnaire.preguntas) {
    if (p.id) meta.set(p.id, { numero: p.numero, texto: p.texto });
  }

  const porPregunta = new Map<string, QCIssue[]>();
  const globales: QCIssue[] = [];

  for (const issue of issues) {
    if (issue.pregunta_id && meta.has(issue.pregunta_id)) {
      const arr = porPregunta.get(issue.pregunta_id) ?? [];
      arr.push(issue);
      porPregunta.set(issue.pregunta_id, arr);
    } else {
      // Issues con pregunta_id null o desconocido van al bucket global para
      // que igual se vean (la IA a veces inventa ids; los redirigimos acá).
      globales.push(issue);
    }
  }

  // Ordenamos las preguntas por `numero` para que el reporte se renderice en orden.
  const orderedQuestionIds = [...porPregunta.keys()].sort((a, b) => {
    const na = meta.get(a)?.numero ?? Number.MAX_SAFE_INTEGER;
    const nb = meta.get(b)?.numero ?? Number.MAX_SAFE_INTEGER;
    return na - nb;
  });

  const issues_por_pregunta: QuestionnairePerQuestionIssues[] =
    orderedQuestionIds.map((pid) => {
      const m = meta.get(pid)!;
      return {
        pregunta_id: pid,
        pregunta_numero: m.numero,
        pregunta_texto: m.texto,
        issues: porPregunta.get(pid) ?? [],
      };
    });

  const resumen = summarize(issues);

  return {
    questionnaire_id: questionnaireId,
    parsed_at: parsedAt,
    validated_at: new Date().toISOString(),
    issues_por_pregunta,
    issues_globales: globales,
    resumen,
  };
}

function summarize(issues: QCIssue[]): QuestionnaireValidationReport["resumen"] {
  const counters: Record<IssueSeverity, number> = {
    error: 0,
    advertencia: 0,
    sugerencia: 0,
  };
  for (const i of issues) {
    counters[i.severidad]++;
  }
  return {
    errors: counters.error,
    advertencias: counters.advertencia,
    sugerencias: counters.sugerencia,
    total: issues.length,
  };
}

/**
 * Red de seguridad: descarta issues sobre comentarios y sobre el patrón
 * "pares" (mismo enunciado introductorio, 2 opciones) donde la IA suele
 * inventar redundancia/instrucción repetida.
 */
function filterIssuesForReport(
  questionnaire: Questionnaire,
  issues: QCIssue[]
): QCIssue[] {
  const comentarioIds = new Set(
    questionnaire.preguntas
      .filter((p) => p.tipo === "comentario")
      .map((p) => p.id)
  );
  const pairIds = detectPairQuestionIds(questionnaire.preguntas);
  const noisyCategories = new Set<IssueCategory>([
    "wording",
    "semantica",
    "logica",
  ]);

  return issues.filter((issue) => {
    const pid = issue.pregunta_id;
    if (pid && comentarioIds.has(pid)) return false;
    if (
      pid &&
      pairIds.has(pid) &&
      noisyCategories.has(issue.categoria)
    ) {
      return false;
    }
    return true;
  });
}

/** Aplica el post-filtro de ruido IA sobre el resultado de filterIssuesForReport. */
function applyReportIssueFilters(
  questionnaire: Questionnaire,
  issues: QCIssue[]
): QCIssue[] {
  return filterPedanticAiIssues(
    questionnaire,
    filterIssuesForReport(questionnaire, issues)
  );
}

/** Preguntas "pares": cerrada_unica con 2 opciones y mismo texto que un vecino. */
function detectPairQuestionIds(preguntas: Question[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < preguntas.length; i++) {
    const p = preguntas[i];
    if (p.tipo !== "cerrada_unica" || p.opciones.length !== 2) continue;
    const texto = p.texto.trim();
    for (const j of [i - 1, i + 1]) {
      if (j < 0 || j >= preguntas.length) continue;
      const other = preguntas[j];
      if (
        other.tipo === "cerrada_unica" &&
        other.opciones.length === 2 &&
        other.texto.trim() === texto
      ) {
        out.add(p.id);
        break;
      }
    }
  }
  return out;
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

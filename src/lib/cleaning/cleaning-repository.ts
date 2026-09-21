/**
 * Repositorio Supabase del Limpiador.
 *
 * Port directo de `cleaning-supabase.js` (Lightsail) a TypeScript usando el
 * cliente cacheado de `supabase-client.ts`. Las operaciones son las que el
 * motor de QC necesita durante un job:
 *
 *   - leer la versión y sus reglas
 *   - paginar filas por cursor (`row_number`)
 *   - reconciliar el cursor contra flags ya guardados (resume)
 *   - upsert de flags por (`version_id`, `row_id`)
 *   - actualizar progreso (`processed_rows`, `progress_percentage`, `status`)
 *   - leer conteos para el panel de review
 *
 * Cambios vs original:
 *   - Sin `getAuthenticatedClient(authHeader)`: la app desktop usa anon key
 *     directa del store (no hay sesión Supabase), y la RLS del proyecto del
 *     Limpiador permite operar con anon. Cuando la RLS se endurezca (F3) se
 *     reintroduce autenticación.
 *   - Tipos estrictos en lugar de `data` dinámico.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DETERMINISTIC_RULE_IDS } from "./field-checks";
import type {
  AnalyzeResult,
  CleaningFlagInsert,
  CleaningRow,
  CleaningRule,
  CleaningVersion,
  VersionStatus,
} from "./types";

/** Campos modificables de `cleaning_versions` desde el motor. */
export interface VersionUpdate {
  status?: VersionStatus;
  processed_rows?: number;
  progress_percentage?: number;
  completed_at?: string | null;
  error_message?: string | null;
}

export async function getVersion(
  client: SupabaseClient,
  versionId: string
): Promise<CleaningVersion> {
  const { data, error } = await client
    .from("cleaning_versions")
    .select("*, cleaning_projects(*)")
    .eq("id", versionId)
    .single();

  if (error || !data) {
    throw new Error(`Version not found: ${error?.message ?? "no data"}`);
  }
  return data as CleaningVersion;
}

export async function updateVersion(
  client: SupabaseClient,
  versionId: string,
  updates: VersionUpdate
): Promise<void> {
  const { error } = await client
    .from("cleaning_versions")
    .update(updates)
    .eq("id", versionId);

  if (error) {
    throw new Error(`Failed to update version: ${error.message}`);
  }
}

export async function getProjectRules(
  client: SupabaseClient,
  projectId: string
): Promise<CleaningRule[]> {
  const { data, error } = await client
    .from("cleaning_rules")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("order_index", { ascending: true });

  if (error) {
    console.warn("Could not fetch rules:", error.message);
    return [];
  }
  return (data ?? []) as CleaningRule[];
}

/**
 * Pagina filas de la versión a partir de `cursor` (exclusivo).
 * `cursor` es el último `row_number` ya procesado.
 */
export async function getRows(
  client: SupabaseClient,
  versionId: string,
  cursor: number,
  limit: number
): Promise<CleaningRow[]> {
  const { data, error } = await client
    .from("cleaning_rows")
    .select("*")
    .eq("version_id", versionId)
    .gt("row_number", cursor)
    .order("row_number", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch rows: ${error.message}`);
  }
  return (data ?? []) as CleaningRow[];
}

/** True si el flag proviene SÓLO de chequeos determinísticos (capa pre-IA). */
function isPurelyDeterministicFlag(matchedRules: unknown): boolean {
  if (!Array.isArray(matchedRules) || matchedRules.length === 0) return false;
  return matchedRules.every(
    (r) => typeof r === "string" && DETERMINISTIC_RULE_IDS.has(r)
  );
}

/**
 * Mayor `row_number` ya procesado **por la IA** en la versión. Se usa para
 * reconciliar el cursor cuando un job se reanuda y `processed_rows` quedó atrás.
 *
 * Excluye los flags puramente determinísticos: los de corridas viejas (cuando
 * la capa pre-IA los escribía upfront, en cualquier `row_number`) y los del
 * fallback actual NO garantizan que las filas previas hayan pasado por la IA —
 * contarlos haría que el resume saltee filas sin analizar. Es conservador:
 * a lo sumo se re-analizan filas, nunca se saltean.
 */
export async function getMaxProcessedRow(
  client: SupabaseClient,
  versionId: string
): Promise<number> {
  const PAGE = 500;
  let offset = 0;
  let maxRow = 0;

  while (true) {
    const { data, error } = await client
      .from("cleaning_flags")
      .select("matched_rules, cleaning_rows!inner(row_number)")
      .eq("version_id", versionId)
      .order("row_number", {
        ascending: false,
        foreignTable: "cleaning_rows",
      })
      .range(offset, offset + PAGE - 1);

    if (error) {
      console.warn("Could not reconcile cursor:", error.message);
      return maxRow;
    }
    if (!data || data.length === 0) break;

    const rows = data as Array<{
      matched_rules: unknown;
      cleaning_rows: { row_number: number } | { row_number: number }[] | null;
    }>;

    for (const f of rows) {
      if (isPurelyDeterministicFlag(f.matched_rules)) continue;
      const cr = f.cleaning_rows;
      if (!cr) continue;
      const rn = Array.isArray(cr) ? cr[0]?.row_number : cr.row_number;
      if (Number.isFinite(rn) && (rn as number) > maxRow) {
        maxRow = rn as number;
      }
    }

    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return maxRow;
}

/**
 * Trae TODAS las filas de la versión (paginadas internamente). Lo necesita la
 * capa pre-IA, que corre chequeos cross-row (IPs duplicadas, percentiles de
 * duración) sobre el set completo antes del bucle de la IA.
 */
export async function getAllRows(
  client: SupabaseClient,
  versionId: string
): Promise<CleaningRow[]> {
  const PAGE = 1000;
  const all: CleaningRow[] = [];
  let cursor = 0;
  for (;;) {
    const page = await getRows(client, versionId, cursor, PAGE);
    if (page.length === 0) break;
    all.push(...page);
    if (page.length < PAGE) break;
    cursor = page[page.length - 1].row_number;
  }
  return all;
}

/**
 * Persiste los flags del batch (sólo los `flag !== "none"`).
 * Upsert por (`version_id`, `row_id`) para que reintentos no dupliquen.
 * Devuelve cuántos flags se intentaron guardar.
 */
export async function saveFlags(
  client: SupabaseClient,
  versionId: string,
  results: AnalyzeResult[]
): Promise<number> {
  const flagged = results.filter(
    (r): r is AnalyzeResult & { flag: "red" | "yellow" } => r.flag !== "none"
  );
  if (flagged.length === 0) return 0;

  const inserts: CleaningFlagInsert[] = flagged.map((r) => ({
    version_id: versionId,
    row_id: r.row_id,
    flag_type: r.flag,
    reason: r.reason || "No reason provided",
    matched_rules: r.matched_rules ?? [],
    confidence: r.confidence ?? 0.5,
    user_decision: null,
    friendly_explanation: r.friendly_explanation ?? null,
    recommendation: r.recommendation ?? null,
    affected_question_ids: r.affected_question_ids ?? [],
    similar_response_ids: [],
  }));

  const { error } = await client.from("cleaning_flags").upsert(inserts, {
    onConflict: "version_id,row_id",
  });

  if (error) {
    throw new Error(`Failed to save flags: ${error.message}`);
  }
  return flagged.length;
}

/**
 * Actualiza `similar_response_ids` para los flags ya guardados en la versión.
 * Lo llama la pasada de similaridad después del QC IA. Recibe un mapa
 * `row_id → response_ids similares`. Sólo updatea filas presentes en el mapa
 * (las que cayeron en algún cluster).
 */
export async function updateFlagSimilarity(
  client: SupabaseClient,
  versionId: string,
  rowToSimilar: Map<string, string[]>
): Promise<number> {
  if (rowToSimilar.size === 0) return 0;
  let updated = 0;
  const updates = [...rowToSimilar.entries()];
  const results = await Promise.all(
    updates.map(async ([rowId, similarIds]) => {
      const { error } = await client
        .from("cleaning_flags")
        .update({ similar_response_ids: similarIds })
        .eq("version_id", versionId)
        .eq("row_id", rowId);
      return { rowId, error };
    })
  );
  for (const { rowId, error } of results) {
    if (error) {
      console.warn(
        `Could not update similarity for row ${rowId}: ${error.message}`
      );
      continue;
    }
    updated++;
  }
  return updated;
}

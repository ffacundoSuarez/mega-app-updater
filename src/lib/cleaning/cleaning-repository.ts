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
import type {
  AnalyzeResult,
  CleaningFlagInsert,
  CleaningRow,
  CleaningRule,
  CleaningVersion,
  FlagCounts,
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

/**
 * Mayor `row_number` ya flagueado en la versión. Se usa para reconciliar el
 * cursor cuando un job se reanuda y `processed_rows` quedó atrás respecto de
 * los flags realmente guardados.
 */
export async function getMaxProcessedRow(
  client: SupabaseClient,
  versionId: string
): Promise<number> {
  const { data, error } = await client
    .from("cleaning_flags")
    .select("row_id, cleaning_rows!inner(row_number)")
    .eq("version_id", versionId);

  if (error) {
    console.warn("Could not reconcile cursor:", error.message);
    return 0;
  }
  if (!data || data.length === 0) return 0;

  const rows = data as Array<{
    cleaning_rows: { row_number: number } | { row_number: number }[] | null;
  }>;

  const maxRow = rows
    .map((f) => {
      const cr = f.cleaning_rows;
      if (!cr) return 0;
      // Supabase devuelve relación 1:N como array; en este caso sabemos que es 1:1.
      const rn = Array.isArray(cr) ? cr[0]?.row_number : cr.row_number;
      return Number.isFinite(rn) ? (rn as number) : 0;
    })
    .reduce((acc, n) => (n > acc ? n : acc), 0);

  return Number.isFinite(maxRow) ? maxRow : 0;
}

/**
 * Persiste los flags del batch (sólo los `flag !== "none"`).
 * Usa upsert por (`version_id`, `row_id`) para que reintentos no dupliquen.
 * Devuelve cuántos flags se guardaron.
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

  const { error } = await client
    .from("cleaning_flags")
    .upsert(inserts, { onConflict: "version_id,row_id" });

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
  for (const [rowId, similarIds] of rowToSimilar) {
    const { error } = await client
      .from("cleaning_flags")
      .update({ similar_response_ids: similarIds })
      .eq("version_id", versionId)
      .eq("row_id", rowId);
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

export async function getFlagCounts(
  client: SupabaseClient,
  versionId: string
): Promise<FlagCounts> {
  const { data, error } = await client
    .from("cleaning_flags")
    .select("flag_type, user_decision")
    .eq("version_id", versionId);

  if (error || !data) {
    console.warn("Could not get flag counts:", error?.message);
    return { red: 0, yellow: 0, pending: 0, decided: 0 };
  }

  const rows = data as Array<{
    flag_type: "red" | "yellow";
    user_decision: "keep" | "remove" | null;
  }>;

  return {
    red: rows.filter((f) => f.flag_type === "red").length,
    yellow: rows.filter((f) => f.flag_type === "yellow").length,
    pending: rows.filter((f) => f.user_decision === null).length,
    decided: rows.filter((f) => f.user_decision !== null).length,
  };
}

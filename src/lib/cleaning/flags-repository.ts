/**
 * CRUD de `cleaning_flags` para la pantalla de Review (paso 5.B).
 *
 * Distinto de `cleaning-repository.ts` (que es para el motor F0 + paso 4):
 * éste devuelve los flags con la fila join'ada (`row:cleaning_rows(*)`) y
 * deja al usuario filtrar por tipo y decisión. También expone bulk update
 * y reset para acciones masivas en el review.
 */

import { getCleaningSupabaseClient } from "./supabase-client";
import type {
  CleaningFlagWithRow,
  CleaningRow,
  FlagDecision,
  FlagType,
  ReviewFlagCounts,
} from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cita un valor para una lista PostgREST `in.(...)` (escapa comillas dobles). */
function quoteForIn(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Trae las filas referenciadas por `cleaning_flags.similar_response_ids` (que
 * guarda `response_id`s o, como fallback, `row_id`s — ver el contrato de QC).
 * Busca por ambas columnas; los identificadores con forma de UUID también se
 * matchean contra `id`. Usado por el review para mostrar el texto real de las
 * respuestas similares en vez del id crudo (idea 9 del rediseño 5.B).
 */
export async function getSimilarRows(
  versionId: string,
  identifiers: string[]
): Promise<CleaningRow[]> {
  const uniq = [...new Set(identifiers.filter((s) => s && s.trim()))];
  if (uniq.length === 0) return [];

  const client = await getCleaningSupabaseClient();
  const respList = uniq.map(quoteForIn).join(",");
  const orParts = [`response_id.in.(${respList})`];
  const uuidLike = uniq.filter((s) => UUID_RE.test(s));
  if (uuidLike.length > 0) {
    orParts.push(`id.in.(${uuidLike.map(quoteForIn).join(",")})`);
  }

  const { data, error } = await client
    .from("cleaning_rows")
    .select("*")
    .eq("version_id", versionId)
    .or(orParts.join(","));

  if (error) {
    throw new Error(
      `No se pudieron cargar las respuestas similares: ${error.message}`
    );
  }
  return (data ?? []) as unknown as CleaningRow[];
}

/**
 * Trae las filas de la versión que NO tienen ningún flag en `cleaning_flags`.
 * Las usa el review para mostrar respuestas "OK" cuando el usuario activa el
 * toggle "Mostrar todas las filas".
 *
 * Implementación: bajamos todos los row_ids con flag y todas las filas, y
 * restamos en memoria. Suficiente para los volúmenes que maneja la herramienta
 * (encuestas de market research, no big data).
 */
export async function listUnflaggedRows(
  versionId: string
): Promise<CleaningRow[]> {
  const client = await getCleaningSupabaseClient();

  const [{ data: flagged, error: flagsErr }, { data: allRows, error: rowsErr }] =
    await Promise.all([
      client
        .from("cleaning_flags")
        .select("row_id")
        .eq("version_id", versionId),
      client
        .from("cleaning_rows")
        .select("*")
        .eq("version_id", versionId)
        .order("row_number", { ascending: true }),
    ]);

  if (flagsErr) {
    throw new Error(`No se pudieron leer los flags: ${flagsErr.message}`);
  }
  if (rowsErr) {
    throw new Error(`No se pudieron leer las filas: ${rowsErr.message}`);
  }

  const flaggedIds = new Set(
    ((flagged ?? []) as Array<{ row_id: string }>).map((f) => f.row_id)
  );
  return ((allRows ?? []) as unknown as CleaningRow[]).filter(
    (r) => !flaggedIds.has(r.id)
  );
}

export interface ListFlagsFilters {
  flagType?: FlagType;
  /**
   * Filtra por estado de decisión:
   *   - 'pending' → user_decision IS NULL
   *   - 'keep' / 'remove' → exact match
   */
  userDecision?: "pending" | "keep" | "remove";
}

/**
 * Trae los flags de una versión con la fila incrustada en `flag.row`.
 * Ordenados por created_at ASC para que la UI tenga un orden estable
 * mientras el usuario itera.
 */
export async function listFlags(
  versionId: string,
  filters: ListFlagsFilters = {}
): Promise<CleaningFlagWithRow[]> {
  const client = await getCleaningSupabaseClient();
  let query = client
    .from("cleaning_flags")
    .select("*, row:cleaning_rows(*)")
    .eq("version_id", versionId)
    .order("created_at", { ascending: true });

  if (filters.flagType) {
    query = query.eq("flag_type", filters.flagType);
  }
  if (filters.userDecision === "pending") {
    query = query.is("user_decision", null);
  } else if (filters.userDecision) {
    query = query.eq("user_decision", filters.userDecision);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`No se pudieron cargar los flags: ${error.message}`);
  }

  // Supabase devuelve la relación 1:1 como objeto en las versiones recientes,
  // pero en algunos casos llega como array de 1 elemento. Normalizamos.
  return ((data ?? []) as unknown as Array<
    CleaningFlagWithRow & { row?: CleaningRow | CleaningRow[] | null }
  >).map((f) => ({
    ...f,
    row: Array.isArray(f.row) ? f.row[0] ?? null : f.row ?? null,
  }));
}

/** Conteos agregados para el panel de stats. */
export async function getReviewFlagCounts(
  versionId: string
): Promise<ReviewFlagCounts> {
  const client = await getCleaningSupabaseClient();
  const { data, error } = await client
    .from("cleaning_flags")
    .select("flag_type, user_decision")
    .eq("version_id", versionId);

  if (error || !data) {
    return { red: 0, yellow: 0, pending: 0, decided: 0, toRemove: 0, toKeep: 0 };
  }

  const rows = data as Array<{
    flag_type: FlagType;
    user_decision: FlagDecision;
  }>;

  return {
    red: rows.filter((f) => f.flag_type === "red").length,
    yellow: rows.filter((f) => f.flag_type === "yellow").length,
    pending: rows.filter((f) => f.user_decision === null).length,
    decided: rows.filter((f) => f.user_decision !== null).length,
    toRemove: rows.filter((f) => f.user_decision === "remove").length,
    toKeep: rows.filter((f) => f.user_decision === "keep").length,
  };
}

/** Setea la decisión humana sobre un flag puntual. */
export async function updateFlagDecision(
  flagId: string,
  decision: "keep" | "remove"
): Promise<void> {
  const client = await getCleaningSupabaseClient();
  const { error } = await client
    .from("cleaning_flags")
    .update({
      user_decision: decision,
      decided_at: new Date().toISOString(),
    })
    .eq("id", flagId);

  if (error) {
    throw new Error(`No se pudo actualizar el flag: ${error.message}`);
  }
}

/** Bulk update: misma decisión para varios flagIds. */
export async function bulkUpdateFlagDecisions(
  flagIds: string[],
  decision: "keep" | "remove"
): Promise<number> {
  if (flagIds.length === 0) return 0;
  const client = await getCleaningSupabaseClient();
  const { error } = await client
    .from("cleaning_flags")
    .update({
      user_decision: decision,
      decided_at: new Date().toISOString(),
    })
    .in("id", flagIds);

  if (error) {
    throw new Error(`No se pudieron actualizar los flags: ${error.message}`);
  }
  return flagIds.length;
}

/**
 * Paso 5.C: marca un flag `user_decision = 'remove'` como ya eliminado de
 * QuestionPro (setea `removed_from_qp_at = now()`). Idempotente: re-aplicarlo
 * sólo pisa el timestamp.
 */
export async function markFlagRemovedFromQP(flagId: string): Promise<void> {
  const client = await getCleaningSupabaseClient();
  const { error } = await client
    .from("cleaning_flags")
    .update({ removed_from_qp_at: new Date().toISOString() })
    .eq("id", flagId);

  if (error) {
    throw new Error(
      `No se pudo marcar el flag como eliminado de QuestionPro: ${error.message}`
    );
  }
}

/**
 * Crea un flag "manual" para una fila que la IA no flagueó, marcado directamente
 * como `remove`. Lo usa el review cuando el usuario decide eliminar una fila
 * que originalmente estaba auto-marcada como "keep" (toggle "Mostrar todas las
 * filas").
 *
 * `flag_type: 'yellow'` porque la enum sólo permite red/yellow y "yellow"
 * representa mejor "decisión humana sin evidencia clara de problema".
 *
 * Idempotente: si ya existía un flag para esa fila (carrera o llamada doble),
 * actualiza la decisión a 'remove' en lugar de insertar duplicado (la tabla
 * tiene UNIQUE(version_id, row_id)).
 */
export async function createManualRemoveFlag(
  versionId: string,
  rowId: string
): Promise<string> {
  const client = await getCleaningSupabaseClient();

  const { data: existing } = await client
    .from("cleaning_flags")
    .select("id")
    .eq("version_id", versionId)
    .eq("row_id", rowId)
    .maybeSingle();

  if (existing) {
    const id = (existing as { id: string }).id;
    await updateFlagDecision(id, "remove");
    return id;
  }

  const { data, error } = await client
    .from("cleaning_flags")
    .insert({
      version_id: versionId,
      row_id: rowId,
      flag_type: "yellow",
      reason: "Marcada manualmente para eliminar (no detectada por la IA).",
      matched_rules: ["manual_override"],
      confidence: 1.0,
      user_decision: "remove",
      decided_at: new Date().toISOString(),
      friendly_explanation:
        "El revisor decidió eliminar esta respuesta aunque la IA no la había flagueado.",
      recommendation: "remove",
      affected_question_ids: [],
      similar_response_ids: [],
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `No se pudo crear el flag manual: ${error?.message ?? "vacío"}`
    );
  }
  return (data as { id: string }).id;
}

/** Resetea todas las decisiones de la versión (las vuelve a "pending"). */
export async function resetFlagDecisions(versionId: string): Promise<void> {
  const client = await getCleaningSupabaseClient();
  const { error } = await client
    .from("cleaning_flags")
    .update({ user_decision: null, decided_at: null })
    .eq("version_id", versionId);

  if (error) {
    throw new Error(`No se pudieron resetear los flags: ${error.message}`);
  }
}

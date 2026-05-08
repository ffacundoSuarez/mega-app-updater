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

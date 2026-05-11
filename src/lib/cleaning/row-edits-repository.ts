/**
 * CRUD de `cleaning_row_edits` (paso 5.A).
 *
 * Las ediciones inline NO modifican `cleaning_rows.data`: viven en su tabla
 * propia para preservar el original y permitir revertir / auditar / sincronizar.
 *
 * El `getCleanedRows` mergea los edits sobre las filas no marcadas como
 * 'remove' antes de exportarlas (paso 5.D).
 */

import { getCleaningSupabaseClient } from "./supabase-client";
import type { CleaningRow, CleaningRowEdit } from "./types";

const EDIT_SELECT =
  "id, row_id, version_id, column_id, original_value, new_value, edited_at, edited_by, synced_to_qp, synced_at";

export interface UpsertRowEditInput {
  rowId: string;
  versionId: string;
  columnId: string;
  originalValue: unknown;
  newValue: unknown;
}

/**
 * Crea o actualiza un edit. UNIQUE(row_id, column_id) garantiza un edit por
 * celda. Si el edit ya existía, se preserva el `original_value` (no se pisa
 * con el de la nueva edición; el usuario puede haber editado dos veces y la
 * primera ya tiene el original real).
 */
export async function upsertRowEdit(
  input: UpsertRowEditInput
): Promise<CleaningRowEdit> {
  const client = await getCleaningSupabaseClient();

  // Si ya hay un edit para esta celda, sólo actualizamos `new_value`. Si no,
  // insertamos con el original. No usamos upsert directo de Supabase porque
  // requeriría que `original_value` no se pise.
  const { data: existing } = await client
    .from("cleaning_row_edits")
    .select(EDIT_SELECT)
    .eq("row_id", input.rowId)
    .eq("column_id", input.columnId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await client
      .from("cleaning_row_edits")
      .update({
        new_value: input.newValue,
        edited_at: new Date().toISOString(),
        synced_to_qp: false,
        synced_at: null,
      })
      .eq("id", (existing as { id: string }).id)
      .select(EDIT_SELECT)
      .single();
    if (error || !data) {
      throw new Error(
        `No se pudo actualizar el edit: ${error?.message ?? "vacío"}`
      );
    }
    return data as unknown as CleaningRowEdit;
  }

  const { data, error } = await client
    .from("cleaning_row_edits")
    .insert({
      row_id: input.rowId,
      version_id: input.versionId,
      column_id: input.columnId,
      original_value: input.originalValue,
      new_value: input.newValue,
    })
    .select(EDIT_SELECT)
    .single();

  if (error || !data) {
    throw new Error(`No se pudo crear el edit: ${error?.message ?? "vacío"}`);
  }
  return data as unknown as CleaningRowEdit;
}

/** Borra el edit, dejando la celda con el valor original. */
export async function revertRowEdit(
  rowId: string,
  columnId: string
): Promise<void> {
  const client = await getCleaningSupabaseClient();
  const { error } = await client
    .from("cleaning_row_edits")
    .delete()
    .eq("row_id", rowId)
    .eq("column_id", columnId);

  if (error) {
    throw new Error(`No se pudo revertir el edit: ${error.message}`);
  }
}

/**
 * Trae todos los edits de la versión, indexados como
 * `Map<row_id, Map<column_id, edit>>` para acceso O(1) durante el render.
 */
export async function getVersionEdits(
  versionId: string
): Promise<Map<string, Map<string, CleaningRowEdit>>> {
  const client = await getCleaningSupabaseClient();
  const { data, error } = await client
    .from("cleaning_row_edits")
    .select(EDIT_SELECT)
    .eq("version_id", versionId);

  if (error) {
    throw new Error(`No se pudieron cargar los edits: ${error.message}`);
  }

  const out = new Map<string, Map<string, CleaningRowEdit>>();
  const edits = (data ?? []) as unknown as CleaningRowEdit[];
  for (const e of edits) {
    let perRow = out.get(e.row_id);
    if (!perRow) {
      perRow = new Map();
      out.set(e.row_id, perRow);
    }
    perRow.set(e.column_id, e);
  }
  return out;
}

/**
 * Devuelve las filas que sobreviven al limpiado, con los edits ya aplicados
 * sobre `data`:
 *
 *   1. Excluye filas con flag `user_decision = 'remove'`.
 *   2. Para cada fila restante, aplica los `new_value` de los edits sobre las
 *      columnas correspondientes en `row.data` (el resto queda igual).
 *
 * El export (paso 5.D) consume esto directo.
 */
export async function getCleanedRows(
  versionId: string
): Promise<CleaningRow[]> {
  const client = await getCleaningSupabaseClient();

  const [{ data: removeFlags, error: flagsErr }, { data: allRows, error: rowsErr }, edits] =
    await Promise.all([
      client
        .from("cleaning_flags")
        .select("row_id")
        .eq("version_id", versionId)
        .eq("user_decision", "remove"),
      client
        .from("cleaning_rows")
        .select("*")
        .eq("version_id", versionId)
        .order("row_number", { ascending: true }),
      getVersionEdits(versionId),
    ]);

  if (flagsErr) {
    throw new Error(
      `No se pudieron leer flags para export: ${flagsErr.message}`
    );
  }
  if (rowsErr) {
    throw new Error(`No se pudieron leer filas para export: ${rowsErr.message}`);
  }

  const removeIds = new Set(
    ((removeFlags ?? []) as Array<{ row_id: string }>).map((f) => f.row_id)
  );

  const rows = (allRows ?? []) as unknown as CleaningRow[];

  return rows
    .filter((r) => !removeIds.has(r.id))
    .map((r) => {
      const perRowEdits = edits.get(r.id);
      if (!perRowEdits || perRowEdits.size === 0) return r;
      const merged: Record<string, unknown> = { ...r.data };
      for (const [columnId, edit] of perRowEdits) {
        merged[columnId] = edit.new_value;
      }
      return { ...r, data: merged };
    });
}

/** Cantidad de filas con al menos un edit en la versión. Útil para el resumen. */
export async function countEditedRows(versionId: string): Promise<number> {
  const edits = await getVersionEdits(versionId);
  return edits.size;
}

/**
 * Paso 5.C: marca todos los edits de una fila como sincronizados a QuestionPro
 * y actualiza el `response_id` de la fila al nuevo ID que devolvió QP (porque
 * re-crear la respuesta cambia su ID interno).
 *
 * Son dos updates secuenciales (Supabase JS no expone transacciones): si la
 * segunda fallara, los edits quedarían marcados como synced pero `response_id`
 * stale. Es un escenario aceptable en una app desktop single-user: re-correr
 * el sync vuelve a leer desde QP por el `response_id` actual y, si éste ya no
 * existe, el DELETE devuelve 404 (tratado como OK) y se re-crea de nuevo.
 */
export async function markRowEditsSynced(
  rowId: string,
  newResponseId: string
): Promise<void> {
  const client = await getCleaningSupabaseClient();

  const { error: editErr } = await client
    .from("cleaning_row_edits")
    .update({ synced_to_qp: true, synced_at: new Date().toISOString() })
    .eq("row_id", rowId);
  if (editErr) {
    throw new Error(
      `No se pudieron marcar los edits como sincronizados: ${editErr.message}`
    );
  }

  const { error: rowErr } = await client
    .from("cleaning_rows")
    .update({ response_id: newResponseId })
    .eq("id", rowId);
  if (rowErr) {
    throw new Error(
      `No se pudo actualizar el response_id de la fila: ${rowErr.message}`
    );
  }
}

/**
 * CRUD de `cleaning_versions` y `cleaning_rows`.
 *
 * Port directo de las funciones equivalentes en `mega-dashboard/src/lib/cleaning.ts`,
 * adaptadas al cliente Supabase cacheado de la app desktop.
 *
 * `createVersion` no inserta filas: las filas se cargan después con
 * `insertRows`, que las pisa en batches para no exceder payload limits de
 * Supabase. La versión arranca con `status = 'pending'`, `processed_rows = 0`,
 * `progress_percentage = 0` — el motor de QC (F0) la pasa a `processing` y
 * actualiza el progreso después.
 */

import { getCleaningSupabaseClient } from "./supabase-client";
import type { CleaningVersion, VersionSchema } from "./types";

const VERSION_SELECT =
  "id, project_id, version_number, filename, total_rows, schema, status, " +
  "processed_rows, progress_percentage, created_at, completed_at, error_message";

/** Lista las versiones del proyecto, más nueva primero. */
export async function listVersions(
  projectId: string
): Promise<CleaningVersion[]> {
  const client = await getCleaningSupabaseClient();
  const { data, error } = await client
    .from("cleaning_versions")
    .select(VERSION_SELECT)
    .eq("project_id", projectId)
    .order("version_number", { ascending: false });

  if (error) {
    throw new Error(`No se pudieron cargar las versiones: ${error.message}`);
  }
  return (data ?? []) as unknown as CleaningVersion[];
}

/**
 * Próximo `version_number` para el proyecto. Empieza en 1 si no hay versiones
 * (o si la query falla — preferimos no romper la UI por un read auxiliar).
 */
export async function getNextVersionNumber(
  projectId: string
): Promise<number> {
  const client = await getCleaningSupabaseClient();
  const { data, error } = await client
    .from("cleaning_versions")
    .select("version_number")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return 1;
  return Number(data[0].version_number) + 1;
}

export interface CreateVersionInput {
  projectId: string;
  filename: string;
  totalRows: number;
  schema: VersionSchema;
}

/** Crea la fila en `cleaning_versions` con número auto-incrementado. */
export async function createVersion(
  input: CreateVersionInput
): Promise<CleaningVersion> {
  const client = await getCleaningSupabaseClient();
  const versionNumber = await getNextVersionNumber(input.projectId);

  const { data, error } = await client
    .from("cleaning_versions")
    .insert({
      project_id: input.projectId,
      version_number: versionNumber,
      filename: input.filename,
      total_rows: input.totalRows,
      schema: input.schema,
      status: "pending",
      processed_rows: 0,
      progress_percentage: 0,
    })
    .select(VERSION_SELECT)
    .single();

  if (error || !data) {
    throw new Error(
      `No se pudo crear la versión: ${error?.message ?? "respuesta vacía"}`
    );
  }
  return data as unknown as CleaningVersion;
}

export interface InsertRowsInput {
  versionId: string;
  rows: Array<{
    row_number: number;
    response_id?: string;
    data: Record<string, unknown>;
  }>;
  /** Tamaño del batch. Default 100 (mismo que mega-dashboard). */
  batchSize?: number;
  /** Reportar progreso después de cada batch. Útil para barras de carga. */
  onProgress?: (info: { inserted: number; total: number }) => void;
}

/**
 * Inserta las filas en batches. Si un batch falla, tira error en el momento
 * (no continúa con los siguientes) — el caller decide si reintentar o borrar
 * la versión.
 */
export async function insertRows(input: InsertRowsInput): Promise<number> {
  const { versionId, rows, batchSize = 100, onProgress } = input;
  if (rows.length === 0) return 0;

  const client = await getCleaningSupabaseClient();
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const slice = rows.slice(i, i + batchSize);
    const batch = slice.map((r) => ({
      version_id: versionId,
      row_number: r.row_number,
      response_id: r.response_id || null,
      data: r.data,
    }));

    const { error } = await client.from("cleaning_rows").insert(batch);
    if (error) {
      throw new Error(
        `Falló insertar filas (${inserted}/${rows.length}): ${error.message}`
      );
    }

    inserted += slice.length;
    onProgress?.({ inserted, total: rows.length });
  }

  return inserted;
}

/**
 * Sobreescribe el `schema` de una versión existente.
 *
 * Usado por la integración con el Validador (Iteración 6): cuando el usuario
 * importa un cuestionario canónico validado, el schema de la última versión
 * se enriquece con `qp_question_type` y `qp_options` provenientes del JSON
 * canónico (ver `src/lib/cleaning/cuestionario-bridge.ts`).
 *
 * No toca filas, flags ni reglas: sólo actualiza el JSON del schema.
 */
export async function updateVersionSchema(
  versionId: string,
  schema: VersionSchema
): Promise<void> {
  const client = await getCleaningSupabaseClient();
  const { error } = await client
    .from("cleaning_versions")
    .update({ schema })
    .eq("id", versionId);
  if (error) {
    throw new Error(
      `No se pudo actualizar el schema de la versión: ${error.message}`
    );
  }
}

/** Borra la versión. Cascade en DB se lleva filas + flags. */
export async function deleteVersion(versionId: string): Promise<void> {
  const client = await getCleaningSupabaseClient();
  const { error } = await client
    .from("cleaning_versions")
    .delete()
    .eq("id", versionId);
  if (error) {
    throw new Error(`No se pudo eliminar la versión: ${error.message}`);
  }
}

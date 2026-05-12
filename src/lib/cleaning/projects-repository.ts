/**
 * CRUD de `cleaning_projects` para la app desktop.
 *
 * Diferencias clave con el repo Next.js de mega-dashboard:
 *   - No pasa por una API route que encripte la API key de QP. Acá la API key
 *     vive sólo en Ajustes (`questionpro.api_key`); el proyecto persiste sólo
 *     `qp_survey_id` y `qp_survey_name`. La columna `qp_api_key_encrypted`
 *     queda en NULL.
 *   - Usa el cliente cacheado de `supabase-client.ts`.
 *
 * Las RLS del proyecto Supabase del Limpiador son permisivas (`USING (true)`),
 * así que la anon key alcanza para insertar/leer/actualizar/borrar.
 */

import { getCleaningSupabaseClient } from "./supabase-client";
import type { CleaningProject, CleaningProjectSource } from "./types";

/** Columnas que se devuelven a la UI (excluye `qp_api_key_encrypted` aunque sea NULL). */
const PROJECT_SELECT =
  "id, name, description, source, qp_survey_id, qp_survey_name, user_id, created_at, updated_at";

export interface CreateCleaningProjectInput {
  name: string;
  description?: string;
  source: CleaningProjectSource;
  /** Sólo si `source === 'questionpro'`. */
  qpSurveyId?: string;
  /** Sólo si `source === 'questionpro'`. Lo devuelve `validateSurvey`. */
  qpSurveyName?: string;
}

/** Crea un proyecto. Devuelve el proyecto recién insertado (con id, fechas, etc.). */
export async function createProject(
  input: CreateCleaningProjectInput
): Promise<CleaningProject> {
  if (!input.name.trim()) {
    throw new Error("El nombre del proyecto es obligatorio");
  }
  if (input.source === "questionpro" && !input.qpSurveyId?.trim()) {
    throw new Error("Falta el Survey ID de QuestionPro");
  }

  const client = await getCleaningSupabaseClient();

  const row: Record<string, unknown> = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    source: input.source,
    qp_survey_id:
      input.source === "questionpro" ? input.qpSurveyId?.trim() : null,
    qp_survey_name:
      input.source === "questionpro"
        ? input.qpSurveyName?.trim() ?? null
        : null,
    qp_api_key_encrypted: null,
  };

  const { data, error } = await client
    .from("cleaning_projects")
    .insert(row)
    .select(PROJECT_SELECT)
    .single();

  if (error || !data) {
    throw new Error(
      `No se pudo crear el proyecto: ${error?.message ?? "respuesta vacía"}`
    );
  }
  return data as CleaningProject;
}

/** Lista todos los proyectos visibles bajo la RLS actual, más nuevos primero. */
export async function listProjects(): Promise<CleaningProject[]> {
  const client = await getCleaningSupabaseClient();
  const { data, error } = await client
    .from("cleaning_projects")
    .select(PROJECT_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`No se pudieron cargar los proyectos: ${error.message}`);
  }
  return (data ?? []) as CleaningProject[];
}

/** Devuelve un proyecto por ID o lanza error si no existe. */
export async function getProject(id: string): Promise<CleaningProject> {
  const client = await getCleaningSupabaseClient();
  const { data, error } = await client
    .from("cleaning_projects")
    .select(PROJECT_SELECT)
    .eq("id", id)
    .single();

  if (error || !data) {
    throw new Error(`Proyecto no encontrado: ${error?.message ?? id}`);
  }
  return data as CleaningProject;
}

/**
 * Borra el proyecto. Las FK con `ON DELETE CASCADE` se llevan en cadena
 * versiones, filas, reglas y flags (ver migración del Limpiador).
 */
export async function deleteProject(id: string): Promise<void> {
  const client = await getCleaningSupabaseClient();
  const { error } = await client.from("cleaning_projects").delete().eq("id", id);
  if (error) {
    throw new Error(`No se pudo eliminar el proyecto: ${error.message}`);
  }
}

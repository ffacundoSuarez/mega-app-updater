/**
 * CRUD de `questionnaires` y `questionnaire_validations`.
 *
 * Filosofía igual al Limpiador:
 *   - RLS permisiva → anon key alcanza.
 *   - La API key de QP no se persiste acá; vive en settings (tauri-plugin-store).
 *   - Las FK con ON DELETE CASCADE de la migración inicial se llevan las
 *     validaciones cuando se borra el cuestionario.
 */

import { getCuestionarioSupabaseClient } from "./supabase-client";
import type {
  Questionnaire,
  QuestionnaireOrigin,
  QuestionnaireRow,
  QuestionnaireValidationReport,
} from "./types";

/** Columnas que se devuelven a la UI. */
const ROW_SELECT =
  "id, nombre, origen, archivo_nombre, qp_survey_id, qp_published_survey_id, qp_published_at, questionnaire_json, created_at, updated_at";

export interface CreateQuestionnaireInput {
  nombre: string;
  origen: QuestionnaireOrigin;
  archivo_nombre?: string | null;
  qp_survey_id?: string | null;
  /** JSON canónico inicial. Si se omite, queda NULL (uso típico: el camino
   *  "Empezar en blanco" provee un Questionnaire vacío; los caminos de parseo
   *  llaman a `updateQuestionnaireJson` después de que la IA termina). */
  questionnaire_json?: Questionnaire | null;
}

/** Crea un cuestionario. Devuelve el row recién insertado. */
export async function createQuestionnaire(
  input: CreateQuestionnaireInput
): Promise<QuestionnaireRow> {
  if (!input.nombre.trim()) {
    throw new Error("El nombre del cuestionario es obligatorio");
  }
  const client = await getCuestionarioSupabaseClient();
  const row = {
    nombre: input.nombre.trim(),
    origen: input.origen,
    archivo_nombre: input.archivo_nombre ?? null,
    qp_survey_id: input.qp_survey_id ?? null,
    questionnaire_json: input.questionnaire_json ?? null,
  };
  const { data, error } = await client
    .from("questionnaires")
    .insert(row)
    .select(ROW_SELECT)
    .single();
  if (error || !data) {
    throw new Error(
      `No se pudo crear el cuestionario: ${error?.message ?? "respuesta vacía"}`
    );
  }
  return data as QuestionnaireRow;
}

/** Lista todos los cuestionarios visibles, más nuevos primero. */
export async function listQuestionnaires(): Promise<QuestionnaireRow[]> {
  const client = await getCuestionarioSupabaseClient();
  const { data, error } = await client
    .from("questionnaires")
    .select(ROW_SELECT)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(
      `No se pudieron cargar los cuestionarios: ${error.message}`
    );
  }
  return (data ?? []) as QuestionnaireRow[];
}

/** Devuelve un cuestionario por ID o lanza error si no existe. */
export async function getQuestionnaire(id: string): Promise<QuestionnaireRow> {
  const client = await getCuestionarioSupabaseClient();
  const { data, error } = await client
    .from("questionnaires")
    .select(ROW_SELECT)
    .eq("id", id)
    .single();
  if (error || !data) {
    throw new Error(`Cuestionario no encontrado: ${error?.message ?? id}`);
  }
  return data as QuestionnaireRow;
}

/** Sobreescribe el JSON canónico del cuestionario y actualiza `updated_at`. */
export async function updateQuestionnaireJson(
  id: string,
  questionnaire: Questionnaire
): Promise<void> {
  const client = await getCuestionarioSupabaseClient();
  const { error } = await client
    .from("questionnaires")
    .update({
      questionnaire_json: questionnaire,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    throw new Error(`No se pudo guardar el cuestionario: ${error.message}`);
  }
}

/**
 * Marca el cuestionario como publicado en QP: setea `qp_published_survey_id`
 * y `qp_published_at`. Usado por `publishQuestionnaireToQp` (Iteración 8).
 *
 * Si el usuario re-publica, esto sobreescribe el id anterior — QP no tiene
 * upsert de encuestas, así que cada "Re-publicar" crea una nueva.
 */
export async function updateQpPublishedInfo(
  id: string,
  qpSurveyId: string
): Promise<void> {
  const client = await getCuestionarioSupabaseClient();
  const { error } = await client
    .from("questionnaires")
    .update({
      qp_published_survey_id: qpSurveyId,
      qp_published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    throw new Error(
      `No se pudo registrar la publicación en QP: ${error.message}`
    );
  }
}

/** Renombra el cuestionario. */
export async function renameQuestionnaire(
  id: string,
  nombre: string
): Promise<void> {
  const trimmed = nombre.trim();
  if (!trimmed) throw new Error("El nombre no puede estar vacío");
  const client = await getCuestionarioSupabaseClient();
  const { error } = await client
    .from("questionnaires")
    .update({ nombre: trimmed, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    throw new Error(`No se pudo renombrar: ${error.message}`);
  }
}

/** Borra el cuestionario y sus validaciones en cascada. */
export async function deleteQuestionnaire(id: string): Promise<void> {
  const client = await getCuestionarioSupabaseClient();
  const { error } = await client.from("questionnaires").delete().eq("id", id);
  if (error) {
    throw new Error(`No se pudo eliminar el cuestionario: ${error.message}`);
  }
}

/** Inserta un reporte de validación en el historial. */
export async function insertValidation(
  questionnaireId: string,
  report: QuestionnaireValidationReport
): Promise<void> {
  const client = await getCuestionarioSupabaseClient();
  const { error } = await client.from("questionnaire_validations").insert({
    questionnaire_id: questionnaireId,
    report,
  });
  if (error) {
    throw new Error(`No se pudo guardar la validación: ${error.message}`);
  }
}

/**
 * Busca el cuestionario más reciente que haya sido importado desde una encuesta
 * de QuestionPro (origen='questionpro_api') con el `qpSurveyId` dado y que
 * tenga al menos una validación corrida.
 *
 * Para la integración Iteración 6 con el Limpiador: cuando un proyecto del
 * Limpiador apunta a una encuesta de QP y existe un cuestionario validado
 * para esa misma encuesta, podemos enriquecer el `VersionSchema` con tipos +
 * opciones canónicas en lugar de re-fetchear desde la API.
 *
 * Devuelve `null` si no hay cuestionario validado matcheado.
 */
export async function findValidatedQuestionnaireByQpSurveyId(
  qpSurveyId: string
): Promise<{
  questionnaire: QuestionnaireRow;
  validation: QuestionnaireValidationReport;
} | null> {
  if (!qpSurveyId.trim()) return null;
  const client = await getCuestionarioSupabaseClient();
  // Buscamos cuestionarios con ese qp_survey_id, más nuevos primero.
  // No filtramos por origen: el qp_survey_id se completa al importar desde la
  // API y eso es match suficiente.
  const { data: rows, error } = await client
    .from("questionnaires")
    .select(ROW_SELECT)
    .eq("qp_survey_id", qpSurveyId)
    .order("updated_at", { ascending: false });
  if (error) {
    throw new Error(
      `No se pudieron buscar cuestionarios para QP ${qpSurveyId}: ${error.message}`
    );
  }
  if (!rows || rows.length === 0) return null;

  // Para cada candidato (en orden) buscamos su última validación; nos quedamos
  // con el primero que tenga una. Sin paginación ni batching porque la
  // expectativa es que haya 1-3 candidatos como mucho por survey.
  for (const row of rows as QuestionnaireRow[]) {
    const validation = await getLatestValidation(row.id);
    if (validation) {
      return { questionnaire: row, validation };
    }
  }
  return null;
}

/** Devuelve la última validación del cuestionario, o null si nunca se validó. */
export async function getLatestValidation(
  questionnaireId: string
): Promise<QuestionnaireValidationReport | null> {
  const client = await getCuestionarioSupabaseClient();
  const { data, error } = await client
    .from("questionnaire_validations")
    .select("report")
    .eq("questionnaire_id", questionnaireId)
    .order("validated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`No se pudo leer la validación: ${error.message}`);
  }
  if (!data) return null;
  return data.report as QuestionnaireValidationReport;
}

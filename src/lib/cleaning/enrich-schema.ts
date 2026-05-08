/**
 * Etapa 2.C — Enriquecer un VersionSchema parseado del Excel cruzándolo con
 * la API de QuestionPro.
 *
 * Para proyectos `source = 'questionpro'`, después de parsear el Excel:
 *   1. Llama a `GET /surveys/{id}/questions` (vía `getSurveyQuestions`).
 *   2. Matchea por texto normalizado contra las columnas no-metadata.
 *   3. Devuelve el schema con `qp_question_id` / `qp_question_type` /
 *      `qp_options` poblados donde matcheó, y la lista de preguntas QP para
 *      que la UI ofrezca mapping manual cuando no hubo match.
 *
 * Reemplaza el endpoint Next.js `/api/cleaning/questionpro/enrich-schema` que
 * usaba la versión web (que además desencriptaba la API key desde la DB; acá
 * la key vive en Ajustes y se pasa explícitamente).
 */

import {
  getSurveyQuestions,
  matchExcelColumnsToQuestionpro,
  type QPQuestion,
} from "@/lib/questionpro";
import type { SchemaColumn, VersionSchema } from "./types";

export interface EnrichedSchemaResult {
  schema: VersionSchema;
  /** Catálogo completo de la encuesta — sirve a la UI para mapping manual. */
  qpQuestions: QPQuestion[];
  /** Resumen del cruce para mostrar al usuario antes de persistir. */
  matchSummary: {
    totalQuestionColumns: number;
    matched: number;
    unmatched: number;
  };
}

export interface EnrichSchemaInput {
  surveyId: string;
  apiKey: string;
  schema: VersionSchema;
}

/**
 * Trae las preguntas de QP y devuelve el schema enriquecido + el catálogo +
 * un resumen de cuántas columnas de pregunta se vincularon automáticamente.
 *
 * No persiste nada — la UI decide cuándo y cómo guardar la versión final
 * (puede mediar mapping manual antes).
 */
export async function enrichSchemaWithQuestionPro(
  input: EnrichSchemaInput
): Promise<EnrichedSchemaResult> {
  const { surveyId, apiKey, schema } = input;

  const qpQuestions = await getSurveyQuestions(surveyId, apiKey);
  const matchedColumns = matchExcelColumnsToQuestionpro<SchemaColumn>(
    schema.columns,
    qpQuestions
  );

  const questionCols = matchedColumns.filter(
    (c) => !c.is_metadata && !c.id.startsWith("META_")
  );
  const matched = questionCols.filter((c) => c.qp_question_id != null).length;

  return {
    schema: { columns: matchedColumns },
    qpQuestions,
    matchSummary: {
      totalQuestionColumns: questionCols.length,
      matched,
      unmatched: questionCols.length - matched,
    },
  };
}

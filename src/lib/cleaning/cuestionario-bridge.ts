/**
 * Bridge entre el módulo Validador de Cuestionarios y el Limpiador.
 *
 * Iteración 6 del plan (`docs/cuestionario-validator-plan.md`):
 *   En el Paso 3 del Limpiador (generación de reglas), si el proyecto tiene
 *   `qp_survey_id` y existe un Questionnaire canónico validado con ese mismo
 *   id, ofrecer "Importar cuestionario validado" para enriquecer el
 *   `VersionSchema` con el `qp_question_type` y `qp_options` que vienen del
 *   cuestionario canónico (mejor que la data cruda de la API de QP porque ya
 *   pasó por el validador).
 *
 * Este módulo es una función pura sobre sus argumentos: NO lee Supabase, NO
 * llama a la API de QP, NO persiste. La UI decide cuándo aplicar el resultado
 * con `updateVersionSchema`. Eso lo mantiene fácil de testear y desacopla las
 * dos capas (cleaning vs cuestionario) — el único punto de contacto es el
 * tipo `Questionnaire`.
 */

import { normalizeQuestionproMatchText } from "@/lib/questionpro";
import type {
  Question,
  QuestionType,
  Questionnaire,
} from "@/lib/cuestionario/types";
import type { SchemaColumn, VersionSchema } from "./types";

/**
 * Mapea el tipo canónico a un string compatible con las heurísticas de
 * `rule-suggestions.ts` (que matchea regex sobre `qp_question_type`).
 *
 * Los strings elegidos hacen "match" con las regex de detección:
 *   - "matrix|scale|ranking|rating|slider|grid|likert" → escala/matriz/ranking
 *   - "text|essay|comment|open|nps_comment|multi_text|long|textarea" → abiertas
 *
 * Si en el futuro `rule-suggestions` cambia su detección, conviene revisar
 * esta tabla para mantener compat.
 */
function canonicalTypeToQpString(tipo: QuestionType): string {
  switch (tipo) {
    case "cerrada_unica":
      return "single_select";
    case "cerrada_multiple":
      return "multi_select";
    case "escala":
      return "scale";
    case "matriz":
      return "matrix";
    case "abierta_texto":
    case "abierta_marca":
      return "text";
    case "numerica":
      return "numeric";
    case "ranking":
      return "ranking";
    case "fecha":
      return "date";
    case "comentario":
      return "static";
  }
}

/** Convierte las opciones canónicas al shape que `qp_options` espera. */
function canonicalOptionsToQpShape(
  question: Question
): Array<{ answerID: number; text: string }> | undefined {
  if (!question.opciones || question.opciones.length === 0) return undefined;
  return question.opciones.map((o) => ({ answerID: o.codigo, text: o.texto }));
}

export interface ApplyQuestionnaireResult {
  /** Schema con `qp_question_type` y `qp_options` poblados donde matcheó. */
  schema: VersionSchema;
  /** Resumen del cruce para mostrar al usuario antes/después de aplicar. */
  summary: {
    /** Columnas no-metadata totales del schema. */
    totalQuestionColumns: number;
    /** Columnas que matchearon contra alguna pregunta canónica. */
    matched: number;
    /** Columnas que no encontraron match. */
    unmatched: number;
    /** Preguntas canónicas que no se usaron (no había columna que las matchee). */
    unusedQuestions: number;
  };
}

/**
 * Aplica un `Questionnaire` canónico sobre un `VersionSchema`.
 *
 * El match es por **texto normalizado** (mismo `normalizeQuestionproMatchText`
 * que usa `matchExcelColumnsToQuestionpro`): para cada columna de pregunta,
 * busca una `Question` canónica con `texto` normalizado igual. Si match,
 * pisa `qp_question_type` (mapeado desde el tipo canónico) y `qp_options`.
 *
 * Las columnas marcadas como metadata se pasan intactas. Si una columna ya
 * tenía `qp_question_type` enriquecido por la API de QP, el cuestionario
 * canónico tiene prioridad porque viene del validador y se asume curado.
 */
export function applyQuestionnaireToVersionSchema(
  questionnaire: Questionnaire,
  schema: VersionSchema
): ApplyQuestionnaireResult {
  // Indexamos las preguntas canónicas por texto normalizado para lookup O(1).
  // Una colisión (dos preguntas con mismo texto) es un caso que el validador
  // ya marca como issue; acá nos quedamos con la primera y seguimos.
  const byNormText = new Map<string, Question>();
  for (const q of questionnaire.preguntas) {
    const k = normalizeQuestionproMatchText(q.texto);
    if (!k || byNormText.has(k)) continue;
    byNormText.set(k, q);
  }

  const usedKeys = new Set<string>();
  let matched = 0;
  let totalQuestionColumns = 0;

  const newColumns: SchemaColumn[] = schema.columns.map((col) => {
    const isMeta = col.is_metadata === true || col.id.startsWith("META_");
    if (isMeta) return col;

    totalQuestionColumns += 1;
    const k = normalizeQuestionproMatchText(col.question);
    const q = k ? byNormText.get(k) : undefined;
    if (!q) return col;

    matched += 1;
    usedKeys.add(k);
    const next: SchemaColumn = {
      ...col,
      qp_question_type: canonicalTypeToQpString(q.tipo),
    };
    const opts = canonicalOptionsToQpShape(q);
    if (opts) next.qp_options = opts;
    return next;
  });

  return {
    schema: { columns: newColumns },
    summary: {
      totalQuestionColumns,
      matched,
      unmatched: totalQuestionColumns - matched,
      unusedQuestions: byNormText.size - usedKeys.size,
    },
  };
}

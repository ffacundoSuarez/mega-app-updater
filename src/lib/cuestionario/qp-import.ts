/**
 * Importa un cuestionario desde la API de QuestionPro al schema canónico.
 *
 * Reusa los helpers del Limpiador (`validateSurvey` + `getSurveyQuestions` en
 * `src/lib/questionpro.ts`) — la única fuente de verdad para hablar con la API
 * de QP. Acá no hacemos llamadas HTTP extra.
 *
 * **Alcance Iteración 5 (acotado a propósito):** sólo preguntas + opciones.
 * El branching / skip-logic NO se importa porque `getSurveyQuestions` no lo
 * trae y descubrir el endpoint correcto es trabajo de la Iteración 0 (spike
 * documentado en `docs/cuestionario-validator-plan.md`). Para tipos sin
 * info adicional (`escala`, `matriz`, `ranking`, `numerica`, `fecha`) el
 * Questionnaire devuelve los campos mínimos y el usuario completa los detalles
 * (`min`/`max`, `enunciados` de matriz, etc.) en el editor. Se devuelve un
 * `warnings[]` con todo lo que no se pudo mapear 1:1 para que la UI lo muestre.
 *
 * No se persiste nada acá: el caller (`NewQuestionnaire.tsx`) decide cuándo
 * insertar el row con `createQuestionnaire`.
 */

import {
  extractQuestionProSurveyId,
  getSurveyQuestions,
  validateSurvey,
  type QPQuestion,
} from "@/lib/questionpro";
import type {
  Question,
  QuestionOption,
  QuestionType,
  Questionnaire,
} from "./types";

export class MissingQuestionproApiKeyError extends Error {
  constructor() {
    super(
      "Falta la API key de QuestionPro en Ajustes. Cargala antes de importar."
    );
    this.name = "MissingQuestionproApiKeyError";
  }
}

export interface FetchFromQpOptions {
  /** Sobrescribe el título devuelto por QP (por defecto se usa `survey.name`). */
  titulo?: string;
  idioma?: string;
  pais?: string;
}

export interface FetchFromQpResult {
  questionnaire: Questionnaire;
  /** ID resuelto/limpiado (numérico) de la encuesta. Útil para guardarlo en
   *  `questionnaires.qp_survey_id`. */
  surveyId: string;
  /** Nombre de la encuesta en QP (lo que devuelve `validateSurvey`). */
  surveyName: string;
  /** Tipos QP que no tienen equivalente 1:1: mapeados al más cercano y reportados
   *  acá para que la UI los muestre y el usuario los revise en el editor. */
  warnings: string[];
}

/**
 * Trae la estructura de una encuesta de QP y la convierte a `Questionnaire`.
 *
 * Acepta tanto un ID numérico como una URL — usa el mismo extractor que el
 * Limpiador. Si la API key no se pasa explícitamente, es responsabilidad del
 * caller leerla de settings y manejar `MissingQuestionproApiKeyError` (no se
 * lee acá para que esta función sea pura sobre sus argumentos y testeable).
 */
export async function fetchQuestionnaireFromQp(
  surveyIdOrUrl: string,
  apiKey: string,
  opts: FetchFromQpOptions = {}
): Promise<FetchFromQpResult> {
  if (!apiKey.trim()) throw new MissingQuestionproApiKeyError();
  const surveyId = extractQuestionProSurveyId(surveyIdOrUrl);
  if (!surveyId) {
    throw new Error("No se pudo determinar el Survey ID de QuestionPro.");
  }

  const [info, questions] = await Promise.all([
    validateSurvey(surveyId, apiKey),
    getSurveyQuestions(surveyId, apiKey),
  ]);

  const warnings: string[] = [];
  const preguntas: Question[] = questions.map((q, i) =>
    qpQuestionToCanonical(q, i, warnings)
  );

  const today = new Date().toISOString().slice(0, 10);
  const questionnaire: Questionnaire = {
    metadata: {
      titulo: opts.titulo?.trim() || info.name || "Cuestionario importado de QuestionPro",
      fecha: today,
      pais: opts.pais ?? "",
      idioma: opts.idioma ?? "es",
    },
    preguntas,
    secciones: [],
  };

  return {
    questionnaire,
    surveyId: info.id || surveyId,
    surveyName: info.name,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Mapeo QP → canónico
// ---------------------------------------------------------------------------

/**
 * Tabla de mapeo de `questionType` de QP al tipo canónico.
 *
 * QP no publica una lista cerrada y exhaustiva de tipos; los strings de abajo
 * vienen de observar respuestas reales + lo que el Limpiador chequea en
 * `rule-suggestions.ts` y `similarity-detector.ts`. Tratamos los unknowns con
 * heurísticas (regex sobre el string) y, en última instancia, caemos en
 * `abierta_texto` agregando un warning.
 *
 * Cuando se confirme el contrato real en la Iteración 0, esta tabla puede
 * volverse exhaustiva (sin heurísticas).
 */
function mapQpTypeToCanonical(rawType: string): QuestionType | null {
  const t = rawType.toLowerCase();
  // Exact matches primero (más rápido y menos propenso a colisiones).
  switch (t) {
    case "multiplechoice_radio":
    case "single_select":
    case "drop_down":
    case "dropdown":
    case "image_select_radio":
      return "cerrada_unica";
    case "multiplechoice_checkbox":
    case "multi_select":
    case "image_select_checkbox":
      return "cerrada_multiple";
    case "text_single_row":
    case "text_multiple_row":
    case "comment_box":
    case "essay":
    case "paragraph":
      return "abierta_texto";
    case "numeric_textbox":
    case "numeric":
      return "numerica";
    case "numeric_slider":
    case "slider":
    case "rating":
    case "star_rating":
    case "smiley_rating":
    case "likert":
    case "nps":
    case "net_promoter":
      return "escala";
    case "matrix_radio":
    case "matrix_checkbox":
    case "matrix_text":
    case "matrix_dropdown":
    case "matrix":
      return "matriz";
    case "rank_order":
    case "ranking":
      return "ranking";
    case "date_picker":
    case "date":
    case "date_time":
      return "fecha";
  }
  // Heurísticas para tipos no listados arriba.
  if (/matrix|grid/.test(t)) return "matriz";
  if (/rank/.test(t)) return "ranking";
  if (/slider|rating|likert|nps|scale/.test(t)) return "escala";
  if (/checkbox|multi/.test(t)) return "cerrada_multiple";
  if (/radio|single|dropdown|drop_down/.test(t)) return "cerrada_unica";
  if (/numeric/.test(t)) return "numerica";
  if (/date|time/.test(t)) return "fecha";
  if (/text|essay|comment|open|paragraph|long|textarea/.test(t)) {
    return "abierta_texto";
  }
  return null;
}

function qpQuestionToCanonical(
  q: QPQuestion,
  index: number,
  warnings: string[]
): Question {
  const mapped = mapQpTypeToCanonical(q.questionType);
  let tipo: QuestionType;
  if (mapped) {
    tipo = mapped;
  } else {
    tipo = "abierta_texto";
    warnings.push(
      `Pregunta #${q.questionID} ("${truncate(q.questionText, 50)}") tiene tipo QP "${q.questionType}" que no tiene equivalente directo — quedó como abierta. Revisala en el editor.`
    );
  }

  const opciones: QuestionOption[] = (q.options ?? []).map((o, idx) => ({
    codigo: typeof o.answerID === "number" ? o.answerID : idx + 1,
    texto: o.text,
    flujo: "",
    condicion: [],
  }));

  // Para escalas QP sin opciones explícitas (NPS, slider numérico) damos un
  // rango por defecto razonable. El usuario lo ajusta si quiere otra escala.
  let min: number | undefined;
  let max: number | undefined;
  if (tipo === "escala" && opciones.length === 0) {
    const t = q.questionType.toLowerCase();
    if (t.includes("nps") || t.includes("net_promoter")) {
      min = 0;
      max = 10;
    } else {
      min = 1;
      max = 5;
      warnings.push(
        `Pregunta #${q.questionID} es escala sin opciones en QP — se asumió 1-5. Ajustá el rango en el editor.`
      );
    }
  }

  const question: Question = {
    id: `P${index + 1}`,
    numero: index + 1,
    texto: q.questionText,
    tipo,
    condicion: "",
    aleatorizar: false,
    opciones,
    flujo: [],
  };
  if (min !== undefined) question.min = min;
  if (max !== undefined) question.max = max;

  // Las matrices QP no traen filas vía `getSurveyQuestions` — sólo columnas.
  // Dejamos `enunciados` vacío y avisamos: el usuario las completa en el editor.
  if (tipo === "matriz") {
    warnings.push(
      `Pregunta #${q.questionID} es matriz — los enunciados (filas) no vienen en la API, cargalos en el editor.`
    );
  }

  return question;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

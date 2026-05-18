// Tipos canónicos del módulo Validador de Cuestionarios.
//
// Portados de survey-qc-app/src/lib/types/questionnaire.ts (ver
// docs/cuestionario-validator-plan.md). Provider-agnostic: hoy se mappean a
// QuestionPro; mañana podrían soportar Qualtrics sin tocar este archivo.

/** Tipos válidos de pregunta. Cualquier expansión requiere actualizar el
 *  parser, los checks y el mapeo a QuestionPro. */
export type QuestionType =
  | "cerrada_unica"
  | "cerrada_multiple"
  | "escala"
  | "matriz"
  | "abierta_texto"
  | "abierta_marca"
  | "numerica"
  | "ranking"
  | "fecha";

/** Tag de condición sobre una opción. "fijar" = posición fija aunque la
 *  pregunta esté aleatorizada; "especificar" = abre texto; "exclusiva" = al
 *  marcarla deselecciona el resto. */
export type OptionCondition = "fijar" | "especificar" | "exclusiva";

export interface QuestionOption {
  codigo: number;
  texto: string;
  /** Acción que dispara esta opción al ser marcada. Ej: "", "terminar",
   *  "saltar_a F5". */
  flujo: string;
  condicion: OptionCondition[];
}

export interface FlowRule {
  /** Códigos de respuesta que disparan la regla. */
  si_respuesta: number | number[];
  accion: "saltar_a" | "terminar" | "continuar";
  /** ID de la pregunta destino si accion === "saltar_a". */
  destino?: string;
}

export interface Question {
  /** ID corto del cuestionario (ej. "P1", "S2", "F5"). Único dentro del
   *  cuestionario. */
  id: string;
  /** Posición 1-based en el orden del cuestionario. */
  numero: number;
  texto: string;
  tipo: QuestionType;
  /** Expresión lógica que controla si la pregunta se muestra (ej. "S1=3").
   *  "" si la pregunta se muestra siempre. */
  condicion: string;
  /** Si true, las opciones se presentan en orden aleatorio. */
  aleatorizar: boolean;
  opciones: QuestionOption[];
  flujo: FlowRule[];
  /** Sólo válido para tipo "escala" o "numerica". */
  min?: number;
  /** Sólo válido para tipo "escala" o "numerica". */
  max?: number;
  /** Sólo válido para tipo "matriz": filas (ítems) de la matriz. */
  enunciados?: QuestionOption[];
}

export interface Section {
  nombre: string;
  /** IDs de las preguntas que pertenecen a esta sección, en orden. */
  preguntas: string[];
}

export interface QuestionnaireMetadata {
  titulo: string;
  /** Fecha en formato ISO YYYY-MM-DD. */
  fecha: string;
  pais: string;
  idioma: string;
}

export interface Questionnaire {
  metadata: QuestionnaireMetadata;
  preguntas: Question[];
  secciones: Section[];
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

export type QuestionnaireOrigin =
  | "blanco"
  | "texto"
  | "docx"
  | "pdf"
  | "questionpro_api";

/** Fila de la tabla `questionnaires` tal como la devuelve el repositorio. */
export interface QuestionnaireRow {
  id: string;
  nombre: string;
  origen: QuestionnaireOrigin;
  archivo_nombre: string | null;
  qp_survey_id: string | null;
  qp_published_survey_id: string | null;
  qp_published_at: string | null;
  questionnaire_json: Questionnaire | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Reporte de validación (Iteraciones 2-3)
// ---------------------------------------------------------------------------

export type IssueSeverity = "error" | "advertencia" | "sugerencia";

export type IssueCategory =
  | "estructura"
  | "logica"
  | "wording"
  | "tipos"
  | "rangos"
  | "semantica";

export interface QCIssue {
  /** ID de la pregunta afectada, o null si el issue es global al cuestionario. */
  pregunta_id: string | null;
  severidad: IssueSeverity;
  categoria: IssueCategory;
  descripcion: string;
}

export interface QuestionnairePerQuestionIssues {
  pregunta_id: string;
  pregunta_numero: number;
  pregunta_texto: string;
  issues: QCIssue[];
}

export interface QuestionnaireValidationReport {
  questionnaire_id: string;
  /** Timestamp del parseo inicial del cuestionario (no necesariamente igual a
   *  validated_at; se mantiene para tener visibilidad de la antigüedad del
   *  JSON cuando el usuario re-valida sin re-parsear). */
  parsed_at: string;
  validated_at: string;
  issues_por_pregunta: QuestionnairePerQuestionIssues[];
  issues_globales: QCIssue[];
  resumen: {
    errors: number;
    advertencias: number;
    sugerencias: number;
    total: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Crea un Questionnaire vacío para el camino "Empezar en blanco". */
export function emptyQuestionnaire(opts: {
  titulo: string;
  idioma: string;
  pais?: string;
}): Questionnaire {
  return {
    metadata: {
      titulo: opts.titulo,
      fecha: new Date().toISOString().slice(0, 10),
      pais: opts.pais ?? "",
      idioma: opts.idioma,
    },
    preguntas: [],
    secciones: [],
  };
}

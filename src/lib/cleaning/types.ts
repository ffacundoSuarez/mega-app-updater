/**
 * Tipos del Limpiador (QC engine).
 *
 * Alineados con el schema Supabase del proyecto mega-dashboard
 * (ver docs/migrations/2025-01-29_create-limpiador-tables.sql en ese repo).
 *
 * Para F0 sólo se incluye lo que el motor de QC necesita: filas, reglas, schema,
 * versión y flags. Los tipos de proyecto (`CleaningProject`) y formas estrictas
 * de `rule_config` se moverán acá cuando arranque F1.
 */

export type FlagType = "red" | "yellow";
export type FlagDecision = "keep" | "remove" | null;
export type FlagRecommendation = "remove" | "review" | "keep";

export type VersionStatus = "pending" | "processing" | "completed" | "error";

export type CleaningProjectSource = "qualtrics" | "questionpro";

/**
 * Proyecto del Limpiador. La columna `qp_api_key_encrypted` queda NULL en esta
 * app: la key vive sólo en Ajustes (`questionpro.api_key`). Los proyectos QP
 * sólo persisten `qp_survey_id` y `qp_survey_name`.
 */
export interface CleaningProject {
  id: string;
  name: string;
  description?: string | null;
  source: CleaningProjectSource;
  qp_survey_id?: string | null;
  qp_survey_name?: string | null;
  user_id?: string | null;
  created_at: string;
  updated_at: string;
}

/** Una columna del cuestionario tal como vive en `cleaning_versions.schema`. */
export interface SchemaColumn {
  index: number;
  id: string;
  question: string;
  /** Sólo cuando se enriquece con QuestionPro */
  qp_question_id?: number;
  qp_question_type?: string;
  qp_options?: Array<{ answerID: number; text: string }>;
  /** True para columnas metadata exportadas (ID Respuesta, Fecha y Hora, …) */
  is_metadata?: boolean;
}

export interface VersionSchema {
  columns: SchemaColumn[];
}

/** Fila de respuestas de la encuesta (`cleaning_rows`). */
export interface CleaningRow {
  id: string;
  version_id: string;
  row_number: number;
  response_id?: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

/**
 * Regla activa del proyecto (`cleaning_rules`).
 *
 * El motor de QC sólo lee `description` (texto en lenguaje natural) o, como fallback,
 * `rule_config.description`. La forma exacta de `rule_config` se tipará en F1
 * cuando se porten los editores de reglas.
 */
export interface CleaningRule {
  id: string;
  project_id: string;
  rule_type: string;
  rule_config: { description?: string } & Record<string, unknown>;
  description?: string | null;
  is_active: boolean;
  order_index: number;
  ai_generated?: boolean | null;
  ai_reasoning?: string | null;
  created_at: string;
}

/** Versión del proyecto (un Excel cargado). Filas y flags cuelgan de acá. */
export interface CleaningVersion {
  id: string;
  project_id: string;
  version_number: number;
  filename: string;
  total_rows: number;
  schema: VersionSchema;
  status: VersionStatus;
  processed_rows: number;
  progress_percentage: number;
  created_at: string;
  completed_at?: string | null;
  error_message?: string | null;
}

/** Resultado del análisis IA para una fila. Lo que el motor devuelve antes de persistir. */
export interface AnalyzeResult {
  row_id: string;
  row_number: number;
  flag: FlagType | "none";
  reason: string | null;
  matched_rules: string[];
  confidence: number;
  /**
   * Campos enriquecidos del paso 4 (todos opcionales: si el modelo no los
   * provee, se persisten como NULL / array vacío y la UI los oculta).
   */
  friendly_explanation?: string | null;
  recommendation?: FlagRecommendation | null;
  /** Column ids del schema (Q1, Q22, META_*) que el modelo señala como problemáticas. */
  affected_question_ids?: string[];
}

/** Conteo de flags expuesto por el repositorio (estado del review). */
export interface FlagCounts {
  red: number;
  yellow: number;
  pending: number;
  decided: number;
}

/** Inserción/upsert hacia `cleaning_flags`. */
export interface CleaningFlagInsert {
  version_id: string;
  row_id: string;
  flag_type: FlagType;
  reason: string;
  matched_rules: string[];
  confidence: number;
  user_decision: FlagDecision;
  /** Campos enriquecidos del paso 4. */
  friendly_explanation: string | null;
  recommendation: FlagRecommendation | null;
  affected_question_ids: string[];
  similar_response_ids: string[];
}

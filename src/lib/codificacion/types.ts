/**
 * Tipos del dominio Codificación (clasificación de respuestas abiertas).
 * Espejo de `mega-dashboard` `src/lib/supabase.ts` + columnas usadas en Lightsail.
 */

export type JobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "error"
  | "pending_categories";

export interface CodificacionProject {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
  total_jobs: number;
  completed_jobs: number;
  total_responses: number;
  user_id?: string | null;
}

export interface CodificacionJob {
  id: string;
  project_id: string;
  question: string;
  description?: string | null;
  language_code?: string | null;
  region_hint?: string | null;
  status: JobStatus;
  excel_filename?: string | null;
  total_responses: number;
  processed_responses: number;
  created_at: string;
  completed_at?: string | null;
  progress_percentage: number;
  error_message?: string | null;
  sample_training_completed: boolean;
  sample_count: number;
  is_template?: boolean | null;
}

export interface CodificacionJobWithProject extends CodificacionJob {
  project: CodificacionProject;
}

export interface Category {
  id: string;
  job_id: string;
  name: string;
  category_id: number;
  description?: string | null;
  created_at: string;
}

export interface ResponseRow {
  id: string;
  job_id: string;
  response_id: string;
  response_text: string;
  row_number?: number | null;
  created_at: string;
}

export interface SampleClassification {
  id: string;
  job_id: string;
  response_id: string;
  response_text: string;
  ai_suggested_categories: number[];
  ai_confidence_scores: number[];
  user_corrected_categories: number[];
  is_corrected: boolean;
  created_at: string;
  corrected_at?: string | null;
}

export interface Classification {
  id: string;
  job_id: string;
  response_id: string;
  category_ids: number[];
  confidence_scores: number[];
  raw_ai_response?: string | null;
  created_at: string;
}

/** Resultado de un batch antes de persistir. */
export interface ClassificationBatchResult {
  response_id: string;
  category_ids: number[];
  confidence_scores: number[];
  raw_ai_response?: string;
}

export interface ExcelUploadData {
  filename: string;
  rows: number;
  columns: string[];
  preview: Array<{ id: string; response: string }>;
  rawData: (string | number | boolean | null)[][];
}

export interface CategoryBookRow {
  id: number;
  name: string;
  description?: string;
}

export type CategoryResponsesSort =
  | "row"
  | "alpha_asc"
  | "alpha_desc"
  | "length_asc"
  | "length_desc";

export interface CategoryStats {
  categoryId: number;
  name: string;
  count: number;
  percentage: number;
}

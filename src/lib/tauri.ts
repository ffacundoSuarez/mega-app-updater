// Wrappers tipados sobre `invoke` de Tauri.
// A medida que agreguemos comandos en Rust (src-tauri/src/commands/),
// acá exponemos funciones TS que los llaman para mantener tipos en un solo lugar.

import { invoke } from "@tauri-apps/api/core";

/** Ejemplo de comando heredado del scaffold. Se puede borrar cuando se quite de Rust. */
export function greet(name: string): Promise<string> {
  return invoke<string>("greet", { name });
}

// --- Sidecar Python -------------------------------------------------------

/** Respuesta de `hello.py`. El shape debe coincidir con `PythonHelloResponse`
 *  en src-tauri/src/commands/python.rs. */
export interface PythonHelloResponse {
  /** JSON crudo parseado del stdout del script. */
  raw: {
    ok: boolean;
    message: string;
    python: { version: string; implementation: string; executable: string };
    platform: { system: string; release: string; machine: string };
    dependencies: Array<
      | { name: string; ok: true; version: string }
      | { name: string; ok: false; error: string }
    >;
    timestamp: string;
  };
  /** stderr del proceso (normalmente vacío). */
  stderr: string;
}

/** Ping al sidecar Python: ejecuta `python-scripts/hello.py` con un nombre
 *  opcional. Sirve para verificar en Fase 2 que el sidecar arranca y que
 *  las deps están instaladas. */
export function runPythonHello(name?: string): Promise<PythonHelloResponse> {
  return invoke<PythonHelloResponse>("run_python_hello", { name });
}

// --- Brand Audit (Fase 3) -------------------------------------------------

/** Nombre del evento Tauri que emite el backend con cada línea de stdout/stderr
 *  durante la ejecución del motor. La UI lo escucha con `listen(...)`. */
export const BRAND_AUDIT_PROGRESS_EVENT = "brand-audit-progress";

/** Parámetros que enviamos al backend. El shape debe coincidir con
 *  `BrandAuditParams` en src-tauri/src/commands/brand_audit.rs (camelCase). */
export interface BrandAuditParams {
  savPrincipal: string;
  savSecundario?: string | null;
  waveFilter: number;
  waveName: string;
  useAiInsights?: boolean;
  useAiSummary?: boolean;
  geminiApiKey?: string | null;
}

/** Resultado del comando Brand Audit. */
export interface BrandAuditResult {
  ok: boolean;
  outputDir: string;
  ppt: string | null;
  excelPrincipal: string | null;
  excelSecundario: string | null;
  log: string | null;
  studyId: string | null;
  stdout: string;
  stderr: string;
}

/** Evento de progreso emitido por el backend mientras corre el motor. */
export interface BrandAuditProgressPayload {
  stream: "stdout" | "stderr";
  line: string;
}

/** Ejecuta el motor Brand Audit (tabulación + PPT + Excel). Puede tardar
 *  minutos. Para seguimiento en vivo, suscribite a `BRAND_AUDIT_PROGRESS_EVENT`
 *  con `listen()` antes de llamar. */
export function runBrandAudit(
  params: BrandAuditParams,
): Promise<BrandAuditResult> {
  return invoke<BrandAuditResult>("run_brand_audit", { params });
}

// --- QuestionPro -----------------------------------------------------------

/** Payload para crear una encuesta en QP desde Rust (evita CORS del WebView). */
export interface QuestionproCreateSurveyParams {
  userId: string;
  apiKey: string;
  name: string;
  folderId?: number;
  saveAndContinue?: boolean;
}

/** Shape devuelto por `questionpro_create_survey` en Rust. */
export interface QuestionproCreatedSurvey {
  surveyId: number;
  name: string;
  url: string;
  status: string;
}

/** Crea una encuesta en QuestionPro desde el backend local Tauri. */
export function questionproCreateSurvey(
  params: QuestionproCreateSurveyParams,
): Promise<QuestionproCreatedSurvey> {
  return invoke<QuestionproCreatedSurvey>("questionpro_create_survey", {
    params,
  });
}

/** Payload para crear una pregunta en QP desde Rust. */
export interface QuestionproCreateQuestionParams {
  surveyId: string;
  apiKey: string;
  payload: unknown;
}

/** Shape devuelto por `questionpro_create_question` en Rust. */
export interface QuestionproCreatedQuestion {
  questionId: number;
  blockId?: number | null;
  orderNumber?: number | null;
}

/** Crea una pregunta en QuestionPro desde el backend local Tauri. */
export function questionproCreateQuestion(
  params: QuestionproCreateQuestionParams,
): Promise<QuestionproCreatedQuestion> {
  return invoke<QuestionproCreatedQuestion>("questionpro_create_question", {
    params,
  });
}

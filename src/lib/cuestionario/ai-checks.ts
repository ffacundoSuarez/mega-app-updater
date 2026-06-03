/**
 * Checks semánticos con IA del Validador de Cuestionarios.
 *
 * Cada check es una función pura que toma el `Questionnaire` + opciones (apiKey,
 * model, AbortSignal, cache key prefix) y devuelve un array de `QCIssue`. Los
 * 6 checks listados en docs/cuestionario-validator-plan.md se implementan acá
 * como entradas de `AI_CHECKS`; el orquestador (`validation-job.ts`) las itera.
 *
 * Convenciones:
 *   - Una llamada por categoría: pasamos todo el cuestionario (filtrado a lo
 *     relevante para el check) en un solo prompt. 6 llamadas totales para un
 *     cuestionario de N preguntas, no 6×N.
 *   - response_format: json_object + reasoning_effort minimal en gpt-5-mini.
 *   - `prompt_cache_key`: prefijo estable por (questionnaireId, checkKey) para
 *     que re-validaciones del mismo cuestionario peguen en cache.
 *   - Cancelación: el AbortSignal se propaga al `fetch`. Si abortan, la
 *     promise re-tira el DOMException correspondiente.
 *   - Fallos: si la IA devuelve un error o JSON inválido, se tira
 *     `AiCheckError`. El orquestador lo captura y sigue con los demás checks.
 *
 * El `MissingOpenaiApiKeyError` se importa de `parser.ts` para no duplicar
 * tipos; ambos módulos lo usan con la misma semántica.
 */

import { MissingOpenaiApiKeyError } from "./parser";
import type {
  IssueCategory,
  IssueSeverity,
  QCIssue,
  Question,
  Questionnaire,
} from "./types";

export { MissingOpenaiApiKeyError };

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

export class AiCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiCheckError";
  }
}

export interface AiCheckOptions {
  apiKey: string;
  model: string;
  signal?: AbortSignal;
  /** Prefijo del prompt_cache_key. Suele ser el questionnaireId. */
  cacheKeyPrefix?: string;
  onLog?: (level: "info" | "warn" | "error", msg: string) => void;
}

export interface AiCheckDef {
  /** Identificador estable, usado como segmento del cache key y como key en el
   *  progress event. No traducir. */
  key: string;
  /** Label legible para mostrar en la UI mientras corre el check. */
  label: string;
  category: IssueCategory;
  /** Default severidad si la IA no emite una. */
  defaultSeverity: IssueSeverity;
  run: (q: Questionnaire, opts: AiCheckOptions) => Promise<QCIssue[]>;
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export const AI_CHECKS: readonly AiCheckDef[] = [
  {
    key: "redundancy",
    label: "Preguntas redundantes",
    category: "semantica",
    defaultSeverity: "advertencia",
    run: checkRedundantQuestions,
  },
  {
    key: "inverted_scales",
    label: "Escalas invertidas",
    category: "wording",
    defaultSeverity: "advertencia",
    run: checkInvertedScales,
  },
  {
    key: "biased_wording",
    label: "Wording sesgado",
    category: "wording",
    defaultSeverity: "advertencia",
    run: checkBiasedWording,
  },
  {
    key: "ambiguous_instructions",
    label: "Instrucciones ambiguas",
    category: "wording",
    defaultSeverity: "sugerencia",
    run: checkAmbiguousInstructions,
  },
  {
    key: "wrong_type",
    label: "Tipo de pregunta incorrecto",
    category: "tipos",
    defaultSeverity: "advertencia",
    run: checkWrongQuestionType,
  },
  {
    key: "non_mece_options",
    label: "Opciones no MECE",
    category: "logica",
    defaultSeverity: "advertencia",
    run: checkNonMECEOptions,
  },
];

// ---------------------------------------------------------------------------
// Checks individuales
// ---------------------------------------------------------------------------

async function checkRedundantQuestions(
  q: Questionnaire,
  opts: AiCheckOptions
): Promise<QCIssue[]> {
  if (q.preguntas.length < 2) return [];
  const validIds = new Set(q.preguntas.map((p) => p.id));
  const lista = q.preguntas
    .map((p) => `- ${p.id} [${p.tipo}] "${p.texto}"`)
    .join("\n");

  const system = `Sos un analista de investigación de mercado experto en cuestionarios. Detectás preguntas REDUNDANTES dentro de un cuestionario: distintas preguntas que miden esencialmente lo mismo (mismo constructo, fraseo muy similar, o propósito equivalente).

Reglas estrictas:
- Devolvé un objeto JSON: { "issues": [{ "pregunta_id": "<id>", "descripcion": "<motivo, mencionando con qué pregunta es redundante>" }] }.
- "pregunta_id" debe ser uno de los ids del cuestionario.
- Si una pregunta forma parte de varios pares, devolvelo en una sola entrada listando los demás ids.
- Si NO hay redundancia, devolvé { "issues": [] }.
- Sé conservador: NO marques como redundante preguntas que miden cosas distintas (ej. dos demográficas distintas). Requerí evidencia clara en el texto.
- Sólo emití el JSON, sin texto antes o después, sin markdown.`;

  const user = `Cuestionario:\n${lista}`;
  const raw = await callOpenAiJson(system, user, opts, cacheKey(opts, "redundancy"));
  return parseIssuesResponse(raw, "semantica", "advertencia", validIds);
}

async function checkInvertedScales(
  q: Questionnaire,
  opts: AiCheckOptions
): Promise<QCIssue[]> {
  // Sólo nos interesan escalas (numéricas con etiquetas o cerradas con opciones
  // ordinales). Filtramos por tipo "escala" + tipo "cerrada_unica" con >=3
  // opciones (heurística para detectar cerradas ordinales).
  const escalas = q.preguntas.filter(
    (p) =>
      p.tipo === "escala" ||
      (p.tipo === "cerrada_unica" && p.opciones.length >= 3)
  );
  if (escalas.length < 2) return [];

  const validIds = new Set(escalas.map((p) => p.id));
  const lista = escalas
    .map((p) => `- ${p.id}: "${p.texto}" — ${formatScale(p)}`)
    .join("\n");

  const system = `Sos un analista de investigación de mercado. Detectás ESCALAS INVERTIDAS / POLARIDADES INCONSISTENTES entre preguntas que conceptualmente deberían usar la misma dirección de respuesta.

Ejemplos de problema:
- P1: 1=Muy malo, 5=Muy bueno (positivo crece con el código)
- P2: 1=Muy bueno, 5=Muy malo (positivo decrece con el código) ← inconsistente con P1

Reglas:
- Devolvé { "issues": [{ "pregunta_id": "<id>", "descripcion": "<descripción del problema mencionando con qué otra pregunta es inconsistente>" }] }.
- "pregunta_id" puede ser cualquiera de las preguntas del par.
- Si dos escalas tratan temas TOTALMENTE distintos, no son inconsistentes; ignoralas.
- Si todas las escalas son consistentes, devolvé { "issues": [] }.
- Sólo JSON, sin markdown.`;

  const user = `Escalas del cuestionario:\n${lista}`;
  const raw = await callOpenAiJson(system, user, opts, cacheKey(opts, "inverted_scales"));
  return parseIssuesResponse(raw, "wording", "advertencia", validIds);
}

async function checkBiasedWording(
  q: Questionnaire,
  opts: AiCheckOptions
): Promise<QCIssue[]> {
  if (q.preguntas.length === 0) return [];
  const validIds = new Set(q.preguntas.map((p) => p.id));
  const lista = q.preguntas
    .map((p) => `- ${p.id}: "${p.texto}"`)
    .join("\n");

  const system = `Sos un analista de investigación de mercado experto en redacción de cuestionarios. Detectás WORDING SESGADO o problemático en las preguntas:
- Leading questions (sugieren la respuesta esperada).
- Doble pregunta (dos preguntas en una, ej. "¿Qué pensás del precio y la calidad?").
- Doble negación o negaciones confusas.
- Lenguaje cargado emocionalmente o con asunciones implícitas.

Reglas:
- Devolvé { "issues": [{ "pregunta_id": "<id>", "descripcion": "<qué problema específico tiene y cómo se podría reescribir>" }] }.
- Una issue por pregunta problemática.
- Si no hay problemas, devolvé { "issues": [] }.
- Sé conservador: NO marques cualquier asimetría como sesgo. Sólo casos claros.
- Sólo JSON, sin markdown.`;

  const user = `Preguntas:\n${lista}`;
  const raw = await callOpenAiJson(system, user, opts, cacheKey(opts, "biased_wording"));
  return parseIssuesResponse(raw, "wording", "advertencia", validIds);
}

async function checkAmbiguousInstructions(
  q: Questionnaire,
  opts: AiCheckOptions
): Promise<QCIssue[]> {
  if (q.preguntas.length === 0) return [];
  const validIds = new Set(q.preguntas.map((p) => p.id));
  // Para instrucciones, miramos texto + tipo para entender si la pregunta deja
  // claro cuántas opciones puede marcar el respondente, etc.
  const lista = q.preguntas
    .map(
      (p) =>
        `- ${p.id} [${p.tipo}${
          p.tipo === "cerrada_multiple" ? "" : ""
        }]: "${p.texto}"`
    )
    .join("\n");

  const system = `Sos un analista de investigación de mercado. Detectás INSTRUCCIONES AMBIGUAS dentro de los enunciados de las preguntas. Ejemplos:
- Una pregunta multi-respuesta que no aclara que se pueden marcar varias.
- Una pregunta abierta sin indicación de extensión esperada.
- Pregunta numérica sin unidades ("¿Cuántas?" sin decir cuántas qué).
- Pregunta con escala que no explica los extremos.
- Ambigüedad temporal ("últimamente", "siempre") sin definir el período.

Reglas:
- Devolvé { "issues": [{ "pregunta_id": "<id>", "descripcion": "<qué falta o qué se podría aclarar>" }] }.
- Una issue por pregunta. Si no hay problemas claros, devolvé { "issues": [] }.
- Sé útil pero conservador: priorizá ambigüedades que afectan la respuesta.
- Sólo JSON, sin markdown.`;

  const user = `Preguntas:\n${lista}`;
  const raw = await callOpenAiJson(system, user, opts, cacheKey(opts, "ambiguous_instructions"));
  return parseIssuesResponse(raw, "wording", "sugerencia", validIds);
}

async function checkWrongQuestionType(
  q: Questionnaire,
  opts: AiCheckOptions
): Promise<QCIssue[]> {
  if (q.preguntas.length === 0) return [];
  const validIds = new Set(q.preguntas.map((p) => p.id));
  const lista = q.preguntas
    .map((p) => {
      const opts =
        p.opciones.length > 0
          ? ` — opciones: ${p.opciones
              .map((o) => `${o.codigo}=${o.texto}`)
              .join("; ")}`
          : "";
      return `- ${p.id} [${p.tipo}]: "${p.texto}"${opts}`;
    })
    .join("\n");

  const system = `Sos un analista de investigación de mercado. Detectás cuándo una pregunta tiene asignado un TIPO INCORRECTO en relación a lo que pide su texto. Ejemplos:
- El texto pide elegir UNA sola opción pero está marcada como cerrada_multiple.
- El texto pide marcar TODAS las que correspondan pero está como cerrada_unica.
- El texto sugiere una respuesta abierta numérica pero está como abierta_texto.
- Una escala 1-5 está marcada como cerrada_unica (debería ser escala).
- Una pregunta de ranking ("ordená de mayor a menor") está como cerrada_multiple.
- Una pregunta de fecha está como abierta_texto.

Tipos válidos: cerrada_unica, cerrada_multiple, escala, matriz, abierta_texto, abierta_marca, numerica, ranking, fecha, comentario.

Reglas:
- Devolvé { "issues": [{ "pregunta_id": "<id>", "descripcion": "<motivo + tipo sugerido>" }] }.
- Una issue por pregunta con tipo dudoso.
- Si los tipos son consistentes con el texto, devolvé { "issues": [] }.
- Sólo JSON, sin markdown.`;

  const user = `Preguntas:\n${lista}`;
  const raw = await callOpenAiJson(system, user, opts, cacheKey(opts, "wrong_type"));
  return parseIssuesResponse(raw, "tipos", "advertencia", validIds);
}

async function checkNonMECEOptions(
  q: Questionnaire,
  opts: AiCheckOptions
): Promise<QCIssue[]> {
  // MECE aplica especialmente a cerrada_unica: las opciones deberían ser
  // mutuamente excluyentes y colectivamente exhaustivas.
  const candidatas = q.preguntas.filter(
    (p) => p.tipo === "cerrada_unica" && p.opciones.length >= 2
  );
  if (candidatas.length === 0) return [];

  const validIds = new Set(candidatas.map((p) => p.id));
  const lista = candidatas
    .map(
      (p) =>
        `- ${p.id}: "${p.texto}" — opciones: ${p.opciones
          .map((o) => `${o.codigo}=${o.texto}`)
          .join("; ")}`
    )
    .join("\n");

  const system = `Sos un analista de investigación de mercado. Detectás OPCIONES NO MECE en preguntas cerradas de respuesta única (cerrada_unica):
- Opciones que SE SOLAPAN (no son mutuamente excluyentes; ej. "18-25" y "20-30" en una pregunta de edad).
- Categorías que NO SON EXHAUSTIVAS y deberían incluir un "Otro" o "Ninguna" obvio.
- Opciones de distinto nivel de abstracción mezcladas (ej. tres marcas específicas + "Cualquier otra").

Reglas:
- Devolvé { "issues": [{ "pregunta_id": "<id>", "descripcion": "<qué problema MECE tiene>" }] }.
- Una issue por pregunta. Si no hay problemas, devolvé { "issues": [] }.
- NO marques como problema una pregunta que claramente no necesita exhaustividad (ej. una pregunta de marca preferida puede no incluir todas las marcas).
- Sólo JSON, sin markdown.`;

  const user = `Preguntas cerrada_unica:\n${lista}`;
  const raw = await callOpenAiJson(system, user, opts, cacheKey(opts, "non_mece_options"));
  return parseIssuesResponse(raw, "logica", "advertencia", validIds);
}

// ---------------------------------------------------------------------------
// HTTP + parsing comunes
// ---------------------------------------------------------------------------

async function callOpenAiJson(
  systemPrompt: string,
  userPrompt: string,
  opts: AiCheckOptions,
  cacheKey: string
): Promise<unknown> {
  if (!opts.apiKey) throw new MissingOpenaiApiKeyError();

  const body = {
    model: opts.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    reasoning_effort: "minimal",
    max_completion_tokens: 8000,
    // Hint para el cache de OpenAI: re-validaciones del mismo cuestionario
    // comparten prefijo de prompt (system + estructura) y se benefician.
    prompt_cache_key: cacheKey,
  };

  let res: Response;
  try {
    res = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    // El AbortError se debe propagar tal cual para que el orquestador detecte
    // cancelación; sólo envolvemos errores genéricos de red.
    if (isAbortError(err)) throw err;
    throw new AiCheckError(`Error de red al contactar a OpenAI: ${errorMessage(err)}`);
  }

  if (!res.ok) {
    const errText = await safeText(res);
    throw new AiCheckError(
      `OpenAI HTTP ${res.status}: ${truncate(errText, 200)}`
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new AiCheckError("OpenAI devolvió respuesta vacía.");
  }
  try {
    return JSON.parse(content);
  } catch {
    throw new AiCheckError(
      `OpenAI devolvió JSON inválido: ${truncate(content, 200)}`
    );
  }
}

/**
 * Convierte el JSON de la IA en un array de QCIssue. La IA puede enviar más
 * o menos campos; somos tolerantes y filtramos issues sin descripción o con
 * `pregunta_id` desconocido (los redirigimos a "globales").
 */
function parseIssuesResponse(
  raw: unknown,
  defaultCategory: IssueCategory,
  defaultSeverity: IssueSeverity,
  validIds: Set<string>
): QCIssue[] {
  if (!isRecord(raw)) return [];
  const issuesRaw = Array.isArray(raw.issues) ? raw.issues : [];
  const out: QCIssue[] = [];
  for (const item of issuesRaw) {
    if (!isRecord(item)) continue;
    const desc = asString(item.descripcion).trim();
    if (!desc) continue;
    const pidRaw = asString(item.pregunta_id).trim();
    const severity = parseSeverity(asString(item.severidad)) ?? defaultSeverity;
    out.push({
      // Si la IA referencia un id desconocido, conservamos la issue como global
      // (pregunta_id: null) en lugar de descartarla.
      pregunta_id: pidRaw && validIds.has(pidRaw) ? pidRaw : null,
      severidad: severity,
      categoria: defaultCategory,
      descripcion: desc,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cacheKey(opts: AiCheckOptions, checkKey: string): string {
  const prefix = (opts.cacheKeyPrefix ?? "cuestionario").replace(/[^A-Za-z0-9_-]/g, "_");
  return `${prefix}:${checkKey}`;
}

function formatScale(p: Question): string {
  if (p.opciones.length > 0) {
    return `opciones: ${p.opciones.map((o) => `${o.codigo}=${o.texto}`).join("; ")}`;
  }
  return `rango: min=${p.min ?? "?"}, max=${p.max ?? "?"}`;
}

function parseSeverity(v: string): IssueSeverity | null {
  const norm = v.toLowerCase().trim();
  if (norm === "error") return "error";
  if (norm === "advertencia" || norm === "warning") return "advertencia";
  if (norm === "sugerencia" || norm === "suggestion") return "sugerencia";
  return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

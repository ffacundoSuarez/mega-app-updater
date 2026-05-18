/**
 * Motor de QC del Limpiador (port de `cleaning-service.js` Lightsail).
 *
 * Construye el prompt, llama a OpenAI vía `fetch` nativo (sin SDK) y devuelve
 * un array de `AnalyzeResult` alineado 1:1 con las filas del batch.
 *
 * Cambios respecto del original:
 *   - `fetch` directo a `/v1/chat/completions` en lugar del SDK `openai`
 *   - Retries con backoff exponencial en errores 429/5xx antes de caer al
 *     fallback "todo none" (el original caía al primer fallo de red)
 *   - Tipos estrictos para el response parseado
 *   - Logging via callback opcional (`onLog`) para no acoplar a `console.log`
 *   - Prompt en español, metadata filtrada del input, schema enriquecido con
 *     tipo+opciones de QP, nulls/vacíos eliminados de la fila (reduce ruido y
 *     falsos positivos).
 *
 * Modelo: gpt-5-mini (familia de razonamiento) vía Chat Completions. Esta
 * familia NO acepta `temperature` ni `seed` custom (la API tira 400). Forzamos
 * `reasoning_effort: "minimal"` — la tarea es clasificación deterministica
 * con prompt + few-shot, no necesita razonamiento profundo, y reasoning
 * tokens descuentan de `max_completion_tokens`. `max_completion_tokens` queda
 * holgado (16000) para que el JSON de salida no se trunque.
 */

import type {
  AnalyzeResult,
  CleaningRow,
  CleaningRule,
  SchemaColumn,
  VersionSchema,
} from "./types";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

/** Entrada que recibe `debugPromptLogger` por cada batch enviado a OpenAI. */
export interface PromptDebugEntry {
  /** Índice de batch dentro del job (0-based), si el caller lo provee. */
  batchIndex?: number;
  model: string;
  /** Cantidad de filas en el batch. */
  rowCount: number;
  /** Prompt completo del mensaje `system`. */
  systemPrompt: string;
  /** Prompt completo del mensaje `user`. */
  userPrompt: string;
  /** Respuesta cruda del modelo (string del `content`), o null si vino vacía. */
  rawResponse: string | null;
}

export interface AnalyzeOptions {
  /** Override del modelo. Default: "gpt-5-mini". */
  model?: string;
  /**
   * Tope de tokens en la respuesta. Default: 16000.
   *
   * Ojo: en modelos de razonamiento (gpt-5-*), los reasoning tokens también
   * descuentan de acá. Aunque pidamos `reasoning_effort: "minimal"`,
   * conviene tenerlo holgado para no quedarse cortos en batches grandes —
   * cuando el budget se acaba, el modelo devuelve `content` vacío y caemos
   * silenciosamente al fallback (todo "none").
   */
  maxCompletionTokens?: number;
  /** Reintentos ante 429/5xx antes de caer al fallback. Default: 2 (3 attempts total). */
  retries?: number;
  /** Delay base para el backoff exponencial en ms. Default: 1000. */
  retryBaseDelayMs?: number;
  /** Logger opcional (si no se pasa, se usa console). */
  onLog?: (level: "info" | "warn" | "error", message: string) => void;
  /**
   * Modo debug: si se pasa, se invoca con el prompt enviado y la respuesta
   * cruda del modelo para cada batch (incluso si el parseo falla después).
   * No se invoca cuando OpenAI devuelve un HTTP de error (no hubo respuesta).
   */
  debugPromptLogger?: (entry: PromptDebugEntry) => void;
  /** Índice de batch propagado tal cual a `debugPromptLogger`. */
  batchIndex?: number;
}

export interface AnalyzeBatchInput {
  rows: CleaningRow[];
  schema: VersionSchema;
  rules: CleaningRule[];
  apiKey: string;
}

interface OpenAIResponseChoice {
  message?: { content?: string };
  finish_reason?: string;
}
interface OpenAIResponseUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
}
interface OpenAIResponse {
  choices?: OpenAIResponseChoice[];
  usage?: OpenAIResponseUsage;
}

interface RawAiRowResult {
  row_number?: number;
  flag?: string;
  reason?: string | null;
  matched_rules?: string[];
  confidence?: number;
  recommendation?: string;
  friendly_explanation?: string | null;
  affected_question_ids?: string[];
}

/** Máximo de opciones de single/multi a incluir en el schema del prompt. */
const MAX_OPTIONS_IN_PROMPT = 50;

/**
 * Decide si una columna llega o no al prompt. Excluimos metadata
 * (columnas con `is_metadata` o cuyo id empieza con `META_`) — son ruido
 * para el modelo. El response_id ya viaja en la cabecera de cada ROW.
 */
function isPromptColumn(col: SchemaColumn): boolean {
  if (col.is_metadata) return false;
  if (col.id.startsWith("META_")) return false;
  return true;
}

/**
 * Línea del schema para el prompt. Incluye tipo de pregunta y opciones cuando
 * están enriquecidas desde QuestionPro, para que el modelo pueda decodificar
 * respuestas codificadas (ej: "Q5: 3" → "Muy satisfecho") y diferenciar
 * abiertas de cerradas.
 */
function describeSchemaColumn(col: SchemaColumn): string {
  const typeTag = col.qp_question_type ? ` [${col.qp_question_type}]` : "";
  let line = `- ${col.id}${typeTag}: "${col.question}"`;

  if (col.qp_options && col.qp_options.length > 0) {
    const opts = col.qp_options
      .slice(0, MAX_OPTIONS_IN_PROMPT)
      .map((o) => `${o.answerID}=${o.text}`)
      .join(", ");
    const truncated = col.qp_options.length > MAX_OPTIONS_IN_PROMPT
      ? ` (+${col.qp_options.length - MAX_OPTIONS_IN_PROMPT} más)`
      : "";
    line += ` — opciones: ${opts}${truncated}`;
  }

  return line;
}

/**
 * Serializa los valores de una fila para el prompt, pero filtra:
 *  - columnas metadata (no aportan al QC)
 *  - valores null/undefined/string vacío (el modelo no debería razonar sobre
 *    "el campo está null" — si está vacío, no se lo mostramos)
 */
function serializeRowData(
  row: CleaningRow,
  promptColumns: SchemaColumn[]
): string {
  const promptIds = new Set(promptColumns.map((c) => c.id));
  const lines: string[] = [];

  for (const [key, value] of Object.entries(row.data)) {
    if (!promptIds.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    lines.push(`  ${key}: ${JSON.stringify(value)}`);
  }

  return lines.length > 0 ? lines.join("\n") : "  (sin respuestas)";
}

/**
 * Bloque de ejemplos (few-shot) inyectado en el prompt. Incluye casos a
 * flaguear Y casos legítimos que NO se deben flaguear (respuestas cortas pero
 * correctas) — esto último es clave para que el modelo no se ancle en "es
 * corta → flag" y deje de repetir siempre el mismo razonamiento.
 *
 * Son ejemplos genéricos de encuestas de mercado (rioplatense); no dependen
 * de ninguna encuesta puntual.
 */
const FEW_SHOT_BLOCK = `EJEMPLOS (sólo de referencia — NO son parte de las filas a analizar; los IDs de pregunta en los ejemplos son ilustrativos):

Ejemplo A — galimatías en pregunta abierta → FLAG "red"
  Q3 (¿Qué mejorarías del servicio?): "asdkjh asd lkj"
  → flag: "red", recommendation: "remove", reason: "La respuesta es texto sin sentido (caracteres al azar), no aporta información.", affected_question_ids: ["Q3"]

Ejemplo B — misma respuesta literal repetida en varias abiertas → FLAG "yellow"
  Q5 (¿Por qué elegiste esa marca?): "porque sí"  |  Q6 (¿Qué opinás del precio?): "porque sí"  |  Q7 (¿Qué le falta al producto?): "porque sí"
  → flag: "yellow", recommendation: "review", reason: "Repite la misma frase genérica en todas las preguntas abiertas, sugiere respuesta sin atención.", affected_question_ids: ["Q5", "Q6", "Q7"]

Ejemplo C — vaga en pregunta que pide desarrollo → FLAG "yellow"
  Q4 (Contanos en al menos una oración tu experiencia con el producto): "bien"
  → flag: "yellow", recommendation: "review", reason: "La pregunta pide desarrollo y la respuesta es una sola palabra vaga.", affected_question_ids: ["Q4"]

Ejemplo D — contradicción interna → FLAG "yellow"
  Q1 (¿Qué edad tenés?): 15  |  Q22 (Comentarios): "ayer firmé la hipoteca de mi tercera casa"
  → flag: "yellow", recommendation: "review", reason: "La edad declarada (15) contradice el comentario sobre tener una hipoteca.", affected_question_ids: ["Q1", "Q22"]

Ejemplo E — respuesta corta pero CORRECTA → NO flaguear
  Q1 (¿Qué edad tenés?): "32"
  → flag: "none"  (es corta porque la pregunta así lo pide; está bien)

Ejemplo F — respuesta codificada de pregunta cerrada → NO flaguear
  Q8 [single — opciones: 1=Muy malo, 2=Malo, 3=Regular, 4=Bueno, 5=Muy bueno]: 5
  → flag: "none"  (es un answerID válido, no texto faltante)

Ejemplo G — comentario opcional dejado en "no" → NO flaguear
  Q30 (¿Algún comentario adicional? (opcional)): "no"
  → flag: "none"  (la pregunta es opcional; "no" es una respuesta legítima)

Ejemplo H — respuesta breve y concreta en abierta → NO flaguear
  Q12 (¿Qué marca de gaseosa tomás más seguido?): "Coca-Cola"
  → flag: "none"  (responde la pregunta, aunque sea corta)
`;

/**
 * Construye el prompt de análisis (en español). Excluye metadata, enriquece
 * el schema con tipo+opciones de QP y filtra valores vacíos del input.
 *
 * Las reglas del usuario se expanden: cualquier `@COLUMN_ID` mencionado en la
 * descripción se reemplaza por `@COLUMN_ID ("texto de la pregunta")` para que
 * el modelo no tenga que adivinar a qué columna refiere.
 */
export function buildPrompt(
  rows: CleaningRow[],
  schema: VersionSchema,
  rules: CleaningRule[]
): string {
  const promptColumns = schema.columns.filter(isPromptColumn);

  const schemaDescription = promptColumns
    .map(describeSchemaColumn)
    .join("\n");

  const rulesDescription =
    rules.length > 0
      ? rules.map((rule, i) => describeRule(rule, i, schema)).join("\n")
      : "(No hay reglas definidas — usar sólo detección general de calidad.)";

  const rowsData = rows
    .map((row, i) => {
      const rowDataStr = serializeRowData(row, promptColumns);
      return `ROW ${i + 1} (row_number: ${row.row_number}, response_id: ${
        row.response_id ?? "N/A"
      }):\n${rowDataStr}`;
    })
    .join("\n\n");

  return `Sos un analista de calidad de datos revisando respuestas de encuesta para identificar datos potencialmente inválidos.

ESQUEMA DE LA ENCUESTA (columnId [tipo]: "pregunta" — opciones si aplica):
${schemaDescription}

REGLAS DEFINIDAS POR EL USUARIO (AUTORITATIVAS — leelas primero):
${rulesDescription}

CÓMO APLICAR LAS REGLAS DEL USUARIO:
- Las reglas del usuario son OBLIGATORIAS y tienen prioridad sobre los patrones generales y sobre la directiva de ser conservador.
- Si una regla aplica claramente a una fila, flagueala según indique la regla — incluso si la respuesta no parece "claramente problemática" por sí sola.
- Si la regla dice "eliminar" / "excluir" / "descartar" / "borrar" → flag "red", recommendation "remove".
- Si la regla dice "marcar" / "revisar" / "verificar" / "sospechoso" → flag "yellow", recommendation "review".
- "@COLUMN_ID" en una regla refiere a esa columna del schema (ej: "@Q2" = columna Q2). La regla aplica al CONTENIDO de esa columna.
- Cuando aplique una regla, incluí su número (ej: "rule_1") en "matched_rules" y mencioná la regla en el "reason".

PATRONES ADICIONALES A DETECTAR (sólo si NO hay regla del usuario que aplique; sé conservador acá):
- Respuestas copy-paste o templateadas a través de varias preguntas
- Galimatías, caracteres random, golpes de teclado
- Respuestas sospechosamente generadas por IA (gramática perfecta, genéricas, sin contenido personal)
- Respuestas abiertas que no responden lógicamente la pregunta
- Contradicciones internas (ej: edad dice 25 pero menciona nietos)
- Respuestas excesivamente cortas o vagas ("bien", "ok", "sí") en preguntas que piden desarrollo

${FEW_SHOT_BLOCK}
REGLAS IMPORTANTES DE INTERPRETACIÓN:
- Si una columna NO aparece en una fila, esa pregunta quedó sin responder. NO inventes que falta un campo si está presente con un valor.
- Para preguntas tipo single/multi/rating, los valores numéricos representan answerIDs — usá la lista de opciones del schema para decodificar antes de juzgar.
- Las preguntas con tipo [text] o sin tipo son abiertas; las cerradas no necesitan texto largo.
- Si el row dice "(sin respuestas)" significa que la fila entera está vacía.

PRIORIDAD: primero verificá las reglas del usuario fila por fila. Recién después, evaluá los patrones generales con criterio conservador (ante la duda, no flaguees).

FILAS A ANALIZAR:
${rowsData}

Para cada fila respondé un objeto JSON. Devolvé un OBJETO JSON con una sola
clave "results" cuyo valor sea el array (un elemento por fila, en el mismo
orden que las filas a analizar):
{
  "results": [
    {
      "row_number": 1,
      "flag": "red" | "yellow" | "none",
      "reason": "Explicación breve en español (sólo si está flagueada)",
      "matched_rules": ["rule_id_1"] o ["pattern_detected"],
      "confidence": 0.85,
      "recommendation": "remove" | "review" | "keep",
      "friendly_explanation": "Texto en español dirigido al revisor humano. Formato: 'Recomiendo {accion} porque en \\\\'{textoPregunta}\\\\' la respuesta {motivo}.'",
      "affected_question_ids": ["Q1", "Q22"]
    },
    ...
  ]
}

Significado de los flags:
- "red": respuesta claramente inválida/bot — recomendar eliminación
- "yellow": sospechosa pero incierta — requiere revisión humana
- "none": parece válida

Detalles de los campos:
- "recommendation": mapeo "red" → "remove", "yellow" → "review", "none" → "keep"; para "none" puede omitirse.
- "reason" y "friendly_explanation": ambos en español. "friendly_explanation" debe referenciar la columna por el texto de su pregunta, no por el ID. Omitilo si flag es "none".
- "affected_question_ids": lista los column IDs (Q1, Q22, …) cuyos valores dispararon el flag. Array vacío si no aplica.

Respondé SÓLO con el objeto JSON ({ "results": [...] }), sin texto adicional.`;
}

/**
 * Texto en lenguaje natural de la regla, tal como lo lee el prompt.
 *
 * Si se pasa el schema, expande cualquier `@COLUMN_ID` a `@COLUMN_ID ("texto
 * de la pregunta")` para que el modelo no tenga que adivinar a qué columna
 * refiere la regla. Si la columna no existe en el schema, deja el `@id` tal
 * cual (el modelo lo va a tomar como string literal, comportamiento previo).
 */
export function describeRule(
  rule: CleaningRule,
  index: number,
  schema?: VersionSchema
): string {
  const text =
    rule.description ||
    rule.rule_config?.description ||
    "Regla sin descripción";

  const expanded = schema ? expandMentions(text, schema) : text;
  return `rule_${index + 1}. ${expanded}`;
}

/**
 * Reemplaza `@COLUMN_ID` por `@COLUMN_ID ("texto de la pregunta")` usando el
 * schema. Match case-insensitive sobre el id de columna, preservando el case
 * original en el output. Sólo expande IDs que existan en el schema.
 */
function expandMentions(text: string, schema: VersionSchema): string {
  const byIdLower = new Map<string, SchemaColumn>();
  for (const col of schema.columns) byIdLower.set(col.id.toLowerCase(), col);

  return text.replace(/@(\w+)/g, (full, id: string) => {
    const col = byIdLower.get(id.toLowerCase());
    if (!col) return full;
    const q = col.question?.trim();
    if (!q || q === col.id) return `@${col.id}`;
    return `@${col.id} ("${q}")`;
  });
}

/**
 * Analiza un batch de filas con OpenAI. Devuelve un resultado por fila,
 * preservando el orden de `input.rows`. Si el modelo falla repetidamente,
 * cae al fallback (todo `flag: "none"`) en lugar de tirar excepción.
 */
export async function analyzeBatch(
  input: AnalyzeBatchInput,
  options: AnalyzeOptions = {}
): Promise<AnalyzeResult[]> {
  const {
    model = "gpt-5-mini",
    maxCompletionTokens = 16000,
    retries = 2,
    retryBaseDelayMs = 1000,
    onLog,
    debugPromptLogger,
    batchIndex,
  } = options;

  const log = onLog ?? defaultLogger;
  const { rows, schema, rules, apiKey } = input;

  log("info", `CleaningService: Analyzing ${rows.length} rows...`);
  const prompt = buildPrompt(rows, schema, rules);
  // El body manda `response_format: { type: "json_object" }`, que fuerza al
  // modelo a devolver un OBJETO JSON (no un array suelto). gpt-5-mini razona
  // y se traba si el prompt le pide "un array" mientras el response_format
  // le exige "un objeto". Por eso instruimos explícitamente: `{ "results":
  // [...] }`. El parser ya extrae `obj.results`.
  const systemPrompt =
    "Sos un analista de calidad de datos. Respondé únicamente con un objeto JSON válido de la forma { \"results\": [...] }. Sé conservador: flagueá sólo respuestas claramente problemáticas.";

  const emitDebug = (rawResponse: string | null): void => {
    if (!debugPromptLogger) return;
    try {
      debugPromptLogger({
        batchIndex,
        model,
        rowCount: rows.length,
        systemPrompt,
        userPrompt: prompt,
        rawResponse,
      });
    } catch {
      /* el logger de debug nunca debe romper el job */
    }
  };

  // Nota: gpt-5-mini es un modelo de razonamiento. No acepta `temperature`
  // ni `seed` custom (la API tira 400). `reasoning_effort: "minimal"` es lo
  // más cercano en costo/latencia a gpt-4o-mini para esta tarea (clasificación
  // con prompt + few-shot). Si en el futuro hace falta más cabeza, subir a
  // "low" o "medium" — pero entonces también hay que subir
  // `max_completion_tokens` porque los reasoning tokens descuentan de ahí.
  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    max_completion_tokens: maxCompletionTokens,
    response_format: { type: "json_object" },
    reasoning_effort: "minimal",
  };

  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= retries) {
    try {
      const res = await fetch(OPENAI_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await safeText(res);
        const isRetryable = res.status === 429 || res.status >= 500;
        if (isRetryable && attempt < retries) {
          const delay = retryBaseDelayMs * Math.pow(2, attempt);
          log(
            "warn",
            `OpenAI ${res.status} (attempt ${attempt + 1}/${
              retries + 1
            }); retrying in ${delay}ms. Body: ${truncate(errText, 200)}`
          );
          await sleep(delay);
          attempt++;
          continue;
        }
        throw new Error(`OpenAI HTTP ${res.status}: ${truncate(errText, 200)}`);
      }

      const json = (await res.json()) as OpenAIResponse;
      const choice = json.choices?.[0];
      const content = choice?.message?.content?.trim();
      emitDebug(content ?? null);
      if (!content) {
        // Mensaje detallado para diagnosticar el fallback silencioso. En
        // gpt-5-* la causa más común de content vacío es
        // finish_reason="length": el budget se gastó en reasoning_tokens y
        // no quedó espacio para el JSON. Si pasa, subí maxCompletionTokens.
        const usage = json.usage;
        const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens;
        log(
          "error",
          `Empty response from OpenAI (finish_reason="${
            choice?.finish_reason ?? "?"
          }", reasoning_tokens=${reasoningTokens ?? "?"}, completion_tokens=${
            usage?.completion_tokens ?? "?"
          }). Falling back to "none" for all ${rows.length} rows.`
        );
        return getFallbackResults(rows);
      }

      const parsed = parseAiArray(content);
      if (!parsed) {
        log("error", "Failed to parse OpenAI response as JSON array");
        return getFallbackResults(rows);
      }

      const results = mergeAiResults(rows, parsed);
      const flaggedCount = results.filter((r) => r.flag !== "none").length;
      log("info", `Analysis complete: ${flaggedCount}/${rows.length} rows flagged`);
      return results;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        const delay = retryBaseDelayMs * Math.pow(2, attempt);
        log(
          "warn",
          `Network/parse error (attempt ${attempt + 1}/${
            retries + 1
          }); retrying in ${delay}ms: ${errorMessage(err)}`
        );
        await sleep(delay);
        attempt++;
        continue;
      }
      break;
    }
  }

  log("error", `AI analysis failed after retries: ${errorMessage(lastError)}`);
  return getFallbackResults(rows);
}

/** Resultado neutro por fila. Usado cuando OpenAI falla. */
export function getFallbackResults(rows: CleaningRow[]): AnalyzeResult[] {
  return rows.map((row) => ({
    row_id: row.id,
    row_number: row.row_number,
    flag: "none",
    reason: null,
    matched_rules: [],
    confidence: 1.0,
    friendly_explanation: null,
    recommendation: null,
    affected_question_ids: [],
  }));
}

// ---------- helpers internos ----------

/**
 * Acepta el JSON crudo del modelo en cualquiera de las formas que devuelve:
 *   - Array directo: `[{...}, {...}]`
 *   - `{ results: [...] }`
 *   - `{ <cualquierClave>: [...] }` (toma la primera clave cuyo valor sea array)
 * Devuelve el array de objetos crudos o `null` si no se encontró.
 */
function parseAiArray(content: string): RawAiRowResult[] | null {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return null;
  }

  if (Array.isArray(data)) return data as RawAiRowResult[];

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.results)) return obj.results as RawAiRowResult[];

    const arrayKey = Object.keys(obj).find((k) => Array.isArray(obj[k]));
    if (arrayKey) return obj[arrayKey] as RawAiRowResult[];
  }
  return null;
}

/**
 * Empareja cada fila del batch con su entrada en el array IA.
 * Estrategia: primero match por `row_number`; si no hay, match por índice.
 * Si tampoco, fallback a "none".
 */
function mergeAiResults(
  rows: CleaningRow[],
  parsed: RawAiRowResult[]
): AnalyzeResult[] {
  return rows.map((row, index) => {
    const aiResult =
      parsed.find((r) => r.row_number === row.row_number) ?? parsed[index];

    if (!aiResult) {
      return {
        row_id: row.id,
        row_number: row.row_number,
        flag: "none",
        reason: null,
        matched_rules: [],
        confidence: 1.0,
        friendly_explanation: null,
        recommendation: null,
        affected_question_ids: [],
      };
    }

    const flag = normalizeFlag(aiResult.flag);
    return {
      row_id: row.id,
      row_number: row.row_number,
      flag,
      reason: aiResult.reason ?? null,
      matched_rules: aiResult.matched_rules ?? [],
      confidence:
        typeof aiResult.confidence === "number" ? aiResult.confidence : 0.5,
      friendly_explanation: aiResult.friendly_explanation ?? null,
      recommendation: normalizeRecommendation(aiResult.recommendation, flag),
      affected_question_ids: Array.isArray(aiResult.affected_question_ids)
        ? aiResult.affected_question_ids.map(String)
        : [],
    };
  });
}

function normalizeFlag(raw: unknown): "red" | "yellow" | "none" {
  if (raw === "red" || raw === "yellow") return raw;
  return "none";
}

/**
 * Convierte la `recommendation` cruda del modelo a un valor válido. Si el
 * modelo no la devuelve y hay flag, usa el mapping default
 * (red → remove, yellow → review). Si flag es "none", devuelve null.
 */
function normalizeRecommendation(
  raw: unknown,
  flag: "red" | "yellow" | "none"
): "remove" | "review" | "keep" | null {
  if (raw === "remove" || raw === "review" || raw === "keep") return raw;
  if (flag === "red") return "remove";
  if (flag === "yellow") return "review";
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function defaultLogger(
  level: "info" | "warn" | "error",
  message: string
): void {
  const fn =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  fn(`[cleaning-service] ${message}`);
}

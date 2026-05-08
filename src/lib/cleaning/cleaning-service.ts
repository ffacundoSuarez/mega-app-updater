/**
 * Motor de QC del Limpiador (port de `cleaning-service.js` Lightsail).
 *
 * Construye el prompt, llama a OpenAI vía `fetch` nativo (sin SDK) y devuelve
 * un array de `AnalyzeResult` alineado 1:1 con las filas del batch.
 *
 * El comportamiento del prompt y el fallback es idéntico al original. Cambios:
 *   - `fetch` directo a `/v1/chat/completions` en lugar del SDK `openai`
 *   - Retries con backoff exponencial en errores 429/5xx antes de caer al
 *     fallback "todo none" (el original caía al primer fallo de red)
 *   - Tipos estrictos para el response parseado
 *   - Logging via callback opcional (`onLog`) para no acoplar a `console.log`
 *   - Modelo, temperatura y max tokens parametrizables (default = mismo que el
 *     original: gpt-4o-mini, sin temperature explícita, 4000 tokens)
 */

import type {
  AnalyzeResult,
  CleaningRow,
  CleaningRule,
  VersionSchema,
} from "./types";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

export interface AnalyzeOptions {
  /** Override del modelo. Default: "gpt-4o-mini". */
  model?: string;
  /** Tope de tokens en la respuesta. Default: 4000. */
  maxCompletionTokens?: number;
  /** Reintentos ante 429/5xx antes de caer al fallback. Default: 2 (3 attempts total). */
  retries?: number;
  /** Delay base para el backoff exponencial en ms. Default: 1000. */
  retryBaseDelayMs?: number;
  /** Logger opcional (si no se pasa, se usa console). */
  onLog?: (level: "info" | "warn" | "error", message: string) => void;
}

export interface AnalyzeBatchInput {
  rows: CleaningRow[];
  schema: VersionSchema;
  rules: CleaningRule[];
  apiKey: string;
}

interface OpenAIResponseChoice {
  message?: { content?: string };
}
interface OpenAIResponse {
  choices?: OpenAIResponseChoice[];
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

/**
 * Construye el prompt de análisis. Mismo texto que el original; sólo se cambió
 * el contexto (template literal) por legibilidad.
 */
export function buildPrompt(
  rows: CleaningRow[],
  schema: VersionSchema,
  rules: CleaningRule[]
): string {
  const schemaDescription = schema.columns
    .map((col) => `- ${col.id}: "${col.question}"`)
    .join("\n");

  const rulesDescription =
    rules.length > 0
      ? rules.map((rule, i) => describeRule(rule, i)).join("\n")
      : "No specific rules defined - use general quality detection only.";

  const rowsData = rows
    .map((row, i) => {
      const rowDataStr = Object.entries(row.data)
        .map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`)
        .join("\n");
      return `ROW ${i + 1} (row_number: ${row.row_number}, response_id: ${
        row.response_id ?? "N/A"
      }):\n${rowDataStr}`;
    })
    .join("\n\n");

  return `You are a data quality analyst reviewing survey responses to identify potentially invalid data.

SURVEY SCHEMA (Column ID: Question):
${schemaDescription}

USER-DEFINED RULES TO ENFORCE:
${rulesDescription}

ADDITIONAL PATTERNS TO DETECT (be conservative - only flag if clearly problematic):
- Responses that look copy-pasted or templated across multiple questions
- Gibberish, random characters, or keyboard spam
- Responses that are suspiciously AI-generated (overly perfect grammar, generic platitudes, no personal touch)
- Open-ended answers that don't logically match the question asked
- Contradictory answers within the same response (e.g., age says 25 but mentions grandchildren)
- Extremely short or lazy answers like "good", "ok", "yes" for questions requiring detailed responses

BE CONSERVATIVE: Only flag responses that are CLEARLY problematic. When in doubt, don't flag.

ROWS TO ANALYZE:
${rowsData}

For each row, respond with a JSON object. Return a JSON array with one object per row:
[
  {
    "row_number": 1,
    "flag": "red" | "yellow" | "none",
    "reason": "Brief explanation in English (only if flagged)",
    "matched_rules": ["rule_id_1"] or ["pattern_detected"],
    "confidence": 0.85,
    "recommendation": "remove" | "review" | "keep",
    "friendly_explanation": "Texto en español dirigido al revisor humano. Formato: 'Recomiendo {accion} porque en \\\\'{textoPregunta}\\\\' la respuesta {motivo}.'",
    "affected_question_ids": ["Q1", "Q22"]
  },
  ...
]

Flag meanings:
- "red": Clearly invalid/bot response - recommend removal
- "yellow": Suspicious but uncertain - needs human review
- "none": Appears valid

Field details:
- "recommendation": map "red" → "remove", "yellow" → "review", "none" → "keep"; for "none" you may omit it.
- "friendly_explanation": short, in Spanish, addressed to a human reviewer. Reference the column by its question text (not by ID). Omit if flag is "none".
- "affected_question_ids": list the column IDs (Q1, Q22, META_*, …) whose values triggered the flag. Empty array if not applicable.

Respond ONLY with the JSON array, no other text.`;
}

/** Texto en lenguaje natural de la regla, tal como lo lee el prompt. */
export function describeRule(rule: CleaningRule, index: number): string {
  const text =
    rule.description ||
    rule.rule_config?.description ||
    "Regla sin descripción";
  return `${index + 1}. ${text}`;
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
    model = "gpt-4o-mini",
    maxCompletionTokens = 4000,
    retries = 2,
    retryBaseDelayMs = 1000,
    onLog,
  } = options;

  const log = onLog ?? defaultLogger;
  const { rows, schema, rules, apiKey } = input;

  log("info", `CleaningService: Analyzing ${rows.length} rows...`);
  const prompt = buildPrompt(rows, schema, rules);

  const body = {
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a data quality analyst. Respond only with valid JSON arrays. Be conservative - only flag clearly problematic responses.",
      },
      { role: "user", content: prompt },
    ],
    max_completion_tokens: maxCompletionTokens,
    response_format: { type: "json_object" },
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
      const content = json.choices?.[0]?.message?.content?.trim();
      if (!content) {
        log("error", "Empty response from OpenAI");
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

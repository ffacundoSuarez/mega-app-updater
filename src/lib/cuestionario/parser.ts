/**
 * Parser de cuestionarios a JSON canónico vía OpenAI.
 *
 * - `parseTextToQuestionnaire` (Iteración 1): input = texto crudo pegado por el
 *   usuario.
 * - `parseDocxToQuestionnaire` (Iteración 5): extrae texto plano de un `.docx`
 *   con `mammoth` (browser build) y delega a `parseTextToQuestionnaire`.
 * - `parsePdfToQuestionnaire` (Iteración 5): extrae texto con `pdfjs-dist`
 *   página a página y delega a `parseTextToQuestionnaire`. PDFs escaneados o
 *   con layout complejo fallan con un mensaje explícito pidiendo "pegar texto"
 *   — el fallback a vision con `gpt-4o` se difirió a una iteración futura.
 *
 * Las dos libs nuevas (`mammoth`, `pdfjs-dist`) se cargan con `import()`
 * dinámico para no inflar el bundle inicial: la mayoría de los flujos del
 * Validador no las necesita.
 *
 * Convenciones (heredadas de cleaning-service.ts):
 *   - `fetch` directo a /v1/chat/completions, sin SDK.
 *   - `response_format: json_object` + `reasoning_effort: "minimal"` para
 *     alinear con el Limpiador en gpt-5-mini.
 *   - Errores del modelo se traducen a `ParseError` con un mensaje accionable
 *     en español; nunca devolvemos un Questionnaire silenciosamente vacío.
 *
 * Por qué no hay Zod: la app no tiene Zod en deps. Validamos a mano con
 * `coerceQuestionnaire`, igual que cleaning-service hace para sus respuestas.
 */

import { DEFAULT_CUESTIONARIO_MODEL, getOpenaiApiKey } from "@/lib/settings";
import type {
  FlowRule,
  OptionCondition,
  Question,
  QuestionOption,
  QuestionType,
  Questionnaire,
  QuestionnaireMetadata,
  Section,
} from "./types";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

const VALID_TYPES: readonly QuestionType[] = [
  "cerrada_unica",
  "cerrada_multiple",
  "escala",
  "matriz",
  "abierta_texto",
  "abierta_marca",
  "numerica",
  "ranking",
  "fecha",
  "comentario",
];

const VALID_OPTION_CONDITIONS: readonly OptionCondition[] = [
  "fijar",
  "especificar",
  "exclusiva",
];

export interface ParseOptions {
  /** Override del modelo. Default: "gpt-5-mini". */
  model?: string;
  /** Sugerencia de título; si la IA detecta uno mejor en el texto, lo respeta. */
  hintTitulo?: string;
  /** Idioma esperado (afecta sólo la metadata final, no el prompt). */
  hintIdioma?: string;
  /** País asociado al cuestionario (afecta sólo la metadata final). */
  hintPais?: string;
}

export class MissingOpenaiApiKeyError extends Error {
  constructor() {
    super(
      "Falta la API key de OpenAI en Ajustes. Configurala antes de parsear con IA."
    );
    this.name = "MissingOpenaiApiKeyError";
  }
}

/** Error que devuelve el parser cuando no puede producir un Questionnaire
 *  útil (HTTP del modelo, JSON malformado, sin preguntas, etc.). */
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

/**
 * Parsea texto crudo a un Questionnaire canónico via OpenAI.
 *
 * El texto puede ser tanto el cuestionario completo como un fragmento. Si la
 * IA no logra extraer al menos una pregunta, tira `ParseError` (preferimos
 * fallar explícito a guardar un cuestionario vacío que confunda al usuario).
 */
export async function parseTextToQuestionnaire(
  rawText: string,
  opts: ParseOptions = {}
): Promise<Questionnaire> {
  const text = rawText.trim();
  if (!text) {
    throw new ParseError("El texto del cuestionario está vacío.");
  }
  const apiKey = await getOpenaiApiKey();
  if (!apiKey) throw new MissingOpenaiApiKeyError();

  const model = opts.model ?? DEFAULT_CUESTIONARIO_MODEL;

  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(text, opts) },
    ],
    response_format: { type: "json_object" },
    reasoning_effort: "minimal",
    max_completion_tokens: 16000,
  };

  let res: Response;
  try {
    res = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new ParseError(
      `Error de red al contactar a OpenAI: ${errorMessage(err)}`
    );
  }

  if (!res.ok) {
    const errText = await safeText(res);
    throw new ParseError(
      `OpenAI HTTP ${res.status}: ${truncate(errText, 200)}`
    );
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new ParseError("OpenAI devolvió respuesta vacía.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ParseError(
      `OpenAI devolvió JSON inválido: ${truncate(content, 200)}`
    );
  }
  return coerceQuestionnaire(parsed, opts);
}

/**
 * Parsea un Word (`.docx`) a un Questionnaire canónico.
 *
 * Extrae el texto plano con mammoth (browser build) y reusa
 * `parseTextToQuestionnaire`. El nombre del archivo se usa como `hintTitulo`
 * por defecto si el caller no pasa uno.
 */
export async function parseDocxToQuestionnaire(
  file: File | Blob,
  opts: ParseOptions & { fileName?: string } = {}
): Promise<Questionnaire> {
  const arrayBuffer = await file.arrayBuffer();
  const mammoth = await import("mammoth");
  let rawText: string;
  try {
    const { value } = await mammoth.extractRawText({ arrayBuffer });
    rawText = value;
  } catch (err) {
    throw new ParseError(
      `No se pudo leer el archivo Word: ${errorMessage(err)}`
    );
  }
  if (!rawText.trim()) {
    throw new ParseError(
      "El Word no tiene texto extraíble. Probá pegando el contenido a mano."
    );
  }
  const fileName = opts.fileName ?? fileNameOf(file);
  return parseTextToQuestionnaire(rawText, {
    ...opts,
    hintTitulo: opts.hintTitulo ?? deriveTitleFromFilename(fileName),
  });
}

/**
 * Parsea un PDF a un Questionnaire canónico via extracción de texto.
 *
 * Usa `pdfjs-dist` página a página y concatena. No hace OCR ni vision: si el
 * PDF está escaneado o tiene layout complejo (texto en columnas, tablas), la
 * extracción puede salir vacía o desordenada y el parse falla con un mensaje
 * sugiriendo "pegar texto". El fallback a vision con gpt-4o es una mejora
 * futura, no MVP.
 */
export async function parsePdfToQuestionnaire(
  file: File | Blob,
  opts: ParseOptions & { fileName?: string } = {}
): Promise<Questionnaire> {
  const arrayBuffer = await file.arrayBuffer();
  const text = await extractPdfText(arrayBuffer);
  if (text.trim().length < 40) {
    throw new ParseError(
      "No se pudo extraer suficiente texto del PDF (puede estar escaneado o " +
        "tener layout complejo). Copiá el contenido y usá la opción 'Pegar texto'."
    );
  }
  const fileName = opts.fileName ?? fileNameOf(file);
  return parseTextToQuestionnaire(text, {
    ...opts,
    hintTitulo: opts.hintTitulo ?? deriveTitleFromFilename(fileName),
  });
}

/**
 * Carga pdfjs lazy y configura el worker una sola vez. El `?url` resuelve a la
 * URL final del worker (Vite copia el archivo al bundle) — es la forma soportada
 * de evitar el "fake worker" warning y el modo single-thread lento.
 */
let pdfjsWorkerConfigured = false;
async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjsWorkerConfigured) {
    const workerUrl = (
      await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
    ).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    pdfjsWorkerConfigured = true;
  }
  let doc: import("pdfjs-dist").PDFDocumentProxy;
  try {
    doc = await pdfjs.getDocument({ data }).promise;
  } catch (err) {
    throw new ParseError(
      `No se pudo abrir el PDF: ${errorMessage(err)}. ` +
        "Si está protegido con contraseña, eliminala antes de subirlo."
    );
  }
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it) => ("str" in it ? it.str : ""))
      .join(" ");
    parts.push(pageText);
  }
  // Liberar el documento (evita warnings de pdfjs sobre handles abiertos).
  await doc.cleanup();
  await doc.destroy();
  return parts.join("\n\n");
}

function fileNameOf(file: File | Blob): string | undefined {
  return typeof File !== "undefined" && file instanceof File ? file.name : undefined;
}

/** "Tracking marca X.docx" → "Tracking marca X". Devuelve undefined si no
 *  hay un título razonable (ej. nombres genéricos como "document.docx"). */
function deriveTitleFromFilename(fileName: string | undefined): string | undefined {
  if (!fileName) return undefined;
  const stem = fileName.replace(/\.[^./\\]+$/, "").trim();
  if (!stem) return undefined;
  if (/^(document|untitled|sin[\s_-]?titulo|new[\s_-]?file)$/i.test(stem)) {
    return undefined;
  }
  return stem;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Sos un asistente que estructura cuestionarios de encuestas de investigación de mercado a un JSON canónico.

Reglas estrictas:
- Devolvé SIEMPRE un objeto JSON con exactamente estas claves de nivel superior: { "metadata": {...}, "preguntas": [...], "secciones": [...] }.
- Cada pregunta tiene: { "id", "numero", "texto", "tipo", "condicion", "aleatorizar", "opciones", "flujo" } y opcionalmente "min", "max", "enunciados".
- Tipos válidos (uno y sólo uno por pregunta): cerrada_unica, cerrada_multiple, escala, matriz, abierta_texto, abierta_marca, numerica, ranking, fecha, comentario.
- Usá tipo "comentario" para textos informativos, introducciones, instrucciones o separadores que se muestran al participante pero no esperan respuesta.
- "id" es un identificador corto y único de la pregunta. Preferí lo que use el cuestionario (ej. "P1", "S2", "F5"). Si el cuestionario no tiene IDs, generalos como "P1", "P2", ... siguiendo el orden.
- "numero" es la posición 1-based en el orden del cuestionario.
- "condicion" es la expresión lógica que controla si la pregunta se muestra (ej. "S1=3"). Si no aplica, mandá "".
- "aleatorizar" es booleano: true si las opciones se deben presentar en orden aleatorio.
- "opciones" es un array (vacío para preguntas abiertas o numéricas). Cada opción: { "codigo": <int>, "texto": <string>, "flujo": <string>, "condicion": <string[]> }. "flujo" puede ser "", "terminar" o "saltar_a <id>". "condicion" puede contener "fijar", "especificar" y/o "exclusiva" (array vacío si no aplica).
- "flujo" es un array de reglas de salto: { "si_respuesta": <int|int[]>, "accion": "saltar_a" | "terminar" | "continuar", "destino": <id opcional> }.
- "min" y "max" SÓLO para tipo "escala" o "numerica".
- "enunciados" SÓLO para tipo "matriz" (cada uno con la misma forma que una opción: los ítems de las filas).
- "secciones" es un array opcional para agrupar preguntas: { "nombre": <string>, "preguntas": <string[]> } donde "preguntas" son ids.
- Si no podés determinar algo, usá strings vacíos / arrays vacíos / false. NUNCA inventes opciones ni preguntas.
- Sé fiel al texto original: no parafrasees enunciados ni reordenes preguntas.
- Sólo emití el JSON, sin texto antes o después, sin markdown, sin comentarios.`;

function buildUserPrompt(text: string, opts: ParseOptions): string {
  const hints: string[] = [];
  if (opts.hintTitulo) hints.push(`Título sugerido: ${opts.hintTitulo}`);
  if (opts.hintIdioma) hints.push(`Idioma: ${opts.hintIdioma}`);
  if (opts.hintPais) hints.push(`País: ${opts.hintPais}`);
  const hintBlock = hints.length
    ? `\nDATOS DE CONTEXTO (usá para completar metadata si están):\n${hints.join(
        "\n"
      )}\n`
    : "";
  return `Estructurá el siguiente cuestionario al JSON canónico descripto en el sistema.${hintBlock}\nCUESTIONARIO:\n${text}`;
}

// ---------------------------------------------------------------------------
// Coerción / validación de la respuesta de la IA
// ---------------------------------------------------------------------------

/**
 * Convierte el JSON crudo de la IA en un Questionnaire bien tipado.
 *
 * Es deliberadamente tolerante: rellena defaults sensatos (numero, condicion
 * vacía, opciones vacías) en lugar de tirar al primer mismatch, porque el
 * usuario va a poder editar el resultado en el editor. Sólo lanza ParseError
 * cuando el shape global es irrecuperable (no hay objeto, o no hay preguntas
 * usables).
 */
export function coerceQuestionnaire(
  raw: unknown,
  opts: ParseOptions = {}
): Questionnaire {
  if (!isRecord(raw)) {
    throw new ParseError("La respuesta de la IA no es un objeto JSON.");
  }
  const metadata = coerceMetadata(raw.metadata, opts);
  const preguntasRaw = Array.isArray(raw.preguntas) ? raw.preguntas : [];
  const preguntas: Question[] = preguntasRaw
    .map((p, i) => coerceQuestion(p, i))
    .filter((p): p is Question => p !== null);

  if (preguntas.length === 0) {
    throw new ParseError(
      "La IA no devolvió preguntas reconocibles. Probá con un texto más estructurado o cargalas a mano."
    );
  }

  const secciones = Array.isArray(raw.secciones)
    ? raw.secciones
        .map(coerceSection)
        .filter((s): s is Section => s !== null)
    : [];

  return { metadata, preguntas, secciones };
}

function coerceMetadata(
  raw: unknown,
  opts: ParseOptions
): QuestionnaireMetadata {
  const m = isRecord(raw) ? raw : {};
  return {
    titulo:
      asString(m.titulo).trim() || opts.hintTitulo || "Cuestionario sin título",
    fecha: asString(m.fecha).trim() || new Date().toISOString().slice(0, 10),
    pais: asString(m.pais).trim() || opts.hintPais || "",
    idioma: asString(m.idioma).trim() || opts.hintIdioma || "es",
  };
}

function coerceQuestion(raw: unknown, index: number): Question | null {
  if (!isRecord(raw)) return null;
  const tipo = asQuestionType(raw.tipo);
  if (!tipo) return null;
  const texto = asString(raw.texto).trim();
  if (!texto) return null;

  const id = asString(raw.id).trim() || `P${index + 1}`;
  const opciones = Array.isArray(raw.opciones)
    ? raw.opciones
        .map(coerceOption)
        .filter((o): o is QuestionOption => o !== null)
    : [];
  const flujo = Array.isArray(raw.flujo)
    ? raw.flujo.map(coerceFlow).filter((f): f is FlowRule => f !== null)
    : [];

  const q: Question = {
    id,
    numero: asInt(raw.numero) ?? index + 1,
    texto,
    tipo,
    condicion: asString(raw.condicion),
    aleatorizar: raw.aleatorizar === true,
    opciones,
    flujo,
  };

  if (tipo === "escala" || tipo === "numerica") {
    const min = asInt(raw.min);
    const max = asInt(raw.max);
    if (min !== null) q.min = min;
    if (max !== null) q.max = max;
  }
  if (tipo === "matriz" && Array.isArray(raw.enunciados)) {
    q.enunciados = raw.enunciados
      .map(coerceOption)
      .filter((o): o is QuestionOption => o !== null);
  }
  return q;
}

function coerceOption(raw: unknown): QuestionOption | null {
  if (!isRecord(raw)) return null;
  const texto = asString(raw.texto).trim();
  if (!texto) return null;
  const condicion = Array.isArray(raw.condicion)
    ? raw.condicion
        .map(asString)
        .filter((c): c is OptionCondition =>
          (VALID_OPTION_CONDITIONS as readonly string[]).includes(c)
        )
    : [];
  return {
    codigo: asInt(raw.codigo) ?? 0,
    texto,
    flujo: asString(raw.flujo),
    condicion,
  };
}

function coerceFlow(raw: unknown): FlowRule | null {
  if (!isRecord(raw)) return null;
  const accion = raw.accion;
  if (accion !== "saltar_a" && accion !== "terminar" && accion !== "continuar") {
    return null;
  }
  let siRespuesta: number | number[];
  if (Array.isArray(raw.si_respuesta)) {
    const arr = raw.si_respuesta
      .map((v) => asInt(v))
      .filter((v): v is number => v !== null);
    if (arr.length === 0) return null;
    siRespuesta = arr;
  } else {
    const n = asInt(raw.si_respuesta);
    if (n === null) return null;
    siRespuesta = n;
  }
  const rule: FlowRule = { si_respuesta: siRespuesta, accion };
  const destino = asString(raw.destino).trim();
  if (destino) rule.destino = destino;
  return rule;
}

function coerceSection(raw: unknown): Section | null {
  if (!isRecord(raw)) return null;
  const nombre = asString(raw.nombre).trim();
  if (!nombre) return null;
  const preguntas = Array.isArray(raw.preguntas)
    ? raw.preguntas
        .map((p) => asString(p).trim())
        .filter((p) => p.length > 0)
    : [];
  return { nombre, preguntas };
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) {
    return parseInt(v.trim(), 10);
  }
  return null;
}

function asQuestionType(v: unknown): QuestionType | null {
  return typeof v === "string" && (VALID_TYPES as readonly string[]).includes(v)
    ? (v as QuestionType)
    : null;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Parser de cuestionarios a JSON canónico vía OpenAI.
 *
 * - `parseTextToQuestionnaire` (Iteración 1): input = texto crudo pegado por el
 *   usuario.
 * - `parseDocxToQuestionnaire` (Iteración 5): extrae texto del `.docx` en dos
 *   canales (visible vs. instrucciones en rojo) vía `docx-extract.ts` y delega
 *   a `parseTextToQuestionnaire`.
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
import { extractDocxForParsing } from "./docx-extract";
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

/** Tope de tokens para la 1ª llamada. gpt-5-mini puede consumir muchos tokens de
 *  razonamiento interno antes de emitir el JSON; 16k era insuficiente para
 *  cuestionarios largos (finish_reason: "length" con content vacío). */
const PARSE_MAX_TOKENS = 64000;
/** Tope del reintento si la 1ª respuesta se corta por límite de tokens. */
const PARSE_MAX_TOKENS_RETRY = 100000;

interface OpenAiChoice {
  message?: { content?: string | null };
  finish_reason?: string;
}

interface OpenAiParseResult {
  content: string;
  finishReason: string | undefined;
}

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

export type ParseStage =
  | "extracting"
  | "preparing"
  | "ai"
  | "structuring"
  | "done";

export interface ParseProgressEvent {
  /** 0–100 */
  percent: number;
  stage: ParseStage;
  message: string;
}

export interface ParseOptions {
  /** Override del modelo. Default: "gpt-5-mini". */
  model?: string;
  /** Sugerencia de título; si la IA detecta uno mejor en el texto, lo respeta. */
  hintTitulo?: string;
  /** Idioma esperado (afecta sólo la metadata final, no el prompt). */
  hintIdioma?: string;
  /** País asociado al cuestionario (afecta sólo la metadata final). */
  hintPais?: string;
  /** Instrucciones de programación (texto en rojo del Word). Solo para el prompt. */
  programmerHints?: string;
  /** Progreso por etapas durante el parseo (extracción → IA → estructuración). */
  onProgress?: (event: ParseProgressEvent) => void;
  /** Interno: mapea 0–1 del sub-flujo al rango global de percent. */
  _progressRange?: { base: number; span: number };
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

  emitParseProgress(opts, 0, "preparing", "Preparando texto del cuestionario…");
  const apiKey = await getOpenaiApiKey();
  if (!apiKey) throw new MissingOpenaiApiKeyError();

  const model = opts.model ?? DEFAULT_CUESTIONARIO_MODEL;

  emitParseProgress(opts, 0.08, "preparing", "Enviando a OpenAI…");

  let result = await callOpenaiWithProgress(
    apiKey,
    model,
    text,
    opts,
    PARSE_MAX_TOKENS,
    0.75
  );

  // Reintento si la respuesta se cortó por límite (con o sin contenido parcial).
  if (result.finishReason === "length") {
    emitParseProgress(
      opts,
      0.76,
      "ai",
      "Reintentando — el cuestionario es largo…"
    );
    result = await callOpenaiWithProgress(
      apiKey,
      model,
      text,
      opts,
      PARSE_MAX_TOKENS_RETRY,
      0.88
    );
  }

  assertParseableOpenAiResult(result);

  const content = result.content;

  emitParseProgress(opts, 0.9, "structuring", "Estructurando preguntas…");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ParseError(
      `OpenAI devolvió JSON inválido: ${truncate(content, 200)}`
    );
  }
  const questionnaire = coerceQuestionnaire(parsed, opts);
  emitParseProgress(
    opts,
    1,
    "done",
    `${questionnaire.preguntas.length} preguntas detectadas`
  );
  return questionnaire;
}

/**
 * Parsea un Word (`.docx`) a un Questionnaire canónico.
 *
 * Separa texto visible e instrucciones en rojo (RU, RM, PROGRAMACIÓN, etc.)
 * antes de llamar a OpenAI. El nombre del archivo se usa como `hintTitulo`
 * por defecto si el caller no pasa uno.
 */
export async function parseDocxToQuestionnaire(
  file: File | Blob,
  opts: ParseOptions & { fileName?: string } = {}
): Promise<Questionnaire> {
  emitParseProgress(opts, 0, "extracting", "Leyendo archivo Word…");
  const arrayBuffer = await file.arrayBuffer();
  let visibleText: string;
  let programmerHints: string;
  try {
    emitParseProgress(
      opts,
      0.12,
      "extracting",
      "Extrayendo texto e instrucciones de programación…"
    );
    const extracted = await extractDocxForParsing(arrayBuffer);
    visibleText = extracted.visibleText;
    programmerHints = extracted.programmerHints;
  } catch (err) {
    throw new ParseError(
      `No se pudo leer el archivo Word: ${errorMessage(err)}`
    );
  }
  if (!visibleText.trim()) {
    throw new ParseError(
      "El Word no tiene texto extraíble. Probá pegando el contenido a mano."
    );
  }
  emitParseProgress(opts, 0.22, "extracting", "Texto extraído del Word");
  const fileName = opts.fileName ?? fileNameOf(file);
  return parseTextToQuestionnaire(visibleText, {
    ...opts,
    programmerHints: programmerHints.trim() || opts.programmerHints,
    hintTitulo: opts.hintTitulo ?? deriveTitleFromFilename(fileName),
    _progressRange: { base: 22, span: 78 },
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
  emitParseProgress(opts, 0, "extracting", "Leyendo archivo PDF…");
  const arrayBuffer = await file.arrayBuffer();
  emitParseProgress(opts, 0.1, "extracting", "Extrayendo texto del PDF…");
  const text = await extractPdfText(arrayBuffer);
  if (text.trim().length < 40) {
    throw new ParseError(
      "No se pudo extraer suficiente texto del PDF (puede estar escaneado o " +
        "tener layout complejo). Copiá el contenido y usá la opción 'Pegar texto'."
    );
  }
  emitParseProgress(opts, 0.2, "extracting", "Texto extraído del PDF");
  const fileName = opts.fileName ?? fileNameOf(file);
  return parseTextToQuestionnaire(text, {
    ...opts,
    hintTitulo: opts.hintTitulo ?? deriveTitleFromFilename(fileName),
    _progressRange: { base: 20, span: 80 },
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
- Cada pregunta tiene: { "id", "numero", "texto", "tipo", "condicion", "aleatorizar", "opciones", "flujo" } y opcionalmente "min", "max", "enunciados", "copiar_opciones_de".
- Tipos válidos (uno y sólo uno por pregunta): cerrada_unica, cerrada_multiple, escala, matriz, abierta_texto, abierta_marca, numerica, ranking, fecha, comentario.
- Usá tipo "comentario" para textos informativos, introducciones o separadores visibles al participante que no esperan respuesta.
- "id" es un identificador corto y único (ej. "P1", "F5", "A4"). Si el cuestionario no tiene IDs, generalos como "P1", "P2", ... siguiendo el orden.
- "numero" es la posición 1-based en el orden del cuestionario.
- El campo "texto" es SOLO el enunciado para el encuestado: NUNCA incluyas el código de pregunta al inicio (ej. si el doc dice "F1. Tú eres…", id="F1" y texto="Tú eres…").
- "condicion" controla si la pregunta se muestra. Formato EXCLUSIVO: "ID=codigo" o "ID=1,2,3" combinado con AND/OR (ej. "S1=3", "F5=1 OR F5=2"). PROHIBIDO usar contains, selected, includes u otro lenguaje natural. Si no podés expresarlo con códigos → "".
- "aleatorizar" es booleano: true si las opciones o frases se presentan en orden aleatorio.
- "opciones" es un array. Para cerradas/múltiples/ranking: cada opción { "codigo": <int>, "texto": <string>, "flujo": <string>, "condicion": <string[]> }. Para escalas numéricas simples (1 al 10): opciones vacías y usá min/max. Para matrices: opciones = COLUMNAS.
- "copiar_opciones_de" (opcional): ID de otra pregunta cuya lista de opciones se reutiliza. Usalo cuando las instrucciones digan "mostrar marcas según M1", "mismas opciones que M1", "mostrar según M2", etc. Dejá "opciones" vacío y seteá "copiar_opciones_de" al ID fuente (ej. "M1").
- "flujo" en opciones puede ser "", "terminar" o "saltar_a <id>". "condicion" en opciones puede contener "fijar", "especificar" y/o "exclusiva".
- "flujo" a nivel pregunta: array de { "si_respuesta": <int|int[]>, "accion": "saltar_a" | "terminar" | "continuar", "destino": <id opcional> }.
- Destinos de "saltar_a" (opción o pregunta): SOLO IDs de preguntas que existen en el cuestionario. Si la instrucción salta a una etiqueta de programación (ej. "PUESTO_ESPECIFICAR", "..._ESPECIFICAR", "..._otros") que NO es un ID de pregunta real del cuestionario, NO uses flujo — dejá flujo "" en la opción.
- Opciones "Otros" / "Otras, ¿cuáles?" / RA (respuesta abierta asociada): NUNCA crear una pregunta separada (abierta_texto u otra) para capturar el especificar. Esas van SOLO como opción de la pregunta padre con condicion ["especificar"]. PROHIBIDO ids tipo "F5_otros", "P5_otros_consumo" u otras preguntas satélite.
- "min" y "max" SÓLO para tipo "escala" o "numerica" (ej. escala 1-10 → min=1, max=10, opciones=[]).
- "enunciados" SÓLO para tipo "matriz": filas de la matriz (misma forma que opción). Las COLUMNAS van en "opciones".
- Ejemplo matriz P8: enunciados=[filas/frases], opciones=[columnas/marcas con codigo y texto].
- "secciones" es un array opcional: { "nombre": <string>, "preguntas": <string[]> } con ids de preguntas.

Preguntas tipo "pares" / elección forzada (RU POR FRASE, tablas con Par 1, Par 2…):
- Cada fila "Par N" del documento = una pregunta cerrada_unica separada con su propio id (ej. A1_1, A1_2 o ids consecutivos según el doc).
- "texto" = el enunciado introductorio del BLOQUE (ej. "Lee cada par de declaraciones y decidí con cuál estás más de acuerdo"), NUNCA "Par 1" ni "Par 2".
- Las dos frases del par van en "opciones" (codigo 1 y 2), una por opción. NO concatenar las frases en "texto".
- Si dice ROTAR FRASES → aleatorizar: true.

Convenciones Word Mega (siglas — NO van en "texto", usalas para inferir estructura):
- RU / Respuesta única → cerrada_unica
- RM / Respuesta múltiple → cerrada_multiple
- ROTAR / Rotar frases / Rotar opciones → aleatorizar: true
- RA → opción con condicion ["especificar"]; ANCLAR → ["fijar"]; EXCLUSIVA → ["exclusiva"]
- FINALIZAR / TERMINAR en flujo de opción → flujo "terminar"
- CONTINUAR → flujo "" o accion "continuar"

Instrucciones de programación (PROGRAMACIÓN:, PROGRAMADOR:, cuotas, syntax, rutas de archivo):
- NO copiar ese texto a enunciados ni opciones.
- Omitilas del array preguntas, o marcá tipo "comentario" solo si es intro visible al participante (ej. "INTRODUCCIÓN: A continuación…" sin ser instrucción interna).

- Si no podés determinar algo, usá strings vacíos / arrays vacíos / false. NUNCA inventes opciones ni preguntas.
- Sé fiel al texto original visible: no parafrasees enunciados ni reordenes preguntas.
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

  const programmerBlock = opts.programmerHints?.trim()
    ? `\nINSTRUCCIONES DE PROGRAMACIÓN (texto en rojo — NO copiar a enunciados ni opciones; usá solo para inferir tipo, aleatorizar, condicion, flujo y tags de opción):\n${opts.programmerHints.trim()}\n`
    : "";

  return (
    `Estructurá el siguiente cuestionario al JSON canónico descripto en el sistema.${hintBlock}` +
    `\nTEXTO DEL CUESTIONARIO (solo esto va al encuestado):\n${text}` +
    programmerBlock
  );
}

// ---------------------------------------------------------------------------
// Coerción / validación de la respuesta de la IA
// ---------------------------------------------------------------------------

/** Pregunta durante coerción; `copiarOpcionesDe` es transitorio (solo en parseo). */
type QuestionDraft = Question & { copiarOpcionesDe?: string };

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
  const drafts: QuestionDraft[] = preguntasRaw
    .map((p, i) => coerceQuestion(p, i))
    .filter((p): p is QuestionDraft => p !== null);

  if (drafts.length === 0) {
    throw new ParseError(
      "La IA no devolvió preguntas reconocibles. Probá con un texto más estructurado o cargalas a mano."
    );
  }

  resolveCopiedOptions(drafts);
  const removedIds = removeSpecifyFollowUpQuestions(drafts);
  stripInvalidFlowDestinations(drafts);
  renumberQuestions(drafts);

  const preguntas: Question[] = drafts.map(({ copiarOpcionesDe: _c, ...q }) => q);

  const secciones = (Array.isArray(raw.secciones)
    ? raw.secciones
        .map(coerceSection)
        .filter((s): s is Section => s !== null)
    : []
  ).map((s) => ({
    ...s,
    preguntas: s.preguntas.filter((id) => !removedIds.has(id)),
  }));

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

function coerceQuestion(raw: unknown, index: number): QuestionDraft | null {
  if (!isRecord(raw)) return null;
  const tipo = asQuestionType(raw.tipo);
  if (!tipo) return null;
  let texto = asString(raw.texto).trim();
  if (!texto) return null;

  const id = asString(raw.id).trim() || `P${index + 1}`;
  texto = stripPairLabel(stripQuestionCodePrefix(texto, id));

  const opciones = Array.isArray(raw.opciones)
    ? raw.opciones
        .map(coerceOption)
        .filter((o): o is QuestionOption => o !== null)
    : [];
  const flujo = Array.isArray(raw.flujo)
    ? raw.flujo.map(coerceFlow).filter((f): f is FlowRule => f !== null)
    : [];

  const copiarOpcionesDe = asString(raw.copiar_opciones_de).trim() || undefined;

  const q: QuestionDraft = {
    id,
    numero: asInt(raw.numero) ?? index + 1,
    texto,
    tipo,
    condicion: sanitizeCondition(asString(raw.condicion)),
    aleatorizar: raw.aleatorizar === true,
    opciones,
    flujo,
    copiarOpcionesDe,
  };

  if (tipo === "escala" || tipo === "numerica") {
    const minRaw = asInt(raw.min);
    const maxRaw = asInt(raw.max);
    const inferred = inferScaleRange(
      texto,
      minRaw ?? undefined,
      maxRaw ?? undefined
    );
    if (inferred.min !== undefined) q.min = inferred.min;
    if (inferred.max !== undefined) q.max = inferred.max;
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
// Post-procesado de la respuesta de la IA
// ---------------------------------------------------------------------------

/** Quita el prefijo de código del enunciado si la IA lo duplicó (ej. "P9. …"). */
function stripQuestionCodePrefix(texto: string, id: string): string {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return texto.replace(new RegExp(`^${escaped}\\.?\\s*`, "i"), "").trim();
}

/** Quita etiquetas residuales "Par N" que la IA a veces pone como enunciado. */
function stripPairLabel(texto: string): string {
  return texto.replace(/^Par\s*\d+\.?\s*/i, "").trim();
}

/**
 * Clona opciones de preguntas fuente cuando la IA seteó `copiar_opciones_de`
 * (ej. M2–M8 reutilizan la lista de M1).
 */
function resolveCopiedOptions(preguntas: QuestionDraft[]): void {
  const byId = new Map(preguntas.map((p) => [p.id, p]));

  for (const p of preguntas) {
    if (p.opciones.length > 0 || !p.copiarOpcionesDe) continue;
    const source = byId.get(p.copiarOpcionesDe);
    if (!source || source.opciones.length === 0) continue;
    p.opciones = cloneOptions(source.opciones);
  }
}

/** Copia superficial de opciones (sin compartir referencias mutables). */
function cloneOptions(opts: QuestionOption[]): QuestionOption[] {
  return opts.map((o) => ({
    codigo: o.codigo,
    texto: o.texto,
    flujo: o.flujo,
    condicion: [...o.condicion],
  }));
}

/**
 * Elimina preguntas satélite que la IA inventa para "Otros"/especificar (ej.
 * P5_otros_consumo, F6_otros). Esas capturas van en la opción padre con
 * condicion ["especificar"], no como preguntas aparte — si no, se publican a QP.
 */
function removeSpecifyFollowUpQuestions(preguntas: QuestionDraft[]): Set<string> {
  const byId = new Map(preguntas.map((p) => [p.id, p]));
  const toRemove = new Set<string>();

  for (const p of preguntas) {
    if (!isSpecifyFollowUpQuestion(p)) continue;
    toRemove.add(p.id);

    const ref = parseSimpleCondition(p.condicion);
    if (ref) {
      const parent = byId.get(ref.parentId);
      if (parent) ensureOptionSpecifyTag(parent, ref.code);
    }
  }

  if (toRemove.size === 0) return toRemove;

  preguntas.splice(
    0,
    preguntas.length,
    ...preguntas.filter((p) => !toRemove.has(p.id))
  );
  return toRemove;
}

/** Detecta preguntas "Otros, ¿cuáles?" que no deberían existir como ítems aparte. */
function isSpecifyFollowUpQuestion(p: QuestionDraft): boolean {
  if (/_otros|_especificar/i.test(p.id)) return true;

  if (p.tipo !== "abierta_texto" && p.tipo !== "abierta_marca") return false;
  if (!p.condicion.trim()) return false;

  const t = p.texto.trim();
  if (/^(otros?|otras?)\b/i.test(t)) return true;
  if (/^otros?[,\s].*¿cu[aá]l/i.test(t)) return true;
  if (/^¿cu[aá]les?\??$/i.test(t)) return true;

  return false;
}

/** Parsea condiciones simples "F5=97" (sin AND/OR). */
function parseSimpleCondition(
  cond: string
): { parentId: string; code: number } | null {
  const m = cond.trim().match(/^([A-Za-z][A-Za-z0-9_]*)=(\d+)$/);
  if (!m) return null;
  return { parentId: m[1], code: parseInt(m[2], 10) };
}

/** Marca la opción padre como especificar y limpia saltos de flujo innecesarios. */
function ensureOptionSpecifyTag(parent: QuestionDraft, code: number): void {
  const opt = parent.opciones.find((o) => o.codigo === code);
  if (!opt) return;
  if (!opt.condicion.includes("especificar")) {
    opt.condicion = [...opt.condicion, "especificar"];
  }
  if (parseSaltarAFromOptionFlujo(opt.flujo)) {
    opt.flujo = "";
  }
}

/** Renumera preguntas 1-based tras eliminar satélites. */
function renumberQuestions(preguntas: QuestionDraft[]): void {
  preguntas.forEach((p, i) => {
    p.numero = i + 1;
  });
}

/**
 * Descarta saltos a destinos que no son IDs de pregunta (ej. PUESTO_ESPECIFICAR).
 * El flujo no se publica a QP hoy; evita errores falsos en validación.
 */
function stripInvalidFlowDestinations(preguntas: QuestionDraft[]): void {
  const ids = new Set(preguntas.map((p) => p.id));

  for (const p of preguntas) {
    p.flujo = p.flujo.filter((rule) => {
      if (rule.accion !== "saltar_a") return true;
      const dest = (rule.destino ?? "").trim();
      return dest.length > 0 && ids.has(dest);
    });

    for (const opt of p.opciones) {
      const dest = parseSaltarAFromOptionFlujo(opt.flujo);
      if (dest && !ids.has(dest)) {
        opt.flujo = "";
      }
    }
  }
}

/** Si `opt.flujo` arranca con "saltar_a", devuelve el id destino limpio. */
function parseSaltarAFromOptionFlujo(flujo: string): string | null {
  const m = flujo.trim().match(/^saltar_a\s+([A-Za-z0-9_]+)$/i);
  return m ? m[1] : null;
}

/**
 * Normaliza condiciones: solo IDs y códigos. Descarta lenguaje natural
 * (contains, selected, etc.) que no se publica a QP pero genera falsos errores.
 */
function sanitizeCondition(cond: string): string {
  const c = cond.trim();
  if (!c) return "";
  const lower = c.toLowerCase();
  if (
    /\b(contains|selected|includes|include|equals|equal|not\s+equal)\b/.test(
      lower
    )
  ) {
    return "";
  }
  if (!c.includes("=")) return "";
  return c;
}

/** Infiere min/max de escalas cuando el enunciado lo dice pero la IA no los seteó. */
function inferScaleRange(
  texto: string,
  min?: number,
  max?: number
): { min?: number; max?: number } {
  if (min !== undefined && max !== undefined) return { min, max };
  const m = texto.match(
    /(?:escala|del)\s*(?:del\s*)?(\d+)\s*(?:al|a|-)\s*(\d+)/i
  );
  if (m) {
    return {
      min: min ?? parseInt(m[1], 10),
      max: max ?? parseInt(m[2], 10),
    };
  }
  return { min, max };
}

// ---------------------------------------------------------------------------
// OpenAI — llamada con reintento ante corte por límite de tokens
// ---------------------------------------------------------------------------

/** Emite progreso mapeando una fracción local (0–1) al rango global del parseo. */
function emitParseProgress(
  opts: ParseOptions,
  fraction: number,
  stage: ParseStage,
  message: string
): void {
  if (!opts.onProgress) return;
  const base = opts._progressRange?.base ?? 0;
  const span = opts._progressRange?.span ?? 100;
  const percent = Math.min(100, Math.round(base + fraction * span));
  opts.onProgress({ percent, stage, message });
}

/**
 * Llama a OpenAI avanzando el percent de forma gradual mientras espera respuesta.
 * La IA no streamea JSON parcial hoy; el creep da feedback honesto de "en curso".
 */
async function callOpenaiWithProgress(
  apiKey: string,
  model: string,
  text: string,
  opts: ParseOptions,
  maxTokens: number,
  maxFraction: number
): Promise<OpenAiParseResult> {
  let creep = 0.12;
  const timer = opts.onProgress
    ? setInterval(() => {
        creep = Math.min(maxFraction, creep + 0.025);
        emitParseProgress(
          opts,
          creep,
          "ai",
          "La IA está estructurando el cuestionario…"
        );
      }, 900)
    : null;

  try {
    return await callOpenai(apiKey, model, text, opts, maxTokens);
  } finally {
    if (timer) clearInterval(timer);
  }
}

/**
 * Llama a /v1/chat/completions para estructurar el cuestionario.
 * Devuelve content y finish_reason; no parsea el JSON.
 */
async function callOpenai(
  apiKey: string,
  model: string,
  text: string,
  opts: ParseOptions,
  maxTokens: number
): Promise<OpenAiParseResult> {
  const body = {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(text, opts) },
    ],
    response_format: { type: "json_object" },
    reasoning_effort: "minimal",
    max_completion_tokens: maxTokens,
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

  const json = (await res.json()) as { choices?: OpenAiChoice[] };
  const choice = json.choices?.[0];
  return {
    content: choice?.message?.content?.trim() ?? "",
    finishReason: choice?.finish_reason,
  };
}

/** Valida que la respuesta del modelo sea usable antes de parsear JSON. */
function assertParseableOpenAiResult(result: OpenAiParseResult): void {
  if (result.finishReason === "length") {
    throw new ParseError(
      "El cuestionario es demasiado largo y la IA no alcanzó a terminar. " +
        "Dividilo por módulos y parsealos por separado."
    );
  }
  if (!result.content) {
    throw new ParseError("OpenAI devolvió respuesta vacía.");
  }
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

/**
 * Pasada de similaridad cross-row sobre preguntas abiertas (paso 4).
 *
 * Después del QC IA principal, este módulo:
 *   1. Identifica las columnas "abiertas" del schema (texto largo / comentario).
 *   2. Para cada pregunta abierta, calcula embeddings de los textos de cada
 *      fila (vía `text-embedding-3-small` de OpenAI).
 *   3. Encuentra pares con cosine sim > 0.85 → arma clusters por unión
 *      transitiva.
 *   4. Para cada fila que esté en un cluster con ≥ 2 miembros, devuelve los
 *      `response_id` (o `row_id` como fallback) de las otras filas del cluster.
 *
 * El motor (cleaning-job.ts) consume este output y lo persiste con
 * `updateFlagSimilarity`, llenando `cleaning_flags.similar_response_ids`.
 *
 * Notas:
 *   - Sólo se computan embeddings para filas con flag (red/yellow). Para una
 *     base de N filas y K flagueadas, evita gastar embeddings en filas que
 *     nunca van a aparecer en el review.
 *   - El embedding endpoint acepta hasta 2048 inputs por request; batchear
 *     en chunks de 256 para no acercarse a límites de tokens (~8k tokens por
 *     request es seguro).
 *   - Si OpenAI falla, se devuelve un mapa vacío y el job sigue (la
 *     similaridad es best-effort, no bloqueante).
 */

import type { CleaningRow, SchemaColumn, VersionSchema } from "./types";

const OPENAI_EMBEDDINGS_ENDPOINT = "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-small";
const SIMILARITY_THRESHOLD = 0.85;
const MIN_TEXT_LENGTH = 15;
const MAX_BATCH_SIZE = 256;

export interface DetectSimilarRowsInput {
  rows: CleaningRow[];
  schema: VersionSchema;
  apiKey: string;
  /** Solo computar para filas cuyos `id` están en este Set (las flagueadas). */
  flaggedRowIds: Set<string>;
  /** Logger opcional. */
  onLog?: (level: "info" | "warn" | "error", message: string) => void;
}

export interface DetectSimilarRowsResult {
  /** Map de row_id → response_ids (o row_ids si no había response_id) similares. */
  rowToSimilar: Map<string, string[]>;
  /** Cantidad de columnas abiertas procesadas. */
  openColumnsProcessed: number;
  /** Cuántos pares cruzaron el umbral en total. */
  totalSimilarPairs: number;
  /** True si OpenAI falló y se devolvió mapa vacío. */
  skipped: boolean;
  skipReason?: string;
}

/**
 * Punto de entrada. Si no hay filas flagueadas o no hay columnas abiertas,
 * devuelve un mapa vacío sin llamar a OpenAI.
 */
export async function detectSimilarRows(
  input: DetectSimilarRowsInput
): Promise<DetectSimilarRowsResult> {
  const { rows, schema, apiKey, flaggedRowIds, onLog } = input;
  const log = onLog ?? defaultLogger;

  const empty: DetectSimilarRowsResult = {
    rowToSimilar: new Map(),
    openColumnsProcessed: 0,
    totalSimilarPairs: 0,
    skipped: false,
  };

  if (flaggedRowIds.size === 0) {
    log("info", "Similarity: no flagged rows; skipping embeddings.");
    return empty;
  }

  const openCols = schema.columns.filter(isOpenColumn);
  if (openCols.length === 0) {
    log("info", "Similarity: no open-ended columns detected; skipping.");
    return empty;
  }

  const flaggedRows = rows.filter((r) => flaggedRowIds.has(r.id));
  log(
    "info",
    `Similarity: ${flaggedRows.length} flagged rows × ${openCols.length} open columns`
  );

  // Acumulador por fila: ids de otras filas similares (Set para dedupe).
  const rowToSimilar = new Map<string, Set<string>>();
  let totalPairs = 0;

  try {
    for (const col of openCols) {
      const items = flaggedRows
        .map((r) => ({
          row: r,
          text: stringValue(r.data[col.id]),
        }))
        .filter((x) => x.text.length >= MIN_TEXT_LENGTH);

      if (items.length < 2) continue;

      const texts = items.map((x) => x.text);
      const embeddings = await embedTexts(texts, apiKey);

      // Pairwise: O(n²) sobre items de esta columna. Manejable para N<2000.
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const sim = cosineSimilarity(embeddings[i], embeddings[j]);
          if (sim < SIMILARITY_THRESHOLD) continue;

          totalPairs++;
          const a = items[i].row;
          const b = items[j].row;
          const aId = identifierFor(a);
          const bId = identifierFor(b);

          getOrCreateSet(rowToSimilar, a.id).add(bId);
          getOrCreateSet(rowToSimilar, b.id).add(aId);
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("warn", `Similarity: embeddings failed, skipping: ${msg}`);
    return { ...empty, skipped: true, skipReason: msg };
  }

  // Map<rowId, Set> → Map<rowId, string[]>
  const out = new Map<string, string[]>();
  for (const [rowId, set] of rowToSimilar) {
    out.set(rowId, [...set]);
  }

  log(
    "info",
    `Similarity: ${out.size} rows enriched with ${totalPairs} similar pairs`
  );

  return {
    rowToSimilar: out,
    openColumnsProcessed: openCols.length,
    totalSimilarPairs: totalPairs,
    skipped: false,
  };
}

// ---------- helpers ----------

function isOpenColumn(c: SchemaColumn): boolean {
  if (c.is_metadata) return false;
  if (String(c.id).startsWith("META_")) return false;

  const t = (c.qp_question_type || "").toLowerCase();
  if (/text|essay|comment|open|nps_comment|multi_text|long|textarea/i.test(t))
    return true;

  // Fallback heurístico para Qualtrics / cuando no hay qp_question_type:
  // texto del header con palabras típicas de pregunta abierta.
  const q = (c.question || "").toLowerCase();
  return /\bcomentario|expl[íi]ca|explique|describe|describa|opina|opine|por\s+qu[ée]|porque|cu[ée]ntenos/i.test(
    q
  );
}

function stringValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Prefiere `response_id` (más estable y útil al sincronizar a QP); si no, usa el row_id. */
function identifierFor(row: CleaningRow): string {
  return row.response_id?.trim() || row.id;
}

function getOrCreateSet<K, V>(map: Map<K, Set<V>>, key: K): Set<V> {
  let s = map.get(key);
  if (!s) {
    s = new Set<V>();
    map.set(key, s);
  }
  return s;
}

interface EmbeddingResponse {
  data?: Array<{ embedding?: number[] }>;
}

/**
 * Pide embeddings a OpenAI en batches. Usa el modelo `text-embedding-3-small`
 * (dim 1536) que es más barato que `-large` y suficiente para detectar
 * copy-paste / paráfrasis en respuestas abiertas.
 */
async function embedTexts(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  const out: number[][] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const res = await fetch(OPENAI_EMBEDDINGS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch }),
    });

    if (!res.ok) {
      const text = await safeText(res);
      throw new Error(`Embeddings HTTP ${res.status}: ${truncate(text, 200)}`);
    }

    const json = (await res.json()) as EmbeddingResponse;
    const embeddings = json.data?.map((d) => d.embedding ?? []) ?? [];
    if (embeddings.length !== batch.length) {
      throw new Error(
        `Embeddings: expected ${batch.length} vectors, got ${embeddings.length}`
      );
    }
    out.push(...embeddings);
  }

  return out;
}

/** Cosine similarity asumiendo vectores no-nulos. */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
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
  fn(`[similarity] ${message}`);
}

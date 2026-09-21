/**
 * Normalización del schema de QuestionPro (post-parser, pre-enrich).
 *
 * El export de QP — sobre todo el RAW ("Datos sin procesar") — trae, antes de
 * las preguntas reales, un montón de columnas que NO son preguntas:
 *   - "Variable personalizada N" (slots genéricos, suelen venir vacíos),
 *   - variables embebidas / de muestreo (ID, ORIGEN, LINK, NSE_puntaje, FILTRO,
 *     EDAD, …),
 *   - campos de sistema (Seq. Número, Referencia externa, Peso, Correo, Región…).
 *
 * El parser de Rust las numera `Q1..Qn` igual que a las preguntas, así que la
 * IA terminaba analizándolas (y, peor, el enrich de QP matchea por nombre y le
 * gana a las preguntas reales — ver `selectPromptColumns`). Este normalizador
 * las detecta y las marca `is_metadata: true` + `is_custom_var: true`, de modo
 * que:
 *   - quedan fuera del prompt de IA y del heatmap/stats,
 *   - el enrich (`matchExcelColumnsToQuestionpro`) las saltea,
 *   - PERO siguen en el schema: aparecen en el autocompletado `@` y, si una
 *     regla activa las referencia, `selectPromptColumns` las vuelve a incluir.
 *
 * Las preguntas reales del RAW vienen con prefijo `"<n> - "` (ej.
 * `"42 - P2 - Lysol"`); se lo strippeamos para el label y re-numeramos los ids
 * `Q1..Qm` sólo sobre ellas, así el numerado vuelve a tener sentido. En el
 * formato "limpio" (sin ese prefijo) no se toca el numerado: sólo se saltean
 * las genéricas/sistema.
 *
 * Sólo aplica a QuestionPro. Qualtrics tiene otra estructura y no pasa por acá.
 */

import { normalizeQuestionproMatchText } from "@/lib/questionpro";
import type { SchemaColumn, VersionSchema } from "./types";

/** Prefijo de las preguntas reales en el export RAW: "12 - ...". */
const RAW_QUESTION_PREFIX = /^\s*\d+\s*[-–]\s*/;
/** Slots genéricos de variable personalizada: "Variable personalizada 12". */
const GENERIC_CUSTOM_VAR = /^variable\s+personalizada\s+\d+\s*$/i;

/**
 * Campos de sistema de QP que no son metadata estándar (esa ya la marca el
 * parser) ni preguntas. Comparados por texto normalizado (sin acentos, lower).
 */
const QP_SYSTEM_FIELDS: ReadonlySet<string> = new Set(
  [
    "Seq. Número",
    "Seq. Numero",
    "Número de secuencia",
    "Referencia externa",
    "Peso",
    "Correo electrónico del encuestado",
    "Lista de correo",
    "Código de país",
    "Región",
  ].map((s) => normalizeQuestionproMatchText(s))
);

export interface NormalizeResult {
  schema: VersionSchema;
  /** Cantidad de columnas marcadas como variable custom (no-pregunta). */
  customVarCount: number;
  /** True si se detectó el layout RAW (preguntas con prefijo "N - "). */
  rawDetected: boolean;
}

/**
 * Devuelve true si la columna (ya no-metadata) es una variable custom y NO una
 * pregunta. En RAW, "pregunta" = tiene el prefijo `N - `; todo lo demás es
 * custom. En limpio, sólo las genéricas / campos de sistema.
 */
function isCustomVariable(col: SchemaColumn, rawDetected: boolean): boolean {
  const q = (col.question ?? "").trim();
  if (GENERIC_CUSTOM_VAR.test(q)) return true;
  if (QP_SYSTEM_FIELDS.has(normalizeQuestionproMatchText(q))) return true;
  if (rawDetected && !RAW_QUESTION_PREFIX.test(q)) return true;
  return false;
}

/** Sanitiza un header a un id usable (`@MENTION`), único contra `used`. */
function customVarId(header: string, used: Set<string>): string {
  const base =
    header
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toUpperCase() || "VAR";
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}_${n++}`;
  used.add(id);
  return id;
}

/**
 * Clasifica las columnas de un schema QP: marca variables custom, strippea el
 * prefijo `N - ` de las preguntas reales y re-numera `Q1..Qm` (sólo en RAW).
 * Preserva `index` (lo necesita el import de Rust) y deja intactas las columnas
 * metadata estándar.
 */
export function normalizeQuestionproSchema(
  schema: VersionSchema
): NormalizeResult {
  const cols = schema.columns;
  const prefixCount = cols.filter(
    (c) => !c.is_metadata && RAW_QUESTION_PREFIX.test((c.question ?? "").trim())
  ).length;
  // Umbral conservador: con 3+ columnas prefijadas asumimos export RAW. Evita
  // que una única pregunta que casualmente empiece con "1 - " dispare el modo.
  const rawDetected = prefixCount >= 3;

  const usedIds = new Set<string>();
  // Reservamos los ids de metadata existentes para no colisionar.
  for (const c of cols) if (c.is_metadata) usedIds.add(c.id);

  let customVarCount = 0;
  let questionCounter = 0;

  const out: SchemaColumn[] = cols.map((col) => {
    if (col.is_metadata) return col; // metadata estándar intacta

    if (isCustomVariable(col, rawDetected)) {
      customVarCount++;
      const id = customVarId(col.question || col.id, usedIds);
      return {
        ...col,
        id,
        is_metadata: true,
        is_custom_var: true,
      };
    }

    // Pregunta real. En RAW el id posicional de Rust cuenta las columnas custom
    // y queda corrido (la 1ra pregunta real cae en Q190+); renumeramos Q1..Qm
    // sólo sobre preguntas reales para que el numerado tenga sentido. NO
    // tocamos `question`: el header original es lo que va al export (fidelidad
    // del entregable) y es un label inequívoco para la IA/heatmap.
    questionCounter++;
    if (rawDetected) {
      const id = `Q${questionCounter}`;
      usedIds.add(id);
      return { ...col, id };
    }
    return col;
  });

  return {
    schema: { columns: out },
    customVarCount,
    rawDetected,
  };
}

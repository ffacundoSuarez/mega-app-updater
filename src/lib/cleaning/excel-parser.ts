/**
 * Parser del Excel de respuestas para el Limpiador (etapa 2.B).
 *
 * Bifurca según el `source` del proyecto:
 *
 *   - Qualtrics:
 *       fila 1 = IDs de columnas (Q1, Q2, ResponseId, …)
 *       fila 2 = textos de pregunta
 *       fila 3+ = datos
 *
 *   - QuestionPro:
 *       fila 1 = headers (los primeros 7 son metadata estándar exportada por
 *                QP — ID Respuesta, Fecha y Hora, …)
 *       fila 2+ = datos
 *       Como QP no exporta IDs de columna, generamos sintéticos:
 *       `META_*` para metadata y `Q1`, `Q2`, … para preguntas.
 *
 * Devuelve `{ filename, schema, rows, totalRows, preview }` listo para
 * mostrar en la UI y persistir en Supabase.
 *
 * El parsing corre en el WebView (xlsx-js-style soporta Uint8Array). Para
 * archivos enormes que el WebView no aguante, en F3 podríamos delegar la
 * lectura del FS a Rust y devolver bytes a TS — la lógica de parsing se queda
 * en TS.
 */

import * as XLSX from "xlsx-js-style";
import { getQuestionProExcelMetadataColumns } from "@/lib/questionpro";
import type { CleaningProjectSource, SchemaColumn, VersionSchema } from "./types";

/** Resultado del parser, listo para ofrecer al usuario y persistir luego. */
export interface ParsedExcel {
  filename: string;
  schema: VersionSchema;
  rows: ParsedRow[];
  totalRows: number;
  preview: {
    /** Hasta 5 ids de columna para encabezar la tabla de preview. */
    headers: string[];
    /** Hasta 3 filas de muestra, sólo con esos 5 ids. */
    sampleRows: Array<Record<string, unknown>>;
  };
}

export interface ParsedRow {
  row_number: number;
  response_id?: string;
  data: Record<string, unknown>;
}

/** Cada celda viene como string/number/boolean/null tras `sheet_to_json({header:1})`. */
type RawCell = string | number | boolean | null;
type RawSheet = RawCell[][];

/**
 * Punto de entrada. Lee el archivo (xlsx/xls), bifurca según `source` y
 * devuelve el parse listo para enriquecer (QP) o persistir directamente
 * (Qualtrics).
 */
export async function parseExcel(
  file: File,
  source: CleaningProjectSource
): Promise<ParsedExcel> {
  const buffer = await file.arrayBuffer();
  const raw = new Uint8Array(buffer);

  const workbook = XLSX.read(raw, {
    type: "array",
    cellStyles: false,
    cellFormula: false,
    cellDates: false,
    cellNF: false,
    sheetStubs: false,
  });

  const worksheetName = workbook.SheetNames[0];
  if (!worksheetName) {
    throw new Error("El archivo no tiene hojas. ¿Está vacío o corrupto?");
  }
  const worksheet = workbook.Sheets[worksheetName];
  const jsonData = XLSX.utils.sheet_to_json<RawCell[]>(worksheet, {
    header: 1,
  }) as RawSheet;

  return source === "questionpro"
    ? parseQuestionProSheet(jsonData, file.name)
    : parseQualtricsSheet(jsonData, file.name);
}

/** Parser Qualtrics: 3 filas estándar (IDs, textos, datos). */
export function parseQualtricsSheet(
  jsonData: RawSheet,
  filename: string
): ParsedExcel {
  if (jsonData.length < 3) {
    throw new Error(
      "El archivo debe tener al menos 3 filas (IDs, textos de pregunta y " +
        "datos). Si exportaste desde QuestionPro, el origen del proyecto debe " +
        "ser QuestionPro."
    );
  }

  const columnIds = jsonData[0] ?? [];
  const questionTexts = jsonData[1] ?? [];
  const dataRows = jsonData.slice(2);

  const schema: VersionSchema = {
    columns: columnIds
      .map<SchemaColumn>((id, index) => ({
        index,
        id: String(id ?? `COL_${index}`).trim(),
        question: String(questionTexts[index] ?? "").trim(),
      }))
      .filter((col) => col.id.length > 0),
  };

  const responseIdIndex = schema.columns.findIndex((col) =>
    col.id.toUpperCase().includes("RESPONSEID")
  );

  const rows = dataRows.map<ParsedRow>((row, rowIndex) => {
    const data: Record<string, unknown> = {};
    schema.columns.forEach((col) => {
      data[col.id] = row[col.index] ?? null;
    });
    return {
      row_number: rowIndex + 1,
      response_id:
        responseIdIndex >= 0
          ? String(row[responseIdIndex] ?? "")
          : undefined,
      data,
    };
  });

  return finalize(filename, schema, rows);
}

/**
 * Normaliza un header para compararlo de forma tolerante: saca acentos, pasa a
 * minúsculas, colapsa espacios y recorta. Así "País" == "Pais", "ID Respuesta"
 * == "id  respuesta", etc.
 */
function normalizeHeader(value: RawCell): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Alias aceptados (ya normalizados) para cada columna de metadata estándar de
 * QP, indexados por su `columnId`. Permite reconocer la metadata aunque venga
 * con otra grafía/acento u otro orden, e incluye las etiquetas del export crudo
 * de QP por si llegan así.
 */
const QP_METADATA_ALIASES: Record<string, string[]> = {
  META_ID_RESPUESTA: ["id respuesta", "id de respuesta", "response id", "responseid"],
  META_FECHA_HORA: [
    "fecha y hora",
    "fecha",
    "marca de tiempo",
    "marca de tiempo (mm/dd/yyyy)",
    "timestamp",
  ],
  META_MINUTOS: [
    "minutos",
    "tiempo necesario para completar (segundos)",
    "tiempo necesario para completar",
    "timetaken",
  ],
  META_ESTADO: ["estado", "estado de respuesta", "responsestatus"],
  META_IP: ["ip", "direccion ip", "ip address", "ipaddress"],
  META_DUPLICADO: ["duplicado", "duplicar", "duplicate"],
  META_PAIS: ["pais", "country"],
};

/**
 * Parser QuestionPro: 1 fila de headers + datos.
 *
 * Tolerante (F2a): detecta las columnas de metadata estándar por alias
 * normalizado (acentos/mayúsculas/espacios) en cualquier posición, sin exigir
 * que estén las 7 ni en un orden fijo. El resto de columnas se tratan como
 * preguntas (`Q1`, `Q2`, …) en su orden de aparición. Así acepta el formato
 * limpio venga o no de Automatizaciones, sin romper por "Pais" vs "País".
 *
 * Nota: el export *crudo* de QP (hoja "Datos sin procesar") no se lee acá — es
 * demasiado grande para el lector JS (límite de string de V8) y se maneja en el
 * lector Rust/calamine (F3).
 */
export function parseQuestionProSheet(
  jsonData: RawSheet,
  filename: string
): ParsedExcel {
  if (jsonData.length < 2) {
    throw new Error(
      "El archivo debe tener encabezados y al menos una fila de datos."
    );
  }

  const metaDef = getQuestionProExcelMetadataColumns();
  const labelByColumnId = new Map(metaDef.map((m) => [m.columnId, m.label]));

  // alias normalizado -> { columnId, label }
  const aliasToMeta = new Map<string, { columnId: string; label: string }>();
  for (const [columnId, aliases] of Object.entries(QP_METADATA_ALIASES)) {
    for (const alias of aliases) {
      aliasToMeta.set(alias, {
        columnId,
        label: labelByColumnId.get(columnId) ?? alias,
      });
    }
  }

  const headerRow = jsonData[0] ?? [];
  const dataRows = jsonData.slice(1);
  const schema: VersionSchema = { columns: [] };

  const assignedMeta = new Set<string>();
  let questionCounter = 0;
  let responseIdIndex = -1;

  headerRow.forEach((cell, index) => {
    const norm = normalizeHeader(cell);
    const meta = norm ? aliasToMeta.get(norm) : undefined;

    // Cada metadata se asigna una sola vez (la primera coincidencia).
    if (meta && !assignedMeta.has(meta.columnId)) {
      assignedMeta.add(meta.columnId);
      schema.columns.push({
        index,
        id: meta.columnId,
        question: meta.label,
        is_metadata: true,
      });
      if (meta.columnId === "META_ID_RESPUESTA") responseIdIndex = index;
    } else {
      questionCounter++;
      const headerText = String(cell ?? "").trim();
      schema.columns.push({
        index,
        id: `Q${questionCounter}`,
        question: headerText || `Q${questionCounter}`,
        is_metadata: false,
      });
    }
  });

  // Si no detectamos "ID Respuesta", caemos a la primera columna como id.
  if (responseIdIndex < 0) responseIdIndex = 0;

  const rows = dataRows.map<ParsedRow>((row, rowIndex) => {
    const data: Record<string, unknown> = {};
    schema.columns.forEach((col) => {
      data[col.id] = row[col.index] ?? null;
    });
    return {
      row_number: rowIndex + 1,
      response_id: String(row[responseIdIndex] ?? ""),
      data,
    };
  });

  return finalize(filename, schema, rows);
}

function finalize(
  filename: string,
  schema: VersionSchema,
  rows: ParsedRow[]
): ParsedExcel {
  const headers = schema.columns.slice(0, 5).map((c) => c.id);
  const sampleRows = rows.slice(0, 3).map((r) => {
    const sample: Record<string, unknown> = {};
    headers.forEach((h) => {
      sample[h] = r.data[h];
    });
    return sample;
  });

  return {
    filename,
    schema,
    rows,
    totalRows: rows.length,
    preview: { headers, sampleRows },
  };
}

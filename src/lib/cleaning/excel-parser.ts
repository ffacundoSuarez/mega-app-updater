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
 * Parser QuestionPro: 1 header + datos. Las primeras 7 columnas DEBEN ser la
 * metadata estándar (en el orden exacto exportado por QP). Si no coincide,
 * abortamos con error claro para que el usuario sepa que el proyecto debería
 * estar configurado como Qualtrics o que el export está mal.
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
  const headerRow = jsonData[0] ?? [];

  for (let i = 0; i < metaDef.length; i++) {
    const got = String(headerRow[i] ?? "").trim();
    if (got !== metaDef[i].label) {
      throw new Error(
        `Este Excel no parece de QuestionPro: se esperaba la columna ` +
          `"${metaDef[i].label}" en la posición ${i + 1}` +
          (got ? ` (encontrada: "${got}")` : "") +
          `. Verificá que el proyecto esté configurado como QuestionPro y ` +
          `que uses el export con las columnas estándar.`
      );
    }
  }

  const dataRows = jsonData.slice(1);
  const schema: VersionSchema = { columns: [] };

  // Metadata (columnas 0..6)
  metaDef.forEach((meta, i) => {
    schema.columns.push({
      index: i,
      id: meta.columnId,
      question: meta.label,
      is_metadata: true,
    });
  });

  // Preguntas (columnas 7..N), IDs sintéticos Q1, Q2, …
  for (let j = metaDef.length; j < headerRow.length; j++) {
    const headerText = String(headerRow[j] ?? "").trim();
    const qNum = j - metaDef.length + 1;
    schema.columns.push({
      index: j,
      id: `Q${qNum}`,
      question: headerText || `Q${qNum}`,
      is_metadata: false,
    });
  }

  // En QP el response_id vive en la columna 0 ("ID Respuesta")
  const responseIdIndex = 0;

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

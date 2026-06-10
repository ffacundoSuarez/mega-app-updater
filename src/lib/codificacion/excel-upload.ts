/**
 * Parseo de Excel para respuestas y libro de códigos (Codificación).
 */

import * as XLSX from "xlsx-js-style";
import type {
  CategoryBookRow,
  ExcelUploadData,
  SurveyPlatform,
} from "./types";

type RawCell = string | number | boolean | null;

export function displayResponse(text: string): string {
  const t = text.trim();
  if (!t) return "(vacío)";
  return t.length > 120 ? `${t.slice(0, 120)}…` : t;
}

/** Una columna candidata del Excel de QuestionPro (para que el usuario elija). */
export interface QuestionProColumnInfo {
  index: number;
  name: string;
  /** Cantidad de filas con valor no vacío en esta columna. */
  nonEmptyCount: number;
  /** Hasta 2 valores de muestra para previsualizar. */
  preview: string[];
}

/**
 * Estado intermedio para archivos de QuestionPro: como traen muchas columnas
 * (metadata + todas las preguntas), no se puede asumir cuál es la respuesta a
 * clasificar. El usuario elige la columna y recién ahí se arma `ExcelUploadData`.
 */
export interface PendingQuestionProSelection {
  filename: string;
  columns: QuestionProColumnInfo[];
  rawData: RawCell[][];
  idColumnIndex: number;
  idColumnName: string;
  totalRows: number;
}

/**
 * Resultado del parseo: `ready` cuando ya se puede usar (Qualtrics, mapeo
 * automático col1=ID/col2=texto) o `select-column` cuando hace falta que el
 * usuario elija la columna de respuesta (QuestionPro).
 */
export type ParseResponsesResult =
  | { kind: "ready"; data: ExcelUploadData }
  | { kind: "select-column"; pending: PendingQuestionProSelection };

/** Lee la primera hoja del Excel como matriz de celdas crudas. */
async function readSheetRows(file: File): Promise<RawCell[][]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("El archivo no tiene hojas");
  }
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as RawCell[][];
}

/**
 * Parsea el Excel de respuestas según la plataforma de origen.
 *
 *   - Qualtrics: col1 = ID, col2 = texto (comportamiento histórico).
 *   - QuestionPro: devuelve las columnas disponibles para que el usuario elija
 *     cuál es la respuesta abierta a clasificar (la columna ID se autodetecta).
 */
export async function parseResponsesExcel(
  file: File,
  platform: SurveyPlatform = "qualtrics"
): Promise<ParseResponsesResult> {
  const jsonData = await readSheetRows(file);

  if (jsonData.length < 2) {
    throw new Error("El archivo debe tener al menos 2 filas (encabezados + datos)");
  }

  const headers = (jsonData[0] as RawCell[]).map((h) =>
    h ? String(h).trim() : ""
  );

  if (platform === "questionpro") {
    return {
      kind: "select-column",
      pending: buildQuestionProPending(file.name, jsonData, headers),
    };
  }

  // Qualtrics: col1 = ID, col2 = respuesta.
  const nonEmptyHeaders = headers.filter((h) => h);
  if (nonEmptyHeaders.length < 2) {
    throw new Error("El archivo debe tener al menos 2 columnas (ID y Respuesta)");
  }

  const dataRows = jsonData.slice(1);
  const preview = dataRows.slice(0, 5).map((row, index) => ({
    id: String(row[0] ?? `Row_${index + 1}`),
    response: displayResponse(row[1] ? String(row[1]) : ""),
  }));

  return {
    kind: "ready",
    data: {
      filename: file.name,
      rows: dataRows.length,
      columns: nonEmptyHeaders,
      preview,
      rawData: jsonData,
      idColumnIndex: 0,
      responseColumnIndex: 1,
    },
  };
}

/**
 * Autodetecta la columna ID y arma la lista de columnas candidatas (con conteo
 * de no vacíos y preview) para que el usuario elija la respuesta a clasificar.
 */
function buildQuestionProPending(
  filename: string,
  jsonData: RawCell[][],
  headers: string[]
): PendingQuestionProSelection {
  const dataRows = jsonData.slice(1);

  let idColumnIndex = headers.findIndex((h) => {
    const n = h.toUpperCase();
    return n === "RESPONSE ID" || n === "ID RESPUESTA" || n === "ID DE RESPUESTA";
  });
  if (idColumnIndex === -1) idColumnIndex = 0;

  const columns: QuestionProColumnInfo[] = [];
  headers.forEach((header, index) => {
    if (index === idColumnIndex || !header) return;

    let nonEmptyCount = 0;
    const preview: string[] = [];
    for (const row of dataRows) {
      const val = row[index];
      if (val != null && String(val).trim()) {
        nonEmptyCount++;
        if (preview.length < 2) preview.push(displayResponse(String(val).trim()));
      }
    }

    columns.push({ index, name: header, nonEmptyCount, preview });
  });

  if (columns.length === 0) {
    throw new Error("No se encontraron columnas válidas en el archivo");
  }

  return {
    filename,
    columns,
    rawData: jsonData,
    idColumnIndex,
    idColumnName: headers[idColumnIndex] || `Columna ${idColumnIndex + 1}`,
    totalRows: dataRows.length,
  };
}

/**
 * Cierra la selección de QuestionPro: con la columna de respuesta elegida,
 * arma el `ExcelUploadData` final (ID autodetectado + respuesta elegida).
 */
export function finalizeQuestionProSelection(
  pending: PendingQuestionProSelection,
  responseColumnIndex: number
): ExcelUploadData {
  const headers = (pending.rawData[0] as RawCell[]).map((h) =>
    h ? String(h).trim() : ""
  );
  const dataRows = pending.rawData.slice(1);

  const preview = dataRows.slice(0, 5).map((row, index) => ({
    id: String(row[pending.idColumnIndex] ?? `Row_${index + 1}`),
    response: displayResponse(
      row[responseColumnIndex] ? String(row[responseColumnIndex]) : ""
    ),
  }));

  return {
    filename: pending.filename,
    rows: pending.totalRows,
    columns: headers.filter((h) => h),
    preview,
    rawData: pending.rawData,
    idColumnIndex: pending.idColumnIndex,
    responseColumnIndex,
  };
}

export async function parseCategoryBookExcel(
  file: File
): Promise<{ categories: CategoryBookRow[]; errors: string[] }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("El archivo no tiene hojas");

  const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
  }) as RawCell[][];

  if (jsonData.length < 2) {
    throw new Error("El archivo debe tener al menos 2 filas");
  }

  const categories: CategoryBookRow[] = [];
  const errors: string[] = [];
  const usedIds = new Set<number>();
  const usedNames = new Set<string>();

  const dataRows = jsonData
    .slice(1)
    .map((row, idx) => ({ row, originalRowNumber: idx + 2 }))
    .filter(({ row }) =>
      row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "")
    );

  for (const { row, originalRowNumber } of dataRows) {
    const cells = row.map((c) =>
      c === null || c === undefined ? "" : String(c).trim()
    );

    let idIdx = -1;
    let parsedId: number | null = null;
    for (let i = 0; i < cells.length; i++) {
      const num = Number(cells[i]);
      if (Number.isInteger(num) && num > 0) {
        idIdx = i;
        parsedId = num;
        break;
      }
    }

    let nameIdx = -1;
    for (let i = 0; i < cells.length; i++) {
      if (i === idIdx) continue;
      if (cells[i] !== "") {
        nameIdx = i;
        break;
      }
    }

    let descriptionIdx = -1;
    for (let i = 0; i < cells.length; i++) {
      if (i === idIdx || i === nameIdx) continue;
      if (cells[i] !== "") {
        descriptionIdx = i;
        break;
      }
    }

    const name = nameIdx >= 0 ? cells[nameIdx] : "";
    if (!name) {
      errors.push(`Fila ${originalRowNumber}: Nombre de categoría vacío`);
      continue;
    }
    if (parsedId === null) {
      errors.push(`Fila ${originalRowNumber}: ID de categoría vacío`);
      continue;
    }
    if (usedIds.has(parsedId)) {
      errors.push(`Fila ${originalRowNumber}: ID ${parsedId} ya existe`);
      continue;
    }
    if (usedNames.has(name.toLowerCase())) {
      errors.push(`Fila ${originalRowNumber}: Categoría "${name}" ya existe`);
      continue;
    }

    usedIds.add(parsedId);
    usedNames.add(name.toLowerCase());
    categories.push({
      id: parsedId,
      name,
      description: descriptionIdx >= 0 ? cells[descriptionIdx] : undefined,
    });
  }

  categories.sort((a, b) => a.id - b.id);
  return { categories, errors };
}

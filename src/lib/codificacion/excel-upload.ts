/**
 * Parseo de Excel para respuestas y libro de códigos (Codificación).
 */

import * as XLSX from "xlsx-js-style";
import type { CategoryBookRow, ExcelUploadData } from "./types";

type RawCell = string | number | boolean | null;

export function displayResponse(text: string): string {
  const t = text.trim();
  if (!t) return "(vacío)";
  return t.length > 120 ? `${t.slice(0, 120)}…` : t;
}

export async function parseResponsesExcel(file: File): Promise<ExcelUploadData> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("El archivo no tiene hojas");
  }
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
  }) as RawCell[][];

  if (jsonData.length < 2) {
    throw new Error("El archivo debe tener al menos 2 filas (encabezados + datos)");
  }

  const headers = (jsonData[0] as string[]).filter((h) => h && String(h).trim());
  const dataRows = jsonData.slice(1);

  if (headers.length < 2) {
    throw new Error("El archivo debe tener al menos 2 columnas (ID y Respuesta)");
  }

  const preview = dataRows.slice(0, 5).map((row, index) => ({
    id: String(row[0] ?? `Row_${index + 1}`),
    response: displayResponse(row[1] ? String(row[1]) : ""),
  }));

  return {
    filename: file.name,
    rows: dataRows.length,
    columns: headers,
    preview,
    rawData: jsonData,
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

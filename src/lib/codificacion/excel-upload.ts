/**
 * Parseo de Excel para respuestas y libro de códigos (Codificación).
 * La lectura pesada corre en Rust (calamine); acá quedan helpers de UI.
 */

import { invoke } from "@tauri-apps/api/core";
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
  nonEmptyCount: number;
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

export type ParseResponsesResult =
  | { kind: "ready"; data: ExcelUploadData }
  | { kind: "select-column"; pending: PendingQuestionProSelection };

/**
 * Parsea el Excel de respuestas según la plataforma de origen.
 * `path` es la ruta absoluta en disco (diálogo nativo de Tauri).
 */
export async function parseResponsesExcel(
  path: string,
  platform: SurveyPlatform = "qualtrics"
): Promise<ParseResponsesResult> {
  return invoke<ParseResponsesResult>("parse_codificacion_responses", {
    path,
    platform,
  });
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

/** Parsea un libro de códigos desde Excel en disco. */
export async function parseCategoryBookExcel(
  path: string
): Promise<{ categories: CategoryBookRow[]; errors: string[] }> {
  return invoke<{ categories: CategoryBookRow[]; errors: string[] }>(
    "parse_codificacion_category_book",
    { path }
  );
}

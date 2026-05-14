/**
 * Orquestador del paso 5.C: propaga a QuestionPro las decisiones `remove` y las
 * ediciones inline del review, en batch, con un único punto de entrada.
 *
 * Modelo: el usuario hace todo el laburo de revisar (marcar remove, editar
 * celdas) y, al cerrar, un solo click sincroniza:
 *   - cada fila con `user_decision = 'remove'` y `removed_from_qp_at` NULL →
 *     DELETE de la respuesta en QP, luego `removed_from_qp_at = now()`.
 *   - cada fila con edits sin sincronizar (y que NO esté marcada remove) →
 *     GET la respuesta → mergear edits sobre `responseSet` → DELETE → POST.
 *     QP asigna un `responseID` nuevo (no permite re-postear con el mismo ID);
 *     se persiste en `cleaning_rows.response_id` y los edits quedan `synced`.
 *   - una fila con remove + edits gana el remove (no se edita, sólo se borra).
 *
 * Robustez: si una fila falla se registra en `failed[]` y el batch sigue. El
 * DELETE+POST de los edits NO es atómico: si el POST falla después de un DELETE
 * exitoso, esa respuesta se perdió en QP — el `reason` del fallo lo dice
 * explícitamente, y el copy del modal de confirmación lo anticipa.
 *
 * Alcance acotado: de las columnas metadata sólo se traducen y propagan
 * `META_ESTADO` (Estado) y `META_DUPLICADO` (Duplicado). Editar otras columnas
 * metadata (IP, fecha, minutos, país, ID) no se sincroniza; se reporta como
 * warning en el resultado.
 */

import { getCleaningSupabaseClient } from "./supabase-client";
import { getVersion } from "./cleaning-repository";
import { getProject } from "./projects-repository";
import { getQuestionproApiKey } from "@/lib/settings";
import {
  createResponse,
  deleteResponse,
  getResponse,
  type QPFullResponse,
  type QPResponsePayload,
  type QPResponseSetItem,
} from "@/lib/questionpro";
import {
  getVersionEdits,
  markRowEditsSynced,
} from "./row-edits-repository";
import { listFlags, markFlagRemovedFromQP } from "./flags-repository";
import type { CleaningRowEdit } from "./types";

// --- errores -------------------------------------------------------------

export class MissingQuestionproKeyError extends Error {
  constructor() {
    super("Falta la API key de QuestionPro. Configurala en Ajustes.");
    this.name = "MissingQuestionproKeyError";
  }
}

export class NotAQuestionProProjectError extends Error {
  constructor() {
    super("Este proyecto no es de QuestionPro o le falta el Survey ID.");
    this.name = "NotAQuestionProProjectError";
  }
}

// --- tipos públicos ------------------------------------------------------

export interface SyncToQPResult {
  /** Borrados de respuestas marcadas para remover. */
  removed: { ok: number; failed: Array<{ rowId: string; reason: string }> };
  /** Re-creación de respuestas con ediciones (DELETE + POST). */
  edited: { ok: number; failed: Array<{ rowId: string; reason: string }> };
  /**
   * Advertencias no fatales (la fila se sincronizó igual): p. ej. columnas
   * metadata editadas que 5.C no propaga.
   */
  warnings: Array<{ rowId: string; reason: string }>;
}

export interface SyncToQPProgress {
  phase: "deleting" | "editing";
  processed: number;
  total: number;
  lastRowId?: string;
}

/** Estado de sincronización de un review (para habilitar el botón y armar el preview). */
export interface ReviewSyncStatus {
  /** El proyecto es de QuestionPro y tiene Survey ID. */
  isQuestionPro: boolean;
  surveyId: string | null;
  /** Flags `remove` que todavía no se eliminaron de QP. */
  pendingRemovals: number;
  /** Filas con edits sin sincronizar que NO están marcadas para remover. */
  pendingEdits: number;
}

/** True si hay algo que sincronizar (sirve para habilitar el botón). */
export function hasPendingSync(s: ReviewSyncStatus): boolean {
  return s.isQuestionPro && s.pendingRemovals + s.pendingEdits > 0;
}

// --- estado de sync ------------------------------------------------------

export async function getReviewSyncStatus(
  versionId: string
): Promise<ReviewSyncStatus> {
  const client = await getCleaningSupabaseClient();
  const version = await getVersion(client, versionId);
  const project = await getProject(version.project_id);

  if (project.source !== "questionpro" || !project.qp_survey_id) {
    return {
      isQuestionPro: false,
      surveyId: null,
      pendingRemovals: 0,
      pendingEdits: 0,
    };
  }

  const [{ data: removeFlags, error: flagsErr }, { data: unsyncedEdits, error: editsErr }] =
    await Promise.all([
      client
        .from("cleaning_flags")
        .select("row_id, removed_from_qp_at")
        .eq("version_id", versionId)
        .eq("user_decision", "remove"),
      client
        .from("cleaning_row_edits")
        .select("row_id")
        .eq("version_id", versionId)
        .eq("synced_to_qp", false),
    ]);

  if (flagsErr) {
    throw new Error(`No se pudieron leer los flags: ${flagsErr.message}`);
  }
  if (editsErr) {
    throw new Error(`No se pudieron leer los edits: ${editsErr.message}`);
  }

  const removeRows = (removeFlags ?? []) as Array<{
    row_id: string;
    removed_from_qp_at: string | null;
  }>;
  const removeRowIds = new Set(removeRows.map((f) => f.row_id));
  const pendingRemovals = removeRows.filter((f) => !f.removed_from_qp_at).length;

  const editRowIds = new Set(
    ((unsyncedEdits ?? []) as Array<{ row_id: string }>).map((e) => e.row_id)
  );
  let pendingEdits = 0;
  for (const id of editRowIds) {
    if (!removeRowIds.has(id)) pendingEdits++;
  }

  return {
    isQuestionPro: true,
    surveyId: project.qp_survey_id,
    pendingRemovals,
    pendingEdits,
  };
}

// --- sync ----------------------------------------------------------------

export async function syncReviewToQP(
  versionId: string,
  onProgress?: (e: SyncToQPProgress) => void
): Promise<SyncToQPResult> {
  const client = await getCleaningSupabaseClient();
  const version = await getVersion(client, versionId);
  const project = await getProject(version.project_id);

  if (project.source !== "questionpro" || !project.qp_survey_id) {
    throw new NotAQuestionProProjectError();
  }
  const surveyId = project.qp_survey_id;

  const apiKey = await getQuestionproApiKey();
  if (!apiKey) throw new MissingQuestionproKeyError();

  const colToQid = new Map<string, number>();
  for (const c of version.schema.columns) {
    if (typeof c.qp_question_id === "number") {
      colToQid.set(c.id, c.qp_question_id);
    }
  }

  const result: SyncToQPResult = {
    removed: { ok: 0, failed: [] },
    edited: { ok: 0, failed: [] },
    warnings: [],
  };

  // --- Fase 1: deletes ---------------------------------------------------
  const removeFlags = await listFlags(versionId, { userDecision: "remove" });
  const removeRowIds = new Set(removeFlags.map((f) => f.row_id));
  const pendingDeletes = removeFlags.filter((f) => !f.removed_from_qp_at);

  for (let i = 0; i < pendingDeletes.length; i++) {
    const f = pendingDeletes[i];
    onProgress?.({
      phase: "deleting",
      processed: i,
      total: pendingDeletes.length,
      lastRowId: f.row_id,
    });
    const responseId = f.row?.response_id;
    if (!responseId) {
      result.removed.failed.push({
        rowId: f.row_id,
        reason: "La fila no tiene response_id de QuestionPro.",
      });
      continue;
    }
    try {
      await deleteResponse(surveyId, responseId, apiKey);
      await markFlagRemovedFromQP(f.id);
      result.removed.ok++;
    } catch (err) {
      result.removed.failed.push({ rowId: f.row_id, reason: errMsg(err) });
    }
  }
  onProgress?.({
    phase: "deleting",
    processed: pendingDeletes.length,
    total: pendingDeletes.length,
  });

  // --- Fase 2: edits -----------------------------------------------------
  const editsMap = await getVersionEdits(versionId);
  const editRowIds = [...editsMap.keys()].filter((rowId) => {
    if (removeRowIds.has(rowId)) return false; // gana el remove
    const perRow = editsMap.get(rowId)!;
    return [...perRow.values()].some((e) => !e.synced_to_qp);
  });

  const responseIdByRow = new Map<string, string | null>();
  if (editRowIds.length > 0) {
    const { data, error } = await client
      .from("cleaning_rows")
      .select("id, response_id")
      .in("id", editRowIds);
    if (error) {
      throw new Error(
        `No se pudieron leer las filas a sincronizar: ${error.message}`
      );
    }
    for (const r of (data ?? []) as Array<{
      id: string;
      response_id: string | null;
    }>) {
      responseIdByRow.set(r.id, r.response_id);
    }
  }

  for (let i = 0; i < editRowIds.length; i++) {
    const rowId = editRowIds[i];
    onProgress?.({
      phase: "editing",
      processed: i,
      total: editRowIds.length,
      lastRowId: rowId,
    });
    const perRow = editsMap.get(rowId)!;
    const responseId = responseIdByRow.get(rowId) ?? null;
    if (!responseId) {
      result.edited.failed.push({
        rowId,
        reason: "La fila no tiene response_id de QuestionPro.",
      });
      continue;
    }

    let full: QPFullResponse;
    try {
      full = await getResponse(surveyId, responseId, apiKey);
    } catch (err) {
      result.edited.failed.push({
        rowId,
        reason: `No se pudo leer la respuesta original: ${errMsg(err)}`,
      });
      continue;
    }

    const { payload, unsupported } = mergeEditsIntoResponse(
      full,
      perRow,
      colToQid
    );

    try {
      await deleteResponse(surveyId, responseId, apiKey);
    } catch (err) {
      result.edited.failed.push({
        rowId,
        reason: `No se pudo borrar la respuesta original: ${errMsg(err)}`,
      });
      continue;
    }

    // La respuesta original ya no existe en QP. Si el POST falla, se perdió.
    let newResponseId: number;
    try {
      ({ responseID: newResponseId } = await createResponse(
        surveyId,
        payload,
        apiKey
      ));
    } catch (err) {
      result.edited.failed.push({
        rowId,
        reason:
          `Se borró la respuesta original pero la re-creación falló: ${errMsg(err)}. ` +
          "La respuesta se perdió en QuestionPro; sigue en el XLSX limpio con tus ediciones.",
      });
      continue;
    }

    try {
      await markRowEditsSynced(rowId, String(newResponseId));
    } catch (err) {
      result.edited.failed.push({
        rowId,
        reason: `La respuesta se re-creó en QuestionPro (nuevo ID ${newResponseId}) pero no se pudo actualizar la base local: ${errMsg(err)}`,
      });
      continue;
    }

    if (unsupported.length > 0) {
      result.warnings.push({
        rowId,
        reason: `Sincronizada, pero estas columnas editadas no se propagan a QuestionPro: ${unsupported.join(", ")}`,
      });
    }
    result.edited.ok++;
  }
  onProgress?.({
    phase: "editing",
    processed: editRowIds.length,
    total: editRowIds.length,
  });

  return result;
}

// --- merge de edits sobre la respuesta -----------------------------------

const COL_META_ESTADO = "META_ESTADO";
const COL_META_DUPLICADO = "META_DUPLICADO";

interface MergeOutcome {
  payload: QPResponsePayload;
  /** columnIds editados que no se pudieron mapear a QP. */
  unsupported: string[];
}

function mergeEditsIntoResponse(
  full: QPFullResponse,
  edits: Map<string, CleaningRowEdit>,
  colToQid: Map<string, number>
): MergeOutcome {
  // Clon superficial-pero-suficiente del responseSet para no mutar `full`.
  const responseSet: QPResponseSetItem[] = (full.responseSet ?? []).map((it) => ({
    questionID: it.questionID,
    answerValues: Array.isArray(it.answerValues)
      ? it.answerValues.map((av) =>
          av && typeof av === "object"
            ? { ...(av as Record<string, unknown>) }
            : av
        )
      : [],
  }));
  const byQid = new Map<number, QPResponseSetItem>();
  for (const it of responseSet) byQid.set(it.questionID, it);

  const payload: QPResponsePayload = {
    timestamp: full.timestamp,
    ipAddress: full.ipAddress,
    location: full.location,
    duplicate: full.duplicate,
    timeTaken: full.timeTaken,
    responseStatus: full.responseStatus,
    customVariables: full.customVariables,
    languageID: full.languageID,
    operatingSystem: full.operatingSystem,
    osDeviceType: full.osDeviceType,
    browser: full.browser,
    responseSet,
  };

  const unsupported: string[] = [];

  for (const [columnId, edit] of edits) {
    const newValue = edit.new_value;
    if (columnId === COL_META_ESTADO) {
      payload.responseStatus = translateEstado(newValue);
      continue;
    }
    if (columnId === COL_META_DUPLICADO) {
      payload.duplicate = translateDuplicado(newValue);
      continue;
    }
    const qid = colToQid.get(columnId);
    if (typeof qid !== "number") {
      unsupported.push(columnId);
      continue;
    }
    setAnswerValue(byQid, responseSet, qid, newValue);
  }

  return { payload, unsupported };
}

/**
 * Mete `newValue` en el `answerValues` de la pregunta `questionID`, preservando
 * la estructura existente (QP usa shapes distintos por tipo de pregunta).
 *
 * Shape real que QP devuelve y espera para preguntas de texto
 * (`text_single_row`, `text_multiple_row`, etc.):
 *
 *     { answerID, answerText, value: { text, scale, ord, other, ... } }
 *
 * El texto editable vive en `value.text`. Antes esta función seteaba
 * `value = "<string>"` directamente, lo que rompía el shape y hacía que el POST
 * de re-creación fallara con 400 o llegara a QP con la celda vacía.
 *
 * Para preguntas single-choice (`multiplechoice_radio`) editar el texto desde
 * el review no remapea a un `answerID` válido — eso requiere lógica aparte
 * (`qp_options` del schema). Acá sólo actualizamos `value.text`, lo cual es
 * inocuo para QP pero no cambia la opción seleccionada. Esa traducción
 * texto→answerID es feature pendiente del paso 5.C.
 */
function setAnswerValue(
  byQid: Map<number, QPResponseSetItem>,
  responseSet: QPResponseSetItem[],
  questionID: number,
  newValue: unknown
) {
  const text = newValue === null || newValue === undefined ? "" : String(newValue);
  const existing = byQid.get(questionID);

  if (!existing) {
    // Pregunta nunca respondida → agregar con shape mínimo válido para QP.
    // Falta `answerID` porque no lo tenemos en este path; QP lo asigna o lo
    // ignora según el tipo. Best effort.
    const item: QPResponseSetItem = {
      questionID,
      answerValues: [{ value: { text } }],
    };
    byQid.set(questionID, item);
    responseSet.push(item);
    return;
  }

  const first = existing.answerValues[0];
  if (first && typeof first === "object") {
    const av = first as Record<string, unknown>;
    const currentValue = av.value;
    if (currentValue && typeof currentValue === "object") {
      // Preservar la estructura (scale, ord, other, weight, …) — sólo
      // actualizar el `text`, que es donde QP guarda el contenido editable.
      (currentValue as Record<string, unknown>).text = text;
    } else {
      // `value` venía como string o ausente → crear el objeto mínimo.
      av.value = { text };
    }
  } else {
    // answerValues[0] no era un objeto (caso degenerado) — reconstruir.
    existing.answerValues = [{ value: { text } }];
  }
}

function translateEstado(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "completada" || s === "completado" || s === "completed") {
    return "Completed";
  }
  if (s === "iniciada" || s === "iniciado" || s === "started") {
    return "Started";
  }
  if (s === "terminada" || s === "terminado" || s === "terminated") {
    return "Terminated";
  }
  return String(v ?? "");
}

function translateDuplicado(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  return s === "sí" || s === "si" || s === "true" || s === "1" || s === "yes";
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

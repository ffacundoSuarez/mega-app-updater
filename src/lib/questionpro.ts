/**
 * Cliente HTTP a la API v2 de QuestionPro.
 *
 * Expone lo necesario para los flujos del Limpiador:
 *   - `extractQuestionProSurveyId` / `validateSurvey` (paso 1, crear proyecto)
 *   - `getSurveyQuestions` (etapa 2.C, enriquecer schema)
 *   - `matchExcelColumnsToQuestionpro` + `normalizeQuestionproMatchText`
 *     (etapa 2.C, match determinístico Excel ↔ API)
 *   - `getQuestionProExcelMetadataColumns` (etapa 2.B, parser Excel QP)
 *   - `getResponse` / `deleteResponse` / `createResponse` (etapa 5.C, sync del
 *     review a QP vía DELETE+POST)
 */

import {
  questionproCreateBlock,
  questionproCreateQuestion,
  questionproCreateSurvey,
} from "@/lib/tauri";

const QP_API_BASE = "https://api.questionpro.com/a/api/v2";

export interface QPSurveyInfo {
  id: string;
  name: string;
  totalResponses: number;
}

/** Encuesta listada en `GET /users/{userId}/surveys`. */
export interface QPSurveyListItem {
  id: string;
  name: string;
  status?: string;
  completedResponses?: number;
  url?: string;
}

/** Pregunta normalizada que devuelve `getSurveyQuestions`. */
export interface QPQuestion {
  questionID: number;
  questionText: string;
  questionType: string;
  options?: Array<{ answerID: number; text: string }>;
}

interface QPSurveyAPIResponse {
  response: {
    surveyID?: number;
    id?: number;
    name: string;
    completedResponses?: number;
  };
}

interface QPQuestionsAPIItem {
  questionID: number;
  text?: string;
  type?: string;
  answers?: Array<{ answerID: number; text?: string }>;
}

interface QPQuestionsAPIResponse {
  response?: QPQuestionsAPIItem[];
  pagination?: { totalPages?: number; currentPage?: number; totalItems?: number };
}

/**
 * Extrae el ID numérico de una URL de QuestionPro o lo devuelve tal cual si ya
 * es numérico. Reglas iguales a las de Automatizaciones en mega-dashboard.
 */
export function extractQuestionProSurveyId(input: string): string {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    for (const key of ["surveyID", "id", "surveyId", "survey_id"]) {
      const val = url.searchParams.get(key);
      if (val && /^\d+$/.test(val)) return val;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    const numericSegment = segments.find((s) => /^\d{5,}$/.test(s));
    if (numericSegment) return numericSegment;
  } catch {
    const match = trimmed.match(/\d{5,}/);
    if (match) return match[0];
  }

  return trimmed;
}

/**
 * Valida una encuesta contra la API de QuestionPro. Retorna nombre y total de
 * respuestas (toma el `totalItems` de la paginación de /responses, que refleja
 * el total real; el campo `completedResponses` del survey sólo cuenta las
 * completadas, no las parciales).
 *
 * Errores específicos según status (401/403/404) para dar mensaje claro al user.
 */
export async function validateSurvey(
  surveyId: string,
  apiKey: string
): Promise<QPSurveyInfo> {
  const headers = { "api-key": apiKey };

  const res = await fetch(`${QP_API_BASE}/surveys/${surveyId}`, { headers });
  if (!res.ok) {
    const text = await safeText(res);
    if (res.status === 401 || res.status === 403) {
      throw new Error("API Key inválida o sin permisos para esta encuesta");
    }
    if (res.status === 404) {
      throw new Error("Encuesta no encontrada. Verificá el Survey ID.");
    }
    throw new Error(`Error de QuestionPro (${res.status}): ${truncate(text, 200)}`);
  }

  const data = (await res.json()) as QPSurveyAPIResponse;
  const survey = data.response;

  let totalResponses = survey.completedResponses ?? 0;
  try {
    const countRes = await fetch(
      `${QP_API_BASE}/surveys/${surveyId}/responses?page=1&perPage=1`,
      { headers }
    );
    if (countRes.ok) {
      const countData = (await countRes.json()) as {
        pagination?: { totalItems?: number };
      };
      totalResponses = countData.pagination?.totalItems ?? totalResponses;
    }
  } catch {
    // Ignorar: si falla el count, nos quedamos con completedResponses como fallback.
  }

  return {
    id: String(survey.surveyID ?? survey.id ?? surveyId),
    name: survey.name,
    totalResponses,
  };
}

interface QPUserSurveysAPIItem {
  surveyID?: number;
  id?: number;
  name?: string;
  status?: string;
  completedResponses?: number;
  url?: string;
}

interface QPUserSurveysAPIResponse {
  response?: QPUserSurveysAPIItem[];
  pagination?: { totalPages?: number; currentPage?: number };
}

/**
 * Lista las encuestas del usuario en QuestionPro (`GET /users/{userId}/surveys`).
 * Requiere API key y User ID de Ajustes.
 */
export async function listUserSurveys(
  userId: string,
  apiKey: string,
  options?: { activeOnly?: boolean }
): Promise<QPSurveyListItem[]> {
  const headers = { "api-key": apiKey };
  const all: QPSurveyListItem[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `${QP_API_BASE}/users/${encodeURIComponent(
      userId.trim()
    )}/surveys?page=${page}&perPage=${perPage}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await safeText(res);
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          "API Key inválida o sin permisos para listar encuestas de este usuario"
        );
      }
      if (res.status === 404) {
        throw new Error(
          "Usuario de QuestionPro no encontrado. Verificá el User ID en Ajustes."
        );
      }
      throw new Error(
        `Error listando encuestas de QuestionPro (${res.status}): ${truncate(
          text,
          200
        )}`
      );
    }

    const data = (await res.json()) as QPUserSurveysAPIResponse;
    const batch = data.response ?? [];

    for (const item of batch) {
      const id = String(item.surveyID ?? item.id ?? "");
      if (!id) continue;
      const status = item.status?.trim();
      if (options?.activeOnly && status && status.toLowerCase() !== "active") {
        continue;
      }
      all.push({
        id,
        name: String(item.name ?? `Encuesta ${id}`),
        status,
        completedResponses: item.completedResponses,
        url: item.url,
      });
    }

    const totalPages = data.pagination?.totalPages ?? 1;
    if (page >= totalPages || batch.length < perPage) break;
    page += 1;
  }

  all.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return all;
}

/**
 * Trae todas las preguntas de la encuesta vía `GET /surveys/{id}/questions`,
 * paginando hasta agotar. Devuelve preguntas normalizadas (id, texto, tipo,
 * opciones si tiene). Usado en la etapa 2.C para cruzar con las columnas del
 * Excel y enriquecer el `VersionSchema`.
 */
export async function getSurveyQuestions(
  surveyId: string,
  apiKey: string
): Promise<QPQuestion[]> {
  const headers = { "api-key": apiKey };
  const all: QPQuestion[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = `${QP_API_BASE}/surveys/${surveyId}/questions?page=${page}&perPage=${perPage}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await safeText(res);
      throw new Error(
        `Error obteniendo preguntas de QuestionPro (${res.status}): ${truncate(
          text,
          200
        )}`
      );
    }

    const data = (await res.json()) as QPQuestionsAPIResponse;
    const batch = data.response ?? [];

    for (const item of batch) {
      const opts = Array.isArray(item.answers)
        ? item.answers.map((a) => ({
            answerID: a.answerID,
            text: String(a.text ?? ""),
          }))
        : undefined;

      all.push({
        questionID: item.questionID,
        questionText: String(item.text ?? ""),
        questionType: String(item.type ?? ""),
        options: opts && opts.length > 0 ? opts : undefined,
      });
    }

    const totalPages = data.pagination?.totalPages ?? 1;
    if (page >= totalPages || batch.length < perPage) break;
    page += 1;
  }

  return all;
}

/**
 * Normalizador para match determinístico de texto entre headers del Excel y
 * `questionText` de la API. Lowercase, trim, NFD para sacar acentos, colapso
 * de whitespace.
 */
export function normalizeQuestionproMatchText(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** Forma del schema column tal como entra al matcher (sin enriquecer). */
export interface ExcelSchemaColumnForMatch {
  index: number;
  id: string;
  question: string;
  is_metadata?: boolean;
}

/**
 * Empareja las columnas del Excel contra las preguntas de la API por texto
 * normalizado. Cada `questionID` se usa una sola vez (greedy first-match) para
 * evitar duplicar matches cuando dos columnas tienen el mismo texto.
 *
 * Las columnas marcadas como metadata o cuyo `id` empieza con `META_` se dejan
 * pasar tal cual (sin enriquecer).
 */
export function matchExcelColumnsToQuestionpro<
  T extends ExcelSchemaColumnForMatch,
>(
  columns: T[],
  qpQuestions: QPQuestion[]
): Array<
  T & {
    qp_question_id?: number;
    qp_question_type?: string;
    qp_options?: Array<{ answerID: number; text: string }>;
  }
> {
  const usedIds = new Set<number>();
  const normToQuestions = new Map<string, QPQuestion[]>();

  for (const q of qpQuestions) {
    const k = normalizeQuestionproMatchText(q.questionText);
    if (!k) continue;
    const list = normToQuestions.get(k) ?? [];
    list.push(q);
    normToQuestions.set(k, list);
  }

  return columns.map((col) => {
    const isMeta = col.is_metadata === true || col.id.startsWith("META_");
    if (isMeta) {
      return { ...col, is_metadata: true };
    }

    const k = normalizeQuestionproMatchText(col.question);
    const cands = k ? normToQuestions.get(k) : undefined;

    if (cands && cands.length > 0) {
      const pick = cands.find((c) => !usedIds.has(c.questionID)) ?? cands[0];
      usedIds.add(pick.questionID);
      return {
        ...col,
        is_metadata: false,
        qp_question_id: pick.questionID,
        qp_question_type: pick.questionType,
        qp_options: pick.options,
      };
    }

    return { ...col, is_metadata: false };
  });
}

/**
 * Bloque de columnas metadata estándar del export Excel de QuestionPro
 * (siempre las primeras 7 columnas, en este orden y con estos labels).
 *
 * Los `columnId` son sintéticos (`META_*`) — el Excel no los trae, los genera
 * el parser para que el resto del Limpiador pueda referenciarlas.
 */
export function getQuestionProExcelMetadataColumns(): ReadonlyArray<{
  label: string;
  columnId: string;
}> {
  return [
    { label: "ID Respuesta", columnId: "META_ID_RESPUESTA" },
    { label: "Fecha y Hora", columnId: "META_FECHA_HORA" },
    { label: "Minutos", columnId: "META_MINUTOS" },
    { label: "Estado", columnId: "META_ESTADO" },
    { label: "IP", columnId: "META_IP" },
    { label: "Duplicado", columnId: "META_DUPLICADO" },
    { label: "País", columnId: "META_PAIS" },
  ];
}

// ===========================================================================
// Sync de respuestas (etapa 5.C) — GET / DELETE / POST de respuestas
// ===========================================================================

/**
 * Una entrada del `responseSet` de una respuesta: una pregunta + sus valores.
 *
 * El shape de `answerValues` depende del tipo de pregunta (texto vs. opción
 * múltiple vs. escala…): a veces es `[{ value, answerText }]`, a veces
 * `[{ value }]`, a veces primitivos. Por eso lo dejamos como `unknown[]` y el
 * merge de edits (ver `sync-to-questionpro.ts`) muta la estructura existente en
 * lugar de reconstruirla.
 */
export interface QPResponseSetItem {
  questionID: number;
  answerValues: unknown[];
}

/**
 * Respuesta completa tal como la devuelve `GET /surveys/{id}/responses/{rid}`.
 * Todos los campos de metadata son opcionales: si la API no los trae para una
 * respuesta puntual, simplemente no se reenvían en el POST de re-creación.
 *
 * NOTA: shape validado contra la doc de QuestionPro
 * (https://www.questionpro.com/api/get-response.html y create-response.html),
 * pero puede haber drift menor; confirmar contra una encuesta real en 5.C/A.6.
 */
export interface QPFullResponse {
  responseID: number;
  surveyID: number;
  timestamp?: string;
  ipAddress?: string;
  location?: { country?: string; region?: string; city?: string } | null;
  duplicate?: boolean;
  timeTaken?: number;
  responseStatus?: string;
  customVariables?: Record<string, string> | null;
  languageID?: number;
  operatingSystem?: string;
  osDeviceType?: string;
  browser?: string;
  responseSet: QPResponseSetItem[];
}

/** Lo que se manda en el POST de re-creación: la respuesta menos sus IDs. */
export type QPResponsePayload = Omit<QPFullResponse, "responseID" | "surveyID">;

interface QPResponseAPIWrapper {
  response: QPFullResponse;
}

interface QPCreateResponseAPIWrapper {
  response: { responseID: number };
}

/** GET de una respuesta puntual con todo su `responseSet` y metadata. */
export async function getResponse(
  surveyId: string,
  responseId: string,
  apiKey: string
): Promise<QPFullResponse> {
  const res = await fetch(
    `${QP_API_BASE}/surveys/${surveyId}/responses/${responseId}`,
    { headers: { "api-key": apiKey } }
  );
  if (!res.ok) {
    throw qpResponseError(res, await safeText(res), responseId);
  }
  const data = (await res.json()) as QPResponseAPIWrapper;
  const r = data.response;
  if (!r || !Array.isArray(r.responseSet)) {
    throw new Error(
      `QuestionPro devolvió una respuesta inesperada para la respuesta ${responseId}`
    );
  }
  return r;
}

/** DELETE de una respuesta. Idempotente del lado nuestro: un 404 lo tomamos OK. */
export async function deleteResponse(
  surveyId: string,
  responseId: string,
  apiKey: string
): Promise<void> {
  const res = await fetch(
    `${QP_API_BASE}/surveys/${surveyId}/responses/${responseId}`,
    { method: "DELETE", headers: { "api-key": apiKey } }
  );
  // 404 = ya no existe → tratamos como éxito (idempotencia del re-sync).
  if (!res.ok && res.status !== 404) {
    throw qpResponseError(res, await safeText(res), responseId);
  }
}

/**
 * POST de una respuesta nueva. QuestionPro asigna un `responseID` nuevo —
 * por eso re-crear una respuesta editada cambia su ID interno (el resto de
 * la metadata se preserva si la API la respeta).
 */
export async function createResponse(
  surveyId: string,
  payload: QPResponsePayload,
  apiKey: string
): Promise<{ responseID: number }> {
  const res = await fetch(`${QP_API_BASE}/surveys/${surveyId}/responses`, {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw qpResponseError(res, await safeText(res));
  }
  const data = (await res.json()) as QPCreateResponseAPIWrapper;
  const id = data.response?.responseID;
  if (typeof id !== "number") {
    throw new Error(
      "QuestionPro no devolvió el responseID de la respuesta re-creada"
    );
  }
  return { responseID: id };
}

// ===========================================================================
// Creación de encuestas y preguntas (Iteración 8 del Validador)
// ===========================================================================

/**
 * Payload de creación de una encuesta. Sólo `name` es realmente obligatorio en
 * QP; el resto se omite si el caller no lo pasa.
 */
export interface QPCreateSurveyInput {
  name: string;
  folderID?: number;
  saveAndContinue?: boolean;
}

export interface QPCreatedSurvey {
  surveyID: number;
  name: string;
  url: string;
  status: string;
}

export interface QPCreatedBlock {
  blockID: number;
  surveyID: number;
  title: string;
  orderNumber: number;
}

/**
 * Crea una encuesta vacía bajo el usuario `userId`. La API de QP la crea con
 * `status: "Active"` según la doc, pero **sin preguntas**, así que en la
 * práctica funciona como borrador hasta que el cliente publique el link.
 *
 * Endpoint: `POST /users/{user-id}/surveys` (no `/surveys` — confirmado en
 * la doc de la API V2).
 */
export async function createSurvey(
  userId: string,
  apiKey: string,
  input: QPCreateSurveyInput
): Promise<QPCreatedSurvey> {
  if (!userId.trim()) {
    throw new Error("Falta el User ID de QuestionPro");
  }
  if (!input.name.trim()) {
    throw new Error("El nombre de la encuesta no puede estar vacío");
  }
  const created = await questionproCreateSurvey({
    userId: userId.trim(),
    apiKey,
    name: input.name.trim(),
    folderId: input.folderID,
    saveAndContinue: input.saveAndContinue,
  });
  return {
    surveyID: created.surveyId,
    name: created.name,
    url: created.url,
    status: created.status,
  };
}

/**
 * Payload genérico para `POST /surveys/{id}/questions`.
 *
 * Es deliberadamente abierto: cada tipo de pregunta de QP tiene su propio
 * shape (`answers[]`, `rows[]`, `columns[]`, `minValue`/`maxValue`, etc.). El
 * caller (`qp-publish.ts`) arma el shape correcto y nosotros sólo lo POST'eamos.
 */
export interface QPCreateQuestionPayload {
  blockID?: number;
  type: string;
  text: string;
  code?: string;
  orderNumber?: number;
  required?: boolean;
  answers?: Array<{ text: string; orderNumber?: number }>;
  rows?: Array<{
    text: string;
    required?: boolean;
    columns?: Array<{ text?: string; isDefault?: boolean }>;
    prefix?: string;
    suffix?: string;
  }>;
  columns?: Array<{ text: string }>;
  minValue?: number;
  maxValue?: number;
  step?: number;
  anchor?: { leftAnchor?: string; rightAnchor?: string };
}

/** Crea un bloque/sección dentro de una encuesta QP. */
export async function createSurveyBlock(
  surveyId: string,
  apiKey: string,
  input: { title: string; orderNumber: number }
): Promise<QPCreatedBlock> {
  if (!input.title.trim()) {
    throw new Error("El título del bloque no puede estar vacío");
  }
  const created = await questionproCreateBlock({
    surveyId,
    apiKey,
    title: input.title.trim(),
    orderNumber: input.orderNumber,
  });
  return {
    blockID: created.blockId,
    surveyID: created.surveyId,
    title: created.title,
    orderNumber: created.orderNumber,
  };
}

export interface QPCreatedQuestion {
  questionID: number;
  blockID?: number;
  orderNumber?: number;
}

/**
 * Crea una pregunta en la encuesta. Devuelve sólo los IDs útiles para el caller
 * (que después puede setear branching o rastrear orden); el cuerpo completo
 * de la API queda en el wire si hace falta para debug.
 */
export async function createQuestion(
  surveyId: string,
  payload: QPCreateQuestionPayload,
  apiKey: string
): Promise<QPCreatedQuestion> {
  const created = await questionproCreateQuestion({
    surveyId,
    apiKey,
    payload,
  });
  return {
    questionID: created.questionId,
    blockID: created.blockId ?? undefined,
    orderNumber: created.orderNumber ?? undefined,
  };
}

function qpResponseError(res: Response, body: string, responseId?: string): Error {
  if (res.status === 401 || res.status === 403) {
    return new Error(
      "API key de QuestionPro inválida o sin permisos para esta encuesta"
    );
  }
  if (res.status === 404) {
    return new Error(
      responseId
        ? `Respuesta ${responseId} no encontrada en QuestionPro`
        : "Recurso no encontrado en QuestionPro"
    );
  }
  return new Error(`Error de QuestionPro (${res.status}): ${truncate(body, 200)}`);
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

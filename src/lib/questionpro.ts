/**
 * Cliente HTTP a la API v2 de QuestionPro.
 *
 * Expone lo necesario para los flujos del Limpiador:
 *   - `extractQuestionProSurveyId` / `validateSurvey` (paso 1, crear proyecto)
 *   - `getSurveyQuestions` (etapa 2.C, enriquecer schema)
 *   - `matchExcelColumnsToQuestionpro` + `normalizeQuestionproMatchText`
 *     (etapa 2.C, match determinístico Excel ↔ API)
 *   - `getQuestionProExcelMetadataColumns` (etapa 2.B, parser Excel QP)
 *
 * Sync de respuestas (`getResponse` / `deleteResponse` / `createResponse`) se
 * incorporará en la etapa 5.C cuando arme la sincronización a QP.
 */

const QP_API_BASE = "https://api.questionpro.com/a/api/v2";

export interface QPSurveyInfo {
  id: string;
  name: string;
  totalResponses: number;
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

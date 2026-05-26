/**
 * Publica un cuestionario canónico a QuestionPro creando una encuesta nueva
 * (Iteración 8 del plan).
 *
 * Flujo (basado en la doc de QP API v2 — ver `docs/qp-api-notes.md` cuando se
 * cree, hoy lo confirmado vive en esta sección):
 *   1. `POST /users/{user-id}/surveys`            → crea la encuesta y devuelve `surveyID` + `url`.
 *   2. `POST /surveys/{surveyID}/questions` x N   → una llamada por pregunta, en orden.
 *
 * **Skip-logic / branching NO se publica automáticamente.** La doc de v2 no
 * expone un endpoint claro para setear `condicion` ni `flujo[]` desde acá; el
 * usuario lo termina en el panel web de QP. Cada regla no aplicada se reporta
 * como `warning` para que la vea antes de cerrar el modal.
 *
 * Errores parciales: si la creación de la encuesta funcionó pero falla una
 * pregunta a mitad, **no rollbackeamos** (QP no tiene transacciones).
 * Devolvemos la lista de preguntas creadas en `published.questions` y el error
 * con el índice afectado para que el usuario pueda completar a mano en QP.
 */

import {
  createQuestion,
  createSurvey,
  createSurveyBlock,
  type QPCreateQuestionPayload,
} from "@/lib/questionpro";
import type { Question, Questionnaire, QuestionOption } from "./types";

export class PublishToQpError extends Error {
  constructor(
    message: string,
    /** Índice 0-based de la pregunta que falló (si aplica). */
    public readonly atQuestionIndex?: number,
    /** Datos parciales: encuesta ya creada antes del fallo. */
    public readonly partial?: PublishToQpPartial
  ) {
    super(message);
    this.name = "PublishToQpError";
  }
}

export interface PublishToQpPartial {
  qp_survey_id: string;
  qp_survey_url: string;
  questions_published: number;
}

export interface PublishToQpOptions {
  /** ID numérico del usuario de QP (necesario para el endpoint /users/{id}/surveys). */
  userId: string;
  /** API key de QP. */
  apiKey: string;
  /**
   * Nombre con el que se crea la encuesta. Si se omite, se usa
   * `questionnaire.metadata.titulo`.
   */
  surveyName?: string;
  /** ID de folder en QP (opcional). */
  folderId?: number;
  /** Callback de progreso por cada pregunta publicada. */
  onProgress?: (info: {
    publishedCount: number;
    totalCount: number;
    lastQuestionId?: string;
  }) => void;
  /** Cancelación cooperativa entre pregunta y pregunta. */
  signal?: AbortSignal;
}

export interface PublishToQpResult {
  qp_survey_id: string;
  qp_survey_url: string;
  /** Mapping pregunta-canónica → questionID asignado por QP. */
  questions: Array<{ canonicalId: string; qpQuestionId: number }>;
  /** Cosas que no se mapearon 1:1 y el usuario tiene que revisar en QP. */
  warnings: string[];
}

/**
 * Publica un cuestionario completo a QP. Llama secuencialmente — no usamos
 * `Promise.all` porque el orden importa (la `orderNumber` que asigna QP
 * depende del orden de creación) y porque QP a veces tira 429 si lo
 * martillamos en paralelo.
 */
export async function publishQuestionnaireToQp(
  questionnaire: Questionnaire,
  opts: PublishToQpOptions
): Promise<PublishToQpResult> {
  if (questionnaire.preguntas.length === 0) {
    throw new PublishToQpError(
      "El cuestionario no tiene preguntas para publicar."
    );
  }
  if (!opts.userId.trim()) {
    throw new PublishToQpError("Falta el User ID de QuestionPro en Ajustes.");
  }
  if (!opts.apiKey.trim()) {
    throw new PublishToQpError("Falta la API key de QuestionPro en Ajustes.");
  }

  const surveyName =
    opts.surveyName?.trim() ||
    questionnaire.metadata.titulo?.trim() ||
    "Cuestionario sin título";

  // 1) Crear la encuesta vacía.
  const created = await createSurvey(opts.userId, opts.apiKey, {
    name: surveyName,
    folderID: opts.folderId,
  });
  const qpSurveyId = String(created.surveyID);
  const partial: PublishToQpPartial = {
    qp_survey_id: qpSurveyId,
    qp_survey_url: created.url,
    questions_published: 0,
  };

  const warnings: string[] = [];
  const published: Array<{ canonicalId: string; qpQuestionId: number }> = [];
  const blockByQuestionId = await createBlocksForSections(
    qpSurveyId,
    opts.apiKey,
    questionnaire
  );

  // 2) Publicar preguntas en orden. La cancelación se chequea entre llamadas
  //    para no abandonar una request en vuelo (mismo patrón que cleaning-job).
  for (let i = 0; i < questionnaire.preguntas.length; i++) {
    if (opts.signal?.aborted) {
      throw new PublishToQpError(
        "Publicación cancelada por el usuario.",
        i,
        { ...partial, questions_published: published.length }
      );
    }
    const q = questionnaire.preguntas[i];
    const { payload, perQuestionWarnings } = canonicalToQpQuestionPayload(
      q,
      i
    );
    const blockID = blockByQuestionId.get(q.id);
    if (blockID != null) payload.blockID = blockID;
    warnings.push(...perQuestionWarnings);

    try {
      const result = await createQuestion(qpSurveyId, payload, opts.apiKey);
      published.push({ canonicalId: q.id, qpQuestionId: result.questionID });
      opts.onProgress?.({
        publishedCount: published.length,
        totalCount: questionnaire.preguntas.length,
        lastQuestionId: q.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new PublishToQpError(
        `Falló al crear la pregunta ${q.id} (#${i + 1}): ${msg}`,
        i,
        { ...partial, questions_published: published.length }
      );
    }
  }

  // 3) Avisos finales — skip-logic global no se publica.
  const totalCondiciones = questionnaire.preguntas.filter(
    (q) => q.condicion.trim().length > 0
  ).length;
  const totalFlujos = questionnaire.preguntas.reduce(
    (acc, q) => acc + q.flujo.length,
    0
  );
  if (totalCondiciones > 0 || totalFlujos > 0) {
    warnings.push(
      `Skip-logic no se mapea automáticamente: ${totalCondiciones} condiciones de pregunta y ${totalFlujos} reglas de flujo quedaron pendientes. Configuralas en el panel de QuestionPro.`
    );
  }
  return {
    qp_survey_id: qpSurveyId,
    qp_survey_url: created.url,
    questions: published,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Mapeo canónico → payload de QP
// ---------------------------------------------------------------------------

/**
 * Convierte una `Question` canónica al payload que espera
 * `POST /surveys/{id}/questions`.
 *
 * Lo que no tiene equivalente 1:1 cae en heurísticas razonables y se reporta
 * en `perQuestionWarnings` para que el usuario lo revise antes de lanzar la
 * encuesta. Por ejemplo:
 *   - `escala` sin `enunciados` → multiplechoice_radio con la escala numérica
 *     como respuestas (warning sugiriendo cambiarlo a slider si quiere).
 *   - `fecha` → text_single_row (no encontramos un tipo `date_*` confirmado).
 *   - `numerica` → text_single_row con prefix/suffix vacíos (validación
 *     numérica no se setea por API en v2 según la doc actual).
 *
 * El `orderNumber` se pasa explícito 1-based: no confiamos en el auto-asignado
 * porque depende del orden de llegada y queremos que coincida con la canónica.
 */
function canonicalToQpQuestionPayload(
  q: Question,
  questionIndex: number
): { payload: QPCreateQuestionPayload; perQuestionWarnings: string[] } {
  const warnings: string[] = [];
  const displayNumber = questionIndex + 1;
  const text = q.texto.trim() || `Pregunta ${q.numero || displayNumber}`;
  const code = q.id || `Q${displayNumber}`;
  // `required` no está en el canónico todavía — por seguridad creamos las
  // preguntas no-obligatorias así el usuario decide.
  const base: QPCreateQuestionPayload = {
    type: "multiplechoice_radio",
    text,
    code,
    // QP valida `orderNumber` como 0-based, pero al crear preguntas lo interpreta
    // como posición de inserción desde el final del bloque. Mandar 0 en cada
    // POST appendea la pregunta debajo de las ya creadas y conserva el orden
    // del cuestionario canónico.
    orderNumber: 0,
    required: false,
  };

  switch (q.tipo) {
    case "cerrada_unica":
      return {
        payload: {
          ...base,
          type: "multiplechoice_radio",
          answers: optionsToAnswers(q.opciones),
        },
        perQuestionWarnings: warningsForOptionFeatures(q, warnings),
      };

    case "cerrada_multiple":
      return {
        payload: {
          ...base,
          type: "multiplechoice_checkbox",
          answers: optionsToAnswers(q.opciones),
        },
        perQuestionWarnings: warningsForOptionFeatures(q, warnings),
      };

    case "escala": {
      // Si hay opciones explícitas, las usamos como labels. Si no, generamos
      // la escala a partir de min/max.
      const ans =
        q.opciones.length > 0
          ? optionsToAnswers(q.opciones)
          : buildScaleAnswers(q.min, q.max);
      if (q.opciones.length === 0 && (q.min == null || q.max == null)) {
        warnings.push(
          `${q.id}: escala sin opciones ni rango min/max — se publicó 1-5 por defecto. Ajustá en QP.`
        );
      }
      warnings.push(
        `${q.id}: la escala se publicó como botones radio. Si querés un slider gráfico, cambialo a "Numeric Slider" desde QP.`
      );
      return {
        payload: { ...base, type: "multiplechoice_radio", answers: ans },
        perQuestionWarnings: warnings,
      };
    }

    case "matriz": {
      const rows = (q.enunciados ?? []).map((e) => ({ text: e.texto.trim() }));
      const columns = q.opciones.map((o) => ({ text: o.texto.trim() }));
      if (rows.length === 0) {
        warnings.push(
          `${q.id}: matriz sin enunciados (filas). Se publicó con una fila vacía — cargá las filas en QP.`
        );
        rows.push({ text: "Fila 1" });
      }
      if (columns.length === 0) {
        warnings.push(
          `${q.id}: matriz sin columnas — se publicó con una columna por defecto.`
        );
      }
      return {
        payload: {
          ...base,
          type: "matrix_radio",
          rows: rows.map((r) => ({
            text: r.text,
            columns: columns.length > 0 ? columns : [{ text: "Opción 1" }],
          })),
          columns: columns.length > 0 ? columns : [{ text: "Opción 1" }],
        },
        perQuestionWarnings: warnings,
      };
    }

    case "abierta_texto":
      return {
        payload: {
          ...base,
          type: "text_multiple_row",
          rows: [textQuestionRow(text)],
        },
        perQuestionWarnings: warnings,
      };

    case "abierta_marca":
      return {
        payload: {
          ...base,
          type: "text_single_row",
          rows: [textQuestionRow(text)],
        },
        perQuestionWarnings: warnings,
      };

    case "numerica":
      warnings.push(
        `${q.id}: numérica se publicó como text_single_row. La validación numérica (min/max/decimales) hay que configurarla en QP.`
      );
      return {
        payload: {
          ...base,
          type: "text_single_row",
          rows: [textQuestionRow(text)],
        },
        perQuestionWarnings: warnings,
      };

    case "ranking":
      return {
        payload: {
          ...base,
          type: "rank_order_drag_drop",
          answers: optionsToAnswers(q.opciones),
        },
        perQuestionWarnings: warningsForOptionFeatures(q, warnings),
      };

    case "fecha":
      warnings.push(
        `${q.id}: tipo fecha se publicó como text_single_row (no encontramos un tipo "date" confirmado en la API v2). Configurá el formato de fecha en QP si está disponible.`
      );
      return {
        payload: {
          ...base,
          type: "text_single_row",
          rows: [textQuestionRow(text)],
        },
        perQuestionWarnings: warnings,
      };

    case "comentario":
      return {
        payload: {
          ...base,
          type: "static_presentation_text",
          required: false,
        },
        perQuestionWarnings: warnings,
      };
  }
}

async function createBlocksForSections(
  surveyId: string,
  apiKey: string,
  questionnaire: Questionnaire
): Promise<Map<string, number>> {
  const blockByQuestionId = new Map<string, number>();
  const sections = questionnaire.secciones.filter(
    (section) => section.nombre.trim() && section.preguntas.length > 0
  );
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const created = await createSurveyBlock(surveyId, apiKey, {
      title: section.nombre,
      orderNumber: i + 1,
    });
    for (const questionId of section.preguntas) {
      blockByQuestionId.set(questionId, created.blockID);
    }
  }
  return blockByQuestionId;
}

function optionsToAnswers(
  opts: QuestionOption[]
): Array<{ text: string; orderNumber: number }> {
  return opts.map((o, i) => ({
    text: o.texto.trim() || `Opción ${i + 1}`,
    orderNumber: i,
  }));
}

/**
 * En preguntas de texto, QP muestra el texto visible desde `rows[].text`.
 * Si mandamos una fila genérica ("Respuesta"), la pregunta queda mal rotulada.
 */
function textQuestionRow(text: string): { text: string } {
  return { text: text.trim() || "Respuesta" };
}

/**
 * Genera respuestas numéricas para una escala canónica que viene sin
 * `opciones`. Default 1-5 si min/max no están seteados (consistente con
 * `qp-import.ts`, que asume el mismo rango cuando QP no devuelve escala).
 */
function buildScaleAnswers(
  min: number | undefined,
  max: number | undefined
): Array<{ text: string; orderNumber: number }> {
  const lo = Math.trunc(min ?? 1);
  const hi = Math.trunc(max ?? 5);
  if (hi <= lo) {
    return [
      { text: "1", orderNumber: 1 },
      { text: "2", orderNumber: 2 },
      { text: "3", orderNumber: 3 },
      { text: "4", orderNumber: 4 },
      { text: "5", orderNumber: 5 },
    ];
  }
  const out: Array<{ text: string; orderNumber: number }> = [];
  for (let v = lo, idx = 1; v <= hi; v++, idx++) {
    out.push({ text: String(v), orderNumber: idx - 1 });
  }
  return out;
}

/**
 * Detecta features de opciones canónicas que QP no replica 1:1 vía POST:
 * "exclusiva", "especificar", "fijar". Devuelve `warnings` enriquecido con
 * cada caso para que el usuario lo cierre desde el panel.
 */
function warningsForOptionFeatures(
  q: Question,
  acc: string[]
): string[] {
  const flags = new Set<string>();
  for (const o of q.opciones) {
    for (const c of o.condicion) flags.add(c);
  }
  if (flags.size > 0) {
    acc.push(
      `${q.id}: opciones con flags ${[...flags].join(", ")} — esos comportamientos (exclusiva / especificar / fijar) no se setean por API y hay que configurarlos en QP.`
    );
  }
  if (q.aleatorizar) {
    acc.push(
      `${q.id}: aleatorización de opciones marcada en el cuestionario, pero no se setea por API. Activala en QP.`
    );
  }
  return acc;
}


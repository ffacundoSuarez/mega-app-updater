/**
 * Capa pre-IA del Limpiador: corre los chequeos determinísticos
 * (`field-checks.ts`) sobre todas las filas de una versión ANTES de mandar
 * nada a OpenAI. Las filas que esta capa flaguea no se envían a la IA — eso
 * baja costo y consistencia (le saca al modelo lo trivial: galimatías, IPs
 * repetidas, abiertas vacías) y deja a la IA sólo lo que requiere criterio.
 *
 * Esta capa SÍ conoce el dominio (cómo está armado el `VersionSchema`, qué
 * columna es la IP, cuál la duración, cuáles abiertas), coerce tipos y mapea
 * cada hallazgo a un `AnalyzeResult` con el mismo shape que produce la IA, así
 * `saveFlags` lo persiste igual. Cada fila recibe a lo sumo UN flag (gana el
 * de mayor prioridad) — la tabla `cleaning_flags` tiene UNIQUE(version_id,row_id).
 *
 * Alcance v1: `ip_duplicada`, `duracion_corta/larga`, `abierta_pocas_palabras`,
 * `abierta_caracteres_repetidos`. La detección de columna IP/duración es
 * confiable sólo en proyectos QuestionPro (metadata estándar `META_IP`,
 * `META_MINUTOS`); para Qualtrics hace un best-effort por nombre de columna.
 */

import {
  checkDuration,
  checkIpDuplicates,
  checkOpenEnded,
  DET_RULE_ABIERTA_CARACTERES_REPETIDOS,
  DET_RULE_ABIERTA_POCAS_PALABRAS,
  DET_RULE_DURACION_CORTA,
  DET_RULE_DURACION_LARGA,
  DET_RULE_IP_DUPLICADA,
  type FieldRow,
} from "./field-checks";
import type {
  AnalyzeResult,
  CleaningRow,
  FlagRecommendation,
  FlagType,
  SchemaColumn,
  VersionSchema,
} from "./types";

/** Un hallazgo determinístico sobre una fila, listo para mapear a flag. */
export interface DeterministicHit {
  ruleId: string;
  flag_type: FlagType;
  reason: string;
  friendly_explanation: string;
  recommendation: FlagRecommendation;
  confidence: number;
  affected_question_ids: string[];
}

interface RuleSpec {
  /** Mayor = gana cuando una fila dispara varios chequeos. */
  priority: number;
  flag_type: FlagType;
  recommendation: FlagRecommendation;
  confidence: number;
}

const RULE_SPEC: Record<string, RuleSpec> = {
  [DET_RULE_ABIERTA_CARACTERES_REPETIDOS]: {
    priority: 5,
    flag_type: "red",
    recommendation: "remove",
    confidence: 1.0,
  },
  [DET_RULE_IP_DUPLICADA]: {
    priority: 4,
    flag_type: "yellow",
    recommendation: "review",
    confidence: 0.7,
  },
  [DET_RULE_DURACION_CORTA]: {
    priority: 3,
    flag_type: "yellow",
    recommendation: "review",
    confidence: 0.6,
  },
  [DET_RULE_ABIERTA_POCAS_PALABRAS]: {
    priority: 2,
    flag_type: "yellow",
    recommendation: "review",
    confidence: 0.85,
  },
  [DET_RULE_DURACION_LARGA]: {
    priority: 1,
    flag_type: "yellow",
    recommendation: "review",
    confidence: 0.4,
  },
};

// ---------------------------------------------------------------------------
// Detección de columnas
// ---------------------------------------------------------------------------

const TEXT_TYPE_RE = /text|essay|comment|paragraph|open|abiert/i;

/** True si la columna es una pregunta abierta de la que estamos seguros. */
export function isConfidentOpenEndedColumn(col: SchemaColumn): boolean {
  if (col.is_metadata || col.id.startsWith("META_")) return false;
  // Sólo si el schema fue enriquecido con QP y el tipo es de texto. Sin tipo
  // no asumimos abierta (en Qualtrics ninguna columna trae tipo → no corremos
  // el check de abiertas ahí, que es lo correcto: evita falsos positivos sobre
  // preguntas cerradas).
  return typeof col.qp_question_type === "string" && TEXT_TYPE_RE.test(col.qp_question_type);
}

/** Columna que contiene la IP del encuestado, o null si no la identificamos. */
export function findIpColumn(schema: VersionSchema): SchemaColumn | null {
  const byId = schema.columns.find((c) => c.id === "META_IP");
  if (byId) return byId;
  // Best-effort para Qualtrics u otros: por id o por texto de columna.
  return (
    schema.columns.find((c) => {
      const id = c.id.toLowerCase();
      const q = (c.question ?? "").toLowerCase();
      return (
        id === "ipaddress" ||
        id === "ip_address" ||
        id === "ip" ||
        q === "ip" ||
        q.includes("ip address") ||
        q.includes("dirección ip")
      );
    }) ?? null
  );
}

/** Columna con la duración de la entrevista (minutos en QP), o null. */
export function findDurationColumn(schema: VersionSchema): SchemaColumn | null {
  const byId = schema.columns.find((c) => c.id === "META_MINUTOS");
  if (byId) return byId;
  return (
    schema.columns.find((c) => {
      const id = c.id.toLowerCase();
      const q = (c.question ?? "").toLowerCase();
      return (
        id.includes("duration") ||
        id === "minutos" ||
        q.includes("duration") ||
        q.includes("duración")
      );
    }) ?? null
  );
}

// ---------------------------------------------------------------------------
// Corrida
// ---------------------------------------------------------------------------

export interface RunDeterministicChecksInput {
  rows: CleaningRow[];
  schema: VersionSchema;
  onLog?: (level: "info" | "warn" | "error", message: string) => void;
}

/**
 * Corre todos los chequeos determinísticos sobre el set completo de filas.
 * Devuelve un mapa `row_id → DeterministicHit` (sólo filas con hallazgo).
 */
export function runDeterministicChecks(
  input: RunDeterministicChecksInput
): Map<string, DeterministicHit> {
  const { rows, schema, onLog } = input;
  const log = onLog ?? (() => {});
  const hits = new Map<string, DeterministicHit>();
  if (rows.length === 0) return hits;

  // Acumula candidatos por fila; al final elegimos el de mayor prioridad.
  const candidates = new Map<string, DeterministicHit[]>();
  const push = (rowId: string, hit: DeterministicHit) => {
    const arr = candidates.get(rowId);
    if (arr) arr.push(hit);
    else candidates.set(rowId, [hit]);
  };

  // --- IP duplicada (cross-row) ---
  const ipCol = findIpColumn(schema);
  if (ipCol) {
    const fieldRows: FieldRow[] = rows.map((r) => ({
      [ipCol.id]: coerceCell(r.data[ipCol.id]),
    }));
    const ipResults = checkIpDuplicates(fieldRows, ipCol.id);
    ipResults.forEach((res, i) => {
      if (!res.duplicada) return;
      const spec = RULE_SPEC[DET_RULE_IP_DUPLICADA];
      push(rows[i].id, {
        ruleId: DET_RULE_IP_DUPLICADA,
        ...spec,
        reason: `Esta IP aparece en ${res.total} respuestas de la base.`,
        friendly_explanation:
          `Recomiendo revisar porque en "${ipCol.question || "IP"}" la dirección ` +
          `se repite en ${res.total} respuestas, lo que puede indicar respuestas ` +
          `duplicadas del mismo dispositivo.`,
        affected_question_ids: [ipCol.id],
      });
    });
  } else {
    log("info", "Pre-IA: no se identificó columna de IP; se omite el chequeo de IPs duplicadas.");
  }

  // --- Duración (cross-row, percentiles) ---
  const durCol = findDurationColumn(schema);
  if (durCol) {
    const fieldRows: FieldRow[] = rows.map((r) => ({
      [durCol.id]: coerceCell(r.data[durCol.id]),
    }));
    const durResults = checkDuration(fieldRows, durCol.id);
    durResults.forEach((res, i) => {
      if (res === "ok") return;
      const ruleId = res === "corta" ? DET_RULE_DURACION_CORTA : DET_RULE_DURACION_LARGA;
      const spec = RULE_SPEC[ruleId];
      const valRaw = rows[i].data[durCol.id];
      const valTxt = valRaw === null || valRaw === undefined ? "?" : String(valRaw);
      push(rows[i].id, {
        ruleId,
        ...spec,
        reason:
          res === "corta"
            ? `Duración ${valTxt}: entre el 5% más bajo de la encuesta.`
            : `Duración ${valTxt}: entre el 5% más alto de la encuesta.`,
        friendly_explanation:
          res === "corta"
            ? `Recomiendo revisar porque en "${durCol.question || "Duración"}" esta ` +
              `entrevista fue de las más rápidas (percentil 5 inferior), lo que puede ` +
              `indicar que se completó sin atención.`
            : `Recomiendo revisar porque en "${durCol.question || "Duración"}" esta ` +
              `entrevista fue de las más largas (percentil 95 superior); puede ser ` +
              `normal (pestaña abierta) pero conviene chequear.`,
        affected_question_ids: [durCol.id],
      });
    });
  } else {
    log("info", "Pre-IA: no se identificó columna de duración; se omite el chequeo de outliers de duración.");
  }

  // --- Respuestas abiertas (per-row, per-column) ---
  const openCols = schema.columns.filter(isConfidentOpenEndedColumn);
  if (openCols.length > 0) {
    for (const row of rows) {
      const repetidos: SchemaColumn[] = [];
      const pocas: SchemaColumn[] = [];
      for (const col of openCols) {
        const raw = row.data[col.id];
        if (raw === null || raw === undefined) continue;
        const s = String(raw).trim();
        if (s === "") continue; // abierta sin responder: no la flagueamos acá
        const r = checkOpenEnded(raw);
        if (r.valid) continue;
        if (r.reason === "caracteres_repetidos") repetidos.push(col);
        else pocas.push(col);
      }
      if (repetidos.length > 0) {
        const spec = RULE_SPEC[DET_RULE_ABIERTA_CARACTERES_REPETIDOS];
        const qs = repetidos.map((c) => c.question || c.id);
        push(row.id, {
          ruleId: DET_RULE_ABIERTA_CARACTERES_REPETIDOS,
          ...spec,
          reason:
            `Respuesta abierta con caracteres repetidos (galimatías) en ` +
            `${qs.length === 1 ? `"${qs[0]}"` : `${qs.length} preguntas`}.`,
          friendly_explanation:
            `Recomiendo eliminar porque en ${
              qs.length === 1 ? `"${qs[0]}"` : "una o más preguntas abiertas"
            } la respuesta es texto sin sentido (un mismo carácter repetido muchas veces).`,
          affected_question_ids: repetidos.map((c) => c.id),
        });
      } else if (pocas.length > 0) {
        const spec = RULE_SPEC[DET_RULE_ABIERTA_POCAS_PALABRAS];
        const qs = pocas.map((c) => c.question || c.id);
        push(row.id, {
          ruleId: DET_RULE_ABIERTA_POCAS_PALABRAS,
          ...spec,
          reason:
            `Respuesta abierta con menos de 3 palabras en ` +
            `${qs.length === 1 ? `"${qs[0]}"` : `${qs.length} preguntas`}.`,
          friendly_explanation:
            `Recomiendo revisar porque en ${
              qs.length === 1 ? `"${qs[0]}"` : "una o más preguntas abiertas"
            } la respuesta tiene menos de 3 palabras y la pregunta es abierta.`,
          affected_question_ids: pocas.map((c) => c.id),
        });
      }
    }
  }

  // --- Resolución: un flag por fila (mayor prioridad) ---
  for (const [rowId, arr] of candidates) {
    let best = arr[0];
    for (const h of arr) {
      const a = RULE_SPEC[h.ruleId]?.priority ?? 0;
      const b = RULE_SPEC[best.ruleId]?.priority ?? 0;
      if (a > b) best = h;
    }
    hits.set(rowId, best);
  }

  if (hits.size > 0) {
    const byRule = new Map<string, number>();
    for (const h of hits.values()) byRule.set(h.ruleId, (byRule.get(h.ruleId) ?? 0) + 1);
    const summary = [...byRule.entries()].map(([r, n]) => `${r}=${n}`).join(", ");
    log("info", `Pre-IA: ${hits.size}/${rows.length} filas flagueadas determinísticamente (${summary}).`);
  } else {
    log("info", `Pre-IA: ninguna fila flagueada por chequeos determinísticos.`);
  }

  return hits;
}

/** Convierte un hallazgo determinístico al shape `AnalyzeResult` (para `saveFlags`). */
export function deterministicHitToResult(
  hit: DeterministicHit,
  row: CleaningRow
): AnalyzeResult {
  return {
    row_id: row.id,
    row_number: row.row_number,
    flag: hit.flag_type,
    reason: hit.reason,
    matched_rules: [hit.ruleId],
    confidence: hit.confidence,
    friendly_explanation: hit.friendly_explanation,
    recommendation: hit.recommendation,
    affected_question_ids: hit.affected_question_ids,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** `cleaning_rows.data` es `unknown` por celda; field-checks espera escalares. */
function coerceCell(v: unknown): string | number | null | undefined {
  if (v === null || v === undefined) return v as null | undefined;
  if (typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

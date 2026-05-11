/**
 * Chequeos determinísticos para QC de bases de respuestas (capa "pre-IA").
 *
 * Port de `field-checks.ts` de survey-qc-app — funciones puras (sin side
 * effects, sin I/O) para que sean fáciles de testear y razonar. La capa de
 * integración (`pre-ai-checks.ts`) decide qué columnas pasar a cada función,
 * coercer tipos y mapear los resultados a flags.
 *
 * v1 sólo porta: IPs duplicadas, duración (percentiles 5/95) y validación de
 * respuestas abiertas. Straight-lining y "otros (especificar) pre-codificado"
 * quedan para una iteración posterior (necesitan agrupar columnas de matriz /
 * marcar manualmente la columna "otros" — info que el schema hoy no trae).
 */

export type FieldRow = Record<string, string | number | null | undefined>;

// IDs de las reglas que puede emitir esta capa. Se mantienen separados de las
// reglas de IA: `getMaxProcessedRow` los usa para no contar como "procesada por
// IA" una fila que sólo tiene un flag determinístico (ver cleaning-repository).
export const DET_RULE_IP_DUPLICADA = "ip_duplicada";
export const DET_RULE_DURACION_CORTA = "duracion_corta";
export const DET_RULE_DURACION_LARGA = "duracion_larga";
export const DET_RULE_ABIERTA_POCAS_PALABRAS = "abierta_pocas_palabras";
export const DET_RULE_ABIERTA_CARACTERES_REPETIDOS = "abierta_caracteres_repetidos";

export const DETERMINISTIC_RULE_IDS: ReadonlySet<string> = new Set([
  DET_RULE_IP_DUPLICADA,
  DET_RULE_DURACION_CORTA,
  DET_RULE_DURACION_LARGA,
  DET_RULE_ABIERTA_POCAS_PALABRAS,
  DET_RULE_ABIERTA_CARACTERES_REPETIDOS,
]);

// ---------------------------------------------------------------------------
// IP duplicada
// ---------------------------------------------------------------------------

/**
 * Para cada fila, indica si su IP aparece en otra fila (y cuántas veces en
 * total). Ignora filas con la columna IP vacía o nula.
 */
export function checkIpDuplicates(
  rows: FieldRow[],
  ipColumn: string
): Array<{ duplicada: boolean; total: number; ip: string }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const ip = normalizeStr(row[ipColumn]);
    if (ip) counts.set(ip, (counts.get(ip) ?? 0) + 1);
  }
  return rows.map((row) => {
    const ip = normalizeStr(row[ipColumn]);
    const total = ip ? counts.get(ip) ?? 0 : 0;
    return { duplicada: total > 1, total, ip };
  });
}

// ---------------------------------------------------------------------------
// Duración
// ---------------------------------------------------------------------------

/**
 * Clasifica cada fila según si su duración cae en el percentil <5% (corta) o
 * >95% (larga) del conjunto. Filas con duración inválida/ausente → "ok".
 * Necesita al menos 3 valores válidos para que los percentiles tengan sentido.
 */
export function checkDuration(
  rows: FieldRow[],
  durationColumn: string
): Array<"ok" | "corta" | "larga"> {
  const values = rows
    .map((r) => toNumber(r[durationColumn]))
    .filter((v): v is number => v !== null && isFinite(v) && v > 0);

  if (values.length < 3) return rows.map(() => "ok");

  const sorted = [...values].sort((a, b) => a - b);
  const p5 = percentile(sorted, 5);
  const p95 = percentile(sorted, 95);

  return rows.map((row) => {
    const v = toNumber(row[durationColumn]);
    if (v === null || !isFinite(v) || v <= 0) return "ok";
    if (v < p5) return "corta";
    if (v > p95) return "larga";
    return "ok";
  });
}

// ---------------------------------------------------------------------------
// Respuestas abiertas
// ---------------------------------------------------------------------------

export interface OpenEndedCheck {
  valid: boolean;
  reason?: "pocas_palabras" | "caracteres_repetidos";
}

/**
 * Valida una respuesta abierta:
 *  - menos de 3 palabras → inválida ("pocas_palabras")
 *  - mismo carácter repetido ≥5 veces seguidas → inválida ("caracteres_repetidos")
 * Una respuesta vacía cuenta como "pocas_palabras" (0 palabras) — el caller
 * decide si una columna abierta sin responder amerita flag o no.
 */
export function checkOpenEnded(value: unknown): OpenEndedCheck {
  const str = normalizeStr(value);
  if (/(.)\1{4,}/.test(str)) {
    return { valid: false, reason: "caracteres_repetidos" };
  }
  const words = str ? str.split(/\s+/).filter(Boolean) : [];
  if (words.length < 3) return { valid: false, reason: "pocas_palabras" };
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

function normalizeStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

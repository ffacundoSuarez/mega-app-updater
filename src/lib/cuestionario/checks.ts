/**
 * Checks deterministicos del Validador de Cuestionarios.
 *
 * Funciones puras sobre un Questionnaire canónico: cada check toma el
 * cuestionario completo y devuelve un array de issues. No hay I/O, no hay
 * dependencia con OpenAI ni con Supabase — eso vive en `validation-job.ts`.
 *
 * Convenciones:
 *   - Severidades:
 *       error        → bloquea publicación; la encuesta no funciona así.
 *       advertencia  → puede ser intencional, pero conviene revisar.
 *       sugerencia   → mejora opcional.
 *   - Categorías: matchean a IssueCategory en types.ts.
 *   - Un issue con `pregunta_id === null` se considera global y se renderiza
 *     en la sección "globales" del reporte.
 *
 * Los checks semánticos con IA viven aparte (Iteración 3, `ai-checks.ts`).
 */

import type { QCIssue, Question, Questionnaire } from "./types";

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

/** Corre todos los checks deterministicos en orden y devuelve los issues. */
export function runDeterministicChecks(q: Questionnaire): QCIssue[] {
  const issues: QCIssue[] = [];
  issues.push(...checkDuplicateQuestionIds(q));
  issues.push(...checkQuestionShape(q));
  issues.push(...checkOptionShape(q));
  issues.push(...checkDuplicateOptionCodes(q));
  issues.push(...checkDuplicateOptionTexts(q));
  issues.push(...checkScaleRanges(q));
  issues.push(...checkMatrixEnunciados(q));
  issues.push(...checkConditionReferences(q));
  issues.push(...checkFlowDestinations(q));
  issues.push(...checkCircularFlows(q));
  issues.push(...checkUnreachableQuestions(q));
  issues.push(...checkSectionReferences(q));
  return issues;
}

// ---------------------------------------------------------------------------
// Estructura: IDs duplicados y forma básica
// ---------------------------------------------------------------------------

function checkDuplicateQuestionIds(q: Questionnaire): QCIssue[] {
  const seen = new Map<string, number>();
  const dupes = new Set<string>();
  for (const p of q.preguntas) {
    const id = p.id.trim();
    if (!id) continue; // se reporta en checkQuestionShape
    const count = (seen.get(id) ?? 0) + 1;
    seen.set(id, count);
    if (count >= 2) dupes.add(id);
  }
  return [...dupes].map((id) => ({
    pregunta_id: id,
    severidad: "error" as const,
    categoria: "estructura" as const,
    descripcion: `El ID "${id}" se repite en más de una pregunta. Los IDs deben ser únicos.`,
  }));
}

function checkQuestionShape(q: Questionnaire): QCIssue[] {
  const issues: QCIssue[] = [];
  for (const p of q.preguntas) {
    if (!p.id.trim()) {
      issues.push({
        pregunta_id: null,
        severidad: "error",
        categoria: "estructura",
        descripcion: `La pregunta en posición ${p.numero} no tiene ID asignado.`,
      });
    }
    if (!p.texto.trim()) {
      issues.push({
        pregunta_id: p.id || null,
        severidad: "error",
        categoria: "estructura",
        descripcion: `La pregunta ${p.id || `#${p.numero}`} no tiene texto.`,
      });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Estructura de opciones
// ---------------------------------------------------------------------------

function checkOptionShape(q: Questionnaire): QCIssue[] {
  const issues: QCIssue[] = [];
  for (const p of q.preguntas) {
    if (!isOptionedType(p)) continue;
    p.opciones.forEach((opt, i) => {
      if (!opt.texto.trim()) {
        issues.push({
          pregunta_id: p.id,
          severidad: "error",
          categoria: "estructura",
          descripcion: `La opción ${i + 1} de la pregunta ${p.id} no tiene texto.`,
        });
      }
      // codigo === 0 puede ser legítimo, pero igual lo flagueamos como sugerencia
      // si la opción tiene texto pero código 0: probable que el parser no lo asignó.
      if (opt.codigo === 0 && opt.texto.trim().length > 0) {
        issues.push({
          pregunta_id: p.id,
          severidad: "sugerencia",
          categoria: "estructura",
          descripcion: `La opción "${truncate(opt.texto, 40)}" de la pregunta ${p.id} tiene código 0. ¿Es intencional?`,
        });
      }
    });
    if (p.opciones.length === 0) {
      issues.push({
        pregunta_id: p.id,
        severidad: "error",
        categoria: "estructura",
        descripcion: `La pregunta ${p.id} es de tipo ${p.tipo} pero no tiene opciones.`,
      });
    }
  }
  return issues;
}

function checkDuplicateOptionCodes(q: Questionnaire): QCIssue[] {
  const issues: QCIssue[] = [];
  for (const p of q.preguntas) {
    if (!isOptionedType(p)) continue;
    const seen = new Map<number, number>();
    const dupes = new Set<number>();
    for (const opt of p.opciones) {
      const c = (seen.get(opt.codigo) ?? 0) + 1;
      seen.set(opt.codigo, c);
      if (c >= 2) dupes.add(opt.codigo);
    }
    for (const code of dupes) {
      issues.push({
        pregunta_id: p.id,
        severidad: "error",
        categoria: "estructura",
        descripcion: `El código ${code} se repite en más de una opción de la pregunta ${p.id}.`,
      });
    }
  }
  return issues;
}

function checkDuplicateOptionTexts(q: Questionnaire): QCIssue[] {
  const issues: QCIssue[] = [];
  for (const p of q.preguntas) {
    if (!isOptionedType(p)) continue;
    const norm = (s: string) => s.trim().toLowerCase();
    const seen = new Map<string, number>();
    const dupes = new Set<string>();
    for (const opt of p.opciones) {
      const t = norm(opt.texto);
      if (!t) continue;
      const c = (seen.get(t) ?? 0) + 1;
      seen.set(t, c);
      if (c >= 2) dupes.add(t);
    }
    for (const t of dupes) {
      issues.push({
        pregunta_id: p.id,
        severidad: "advertencia",
        categoria: "estructura",
        descripcion: `La pregunta ${p.id} tiene opciones con el mismo texto ("${truncate(t, 40)}"). Puede ser intencional, pero conviene revisar.`,
      });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Rangos / matrices
// ---------------------------------------------------------------------------

function checkScaleRanges(q: Questionnaire): QCIssue[] {
  const issues: QCIssue[] = [];
  for (const p of q.preguntas) {
    if (p.tipo !== "escala" && p.tipo !== "numerica") continue;
    const { min, max } = p;
    if (min !== undefined && max !== undefined && min >= max) {
      issues.push({
        pregunta_id: p.id,
        severidad: "error",
        categoria: "rangos",
        descripcion: `El rango de la pregunta ${p.id} es inválido: min=${min} debe ser menor a max=${max}.`,
      });
    }
    if (p.tipo === "escala" && (min === undefined || max === undefined)) {
      issues.push({
        pregunta_id: p.id,
        severidad: "advertencia",
        categoria: "rangos",
        descripcion: `La escala ${p.id} no tiene min/max definidos.`,
      });
    }
  }
  return issues;
}

function checkMatrixEnunciados(q: Questionnaire): QCIssue[] {
  const issues: QCIssue[] = [];
  for (const p of q.preguntas) {
    if (p.tipo !== "matriz") continue;
    const cant = p.enunciados?.length ?? 0;
    if (cant <= 1) {
      issues.push({
        pregunta_id: p.id,
        severidad: "advertencia",
        categoria: "estructura",
        descripcion: `La matriz ${p.id} tiene ${cant} enunciado${cant === 1 ? "" : "s"}. Una matriz necesita al menos 2 filas para tener sentido.`,
      });
    }
    if (p.opciones.length === 0) {
      issues.push({
        pregunta_id: p.id,
        severidad: "error",
        categoria: "estructura",
        descripcion: `La matriz ${p.id} no tiene opciones (columnas).`,
      });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Referencias y flujo
// ---------------------------------------------------------------------------

/** Detecta `condicion: "P99=1"` cuando P99 no existe en el cuestionario. */
function checkConditionReferences(q: Questionnaire): QCIssue[] {
  const ids = new Set(q.preguntas.map((p) => p.id));
  const issues: QCIssue[] = [];
  for (const p of q.preguntas) {
    const cond = p.condicion.trim();
    if (!cond) continue;
    const refs = extractIdRefs(cond);
    for (const ref of refs) {
      if (!ids.has(ref)) {
        issues.push({
          pregunta_id: p.id,
          severidad: "error",
          categoria: "logica",
          descripcion: `La condición de la pregunta ${p.id} (\`${cond}\`) referencia a "${ref}", pero esa pregunta no existe.`,
        });
      }
    }
  }
  return issues;
}

/** Detecta `flujo.saltar_a` o `option.flujo = "saltar_a X"` cuando X no existe. */
function checkFlowDestinations(q: Questionnaire): QCIssue[] {
  const ids = new Set(q.preguntas.map((p) => p.id));
  const issues: QCIssue[] = [];
  for (const p of q.preguntas) {
    for (const rule of p.flujo) {
      if (rule.accion === "saltar_a") {
        const dest = (rule.destino ?? "").trim();
        if (!dest) {
          issues.push({
            pregunta_id: p.id,
            severidad: "error",
            categoria: "logica",
            descripcion: `La pregunta ${p.id} tiene una regla "saltar_a" sin destino especificado.`,
          });
        } else if (!ids.has(dest)) {
          issues.push({
            pregunta_id: p.id,
            severidad: "error",
            categoria: "logica",
            descripcion: `La pregunta ${p.id} salta a "${dest}", que no existe en el cuestionario.`,
          });
        }
      }
    }
    for (const opt of p.opciones) {
      const dest = parseSaltarAFromOptionFlujo(opt.flujo);
      if (dest && !ids.has(dest)) {
        issues.push({
          pregunta_id: p.id,
          severidad: "error",
          categoria: "logica",
          descripcion: `La opción "${truncate(opt.texto, 40)}" de la pregunta ${p.id} salta a "${dest}", que no existe.`,
        });
      }
    }
  }
  return issues;
}

/**
 * Detecta ciclos en el grafo dirigido construido a partir de:
 *   - regla `saltar_a` a nivel pregunta,
 *   - opción con flujo `saltar_a <id>`.
 *
 * Las aristas "default a la siguiente" NO se consideran ciclo (el orden del
 * cuestionario es lineal y eso lo cubre `checkUnreachableQuestions`).
 */
function checkCircularFlows(q: Questionnaire): QCIssue[] {
  const graph = buildSaltarAGraph(q);
  const cycles = findCycles(graph);
  return cycles.map((path) => ({
    pregunta_id: path[0] ?? null,
    severidad: "error" as const,
    categoria: "logica" as const,
    descripcion: `Bucle de flujo detectado: ${path.join(" → ")} → ${path[0]}. El cuestionario nunca termina por esta vía.`,
  }));
}

/**
 * Marca preguntas inalcanzables. Reachability se calcula como una BFS desde
 * la primera pregunta del orden, siguiendo:
 *   - default-next (de la pregunta N a N+1) salvo que TODAS las salidas sean
 *     terminantes o saltos.
 *   - regla de pregunta `saltar_a` → destino.
 *   - opción con `saltar_a <id>` → destino.
 *
 * Es conservadora: no analiza la `condicion` de cada pregunta, así que una
 * pregunta dependiente de un valor imposible se marca como alcanzable. Está
 * bien: los checks semánticos con IA pueden detectar ese caso.
 */
function checkUnreachableQuestions(q: Questionnaire): QCIssue[] {
  if (q.preguntas.length <= 1) return [];

  const order = q.preguntas.map((p) => p.id);
  const indexOf = new Map(order.map((id, i) => [id, i] as const));
  const reachable = new Set<string>();
  const stack: string[] = [order[0]];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const p = q.preguntas[indexOf.get(id)!];
    const { hasTerminator, jumpTargets, allOptionsExit } = analyzeExits(p);

    for (const dest of jumpTargets) {
      if (indexOf.has(dest)) stack.push(dest);
    }
    // Default-next: existe a menos que toda salida sea "terminar" o las opciones
    // sean todas exit (terminar o saltar_a).
    const nextIndex = indexOf.get(id)! + 1;
    const canFallThrough = !hasTerminator && !allOptionsExit;
    if (canFallThrough && nextIndex < order.length) {
      stack.push(order[nextIndex]);
    }
  }

  const issues: QCIssue[] = [];
  for (const p of q.preguntas) {
    if (!reachable.has(p.id)) {
      issues.push({
        pregunta_id: p.id,
        severidad: "advertencia",
        categoria: "logica",
        descripcion: `La pregunta ${p.id} parece inalcanzable: ningún flujo del cuestionario llega a ella. Verificá los saltos y el orden.`,
      });
    }
  }
  return issues;
}

function checkSectionReferences(q: Questionnaire): QCIssue[] {
  if (q.secciones.length === 0) return [];
  const ids = new Set(q.preguntas.map((p) => p.id));
  const issues: QCIssue[] = [];
  for (const sec of q.secciones) {
    for (const pid of sec.preguntas) {
      if (!ids.has(pid)) {
        issues.push({
          pregunta_id: null,
          severidad: "error",
          categoria: "estructura",
          descripcion: `La sección "${sec.nombre}" referencia a la pregunta "${pid}", que no existe.`,
        });
      }
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isOptionedType(p: Question): boolean {
  return (
    p.tipo === "cerrada_unica" ||
    p.tipo === "cerrada_multiple" ||
    p.tipo === "ranking" ||
    p.tipo === "matriz" ||
    p.tipo === "escala"
  );
}

/**
 * Extrae IDs referenciados en una expresión de condición. Pattern simple:
 * cualquier secuencia alfanumérica que arranca con letra (ej. "S1", "P12",
 * "F5b") y NO es un operador/keyword común. Sirve para "S1=3 AND P2>2".
 */
function extractIdRefs(expr: string): string[] {
  const out = new Set<string>();
  const tokens = expr.match(/[A-Za-z][A-Za-z0-9_]*/g) ?? [];
  const KEYWORDS = new Set([
    "AND",
    "OR",
    "NOT",
    "and",
    "or",
    "not",
    "Y",
    "O",
    "y",
    "o",
    "true",
    "false",
    "TRUE",
    "FALSE",
  ]);
  for (const t of tokens) {
    if (KEYWORDS.has(t)) continue;
    out.add(t);
  }
  return [...out];
}

/** Si `opt.flujo` arranca con "saltar_a", devuelve el id destino limpio. */
function parseSaltarAFromOptionFlujo(flujo: string): string | null {
  const m = flujo.trim().match(/^saltar_a\s+([A-Za-z0-9_]+)$/);
  return m ? m[1] : null;
}

/** Salidas explícitas: terminadores + saltos (todas con destino conocido). */
function analyzeExits(p: Question): {
  hasTerminator: boolean;
  jumpTargets: string[];
  allOptionsExit: boolean;
} {
  let hasTerminator = false;
  const jumpTargets: string[] = [];
  for (const rule of p.flujo) {
    if (rule.accion === "terminar") hasTerminator = true;
    if (rule.accion === "saltar_a" && rule.destino) jumpTargets.push(rule.destino);
  }
  let allOptionsExit = false;
  if (p.opciones.length > 0) {
    allOptionsExit = p.opciones.every((opt) => {
      const f = opt.flujo.trim();
      if (f === "terminar") return true;
      const dest = parseSaltarAFromOptionFlujo(f);
      if (dest) {
        jumpTargets.push(dest);
        return true;
      }
      return false;
    });
  }
  return { hasTerminator, jumpTargets, allOptionsExit };
}

/** Construye un grafo dirigido sólo con las aristas explícitas de saltar_a. */
function buildSaltarAGraph(q: Questionnaire): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const ids = new Set(q.preguntas.map((p) => p.id));
  for (const p of q.preguntas) {
    const dests = new Set<string>();
    for (const rule of p.flujo) {
      if (rule.accion === "saltar_a" && rule.destino && ids.has(rule.destino)) {
        dests.add(rule.destino);
      }
    }
    for (const opt of p.opciones) {
      const dest = parseSaltarAFromOptionFlujo(opt.flujo);
      if (dest && ids.has(dest)) dests.add(dest);
    }
    graph.set(p.id, dests);
  }
  return graph;
}

/**
 * Devuelve uno o más ciclos detectados como caminos (sólo la rotación que
 * arranca en el primer nodo descubierto del ciclo). Implementación clásica
 * de DFS con colores blanco/gris/negro.
 */
function findCycles(graph: Map<string, Set<string>>): string[][] {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const cycles: string[][] = [];
  const reported = new Set<string>();

  for (const start of graph.keys()) {
    if ((color.get(start) ?? WHITE) !== WHITE) continue;
    const stack: string[] = [start];
    parent.set(start, null);
    while (stack.length > 0) {
      const node = stack[stack.length - 1];
      if ((color.get(node) ?? WHITE) === WHITE) color.set(node, GRAY);

      const neighbors = graph.get(node) ?? new Set<string>();
      let descended = false;
      for (const next of neighbors) {
        const c = color.get(next) ?? WHITE;
        if (c === WHITE) {
          parent.set(next, node);
          stack.push(next);
          descended = true;
          break;
        }
        if (c === GRAY) {
          const path = reconstructCycle(parent, node, next);
          const key = canonicalCycleKey(path);
          if (!reported.has(key)) {
            cycles.push(path);
            reported.add(key);
          }
        }
      }
      if (!descended) {
        color.set(node, BLACK);
        stack.pop();
      }
    }
  }
  return cycles;
}

function reconstructCycle(
  parent: Map<string, string | null>,
  from: string,
  to: string
): string[] {
  const path: string[] = [from];
  let cur: string | null | undefined = from;
  while (cur && cur !== to) {
    cur = parent.get(cur) ?? null;
    if (cur) path.push(cur);
    if (path.length > 64) break;
  }
  return path.reverse();
}

/** Clave canónica para deduplicar ciclos (mismo ciclo en distintas rotaciones). */
function canonicalCycleKey(path: string[]): string {
  if (path.length === 0) return "";
  const minIdx = path.indexOf([...path].sort()[0]);
  const rotated = [...path.slice(minIdx), ...path.slice(0, minIdx)];
  return rotated.join("→");
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

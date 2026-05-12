/**
 * Sugerencias de reglas de limpieza derivadas del schema de la versión.
 *
 * Port directo de `mega-dashboard/src/lib/cleaning-rule-suggestions.ts`.
 *
 * Hay dos tipos de sugerencias:
 *
 *   - **Heurísticas** (`source: 'heuristic'`): determinísticas, sin IA. Iteran
 *     sobre las columnas de pregunta y, según `qp_question_type` (cuando hay
 *     enriquecimiento QP) o el texto del header, proponen reglas estándar
 *     (texto corto, repetidos, straight-lining, "otros/especifique").
 *     Cubren la mayoría de casos comunes y son gratis.
 *
 *   - **IA de coherencia** (`source: 'openai'`): se generan en
 *     `suggest-rules.ts` con OpenAI y se filtran luego con
 *     `scrubCoherenceRuleSuggestions` para asegurar que sólo referencien
 *     `@columnId` que existan en el schema.
 *
 * El usuario después acepta o rechaza cada sugerencia en la UI antes de
 * persistirlas como reglas custom (con `ai_generated: true`, `ai_reasoning`).
 */

import type { SchemaColumn, VersionSchema } from "./types";

export type CleaningRuleSuggestionSource = "heuristic" | "openai";

export interface CleaningRuleSuggestion {
  description: string;
  ai_reasoning: string;
  source: CleaningRuleSuggestionSource;
}

function isQuestionColumn(c: SchemaColumn): boolean {
  if (c.is_metadata) return false;
  if (String(c.id).startsWith("META_")) return false;
  return true;
}

/**
 * Construye sugerencias deterministas basadas en tipo de pregunta y texto.
 * No llama a IA. Usa `qp_question_type` cuando está disponible (proyectos QP
 * enriquecidos); si no, cae al texto del header (`question`).
 */
export function buildHeuristicCleaningRuleSuggestions(
  schema: VersionSchema
): CleaningRuleSuggestion[] {
  const questionCols = schema.columns.filter(isQuestionColumn);
  const out: CleaningRuleSuggestion[] = [];
  const seen = new Set<string>();

  const push = (description: string, reasoning: string) => {
    if (seen.has(description)) return;
    seen.add(description);
    out.push({ description, ai_reasoning: reasoning, source: "heuristic" });
  };

  for (const col of questionCols) {
    const t = (col.qp_question_type || "").toLowerCase();
    const qtext = (col.question || "").toLowerCase();
    const id = col.id;

    const isOpen =
      /text|essay|comment|open|nps_comment|multi_text|long|textarea/i.test(t) ||
      /\bcomentario|expl[íi]ca|explique|describe|describa|opina|opine|por\s+qu[ée]|porque|cu[ée]ntenos/i.test(
        qtext
      );

    const isScaleOrMatrix =
      /matrix|scale|ranking|rating|slider|grid|likert/i.test(t) ||
      /\bescala\b|matriz/i.test(qtext);

    const hasOtrosOption =
      col.qp_options?.some((o) =>
        /otros?|especifique|especificar|\bother\b/i.test(o.text)
      ) ?? false;

    if (isOpen) {
      push(
        `Marcar si @${id} tiene menos de 10 caracteres o solo espacios en blanco.`,
        "Pregunta abierta: respuestas demasiado cortas suelen ser de baja calidad."
      );
      push(
        `Marcar si @${id} repite el mismo carácter muchas veces seguidas (ej. "aaaaa" o "-----").`,
        "Patrón asociado a respuestas poco serias o pegadas."
      );
    }

    if (isScaleOrMatrix) {
      push(
        `Revisar si en @${id} el respondente elige siempre la misma columna u opción en toda la escala o matriz (straight-lining).`,
        "Escalas y matrices: falta de variación puede indicar satisficing."
      );
    }

    if (hasOtrosOption) {
      push(
        `Si en @${id} se elige la opción "Otro" o "Especifique", verificar que el texto libre no duplique el sentido de las opciones fijas.`,
        'Opción "otro/especificar": texto redundante con alternativas codificadas.'
      );
    }
  }

  return out;
}

/**
 * Filtra sugerencias de coherencia (IA): se quedan sólo las que referencian
 * `@columnId` que existan realmente en el schema de la versión. Evita que
 * errores del modelo (IDs inventados) lleguen a la UI / DB.
 */
export function scrubCoherenceRuleSuggestions(
  suggestions: CleaningRuleSuggestion[],
  validColumnIds: Set<string>
): CleaningRuleSuggestion[] {
  return suggestions.filter((s) => {
    const mentions = [...s.description.matchAll(/@(\w+)/g)].map((m) => m[1]);
    if (mentions.length === 0) return false;
    return mentions.every((id) => validColumnIds.has(id));
  });
}

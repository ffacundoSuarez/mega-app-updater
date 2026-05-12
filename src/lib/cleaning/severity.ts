/**
 * Severidad de un flag para la UI del review (idea 2 del rediseño 5.B).
 *
 * Combina la confianza del modelo con el "peso" de la recomendación en un
 * score 0..1 y lo mapea a uno de cuatro colores. Sirve para ordenar la lista
 * de flags (primero los rojos) y para el punto de color de cada ítem.
 *
 * No toca DB: es pura presentación derivada de campos que ya existen en
 * `cleaning_flags` (`confidence`, `recommendation`, `flag_type`).
 */

import type { FlagRecommendation, FlagType } from "./types";

export type RuleColor = "red" | "orange" | "yellow" | "green";

const RECOMMENDATION_WEIGHT: Record<FlagRecommendation & string, number> = {
  remove: 1,
  review: 0.6,
  keep: 0.25,
};

/** Recomendación efectiva: la del modelo o, si es null, inferida del flag_type. */
export function effectiveRecommendation(flag: {
  recommendation: FlagRecommendation | null;
  flag_type: FlagType;
}): "remove" | "review" | "keep" {
  return flag.recommendation ?? (flag.flag_type === "red" ? "remove" : "review");
}

/** Score 0..1 = confianza × peso(recomendación efectiva). */
export function flagSeverityScore(flag: {
  confidence: number;
  recommendation: FlagRecommendation | null;
  flag_type: FlagType;
}): number {
  const conf =
    typeof flag.confidence === "number"
      ? Math.max(0, Math.min(1, flag.confidence))
      : 0.5;
  return conf * RECOMMENDATION_WEIGHT[effectiveRecommendation(flag)];
}

export function scoreToRuleColor(score: number): RuleColor {
  if (score >= 0.7) return "red";
  if (score >= 0.45) return "orange";
  if (score >= 0.25) return "yellow";
  return "green";
}

/** Color de severidad directo desde el flag. */
export function flagColor(flag: {
  confidence: number;
  recommendation: FlagRecommendation | null;
  flag_type: FlagType;
}): RuleColor {
  return scoreToRuleColor(flagSeverityScore(flag));
}

/** Orden de prioridad para ordenar la lista (mayor = arriba). */
export const RULE_COLOR_RANK: Record<RuleColor, number> = {
  red: 3,
  orange: 2,
  yellow: 1,
  green: 0,
};

/** Etiqueta humana del color. */
export const RULE_COLOR_LABEL: Record<RuleColor, string> = {
  red: "Crítico",
  orange: "Alto",
  yellow: "Medio",
  green: "Bajo",
};

/** Clases Tailwind para el punto/acento de cada color. */
export const RULE_COLOR_DOT: Record<RuleColor, string> = {
  red: "bg-red-500",
  orange: "bg-orange-500",
  yellow: "bg-amber-400",
  green: "bg-emerald-500",
};

/** Clases para resaltar el ítem activo / borde de acento. */
export const RULE_COLOR_ACCENT: Record<RuleColor, string> = {
  red: "border-l-red-500",
  orange: "border-l-orange-500",
  yellow: "border-l-amber-400",
  green: "border-l-emerald-500",
};

/** Clases para chips/pills de severidad (texto + fondo + borde). */
export const RULE_COLOR_PILL: Record<RuleColor, string> = {
  red: "bg-red-500/15 text-red-300 border-red-500/40",
  orange: "bg-orange-500/15 text-orange-300 border-orange-500/40",
  yellow: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
};

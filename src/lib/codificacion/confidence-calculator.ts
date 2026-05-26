/**
 * Cálculo heurístico de confianza post-clasificación IA.
 */

import {
  containsKeyword,
  isEmpty,
  isSuspiciouslyShort,
  normalizeText,
} from "./text-normalizer";
import type { Category } from "./types";

export function calculateConfidence(
  response: string,
  categoryId: number,
  allCategoryIds: number[],
  availableCategories: Category[]
): number {
  let confidence = 0.5;
  const category = availableCategories.find((c) => c.category_id === categoryId);
  const normalizedResponse = normalizeText(response);

  if (isEmpty(response)) {
    return categoryId === 998 ? 0.95 : 0.15;
  }

  if (category && containsKeyword(response, category.name)) {
    confidence += 0.35;
    if (normalizedResponse === normalizeText(category.name)) {
      confidence += 0.15;
    }
  }

  const responseLength = normalizedResponse.length;
  if (responseLength >= 3 && responseLength <= 50) {
    confidence += 0.1;
  } else if (responseLength > 50) {
    confidence += 0.05;
  } else if (isSuspiciouslyShort(response, 2)) {
    confidence -= 0.2;
  }

  if (allCategoryIds.length > 1) {
    confidence -= 0.1 * (allCategoryIds.length - 1);
  }

  if (categoryId === 998) {
    const emptyLike = ["no se", "no sé", "no conozco", "ninguna", "no aplica", "n/a"];
    if (emptyLike.some((p) => normalizedResponse.includes(p))) {
      confidence += 0.25;
    } else if (normalizedResponse.length > 5) {
      confidence -= 0.3;
    }
  } else if (categoryId === 999) {
    confidence = Math.min(confidence, 0.7);
    if (responseLength > 10) confidence += 0.1;
  }

  const uncertaintyWords = ["creo", "tal vez", "quizas", "quizás", "maybe", "perhaps", "not sure"];
  if (uncertaintyWords.some((w) => normalizedResponse.includes(w))) {
    confidence -= 0.15;
  }

  const genericWords = ["bueno", "bien", "ok", "fine", "normal", "regular"];
  if (
    genericWords.some(
      (w) => normalizedResponse === w || normalizedResponse === `muy ${w}`
    )
  ) {
    confidence -= 0.2;
  }

  if (/[A-Z][a-z]+/.test(response) && category) {
    confidence += 0.1;
  }

  confidence = Math.max(0.1, Math.min(0.95, confidence));
  return Math.round(confidence * 100) / 100;
}

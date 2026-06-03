/**
 * Normalización de texto para clasificación (port de Lightsail).
 */

export function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isEmpty(text: string): boolean {
  if (!text) return true;
  const normalized = normalizeText(text);
  const emptyPatterns = [
    "",
    "n/a",
    "na",
    "null",
    "nil",
    "none",
    "nothing",
    "empty",
    "blank",
    "no",
    "no response",
    "sin respuesta",
    "no responde",
    "no aplica",
    "no answer",
    "not applicable",
    "-",
    "--",
    "---",
    "_",
    ".",
    "...",
    "?",
    "??",
    "xxx",
    "x",
  ];
  return emptyPatterns.includes(normalized) || normalized.length <= 1;
}

export function isSuspiciouslyShort(text: string, minLength = 2): boolean {
  if (!text) return true;
  return normalizeText(text).length <= minLength;
}

export function containsKeyword(response: string, keyword: string): boolean {
  const normalizedResponse = normalizeText(response);
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedResponse || !normalizedKeyword) return false;
  if (normalizedResponse === normalizedKeyword) return true;
  const wordBoundaryRegex = new RegExp(
    `\\b${escapeRegex(normalizedKeyword)}\\b`,
    "i"
  );
  return wordBoundaryRegex.test(normalizedResponse);
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

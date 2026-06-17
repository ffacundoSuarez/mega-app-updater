/**
 * Extracción de texto desde `.docx` en dos canales para el parser de cuestionarios.
 *
 * Los Word de Mega Research marcan instrucciones de programación en rojo (RU, RM,
 * ROTAR, PROGRAMACIÓN, etc.). Ese texto no va al encuestado pero la IA lo necesita
 * para inferir tipo, aleatorizar, condiciones y flujo.
 *
 * - `visibleText`: runs sin color rojo → enunciados y opciones.
 * - `programmerHints`: runs rojos → metadata para el prompt (bloque aparte).
 */

import JSZip from "jszip";

export interface DocxExtractResult {
  /** Texto que ve el participante (sin instrucciones en rojo). */
  visibleText: string;
  /** Instrucciones de programación extraídas de runs rojos. */
  programmerHints: string;
}

/**
 * Lee `word/document.xml` del docx y separa texto visible vs. hints en rojo.
 */
export async function extractDocxForParsing(
  arrayBuffer: ArrayBuffer
): Promise<DocxExtractResult> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const entry = zip.file("word/document.xml");
  if (!entry) {
    throw new Error("El archivo Word no contiene word/document.xml.");
  }
  const xml = await entry.async("text");
  return parseDocumentXml(xml);
}

/** Expuesto para tests unitarios sin zip. */
export function parseDocumentXml(xml: string): DocxExtractResult {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("No se pudo interpretar el XML del Word.");
  }

  const visibleParts: string[] = [];
  const hintParts: string[] = [];

  for (const p of collectWordParagraphs(doc)) {
    const { visible, hints } = extractParagraphChannels(p);
    if (visible.trim()) visibleParts.push(visible.trim());
    if (hints.trim()) hintParts.push(hints.trim());
  }

  return {
    visibleText: visibleParts.join("\n\n"),
    programmerHints: hintParts.join("\n\n"),
  };
}

/** Recorre el árbol y devuelve párrafos OOXML (`w:p`). */
function collectWordParagraphs(doc: Document): Element[] {
  const out: Element[] = [];
  const walk = (node: Element) => {
    if (node.localName === "p") {
      const ns = node.namespaceURI ?? "";
      if (ns.includes("wordprocessingml")) out.push(node);
    }
    for (const child of node.children) {
      walk(child as Element);
    }
  };
  if (doc.documentElement) walk(doc.documentElement);
  return out;
}

/** Separa runs visibles vs. rojos dentro de un párrafo. */
function extractParagraphChannels(p: Element): { visible: string; hints: string } {
  let visible = "";
  let hints = "";
  let activeColor: string | null = null;

  const walk = (node: Element) => {
    if (node.localName === "r") {
      activeColor = readRunColor(node);
      for (const child of node.children) walk(child as Element);
      activeColor = null;
      return;
    }
    if (node.localName === "t" || node.localName === "delText") {
      const chunk = node.textContent ?? "";
      if (!chunk) return;
      if (isRedColor(activeColor)) hints += chunk;
      else visible += chunk;
      return;
    }
    if (node.localName === "tab") {
      const chunk = "\t";
      if (isRedColor(activeColor)) hints += chunk;
      else visible += chunk;
      return;
    }
    if (node.localName === "br" || node.localName === "cr") {
      const chunk = "\n";
      if (isRedColor(activeColor)) hints += chunk;
      else visible += chunk;
      return;
    }
    for (const child of node.children) walk(child as Element);
  };

  walk(p);
  return { visible, hints };
}

/** Lee `<w:color w:val="..."/>` del run (w:rPr). */
function readRunColor(run: Element): string | null {
  for (const child of run.children) {
    if (child.localName !== "rPr") continue;
    for (const prop of child.children) {
      if (prop.localName === "color") {
        return prop.getAttribute("w:val") ?? prop.getAttribute("val");
      }
    }
  }
  return null;
}

/**
 * Detecta rojos típicos de Word (hex o tonos rojizos).
 * AUTO / negro / grises no cuentan como instrucción de programador.
 */
function isRedColor(colorVal: string | null): boolean {
  if (!colorVal) return false;
  const v = colorVal.trim().toUpperCase();
  if (!v || v === "AUTO" || v === "000000") return false;

  const KNOWN_RED = new Set([
    "FF0000",
    "EE0000",
    "ED0000",
    "C00000",
    "CD0000",
    "C0504D",
    "FF0101",
  ]);
  if (KNOWN_RED.has(v)) return true;

  if (/^[0-9A-F]{6}$/.test(v)) {
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return r >= 160 && g <= 90 && b <= 90;
  }
  return false;
}

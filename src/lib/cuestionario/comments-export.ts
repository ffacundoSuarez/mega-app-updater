/**
 * Exportación de comentarios de validación a Word (.docx).
 *
 * Agrupa por pregunta: enunciado + lista de issues seleccionados.
 * Guardado vía dialog.save + fs.writeFile (mismo patrón que Limpiador Export).
 */

import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type {
  IssueCategory,
  IssueSeverity,
  QCIssue,
  Question,
  Questionnaire,
} from "./types";

const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  error: "Error",
  advertencia: "Advertencia",
  sugerencia: "Sugerencia",
};

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  estructura: "Estructura",
  logica: "Lógica",
  wording: "Wording",
  tipos: "Tipos",
  rangos: "Rangos",
  semantica: "Semántica",
};

/** Item listo para exportar (issue + metadata de pregunta). */
export interface ExportCommentItem {
  key: string;
  pregunta_id: string | null;
  pregunta_numero?: number;
  pregunta_texto?: string;
  issue: QCIssue;
}

/** Genera una clave estable para selección incluir/excluir en la UI. */
export function makeIssueKey(
  scope: "global" | "question",
  scopeId: string,
  index: number,
  issue: QCIssue
): string {
  return `${scope}:${scopeId}:${index}:${issue.severidad}:${issue.categoria}`;
}

/** Aplana globales + por pregunta en una lista con keys. */
export function flattenReportIssues(
  report: {
    issues_globales: QCIssue[];
    issues_por_pregunta: Array<{
      pregunta_id: string;
      pregunta_numero: number;
      pregunta_texto: string;
      issues: QCIssue[];
    }>;
  }
): ExportCommentItem[] {
  const out: ExportCommentItem[] = [];
  report.issues_globales.forEach((issue, i) => {
    out.push({
      key: makeIssueKey("global", "all", i, issue),
      pregunta_id: null,
      issue,
    });
  });
  for (const g of report.issues_por_pregunta) {
    g.issues.forEach((issue, i) => {
      out.push({
        key: makeIssueKey("question", g.pregunta_id, i, issue),
        pregunta_id: g.pregunta_id,
        pregunta_numero: g.pregunta_numero,
        pregunta_texto: g.pregunta_texto,
        issue,
      });
    });
  }
  return out;
}

/**
 * Abre el diálogo de guardado y escribe el .docx con los comentarios
 * seleccionados. Devuelve la ruta guardada o null si el usuario canceló.
 */
export async function saveCommentsDocx(
  questionnaire: Questionnaire,
  items: ExportCommentItem[],
  defaultFileName: string
): Promise<string | null> {
  if (items.length === 0) {
    throw new Error("No hay comentarios seleccionados para exportar.");
  }

  const path = await save({
    defaultPath: defaultFileName,
    filters: [{ name: "Word", extensions: ["docx"] }],
  });
  if (!path) return null;

  const bytes = await buildCommentsDocx(questionnaire, items);
  await writeFile(path, new Uint8Array(bytes));
  return path;
}

async function buildCommentsDocx(
  questionnaire: Questionnaire,
  items: ExportCommentItem[]
): Promise<ArrayBuffer> {
  const byQuestion = new Map<string | null, ExportCommentItem[]>();
  for (const item of items) {
    const bucket = byQuestion.get(item.pregunta_id) ?? [];
    bucket.push(item);
    byQuestion.set(item.pregunta_id, bucket);
  }

  const children: Paragraph[] = [
    new Paragraph({
      text: questionnaire.metadata.titulo || "Cuestionario",
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Comentarios de validación — ${new Date().toLocaleDateString("es-AR")}`,
          italics: true,
        }),
      ],
    }),
    new Paragraph({ text: "" }),
  ];

  const globalItems = byQuestion.get(null);
  if (globalItems && globalItems.length > 0) {
    children.push(
      new Paragraph({ text: "Issues globales", heading: HeadingLevel.HEADING_1 })
    );
    for (const item of globalItems) {
      children.push(...issueParagraphs(item.issue));
    }
  }

  const questionIds = [...byQuestion.keys()].filter((k) => k !== null) as string[];
  const order = questionnaire.preguntas
    .map((p) => p.id)
    .filter((id) => questionIds.includes(id));

  for (const qid of order) {
    const group = byQuestion.get(qid);
    if (!group || group.length === 0) continue;
    const q = questionnaire.preguntas.find((p) => p.id === qid);
    const meta = group[0];

    children.push(
      new Paragraph({
        text: `${qid} · Pregunta ${meta.pregunta_numero ?? q?.numero ?? "?"}`,
        heading: HeadingLevel.HEADING_1,
      })
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: meta.pregunta_texto ?? q?.texto ?? "",
            bold: true,
          }),
        ],
      })
    );
    if (q) {
      children.push(...questionDetailParagraphs(q));
    }
    for (const item of group) {
      children.push(...issueParagraphs(item.issue));
    }
    children.push(new Paragraph({ text: "" }));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toArrayBuffer(doc);
}

function issueParagraphs(issue: QCIssue): Paragraph[] {
  return [
    new Paragraph({
      children: [
        new TextRun({
          text: `[${SEVERITY_LABEL[issue.severidad]} · ${CATEGORY_LABEL[issue.categoria]}] `,
          bold: true,
        }),
        new TextRun({ text: issue.descripcion }),
      ],
    }),
  ];
}

/** Resumen breve de opciones/tipo para el Word exportado. */
function questionDetailParagraphs(q: Question): Paragraph[] {
  const lines: string[] = [`Tipo: ${q.tipo}`];
  if (q.opciones.length > 0) {
    lines.push(
      "Opciones: " +
        q.opciones.map((o) => `${o.codigo}. ${o.texto}`).join(" | ")
    );
  }
  if (q.enunciados && q.enunciados.length > 0) {
    lines.push(
      "Filas (matriz): " +
        q.enunciados.map((e) => e.texto).join(" | ")
    );
  }
  if (q.min !== undefined || q.max !== undefined) {
    lines.push(`Rango: ${q.min ?? "?"} – ${q.max ?? "?"}`);
  }
  return lines.map(
    (line) =>
      new Paragraph({
        children: [new TextRun({ text: line, size: 20, color: "666666" })],
      })
  );
}

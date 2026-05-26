/**
 * Exportación Excel de resultados de codificación.
 */

import * as XLSX from "xlsx-js-style";
import { getDisplayCategoryId } from "./category-display";
import { getCategoriesByJob } from "./categories-repository";
import { getClassificationsByJob } from "./classifications-repository";
import { getJob } from "./jobs-repository";
import { getResponsesByJob } from "./responses-repository";
import { getCodificacionSupabaseClient } from "./supabase-client";
import type { CodificacionJob } from "./types";

export async function exportJobResults(jobId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job?.project) throw new Error("Job not found");

  const [responses, classifications, categories] = await Promise.all([
    getResponsesByJob(jobId),
    getClassificationsByJob(jobId),
    getCategoriesByJob(jobId),
  ]);

  if (responses.length === 0) throw new Error("No responses found for this job");

  const categoryMap = new Map(
    categories.map((cat) => [cat.category_id.toString(), cat.name])
  );
  categoryMap.set("998", "No responde");
  categoryMap.set("999", "Otro");
  categoryMap.set("98", "No responde");
  categoryMap.set("99", "Otro");

  const classificationMap = new Map(
    classifications.map((cls) => [cls.response_id, cls])
  );

  const maxCategories = Math.max(
    1,
    ...responses.map((r) => {
      const cls = classificationMap.get(r.id);
      return cls?.category_ids?.length ?? 0;
    })
  );

  const excelData = responses.map((row, index) => {
    const cls = classificationMap.get(row.id);
    const result: Record<string, string | number> = {
      ID: row.response_id || `R${index + 1}`,
      Respuesta: row.response_text,
    };

    if (cls) {
      const displayIds = cls.category_ids.map(getDisplayCategoryId);
      for (let i = 0; i < maxCategories; i++) {
        result[`Categoría ID ${i + 1}`] = displayIds[i] ?? "";
      }
      result["Categorías (Nombres)"] = displayIds
        .map((id) => categoryMap.get(id.toString()) ?? `Categoría ${id}`)
        .join(", ");
    } else {
      for (let i = 0; i < maxCategories; i++) {
        result[`Categoría ID ${i + 1}`] = "";
      }
      result["Categorías (Nombres)"] = "Sin clasificar";
    }

    return result;
  });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const columnWidths = [{ wch: 12 }, { wch: 50 }];
  for (let i = 0; i < maxCategories; i++) columnWidths.push({ wch: 14 });
  columnWidths.push({ wch: 40 });
  worksheet["!cols"] = columnWidths;

  XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados");

  const metadataSheet = XLSX.utils.json_to_sheet([
    { Campo: "Proyecto", Valor: job.project.name },
    { Campo: "Pregunta", Valor: job.question },
    { Campo: "Total Respuestas", Valor: responses.length },
    { Campo: "Respuestas Clasificadas", Valor: classifications.length },
    { Campo: "Fecha Exportación", Valor: new Date().toLocaleString() },
  ]);
  XLSX.utils.book_append_sheet(workbook, metadataSheet, "Información");

  const projectName = job.project.name
    .replace(/[^a-zA-Z0-9\s]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 30);
  const questionSlug = job.question
    .replace(/[^a-zA-Z0-9\s]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 50);
  const filename = `${projectName}_${questionSlug}.xlsx`;
  XLSX.writeFile(workbook, filename);
}

function extractQuestionId(question: string): string {
  const trimmed = question.trim();
  const idMatch = trimmed.match(/^([A-Za-z]+\d+[\w]*)/);
  if (idMatch) return idMatch[1];
  const firstWord = trimmed.split(/\s+/)[0];
  if (firstWord && firstWord.length <= 10 && /^[A-Za-z0-9_]+$/.test(firstWord)) {
    return firstWord;
  }
  return trimmed.replace(/[^a-zA-Z0-9]/g, "").substring(0, 8) || "Q";
}

function extractQuestionText(question: string): string {
  const trimmed = question.trim();
  const idMatch = trimmed.match(/^([A-Za-z]+\d+[\w]*)\s+(.+)$/);
  return idMatch ? idMatch[2] : trimmed;
}

/** Exporta todas las encuestas completadas de un proyecto en un solo Excel. */
export async function exportAllProjectResults(projectId: string): Promise<void> {
  const supabase = await getCodificacionSupabaseClient();
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("name")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    throw new Error(`Project not found: ${projectError?.message}`);
  }

  const { data: jobs, error: jobsError } = await supabase
    .from("jobs")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .or("is_template.eq.false,is_template.is.null")
    .order("created_at", { ascending: true });

  if (jobsError) throw new Error(`Error fetching jobs: ${jobsError.message}`);
  if (!jobs?.length) {
    throw new Error("No hay codificaciones completadas en este proyecto");
  }

  interface JobData {
    job: CodificacionJob;
    questionId: string;
    questionText: string;
    responses: Map<string, { text: string; categoryIds: number[] }>;
    maxCategories: number;
  }

  const jobsData: JobData[] = [];
  let orderedResponseIds: string[] = [];

  for (const job of jobs as CodificacionJob[]) {
    const [responses, classifications] = await Promise.all([
      getResponsesByJob(job.id),
      getClassificationsByJob(job.id),
    ]);

    const classificationMap = new Map(
      classifications.map((cls) => [cls.response_id, cls])
    );
    const responseDataMap = new Map<
      string,
      { text: string; categoryIds: number[] }
    >();
    let maxCats = 1;

    for (const response of responses) {
      const classification = classificationMap.get(response.id);
      const categoryIds = classification
        ? classification.category_ids.map(getDisplayCategoryId)
        : [];
      maxCats = Math.max(maxCats, categoryIds.length);
      responseDataMap.set(response.response_id, {
        text: response.response_text,
        categoryIds,
      });
    }

    if (orderedResponseIds.length === 0) {
      orderedResponseIds = responses.map((r) => r.response_id);
    }

    jobsData.push({
      job,
      questionId: extractQuestionId(job.question),
      questionText: extractQuestionText(job.question),
      responses: responseDataMap,
      maxCategories: maxCats,
    });
  }

  const excelRows: (string | number)[][] = [];
  const row1: (string | number)[] = ["ResponseId"];
  for (const jd of jobsData) {
    row1.push(jd.questionId);
    for (let i = 0; i < jd.maxCategories; i++) {
      let count = 0;
      for (const responseId of orderedResponseIds) {
        const data = jd.responses.get(responseId);
        if (data && data.categoryIds[i] !== undefined) count++;
      }
      row1.push(count);
    }
  }
  excelRows.push(row1);

  const row2: (string | number)[] = [""];
  for (const jd of jobsData) {
    row2.push(jd.questionText);
    for (let i = 0; i < jd.maxCategories; i++) {
      row2.push(`${jd.questionId}_cod${i + 1}`);
    }
  }
  excelRows.push(row2);

  for (const responseId of orderedResponseIds) {
    const row: (string | number)[] = [responseId];
    for (const jd of jobsData) {
      const data = jd.responses.get(responseId);
      row.push(data?.text ?? "");
      for (let i = 0; i < jd.maxCategories; i++) {
        const catId = data?.categoryIds[i];
        row.push(catId !== undefined ? catId : "");
      }
    }
    excelRows.push(row);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(excelRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Resultados");

  const metadataSheet = XLSX.utils.json_to_sheet([
    { Campo: "Proyecto", Valor: project.name },
    { Campo: "Total Codificaciones", Valor: jobs.length },
    { Campo: "Total Respuestas", Valor: orderedResponseIds.length },
    { Campo: "Fecha Exportación", Valor: new Date().toLocaleString() },
  ]);
  XLSX.utils.book_append_sheet(workbook, metadataSheet, "Información");

  const projectName = project.name
    .replace(/[^a-zA-Z0-9\s]/g, "_")
    .replace(/\s+/g, "_")
    .substring(0, 40);
  const filename = `${projectName}_TodosCodigos_${new Date().toISOString().split("T")[0]}.xlsx`;
  XLSX.writeFile(workbook, filename);
}

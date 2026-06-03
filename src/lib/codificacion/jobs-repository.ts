import type { SupabaseClient } from "@supabase/supabase-js";
import { getCodificacionSupabaseClient } from "./supabase-client";
import type {
  CodificacionJob,
  CodificacionJobWithProject,
  JobStatus,
} from "./types";

async function client(): Promise<SupabaseClient> {
  return getCodificacionSupabaseClient();
}

export async function createJob(data: {
  project_id: string;
  question: string;
  description?: string;
  language_code?: string;
  region_hint?: string;
  excel_filename?: string;
  total_responses?: number;
}): Promise<CodificacionJob> {
  const supabase = await client();
  const { data: job, error } = await supabase
    .from("jobs")
    .insert([
      {
        project_id: data.project_id,
        question: data.question.trim(),
        description: data.description?.trim() || null,
        language_code: (data.language_code || "es").trim(),
        region_hint: data.region_hint?.trim() || null,
        excel_filename: data.excel_filename || null,
        total_responses: data.total_responses || 0,
        processed_responses: 0,
        status: "pending",
        progress_percentage: 0,
        sample_training_completed: false,
        sample_count: 0,
      },
    ])
    .select()
    .single();

  if (error) throw new Error(`Error creating job: ${error.message}`);
  return job as CodificacionJob;
}

export async function listJobsWithProjects(): Promise<CodificacionJobWithProject[]> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("jobs")
    .select(`*, project:projects(*)`)
    .or("is_template.eq.false,is_template.is.null")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Error fetching jobs: ${error.message}`);
  return (data ?? []) as CodificacionJobWithProject[];
}

export async function listJobsByProject(projectId: string): Promise<CodificacionJob[]> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("project_id", projectId)
    .or("is_template.eq.false,is_template.is.null")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Error fetching jobs: ${error.message}`);
  return (data ?? []) as CodificacionJob[];
}

export async function getJob(jobId: string): Promise<CodificacionJobWithProject | null> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("jobs")
    .select(`*, project:projects(*)`)
    .eq("id", jobId)
    .single();

  if (error) return null;
  return data as CodificacionJobWithProject;
}

export async function updateJob(
  jobId: string,
  updates: Partial<{
    question: string;
    description: string | null;
    status: JobStatus;
    processed_responses: number;
    progress_percentage: number;
    error_message: string | null;
    completed_at: string | null;
    sample_training_completed: boolean;
    sample_count: number;
  }>
): Promise<CodificacionJob> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("jobs")
    .update(updates)
    .eq("id", jobId)
    .select()
    .single();

  if (error) throw new Error(`Error updating job: ${error.message}`);
  return data as CodificacionJob;
}

/** Elimina job y datos relacionados en chunks (port de dashboard). */
export async function deleteJob(jobId: string): Promise<void> {
  const supabase = await client();

  const deleteInChunks = async (
    table: "classifications" | "responses" | "categories" | "sample_classifications",
    batchSize = 100
  ) => {
    const keyColumn = table === "responses" ? "response_id" : "id";
    while (true) {
      const { data: rows, error: selectError } = await supabase
        .from(table)
        .select(keyColumn)
        .eq("job_id", jobId)
        .order("id", { ascending: true })
        .limit(batchSize);

      if (selectError) {
        throw new Error(`Error leyendo ${table}: ${selectError.message}`);
      }
      const ids = (rows ?? []).map(
        (r: Record<string, string>) => r[keyColumn] as string
      );
      if (ids.length === 0) break;

      const { error: delError } = await supabase
        .from(table)
        .delete()
        .eq("job_id", jobId)
        .in(keyColumn, ids);

      if (delError) {
        throw new Error(`Error eliminando de ${table}: ${delError.message}`);
      }
      if (ids.length < batchSize) break;
    }
  };

  await deleteInChunks("classifications");
  await deleteInChunks("sample_classifications");
  await deleteInChunks("responses");
  await deleteInChunks("categories");

  const { error } = await supabase.from("jobs").delete().eq("id", jobId);
  if (error) throw new Error(`Error deleting job: ${error.message}`);
}

export async function listCategoryBookTemplates(
  projectId: string
): Promise<CodificacionJob[]> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_template", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Error fetching templates: ${error.message}`);
  return (data ?? []) as CodificacionJob[];
}

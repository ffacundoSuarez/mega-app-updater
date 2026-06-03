import type { SupabaseClient } from "@supabase/supabase-js";
import { getCodificacionSupabaseClient } from "./supabase-client";
import type { CodificacionProject } from "./types";

async function client(): Promise<SupabaseClient> {
  return getCodificacionSupabaseClient();
}

export async function listProjects(): Promise<CodificacionProject[]> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Error fetching projects: ${error.message}`);
  return (data ?? []) as CodificacionProject[];
}

export async function getProject(id: string): Promise<CodificacionProject> {
  const supabase = await client();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    throw new Error(`Project not found: ${error?.message ?? "no data"}`);
  }
  return data as CodificacionProject;
}

export async function createProject(data: {
  name: string;
  description?: string;
}): Promise<CodificacionProject> {
  const supabase = await client();
  const { data: project, error } = await supabase
    .from("projects")
    .insert([
      {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        user_id: null,
      },
    ])
    .select()
    .single();

  if (error) throw new Error(`Error creating project: ${error.message}`);
  return project as CodificacionProject;
}

export async function deleteProject(id: string): Promise<void> {
  const supabase = await client();
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw new Error(`Error deleting project: ${error.message}`);
}

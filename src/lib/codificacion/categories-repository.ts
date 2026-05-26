import { getCodificacionSupabaseClient } from "./supabase-client";
import type { Category } from "./types";

export async function createCategories(
  jobId: string,
  categories: Array<{ name: string; category_id: number; description?: string }>
): Promise<Category[]> {
  const supabase = await getCodificacionSupabaseClient();
  const rows = categories.map((cat) => ({
    job_id: jobId,
    name: cat.name,
    category_id: cat.category_id,
    description: cat.description?.trim() || null,
  }));

  const { data, error } = await supabase.from("categories").insert(rows).select();
  if (error) throw new Error(`Error creating categories: ${error.message}`);
  return (data ?? []) as Category[];
}

export async function getCategoriesByJob(jobId: string): Promise<Category[]> {
  const supabase = await getCodificacionSupabaseClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("job_id", jobId)
    .order("category_id");

  if (error) throw new Error(`Error fetching categories: ${error.message}`);
  return (data ?? []) as Category[];
}

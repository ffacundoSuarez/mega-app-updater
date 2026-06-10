import { getCodificacionSupabaseClient } from "./supabase-client";
import type {
  CategoryResponsesSort,
  CategoryStats,
  Classification,
  ClassificationBatchResult,
} from "./types";
import { getCategoriesByJob } from "./categories-repository";

export async function saveClassifications(
  jobId: string,
  batch: ClassificationBatchResult[]
): Promise<number> {
  if (batch.length === 0) return 0;
  const supabase = await getCodificacionSupabaseClient();
  const inserts = batch.map((r) => ({
    job_id: jobId,
    response_id: r.response_id,
    category_ids: r.category_ids,
    confidence_scores: r.confidence_scores,
    raw_ai_response: r.raw_ai_response ?? null,
  }));

  const { error } = await supabase.from("classifications").insert(inserts);
  if (error) throw new Error(`Failed to save classifications: ${error.message}`);
  return batch.length;
}

export async function getMaxClassifiedRow(jobId: string): Promise<number> {
  const supabase = await getCodificacionSupabaseClient();
  const { data, error } = await supabase
    .from("classifications")
    .select("response_id, responses!inner(row_number)")
    .eq("job_id", jobId);

  if (error || !data?.length) return 0;

  const rows = data as Array<{ responses?: { row_number?: number } }>;
  const maxRow = Math.max(
    ...rows
      .map((c) => c.responses?.row_number ?? 0)
      .filter((n) => Number.isFinite(n))
  );
  return Number.isFinite(maxRow) ? maxRow : 0;
}

export async function getClassificationsByJob(
  jobId: string
): Promise<Classification[]> {
  const supabase = await getCodificacionSupabaseClient();
  const all: Classification[] = [];
  const pageSize = 1000;
  let page = 0;

  while (true) {
    const start = page * pageSize;
    const end = start + pageSize - 1;
    const { data, error } = await supabase
      .from("classifications")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true })
      .range(start, end);

    if (error) throw new Error(`Error fetching classifications: ${error.message}`);
    if (!data?.length) break;
    all.push(...(data as Classification[]));
    if (data.length < pageSize) break;
    page++;
  }

  return all;
}

export async function deleteClassificationsByJob(jobId: string): Promise<void> {
  const supabase = await getCodificacionSupabaseClient();
  const { error } = await supabase
    .from("classifications")
    .delete()
    .eq("job_id", jobId);
  if (error) throw new Error(`Error deleting classifications: ${error.message}`);
}

export async function getCategoriesOrderedByCount(
  jobId: string
): Promise<CategoryStats[]> {
  const [categories, classifications] = await Promise.all([
    getCategoriesByJob(jobId),
    getClassificationsByJob(jobId),
  ]);

  const counts = new Map<number, number>();
  for (const cls of classifications) {
    for (const id of cls.category_ids ?? []) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  const total = classifications.length || 1;
  const rows: CategoryStats[] = categories.map((c) => ({
    categoryId: c.category_id,
    name: c.name,
    count: counts.get(c.category_id) ?? 0,
    percentage: Math.round(((counts.get(c.category_id) ?? 0) / total) * 100),
  }));

  const ensure = (id: number, name: string) => {
    if (!rows.find((r) => r.categoryId === id)) {
      const count = counts.get(id) ?? 0;
      rows.push({
        categoryId: id,
        name,
        count,
        percentage: Math.round((count / total) * 100),
      });
    }
  };
  ensure(998, "No responde");
  ensure(999, "Otro");
  rows.sort((a, b) => b.count - a.count);
  return rows;
}

export async function countResponsesForCategory(
  jobId: string,
  categoryId: number,
  searchText?: string
): Promise<number> {
  const supabase = await getCodificacionSupabaseClient();
  const hasSearch = Boolean(searchText?.trim());
  let query = supabase
    .from("classifications")
    .select(hasSearch ? "id, responses!inner(id)" : "id", {
      count: "exact",
      head: true,
    })
    .eq("job_id", jobId)
    .contains("category_ids", [categoryId]);

  if (hasSearch) {
    query = query.ilike("responses.response_text", `%${searchText!.trim()}%`);
  }

  const { count, error } = await query;
  if (error) throw new Error(`Error counting responses: ${error.message}`);
  return count ?? 0;
}

export async function getResponsesForCategoryPaginated(
  jobId: string,
  categoryId: number,
  page: number,
  pageSize: number,
  options?: { sort?: CategoryResponsesSort; searchText?: string }
): Promise<
  Array<{
    classification_id: string;
    response_id: string;
    category_ids: number[];
    response_text: string;
    row_number: number;
  }>
> {
  const supabase = await getCodificacionSupabaseClient();
  const sort = options?.sort ?? "row";
  const hasSearch = Boolean(options?.searchText?.trim());

  let query = supabase
    .from("classifications")
    .select("id, response_id, category_ids, responses!inner(response_text, row_number)")
    .eq("job_id", jobId)
    .contains("category_ids", [categoryId]);

  if (hasSearch) {
    query = query.ilike("responses.response_text", `%${options!.searchText!.trim()}%`);
  }

  if (sort === "row") {
    query = query.order("row_number", {
      ascending: true,
      foreignTable: "responses",
    });
  }

  type Row = {
    id: string;
    response_id: string;
    category_ids: number[];
    responses:
      | { response_text?: string; row_number?: number }
      | Array<{ response_text?: string; row_number?: number }>;
  };

  const mapRow = (row: Row) => {
    const r = Array.isArray(row.responses) ? row.responses[0] : row.responses;
    return {
      classification_id: row.id,
      response_id: row.response_id,
      category_ids: row.category_ids,
      response_text: (r?.response_text as string) ?? "",
      row_number: (r?.row_number as number) ?? 0,
    };
  };

  if (
    sort === "alpha_asc" ||
    sort === "alpha_desc" ||
    sort === "length_asc" ||
    sort === "length_desc"
  ) {
    const { data, error } = await query;
    if (error) throw new Error(`Error fetching category rows: ${error.message}`);
    let mapped = (data ?? []).map((row) => mapRow(row as Row));
    if (sort === "length_asc" || sort === "length_desc") {
      mapped = mapped.sort((a, b) => {
        const d = a.response_text.length - b.response_text.length;
        return sort === "length_asc" ? d : -d;
      });
    } else {
      mapped = mapped.sort((a, b) => {
        const cmp = a.response_text.localeCompare(b.response_text, "es", {
          sensitivity: "base",
        });
        return sort === "alpha_asc" ? cmp : -cmp;
      });
    }
    const start = page * pageSize;
    return mapped.slice(start, start + pageSize);
  }

  const start = page * pageSize;
  const end = start + pageSize - 1;
  const { data, error } = await query.range(start, end);
  if (error) throw new Error(`Error fetching category rows: ${error.message}`);
  return (data ?? []).map((row) => mapRow(row as Row));
}

export async function updateClassificationCategories(
  classificationId: string,
  newCategoryIds: number[]
): Promise<void> {
  const supabase = await getCodificacionSupabaseClient();
  const deduped = Array.from(
    new Set(newCategoryIds.filter((n) => Number.isFinite(n)))
  ) as number[];
  const { error } = await supabase
    .from("classifications")
    .update({ category_ids: deduped })
    .eq("id", classificationId);
  if (error) throw new Error(`Error updating classification: ${error.message}`);
}

import { getCodificacionSupabaseClient } from "./supabase-client";
import type { ResponseRow } from "./types";

export async function createResponsesFromExcel(
  jobId: string,
  excelData: Array<{ id: string; response: string }>
): Promise<ResponseRow[]> {
  const supabase = await getCodificacionSupabaseClient();

  const normalized = excelData.map((row, index) => {
    const rawId = (row.id ?? "").toString().trim();
    const responseId = rawId.length > 0 ? rawId : `Row_${index + 1}`;
    return {
      job_id: jobId,
      response_id: responseId,
      response_text: row.response,
      row_number: index + 1,
    };
  });

  const seen = new Set<string>();
  const toInsert = normalized.filter((r) => {
    const key = `${r.job_id}::${r.response_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const { data, error } = await supabase
    .from("responses")
    .upsert(toInsert, {
      onConflict: "job_id,response_id",
      ignoreDuplicates: true,
    })
    .select();

  if (error) throw new Error(`Error creating responses: ${error.message}`);
  return (data ?? []) as ResponseRow[];
}

export async function getResponsesByJob(jobId: string): Promise<ResponseRow[]> {
  const supabase = await getCodificacionSupabaseClient();
  const all: ResponseRow[] = [];
  const pageSize = 1000;
  let page = 0;

  while (true) {
    const start = page * pageSize;
    const end = start + pageSize - 1;
    const { data, error } = await supabase
      .from("responses")
      .select("*")
      .eq("job_id", jobId)
      .order("row_number", { ascending: true })
      .range(start, end);

    if (error) throw new Error(`Error fetching responses: ${error.message}`);
    if (!data?.length) break;
    all.push(...(data as ResponseRow[]));
    if (data.length < pageSize) break;
    page++;
  }

  return all;
}

export async function getResponseChunk(
  jobId: string,
  cursor: number,
  limit: number
): Promise<ResponseRow[]> {
  const supabase = await getCodificacionSupabaseClient();
  const { data, error } = await supabase
    .from("responses")
    .select("*")
    .eq("job_id", jobId)
    .gt("row_number", cursor)
    .order("row_number", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Chunk error: ${error.message}`);
  return (data ?? []) as ResponseRow[];
}

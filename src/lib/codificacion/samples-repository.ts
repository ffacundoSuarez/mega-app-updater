import { getCodificacionSupabaseClient } from "./supabase-client";
import type { ResponseRow, SampleClassification } from "./types";

export async function generateSampleResponses(
  jobId: string,
  sampleCount = 15
): Promise<ResponseRow[]> {
  const supabase = await getCodificacionSupabaseClient();
  const { data: allResponses, error } = await supabase
    .from("responses")
    .select("*")
    .eq("job_id", jobId)
    .order("row_number", { ascending: true });

  if (error) throw new Error(`Error fetching responses: ${error.message}`);
  if (!allResponses?.length) {
    throw new Error("No responses found for this job");
  }

  const filtered = (allResponses as ResponseRow[]).filter((r) => {
    const text = r.response_text?.trim() || "";
    return (
      text.length > 2 &&
      !["no", "n/a", "na", "none", "sin respuesta", "no response"].includes(
        text.toLowerCase()
      ) &&
      text !== "-" &&
      !/^\.+$/.test(text)
    );
  });

  const samples: ResponseRow[] = [];
  const byLength = {
    short: filtered.filter((r) => r.response_text.trim().length <= 20),
    medium: filtered.filter(
      (r) =>
        r.response_text.trim().length > 20 && r.response_text.trim().length <= 100
    ),
    long: filtered.filter((r) => r.response_text.trim().length > 100),
  };

  const pick = (arr: ResponseRow[], n: number) => {
    const shuffled = [...arr].sort(() => 0.5 - Math.random());
    samples.push(...shuffled.slice(0, Math.min(n, shuffled.length)));
  };

  const targetShort = Math.ceil(sampleCount * 0.3);
  const targetMedium = Math.ceil(sampleCount * 0.5);
  const targetLong = sampleCount - targetShort - targetMedium;

  pick(byLength.short, targetShort);
  pick(byLength.medium, targetMedium);
  pick(byLength.long, targetLong);

  if (samples.length < sampleCount) {
    const remaining = filtered.filter((r) => !samples.some((s) => s.id === r.id));
    const shuffled = [...remaining].sort(() => 0.5 - Math.random());
    samples.push(
      ...shuffled.slice(0, Math.min(sampleCount - samples.length, shuffled.length))
    );
  }

  if (samples.length === 0) {
    throw new Error(
      "No suitable responses found for training samples after filtering"
    );
  }

  return samples.slice(0, sampleCount);
}

export async function saveSampleClassifications(
  jobId: string,
  samples: Array<{
    response: ResponseRow;
    suggestedCategories: number[];
    confidence: number[];
    correctedCategories?: number[];
  }>
): Promise<void> {
  const supabase = await getCodificacionSupabaseClient();
  const rows = samples.map((s) => ({
    job_id: jobId,
    response_id: s.response.id,
    response_text: s.response.response_text,
    ai_suggested_categories: s.suggestedCategories,
    ai_confidence_scores: s.confidence,
    user_corrected_categories:
      s.correctedCategories ?? s.suggestedCategories,
    is_corrected:
      !!s.correctedCategories &&
      JSON.stringify(s.correctedCategories) !==
        JSON.stringify(s.suggestedCategories),
    corrected_at: s.correctedCategories ? new Date().toISOString() : null,
  }));

  const { error } = await supabase.from("sample_classifications").insert(rows);
  if (error) {
    throw new Error(`Error saving sample classifications: ${error.message}`);
  }

  await supabase
    .from("jobs")
    .update({
      sample_training_completed: true,
      sample_count: samples.length,
    })
    .eq("id", jobId);
}

export async function getSampleClassifications(
  jobId: string
): Promise<SampleClassification[]> {
  const supabase = await getCodificacionSupabaseClient();
  const { data, error } = await supabase
    .from("sample_classifications")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Error fetching samples: ${error.message}`);
  return (data ?? []) as SampleClassification[];
}

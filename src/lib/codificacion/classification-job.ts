/**
 * Orquestador local del job de codificación (port de `processJob` Lightsail).
 */

import { getOpenaiApiKey } from "@/lib/settings";
import {
  classifyBatch,
  delay,
  filterValidResponses,
} from "./classification-service";
import { getMaxClassifiedRow, saveClassifications } from "./classifications-repository";
import { getCategoriesByJob } from "./categories-repository";
import { getJob, updateJob } from "./jobs-repository";
import { getResponseChunk } from "./responses-repository";
import { getSampleClassifications } from "./samples-repository";

const CHUNK_SIZE = 500;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;

export interface ClassificationJobProgress {
  jobId: string;
  status: string;
  progress: number;
  processed: number;
  total: number;
  isActive: boolean;
}

export interface ClassificationJobResult {
  jobId: string;
  status: "completed" | "error" | "cancelled";
  processed: number;
  total: number;
  message?: string;
}

export interface ClassificationJobOptions {
  onProgress?: (event: ClassificationJobProgress) => void;
}

export interface ClassificationJobController {
  jobId: string;
  promise: Promise<ClassificationJobResult>;
  cancel: () => void;
  readonly isCancelled: boolean;
}

class MissingOpenAiKeyError extends Error {
  constructor() {
    super("Falta OpenAI API key en Ajustes. Configurala antes de codificar.");
    this.name = "MissingOpenAiKeyError";
  }
}

export function runClassificationJob(
  jobId: string,
  options: ClassificationJobOptions = {}
): ClassificationJobController {
  const state = { cancelled: false };

  const promise = executeJob(jobId, options, state);

  return {
    jobId,
    promise,
    cancel: () => {
      state.cancelled = true;
    },
    get isCancelled() {
      return state.cancelled;
    },
  };
}

async function executeJob(
  jobId: string,
  options: ClassificationJobOptions,
  state: { cancelled: boolean }
): Promise<ClassificationJobResult> {
  const apiKey = await getOpenaiApiKey();
  if (!apiKey) throw new MissingOpenAiKeyError();

  try {
    await updateJob(jobId, { status: "processing", error_message: null });

    const job = await getJob(jobId);
    if (!job) throw new Error("Job not found");

    if (!job.sample_training_completed) {
      throw new Error(
        "El entrenamiento de muestras debe completarse antes de clasificar"
      );
    }

    const [categories, sampleClassifications] = await Promise.all([
      getCategoriesByJob(jobId),
      getSampleClassifications(jobId),
    ]);

    if (categories.length === 0) {
      throw new Error("No categories found for this job");
    }

    let cursor = Number(job.processed_responses || 0);
    const maxClassifiedRow = await getMaxClassifiedRow(jobId);
    if (maxClassifiedRow > cursor) cursor = maxClassifiedRow;

    let hasMoreChunks = true;
    let totalClassifiedInRun = 0;

    while (hasMoreChunks && !state.cancelled) {
      const chunk = await getResponseChunk(jobId, cursor, CHUNK_SIZE);
      if (chunk.length === 0) {
        hasMoreChunks = false;
        break;
      }

      const validResponses = filterValidResponses(chunk);
      if (validResponses.length === 0) {
        cursor = chunk[chunk.length - 1].row_number ?? cursor;
        if (chunk.length < CHUNK_SIZE) hasMoreChunks = false;
        continue;
      }

      const batches: typeof validResponses[] = [];
      for (let i = 0; i < validResponses.length; i += BATCH_SIZE) {
        batches.push(validResponses.slice(i, i + BATCH_SIZE));
      }

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        if (state.cancelled) {
          await updateJob(jobId, {
            status: "error",
            error_message: "Procesamiento cancelado por el usuario",
          });
          return {
            jobId,
            status: "cancelled",
            processed: cursor,
            total: job.total_responses,
          };
        }

        const batch = batches[batchIndex];
        try {
          const batchResults = await classifyBatch(
            apiKey,
            batch,
            categories,
            job.question,
            job.language_code,
            job.region_hint,
            sampleClassifications
          );

          if (batchResults.length > 0) {
            await saveClassifications(jobId, batchResults);
            totalClassifiedInRun += batchResults.length;
          }

          const currentMaxRow = Math.max(...batch.map((r) => r.row_number ?? 0));
          const progressPercent = Math.round(
            (currentMaxRow / job.total_responses) * 100
          );

          await updateJob(jobId, {
            processed_responses: currentMaxRow,
            progress_percentage: progressPercent,
          });

          options.onProgress?.({
            jobId,
            status: "processing",
            progress: progressPercent,
            processed: currentMaxRow,
            total: job.total_responses,
            isActive: true,
          });
        } catch {
          const fallback = batch.map((response) => ({
            response_id: response.id,
            category_ids: [998],
            confidence_scores: [0.1],
          }));
          await saveClassifications(jobId, fallback);
        }

        if (batchIndex < batches.length - 1) {
          await delay(BATCH_DELAY_MS);
        }
      }

      cursor = chunk[chunk.length - 1].row_number ?? cursor;
      if (chunk.length < CHUNK_SIZE) hasMoreChunks = false;
    }

    const finalRowsProcessed = cursor;
    const isComplete = finalRowsProcessed >= job.total_responses;
    const finalStatus = isComplete ? "completed" : "error";

    await updateJob(jobId, {
      status: finalStatus,
      processed_responses: finalRowsProcessed,
      progress_percentage: Math.round(
        (finalRowsProcessed / job.total_responses) * 100
      ),
      completed_at: isComplete ? new Date().toISOString() : null,
      error_message: isComplete
        ? null
        : "Procesamiento incompleto — podés continuar",
    });

    options.onProgress?.({
      jobId,
      status: finalStatus,
      progress: Math.round((finalRowsProcessed / job.total_responses) * 100),
      processed: finalRowsProcessed,
      total: job.total_responses,
      isActive: false,
    });

    return {
      jobId,
      status: state.cancelled ? "cancelled" : finalStatus,
      processed: finalRowsProcessed,
      total: job.total_responses,
      message: isComplete
        ? `Clasificación completa (${totalClassifiedInRun} en esta corrida)`
        : "Progreso guardado — podés continuar",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateJob(jobId, {
      status: "error",
      error_message: message,
    });
    throw error;
  }
}

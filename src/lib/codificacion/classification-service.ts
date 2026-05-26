/**
 * Motor de clasificación IA (port de `classification-service.js` Lightsail).
 */

import { calculateConfidence } from "./confidence-calculator";
import { normalizeText } from "./text-normalizer";
import type {
  Category,
  ClassificationBatchResult,
  ResponseRow,
  SampleClassification,
} from "./types";

const DEFAULT_MODEL = "gpt-5-mini";

export function filterValidResponses(responses: ResponseRow[]): ResponseRow[] {
  return responses.filter((response) => {
    const text = response.response_text?.trim();
    return (
      !!text &&
      text.length > 0 &&
      text.toLowerCase() !== "sin respuesta" &&
      text.toLowerCase() !== "no response" &&
      text !== "-" &&
      text.toLowerCase() !== "n/a" &&
      text.toLowerCase() !== "null"
    );
  });
}

export function buildClassificationPrompt(
  responses: ResponseRow[],
  categories: Category[],
  surveyQuestion: string,
  languageCode?: string | null,
  regionHint?: string | null,
  sampleClassifications?: SampleClassification[]
): string {
  const categoryNames = categories
    .map(
      (cat) =>
        `${cat.category_id}: ${cat.name}${cat.description ? ` (${cat.description})` : ""}`
    )
    .join(", ");

  const responsesText = responses
    .map((r, i) => {
      const normalized = normalizeText(r.response_text);
      return `${i + 1}. "${r.response_text}" [normalized: "${normalized}"]`;
    })
    .join("\n");

  const languageName =
    languageCode === "pt"
      ? "Portuguese"
      : languageCode === "en"
        ? "English"
        : "Spanish";
  const languageHint = `Language: ${languageName}${languageCode ? ` (${languageCode})` : ""}.`;
  const regionHintText = regionHint
    ? `Region: ${regionHint}. Consider regional vocabulary, slang, and brand names.`
    : "";

  let fewShotExamples = "";
  if (sampleClassifications && sampleClassifications.length > 0) {
    const examples = sampleClassifications
      .map((sample) => {
        const cats = sample.user_corrected_categories.join(",");
        return `Response: "${sample.response_text}" → Category: ${cats} (you classified this)`;
      })
      .join("\n");
    fewShotExamples = `EXAMPLES FROM YOUR TRAINING:
${examples}

`;
  }

  return `You are analyzing responses to this survey question: "${surveyQuestion}"

Your task is to classify each response into the most appropriate category(ies) based on semantic meaning and context.

AVAILABLE CATEGORIES:
${categoryNames}
998: No response (empty, "don't know", "no answer", "none", etc.)
999: Other (responses with content that don't clearly fit any specific category)

${fewShotExamples}RESPONSES TO CLASSIFY:
${responsesText}

IMPORTANT GUIDELINES:
• ${languageHint}${regionHintText ? ` ${regionHintText}` : ""}
• Use your language understanding to find the BEST semantic match
• Handle typos, abbreviations, and variations naturally
• Consider the survey context when interpreting responses
• Multiple categories are OK if a response mentions multiple things
• Use 998 only for truly empty or "don't know" type responses
• Use 999 for responses that have content but don't fit the specific categories
${sampleClassifications && sampleClassifications.length > 0 ? "• Follow the classification patterns shown in your training examples above" : ""}

FORMAT: Return only category IDs, one per line:
1. 2
2. 1,3
3. 998
4. 999`;
}

export function parseOpenAIResponse(
  classification: string,
  responses: ResponseRow[],
  categories: Category[]
): ClassificationBatchResult[] {
  const results: ClassificationBatchResult[] = [];
  const lines = classification.split("\n").filter((line) => line.trim());

  for (let i = 0; i < responses.length; i++) {
    const response = responses[i];
    let categoryIds: number[] = [];

    if (i < lines.length) {
      const line = lines[i].trim();
      const numberedMatch = line.match(/^\d+\.\s*(.+)$/);
      if (numberedMatch) {
        categoryIds = numberedMatch[1]
          .split(",")
          .map((id) => parseInt(id.trim(), 10))
          .filter((id) => !Number.isNaN(id));
      } else {
        const directIds = line
          .split(",")
          .map((id) => parseInt(id.trim(), 10))
          .filter((id) => !Number.isNaN(id));
        if (directIds.length > 0) categoryIds = directIds;
      }
    }

    if (categoryIds.length === 0) {
      categoryIds = [998];
    }

    const confidence = calculateConfidence(
      response.response_text,
      categoryIds[0],
      categoryIds,
      categories
    );

    results.push({
      response_id: response.id,
      category_ids: categoryIds,
      confidence_scores: [confidence],
      raw_ai_response: classification,
    });
  }

  return results;
}

/**
 * Clasifica un batch vía OpenAI Chat Completions (fetch nativo, sin SDK).
 */
export async function classifyBatch(
  apiKey: string,
  responses: ResponseRow[],
  categories: Category[],
  surveyQuestion: string,
  languageCode?: string | null,
  regionHint?: string | null,
  sampleClassifications?: SampleClassification[],
  model = DEFAULT_MODEL
): Promise<ClassificationBatchResult[]> {
  const prompt = buildClassificationPrompt(
    responses,
    categories,
    surveyQuestion,
    languageCode,
    regionHint,
    sampleClassifications
  );

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are an intelligent survey response classifier with strong semantic understanding. Use your language comprehension to find the best category matches, even with typos, abbreviations, or variations. Focus on the MEANING behind responses rather than exact text matching. Prioritize Spanish (various Latin American regionalisms) and Portuguese when relevant. Be confident in semantic matches but conservative only when truly uncertain.",
          },
          { role: "user", content: prompt },
        ],
        max_completion_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const classification = result.choices?.[0]?.message?.content?.trim();
    if (!classification) {
      throw new Error("Empty classification result from OpenAI");
    }

    return parseOpenAIResponse(classification, responses, categories);
  } catch {
    return responses.map((row) => {
      const confidence = calculateConfidence(row.response_text, 998, [998], categories);
      return {
        response_id: row.id,
        category_ids: [998],
        confidence_scores: [confidence],
      };
    });
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

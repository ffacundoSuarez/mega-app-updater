/**
 * Pre-clasificación de muestras de entrenamiento (OpenAI local).
 */

import type { Category, ResponseRow } from "./types";

const DEFAULT_MODEL = "gpt-5-mini";

export interface PreclassifyResult {
  response: ResponseRow;
  suggestedCategories: number[];
  confidence: number[];
}

export async function preclassifySamples(
  apiKey: string,
  samples: ResponseRow[],
  categories: Category[],
  question: string,
  model = DEFAULT_MODEL
): Promise<PreclassifyResult[]> {
  const categoryNames = categories
    .map((cat) => `${cat.category_id}: ${cat.name}`)
    .join(", ");

  const responsesText = samples
    .map((r, i) => `${i + 1}. "${r.response_text}"`)
    .join("\n");

  const prompt = `You are analyzing responses to this survey question: "${question}"

Your task is to classify each response into the most appropriate category(ies) based on semantic meaning and context.

AVAILABLE CATEGORIES:
${categoryNames}
998: No response (empty, "don't know", "no answer", "none", etc.)
999: Other (responses with content that don't clearly fit any specific category)

RESPONSES TO CLASSIFY:
${responsesText}

CLASSIFICATION GUIDELINES:
• Use your language understanding to find the BEST semantic match
• Handle typos, abbreviations, and variations naturally
• Multiple categories are OK if a response mentions multiple things
• Use 998 only for truly empty or "don't know" type responses
• Use 999 for responses that have content but don't fit the specific categories

FORMAT: Return only category IDs, one per line:
1. 2
2. 1,3
3. 998
4. 999`;

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
              "You are an intelligent survey response classifier with strong semantic understanding.",
          },
          { role: "user", content: prompt },
        ],
        max_completion_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const classification = result.choices?.[0]?.message?.content?.trim();
    if (!classification) throw new Error("Empty preclassify result");

    const lines = classification.split("\n").filter((l) => l.trim());
    return samples.map((sample, i) => {
      let categoryIds: number[] = [];
      if (i < lines.length) {
        const line = lines[i].trim();
        const numbered = line.match(/^\d+\.\s*(.+)$/);
        if (numbered) {
          categoryIds = numbered[1]
            .split(",")
            .map((id) => parseInt(id.trim(), 10))
            .filter((id) => !Number.isNaN(id));
        } else {
          categoryIds = line
            .split(",")
            .map((id) => parseInt(id.trim(), 10))
            .filter((id) => !Number.isNaN(id));
        }
      }
      if (categoryIds.length === 0) categoryIds = [998];
      const confidence = categoryIds.map((catId) =>
        catId === 998 || catId === 999 ? 0.6 : 0.85
      );
      return {
        response: sample,
        suggestedCategories: categoryIds,
        confidence,
      };
    });
  } catch {
    return samples.map((sample) => ({
      response: sample,
      suggestedCategories: [998],
      confidence: [0.3],
    }));
  }
}

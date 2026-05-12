/**
 * Generador de sugerencias de reglas para el editor (paso 3).
 *
 * Reemplaza el endpoint Next.js `/api/cleaning/suggest-rules`:
 *   - No hay sesión / auth (la app desktop opera con anon Supabase + key del store).
 *   - OpenAI se consume con `fetch` nativo y key del store, no `process.env`.
 *
 * Flujo:
 *   1. Toma la última versión del proyecto y su `schema`.
 *   2. Heurísticas determinísticas (`buildHeuristicCleaningRuleSuggestions`).
 *   3. Si hay OpenAI key cargada en Ajustes, pide al modelo hasta 5 reglas de
 *      coherencia entre preguntas y filtra las que referencian IDs inválidos.
 *   4. Devuelve `{ suggestions, openaiSkipped, openaiSkipReason? }` con la
 *      misma forma que el endpoint original — la UI ya espera ese shape.
 *
 * Si OpenAI falla, se devuelven sólo las heurísticas + `openaiSkipped: true`
 * y el motivo. Nunca tira excepción al caller (excepto si no hay versiones,
 * que es un error de uso del usuario).
 */

import { getOpenaiApiKey } from "@/lib/settings";
import { listVersions } from "./versions-repository";
import {
  buildHeuristicCleaningRuleSuggestions,
  scrubCoherenceRuleSuggestions,
  type CleaningRuleSuggestion,
} from "./rule-suggestions";
import type { SchemaColumn } from "./types";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const MAX_QUESTIONS_FOR_LLM = 45;

export interface SuggestRulesResult {
  suggestions: CleaningRuleSuggestion[];
  openaiSkipped: boolean;
  openaiSkipReason?: string;
}

/**
 * Punto de entrada que la UI invoca al hacer clic en "Generar sugerencias".
 * Lanza error sólo si el proyecto no tiene versiones (el usuario tiene que
 * subir un Excel primero); cualquier otra falla cae al fallback de
 * "openaiSkipped".
 */
export async function suggestRules(
  projectId: string
): Promise<SuggestRulesResult> {
  const versions = await listVersions(projectId);
  if (versions.length === 0) {
    throw new Error(
      "Subí al menos una versión de Excel antes de generar sugerencias."
    );
  }

  const schema = versions[0].schema;

  const heuristic = buildHeuristicCleaningRuleSuggestions(schema);

  const questionCols = schema.columns.filter(
    (c) => !c.is_metadata && !String(c.id).startsWith("META_")
  );
  const validIds = new Set(questionCols.map((c) => c.id));

  const apiKey = await getOpenaiApiKey();
  if (!apiKey) {
    return {
      suggestions: heuristic,
      openaiSkipped: true,
      openaiSkipReason:
        "API Key de OpenAI no configurada en Ajustes; se devolvieron sólo reglas por tipo.",
    };
  }

  try {
    const forLLM = questionCols
      .slice(0, MAX_QUESTIONS_FOR_LLM)
      .map((c: SchemaColumn) => ({
        id: c.id,
        text: (c.question || c.id).slice(0, 500),
      }));
    const rawCoherence = await fetchCoherenceSuggestions(forLLM, apiKey);
    const openaiPart = scrubCoherenceRuleSuggestions(rawCoherence, validIds);

    return {
      suggestions: [...heuristic, ...openaiPart],
      openaiSkipped: false,
    };
  } catch (err) {
    return {
      suggestions: heuristic,
      openaiSkipped: true,
      openaiSkipReason:
        err instanceof Error
          ? err.message
          : "Error llamando a OpenAI; se devolvieron sólo reglas por tipo.",
    };
  }
}

interface OpenAIResponseChoice {
  message?: { content?: string };
}
interface OpenAIResponse {
  choices?: OpenAIResponseChoice[];
}

/**
 * Pide al modelo reglas de coherencia entre preguntas. Devuelve un array
 * (puede ser vacío si el modelo no detecta relaciones claras).
 *
 * Mismo prompt y mismo modelo (gpt-4o-mini, temperature 0.25) que el
 * endpoint original en mega-dashboard.
 */
async function fetchCoherenceSuggestions(
  questions: Array<{ id: string; text: string }>,
  apiKey: string
): Promise<CleaningRuleSuggestion[]> {
  if (questions.length < 2) return [];

  const payload = JSON.stringify(questions, null, 0);

  const prompt = `Eres experto en control de calidad de encuestas. Tienes esta lista de preguntas con sus IDs de columna y textos (JSON):
${payload}

Genera hasta 5 reglas de COHERENCIA entre preguntas (dependencias lógicas, exclusión mutua, consistencia cuando una respuesta implica otra).
Cada regla debe estar en español, en lenguaje natural, y referenciar las preguntas usando exactamente el formato @ID donde ID es el campo "id" del JSON (ej. @Q3). No inventes IDs que no existan.

Responde SOLO con un JSON válido de la forma:
{"rules":[{"description":"texto de la regla con @IDs","reasoning":"por qué es útil"}]}

Si no hay relaciones claras, devuelve {"rules":[]}.`;

  const res = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Respondes únicamente con JSON válido. Las reglas deben usar @columnId exactos del usuario.",
        },
        { role: "user", content: prompt },
      ],
      max_completion_tokens: 1800,
      temperature: 0.25,
    }),
  });

  if (!res.ok) {
    const text = await safeText(res);
    throw new Error(`OpenAI HTTP ${res.status}: ${truncate(text, 200)}`);
  }

  const json = (await res.json()) as OpenAIResponse;
  const raw = json.choices?.[0]?.message?.content?.trim();
  if (!raw) return [];

  // Algunos modelos devuelven el JSON dentro de ```json … ```; lo limpiamos.
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }

  const rules = (parsed as { rules?: unknown }).rules;
  if (!Array.isArray(rules)) return [];

  const out: CleaningRuleSuggestion[] = [];
  for (const r of rules) {
    const o = r as { description?: string; reasoning?: string };
    const description = String(o.description ?? "").trim();
    const reasoning = String(o.reasoning ?? "").trim();
    if (!description) continue;
    out.push({
      description,
      ai_reasoning:
        reasoning || "Coherencia entre preguntas sugerida por el modelo.",
      source: "openai",
    });
  }
  return out;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

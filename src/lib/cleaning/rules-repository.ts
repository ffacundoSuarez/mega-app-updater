/**
 * CRUD de `cleaning_rules` para el editor de reglas (paso 3).
 *
 * Port de las funciones equivalentes en `mega-dashboard/src/lib/cleaning.ts`,
 * adaptadas al cliente Supabase cacheado de la app desktop.
 *
 * El motor de QC (F0) ya tiene su propia función `getProjectRules` en
 * `cleaning-repository.ts` que filtra `is_active = true`. Esta es la versión
 * para la UI de edición: trae todas las reglas (activas o no) ordenadas por
 * `order_index` para que el usuario las pueda ver y reordenar.
 */

import { getCleaningSupabaseClient } from "./supabase-client";
import type { CleaningRule } from "./types";

const RULE_SELECT =
  "id, project_id, rule_type, rule_config, description, is_active, order_index, ai_generated, ai_reasoning, created_at";

/** Trae todas las reglas del proyecto ordenadas por `order_index` ascendente. */
export async function listRules(projectId: string): Promise<CleaningRule[]> {
  const client = await getCleaningSupabaseClient();
  const { data, error } = await client
    .from("cleaning_rules")
    .select(RULE_SELECT)
    .eq("project_id", projectId)
    .order("order_index", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron cargar las reglas: ${error.message}`);
  }
  return (data ?? []) as unknown as CleaningRule[];
}

export interface CreateRuleInput {
  projectId: string;
  description: string;
  /**
   * Tipo de regla. Por ahora todas las reglas creadas desde la UI son
   * `'custom'` (texto libre con @mentions); los tipos estructurados
   * (text_length, contains, etc.) se podrían agregar más adelante.
   */
  ruleType?: string;
  orderIndex?: number;
  aiGenerated?: boolean;
  aiReasoning?: string | null;
  isActive?: boolean;
}

/**
 * Crea una regla. Si no se pasa `orderIndex`, queda en 0 — el caller debería
 * pasarle `rules.length + i` para mantener el orden visible.
 */
export async function createRule(
  input: CreateRuleInput
): Promise<CleaningRule> {
  if (!input.description.trim()) {
    throw new Error("La descripción de la regla no puede estar vacía");
  }

  const client = await getCleaningSupabaseClient();
  const { data, error } = await client
    .from("cleaning_rules")
    .insert({
      project_id: input.projectId,
      rule_type: input.ruleType ?? "custom",
      rule_config: {
        type: input.ruleType ?? "custom",
        description: input.description.trim(),
      },
      description: input.description.trim(),
      order_index: input.orderIndex ?? 0,
      is_active: input.isActive ?? true,
      ai_generated: input.aiGenerated ?? false,
      ai_reasoning: input.aiReasoning?.trim() || null,
    })
    .select(RULE_SELECT)
    .single();

  if (error || !data) {
    throw new Error(
      `No se pudo crear la regla: ${error?.message ?? "respuesta vacía"}`
    );
  }
  return data as unknown as CleaningRule;
}

export interface UpdateRuleInput {
  description?: string;
  isActive?: boolean;
  orderIndex?: number;
}

/** Actualiza campos editables de la regla (description / is_active / order_index). */
export async function updateRule(
  ruleId: string,
  updates: UpdateRuleInput
): Promise<CleaningRule> {
  const client = await getCleaningSupabaseClient();
  const patch: Record<string, unknown> = {};
  if (updates.description !== undefined) {
    patch.description = updates.description.trim();
    patch.rule_config = {
      type: "custom",
      description: updates.description.trim(),
    };
  }
  if (updates.isActive !== undefined) patch.is_active = updates.isActive;
  if (updates.orderIndex !== undefined) patch.order_index = updates.orderIndex;

  const { data, error } = await client
    .from("cleaning_rules")
    .update(patch)
    .eq("id", ruleId)
    .select(RULE_SELECT)
    .single();

  if (error || !data) {
    throw new Error(
      `No se pudo actualizar la regla: ${error?.message ?? "respuesta vacía"}`
    );
  }
  return data as unknown as CleaningRule;
}

/** Borra una regla. */
export async function deleteRule(ruleId: string): Promise<void> {
  const client = await getCleaningSupabaseClient();
  const { error } = await client
    .from("cleaning_rules")
    .delete()
    .eq("id", ruleId);
  if (error) {
    throw new Error(`No se pudo eliminar la regla: ${error.message}`);
  }
}

/**
 * Re-asigna `order_index` a las reglas según el array `ruleIds` (índice en el
 * array = nuevo `order_index`). Hace un update por regla — bulk no es
 * soportado en Supabase JS sin RPC custom.
 */
export async function reorderRules(
  projectId: string,
  ruleIds: string[]
): Promise<void> {
  const client = await getCleaningSupabaseClient();
  for (let i = 0; i < ruleIds.length; i++) {
    const { error } = await client
      .from("cleaning_rules")
      .update({ order_index: i })
      .eq("id", ruleIds[i])
      .eq("project_id", projectId);
    if (error) {
      throw new Error(`No se pudo reordenar la regla ${i}: ${error.message}`);
    }
  }
}

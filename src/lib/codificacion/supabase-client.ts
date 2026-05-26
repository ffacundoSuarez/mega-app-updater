/**
 * Cliente Supabase para Codificación (mismo patrón que Limpiador).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/settings";

let cached: { url: string; key: string; client: SupabaseClient } | null = null;

export class MissingCodificacionSupabaseError extends Error {
  constructor() {
    super(
      "Faltan Supabase URL y/o anon key en Ajustes. Configuralas antes de usar Codificación."
    );
    this.name = "MissingCodificacionSupabaseError";
  }
}

export async function getCodificacionSupabaseClient(): Promise<SupabaseClient> {
  const [url, key] = await Promise.all([getSupabaseUrl(), getSupabaseAnonKey()]);
  if (!url || !key) {
    throw new MissingCodificacionSupabaseError();
  }

  if (cached && cached.url === url && cached.key === key) {
    return cached.client;
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  cached = { url, key, client };
  return client;
}

export function resetCodificacionSupabaseClient(): void {
  cached = null;
}

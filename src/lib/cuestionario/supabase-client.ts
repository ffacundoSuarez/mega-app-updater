/**
 * Factory del cliente Supabase para el módulo Validador de Cuestionarios.
 *
 * Mismo patrón que `cleaning/supabase-client.ts`:
 *   - Lee `supabase.url` y `supabase.anon_key` desde el store de settings.
 *   - Cachea el cliente por (url, key) para no recrearlo en cada llamada.
 *   - Si el usuario cambia las keys, hay que invalidar con
 *     `resetCuestionarioSupabaseClient()`.
 *
 * Es un cliente independiente del Limpiador a propósito: cada módulo
 * administra su propio cache. Si en el futuro se quiere compartir, vale
 * refactorizar a un helper común en `src/lib/`, pero hoy no aporta.
 *
 * Las RLS del proyecto Supabase corporativo son permisivas (`USING (true)`),
 * así que con la anon key alcanza para CRUD.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/settings";

let cached: { url: string; key: string; client: SupabaseClient } | null = null;

export class MissingSupabaseSettingsError extends Error {
  constructor() {
    super(
      "Faltan Supabase URL y/o anon key en Ajustes. Configurá ambas antes de usar el Validador de Cuestionarios."
    );
    this.name = "MissingSupabaseSettingsError";
  }
}

/**
 * Devuelve un cliente Supabase configurado con las keys del store. Lanza
 * `MissingSupabaseSettingsError` si alguna de las dos no está cargada.
 */
export async function getCuestionarioSupabaseClient(): Promise<SupabaseClient> {
  const [url, key] = await Promise.all([getSupabaseUrl(), getSupabaseAnonKey()]);
  if (!url || !key) {
    throw new MissingSupabaseSettingsError();
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

/** Invalida el cliente cacheado. Llamar tras cambiar las keys en Ajustes. */
export function resetCuestionarioSupabaseClient(): void {
  cached = null;
}

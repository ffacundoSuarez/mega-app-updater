/**
 * Factory del cliente Supabase para el Limpiador.
 *
 * Lee `supabase.url` y `supabase.anon_key` desde el store de settings (mismo
 * archivo que la SettingsView). El cliente se cachea para reusar en distintas
 * operaciones del mismo job; si el usuario cambia las keys en Ajustes, hay que
 * invalidarlo con `resetCleaningSupabaseClient()`.
 *
 * Las RLS del proyecto Supabase del Limpiador son permisivas (`USING (true)`),
 * así que no hace falta auth de usuario: la anon key alcanza.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/settings";

let cached: { url: string; key: string; client: SupabaseClient } | null = null;

export class MissingSupabaseSettingsError extends Error {
  constructor() {
    super(
      "Faltan Supabase URL y/o anon key en Ajustes. Configurá ambas antes de ejecutar el Limpiador."
    );
    this.name = "MissingSupabaseSettingsError";
  }
}

/**
 * Devuelve un cliente Supabase configurado con las keys del store. Lanza
 * `MissingSupabaseSettingsError` si alguna de las dos no está cargada.
 */
export async function getCleaningSupabaseClient(): Promise<SupabaseClient> {
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
export function resetCleaningSupabaseClient(): void {
  cached = null;
}

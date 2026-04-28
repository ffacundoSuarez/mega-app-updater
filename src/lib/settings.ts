// Helpers para persistir settings del usuario (API key de Gemini, preferencias).
// Usa tauri-plugin-store → guarda un JSON en %APPDATA%\Mega App\settings.json.
// El archivo es local al usuario, no se sincroniza ni se sube al repo.

import { load, type Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "settings.json";

// Keys usadas en el store.
const KEY_GEMINI_API = "gemini.api_key";

let storePromise: Promise<Store> | null = null;

// Carga (o crea) el store. Cachea la promise para no recrearlo en cada llamada.
function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(STORE_FILE, { autoSave: true, defaults: {} });
  }
  return storePromise;
}

/** Lee la API key de Gemini guardada localmente. Devuelve null si no está seteada. */
export async function getGeminiApiKey(): Promise<string | null> {
  const store = await getStore();
  const value = await store.get<string>(KEY_GEMINI_API);
  return value ?? null;
}

/** Guarda la API key. Pasar null/'' la borra. */
export async function setGeminiApiKey(key: string | null): Promise<void> {
  const store = await getStore();
  if (!key || !key.trim()) {
    await store.delete(KEY_GEMINI_API);
  } else {
    await store.set(KEY_GEMINI_API, key.trim());
  }
  await store.save();
}

/** True si hay una key guardada (no chequea validez, sólo existencia). */
export async function hasGeminiApiKey(): Promise<boolean> {
  const key = await getGeminiApiKey();
  return !!key;
}

// Helpers para persistir settings del usuario (Gemini, Limpiador / integraciones).
// Usa tauri-plugin-store → base: app_data_dir de Tauri (en Windows típico:
// %APPDATA%\<identifier> — ver identifier en src-tauri/tauri.conf.json).
// El archivo es local al usuario, no se sincroniza ni se sube al repo.

import { load, type Store } from "@tauri-apps/plugin-store";

const STORE_FILE = "settings.json";

// Keys usadas en el store (instalador sin valores por defecto sensibles).
const KEY_GEMINI_API = "gemini.api_key";
const KEY_SUPABASE_URL = "supabase.url";
const KEY_SUPABASE_ANON_KEY = "supabase.anon_key";
const KEY_OPENAI_API_KEY = "openai.api_key";
const KEY_QUESTIONPRO_API_KEY = "questionpro.api_key";
// QP user ID — sólo necesario para crear encuestas vía POST /users/{user-id}/surveys
// (publicar desde el Validador). Para los flujos del Limpiador y de import sólo
// hace falta la API key. Lo guardamos separado para que el usuario lo cargue
// recién cuando lo necesite.
const KEY_QUESTIONPRO_USER_ID = "questionpro.user_id";
const KEY_ENCRYPTION_KEY = "encryption.key";
// Flag booleano (no secreto): cuando está en true, el motor de QC del Limpiador
// vuelca a la consola del WebView el prompt enviado a OpenAI y la respuesta cruda
// de cada batch. Sirve para iterar el prompt sin volar a ciegas.
const KEY_LIMPIADOR_DEBUG_PROMPTS = "limpiador.debug_prompts";
// Modelo IA usado por el Validador de Cuestionarios para parser y checks
// semánticos. Si está vacío, se asume el default exportado abajo.
const KEY_CUESTIONARIO_MODEL = "cuestionario.model";
// Drafts de reglas manuales sin guardar de la pantalla "Reglas" del Limpiador.
// Estructurado como `{ [projectId]: string[] }` para no perder lo escrito al
// volver al proyecto sin apretar "Guardar cambios".
const KEY_LIMPIADOR_RULE_DRAFTS = "limpiador.rule_drafts";

let storePromise: Promise<Store> | null = null;

// Carga (o crea) el store. Cachea la promise para no recrearlo en cada llamada.
function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(STORE_FILE, { autoSave: true, defaults: {} });
  }
  return storePromise;
}

async function getTrimmed(key: string): Promise<string | null> {
  const store = await getStore();
  const value = await store.get<string>(key);
  if (value === undefined || value === null) return null;
  const t = String(value).trim();
  return t.length ? t : null;
}

async function setOrDelete(key: string, value: string | null): Promise<void> {
  const store = await getStore();
  const trimmed = value?.trim();
  if (!trimmed) {
    await store.delete(key);
  } else {
    await store.set(key, trimmed);
  }
  await store.save();
}

// --- Gemini ---

/** Lee la API key de Gemini guardada localmente. Devuelve null si no está seteada. */
export async function getGeminiApiKey(): Promise<string | null> {
  return getTrimmed(KEY_GEMINI_API);
}

/** Guarda la API key. Pasar null/'' la borra. */
export async function setGeminiApiKey(key: string | null): Promise<void> {
  await setOrDelete(KEY_GEMINI_API, key);
}

/** True si hay una key guardada (no chequea validez, sólo existencia). */
export async function hasGeminiApiKey(): Promise<boolean> {
  const key = await getGeminiApiKey();
  return !!key;
}

// --- Limpiador / integraciones corporativas ---

export async function getSupabaseUrl(): Promise<string | null> {
  return getTrimmed(KEY_SUPABASE_URL);
}

export async function setSupabaseUrl(value: string | null): Promise<void> {
  await setOrDelete(KEY_SUPABASE_URL, value);
}

export async function getSupabaseAnonKey(): Promise<string | null> {
  return getTrimmed(KEY_SUPABASE_ANON_KEY);
}

export async function setSupabaseAnonKey(key: string | null): Promise<void> {
  await setOrDelete(KEY_SUPABASE_ANON_KEY, key);
}

export async function getOpenaiApiKey(): Promise<string | null> {
  return getTrimmed(KEY_OPENAI_API_KEY);
}

export async function setOpenaiApiKey(key: string | null): Promise<void> {
  await setOrDelete(KEY_OPENAI_API_KEY, key);
}

export async function getQuestionproApiKey(): Promise<string | null> {
  return getTrimmed(KEY_QUESTIONPRO_API_KEY);
}

export async function setQuestionproApiKey(key: string | null): Promise<void> {
  await setOrDelete(KEY_QUESTIONPRO_API_KEY, key);
}

/** ID numérico del usuario de QuestionPro. Sólo se usa al publicar (Iteración 8). */
export async function getQuestionproUserId(): Promise<string | null> {
  return getTrimmed(KEY_QUESTIONPRO_USER_ID);
}

export async function setQuestionproUserId(value: string | null): Promise<void> {
  await setOrDelete(KEY_QUESTIONPRO_USER_ID, value);
}

/**
 * Opcional: misma cadena que ENCRYPTION_KEY en Supabase RPC encrypt_text/decrypt_text,
 * sólo si se persiste contenido encriptado en la base (no necesario si la API key de QuestionPro vive sólo en Ajustes).
 */
export async function getEncryptionKeySetting(): Promise<string | null> {
  return getTrimmed(KEY_ENCRYPTION_KEY);
}

export async function setEncryptionKeySetting(
  key: string | null
): Promise<void> {
  await setOrDelete(KEY_ENCRYPTION_KEY, key);
}

/**
 * Modelo usado por el Validador de Cuestionarios. Lo dejamos listado para que
 * Ajustes mantenga el mismo patrón de UI, pero hoy el validador usa gpt-5-mini.
 */
export const CUESTIONARIO_MODELS = ["gpt-5-mini"] as const;
export type CuestionarioModel = (typeof CUESTIONARIO_MODELS)[number];
export const DEFAULT_CUESTIONARIO_MODEL: CuestionarioModel = "gpt-5-mini";

/** Devuelve el modelo configurado o el default si no hay nada guardado / es inválido. */
export async function getCuestionarioModel(): Promise<CuestionarioModel> {
  const value = await getTrimmed(KEY_CUESTIONARIO_MODEL);
  if (value && (CUESTIONARIO_MODELS as readonly string[]).includes(value)) {
    return value as CuestionarioModel;
  }
  return DEFAULT_CUESTIONARIO_MODEL;
}

/** Guarda el modelo (debe ser uno de CUESTIONARIO_MODELS). Pasar null restaura el default. */
export async function setCuestionarioModel(
  model: CuestionarioModel | null
): Promise<void> {
  await setOrDelete(KEY_CUESTIONARIO_MODEL, model);
}

/**
 * Modo debug del Limpiador: si está activo, el motor de QC loguea a la consola
 * del WebView el prompt + la respuesta de OpenAI por cada batch. Default: false.
 */
export async function getLimpiadorDebugPrompts(): Promise<boolean> {
  const store = await getStore();
  const value = await store.get<boolean>(KEY_LIMPIADOR_DEBUG_PROMPTS);
  return value === true;
}

/** Activa/desactiva el modo debug del Limpiador. */
export async function setLimpiadorDebugPrompts(enabled: boolean): Promise<void> {
  const store = await getStore();
  if (enabled) {
    await store.set(KEY_LIMPIADOR_DEBUG_PROMPTS, true);
  } else {
    await store.delete(KEY_LIMPIADOR_DEBUG_PROMPTS);
  }
  await store.save();
}

/** Estado persistido relevante para el futuro módulo Limpiador (lectura al montar Ajustes). */
export async function getLimpiadorConnectionSettings(): Promise<{
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  openaiApiKey: string | null;
  questionproApiKey: string | null;
  encryptionKey: string | null;
}> {
  const [
    supabaseUrl,
    supabaseAnonKey,
    openaiApiKey,
    questionproApiKey,
    encryptionKey,
  ] = await Promise.all([
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    getOpenaiApiKey(),
    getQuestionproApiKey(),
    getEncryptionKeySetting(),
  ]);
  return {
    supabaseUrl,
    supabaseAnonKey,
    openaiApiKey,
    questionproApiKey,
    encryptionKey,
  };
}

/** Guarda todas las claves Limpiador de una vez; campos vacíos se borran del store (un único guardado). */
export async function setLimpiadorConnectionSettings(patch: {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  openaiApiKey: string | null;
  questionproApiKey: string | null;
  encryptionKey: string | null;
}): Promise<void> {
  const store = await getStore();

  async function upsert(storeKey: string, value: string | null): Promise<void> {
    const trimmed = value?.trim();
    if (!trimmed) {
      await store.delete(storeKey);
    } else {
      await store.set(storeKey, trimmed);
    }
  }

  await upsert(KEY_SUPABASE_URL, patch.supabaseUrl);
  await upsert(KEY_SUPABASE_ANON_KEY, patch.supabaseAnonKey);
  await upsert(KEY_OPENAI_API_KEY, patch.openaiApiKey);
  await upsert(KEY_QUESTIONPRO_API_KEY, patch.questionproApiKey);
  await upsert(KEY_ENCRYPTION_KEY, patch.encryptionKey);

  await store.save();
}

/** True si hay algo guardado en el bloque Limpiador (cualquier campo). */
export async function hasAnyLimpiadorSettings(): Promise<boolean> {
  const s = await getLimpiadorConnectionSettings();
  return Object.values(s).some(Boolean);
}

/** Borra del store todos los valores del bloque Limpiador / integraciones. */
export async function clearLimpiadorConnectionSettings(): Promise<void> {
  await setLimpiadorConnectionSettings({
    supabaseUrl: null,
    supabaseAnonKey: null,
    openaiApiKey: null,
    questionproApiKey: null,
    encryptionKey: null,
  });
}

// --- Drafts de reglas manuales (Limpiador) ---
//
// El usuario puede escribir varias reglas manuales en la pantalla "Reglas" sin
// apretar "Guardar cambios". Antes se perdían al volver al proyecto; ahora se
// persisten por proyecto para poder recuperarlas al volver.

/** Devuelve los drafts guardados para un proyecto (lista de strings). */
export async function getRuleDrafts(projectId: string): Promise<string[]> {
  const store = await getStore();
  const all = await store.get<Record<string, string[]>>(
    KEY_LIMPIADOR_RULE_DRAFTS
  );
  const value = all?.[projectId];
  return Array.isArray(value) ? value : [];
}

/**
 * Persiste los drafts del proyecto. Si `drafts` está vacío o es null, se
 * remueve la entrada del proyecto. Si después el map queda vacío, se borra la
 * key entera del store.
 */
export async function setRuleDrafts(
  projectId: string,
  drafts: string[] | null
): Promise<void> {
  const store = await getStore();
  const current =
    (await store.get<Record<string, string[]>>(KEY_LIMPIADOR_RULE_DRAFTS)) ??
    {};
  const filtered = (drafts ?? []).filter((d) => d.trim().length > 0);
  if (filtered.length === 0) {
    delete current[projectId];
  } else {
    current[projectId] = filtered;
  }
  if (Object.keys(current).length === 0) {
    await store.delete(KEY_LIMPIADOR_RULE_DRAFTS);
  } else {
    await store.set(KEY_LIMPIADOR_RULE_DRAFTS, current);
  }
  await store.save();
}

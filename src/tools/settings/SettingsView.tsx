// Vista de Ajustes: una card por integración (mismo patrón que Gemini).
// Persistencia con tauri-plugin-store (ruta base = identifier de Tauri, ver STORE_PATH_REL).

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  Save,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  getEncryptionKeySetting,
  getGeminiApiKey,
  getOpenaiApiKey,
  getQuestionproApiKey,
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasGeminiApiKey,
  setEncryptionKeySetting,
  setGeminiApiKey,
  setOpenaiApiKey,
  setQuestionproApiKey,
  setSupabaseAnonKey,
  setSupabaseUrl,
} from "@/lib/settings";

type SaveState = "idle" | "saving" | "saved" | "error";

// Debe coincidir con `"identifier"` en src-tauri/tauri.conf.json (carpeta bajo APPDATA Roaming).
const STORE_PATH_REL = "ar.megaresearch.tools";

const STORE_PATH_DISPLAY = `%APPDATA%\\${STORE_PATH_REL}\\settings.json`;

const STORE_PATH = (
  <span className="font-mono text-xs">{STORE_PATH_DISPLAY}</span>
);

/**
 * Card reutilizable: título, descripción, campo, mostrar/ocultar (si es secreto), Guardar / Borrar.
 */
function IntegrationCard({
  title,
  description,
  icon: Icon,
  fieldLabel,
  inputId,
  placeholder,
  value,
  onChange,
  loading,
  maskValue = true,
  footnote,
  saveState,
  hasStored,
  onSave,
  onClear,
  savedLabel = "Guardado",
}: {
  title: string;
  description: ReactNode;
  icon: LucideIcon;
  fieldLabel: string;
  inputId: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  loading: boolean;
  maskValue?: boolean;
  footnote?: ReactNode;
  saveState: SaveState;
  hasStored: boolean;
  onSave: () => Promise<void>;
  onClear: () => Promise<void>;
  savedLabel?: string;
}) {
  const [reveal, setReveal] = useState(false);
  const inputType =
    !maskValue ? "text" : reveal ? "text" : "password";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={inputId}>{fieldLabel}</Label>
          <div className="flex items-center gap-2">
            <Input
              id={inputId}
              type={inputType}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={loading ? "Cargando…" : placeholder}
              disabled={loading}
              className="font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
            {maskValue && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setReveal((r) => !r)}
                disabled={loading}
                aria-label={reveal ? "Ocultar" : "Mostrar"}
              >
                {reveal ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </Button>
            )}
          </div>
          {footnote ? (
            <p className="text-xs text-muted-foreground">{footnote}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={onSave}
            disabled={loading || saveState === "saving"}
            className="gap-2"
          >
            {saveState === "saving" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : saveState === "saved" ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <Save className="size-4" />
            )}
            {saveState === "saved" ? savedLabel : "Guardar"}
          </Button>
          {hasStored && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="gap-2 text-muted-foreground"
            >
              <Trash2 className="size-4" />
              Borrar
            </Button>
          )}
          {hasStored && saveState === "idle" && (
            <span className="text-xs text-emerald-500">Configurado ✓</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsView() {
  const [loading, setLoading] = useState(true);

  const [gemini, setGemini] = useState("");
  const [hasGemini, setHasGemini] = useState(false);
  const [gemSave, setGemSave] = useState<SaveState>("idle");

  const [sbUrl, setSbUrl] = useState("");
  const [hasSbUrl, setHasSbUrl] = useState(false);
  const [sbUrlSave, setSbUrlSave] = useState<SaveState>("idle");

  const [sbAnon, setSbAnon] = useState("");
  const [hasSbAnon, setHasSbAnon] = useState(false);
  const [sbAnonSave, setSbAnonSave] = useState<SaveState>("idle");

  const [openai, setOpenai] = useState("");
  const [hasOpenai, setHasOpenai] = useState(false);
  const [openaiSave, setOpenaiSave] = useState<SaveState>("idle");

  const [qp, setQp] = useState("");
  const [hasQp, setHasQp] = useState(false);
  const [qpSave, setQpSave] = useState<SaveState>("idle");

  const [enc, setEnc] = useState("");
  const [hasEnc, setHasEnc] = useState(false);
  const [encSave, setEncSave] = useState<SaveState>("idle");

  useEffect(() => {
    (async () => {
      try {
        const [g, url, anon, oai, qpk, ek] = await Promise.all([
          getGeminiApiKey(),
          getSupabaseUrl(),
          getSupabaseAnonKey(),
          getOpenaiApiKey(),
          getQuestionproApiKey(),
          getEncryptionKeySetting(),
        ]);
        if (g) setGemini(g);
        setHasGemini(await hasGeminiApiKey());
        if (url) setSbUrl(url);
        setHasSbUrl(!!url);
        if (anon) setSbAnon(anon);
        setHasSbAnon(!!anon);
        if (oai) setOpenai(oai);
        setHasOpenai(!!oai);
        if (qpk) setQp(qpk);
        setHasQp(!!qpk);
        if (ek) setEnc(ek);
        setHasEnc(!!ek);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const saveGemini = useCallback(async () => {
    setGemSave("saving");
    try {
      await setGeminiApiKey(gemini.trim() || null);
      setHasGemini(!!gemini.trim());
      setGemSave("saved");
      setTimeout(() => setGemSave("idle"), 2000);
    } catch (e) {
      console.error(e);
      setGemSave("error");
    }
  }, [gemini]);

  const clearGemini = useCallback(async () => {
    await setGeminiApiKey(null);
    setGemini("");
    setHasGemini(false);
    setGemSave("idle");
  }, []);

  const saveSbUrl = useCallback(async () => {
    setSbUrlSave("saving");
    try {
      await setSupabaseUrl(sbUrl.trim() || null);
      setHasSbUrl(!!sbUrl.trim());
      setSbUrlSave("saved");
      setTimeout(() => setSbUrlSave("idle"), 2000);
    } catch (e) {
      console.error(e);
      setSbUrlSave("error");
    }
  }, [sbUrl]);

  const clearSbUrl = useCallback(async () => {
    await setSupabaseUrl(null);
    setSbUrl("");
    setHasSbUrl(false);
    setSbUrlSave("idle");
  }, []);

  const saveSbAnon = useCallback(async () => {
    setSbAnonSave("saving");
    try {
      await setSupabaseAnonKey(sbAnon.trim() || null);
      setHasSbAnon(!!sbAnon.trim());
      setSbAnonSave("saved");
      setTimeout(() => setSbAnonSave("idle"), 2000);
    } catch (e) {
      console.error(e);
      setSbAnonSave("error");
    }
  }, [sbAnon]);

  const clearSbAnon = useCallback(async () => {
    await setSupabaseAnonKey(null);
    setSbAnon("");
    setHasSbAnon(false);
    setSbAnonSave("idle");
  }, []);

  const saveOpenai = useCallback(async () => {
    setOpenaiSave("saving");
    try {
      await setOpenaiApiKey(openai.trim() || null);
      setHasOpenai(!!openai.trim());
      setOpenaiSave("saved");
      setTimeout(() => setOpenaiSave("idle"), 2000);
    } catch (e) {
      console.error(e);
      setOpenaiSave("error");
    }
  }, [openai]);

  const clearOpenai = useCallback(async () => {
    await setOpenaiApiKey(null);
    setOpenai("");
    setHasOpenai(false);
    setOpenaiSave("idle");
  }, []);

  const saveQp = useCallback(async () => {
    setQpSave("saving");
    try {
      await setQuestionproApiKey(qp.trim() || null);
      setHasQp(!!qp.trim());
      setQpSave("saved");
      setTimeout(() => setQpSave("idle"), 2000);
    } catch (e) {
      console.error(e);
      setQpSave("error");
    }
  }, [qp]);

  const clearQp = useCallback(async () => {
    await setQuestionproApiKey(null);
    setQp("");
    setHasQp(false);
    setQpSave("idle");
  }, []);

  const saveEnc = useCallback(async () => {
    setEncSave("saving");
    try {
      await setEncryptionKeySetting(enc.trim() || null);
      setHasEnc(!!enc.trim());
      setEncSave("saved");
      setTimeout(() => setEncSave("idle"), 2000);
    } catch (e) {
      console.error(e);
      setEncSave("error");
    }
  }, [enc]);

  const clearEnc = useCallback(async () => {
    await setEncryptionKeySetting(null);
    setEnc("");
    setHasEnc(false);
    setEncSave("idle");
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Header />
      <Separator />

      <IntegrationCard
        title="Gemini API Key"
        icon={KeyRound}
        description={
          <>
            Usada en Brand Audit (títulos y executive summary). Se guarda en{" "}
            {STORE_PATH}. No se sube al repositorio.
          </>
        }
        fieldLabel="API Key"
        inputId="gemini-key"
        placeholder="AIza…"
        value={gemini}
        onChange={setGemini}
        loading={loading}
        footnote={
          <>
            Obtenela en{" "}
            <span className="font-mono">aistudio.google.com/app/apikey</span>.
          </>
        }
        saveState={gemSave}
        hasStored={hasGemini}
        onSave={saveGemini}
        onClear={clearGemini}
        savedLabel="Guardada"
      />

      <IntegrationCard
        title="Supabase — URL del proyecto"
        icon={Globe}
        description={
          <>
            URL del proyecto para el futuro módulo Limpiador. Misma persistencia
            en {STORE_PATH}.
          </>
        }
        fieldLabel="URL"
        inputId="sb-url"
        placeholder="https://….supabase.co"
        value={sbUrl}
        onChange={setSbUrl}
        loading={loading}
        maskValue={false}
        saveState={sbUrlSave}
        hasStored={hasSbUrl}
        onSave={saveSbUrl}
        onClear={clearSbUrl}
      />

      <IntegrationCard
        title="Supabase — anon / public key"
        icon={KeyRound}
        description={
          <>
            Clave pública del cliente (anon). Se guarda en {STORE_PATH}.
          </>
        }
        fieldLabel="Anon key"
        inputId="sb-anon"
        placeholder="eyJ…"
        value={sbAnon}
        onChange={setSbAnon}
        loading={loading}
        saveState={sbAnonSave}
        hasStored={hasSbAnon}
        onSave={saveSbAnon}
        onClear={clearSbAnon}
      />

      <IntegrationCard
        title="OpenAI API key"
        icon={Sparkles}
        description={
          <>
            Para reglas asistidas por IA en el Limpiador. {STORE_PATH}.
          </>
        }
        fieldLabel="API Key"
        inputId="openai-key"
        placeholder="sk-…"
        value={openai}
        onChange={setOpenai}
        loading={loading}
        saveState={openaiSave}
        hasStored={hasOpenai}
        onSave={saveOpenai}
        onClear={clearOpenai}
      />

      <IntegrationCard
        title="QuestionPro API key"
        icon={KeyRound}
        description={
          <>
            Key corporativa para la API de QuestionPro (un solo valor por
            máquina). {STORE_PATH}.
          </>
        }
        fieldLabel="API Key"
        inputId="qp-key"
        placeholder="API key"
        value={qp}
        onChange={setQp}
        loading={loading}
        saveState={qpSave}
        hasStored={hasQp}
        onSave={saveQp}
        onClear={clearQp}
      />

      <IntegrationCard
        title="Clave de encriptación (opcional)"
        icon={Lock}
        description={
          <>
            Solo si en el futuro usás <span className="font-mono">encrypt_text</span>{" "}
            en Supabase. {STORE_PATH}.
          </>
        }
        fieldLabel="Encryption key"
        inputId="enc-key"
        placeholder="Opcional"
        value={enc}
        onChange={setEnc}
        loading={loading}
        saveState={encSave}
        hasStored={hasEnc}
        onSave={saveEnc}
        onClear={clearEnc}
      />
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-start gap-4">
      <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Settings2 className="size-5" />
      </div>
      <div className="flex-1">
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <p className="text-sm text-muted-foreground">
          Configuración local de la app. Cada usuario tiene la suya.
        </p>
      </div>
    </div>
  );
}

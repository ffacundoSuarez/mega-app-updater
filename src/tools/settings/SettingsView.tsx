// Vista de Ajustes: API key de Gemini + info general.
// La key se persiste con tauri-plugin-store en %APPDATA%\Mega App\settings.json.

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Save,
  Settings2,
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
  getGeminiApiKey,
  hasGeminiApiKey,
  setGeminiApiKey,
} from "@/lib/settings";

type SaveState = "idle" | "saving" | "saved" | "error";

export function SettingsView() {
  const [keyInput, setKeyInput] = useState("");
  const [reveal, setReveal] = useState(false);
  const [hasStored, setHasStored] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Cargar la key actual al montar.
  useEffect(() => {
    (async () => {
      const existing = await getGeminiApiKey();
      if (existing) setKeyInput(existing);
      setHasStored(await hasGeminiApiKey());
      setLoading(false);
    })();
  }, []);

  const handleSave = useCallback(async () => {
    setSaveState("saving");
    try {
      await setGeminiApiKey(keyInput.trim() || null);
      setHasStored(!!keyInput.trim());
      setSaveState("saved");
      // Volver al estado idle después de 2s.
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (e) {
      console.error("setGeminiApiKey failed", e);
      setSaveState("error");
    }
  }, [keyInput]);

  const handleClear = useCallback(async () => {
    await setGeminiApiKey(null);
    setKeyInput("");
    setHasStored(false);
    setSaveState("idle");
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Header />
      <Separator />

      {/* Card: Gemini API Key */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" />
            Gemini API Key
          </CardTitle>
          <CardDescription>
            Necesaria para generar títulos y el executive summary con IA en
            Brand Audit. Se guarda localmente en{" "}
            <span className="font-mono text-xs">
              %APPDATA%\Mega App\settings.json
            </span>
            . Nunca se sube a internet ni al repositorio.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="gemini-key">API Key</Label>
            <div className="flex items-center gap-2">
              <Input
                id="gemini-key"
                type={reveal ? "text" : "password"}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={loading ? "Cargando..." : "AIza…"}
                disabled={loading}
                className="font-mono text-xs"
                autoComplete="off"
                spellCheck={false}
              />
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
            </div>
            <p className="text-xs text-muted-foreground">
              Obtenela en{" "}
              <span className="font-mono">aistudio.google.com/app/apikey</span>.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
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
              {saveState === "saved" ? "Guardada" : "Guardar"}
            </Button>
            {hasStored && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="gap-2 text-muted-foreground"
              >
                <Trash2 className="size-4" />
                Borrar
              </Button>
            )}
            {hasStored && saveState === "idle" && (
              <span className="text-xs text-emerald-500">
                Key configurada ✓
              </span>
            )}
          </div>
        </CardContent>
      </Card>
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

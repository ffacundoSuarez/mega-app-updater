// Vista principal de la herramienta Brand Audit (estudio YPF hardcoded).
// Flujo: el usuario elige archivos .sav + completa metadata de ola +
// opcionalmente activa IA → corremos el motor Python vía invoke() →
// mostramos progreso en vivo y los paths de outputs al final.

import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  FileSpreadsheet,
  FolderOpen,
  Loader2,
  Presentation,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  BRAND_AUDIT_PROGRESS_EVENT,
  runBrandAudit,
  type BrandAuditProgressPayload,
  type BrandAuditResult,
} from "@/lib/tauri";
import { getGeminiApiKey } from "@/lib/settings";

type RunStatus = "idle" | "running" | "success" | "error";

interface ProgressLine {
  stream: "stdout" | "stderr";
  text: string;
  /** monotonic id para keys de React */
  id: number;
}

// Valores por defecto del estudio YPF ABRIL 2026 (Fase 3 hardcoded).
// Ver PLAN.md §3.bis — cuando generalicemos, esto sale de un archivo por estudio.
const DEFAULTS = {
  waveFilter: 48,
  waveName: "Abr 26",
} as const;

export function BrandAuditView() {
  const [savPrincipal, setSavPrincipal] = useState<string | null>(null);
  const [savSecundario, setSavSecundario] = useState<string | null>(null);
  const [waveFilter, setWaveFilter] = useState<string>(
    String(DEFAULTS.waveFilter),
  );
  const [waveName, setWaveName] = useState<string>(DEFAULTS.waveName);
  const [useAiInsights, setUseAiInsights] = useState(false);
  const [useAiSummary, setUseAiSummary] = useState(false);
  const [hasStoredKey, setHasStoredKey] = useState<boolean>(false);

  const [status, setStatus] = useState<RunStatus>("idle");
  const [progress, setProgress] = useState<ProgressLine[]>([]);
  const [result, setResult] = useState<BrandAuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ref a la scroll area para auto-scroll cuando hay nuevas líneas.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const progressIdRef = useRef(0);

  // Chequear si hay una API key guardada (para avisar si el usuario prende IA sin key).
  useEffect(() => {
    getGeminiApiKey().then((k) => setHasStoredKey(!!k));
  }, []);

  // Listener de eventos de progreso. Se registra cuando arrancamos el run y se
  // desregistra cuando termina o se desmonta el componente.
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    if (status === "running") {
      listen<BrandAuditProgressPayload>(
        BRAND_AUDIT_PROGRESS_EVENT,
        (event) => {
          const { stream, line } = event.payload;
          if (!line) return;
          setProgress((prev) => [
            ...prev,
            { stream, text: line, id: progressIdRef.current++ },
          ]);
        },
      ).then((fn) => {
        unlisten = fn;
      });
    }
    return () => {
      unlisten?.();
    };
  }, [status]);

  // Auto-scroll al fondo cuando hay nuevas líneas.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [progress]);

  const pickSav = useCallback(
    async (setter: (path: string | null) => void) => {
      const selected = await open({
        title: "Seleccioná un archivo .sav",
        multiple: false,
        directory: false,
        filters: [{ name: "SPSS data", extensions: ["sav"] }],
      });
      if (typeof selected === "string") setter(selected);
    },
    [],
  );

  const canRun =
    !!savPrincipal &&
    !!waveName.trim() &&
    Number.isFinite(Number(waveFilter)) &&
    status !== "running";

  const handleRun = useCallback(async () => {
    if (!canRun || !savPrincipal) return;

    setStatus("running");
    setProgress([]);
    setResult(null);
    setError(null);

    try {
      const waveFilterNum = Number(waveFilter);
      if (!Number.isInteger(waveFilterNum)) {
        throw new Error("El filtro de ola debe ser un número entero.");
      }

      // Si el usuario prendió IA, leemos la key del store.
      let geminiApiKey: string | null = null;
      if (useAiInsights || useAiSummary) {
        geminiApiKey = await getGeminiApiKey();
        if (!geminiApiKey) {
          throw new Error(
            "La IA está activada pero no hay API key de Gemini configurada. " +
              "Configurala en Ajustes o apagá los toggles.",
          );
        }
      }

      const res = await runBrandAudit({
        savPrincipal,
        savSecundario: savSecundario ?? undefined,
        waveFilter: waveFilterNum,
        waveName: waveName.trim(),
        useAiInsights,
        useAiSummary,
        geminiApiKey,
      });
      setResult(res);
      setStatus("success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setStatus("error");
    }
  }, [
    canRun,
    savPrincipal,
    savSecundario,
    waveFilter,
    waveName,
    useAiInsights,
    useAiSummary,
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Header />
      <Separator />

      {/* Card principal: inputs y parámetros */}
      <Card>
        <CardHeader>
          <CardTitle>Nueva corrida</CardTitle>
          <CardDescription>
            Cargá la base principal de la ola y ajustá los parámetros. El
            informe se genera en{" "}
            <span className="font-mono text-xs">
              Documents\MegaApp\YPF Monitor\
            </span>
            .
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          {/* SAV principal (obligatorio) */}
          <FilePickerRow
            label="Base principal (.sav)"
            required
            path={savPrincipal}
            onPick={() => pickSav(setSavPrincipal)}
            onClear={() => setSavPrincipal(null)}
          />

          {/* SAV secundario (opcional, colapsable) */}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="link" size="sm" className="h-auto self-start p-0">
                + Agregar base secundaria (opcional)
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <FilePickerRow
                label="Base secundaria (.sav)"
                path={savSecundario}
                onPick={() => pickSav(setSavSecundario)}
                onClear={() => setSavSecundario(null)}
              />
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          {/* Parámetros de ola */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="wave-filter">Ola (número)</Label>
              <Input
                id="wave-filter"
                type="number"
                value={waveFilter}
                onChange={(e) => setWaveFilter(e.target.value)}
                placeholder="48"
              />
              <p className="text-xs text-muted-foreground">
                Valor de la variable <span className="font-mono">Wave</span>.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="wave-name">Nombre de la ola</Label>
              <Input
                id="wave-name"
                value={waveName}
                onChange={(e) => setWaveName(e.target.value)}
                placeholder="Abr 26"
              />
              <p className="text-xs text-muted-foreground">
                Etiqueta que va a aparecer en los gráficos.
              </p>
            </div>
          </div>

          <Separator />

          {/* Toggles IA */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                Inteligencia Artificial
              </span>
            </div>
            {!hasStoredKey && (useAiInsights || useAiSummary) && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  No hay API key de Gemini configurada. Andá a{" "}
                  <span className="font-semibold">Ajustes</span> para cargarla.
                </span>
              </div>
            )}
            <ToggleRow
              label="Títulos con IA por slide"
              description="Gemini redacta el 'takeaway' de cada gráfico."
              checked={useAiInsights}
              onChange={setUseAiInsights}
            />
            <ToggleRow
              label="Executive Summary"
              description="Resumen ejecutivo de 3 viñetas al inicio del PPT."
              checked={useAiSummary}
              onChange={setUseAiSummary}
            />
          </div>
        </CardContent>
      </Card>

      {/* Acción principal */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          Todo se procesa localmente en tu máquina. Nada se sube a internet
          {(useAiInsights || useAiSummary) && " (excepto los datos que manda a Gemini si activás IA)"}.
        </p>
        <Button
          size="lg"
          onClick={handleRun}
          disabled={!canRun}
          className="gap-2"
        >
          {status === "running" ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Procesando…
            </>
          ) : (
            <>
              <BarChart3 className="size-4" />
              Generar informe
            </>
          )}
        </Button>
      </div>

      {/* Progreso (durante run) */}
      {(status === "running" || progress.length > 0) && (
        <ProgressCard
          lines={progress}
          running={status === "running"}
          scrollRef={scrollRef}
        />
      )}

      {/* Resultado */}
      {status === "success" && result && <ResultCard result={result} />}

      {/* Error */}
      {status === "error" && error && <ErrorCard message={error} />}
    </div>
  );
}

// --- Subcomponentes ---------------------------------------------------------

function Header() {
  return (
    <div className="flex items-start gap-4">
      <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <BarChart3 className="size-5" />
      </div>
      <div className="flex-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Brand Audit · YPF Monitor
        </h1>
        <p className="text-sm text-muted-foreground">
          Genera el informe mensual completo (PowerPoint + Excel) a partir de
          los archivos <span className="font-mono">.sav</span> de la ola.
        </p>
      </div>
    </div>
  );
}

interface FilePickerRowProps {
  label: string;
  path: string | null;
  onPick: () => void;
  onClear: () => void;
  required?: boolean;
}

function FilePickerRow({
  label,
  path,
  onPick,
  onClear,
  required,
}: FilePickerRowProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label className="flex items-center gap-1.5">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex min-h-10 flex-1 items-center gap-2 rounded-md border bg-muted/30 px-3 text-sm",
            path ? "text-foreground" : "text-muted-foreground",
          )}
          title={path ?? ""}
        >
          {path ? (
            <>
              <FileSpreadsheet className="size-4 shrink-0" />
              <span className="truncate font-mono text-xs">{path}</span>
            </>
          ) : (
            <span className="italic">Ningún archivo seleccionado</span>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={onPick} className="gap-1">
          <Upload className="size-3.5" />
          Elegir
        </Button>
        {path && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClear}
            aria-label="Quitar archivo"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border bg-muted/20 px-3 py-2.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

interface ProgressCardProps {
  lines: ProgressLine[];
  running: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

function ProgressCard({ lines, running, scrollRef }: ProgressCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {running ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : (
            <CheckCircle2 className="size-4 text-emerald-500" />
          )}
          {running ? "Ejecutando motor" : "Log de ejecución"}
        </CardTitle>
        <CardDescription>
          Tabulación + tablas Excel + generación del PPT. Puede tardar varios
          minutos según el tamaño de la base.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          ref={scrollRef}
          className="h-56 w-full overflow-y-auto rounded-md border bg-muted/30 p-3"
        >
          <pre className="font-mono text-xs leading-relaxed">
            {lines.map((l) => (
              <div
                key={l.id}
                className={cn(
                  l.stream === "stderr" && "text-muted-foreground",
                )}
              >
                {l.text}
              </div>
            ))}
            {lines.length === 0 && (
              <span className="italic text-muted-foreground">
                Esperando salida del motor…
              </span>
            )}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}

interface ResultCardProps {
  result: BrandAuditResult;
}

function ResultCard({ result }: ResultCardProps) {
  const openFile = (path: string | null | undefined) => {
    if (path) openPath(path).catch((e) => console.error("openPath failed", e));
  };
  const revealFolder = (path: string | null | undefined) => {
    if (!path) return;
    // revealItemInDir abre el Explorador mostrando el archivo/carpeta
    // (en una carpeta abre esa carpeta; un path a archivo la abre seleccionado).
    // Como path es un directorio, le pasamos algo adentro para forzar "ir a".
    // Si no tenemos un hijo claro, usamos openPath(path) como fallback.
    const target = result.ppt ?? path;
    revealItemInDir(target).catch((e) =>
      console.error("revealItemInDir failed", e),
    );
  };
  return (
    <Card className="border-emerald-500/40 bg-emerald-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-emerald-400">
          <CheckCircle2 className="size-4" />
          Informe generado
        </CardTitle>
        <CardDescription>
          Estudio: <span className="font-mono">{result.studyId}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button
          variant="default"
          size="sm"
          disabled={!result.ppt}
          onClick={() => openFile(result.ppt)}
          className="gap-2"
        >
          <Presentation className="size-4" />
          Abrir PowerPoint
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!result.excelPrincipal}
          onClick={() => openFile(result.excelPrincipal)}
          className="gap-2"
        >
          <FileSpreadsheet className="size-4" />
          Excel Principal
        </Button>
        {result.excelSecundario && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openFile(result.excelSecundario)}
            className="gap-2"
          >
            <FileSpreadsheet className="size-4" />
            Excel Secundaria
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => revealFolder(result.outputDir)}
          className="gap-2"
        >
          <FolderOpen className="size-4" />
          Abrir carpeta
        </Button>
      </CardContent>
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-destructive">
          <AlertTriangle className="size-4" />
          Falló la ejecución
        </CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="whitespace-pre-wrap wrap-break-word font-mono text-xs text-muted-foreground">
          {message}
        </pre>
      </CardContent>
    </Card>
  );
}

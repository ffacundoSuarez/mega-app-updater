// Unificador de Olas: apila una base parcial .sav sobre la madre acumulada.
// Flujo: drop madre + parcial → preview (metadata) → elegir Wave → Unificar.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FolderOpen,
  Layers,
  Loader2,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useFileDrop } from "@/lib/useFileDrop";
import {
  cancelPythonSidecar,
  previewUnificador,
  runUnificador,
  UNIFICADOR_PROGRESS_EVENT,
  type UnificadorPreview,
  type UnificadorProgressPayload,
  type UnificadorResult,
} from "@/lib/tauri";
import { endRunningJob, logActivity, startRunningJob } from "@/lib/activity";

type RunStatus = "idle" | "running" | "success" | "error";

const STAGE_LABELS: Record<string, string> = {
  leyendo: "Leyendo parcial…",
  leyendo_madre: "Leyendo la base madre (puede tardar varios minutos)…",
  estandarizando: "Estandarizando (Script 1)…",
  derivando: "Derivando variables (Script 2)…",
  apilando: "Alineando y apilando…",
  escribiendo: "Escribiendo .sav…",
  listo: "Listo",
};

function fileName(path: string | null): string {
  if (!path) return "";
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

function formatNum(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("es-AR");
}

export function UnificadorView() {
  const [madre, setMadre] = useState<string | null>(null);
  const [parcial, setParcial] = useState<string | null>(null);
  const [wave, setWave] = useState<string>("54");
  const [preview, setPreview] = useState<UnificadorPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [status, setStatus] = useState<RunStatus>("idle");
  const [stage, setStage] = useState<string>("");
  const [stageMessage, setStageMessage] = useState<string>("");
  const [result, setResult] = useState<UnificadorResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dropTargetRef = useRef<"madre" | "parcial" | null>(null);
  const active = status !== "running";

  // Drop: si hay un target explícito (click en zona), va ahí; si no, la
  // primera .sav sin asignar es madre y la segunda parcial.
  const onDropPaths = useCallback(
    (paths: string[]) => {
      if (!active || paths.length === 0) return;
      const savs = paths.filter((p) => p.toLowerCase().endsWith(".sav"));
      if (savs.length === 0) return;
      const target = dropTargetRef.current;
      dropTargetRef.current = null;
      if (target === "madre") {
        setMadre(savs[0]);
        if (savs[1]) setParcial(savs[1]);
        return;
      }
      if (target === "parcial") {
        setParcial(savs[0]);
        if (savs[1] && !madre) setMadre(savs[1]);
        return;
      }
      if (!madre) {
        setMadre(savs[0]);
        if (savs[1]) setParcial(savs[1]);
      } else if (!parcial) {
        setParcial(savs[0]);
      } else {
        setMadre(savs[0]);
        if (savs[1]) setParcial(savs[1]);
      }
    },
    [active, madre, parcial],
  );

  const { isDragging } = useFileDrop({
    extensions: [".sav"],
    onDrop: onDropPaths,
    enabled: active,
  });

  // Preview de metadata al cambiar paths
  useEffect(() => {
    if (!madre) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    void previewUnificador({ madre, parcial })
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        if (p.madre?.suggested_wave) {
          setWave(String(p.madre.suggested_wave));
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setPreview({
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [madre, parcial]);

  const waveOptions = useMemo(() => {
    const labels = preview?.madre?.wave_labels ?? {};
    const max = preview?.madre?.max_wave ?? 53;
    const suggested = preview?.madre?.suggested_wave ?? max + 1;
    const opts: { value: string; label: string }[] = [];
    for (const [k, v] of Object.entries(labels)) {
      opts.push({ value: String(k), label: `${k} · ${v}` });
    }
    if (!opts.some((o) => o.value === String(suggested))) {
      const lab = preview?.madre?.suggested_label ?? `Wave ${suggested}`;
      opts.push({ value: String(suggested), label: `${suggested} · ${lab}` });
    }
    // Asegurar que el valor actual siempre esté en la lista
    if (wave && !opts.some((o) => o.value === wave)) {
      opts.push({ value: wave, label: `Wave ${wave}` });
    }
    opts.sort((a, b) => Number(a.value) - Number(b.value));
    return opts;
  }, [preview, wave]);

  const pickFile = async (which: "madre" | "parcial") => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "SPSS", extensions: ["sav"] }],
    });
    if (typeof selected === "string") {
      if (which === "madre") setMadre(selected);
      else setParcial(selected);
    }
  };

  const canRun =
    !!madre && !!parcial && !!wave && status !== "running" && !previewLoading;

  const handleCancel = async () => {
    try {
      await cancelPythonSidecar();
    } catch {
      /* ignore */
    }
  };

  const handleRun = async () => {
    if (!madre || !parcial) return;
    setStatus("running");
    setError(null);
    setResult(null);
    setStage("leyendo");
    setStageMessage("Iniciando…");

    const jobId = "unificador-run";
    void startRunningJob(jobId, "unificador", "Unificador de Olas");

    let unlisten: UnlistenFn | undefined;
    try {
      unlisten = await listen<UnificadorProgressPayload>(
        UNIFICADOR_PROGRESS_EVENT,
        (event) => {
          const line = event.payload.line?.trim();
          if (!line) return;
          try {
            const parsed = JSON.parse(line) as {
              type?: string;
              stage?: string;
              message?: string;
            };
            if (parsed.type === "progress" && parsed.stage) {
              setStage(parsed.stage);
              setStageMessage(parsed.message ?? "");
            }
          } catch {
            // línea no JSON (stderr) — se ignora en la barra
          }
        },
      );

      const res = await runUnificador({
        madre,
        parcial,
        wave: Number(wave),
      });
      setResult(res);
      setStatus("success");
      setStage("listo");
      void logActivity({
        type: "unificador_done",
        title: "Unificación lista",
        body: res.outputPath
          ? `${formatNum(res.rowsTotal)} filas · Wave ${res.wave}`
          : undefined,
        toolId: "unificador",
        viewId: "unificador",
        filePath: res.outputPath ?? undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(friendlyError(msg));
      setStatus("error");
      void logActivity({
        type: "unificador_error",
        title: "Error al unificar",
        body: friendlyError(msg),
        toolId: "unificador",
        viewId: "unificador",
      });
    } finally {
      void endRunningJob(jobId);
      unlisten?.();
    }
  };

  const stageLabel =
    STAGE_LABELS[stage] ?? (stageMessage || stage || "Procesando…");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-1">
      <div>
        <div className="flex items-center gap-2">
          <Layers className="size-5 text-tool-unificador" />
          <h1 className="text-xl font-semibold tracking-tight">
            Unificador de Olas
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Apila la ola nueva (.sav) sobre la base madre acumulada. Puede tardar
          varios minutos: conviene cerrar Excel u otras apps pesadas.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DropCard
          title="Base madre"
          description="Acumulada histórica (.sav)"
          path={madre}
          accent
          isDragging={isDragging}
          disabled={!active}
          onPick={() => void pickFile("madre")}
          onClear={() => setMadre(null)}
          onDragEnter={() => {
            dropTargetRef.current = "madre";
          }}
        />
        <DropCard
          title="Base parcial"
          description="Ola nueva del mes (.sav)"
          path={parcial}
          isDragging={isDragging}
          disabled={!active}
          onPick={() => void pickFile("parcial")}
          onClear={() => setParcial(null)}
          onDragEnter={() => {
            dropTargetRef.current = "parcial";
          }}
        />
      </div>

      {(previewLoading || preview) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Vista previa</CardTitle>
            <CardDescription>
              Solo metadata — no se cargan los datos todavía.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {previewLoading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Leyendo metadata…
              </div>
            )}
            {preview?.ok && preview.madre && (
              <div className="grid gap-2 sm:grid-cols-2">
                <MetaLine
                  label="Madre"
                  value={`${formatNum(preview.madre.rows)} filas · ${formatNum(preview.madre.columns)} cols`}
                />
                <MetaLine
                  label="Última ola"
                  value={`${preview.madre.max_wave}${
                    preview.madre.wave_labels[preview.madre.max_wave]
                      ? ` · ${preview.madre.wave_labels[preview.madre.max_wave]}`
                      : ""
                  }`}
                />
                {preview.parcial && (
                  <MetaLine
                    label="Parcial"
                    value={`${formatNum(preview.parcial.rows)} filas · ${formatNum(preview.parcial.columns)} cols`}
                  />
                )}
              </div>
            )}
            {preview && !preview.ok && preview.error && (
              <p className="text-destructive">{preview.error}</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ola a cargar</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="wave">Wave</Label>
            <Select
              value={wave}
              onValueChange={setWave}
              disabled={!active}
            >
              <SelectTrigger id="wave" className="w-full">
                <SelectValue placeholder="Elegí la ola" />
              </SelectTrigger>
              <SelectContent>
                {waveOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            {status === "running" ? (
              <Button variant="outline" onClick={() => void handleCancel()}>
                Cancelar
              </Button>
            ) : null}
            <Button
              onClick={() => void handleRun()}
              disabled={!canRun}
              className="min-w-32"
            >
              {status === "running" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Unificando…
                </>
              ) : (
                "Unificar"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {status === "running" && (
        <Card className="border-tool-unificador/40">
          <CardContent className="flex items-center gap-3 py-4">
            <Loader2 className="size-5 shrink-0 animate-spin text-tool-unificador" />
            <div>
              <p className="text-sm font-medium">{stageLabel}</p>
              {stageMessage && stageMessage !== stageLabel && (
                <p className="text-xs text-muted-foreground">{stageMessage}</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {status === "error" && error && (
        <Card className="border-destructive/40">
          <CardContent className="flex gap-3 py-4">
            <AlertTriangle className="size-5 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-medium">No se pudo unificar</p>
              <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                {error}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {status === "success" && result && (
        <Card className="border-success/40">
          <CardContent className="space-y-3 py-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="size-5 shrink-0 text-success" />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium">Unificación lista</p>
                <p className="text-sm text-muted-foreground">
                  {formatNum(result.rowsWave)} filas de Wave {result.wave}
                  {result.waveLabel ? ` (${result.waveLabel})` : ""} · total{" "}
                  {formatNum(result.rowsTotal)} filas
                </p>
                {result.outputPath && (
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {result.outputPath}
                  </p>
                )}
              </div>
            </div>
            {result.alerts.length > 0 && (
              <div className="rounded-md bg-muted/50 p-3 text-xs">
                <p className="mb-1 font-medium">
                  Alertas ({result.alerts.length})
                </p>
                <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-4 text-muted-foreground">
                  {result.alerts.slice(0, 40).map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                  {result.alerts.length > 40 && (
                    <li>… y {result.alerts.length - 40} más</li>
                  )}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {result.outputPath && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void revealItemInDir(result.outputPath!)}
                >
                  <FolderOpen className="size-4" />
                  Abrir carpeta
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function DropCard({
  title,
  description,
  path,
  accent,
  isDragging,
  disabled,
  onPick,
  onClear,
  onDragEnter,
}: {
  title: string;
  description: string;
  path: string | null;
  accent?: boolean;
  isDragging: boolean;
  disabled: boolean;
  onPick: () => void;
  onClear: () => void;
  onDragEnter: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      onMouseEnter={onDragEnter}
      className={cn(
        "relative flex min-h-36 flex-col items-start gap-2 rounded-xl border border-dashed p-4 text-left transition-colors",
        isDragging
          ? "border-tool-unificador bg-tool-unificador/10"
          : "border-border bg-card hover:border-tool-unificador/50",
        accent && !path && "border-tool-unificador/30",
        disabled && "opacity-60",
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-tool-unificador" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        {path ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
          >
            <X className="size-3.5" />
          </Button>
        ) : (
          <Upload className="size-4 text-muted-foreground" />
        )}
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      {path ? (
        <p className="mt-auto truncate font-mono text-xs" title={path}>
          {fileName(path)}
        </p>
      ) : (
        <p className="mt-auto text-xs text-muted-foreground">
          Arrastrá un .sav o hacé click
        </p>
      )}
    </button>
  );
}

/** Traduce errores técnicos a mensajes cortos en español. */
function friendlyError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("encoding") || lower.includes("byte sequence")) {
    return "No se pudo leer el .sav (problema de encoding). Probá con el archivo original de SPSS.";
  }
  if (lower.includes("memory") || lower.includes("out of memory")) {
    return "Se quedó sin memoria. Cerrá Excel u otras apps y volvé a intentar.";
  }
  if (lower.includes("no existe") || lower.includes("not found")) {
    return "No se encontró uno de los archivos. Revisá las rutas.";
  }
  if (lower.includes("cancel")) {
    return "Proceso cancelado.";
  }
  // Acotar stack traces largos
  const first = raw.split("\n").find((l) => l.trim()) ?? raw;
  return first.length > 400 ? first.slice(0, 400) + "…" : first;
}

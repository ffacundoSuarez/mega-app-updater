// Inicio: actividad reciente, tareas en curso, estado de integraciones y accesos.

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Loader2,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  DEMO_NOTIFICATION_LABELS,
  pushDemoNotification,
  type DemoNotificationKind,
} from "@/lib/activity-preview";
import type { ToolId, ViewId } from "@/components/Toolbar";
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
import { cn } from "@/lib/utils";
import { useActivity } from "@/lib/activity-context";
import type { ActivityEvent } from "@/lib/activity";
import { runPythonHello, type PythonHelloResponse } from "@/lib/tauri";
import {
  getGeminiApiKey,
  getOpenaiApiKey,
  getQuestionproApiKey,
  getSupabaseAnonKey,
  getSupabaseUrl,
} from "@/lib/settings";

interface HomeViewProps {
  appVersion: string;
  onOpenTool: (tool: ToolId) => void;
  onOpenView: (view: ViewId, payload?: Record<string, string>) => void;
  onOpenFiles?: (path?: string) => void;
}

interface QuickTool {
  id: ToolId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const QUICK_TOOLS_PROYECTOS: QuickTool[] = [
  {
    id: "cuestionario",
    label: "Cuestionarios QPro",
    description: "Validar y publicar cuestionarios.",
    icon: ClipboardCheck,
  },
  {
    id: "limpiador",
    label: "Limpiador",
    description: "QC de respuestas Qualtrics / QuestionPro.",
    icon: Sparkles,
  },
];

const QUICK_TOOLS_HERRAMIENTAS: QuickTool[] = [
  {
    id: "brand-audit",
    label: "Brand Audit · YPF",
    description: "Informe PPT + Excel (estudio YPF).",
    icon: BarChart3,
  },
];

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `hace ${hrs} h`;
  return d.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function HomeView({
  appVersion,
  onOpenTool,
  onOpenView,
  onOpenFiles,
}: HomeViewProps) {
  const { events, runningJobs, markRead } = useActivity();
  const recent = events.slice(0, 5);
  const unreadCount = events.filter((e) => !e.read).length;

  const [keyStatus, setKeyStatus] = useState({
    supabase: false,
    openai: false,
    questionpro: false,
    gemini: false,
  });

  const [diagOpen, setDiagOpen] = useState(false);
  const [pingLoading, setPingLoading] = useState(false);
  const [pingResult, setPingResult] = useState<PythonHelloResponse | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getSupabaseUrl(),
      getSupabaseAnonKey(),
      getOpenaiApiKey(),
      getQuestionproApiKey(),
      getGeminiApiKey(),
    ]).then(([url, anon, openai, qp, gemini]) => {
      setKeyStatus({
        supabase: !!(url && anon),
        openai: !!openai,
        questionpro: !!qp,
        gemini: !!gemini,
      });
    });
  }, []);

  const handleActivityClick = useCallback(
    (ev: ActivityEvent) => {
      void markRead(ev.id);
      if (ev.filePath && onOpenFiles) {
        onOpenFiles(ev.filePath);
        return;
      }
      const view = ev.viewId ?? ev.toolId;
      if (view) onOpenView(view, ev.payload);
    },
    [markRead, onOpenView, onOpenFiles]
  );

  async function handlePingPython() {
    setPingLoading(true);
    setPingError(null);
    setPingResult(null);
    try {
      const res = await runPythonHello("Mega");
      setPingResult(res);
    } catch (err) {
      setPingError(err instanceof Error ? err.message : String(err));
    } finally {
      setPingLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5" />
          <span>Versión {appVersion}</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Inicio</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Tu actividad reciente en esta máquina y accesos rápidos a las
          herramientas.
        </p>
      </section>

      {runningJobs.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">En curso</h2>
          <div className="flex flex-col gap-2">
            {runningJobs.map((job) => (
              <Card key={job.id}>
                <CardContent className="flex items-center gap-3 py-3">
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{job.label}</p>
                    <p className="text-xs text-muted-foreground">
                      Iniciado {formatRelative(job.startedAt)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onOpenTool(job.toolId)}
                  >
                    Ver
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Actividad reciente
            {unreadCount > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({unreadCount} sin leer)
              </span>
            )}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => onOpenFiles?.() ?? onOpenView("files")}
          >
            Ver archivos
          </Button>
        </div>
        {recent.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Cuando uses las herramientas, acá vas a ver lo que hiciste en esta
              computadora (exports, QC, publicaciones, etc.).
            </CardContent>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((ev) => (
              <li key={ev.id}>
                <button
                  type="button"
                  onClick={() => handleActivityClick(ev)}
                  className={cn(
                    "flex w-full flex-col gap-0.5 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/40",
                    !ev.read && "border-border bg-muted/30"
                  )}
                >
                  <span
                    className={cn(
                      "text-sm",
                      !ev.read && "font-medium"
                    )}
                  >
                    {ev.title}
                  </span>
                  {ev.body && (
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {ev.body}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {formatRelative(ev.at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Estado de integraciones
        </h2>
        <div className="flex flex-wrap gap-2 text-xs">
          <StatusPill ok={keyStatus.supabase} label="Supabase" />
          <StatusPill ok={keyStatus.openai} label="OpenAI" />
          <StatusPill ok={keyStatus.questionpro} label="QuestionPro" />
          <StatusPill ok={keyStatus.gemini} label="Gemini" />
        </div>
        {(!keyStatus.supabase || !keyStatus.openai) && (
          <p className="text-xs text-muted-foreground">
            Faltan claves para algunas herramientas.{" "}
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => onOpenView("settings")}
            >
              Ir a Ajustes
            </button>
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Accesos rápidos</h2>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Proyectos
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {QUICK_TOOLS_PROYECTOS.map((tool) => (
            <QuickToolCard
              key={tool.id}
              tool={tool}
              onOpen={() => onOpenTool(tool.id)}
            />
          ))}
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Herramientas
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {QUICK_TOOLS_HERRAMIENTAS.map((tool) => (
            <QuickToolCard
              key={tool.id}
              tool={tool}
              onOpen={() => onOpenTool(tool.id)}
            />
          ))}
        </div>
      </section>

      {/* TEMPORAL — vista previa de notificaciones */}
      <section className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4">
        <div className="flex items-start gap-2">
          <Bell className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Vista previa de notificaciones</h2>
            <p className="text-xs text-muted-foreground">
              Solo para probar la campana y la actividad. Se quita antes del
              release.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            Object.keys(DEMO_NOTIFICATION_LABELS) as DemoNotificationKind[]
          ).map((kind) => (
            <Button
              key={kind}
              type="button"
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => void pushDemoNotification(kind)}
            >
              {DEMO_NOTIFICATION_LABELS[kind]}
            </Button>
          ))}
        </div>
      </section>

      <Collapsible open={diagOpen} onOpenChange={setDiagOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-fit gap-1 px-0">
            <ChevronDown
              className={cn(
                "size-4 transition-transform",
                diagOpen && "rotate-180"
              )}
            />
            Diagnóstico (sidecar Python)
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-4">
                <CardTitle className="text-base">Sidecar Python</CardTitle>
                <Button
                  size="sm"
                  onClick={() => void handlePingPython()}
                  disabled={pingLoading}
                  className="gap-2"
                >
                  {pingLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Zap className="size-4" />
                  )}
                  Probar
                </Button>
              </div>
              <CardDescription className="text-xs">
                Verifica el runtime embebido (`hello.py`).
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs">
              {pingError && (
                <p className="text-destructive">{pingError}</p>
              )}
              {pingResult && (
                <p className="text-emerald-600 dark:text-emerald-400">
                  {pingResult.raw.message} — Python{" "}
                  {pingResult.raw.python.version}
                </p>
              )}
              {!pingLoading && !pingResult && !pingError && (
                <p className="text-muted-foreground">
                  Sin ejecutar. Primera vez:{" "}
                  <code>npm run bundle:python</code>
                </p>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function QuickToolCard({
  tool,
  onOpen,
}: {
  tool: QuickTool;
  onOpen: () => void;
}) {
  const Icon = tool.icon;
  return (
    <button type="button" onClick={onOpen} className="group text-left">
      <Card className="h-full transition-colors hover:border-primary/30 hover:bg-accent/20">
        <CardHeader className="pb-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </div>
        </CardHeader>
        <CardContent>
          <CardTitle className="text-sm">{tool.label}</CardTitle>
          <CardDescription className="mt-1 text-xs">
            {tool.description}
          </CardDescription>
          <span className="mt-3 flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
            Abrir
            <ArrowRight className="size-3" />
          </span>
        </CardContent>
      </Card>
    </button>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
        ok
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-muted bg-muted/50 text-muted-foreground"
      )}
    >
      {ok ? (
        <CheckCircle2 className="size-3" />
      ) : (
        <AlertCircle className="size-3" />
      )}
      {label}
    </span>
  );
}

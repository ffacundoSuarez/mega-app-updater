// Página de inicio de Mega App.
// Sirve como dashboard dinámico: bienvenida + acceso rápido a herramientas
// + actividad reciente / novedades.

import { useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Loader2,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react";
import type { ToolId } from "@/components/Toolbar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { runPythonHello, type PythonHelloResponse } from "@/lib/tauri";

interface HomeViewProps {
  appVersion: string;
  onOpenTool: (tool: ToolId) => void;
}

interface QuickTool {
  id: ToolId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "available" | "soon";
}

const QUICK_TOOLS: QuickTool[] = [
  {
    id: "brand-audit",
    label: "Brand Audit · YPF",
    description:
      "Generá el informe mensual (PPT + Excel) a partir de los archivos .sav de la ola.",
    icon: BarChart3,
    status: "available",
  },
  {
    id: "limpiador",
    label: "Limpiador de Encuestas",
    description:
      "Identificá respuestas inválidas o sospechosas en tus encuestas Qualtrics o QuestionPro con IA.",
    icon: Sparkles,
    status: "available",
  },
];

export function HomeView({ appVersion, onOpenTool }: HomeViewProps) {
  // Estado del ping al sidecar Python (Fase 2 — diagnóstico).
  // `result` = respuesta ok, `error` = mensaje de error, ambos `null` mientras no se corrió.
  const [pingLoading, setPingLoading] = useState(false);
  const [pingResult, setPingResult] = useState<PythonHelloResponse | null>(null);
  const [pingError, setPingError] = useState<string | null>(null);

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
      {/* Hero */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5" />
          <span>Versión {appVersion}</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Bienvenido a Mega App
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Todas las herramientas internas de Mega Research en un solo lugar.
          Elegí una herramienta de la barra lateral o empezá desde los accesos
          rápidos de abajo.
        </p>
      </section>

      {/* Accesos rápidos */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            Accesos rápidos
          </h2>
          <span className="text-xs text-muted-foreground">
            {QUICK_TOOLS.length}{" "}
            {QUICK_TOOLS.length === 1 ? "herramienta" : "herramientas"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {QUICK_TOOLS.map((tool) => {
            const Icon = tool.icon;
            const isSoon = tool.status === "soon";
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => onOpenTool(tool.id)}
                className="group text-left"
              >
                <Card className="h-full transition-colors hover:border-primary/40 hover:bg-accent/30">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="size-5" />
                      </div>
                      {isSoon && (
                        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Próximamente
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardTitle className="mb-1 text-base">{tool.label}</CardTitle>
                    <CardDescription>{tool.description}</CardDescription>
                    <div
                      className={cn(
                        "mt-4 flex items-center gap-1 text-xs font-medium text-primary transition-transform",
                        "group-hover:translate-x-0.5",
                      )}
                    >
                      Abrir
                      <ArrowRight className="size-3.5" />
                    </div>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
      </section>

      {/* Diagnóstico del sidecar Python (Fase 2).
          Se puede ocultar / mover a una vista de "Settings" cuando la app madure. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Diagnóstico</h2>
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">Sidecar Python</CardTitle>
                <CardDescription>
                  Ejecuta <code>hello.py</code> para verificar que el runtime
                  embebido y sus dependencias están funcionando.
                </CardDescription>
              </div>
              <Button
                size="sm"
                onClick={handlePingPython}
                disabled={pingLoading}
                className="gap-2"
              >
                {pingLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Zap className="size-4" />
                )}
                {pingLoading ? "Ejecutando..." : "Probar sidecar"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {pingError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                <XCircle className="mt-0.5 size-4 shrink-0" />
                <div className="flex flex-col gap-1">
                  <span className="font-medium">Falló la ejecución</span>
                  <pre className="whitespace-pre-wrap break-all font-mono text-[11px] opacity-90">
                    {pingError}
                  </pre>
                </div>
              </div>
            )}

            {pingResult && (
              <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" />
                  <span className="font-medium">
                    {pingResult.raw.message}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 pl-6 text-muted-foreground">
                  <span>Python</span>
                  <span className="font-mono">
                    {pingResult.raw.python.version}
                  </span>
                  <span>Sistema</span>
                  <span className="font-mono">
                    {pingResult.raw.platform.system}{" "}
                    {pingResult.raw.platform.machine}
                  </span>
                </div>
                <div className="flex flex-col gap-1 pl-6">
                  <span className="text-muted-foreground">Dependencias:</span>
                  {pingResult.raw.dependencies.map((dep) => (
                    <div
                      key={dep.name}
                      className="flex items-center gap-1.5 font-mono"
                    >
                      {dep.ok ? (
                        <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <XCircle className="size-3 text-destructive" />
                      )}
                      <span>{dep.name}</span>
                      <span className="text-muted-foreground">
                        {dep.ok ? `v${dep.version}` : dep.error}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!pingLoading && !pingResult && !pingError && (
              <p className="text-xs text-muted-foreground">
                Todavía no se ejecutó. Si es la primera vez, corré{" "}
                <code>npm run bundle:python</code> para generar el runtime.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

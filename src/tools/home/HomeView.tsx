// Página de inicio de Mega App.
// Sirve como dashboard dinámico: bienvenida + acceso rápido a herramientas
// + actividad reciente / novedades.

import { ArrowRight, FileSpreadsheet, Sparkles } from "lucide-react";
import type { ToolId } from "@/components/Toolbar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
    id: "excel-to-pptx",
    label: "Excel → PowerPoint",
    description: "Convertí una planilla en una presentación lista para compartir.",
    icon: FileSpreadsheet,
    status: "soon",
  },
];

export function HomeView({ appVersion, onOpenTool }: HomeViewProps) {
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

      {/* Actividad / novedades */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Actividad reciente
        </h2>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-1 py-10 text-center">
            <p className="text-sm font-medium">Todavía no hay actividad</p>
            <p className="text-xs text-muted-foreground">
              Cuando uses una herramienta, el historial aparece acá.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

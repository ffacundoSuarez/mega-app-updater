// Stepper horizontal con los círculos numerados (P1..Pn) en la parte superior
// del canvas. Cada círculo muestra el estado de la pregunta (vacía, ok, a
// revisar, con error, actual) y permite saltar directo a esa pregunta sin
// scrollear. Incluye un botón "+ pregunta" al final y atajos prev/next.

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type StepStatus = "ok" | "warn" | "err" | "empty";

export interface StepperItem {
  /** ID corto (ej. P1). Sólo para mostrar como label debajo del círculo. */
  code: string;
  status: StepStatus;
}

export interface QuestionStepperProps {
  items: StepperItem[];
  active: number;
  onPick: (index: number) => void;
  onAdd: () => void;
  disabled?: boolean;
}

export function QuestionStepper({
  items,
  active,
  onPick,
  onAdd,
  disabled,
}: QuestionStepperProps) {
  const safeActive = Math.min(Math.max(0, active), items.length - 1);

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      {/* Encabezado: label + leyenda + contador */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Preguntas
          </span>
          <Legend />
        </div>
        <div className="font-mono text-xs text-muted-foreground tabular-nums">
          {items.length === 0 ? "0 / 0" : `${safeActive + 1} / ${items.length}`}
        </div>
      </div>

      {/* Carril de círculos */}
      <div
        className="flex items-center gap-1.5 overflow-x-auto px-0.5 py-1.5 [scrollbar-width:thin]"
        role="tablist"
        aria-label="Navegación entre preguntas"
      >
        {items.map((item, i) => (
          <StepCircle
            key={`${item.code}-${i}`}
            index={i}
            code={item.code}
            status={item.status}
            active={i === safeActive}
            onClick={() => onPick(i)}
          />
        ))}
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          aria-label="Agregar pregunta"
          title="Agregar pregunta"
          className="ml-1 flex shrink-0 flex-col items-center gap-1 px-0.5 pt-1 disabled:opacity-50"
        >
          <span className="grid size-9 place-items-center rounded-full border border-dashed border-border bg-transparent text-muted-foreground transition-colors hover:border-primary hover:text-primary">
            <Plus className="size-4" />
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">add</span>
        </button>
      </div>

      {/* Pie con tip + flechas */}
      <div className="mt-1 flex items-center justify-between gap-2 border-t border-dashed border-border pt-2">
        <div className="text-xs text-muted-foreground">
          Tip · usá{" "}
          <kbd className="rounded border border-border bg-muted px-1.5 py-px font-mono text-[10px] text-foreground">
            ←
          </kbd>{" "}
          <kbd className="rounded border border-border bg-muted px-1.5 py-px font-mono text-[10px] text-foreground">
            →
          </kbd>{" "}
          para navegar
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={() => onPick(Math.max(0, safeActive - 1))}
            disabled={disabled || items.length === 0 || safeActive === 0}
            aria-label="Pregunta anterior"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={() => onPick(Math.min(items.length - 1, safeActive + 1))}
            disabled={
              disabled || items.length === 0 || safeActive === items.length - 1
            }
            aria-label="Pregunta siguiente"
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface StepCircleProps {
  index: number;
  code: string;
  status: StepStatus;
  active: boolean;
  onClick: () => void;
}

function StepCircle({ index, code, status, active, onClick }: StepCircleProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={`${code} (${describeStatus(status)})`}
      onClick={onClick}
      className="flex shrink-0 flex-col items-center gap-1 px-0.5 pt-1 outline-none focus-visible:[&_.circle]:ring-3 focus-visible:[&_.circle]:ring-ring/50"
    >
      <span
        className={cn(
          "circle relative grid size-9 place-items-center rounded-full border font-mono text-xs font-bold transition-all",
          // estado base (vacía)
          status === "empty" &&
            "border-border bg-background text-muted-foreground",
          // ok (válida)
          status === "ok" &&
            "border-emerald-500/70 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
          // advertencia
          status === "warn" &&
            "border-amber-500/70 bg-amber-500/15 text-amber-600 dark:text-amber-400",
          // error
          status === "err" &&
            "border-destructive/70 bg-destructive/15 text-destructive",
          // activa: invierte (fondo primary, etiqueta clara)
          active &&
            "scale-110 border-primary bg-primary text-primary-foreground shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35)]",
          !active && "hover:-translate-y-0.5 hover:border-primary"
        )}
      >
        {index + 1}
        {status === "warn" && !active && (
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-card" />
        )}
        {status === "err" && !active && (
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-destructive ring-2 ring-card" />
        )}
      </span>
      <span
        className={cn(
          "font-mono text-[10px] text-muted-foreground",
          active && "font-bold text-foreground"
        )}
      >
        {code}
      </span>
    </button>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      <LegendDot className="bg-primary" /> Actual
      <LegendDot className="bg-emerald-500" /> Válida
      <LegendDot className="bg-amber-500" /> Revisar
      <LegendDot className="bg-destructive" /> Error
      <LegendDot className="border border-border bg-background" /> Vacía
    </div>
  );
}

function LegendDot({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 rounded-full align-[-1px]", className)}
    />
  );
}

function describeStatus(status: StepStatus): string {
  switch (status) {
    case "ok":
      return "válida";
    case "warn":
      return "a revisar";
    case "err":
      return "con error";
    case "empty":
      return "vacía";
  }
}

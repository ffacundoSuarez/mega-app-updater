// Mini-mapa del cuestionario: lista lateral con todas las preguntas + barra
// de progreso (válidas vs. total) + accesos rápidos para agregar pregunta o
// sección. Se usa como rail izquierdo del editor en modo "single-focus".

import { Box, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StepperItem, StepStatus } from "./QuestionStepper";

export interface MiniMapItem extends StepperItem {
  /** Texto de la pregunta para mostrar en el rail (puede estar vacío). */
  text: string;
  /** Label del tipo, ya legible (ej. "Cerrada única"). */
  typeLabel: string;
}

export interface QuestionMiniMapProps {
  items: MiniMapItem[];
  active: number;
  onPick: (index: number) => void;
  onAddQuestion: () => void;
  onAddSection?: () => void;
  disabled?: boolean;
}

export function QuestionMiniMap({
  items,
  active,
  onPick,
  onAddQuestion,
  onAddSection,
  disabled,
}: QuestionMiniMapProps) {
  const validCount = items.filter((i) => i.status === "ok").length;
  const pct =
    items.length === 0 ? 0 : Math.round((100 * validCount) / items.length);

  return (
    <aside className="sticky top-4 flex h-fit flex-col gap-2 rounded-xl border border-border bg-card p-3">
      <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Mapa del cuestionario
      </div>

      {/* Barra de progreso (% de válidas) */}
      <div className="flex items-center gap-2 border-b border-dashed border-border px-1 pb-2.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {pct}%
        </span>
      </div>

      <div className="flex max-h-[520px] flex-col gap-0.5 overflow-y-auto pr-0.5">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            Sin preguntas todavía.
          </div>
        ) : (
          items.map((item, i) => (
            <MiniMapRow
              key={`${item.code}-${i}`}
              index={i}
              item={item}
              active={i === active}
              onClick={() => onPick(i)}
            />
          ))
        )}
      </div>

      <div className="mt-1 flex gap-2 border-t border-dashed border-border pt-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onAddQuestion}
          disabled={disabled}
        >
          <Plus className="size-3.5" />
          Pregunta
        </Button>
        {onAddSection && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onAddSection}
            disabled={disabled}
          >
            <Box className="size-3.5" />
            Sección
          </Button>
        )}
      </div>
    </aside>
  );
}

interface MiniMapRowProps {
  index: number;
  item: MiniMapItem;
  active: boolean;
  onClick: () => void;
}

function MiniMapRow({ index, item, active, onClick }: MiniMapRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "grid w-full grid-cols-[26px_1fr_auto] items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
        active ? "bg-muted" : "hover:bg-muted/60"
      )}
    >
      <Pill index={index} status={item.status} active={active} />
      <div className="min-w-0">
        <div className="truncate text-[13px] text-foreground">
          {item.text.trim() || (
            <span className="italic text-muted-foreground">Sin texto</span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">{item.typeLabel}</div>
      </div>
      <span className="font-mono text-[10px] text-muted-foreground">
        {item.code}
      </span>
    </button>
  );
}

function Pill({
  index,
  status,
  active,
}: {
  index: number;
  status: StepStatus;
  active: boolean;
}) {
  return (
    <span
      className={cn(
        "grid size-6 place-items-center rounded-full border font-mono text-[11px] font-bold",
        status === "empty" &&
          "border-border bg-background text-muted-foreground",
        status === "ok" &&
          "border-emerald-500 bg-emerald-500 text-white",
        status === "warn" &&
          "border-amber-500 bg-amber-500 text-white",
        status === "err" &&
          "border-destructive bg-destructive text-white",
        active && "ring-2 ring-primary/40 ring-offset-1 ring-offset-card"
      )}
    >
      {index + 1}
    </span>
  );
}

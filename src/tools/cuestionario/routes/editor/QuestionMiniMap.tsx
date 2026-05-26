// Mini-mapa del cuestionario: lista lateral con todas las preguntas + barra
// de progreso (válidas vs. total) + accesos rápidos para agregar pregunta o
// sección. Se usa como rail izquierdo del editor en modo "single-focus".

import { Box, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StepperItem, StepStatus } from "./QuestionStepper";
import {
  SectionDialog,
  type SectionQuestionOption,
} from "./SectionDialog";

export interface MiniMapItem extends StepperItem {
  text: string;
  typeLabel: string;
  questionId: string;
  sectionName?: string;
}

export interface QuestionMiniMapProps {
  items: MiniMapItem[];
  sections?: string[];
  active: number;
  onPick: (index: number) => void;
  onAddQuestion: () => void;
  onAddSection?: (name: string, questionIds: string[]) => void;
  onRenameSection?: (oldName: string, newName: string) => void;
  onDeleteSection?: (name: string, deleteQuestions: boolean) => void;
  disabled?: boolean;
}

type SectionDialogState =
  | { mode: "create" }
  | { mode: "edit"; name: string; questionCount: number };

type MapSegment =
  | { kind: "section"; name: string | null; empty?: boolean }
  | { kind: "question"; index: number; item: MiniMapItem };

export function QuestionMiniMap({
  items,
  sections = [],
  active,
  onPick,
  onAddQuestion,
  onAddSection,
  onRenameSection,
  onDeleteSection,
  disabled,
}: QuestionMiniMapProps) {
  const [dialog, setDialog] = useState<SectionDialogState | null>(null);

  const validCount = items.filter((i) => i.status === "ok").length;
  const pct =
    items.length === 0 ? 0 : Math.round((100 * validCount) / items.length);

  const canManageSections = Boolean(
    onAddSection || onRenameSection || onDeleteSection
  );

  const sectionQuestionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      if (!item.sectionName) continue;
      counts.set(item.sectionName, (counts.get(item.sectionName) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const segments = useMemo(
    () => buildMapSegments(items, sections),
    [items, sections]
  );

  const questionOptions: SectionQuestionOption[] = useMemo(
    () =>
      items.map((item) => ({
        id: item.questionId,
        code: item.code,
        text: item.text,
      })),
    [items]
  );

  function openCreateDialog() {
    if (!onAddSection) return;
    setDialog({ mode: "create" });
  }

  function openEditDialog(name: string) {
    if (!onRenameSection && !onDeleteSection) return;
    setDialog({
      mode: "edit",
      name,
      questionCount: sectionQuestionCounts.get(name) ?? 0,
    });
  }

  return (
    <>
      <aside className="sticky top-4 flex h-fit flex-col gap-2 rounded-xl border border-border bg-card p-3">
        <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Mapa del cuestionario
        </div>

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
          {segments.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
              Sin preguntas todavía.
            </div>
          ) : (
            segments.map((seg) => {
              if (seg.kind === "section") {
                const name = seg.name;
                return (
                  <SectionHeader
                    key={`section-${name ?? "__none__"}-${seg.empty ? "empty" : "head"}`}
                    name={name}
                    empty={seg.empty}
                    editable={Boolean(name && (onRenameSection || onDeleteSection))}
                    onEdit={() => {
                      if (name) openEditDialog(name);
                    }}
                  />
                );
              }
              return (
                <MiniMapRow
                  key={`${seg.item.code}-${seg.index}`}
                  index={seg.index}
                  item={seg.item}
                  active={seg.index === active}
                  onClick={() => onPick(seg.index)}
                />
              );
            })
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
          {canManageSections && onAddSection && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={openCreateDialog}
              disabled={disabled}
            >
              <Box className="size-3.5" />
              Bloque
            </Button>
          )}
        </div>
      </aside>

      {dialog && (
        <SectionDialog
          open
          mode={dialog.mode}
          initialName={dialog.mode === "edit" ? dialog.name : ""}
          questionCount={dialog.mode === "edit" ? dialog.questionCount : 0}
          questionOptions={dialog.mode === "create" ? questionOptions : []}
          defaultSelectedIds={[]}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          onConfirm={(name, questionIds) => {
            if (dialog.mode === "create") {
              onAddSection?.(name, questionIds);
            } else {
              onRenameSection?.(dialog.name, name);
            }
            setDialog(null);
          }}
          onDelete={
            dialog.mode === "edit" && onDeleteSection
              ? (deleteQuestions) => {
                  onDeleteSection(dialog.name, deleteQuestions);
                  setDialog(null);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

function buildMapSegments(
  items: MiniMapItem[],
  sections: string[]
): MapSegment[] {
  const segments: MapSegment[] = [];
  const shownSections = new Set<string>();

  for (let i = 0; i < items.length; i++) {
    const sectionName = items[i].sectionName;
    const prevSection = i > 0 ? items[i - 1]?.sectionName : undefined;
    if (i === 0 || sectionName !== prevSection) {
      if (sectionName) shownSections.add(sectionName);
      segments.push({ kind: "section", name: sectionName ?? null });
    }
    segments.push({ kind: "question", index: i, item: items[i] });
  }

  for (const name of sections) {
    if (!shownSections.has(name)) {
      segments.push({ kind: "section", name, empty: true });
    }
  }

  return segments;
}

function SectionHeader({
  name,
  empty,
  editable,
  onEdit,
}: {
  name: string | null;
  empty?: boolean;
  editable: boolean;
  onEdit: () => void;
}) {
  const label = name || "Sin bloque";

  return (
    <div className="rounded px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
      {editable ? (
        <div
          role="button"
          tabIndex={0}
          onClick={onEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onEdit();
            }
          }}
          className="w-full cursor-pointer text-left transition-colors hover:text-foreground"
          title="Clic para editar el bloque"
        >
          {label}
          {empty && (
            <span className="ml-1 font-normal normal-case tracking-normal text-muted-foreground/60">
              (vacío)
            </span>
          )}
        </div>
      ) : (
        <span>
          {label}
          {empty && (
            <span className="ml-1 font-normal normal-case tracking-normal text-muted-foreground/60">
              (vacío)
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function MiniMapRow({
  index,
  item,
  active,
  onClick,
}: {
  index: number;
  item: MiniMapItem;
  active: boolean;
  onClick: () => void;
}) {
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
        status === "ok" && "border-emerald-500 bg-emerald-500 text-white",
        status === "warn" && "border-amber-500 bg-amber-500 text-white",
        status === "err" && "border-destructive bg-destructive text-white",
        active && "ring-2 ring-primary/40 ring-offset-1 ring-offset-card"
      )}
    >
      {index + 1}
    </span>
  );
}

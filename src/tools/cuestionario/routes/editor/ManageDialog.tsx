// Panel "Administrar bloques y preguntas".
//
// Dialog modal grande con dos columnas: la izquierda lista los bloques
// (sortable, con renombrar inline, duplicar, eliminar y badge de salud) y la
// derecha lista todas las preguntas (sortable, filtrable, con select para
// asignar bloque). El acceso es desde el botón "Administrar" del minimap.
//
// Drag-and-drop con @dnd-kit. PointerSensor con activationConstraint para
// convivir con el focus trap de Radix Dialog. Dos DndContext independientes:
// uno para bloques, otro para preguntas (no hay cross-list drag).

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  GripVertical,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SectionDialog } from "./SectionDialog";
import type { MiniMapItem } from "./QuestionMiniMap";
import type { StepStatus } from "./QuestionStepper";

export interface ManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: MiniMapItem[];
  sections: string[];
  onAddSection: (name: string, questionIds: string[]) => void;
  onRenameSection: (oldName: string, newName: string) => void;
  onDeleteSection: (name: string, deleteQuestions: boolean) => void;
  onMoveSection: (from: number, to: number) => void;
  onDuplicateSection: (name: string) => void;
  onMoveQuestion: (from: number, to: number) => void;
  onMoveQuestionToSection: (index: number, sectionName: string | null) => void;
}

const STATUS_ORDER: Record<StepStatus, number> = {
  err: 3,
  warn: 2,
  empty: 1,
  ok: 0,
};

export function ManageDialog({
  open,
  onOpenChange,
  items,
  sections,
  onAddSection,
  onRenameSection,
  onDeleteSection,
  onMoveSection,
  onDuplicateSection,
  onMoveQuestion,
  onMoveQuestionToSection,
}: ManageDialogProps) {
  const [creating, setCreating] = useState(false);
  const [editingBlock, setEditingBlock] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Pill de salud por bloque: el peor status entre sus preguntas.
  const healthBySection = useMemo(() => {
    const map = new Map<string, StepStatus>();
    for (const item of items) {
      const key = item.sectionName ?? null;
      if (key === null) continue;
      const cur = map.get(key);
      if (!cur || STATUS_ORDER[item.status] > STATUS_ORDER[cur]) {
        map.set(key, item.status);
      }
    }
    return map;
  }, [items]);

  const countBySection = useMemo(() => {
    const map = new Map<string | null, number>();
    for (const item of items) {
      const key = item.sectionName ?? null;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const orphanCount = countBySection.get(null) ?? 0;

  // Filtro de búsqueda de preguntas (matcheo todas las palabras en code/text/tipo).
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    const terms = q.split(/\s+/);
    return items.filter((it) => {
      const hay = `${it.code} ${it.text} ${it.typeLabel}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [items, search]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleBlockDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = sections.indexOf(String(active.id));
    const to = sections.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onMoveSection(from, to);
  }

  function handleQuestionDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    // active.id y over.id son questionId; calculo índices globales
    const fromIdx = items.findIndex((i) => i.questionId === String(active.id));
    const toIdx = items.findIndex((i) => i.questionId === String(over.id));
    if (fromIdx < 0 || toIdx < 0) return;
    onMoveQuestion(fromIdx, toIdx);
  }

  const dragEnabled = search.trim().length === 0;

  // Para el SectionDialog secundario que pide confirm de delete.
  const deleteTargetCount = deleteTarget
    ? countBySection.get(deleteTarget) ?? 0
    : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
          <DialogHeader className="border-b px-5 py-3.5">
            <DialogTitle>Administrar bloques y preguntas</DialogTitle>
            <DialogDescription className="text-xs">
              Arrastrá para reordenar, click en el nombre para renombrar.
              Cambios se aplican al instante; tenés que guardar el cuestionario
              al cerrar para persistirlos.
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[300px_1fr]">
            {/* Columna izquierda: bloques */}
            <div className="flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
              <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Bloques ({sections.length})
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setCreating(true)}
                  disabled={creating}
                >
                  <Plus className="size-3.5" />
                  Nuevo
                </Button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
                {sections.length === 0 && !creating && (
                  <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    Sin bloques.
                  </div>
                )}

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleBlockDragEnd}
                >
                  <SortableContext
                    items={sections}
                    strategy={verticalListSortingStrategy}
                  >
                    {sections.map((name) => (
                      <BlockRow
                        key={name}
                        name={name}
                        count={countBySection.get(name) ?? 0}
                        health={healthBySection.get(name) ?? "empty"}
                        editing={editingBlock === name}
                        onStartEdit={() => setEditingBlock(name)}
                        onSubmitEdit={(newName) => {
                          if (newName && newName !== name) {
                            onRenameSection(name, newName);
                          }
                          setEditingBlock(null);
                        }}
                        onCancelEdit={() => setEditingBlock(null)}
                        onDuplicate={() => onDuplicateSection(name)}
                        onDelete={() => setDeleteTarget(name)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>

                {creating && (
                  <NewBlockInline
                    existing={sections}
                    onCancel={() => setCreating(false)}
                    onSubmit={(name) => {
                      onAddSection(name, []);
                      setCreating(false);
                    }}
                  />
                )}

                {orphanCount > 0 && (
                  <div className="mt-1 flex items-center gap-2 rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
                    <span className="flex-1 italic">Sin bloque</span>
                    <span className="font-mono text-[11px] tabular-nums">
                      {orphanCount}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Columna derecha: preguntas */}
            <div className="flex min-h-0 flex-col">
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Preguntas ({items.length})
                </span>
                <div className="ml-auto flex w-full max-w-[260px] items-center gap-1.5 rounded-md border border-input bg-background px-2">
                  <Search className="size-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar código, texto o tipo…"
                    className="h-7 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch("")}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Limpiar búsqueda"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2">
                {filteredItems.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    {search ? "Sin resultados." : "Sin preguntas todavía."}
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleQuestionDragEnd}
                  >
                    <SortableContext
                      items={filteredItems.map((i) => i.questionId)}
                      strategy={verticalListSortingStrategy}
                    >
                      {filteredItems.map((item) => {
                        const globalIdx = items.findIndex(
                          (i) => i.questionId === item.questionId
                        );
                        return (
                          <QuestionRow
                            key={item.questionId}
                            item={item}
                            sections={sections}
                            dragEnabled={dragEnabled}
                            onChangeSection={(name) =>
                              onMoveQuestionToSection(globalIdx, name)
                            }
                          />
                        );
                      })}
                    </SortableContext>
                  </DndContext>
                )}
                {!dragEnabled && filteredItems.length > 0 && (
                  <p className="px-2 py-1.5 text-[10px] italic text-muted-foreground">
                    Reordenar deshabilitado mientras hay filtro activo.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end border-t bg-muted/30 px-4 py-2.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm de delete con el flujo dual del SectionDialog existente. */}
      {deleteTarget && (
        <SectionDialog
          open
          mode="edit"
          initialName={deleteTarget}
          questionCount={deleteTargetCount}
          defaultConfirmDelete
          onOpenChange={(o) => {
            if (!o) setDeleteTarget(null);
          }}
          onConfirm={(newName) => {
            // Si el usuario terminó renombrando en vez de borrar.
            if (newName !== deleteTarget) onRenameSection(deleteTarget, newName);
            setDeleteTarget(null);
          }}
          onDelete={(deleteQuestions) => {
            onDeleteSection(deleteTarget, deleteQuestions);
            setDeleteTarget(null);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// BlockRow
// ---------------------------------------------------------------------------

interface BlockRowProps {
  name: string;
  count: number;
  health: StepStatus;
  editing: boolean;
  onStartEdit: () => void;
  onSubmitEdit: (newName: string) => void;
  onCancelEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function BlockRow({
  name,
  count,
  health,
  editing,
  onStartEdit,
  onSubmitEdit,
  onCancelEdit,
  onDuplicate,
  onDelete,
}: BlockRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: name, disabled: editing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1.5 text-sm transition-colors",
        isDragging && "border-border bg-card opacity-80 shadow",
        !isDragging && "hover:border-border/60 hover:bg-muted/40"
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none p-0.5 text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
        aria-label={`Arrastrar ${name}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      {editing ? (
        <InlineRename
          initial={name}
          onSubmit={onSubmitEdit}
          onCancel={onCancelEdit}
        />
      ) : (
        <button
          type="button"
          onClick={onStartEdit}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          title="Click para renombrar"
        >
          <span className="truncate font-medium">{name}</span>
          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
            ({count})
          </span>
          <HealthBadge status={health} />
        </button>
      )}

      {!editing && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onDuplicate}
            title="Duplicar bloque"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Copy className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Eliminar bloque"
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function HealthBadge({ status }: { status: StepStatus }) {
  if (status === "empty") return null;
  const cls =
    status === "err"
      ? "bg-destructive/15 text-destructive"
      : status === "warn"
        ? "bg-amber-500/15 text-amber-500"
        : "bg-emerald-500/15 text-emerald-500";
  const label = status === "err" ? "⚠" : status === "warn" ? "⚠" : "✓";
  return (
    <span
      className={cn(
        "ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] font-semibold leading-none",
        cls
      )}
      aria-label={`Salud del bloque: ${status}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// NewBlockInline
// ---------------------------------------------------------------------------

function NewBlockInline({
  existing,
  onCancel,
  onSubmit,
}: {
  existing: string[];
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  const exists = existing.includes(trimmed);
  const canSave = trimmed.length > 0 && !exists;

  return (
    <form
      className="flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-1.5 py-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSubmit(trimmed);
      }}
    >
      <span className="px-0.5 text-muted-foreground/60">
        <Plus className="size-4" />
      </span>
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Nombre del bloque"
        className="h-7 flex-1 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <button
        type="submit"
        disabled={!canSave}
        title={exists ? "Ya existe un bloque con ese nombre" : "Crear bloque"}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <Check className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// InlineRename
// ---------------------------------------------------------------------------

function InlineRename({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string;
  onSubmit: (next: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        const t = value.trim();
        if (t) onSubmit(t);
        else onCancel();
      }}
    >
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          const t = value.trim();
          if (t && t !== initial) onSubmit(t);
          else onCancel();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="h-7 text-sm"
      />
    </form>
  );
}

// ---------------------------------------------------------------------------
// QuestionRow
// ---------------------------------------------------------------------------

interface QuestionRowProps {
  item: MiniMapItem;
  sections: string[];
  dragEnabled: boolean;
  onChangeSection: (name: string | null) => void;
}

function QuestionRow({
  item,
  sections,
  dragEnabled,
  onChangeSection,
}: QuestionRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.questionId, disabled: !dragEnabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "grid grid-cols-[auto_24px_minmax(0,1fr)_140px] items-center gap-2 rounded-md border border-transparent px-1.5 py-1.5 text-xs transition-colors",
        isDragging && "border-border bg-card opacity-80 shadow",
        !isDragging && "hover:border-border/60 hover:bg-muted/40"
      )}
    >
      <button
        type="button"
        className={cn(
          "touch-none p-0.5",
          dragEnabled
            ? "cursor-grab text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
            : "cursor-not-allowed text-muted-foreground/20"
        )}
        aria-label={`Arrastrar ${item.code}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <StatusPill status={item.status} />

      <div className="min-w-0">
        <div className="truncate text-[13px] text-foreground">
          {item.text.trim() || (
            <span className="italic text-muted-foreground">Sin texto</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="font-mono">{item.code}</span>
          <span>·</span>
          <span>{item.typeLabel}</span>
        </div>
      </div>

      <select
        value={item.sectionName ?? ""}
        onChange={(e) => onChangeSection(e.target.value === "" ? null : e.target.value)}
        className="h-7 truncate rounded-md border border-input bg-background px-1.5 text-[11px] outline-none focus-visible:border-ring"
      >
        <option value="">Sin bloque</option>
        {sections.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}

function StatusPill({ status }: { status: StepStatus }) {
  return (
    <span
      className={cn(
        "size-3 shrink-0 rounded-full",
        status === "empty" && "bg-muted",
        status === "ok" && "bg-emerald-500",
        status === "warn" && "bg-amber-500",
        status === "err" && "bg-destructive"
      )}
      aria-label={`Estado: ${status}`}
    />
  );
}

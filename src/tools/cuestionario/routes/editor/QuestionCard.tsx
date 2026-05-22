// Card editable de una pregunta del cuestionario.
//
// Es totalmente controlada: recibe la `Question` y un `onChange`. No persiste
// nada; eso lo hace el shell del Editor.
//
// La card muestra inline los issues deterministicos relacionados (los que el
// shell le pase via prop). Los AI issues no se muestran inline porque corren
// on-demand desde el reporte.
//
// Drag & drop: opcional — sólo se activa si el shell pasa los handlers
// `onDragStart` / `onDragOver` / `onDrop`. La vista single-focus del editor
// no los pasa (mostrar una sola card a la vez vuelve el reorder por drag
// inviable), pero el resto de los call sites pueden seguir usándolo.

import { Fragment } from "react";
import {
  AlertTriangle,
  Copy,
  GripVertical,
  Info,
  Trash2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  IssueSeverity,
  QCIssue,
  Question,
  QuestionType,
} from "@/lib/cuestionario/types";
import { OptionsEditor } from "./OptionsEditor";
import { FlowEditor } from "./FlowEditor";

const QUESTION_TYPES: QuestionType[] = [
  "cerrada_unica",
  "cerrada_multiple",
  "escala",
  "matriz",
  "abierta_texto",
  "abierta_marca",
  "numerica",
  "ranking",
  "fecha",
];

const TYPE_LABEL: Record<QuestionType, string> = {
  cerrada_unica: "Cerrada (única)",
  cerrada_multiple: "Cerrada (múltiple)",
  escala: "Escala",
  matriz: "Matriz",
  abierta_texto: "Abierta · texto",
  abierta_marca: "Abierta · marca",
  numerica: "Numérica",
  ranking: "Ranking",
  fecha: "Fecha",
};

const TYPES_WITH_OPTIONS: QuestionType[] = [
  "cerrada_unica",
  "cerrada_multiple",
  "escala",
  "matriz",
  "ranking",
];

const TYPES_WITH_RANGE: QuestionType[] = ["escala", "numerica"];

export interface QuestionCardProps {
  value: Question;
  /** Índice 0-based en la lista (sólo presentacional / accessibility). */
  index: number;
  totalCount: number;
  /** Issues deterministicos correspondientes a esta pregunta. */
  issues: QCIssue[];
  onChange: (next: Question) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** Handlers para drag & drop. Opcionales: la vista single-focus del editor
   *  no muestra más de una card a la vez, así que no necesita reordenar por
   *  drag (usa el mini-map o los botones up/down). */
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  disabled?: boolean;
}

export function QuestionCard({
  value: q,
  index,
  totalCount,
  issues,
  onChange,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  disabled,
}: QuestionCardProps) {
  const hasError = issues.some((i) => i.severidad === "error");
  const hasWarn = issues.some((i) => i.severidad === "advertencia");

  function patch<K extends keyof Question>(key: K, val: Question[K]) {
    onChange({ ...q, [key]: val });
  }

  function changeType(next: QuestionType) {
    const cleaned: Question = { ...q, tipo: next };
    if (!TYPES_WITH_OPTIONS.includes(next)) cleaned.opciones = [];
    if (!TYPES_WITH_RANGE.includes(next)) {
      delete cleaned.min;
      delete cleaned.max;
    }
    if (next !== "matriz") delete cleaned.enunciados;
    onChange(cleaned);
  }

  const dragEnabled = !disabled && Boolean(onDragStart);

  return (
    <Card
      draggable={dragEnabled}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "border-l-4 transition-colors",
        hasError
          ? "border-l-destructive/70"
          : hasWarn
          ? "border-l-amber-500/70"
          : "border-l-primary/40"
      )}
      data-question-id={q.id}
    >
      <CardContent className="flex flex-col gap-4 pt-6">
        {/* Header: (drag handle) + número + ID + tipo + acciones */}
        <div className="flex flex-wrap items-center gap-2">
          {dragEnabled && (
            <span
              className="flex size-6 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
              aria-label="Arrastrar para reordenar"
              title="Arrastrar para reordenar"
            >
              <GripVertical className="size-4" />
            </span>
          )}
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary font-mono text-xs font-bold tabular-nums text-primary-foreground">
            #{q.numero}
          </span>
          <Input
            value={q.id}
            onChange={(e) => patch("id", e.target.value)}
            disabled={disabled}
            placeholder="ID (ej: P1)"
            className="w-28 font-mono text-xs"
            aria-label="ID de la pregunta"
          />
          <TypeChips
            value={q.tipo}
            onChange={changeType}
            disabled={disabled}
          />

          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onMoveUp}
              disabled={disabled || index === 0}
              aria-label="Subir pregunta"
              className="size-7"
            >
              <span className="text-xs">↑</span>
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onMoveDown}
              disabled={disabled || index === totalCount - 1}
              aria-label="Bajar pregunta"
              className="size-7"
            >
              <span className="text-xs">↓</span>
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onDuplicate}
              disabled={disabled}
              aria-label="Duplicar pregunta"
              className="size-7"
            >
              <Copy className="size-3.5" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={onDelete}
              disabled={disabled}
              aria-label="Eliminar pregunta"
              className="size-7"
            >
              <Trash2 className="size-3.5 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Texto */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`q-texto-${q.id}`}>Texto de la pregunta</Label>
          <Textarea
            id={`q-texto-${q.id}`}
            value={q.texto}
            onChange={(e) => patch("texto", e.target.value)}
            disabled={disabled}
            placeholder="¿Cuál es tu marca preferida?"
            rows={2}
          />
        </div>

        {/* Condición + aleatorizar */}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`q-cond-${q.id}`}>Condición (mostrar si…)</Label>
            <Input
              id={`q-cond-${q.id}`}
              value={q.condicion}
              onChange={(e) => patch("condicion", e.target.value)}
              disabled={disabled}
              placeholder='Ej: S1=3   (dejar vacío si siempre se muestra)'
              className="font-mono text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Aleatorizar opciones</Label>
            <div className="flex items-center gap-2 pt-1">
              <Switch
                id={`q-aleat-${q.id}`}
                checked={q.aleatorizar}
                onCheckedChange={(v) => patch("aleatorizar", v)}
                disabled={disabled}
              />
              <Label
                htmlFor={`q-aleat-${q.id}`}
                className="text-xs font-normal text-muted-foreground"
              >
                {q.aleatorizar
                  ? "Las opciones se presentan en orden aleatorio"
                  : "Orden fijo"}
              </Label>
            </div>
          </div>
        </div>

        {/* Min / max (sólo escala/numérica) */}
        {TYPES_WITH_RANGE.includes(q.tipo) && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`q-min-${q.id}`}>Mínimo</Label>
              <Input
                id={`q-min-${q.id}`}
                type="number"
                value={q.min ?? ""}
                onChange={(e) =>
                  patch("min", e.target.value === "" ? undefined : Number(e.target.value))
                }
                disabled={disabled}
                placeholder={q.tipo === "escala" ? "1" : ""}
                className="font-mono text-xs"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`q-max-${q.id}`}>Máximo</Label>
              <Input
                id={`q-max-${q.id}`}
                type="number"
                value={q.max ?? ""}
                onChange={(e) =>
                  patch("max", e.target.value === "" ? undefined : Number(e.target.value))
                }
                disabled={disabled}
                placeholder={q.tipo === "escala" ? "5" : ""}
                className="font-mono text-xs"
              />
            </div>
          </div>
        )}

        {/* Opciones (cerradas, escala con opciones, ranking, matriz) */}
        {TYPES_WITH_OPTIONS.includes(q.tipo) && (
          <OptionsEditor
            value={q.opciones}
            onChange={(next) => patch("opciones", next)}
            disabled={disabled}
            title={q.tipo === "matriz" ? "Columnas (opciones)" : "Opciones"}
          />
        )}

        {/* Enunciados (sólo matriz) */}
        {q.tipo === "matriz" && (
          <OptionsEditor
            value={q.enunciados ?? []}
            onChange={(next) => patch("enunciados", next)}
            disabled={disabled}
            title="Filas (enunciados)"
            addLabel="Agregar enunciado"
            showFlow={false}
          />
        )}

        {/* Flujo a nivel pregunta */}
        <FlowEditor
          value={q.flujo}
          onChange={(next) => patch("flujo", next)}
          disabled={disabled}
        />

        {/* Issues inline */}
        {issues.length > 0 && <InlineIssues issues={issues} />}
      </CardContent>
    </Card>
  );
}

// Chips de tipo de pregunta — reemplaza al `<select>` original. Cada chip es
// un botón compacto que muestra el label legible y se marca como activo cuando
// es el tipo seleccionado.
function TypeChips({
  value,
  onChange,
  disabled,
}: {
  value: QuestionType;
  onChange: (next: QuestionType) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Tipo de pregunta"
      className="flex flex-wrap gap-1"
    >
      {QUESTION_TYPES.map((t) => {
        const on = t === value;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(t)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors disabled:opacity-50",
              on
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:border-primary hover:text-foreground"
            )}
          >
            {TYPE_LABEL[t]}
          </button>
        );
      })}
    </div>
  );
}

function InlineIssues({ issues }: { issues: QCIssue[] }) {
  return (
    <div className="flex flex-col gap-1">
      {issues.map((i, idx) => (
        <Fragment key={idx}>
          <InlineIssueRow issue={i} />
        </Fragment>
      ))}
    </div>
  );
}

function InlineIssueRow({ issue }: { issue: QCIssue }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/30 px-3 py-1.5 text-xs">
      <SeverityIcon severity={issue.severidad} />
      <Badge variant="outline" className="font-normal">
        {issue.categoria}
      </Badge>
      <span className="flex-1 leading-snug">{issue.descripcion}</span>
    </div>
  );
}

function SeverityIcon({ severity }: { severity: IssueSeverity }) {
  if (severity === "error")
    return <XCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />;
  if (severity === "advertencia")
    return (
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
    );
  return <Info className="mt-0.5 size-3.5 shrink-0 text-sky-500" />;
}

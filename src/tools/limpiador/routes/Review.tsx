// Pantalla de Review (paso 5.A + 5.B).
//
// Cambios clave vs mega-dashboard:
//   - "friendly_explanation" como texto principal de la tarjeta cuando existe
//     (fallback a `reason` si la versión es pre-paso-4).
//   - Badge "Recomiendo eliminar/revisar/mantener" arriba de la tarjeta usando
//     `flag.recommendation`.
//   - Tarjetas de pregunta(s) afectada(s) (`affected_question_ids`) con texto
//     completo y edición inline de la celda (5.A — `cleaning_row_edits`).
//   - Collapsable de respuestas similares (`similar_response_ids`) cuando los
//     embeddings detectaron paráfrasis cross-row.
//   - Filtro adicional por recomendación.
//   - En la grilla expandida se muestra el texto de la pregunta (`column.question`)
//     en lugar del id; cada celda es editable inline.
//
// La sincronización a QuestionPro (5.C) NO está acá: la sección queda abierta
// para una iteración separada con su propia confirmación destructiva.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Edit3,
  Filter,
  Info,
  Loader2,
  RotateCcw,
  Undo2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  bulkUpdateFlagDecisions,
  getReviewFlagCounts,
  listFlags,
  resetFlagDecisions,
  updateFlagDecision,
  type ListFlagsFilters,
} from "@/lib/cleaning/flags-repository";
import {
  getVersionEdits,
  revertRowEdit,
  upsertRowEdit,
} from "@/lib/cleaning/row-edits-repository";
import { getVersion } from "@/lib/cleaning/cleaning-repository";
import { getCleaningSupabaseClient } from "@/lib/cleaning/supabase-client";
import type {
  CleaningFlagWithRow,
  CleaningRowEdit,
  CleaningVersion,
  FlagRecommendation,
  ReviewFlagCounts,
  SchemaColumn,
} from "@/lib/cleaning/types";

const EMPTY_COUNTS: ReviewFlagCounts = {
  red: 0,
  yellow: 0,
  pending: 0,
  decided: 0,
  toRemove: 0,
  toKeep: 0,
};

export interface ReviewProps {
  versionId: string;
  onBack: () => void;
  onGoToExport: () => void;
}

type FilterType = "all" | "red" | "yellow";
type FilterDecision = "all" | "pending" | "keep" | "remove";
type FilterRecommendation = "all" | FlagRecommendation;

export function Review({ versionId, onBack, onGoToExport }: ReviewProps) {
  const [version, setVersion] = useState<CleaningVersion | null>(null);
  const [flags, setFlags] = useState<CleaningFlagWithRow[]>([]);
  const [counts, setCounts] = useState<ReviewFlagCounts>(EMPTY_COUNTS);
  const [editsMap, setEditsMap] = useState<
    Map<string, Map<string, CleaningRowEdit>>
  >(new Map());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterDecision, setFilterDecision] = useState<FilterDecision>("all");
  const [filterRecommendation, setFilterRecommendation] =
    useState<FilterRecommendation>("all");

  // Selección (para bulk update)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // UI per-flag
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedSimilars, setExpandedSimilars] = useState<Set<string>>(
    new Set()
  );
  const [updating, setUpdating] = useState<Set<string>>(new Set());

  // --- carga inicial + reload tras cambios -------------------------------

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = await getCleaningSupabaseClient();
      const [v, c, e] = await Promise.all([
        getVersion(client, versionId),
        getReviewFlagCounts(versionId),
        getVersionEdits(versionId),
      ]);
      setVersion(v);
      setCounts(c);
      setEditsMap(e);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [versionId]);

  const loadFlags = useCallback(async () => {
    const filters: ListFlagsFilters = {};
    if (filterType !== "all") filters.flagType = filterType;
    if (filterDecision !== "all") filters.userDecision = filterDecision;
    try {
      const f = await listFlags(versionId, filters);
      setFlags(f);
      setSelected(new Set()); // limpiar selección al cambiar filtro
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [versionId, filterType, filterDecision]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!loading) void loadFlags();
  }, [loadFlags, loading]);

  // Filtro por recomendación se aplica client-side (no hay índice DB ideal).
  const visibleFlags = useMemo(() => {
    if (filterRecommendation === "all") return flags;
    return flags.filter((f) => f.recommendation === filterRecommendation);
  }, [flags, filterRecommendation]);

  // --- decisiones ---------------------------------------------------------

  const handleDecide = useCallback(
    async (flagId: string, decision: "keep" | "remove") => {
      setUpdating((s) => new Set(s).add(flagId));
      try {
        await updateFlagDecision(flagId, decision);
        setFlags((prev) =>
          prev.map((f) =>
            f.id === flagId
              ? {
                  ...f,
                  user_decision: decision,
                  decided_at: new Date().toISOString(),
                }
              : f
          )
        );
        setCounts(await getReviewFlagCounts(versionId));
      } catch (err) {
        window.alert(
          `No se pudo actualizar el flag: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      } finally {
        setUpdating((s) => {
          const next = new Set(s);
          next.delete(flagId);
          return next;
        });
      }
    },
    [versionId]
  );

  const handleBulkDecide = useCallback(
    async (decision: "keep" | "remove") => {
      if (selected.size === 0) return;
      const ids = [...selected];
      try {
        await bulkUpdateFlagDecisions(ids, decision);
        const at = new Date().toISOString();
        setFlags((prev) =>
          prev.map((f) =>
            selected.has(f.id)
              ? { ...f, user_decision: decision, decided_at: at }
              : f
          )
        );
        setSelected(new Set());
        setCounts(await getReviewFlagCounts(versionId));
      } catch (err) {
        window.alert(
          `No se pudieron actualizar los flags: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    },
    [selected, versionId]
  );

  const handleResetAll = useCallback(async () => {
    if (
      !window.confirm(
        "¿Resetear todas las decisiones? Esto vuelve los flags a estado pendiente."
      )
    ) {
      return;
    }
    try {
      await resetFlagDecisions(versionId);
      await loadAll();
      await loadFlags();
    } catch (err) {
      window.alert(
        `No se pudo resetear: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }, [versionId, loadAll, loadFlags]);

  // --- edits --------------------------------------------------------------

  const handleSaveEdit = useCallback(
    async (rowId: string, columnId: string, newValue: string, originalValue: unknown) => {
      try {
        const edit = await upsertRowEdit({
          rowId,
          versionId,
          columnId,
          originalValue,
          newValue,
        });
        setEditsMap((prev) => {
          const next = new Map(prev);
          let perRow = next.get(rowId);
          if (!perRow) {
            perRow = new Map();
            next.set(rowId, perRow);
          } else {
            perRow = new Map(perRow);
            next.set(rowId, perRow);
          }
          perRow.set(columnId, edit);
          return next;
        });
      } catch (err) {
        window.alert(
          `No se pudo guardar el edit: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    },
    [versionId]
  );

  const handleRevertEdit = useCallback(
    async (rowId: string, columnId: string) => {
      try {
        await revertRowEdit(rowId, columnId);
        setEditsMap((prev) => {
          const next = new Map(prev);
          const perRow = next.get(rowId);
          if (!perRow) return prev;
          const newPerRow = new Map(perRow);
          newPerRow.delete(columnId);
          if (newPerRow.size === 0) {
            next.delete(rowId);
          } else {
            next.set(rowId, newPerRow);
          }
          return next;
        });
      } catch (err) {
        window.alert(
          `No se pudo revertir: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    },
    []
  );

  // --- helpers UI ---------------------------------------------------------

  const toggleRow = (id: string) =>
    setExpandedRows((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSimilars = (id: string) =>
    setExpandedSimilars((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSelectAll = () => {
    if (selected.size === visibleFlags.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleFlags.map((f) => f.id)));
    }
  };

  // --- render -------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Cargando review…
      </div>
    );
  }

  if (error || !version) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="size-4" />
            <span className="font-medium">No se pudo cargar el review</span>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
            {error ?? "Versión no encontrada"}
          </pre>
          <div>
            <Button size="sm" onClick={onBack}>
              Volver
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const editedRowsCount = editsMap.size;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="size-4" />
          Volver al proyecto
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Revisar flags
          </h2>
          <p className="text-sm text-muted-foreground">
            {version.filename} · v{version.version_number}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleResetAll()}
            className="gap-2"
          >
            <RotateCcw className="size-4" />
            Resetear todo
          </Button>
          <Button onClick={onGoToExport} size="sm" className="gap-2">
            <Download className="size-4" />
            Exportar limpio
          </Button>
        </div>
      </div>

      {/* Stats */}
      <ReviewStats counts={counts} editedRows={editedRowsCount} />

      {/* Filters + bulk */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <Select
              value={filterType}
              onValueChange={(v) => setFilterType(v as FilterType)}
            >
              <SelectTrigger className="w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="red">Solo Red</SelectItem>
                <SelectItem value="yellow">Solo Yellow</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filterDecision}
              onValueChange={(v) => setFilterDecision(v as FilterDecision)}
            >
              <SelectTrigger className="w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las decisiones</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="keep">Mantener</SelectItem>
                <SelectItem value="remove">Eliminar</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filterRecommendation}
              onValueChange={(v) =>
                setFilterRecommendation(v as FilterRecommendation)
              }
            >
              <SelectTrigger className="w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toda recomendación</SelectItem>
                <SelectItem value="remove">Recomienda eliminar</SelectItem>
                <SelectItem value="review">Recomienda revisar</SelectItem>
                <SelectItem value="keep">Recomienda mantener</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {selected.size} seleccionados
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleBulkDecide("keep")}
                className="gap-1"
              >
                <CheckCircle2 className="size-4 text-emerald-500" />
                Mantener
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleBulkDecide("remove")}
                className="gap-1"
              >
                <XCircle className="size-4 text-destructive" />
                Eliminar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Flag list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Flags ({visibleFlags.length})
          </CardTitle>
          {visibleFlags.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={
                  selected.size > 0 && selected.size === visibleFlags.length
                }
                onCheckedChange={toggleSelectAll}
              />
              Seleccionar todos
            </label>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {visibleFlags.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              {counts.red + counts.yellow === 0 ? (
                <>
                  <CheckCircle2 className="size-10 text-emerald-500" />
                  <p>No se encontraron flags. ¡Los datos parecen limpios!</p>
                </>
              ) : (
                <>
                  <Filter className="size-10 opacity-50" />
                  <p>Ningún flag con los filtros seleccionados.</p>
                </>
              )}
            </div>
          ) : (
            visibleFlags.map((flag) => (
              <FlagCard
                key={flag.id}
                flag={flag}
                schema={version.schema.columns}
                edits={flag.row ? editsMap.get(flag.row.id) : undefined}
                selected={selected.has(flag.id)}
                expandedFull={expandedRows.has(flag.id)}
                expandedSimilars={expandedSimilars.has(flag.id)}
                updating={updating.has(flag.id)}
                onToggleSelect={() => toggleSelect(flag.id)}
                onToggleFull={() => toggleRow(flag.id)}
                onToggleSimilars={() => toggleSimilars(flag.id)}
                onDecide={(d) => void handleDecide(flag.id, d)}
                onSaveEdit={handleSaveEdit}
                onRevertEdit={handleRevertEdit}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// --- ReviewStats ---------------------------------------------------------

function ReviewStats({
  counts,
  editedRows,
}: {
  counts: ReviewFlagCounts;
  editedRows: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      <StatCard label="Red flags" value={counts.red} tone="red" />
      <StatCard label="Yellow flags" value={counts.yellow} tone="amber" />
      <StatCard label="Pendientes" value={counts.pending} />
      <StatCard label="Decididos" value={counts.decided} />
      <StatCard label="Mantener" value={counts.toKeep} tone="emerald" />
      <StatCard label="Eliminar" value={counts.toRemove} tone="red" />
      <StatCard label="Editadas" value={editedRows} tone="blue" />
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "red" | "amber" | "emerald" | "blue";
}) {
  const toneCls =
    tone === "red"
      ? "border-red-500/40 bg-red-500/5 text-red-300"
      : tone === "amber"
        ? "border-amber-500/40 bg-amber-500/5 text-amber-300"
        : tone === "emerald"
          ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-300"
          : tone === "blue"
            ? "border-sky-500/40 bg-sky-500/5 text-sky-300"
            : "bg-muted/30";
  return (
    <div className={cn("flex flex-col gap-0.5 rounded-md border p-2", toneCls)}>
      <span className="text-lg font-semibold">{value}</span>
      <span className="text-[10px] uppercase tracking-wide opacity-80">
        {label}
      </span>
    </div>
  );
}

// --- FlagCard ------------------------------------------------------------

interface FlagCardProps {
  flag: CleaningFlagWithRow;
  schema: SchemaColumn[];
  edits: Map<string, CleaningRowEdit> | undefined;
  selected: boolean;
  expandedFull: boolean;
  expandedSimilars: boolean;
  updating: boolean;
  onToggleSelect: () => void;
  onToggleFull: () => void;
  onToggleSimilars: () => void;
  onDecide: (decision: "keep" | "remove") => void;
  onSaveEdit: (
    rowId: string,
    columnId: string,
    newValue: string,
    originalValue: unknown
  ) => Promise<void>;
  onRevertEdit: (rowId: string, columnId: string) => Promise<void>;
}

function FlagCard({
  flag,
  schema,
  edits,
  selected,
  expandedFull,
  expandedSimilars,
  updating,
  onToggleSelect,
  onToggleFull,
  onToggleSimilars,
  onDecide,
  onSaveEdit,
  onRevertEdit,
}: FlagCardProps) {
  const row = flag.row;
  const decisionTone =
    flag.user_decision === "remove"
      ? "border-red-500/40 bg-red-500/5"
      : flag.user_decision === "keep"
        ? "border-emerald-500/40 bg-emerald-500/5"
        : "bg-card";

  // Resolver columnas afectadas a partir del schema.
  const affectedColumns = (flag.affected_question_ids ?? [])
    .map((id) => schema.find((c) => c.id === id))
    .filter((c): c is SchemaColumn => Boolean(c));

  const mainText = flag.friendly_explanation || flag.reason;

  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border p-4", decisionTone)}>
      {/* Top row: checkbox + recommendation badge + meta + decision buttons */}
      <div className="flex items-start gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          className="mt-1"
        />

        <div className="min-w-0 flex-1 space-y-2">
          {/* Recomendación destacada arriba */}
          <div className="flex flex-wrap items-center gap-2">
            <RecommendationBadge
              recommendation={flag.recommendation}
              flagType={flag.flag_type}
            />
            <span className="text-xs text-muted-foreground">
              Fila #{row?.row_number ?? "?"}
            </span>
            {row?.response_id && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                {row.response_id}
              </span>
            )}
            {typeof flag.confidence === "number" && (
              <span className="text-xs text-muted-foreground">
                Confianza: {Math.round(flag.confidence * 100)}%
              </span>
            )}
            {flag.user_decision && (
              <Badge
                variant={flag.user_decision === "keep" ? "default" : "destructive"}
                className="ml-auto"
              >
                {flag.user_decision === "keep" ? "Mantener" : "Eliminar"}
              </Badge>
            )}
          </div>

          {/* Texto principal: friendly_explanation o fallback a reason */}
          {mainText && <p className="text-sm leading-relaxed">{mainText}</p>}
        </div>

        {/* Decision buttons */}
        <div className="flex shrink-0 items-center gap-1">
          {updating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onDecide("keep")}
                aria-label="Mantener"
                className={cn(
                  "size-8",
                  flag.user_decision === "keep" && "bg-emerald-500/20"
                )}
              >
                <CheckCircle2 className="size-4 text-emerald-500" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onDecide("remove")}
                aria-label="Eliminar"
                className={cn(
                  "size-8",
                  flag.user_decision === "remove" && "bg-red-500/20"
                )}
              >
                <XCircle className="size-4 text-destructive" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Affected questions con edit inline */}
      {row && affectedColumns.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Pregunta{affectedColumns.length > 1 ? "s" : ""} afectada
            {affectedColumns.length > 1 ? "s" : ""}
          </p>
          {affectedColumns.map((col) => (
            <AffectedQuestionRow
              key={col.id}
              column={col}
              rowId={row.id}
              originalValue={row.data[col.id]}
              edit={edits?.get(col.id)}
              onSave={(newValue) =>
                onSaveEdit(row.id, col.id, newValue, row.data[col.id])
              }
              onRevert={() => onRevertEdit(row.id, col.id)}
            />
          ))}
        </div>
      )}

      {/* Respuestas similares */}
      {flag.similar_response_ids && flag.similar_response_ids.length > 0 && (
        <div className="rounded-md border bg-muted/10 px-3 py-2 text-xs">
          <button
            type="button"
            onClick={onToggleSimilars}
            className="flex w-full items-center gap-2 text-left font-medium"
          >
            {expandedSimilars ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            <Info className="size-3.5 text-sky-400" />
            {flag.similar_response_ids.length} respuesta
            {flag.similar_response_ids.length === 1 ? "" : "s"} con texto similar
          </button>
          {expandedSimilars && (
            <ul className="mt-2 ml-7 list-disc space-y-0.5 text-muted-foreground">
              {flag.similar_response_ids.map((id) => (
                <li key={id} className="font-mono">
                  {id}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Toggle ver respuesta completa */}
      {row && (
        <div className="border-t pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleFull}
            className="h-7 gap-1 text-xs"
          >
            {expandedFull ? (
              <>
                <ChevronDown className="size-3" />
                Ocultar respuesta completa
              </>
            ) : (
              <>
                <ChevronRight className="size-3" />
                Ver respuesta completa
              </>
            )}
          </Button>
          {expandedFull && (
            <FullRowGrid
              rowId={row.id}
              data={row.data}
              schema={schema}
              edits={edits}
              onSaveEdit={onSaveEdit}
              onRevertEdit={onRevertEdit}
            />
          )}
        </div>
      )}
    </div>
  );
}

function RecommendationBadge({
  recommendation,
  flagType,
}: {
  recommendation: FlagRecommendation | null;
  flagType: "red" | "yellow";
}) {
  // Si no hay recommendation (flag pre-paso-4), inferimos del flag_type.
  const effective: FlagRecommendation =
    recommendation ?? (flagType === "red" ? "remove" : "review");

  const cfg =
    effective === "remove"
      ? {
          label: "Recomiendo eliminar",
          icon: <AlertTriangle className="size-3" />,
          cls: "bg-red-500/15 text-red-300 border-red-500/40",
        }
      : effective === "review"
        ? {
            label: "Recomiendo revisar",
            icon: <AlertCircle className="size-3" />,
            cls: "bg-amber-500/15 text-amber-300 border-amber-500/40",
          }
        : {
            label: "Recomiendo mantener",
            icon: <CheckCircle2 className="size-3" />,
            cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
          };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        cfg.cls
      )}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// --- AffectedQuestionRow -------------------------------------------------

interface AffectedQuestionRowProps {
  column: SchemaColumn;
  rowId: string;
  originalValue: unknown;
  edit: CleaningRowEdit | undefined;
  onSave: (newValue: string) => Promise<void>;
  onRevert: () => Promise<void>;
}

function AffectedQuestionRow({
  column,
  originalValue,
  edit,
  onSave,
  onRevert,
}: AffectedQuestionRowProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <p
        className="line-clamp-2 text-xs font-medium"
        title={column.question || column.id}
      >
        {column.question || column.id}{" "}
        <span className="font-mono text-[10px] text-muted-foreground">
          ({column.id})
        </span>
      </p>
      <EditableCell
        originalValue={originalValue}
        edit={edit}
        onSave={onSave}
        onRevert={onRevert}
      />
    </div>
  );
}

// --- EditableCell --------------------------------------------------------

interface EditableCellProps {
  originalValue: unknown;
  edit: CleaningRowEdit | undefined;
  onSave: (newValue: string) => Promise<void>;
  onRevert: () => Promise<void>;
}

function EditableCell({
  originalValue,
  edit,
  onSave,
  onRevert,
}: EditableCellProps) {
  const displayedRaw = edit ? edit.new_value : originalValue;
  const displayed = displayedRaw === null || displayedRaw === undefined
    ? ""
    : String(displayedRaw);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const isLong = displayed.length > 80;

  const startEdit = () => {
    setDraft(displayed);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft("");
  };

  const save = async () => {
    if (draft === displayed) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5">
        {isLong ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="text-xs"
            disabled={saving}
            autoFocus
          />
        ) : (
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="text-xs"
            disabled={saving}
            autoFocus
          />
        )}
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={cancelEdit}
            disabled={saving}
            className="h-7 px-2 text-xs"
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={saving}
            className="h-7 px-2 text-xs"
          >
            {saving ? <Loader2 className="size-3 animate-spin" /> : "Guardar"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2">
      <div
        className={cn(
          "min-w-0 flex-1 break-words rounded border px-2 py-1 text-xs",
          edit
            ? "border-sky-500/40 bg-sky-500/5"
            : "border-border bg-background/30"
        )}
      >
        {edit && (
          <span className="mr-1.5 inline-flex items-center gap-1 rounded bg-sky-500/20 px-1 py-0.5 text-[10px] font-medium text-sky-300">
            <Edit3 className="size-2.5" />
            Editado
          </span>
        )}
        <span className="whitespace-pre-wrap">{displayed || <em className="text-muted-foreground">(vacío)</em>}</span>
        {edit && (
          <p className="mt-1 line-through opacity-60">
            <span className="text-[10px] uppercase opacity-70">Original:</span>{" "}
            {String(edit.original_value ?? "") || "(vacío)"}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={startEdit}
          aria-label="Editar"
          className="size-6"
        >
          <Edit3 className="size-3" />
        </Button>
        {edit && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => void onRevert()}
            aria-label="Revertir edit"
            className="size-6"
          >
            <Undo2 className="size-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

// --- FullRowGrid (expanded row view) ------------------------------------

interface FullRowGridProps {
  rowId: string;
  data: Record<string, unknown>;
  schema: SchemaColumn[];
  edits: Map<string, CleaningRowEdit> | undefined;
  onSaveEdit: (
    rowId: string,
    columnId: string,
    newValue: string,
    originalValue: unknown
  ) => Promise<void>;
  onRevertEdit: (rowId: string, columnId: string) => Promise<void>;
}

function FullRowGrid({
  rowId,
  data,
  schema,
  edits,
  onSaveEdit,
  onRevertEdit,
}: FullRowGridProps) {
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md border bg-muted/20 p-3">
      {schema.slice(0, 80).map((col) => (
        <div
          key={col.id}
          className="flex flex-col gap-1 border-b border-border/50 pb-2 last:border-0 last:pb-0"
        >
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium" title={col.id}>
              {col.question || col.id}
            </span>
            {col.question && col.question !== col.id && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {col.id}
              </span>
            )}
          </div>
          <EditableCell
            originalValue={data[col.id]}
            edit={edits?.get(col.id)}
            onSave={(newValue) =>
              onSaveEdit(rowId, col.id, newValue, data[col.id])
            }
            onRevert={() => onRevertEdit(rowId, col.id)}
          />
        </div>
      ))}
      {schema.length > 80 && (
        <p className="text-xs text-muted-foreground">
          +{schema.length - 80} columnas más (truncadas para no saturar la UI).
        </p>
      )}
    </div>
  );
}

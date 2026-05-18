// Pantalla de Review (paso 5.B) — rediseño "Inbox" (ideas 1, 2, 4 del menú).
//
// Layout split-pane: lista compacta de flags a la izquierda (1 línea c/u),
// panel de detalle a la derecha que cambia al click. Estilo Outlook/Linear.
//   - Idea 1: split-pane con scroll independiente en cada lado.
//   - Idea 2: severidad por color (4 niveles, ver `@/lib/cleaning/severity`);
//     la lista se ordena por severidad descendente y cada ítem tiene un punto
//     de color; el detalle muestra una pill de severidad.
//   - Idea 4: los filtros pasan a chips removibles + un menú "+ Filtro";
//     dimensiones: tipo, decisión, recomendación, severidad.
//
// El detalle conserva todo lo de antes: friendly_explanation, badge de
// recomendación, preguntas afectadas con edición inline (5.A), respuestas
// similares collapsable, grilla de la fila completa, decisión keep/remove,
// y el botón "Sincronizar con QuestionPro" (5.C) sigue en el header.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Download,
  Edit3,
  Filter,
  Info,
  Loader2,
  Maximize2,
  Plus,
  RotateCcw,
  Undo2,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  bulkUpdateFlagDecisions,
  createManualRemoveFlag,
  getReviewFlagCounts,
  getSimilarRows,
  listFlags,
  listUnflaggedRows,
  resetFlagDecisions,
  updateFlagDecision,
  type ListFlagsFilters,
} from "@/lib/cleaning/flags-repository";
import {
  getReviewSyncStatus,
  hasPendingSync,
  syncReviewToQP,
  type ReviewSyncStatus,
  type SyncToQPProgress,
  type SyncToQPResult,
} from "@/lib/cleaning/sync-to-questionpro";
import {
  getVersionEdits,
  revertRowEdit,
  upsertRowEdit,
} from "@/lib/cleaning/row-edits-repository";
import { getVersion } from "@/lib/cleaning/cleaning-repository";
import { getCleaningSupabaseClient } from "@/lib/cleaning/supabase-client";
import {
  effectiveRecommendation,
  flagColor,
  flagSeverityScore,
  RULE_COLOR_ACCENT,
  RULE_COLOR_DOT,
  RULE_COLOR_LABEL,
  RULE_COLOR_PILL,
  RULE_COLOR_RANK,
  type RuleColor,
} from "@/lib/cleaning/severity";
import type {
  CleaningFlagWithRow,
  CleaningRow,
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

/**
 * Marca usada en entradas "virtuales" del review: filas que la IA no flagueó
 * y que aparecen sólo cuando el usuario activa el toggle "Mostrar todas las
 * filas". No tienen registro en `cleaning_flags` (todavía). Se renderizan como
 * "OK · auto-keep"; si el usuario decide eliminar una, se crea un flag real
 * vía `createManualRemoveFlag` y el reload las convierte en entradas normales.
 */
type ReviewItem = CleaningFlagWithRow & { _virtual?: boolean };

export interface ReviewProps {
  versionId: string;
  onBack: () => void;
  onGoToExport: () => void;
}

type FilterType = "all" | "red" | "yellow";
type FilterDecision = "all" | "pending" | "keep" | "remove";
type FilterRecommendation = "all" | FlagRecommendation;
type FilterColor = "all" | RuleColor;

export function Review({ versionId, onBack, onGoToExport }: ReviewProps) {
  const [version, setVersion] = useState<CleaningVersion | null>(null);
  const [flags, setFlags] = useState<CleaningFlagWithRow[]>([]);
  const [counts, setCounts] = useState<ReviewFlagCounts>(EMPTY_COUNTS);
  const [editsMap, setEditsMap] = useState<
    Map<string, Map<string, CleaningRowEdit>>
  >(new Map());

  // Toggle "Mostrar filas sin flags" + cache de filas no flagueadas. Default
  // off para no pagar el costo de listarlas si el usuario sólo viene a revisar
  // los flags. Se carga la primera vez que se activa.
  const [showUnflagged, setShowUnflagged] = useState(false);
  const [unflaggedRows, setUnflaggedRows] = useState<CleaningRow[]>([]);
  const [unflaggedLoading, setUnflaggedLoading] = useState(false);
  const [unflaggedLoaded, setUnflaggedLoaded] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros: tipo y decisión van al query; recomendación y color, client-side.
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [filterDecision, setFilterDecision] = useState<FilterDecision>("all");
  const [filterRecommendation, setFilterRecommendation] =
    useState<FilterRecommendation>("all");
  const [filterColor, setFilterColor] = useState<FilterColor>("all");
  // Columna afectada (id del schema) por la que filtrar; null = sin filtro.
  const [filterColumn, setFilterColumn] = useState<string | null>(null);

  // Selección para bulk + flag activo en el panel de detalle.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null);

  // UI per-flag (en el detalle).
  const [showFullRow, setShowFullRow] = useState(false);
  const [showSimilars, setShowSimilars] = useState(false);
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
      setSelected(new Set());
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

  // Carga las filas no flagueadas la primera vez que se activa el toggle.
  // Después permanecen en cache; el reload manual desde `handleResetAll` /
  // `loadAll` también las refresca.
  const loadUnflagged = useCallback(async () => {
    setUnflaggedLoading(true);
    try {
      const rows = await listUnflaggedRows(versionId);
      setUnflaggedRows(rows);
      setUnflaggedLoaded(true);
    } catch (err) {
      window.alert(
        `No se pudieron cargar las filas sin flags: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setUnflaggedLoading(false);
    }
  }, [versionId]);

  useEffect(() => {
    if (showUnflagged && !unflaggedLoaded && !unflaggedLoading) {
      void loadUnflagged();
    }
  }, [showUnflagged, unflaggedLoaded, unflaggedLoading, loadUnflagged]);

  // Construye entradas "virtuales" para filas sin flag. Se marcan implícitamente
  // como `user_decision: "keep"` (auto-keep) y con color "green" en el render.
  const virtualItems = useMemo<ReviewItem[]>(() => {
    if (!showUnflagged || unflaggedRows.length === 0) return [];
    // Excluimos filas que entre tanto recibieron un flag real (caso de doble
    // carga). El set de row_ids con flag real es chico.
    const realFlaggedRowIds = new Set(flags.map((f) => f.row_id));
    return unflaggedRows
      .filter((r) => !realFlaggedRowIds.has(r.id))
      .map((row) => ({
        id: `virtual-${row.id}`,
        version_id: versionId,
        row_id: row.id,
        flag_type: "yellow",
        reason: "",
        matched_rules: [],
        confidence: 1,
        user_decision: "keep",
        decided_at: null,
        created_at: row.created_at,
        recommendation: "keep",
        friendly_explanation: null,
        affected_question_ids: [],
        similar_response_ids: [],
        removed_from_qp_at: null,
        row,
        _virtual: true,
      }));
  }, [showUnflagged, unflaggedRows, flags, versionId]);

  // Flags visibles: filtros client-side + orden por severidad descendente.
  // Los virtuales (color verde, rank 0) caen siempre al fondo. Hay que mirar
  // `_virtual` para no aplicar las funciones de severidad sobre ellos.
  const colorOf = useCallback((item: ReviewItem): RuleColor => {
    return item._virtual ? "green" : flagColor(item);
  }, []);

  const visibleFlags = useMemo(() => {
    let list: ReviewItem[] = [...flags, ...virtualItems];
    if (filterRecommendation !== "all") {
      list = list.filter((f) =>
        f._virtual
          ? filterRecommendation === "keep"
          : effectiveRecommendation(f) === filterRecommendation
      );
    }
    if (filterColor !== "all") {
      list = list.filter((f) => colorOf(f) === filterColor);
    }
    if (filterColumn) {
      list = list.filter((f) =>
        (f.affected_question_ids ?? []).includes(filterColumn)
      );
    }
    return [...list].sort((a, b) => {
      const rank = RULE_COLOR_RANK[colorOf(b)] - RULE_COLOR_RANK[colorOf(a)];
      if (rank !== 0) return rank;
      if (!a._virtual && !b._virtual) {
        const score = flagSeverityScore(b) - flagSeverityScore(a);
        if (score !== 0) return score;
      }
      // Para virtuales (sin score útil), ordenar por row_number ascendente.
      const an = a.row?.row_number ?? 0;
      const bn = b.row?.row_number ?? 0;
      if (an !== bn) return an - bn;
      return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
    });
  }, [flags, virtualItems, filterRecommendation, filterColor, filterColumn, colorOf]);

  // Heatmap: flags por columna afectada (sobre el set ya filtrado por
  // tipo/decisión), con el color de severidad del peor flag de cada columna.
  // Las entradas virtuales NO aportan al heatmap porque no tienen
  // `affected_question_ids` (siempre vacío).
  const columnFlagStats = useMemo(() => {
    const acc = new Map<
      string,
      { columnId: string; count: number; worst: RuleColor }
    >();
    for (const f of flags) {
      const color = flagColor(f);
      for (const colId of f.affected_question_ids ?? []) {
        const cur = acc.get(colId);
        if (!cur) {
          acc.set(colId, { columnId: colId, count: 1, worst: color });
        } else {
          cur.count++;
          if (RULE_COLOR_RANK[color] > RULE_COLOR_RANK[cur.worst]) {
            cur.worst = color;
          }
        }
      }
    }
    return [...acc.values()].sort((a, b) => b.count - a.count);
  }, [flags]);

  const schemaById = useMemo(() => {
    const m = new Map<string, SchemaColumn>();
    if (version) for (const c of version.schema.columns) m.set(c.id, c);
    return m;
  }, [version]);

  const filterColumnLabel = filterColumn
    ? schemaById.get(filterColumn)?.question || filterColumn
    : "";

  // Mantener un flag seleccionado válido.
  useEffect(() => {
    if (visibleFlags.length === 0) {
      if (selectedFlagId !== null) setSelectedFlagId(null);
      return;
    }
    if (!selectedFlagId || !visibleFlags.some((f) => f.id === selectedFlagId)) {
      setSelectedFlagId(visibleFlags[0].id);
    }
  }, [visibleFlags, selectedFlagId]);

  // Resetear UI per-flag al cambiar de flag activo.
  useEffect(() => {
    setShowFullRow(false);
    setShowSimilars(false);
  }, [selectedFlagId]);

  const selectedFlag = useMemo(
    () => visibleFlags.find((f) => f.id === selectedFlagId) ?? null,
    [visibleFlags, selectedFlagId]
  );

  const selectedIndex = useMemo(
    () => visibleFlags.findIndex((f) => f.id === selectedFlagId),
    [visibleFlags, selectedFlagId]
  );

  // Cambia cada vez que hay algo distinto para sincronizar a QP (una decisión
  // 'remove' nueva/revertida, un edit nuevo/sincronizado/revertido). Se lo
  // pasamos al botón de sync para que recargue su estado.
  const syncRefreshKey = useMemo(() => {
    let removeCount = 0;
    for (const f of flags) {
      if (f.user_decision === "remove" && !f.removed_from_qp_at) removeCount++;
    }
    let editCount = 0;
    for (const perRow of editsMap.values()) {
      for (const e of perRow.values()) if (!e.synced_to_qp) editCount++;
    }
    return `${removeCount}:${editCount}`;
  }, [flags, editsMap]);

  // Conteo de flags por color (sobre el set ya filtrado por tipo/decisión).
  // Incluye los virtuales cuando el toggle está activo, así la leyenda de la
  // barra de filtros refleja lo que el usuario está viendo.
  const colorCounts = useMemo(() => {
    const c: Record<RuleColor, number> = { red: 0, orange: 0, yellow: 0, green: 0 };
    for (const f of flags) c[flagColor(f)]++;
    for (const v of virtualItems) c[colorOf(v)]++;
    return c;
  }, [flags, virtualItems, colorOf]);

  // --- decisiones ---------------------------------------------------------

  const handleDecide = useCallback(
    async (flagId: string, decision: "keep" | "remove") => {
      // Caso virtual: la fila no tiene flag en DB. "Keep" ya es el estado
      // implícito (no hace falta tocar nada); "remove" crea un flag manual.
      if (flagId.startsWith("virtual-")) {
        const rowId = flagId.slice("virtual-".length);
        if (decision === "keep") return; // no-op
        setUpdating((s) => new Set(s).add(flagId));
        try {
          await createManualRemoveFlag(versionId, rowId);
          // Sacamos la fila del set de no-flagueadas y forzamos un reload
          // completo para que el flag recién creado entre por listFlags con
          // todos sus campos hidratados (row join'ada, created_at, …).
          setUnflaggedRows((prev) => prev.filter((r) => r.id !== rowId));
          setSelectedFlagId(null);
          await loadFlags();
          setCounts(await getReviewFlagCounts(versionId));
        } catch (err) {
          window.alert(
            `No se pudo marcar para eliminar: ${
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
        return;
      }

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
    [versionId, loadFlags]
  );

  const handleBulkDecide = useCallback(
    async (decision: "keep" | "remove") => {
      if (selected.size === 0) return;
      const allIds = [...selected];
      // Separamos virtuales (sin flag en DB) de los reales. Los virtuales:
      //   - "keep": no-op (ya están auto-keep)
      //   - "remove": crean un flag manual c/u (loop, no hay bulk insert)
      const realIds = allIds.filter((id) => !id.startsWith("virtual-"));
      const virtualRowIds = allIds
        .filter((id) => id.startsWith("virtual-"))
        .map((id) => id.slice("virtual-".length));

      try {
        if (realIds.length > 0) {
          await bulkUpdateFlagDecisions(realIds, decision);
          const at = new Date().toISOString();
          setFlags((prev) =>
            prev.map((f) =>
              realIds.includes(f.id)
                ? { ...f, user_decision: decision, decided_at: at }
                : f
            )
          );
        }
        if (decision === "remove" && virtualRowIds.length > 0) {
          for (const rowId of virtualRowIds) {
            await createManualRemoveFlag(versionId, rowId);
          }
          setUnflaggedRows((prev) =>
            prev.filter((r) => !virtualRowIds.includes(r.id))
          );
          await loadFlags();
        }
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
    [selected, versionId, loadFlags]
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
    async (
      rowId: string,
      columnId: string,
      newValue: string,
      originalValue: unknown
    ) => {
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
          } else {
            perRow = new Map(perRow);
          }
          perRow.set(columnId, edit);
          next.set(rowId, perRow);
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

  const goRelative = (delta: number) => {
    if (visibleFlags.length === 0) return;
    const idx = selectedIndex < 0 ? 0 : selectedIndex;
    const next = Math.max(0, Math.min(visibleFlags.length - 1, idx + delta));
    setSelectedFlagId(visibleFlags[next].id);
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
  const allFlagsCount = counts.red + counts.yellow;

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="size-4" />
          Volver al proyecto
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {version.filename} · v{version.version_number}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleResetAll()}
            className="gap-2"
          >
            <RotateCcw className="size-4" />
            Resetear todo
          </Button>
          <SyncToQpButton
            versionId={versionId}
            refreshKey={syncRefreshKey}
            onSynced={() => {
              void loadAll();
            }}
          />
          <Button onClick={onGoToExport} size="sm" className="gap-2">
            <Download className="size-4" />
            Exportar limpio
          </Button>
        </div>
      </div>

      {/* Stats compactas */}
      <ReviewStats counts={counts} editedRows={editedRowsCount} />

      {/* Toggle "Mostrar filas sin flags" */}
      <UnflaggedToggle
        enabled={showUnflagged}
        loading={unflaggedLoading}
        count={virtualItems.length}
        totalFound={unflaggedRows.length}
        onToggle={() => setShowUnflagged((v) => !v)}
      />

      {/* Heatmap de columnas con flags (idea 7) */}
      <ColumnHeatmap
        stats={columnFlagStats}
        schemaById={schemaById}
        activeColumn={filterColumn}
        onPick={(colId) =>
          setFilterColumn((cur) => (cur === colId ? null : colId))
        }
      />

      {/* Barra de filtros (chips) + leyenda de severidad */}
      <FilterChipsBar
        filterType={filterType}
        filterDecision={filterDecision}
        filterRecommendation={filterRecommendation}
        filterColor={filterColor}
        filterColumn={filterColumn}
        filterColumnLabel={filterColumnLabel}
        colorCounts={colorCounts}
        onSetType={setFilterType}
        onSetDecision={setFilterDecision}
        onSetRecommendation={setFilterRecommendation}
        onSetColor={setFilterColor}
        onClearColumn={() => setFilterColumn(null)}
      />

      {/* Split-pane */}
      <div className="flex min-h-[320px] flex-1 gap-4">
        {/* Lista compacta */}
        <div className="flex w-64 shrink-0 flex-col overflow-hidden rounded-lg border lg:w-72 xl:w-80">
          <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={
                  visibleFlags.length > 0 &&
                  selected.size === visibleFlags.length
                }
                onCheckedChange={toggleSelectAll}
                disabled={visibleFlags.length === 0}
              />
              {selected.size > 0
                ? `${selected.size} sel.`
                : `${visibleFlags.length} flag${visibleFlags.length === 1 ? "" : "s"}`}
            </label>
            {selected.size > 0 && (
              <div className="flex items-center gap-1">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => void handleBulkDecide("keep")}
                  aria-label="Mantener seleccionados"
                  title="Mantener seleccionados"
                >
                  <CheckCircle2 className="size-4 text-emerald-500" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => void handleBulkDecide("remove")}
                  aria-label="Eliminar seleccionados"
                  title="Eliminar seleccionados"
                >
                  <XCircle className="size-4 text-destructive" />
                </Button>
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {visibleFlags.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-3 py-10 text-center text-xs text-muted-foreground">
                {allFlagsCount === 0 ? (
                  <>
                    <CheckCircle2 className="size-8 text-emerald-500" />
                    <p>No se encontraron flags. ¡Los datos parecen limpios!</p>
                  </>
                ) : (
                  <>
                    <Filter className="size-8 opacity-50" />
                    <p>Ningún flag con los filtros aplicados.</p>
                  </>
                )}
              </div>
            ) : (
              visibleFlags.map((flag) => (
                <FlagListItem
                  key={flag.id}
                  flag={flag}
                  schema={version.schema.columns}
                  color={colorOf(flag)}
                  active={flag.id === selectedFlagId}
                  selected={selected.has(flag.id)}
                  edited={flag.row ? editsMap.has(flag.row.id) : false}
                  onSelect={() => setSelectedFlagId(flag.id)}
                  onToggleSelect={() => toggleSelect(flag.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Panel de detalle */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border">
          {selectedFlag ? (
            <FlagDetailPanel
              key={selectedFlag.id}
              versionId={versionId}
              flag={selectedFlag}
              schema={version.schema.columns}
              color={colorOf(selectedFlag)}
              edits={selectedFlag.row ? editsMap.get(selectedFlag.row.id) : undefined}
              updating={updating.has(selectedFlag.id)}
              index={selectedIndex}
              total={visibleFlags.length}
              showFullRow={showFullRow}
              showSimilars={showSimilars}
              onPrev={() => goRelative(-1)}
              onNext={() => goRelative(1)}
              onToggleFullRow={() => setShowFullRow((v) => !v)}
              onToggleSimilars={() => setShowSimilars((v) => !v)}
              onDecide={(d) => void handleDecide(selectedFlag.id, d)}
              onSaveEdit={handleSaveEdit}
              onRevertEdit={handleRevertEdit}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <Info className="size-8 opacity-50" />
              <p>Seleccioná un flag de la lista para revisarlo.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- UnflaggedToggle ------------------------------------------------------

/**
 * Barra horizontal para activar/desactivar la inclusión de filas sin flags en
 * la lista. Cuando se activa la primera vez, dispara la carga lazy de las
 * filas no flagueadas (ver `loadUnflagged`).
 */
function UnflaggedToggle({
  enabled,
  loading,
  count,
  totalFound,
  onToggle,
}: {
  enabled: boolean;
  loading: boolean;
  count: number;
  totalFound: number;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border bg-card/50 px-3 py-2 text-xs">
      <CheckCircle2 className="size-4 text-emerald-500" />
      <span className="flex-1 text-muted-foreground">
        {enabled
          ? loading
            ? "Cargando respuestas sin flags…"
            : `Mostrando ${count} respuesta${count === 1 ? "" : "s"} sin flags (auto-keep)`
          : "Respuestas sin observaciones de la IA: se ocultan por defecto"}
        {enabled && !loading && totalFound !== count && (
          <span className="ml-1 opacity-70">
            (de {totalFound} originales, el resto ya tienen flag)
          </span>
        )}
      </span>
      <Button
        variant={enabled ? "default" : "outline"}
        size="sm"
        onClick={onToggle}
        disabled={loading}
        className="h-7 gap-1.5"
      >
        {loading ? (
          <Loader2 className="size-3 animate-spin" />
        ) : enabled ? (
          <CheckCircle2 className="size-3" />
        ) : (
          <Plus className="size-3" />
        )}
        {enabled ? "Ocultar filas sin flags" : "Mostrar todas las filas"}
      </Button>
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
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
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

// --- FilterChipsBar ------------------------------------------------------

const TYPE_LABEL: Record<Exclude<FilterType, "all">, string> = {
  red: "Rojo",
  yellow: "Amarillo",
};
const DECISION_LABEL: Record<Exclude<FilterDecision, "all">, string> = {
  pending: "Pendiente",
  keep: "Mantener",
  remove: "Eliminar",
};
const RECOMMENDATION_LABEL: Record<
  Exclude<FilterRecommendation, "all">,
  string
> = {
  remove: "Eliminar",
  review: "Revisar",
  keep: "Mantener",
};

interface FilterChipsBarProps {
  filterType: FilterType;
  filterDecision: FilterDecision;
  filterRecommendation: FilterRecommendation;
  filterColor: FilterColor;
  filterColumn: string | null;
  filterColumnLabel: string;
  colorCounts: Record<RuleColor, number>;
  onSetType: (v: FilterType) => void;
  onSetDecision: (v: FilterDecision) => void;
  onSetRecommendation: (v: FilterRecommendation) => void;
  onSetColor: (v: FilterColor) => void;
  onClearColumn: () => void;
}

function FilterChipsBar({
  filterType,
  filterDecision,
  filterRecommendation,
  filterColor,
  filterColumn,
  filterColumnLabel,
  colorCounts,
  onSetType,
  onSetDecision,
  onSetRecommendation,
  onSetColor,
  onClearColumn,
}: FilterChipsBarProps) {
  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];
  if (filterType !== "all") {
    chips.push({
      key: "type",
      label: `Tipo: ${TYPE_LABEL[filterType]}`,
      onRemove: () => onSetType("all"),
    });
  }
  if (filterDecision !== "all") {
    chips.push({
      key: "decision",
      label: `Decisión: ${DECISION_LABEL[filterDecision]}`,
      onRemove: () => onSetDecision("all"),
    });
  }
  if (filterRecommendation !== "all") {
    chips.push({
      key: "recommendation",
      label: `Recomienda: ${RECOMMENDATION_LABEL[filterRecommendation]}`,
      onRemove: () => onSetRecommendation("all"),
    });
  }
  if (filterColor !== "all") {
    chips.push({
      key: "color",
      label: `Severidad: ${RULE_COLOR_LABEL[filterColor]}`,
      onRemove: () => onSetColor("all"),
    });
  }
  if (filterColumn) {
    const short =
      filterColumnLabel.length > 40
        ? `${filterColumnLabel.slice(0, 40)}…`
        : filterColumnLabel;
    chips.push({
      key: "column",
      label: `Pregunta: ${short}`,
      onRemove: onClearColumn,
    });
  }

  const hasAny = chips.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter className="size-4 text-muted-foreground" />

      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pl-2 pr-1 text-xs"
        >
          {c.label}
          <button
            type="button"
            onClick={c.onRemove}
            aria-label={`Quitar filtro ${c.label}`}
            className="rounded-full p-0.5 hover:bg-foreground/10"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}

      {!hasAny && (
        <span className="text-xs text-muted-foreground">Sin filtros</span>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1 text-xs">
            <Plus className="size-3" />
            Filtro
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="text-xs">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Tipo de flag</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={filterType}
                onValueChange={(v) => onSetType(v as FilterType)}
              >
                <DropdownMenuRadioItem value="all">Todos</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="red">Rojo</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="yellow">
                  Amarillo
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Decisión</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={filterDecision}
                onValueChange={(v) => onSetDecision(v as FilterDecision)}
              >
                <DropdownMenuRadioItem value="all">Todas</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="pending">
                  Pendiente
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="keep">
                  Mantener
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="remove">
                  Eliminar
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Recomendación</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={filterRecommendation}
                onValueChange={(v) =>
                  onSetRecommendation(v as FilterRecommendation)
                }
              >
                <DropdownMenuRadioItem value="all">Todas</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="remove">
                  Recomienda eliminar
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="review">
                  Recomienda revisar
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="keep">
                  Recomienda mantener
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Severidad</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={filterColor}
                onValueChange={(v) => onSetColor(v as FilterColor)}
              >
                <DropdownMenuRadioItem value="all">Todas</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="red">
                  Crítico ({colorCounts.red})
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="orange">
                  Alto ({colorCounts.orange})
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="yellow">
                  Medio ({colorCounts.yellow})
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="green">
                  Bajo ({colorCounts.green})
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Leyenda de severidad, clickeable para filtrar por color. */}
      <div className="ml-auto flex items-center gap-2">
        {(["red", "orange", "yellow", "green"] as RuleColor[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onSetColor(filterColor === c ? "all" : c)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
              filterColor === c
                ? RULE_COLOR_PILL[c]
                : "border-transparent text-muted-foreground hover:bg-muted/40"
            )}
            title={`${RULE_COLOR_LABEL[c]} — ${colorCounts[c]}`}
          >
            <span className={cn("size-2 rounded-full", RULE_COLOR_DOT[c])} />
            {colorCounts[c]}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- ColumnHeatmap (idea 7) ----------------------------------------------

interface ColumnHeatmapProps {
  stats: Array<{ columnId: string; count: number; worst: RuleColor }>;
  schemaById: Map<string, SchemaColumn>;
  activeColumn: string | null;
  onPick: (columnId: string) => void;
}

const HEATMAP_MAX = 50;
const BAR_MIN_PX = 6;
const BAR_MAX_PX = 40;

function ColumnHeatmap({
  stats,
  schemaById,
  activeColumn,
  onPick,
}: ColumnHeatmapProps) {
  if (stats.length === 0) return null;
  const shown = stats.slice(0, HEATMAP_MAX);
  const max = shown[0]?.count ?? 1;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <BarChart3 className="size-3.5" />
        Columnas con flags ({stats.length})
        {activeColumn && (
          <button
            type="button"
            onClick={() => onPick(activeColumn)}
            className="ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 normal-case text-[10px] hover:bg-muted/40"
          >
            Limpiar filtro de columna <X className="size-2.5" />
          </button>
        )}
      </div>
      <div className="flex items-end gap-1 overflow-x-auto pb-1">
        {shown.map((s) => {
          const col = schemaById.get(s.columnId);
          const label = col?.question || s.columnId;
          const barPx =
            BAR_MIN_PX +
            Math.round((s.count / max) * (BAR_MAX_PX - BAR_MIN_PX));
          const isActive = activeColumn === s.columnId;
          return (
            <button
              key={s.columnId}
              type="button"
              onClick={() => onPick(s.columnId)}
              title={`${label} — ${s.count} flag${s.count === 1 ? "" : "s"}`}
              className={cn(
                "flex w-7 shrink-0 flex-col items-center gap-0.5 rounded-sm p-0.5 outline-none transition-colors",
                isActive ? "bg-foreground/10 ring-1 ring-foreground/30" : "hover:bg-muted/40"
              )}
            >
              <span className="text-[9px] tabular-nums text-muted-foreground">
                {s.count}
              </span>
              <span
                className={cn("w-full rounded-t-sm", RULE_COLOR_DOT[s.worst])}
                style={{ height: `${barPx}px` }}
              />
            </button>
          );
        })}
        {stats.length > HEATMAP_MAX && (
          <span className="ml-2 self-center text-[10px] text-muted-foreground">
            +{stats.length - HEATMAP_MAX} más
          </span>
        )}
      </div>
    </div>
  );
}

// --- SimilarResponsesList (idea 9) ---------------------------------------

function SimilarResponsesList({
  versionId,
  ids,
  schema,
  affectedColumnIds,
}: {
  versionId: string;
  ids: string[];
  schema: SchemaColumn[];
  affectedColumnIds: string[];
}) {
  const [rows, setRows] = useState<CleaningRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<CleaningRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    getSimilarRows(versionId, ids)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [versionId, ids]);

  // Index por response_id y por id para resolver cada identificador.
  const rowFor = (id: string): CleaningRow | undefined =>
    rows?.find((r) => r.response_id === id || r.id === id);

  const previewColumn = affectedColumnIds[0];

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {error && (
        <p className="text-[11px] text-destructive">
          No se pudieron cargar las respuestas similares: {error}
        </p>
      )}
      {!error && rows === null && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="size-3 animate-spin" />
          Cargando…
        </p>
      )}
      {rows !== null &&
        ids.map((id) => {
          const row = rowFor(id);
          const raw = row && previewColumn ? row.data[previewColumn] : undefined;
          const text =
            raw === null || raw === undefined || String(raw).trim() === ""
              ? null
              : String(raw);
          return (
            <div
              key={id}
              className="flex items-start gap-2 rounded border bg-background/30 px-2 py-1"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span>Fila #{row?.row_number ?? "?"}</span>
                  <span className="font-mono">{id}</span>
                  {!row && <span className="text-amber-400">(no encontrada)</span>}
                </div>
                {text ? (
                  <p className="mt-0.5 line-clamp-3 text-xs">{text}</p>
                ) : (
                  <p className="mt-0.5 text-[11px] italic text-muted-foreground">
                    {previewColumn
                      ? "(sin texto en la columna afectada)"
                      : "(sin columna específica)"}
                  </p>
                )}
              </div>
              {row && (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  onClick={() => setSnapshot(row)}
                  aria-label="Ver respuesta completa"
                  title="Ver respuesta completa"
                >
                  <Maximize2 className="size-3" />
                </Button>
              )}
            </div>
          );
        })}

      <RowSnapshotDialog
        row={snapshot}
        schema={schema}
        highlightColumnIds={affectedColumnIds}
        onClose={() => setSnapshot(null)}
      />
    </div>
  );
}

// --- RowSnapshotDialog ---------------------------------------------------

function RowSnapshotDialog({
  row,
  schema,
  highlightColumnIds,
  onClose,
}: {
  row: CleaningRow | null;
  schema: SchemaColumn[];
  highlightColumnIds: string[];
  onClose: () => void;
}) {
  const highlight = new Set(highlightColumnIds);
  return (
    <Dialog open={row !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Respuesta · Fila #{row?.row_number ?? "?"}
          </DialogTitle>
          {row?.response_id && (
            <DialogDescription className="font-mono text-[11px]">
              {row.response_id}
            </DialogDescription>
          )}
        </DialogHeader>
        {row && (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto text-xs">
            {schema.map((col) => {
              const v = row.data[col.id];
              const text =
                v === null || v === undefined ? "" : String(v);
              return (
                <div
                  key={col.id}
                  className={cn(
                    "rounded border p-2",
                    highlight.has(col.id)
                      ? "border-sky-500/40 bg-sky-500/5"
                      : "border-border/60 bg-muted/20"
                  )}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium">{col.question || col.id}</span>
                    {col.question && col.question !== col.id && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {col.id}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words">
                    {text || (
                      <em className="text-muted-foreground">(vacío)</em>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// --- FlagListItem --------------------------------------------------------

function flagTitle(flag: ReviewItem, schema: SchemaColumn[]): string {
  if (flag._virtual) {
    return `Fila #${flag.row?.row_number ?? "?"} · sin observaciones`;
  }
  const affected = (flag.affected_question_ids ?? [])
    .map((id) => schema.find((c) => c.id === id))
    .find((c): c is SchemaColumn => Boolean(c));
  if (affected?.question) return affected.question;
  const text = flag.friendly_explanation || flag.reason;
  if (text) return text;
  return affected?.id ?? `Fila #${flag.row?.row_number ?? "?"}`;
}

function FlagListItem({
  flag,
  schema,
  color,
  active,
  selected,
  edited,
  onSelect,
  onToggleSelect,
}: {
  flag: ReviewItem;
  schema: SchemaColumn[];
  color: RuleColor;
  active: boolean;
  selected: boolean;
  edited: boolean;
  onSelect: () => void;
  onToggleSelect: () => void;
}) {
  const title = flagTitle(flag, schema);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-start gap-2 border-b border-l-2 border-l-transparent px-3 py-2 text-left outline-none transition-colors last:border-b-0 focus-visible:bg-muted/40",
        active
          ? cn("bg-muted/50", RULE_COLOR_ACCENT[color])
          : "hover:bg-muted/30"
      )}
    >
      <span
        className="mt-0.5 flex items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
      </span>
      <span className={cn("mt-1 size-2 shrink-0 rounded-full", RULE_COLOR_DOT[color])} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium leading-tight">
          {title}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
          <span>Fila #{flag.row?.row_number ?? "?"}</span>
          {flag._virtual && (
            <span className="rounded bg-emerald-500/20 px-1 text-emerald-300">
              OK · auto-keep
            </span>
          )}
          {edited && (
            <span className="inline-flex items-center gap-0.5 rounded bg-sky-500/20 px-1 text-sky-300">
              <Edit3 className="size-2.5" />
              ed.
            </span>
          )}
          {!flag._virtual && flag.user_decision === "keep" && (
            <span className="rounded bg-emerald-500/20 px-1 text-emerald-300">
              mantener
            </span>
          )}
          {!flag._virtual && flag.user_decision === "remove" && (
            <span className="rounded bg-red-500/20 px-1 text-red-300">
              eliminar
            </span>
          )}
        </span>
      </span>
    </div>
  );
}

// --- FlagDetailPanel -----------------------------------------------------

interface FlagDetailPanelProps {
  versionId: string;
  flag: ReviewItem;
  schema: SchemaColumn[];
  color: RuleColor;
  edits: Map<string, CleaningRowEdit> | undefined;
  updating: boolean;
  index: number;
  total: number;
  showFullRow: boolean;
  showSimilars: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggleFullRow: () => void;
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

function FlagDetailPanel({
  versionId,
  flag,
  schema,
  color,
  edits,
  updating,
  index,
  total,
  showFullRow,
  showSimilars,
  onPrev,
  onNext,
  onToggleFullRow,
  onToggleSimilars,
  onDecide,
  onSaveEdit,
  onRevertEdit,
}: FlagDetailPanelProps) {
  const row = flag.row;
  const affectedColumns = (flag.affected_question_ids ?? [])
    .map((id) => schema.find((c) => c.id === id))
    .filter((c): c is SchemaColumn => Boolean(c));
  const mainText = flag.friendly_explanation || flag.reason;

  return (
    <div className="flex h-full flex-col">
      {/* Barra superior: navegación + decisión */}
      <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onPrev}
            disabled={index <= 0}
            aria-label="Flag anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {total > 0 ? `${index + 1} / ${total}` : "—"}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onNext}
            disabled={index >= total - 1}
            aria-label="Flag siguiente"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          {updating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : flag._virtual ? (
            // Virtual: ya está implícitamente en "keep"; sólo ofrecemos override
            // a "remove" (que crea un flag manual en DB y recarga).
            <>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                <CheckCircle2 className="size-3" />
                Auto-keep
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDecide("remove")}
                className="h-7 gap-1.5"
              >
                <XCircle className="size-4" />
                Eliminar igual
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant={flag.user_decision === "keep" ? "default" : "outline"}
                onClick={() => onDecide("keep")}
                className="h-7 gap-1.5"
              >
                <CheckCircle2 className="size-4 text-emerald-500" />
                Mantener
              </Button>
              <Button
                size="sm"
                variant={
                  flag.user_decision === "remove" ? "destructive" : "outline"
                }
                onClick={() => onDecide("remove")}
                className="h-7 gap-1.5"
              >
                <XCircle className="size-4" />
                Eliminar
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Cuerpo scrolleable */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* Badges + meta */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
              RULE_COLOR_PILL[color]
            )}
          >
            <span className={cn("size-2 rounded-full", RULE_COLOR_DOT[color])} />
            {RULE_COLOR_LABEL[color]}
          </span>
          {!flag._virtual && (
            <RecommendationBadge
              recommendation={flag.recommendation}
              flagType={flag.flag_type}
            />
          )}
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
          {!flag._virtual && flag.user_decision && (
            <Badge
              variant={flag.user_decision === "keep" ? "default" : "destructive"}
              className="ml-auto"
            >
              {flag.user_decision === "keep" ? "Mantener" : "Eliminar"}
            </Badge>
          )}
        </div>

        {/* Texto principal */}
        {flag._virtual ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            La IA no encontró problemas en esta respuesta y la dejó marcada
            como mantener automáticamente. Si igual querés excluirla, usá
            <span className="mx-1 font-medium">"Eliminar igual"</span>
            arriba.
          </p>
        ) : (
          mainText && <p className="text-sm leading-relaxed">{mainText}</p>
        )}

        {/* Preguntas afectadas con edición inline */}
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

        {/* Respuestas similares (idea 9: snippet real + ver fila completa) */}
        {flag.similar_response_ids && flag.similar_response_ids.length > 0 && (
          <div className="rounded-md border bg-muted/10 px-3 py-2 text-xs">
            <button
              type="button"
              onClick={onToggleSimilars}
              className="flex w-full items-center gap-2 text-left font-medium"
            >
              {showSimilars ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
              <Info className="size-3.5 text-sky-400" />
              {flag.similar_response_ids.length} respuesta
              {flag.similar_response_ids.length === 1 ? "" : "s"} con texto similar
            </button>
            {showSimilars && (
              <SimilarResponsesList
                versionId={versionId}
                ids={flag.similar_response_ids}
                schema={schema}
                affectedColumnIds={affectedColumns.map((c) => c.id)}
              />
            )}
          </div>
        )}

        {/* Ver respuesta completa */}
        {row && (
          <div className="border-t pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleFullRow}
              className="h-7 gap-1 text-xs"
            >
              {showFullRow ? (
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
            {showFullRow && (
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
  const displayed =
    displayedRaw === null || displayedRaw === undefined
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
        <span className="whitespace-pre-wrap">
          {displayed || <em className="text-muted-foreground">(vacío)</em>}
        </span>
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

// --- SyncToQpButton (5.C: sincronizar review → QuestionPro) --------------

type SyncDialogPhase = "confirm" | "running" | "done" | "error";

function SyncToQpButton({
  versionId,
  refreshKey,
  onSynced,
}: {
  versionId: string;
  /** Cambia desde el padre cuando hay algo distinto para sincronizar. */
  refreshKey?: string | number;
  onSynced: () => void;
}) {
  const [status, setStatus] = useState<ReviewSyncStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<SyncDialogPhase>("confirm");
  const [progress, setProgress] = useState<SyncToQPProgress | null>(null);
  const [result, setResult] = useState<SyncToQPResult | null>(null);
  const [errMessage, setErrMessage] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await getReviewSyncStatus(versionId));
    } catch {
      setStatus(null);
    }
  }, [versionId]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus, refreshKey]);

  if (!status || !status.isQuestionPro) return null;

  const pending = hasPendingSync(status);
  const totalPending = status.pendingRemovals + status.pendingEdits;

  const openConfirm = () => {
    setPhase("confirm");
    setProgress(null);
    setResult(null);
    setErrMessage(null);
    setOpen(true);
  };

  const runSync = async () => {
    setPhase("running");
    setProgress({ phase: "deleting", processed: 0, total: status.pendingRemovals });
    try {
      const res = await syncReviewToQP(versionId, (e) => setProgress(e));
      setResult(res);
      setPhase("done");
      await refreshStatus();
      onSynced();
    } catch (err) {
      setErrMessage(err instanceof Error ? err.message : String(err));
      setPhase("error");
      await refreshStatus();
    }
  };

  const closeDialog = () => {
    if (phase === "running") return;
    setOpen(false);
  };

  const failedCount =
    (result?.removed.failed.length ?? 0) + (result?.edited.failed.length ?? 0);
  const okCount = (result?.removed.ok ?? 0) + (result?.edited.ok ?? 0);

  const progressValue =
    progress && progress.total > 0
      ? Math.round((progress.processed / progress.total) * 100)
      : 0;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={openConfirm}
        disabled={!pending}
        title={pending ? undefined : "No hay cambios pendientes de sincronizar"}
        className="gap-2"
      >
        <CloudUpload className="size-4" />
        Sincronizar con QuestionPro
        {pending && (
          <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary">
            {totalPending}
          </span>
        )}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) closeDialog();
        }}
      >
        <DialogContent
          showCloseButton={phase !== "running"}
          onInteractOutside={(e) => {
            if (phase === "running") e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (phase === "running") e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CloudUpload className="size-4" />
              Sincronizar con QuestionPro
            </DialogTitle>
            {phase === "confirm" && (
              <DialogDescription>
                Vas a aplicar tus cambios directamente sobre la encuesta en
                QuestionPro. Esta acción no se puede deshacer.
              </DialogDescription>
            )}
          </DialogHeader>

          {phase === "confirm" && (
            <div className="flex flex-col gap-3 text-sm">
              <ul className="flex flex-col gap-2">
                <li className="flex items-start gap-2">
                  <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <span>
                    Eliminar <strong>{status.pendingRemovals}</strong>{" "}
                    respuesta{status.pendingRemovals === 1 ? "" : "s"} marcada
                    {status.pendingRemovals === 1 ? "" : "s"} para remover.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Edit3 className="mt-0.5 size-4 shrink-0 text-sky-400" />
                  <span>
                    Re-crear <strong>{status.pendingEdits}</strong> respuesta
                    {status.pendingEdits === 1 ? "" : "s"} con tus ediciones —
                    esto cambia su <code>responseID</code> en QuestionPro; el
                    resto de la metadata se preserva.
                  </span>
                </li>
              </ul>
              <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-300">
                Las respuestas editadas se re-crean en dos pasos (se borra la
                original y se vuelve a postear). Si la conexión falla en el
                medio, podrías perder esas respuestas en QuestionPro — siempre
                quedan en el XLSX limpio con tus ediciones.
              </p>
            </div>
          )}

          {phase === "running" && (
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {progress?.phase === "editing"
                  ? "Re-creando respuestas editadas…"
                  : "Eliminando respuestas marcadas…"}
              </div>
              <Progress value={progressValue} />
              <p className="text-xs text-muted-foreground">
                {progress
                  ? `${progress.processed} / ${progress.total}`
                  : "Preparando…"}
              </p>
            </div>
          )}

          {phase === "done" && result && (
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-emerald-500" />
                <span>
                  {okCount} operación{okCount === 1 ? "" : "es"} aplicada
                  {okCount === 1 ? "" : "s"} en QuestionPro
                  {failedCount > 0 ? ` · ${failedCount} con error` : "."}
                </span>
              </div>
              <ul className="text-xs text-muted-foreground">
                <li>
                  Eliminadas: {result.removed.ok}
                  {result.removed.failed.length > 0 &&
                    ` (${result.removed.failed.length} con error)`}
                </li>
                <li>
                  Re-creadas: {result.edited.ok}
                  {result.edited.failed.length > 0 &&
                    ` (${result.edited.failed.length} con error)`}
                </li>
              </ul>

              {(failedCount > 0 || result.warnings.length > 0) && (
                <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/20 p-2 text-xs">
                  {result.removed.failed.map((f) => (
                    <p key={`r-${f.rowId}`} className="text-destructive">
                      Eliminar fila {f.rowId}: {f.reason}
                    </p>
                  ))}
                  {result.edited.failed.map((f) => (
                    <p key={`e-${f.rowId}`} className="text-destructive">
                      Re-crear fila {f.rowId}: {f.reason}
                    </p>
                  ))}
                  {result.warnings.map((w) => (
                    <p key={`w-${w.rowId}`} className="text-amber-400">
                      Fila {w.rowId}: {w.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {phase === "error" && (
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="size-4" />
                No se pudo sincronizar
              </div>
              <pre className="whitespace-pre-wrap rounded-md border bg-muted/20 p-2 font-mono text-xs text-muted-foreground">
                {errMessage}
              </pre>
            </div>
          )}

          <DialogFooter>
            {phase === "confirm" && (
              <>
                <Button variant="outline" size="sm" onClick={closeDialog}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={() => void runSync()} className="gap-2">
                  <CloudUpload className="size-4" />
                  Sincronizar ({totalPending})
                </Button>
              </>
            )}
            {phase === "running" && (
              <Button size="sm" disabled className="gap-2">
                <Loader2 className="size-4 animate-spin" />
                Sincronizando…
              </Button>
            )}
            {(phase === "done" || phase === "error") && (
              <Button size="sm" onClick={() => setOpen(false)}>
                Cerrar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

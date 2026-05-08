// Pantalla de Export (paso 5.D).
//
// Genera un Excel con las filas que sobreviven a la limpieza:
//   - Excluye filas con `user_decision = 'remove'`.
//   - Aplica los edits de `cleaning_row_edits` sobre `row.data`.
//
// Usa el helper `getCleanedRows` (en `row-edits-repository.ts`) que ya hace
// la mezcla. El XLSX se arma con `xlsx-js-style` (mismo paquete que el parser
// del paso 2.B) y se ofrece como descarga al usuario.
//
// Formato del archivo:
//   - Hoja "Datos limpios" en formato Qualtrics (fila 1 = IDs, fila 2 = textos
//     de pregunta, fila 3+ = datos). Es el mismo shape que se subió, así el
//     archivo limpio puede re-procesarse si hace falta.
//   - Hoja "Información" con metadata (proyecto, versión, totales, fecha).

import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx-js-style";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getCleaningSupabaseClient } from "@/lib/cleaning/supabase-client";
import { getVersion } from "@/lib/cleaning/cleaning-repository";
import {
  countEditedRows,
  getCleanedRows,
} from "@/lib/cleaning/row-edits-repository";
import { getReviewFlagCounts } from "@/lib/cleaning/flags-repository";
import { getProject } from "@/lib/cleaning/projects-repository";
import type {
  CleaningProject,
  CleaningRow,
  CleaningVersion,
  ReviewFlagCounts,
} from "@/lib/cleaning/types";

const EMPTY_COUNTS: ReviewFlagCounts = {
  red: 0,
  yellow: 0,
  pending: 0,
  decided: 0,
  toRemove: 0,
  toKeep: 0,
};

export interface ExportProps {
  projectId: string;
  versionId: string;
  onBack: () => void;
}

export function Export({ projectId, versionId, onBack }: ExportProps) {
  const [project, setProject] = useState<CleaningProject | null>(null);
  const [version, setVersion] = useState<CleaningVersion | null>(null);
  const [counts, setCounts] = useState<ReviewFlagCounts>(EMPTY_COUNTS);
  const [cleanedRows, setCleanedRows] = useState<CleaningRow[]>([]);
  const [editedCount, setEditedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = await getCleaningSupabaseClient();
      const [p, v, c, rows, edited] = await Promise.all([
        getProject(projectId),
        getVersion(client, versionId),
        getReviewFlagCounts(versionId),
        getCleanedRows(versionId),
        countEditedRows(versionId),
      ]);
      setProject(p);
      setVersion(v);
      setCounts(c);
      setCleanedRows(rows);
      setEditedCount(edited);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, versionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleExport = useCallback(async () => {
    if (!version || !project || cleanedRows.length === 0) return;
    setExporting(true);
    try {
      // Hoja "Datos limpios": fila 1 = IDs, fila 2 = textos, fila 3+ = datos.
      const columnIds = version.schema.columns.map((c) => c.id);
      const questionTexts = version.schema.columns.map((c) => c.question);
      const dataRows = cleanedRows.map((row) =>
        version.schema.columns.map((col) => row.data[col.id] ?? "")
      );

      const sheet = XLSX.utils.aoa_to_sheet([
        columnIds,
        questionTexts,
        ...dataRows,
      ]);

      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "Datos limpios");

      // Hoja "Información"
      const removed = version.total_rows - cleanedRows.length;
      const infoSheet = XLSX.utils.json_to_sheet([
        {
          Proyecto: project.name,
          Origen: project.source === "questionpro" ? "QuestionPro" : "Qualtrics",
          "Archivo original": version.filename,
          "Versión": version.version_number,
          "Filas originales": version.total_rows,
          "Filas exportadas": cleanedRows.length,
          "Filas eliminadas": removed,
          "Filas editadas": editedCount,
          "Fecha exportación": new Date().toISOString(),
        },
      ]);
      XLSX.utils.book_append_sheet(book, infoSheet, "Información");

      const stamp = new Date().toISOString().slice(0, 10);
      const safeName =
        (project.name || "export").replace(/[^a-zA-Z0-9]+/g, "_") || "export";
      const filename = `${safeName}_limpio_v${version.version_number}_${stamp}.xlsx`;

      XLSX.writeFile(book, filename);
    } catch (err) {
      window.alert(
        `No se pudo exportar: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setExporting(false);
    }
  }, [version, project, cleanedRows, editedCount]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Cargando export…
      </div>
    );
  }

  if (error || !version || !project) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="size-4" />
            <span className="font-medium">No se pudo cargar el export</span>
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

  const removedCount = version.total_rows - cleanedRows.length;
  const hasPending = counts.pending > 0;
  const noFlagsCount =
    version.total_rows - counts.red - counts.yellow;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="size-4" />
          Volver al review
        </Button>
      </div>

      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Download className="size-5" />
          Exportar datos limpios
        </h2>
        <p className="text-sm text-muted-foreground">
          {version.filename} · v{version.version_number}
        </p>
      </div>

      {hasPending && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-400" />
            <div className="flex flex-col gap-1">
              <p className="font-medium text-amber-300">
                Decisiones pendientes
              </p>
              <p className="text-sm text-muted-foreground">
                Tenés {counts.pending} flags sin decisión. Las filas con flags
                pendientes <strong>se incluirán</strong> en la exportación tal
                cual están.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="size-4" />
            Resumen de exportación
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryCard
              label="Filas originales"
              value={version.total_rows}
              tone="neutral"
            />
            <SummaryCard
              label="A eliminar"
              value={`-${removedCount}`}
              tone="red"
            />
            <SummaryCard
              label="En la exportación"
              value={cleanedRows.length}
              tone="emerald"
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Desglose
            </p>
            <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <BreakdownRow
                icon={
                  <CheckCircle2 className="size-4 text-emerald-500" />
                }
                label="Sin flags"
                value={noFlagsCount}
              />
              <BreakdownRow
                icon={<CheckCircle2 className="size-4 text-emerald-500" />}
                label="Marcados para mantener"
                value={counts.toKeep}
              />
              <BreakdownRow
                icon={<XCircle className="size-4 text-destructive" />}
                label="Marcados para eliminar"
                value={counts.toRemove}
              />
              <BreakdownRow
                icon={<Info className="size-4 text-amber-500" />}
                label="Sin decisión (incluidos)"
                value={counts.pending}
              />
              <BreakdownRow
                icon={<FileSpreadsheet className="size-4 text-sky-400" />}
                label="Filas editadas (mergeadas)"
                value={editedCount}
              />
            </ul>
          </div>

          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
            <p className="mb-1 font-medium">📋 El archivo exportado incluye:</p>
            <ul className="ml-4 list-disc space-y-0.5 text-muted-foreground">
              <li>
                Hoja <strong>Datos limpios</strong> con las {cleanedRows.length}{" "}
                filas (IDs en fila 1, preguntas en fila 2, datos desde fila 3).
              </li>
              <li>
                Hoja <strong>Información</strong> con metadata del export
                (proyecto, versión, totales, fecha).
              </li>
              <li>
                Las {editedCount} filas con ediciones inline ya tienen los
                cambios aplicados.
              </li>
            </ul>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => void handleExport()}
              disabled={exporting || cleanedRows.length === 0}
              size="lg"
              className="gap-2"
            >
              {exporting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Generando archivo…
                </>
              ) : (
                <>
                  <Download className="size-4" />
                  Descargar Excel ({cleanedRows.length} filas)
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Subcomponentes -------------------------------------------------------

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "neutral" | "red" | "emerald";
}) {
  const cls =
    tone === "red"
      ? "border-red-500/40 bg-red-500/5 text-red-300"
      : tone === "emerald"
        ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-300"
        : "bg-muted/30";
  return (
    <div className={cn("flex flex-col items-center gap-1 rounded-md border p-4 text-center", cls)}>
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-xs uppercase tracking-wide opacity-80">
        {label}
      </span>
    </div>
  );
}

function BreakdownRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <li className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      <span className="font-mono text-sm">{value}</span>
    </li>
  );
}

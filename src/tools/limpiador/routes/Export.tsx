// Pantalla de Export (paso 5.D).
//
// Genera un Excel con las filas que sobreviven a la limpieza:
//   - Excluye filas con `user_decision = 'remove'`.
//   - Aplica los edits de `cleaning_row_edits` sobre `row.data`.
//
// Usa el helper `getCleanedRows` (en `row-edits-repository.ts`) que ya hace
// la mezcla. El XLSX se arma con `xlsx-js-style` (mismo paquete que el parser
// del paso 2.B) y se guarda al disco vía `dialog.save()` + `fs.writeFile()`
// del runtime Tauri (el usuario elige dónde guardarlo).
//
// Formato del archivo (estilo "exporte de QuestionPro"):
//   - Hoja "Datos limpios": fila 1 = textos de pregunta (header en negrita,
//     fondo gris claro, freeze pane), fila 2+ = datos. Anchos de columna
//     calculados a partir del contenido.
//   - Hoja "Información" con metadata (proyecto, versión, totales, fecha).

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  CloudUpload,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
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
import {
  getReviewSyncStatus,
  hasPendingSync,
  type ReviewSyncStatus,
} from "@/lib/cleaning/sync-to-questionpro";
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
  /** Volver al review (para el banner de cambios sin sincronizar a QP). */
  onGoToReview?: () => void;
}

export function Export({ projectId, versionId, onBack, onGoToReview }: ExportProps) {
  const [project, setProject] = useState<CleaningProject | null>(null);
  const [version, setVersion] = useState<CleaningVersion | null>(null);
  const [counts, setCounts] = useState<ReviewFlagCounts>(EMPTY_COUNTS);
  const [cleanedRows, setCleanedRows] = useState<CleaningRow[]>([]);
  const [editedCount, setEditedCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<ReviewSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Path donde se guardó el último export exitoso (para mostrar success state). */
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = await getCleaningSupabaseClient();
      const [p, v, c, rows, edited, sync] = await Promise.all([
        getProject(projectId),
        getVersion(client, versionId),
        getReviewFlagCounts(versionId),
        getCleanedRows(versionId),
        countEditedRows(versionId),
        getReviewSyncStatus(versionId).catch(() => null),
      ]);
      setProject(p);
      setVersion(v);
      setCounts(c);
      setCleanedRows(rows);
      setEditedCount(edited);
      setSyncStatus(sync);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, versionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const defaultFilename = useMemo(() => {
    if (!project || !version) return "export.xlsx";
    const stamp = new Date()
      .toISOString()
      .slice(0, 16)
      .replace(/[-:T]/g, "")
      .replace(/(\d{8})(\d{4})/, "$1_$2");
    const safeName =
      (project.name || "export").replace(/[^a-zA-Z0-9]+/g, "_") || "export";
    return `${safeName}_limpio_v${version.version_number}_${stamp}.xlsx`;
  }, [project, version]);

  const handleExport = useCallback(async () => {
    if (!version || !project || cleanedRows.length === 0) return;
    setError(null);

    // 1. Pedirle al usuario dónde guardar (antes de hacer trabajo pesado, así
    //    si cancela no perdemos tiempo armando el book).
    let targetPath: string | null = null;
    try {
      targetPath = await save({
        title: "Guardar Excel limpio",
        defaultPath: defaultFilename,
        filters: [{ name: "Excel", extensions: ["xlsx"] }],
      });
    } catch (err) {
      setError(
        `No se pudo abrir el diálogo de guardado: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return;
    }
    if (!targetPath) return; // usuario canceló

    setExporting(true);
    try {
      const book = buildXlsxBook({
        project,
        version,
        rows: cleanedRows,
        editedCount,
      });

      // XLSX.write con type:"array" devuelve un Uint8Array que podemos pasar
      // directo a fs.writeFile (Tauri 2). Evitamos XLSX.writeFile porque ese
      // dispara una descarga del navegador, no escribe al path elegido.
      const bytes = XLSX.write(book, {
        bookType: "xlsx",
        type: "array",
      }) as Uint8Array;

      await writeFile(targetPath, bytes);
      setSavedPath(targetPath);
    } catch (err) {
      setError(
        `No se pudo guardar el Excel: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setExporting(false);
    }
  }, [project, version, cleanedRows, editedCount, defaultFilename]);

  const handleOpenFile = useCallback(() => {
    if (!savedPath) return;
    openPath(savedPath).catch((e) =>
      console.error("openPath failed", e)
    );
  }, [savedPath]);

  const handleRevealFile = useCallback(() => {
    if (!savedPath) return;
    revealItemInDir(savedPath).catch((e) =>
      console.error("revealItemInDir failed", e)
    );
  }, [savedPath]);

  const handleExportAgain = useCallback(() => {
    setSavedPath(null);
  }, []);

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
  const unsyncedToQp =
    syncStatus && hasPendingSync(syncStatus)
      ? syncStatus.pendingRemovals + syncStatus.pendingEdits
      : 0;

  // Una vez exportado, mostramos un success state minimalista y dejamos al
  // usuario abrir el archivo / la carpeta o volver a exportar.
  if (savedPath) {
    return (
      <ExportSuccess
        path={savedPath}
        rowCount={cleanedRows.length}
        onOpenFile={handleOpenFile}
        onRevealFile={handleRevealFile}
        onExportAgain={handleExportAgain}
        onBack={onBack}
      />
    );
  }

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

      {unsyncedToQp > 0 && (
        <Card className="border-sky-500/40 bg-sky-500/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <CloudUpload className="mt-0.5 size-5 shrink-0 text-sky-400" />
            <div className="flex flex-col gap-1">
              <p className="font-medium text-sky-300">
                Cambios sin sincronizar a QuestionPro
              </p>
              <p className="text-sm text-muted-foreground">
                Tenés {unsyncedToQp} cambio{unsyncedToQp === 1 ? "" : "s"} que
                por ahora sólo se aplican al XLSX. Para impactarlos también en
                QuestionPro, sincronizá desde la pantalla de Revisión.
              </p>
              {onGoToReview && (
                <div>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={onGoToReview}
                    className="h-auto p-0 text-sky-300"
                  >
                    Ir a Revisión
                  </Button>
                </div>
              )}
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

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

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
                  Guardando archivo…
                </>
              ) : (
                <>
                  <Download className="size-4" />
                  Guardar Excel ({cleanedRows.length} filas)
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

// --- Success state -------------------------------------------------------

/**
 * Pantalla mostrada después de un export exitoso. Permite abrir el archivo,
 * la carpeta contenedora, o volver a exportar (caso típico: el usuario quiere
 * guardarlo en otro lado también).
 */
function ExportSuccess({
  path,
  rowCount,
  onOpenFile,
  onRevealFile,
  onExportAgain,
  onBack,
}: {
  path: string;
  rowCount: number;
  onOpenFile: () => void;
  onRevealFile: () => void;
  onExportAgain: () => void;
  onBack: () => void;
}) {
  // Truncado para mostrar; el path completo va en `title` para tooltip.
  const display = path.length > 80 ? `…${path.slice(-79)}` : path;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="size-4" />
          Volver al review
        </Button>
      </div>

      <Card className="border-emerald-500/40 bg-emerald-500/5">
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <p className="text-lg font-semibold text-emerald-100">
                Excel guardado
              </p>
              <p className="text-sm text-muted-foreground">
                {rowCount} fila{rowCount === 1 ? "" : "s"} exportada
                {rowCount === 1 ? "" : "s"} correctamente.
              </p>
            </div>
          </div>

          <div
            className="rounded-md border bg-background/60 px-3 py-2 font-mono text-xs text-muted-foreground"
            title={path}
          >
            {display}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={onOpenFile} size="sm" className="gap-2">
              <ExternalLink className="size-4" />
              Abrir archivo
            </Button>
            <Button
              variant="secondary"
              onClick={onRevealFile}
              size="sm"
              className="gap-2"
            >
              <FolderOpen className="size-4" />
              Mostrar en el Explorador
            </Button>
            <Button
              variant="outline"
              onClick={onExportAgain}
              size="sm"
              className="gap-2"
            >
              <Download className="size-4" />
              Guardar de nuevo
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Builder del XLSX -----------------------------------------------------

/**
 * Construye el `WorkBook` con dos hojas:
 *   - "Datos limpios": 1 header (texto de la pregunta, en negrita) + filas
 *     de datos. Es el formato de exporte nativo de QuestionPro, no el formato
 *     Qualtrics de 2 filas que se usaba antes — más amigable para el usuario.
 *   - "Información": metadata del export (proyecto, versión, totales, fecha).
 *
 * Estilos via `xlsx-js-style`: negrita + fondo gris claro en el header, bordes
 * suaves, freeze pane en la fila 1, anchos de columna ajustados al contenido.
 */
function buildXlsxBook(input: {
  project: CleaningProject;
  version: CleaningVersion;
  rows: CleaningRow[];
  editedCount: number;
}): XLSX.WorkBook {
  const { project, version, rows, editedCount } = input;
  const columns = version.schema.columns;

  // --- Hoja "Datos limpios" ----------------------------------------------
  const headerRow = columns.map((c) => c.question || c.id);
  const dataRows = rows.map((row) =>
    columns.map((col) => normalizeCell(row.data[col.id]))
  );
  const sheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);

  // Estilo del header (negrita + fondo gris).
  const headerStyle = {
    font: { bold: true, color: { rgb: "1F2937" } },
    fill: { patternType: "solid", fgColor: { rgb: "F3F4F6" } },
    alignment: { vertical: "center", horizontal: "left", wrapText: true },
    border: {
      bottom: { style: "thin", color: { rgb: "D1D5DB" } },
    },
  } as const;

  for (let c = 0; c < headerRow.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (!sheet[addr]) sheet[addr] = { t: "s", v: headerRow[c] };
    sheet[addr].s = headerStyle;
  }

  // Freeze pane en la fila 1 (header siempre visible al scrollear).
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 } as never;
  sheet["!views"] = [{ state: "frozen", ySplit: 1 }];

  // Anchos de columna: tamaño máximo en chars entre el header y las primeras
  // 100 filas, con un piso de 10 y un techo de 60 para no romper la vista.
  sheet["!cols"] = columns.map((_, idx) => {
    const headerLen = String(headerRow[idx] ?? "").length;
    let maxLen = headerLen;
    const probe = Math.min(rows.length, 100);
    for (let i = 0; i < probe; i++) {
      const v = dataRows[i]?.[idx];
      const len = v === null || v === undefined ? 0 : String(v).length;
      if (len > maxLen) maxLen = len;
    }
    return { wch: Math.min(60, Math.max(10, maxLen + 2)) };
  });

  // Alto del header un poco más alto para que respire.
  sheet["!rows"] = [{ hpt: 22 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Datos limpios");

  // --- Hoja "Información" ------------------------------------------------
  const removed = version.total_rows - rows.length;
  const infoData: Array<[string, string | number]> = [
    ["Proyecto", project.name],
    ["Origen", project.source === "questionpro" ? "QuestionPro" : "Qualtrics"],
    ["Archivo original", version.filename],
    ["Versión", version.version_number],
    ["Filas originales", version.total_rows],
    ["Filas exportadas", rows.length],
    ["Filas eliminadas", removed],
    ["Filas editadas", editedCount],
    ["Fecha exportación", new Date().toLocaleString("es-AR")],
  ];
  const infoSheet = XLSX.utils.aoa_to_sheet([
    ["Campo", "Valor"],
    ...infoData,
  ]);

  // Bold en la primera columna y en el header de la hoja info.
  const infoBold = { font: { bold: true } } as const;
  for (let r = 0; r < infoData.length + 1; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: 0 });
    if (sheet[addr] || infoSheet[addr]) {
      infoSheet[addr] = infoSheet[addr] ?? { t: "s", v: "" };
      infoSheet[addr].s = infoBold;
    }
  }
  infoSheet["!cols"] = [{ wch: 24 }, { wch: 50 }];

  XLSX.utils.book_append_sheet(book, infoSheet, "Información");

  return book;
}

/**
 * Normaliza una celda para escribirla al XLSX. Convierte null/undefined a "",
 * y deja números/strings como están (xlsx detecta el tipo automáticamente).
 */
function normalizeCell(v: unknown): string | number {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  return String(v);
}

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCategoriesOrderedByCount } from "@/lib/codificacion/classifications-repository";
import { exportJobResults } from "@/lib/codificacion/export";
import { getJob } from "@/lib/codificacion/jobs-repository";
import { getDisplayCategoryId } from "@/lib/codificacion/category-display";
import type { CategoryStats } from "@/lib/codificacion/types";

export interface AnalysisSummaryProps {
  jobId: string;
  onBack: () => void;
  onOpenCategory: (categoryId: number) => void;
}

export function AnalysisSummary({
  jobId,
  onBack,
  onOpenCategory,
}: AnalysisSummaryProps) {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [question, setQuestion] = useState("");
  const [stats, setStats] = useState<CategoryStats[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const job = await getJob(jobId);
      if (!job) throw new Error("Encuesta no encontrada");
      setQuestion(job.question);
      setStats(await getCategoriesOrderedByCount(jobId));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
      onBack();
    } finally {
      setLoading(false);
    }
  }, [jobId, onBack]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  const total = stats.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-2" onClick={onBack}>
        <ArrowLeft className="size-4" />
        Volver
      </Button>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Análisis</CardTitle>
            <p className="text-sm text-muted-foreground">{question}</p>
          </div>
          <Button
            variant="outline"
            className="gap-2"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                await exportJobResults(jobId);
              } catch (err) {
                window.alert(err instanceof Error ? err.message : String(err));
              } finally {
                setExporting(false);
              }
            }}
          >
            <Download className="size-4" />
            {exporting ? "Exportando…" : "Exportar Excel"}
          </Button>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            {total} clasificaciones con categorías asignadas
          </p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Categoría</th>
                  <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                  <th className="px-3 py-2 text-right font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((row) => (
                  <tr
                    key={row.categoryId}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                    onClick={() => onOpenCategory(row.categoryId)}
                  >
                    <td className="px-3 py-2">
                      {getDisplayCategoryId(row.categoryId)}
                    </td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2 text-right">{row.count}</td>
                    <td className="px-3 py-2 text-right">{row.percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

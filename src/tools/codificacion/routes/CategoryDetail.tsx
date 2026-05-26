import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  countResponsesForCategory,
  getResponsesForCategoryPaginated,
  updateClassificationCategories,
} from "@/lib/codificacion/classifications-repository";
import { getCategoriesByJob } from "@/lib/codificacion/categories-repository";
import { getDisplayCategoryId } from "@/lib/codificacion/category-display";
import type { Category, CategoryResponsesSort } from "@/lib/codificacion/types";

const PAGE_SIZE = 20;

interface RowState {
  classification_id: string;
  response_text: string;
  category_ids: number[];
  dirty: boolean;
}

export interface CategoryDetailProps {
  jobId: string;
  categoryId: number;
  onBack: () => void;
}

export function CategoryDetail({ jobId, categoryId, onBack }: CategoryDetailProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryName, setCategoryName] = useState("");
  const [rows, setRows] = useState<RowState[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CategoryResponsesSort>("row");

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const cats = await getCategoriesByJob(jobId);
      setCategories(cats);
      const special =
        categoryId === 998
          ? "No responde"
          : categoryId === 999
            ? "Otro"
            : cats.find((c) => c.category_id === categoryId)?.name;
      setCategoryName(special ?? `Categoría ${categoryId}`);

      const [count, data] = await Promise.all([
        countResponsesForCategory(jobId, categoryId, search),
        getResponsesForCategoryPaginated(
          jobId,
          categoryId,
          page,
          PAGE_SIZE,
          { sort, searchText: search }
        ),
      ]);
      setTotal(count);
      setRows(
        data.map((r) => ({
          classification_id: r.classification_id,
          response_text: r.response_text,
          category_ids: [...r.category_ids],
          dirty: false,
        }))
      );
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [jobId, categoryId, page, search, sort]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const allCategories = [
    ...categories,
    { category_id: 998, name: "No responde", id: "998", job_id: jobId, created_at: "" },
    { category_id: 999, name: "Otro", id: "999", job_id: jobId, created_at: "" },
  ];

  const toggleRowCategory = (rowIndex: number, catId: number) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== rowIndex) return row;
        const has = row.category_ids.includes(catId);
        const next = has
          ? row.category_ids.filter((id) => id !== catId)
          : [...row.category_ids, catId];
        return {
          ...row,
          category_ids: next.length ? next : [catId],
          dirty: true,
        };
      })
    );
  };

  const saveDirty = async () => {
    const dirtyRows = rows.filter((r) => r.dirty);
    if (dirtyRows.length === 0) return;
    setSaving(true);
    try {
      for (const row of dirtyRows) {
        await updateClassificationCategories(
          row.classification_id,
          row.category_ids
        );
      }
      await loadPage();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="gap-2" onClick={onBack}>
        <ArrowLeft className="size-4" />
        Volver al análisis
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>
            {getDisplayCategoryId(categoryId)} — {categoryName}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{total} respuestas</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Buscar texto…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="max-w-xs"
            />
            <Select
              value={sort}
              onValueChange={(v) => {
                setSort(v as CategoryResponsesSort);
                setPage(0);
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="row">Por fila</SelectItem>
                <SelectItem value="alpha_asc">A → Z</SelectItem>
                <SelectItem value="alpha_desc">Z → A</SelectItem>
                <SelectItem value="length_asc">Más cortas</SelectItem>
                <SelectItem value="length_desc">Más largas</SelectItem>
              </SelectContent>
            </Select>
            <Button
              className="gap-2"
              disabled={saving || !rows.some((r) => r.dirty)}
              onClick={() => void saveDirty()}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Guardar cambios
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {rows.map((row, index) => (
                <div key={row.classification_id} className="rounded border p-3">
                  <p className="mb-2 text-sm">{row.response_text}</p>
                  <div className="flex flex-wrap gap-2">
                    {allCategories.map((cat) => (
                      <label
                        key={cat.category_id}
                        className="flex items-center gap-1 text-xs"
                      >
                        <Checkbox
                          checked={row.category_ids.includes(cat.category_id)}
                          onCheckedChange={() =>
                            toggleRowCategory(index, cat.category_id)
                          }
                        />
                        {getDisplayCategoryId(cat.category_id)}: {cat.name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {page + 1} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

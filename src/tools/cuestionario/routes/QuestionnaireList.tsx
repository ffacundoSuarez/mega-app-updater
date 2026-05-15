// Pantalla "lista de cuestionarios" del Validador. Mismo patrón que la
// ProjectList del Limpiador: load() on mount, buscador, delete con confirm
// nativo, badges por origen.

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Calendar,
  ChevronRight,
  ClipboardList,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  deleteQuestionnaire,
  listQuestionnaires,
} from "@/lib/cuestionario/questionnaire-repository";
import type {
  QuestionnaireOrigin,
  QuestionnaireRow,
} from "@/lib/cuestionario/types";

export interface QuestionnaireListProps {
  onCreateNew: () => void;
  onOpen: (id: string) => void;
}

const ORIGIN_LABEL: Record<QuestionnaireOrigin, string> = {
  blanco: "En blanco",
  texto: "Texto pegado",
  docx: "Word",
  pdf: "PDF",
  questionpro_api: "API QuestionPro",
};

export function QuestionnaireList({
  onCreateNew,
  onOpen,
}: QuestionnaireListProps) {
  const [items, setItems] = useState<QuestionnaireRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listQuestionnaires());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = useCallback(
    async (row: QuestionnaireRow) => {
      const confirmed = window.confirm(
        `¿Eliminar el cuestionario "${row.nombre}"?\n\n` +
          "Se borran en cascada todas las validaciones asociadas. Esta acción " +
          "no se puede deshacer."
      );
      if (!confirmed) return;

      setDeleting((s) => new Set(s).add(row.id));
      try {
        await deleteQuestionnaire(row.id);
        await load();
      } catch (err) {
        window.alert(
          `No se pudo eliminar el cuestionario: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      } finally {
        setDeleting((s) => {
          const next = new Set(s);
          next.delete(row.id);
          return next;
        });
      }
    },
    [load]
  );

  const term = search.trim().toLowerCase();
  const filtered = term
    ? items.filter((q) => q.nombre.toLowerCase().includes(term))
    : items;

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Cargando cuestionarios…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="size-4" />
            <span className="font-medium">
              No se pudieron cargar los cuestionarios
            </span>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
            {error}
          </pre>
          <div>
            <Button size="sm" onClick={() => void load()}>
              Reintentar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cuestionarios…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
        </div>
        <Button onClick={onCreateNew} className="gap-2">
          <Plus className="size-4" />
          Nuevo cuestionario
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <ClipboardList className="size-10 opacity-50" />
            {items.length === 0 ? (
              <>
                <p>Todavía no hay cuestionarios.</p>
                <Button onClick={onCreateNew} className="mt-2 gap-2">
                  <Plus className="size-4" />
                  Crear el primero
                </Button>
              </>
            ) : (
              <p>Ningún cuestionario coincide con la búsqueda.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((q) => {
            const preguntasCount = q.questionnaire_json?.preguntas.length ?? 0;
            return (
              <li
                key={q.id}
                className="rounded-lg border bg-muted/20 p-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="size-5 shrink-0 text-primary" />
                      <h3 className="truncate text-base font-medium">
                        {q.nombre}
                      </h3>
                      <Badge variant="secondary" className="font-normal">
                        {ORIGIN_LABEL[q.origen]}
                      </Badge>
                      {q.qp_published_survey_id && (
                        <Badge className="font-normal">
                          Publicado en QP
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 ml-7 text-sm text-muted-foreground">
                      {preguntasCount === 0
                        ? "Sin preguntas todavía"
                        : `${preguntasCount} pregunta${
                            preguntasCount === 1 ? "" : "s"
                          }`}
                    </p>
                    <div className="mt-2 ml-7 flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="size-3.5" />
                      Creado: {new Date(q.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onOpen(q.id)}
                      className="gap-1"
                    >
                      Abrir
                      <ChevronRight className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => void handleDelete(q)}
                      disabled={deleting.has(q.id)}
                      aria-label="Eliminar cuestionario"
                    >
                      {deleting.has(q.id) ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

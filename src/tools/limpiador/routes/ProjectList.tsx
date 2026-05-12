// Pantalla "lista de proyectos" del Limpiador. Equivalente a
// `mega-dashboard/src/app/(dashboard)/limpiador/page.tsx`, adaptada al patrón
// de la app desktop (sin Next/Link, sin DropdownMenu por ahora — confirmar
// eliminación con `confirm()` nativo).

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Calendar,
  ChevronRight,
  FolderOpen,
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
  deleteProject,
  listProjects,
} from "@/lib/cleaning/projects-repository";
import type { CleaningProject } from "@/lib/cleaning/types";

export interface ProjectListProps {
  onCreateNew: () => void;
  onOpenProject: (id: string) => void;
}

export function ProjectList({ onCreateNew, onOpenProject }: ProjectListProps) {
  const [projects, setProjects] = useState<CleaningProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setProjects(await listProjects());
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
    async (project: CleaningProject) => {
      const confirmed = window.confirm(
        `¿Eliminar el proyecto "${project.name}"?\n\n` +
          "Se borran en cascada todas las versiones, filas, reglas y flags " +
          "asociados. Esta acción no se puede deshacer."
      );
      if (!confirmed) return;

      setDeleting((s) => new Set(s).add(project.id));
      try {
        await deleteProject(project.id);
        await load();
      } catch (err) {
        window.alert(
          `No se pudo eliminar el proyecto: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      } finally {
        setDeleting((s) => {
          const next = new Set(s);
          next.delete(project.id);
          return next;
        });
      }
    },
    [load]
  );

  const term = search.trim().toLowerCase();
  const filtered = term
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.description?.toLowerCase().includes(term) ||
          p.qp_survey_name?.toLowerCase().includes(term)
      )
    : projects;

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Cargando proyectos…
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
            <span className="font-medium">No se pudieron cargar los proyectos</span>
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
      {/* Toolbar superior: búsqueda + nuevo */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar proyectos…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
        </div>
        <Button onClick={onCreateNew} className="gap-2">
          <Plus className="size-4" />
          Nuevo proyecto
        </Button>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <FolderOpen className="size-10 opacity-50" />
            {projects.length === 0 ? (
              <>
                <p>Todavía no hay proyectos de limpieza.</p>
                <Button onClick={onCreateNew} className="mt-2 gap-2">
                  <Plus className="size-4" />
                  Crear el primero
                </Button>
              </>
            ) : (
              <p>Ningún proyecto coincide con la búsqueda.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border bg-muted/20 p-4 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="size-5 shrink-0 text-primary" />
                    <h3 className="truncate text-base font-medium">{p.name}</h3>
                    <Badge variant="secondary" className="font-normal">
                      {p.source === "questionpro" ? "QuestionPro" : "Qualtrics"}
                    </Badge>
                  </div>
                  {p.source === "questionpro" && p.qp_survey_name && (
                    <p className="mt-1 ml-7 text-sm text-muted-foreground">
                      Encuesta: {p.qp_survey_name}
                    </p>
                  )}
                  {p.description && (
                    <p className="mt-1 ml-7 text-sm text-muted-foreground">
                      {p.description}
                    </p>
                  )}
                  <div className="mt-2 ml-7 flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="size-3.5" />
                    Creado: {new Date(p.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenProject(p.id)}
                    className="gap-1"
                  >
                    Abrir
                    <ChevronRight className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleDelete(p)}
                    disabled={deleting.has(p.id)}
                    aria-label="Eliminar proyecto"
                  >
                    {deleting.has(p.id) ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

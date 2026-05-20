// Explorador de archivos bajo Documents\MegaApp\.

import { useCallback, useEffect, useState } from "react";
import { join } from "@tauri-apps/api/path";
import { readDir } from "@tauri-apps/plugin-fs";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ensureMegaAppRoot } from "@/lib/mega-paths";

interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface FilesViewProps {
  /** Ruta absoluta a resaltar/abrir carpeta contenedora. */
  highlightPath?: string | null;
}

export function FilesView({ highlightPath }: FilesViewProps) {
  const [root, setRoot] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDir = useCallback(async (dir: string) => {
    setLoading(true);
    setError(null);
    try {
      const raw = await readDir(dir);
      const mapped: DirEntry[] = [];
      for (const e of raw) {
        if (e.name.startsWith(".")) continue;
        const path = await join(dir, e.name);
        mapped.push({
          name: e.name,
          path,
          isDirectory: e.isDirectory,
        });
      }
      mapped.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name, "es");
      });
      setEntries(mapped);
      setCurrentPath(dir);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const megaRoot = await ensureMegaAppRoot();
        if (cancelled) return;
        setRoot(megaRoot);
        let start = megaRoot;
        if (highlightPath?.startsWith(megaRoot)) {
          const { dirname } = await import("@tauri-apps/api/path");
          start = await dirname(highlightPath);
        }
        await loadDir(start);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [highlightPath, loadDir]);

  const breadcrumbs = useCallback(async () => {
    if (!root || !currentPath) return [] as { label: string; path: string }[];
    if (currentPath === root) return [{ label: "MegaApp", path: root }];
    const rel = currentPath.slice(root.length).replace(/^[/\\]/, "");
    const parts = rel.split(/[/\\]/).filter(Boolean);
    const crumbs: { label: string; path: string }[] = [
      { label: "MegaApp", path: root },
    ];
    let acc = root;
    for (const p of parts) {
      acc = await join(acc, p);
      crumbs.push({ label: p, path: acc });
    }
    return crumbs;
  }, [root, currentPath]);

  const [crumbList, setCrumbList] = useState<
    { label: string; path: string }[]
  >([]);

  useEffect(() => {
    void breadcrumbs().then(setCrumbList);
  }, [breadcrumbs]);

  const openInExplorer = () => {
    if (currentPath) {
      revealItemInDir(currentPath).catch(console.error);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Archivos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Salidas de las herramientas en{" "}
          <span className="font-mono">Documents\MegaApp</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm">
          {crumbList.map((c, i) => (
            <span key={c.path} className="flex items-center gap-1">
              {i > 0 && (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <button
                type="button"
                className={cn(
                  "truncate rounded px-1 py-0.5 hover:bg-muted",
                  i === crumbList.length - 1 && "font-medium"
                )}
                onClick={() => void loadDir(c.path)}
              >
                {c.label}
              </button>
            </span>
          ))}
        </nav>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => currentPath && void loadDir(currentPath)}
          disabled={loading}
        >
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          Actualizar
        </Button>
        <Button variant="secondary" size="sm" onClick={openInExplorer}>
          <FolderOpen className="size-3.5" />
          Abrir en Explorador
        </Button>
      </div>

      {root && (
        <p className="font-mono text-xs text-muted-foreground break-all">
          {currentPath ?? root}
        </p>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <div className="rounded-lg border">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Cargando…
          </div>
        ) : entries.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Esta carpeta está vacía. Los exports de las herramientas aparecen
            acá cuando los guardás desde Mega App.
          </p>
        ) : (
          <ul className="divide-y">
            {entries.map((e) => {
              const highlighted =
                highlightPath === e.path ||
                (highlightPath && e.path === highlightPath);
              return (
                <li key={e.path}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/50",
                      highlighted && "bg-primary/10"
                    )}
                    onClick={() => {
                      if (e.isDirectory) void loadDir(e.path);
                      else openPath(e.path).catch(console.error);
                    }}
                  >
                    {e.isDirectory ? (
                      <Folder className="size-4 shrink-0 text-amber-600" />
                    ) : (
                      <File className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{e.name}</span>
                    {!e.isDirectory && (
                      <span className="text-xs text-muted-foreground">
                        Abrir
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

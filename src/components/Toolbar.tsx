// Sidebar: Inicio · Proyectos · Herramientas; Archivos y Ajustes abajo.

import {
  BarChart3,
  ClipboardCheck,
  FolderOpen,
  Home,
  Settings2,
  Sparkles,
  Tags,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewId = "home" | "files" | "settings" | ToolId;
export type ToolId = "brand-audit" | "limpiador" | "cuestionario" | "codificacion";

interface NavItem {
  id: ViewId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const HOME_ITEM: NavItem = {
  id: "home",
  label: "Inicio",
  icon: Home,
};

/** Flujo de proyecto de encuesta (cuestionario → limpieza → codificación). */
const PROYECTO_TOOLS: NavItem[] = [
  {
    id: "cuestionario",
    label: "Cuestionarios QPro",
    icon: ClipboardCheck,
  },
  {
    id: "limpiador",
    label: "Limpiador",
    icon: Sparkles,
  },
  {
    id: "codificacion",
    label: "Codificación",
    icon: Tags,
  },
];

/** Herramientas sueltas (por cliente, estudio, etc.). */
const HERRAMIENTA_TOOLS: NavItem[] = [
  {
    id: "brand-audit",
    label: "Brand Audit · YPF",
    icon: BarChart3,
  },
];

const FILES_ITEM: NavItem = {
  id: "files",
  label: "Archivos",
  icon: FolderOpen,
};

const SETTINGS_ITEM: NavItem = {
  id: "settings",
  label: "Ajustes",
  icon: Settings2,
};

export interface ToolbarProps {
  activeView: ViewId;
  onSelectView: (view: ViewId) => void;
  appVersion: string;
}

export function Toolbar({ activeView, onSelectView, appVersion }: ToolbarProps) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <nav className="flex-1 overflow-y-auto p-2">
        <NavSection title="Inicio" first>
          <NavEntry
            item={HOME_ITEM}
            active={activeView === HOME_ITEM.id}
            onClick={() => onSelectView(HOME_ITEM.id)}
          />
        </NavSection>

        <NavSection title="Proyectos">
          {PROYECTO_TOOLS.map((tool) => (
            <NavEntry
              key={tool.id}
              item={tool}
              active={activeView === tool.id}
              onClick={() => onSelectView(tool.id)}
            />
          ))}
        </NavSection>

        <NavSection title="Herramientas">
          {HERRAMIENTA_TOOLS.map((tool) => (
            <NavEntry
              key={tool.id}
              item={tool}
              active={activeView === tool.id}
              onClick={() => onSelectView(tool.id)}
            />
          ))}
        </NavSection>
      </nav>

      <div className="flex flex-col border-t">
        <ul className="flex flex-col gap-1 p-2">
          <NavEntry
            item={FILES_ITEM}
            active={activeView === FILES_ITEM.id}
            onClick={() => onSelectView(FILES_ITEM.id)}
          />
          <NavEntry
            item={SETTINGS_ITEM}
            active={activeView === SETTINGS_ITEM.id}
            onClick={() => onSelectView(SETTINGS_ITEM.id)}
          />
        </ul>
        <div className="border-t px-3 py-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>v{appVersion}</span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Al día
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavSection({
  title,
  first,
  children,
}: {
  title: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className={cn(
          "px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground",
          first ? "pt-2" : "pt-5"
        )}
      >
        {title}
      </div>
      <ul className="flex flex-col gap-1">{children}</ul>
    </>
  );
}

function NavEntry({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          active &&
            "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
        )}
      >
        <Icon className="size-4 shrink-0 opacity-80" />
        <span className="truncate">{item.label}</span>
      </button>
    </li>
  );
}

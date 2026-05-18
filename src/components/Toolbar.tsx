// Sidebar / toolbar principal de la app.
// Inicio + lista de herramientas disponibles + acceso a Ajustes.

import { BarChart3, ClipboardCheck, Home, Settings2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/** Vistas navegables desde el sidebar. "home" es la landing page. */
export type ViewId = "home" | "settings" | ToolId;
export type ToolId = "brand-audit" | "limpiador" | "cuestionario";

interface NavItem {
  id: ViewId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** Entrada de inicio, separada del resto visualmente. */
const HOME_ITEM: NavItem = {
  id: "home",
  label: "Inicio",
  icon: Home,
};

/** Herramientas disponibles. A medida que se sumen, se agregan acá. */
const TOOLS: NavItem[] = [
  {
    id: "brand-audit",
    label: "Brand Audit · YPF",
    icon: BarChart3,
  },
  {
    id: "limpiador",
    label: "Limpiador",
    icon: Sparkles,
  },
  {
    id: "cuestionario",
    label: "Cuestionarios QPro",
    icon: ClipboardCheck,
  },
];

/** Entradas del footer (abajo del sidebar). */
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
        {/* Inicio */}
        <ul className="flex flex-col gap-1">
          <NavEntry
            item={HOME_ITEM}
            active={activeView === HOME_ITEM.id}
            onClick={() => onSelectView(HOME_ITEM.id)}
          />
        </ul>

        {/* Sección de herramientas */}
        <div className="px-2 pt-5 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Herramientas
        </div>
        <ul className="flex flex-col gap-1">
          {TOOLS.map((tool) => (
            <NavEntry
              key={tool.id}
              item={tool}
              active={activeView === tool.id}
              onClick={() => onSelectView(tool.id)}
            />
          ))}
        </ul>
      </nav>

      {/* Footer: ajustes + versión */}
      <div className="flex flex-col border-t">
        <ul className="flex flex-col gap-1 p-2">
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

interface NavEntryProps {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}

function NavEntry({ item, active, onClick }: NavEntryProps) {
  const Icon = item.icon;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          active && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{item.label}</span>
      </button>
    </li>
  );
}

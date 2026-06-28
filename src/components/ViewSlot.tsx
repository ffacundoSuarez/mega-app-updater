/**
 * Contenedor de vista: monta la primera vez que se visita, luego queda en DOM
 * oculta para conservar estado. Memoizado para no re-renderizar herramientas
 * inactivas cuando cambia el sidebar.
 */

import { memo, useEffect, useState, type ComponentType } from "react";
import { cn } from "@/lib/utils";

export interface ViewSlotProps<P extends object> {
  active: boolean;
  viewId: string;
  Component: ComponentType<P>;
  componentProps: P;
}

function ViewSlotInner<P extends object>({
  active,
  viewId,
  Component,
  componentProps,
}: ViewSlotProps<P>) {
  const [mounted, setMounted] = useState(active);

  useEffect(() => {
    if (active) setMounted(true);
  }, [active]);

  if (!mounted) return null;

  return (
    <div
      data-view={viewId}
      className={cn(active ? "block" : "hidden")}
      aria-hidden={!active}
    >
      <Component {...componentProps} />
    </div>
  );
}

export const ViewSlot = memo(ViewSlotInner) as typeof ViewSlotInner;

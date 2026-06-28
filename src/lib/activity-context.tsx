// Contexto React para actividad local + sincronización del badge de taskbar.
// Separado en datos (cambia seguido) y acciones (estable) para limitar re-renders.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getActivityEvents,
  getRunningJobs,
  getUnreadCount,
  markActivityRead,
  markAllActivityRead,
  subscribeActivity,
  type ActivityEvent,
  type RunningJob,
} from "@/lib/activity";
import { syncTaskbarBadge } from "@/lib/taskbar-badge";

interface ActivityDataValue {
  events: ActivityEvent[];
  runningJobs: RunningJob[];
  unreadCount: number;
}

interface ActivityActionsValue {
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const ActivityDataContext = createContext<ActivityDataValue | null>(null);
const ActivityActionsContext = createContext<ActivityActionsValue | null>(null);

export function ActivityProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [runningJobs, setRunningJobs] = useState<RunningJob[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    const [ev, jobs, unread] = await Promise.all([
      getActivityEvents(50),
      getRunningJobs(),
      getUnreadCount(),
    ]);
    setEvents(ev);
    setRunningJobs(jobs);
    setUnreadCount(unread);
    await syncTaskbarBadge(unread);
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeActivity(() => {
      void refresh();
    });
  }, [refresh]);

  const markRead = useCallback(
    async (id: string) => {
      await markActivityRead(id);
      await refresh();
    },
    [refresh]
  );

  const markAllRead = useCallback(async () => {
    await markAllActivityRead();
    await refresh();
  }, [refresh]);

  const dataValue = useMemo(
    () => ({ events, runningJobs, unreadCount }),
    [events, runningJobs, unreadCount]
  );

  const actionsValue = useMemo(
    () => ({ refresh, markRead, markAllRead }),
    [refresh, markRead, markAllRead]
  );

  return (
    <ActivityActionsContext.Provider value={actionsValue}>
      <ActivityDataContext.Provider value={dataValue}>
        {children}
      </ActivityDataContext.Provider>
    </ActivityActionsContext.Provider>
  );
}

export function useActivity(): ActivityDataValue & ActivityActionsValue {
  const data = useContext(ActivityDataContext);
  const actions = useContext(ActivityActionsContext);
  if (!data || !actions) {
    throw new Error("useActivity debe usarse dentro de ActivityProvider");
  }
  return { ...data, ...actions };
}

/** Solo acciones estables (no re-renderiza cuando cambian events/unread). */
export function useActivityActions(): ActivityActionsValue {
  const actions = useContext(ActivityActionsContext);
  if (!actions) {
    throw new Error("useActivityActions debe usarse dentro de ActivityProvider");
  }
  return actions;
}

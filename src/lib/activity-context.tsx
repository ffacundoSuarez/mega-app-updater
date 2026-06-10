// Contexto React para actividad local + sincronización del badge de taskbar.

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

interface ActivityContextValue {
  events: ActivityEvent[];
  runningJobs: RunningJob[];
  unreadCount: number;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const ActivityContext = createContext<ActivityContextValue | null>(null);

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

  const value = useMemo(
    () => ({
      events,
      runningJobs,
      unreadCount,
      refresh,
      markRead,
      markAllRead,
    }),
    [events, runningJobs, unreadCount, refresh, markRead, markAllRead]
  );

  return (
    <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>
  );
}

export function useActivity(): ActivityContextValue {
  const ctx = useContext(ActivityContext);
  if (!ctx) {
    throw new Error("useActivity debe usarse dentro de ActivityProvider");
  }
  return ctx;
}

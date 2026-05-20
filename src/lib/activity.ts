/**
 * Registro local de actividad y notificaciones in-app.
 * Vive en app data (misma base que settings), no en Supabase.
 */

import { load, type Store } from "@tauri-apps/plugin-store";
import type { ToolId } from "@/components/Toolbar";
import type { ViewId } from "@/components/Toolbar";

const STORE_FILE = "activity.json";
const MAX_EVENTS = 100;

export type ActivityEventType =
  | "limpiador_project_created"
  | "limpiador_upload"
  | "limpiador_qc_done"
  | "limpiador_qc_error"
  | "limpiador_export"
  | "cuestionario_created"
  | "cuestionario_published"
  | "brand_audit_done"
  | "brand_audit_error"
  | "info"
  | "error";

export interface ActivityEvent {
  id: string;
  at: string;
  type: ActivityEventType;
  title: string;
  body?: string;
  toolId?: ToolId;
  viewId?: ViewId;
  /** Parámetros para navegar al abrir la notificación. */
  payload?: Record<string, string>;
  filePath?: string;
  read: boolean;
}

export interface RunningJob {
  id: string;
  toolId: ToolId;
  label: string;
  startedAt: string;
}

interface ActivityStoreData {
  events: ActivityEvent[];
  runningJobs: RunningJob[];
}

const EMPTY: ActivityStoreData = { events: [], runningJobs: [] };

let storePromise: Promise<Store> | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load(STORE_FILE, { autoSave: true, defaults: {} });
  }
  return storePromise;
}

async function readData(): Promise<ActivityStoreData> {
  const store = await getStore();
  const raw = await store.get<ActivityStoreData>("data");
  if (!raw || !Array.isArray(raw.events)) return { ...EMPTY };
  return {
    events: raw.events,
    runningJobs: Array.isArray(raw.runningJobs) ? raw.runningJobs : [],
  };
}

async function writeData(data: ActivityStoreData): Promise<void> {
  const store = await getStore();
  await store.set("data", data);
  await store.save();
  notify();
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface LogActivityInput {
  type: ActivityEventType;
  title: string;
  body?: string;
  toolId?: ToolId;
  viewId?: ViewId;
  payload?: Record<string, string>;
  filePath?: string;
}

/** Registra un evento y lo marca como no leído. */
export async function logActivity(input: LogActivityInput): Promise<ActivityEvent> {
  const data = await readData();
  const event: ActivityEvent = {
    id: newId(),
    at: new Date().toISOString(),
    read: false,
    ...input,
  };
  data.events = [event, ...data.events].slice(0, MAX_EVENTS);
  await writeData(data);
  return event;
}

export async function getActivityEvents(limit = 50): Promise<ActivityEvent[]> {
  const data = await readData();
  return data.events.slice(0, limit);
}

export async function getUnreadCount(): Promise<number> {
  const data = await readData();
  return data.events.filter((e) => !e.read).length;
}

export async function markActivityRead(id: string): Promise<void> {
  const data = await readData();
  const ev = data.events.find((e) => e.id === id);
  if (ev) ev.read = true;
  await writeData(data);
}

export async function markAllActivityRead(): Promise<void> {
  const data = await readData();
  for (const e of data.events) e.read = true;
  await writeData(data);
}

export async function startRunningJob(
  id: string,
  toolId: ToolId,
  label: string
): Promise<void> {
  const data = await readData();
  data.runningJobs = data.runningJobs.filter((j) => j.id !== id);
  data.runningJobs.push({
    id,
    toolId,
    label,
    startedAt: new Date().toISOString(),
  });
  await writeData(data);
}

export async function endRunningJob(id: string): Promise<void> {
  const data = await readData();
  data.runningJobs = data.runningJobs.filter((j) => j.id !== id);
  await writeData(data);
}

export async function getRunningJobs(): Promise<RunningJob[]> {
  const data = await readData();
  return data.runningJobs;
}

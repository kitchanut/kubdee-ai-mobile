import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  subscribeShopeeConvertLogs,
  subscribeShopeeImportLogs,
  subscribeShopeePostLogs,
} from '@/native/AccessibilityBridge';
import type {
  NativeShopeeConvertLog,
  NativeShopeeImportLog,
  NativeShopeePostLog,
} from '@/native/AccessibilityBridge';
import type { AutoPilotFlowStats, AutoPilotStepType } from '@/autopilot/types';

export type AutomationActivityKind = 'auto-pilot' | 'shopee-import' | 'shopee-post' | 'shopee-convert';

export interface AutomationActivityLogEntry {
  message: string;
  ts: number;
  flowStats?: AutoPilotFlowStats;
  step?: AutoPilotStepType;
  stage?: string;
}

export interface AutomationActivityRun {
  kind: AutomationActivityKind;
  title: string;
  logs: AutomationActivityLogEntry[];
  running: boolean;
  stopping: boolean;
  startedAt: number | null;
  updatedAt: number | null;
}

export interface AutomationActivitySnapshot {
  runs: Record<AutomationActivityKind, AutomationActivityRun>;
}

export const MAX_AUTOMATION_LOGS_PER_RUN = 300;
const STORAGE_KEY = 'kubdee_ai_mobile_automation_activity_log_v1';

const defaultTitles: Record<AutomationActivityKind, string> = {
  'auto-pilot': 'Auto Workflow ล่าสุด',
  'shopee-import': 'Shopee import ล่าสุด',
  'shopee-post': 'Shopee post ล่าสุด',
  'shopee-convert': 'Shopee แปลงลิงก์ล่าสุด',
};

const listeners = new Set<() => void>();
let hydrated = false;
let mutatedBeforeHydration = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function createRun(kind: AutomationActivityKind): AutomationActivityRun {
  return {
    kind,
    title: defaultTitles[kind],
    logs: [],
    running: false,
    stopping: false,
    startedAt: null,
    updatedAt: null,
  };
}

let snapshot: AutomationActivitySnapshot = {
  runs: {
    'auto-pilot': createRun('auto-pilot'),
    'shopee-import': createRun('shopee-import'),
    'shopee-post': createRun('shopee-post'),
    'shopee-convert': createRun('shopee-convert'),
  },
};

function emit(): void {
  listeners.forEach((listener) => listener());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeTimestamp(value: unknown): number | null {
  const ts = Number(value);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

function normalizeStep(value: unknown): AutoPilotStepType | undefined {
  return value === 'image' || value === 'video' ? value : undefined;
}

function sortLogEntries<TLog extends AutomationActivityLogEntry>(logs: TLog[]): TLog[] {
  return [...logs].sort((a, b) => a.ts - b.ts);
}

function trimLogEntries<TLog extends AutomationActivityLogEntry>(logs: TLog[]): TLog[] {
  return sortLogEntries(logs).slice(-MAX_AUTOMATION_LOGS_PER_RUN);
}

function normalizeFlowStats(value: unknown): AutoPilotFlowStats | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const generating = Number(value.generating);
  const queued = Number(value.queued);
  const success = Number(value.success);
  const failed = Number(value.failed);
  const tilesFound = Number(value.tilesFound);
  const progress = value.progress == null ? null : Number(value.progress);

  return {
    generating: Number.isFinite(generating) ? Math.max(0, generating) : 0,
    queued: Number.isFinite(queued) ? Math.max(0, queued) : 0,
    success: Number.isFinite(success) ? Math.max(0, success) : 0,
    failed: Number.isFinite(failed) ? Math.max(0, failed) : 0,
    tilesFound: Number.isFinite(tilesFound) ? Math.max(0, tilesFound) : undefined,
    progress: progress == null || !Number.isFinite(progress) ? null : Math.max(0, Math.min(100, progress)),
  };
}

function normalizeLogEntry(value: unknown): AutomationActivityLogEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const message = typeof value.message === 'string' ? value.message.trim() : '';
  const ts = normalizeTimestamp(value.ts);
  if (!message || ts == null) {
    return null;
  }

  return {
    message,
    ts,
    flowStats: normalizeFlowStats(value.flowStats),
    step: normalizeStep(value.step),
    stage: typeof value.stage === 'string' ? value.stage : undefined,
  };
}

function normalizeStoredRun(kind: AutomationActivityKind, value: unknown): AutomationActivityRun {
  const base = createRun(kind);
  if (!isRecord(value)) {
    return base;
  }

  const now = Date.now();
  const logs = Array.isArray(value.logs)
    ? value.logs
        .map(normalizeLogEntry)
        .filter((entry): entry is AutomationActivityLogEntry => Boolean(entry))
        .sort((a, b) => a.ts - b.ts)
        .slice(-MAX_AUTOMATION_LOGS_PER_RUN)
    : [];
  const wasRunning = value.running === true;
  const startedAt = normalizeTimestamp(value.startedAt) ?? logs[0]?.ts ?? null;
  let updatedAt = normalizeTimestamp(value.updatedAt) ?? logs[logs.length - 1]?.ts ?? startedAt;
  let restoredLogs = logs;

  if (wasRunning) {
    restoredLogs = [
      ...logs,
      {
        message: 'แอปเริ่มใหม่ งานก่อนหน้าถูกหยุดหรือขาดตอนระหว่างรัน',
        ts: now,
        stage: 'interrupted',
      },
    ].sort((a, b) => a.ts - b.ts).slice(-MAX_AUTOMATION_LOGS_PER_RUN);
    updatedAt = now;
  }

  return {
    ...base,
    title: typeof value.title === 'string' && value.title.trim() ? value.title.trim() : base.title,
    logs: restoredLogs,
    running: false,
    stopping: false,
    startedAt,
    updatedAt,
  };
}

function normalizeStoredSnapshot(value: unknown): AutomationActivitySnapshot | null {
  if (!isRecord(value) || !isRecord(value.runs)) {
    return null;
  }

  return {
    runs: {
      'auto-pilot': normalizeStoredRun('auto-pilot', value.runs['auto-pilot']),
      'shopee-import': normalizeStoredRun('shopee-import', value.runs['shopee-import']),
      'shopee-post': normalizeStoredRun('shopee-post', value.runs['shopee-post']),
      'shopee-convert': normalizeStoredRun('shopee-convert', value.runs['shopee-convert']),
    },
  };
}

function schedulePersist(): void {
  if (!hydrated) {
    mutatedBeforeHydration = true;
    return;
  }

  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistSnapshotNow().catch(() => {});
  }, 250);
}

async function hydrateAutomationActivitySnapshot(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!mutatedBeforeHydration && raw) {
      const parsed = JSON.parse(raw) as unknown;
      const restored = normalizeStoredSnapshot(parsed);
      if (restored) {
        snapshot = restored;
      }
    }
  } catch {
    // Keep the in-memory empty snapshot when persisted activity is unavailable.
  } finally {
    hydrated = true;
    emit();
    schedulePersist();
  }
}

function updateRun(
  kind: AutomationActivityKind,
  updater: (run: AutomationActivityRun) => AutomationActivityRun
): void {
  snapshot = {
    runs: {
      ...snapshot.runs,
      [kind]: updater(snapshot.runs[kind]),
    },
  };
  emit();
  schedulePersist();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AutomationActivitySnapshot {
  return snapshot;
}

function serializeSnapshot(): string {
  return JSON.stringify({
    version: 1,
    savedAt: Date.now(),
    runs: snapshot.runs,
  });
}

async function persistSnapshotNow(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, serializeSnapshot());
}

export async function flushAutomationActivitySnapshot(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }

  try {
    await persistSnapshotNow();
  } catch {
    // Activity logs are diagnostic only; never break the active automation flow.
  }
}

export function useAutomationActivitySnapshot(): AutomationActivitySnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function beginAutomationActivityRun(kind: AutomationActivityKind, title = defaultTitles[kind]): void {
  const now = Date.now();
  updateRun(kind, (run) => ({
    ...run,
    title,
    logs: [],
    running: true,
    stopping: false,
    startedAt: now,
    updatedAt: now,
  }));
}

export function pushAutomationActivityLog(
  kind: AutomationActivityKind,
  message: string,
  ts = Date.now(),
  meta?: Pick<AutomationActivityLogEntry, 'flowStats' | 'step' | 'stage'>
): void {
  const cleanMessage = message.trim();
  if (!cleanMessage) return;

  updateRun(kind, (run) => ({
    ...run,
    logs: trimLogEntries([...run.logs, { message: cleanMessage, ts, ...meta }]),
    startedAt: run.startedAt ?? ts,
    updatedAt: Math.max(run.updatedAt ?? 0, ts),
  }));
}

export function setAutomationActivityRunning(kind: AutomationActivityKind, running: boolean): void {
  updateRun(kind, (run) => ({
    ...run,
    running,
    stopping: running ? run.stopping : false,
    updatedAt: Date.now(),
  }));
}

export function setAutomationActivityStopping(kind: AutomationActivityKind, stopping: boolean): void {
  updateRun(kind, (run) => ({
    ...run,
    stopping,
    updatedAt: Date.now(),
  }));
}

export function clearAutomationActivityRun(kind: AutomationActivityKind): void {
  updateRun(kind, () => createRun(kind));
}

export function useAutomationActivityNativeBridge(): void {
  useEffect(() => {
    const importSubscription = subscribeShopeeImportLogs((entry: NativeShopeeImportLog) => {
      pushAutomationActivityLog('shopee-import', entry.message, entry.ts);
      void flushAutomationActivitySnapshot();
    });
    const postSubscription = subscribeShopeePostLogs((entry: NativeShopeePostLog) => {
      pushAutomationActivityLog('shopee-post', entry.message, entry.ts);
      void flushAutomationActivitySnapshot();
    });
    const convertSubscription = subscribeShopeeConvertLogs((entry: NativeShopeeConvertLog) => {
      pushAutomationActivityLog('shopee-convert', entry.message, entry.ts);
      void flushAutomationActivitySnapshot();
    });

    return () => {
      importSubscription?.remove();
      postSubscription?.remove();
      convertSubscription?.remove();
    };
  }, []);
}

void hydrateAutomationActivitySnapshot();

import { useEffect, useSyncExternalStore } from 'react';

import {
  subscribeShopeeImportLogs,
  subscribeShopeePostLogs,
} from '@/native/AccessibilityBridge';
import type { NativeShopeeImportLog, NativeShopeePostLog } from '@/native/AccessibilityBridge';

export type AutomationActivityKind = 'shopee-import' | 'shopee-post';

export interface AutomationActivityLogEntry {
  message: string;
  ts: number;
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

const MAX_LOGS_PER_RUN = 100;

const defaultTitles: Record<AutomationActivityKind, string> = {
  'shopee-import': 'Shopee import ล่าสุด',
  'shopee-post': 'Shopee post ล่าสุด',
};

const listeners = new Set<() => void>();

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
    'shopee-import': createRun('shopee-import'),
    'shopee-post': createRun('shopee-post'),
  },
};

function emit(): void {
  listeners.forEach((listener) => listener());
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
  ts = Date.now()
): void {
  const cleanMessage = message.trim();
  if (!cleanMessage) return;

  updateRun(kind, (run) => ({
    ...run,
    logs: [...run.logs, { message: cleanMessage, ts }].slice(-MAX_LOGS_PER_RUN),
    startedAt: run.startedAt ?? ts,
    updatedAt: ts,
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
    });
    const postSubscription = subscribeShopeePostLogs((entry: NativeShopeePostLog) => {
      pushAutomationActivityLog('shopee-post', entry.message, entry.ts);
    });

    return () => {
      importSubscription?.remove();
      postSubscription?.remove();
    };
  }, []);
}

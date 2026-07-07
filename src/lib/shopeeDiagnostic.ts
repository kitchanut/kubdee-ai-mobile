import * as FileSystem from 'expo-file-system/legacy';

import { captureShopeeDiagnostic } from '@/lib/sentry';

// The native accessibility service writes these files (into the app's files dir, shared with the
// :automation process) when a Shopee scrape finds no cards, or when the user taps "report problem"
// after Stop. See writeShopeeScrapeDiagnostic / writeShopeeReportDiagnostic.
const DIAGNOSTIC_FILE = 'shopee-diagnostic-latest.txt';
const SCREENSHOT_FILE = 'shopee-diagnostic-screenshot.jpg';

// Header line the native side writes for user-triggered reports (vs automatic scrape diagnostics).
const MANUAL_REPORT_MARKER = 'type=manual-report';

export interface ShopeeManualReport {
  dump: string;
  screenshot?: Uint8Array;
}

function filePath(name: string): string | null {
  return FileSystem.documentDirectory ? `${FileSystem.documentDirectory}${name}` : null;
}

async function readDumpFile(): Promise<string | null> {
  const path = filePath(DIAGNOSTIC_FILE);
  if (!path) return null;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.isDirectory) return null;
    const dump = await FileSystem.readAsStringAsync(path);
    return dump.trim() ? dump : null;
  } catch {
    return null;
  }
}

async function readScreenshotBytes(): Promise<Uint8Array | undefined> {
  const path = filePath(SCREENSHOT_FILE);
  const decode = (globalThis as { atob?: (input: string) => string }).atob;
  if (!path || !decode) return undefined;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.isDirectory) return undefined;
    const base64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
    const binary = decode(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.length > 0 ? bytes : undefined;
  } catch {
    return undefined;
  }
}

async function deleteDiagnosticFiles(): Promise<void> {
  for (const name of [DIAGNOSTIC_FILE, SCREENSHOT_FILE]) {
    const path = filePath(name);
    if (!path) continue;
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {
      // best-effort
    }
  }
}

function isManualReport(dump: string): boolean {
  return dump.startsWith(MANUAL_REPORT_MARKER) || dump.includes(`\n${MANUAL_REPORT_MARKER}`);
}

/**
 * Forward an AUTOMATIC diagnostic the native scraper left behind (scrape found no cards) to
 * Sentry, then delete the files. Manual "report problem" dumps are left in place — those are
 * handled by the report modal (takePendingShopeeManualReport) so the user can add a description.
 * Best-effort; never throws. Call on app start and whenever the app returns to foreground.
 */
export async function flushShopeeScrapeDiagnostic(context: Record<string, unknown> = {}): Promise<void> {
  try {
    const dump = await readDumpFile();
    if (!dump) return;
    if (isManualReport(dump)) {
      console.log('[shopee-diagnostic] manual report pending — leaving for report modal');
      return;
    }
    const screenshot = await readScreenshotBytes();
    console.log('[shopee-diagnostic] sending auto diagnostic to Sentry', { bytes: dump.length });
    captureShopeeDiagnostic('Shopee automation diagnostic', dump, context, screenshot);
    await deleteDiagnosticFiles();
  } catch {
    // best-effort — diagnostics must never break the import flow
  }
}

/**
 * Read a pending user-triggered report ("รายงานปัญหา" after Stop) WITHOUT deleting it, so the
 * report modal can collect a description first. Returns null when there is none.
 */
export async function takePendingShopeeManualReport(): Promise<ShopeeManualReport | null> {
  try {
    const dump = await readDumpFile();
    if (!dump || !isManualReport(dump)) return null;
    const screenshot = await readScreenshotBytes();
    return { dump, screenshot };
  } catch {
    return null;
  }
}

/** Send a manual report (with the user's description) to Sentry, then delete the files. */
export async function sendShopeeManualReport(
  report: ShopeeManualReport,
  description: string,
  context: Record<string, unknown> = {}
): Promise<void> {
  const trimmed = description.trim();
  console.log('[shopee-diagnostic] sending manual report to Sentry', {
    bytes: report.dump.length,
    hasScreenshot: Boolean(report.screenshot),
    hasDescription: Boolean(trimmed),
  });
  captureShopeeDiagnostic(
    trimmed ? `Shopee user report: ${trimmed.slice(0, 120)}` : 'Shopee user report',
    report.dump,
    { ...context, userDescription: trimmed || null, trigger: 'manual-report' },
    report.screenshot
  );
  await deleteDiagnosticFiles();
}

/** Discard a pending manual report without sending. */
export async function discardShopeeManualReport(): Promise<void> {
  console.log('[shopee-diagnostic] manual report discarded by user');
  await deleteDiagnosticFiles();
}

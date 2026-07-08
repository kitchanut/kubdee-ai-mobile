import * as FileSystem from 'expo-file-system/legacy';

import { captureShopeeDiagnostic } from '@/lib/sentry';

// The native accessibility service writes these files (into the app's files dir, shared with the
// :automation process) when a Shopee scrape finds no cards, or when the user taps "report problem"
// after Stop and submits the description panel shown over the frozen Shopee screen.
// See writeShopeeScrapeDiagnostic / writeShopeeReportDiagnostic / writeShopeeReportDescription.
const DIAGNOSTIC_FILE = 'shopee-diagnostic-latest.txt';
const SCREENSHOT_FILE = 'shopee-diagnostic-screenshot.jpg';
// Doubles as the "ready" marker for manual reports: it only exists once the user tapped ส่ง on the
// overlay panel, so a flush can't race them while they are still typing.
const DESCRIPTION_FILE = 'shopee-diagnostic-desc.txt';

// Header line the native side writes for user-triggered reports (vs automatic scrape diagnostics).
const MANUAL_REPORT_MARKER = 'type=manual-report';

function filePath(name: string): string | null {
  return FileSystem.documentDirectory ? `${FileSystem.documentDirectory}${name}` : null;
}

async function readTextFile(name: string): Promise<string | null> {
  const path = filePath(name);
  if (!path) return null;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.isDirectory) return null;
    return await FileSystem.readAsStringAsync(path);
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
  for (const name of [DIAGNOSTIC_FILE, SCREENSHOT_FILE, DESCRIPTION_FILE]) {
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
 * Forward any diagnostic the native side left behind to Sentry, then delete the files.
 * - Automatic scrape diagnostics send as "Shopee automation diagnostic".
 * - Manual reports send as "Shopee user report[: description]" — but only once the description
 *   file exists (the user tapped ส่ง on the overlay panel); before that they are left in place.
 * Best-effort; never throws. Call on app start and whenever the app returns to foreground.
 */
export async function flushShopeeScrapeDiagnostic(context: Record<string, unknown> = {}): Promise<void> {
  try {
    const dump = await readTextFile(DIAGNOSTIC_FILE);
    if (!dump || !dump.trim()) return;

    const manual = isManualReport(dump);
    let description = '';
    if (manual) {
      const descFile = await readTextFile(DESCRIPTION_FILE);
      if (descFile === null) {
        console.log('[shopee-diagnostic] manual report not finalized yet — waiting for ส่ง');
        return;
      }
      description = descFile.trim();
    }

    const screenshot = await readScreenshotBytes();
    const message = manual
      ? description
        ? `Shopee user report: ${description.slice(0, 120)}`
        : 'Shopee user report'
      : 'Shopee automation diagnostic';
    // Stable trigger for grouping + context, even if the caller forgot to pass one.
    const trigger = manual
      ? 'manual-report'
      : typeof context.trigger === 'string' && context.trigger
        ? context.trigger
        : 'unknown';
    console.log('[shopee-diagnostic] sending to Sentry', {
      manual,
      trigger,
      bytes: dump.length,
      hasScreenshot: Boolean(screenshot),
      hasDescription: Boolean(description),
    });
    captureShopeeDiagnostic(
      message,
      dump,
      manual
        ? { ...context, trigger, userDescription: description || null }
        : { ...context, trigger },
      screenshot,
      // User reports share one issue (the description varies per report); automation
      // diagnostics split by what flushed them.
      manual ? ['shopee-user-report'] : ['shopee-diagnostic', trigger]
    );
    await deleteDiagnosticFiles();
  } catch {
    // best-effort — diagnostics must never break the import flow
  }
}

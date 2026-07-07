import * as FileSystem from 'expo-file-system/legacy';

import { captureShopeeDiagnostic } from '@/lib/sentry';

// The native accessibility service writes these files (into the app's files dir, shared with the
// :automation process) when a Shopee scrape finds no cards, or when the user taps "report problem"
// after Stop. See writeShopeeScrapeDiagnostic / writeShopeeReportDiagnostic.
const DIAGNOSTIC_FILE = 'shopee-diagnostic-latest.txt';
const SCREENSHOT_FILE = 'shopee-diagnostic-screenshot.jpg';

function filePath(name: string): string | null {
  return FileSystem.documentDirectory ? `${FileSystem.documentDirectory}${name}` : null;
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
    await FileSystem.deleteAsync(path, { idempotent: true });
    return bytes.length > 0 ? bytes : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Forward any diagnostic the native scraper left behind (on-screen tree, plus the run log and a
 * screenshot for manual reports) to Sentry, then delete the files. No-op when there's nothing to
 * send. Best-effort; never throws. Call after an import and whenever the app returns to foreground
 * (a manual report is written while the user is still on Shopee, before they return).
 */
export async function flushShopeeScrapeDiagnostic(context: Record<string, unknown> = {}): Promise<void> {
  const path = filePath(DIAGNOSTIC_FILE);
  if (!path) return;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.isDirectory) return;
    const dump = await FileSystem.readAsStringAsync(path);
    const screenshot = await readScreenshotBytes();
    if (dump.trim() || screenshot) {
      captureShopeeDiagnostic('Shopee automation diagnostic', dump, context, screenshot);
    }
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    // best-effort — diagnostics must never break the import flow
  }
}

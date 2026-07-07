import * as FileSystem from 'expo-file-system/legacy';

import { captureShopeeDiagnostic } from '@/lib/sentry';

// The native accessibility service writes this file (into the app's files dir, shared with the
// :automation process) when a Shopee scrape can't find any cards. See writeShopeeScrapeDiagnostic.
const DIAGNOSTIC_FILE = 'shopee-diagnostic-latest.txt';

function diagnosticPath(): string | null {
  return FileSystem.documentDirectory ? `${FileSystem.documentDirectory}${DIAGNOSTIC_FILE}` : null;
}

/**
 * After a Shopee import, forward any diagnostic dump the native scraper left behind (on-screen
 * accessibility tree captured when it found no cards) to Sentry, then delete it. No-op when the
 * import scraped fine — there is no file. Best-effort; never throws.
 */
export async function flushShopeeScrapeDiagnostic(context: Record<string, unknown> = {}): Promise<void> {
  const path = diagnosticPath();
  if (!path) return;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.isDirectory) return;
    const dump = await FileSystem.readAsStringAsync(path);
    if (dump.trim()) {
      captureShopeeDiagnostic('Shopee scrape found no cards (diagnostic)', dump, context);
    }
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    // best-effort — diagnostics must never break the import flow
  }
}

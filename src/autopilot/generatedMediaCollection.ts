export const LEGACY_GENERATED_MEDIA_CACHE_LIMIT = 300;
/** Native MediaStore scan batch size; this does not cap rows stored or shown by SQLite. */
export const DEVICE_MEDIA_IMPORT_SCAN_BATCH_SIZE = 300;

export interface GeneratedMediaCollectionItem {
  id: string;
  fileUri: string | null;
  createdAt: number;
}

export function dedupeGeneratedMediaAssets<T extends GeneratedMediaCollectionItem>(input: readonly T[]): T[] {
  const seenKeys = new Set<string>();
  const result: T[] = [];
  for (const asset of input) {
    const key = asset.fileUri || asset.id;
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    result.push(asset);
  }
  return result;
}

/**
 * SQLite is the source of truth, so the live collection must never be truncated.
 * Sorting before deduplication keeps the newest row when the same file URI appears twice.
 */
export function buildLiveGeneratedMediaAssets<T extends GeneratedMediaCollectionItem>(input: readonly T[]): T[] {
  return dedupeGeneratedMediaAssets([...input].sort((first, second) => second.createdAt - first.createdAt));
}

/**
 * AsyncStorage remains only as a bounded legacy migration cache. It must not control
 * how many SQLite rows are visible in the library.
 */
export function buildLegacyGeneratedMediaCache<T>(input: readonly T[]): T[] {
  return input.slice(0, LEGACY_GENERATED_MEDIA_CACHE_LIMIT);
}

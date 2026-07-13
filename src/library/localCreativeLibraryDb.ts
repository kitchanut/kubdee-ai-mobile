import * as SQLite from 'expo-sqlite';

export type CreativeMediaKind = 'images' | 'videos';
export type CreativeAssetKind = 'characters' | 'scenes';

export interface CreativeMediaAsset {
  id: string;
  kind: CreativeMediaKind;
  runId: string | null;
  profileLocalId: string | null;
  productId: string | null;
  productName: string | null;
  productCode: string | null;
  productUrl: string | null;
  caption: string | null;
  hashtags: string | null;
  cta: string | null;
  platform: string | null;
  title: string;
  fileUri: string | null;
  fileName: string | null;
  mimeType: string | null;
  thumbnailUri: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** platform (facebook/instagram/youtube/tiktok/shopee) -> postedAt in ms, per destination this media was published to */
  postedPlatforms?: Record<string, number> | null;
  source: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreativeLibraryItem {
  id: string;
  kind: CreativeAssetKind;
  profileLocalId: string | null;
  name: string;
  description: string | null;
  imageUri: string | null;
  tags: string | null;
  enabled: boolean;
  source: string;
  createdAt: number;
  updatedAt: number;
}

export type UpsertCreativeMediaAssetInput = Omit<CreativeMediaAsset, 'updatedAt'> & {
  updatedAt?: number;
};

export type UpsertCreativeLibraryItemInput = Omit<CreativeLibraryItem, 'enabled' | 'updatedAt'> & {
  enabled?: boolean;
  updatedAt?: number;
};

const DATABASE_NAME = 'kubdee-creative-library.db';
const SCHEMA_VERSION = 2;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let dbQueue: Promise<void> = Promise.resolve();

function nowMs(): number {
  return Date.now();
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function boolToInt(value: boolean): number {
  return value ? 1 : 0;
}

function intToBool(value: number | null | undefined): boolean {
  return value === 1;
}

/** Parse the posted_platforms JSON column into a {platform: postedAtMs} map (null if empty/invalid). */
function parsePostedPlatforms(raw: string | null | undefined): Record<string, number> | null {
  const text = raw?.trim();
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const result: Record<string, number> = {};
    for (const [platform, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        result[platform] = value;
      }
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

async function ensureColumn(
  db: SQLite.SQLiteDatabase,
  tableName: string,
  columnName: string,
  columnType: string
): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  if (columns.some((column) => column.name === columnName)) {
    return;
  }
  await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
}

async function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      await db.execAsync(`
        PRAGMA busy_timeout = 5000;
        PRAGMA journal_mode = WAL;

        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS creative_media_assets (
          id TEXT PRIMARY KEY NOT NULL,
          kind TEXT NOT NULL,
          run_id TEXT,
          profile_local_id TEXT,
          product_id TEXT,
          product_name TEXT,
          product_code TEXT,
          product_url TEXT,
          caption TEXT,
          hashtags TEXT,
          cta TEXT,
          platform TEXT,
          title TEXT NOT NULL,
          file_uri TEXT,
          file_name TEXT,
          mime_type TEXT,
          thumbnail_uri TEXT,
          size_bytes INTEGER,
          width INTEGER,
          height INTEGER,
          duration_ms INTEGER,
          source TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_creative_media_profile_kind
          ON creative_media_assets(profile_local_id, kind, created_at);

        CREATE INDEX IF NOT EXISTS idx_creative_media_product
          ON creative_media_assets(profile_local_id, kind, product_id);

        CREATE TABLE IF NOT EXISTS creative_library_items (
          id TEXT PRIMARY KEY NOT NULL,
          kind TEXT NOT NULL,
          profile_local_id TEXT,
          name TEXT NOT NULL,
          description TEXT,
          image_uri TEXT,
          tags TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          source TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_creative_library_profile_kind
          ON creative_library_items(profile_local_id, kind, created_at);
      `);
      await ensureColumn(db, 'creative_media_assets', 'thumbnail_uri', 'TEXT');
      await ensureColumn(db, 'creative_media_assets', 'cta', 'TEXT');
      await ensureColumn(db, 'creative_media_assets', 'posted_platforms', 'TEXT');
      await db.runAsync(
        `INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)`,
        'schema_version',
        String(SCHEMA_VERSION)
      );
      return db;
    });
  }

  return dbPromise;
}

async function runDbTask<T>(task: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> {
  const previousTask = dbQueue.catch(() => undefined);
  const resultPromise = previousTask.then(async () => task(await openDb()));
  dbQueue = resultPromise.then(
    () => undefined,
    () => undefined
  );
  return resultPromise;
}

function mapMediaRow(row: Record<string, unknown>): CreativeMediaAsset {
  return {
    id: String(row.id),
    kind: row.kind as CreativeMediaKind,
    runId: cleanText(row.run_id as string | null),
    profileLocalId: cleanText(row.profile_local_id as string | null),
    productId: cleanText(row.product_id as string | null),
    productName: cleanText(row.product_name as string | null),
    productCode: cleanText(row.product_code as string | null),
    productUrl: cleanText(row.product_url as string | null),
    caption: cleanText(row.caption as string | null),
    hashtags: cleanText(row.hashtags as string | null),
    cta: cleanText(row.cta as string | null),
    platform: cleanText(row.platform as string | null),
    title: String(row.title || 'Media'),
    fileUri: cleanText(row.file_uri as string | null),
    fileName: cleanText(row.file_name as string | null),
    mimeType: cleanText(row.mime_type as string | null),
    thumbnailUri: cleanText(row.thumbnail_uri as string | null),
    sizeBytes: typeof row.size_bytes === 'number' ? row.size_bytes : null,
    width: typeof row.width === 'number' ? row.width : null,
    height: typeof row.height === 'number' ? row.height : null,
    durationMs: typeof row.duration_ms === 'number' ? row.duration_ms : null,
    postedPlatforms: parsePostedPlatforms(row.posted_platforms as string | null),
    source: String(row.source || 'mobile'),
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  };
}

function mapLibraryRow(row: Record<string, unknown>): CreativeLibraryItem {
  return {
    id: String(row.id),
    kind: row.kind as CreativeAssetKind,
    profileLocalId: cleanText(row.profile_local_id as string | null),
    name: String(row.name || 'รายการใหม่'),
    description: cleanText(row.description as string | null),
    imageUri: cleanText(row.image_uri as string | null),
    tags: cleanText(row.tags as string | null),
    enabled: intToBool(row.enabled as number),
    source: String(row.source || 'mobile'),
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  };
}

export async function getCreativeMediaAssets(
  kind: CreativeMediaKind,
  profileLocalId?: string | null
): Promise<CreativeMediaAsset[]> {
  return runDbTask(async (db) => {
    const profile = cleanText(profileLocalId);
    const rows = profile
      ? await db.getAllAsync<Record<string, unknown>>(
          `SELECT * FROM creative_media_assets WHERE kind = ? AND profile_local_id = ? ORDER BY created_at DESC`,
          kind,
          profile
        )
      : await db.getAllAsync<Record<string, unknown>>(
          `SELECT * FROM creative_media_assets WHERE kind = ? ORDER BY created_at DESC`,
          kind
        );
    return rows.map(mapMediaRow);
  });
}

export async function upsertCreativeMediaAsset(
  input: UpsertCreativeMediaAssetInput
): Promise<CreativeMediaAsset> {
  const timestamp = input.updatedAt ?? nowMs();
  const asset: CreativeMediaAsset = {
    ...input,
    runId: cleanText(input.runId),
    profileLocalId: cleanText(input.profileLocalId),
    productId: cleanText(input.productId),
    productName: cleanText(input.productName),
    productCode: cleanText(input.productCode),
    productUrl: cleanText(input.productUrl),
    caption: cleanText(input.caption),
    hashtags: cleanText(input.hashtags),
    cta: cleanText(input.cta),
    platform: cleanText(input.platform),
    fileUri: cleanText(input.fileUri),
    fileName: cleanText(input.fileName),
    mimeType: cleanText(input.mimeType),
    thumbnailUri: cleanText(input.thumbnailUri),
    updatedAt: timestamp,
  };

  await runDbTask(async (db) => {
    await db.runAsync(
      `
        INSERT INTO creative_media_assets (
          id, kind, run_id, profile_local_id, product_id, product_name, product_code,
          product_url, caption, hashtags, cta, platform, title, file_uri, file_name,
          mime_type, thumbnail_uri, size_bytes, width, height, duration_ms, source,
          posted_platforms, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          run_id = excluded.run_id,
          profile_local_id = excluded.profile_local_id,
          product_id = excluded.product_id,
          product_name = excluded.product_name,
          product_code = excluded.product_code,
          product_url = excluded.product_url,
          caption = excluded.caption,
          hashtags = excluded.hashtags,
          cta = excluded.cta,
          platform = excluded.platform,
          title = excluded.title,
          file_uri = excluded.file_uri,
          file_name = excluded.file_name,
          mime_type = excluded.mime_type,
          thumbnail_uri = excluded.thumbnail_uri,
          size_bytes = excluded.size_bytes,
          width = excluded.width,
          height = excluded.height,
          duration_ms = excluded.duration_ms,
          source = excluded.source,
          posted_platforms = COALESCE(excluded.posted_platforms, creative_media_assets.posted_platforms),
          updated_at = excluded.updated_at
      `,
      asset.id,
      asset.kind,
      asset.runId,
      asset.profileLocalId,
      asset.productId,
      asset.productName,
      asset.productCode,
      asset.productUrl,
      asset.caption,
      asset.hashtags,
      asset.cta,
      asset.platform,
      asset.title,
      asset.fileUri,
      asset.fileName,
      asset.mimeType,
      asset.thumbnailUri,
      asset.sizeBytes,
      asset.width,
      asset.height,
      asset.durationMs,
      asset.source,
      asset.postedPlatforms ? JSON.stringify(asset.postedPlatforms) : null,
      asset.createdAt,
      asset.updatedAt
    );
  });

  return asset;
}

/**
 * Merge one social destination into a media asset's posted_platforms map.
 * Accumulative — posting the same video to another platform later keeps the earlier
 * ones, so a single video correctly shows every platform it has been published to.
 * Returns the updated map, or null if the asset does not exist.
 */
export async function markCreativeMediaPosted(
  id: string,
  platform: string,
  postedAt: number = nowMs()
): Promise<Record<string, number> | null> {
  const cleanId = id.trim();
  const cleanPlatform = platform.trim().toLowerCase();
  if (!cleanId || !cleanPlatform) {
    return null;
  }

  return runDbTask(async (db) => {
    const row = await db.getFirstAsync<{ posted_platforms: string | null }>(
      `SELECT posted_platforms FROM creative_media_assets WHERE id = ?`,
      cleanId
    );
    if (!row) {
      return null;
    }
    const merged = parsePostedPlatforms(row.posted_platforms) ?? {};
    merged[cleanPlatform] = postedAt;
    await db.runAsync(
      `UPDATE creative_media_assets SET posted_platforms = ?, updated_at = ? WHERE id = ?`,
      JSON.stringify(merged),
      nowMs(),
      cleanId
    );
    return merged;
  });
}

/**
 * Same as markCreativeMediaPosted but keyed by fileUri — the Auto Pilot posting flow only
 * carries the video's fileUri, not the media asset id. Returns the affected asset id and its
 * updated posted map so callers can patch in-memory state, or null if no asset matches.
 */
export async function markCreativeMediaPostedByFileUri(
  fileUri: string,
  platform: string,
  postedAt: number = nowMs()
): Promise<{ id: string; postedPlatforms: Record<string, number> } | null> {
  const cleanUri = fileUri.trim();
  const cleanPlatform = platform.trim().toLowerCase();
  if (!cleanUri || !cleanPlatform) {
    return null;
  }

  return runDbTask(async (db) => {
    const row = await db.getFirstAsync<{ id: string; posted_platforms: string | null }>(
      `SELECT id, posted_platforms FROM creative_media_assets WHERE file_uri = ? ORDER BY created_at DESC LIMIT 1`,
      cleanUri
    );
    if (!row) {
      return null;
    }
    const merged = parsePostedPlatforms(row.posted_platforms) ?? {};
    merged[cleanPlatform] = postedAt;
    await db.runAsync(
      `UPDATE creative_media_assets SET posted_platforms = ?, updated_at = ? WHERE id = ?`,
      JSON.stringify(merged),
      nowMs(),
      row.id
    );
    return { id: row.id, postedPlatforms: merged };
  });
}

export async function deleteCreativeMediaAssets(ids: string[]): Promise<void> {
  const cleanIds = ids.map((id) => id.trim()).filter(Boolean);
  if (cleanIds.length === 0) return;

  await runDbTask(async (db) => {
    for (const id of cleanIds) {
      await db.runAsync(`DELETE FROM creative_media_assets WHERE id = ?`, id);
    }
  });
}

export async function getCreativeLibraryItems(
  kind: CreativeAssetKind,
  profileLocalId?: string | null
): Promise<CreativeLibraryItem[]> {
  return runDbTask(async (db) => {
    const profile = cleanText(profileLocalId);
    const rows = profile
      ? await db.getAllAsync<Record<string, unknown>>(
          `SELECT * FROM creative_library_items WHERE kind = ? AND profile_local_id = ? ORDER BY created_at DESC`,
          kind,
          profile
        )
      : await db.getAllAsync<Record<string, unknown>>(
          `SELECT * FROM creative_library_items WHERE kind = ? ORDER BY created_at DESC`,
          kind
        );
    return rows.map(mapLibraryRow);
  });
}

export async function upsertCreativeLibraryItem(
  input: UpsertCreativeLibraryItemInput
): Promise<CreativeLibraryItem> {
  const timestamp = input.updatedAt ?? nowMs();
  const item: CreativeLibraryItem = {
    ...input,
    profileLocalId: cleanText(input.profileLocalId),
    description: cleanText(input.description),
    imageUri: cleanText(input.imageUri),
    tags: cleanText(input.tags),
    enabled: input.enabled ?? true,
    updatedAt: timestamp,
  };

  await runDbTask(async (db) => {
    await db.runAsync(
      `
        INSERT INTO creative_library_items (
          id, kind, profile_local_id, name, description, image_uri, tags,
          enabled, source, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          kind = excluded.kind,
          profile_local_id = excluded.profile_local_id,
          name = excluded.name,
          description = excluded.description,
          image_uri = excluded.image_uri,
          tags = excluded.tags,
          enabled = excluded.enabled,
          source = excluded.source,
          updated_at = excluded.updated_at
      `,
      item.id,
      item.kind,
      item.profileLocalId,
      item.name,
      item.description,
      item.imageUri,
      item.tags,
      boolToInt(item.enabled),
      item.source,
      item.createdAt,
      item.updatedAt
    );
  });

  return item;
}

export async function deleteCreativeLibraryItems(ids: string[]): Promise<void> {
  const cleanIds = ids.map((id) => id.trim()).filter(Boolean);
  if (cleanIds.length === 0) return;

  await runDbTask(async (db) => {
    for (const id of cleanIds) {
      await db.runAsync(`DELETE FROM creative_library_items WHERE id = ?`, id);
    }
  });
}

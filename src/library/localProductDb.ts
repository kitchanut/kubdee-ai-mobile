import * as SQLite from 'expo-sqlite';

import type { SyncAffiliateProductInput } from '@/library/api';
import type { AffiliateProduct } from '@/library/types';

type ProductSyncOperation = 'upsert' | 'delete';
type ProductSyncStatus = 'synced' | 'pending_upsert' | 'pending_delete';

interface LocalProductRow {
  product_json: string;
}

interface ExistingProductSyncRow {
  product_json: string;
  sync_status: string | null;
}

interface SyncQueueRow {
  id: number;
  operation: ProductSyncOperation;
  local_id: string;
  profile_local_id: string | null;
  platform: string | null;
  payload_json: string | null;
  attempts: number;
}

export interface ProductSyncQueueJob {
  id: number;
  operation: ProductSyncOperation;
  localId: string;
  profileLocalId: string | null;
  platform: string | null;
  payload: SyncAffiliateProductInput | null;
  attempts: number;
}

const DATABASE_NAME = 'kubdee-products.db';
const SCHEMA_VERSION = 1;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function nowMs(): number {
  return Date.now();
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizePlatform(value: string | null | undefined): string | null {
  return normalizeText(value)?.toLowerCase() ?? null;
}

function isShopeeImageUrl(value: string | null | undefined): boolean {
  const url = normalizeText(value);
  if (!url || !url.startsWith('https://')) return false;
  return (
    url.includes('/file/') &&
    (url.includes('susercontent.com') || url.includes('shopee.co.th'))
  );
}

function mergeCloudProductWithLocalImage(
  cloudProduct: AffiliateProduct,
  existingProduct: AffiliateProduct | null
): AffiliateProduct {
  if (
    existingProduct?.imageUrl &&
    !cloudProduct.imageUrl &&
    !cloudProduct.imageR2Key &&
    normalizePlatform(cloudProduct.platform) === 'shopee' &&
    isShopeeImageUrl(existingProduct.imageUrl)
  ) {
    return {
      ...cloudProduct,
      imageUrl: existingProduct.imageUrl,
    };
  }

  return cloudProduct;
}

function toAffiliateProduct(product: SyncAffiliateProductInput): AffiliateProduct {
  const now = nowMs();
  const localCreatedAt = product.localCreatedAt ?? now;
  const localUpdatedAt = product.localUpdatedAt ?? now;

  return {
    id: product.localId,
    userId: '',
    localId: product.localId,
    profileLocalId: product.profileLocalId,
    name: product.name,
    description: product.description ?? null,
    externalProductId: product.externalProductId ?? null,
    productUrl: product.productUrl ?? null,
    price: product.price ?? null,
    stock: product.stock ?? null,
    caption: product.caption ?? null,
    hashtags: product.hashtags ?? null,
    cta: product.cta ?? null,
    imagePath: product.imagePath ?? null,
    imageR2Key: product.imageR2Key ?? null,
    imageUrl: product.imageUrl ?? null,
    imageHash: product.imageHash ?? null,
    imageMimeType: product.imageMimeType ?? null,
    imageSize: product.imageSize ?? null,
    imageUploadedAt: product.imageUploadedAt ?? null,
    platform: product.platform ?? null,
    status: product.status ?? null,
    scrapedAt: product.scrapedAt ?? null,
    localCreatedAt,
    originApp: product.originApp ?? null,
    createdByApp: product.createdByApp ?? null,
    updatedByApp: product.updatedByApp ?? null,
    lastSyncedAt: null,
    createdAt: localCreatedAt,
    updatedAt: localUpdatedAt,
    profileName: null,
    groupLocalId: null,
  };
}

function parseProduct(row: LocalProductRow): AffiliateProduct | null {
  try {
    const product = JSON.parse(row.product_json) as AffiliateProduct;
    return product.localId ? product : null;
  } catch {
    return null;
  }
}

function parseQueueJob(row: SyncQueueRow): ProductSyncQueueJob | null {
  let payload: SyncAffiliateProductInput | null = null;
  if (row.payload_json) {
    try {
      payload = JSON.parse(row.payload_json) as SyncAffiliateProductInput;
    } catch {
      payload = null;
    }
  }

  if (row.operation === 'upsert' && !payload) {
    return null;
  }

  return {
    id: row.id,
    operation: row.operation,
    localId: row.local_id,
    profileLocalId: row.profile_local_id,
    platform: row.platform,
    payload,
    attempts: row.attempts,
  };
}

async function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS affiliate_products (
          local_id TEXT PRIMARY KEY NOT NULL,
          profile_local_id TEXT,
          platform TEXT,
          external_product_id TEXT,
          product_json TEXT NOT NULL,
          sync_status TEXT NOT NULL DEFAULT 'synced',
          deleted_at INTEGER,
          last_synced_at INTEGER,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_affiliate_products_profile
          ON affiliate_products(profile_local_id, platform);

        CREATE INDEX IF NOT EXISTS idx_affiliate_products_external
          ON affiliate_products(profile_local_id, platform, external_product_id);

        CREATE TABLE IF NOT EXISTS product_sync_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          operation TEXT NOT NULL,
          local_id TEXT NOT NULL,
          profile_local_id TEXT,
          platform TEXT,
          payload_json TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          next_attempt_at INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(operation, local_id)
        );

        CREATE INDEX IF NOT EXISTS idx_product_sync_queue_due
          ON product_sync_queue(next_attempt_at, created_at);
      `);
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

async function upsertProductRow(
  db: SQLite.SQLiteDatabase,
  product: AffiliateProduct,
  status: ProductSyncStatus,
  queuePayload?: SyncAffiliateProductInput
): Promise<void> {
  const timestamp = nowMs();
  const platform = normalizePlatform(product.platform);
  const externalProductId = normalizeText(product.externalProductId);
  const profileLocalId = normalizeText(product.profileLocalId);
  const productJson = JSON.stringify({
    ...product,
    platform,
    externalProductId,
    profileLocalId,
    updatedAt: product.updatedAt ?? timestamp,
  });

  await db.runAsync(
    `
      INSERT INTO affiliate_products (
        local_id,
        profile_local_id,
        platform,
        external_product_id,
        product_json,
        sync_status,
        deleted_at,
        last_synced_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
      ON CONFLICT(local_id) DO UPDATE SET
        profile_local_id = excluded.profile_local_id,
        platform = excluded.platform,
        external_product_id = excluded.external_product_id,
        product_json = excluded.product_json,
        sync_status = excluded.sync_status,
        deleted_at = NULL,
        last_synced_at = CASE
          WHEN excluded.sync_status = 'synced' THEN excluded.last_synced_at
          ELSE affiliate_products.last_synced_at
        END,
        updated_at = excluded.updated_at
    `,
    product.localId,
    profileLocalId,
    platform,
    externalProductId,
    productJson,
    status,
    status === 'synced' ? timestamp : product.lastSyncedAt,
    timestamp
  );

  if (queuePayload) {
    await db.runAsync(
      `
        INSERT INTO product_sync_queue (
          operation,
          local_id,
          profile_local_id,
          platform,
          payload_json,
          attempts,
          last_error,
          next_attempt_at,
          created_at,
          updated_at
        )
        VALUES ('upsert', ?, ?, ?, ?, 0, NULL, 0, ?, ?)
        ON CONFLICT(operation, local_id) DO UPDATE SET
          profile_local_id = excluded.profile_local_id,
          platform = excluded.platform,
          payload_json = excluded.payload_json,
          attempts = 0,
          last_error = NULL,
          next_attempt_at = 0,
          updated_at = excluded.updated_at
      `,
      queuePayload.localId,
      normalizeText(queuePayload.profileLocalId),
      normalizePlatform(queuePayload.platform),
      JSON.stringify(queuePayload),
      timestamp,
      timestamp
    );
  }
}

export async function getLocalProducts(options: { profileLocalId?: string } = {}): Promise<AffiliateProduct[]> {
  const db = await openDb();
  const profileLocalId = normalizeText(options.profileLocalId);
  const rows = profileLocalId
    ? await db.getAllAsync<LocalProductRow>(
      `
        SELECT product_json
        FROM affiliate_products
        WHERE deleted_at IS NULL AND profile_local_id = ?
        ORDER BY updated_at DESC
      `,
      profileLocalId
    )
    : await db.getAllAsync<LocalProductRow>(
      `
        SELECT product_json
        FROM affiliate_products
        WHERE deleted_at IS NULL
        ORDER BY updated_at DESC
      `
    );

  return rows.map(parseProduct).filter((product): product is AffiliateProduct => !!product);
}

export async function upsertLocalProductsFromCloud(products: AffiliateProduct[]): Promise<void> {
  const db = await openDb();
  const timestamp = nowMs();
  const remoteIds = new Set(products.map((product) => product.localId).filter(Boolean));

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const product of products) {
      const existing = await txn.getFirstAsync<ExistingProductSyncRow>(
        'SELECT product_json, sync_status FROM affiliate_products WHERE local_id = ? LIMIT 1',
        product.localId
      );
      if (existing?.sync_status?.startsWith('pending_')) {
        continue;
      }

      const existingProduct = existing ? parseProduct(existing) : null;
      const mergedProduct = mergeCloudProductWithLocalImage(product, existingProduct);

      await upsertProductRow(txn, {
        ...mergedProduct,
        lastSyncedAt: timestamp,
      }, 'synced');
    }

    if (remoteIds.size === 0) {
      await txn.runAsync(
        `
          UPDATE affiliate_products
          SET deleted_at = ?, updated_at = ?
          WHERE deleted_at IS NULL AND sync_status = 'synced'
        `,
        timestamp,
        timestamp
      );
      return;
    }

    const cleanRows = await txn.getAllAsync<{ local_id: string }>(
      `
        SELECT local_id
        FROM affiliate_products
        WHERE deleted_at IS NULL AND sync_status = 'synced'
      `
    );

    for (const row of cleanRows) {
      if (remoteIds.has(row.local_id)) continue;
      await txn.runAsync(
        `
          UPDATE affiliate_products
          SET deleted_at = ?, updated_at = ?
          WHERE local_id = ? AND sync_status = 'synced'
        `,
        timestamp,
        timestamp,
        row.local_id
      );
    }
  });
}

export async function upsertLocalProductsForSync(products: SyncAffiliateProductInput[]): Promise<AffiliateProduct[]> {
  if (products.length === 0) return [];

  const db = await openDb();
  const localProducts = products.map(toAffiliateProduct);

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (let index = 0; index < products.length; index += 1) {
      await upsertProductRow(txn, localProducts[index], 'pending_upsert', products[index]);
    }
  });

  return localProducts;
}

export async function markProductsDeletedForSync(localIds: string[]): Promise<void> {
  if (localIds.length === 0) return;

  const db = await openDb();
  const timestamp = nowMs();

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const localId of localIds) {
      const row = await txn.getFirstAsync<{
        profile_local_id: string | null;
        platform: string | null;
      }>(
        'SELECT profile_local_id, platform FROM affiliate_products WHERE local_id = ? LIMIT 1',
        localId
      );

      await txn.runAsync(
        `
          UPDATE affiliate_products
          SET sync_status = 'pending_delete',
              deleted_at = ?,
              updated_at = ?
          WHERE local_id = ?
        `,
        timestamp,
        timestamp,
        localId
      );

      await txn.runAsync(
        `
          INSERT INTO product_sync_queue (
            operation,
            local_id,
            profile_local_id,
            platform,
            payload_json,
            attempts,
            last_error,
            next_attempt_at,
            created_at,
            updated_at
          )
          VALUES ('delete', ?, ?, ?, NULL, 0, NULL, 0, ?, ?)
          ON CONFLICT(operation, local_id) DO UPDATE SET
            profile_local_id = excluded.profile_local_id,
            platform = excluded.platform,
            attempts = 0,
            last_error = NULL,
            next_attempt_at = 0,
            updated_at = excluded.updated_at
        `,
        localId,
        row?.profile_local_id ?? null,
        row?.platform ?? null,
        timestamp,
        timestamp
      );
    }
  });
}

export async function getDueProductSyncJobs(limit = 100): Promise<ProductSyncQueueJob[]> {
  const db = await openDb();
  const rows = await db.getAllAsync<SyncQueueRow>(
    `
      SELECT id, operation, local_id, profile_local_id, platform, payload_json, attempts
      FROM product_sync_queue
      WHERE next_attempt_at <= ?
      ORDER BY created_at ASC
      LIMIT ?
    `,
    nowMs(),
    limit
  );

  return rows.map(parseQueueJob).filter((job): job is ProductSyncQueueJob => !!job);
}

export async function markUpsertJobsSynced(jobIds: number[], localIds: string[]): Promise<void> {
  if (jobIds.length === 0) return;

  const db = await openDb();
  const timestamp = nowMs();

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const localId of localIds) {
      await txn.runAsync(
        `
          UPDATE affiliate_products
          SET sync_status = 'synced',
              last_synced_at = ?,
              updated_at = ?
          WHERE local_id = ? AND sync_status = 'pending_upsert'
        `,
        timestamp,
        timestamp,
        localId
      );
    }

    for (const jobId of jobIds) {
      await txn.runAsync('DELETE FROM product_sync_queue WHERE id = ?', jobId);
    }
  });
}

export async function markDeleteJobsSynced(jobIds: number[]): Promise<void> {
  if (jobIds.length === 0) return;

  const db = await openDb();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const jobId of jobIds) {
      await txn.runAsync('DELETE FROM product_sync_queue WHERE id = ?', jobId);
    }
  });
}

export async function markSyncJobsFailed(jobIds: number[], error: string): Promise<void> {
  if (jobIds.length === 0) return;

  const db = await openDb();
  const timestamp = nowMs();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const jobId of jobIds) {
      await txn.runAsync(
        `
          UPDATE product_sync_queue
          SET attempts = attempts + 1,
              last_error = ?,
              next_attempt_at = ?,
              updated_at = ?
          WHERE id = ?
        `,
        error,
        timestamp + 30_000,
        timestamp,
        jobId
      );
    }
  });
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { useAuth } from '@/auth/AuthContext';
import { getOrCreateSyncDeviceId, getStoredAuthTokens } from '@/auth/storage';
import { deleteAffiliateProducts, fetchAffiliateProducts, syncAffiliateProducts } from '@/library/api';
import type { SyncAffiliateProductInput } from '@/library/api';
import {
  getDueProductSyncJobs,
  getLocalProducts,
  markDeleteJobsSynced,
  markProductsDeletedForSync,
  markSyncJobsFailed,
  markUpsertJobsSynced,
  upsertLocalProductsForSync,
  upsertLocalProductsFromCloud,
} from '@/library/localProductDb';
import type { AffiliateProduct } from '@/library/types';

export interface ProductSyncResult {
  success: boolean;
  count: number;
  error: string | null;
}

export interface ProductDeleteResult {
  success: boolean;
  /** Rows the server actually tombstoned — may be < requested (already deleted / unknown localId). */
  deleted: number;
  requested: number;
  error: string | null;
}

export interface ShopeeImportProductInput {
  name: string;
  price?: string | null;
  stock?: number | null;
  productUrl?: string | null;
  externalProductId?: string | null;
  imageUrl?: string | null;
  status?: string | null;
  scrapedAt?: number | null;
}

export interface ProductImportResult {
  success: boolean;
  imported: number;
  queued: number;
  skippedDeleted: number;
  skippedStale: number;
  restoredDeleted: number;
  error: string | null;
}

interface QueueSyncResult {
  success: boolean;
  status: number | null;
  synced: number;
  deleted: number;
  skippedDeleted: number;
  skippedStale: number;
  restoredDeleted: number;
  error: string | null;
}

interface LibraryContextType {
  products: AffiliateProduct[];
  isSyncing: boolean;
  lastSyncedAt: number | null;
  syncError: string | null;
  /** Resolves with the sync outcome, or null when skipped (no token / already syncing). */
  syncProducts: () => Promise<ProductSyncResult | null>;
  /** Import products scraped on-device from Shopee liked items and push them to Cloud. */
  importShopeeProducts: (
    profileLocalId: string,
    products: ShopeeImportProductInput[]
  ) => Promise<ProductImportResult | null>;
  /** Resolves with the delete outcome, or null when skipped (no token / empty / already deleting). */
  deleteProducts: (localIds: string[]) => Promise<ProductDeleteResult | null>;
}

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizePrice(value: string | null | undefined): string | null {
  const cleaned = cleanText(value)?.replace(/[^\d.]/g, '');
  if (!cleaned) {
    return null;
  }

  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? String(numeric) : cleaned;
}

function normalizePlatform(value: string | null | undefined): string {
  return value?.trim().toLowerCase() || '';
}

function toNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function extractShopeeProductIdFromUrl(value: string | null | undefined): string | null {
  const raw = cleanText(value);
  if (!raw) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (!/(^|\.)shopee\./i.test(url.hostname)) {
    return null;
  }

  const shopId =
    url.searchParams.get('shopid') ||
    url.searchParams.get('shop_id') ||
    url.searchParams.get('shopId');
  const itemId =
    url.searchParams.get('itemid') ||
    url.searchParams.get('item_id') ||
    url.searchParams.get('itemId');
  if (shopId && itemId && /^\d+$/.test(shopId) && /^\d+$/.test(itemId)) {
    return `shopee:${shopId}:${itemId}`;
  }

  const path = decodeURIComponent(url.pathname || '');
  const haystack = `${path}/`;
  const patterns = [
    /\/product\/(\d{4,})\/(\d{4,})(?:$|[/?#])/i,
    /(?:^|\/)(\d{4,})\/(\d{4,})(?:$|[/?#])/i,
    /(?:^|[./-])i\.(\d{4,})\.(\d{4,})(?:$|[/?#])/i,
  ];

  for (const pattern of patterns) {
    const match = haystack.match(pattern);
    if (match) {
      return `shopee:${match[1]}:${match[2]}`;
    }
  }

  return null;
}

function productExternalKey(
  profileLocalId: string | null | undefined,
  platform: string | null | undefined,
  externalProductId: string | null | undefined
): string | null {
  const profile = cleanText(profileLocalId);
  const productId = cleanText(externalProductId);
  if (!profile || !productId) {
    return null;
  }

  return `${profile}\u0000${normalizePlatform(platform)}\u0000${productId}`;
}

function getExistingShopeeProduct(
  localId: string,
  profileLocalId: string,
  externalProductId: string | null,
  existingByLocalId: Map<string, AffiliateProduct>,
  existingByExternalKey: Map<string, AffiliateProduct>
): AffiliateProduct | null {
  const byLocalId = existingByLocalId.get(localId);
  if (byLocalId) {
    return byLocalId;
  }

  const externalKey = productExternalKey(profileLocalId, 'shopee', externalProductId);
  return externalKey ? existingByExternalKey.get(externalKey) ?? null : null;
}

function preserveExistingProductFields(
  payload: SyncAffiliateProductInput,
  existing: AffiliateProduct | null,
  fallbackCreatedAt: number
): SyncAffiliateProductInput {
  if (!existing) {
    return payload;
  }

  return {
    ...payload,
    localId: existing.localId || payload.localId,
    description: existing.description,
    caption: existing.caption,
    hashtags: existing.hashtags,
    cta: existing.cta,
    imagePath: existing.imagePath ?? payload.imagePath,
    imageR2Key: existing.imageR2Key ?? payload.imageR2Key,
    imageUrl: existing.imageUrl ?? payload.imageUrl,
    imageHash: existing.imageHash ?? payload.imageHash,
    imageMimeType: existing.imageMimeType ?? payload.imageMimeType,
    imageSize: existing.imageSize ?? payload.imageSize,
    imageUploadedAt: toNumber(existing.imageUploadedAt) ?? payload.imageUploadedAt,
    localCreatedAt: toNumber(existing.localCreatedAt) ?? fallbackCreatedAt,
  };
}

function toShopeeSyncProducts(
  profileLocalId: string,
  products: ShopeeImportProductInput[],
  deviceId: string,
  existingProducts: AffiliateProduct[] = []
): SyncAffiliateProductInput[] {
  const now = Date.now();
  const seen = new Set<string>();
  const syncProducts: SyncAffiliateProductInput[] = [];
  const existingByLocalId = new Map(existingProducts.map((product) => [product.localId, product]));
  const existingByExternalKey = new Map<string, AffiliateProduct>();

  for (const product of existingProducts) {
    const key = productExternalKey(product.profileLocalId, product.platform, product.externalProductId);
    if (key && !existingByExternalKey.has(key)) {
      existingByExternalKey.set(key, product);
    }
  }

  for (const product of products) {
    const name = cleanText(product.name);
    if (!name) {
      continue;
    }

    const productUrl = cleanText(product.productUrl);
    const externalProductId =
      cleanText(product.externalProductId) || extractShopeeProductIdFromUrl(productUrl);
    const imageUrl = cleanText(product.imageUrl);
    const price = normalizePrice(product.price);
    const identity = externalProductId || productUrl || `${name}\u0000${price ?? ''}`;
    const localId = `mobile-shopee-${profileLocalId}-${hashString(identity)}`;

    if (seen.has(localId)) {
      continue;
    }
    seen.add(localId);

    const existingProduct = getExistingShopeeProduct(
      localId,
      profileLocalId,
      externalProductId,
      existingByLocalId,
      existingByExternalKey
    );
    const payload = preserveExistingProductFields({
      localId,
      profileLocalId,
      name,
      externalProductId,
      productUrl,
      price,
      stock: typeof product.stock === 'number' && Number.isFinite(product.stock) ? product.stock : null,
      imageUrl,
      platform: 'shopee',
      status: cleanText(product.status) || 'liked',
      scrapedAt: typeof product.scrapedAt === 'number' ? product.scrapedAt : now,
      localCreatedAt: now,
      localUpdatedAt: now,
      originApp: 'mobile',
      originDeviceId: deviceId,
      createdByApp: 'mobile',
      sourceDeviceId: deviceId,
      updatedByApp: 'mobile',
    }, existingProduct, now);

    syncProducts.push(payload);
  }

  return syncProducts;
}

function mergeProductsByLocalId(products: AffiliateProduct[]): AffiliateProduct[] {
  const byLocalId = new Map<string, AffiliateProduct>();
  for (const product of products) {
    if (!product.localId) continue;
    byLocalId.set(product.localId, product);
  }
  return Array.from(byLocalId.values());
}

function dedupeQueuePayloads(products: SyncAffiliateProductInput[]): SyncAffiliateProductInput[] {
  const byLocalId = new Map<string, SyncAffiliateProductInput>();
  for (const product of products) {
    byLocalId.set(product.localId, product);
  }
  return Array.from(byLocalId.values());
}

async function flushPendingProductSyncQueue(token: string): Promise<QueueSyncResult> {
  const jobs = await getDueProductSyncJobs(200);
  if (jobs.length === 0) {
    return {
      deleted: 0,
      error: null,
      restoredDeleted: 0,
      skippedDeleted: 0,
      skippedStale: 0,
      status: null,
      success: true,
      synced: 0,
    };
  }

  let deleted = 0;
  let synced = 0;
  let skippedDeleted = 0;
  let skippedStale = 0;
  let restoredDeleted = 0;

  const deleteJobs = jobs.filter((job) => job.operation === 'delete');
  if (deleteJobs.length > 0) {
    const localIds = Array.from(new Set(deleteJobs.map((job) => job.localId)));
    const result = await deleteAffiliateProducts(token, localIds);
    if (!result.ok) {
      const message = result.error || 'ลบสินค้าใน cloud ไม่สำเร็จ';
      if (result.status !== 401) {
        await markSyncJobsFailed(deleteJobs.map((job) => job.id), message);
      }
      return {
        deleted,
        error: message,
        restoredDeleted,
        skippedDeleted,
        skippedStale,
        status: result.status,
        success: false,
        synced,
      };
    }

    deleted += result.data?.deleted ?? 0;
    await markDeleteJobsSynced(deleteJobs.map((job) => job.id));
  }

  const upsertJobs = jobs.filter((job) => job.operation === 'upsert' && job.payload);
  if (upsertJobs.length > 0) {
    const payloadProducts = dedupeQueuePayloads(
      upsertJobs
        .map((job) => job.payload)
        .filter((payload): payload is SyncAffiliateProductInput => !!payload)
    );
    const deviceId = await getOrCreateSyncDeviceId();
    const result = await syncAffiliateProducts(token, {
      deviceId,
      products: payloadProducts,
      restoreDeleted: true,
    });

    if (!result.ok) {
      const message = result.error || 'ซิงก์สินค้าใน cloud ไม่สำเร็จ';
      if (result.status !== 401) {
        await markSyncJobsFailed(upsertJobs.map((job) => job.id), message);
      }
      return {
        deleted,
        error: message,
        restoredDeleted,
        skippedDeleted,
        skippedStale,
        status: result.status,
        success: false,
        synced,
      };
    }

    synced += result.data?.products ?? payloadProducts.length;
    skippedDeleted += result.data?.skippedDeleted ?? 0;
    skippedStale += result.data?.skippedStale ?? 0;
    restoredDeleted += result.data?.restoredDeleted ?? 0;
    await markUpsertJobsSynced(
      upsertJobs.map((job) => job.id),
      payloadProducts.map((product) => product.localId)
    );
  }

  return {
    deleted,
    error: null,
    restoredDeleted,
    skippedDeleted,
    skippedStale,
    status: null,
    success: true,
    synced,
  };
}

export function LibraryProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { token, isPlanValid, recheckPlan } = useAuth();
  const [products, setProducts] = useState<AffiliateProduct[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const isSyncingRef = useRef(false);
  const isDeletingRef = useRef(false);

  const refreshLocalProducts = useCallback(async (): Promise<AffiliateProduct[]> => {
    const localProducts = await getLocalProducts();
    setProducts(localProducts);
    return localProducts;
  }, []);

  const syncProducts = useCallback(async (): Promise<ProductSyncResult | null> => {
    if (!token) {
      await refreshLocalProducts();
      return null;
    }

    if (isSyncingRef.current) {
      return null;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      let activeToken = token;
      let queueResult = await flushPendingProductSyncQueue(activeToken);
      if (!queueResult.success && queueResult.status === 401) {
        await recheckPlan();
        const refreshedTokens = await getStoredAuthTokens();
        if (refreshedTokens?.accessToken && refreshedTokens.accessToken !== token) {
          activeToken = refreshedTokens.accessToken;
          queueResult = await flushPendingProductSyncQueue(activeToken);
        }
      }

      let result = await fetchAffiliateProducts(activeToken);

      if (!result.ok && result.status === 401) {
        await recheckPlan();
        const refreshedTokens = await getStoredAuthTokens();
        if (refreshedTokens?.accessToken && refreshedTokens.accessToken !== token) {
          activeToken = refreshedTokens.accessToken;
          result = await fetchAffiliateProducts(activeToken);
        }
      }

      if (result.ok && result.data) {
        await upsertLocalProductsFromCloud(result.data);
        const localProducts = await refreshLocalProducts();
        const error = queueResult.success ? null : queueResult.error;
        setSyncError(error);
        setLastSyncedAt(Date.now());
        return { count: localProducts.length, error, success: queueResult.success };
      }

      const message = result.error || 'ซิงก์คลังสินค้าไม่สำเร็จ';
      await refreshLocalProducts();
      setSyncError(message);
      return { count: 0, error: message, success: false };
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [recheckPlan, refreshLocalProducts, token]);

  const importShopeeProducts = useCallback(
    async (
      profileLocalId: string,
      importedProducts: ShopeeImportProductInput[]
    ): Promise<ProductImportResult | null> => {
      const cleanProfileLocalId = profileLocalId.trim();
      if (!cleanProfileLocalId || importedProducts.length === 0) {
        return null;
      }

      const localExistingProducts = await getLocalProducts({ profileLocalId: cleanProfileLocalId });
      const existingProducts = mergeProductsByLocalId([
        ...localExistingProducts,
        ...products.filter((product) => product.profileLocalId === cleanProfileLocalId),
      ]);
      const deviceId = await getOrCreateSyncDeviceId();
      const syncPayloadProducts = toShopeeSyncProducts(
        cleanProfileLocalId,
        importedProducts,
        deviceId,
        existingProducts
      );

      if (syncPayloadProducts.length === 0) {
        return {
          error: 'ไม่พบข้อมูลสินค้าที่นำเข้าได้',
          imported: 0,
          queued: 0,
          restoredDeleted: 0,
          skippedDeleted: 0,
          skippedStale: 0,
          success: false,
        };
      }

      const localProducts = await upsertLocalProductsForSync(syncPayloadProducts);
      await refreshLocalProducts();

      let queueResult: QueueSyncResult = {
        deleted: 0,
        error: null,
        restoredDeleted: 0,
        skippedDeleted: 0,
        skippedStale: 0,
        status: null,
        success: true,
        synced: 0,
      };

      if (!token || isSyncingRef.current) {
        setSyncError(token ? 'บันทึกไว้ในเครื่องแล้ว รอซิงก์ขึ้น cloud' : 'บันทึกไว้ในเครื่องแล้ว รอเข้าสู่ระบบเพื่อซิงก์ cloud');
        return {
          error: null,
          imported: localProducts.length,
          queued: syncPayloadProducts.length,
          restoredDeleted: 0,
          skippedDeleted: 0,
          skippedStale: 0,
          success: true,
        };
      }

      isSyncingRef.current = true;
      setIsSyncing(true);
      try {
        let activeToken = token;
        queueResult = await flushPendingProductSyncQueue(activeToken);
        if (!queueResult.success && queueResult.status === 401) {
          await recheckPlan();
          const refreshedTokens = await getStoredAuthTokens();
          if (refreshedTokens?.accessToken && refreshedTokens.accessToken !== token) {
            activeToken = refreshedTokens.accessToken;
            queueResult = await flushPendingProductSyncQueue(activeToken);
          }
        }

        if (queueResult.success) {
          setSyncError(null);
          setLastSyncedAt(Date.now());
          await refreshLocalProducts();
        } else {
          setSyncError(queueResult.error || 'บันทึกในเครื่องแล้ว แต่ซิงก์ cloud ยังไม่สำเร็จ');
        }
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }

      return {
        error: null,
        imported: localProducts.length,
        queued: queueResult.success ? 0 : syncPayloadProducts.length,
        restoredDeleted: queueResult.restoredDeleted,
        skippedDeleted: queueResult.skippedDeleted,
        skippedStale: queueResult.skippedStale,
        success: true,
      };
    },
    [products, recheckPlan, refreshLocalProducts, token]
  );

  const deleteProducts = useCallback(
    async (localIds: string[]): Promise<ProductDeleteResult | null> => {
      if (localIds.length === 0 || isDeletingRef.current) {
        return null;
      }

      isDeletingRef.current = true;
      let startedQueueSync = false;

      try {
        await markProductsDeletedForSync(localIds);
        await refreshLocalProducts();

        if (!token || isSyncingRef.current) {
          setSyncError(token ? 'ลบในเครื่องแล้ว รอซิงก์ cloud' : 'ลบในเครื่องแล้ว รอเข้าสู่ระบบเพื่อซิงก์ cloud');
          return {
            deleted: localIds.length,
            error: null,
            requested: localIds.length,
            success: true,
          };
        }

        isSyncingRef.current = true;
        startedQueueSync = true;
        setIsSyncing(true);
        let queueResult = await flushPendingProductSyncQueue(token);
        if (!queueResult.success && queueResult.status === 401) {
          await recheckPlan();
          const refreshedTokens = await getStoredAuthTokens();
          if (refreshedTokens?.accessToken && refreshedTokens.accessToken !== token) {
            queueResult = await flushPendingProductSyncQueue(refreshedTokens.accessToken);
          }
        }
        isSyncingRef.current = false;
        setIsSyncing(false);

        if (!queueResult.success) {
          setSyncError(queueResult.error || 'ลบในเครื่องแล้ว แต่ซิงก์ cloud ยังไม่สำเร็จ');
        } else {
          setSyncError(null);
          setLastSyncedAt(Date.now());
        }

        return {
          deleted: localIds.length,
          error: null,
          requested: localIds.length,
          success: true,
        };
      } finally {
        if (startedQueueSync) {
          isSyncingRef.current = false;
          setIsSyncing(false);
        }
        isDeletingRef.current = false;
      }
    },
    [recheckPlan, refreshLocalProducts, token]
  );

  // Reset library state on logout (mirrors resetAuthState in AuthContext).
  useEffect(() => {
    if (token) {
      return;
    }

    setProducts([]);
    setSyncError(null);
    setLastSyncedAt(null);
  }, [token]);

  useEffect(() => {
    if (!token || !isPlanValid) {
      return;
    }

    let cancelled = false;
    getLocalProducts()
      .then((localProducts) => {
        if (!cancelled) {
          setProducts(localProducts);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProducts([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isPlanValid, token]);

  const hasAttemptedSync = lastSyncedAt !== null || syncError !== null;

  // Pull once per session when authenticated with a valid plan
  // (same bootstrap style as the initial profile sync in KubdeeMobileApp).
  useEffect(() => {
    if (!token || !isPlanValid || isSyncing || hasAttemptedSync) {
      return;
    }

    void syncProducts();
  }, [hasAttemptedSync, isPlanValid, isSyncing, syncProducts, token]);

  const value = useMemo(
    () => ({
      deleteProducts,
      importShopeeProducts,
      products,
      isSyncing,
      lastSyncedAt,
      syncError,
      syncProducts,
    }),
    [deleteProducts, importShopeeProducts, isSyncing, lastSyncedAt, products, syncError, syncProducts]
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextType {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error('useLibrary must be used within LibraryProvider');
  }

  return context;
}

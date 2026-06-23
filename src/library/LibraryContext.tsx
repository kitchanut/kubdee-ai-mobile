import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { useAuth } from '@/auth/AuthContext';
import { getOrCreateSyncDeviceId, getStoredAuthTokens } from '@/auth/storage';
import { deleteAffiliateProducts, fetchAffiliateProducts, syncAffiliateProducts } from '@/library/api';
import type { SyncAffiliateProductInput } from '@/library/api';
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
    description: existing.description,
    caption: existing.caption,
    hashtags: existing.hashtags,
    cta: existing.cta,
    imagePath: existing.imagePath,
    imageR2Key: existing.imageR2Key,
    imageUrl: existing.imageUrl,
    imageHash: existing.imageHash,
    imageMimeType: existing.imageMimeType,
    imageSize: existing.imageSize,
    imageUploadedAt: toNumber(existing.imageUploadedAt),
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

export function LibraryProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { token, isPlanValid, recheckPlan } = useAuth();
  const [products, setProducts] = useState<AffiliateProduct[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const isSyncingRef = useRef(false);
  const isDeletingRef = useRef(false);

  const syncProducts = useCallback(async (): Promise<ProductSyncResult | null> => {
    if (!token || isSyncingRef.current) {
      return null;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      let result = await fetchAffiliateProducts(token);

      if (!result.ok && result.status === 401) {
        // Same refresh path as the rest of the app: recheckPlan() verifies the
        // session via verifyTokens (refreshing the access token on 401 and
        // persisting it to secure storage, or clearing auth state when the
        // refresh fails). Retry once with the refreshed token from storage.
        await recheckPlan();
        const refreshedTokens = await getStoredAuthTokens();
        if (refreshedTokens?.accessToken && refreshedTokens.accessToken !== token) {
          result = await fetchAffiliateProducts(refreshedTokens.accessToken);
        }
      }

      if (result.ok && result.data) {
        setProducts(result.data);
        setSyncError(null);
        setLastSyncedAt(Date.now());
        return { count: result.data.length, error: null, success: true };
      }

      const message = result.error || 'ซิงก์คลังสินค้าไม่สำเร็จ';
      setSyncError(message);
      return { count: 0, error: message, success: false };
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [recheckPlan, token]);

  const importShopeeProducts = useCallback(
    async (
      profileLocalId: string,
      importedProducts: ShopeeImportProductInput[]
    ): Promise<ProductImportResult | null> => {
      const cleanProfileLocalId = profileLocalId.trim();
      if (!token || !cleanProfileLocalId || importedProducts.length === 0 || isSyncingRef.current) {
        return null;
      }

      isSyncingRef.current = true;
      setIsSyncing(true);

      try {
        let activeToken = token;
        let existingProducts = products.filter((product) => product.profileLocalId === cleanProfileLocalId);
        let existingResult = await fetchAffiliateProducts(activeToken, { profileLocalId: cleanProfileLocalId });

        if (!existingResult.ok && existingResult.status === 401) {
          await recheckPlan();
          const refreshedTokens = await getStoredAuthTokens();
          if (refreshedTokens?.accessToken && refreshedTokens.accessToken !== token) {
            activeToken = refreshedTokens.accessToken;
            existingResult = await fetchAffiliateProducts(activeToken, { profileLocalId: cleanProfileLocalId });
          }
        }

        if (existingResult.ok && existingResult.data) {
          existingProducts = existingResult.data;
        }

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
            restoredDeleted: 0,
            skippedDeleted: 0,
            skippedStale: 0,
            success: false,
          };
        }

        let result = await syncAffiliateProducts(activeToken, {
          deviceId,
          products: syncPayloadProducts,
          restoreDeleted: true,
        });

        if (!result.ok && result.status === 401) {
          await recheckPlan();
          const refreshedTokens = await getStoredAuthTokens();
          if (refreshedTokens?.accessToken && refreshedTokens.accessToken !== token) {
            activeToken = refreshedTokens.accessToken;
            result = await syncAffiliateProducts(activeToken, {
              deviceId,
              products: syncPayloadProducts,
              restoreDeleted: true,
            });
          }
        }

        if (result.ok && result.data) {
          const pullResult = await fetchAffiliateProducts(activeToken);
          if (pullResult.ok && pullResult.data) {
            setProducts(pullResult.data);
            setSyncError(null);
            setLastSyncedAt(Date.now());
          } else {
            setSyncError(pullResult.error || 'นำเข้าสำเร็จ แต่โหลดคลังล่าสุดไม่สำเร็จ');
          }

          return {
            error: null,
            imported: result.data.products,
            restoredDeleted: result.data.restoredDeleted,
            skippedDeleted: result.data.skippedDeleted,
            skippedStale: result.data.skippedStale,
            success: true,
          };
        }

        const message = result.error || 'นำเข้าสินค้า Shopee ไม่สำเร็จ';
        setSyncError(message);
        return {
          error: message,
          imported: 0,
          restoredDeleted: 0,
          skippedDeleted: 0,
          skippedStale: 0,
          success: false,
        };
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    },
    [products, recheckPlan, token]
  );

  const deleteProducts = useCallback(
    async (localIds: string[]): Promise<ProductDeleteResult | null> => {
      if (!token || localIds.length === 0 || isDeletingRef.current) {
        return null;
      }

      isDeletingRef.current = true;

      // Optimistic remove; snapshot kept so a failed request can roll back
      // (re-fetching instead would leave the optimistic state behind offline).
      const previousProducts = products;
      const removedIds = new Set(localIds);
      setProducts((current) => current.filter((product) => !removedIds.has(product.localId)));

      try {
        let result = await deleteAffiliateProducts(token, localIds);

        if (!result.ok && result.status === 401) {
          // Same refresh path as syncProducts; DELETE is idempotent on the
          // server (tombstones), so resending the full id list is safe.
          await recheckPlan();
          const refreshedTokens = await getStoredAuthTokens();
          if (refreshedTokens?.accessToken && refreshedTokens.accessToken !== token) {
            result = await deleteAffiliateProducts(refreshedTokens.accessToken, localIds);
          }
        }

        if (result.ok && result.data) {
          // Confirm against the server (also reconciles partial success where
          // deleted < requested, e.g. rows already tombstoned by another app).
          void syncProducts();
          return {
            deleted: result.data.deleted,
            error: null,
            requested: result.data.requested,
            success: true,
          };
        }

        setProducts(previousProducts);
        return {
          deleted: 0,
          error: result.error || 'ลบสินค้าไม่สำเร็จ',
          requested: localIds.length,
          success: false,
        };
      } finally {
        isDeletingRef.current = false;
      }
    },
    [products, recheckPlan, syncProducts, token]
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

  const hasAttemptedSync = lastSyncedAt !== null || syncError !== null;

  // Pull once per session when authenticated with a valid plan
  // (same bootstrap style as the initial profile sync in KubdeeMobileApp).
  useEffect(() => {
    if (!token || !isPlanValid || isSyncing || hasAttemptedSync || products.length > 0) {
      return;
    }

    void syncProducts();
  }, [hasAttemptedSync, isPlanValid, isSyncing, products.length, syncProducts, token]);

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

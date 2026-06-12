import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { useAuth } from '@/auth/AuthContext';
import { getStoredAuthTokens } from '@/auth/storage';
import { deleteAffiliateProducts, fetchAffiliateProducts } from '@/library/api';
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

interface LibraryContextType {
  products: AffiliateProduct[];
  isSyncing: boolean;
  lastSyncedAt: number | null;
  syncError: string | null;
  /** Resolves with the sync outcome, or null when skipped (no token / already syncing). */
  syncProducts: () => Promise<ProductSyncResult | null>;
  /** Resolves with the delete outcome, or null when skipped (no token / empty / already deleting). */
  deleteProducts: (localIds: string[]) => Promise<ProductDeleteResult | null>;
}

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

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
      products,
      isSyncing,
      lastSyncedAt,
      syncError,
      syncProducts,
    }),
    [deleteProducts, isSyncing, lastSyncedAt, products, syncError, syncProducts]
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

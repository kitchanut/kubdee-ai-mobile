import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { useAuth } from '@/auth/AuthContext';
import { getStoredAuthTokens } from '@/auth/storage';
import { fetchAffiliateProducts } from '@/library/api';
import type { AffiliateProduct } from '@/library/types';

interface LibraryContextType {
  products: AffiliateProduct[];
  isSyncing: boolean;
  lastSyncedAt: number | null;
  syncError: string | null;
  syncProducts: () => Promise<void>;
}

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

export function LibraryProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { token, isPlanValid, recheckPlan } = useAuth();
  const [products, setProducts] = useState<AffiliateProduct[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const isSyncingRef = useRef(false);

  const syncProducts = useCallback(async (): Promise<void> => {
    if (!token || isSyncingRef.current) {
      return;
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
        return;
      }

      setSyncError(result.error || 'ซิงก์คลังสินค้าไม่สำเร็จ');
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [recheckPlan, token]);

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
      products,
      isSyncing,
      lastSyncedAt,
      syncError,
      syncProducts,
    }),
    [isSyncing, lastSyncedAt, products, syncError, syncProducts]
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

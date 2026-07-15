import { useCallback, useEffect, useRef } from 'react';

import type {
  ProductImportOptions,
  ProductImportResult,
  ShopeeImportProductInput,
} from '@/library/LibraryContext';
import { getLocalProducts } from '@/library/localProductDb';
import type { AffiliateProduct } from '@/library/types';
import {
  clearPendingShopeeImportProducts,
  getPendingShopeeImportProducts,
  subscribeShopeeImportProducts,
} from '@/native/AccessibilityBridge';
import type { NativeShopeeImportProduct } from '@/native/AccessibilityBridge';

type AppendLog = (message: string, ts?: number) => void;
type ImportShopeeProducts = (
  profileLocalId: string,
  products: ShopeeImportProductInput[],
  options?: ProductImportOptions
) => Promise<ProductImportResult | null>;

interface UseShopeeIncrementalProductSaverOptions {
  selectedProfileId: string;
  importShopeeProducts: ImportShopeeProducts;
  appendLog: AppendLog;
  onProductsChanged?: () => Promise<unknown> | unknown;
}

type ProfileAwareShopeeProduct = ShopeeImportProductInput & {
  profileLocalId?: string | null;
};

type QueuedShopeeProduct = {
  key: string;
  product: ProfileAwareShopeeProduct;
};

const PRODUCT_SAVE_BATCH_SIZE = 20;
const PRODUCT_SAVE_BATCH_DELAY_MS = 1500;

function cleanText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function productKey(product: ProfileAwareShopeeProduct): string {
  const profileLocalId = cleanText(product.profileLocalId);
  const externalProductId = cleanText(product.externalProductId);
  const productUrl = cleanText(product.productUrl);
  const identity = externalProductId || productUrl || `${cleanText(product.name)}\u0000${cleanText(product.price)}`;
  return profileLocalId ? `${profileLocalId}\u0000${identity}` : identity;
}

function shortProductName(product: ProfileAwareShopeeProduct): string {
  return cleanText(product.name).slice(0, 34) || 'สินค้า Shopee';
}

function describeIncomingImageSource(product: ProfileAwareShopeeProduct): string {
  const imagePath = cleanText(product.imagePath);
  const imageUrl = cleanText(product.imageUrl);
  const source = imagePath || imageUrl;
  if (!source) return 'ไม่มีรูป';
  if (source.startsWith('content://')) return `${imagePath ? 'imagePath' : 'imageUrl'}=content`;
  if (source.startsWith('file://')) return `${imagePath ? 'imagePath' : 'imageUrl'}=file`;
  if (/^https?:\/\//i.test(source)) return `${imagePath ? 'imagePath' : 'imageUrl'}=http`;
  if (source.startsWith('data:image/')) return `${imagePath ? 'imagePath' : 'imageUrl'}=data`;
  return `${imagePath ? 'imagePath' : 'imageUrl'}=ไม่รองรับ`;
}

function isLikelyShopeeProduct(product: ProfileAwareShopeeProduct): boolean {
  const name = cleanText(product.name);
  if (name.length < 6) return false;

  const compactName = name.replace(/\s+/g, '').toLowerCase();
  const blockedExact = ['ขายดี'];
  if (blockedExact.includes(compactName)) return false;

  const blockedFragments = [
    'ช้อปปี้ถูกชัวร์',
    'ถูกชัวร์',
    'spaylater',
    'payday',
    'flashsale',
    'โค้ดลด',
    'ส่วนลด',
    'เช็คอิน',
    'ซื้อเลย',
    'หน้าแรก',
    'สิ่งที่ฉันถูกใจ',
    'มีบริการติดตั้ง',
  ];
  if (blockedFragments.some((fragment) => compactName.includes(fragment.replace(/\s+/g, '').toLowerCase()))) {
    return false;
  }

  // แบนเนอร์โปรโมชั่น เช่น "โปรโมชั่นลูกค้าที่คิดถึง ลด 92%" ไม่ใช่สินค้า
  // ห้ามใช้แค่ 'ลด' เพราะชื่อสินค้าจริงมีคำนี้ได้ (ลดราคา, ครีมลดสิว)
  if (/^โปรโมชั่น/.test(name)) return false;
  // "ลด NN%" ในข้อความสั้นๆ = badge ส่วนลด ส่วนชื่อสินค้าจริงที่มีส่วนลดจะยาวกว่านี้เสมอ
  if (/(^|\s)ลด\s*\d{1,3}\s*%/.test(name) && name.length < 40) return false;

  return /[ก-๙A-Za-z]/.test(name);
}

export function useShopeeIncrementalProductSaver({
  selectedProfileId,
  importShopeeProducts,
  appendLog,
  onProductsChanged,
}: UseShopeeIncrementalProductSaverOptions) {
  const activeRef = useRef(false);
  const selectedProfileIdRef = useRef(selectedProfileId);
  const sessionProfileIdRef = useRef('');
  const queuedKeysRef = useRef<Set<string>>(new Set());
  const savedKeysRef = useRef<Set<string>>(new Set());
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRecoveryRef = useRef<Promise<number> | null>(null);
  const pendingProductBatchesRef = useRef<Map<string, QueuedShopeeProduct[]>>(new Map());
  const existingProductsByProfileRef = useRef<Map<string, AffiliateProduct[]>>(new Map());
  const existingProductsLoadByProfileRef = useRef<Map<string, Promise<AffiliateProduct[]>>>(new Map());
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    selectedProfileIdRef.current = selectedProfileId;
  }, [selectedProfileId]);

  const resolveProductProfileId = useCallback((product: ProfileAwareShopeeProduct): string => {
    return (
      cleanText(product.profileLocalId) ||
      sessionProfileIdRef.current.trim() ||
      selectedProfileIdRef.current.trim()
    );
  }, []);

  const getPendingBatchSize = useCallback((): number => {
    let count = 0;
    pendingProductBatchesRef.current.forEach((products) => {
      count += products.length;
    });
    return count;
  }, []);

  const clearBatchTimer = useCallback((): void => {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
  }, []);

  const getExistingProductsForProfile = useCallback(async (profileId: string): Promise<AffiliateProduct[]> => {
    const cleanProfileId = profileId.trim();
    if (!cleanProfileId) return [];

    const cached = existingProductsByProfileRef.current.get(cleanProfileId);
    if (cached) return cached;

    const pending = existingProductsLoadByProfileRef.current.get(cleanProfileId);
    if (pending) return pending;

    const load = getLocalProducts({ profileLocalId: cleanProfileId })
      .then((products) => {
        existingProductsByProfileRef.current.set(cleanProfileId, products);
        return products;
      })
      .finally(() => {
        existingProductsLoadByProfileRef.current.delete(cleanProfileId);
      });

    existingProductsLoadByProfileRef.current.set(cleanProfileId, load);
    return load;
  }, []);

  const flushQueuedProducts = useCallback((): void => {
    clearBatchTimer();

    const batches = pendingProductBatchesRef.current;
    if (batches.size === 0) {
      return;
    }

    pendingProductBatchesRef.current = new Map();
    const totalProducts = Array.from(batches.values()).reduce((sum, products) => sum + products.length, 0);

    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        appendLog(`บันทึกสินค้าเข้าคลังเป็นชุด ${totalProducts} รายการ`);

        for (const [profileId, batchProducts] of batches.entries()) {
          try {
            const existingProducts = await getExistingProductsForProfile(profileId);
            const result = await importShopeeProducts(
              profileId,
              batchProducts.map((entry) => entry.product),
              { existingProducts, refresh: false, sync: false, debugLog: appendLog }
            );

            if (result?.success) {
              batchProducts.forEach((entry) => {
                savedKeysRef.current.add(entry.key);
              });
              appendLog(`บันทึกเข้าคลังแล้ว ${batchProducts.length} รายการ (รอซิงก์ cloud)`);
              continue;
            }

            appendLog(result?.error || `บันทึกสินค้า ${batchProducts.length} รายการยังไม่สำเร็จ`);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            appendLog(`บันทึกสินค้า ${batchProducts.length} รายการผิดพลาด: ${message}`);
          }
        }
      });
  }, [appendLog, clearBatchTimer, getExistingProductsForProfile, importShopeeProducts]);

  const scheduleQueuedProductFlush = useCallback((): void => {
    if (getPendingBatchSize() >= PRODUCT_SAVE_BATCH_SIZE) {
      flushQueuedProducts();
      return;
    }

    if (batchTimerRef.current) {
      return;
    }

    batchTimerRef.current = setTimeout(() => {
      flushQueuedProducts();
    }, PRODUCT_SAVE_BATCH_DELAY_MS);
  }, [flushQueuedProducts, getPendingBatchSize]);

  const waitForIdle = useCallback(async (): Promise<void> => {
    flushQueuedProducts();
    await saveQueueRef.current.catch(() => undefined);
  }, [flushQueuedProducts]);

  const queueProductSave = useCallback(
    (
      product: NativeShopeeImportProduct | ProfileAwareShopeeProduct,
      ts?: number,
      options: { requireActive?: boolean } = {}
    ): void => {
      if (options.requireActive !== false && !activeRef.current) return;

      if (!isLikelyShopeeProduct(product)) {
        appendLog(`ข้ามรายการที่ไม่ใช่ชื่อสินค้า: ${shortProductName(product)}`, ts);
        return;
      }

      const key = productKey(product);
      if (!key || queuedKeysRef.current.has(key)) return;
      queuedKeysRef.current.add(key);

      const productName = shortProductName(product);
      const productProfileId = resolveProductProfileId(product);
      if (!productProfileId) {
        appendLog(`ยังไม่บันทึก ${productName}: ไม่พบโปรไฟล์`, ts);
        return;
      }

      const productWithProfile: ProfileAwareShopeeProduct = {
        ...product,
        profileLocalId: cleanText(product.profileLocalId) || productProfileId,
      };
      const profileBatch = pendingProductBatchesRef.current.get(productProfileId) ?? [];
      profileBatch.push({
        key,
        product: productWithProfile,
      });
      pendingProductBatchesRef.current.set(productProfileId, profileBatch);

      const receivedCount = queuedKeysRef.current.size;
      if (receivedCount <= 3 || receivedCount % 10 === 0) {
        appendLog(
          `รับสินค้า Shopee แล้ว ${receivedCount} รายการ ล่าสุด: ${productName} | รูป: ${describeIncomingImageSource(productWithProfile)}`,
          ts
        );
      }

      scheduleQueuedProductFlush();
    },
    [appendLog, resolveProductProfileId, scheduleQueuedProductFlush]
  );

  useEffect(() => {
    const subscription = subscribeShopeeImportProducts((product) => {
      queueProductSave(product, product.ts);
    });

    return () => {
      subscription?.remove();
    };
  }, [queueProductSave]);

  const startSession = useCallback((profileId?: string): void => {
    clearBatchTimer();
    activeRef.current = true;
    sessionProfileIdRef.current = cleanText(profileId) || selectedProfileIdRef.current.trim();
    queuedKeysRef.current.clear();
    savedKeysRef.current.clear();
    existingProductsByProfileRef.current.clear();
    existingProductsLoadByProfileRef.current.clear();
    pendingProductBatchesRef.current = new Map();
    saveQueueRef.current = Promise.resolve();
  }, [clearBatchTimer]);

  const stopSession = useCallback((): void => {
    clearBatchTimer();
    activeRef.current = false;
    queuedKeysRef.current.clear();
    savedKeysRef.current.clear();
    existingProductsByProfileRef.current.clear();
    existingProductsLoadByProfileRef.current.clear();
    pendingProductBatchesRef.current = new Map();
  }, [clearBatchTimer]);

  const savePendingProducts = useCallback(async (): Promise<number> => {
    if (pendingRecoveryRef.current) {
      return pendingRecoveryRef.current;
    }

    const recovery = (async (): Promise<number> => {
      const fallbackProfileId = selectedProfileIdRef.current.trim();
      if (!fallbackProfileId && !sessionProfileIdRef.current.trim()) {
        return 0;
      }

      const pendingProducts = await getPendingShopeeImportProducts();
      if (pendingProducts.length === 0) {
        return 0;
      }

      const importablePendingProducts = pendingProducts.filter(isLikelyShopeeProduct);
      const skippedPendingCount = pendingProducts.length - importablePendingProducts.length;
      appendLog(`พบสินค้าค้างจาก Shopee ${pendingProducts.length} รายการ กำลังบันทึกเข้าคลัง`);
      if (skippedPendingCount > 0) {
        appendLog(`ข้ามรายการที่เป็น badge/ข้อความ UI ${skippedPendingCount} รายการ`);
      }

      const pendingKeys = importablePendingProducts.map(productKey).filter(Boolean);
      importablePendingProducts.forEach((product) => {
        queueProductSave(product, product.ts, { requireActive: false });
      });

      await waitForIdle();
      const savedAll = pendingKeys.every((key) => savedKeysRef.current.has(key));
      if (savedAll || importablePendingProducts.length === 0) {
        await clearPendingShopeeImportProducts();
      } else {
        appendLog('ยังมีสินค้าค้างบางรายการที่ยังบันทึกไม่สำเร็จ จะลองใหม่รอบถัดไป');
      }

      const savedCount = savedKeysRef.current.size;
      if (savedCount > 0) {
        await onProductsChanged?.();
      }
      return savedCount;
    })();

    pendingRecoveryRef.current = recovery;
    try {
      return await recovery;
    } finally {
      pendingRecoveryRef.current = null;
    }
  }, [appendLog, onProductsChanged, queueProductSave, waitForIdle]);

  const saveRemainingProducts = useCallback(
    async (products: ProfileAwareShopeeProduct[]): Promise<ProductImportResult | null> => {
      await waitForIdle();

      const remainingProducts = products.filter((product) => {
        if (!isLikelyShopeeProduct(product)) return false;
        const key = productKey(product);
        return key && !savedKeysRef.current.has(key);
      });
      if (remainingProducts.length === 0) return null;

      const productsByProfile = new Map<string, ProfileAwareShopeeProduct[]>();
      for (const product of remainingProducts) {
        const profileId = resolveProductProfileId(product);
        if (!profileId) continue;
        const group = productsByProfile.get(profileId) ?? [];
        group.push(product);
        productsByProfile.set(profileId, group);
      }

      if (productsByProfile.size === 0) {
        appendLog('ยังไม่บันทึกสินค้าค้าง: ไม่พบโปรไฟล์');
        return null;
      }

      appendLog(`บันทึกสินค้าค้างอีก ${remainingProducts.length} รายการ`);
      const combined: ProductImportResult = {
        error: null,
        imported: 0,
        queued: 0,
        restoredDeleted: 0,
        skippedDeleted: 0,
        skippedStale: 0,
        success: true,
      };

      for (const [profileId, profileProducts] of productsByProfile) {
        const existingProducts = await getExistingProductsForProfile(profileId);
        const result = await importShopeeProducts(profileId, profileProducts, { existingProducts, debugLog: appendLog });
        if (!result) continue;

        combined.imported += result.imported;
        combined.queued += result.queued;
        combined.restoredDeleted += result.restoredDeleted;
        combined.skippedDeleted += result.skippedDeleted;
        combined.skippedStale += result.skippedStale;
        if (!result.success) {
          combined.success = false;
          combined.error = combined.error || result.error;
          continue;
        }

        profileProducts.forEach((product) => {
          savedKeysRef.current.add(productKey(product));
        });
      }

      return combined.imported > 0 || combined.error ? combined : null;
    },
    [appendLog, getExistingProductsForProfile, importShopeeProducts, resolveProductProfileId, waitForIdle]
  );

  const getSavedCount = useCallback((): number => savedKeysRef.current.size, []);

  const clearPendingProducts = useCallback(async (): Promise<void> => {
    await clearPendingShopeeImportProducts();
  }, []);

  useEffect(() => {
    if (!selectedProfileId) return;

    const timer = setTimeout(() => {
      if (!activeRef.current) {
        void savePendingProducts();
      }
    }, 500);

    return () => {
      clearTimeout(timer);
    };
  }, [savePendingProducts, selectedProfileId]);

  return {
    clearPendingProducts,
    savePendingProducts,
    startSession,
    stopSession,
    waitForIdle,
    saveRemainingProducts,
    getSavedCount,
  };
}

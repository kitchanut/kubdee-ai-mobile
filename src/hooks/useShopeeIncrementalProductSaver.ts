import { useCallback, useEffect, useRef } from 'react';

import type {
  ProductImportResult,
  ShopeeImportProductInput,
} from '@/library/LibraryContext';
import {
  subscribeShopeeImportProducts,
} from '@/native/AccessibilityBridge';
import type { NativeShopeeImportProduct } from '@/native/AccessibilityBridge';

type AppendLog = (message: string, ts?: number) => void;
type ImportShopeeProducts = (
  profileLocalId: string,
  products: ShopeeImportProductInput[]
) => Promise<ProductImportResult | null>;

interface UseShopeeIncrementalProductSaverOptions {
  selectedProfileId: string;
  importShopeeProducts: ImportShopeeProducts;
  appendLog: AppendLog;
}

function cleanText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function productKey(product: ShopeeImportProductInput): string {
  const externalProductId = cleanText(product.externalProductId);
  const productUrl = cleanText(product.productUrl);
  if (externalProductId) return externalProductId;
  if (productUrl) return productUrl;
  return `${cleanText(product.name)}\u0000${cleanText(product.price)}`;
}

function shortProductName(product: ShopeeImportProductInput): string {
  return cleanText(product.name).slice(0, 34) || 'สินค้า Shopee';
}

export function useShopeeIncrementalProductSaver({
  selectedProfileId,
  importShopeeProducts,
  appendLog,
}: UseShopeeIncrementalProductSaverOptions) {
  const activeRef = useRef(false);
  const selectedProfileIdRef = useRef(selectedProfileId);
  const queuedKeysRef = useRef<Set<string>>(new Set());
  const savedKeysRef = useRef<Set<string>>(new Set());
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    selectedProfileIdRef.current = selectedProfileId;
  }, [selectedProfileId]);

  const waitForIdle = useCallback(async (): Promise<void> => {
    await saveQueueRef.current.catch(() => undefined);
  }, []);

  const queueProductSave = useCallback(
    (product: NativeShopeeImportProduct | ShopeeImportProductInput, ts?: number): void => {
      if (!activeRef.current) return;

      const key = productKey(product);
      if (!key || queuedKeysRef.current.has(key)) return;
      queuedKeysRef.current.add(key);

      const productName = shortProductName(product);
      appendLog(`บันทึกเข้าคลังทันที: ${productName}`, ts);

      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const profileId = selectedProfileIdRef.current.trim();
          if (!profileId) {
            appendLog(`ยังไม่บันทึก ${productName}: ไม่พบโปรไฟล์`);
            return;
          }

          try {
            const result = await importShopeeProducts(profileId, [product]);
            if (result?.success) {
              savedKeysRef.current.add(key);
              appendLog(`บันทึกเข้าคลังแล้ว: ${productName}`);
              return;
            }

            appendLog(result?.error || `บันทึก ${productName} ยังไม่สำเร็จ`);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            appendLog(`บันทึก ${productName} ผิดพลาด: ${message}`);
          }
        });
    },
    [appendLog, importShopeeProducts]
  );

  useEffect(() => {
    const subscription = subscribeShopeeImportProducts((product) => {
      queueProductSave(product, product.ts);
    });

    return () => {
      subscription?.remove();
    };
  }, [queueProductSave]);

  const startSession = useCallback((): void => {
    activeRef.current = true;
    queuedKeysRef.current.clear();
    savedKeysRef.current.clear();
    saveQueueRef.current = Promise.resolve();
  }, []);

  const stopSession = useCallback((): void => {
    activeRef.current = false;
  }, []);

  const saveRemainingProducts = useCallback(
    async (products: ShopeeImportProductInput[]): Promise<ProductImportResult | null> => {
      await waitForIdle();

      const remainingProducts = products.filter((product) => {
        const key = productKey(product);
        return key && !savedKeysRef.current.has(key);
      });
      if (remainingProducts.length === 0) return null;

      const profileId = selectedProfileIdRef.current.trim();
      if (!profileId) {
        appendLog('ยังไม่บันทึกสินค้าค้าง: ไม่พบโปรไฟล์');
        return null;
      }

      appendLog(`บันทึกสินค้าค้างอีก ${remainingProducts.length} รายการ`);
      const result = await importShopeeProducts(profileId, remainingProducts);
      if (result?.success) {
        remainingProducts.forEach((product) => {
          savedKeysRef.current.add(productKey(product));
        });
      }
      return result;
    },
    [appendLog, importShopeeProducts, waitForIdle]
  );

  const getSavedCount = useCallback((): number => savedKeysRef.current.size, []);

  return {
    startSession,
    stopSession,
    waitForIdle,
    saveRemainingProducts,
    getSavedCount,
  };
}

import type { ProductImportResult } from '@/library/LibraryContext';
import type { AffiliateProduct } from '@/library/types';
import { SHOPEE_IMPORT_ALL_SENTINEL } from './constants';
import type { ShopeeImportAmount } from './types';

export function getProductKey(product: AffiliateProduct): string {
  return String(product.id ?? product.localId);
}

export function getItemCode(product: AffiliateProduct): string {
  return product.externalProductId || product.localId.slice(0, 8);
}

/** Match extension: "#1729457066223503831" → "#172...831" (only when shortening saves space) */
export function shortenItemCode(code: string): string {
  return code.length > 9 ? `${code.slice(0, 3)}...${code.slice(-3)}` : code;
}

/** Decimal string ("229.00") → "฿229.00", null → "-" */
export function formatPrice(price: string | null): string {
  if (!price) {
    return '-';
  }

  const numeric = Number(price);
  if (!Number.isFinite(numeric)) {
    return `฿${price}`;
  }

  return `฿${new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric)}`;
}

/** 3336 → "3,336 ชิ้น", null → "-" */
export function formatStock(stock: number | null): string {
  if (typeof stock !== 'number' || !Number.isFinite(stock)) {
    return '-';
  }

  return `${new Intl.NumberFormat('th-TH').format(stock)} ชิ้น`;
}

export function getShopeeImportLimit(amount: ShopeeImportAmount, customAmount: string): number | null {
  if (amount === 'all') {
    return SHOPEE_IMPORT_ALL_SENTINEL;
  }

  if (amount === 'custom') {
    const parsed = Number.parseInt(customAmount.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return amount;
}

export function getShopeeImportAmountLabel(amount: ShopeeImportAmount, customAmount: string): string {
  if (amount === 'all') {
    return 'ทั้งหมด';
  }

  if (amount === 'custom') {
    const limit = getShopeeImportLimit(amount, customAmount);
    return limit ? `${limit} รายการ` : 'กำหนดเอง';
  }

  return `${amount} รายการ`;
}

export const SOURCE_LABELS: Record<string, string> = {
  desktop: 'Desktop',
  extension: 'Extension',
  mobile: 'Mobile',
  web: 'Web',
};

export function getSourceLabel(value: string | null | undefined): string | null {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized || normalized === 'unknown') {
    return null;
  }

  return SOURCE_LABELS[normalized] ?? normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/** App that created the product row, e.g. 'desktop' → "Desktop" */
export function getCreatedByLabel(product: AffiliateProduct): string | null {
  return getSourceLabel(product.createdByApp ?? product.originApp);
}

/** App that last updated the row — shown only when it differs from the creator */
export function getUpdatedByLabel(product: AffiliateProduct): string | null {
  const updated = getSourceLabel(product.updatedByApp);
  return updated && updated !== getCreatedByLabel(product) ? updated : null;
}

export function getPlatformLabel(platform: string | null): string | null {
  const normalized = (platform ?? '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === 'tiktok') {
    return 'TikTok';
  }

  if (normalized === 'shopee') {
    return 'Shopee';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function toMillis(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

export function getProductTimestamp(product: AffiliateProduct): number {
  return (
    toMillis(product.localCreatedAt) ||
    toMillis(product.scrapedAt) ||
    toMillis(product.createdAt) ||
    toMillis(product.lastSyncedAt)
  );
}

export function formatSyncTime(timestamp: number): string {
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function formatShopeeImportResult(result: ProductImportResult): string {
  const parts = [`${result.imported} รายการ`];

  if (result.restoredDeleted > 0) {
    parts.push(`กู้คืน ${result.restoredDeleted}`);
  }
  if (result.skippedDeleted > 0) {
    parts.push(`ข้ามที่ลบไว้ ${result.skippedDeleted}`);
  }
  if (result.skippedStale > 0) {
    parts.push(`ข้ามข้อมูลเก่า ${result.skippedStale}`);
  }
  if (result.queued > 0) {
    parts.push(`รอซิงก์ cloud ${result.queued}`);
  }

  return `นำเข้า Shopee สำเร็จ ${parts.join(' · ')}`;
}

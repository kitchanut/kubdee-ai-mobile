import type { ShopeeImportAmount } from './types';

/** Shopee brand orange — matches the ShopeeLogo default fill */
export const SHOPEE_ORANGE = '#EE4D2D';
export const SHOPEE_IMPORT_ALL_SENTINEL = 0;
export const SHOPEE_IMPORT_AMOUNT_OPTIONS: Array<{ label: string; value: ShopeeImportAmount }> = [
  { label: '10', value: 10 },
  { label: '20', value: 20 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: 'ทั้งหมด', value: 'all' },
  { label: 'กำหนดเอง', value: 'custom' },
];

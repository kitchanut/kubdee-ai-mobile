import type { ShopeeImportAmount, ShopeeOfferCategory } from './types';
export { SHOPEE_ORANGE } from '@/theme/brandColors';

export const SHOPEE_IMPORT_ALL_SENTINEL = 0;
export const SHOPEE_IMPORT_AMOUNT_OPTIONS: Array<{ label: string; value: ShopeeImportAmount }> = [
  { label: '1', value: 1 },
  { label: '5', value: 5 },
  { label: '10', value: 10 },
  { label: '20', value: 20 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: 'ทั้งหมด', value: 'all' },
  { label: 'กำหนดเอง', value: 'custom' },
];

export const SHOPEE_OFFER_CATEGORY_OPTIONS: Array<{ label: string; value: ShopeeOfferCategory }> = [
  { label: 'แนะนำ', value: 'แนะนำ' },
  { label: 'เครื่องใช้ในบ้าน', value: 'เครื่องใช้ในบ้าน' },
  { label: 'กีฬาและกิจกรรมกลางแจ้ง', value: 'กีฬาและกิจกรรมกลางแจ้ง' },
  { label: 'เสื้อผ้าแฟชั่นผู้ชาย', value: 'เสื้อผ้าแฟชั่นผู้ชาย' },
  { label: 'อาหารและเครื่องดื่ม', value: 'อาหารและเครื่องดื่ม' },
  { label: 'กลุ่มผลิตภัณฑ์เพื่อสุขภาพ', value: 'กลุ่มผลิตภัณฑ์เพื่อสุขภาพ' },
];

import type { AutomationScript } from '@/automation/types';

export function createShopeeSearchScript(keyword: string): AutomationScript {
  return {
    id: 'shopee-search',
    title: 'Shopee Search',
    targetPackage: 'com.shopee.th',
    steps: [
      {
        id: 'launch-shopee',
        kind: 'launch-app',
        label: 'เปิด Shopee',
        timeoutMs: 8000,
      },
      {
        id: 'open-home',
        kind: 'tap',
        label: 'ไปหน้าแรก Shopee',
        target: {
          text: 'หน้าแรก',
          boundsHint: { x: 72, y: 1460 },
        },
        timeoutMs: 6000,
      },
      {
        id: 'tap-search',
        kind: 'tap',
        label: 'แตะช่องค้นหา',
        target: {
          resourceId: 'com.shopee.th:id/search_prefill_click',
          boundsHint: { x: 150, y: 120 },
        },
        timeoutMs: 5000,
      },
      {
        id: 'type-keyword',
        kind: 'type',
        label: 'พิมพ์ keyword',
        value: keyword,
        timeoutMs: 3000,
      },
      {
        id: 'submit-search',
        kind: 'tap',
        label: 'กดค้นหาบน keyboard',
        target: {
          boundsHint: { x: 650, y: 1460 },
        },
        timeoutMs: 4000,
      },
      {
        id: 'wait-results',
        kind: 'assert-visible',
        label: 'รอผลลัพธ์สินค้า',
        target: {
          text: keyword,
        },
        timeoutMs: 8000,
      },
      {
        id: 'scroll-results',
        kind: 'scroll',
        label: 'เลื่อนผลลัพธ์',
        timeoutMs: 1500,
      },
    ],
  };
}

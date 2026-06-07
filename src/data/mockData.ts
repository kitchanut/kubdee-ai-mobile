import type { ActivityLog, DeviceRecord } from '@/types/navigation';

export type GalleryCategoryId =
  | 'products'
  | 'images'
  | 'videos'
  | 'multiScene'
  | 'storyboard'
  | 'extendScene'
  | 'videoCut'
  | 'characters';

export interface GalleryItemRecord {
  id: string;
  category: GalleryCategoryId;
  title: string;
  subtitle: string;
  meta: string;
  status: 'active' | 'ready' | 'draft' | 'processing';
  tone: 'orange' | 'blue' | 'cyan' | 'emerald' | 'amber' | 'red';
  badges: string[];
}

export const devices: DeviceRecord[] = [
  {
    id: 'local-android',
    name: 'Android เครื่องนี้',
    serial: 'local-accessibility',
    androidVersion: '14+',
    connection: 'local',
    status: 'needs-permission',
    profileName: 'Shopee หลัก',
  },
  {
    id: 'usb-demo',
    name: 'Pixel Test Rig',
    serial: 'USB-7A21',
    androidVersion: '15',
    connection: 'usb',
    status: 'ready',
    profileName: 'บัญชีทดสอบ',
  },
];

export const logs: ActivityLog[] = [
  {
    id: 'log-1',
    level: 'info',
    message: 'Mobile shell loaded',
    timestamp: '20:58',
  },
  {
    id: 'log-2',
    level: 'warning',
    message: 'Accessibility service ยังไม่ได้เปิด',
    timestamp: '20:59',
  },
  {
    id: 'log-3',
    level: 'success',
    message: 'Shopee deterministic scripts พร้อมใช้งาน',
    timestamp: '21:00',
  },
];

export const scriptPresets = [
  {
    id: 'search-products',
    title: 'Shopee Search',
    description: 'ค้นหา keyword, เลื่อนผลลัพธ์, เก็บสถานะสินค้า',
    accent: 'orange',
  },
  {
    id: 'collect-prices',
    title: 'เก็บราคา',
    description: 'อ่านชื่อสินค้า ราคา และสถานะคูปองจากหน้ารายการ',
    accent: 'cyan',
  },
  {
    id: 'post-video',
    title: 'โพสวิดีโอ',
    description: 'เปิดหน้าสร้างโพส, ใส่ caption, แนบสินค้า',
    accent: 'emerald',
  },
] as const;

export const galleryItems: GalleryItemRecord[] = [
  {
    id: 'prod-luggage',
    category: 'products',
    title: 'กระเป๋าเดินทาง 20 นิ้ว',
    subtitle: 'SHP-1202 | Shopee หลัก',
    meta: '12 รูป | 4 วิดีโอ | Active',
    status: 'active',
    tone: 'orange',
    badges: ['Shopee', 'Cap', '#'],
  },
  {
    id: 'prod-skincare',
    category: 'products',
    title: 'เซรั่มวิตามินซี',
    subtitle: 'SHP-2088 | บัญชีทดสอบ',
    meta: '8 รูป | 2 วิดีโอ | Active',
    status: 'active',
    tone: 'emerald',
    badges: ['Shopee', 'CTA'],
  },
  {
    id: 'img-luggage-hero',
    category: 'images',
    title: 'Hero Pack กระเป๋าเดินทาง',
    subtitle: 'Auto Image | 9:16',
    meta: 'สร้างล่าสุด 04:12 | 6 รูป',
    status: 'ready',
    tone: 'cyan',
    badges: ['9:16', 'Flow'],
  },
  {
    id: 'img-skincare-clean',
    category: 'images',
    title: 'Clean Studio เซรั่ม',
    subtitle: 'Product Image | 1:1',
    meta: 'สตูดิโอขาว | พร้อมใช้',
    status: 'ready',
    tone: 'blue',
    badges: ['1:1', 'Studio'],
  },
  {
    id: 'vid-luggage-demo',
    category: 'videos',
    title: 'Luggage Demo Reel',
    subtitle: 'Veo 3.1 Fast | 9:16',
    meta: '8s | 720p | ยังไม่โพส',
    status: 'ready',
    tone: 'red',
    badges: ['TikTok', 'Shopee'],
  },
  {
    id: 'vid-skincare-promo',
    category: 'videos',
    title: 'Serum Glow Promo',
    subtitle: 'Sora 2 | 9:16',
    meta: '15s | 720p | Caption ครบ',
    status: 'ready',
    tone: 'amber',
    badges: ['Cap', '#', 'CTA'],
  },
  {
    id: 'scene-luggage-trip',
    category: 'multiScene',
    title: 'Trip Story 5 ฉาก',
    subtitle: 'วิดีโอหลายฉาก',
    meta: '5 scenes | 3 generated',
    status: 'processing',
    tone: 'cyan',
    badges: ['Multi', 'Draft'],
  },
  {
    id: 'storyboard-skincare',
    category: 'storyboard',
    title: 'Skincare Morning Routine',
    subtitle: 'Storyboard project',
    meta: '7 frames | prompt พร้อม',
    status: 'draft',
    tone: 'blue',
    badges: ['Frames', 'Prompt'],
  },
  {
    id: 'extend-before-after',
    category: 'extendScene',
    title: 'Before After Extend',
    subtitle: 'วิดีโอขยายฉาก',
    meta: 'ต่อฉาก 2 รอบ | รอตรวจ',
    status: 'draft',
    tone: 'emerald',
    badges: ['Extend'],
  },
  {
    id: 'cut-luggage-ep',
    category: 'videoCut',
    title: 'Luggage EP Cutdown',
    subtitle: 'คลังตัดคลิป',
    meta: '4 clips | 2 selected',
    status: 'ready',
    tone: 'red',
    badges: ['EP', 'MP4'],
  },
  {
    id: 'char-host',
    category: 'characters',
    title: 'Host ผู้หญิงสไตล์มินิมอล',
    subtitle: 'Character reference',
    meta: 'ใช้กับ 3 โปรเจกต์',
    status: 'active',
    tone: 'amber',
    badges: ['Ref', 'Face'],
  },
];

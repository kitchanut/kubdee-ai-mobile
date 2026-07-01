import type * as ImagePicker from 'expo-image-picker';

import type { GeneratedMediaAsset } from '@/autopilot/generatedMediaStore';

export type MediaKind = 'images' | 'videos';

export type MediaMode = 'product' | 'general';

export interface MediaSubItem {
  id: string;
  parentId: string;
  title: string;
  productName: string;
  productCode: string;
  date: string;
  size: string;
  portrait: boolean;
  warnings: string[];
  uri?: string | null;
  mimeType?: string | null;
  thumbnailUri?: string | null;
  productUrl?: string | null;
  caption?: string | null;
  hashtags?: string | null;
  cta?: string | null;
  platform?: string | null;
}

export interface MediaGroupRecord {
  id: string;
  title: string;
  code: string;
  subtitle: string;
}

export interface UploadDraft {
  id: string;
  asset: ImagePicker.ImagePickerAsset;
  fileName: string;
  title: string;
  productId: string;
  productName: string;
  productUrl: string;
  caption: string;
  hashtags: string;
  cta: string;
  thumbnailUri: string | null;
  sizeBytes: number | null;
}

/** Accent wash/border classes per media kind (mirrors getAccentTone soft = alpha 0.1 light / 0.16 dark). */
export const accentClasses: Record<MediaKind, { soft: string; border: string }> = {
  images: {
    soft: 'bg-kd-amber/10 dark:bg-kd-amber/15',
    border: 'border-kd-amber/40',
  },
  videos: {
    soft: 'bg-kd-red/10 dark:bg-kd-red/15',
    border: 'border-kd-red/40',
  },
};

export const panelCopy: Record<
  MediaKind,
  {
    title: string;
    productTab: string;
    generalTab: string;
    unit: string;
    emptyTitle: string;
    emptyCopy: string;
    emptyGeneral: string;
  }
> = {
  images: {
    title: 'คลังรูปภาพ',
    productTab: 'รูปภาพสินค้า',
    generalTab: 'รูปภาพทั่วไป',
    unit: 'รูป',
    emptyTitle: 'ยังไม่มีรูปภาพ',
    emptyCopy: 'รูปภาพที่สร้างหรือเพิ่มจากเครื่องจะถูกบันทึกไว้ที่นี่',
    emptyGeneral: 'ยังไม่มีรูปภาพทั่วไป',
  },
  videos: {
    title: 'คลังวิดีโอ',
    productTab: 'วิดีโอสินค้า',
    generalTab: 'วิดีโอทั่วไป',
    unit: 'วิดีโอ',
    emptyTitle: 'ยังไม่มีวิดีโอ',
    emptyCopy: 'วิดีโอที่สร้างหรือเพิ่มจากเครื่องจะถูกบันทึกไว้ที่นี่',
    emptyGeneral: 'ยังไม่มีวิดีโอทั่วไป',
  },
};

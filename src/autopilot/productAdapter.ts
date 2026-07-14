import {
  DEFAULT_AUTO_PILOT_IMAGE_SETTINGS,
  DEFAULT_AUTO_PILOT_VIDEO_SETTINGS,
  FLOW_IMAGE_MODELS,
  FLOW_VIDEO_MODELS,
} from '@/autopilot/defaults';
import type { AutoPilotProduct, AutoPilotProductSettings, GoogleFlowRunnerProduct } from '@/autopilot/types';
import type { AffiliateProduct } from '@/library/types';

function cleanText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

const VALID_IMAGE_MODELS = new Set<string>(FLOW_IMAGE_MODELS.map((model) => model.value));
const VALID_VIDEO_MODELS = new Set<string>(FLOW_VIDEO_MODELS.map((model) => model.value));

function normalizeImageModel(value: unknown): string {
  return typeof value === 'string' && VALID_IMAGE_MODELS.has(value)
    ? value
    : DEFAULT_AUTO_PILOT_IMAGE_SETTINGS.imageModel;
}

function normalizeVideoModel(value: unknown): string {
  return typeof value === 'string' && VALID_VIDEO_MODELS.has(value)
    ? value
    : DEFAULT_AUTO_PILOT_VIDEO_SETTINGS.videoModel;
}

export function getAutoPilotProductId(product: AffiliateProduct): string {
  return product.localId || String(product.id);
}

// imagePath ของสินค้าที่ sync มาจากแอป desktop เป็น path ของเครื่องนั้น (Windows `C:\...`,
// UNC `\\...` หรือ mac `/Users/...`) ซึ่งอ่านบนมือถือไม่ได้ — ถ้าเลือกมาเป็น preview
// downloadAsync จะโยน "Expected URL scheme 'http'... but was 'C'" วนซ้ำจนกลายเป็นบั๊ก
// "ยังไม่มีรูป reference แนบในช่องวิดีโอ" (Sentry MOBILE-Q) จึงรับเฉพาะ URI ที่เครื่องนี้
// ใช้ได้จริง ไม่งั้นตกไปใช้ imageUrl (R2) แทน
function isDeviceUsablePreviewUri(uri: string): boolean {
  if (/^[a-zA-Z]:[\\/]/.test(uri) || uri.startsWith('\\\\')) return false;
  if (uri.startsWith('/')) {
    return uri.startsWith('/data/') || uri.startsWith('/storage/') || uri.startsWith('/sdcard/');
  }
  return (
    uri.startsWith('content://') ||
    uri.startsWith('file://') ||
    uri.startsWith('data:image/') ||
    uri.startsWith('http://') ||
    uri.startsWith('https://')
  );
}

function pickDevicePreview(product: AffiliateProduct): string | null {
  const imagePath = cleanText(product.imagePath);
  if (imagePath && isDeviceUsablePreviewUri(imagePath)) {
    return imagePath;
  }
  return cleanText(product.imageUrl) || null;
}

export function toAutoPilotProduct(product: AffiliateProduct): AutoPilotProduct {
  const id = getAutoPilotProductId(product);

  return {
    id,
    catalogId: id,
    source: product,
    preview: pickDevicePreview(product),
    name: product.name,
    description: cleanText(product.description),
    productId: cleanText(product.externalProductId) || product.localId,
    productUrl: cleanText(product.productUrl),
    caption: cleanText(product.caption),
    hashtags: cleanText(product.hashtags),
    cta: cleanText(product.cta),
    platform: cleanText(product.platform) || 'unknown',
    settings: {
      image: { ...DEFAULT_AUTO_PILOT_IMAGE_SETTINGS },
      video: { ...DEFAULT_AUTO_PILOT_VIDEO_SETTINGS },
    },
  };
}

export function normalizeAutoPilotProductSettings(
  settings: Partial<AutoPilotProductSettings> | null | undefined
): AutoPilotProductSettings {
  const image = {
    ...DEFAULT_AUTO_PILOT_IMAGE_SETTINGS,
    ...(settings?.image ?? {}),
  };
  const video = {
    ...DEFAULT_AUTO_PILOT_VIDEO_SETTINGS,
    ...(settings?.video ?? {}),
  };

  return {
    image: {
      ...image,
      imageModel: normalizeImageModel(image.imageModel),
    },
    video: {
      ...video,
      videoModel: normalizeVideoModel(video.videoModel),
    },
  };
}

export function toGoogleFlowRunnerProduct(product: AutoPilotProduct): GoogleFlowRunnerProduct {
  return {
    id: product.id,
    catalogId: product.catalogId,
    preview: product.preview,
    previewFallbackUrl: cleanText(product.source.imageUrl) || null,
    name: product.name,
    description: product.description,
    productId: product.productId,
    productUrl: product.productUrl,
    caption: product.caption,
    hashtags: product.hashtags,
    cta: product.cta,
    platform: product.platform,
    settings: product.settings,
  };
}

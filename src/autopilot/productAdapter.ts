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

export function toAutoPilotProduct(product: AffiliateProduct): AutoPilotProduct {
  const id = getAutoPilotProductId(product);

  return {
    id,
    catalogId: id,
    source: product,
    preview: product.imagePath || product.imageUrl || null,
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

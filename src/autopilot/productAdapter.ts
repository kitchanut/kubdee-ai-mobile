import {
  DEFAULT_AUTO_PILOT_IMAGE_SETTINGS,
  DEFAULT_AUTO_PILOT_VIDEO_SETTINGS,
} from '@/autopilot/defaults';
import type { AutoPilotProduct, GoogleFlowRunnerProduct } from '@/autopilot/types';
import type { AffiliateProduct } from '@/library/types';

function cleanText(value: string | null | undefined): string {
  return value?.trim() ?? '';
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
    preview: product.imageUrl || product.imagePath || null,
    name: product.name,
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

export function toGoogleFlowRunnerProduct(product: AutoPilotProduct): GoogleFlowRunnerProduct {
  return {
    id: product.id,
    catalogId: product.catalogId,
    preview: product.preview,
    name: product.name,
    productId: product.productId,
    productUrl: product.productUrl,
    caption: product.caption,
    hashtags: product.hashtags,
    cta: product.cta,
    platform: product.platform,
    settings: product.settings,
  };
}

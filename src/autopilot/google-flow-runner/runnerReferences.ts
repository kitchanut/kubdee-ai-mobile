import type { AutoPilotStepType, GoogleFlowRunnerProduct } from '@/autopilot/types';
import { readUriAsDataUrl } from '@/native/AccessibilityBridge';

export function getProductReferenceFileName(
  product: GoogleFlowRunnerProduct,
  productIndex: number,
  round: number,
  step: AutoPilotStepType
): string {
  const kind = product.creativeAssetKind === 'characters'
    ? 'character'
    : product.creativeAssetKind === 'scenes'
      ? 'scene'
      : 'product';
  const code = product.productId || product.catalogId || product.id || kind;
  const safeCode = code.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 38) || kind;
  return `kubdee-${kind}-reference-${safeCode}-p${productIndex + 1}-r${round}-${step}.png`;
}

export function getProductReferenceLabel(product: GoogleFlowRunnerProduct, productIndex: number): string {
  if (product.creativeAssetKind === 'characters') {
    return `รูปตัวละครต้นแบบ ลำดับ ${productIndex + 1}`;
  }
  if (product.creativeAssetKind === 'scenes') {
    return `รูปฉากต้นแบบ ลำดับ ${productIndex + 1}`;
  }
  return `รูปสินค้า ลำดับ ${productIndex + 1}`;
}

export function getUploadReferenceStage(referenceLabel: unknown): string {
  const label = String(referenceLabel || '').trim();
  if (/สินค้า/.test(label)) return 'upload_product_reference';
  if (/ตัวละคร/.test(label)) return 'upload_character_reference';
  if (/ฉากมุมเดียว/.test(label)) return 'upload_same_angle_scene_reference';
  if (/ฉากก่อนหน้า/.test(label)) return 'upload_previous_scene_reference';
  if (/ฉาก/.test(label)) return 'upload_scene_reference';
  if (/สร้างไว้/.test(label)) return 'upload_generated_image_reference';
  if (/เพิ่งสร้าง/.test(label)) return 'upload_recent_image_reference';
  return 'upload_reference';
}

export function getGeneratedImageCacheKey(product: GoogleFlowRunnerProduct, round: number): string {
  return `${round}:${product.id || product.productId || product.catalogId || 'product'}`;
}

export function getGeneratedImageReferenceFileName(
  product: GoogleFlowRunnerProduct,
  round: number,
  index = 0
): string {
  const code = product.productId || product.catalogId || product.id || 'product';
  const safeCode = code.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 42) || 'product';
  return `kubdee-generated-${safeCode}-r${round}-${index + 1}.png`;
}

export function getSafeReferenceName(value: string | null | undefined, fallback: string): string {
  const clean = value?.trim() || fallback;
  return clean.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || fallback;
}

export type AdditionalImageReference = {
  fileName: string;
  label: string;
  stage: string;
  uri: string;
};

export function getAdditionalImageReferences(product: GoogleFlowRunnerProduct): AdditionalImageReference[] {
  const imageSettings = product.settings.image;
  const references: AdditionalImageReference[] = [];
  const usedUris = new Set<string>();
  const productPreview = product.preview?.trim();
  if (productPreview) {
    usedUris.add(productPreview);
  }

  const pushReference = ({
    fileName,
    label,
    stage,
    uri,
  }: {
    fileName: string;
    label: string;
    stage: string;
    uri: string | null | undefined;
  }): void => {
    const cleanUri = uri?.trim();
    if (!cleanUri || usedUris.has(cleanUri)) {
      return;
    }
    usedUris.add(cleanUri);
    references.push({ fileName, label, stage, uri: cleanUri });
  };

  if (imageSettings.characterMode !== 'auto' && imageSettings.characterMode !== 'none') {
    pushReference({
      fileName: `kubdee-character-reference-${getSafeReferenceName(
        imageSettings.selectedCharacterId,
        'character'
      )}.png`,
      label: 'ตัวละคร',
      stage: 'attach_character_reference',
      uri: imageSettings.customCharacterUri,
    });
  }

  if (imageSettings.sceneMode !== 'auto' && imageSettings.sceneMode !== 'none') {
    pushReference({
      fileName: `kubdee-scene-reference-${getSafeReferenceName(imageSettings.selectedSceneId, 'scene')}.png`,
      label: 'ฉาก',
      stage: 'attach_scene_reference',
      uri: imageSettings.customSceneUri,
    });
  }

  return references;
}

export function getAdditionalVideoReferences(product: GoogleFlowRunnerProduct): AdditionalImageReference[] {
  const references = getAdditionalImageReferences(product);
  if (product.settings.video.characterMode === 'none') {
    return references.filter((reference) => reference.stage !== 'attach_character_reference');
  }
  return references;
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('อ่านรูป reference ไม่สำเร็จ'));
    reader.readAsDataURL(blob);
  });
}

export async function loadImageReferenceDataUrl(uri: string): Promise<string | null> {
  const cleanUri = uri.trim();
  if (!cleanUri) {
    return null;
  }
  if (cleanUri.startsWith('data:image/')) {
    return cleanUri;
  }
  if (isLocalReferenceUri(cleanUri)) {
    const localDataUrl = await readUriAsDataUrl(cleanUri).catch(() => null);
    if (localDataUrl?.startsWith('data:image/')) {
      return localDataUrl;
    }
  }

  try {
    const response = await fetch(cleanUri);
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    if (!blob.size) {
      return null;
    }
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

export function isLocalReferenceUri(uri: string): boolean {
  return uri.startsWith('content://') || uri.startsWith('file://') || uri.startsWith('/');
}

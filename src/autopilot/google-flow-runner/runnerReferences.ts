import * as FileSystem from 'expo-file-system/legacy';

import type { AutoPilotStepType, GoogleFlowRunnerProduct } from '@/autopilot/types';
import { readUriAsDataUrl } from '@/native/AccessibilityBridge';
import { reportWarning } from '@/lib/telemetry';

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

function headerValue(headers: Record<string, string> | undefined, key: string): string | null {
  if (!headers) return null;
  const direct = headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
  if (direct) return direct;
  const foundKey = Object.keys(headers).find((headerKey) => headerKey.toLowerCase() === key.toLowerCase());
  return foundKey ? headers[foundKey] ?? null : null;
}

function guessImageMimeTypeFromUri(uri: string): string {
  const path = uri.split('?')[0]?.split('#')[0] ?? '';
  const extension = path.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    default:
      return 'image/jpeg';
  }
}

// React Native's fetch()/Response.blob() cannot reliably turn a remote image response into a
// Blob here — confirmed via a captured Sentry error: "Creating blobs from 'ArrayBuffer' and
// 'ArrayBufferView' are not supported". This is a JS-polyfill limitation, not a network/CORS
// issue (the same URL loads fine via <Image>, which uses the native image pipeline instead of
// fetch()). expo-file-system's downloadAsync + readAsStringAsync writes/reads real files on
// disk and sidesteps the Blob polyfill entirely — the same approach productImageCache.ts
// already uses successfully to cache these images in the first place.
async function downloadRemoteImageAsDataUrl(url: string): Promise<string | null> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) return null;

  const tempUri = `${cacheDir}kubdee-reference-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    const result = await FileSystem.downloadAsync(url, tempUri);
    if (result.status < 200 || result.status >= 300) {
      reportWarning('loadImageReferenceDataUrl: downloadAsync returned non-OK status', {
        uri: url,
        status: result.status,
      });
      return null;
    }

    const base64 = await FileSystem.readAsStringAsync(result.uri, { encoding: FileSystem.EncodingType.Base64 });
    if (!base64) {
      reportWarning('loadImageReferenceDataUrl: downloaded file was empty', { uri: url });
      return null;
    }

    const mimeType = headerValue(result.headers, 'content-type')?.split(';')[0]?.trim() || guessImageMimeTypeFromUri(url);
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    reportWarning('loadImageReferenceDataUrl: downloadAsync threw', {
      uri: url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
  }
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
    try {
      const localDataUrl = await readUriAsDataUrl(cleanUri);
      if (localDataUrl?.startsWith('data:image/')) {
        return localDataUrl;
      }
      reportWarning('loadImageReferenceDataUrl: readUriAsDataUrl returned no data URL', { uri: cleanUri });
    } catch (error) {
      reportWarning('loadImageReferenceDataUrl: readUriAsDataUrl threw', {
        uri: cleanUri,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    // A local uri (file://, content://, bare path) has no network fallback — fetch() can't
    // retrieve file:// or content:// at all, so falling through to it here would just fail
    // again identically (a misleading "Failed to fetch") instead of surfacing why the local
    // read actually failed above.
    return null;
  }

  return downloadRemoteImageAsDataUrl(cleanUri);
}

export function isLocalReferenceUri(uri: string): boolean {
  return uri.startsWith('content://') || uri.startsWith('file://') || uri.startsWith('/');
}

// Buffer's fetch() (and the injected WebView action's own fetch()) can only ever retrieve
// http(s) URLs. When the app's own attempt to read a local uri as a data URL fails, there is no
// safe network fallback — passing the local uri through as `imageUrl` would just make a second,
// doomed fetch() attempt inside the WebView, producing a confusing network-looking error that
// hides the real (local-read) failure already reported above.
export function resolveReferenceTransportArgs(
  dataUrl: string | null,
  sourceUri: string
): { dataUrl?: string; imageUrl?: string } {
  if (dataUrl) {
    return { dataUrl };
  }
  if (isLocalReferenceUri(sourceUri)) {
    return {};
  }
  return { imageUrl: sourceUri };
}

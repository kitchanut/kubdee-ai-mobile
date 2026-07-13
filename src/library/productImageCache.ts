import { File, FileMode, type FileHandle } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';

import type { SyncAffiliateProductInput } from '@/library/api';

type ImageCacheInput = {
  externalProductId?: string | null;
  imageMimeType?: string | null;
  imagePath?: string | null;
  imageSize?: number | null;
  imageUrl?: string | null;
  name?: string | null;
};

type CachedImageMetadata = {
  imageMimeType: string | null;
  imagePath: string | null;
  imageSize: number | null;
};

type ImageCacheDebugLog = (message: string) => void;

type ImageCacheSource = 'existing' | 'local' | 'remote' | 'none' | 'unsupported';

type ImageCacheStatus = 'success' | 'missing-source' | 'unsupported-source' | 'unsupported-type' | 'failed';

type ImageCacheResult = {
  cached: CachedImageMetadata | null;
  notes: string[];
  reason: string | null;
  source: ImageCacheSource;
  status: ImageCacheStatus;
};

type CacheProductImagesOptions = {
  debugLog?: ImageCacheDebugLog;
};

const PRODUCT_IMAGE_DIRECTORY = 'product-images';
const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const IMAGE_CACHE_DETAIL_LOG_LIMIT = 12;
// Only the file header is needed for magic-byte detection; 16 bytes covers every signature we check.
const IMAGE_HEADER_SNIFF_BYTES = 16;
// Never delete a cached file written within this window — an import may still be attaching it to a
// product, or the reference list handed to the orphan sweep may be momentarily stale.
const ORPHAN_SWEEP_GRACE_MS = 10 * 60 * 1000;

type SupportedImageType = {
  extension: 'jpg' | 'png' | 'webp' | 'gif';
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
};

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function productDebugName(input: ImageCacheInput): string {
  return cleanText(input.name)?.slice(0, 34) || cleanText(input.externalProductId) || 'สินค้า Shopee';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatImageCacheSource(source: ImageCacheSource): string {
  switch (source) {
    case 'existing':
      return 'ไฟล์เดิม';
    case 'local':
      return 'ไฟล์เครื่อง';
    case 'remote':
      return 'URL';
    case 'unsupported':
      return 'แหล่งรูปไม่รองรับ';
    case 'none':
    default:
      return 'ไม่มีแหล่งรูป';
  }
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function isLocalProductImagePath(value: string | null | undefined): boolean {
  const path = cleanText(value);
  return !!path && (path.startsWith('file://') || path.startsWith('content://'));
}

export function isDisplayableProductImageUri(value: string | null | undefined): boolean {
  const uri = cleanText(value);
  return !!uri && (
    isHttpUrl(uri) ||
    uri.startsWith('file://') ||
    uri.startsWith('content://') ||
    uri.startsWith('data:image/')
  );
}

function normalizeSupportedMimeType(mimeType: string | null | undefined): SupportedImageType['mimeType'] | null {
  const mime = cleanText(mimeType)?.toLowerCase().split(';')[0]?.trim();
  if (!mime) return null;
  if (mime === 'image/jpg') return 'image/jpeg';
  return SUPPORTED_IMAGE_MIME_TYPES.has(mime) ? mime as SupportedImageType['mimeType'] : null;
}

function imageTypeFromMimeType(mimeType: string | null | undefined): SupportedImageType | null {
  const mime = normalizeSupportedMimeType(mimeType);
  switch (mime) {
    case 'image/png':
      return { extension: 'png', mimeType: 'image/png' };
    case 'image/webp':
      return { extension: 'webp', mimeType: 'image/webp' };
    case 'image/gif':
      return { extension: 'gif', mimeType: 'image/gif' };
    case 'image/jpeg':
      return { extension: 'jpg', mimeType: 'image/jpeg' };
    default:
      return null;
  }
}

function extensionFromMimeType(mimeType: string | null | undefined): string | null {
  return imageTypeFromMimeType(mimeType)?.extension ?? null;
}

function imageTypeFromExtension(extension: string | null | undefined): SupportedImageType | null {
  switch (extension?.toLowerCase()) {
    case 'png':
      return { extension: 'png', mimeType: 'image/png' };
    case 'webp':
      return { extension: 'webp', mimeType: 'image/webp' };
    case 'gif':
      return { extension: 'gif', mimeType: 'image/gif' };
    case 'jpg':
    case 'jpeg':
      return { extension: 'jpg', mimeType: 'image/jpeg' };
    default:
      return null;
  }
}

function supportedExtensionFromUri(uri: string): string | null {
  return imageTypeFromExtension(extensionFromUri(uri))?.extension ?? null;
}

function byteString(bytes: Uint8Array, start: number, length: number): string {
  return Array.from(bytes.slice(start, start + length))
    .map((byte) => String.fromCharCode(byte))
    .join('');
}

function imageTypeFromBytes(bytes: Uint8Array): SupportedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { extension: 'jpg', mimeType: 'image/jpeg' };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { extension: 'png', mimeType: 'image/png' };
  }
  if (bytes.length >= 6 && (byteString(bytes, 0, 6) === 'GIF87a' || byteString(bytes, 0, 6) === 'GIF89a')) {
    return { extension: 'gif', mimeType: 'image/gif' };
  }
  if (bytes.length >= 12 && byteString(bytes, 0, 4) === 'RIFF' && byteString(bytes, 8, 4) === 'WEBP') {
    return { extension: 'webp', mimeType: 'image/webp' };
  }
  return null;
}

async function sniffSupportedImageType(uri: string): Promise<SupportedImageType | null> {
  let handle: FileHandle | null = null;
  try {
    // Read only the header rather than loading the whole file into memory — large images across
    // many products during import would otherwise cause real memory pressure / OOM.
    handle = new File(uri).open(FileMode.ReadOnly);
    const length = Math.min(IMAGE_HEADER_SNIFF_BYTES, handle.size ?? IMAGE_HEADER_SNIFF_BYTES);
    if (length <= 0) return null;
    const bytes = handle.readBytes(length);
    return imageTypeFromBytes(bytes);
  } catch {
    return null;
  } finally {
    handle?.close();
  }
}

function extensionFromUri(uri: string): string | null {
  const path = uri.split('?')[0]?.split('#')[0] ?? '';
  const match = path.match(/\.([a-z0-9]{2,5})$/i);
  const extension = match?.[1]?.toLowerCase();
  return extension && /^[a-z0-9]+$/.test(extension) ? extension : null;
}

function headerValue(headers: Record<string, string> | undefined, key: string): string | null {
  if (!headers) return null;
  const direct = headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
  if (direct) return direct;

  const foundKey = Object.keys(headers).find((headerKey) => headerKey.toLowerCase() === key.toLowerCase());
  return foundKey ? headers[foundKey] ?? null : null;
}

async function fileSize(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) return null;
    return typeof info.size === 'number' && Number.isFinite(info.size) ? info.size : null;
  } catch {
    return null;
  }
}

async function localFileExists(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory;
  } catch {
    return false;
  }
}

async function productImageDirectory(): Promise<string> {
  if (!FileSystem.documentDirectory) {
    throw new Error('ไม่พบพื้นที่จัดเก็บของแอป');
  }

  const directory = `${FileSystem.documentDirectory}${PRODUCT_IMAGE_DIRECTORY}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  return directory;
}

function cacheFileName(input: ImageCacheInput, sourceUri: string): string {
  const extension =
    extensionFromMimeType(input.imageMimeType) ||
    supportedExtensionFromUri(sourceUri) ||
    'jpg';
  const identity = cleanText(input.externalProductId) || cleanText(input.name) || sourceUri;
  return `product-${hashString(identity)}-${hashString(sourceUri)}.${extension}`;
}

async function cacheLocalImage(input: ImageCacheInput, sourceUri: string): Promise<CachedImageMetadata | null> {
  if (sourceUri.startsWith('file://') && await localFileExists(sourceUri)) {
    const detected = await sniffSupportedImageType(sourceUri);
    const imageType =
      detected ||
      imageTypeFromMimeType(input.imageMimeType) ||
      imageTypeFromExtension(extensionFromUri(sourceUri));
    if (!imageType) return null;

    return {
      imageMimeType: imageType.mimeType,
      imagePath: sourceUri,
      imageSize: input.imageSize ?? await fileSize(sourceUri),
    };
  }

  const directory = await productImageDirectory();
  const targetUri = `${directory}${cacheFileName(input, sourceUri)}`;
  if (!await localFileExists(targetUri)) {
    await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
  }

  const detected = await sniffSupportedImageType(targetUri);
  const imageType =
    detected ||
    imageTypeFromMimeType(input.imageMimeType) ||
    imageTypeFromExtension(extensionFromUri(targetUri));
  if (!imageType) return null;

  return {
    imageMimeType: imageType.mimeType,
    imagePath: targetUri,
    imageSize: input.imageSize ?? await fileSize(targetUri),
  };
}

async function cacheRemoteImage(input: ImageCacheInput, sourceUrl: string): Promise<CachedImageMetadata | null> {
  const directory = await productImageDirectory();
  const targetUri = `${directory}${cacheFileName(input, sourceUrl)}`;

  if (await localFileExists(targetUri)) {
    const detected = await sniffSupportedImageType(targetUri);
    const imageType =
      detected ||
      imageTypeFromMimeType(input.imageMimeType) ||
      imageTypeFromExtension(extensionFromUri(targetUri));
    if (!imageType) return null;

    return {
      imageMimeType: imageType.mimeType,
      imagePath: targetUri,
      imageSize: input.imageSize ?? await fileSize(targetUri),
    };
  }

  const result = await FileSystem.downloadAsync(sourceUrl, targetUri);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`download failed: ${result.status}`);
  }

  const contentType = headerValue(result.headers, 'content-type');
  const detected = await sniffSupportedImageType(result.uri);
  const imageType =
    detected ||
    imageTypeFromMimeType(contentType) ||
    imageTypeFromMimeType(input.imageMimeType) ||
    imageTypeFromExtension(extensionFromUri(result.uri));
  if (!imageType) return null;

  return {
    imageMimeType: imageType.mimeType,
    imagePath: result.uri,
    imageSize: await fileSize(result.uri),
  };
}

async function resolveCachedProductImage(input: ImageCacheInput): Promise<ImageCacheResult> {
  const notes: string[] = [];
  const existingPath = cleanText(input.imagePath);
  if (existingPath) {
    if (await localFileExists(existingPath)) {
      const detected = await sniffSupportedImageType(existingPath);
      const imageType =
        detected ||
        imageTypeFromMimeType(input.imageMimeType) ||
        imageTypeFromExtension(extensionFromUri(existingPath));
      if (!imageType) {
        return {
          cached: null,
          notes,
          reason: 'ชนิดไฟล์เดิมไม่รองรับ',
          source: 'existing',
          status: 'unsupported-type',
        };
      }

      return {
        cached: {
          imageMimeType: imageType.mimeType,
          imagePath: existingPath,
          imageSize: input.imageSize ?? await fileSize(existingPath),
        },
        notes,
        reason: null,
        source: 'existing',
        status: 'success',
      };
    }

    if (cleanText(input.imageUrl)) {
      notes.push('imagePath เดิมเปิดไม่ได้ -> ลอง imageUrl');
    } else {
      return {
        cached: null,
        notes,
        reason: 'imagePath เดิมเปิดไม่ได้',
        source: 'existing',
        status: 'failed',
      };
    }
  }

  const sourceUri = cleanText(input.imageUrl);
  if (!sourceUri) {
    return {
      cached: null,
      notes,
      reason: 'ไม่มี imagePath/imageUrl',
      source: 'none',
      status: 'missing-source',
    };
  }

  try {
    if (isLocalProductImagePath(sourceUri)) {
      const cached = await cacheLocalImage(input, sourceUri);
      return {
        cached,
        notes,
        reason: cached?.imagePath ? null : 'ชนิดไฟล์จากเครื่องไม่รองรับ',
        source: 'local',
        status: cached?.imagePath ? 'success' : 'unsupported-type',
      };
    }
    if (isHttpUrl(sourceUri)) {
      const cached = await cacheRemoteImage(input, sourceUri);
      return {
        cached,
        notes,
        reason: cached?.imagePath ? null : 'ชนิดไฟล์จาก URL ไม่รองรับ',
        source: 'remote',
        status: cached?.imagePath ? 'success' : 'unsupported-type',
      };
    }
  } catch (error) {
    return {
      cached: null,
      notes,
      reason: errorMessage(error),
      source: isLocalProductImagePath(sourceUri) ? 'local' : isHttpUrl(sourceUri) ? 'remote' : 'unsupported',
      status: 'failed',
    };
  }

  return {
    cached: null,
    notes,
    reason: 'ชนิดแหล่งรูปไม่รองรับ',
    source: 'unsupported',
    status: 'unsupported-source',
  };
}

export async function cacheProductImage(input: ImageCacheInput): Promise<CachedImageMetadata | null> {
  return (await resolveCachedProductImage(input)).cached;
}

export async function cacheProductImages<T extends ImageCacheInput>(
  products: T[],
  options: CacheProductImagesOptions = {}
): Promise<T[]> {
  const output: T[] = [];
  const sourceCounts: Record<ImageCacheSource, number> = {
    existing: 0,
    local: 0,
    remote: 0,
    none: 0,
    unsupported: 0,
  };
  const statusCounts: Record<ImageCacheStatus, number> = {
    success: 0,
    'missing-source': 0,
    'unsupported-source': 0,
    'unsupported-type': 0,
    failed: 0,
  };
  let detailLogCount = 0;

  const logDetail = (message: string): void => {
    if (!options.debugLog) return;
    if (detailLogCount < IMAGE_CACHE_DETAIL_LOG_LIMIT) {
      options.debugLog(message);
    } else if (detailLogCount === IMAGE_CACHE_DETAIL_LOG_LIMIT) {
      options.debugLog('cache รูป: ซ่อนรายละเอียดเพิ่มเติม เพื่อลด log รก');
    }
    detailLogCount += 1;
  };

  for (const product of products) {
    const result = await resolveCachedProductImage(product);
    const cached = result.cached;
    sourceCounts[result.source] += 1;
    statusCounts[result.status] += 1;

    for (const note of result.notes) {
      logDetail(`cache รูป: ${note} - ${productDebugName(product)}`);
    }

    if (!cached?.imagePath) {
      logDetail(`cache รูป: ${result.reason || 'ไม่สำเร็จ'} (${formatImageCacheSource(result.source)}) - ${productDebugName(product)}`);
      output.push(
        isLocalProductImagePath(product.imagePath) && cleanText(product.imageUrl)
          ? {
              ...product,
              imageMimeType: null,
              imagePath: null,
              imageSize: null,
            }
          : product
      );
      continue;
    }

    output.push({
      ...product,
      imageMimeType: product.imageMimeType ?? cached.imageMimeType,
      imagePath: cached.imagePath,
      imageSize: product.imageSize ?? cached.imageSize,
    });
  }

  if (options.debugLog && products.length > 0) {
    const failedCount = products.length - statusCounts.success;
    options.debugLog(
      `cache รูปสรุป: สำเร็จ ${statusCounts.success}/${products.length} ` +
      `(ไฟล์เดิม ${sourceCounts.existing}, ไฟล์เครื่อง ${sourceCounts.local}, URL ${sourceCounts.remote}), ` +
      `ไม่มีแหล่งรูป ${statusCounts['missing-source']}, ล้มเหลว ${failedCount}`
    );
  }

  return output;
}

export function stripLocalImagePathsForCloudSync(products: SyncAffiliateProductInput[]): SyncAffiliateProductInput[] {
  return products.map((product) => {
    const imagePath = cleanText(product.imagePath);
    if (!imagePath || isHttpUrl(imagePath)) {
      return product;
    }

    return {
      ...product,
      imagePath: null,
    };
  });
}

function productImageFileName(path: string | null | undefined): string | null {
  const clean = cleanText(path);
  if (!clean || !clean.startsWith('file://') || !clean.includes(`/${PRODUCT_IMAGE_DIRECTORY}/`)) {
    return null;
  }
  return clean.split('/').pop() || null;
}

// Delete cached product-image files that no product references anymore — images of removed
// products (rows are soft-deleted, so their files are never touched otherwise) and stale copies
// left behind when a product's source image URL changes. Pass the imagePaths of every ACTIVE
// product; anything else in the directory is treated as an orphan (subject to the grace window).
export async function sweepOrphanProductImages(
  referencedImagePaths: Iterable<string | null | undefined>,
  options: CacheProductImagesOptions = {}
): Promise<{ removed: number; freedBytes: number }> {
  const empty = { removed: 0, freedBytes: 0 };
  if (!FileSystem.documentDirectory) return empty;

  const directory = `${FileSystem.documentDirectory}${PRODUCT_IMAGE_DIRECTORY}/`;
  try {
    const dirInfo = await FileSystem.getInfoAsync(directory);
    if (!dirInfo.exists || !dirInfo.isDirectory) return empty;
  } catch {
    return empty;
  }

  const referenced = new Set<string>();
  for (const raw of referencedImagePaths) {
    const name = productImageFileName(raw);
    if (name) referenced.add(name);
  }

  let names: string[];
  try {
    names = await FileSystem.readDirectoryAsync(directory);
  } catch {
    return empty;
  }

  const now = Date.now();
  let removed = 0;
  let freedBytes = 0;
  for (const name of names) {
    if (referenced.has(name)) continue;
    const fileUri = `${directory}${name}`;
    try {
      const info = await FileSystem.getInfoAsync(fileUri);
      if (!info.exists || info.isDirectory) continue;
      const modifiedMs = typeof info.modificationTime === 'number' ? info.modificationTime * 1000 : 0;
      if (modifiedMs && now - modifiedMs < ORPHAN_SWEEP_GRACE_MS) continue;
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
      removed += 1;
      freedBytes += typeof info.size === 'number' ? info.size : 0;
    } catch {
      // best-effort — skip files we cannot stat/delete
    }
  }

  if (options.debugLog && removed > 0) {
    options.debugLog(`ล้างรูปสินค้าที่ไม่ใช้แล้ว ${removed} ไฟล์ (~${Math.round(freedBytes / 1024)} KB)`);
  }
  return { removed, freedBytes };
}

import { File } from 'expo-file-system';
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

const PRODUCT_IMAGE_DIRECTORY = 'product-images';
const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

type SupportedImageType = {
  extension: 'jpg' | 'png' | 'webp' | 'gif';
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
};

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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
  try {
    const bytes = await new File(uri).bytes();
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as ArrayBuffer);
    return imageTypeFromBytes(data);
  } catch {
    return null;
  }
}

function extensionFromUri(uri: string): string | null {
  const path = uri.split('?')[0]?.split('#')[0] ?? '';
  const match = path.match(/\.([a-z0-9]{2,5})$/i);
  const extension = match?.[1]?.toLowerCase();
  return extension && /^[a-z0-9]+$/.test(extension) ? extension : null;
}

function mimeTypeFromExtension(extension: string): string {
  return imageTypeFromExtension(extension)?.mimeType ?? 'image/jpeg';
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

export async function cacheProductImage(input: ImageCacheInput): Promise<CachedImageMetadata | null> {
  const existingPath = cleanText(input.imagePath);
  if (existingPath && await localFileExists(existingPath)) {
    const detected = await sniffSupportedImageType(existingPath);
    const imageType =
      detected ||
      imageTypeFromMimeType(input.imageMimeType) ||
      imageTypeFromExtension(extensionFromUri(existingPath));
    if (!imageType) return null;

    return {
      imageMimeType: imageType.mimeType,
      imagePath: existingPath,
      imageSize: input.imageSize ?? await fileSize(existingPath),
    };
  }

  const sourceUri = cleanText(input.imageUrl);
  if (!sourceUri) return null;

  try {
    if (isLocalProductImagePath(sourceUri)) {
      return await cacheLocalImage(input, sourceUri);
    }
    if (isHttpUrl(sourceUri)) {
      return await cacheRemoteImage(input, sourceUri);
    }
  } catch {
    return null;
  }

  return null;
}

export async function cacheProductImages<T extends ImageCacheInput>(products: T[]): Promise<T[]> {
  const output: T[] = [];

  for (const product of products) {
    const cached = await cacheProductImage(product);
    if (!cached?.imagePath) {
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

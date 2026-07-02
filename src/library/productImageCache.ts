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

function extensionFromMimeType(mimeType: string | null | undefined): string | null {
  const mime = cleanText(mimeType)?.toLowerCase();
  if (!mime) return null;
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  return null;
}

function extensionFromUri(uri: string): string | null {
  const path = uri.split('?')[0]?.split('#')[0] ?? '';
  const match = path.match(/\.([a-z0-9]{2,5})$/i);
  const extension = match?.[1]?.toLowerCase();
  return extension && /^[a-z0-9]+$/.test(extension) ? extension : null;
}

function mimeTypeFromExtension(extension: string): string {
  switch (extension.toLowerCase()) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg';
  }
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
    extensionFromUri(sourceUri) ||
    'jpg';
  const identity = cleanText(input.externalProductId) || cleanText(input.name) || sourceUri;
  return `product-${hashString(identity)}-${hashString(sourceUri)}.${extension}`;
}

async function cacheLocalImage(input: ImageCacheInput, sourceUri: string): Promise<CachedImageMetadata> {
  if (sourceUri.startsWith('file://') && await localFileExists(sourceUri)) {
    return {
      imageMimeType: input.imageMimeType ?? mimeTypeFromExtension(extensionFromUri(sourceUri) || 'jpg'),
      imagePath: sourceUri,
      imageSize: input.imageSize ?? await fileSize(sourceUri),
    };
  }

  const directory = await productImageDirectory();
  const targetUri = `${directory}${cacheFileName(input, sourceUri)}`;
  if (!await localFileExists(targetUri)) {
    await FileSystem.copyAsync({ from: sourceUri, to: targetUri });
  }

  return {
    imageMimeType: input.imageMimeType ?? mimeTypeFromExtension(extensionFromUri(targetUri) || 'jpg'),
    imagePath: targetUri,
    imageSize: input.imageSize ?? await fileSize(targetUri),
  };
}

async function cacheRemoteImage(input: ImageCacheInput, sourceUrl: string): Promise<CachedImageMetadata> {
  const directory = await productImageDirectory();
  const targetUri = `${directory}${cacheFileName(input, sourceUrl)}`;

  if (await localFileExists(targetUri)) {
    return {
      imageMimeType: input.imageMimeType ?? mimeTypeFromExtension(extensionFromUri(targetUri) || 'jpg'),
      imagePath: targetUri,
      imageSize: input.imageSize ?? await fileSize(targetUri),
    };
  }

  const result = await FileSystem.downloadAsync(sourceUrl, targetUri);
  if (result.status < 200 || result.status >= 300) {
    await FileSystem.deleteAsync(targetUri, { idempotent: true }).catch(() => undefined);
    throw new Error(`download failed: ${result.status}`);
  }

  const contentType = headerValue(result.headers, 'content-type');
  return {
    imageMimeType: extensionFromMimeType(contentType) ? contentType : input.imageMimeType ?? mimeTypeFromExtension(extensionFromUri(targetUri) || 'jpg'),
    imagePath: result.uri,
    imageSize: await fileSize(result.uri),
  };
}

export async function cacheProductImage(input: ImageCacheInput): Promise<CachedImageMetadata | null> {
  const existingPath = cleanText(input.imagePath);
  if (existingPath && await localFileExists(existingPath)) {
    return {
      imageMimeType: input.imageMimeType ?? mimeTypeFromExtension(extensionFromUri(existingPath) || 'jpg'),
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
      output.push(product);
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
    if (!isLocalProductImagePath(product.imagePath)) {
      return product;
    }

    return {
      ...product,
      imagePath: null,
    };
  });
}

import { readError } from '@/auth/api';
import { APP_TYPE, BACKEND_URL, CLIENT_APP } from '@/auth/constants';
import type { AuthApiResult } from '@/auth/types';
import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { cacheProductImages, stripLocalImagePathsForCloudSync } from '@/library/productImageCache';
import type { AffiliateProduct } from '@/library/types';

interface AffiliateProductsResponse {
  products?: AffiliateProduct[];
  error?: string;
}

interface DeleteAffiliateProductsResponse {
  success?: boolean;
  deleted?: number;
  requested?: number;
  error?: string;
}

export interface DeleteAffiliateProductKey {
  profileLocalId: string;
  platform?: string | null;
  externalProductId: string;
}

export interface SyncAffiliateProductInput {
  localId: string;
  profileLocalId: string;
  name: string;
  description?: string | null;
  externalProductId?: string | null;
  productUrl?: string | null;
  price?: string | null;
  stock?: number | null;
  caption?: string | null;
  hashtags?: string | null;
  cta?: string | null;
  imagePath?: string | null;
  imageR2Key?: string | null;
  imageUrl?: string | null;
  imageHash?: string | null;
  imageMimeType?: string | null;
  imageSize?: number | null;
  imageUploadedAt?: number | null;
  platform?: string | null;
  status?: string | null;
  scrapedAt?: number | null;
  localCreatedAt?: number | null;
  originApp?: string | null;
  originDeviceId?: string | null;
  createdByApp?: string | null;
  sourceDeviceId?: string | null;
  updatedByApp?: string | null;
  localUpdatedAt?: number | null;
}

interface SyncAffiliateProductsResponse {
  success?: boolean;
  synced?: {
    products?: number;
  };
  skippedDeleted?: number;
  skippedStale?: number;
  restoredDeleted?: number;
  error?: string;
}

interface AffiliateProductImageMeta {
  didUpload?: boolean;
  imageR2Key?: string | null;
  imageUrl?: string | null;
  imageHash?: string | null;
  imageMimeType?: string | null;
  imageSize?: number | null;
  imageUploadedAt?: number | null;
  error?: string;
}

export interface DeleteAffiliateProductsResult {
  deleted: number;
  requested: number;
}

export interface SyncAffiliateProductsResult {
  products: number;
  skippedDeleted: number;
  skippedStale: number;
  restoredDeleted: number;
  syncedProducts: SyncAffiliateProductInput[];
  uploadedImages: number;
}

/** Server caps DELETE at 500 localIds per request. */
const DELETE_CHUNK_SIZE = 500;
const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readUploadError(status: number, body: string | null | undefined): string {
  const text = body?.trim();
  if (!text) return `Upload failed (${status})`;

  try {
    const data = JSON.parse(text) as { error?: string; message?: string };
    return data.error || data.message || text;
  } catch {
    return text;
  }
}

function getFileExtension(value: string | null | undefined, fallback = 'jpg'): string {
  const source = cleanText(value) || '';
  const extension = source.split('?')[0]?.split('#')[0]?.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
  return extension && /^[a-z0-9]+$/.test(extension) ? extension : fallback;
}

function normalizeSupportedImageMimeType(value: string | null | undefined): string | null {
  const mimeType = cleanText(value)?.toLowerCase().split(';')[0]?.trim();
  if (!mimeType) return null;
  if (mimeType === 'image/jpg') return 'image/jpeg';
  return SUPPORTED_IMAGE_MIME_TYPES.has(mimeType) ? mimeType : null;
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/jpeg':
    default:
      return 'jpg';
  }
}

function getImageMimeType(imagePath: string, fallback?: string | null): string {
  const cleanFallback = normalizeSupportedImageMimeType(fallback);
  if (cleanFallback) {
    return cleanFallback;
  }

  switch (getFileExtension(imagePath)) {
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

function getUploadImageExtension(imagePath: string, mimeType: string): string {
  const byMime = extensionForMimeType(mimeType);
  const byPath = getFileExtension(imagePath, byMime);
  return normalizeSupportedImageMimeType(`image/${byPath}`) ? byPath : byMime;
}

async function getLocalFileSize(uri: string): Promise<number | null> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) return null;
    return typeof info.size === 'number' && Number.isFinite(info.size) ? info.size : null;
  } catch {
    return null;
  }
}

async function localImageExists(uri: string | null | undefined): Promise<boolean> {
  const imagePath = cleanText(uri);
  if (!imagePath) return false;

  try {
    const info = await FileSystem.getInfoAsync(imagePath);
    return info.exists && !info.isDirectory;
  } catch {
    return false;
  }
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256File(fileUri: string): Promise<string | null> {
  try {
    const bytes = await new File(fileUri).bytes();
    const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
    return arrayBufferToHex(digest);
  } catch {
    return null;
  }
}

async function uploadAffiliateProductImage(
  token: string,
  product: SyncAffiliateProductInput
): Promise<AffiliateProductImageMeta | null> {
  const imagePath = cleanText(product.imagePath);
  if (!imagePath || !await localImageExists(imagePath)) {
    return null;
  }

  const localHash = await sha256File(imagePath);
  if (
    localHash &&
    product.imageR2Key &&
    product.imageUrl &&
    product.imageHash === localHash &&
    product.imageMimeType &&
    product.imageSize &&
    product.imageUploadedAt
  ) {
    return {
      didUpload: false,
      imageR2Key: product.imageR2Key,
      imageUrl: product.imageUrl,
      imageHash: localHash,
      imageMimeType: product.imageMimeType,
      imageSize: product.imageSize,
      imageUploadedAt: typeof product.imageUploadedAt === 'number' ? product.imageUploadedAt : Number(product.imageUploadedAt),
    };
  }

  const mimeType = getImageMimeType(imagePath, product.imageMimeType);
  const extension = getUploadImageExtension(imagePath, mimeType);
  const response = await FileSystem.uploadAsync(`${BACKEND_URL}/api/user/affiliate-products/images`, imagePath, {
    fieldName: 'image',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Client-App': CLIENT_APP,
      'X-App-Type': APP_TYPE,
    },
    httpMethod: 'POST',
    mimeType,
    parameters: {
      profileLocalId: product.profileLocalId,
      localProductId: product.localId,
      fileName: `${product.localId}.${extension}`,
    },
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new ApiRequestError(readUploadError(response.status, response.body), response.status);
  }

  const data = JSON.parse(response.body || '{}') as AffiliateProductImageMeta;
  return {
    didUpload: true,
    imageR2Key: cleanText(data.imageR2Key),
    imageUrl: cleanText(data.imageUrl),
    imageHash: cleanText(data.imageHash) || localHash,
    imageMimeType: cleanText(data.imageMimeType) || mimeType,
    imageSize: typeof data.imageSize === 'number' ? data.imageSize : await getLocalFileSize(imagePath),
    imageUploadedAt: typeof data.imageUploadedAt === 'number' ? data.imageUploadedAt : Date.now(),
  };
}

async function uploadAffiliateProductImages(
  token: string,
  products: SyncAffiliateProductInput[]
): Promise<{ products: SyncAffiliateProductInput[]; uploadedImages: number }> {
  const output: SyncAffiliateProductInput[] = [];
  let uploadedImages = 0;

  for (const product of products) {
    let imageMeta: AffiliateProductImageMeta | null = null;
    try {
      imageMeta = await uploadAffiliateProductImage(token, product);
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        (error.status === 400 || error.status === 413 || error.status === 415)
      ) {
        output.push({
          ...product,
          imageMimeType: null,
          imagePath: null,
          imageSize: null,
        });
        continue;
      }
      throw error;
    }

    if (!imageMeta?.imageR2Key || !imageMeta.imageUrl) {
      output.push(product);
      continue;
    }

    if (imageMeta.didUpload) {
      uploadedImages += 1;
    }
    output.push({
      ...product,
      imageR2Key: imageMeta.imageR2Key,
      imageUrl: imageMeta.imageUrl,
      imageHash: imageMeta.imageHash ?? product.imageHash,
      imageMimeType: imageMeta.imageMimeType ?? product.imageMimeType,
      imageSize: imageMeta.imageSize ?? product.imageSize,
      imageUploadedAt: imageMeta.imageUploadedAt ?? product.imageUploadedAt,
    });
  }

  return { products: output, uploadedImages };
}

export async function fetchAffiliateProducts(
  token: string,
  options?: { profileLocalId?: string }
): Promise<AuthApiResult<AffiliateProduct[]>> {
  try {
    const params = new URLSearchParams({ limit: '5000' });
    if (options?.profileLocalId) {
      params.set('profileLocalId', options.profileLocalId);
    }

    const response = await fetch(`${BACKEND_URL}/api/user/affiliate-products?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Client-App': CLIENT_APP,
        'X-App-Type': APP_TYPE,
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data: null,
        error: await readError(response),
      };
    }

    const data = (await response.json()) as AffiliateProductsResponse;

    return {
      ok: true,
      status: response.status,
      data: Array.isArray(data.products) ? data.products : [],
      error: null,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'Online verification required. Please check your internet connection.',
    };
  }
}

/**
 * Tombstone-delete products on the server (DELETE /api/user/affiliate-products,
 * matched by localId — idempotent, so a 401-refresh retry can resend the same ids).
 * Chunks past the 500-id server cap and returns the summed { deleted, requested }
 * so the caller can detect partial success (deleted < requested).
 */
export async function deleteAffiliateProducts(
  token: string,
  localIds: string[],
  keys: DeleteAffiliateProductKey[] = []
): Promise<AuthApiResult<DeleteAffiliateProductsResult>> {
  try {
    let status = 200;
    let deleted = 0;
    let requested = 0;

    for (let index = 0; index < localIds.length; index += DELETE_CHUNK_SIZE) {
      const chunk = localIds.slice(index, index + DELETE_CHUNK_SIZE);
      const response = await fetch(`${BACKEND_URL}/api/user/affiliate-products`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Client-App': CLIENT_APP,
          'X-App-Type': APP_TYPE,
        },
        body: JSON.stringify({
          localIds: chunk,
          keys: index === 0 ? keys : [],
        }),
      });

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          data: null,
          error: await readError(response),
        };
      }

      const data = (await response.json()) as DeleteAffiliateProductsResponse;
      status = response.status;
      deleted += typeof data.deleted === 'number' ? data.deleted : 0;
      requested += typeof data.requested === 'number' ? data.requested : chunk.length;
    }

    return {
      ok: true,
      status,
      data: { deleted, requested },
      error: null,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'Online verification required. Please check your internet connection.',
    };
  }
}

export async function syncAffiliateProducts(
  token: string,
  payload: {
    deviceId: string;
    products: SyncAffiliateProductInput[];
    restoreDeleted?: boolean;
  }
): Promise<AuthApiResult<SyncAffiliateProductsResult>> {
  try {
    const cacheReadyProducts = await cacheProductImages(payload.products);
    const uploaded = await uploadAffiliateProductImages(token, cacheReadyProducts);
    const syncProducts = stripLocalImagePathsForCloudSync(uploaded.products);
    const response = await fetch(`${BACKEND_URL}/api/user/affiliate-products/sync`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Client-App': CLIENT_APP,
        'X-App-Type': APP_TYPE,
      },
      body: JSON.stringify({
        app: CLIENT_APP,
        appType: APP_TYPE,
        deviceId: payload.deviceId,
        mode: 'upsert',
        restoreDeleted: payload.restoreDeleted === true,
        products: syncProducts,
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data: null,
        error: await readError(response),
      };
    }

    const data = (await response.json()) as SyncAffiliateProductsResponse;

    return {
      ok: true,
      status: response.status,
      data: {
        products: data.synced?.products ?? syncProducts.length,
        skippedDeleted: data.skippedDeleted ?? 0,
        skippedStale: data.skippedStale ?? 0,
        restoredDeleted: data.restoredDeleted ?? 0,
        syncedProducts: uploaded.products,
        uploadedImages: uploaded.uploadedImages,
      },
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: error instanceof ApiRequestError ? error.status : 0,
      data: null,
      error: error instanceof Error ? error.message : 'Online verification required. Please check your internet connection.',
    };
  }
}

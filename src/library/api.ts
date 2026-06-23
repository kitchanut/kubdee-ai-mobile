import { readError } from '@/auth/api';
import { APP_TYPE, BACKEND_URL, CLIENT_APP } from '@/auth/constants';
import type { AuthApiResult } from '@/auth/types';
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

export interface DeleteAffiliateProductsResult {
  deleted: number;
  requested: number;
}

export interface SyncAffiliateProductsResult {
  products: number;
  skippedDeleted: number;
  skippedStale: number;
  restoredDeleted: number;
}

/** Server caps DELETE at 500 localIds per request. */
const DELETE_CHUNK_SIZE = 500;

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
  localIds: string[]
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
        body: JSON.stringify({ localIds: chunk }),
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
        products: payload.products,
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
        products: data.synced?.products ?? payload.products.length,
        skippedDeleted: data.skippedDeleted ?? 0,
        skippedStale: data.skippedStale ?? 0,
        restoredDeleted: data.restoredDeleted ?? 0,
      },
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

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

export interface DeleteAffiliateProductsResult {
  deleted: number;
  requested: number;
}

/** Server caps DELETE at 500 localIds per request. */
const DELETE_CHUNK_SIZE = 500;

export async function fetchAffiliateProducts(
  token: string,
  options?: { profileLocalId?: string }
): Promise<AuthApiResult<AffiliateProduct[]>> {
  try {
    const params = new URLSearchParams({ limit: '1000' });
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

import { readError } from '@/auth/api';
import { APP_TYPE, BACKEND_URL, CLIENT_APP } from '@/auth/constants';
import type { AuthApiResult } from '@/auth/types';
import type { AffiliateProduct } from '@/library/types';

interface AffiliateProductsResponse {
  products?: AffiliateProduct[];
  error?: string;
}

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

import { APP_TYPE, BACKEND_URL, OAUTH_SCHEME } from '@/auth/constants';
import type { AuthApiResult, AuthUser, StoredAuthTokens } from '@/auth/types';

interface RefreshResponse {
  accessToken?: string;
  user?: AuthUser;
  error?: string;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; message?: string };
    return body.error || body.message || response.statusText || 'Request failed';
  } catch {
    return response.statusText || 'Request failed';
  }
}

export async function fetchUserProfile(token: string): Promise<AuthApiResult<AuthUser>> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/user/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
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

    return {
      ok: true,
      status: response.status,
      data: (await response.json()) as AuthUser,
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

export async function refreshAuthToken(refreshToken: string): Promise<AuthApiResult<RefreshResponse>> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Type': APP_TYPE,
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data: null,
        error: await readError(response),
      };
    }

    return {
      ok: true,
      status: response.status,
      data: (await response.json()) as RefreshResponse,
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

export async function logoutSession(token: string): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-App-Type': APP_TYPE,
      },
      body: JSON.stringify({}),
    });
  } catch {
    // Local logout should continue even when the server call fails.
  }
}

export async function sendHeartbeat(token: string): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/api/user/heartbeat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-App-Type': APP_TYPE,
      },
      body: JSON.stringify({ activeWindows: 1 }),
    });
  } catch {
    // Heartbeat is best-effort.
  }
}

export function parseAuthCallbackUrl(url: string): StoredAuthTokens | null {
  const callbackPrefix = `${OAUTH_SCHEME}://auth/callback`;
  if (!url.startsWith(callbackPrefix)) {
    return null;
  }

  const queryStart = url.indexOf('?');
  if (queryStart < 0) {
    return null;
  }

  const query = url.slice(queryStart + 1).split('#')[0];
  const params = new URLSearchParams(query);
  const accessToken = params.get('token');

  if (!accessToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken: params.get('refreshToken'),
  };
}

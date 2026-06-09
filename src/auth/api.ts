import { APP_TYPE, BACKEND_URL, CLIENT_APP, OAUTH_SCHEME } from '@/auth/constants';
import type {
  AuthApiResult,
  AuthUser,
  StoredAuthTokens,
  SyncedProfile,
  SyncedProfileGroup,
  SyncedProfilesResponse,
} from '@/auth/types';

interface RefreshResponse {
  accessToken?: string;
  user?: AuthUser;
  error?: string;
}

type SyncEntity = 'profile_group' | 'profile';
type SyncOperation = 'upsert' | 'delete';

interface ProfileSyncGroupData {
  id?: unknown;
  name?: unknown;
  color?: unknown;
  icon?: unknown;
  sortOrder?: unknown;
  metadata?: unknown;
  originApp?: unknown;
  originDeviceId?: unknown;
  createdByApp?: unknown;
  sourceDeviceId?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  deletedAt?: unknown;
  version?: unknown;
}

interface ProfileSyncProfileData extends ProfileSyncGroupData {
  groupId?: unknown;
}

interface SyncChange {
  entity?: unknown;
  op?: unknown;
  id?: unknown;
  version?: unknown;
  updatedAt?: unknown;
  data?: ProfileSyncGroupData | ProfileSyncProfileData | null;
}

interface SyncPullResponse {
  success?: boolean;
  serverTime?: number;
  hasMore?: boolean;
  changes?: SyncChange[];
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

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function asTimestamp(value: unknown, fallback = 0): number {
  const numberValue = asNumber(value, fallback);
  if (numberValue <= 0) {
    return fallback;
  }

  return numberValue > 1_000_000_000_000 ? Math.floor(numberValue / 1000) : Math.floor(numberValue);
}

function asMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeEntity(value: unknown): SyncEntity | null {
  if (value === 'profile_group' || value === 'profile') {
    return value;
  }

  return null;
}

function normalizeOperation(value: unknown): SyncOperation {
  return value === 'delete' ? 'delete' : 'upsert';
}

function sortByOrderAndName<T extends { sortOrder?: number; name: string; updatedAt?: string | number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : 0;
    const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : 0;
    if (orderA !== orderB) {
      return orderA - orderB;
    }

    const nameCompare = a.name.localeCompare(b.name, 'th');
    if (nameCompare !== 0) {
      return nameCompare;
    }

    return Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0);
  });
}

function mapSyncGroup(change: SyncChange): SyncedProfileGroup | null {
  const data = change.data;
  if (!data || typeof data !== 'object') {
    return null;
  }

  const id = asString(data.id, asString(change.id));
  if (!id) {
    return null;
  }

  const updatedAt = asTimestamp(data.updatedAt ?? change.updatedAt);

  return {
    id,
    name: asString(data.name, 'ไม่มีชื่อกลุ่ม'),
    color: asOptionalString(data.color),
    icon: asOptionalString(data.icon),
    sortOrder: asNumber(data.sortOrder, 0),
    metadata: asMetadata(data.metadata),
    originApp: asOptionalString(data.originApp),
    originDeviceId: asOptionalString(data.originDeviceId),
    createdByApp: asOptionalString(data.createdByApp),
    sourceDeviceId: asOptionalString(data.sourceDeviceId),
    createdAt: asTimestamp(data.createdAt, updatedAt),
    updatedAt,
    deletedAt: data.deletedAt == null ? null : asTimestamp(data.deletedAt),
    version: asNumber(data.version ?? change.version, 1),
  };
}

function mapSyncProfile(change: SyncChange): SyncedProfile | null {
  const data = change.data;
  if (!data || typeof data !== 'object') {
    return null;
  }

  const id = asString(data.id, asString(change.id));
  if (!id) {
    return null;
  }

  const profileData = data as ProfileSyncProfileData;
  const groupId = asOptionalString(profileData.groupId);
  const updatedAt = asTimestamp(data.updatedAt ?? change.updatedAt);

  return {
    id,
    groupId,
    name: asString(data.name, 'ไม่มีชื่อโปรไฟล์'),
    color: asOptionalString(data.color),
    icon: asOptionalString(data.icon),
    sortOrder: asNumber(data.sortOrder, 0),
    metadata: asMetadata(data.metadata),
    originApp: asOptionalString(data.originApp),
    originDeviceId: asOptionalString(data.originDeviceId),
    createdByApp: asOptionalString(data.createdByApp),
    sourceDeviceId: asOptionalString(data.sourceDeviceId),
    createdAt: asTimestamp(data.createdAt, updatedAt),
    updatedAt,
    deletedAt: data.deletedAt == null ? null : asTimestamp(data.deletedAt),
    version: asNumber(data.version ?? change.version, 1),
  };
}

function mapSyncPullResponse(data: SyncPullResponse): SyncedProfilesResponse {
  const groupMap = new Map<string, SyncedProfileGroup>();
  const profileMap = new Map<string, SyncedProfile>();

  for (const change of Array.isArray(data.changes) ? data.changes : []) {
    const entity = normalizeEntity(change.entity);
    const op = normalizeOperation(change.op);
    const id = asString(change.id);

    if (!entity || !id) {
      continue;
    }

    if (entity === 'profile_group') {
      if (op === 'delete') {
        groupMap.delete(id);
        continue;
      }

      const group = mapSyncGroup(change);
      if (group && !group.deletedAt) {
        groupMap.set(group.id, group);
      }
      continue;
    }

    if (op === 'delete') {
      profileMap.delete(id);
      continue;
    }

    const profile = mapSyncProfile(change);
    if (profile && !profile.deletedAt) {
      profileMap.set(profile.id, profile);
    }
  }

  return {
    groups: sortByOrderAndName(Array.from(groupMap.values())),
    profiles: sortByOrderAndName(Array.from(profileMap.values())),
    serverTime: typeof data.serverTime === 'number' ? data.serverTime : null,
    hasMore: Boolean(data.hasMore),
  };
}

export async function fetchUserProfile(token: string): Promise<AuthApiResult<AuthUser>> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/user/me`, {
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

export async function fetchSyncedProfiles(token: string): Promise<AuthApiResult<SyncedProfilesResponse>> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/sync/pull?since=0&limit=1000`, {
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

    const data = (await response.json()) as SyncPullResponse;

    return {
      ok: true,
      status: response.status,
      data: mapSyncPullResponse(data),
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

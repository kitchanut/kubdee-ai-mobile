import { APP_TYPE, BACKEND_URL, CLIENT_APP, OAUTH_SCHEME } from '@/auth/constants';
import type {
  AuthApiResult,
  AuthUser,
  CreateSyncedProfileInput,
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
  deletedByDevice?: unknown;
  deletedByDeviceType?: unknown;
  deletedByApp?: unknown;
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

interface SyncPushResponse {
  success?: boolean;
  serverTime?: number;
  rejected?: Array<{
    index?: number;
    id?: string;
    entity?: string;
    reason?: string;
  }>;
  error?: string;
}

interface PushSyncedProfileChangeInput {
  token: string;
  deviceId: string;
  changes: SyncChange[];
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

function newSyncId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
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
    deletedByDevice: asOptionalString(data.deletedByDevice),
    deletedByDeviceType: asOptionalString(data.deletedByDeviceType),
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
    deletedByDevice: asOptionalString(data.deletedByDevice),
    deletedByDeviceType: asOptionalString(data.deletedByDeviceType),
    version: asNumber(data.version ?? change.version, 1),
  };
}

function mapSyncPullResponse(data: SyncPullResponse): SyncedProfilesResponse {
  const groupMap = new Map<string, SyncedProfileGroup>();
  const profileMap = new Map<string, SyncedProfile>();
  const deletedProfileMap = new Map<string, SyncedProfile>();

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

    const profile = mapSyncProfile(change);
    if (!profile) {
      continue;
    }

    if (op === 'delete' || profile.deletedAt) {
      profileMap.delete(id);
      deletedProfileMap.set(profile.id, profile);
      continue;
    }

    deletedProfileMap.delete(profile.id);
    profileMap.set(profile.id, profile);
  }

  return {
    groups: sortByOrderAndName(Array.from(groupMap.values())),
    profiles: sortByOrderAndName(Array.from(profileMap.values())),
    deletedProfiles: sortByOrderAndName(Array.from(deletedProfileMap.values())),
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

export async function createSyncedProfile(
  token: string,
  input: CreateSyncedProfileInput & { deviceId: string }
): Promise<AuthApiResult<SyncPushResponse>> {
  const name = input.name.trim();
  const newGroupName = input.newGroupName?.trim() ?? '';
  const now = Math.floor(Date.now() / 1000);
  const profileId = newSyncId();
  const changes: SyncChange[] = [];
  let groupId = input.groupId?.trim() || null;

  if (newGroupName) {
    groupId = newSyncId();
    changes.push({
      entity: 'profile_group',
      op: 'upsert',
      id: groupId,
      version: 1,
      updatedAt: now,
      data: {
        id: groupId,
        name: newGroupName,
        color: null,
        icon: 'folder',
        sortOrder: input.groupSortOrder ?? 0,
        metadata: { createdFrom: 'mobile' },
        originApp: 'mobile',
        originDeviceId: input.deviceId,
        createdByApp: 'mobile',
        sourceDeviceId: input.deviceId,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deletedByDevice: null,
        deletedByDeviceType: null,
        version: 1,
      },
    });
  }

  changes.push({
    entity: 'profile',
    op: 'upsert',
    id: profileId,
    version: 1,
    updatedAt: now,
    data: {
      id: profileId,
      groupId,
      name,
      color: null,
      icon: 'user',
      sortOrder: input.profileSortOrder ?? 0,
      metadata: { createdFrom: 'mobile' },
      originApp: 'mobile',
      originDeviceId: input.deviceId,
      createdByApp: 'mobile',
      sourceDeviceId: input.deviceId,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deletedByDevice: null,
      deletedByDeviceType: null,
      version: 1,
    },
  });

  return pushSyncedProfileChanges({ token, deviceId: input.deviceId, changes });
}

async function pushSyncedProfileChanges({
  token,
  deviceId,
  changes,
}: PushSyncedProfileChangeInput): Promise<AuthApiResult<SyncPushResponse>> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/sync/push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Client-App': CLIENT_APP,
        'X-App-Type': APP_TYPE,
      },
      body: JSON.stringify({
        deviceId,
        app: CLIENT_APP,
        appType: APP_TYPE,
        clientSchemaVersion: 2,
        changes,
      }),
    });
    let data: SyncPushResponse = {};
    try {
      data = (await response.json()) as SyncPushResponse;
    } catch {
      data = {};
    }

    const rejectedReason = Array.isArray(data.rejected) && data.rejected.length > 0
      ? data.rejected[0]?.reason
      : null;

    if (!response.ok || !data.success || rejectedReason) {
      return {
        ok: false,
        status: response.status,
        data: null,
        error: data.error || rejectedReason || response.statusText || 'สร้างโปรไฟล์ไม่สำเร็จ',
      };
    }

    return {
      ok: true,
      status: response.status,
      data,
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

export async function softDeleteSyncedProfile(
  token: string,
  input: { profile: SyncedProfile; deviceId: string }
): Promise<AuthApiResult<SyncPushResponse>> {
  const now = Math.floor(Date.now() / 1000);
  const profile = input.profile;

  return pushSyncedProfileChanges({
    token,
    deviceId: input.deviceId,
    changes: [
      {
        entity: 'profile',
        op: 'delete',
        id: profile.id,
        version: profile.version || 1,
        updatedAt: now,
        data: {
          ...profile,
          deletedAt: now,
          deletedByDevice: input.deviceId,
          deletedByDeviceType: CLIENT_APP,
          sourceDeviceId: input.deviceId,
          updatedAt: now,
        },
      },
    ],
  });
}

export async function restoreSyncedProfile(
  token: string,
  input: { profile: SyncedProfile; deviceId: string }
): Promise<AuthApiResult<SyncPushResponse>> {
  const now = Math.floor(Date.now() / 1000);
  const profile = input.profile;

  return pushSyncedProfileChanges({
    token,
    deviceId: input.deviceId,
    changes: [
      {
        entity: 'profile',
        op: 'upsert',
        id: profile.id,
        version: profile.version || 1,
        updatedAt: now,
        data: {
          ...profile,
          deletedAt: null,
          deletedByDevice: null,
          deletedByDeviceType: null,
          sourceDeviceId: input.deviceId,
          updatedAt: now,
        },
      },
    ],
  });
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

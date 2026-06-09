export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  role?: string | null;
  plan?: string | null;
  credits?: number | null;
  expiryDate?: number | string | null;
  maxDevices?: number | null;
  activeDevices?: number | null;
  oneclickPlan?: string | null;
  oneclickExpiry?: number | string | null;
  oneclickMaxDevices?: number | null;
  oneclickActiveDevices?: number | null;
}

export interface StoredAuthTokens {
  accessToken: string;
  refreshToken: string | null;
}

export interface SyncedProfileGroup {
  id: string;
  userId?: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
  originApp?: string | null;
  originDeviceId?: string | null;
  createdByApp?: string | null;
  sourceDeviceId?: string | null;
  createdAt?: string | number | null;
  updatedAt?: string | number | null;
  deletedAt?: string | number | null;
  version?: number;
}

export interface SyncedProfile {
  id: string;
  userId?: string;
  name: string;
  groupId?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
  metadata?: Record<string, unknown>;
  originApp?: string | null;
  originDeviceId?: string | null;
  createdByApp?: string | null;
  sourceDeviceId?: string | null;
  createdAt?: string | number | null;
  updatedAt?: string | number | null;
  deletedAt?: string | number | null;
  version?: number;
}

export interface SyncedProfilesResponse {
  groups: SyncedProfileGroup[];
  profiles: SyncedProfile[];
  serverTime?: number | null;
  hasMore?: boolean;
}

export interface AuthApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

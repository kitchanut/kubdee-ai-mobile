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
  userId: string;
  localId: number;
  name: string;
  color?: string | null;
  icon?: string | null;
  createdAt?: string | number | null;
}

export interface SyncedProfile {
  id: string;
  userId: string;
  localId: string;
  name: string;
  groupLocalId?: number | null;
  createdAt?: string | number | null;
}

export interface SyncedProfileCredential {
  id: string;
  userId: string;
  profileLocalId: string;
  website: string;
  websiteUrl?: string | null;
  username?: string | null;
  password?: string | null;
  notes?: string | null;
  createdAt?: string | number | null;
}

export interface SyncedProfilesResponse {
  groups: SyncedProfileGroup[];
  profiles: SyncedProfile[];
  credentials: SyncedProfileCredential[];
}

export interface AuthApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

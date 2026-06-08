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

export interface AuthApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

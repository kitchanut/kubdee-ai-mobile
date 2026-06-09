import * as SecureStore from 'expo-secure-store';

import type { StoredAuthTokens } from '@/auth/types';

const ACCESS_TOKEN_KEY = 'kubdee_ai_mobile_access_token';
const REFRESH_TOKEN_KEY = 'kubdee_ai_mobile_refresh_token';
const SYNC_DEVICE_ID_KEY = 'kubdee_ai_mobile_sync_device_id';

function createDeviceId(): string {
  return `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function getStoredAuthTokens(): Promise<StoredAuthTokens | null> {
  const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  if (!accessToken) {
    return null;
  }

  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  return { accessToken, refreshToken };
}

export async function saveStoredAuthTokens(tokens: StoredAuthTokens): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken);
  } else {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  }
}

export async function clearStoredAuthTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function getOrCreateSyncDeviceId(): Promise<string> {
  const storedDeviceId = await SecureStore.getItemAsync(SYNC_DEVICE_ID_KEY);
  if (storedDeviceId) {
    return storedDeviceId;
  }

  const deviceId = createDeviceId();
  await SecureStore.setItemAsync(SYNC_DEVICE_ID_KEY, deviceId);
  return deviceId;
}

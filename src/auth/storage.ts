import * as SecureStore from 'expo-secure-store';

import type { StoredAuthTokens } from '@/auth/types';

const ACCESS_TOKEN_KEY = 'kubdee_ai_mobile_access_token';
const REFRESH_TOKEN_KEY = 'kubdee_ai_mobile_refresh_token';
const SYNC_DEVICE_ID_KEY = 'kubdee_ai_mobile_sync_device_id';
const DELETED_PROFILE_CONFIRMATIONS_KEY = 'kubdee_ai_mobile_deleted_profile_confirmations';

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

export async function getDeletedProfileConfirmations(): Promise<Record<string, number>> {
  const raw = await SecureStore.getItemAsync(DELETED_PROFILE_CONFIRMATIONS_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const confirmations: Record<string, number> = {};
    for (const [profileId, deletedAt] of Object.entries(parsed)) {
      const timestamp = Number(deletedAt);
      if (profileId && Number.isFinite(timestamp) && timestamp > 0) {
        confirmations[profileId] = Math.floor(timestamp);
      }
    }
    return confirmations;
  } catch {
    return {};
  }
}

export async function confirmDeletedProfile(profileId: string, deletedAt: number): Promise<void> {
  if (!profileId || deletedAt <= 0) {
    return;
  }

  const confirmations = await getDeletedProfileConfirmations();
  confirmations[profileId] = Math.floor(deletedAt);
  await SecureStore.setItemAsync(DELETED_PROFILE_CONFIRMATIONS_KEY, JSON.stringify(confirmations));
}

export async function clearDeletedProfileConfirmation(profileId: string): Promise<void> {
  if (!profileId) {
    return;
  }

  const confirmations = await getDeletedProfileConfirmations();
  if (!(profileId in confirmations)) {
    return;
  }

  delete confirmations[profileId];
  await SecureStore.setItemAsync(DELETED_PROFILE_CONFIRMATIONS_KEY, JSON.stringify(confirmations));
}

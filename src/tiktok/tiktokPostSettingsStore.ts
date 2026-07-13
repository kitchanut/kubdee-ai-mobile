import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TikTokPostAction } from '@/tiktok/tiktokPostScript';

const TIKTOK_POST_SETTINGS_KEY = 'kubdee_ai_mobile_tiktok_post_settings_v1';

export interface TikTokPostSettings {
  postAction: TikTokPostAction;
  enableProductLink: boolean;
}

export const DEFAULT_TIKTOK_POST_SETTINGS: TikTokPostSettings = {
  postAction: 'publish',
  enableProductLink: true,
};

function normalizeTikTokPostSettings(value: unknown): TikTokPostSettings {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<TikTokPostSettings>;
  return {
    postAction: raw.postAction === 'draft' ? 'draft' : 'publish',
    enableProductLink:
      typeof raw.enableProductLink === 'boolean'
        ? raw.enableProductLink
        : DEFAULT_TIKTOK_POST_SETTINGS.enableProductLink,
  };
}

export async function getTikTokPostSettings(): Promise<TikTokPostSettings> {
  try {
    const raw = await AsyncStorage.getItem(TIKTOK_POST_SETTINGS_KEY);
    return raw
      ? normalizeTikTokPostSettings(JSON.parse(raw) as unknown)
      : { ...DEFAULT_TIKTOK_POST_SETTINGS };
  } catch {
    return { ...DEFAULT_TIKTOK_POST_SETTINGS };
  }
}

export async function saveTikTokPostSettings(settings: TikTokPostSettings): Promise<void> {
  await AsyncStorage.setItem(
    TIKTOK_POST_SETTINGS_KEY,
    JSON.stringify(normalizeTikTokPostSettings(settings))
  );
}

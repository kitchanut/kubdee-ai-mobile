import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TabId } from '@/types/navigation';

const PENDING_TAB_STORAGE_KEY = 'kubdee_ai_mobile_pending_tab';

export async function storePendingTab(tab: TabId): Promise<void> {
  await AsyncStorage.setItem(PENDING_TAB_STORAGE_KEY, tab);
}

export async function consumePendingTab(): Promise<TabId | null> {
  const tab = await AsyncStorage.getItem(PENDING_TAB_STORAGE_KEY);
  await AsyncStorage.removeItem(PENDING_TAB_STORAGE_KEY);
  return isTabId(tab) ? tab : null;
}

export function tabFromUrl(url: string | null | undefined): TabId | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const target = parsed.searchParams.get('tab') || parsed.hostname || parsed.pathname.replace(/^\/+/, '');
    return isTabId(target) ? target : null;
  } catch {
    const match = url.match(/^kubdeeai:\/\/([^/?#]+)/i) || url.match(/[?&]tab=([^&#]+)/i);
    return isTabId(match?.[1]) ? match[1] : null;
  }
}

function isTabId(value: string | null | undefined): value is TabId {
  return (
    value === 'pipeline' ||
    value === 'image-create' ||
    value === 'tiktok' ||
    value === 'shopee' ||
    value === 'youtube' ||
    value === 'facebook' ||
    value === 'library' ||
    value === 'profile' ||
    value === 'mobile' ||
    value === 'logs'
  );
}

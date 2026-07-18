import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TikTokPostAction } from '@/tiktok/tiktokPostScript';

const TIKTOK_POST_SETTINGS_KEY = 'kubdee_ai_mobile_tiktok_post_settings_v1';

export type TikTokScheduleMode = 'now' | 'schedule';
export type TikTokFirstPostTimeMode = 'offset' | 'custom';
export type TikTokSoundMode = 'tab' | 'search';
export type TikTokSoundTab = 'for_you' | 'favorites' | 'unlimited' | 'recent_use';
export type TikTokSoundSearchOrder = 'sequential' | 'random';

// โครง settings เทียบเท่า desktop useTikTokSettings — ค่า default ทุกฟีเจอร์ใหม่ = ปิด
// เพื่อให้ flow เดิมที่ผ่านการทดสอบแล้วทำงานเหมือนเดิมจนกว่าผู้ใช้จะเปิดเอง
export interface TikTokPostSettings {
  postAction: TikTokPostAction;
  enableProductLink: boolean;
  // เวลาโพสต์
  scheduleMode: TikTokScheduleMode;
  interval: string;
  intervalVariation: number;
  firstPostTimeMode: TikTokFirstPostTimeMode;
  firstPostOffset: string;
  firstPostCustomDate: string;
  firstPostCustomHour: string;
  firstPostCustomMinute: string;
  // AI คิดเนื้อหา
  aiGenerateCaption: boolean;
  aiGenerateHashtags: boolean;
  aiGenerateCta: boolean;
  aiHashtagCount: number;
  // เสียง + duplicate clip
  enableSound: boolean;
  soundMode: TikTokSoundMode;
  soundTab: TikTokSoundTab;
  soundSearchList: string[];
  soundSearchOrder: TikTokSoundSearchOrder;
  soundIndex: number;
  soundVideoVolume: number;
  soundMusicVolume: number;
  duplicateClipCount: number;
}

export const DEFAULT_TIKTOK_POST_SETTINGS: TikTokPostSettings = {
  postAction: 'publish',
  enableProductLink: true,
  scheduleMode: 'now',
  interval: '30m',
  intervalVariation: 0,
  firstPostTimeMode: 'offset',
  firstPostOffset: '30m',
  firstPostCustomDate: '',
  firstPostCustomHour: '10',
  firstPostCustomMinute: '00',
  aiGenerateCaption: false,
  aiGenerateHashtags: false,
  aiGenerateCta: false,
  aiHashtagCount: 3,
  enableSound: false,
  soundMode: 'tab',
  soundTab: 'for_you',
  soundSearchList: [''],
  soundSearchOrder: 'sequential',
  soundIndex: 0,
  soundVideoVolume: -60,
  soundMusicVolume: 0,
  duplicateClipCount: 0,
};

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function pickBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function pickInt(value: unknown, fallback: number, min: number, max: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, num));
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeTikTokPostSettings(value: unknown): TikTokPostSettings {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<TikTokPostSettings>;
  const d = DEFAULT_TIKTOK_POST_SETTINGS;
  return {
    postAction: raw.postAction === 'draft' ? 'draft' : 'publish',
    enableProductLink: pickBool(raw.enableProductLink, d.enableProductLink),
    scheduleMode: pickEnum(raw.scheduleMode, ['now', 'schedule'], d.scheduleMode),
    interval: pickString(raw.interval, d.interval) || d.interval,
    intervalVariation: pickInt(raw.intervalVariation, d.intervalVariation, 0, 20),
    firstPostTimeMode: pickEnum(raw.firstPostTimeMode, ['offset', 'custom'], d.firstPostTimeMode),
    firstPostOffset: pickString(raw.firstPostOffset, d.firstPostOffset) || d.firstPostOffset,
    firstPostCustomDate: pickString(raw.firstPostCustomDate, d.firstPostCustomDate),
    firstPostCustomHour: pickString(raw.firstPostCustomHour, d.firstPostCustomHour),
    firstPostCustomMinute: pickString(raw.firstPostCustomMinute, d.firstPostCustomMinute),
    aiGenerateCaption: pickBool(raw.aiGenerateCaption, d.aiGenerateCaption),
    aiGenerateHashtags: pickBool(raw.aiGenerateHashtags, d.aiGenerateHashtags),
    aiGenerateCta: pickBool(raw.aiGenerateCta, d.aiGenerateCta),
    aiHashtagCount: pickInt(raw.aiHashtagCount, d.aiHashtagCount, 1, 10),
    enableSound: pickBool(raw.enableSound, d.enableSound),
    soundMode: pickEnum(raw.soundMode, ['tab', 'search'], d.soundMode),
    soundTab: pickEnum(raw.soundTab, ['for_you', 'favorites', 'unlimited', 'recent_use'], d.soundTab),
    soundSearchList: Array.isArray(raw.soundSearchList)
      ? raw.soundSearchList.filter((item): item is string => typeof item === 'string')
      : [...d.soundSearchList],
    soundSearchOrder: pickEnum(raw.soundSearchOrder, ['sequential', 'random'], d.soundSearchOrder),
    soundIndex: pickInt(raw.soundIndex, d.soundIndex, 0, 10),
    soundVideoVolume: pickInt(raw.soundVideoVolume, d.soundVideoVolume, -60, 20),
    soundMusicVolume: pickInt(raw.soundMusicVolume, d.soundMusicVolume, -60, 20),
    duplicateClipCount: pickInt(raw.duplicateClipCount, d.duplicateClipCount, 0, 5),
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

// ─── ตัวเลือกสำหรับ UI (ตรงกับ desktop useTikTokSettings) ────────────────────

export const TIKTOK_INTERVAL_OPTIONS: { label: string; value: string }[] = [
  { label: '5 นาที', value: '5m' },
  { label: '10 นาที', value: '10m' },
  { label: '15 นาที', value: '15m' },
  { label: '20 นาที', value: '20m' },
  { label: '30 นาที', value: '30m' },
  { label: '45 นาที', value: '45m' },
  { label: '1 ชั่วโมง', value: '1h' },
  { label: '2 ชั่วโมง', value: '2h' },
  { label: '3 ชั่วโมง', value: '3h' },
  { label: '4 ชั่วโมง', value: '4h' },
  { label: '6 ชั่วโมง', value: '6h' },
  { label: '12 ชั่วโมง', value: '12h' },
  { label: '1 วัน', value: '1d' },
  { label: '2 วัน', value: '2d' },
  { label: '3 วัน', value: '3d' },
  { label: '5 วัน', value: '5d' },
  { label: '7 วัน', value: '7d' },
  { label: '14 วัน', value: '14d' },
];

export const TIKTOK_VARIATION_OPTIONS: { label: string; value: number }[] = [
  { label: 'ไม่สุ่ม', value: 0 },
  { label: '±5 นาที', value: 5 },
  { label: '±10 นาที', value: 10 },
  { label: '±15 นาที', value: 15 },
  { label: '±20 นาที', value: 20 },
];

export const TIKTOK_FIRST_POST_OFFSET_OPTIONS: { label: string; value: string }[] = [
  { label: '+30 นาที', value: '30m' },
  { label: '+45 นาที', value: '45m' },
  { label: '+1 ชั่วโมง', value: '1h' },
  { label: '+2 ชั่วโมง', value: '2h' },
  { label: '+3 ชั่วโมง', value: '3h' },
  { label: '+6 ชั่วโมง', value: '6h' },
  { label: '+12 ชั่วโมง', value: '12h' },
  { label: '+1 วัน', value: '1d' },
];

export const TIKTOK_SOUND_TAB_OPTIONS: { label: string; value: TikTokSoundTab }[] = [
  { label: 'For You', value: 'for_you' },
  { label: 'Favorites', value: 'favorites' },
  { label: 'Unlimited', value: 'unlimited' },
  { label: 'Recent', value: 'recent_use' },
];

export const TIKTOK_HOUR_OPTIONS: string[] = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, '0')
);
export const TIKTOK_MINUTE_OPTIONS: string[] = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, '0')
);

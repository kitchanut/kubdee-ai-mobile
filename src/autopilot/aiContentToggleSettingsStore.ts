import AsyncStorage from '@react-native-async-storage/async-storage';

// Factory ทั่วไปสำหรับตั้งค่า "AI คิด Caption/Hashtags" ต่อหน้าโพสต์ (Shopee, Social ฯลฯ)
// แต่ละหน้าเรียก createAiContentToggleSettingsStore(storageKey) ของตัวเอง ค่าไม่ปนกัน
export interface AiContentToggleSettings {
  aiGenerateCaption: boolean;
  aiGenerateHashtags: boolean;
  aiHashtagCount: number;
  // false (default) = คิดเฉพาะคลิปที่ยังไม่มี caption/hashtags — ไม่เขียนทับของที่ผู้ใช้ตั้งใจแก้เอง
  // true = คิดใหม่ทับของเดิมทุกคลิปที่เปิด toggle ไว้
  aiOverwriteExisting: boolean;
}

export const DEFAULT_AI_CONTENT_TOGGLE_SETTINGS: AiContentToggleSettings = {
  aiGenerateCaption: false,
  aiGenerateHashtags: false,
  aiHashtagCount: 3,
  aiOverwriteExisting: false,
};

function normalizeAiContentToggleSettings(value: unknown): AiContentToggleSettings {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<AiContentToggleSettings>;
  const hashtagCount = Number(raw.aiHashtagCount);
  return {
    aiGenerateCaption: typeof raw.aiGenerateCaption === 'boolean' ? raw.aiGenerateCaption : DEFAULT_AI_CONTENT_TOGGLE_SETTINGS.aiGenerateCaption,
    aiGenerateHashtags: typeof raw.aiGenerateHashtags === 'boolean' ? raw.aiGenerateHashtags : DEFAULT_AI_CONTENT_TOGGLE_SETTINGS.aiGenerateHashtags,
    aiHashtagCount: Number.isFinite(hashtagCount) && hashtagCount >= 1 && hashtagCount <= 5
      ? hashtagCount
      : DEFAULT_AI_CONTENT_TOGGLE_SETTINGS.aiHashtagCount,
    aiOverwriteExisting: typeof raw.aiOverwriteExisting === 'boolean' ? raw.aiOverwriteExisting : DEFAULT_AI_CONTENT_TOGGLE_SETTINGS.aiOverwriteExisting,
  };
}

export function createAiContentToggleSettingsStore(storageKey: string): {
  get: () => Promise<AiContentToggleSettings>;
  save: (settings: AiContentToggleSettings) => Promise<void>;
} {
  return {
    async get(): Promise<AiContentToggleSettings> {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw) {
          return { ...DEFAULT_AI_CONTENT_TOGGLE_SETTINGS };
        }
        return normalizeAiContentToggleSettings(JSON.parse(raw) as unknown);
      } catch {
        return { ...DEFAULT_AI_CONTENT_TOGGLE_SETTINGS };
      }
    },
    async save(settings: AiContentToggleSettings): Promise<void> {
      await AsyncStorage.setItem(storageKey, JSON.stringify(normalizeAiContentToggleSettings(settings)));
    },
  };
}

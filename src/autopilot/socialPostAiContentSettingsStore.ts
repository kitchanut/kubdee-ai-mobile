import { DEFAULT_AI_CONTENT_TOGGLE_SETTINGS, createAiContentToggleSettingsStore } from '@/autopilot/aiContentToggleSettingsStore';
import type { AiContentToggleSettings } from '@/autopilot/aiContentToggleSettingsStore';

// ตั้งค่า AI คิด Caption/Hashtags ของหน้าโพสต์ Facebook/Instagram/YouTube (SocialPostScreen เดียวกัน
// ใช้ร่วมกันทั้ง 3 แพลตฟอร์ม เพราะ caption/hashtags มาจาก field เดียวกันบน GeneratedMediaAsset)
const SOCIAL_POST_AI_CONTENT_SETTINGS_KEY = 'kubdee_ai_mobile_social_post_ai_content_settings_v1';

export type SocialPostAiContentSettings = AiContentToggleSettings;
export const DEFAULT_SOCIAL_POST_AI_CONTENT_SETTINGS: SocialPostAiContentSettings = DEFAULT_AI_CONTENT_TOGGLE_SETTINGS;

const store = createAiContentToggleSettingsStore(SOCIAL_POST_AI_CONTENT_SETTINGS_KEY);
export const getSocialPostAiContentSettings = store.get;
export const saveSocialPostAiContentSettings = store.save;

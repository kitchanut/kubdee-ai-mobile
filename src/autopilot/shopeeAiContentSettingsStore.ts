import { DEFAULT_AI_CONTENT_TOGGLE_SETTINGS, createAiContentToggleSettingsStore } from '@/autopilot/aiContentToggleSettingsStore';
import type { AiContentToggleSettings } from '@/autopilot/aiContentToggleSettingsStore';

// ตั้งค่า AI คิด Caption/Hashtags เฉพาะหน้าโพสต์ Shopee — แยกจาก AutoPilotSettings เต็มรูปแบบ
// (ไม่เอา CTA/เสียง/ตารางเวลามาด้วย ตามสโคปที่เอามาจาก TikTok desktop settings แค่บางส่วน)
const SHOPEE_AI_CONTENT_SETTINGS_KEY = 'kubdee_ai_mobile_shopee_ai_content_settings_v1';

export type ShopeeAiContentSettings = AiContentToggleSettings;
export const DEFAULT_SHOPEE_AI_CONTENT_SETTINGS: ShopeeAiContentSettings = DEFAULT_AI_CONTENT_TOGGLE_SETTINGS;

const store = createAiContentToggleSettingsStore(SHOPEE_AI_CONTENT_SETTINGS_KEY);
export const getShopeeAiContentSettings = store.get;
export const saveShopeeAiContentSettings = store.save;

import AsyncStorage from '@react-native-async-storage/async-storage';

// ตั้งค่า "สมอง" (AI provider/model) — mirror จาก kubdee-ai-desktop SettingsModal (tab "สมอง")
// ทุก request วิ่งผ่าน KUBDEE backend (/api/v1/ai/generate) — provider/model เป็นแค่ pass-through
const AI_BRAIN_SETTINGS_KEY = 'kubdee_ai_mobile_ai_brain_settings_v1';

export type AiProvider = 'gemini' | 'openai';

export type GeminiModel =
  | 'gemini-2.0-flash'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | 'gemini-3-flash-preview'
  | 'gemini-3.1-flash-lite-preview'
  | 'gemini-3.1-pro-preview';

export type OpenAIModel = 'gpt-4o-mini' | 'gpt-4o' | 'gpt-4.1-mini' | 'gpt-4.1' | 'gpt-5-mini' | 'gpt-5';

export interface AiBrainSettings {
  aiProvider: AiProvider;
  geminiModel: GeminiModel;
  openaiModel: OpenAIModel;
}

export const AI_PROVIDER_OPTIONS: Array<{ value: AiProvider; label: string }> = [
  { value: 'gemini', label: 'Gemini (Google)' },
  { value: 'openai', label: 'OpenAI (GPT)' },
];

export const GEMINI_MODEL_OPTIONS: Array<{ value: GeminiModel; label: string }> = [
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
  { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite (Preview)' },
  { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)' },
];

export const OPENAI_MODEL_OPTIONS: Array<{ value: OpenAIModel; label: string }> = [
  { value: 'gpt-4o-mini', label: 'GPT-4o mini' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gpt-5-mini', label: 'GPT-5 mini' },
  { value: 'gpt-5', label: 'GPT-5' },
];

// ค่า default ตรงกับพฤติกรรมเดิมของ mobile (เคย hardcode gemini-2.5-flash)
export const DEFAULT_AI_BRAIN_SETTINGS: AiBrainSettings = {
  aiProvider: 'gemini',
  geminiModel: 'gemini-2.5-flash',
  openaiModel: 'gpt-4o-mini',
};

function isValue<T extends string>(options: Array<{ value: T; label: string }>, value: unknown): value is T {
  return typeof value === 'string' && options.some((option) => option.value === value);
}

function normalizeAiBrainSettings(value: unknown): AiBrainSettings {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<AiBrainSettings>;
  return {
    aiProvider: isValue(AI_PROVIDER_OPTIONS, raw.aiProvider)
      ? raw.aiProvider
      : DEFAULT_AI_BRAIN_SETTINGS.aiProvider,
    geminiModel: isValue(GEMINI_MODEL_OPTIONS, raw.geminiModel)
      ? raw.geminiModel
      : DEFAULT_AI_BRAIN_SETTINGS.geminiModel,
    openaiModel: isValue(OPENAI_MODEL_OPTIONS, raw.openaiModel)
      ? raw.openaiModel
      : DEFAULT_AI_BRAIN_SETTINGS.openaiModel,
  };
}

export async function getAiBrainSettings(): Promise<AiBrainSettings> {
  try {
    const raw = await AsyncStorage.getItem(AI_BRAIN_SETTINGS_KEY);
    if (!raw) {
      return { ...DEFAULT_AI_BRAIN_SETTINGS };
    }
    return normalizeAiBrainSettings(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_AI_BRAIN_SETTINGS };
  }
}

export async function saveAiBrainSettings(settings: AiBrainSettings): Promise<void> {
  await AsyncStorage.setItem(AI_BRAIN_SETTINGS_KEY, JSON.stringify(normalizeAiBrainSettings(settings)));
}

// เลือก model ตาม provider ที่ active — เทียบ pickModel() ใน desktop aiService.ts
export function pickAiBrainModel(settings: AiBrainSettings): string {
  return settings.aiProvider === 'openai' ? settings.openaiModel : settings.geminiModel;
}

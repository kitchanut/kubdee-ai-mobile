import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AutoPilotImageSettings, AutoPilotVideoSettings } from '@/autopilot/types';

const AUTO_PILOT_SETTINGS_PRESETS_KEY = 'kubdee_ai_mobile_auto_settings_presets_v1';

export interface AutoPilotSettingsPreset {
  id: string;
  name: string;
  imageSettings: AutoPilotImageSettings;
  videoSettings: AutoPilotVideoSettings;
  createdAt: number;
}

function createPresetId(): string {
  return `mobile-settings-preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isSettingsPreset(value: unknown): value is AutoPilotSettingsPreset {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const preset = value as Partial<AutoPilotSettingsPreset>;
  return (
    typeof preset.id === 'string' &&
    typeof preset.name === 'string' &&
    typeof preset.imageSettings === 'object' &&
    typeof preset.videoSettings === 'object' &&
    typeof preset.createdAt === 'number'
  );
}

async function readAllSettingsPresets(): Promise<AutoPilotSettingsPreset[]> {
  const raw = await AsyncStorage.getItem(AUTO_PILOT_SETTINGS_PRESETS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isSettingsPreset) : [];
  } catch {
    return [];
  }
}

async function writeAllSettingsPresets(presets: AutoPilotSettingsPreset[]): Promise<void> {
  await AsyncStorage.setItem(AUTO_PILOT_SETTINGS_PRESETS_KEY, JSON.stringify(presets));
}

export async function getAutoPilotSettingsPresets(): Promise<AutoPilotSettingsPreset[]> {
  const presets = await readAllSettingsPresets();
  return presets.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveAutoPilotSettingsPreset(input: {
  name: string;
  imageSettings: AutoPilotImageSettings;
  videoSettings: AutoPilotVideoSettings;
}): Promise<AutoPilotSettingsPreset> {
  const preset: AutoPilotSettingsPreset = {
    id: createPresetId(),
    name: input.name.trim(),
    imageSettings: { ...input.imageSettings },
    videoSettings: { ...input.videoSettings },
    createdAt: Date.now(),
  };

  // ชื่อซ้ำ = บันทึกทับตัวเดิม (upsert) — กันรายการชื่อเดียวกันซ้อนกันจนแยกไม่ออก
  const presets = (await readAllSettingsPresets()).filter(
    (existing) => existing.name.trim().toLowerCase() !== preset.name.toLowerCase()
  );
  await writeAllSettingsPresets([preset, ...presets].slice(0, 50));
  return preset;
}

export async function deleteAutoPilotSettingsPreset(presetId: string): Promise<void> {
  const presets = await readAllSettingsPresets();
  await writeAllSettingsPresets(presets.filter((preset) => preset.id !== presetId));
}

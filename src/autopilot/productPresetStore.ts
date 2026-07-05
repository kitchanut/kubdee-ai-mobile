import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AutoPilotProductSettings } from '@/autopilot/types';

const AUTO_PILOT_PRODUCT_PRESETS_KEY = 'kubdee_ai_mobile_auto_product_presets_v1';

export interface AutoPilotProductPreset {
  id: string;
  name: string;
  profileLocalId: string;
  productIds: string[];
  settingsByProductId: Record<string, AutoPilotProductSettings>;
  createdAt: number;
}

function createPresetId(): string {
  return `mobile-product-preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isProductPreset(value: unknown): value is AutoPilotProductPreset {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const preset = value as Partial<AutoPilotProductPreset>;
  return (
    typeof preset.id === 'string' &&
    typeof preset.name === 'string' &&
    typeof preset.profileLocalId === 'string' &&
    Array.isArray(preset.productIds) &&
    typeof preset.settingsByProductId === 'object' &&
    typeof preset.createdAt === 'number'
  );
}

async function readAllProductPresets(): Promise<AutoPilotProductPreset[]> {
  const raw = await AsyncStorage.getItem(AUTO_PILOT_PRODUCT_PRESETS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isProductPreset) : [];
  } catch {
    return [];
  }
}

async function writeAllProductPresets(presets: AutoPilotProductPreset[]): Promise<void> {
  await AsyncStorage.setItem(AUTO_PILOT_PRODUCT_PRESETS_KEY, JSON.stringify(presets));
}

export async function getAutoPilotProductPresets(profileLocalId: string): Promise<AutoPilotProductPreset[]> {
  const presets = await readAllProductPresets();
  return presets
    .filter((preset) => preset.profileLocalId === profileLocalId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveAutoPilotProductPreset(input: {
  name: string;
  profileLocalId: string;
  productIds: string[];
  settingsByProductId: Record<string, AutoPilotProductSettings>;
}): Promise<AutoPilotProductPreset> {
  const preset: AutoPilotProductPreset = {
    id: createPresetId(),
    name: input.name.trim(),
    profileLocalId: input.profileLocalId,
    productIds: input.productIds,
    settingsByProductId: input.settingsByProductId,
    createdAt: Date.now(),
  };

  // ชื่อซ้ำในโปรไฟล์เดียวกัน = บันทึกทับตัวเดิม (upsert)
  const presets = (await readAllProductPresets()).filter(
    (existing) =>
      existing.profileLocalId !== preset.profileLocalId ||
      existing.name.trim().toLowerCase() !== preset.name.toLowerCase()
  );
  await writeAllProductPresets([preset, ...presets].slice(0, 50));
  return preset;
}

export async function deleteAutoPilotProductPreset(presetId: string): Promise<void> {
  const presets = await readAllProductPresets();
  await writeAllProductPresets(presets.filter((preset) => preset.id !== presetId));
}

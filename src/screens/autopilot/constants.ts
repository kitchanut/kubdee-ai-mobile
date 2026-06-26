import { createContext } from 'react';

import type { AutoPilotImageSettings, AutoPilotVideoSettings } from '@/autopilot/types';

export type OptionValue = string | number | boolean;
export type ProductSettingsTab = 'image' | 'video';
export type AutoPilotProductEditableField = 'name' | 'productId' | 'productUrl' | 'hashtags' | 'cta';

// Section grouping mirrors the kubdee-ai-extension settings modal:
// ตั้งค่าพื้นฐาน → ตัวละคร → การสร้าง Prompt → สไตล์รูปภาพ → ฉาก → คำสั่งเพิ่มเติม
export const IMAGE_SECTION_KEYS = {
  basic: ['imageModel', 'aspectRatio', 'outputCount'],
  character: [
    'characterMode',
    'selectedCharacterId',
    'customCharacterUri',
    'customCharacterPreview',
    'characterDescription',
  ],
  prompt: ['promptMode', 'customPrompt'],
  style: [
    'styleMode',
    'presetStyle',
    'presetStyleCustom',
    'presetSubTab',
    'viralStyle',
    'viralStyleCustom',
    'viralSubTab',
    'customStyle',
    'characterOutfit',
    'characterOutfitCustom',
    'productDisplayMode',
  ],
  lighting: ['lighting', 'lightingCustom'],
  frame: ['frame', 'frameCustom'],
  textOverlay: ['textOverlay', 'textOverlayCustom'],
  scene: [
    'sceneMode',
    'selectedSceneId',
    'customSceneUri',
    'customScenePreview',
    'sceneDescription',
    'background',
    'backgroundCustom',
  ],
  additional: ['systemPrompt'],
} satisfies Record<string, Array<keyof AutoPilotImageSettings>>;

// วิดีโอ — แยกหมวดละเอียดให้ตรงปุ่ม "นำไปใช้ทั้งหมด" รายแถวแบบ extension
export const VIDEO_SECTION_KEYS = {
  basic: [
    'videoModel',
    'videoDuration',
    'aspectRatio',
    'outputCount',
    'sceneCount',
    'videoMethod',
    'multiSceneAngleMode',
    'multiSceneAiScriptEnabled',
    'multiSceneSendImagesToAi',
  ],
  sceneCount: ['videoMethod', 'multiSceneAngleMode', 'sceneCount', 'multiSceneAiScriptEnabled', 'multiSceneSendImagesToAi'],
  character: ['characterMode'],
  prompt: ['promptMode', 'customPrompt'],
  style: ['presetStyle', 'presetStyleCustom'],
  voice: ['voiceCharacter', 'voiceCharacterCustom'],
  dialogue: ['dialogueMode', 'dialogue', 'dialogueList', 'dialogueListOrder'],
  scriptStyle: ['scriptStyle', 'scriptStyleCustom'],
  musicSfx: ['musicSfxMode', 'musicSfxCustom'],
  camera: ['cameraMotion', 'cameraMotionCustom'],
  additional: ['systemPrompt'],
  forbidden: ['forbiddenWords'],
} satisfies Record<string, Array<keyof AutoPilotVideoSettings>>;

// ยังไม่ใช้ฟีเจอร์ "ส่งรูปให้ AI วิเคราะห์" — ซ่อนแถวไว้ก่อน (สลับเป็น true เพื่อเปิดใช้)
export const SHOW_SEND_IMAGE_TO_AI = false;

// Accent color for OptionGroup selected state — set per settings tab (image=amber,
// video=red) so the selected pill text matches the section accent without having
// to thread the color through every OptionGroup call.
export const SettingsAccentContext = createContext<string | undefined>(undefined);

export function formatPrice(price: string | null): string {
  if (!price) {
    return '-';
  }

  const numeric = Number(price);
  if (!Number.isFinite(numeric)) {
    return `฿${price}`;
  }

  return `฿${new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numeric)}`;
}

export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

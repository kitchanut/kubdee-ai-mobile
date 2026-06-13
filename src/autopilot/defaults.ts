import type {
  AutoPilotDelayPreset,
  AutoPilotImageSettings,
  AutoPilotSettings,
  AutoPilotStepType,
  AutoPilotVideoSettings,
} from '@/autopilot/types';

export const DEFAULT_AUTO_PILOT_SETTINGS: AutoPilotSettings = {
  totalRounds: 1,
  delayPreset: 'normal',
  flowImageModel: 'nano_banana_pro',
  flowVideoModel: 'veo_31_lite_lower',
  flowVideoDuration: 8,
  browserMode: 'chrome',
  aiGenerateCaption: false,
  aiGenerateCta: false,
  aiRewritePromptOnAudioFailure: true,
  aiHashtagCount: 3,
};

export const DEFAULT_AUTO_PILOT_IMAGE_SETTINGS: AutoPilotImageSettings = {
  aspectRatio: '9:16',
  outputCount: '1',
  characterMode: 'auto',
  characterDescription: '',
  sceneMode: 'auto',
  sceneDescription: '',
  promptMode: 'auto',
  customPrompt: '',
  styleMode: 'preset',
  presetStyle: 'auto',
  presetStyleCustom: '',
  background: 'auto',
  backgroundCustom: '',
  lighting: 'auto',
  lightingCustom: '',
  frame: 'auto',
  frameCustom: '',
  textOverlay: 'auto',
  textOverlayCustom: '',
  productDisplayMode: 'auto',
  systemPrompt: '',
};

export const DEFAULT_AUTO_PILOT_VIDEO_SETTINGS: AutoPilotVideoSettings = {
  aspectRatio: '9:16',
  outputCount: '1',
  characterMode: 'fromImage',
  promptMode: 'auto',
  customPrompt: '',
  presetStyle: '',
  presetStyleCustom: '',
  sceneCount: '1',
  cameraMotion: '',
  cameraMotionCustom: '',
  voiceCharacter: '',
  voiceCharacterCustom: '',
  scriptStyle: '',
  scriptStyleCustom: '',
  dialogueMode: 'auto',
  dialogue: '',
  musicSfxMode: 'auto',
  musicSfxCustom: '',
  forbiddenWords: '',
  systemPrompt: '',
};

export const AUTO_PILOT_STEPS: Array<{ id: AutoPilotStepType; label: string }> = [
  { id: 'image', label: 'สร้างรูป' },
  { id: 'video', label: 'สร้างวิดีโอ' },
];

export const AUTO_PILOT_DELAY_OPTIONS: Array<{ value: AutoPilotDelayPreset; label: string }> = [
  { value: 'slow', label: 'ช้า' },
  { value: 'normal', label: 'ปกติ' },
  { value: 'fast', label: 'เร็ว' },
];

export const AUTO_PILOT_ROUND_OPTIONS = [1, 2, 3, 5, 10] as const;

export const FLOW_IMAGE_MODELS = [
  { value: 'nano_banana_pro', label: 'Nano Banana Pro' },
  { value: 'nano_banana_2', label: 'Nano Banana 2' },
  { value: 'imagen_4', label: 'Imagen 4' },
] as const;

export const FLOW_VIDEO_MODELS = [
  { value: 'omni_flash', label: 'Omni Flash' },
  { value: 'veo_31_lite', label: 'Veo 3.1 Lite' },
  { value: 'veo_31_fast', label: 'Veo 3.1 Fast' },
  { value: 'veo_31_quality', label: 'Veo 3.1 Quality' },
  { value: 'veo_31_lite_lower', label: 'Veo 3.1 Lite Lower' },
] as const;

export const VIDEO_DURATION_OPTIONS = [4, 6, 8, 10] as const;

export const IMAGE_ASPECT_RATIO_OPTIONS = ['9:16', '16:9', '1:1', '3:4', '4:3'] as const;
export const VIDEO_ASPECT_RATIO_OPTIONS = ['9:16', '16:9'] as const;
export const OUTPUT_COUNT_OPTIONS = ['1', '2', '3', '4'] as const;

export const IMAGE_CHARACTER_MODE_OPTIONS = [
  { value: 'auto', label: 'ออโต้' },
  { value: 'description', label: 'อธิบาย' },
  { value: 'none', label: 'ไม่มี' },
] as const;

export const IMAGE_SCENE_MODE_OPTIONS = [
  { value: 'auto', label: 'ออโต้' },
  { value: 'description', label: 'อธิบาย' },
  { value: 'none', label: 'ไม่มี' },
] as const;

export const IMAGE_STYLE_OPTIONS = [
  { value: 'auto', label: 'ออโต้' },
  { value: 'ถือสินค้ารีวิว', label: 'ถือสินค้า' },
  { value: 'รีวิวการใช้งาน', label: 'ใช้งานจริง' },
  { value: 'หรูหรา พรีเมียม', label: 'พรีเมียม' },
  { value: 'มินิมอล', label: 'มินิมอล' },
  { value: 'สนุกสดใส', label: 'สนุกสดใส' },
  { value: 'custom', label: 'กำหนดเอง' },
] as const;

export const IMAGE_DETAIL_OPTIONS = [
  { value: 'auto', label: 'ออโต้' },
  { value: 'studio', label: 'สตูดิโอ' },
  { value: 'home', label: 'บ้าน' },
  { value: 'outdoor', label: 'กลางแจ้ง' },
  { value: 'marketplace', label: 'ขายของ' },
  { value: 'custom', label: 'กำหนดเอง' },
] as const;

export const IMAGE_FRAME_OPTIONS = [
  { value: 'auto', label: 'ออโต้' },
  { value: 'close-up', label: 'โคลสอัพ' },
  { value: 'half-body', label: 'ครึ่งตัว' },
  { value: 'full-body', label: 'เต็มตัว' },
  { value: 'product-focus', label: 'สินค้าเด่น' },
  { value: 'custom', label: 'กำหนดเอง' },
] as const;

export const IMAGE_TEXT_OVERLAY_OPTIONS = [
  { value: 'auto', label: 'ออโต้' },
  { value: 'none', label: 'ไม่มี' },
  { value: 'headline', label: 'หัวข้อ' },
  { value: 'price', label: 'ราคา' },
  { value: 'promo', label: 'โปรโมชัน' },
  { value: 'custom', label: 'กำหนดเอง' },
] as const;

export const IMAGE_PRODUCT_DISPLAY_OPTIONS = [
  { value: 'auto', label: 'ออโต้' },
  { value: 'wear', label: 'สวม/ใช้' },
  { value: 'hold', label: 'ถือสินค้า' },
  { value: 'use', label: 'ใช้งาน' },
  { value: 'display', label: 'วางโชว์' },
] as const;

export const VIDEO_CHARACTER_MODE_OPTIONS = [
  { value: 'fromImage', label: 'ตามรูป' },
  { value: 'none', label: 'ไม่มี' },
] as const;

export const VIDEO_SCENE_OPTIONS = ['1', '2', '3'] as const;

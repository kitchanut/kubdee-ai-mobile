import type { AffiliateProduct } from '@/library/types';

export const AUTO_PILOT_STEP_TYPES = {
  IMAGE: 'image',
  VIDEO: 'video',
} as const;

export type AutoPilotStepType = (typeof AUTO_PILOT_STEP_TYPES)[keyof typeof AUTO_PILOT_STEP_TYPES];

export type AutoPilotDelayPreset = 'slow' | 'normal' | 'fast';
export type AutoPilotBrowserMode = 'webview' | 'chrome' | 'default';
export type AutoPilotRunStatus = 'idle' | 'running' | 'completed' | 'stopped' | 'error';
export type AutoPilotLogLevel = 'info' | 'success' | 'warning' | 'error' | 'action';

export type AutoPilotPromptMode = 'auto' | 'ai' | 'custom';
export type AutoPilotImageStyleMode = 'preset' | 'custom' | 'viral';

export interface AutoPilotImageSettings {
  imageModel: string;
  aspectRatio: string;
  outputCount: string;
  // ตัวละคร (auto | gallery | upload | description | none)
  characterMode: string;
  selectedCharacterId: string | null;
  customCharacterUri: string | null;
  customCharacterPreview: string;
  characterDescription: string;
  // ฉาก (auto | gallery | upload | description | none)
  sceneMode: string;
  selectedSceneId: string | null;
  customSceneUri: string | null;
  customScenePreview: string;
  sceneDescription: string;
  // การสร้าง Prompt
  promptMode: AutoPilotPromptMode;
  customPrompt: string;
  // สไตล์รูปภาพ
  styleMode: AutoPilotImageStyleMode;
  presetStyle: string;
  presetStyleCustom: string;
  presetSubTab: string;
  viralStyle: string;
  viralStyleCustom: string;
  viralSubTab: string;
  customStyle: string;
  // รายละเอียดสไตล์
  background: string;
  backgroundCustom: string;
  lighting: string;
  lightingCustom: string;
  frame: string;
  frameCustom: string;
  textOverlay: string;
  textOverlayCustom: string;
  characterOutfit: string;
  characterOutfitCustom: string;
  productDisplayMode: string;
  systemPrompt: string;
}

export interface AutoPilotVideoSettings {
  videoModel: string;
  videoDuration: number;
  aspectRatio: string;
  outputCount: string;
  videoMethod: string;
  multiSceneAngleMode: string;
  multiSceneAiScriptEnabled: boolean;
  multiSceneSendImagesToAi: boolean;
  characterMode: string;
  promptMode: AutoPilotPromptMode;
  customPrompt: string;
  presetStyle: string;
  presetStyleCustom: string;
  sceneCount: string;
  cameraMotion: string;
  cameraMotionCustom: string;
  voiceCharacter: string;
  voiceCharacterCustom: string;
  scriptStyle: string;
  scriptStyleCustom: string;
  dialogueMode: 'auto' | 'none' | 'custom';
  dialogue: string;
  dialogueList: string[];
  dialogueListOrder: 'sequential' | 'random';
  musicSfxMode: 'auto' | 'none' | 'custom';
  musicSfxCustom: string;
  forbiddenWords: string;
  systemPrompt: string;
}

export interface AutoPilotProductSettings {
  image: AutoPilotImageSettings;
  video: AutoPilotVideoSettings;
}

export interface AutoPilotSettings {
  totalRounds: number;
  delayPreset: AutoPilotDelayPreset;
  flowImageModel: string;
  flowVideoModel: string;
  flowVideoDuration: number;
  browserMode: AutoPilotBrowserMode;
  aiGenerateCaption: boolean;
  aiGenerateHashtags: boolean;
  aiSendImageToAi: boolean;
  aiGenerateCta: boolean;
  aiRewritePromptOnAudioFailure: boolean;
  startNewFlowProjectPerProduct: boolean;
  aiHashtagCount: number;
}

export interface AutoPilotProduct {
  id: string;
  catalogId: string;
  source: AffiliateProduct;
  preview: string | null;
  name: string;
  description: string;
  productId: string;
  productUrl: string;
  caption: string;
  hashtags: string;
  cta: string;
  platform: string;
  settings: AutoPilotProductSettings;
}

export interface AutoPilotRunProgress {
  currentRound: number;
  totalRounds: number;
  currentProduct: number;
  totalProducts: number;
  currentStep: AutoPilotStepType | null;
  currentStepIndex: number;
  totalSteps: number;
  currentStage: string | null;
  currentProductName: string | null;
  generatedImages: number;
  generatedVideos: number;
  failedImages: number;
  failedVideos: number;
}

export interface AutoPilotFlowStats {
  generating: number;
  queued: number;
  success: number;
  failed: number;
  tilesFound?: number;
  progress: number | null;
}

export interface AutoPilotRunLog {
  id: string;
  level: AutoPilotLogLevel;
  message: string;
  timestamp: number;
  flowStats?: AutoPilotFlowStats;
}

export interface AutoPilotRunState {
  runId: string | null;
  status: AutoPilotRunStatus;
  progress: AutoPilotRunProgress;
  logs: AutoPilotRunLog[];
}

export interface GoogleFlowRunnerPromptBundle {
  image?: string;
  video?: string;
}

export interface GoogleFlowRunnerProduct {
  id: string;
  catalogId: string;
  preview: string | null;
  name: string;
  description: string;
  productId: string;
  productUrl: string;
  caption: string;
  hashtags: string;
  cta: string;
  platform: string;
  settings: AutoPilotProductSettings;
  prompts?: GoogleFlowRunnerPromptBundle;
  creativeAssetKind?: 'characters' | 'scenes';
  creativeItemId?: string;
  creativeItemName?: string;
  creativeItemDescription?: string | null;
  creativeItemTags?: string | null;
}

export interface GoogleFlowRunnerPayload {
  sourceApp: 'mobile';
  runner: 'on-device-google-flow-webview';
  version: 1;
  profileLocalId: string;
  runId: string;
  enabledSteps: AutoPilotStepType[];
  settings: AutoPilotSettings;
  products: GoogleFlowRunnerProduct[];
  promptCatalogVersion?: number | null;
  promptCatalogSource?: 'remote' | 'cache' | 'seed';
  createdAt: number;
}

export interface GoogleFlowRunnerStartResult {
  success: boolean;
  runId?: string;
  message?: string;
  error?: string;
}

export interface GoogleFlowRunnerLogEntry {
  message: string;
  ts: number;
  level?: AutoPilotLogLevel;
  runId?: string;
  status?: 'running' | 'completed' | 'stopped' | 'error';
  event?: 'asset' | 'progress';
  step?: AutoPilotStepType;
  stage?: string;
  profileLocalId?: string;
  productId?: string;
  productName?: string;
  currentRound?: number;
  totalRounds?: number;
  currentProduct?: number;
  totalProducts?: number;
  flowStats?: AutoPilotFlowStats;
  fileUri?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt?: number;
  creativeAssetKind?: 'characters' | 'scenes';
  creativeItemId?: string;
  creativeItemName?: string;
  creativeItemDescription?: string | null;
  creativeItemTags?: string | null;
}

import type { AffiliateProduct } from '@/library/types';

export const AUTO_PILOT_STEP_TYPES = {
  IMAGE: 'image',
  VIDEO: 'video',
} as const;

export type AutoPilotStepType = (typeof AUTO_PILOT_STEP_TYPES)[keyof typeof AUTO_PILOT_STEP_TYPES];

export type AutoPilotDelayPreset = 'slow' | 'normal' | 'fast';
export type AutoPilotBrowserMode = 'chrome' | 'default';
export type AutoPilotRunStatus = 'idle' | 'running' | 'completed' | 'stopped' | 'error';
export type AutoPilotLogLevel = 'info' | 'success' | 'warning' | 'error' | 'action';

export interface AutoPilotImageSettings {
  aspectRatio: string;
  outputCount: string;
  characterMode: string;
  characterDescription: string;
  sceneMode: string;
  sceneDescription: string;
  promptMode: 'auto' | 'custom';
  customPrompt: string;
  styleMode: 'preset' | 'custom';
  presetStyle: string;
  presetStyleCustom: string;
  background: string;
  backgroundCustom: string;
  lighting: string;
  lightingCustom: string;
  frame: string;
  frameCustom: string;
  textOverlay: string;
  textOverlayCustom: string;
  productDisplayMode: string;
  systemPrompt: string;
}

export interface AutoPilotVideoSettings {
  aspectRatio: string;
  outputCount: string;
  characterMode: string;
  promptMode: 'auto' | 'custom';
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
  openNewTab: boolean;
  aiGenerateCaption: boolean;
  aiSendImageToAi: boolean;
  aiGenerateCta: boolean;
  aiRewritePromptOnAudioFailure: boolean;
  aiHashtagCount: number;
}

export interface AutoPilotProduct {
  id: string;
  catalogId: string;
  source: AffiliateProduct;
  preview: string | null;
  name: string;
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
  currentStage: string | null;
  currentProductName: string | null;
  generatedImages: number;
  generatedVideos: number;
  failedImages: number;
  failedVideos: number;
}

export interface AutoPilotRunLog {
  id: string;
  level: AutoPilotLogLevel;
  message: string;
  timestamp: number;
}

export interface AutoPilotRunState {
  runId: string | null;
  status: AutoPilotRunStatus;
  progress: AutoPilotRunProgress;
  logs: AutoPilotRunLog[];
}

export interface GoogleFlowRunnerProduct {
  id: string;
  catalogId: string;
  preview: string | null;
  name: string;
  productId: string;
  productUrl: string;
  caption: string;
  hashtags: string;
  cta: string;
  platform: string;
  settings: AutoPilotProductSettings;
}

export interface GoogleFlowRunnerPayload {
  sourceApp: 'mobile';
  runner: 'on-device-google-flow-browser';
  version: 1;
  profileLocalId: string;
  runId: string;
  enabledSteps: AutoPilotStepType[];
  settings: AutoPilotSettings;
  products: GoogleFlowRunnerProduct[];
  createdAt: number;
}

export interface GoogleFlowRunnerStartResult {
  success: boolean;
  runId?: string;
  message?: string;
  error?: string;
}

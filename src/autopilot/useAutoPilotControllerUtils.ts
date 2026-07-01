import {
  DEFAULT_AUTO_PILOT_SETTINGS,
  AUTO_PILOT_INFINITE_ROUNDS,
  FLOW_IMAGE_MODELS,
  FLOW_VIDEO_MODELS,
} from '@/autopilot/defaults';
import { getAutoPilotStageLabel } from '@/autopilot/stageLabels';
import type {
  AutoPilotFlowStats,
  AutoPilotProduct,
  AutoPilotRunState,
  AutoPilotSettings,
  AutoPilotStepType,
  AutoPilotVideoSettings,
} from '@/autopilot/types';
import type { AffiliateProduct } from '@/library/types';

export type AutoPilotProductEditableField = 'name' | 'productId' | 'productUrl' | 'caption' | 'hashtags' | 'cta';

export const AUTO_PILOT_RUNTIME_SETTINGS_KEY = 'kubdee_ai_mobile_auto_runtime_settings_v1';
export const DEFAULT_ENABLED_STEPS: AutoPilotStepType[] = ['image', 'video'];
export const ORDERED_ENABLED_STEPS: AutoPilotStepType[] = ['image', 'video'];
export const VALID_FLOW_IMAGE_MODELS = new Set<string>(FLOW_IMAGE_MODELS.map((model) => model.value));
export const VALID_FLOW_VIDEO_MODELS = new Set<string>(FLOW_VIDEO_MODELS.map((model) => model.value));

export const initialRunState: AutoPilotRunState = {
  runId: null,
  status: 'idle',
  progress: {
    currentRound: 0,
    totalRounds: 1,
    currentProduct: 0,
    totalProducts: 0,
    currentStep: null,
    currentStepIndex: 0,
    totalSteps: 0,
    currentStage: null,
    currentProductName: null,
    plannedImages: 0,
    plannedVideos: 0,
    generatedImages: 0,
    generatedVideos: 0,
    failedImages: 0,
    failedVideos: 0,
  },
  logs: [],
};

export function createRunId(): string {
  return `mobile-auto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createManualSourceProduct(profileLocalId: string, localId: string): AffiliateProduct {
  const now = Date.now();

  return {
    id: localId,
    userId: '',
    localId,
    profileLocalId: profileLocalId || null,
    name: '',
    description: null,
    externalProductId: '',
    productUrl: '',
    price: null,
    stock: null,
    caption: null,
    hashtags: null,
    cta: null,
    imagePath: null,
    imageR2Key: null,
    imageUrl: null,
    imageHash: null,
    imageMimeType: null,
    imageSize: null,
    imageUploadedAt: null,
    platform: 'manual',
    status: 'draft',
    scrapedAt: null,
    localCreatedAt: now,
    originApp: 'kubdee-ai-mobile',
    createdByApp: 'kubdee-ai-mobile',
    updatedByApp: 'kubdee-ai-mobile',
    lastSyncedAt: null,
    createdAt: now,
    updatedAt: now,
    profileName: null,
    groupLocalId: null,
  };
}

export function normalizeRuntimeSettings(value: unknown): AutoPilotSettings {
  const input = value && typeof value === 'object' ? (value as Partial<AutoPilotSettings>) : {};
  const totalRounds = Number(input.totalRounds);
  const aiHashtagCount = Number(input.aiHashtagCount);
  const flowVideoDuration = Number(input.flowVideoDuration);
  const flowImageModel =
    typeof input.flowImageModel === 'string' && VALID_FLOW_IMAGE_MODELS.has(input.flowImageModel)
      ? input.flowImageModel
      : DEFAULT_AUTO_PILOT_SETTINGS.flowImageModel;
  const flowVideoModel =
    typeof input.flowVideoModel === 'string' && VALID_FLOW_VIDEO_MODELS.has(input.flowVideoModel)
      ? input.flowVideoModel
      : DEFAULT_AUTO_PILOT_SETTINGS.flowVideoModel;

  return {
    ...DEFAULT_AUTO_PILOT_SETTINGS,
    ...input,
    totalRounds: Number.isFinite(totalRounds) && totalRounds > 0 ? totalRounds : DEFAULT_AUTO_PILOT_SETTINGS.totalRounds,
    delayPreset:
      input.delayPreset === 'fastest' ||
      input.delayPreset === 'fast' ||
      input.delayPreset === 'normal' ||
      input.delayPreset === 'slow' ||
      input.delayPreset === 'slowest'
        ? input.delayPreset
        : DEFAULT_AUTO_PILOT_SETTINGS.delayPreset,
    browserMode:
      input.browserMode === 'webview' || input.browserMode === 'chrome' || input.browserMode === 'default'
        ? input.browserMode
        : DEFAULT_AUTO_PILOT_SETTINGS.browserMode,
    aiGenerateCaption:
      typeof input.aiGenerateCaption === 'boolean'
        ? input.aiGenerateCaption
        : DEFAULT_AUTO_PILOT_SETTINGS.aiGenerateCaption,
    aiGenerateHashtags:
      typeof input.aiGenerateHashtags === 'boolean'
        ? input.aiGenerateHashtags
        : input.aiGenerateCaption === true
          ? true
          : DEFAULT_AUTO_PILOT_SETTINGS.aiGenerateHashtags,
    aiSendImageToAi:
      typeof input.aiSendImageToAi === 'boolean'
        ? input.aiSendImageToAi
        : DEFAULT_AUTO_PILOT_SETTINGS.aiSendImageToAi,
    aiGenerateCta:
      typeof input.aiGenerateCta === 'boolean' ? input.aiGenerateCta : DEFAULT_AUTO_PILOT_SETTINGS.aiGenerateCta,
    aiRewritePromptOnAudioFailure:
      typeof input.aiRewritePromptOnAudioFailure === 'boolean'
        ? input.aiRewritePromptOnAudioFailure
        : DEFAULT_AUTO_PILOT_SETTINGS.aiRewritePromptOnAudioFailure,
    startNewFlowProjectPerProduct:
      typeof input.startNewFlowProjectPerProduct === 'boolean'
        ? input.startNewFlowProjectPerProduct
        : DEFAULT_AUTO_PILOT_SETTINGS.startNewFlowProjectPerProduct,
    deleteLatestFlowProjectBeforeNewProject:
      typeof input.deleteLatestFlowProjectBeforeNewProject === 'boolean'
        ? input.deleteLatestFlowProjectBeforeNewProject
        : DEFAULT_AUTO_PILOT_SETTINGS.deleteLatestFlowProjectBeforeNewProject,
    flowImageModel,
    flowVideoModel,
    flowVideoDuration:
      Number.isFinite(flowVideoDuration) && flowVideoDuration > 0
        ? flowVideoDuration
        : DEFAULT_AUTO_PILOT_SETTINGS.flowVideoDuration,
    aiHashtagCount:
      Number.isFinite(aiHashtagCount) && aiHashtagCount >= 1 && aiHashtagCount <= 5
        ? aiHashtagCount
        : DEFAULT_AUTO_PILOT_SETTINGS.aiHashtagCount,
  };
}

export function orderEnabledSteps(value: AutoPilotStepType[]): AutoPilotStepType[] {
  const stepSet = new Set(value);
  if (stepSet.has('video')) {
    stepSet.add('image');
  }
  return ORDERED_ENABLED_STEPS.filter((step) => stepSet.has(step));
}

export function normalizeEnabledSteps(value: unknown): AutoPilotStepType[] {
  if (!Array.isArray(value)) {
    return DEFAULT_ENABLED_STEPS;
  }

  const steps = orderEnabledSteps(value.filter((step): step is AutoPilotStepType => step === 'image' || step === 'video'));
  return steps.length > 0 ? steps : DEFAULT_ENABLED_STEPS;
}

export function clampAutoSceneCount(value?: string | number | null): number {
  const parsed = Number.parseInt(String(value ?? '1'), 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(5, Math.max(1, parsed));
}

export function outputCountForStep(product: AutoPilotProduct, step: AutoPilotStepType): number {
  const raw = product.settings[step]?.outputCount;
  const parsed = Number.parseInt(String(raw ?? '1'), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function isAutoMultiSceneVideo(videoSettings: AutoPilotVideoSettings): boolean {
  return (videoSettings.videoMethod || 'extend') === 'multi' && clampAutoSceneCount(videoSettings.sceneCount) > 1;
}

export function getAutoMultiSceneImageCount(product: AutoPilotProduct, enabledSteps: AutoPilotStepType[]): number {
  if (!enabledSteps.includes('video') || !isAutoMultiSceneVideo(product.settings.video)) {
    return 0;
  }
  const sceneCount = clampAutoSceneCount(product.settings.video.sceneCount);
  const useSameAngle = (product.settings.video.multiSceneAngleMode || 'same_angle') === 'same_angle';
  if (useSameAngle) {
    return enabledSteps.includes('image') ? 0 : 1;
  }
  return enabledSteps.includes('image') ? Math.max(0, sceneCount - 1) : sceneCount;
}

export function getAutoVideoResultCount(product: AutoPilotProduct): number {
  if (isAutoMultiSceneVideo(product.settings.video)) {
    return 1;
  }
  return outputCountForStep(product, 'video');
}

export function getPlannedAutoTotals(
  products: AutoPilotProduct[],
  enabledSteps: AutoPilotStepType[],
  totalRounds: number
): Pick<AutoPilotRunState['progress'], 'plannedImages' | 'plannedVideos'> {
  const plannedRounds = totalRounds >= AUTO_PILOT_INFINITE_ROUNDS ? AUTO_PILOT_INFINITE_ROUNDS : Math.max(1, totalRounds);
  const plannedImages = enabledSteps.includes('image')
    ? products.reduce((sum, product) => sum + outputCountForStep(product, 'image'), 0) * plannedRounds
    : 0;
  const plannedMultiSceneImages = enabledSteps.includes('video')
    ? products.reduce((sum, product) => sum + getAutoMultiSceneImageCount(product, enabledSteps), 0) * plannedRounds
    : 0;
  const plannedVideos = enabledSteps.includes('video')
    ? products.reduce((sum, product) => sum + getAutoVideoResultCount(product), 0) * plannedRounds
    : 0;

  return {
    plannedImages: plannedImages + plannedMultiSceneImages,
    plannedVideos,
  };
}

export function incrementBounded(current: number, planned: number, delta = 1): number {
  const next = current + Math.max(1, delta);
  return planned > 0 ? Math.min(planned, next) : next;
}

export function incrementFailureBounded(currentFailed: number, generated: number, planned: number, delta = 1): number {
  const next = currentFailed + Math.max(1, delta);
  return planned > 0 ? Math.min(Math.max(0, planned - generated), next) : next;
}

export function formatAutomationActivityMessage(
  message: string,
  step?: AutoPilotStepType,
  stage?: string
): string {
  const stepLabel = step === 'image' ? 'รูปภาพ' : step === 'video' ? 'วิดีโอ' : '';
  const stageLabel = stage && stage !== 'step_started' ? getAutoPilotStageLabel(stage, '') : '';
  const meta = [stepLabel, stageLabel].filter(Boolean).join(' · ');
  return meta ? `[${meta}] ${message}` : message;
}

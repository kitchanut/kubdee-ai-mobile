import { AUTO_PILOT_INFINITE_ROUNDS } from '@/autopilot/defaults';
import type {
  AutoPilotSettings,
  AutoPilotStepType,
  GoogleFlowRunnerLogEntry,
  GoogleFlowRunnerPayload,
  GoogleFlowRunnerProduct,
} from '@/autopilot/types';
import type { OpenGoogleFlowProjectResult, OverlayAssetStats } from './runnerBasics';

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
export const AUTO_MULTI_SCENE_TRIM_END_SECONDS = 0.3;
export const VOICEOVER_END_BUFFER_SECONDS = 1;
export const AUTO_RUN_DELAY_PRESETS = {
  slowest: { min: 180, max: 300 },
  slow: { min: 30, max: 60 },
  normal: { min: 5, max: 10 },
  fast: { min: 2, max: 4 },
  fastest: { min: 1, max: 2 },
} as const;

export class GoogleFlowWebViewRunnerStopped extends Error {
  constructor() {
    super('Google Flow WebView runner stopped');
  }
}

export class GoogleFlowCountedStepFailure extends Error {
  readonly step: AutoPilotStepType;
  readonly failedOutputs: number;

  constructor(message: string, step: AutoPilotStepType, failedOutputs = 1) {
    super(message);
    this.name = 'GoogleFlowCountedStepFailure';
    this.step = step;
    this.failedOutputs = Math.max(1, Math.floor(Number(failedOutputs) || 1));
  }
}

export function stepLabel(step: AutoPilotStepType): string {
  return step === 'image' ? 'รูปภาพ' : 'วิดีโอ';
}

export function shouldSkipRefreshAfterFreshProjectOpen({
  productIndex,
  projectResult,
  round,
}: {
  productIndex: number;
  projectResult: OpenGoogleFlowProjectResult;
  round: number;
}): boolean {
  // ห้ามข้าม refresh ก่อนขั้นเลือกรูปทำวิดีโอ — ถ้าไม่ reload รูปที่เพิ่งสร้างจะไม่ขึ้นเป็น
  // ตัวเลือกแรกแล้วระบบจะหยิบรูปผิด (ยืนยันโดย user 2026-07-14) ส่วนปัญหา reload
  // เจอข้อมูล stale ให้แก้ที่ expectedMinTiles ใน refreshGoogleFlowProject (reload ซ้ำจนรูปโผล่)
  return round === 1 && productIndex === 0 && projectResult.entered === true && projectResult.already !== true;
}

export function isRetryableFlowError(error: unknown): boolean {
  if (error instanceof GoogleFlowWebViewRunnerStopped) return false;
  const message = error instanceof Error ? error.message : String(error || '');
  if (!message.trim()) return false;
  return !/ยังไม่ได้เชื่อมต่อ|Google Flow เปิดเป็น|ตั้งค่า Flow ไม่ครบ|prompt .*ว่าง|ไม่มีรูป reference/i.test(message);
}

export function randomAutoRunDelayMs(settings: AutoPilotSettings): number {
  const preset = AUTO_RUN_DELAY_PRESETS[settings.delayPreset] ?? AUTO_RUN_DELAY_PRESETS.normal;
  return Math.round((preset.min + Math.random() * (preset.max - preset.min)) * 1000);
}

export function outputCountForStep(product: GoogleFlowRunnerProduct, step: AutoPilotStepType): number {
  const raw = product.settings[step]?.outputCount;
  const value = Number.parseInt(String(raw ?? '1'), 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function imageModelForProduct(product: GoogleFlowRunnerProduct, settings: AutoPilotSettings): string {
  return product.settings.image.imageModel || settings.flowImageModel || 'nano_banana_pro';
}

export function videoModelForProduct(product: GoogleFlowRunnerProduct, settings: AutoPilotSettings): string {
  return product.settings.video.videoModel || settings.flowVideoModel || 'veo_31_lite_lower';
}

export function videoDurationForProduct(product: GoogleFlowRunnerProduct, settings: AutoPilotSettings): number {
  const model = videoModelForProduct(product, settings);
  const raw = Number(product.settings.video.videoDuration || settings.flowVideoDuration || 8);
  const configured = Number.isFinite(raw) && raw > 0 ? raw : 8;
  return model === 'omni_flash' ? configured : Math.min(configured, 8);
}

export function clampAutoSceneCount(value: string | number | null | undefined): number {
  const parsed = Number.parseInt(String(value ?? '1'), 10);
  return Number.isFinite(parsed) ? Math.min(5, Math.max(1, parsed)) : 1;
}

export function isAutoMultiSceneVideo(product: GoogleFlowRunnerProduct): boolean {
  const video = product.settings.video;
  return (video.videoMethod || 'extend') === 'multi' && clampAutoSceneCount(video.sceneCount) > 1;
}

export function outputCountForRunnerStep(product: GoogleFlowRunnerProduct, step: AutoPilotStepType): number {
  const raw = product.settings[step]?.outputCount;
  const parsed = Number.parseInt(String(raw ?? '1'), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function getAutoMultiSceneImageCount(product: GoogleFlowRunnerProduct, enabledSteps: AutoPilotStepType[]): number {
  if (!enabledSteps.includes('video') || !isAutoMultiSceneVideo(product)) {
    return 0;
  }
  const sceneCount = clampAutoSceneCount(product.settings.video.sceneCount);
  const useSameAngle = autoMultiSceneMode(product) === 'same_angle';
  if (useSameAngle) {
    return enabledSteps.includes('image') ? 0 : 1;
  }
  return enabledSteps.includes('image') ? Math.max(0, sceneCount - 1) : sceneCount;
}

export function getAutoVideoResultCount(product: GoogleFlowRunnerProduct): number {
  return isAutoMultiSceneVideo(product) ? 1 : outputCountForRunnerStep(product, 'video');
}

export function getPlannedOverlayAssetStats(payload: GoogleFlowRunnerPayload): OverlayAssetStats {
  const plannedRounds =
    payload.settings.totalRounds >= AUTO_PILOT_INFINITE_ROUNDS
      ? AUTO_PILOT_INFINITE_ROUNDS
      : Math.max(1, payload.settings.totalRounds);
  const plannedImages = payload.enabledSteps.includes('image')
    ? payload.products.reduce((sum, product) => sum + outputCountForRunnerStep(product, 'image'), 0) * plannedRounds
    : 0;
  const plannedMultiSceneImages = payload.enabledSteps.includes('video')
    ? payload.products.reduce((sum, product) => sum + getAutoMultiSceneImageCount(product, payload.enabledSteps), 0) * plannedRounds
    : 0;
  const plannedVideos = payload.enabledSteps.includes('video')
    ? payload.products.reduce((sum, product) => sum + getAutoVideoResultCount(product), 0) * plannedRounds
    : 0;
  return {
    plannedImages: plannedImages + plannedMultiSceneImages,
    plannedVideos,
    generatedImages: 0,
    generatedVideos: 0,
    failedImages: 0,
    failedVideos: 0,
  };
}

export function incrementOverlayCount(current: number, planned: number, delta = 1): number {
  const next = current + Math.max(1, delta);
  return planned > 0 ? Math.min(planned, next) : next;
}

export function incrementOverlayFailure(currentFailed: number, generated: number, planned: number, delta = 1): number {
  const next = currentFailed + Math.max(1, delta);
  return planned > 0 ? Math.min(Math.max(0, planned - generated), next) : next;
}

export function updateOverlayAssetStats(
  current: OverlayAssetStats,
  entry: Omit<GoogleFlowRunnerLogEntry, 'ts'> & { ts?: number }
): OverlayAssetStats {
  if (entry.event === 'asset' && entry.step === 'image') {
    return {
      ...current,
      generatedImages: incrementOverlayCount(current.generatedImages, current.plannedImages),
    };
  }
  if (entry.event === 'asset' && entry.step === 'video') {
    return {
      ...current,
      generatedVideos: incrementOverlayCount(current.generatedVideos, current.plannedVideos),
    };
  }

  const failedStage = entry.stage === 'failed' || entry.stage === 'download_missing';
  const failedOutputs = Math.max(1, Math.floor(Number(entry.failedOutputs ?? 1) || 1));
  if (entry.event === 'progress' && failedStage && entry.step === 'image') {
    return {
      ...current,
      failedImages: incrementOverlayFailure(
        current.failedImages,
        current.generatedImages,
        current.plannedImages,
        failedOutputs
      ),
    };
  }
  if (entry.event === 'progress' && failedStage && entry.step === 'video') {
    return {
      ...current,
      failedVideos: incrementOverlayFailure(
        current.failedVideos,
        current.generatedVideos,
        current.plannedVideos,
        failedOutputs
      ),
    };
  }
  return current;
}

export function autoMultiSceneMode(product: GoogleFlowRunnerProduct): string {
  const mode = product.settings.video.multiSceneAngleMode || 'same_angle';
  return mode === 'same_angle' || mode === 'multi_angle' || mode === 'voiceover' ? mode : 'same_angle';
}

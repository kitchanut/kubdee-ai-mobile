import { AUTO_PILOT_INFINITE_LOOP_ROUNDS, AUTO_PILOT_INFINITE_ROUNDS } from '@/autopilot/defaults';
import type {
  AutoPilotFlowStats,
  AutoPilotSettings,
  AutoPilotStepType,
  GoogleFlowRunnerLogEntry,
  GoogleFlowRunnerPayload,
  GoogleFlowRunnerProduct,
} from '@/autopilot/types';

export interface FlowResultPoll {
  videos?: string[];
  images?: number;
  failedCount?: number;
  failedMessages?: string[];
  successCount?: number;
  generatingCount?: number;
  queuedCount?: number;
  tilesFound?: number;
  progress?: number | null;
}

export interface FlowSnapshot {
  videoUrls?: string[];
  imageUrls?: string[];
  failedCount?: number;
  tileCount?: number;
}

export interface FlowDownloadPayload {
  method?: string;
  urlKind?: string;
  url?: string;
  dataUrl?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  error?: string;
}

export interface FlowImageDownloadPayload {
  images?: {
    url?: string;
    dataUrl?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number | null;
  }[];
  found?: number;
  errors?: string[];
}

export type FlowImageDownloadItem = NonNullable<FlowImageDownloadPayload['images']>[number];

export interface OpenGoogleFlowProjectResult extends Record<string, unknown> {
  entered?: boolean;
  already?: boolean;
}

export function getRoundLoopCount(settings: AutoPilotSettings): number {
  return settings.totalRounds >= AUTO_PILOT_INFINITE_ROUNDS
    ? AUTO_PILOT_INFINITE_LOOP_ROUNDS
    : Math.max(1, settings.totalRounds);
}

export function formatRoundProgress(currentRound: number, totalRounds: number): string {
  if (totalRounds >= AUTO_PILOT_INFINITE_ROUNDS) {
    return `${currentRound}/∞`;
  }
  return `${currentRound}/${totalRounds}`;
}

export interface PreparedMultiScenePromptResult {
  prompts: string[];
  scenes: { sceneNumber: number; dialogue: string }[];
  voiceStyleInstruction: string;
  voiceoverScript: string;
  voiceGender?: 'female' | 'male' | 'neutral';
}

export interface FlowActionLogContext {
  payload: GoogleFlowRunnerPayload;
  product: GoogleFlowRunnerProduct;
  productIndex: number;
  round: number;
  step: AutoPilotStepType;
  stage: string;
}

export interface OverlayLogLine {
  id: string;
  message: string;
  ts: number;
  level?: GoogleFlowRunnerLogEntry['level'];
  step?: AutoPilotStepType;
  stage?: string;
}

export interface OverlayProgressState {
  currentRound: number;
  totalRounds: number;
  currentProduct: number;
  totalProducts: number;
  step: AutoPilotStepType | null;
  stage: string | null;
  productName: string;
  flowStats?: AutoPilotFlowStats;
  assetStats: OverlayAssetStats;
  startedAt: number;
  updatedAt: number;
}

export interface OverlayAssetStats {
  plannedImages: number;
  plannedVideos: number;
  generatedImages: number;
  generatedVideos: number;
  failedImages: number;
  failedVideos: number;
}

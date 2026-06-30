import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Square, X } from 'lucide-react-native';

import {
  emitGoogleFlowRunnerLog,
  registerGoogleFlowWebViewRunnerHost,
} from '@/autopilot/googleFlowRunnerBridge';
import { AUTO_PILOT_INFINITE_LOOP_ROUNDS, AUTO_PILOT_INFINITE_ROUNDS } from '@/autopilot/defaults';
import { getAutoPilotStageLabel, isAutoPilotGlobalStage } from '@/autopilot/stageLabels';
import { BACKEND_URL } from '@/auth/constants';
import { getStoredAuthTokens } from '@/auth/storage';
import type {
  AutoPilotFlowStats,
  AutoPilotSettings,
  AutoPilotStepType,
  GoogleFlowRunnerLogEntry,
  GoogleFlowRunnerPayload,
  GoogleFlowRunnerProduct,
} from '@/autopilot/types';
import FlowWebView, {
  FLOW_ENGLISH_URL,
  type FlowActionLogEntry,
  type FlowConnectionState,
  type FlowWebViewHandle,
  getFlowLanguageIssue,
} from '@/flow/FlowWebView';
import Text from '@/components/ui/KubdeeText';
import { alpha, type KubdeeTheme } from '@/theme/tokens';
import {
  mergeGoogleFlowVideos,
  probeGoogleFlowVideos,
  readUriAsDataUrl,
  saveGoogleFlowDataUrlAsset,
  waitForGoogleFlowDownload,
} from '@/native/AccessibilityBridge';

interface GoogleFlowWebViewRunnerHostProps {
  theme: KubdeeTheme;
}

interface FlowResultPoll {
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

interface FlowSnapshot {
  videoUrls?: string[];
  imageUrls?: string[];
  failedCount?: number;
  tileCount?: number;
}

interface FlowDownloadPayload {
  method?: string;
  urlKind?: string;
  url?: string;
  dataUrl?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  error?: string;
}

interface FlowImageDownloadPayload {
  images?: Array<{
    url?: string;
    dataUrl?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number | null;
  }>;
  found?: number;
  errors?: string[];
}

type FlowImageDownloadItem = NonNullable<FlowImageDownloadPayload['images']>[number];

interface OpenGoogleFlowProjectResult extends Record<string, unknown> {
  entered?: boolean;
  already?: boolean;
}

function getRoundLoopCount(settings: AutoPilotSettings): number {
  return settings.totalRounds >= AUTO_PILOT_INFINITE_ROUNDS
    ? AUTO_PILOT_INFINITE_LOOP_ROUNDS
    : Math.max(1, settings.totalRounds);
}

function formatRoundProgress(currentRound: number, totalRounds: number): string {
  if (totalRounds >= AUTO_PILOT_INFINITE_ROUNDS) {
    return `${currentRound}/∞`;
  }
  return `${currentRound}/${totalRounds}`;
}

interface PreparedMultiScenePromptResult {
  prompts: string[];
  scenes: Array<{ sceneNumber: number; dialogue: string }>;
  voiceStyleInstruction: string;
  voiceoverScript: string;
  voiceGender?: 'female' | 'male' | 'neutral';
}

interface FlowActionLogContext {
  payload: GoogleFlowRunnerPayload;
  product: GoogleFlowRunnerProduct;
  productIndex: number;
  round: number;
  step: AutoPilotStepType;
  stage: string;
}

interface OverlayLogLine {
  id: string;
  message: string;
  ts: number;
  step?: AutoPilotStepType;
  stage?: string;
}

interface OverlayProgressState {
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

interface OverlayAssetStats {
  plannedImages: number;
  plannedVideos: number;
  generatedImages: number;
  generatedVideos: number;
  failedImages: number;
  failedVideos: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const AUTO_MULTI_SCENE_TRIM_END_SECONDS = 0.3;
const VOICEOVER_END_BUFFER_SECONDS = 1;
const AUTO_RUN_DELAY_PRESETS = {
  slowest: { min: 180, max: 300 },
  slow: { min: 30, max: 60 },
  normal: { min: 5, max: 10 },
  fast: { min: 2, max: 4 },
  fastest: { min: 1, max: 2 },
} as const;

class GoogleFlowWebViewRunnerStopped extends Error {
  constructor() {
    super('Google Flow WebView runner stopped');
  }
}

class GoogleFlowCountedStepFailure extends Error {
  readonly step: AutoPilotStepType;
  readonly failedOutputs: number;

  constructor(message: string, step: AutoPilotStepType, failedOutputs = 1) {
    super(message);
    this.name = 'GoogleFlowCountedStepFailure';
    this.step = step;
    this.failedOutputs = Math.max(1, Math.floor(Number(failedOutputs) || 1));
  }
}

function stepLabel(step: AutoPilotStepType): string {
  return step === 'image' ? 'รูปภาพ' : 'วิดีโอ';
}

function shouldSkipRefreshAfterFreshProjectOpen({
  productIndex,
  projectResult,
  round,
}: {
  productIndex: number;
  projectResult: OpenGoogleFlowProjectResult;
  round: number;
}): boolean {
  return round === 1 && productIndex === 0 && projectResult.entered === true && projectResult.already !== true;
}

function isRetryableFlowError(error: unknown): boolean {
  if (error instanceof GoogleFlowWebViewRunnerStopped) return false;
  const message = error instanceof Error ? error.message : String(error || '');
  if (!message.trim()) return false;
  return !/ยังไม่ได้เชื่อมต่อ|Google Flow เปิดเป็น|ตั้งค่า Flow ไม่ครบ|prompt .*ว่าง|ไม่มีรูป reference/i.test(message);
}

function randomAutoRunDelayMs(settings: AutoPilotSettings): number {
  const preset = AUTO_RUN_DELAY_PRESETS[settings.delayPreset] ?? AUTO_RUN_DELAY_PRESETS.normal;
  return Math.round((preset.min + Math.random() * (preset.max - preset.min)) * 1000);
}

function outputCountForStep(product: GoogleFlowRunnerProduct, step: AutoPilotStepType): number {
  const raw = product.settings[step]?.outputCount;
  const value = Number.parseInt(String(raw ?? '1'), 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function imageModelForProduct(product: GoogleFlowRunnerProduct, settings: AutoPilotSettings): string {
  return product.settings.image.imageModel || settings.flowImageModel || 'nano_banana_pro';
}

function videoModelForProduct(product: GoogleFlowRunnerProduct, settings: AutoPilotSettings): string {
  return product.settings.video.videoModel || settings.flowVideoModel || 'veo_31_lite_lower';
}

function videoDurationForProduct(product: GoogleFlowRunnerProduct, settings: AutoPilotSettings): number {
  const model = videoModelForProduct(product, settings);
  const raw = Number(product.settings.video.videoDuration || settings.flowVideoDuration || 8);
  const configured = Number.isFinite(raw) && raw > 0 ? raw : 8;
  return model === 'omni_flash' ? configured : Math.min(configured, 8);
}

function clampAutoSceneCount(value: string | number | null | undefined): number {
  const parsed = Number.parseInt(String(value ?? '1'), 10);
  return Number.isFinite(parsed) ? Math.min(5, Math.max(1, parsed)) : 1;
}

function isAutoMultiSceneVideo(product: GoogleFlowRunnerProduct): boolean {
  const video = product.settings.video;
  return (video.videoMethod || 'extend') === 'multi' && clampAutoSceneCount(video.sceneCount) > 1;
}

function outputCountForRunnerStep(product: GoogleFlowRunnerProduct, step: AutoPilotStepType): number {
  const raw = product.settings[step]?.outputCount;
  const parsed = Number.parseInt(String(raw ?? '1'), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function getAutoMultiSceneImageCount(product: GoogleFlowRunnerProduct, enabledSteps: AutoPilotStepType[]): number {
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

function getAutoVideoResultCount(product: GoogleFlowRunnerProduct): number {
  return isAutoMultiSceneVideo(product) ? 1 : outputCountForRunnerStep(product, 'video');
}

function getPlannedOverlayAssetStats(payload: GoogleFlowRunnerPayload): OverlayAssetStats {
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

function incrementOverlayCount(current: number, planned: number, delta = 1): number {
  const next = current + Math.max(1, delta);
  return planned > 0 ? Math.min(planned, next) : next;
}

function incrementOverlayFailure(currentFailed: number, generated: number, planned: number, delta = 1): number {
  const next = currentFailed + Math.max(1, delta);
  return planned > 0 ? Math.min(Math.max(0, planned - generated), next) : next;
}

function updateOverlayAssetStats(
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

function autoMultiSceneMode(product: GoogleFlowRunnerProduct): string {
  const mode = product.settings.video.multiSceneAngleMode || 'same_angle';
  return mode === 'same_angle' || mode === 'multi_angle' || mode === 'voiceover' ? mode : 'same_angle';
}

const FACE_VISIBILITY_IMAGE_INSTRUCTION =
  'ถ้าเห็นใบหน้าคนต้องเห็นชัดเจนเต็มหน้าและไม่ถูกอะไรบัง ถ้าฉากนี้ไม่ควรเห็นหน้าก็ไม่ต้อง reveal หน้าเลย ห้ามใช้มุมที่เห็นหน้าครึ่ง ๆ กลาง ๆ หรือมีวัตถุบังหน้า';
const SAME_ANGLE_PRESENTER_IMAGE_INSTRUCTION =
  'สำหรับวิดีโอหลายฉากแบบมุมเดียว ให้จัดตัวละครหันหน้ามองกล้องโดยตรง สีหน้าเป็นธรรมชาติ ท่าทางพร้อมพูดหรือพรีเซนต์สินค้า มือถือหรือใช้งานสินค้าในตำแหน่งที่เห็นชัด เหมาะสำหรับนำรูปเดียวไปสร้างวิดีโอหลายฉากที่บทพูดเปลี่ยนไปเรื่อย ๆ';

function getAutoMultiSceneImageVariationInstruction(sceneNumber: number, totalScenes: number): string {
  const clampedTotal = Math.min(5, Math.max(2, totalScenes));
  const clampedScene = Math.min(Math.max(sceneNumber, 1), clampedTotal);
  const shotPlans: Record<number, string[]> = {
    2: [
      'ฉากที่ 1 ให้เป็นภาพเปิดแบบ medium shot หรือ three-quarter shot เห็นสินค้าและบริบทชัดเจน เหมาะเป็นภาพตั้งต้นของชุดวิดีโอ',
      'ฉากที่ 2 ให้เป็น product hero หรือ close-up/detail shot เห็นสินค้า แพ็กเกจ โลโก้ รายละเอียด หรือมือที่กำลังถือ/ใช้สินค้าเด่นมากขึ้น อนุญาตให้เห็นตัวละครแค่บางส่วนถ้าเหมาะ',
    ],
    3: [
      'ฉากที่ 1 ให้เป็นภาพเปิดแบบ medium shot หรือ three-quarter shot เห็นสินค้าและบริบทชัดเจน เหมาะเป็นภาพตั้งต้นของชุดวิดีโอ',
      'ฉากที่ 2 ต้องเปลี่ยนเป็น action/use-case shot เช่น มุมเฉียง 45 องศา มุมข้ามไหล่ มุมโต๊ะ หรือมุมกำลังหยิบ/ใช้งานสินค้า ไม่ใช้ crop และตำแหน่งกล้องเดิม',
      'ฉากที่ 3 ให้เป็น product hero หรือ close-up/detail shot เห็นสินค้า แพ็กเกจ โลโก้ รายละเอียด หรือมือที่กำลังถือ/ใช้สินค้าเด่นมากขึ้น อนุญาตให้เห็นตัวละครแค่บางส่วนถ้าเหมาะ',
    ],
    4: [
      'ฉากที่ 1 ให้เป็นภาพเปิดแบบ medium shot หรือ three-quarter shot เห็นสินค้าและบริบทชัดเจน เหมาะเป็นภาพตั้งต้นของชุดวิดีโอ',
      'ฉากที่ 2 ต้องเปลี่ยนเป็นมุมกล้องใหม่อย่างชัดเจน เช่น มุมเฉียง 45 องศา หรือมุมกำลังหยิบ/ใช้งานสินค้า ไม่ใช้ crop และตำแหน่งกล้องเดิม',
      'ฉากที่ 3 ให้เป็น close-up หรือ product focus เห็นสินค้า แพ็กเกจ โลโก้ รายละเอียด หรือมือที่กำลังถือ/ใช้สินค้าเด่นมากขึ้น อนุญาตให้เห็นตัวละครแค่บางส่วนถ้าเหมาะ',
      'ฉากที่ 4 ให้เป็น hero/detail shot ของสินค้า เช่น มุมต่ำ มุม macro มุมวางสินค้าในฉาก หรือมุม beauty shot ที่ต่างจากทุกฉากก่อนหน้า',
    ],
    5: [
      'ฉากที่ 1 ให้เป็นภาพเปิดแบบ medium shot หรือ three-quarter shot เห็นสินค้าและบริบทชัดเจน เหมาะเป็นภาพตั้งต้นของชุดวิดีโอ',
      'ฉากที่ 2 ต้องเปลี่ยนเป็นมุมกล้องใหม่อย่างชัดเจน เช่น มุมเฉียง 45 องศา หรือมุมกำลังหยิบ/ใช้งานสินค้า ไม่ใช้ crop และตำแหน่งกล้องเดิม',
      'ฉากที่ 3 ให้เป็น close-up หรือ product focus เห็นสินค้า แพ็กเกจ โลโก้ รายละเอียด หรือมือที่กำลังถือ/ใช้สินค้าเด่นมากขึ้น อนุญาตให้เห็นตัวละครแค่บางส่วนถ้าเหมาะ',
      'ฉากที่ 4 ให้เป็น action/use-case shot เช่น มุมข้ามไหล่ มุมโต๊ะ มุมด้านข้าง หรือมุมที่แสดงสถานการณ์ใช้งานจริง โดยสินค้าเป็นจุดสนใจหลัก',
      'ฉากที่ 5 ให้เป็น hero/detail shot ของสินค้า เช่น มุมต่ำ มุม macro มุมวางสินค้าในฉาก หรือมุม beauty shot ที่ต่างจากทุกฉากก่อนหน้า',
    ],
  };
  const shot = (shotPlans[clampedTotal] ?? shotPlans[3])[clampedScene - 1] ?? '';
  return `วิดีโอชุดนี้มีทั้งหมด ${clampedTotal} ฉาก ${shot} ต้องมี shot variety ระหว่างฉาก: เปลี่ยนระยะภาพ มุมกล้อง ตำแหน่งสินค้า หรือจุดโฟกัสให้แตกต่างจากรูปก่อนหน้าอย่างเห็นได้ชัด ห้ามคัดลอก composition เดิมซ้ำ ถ้าเป็นมุม zoom หรือ focus สินค้า ไม่ต้องบังคับให้กล้องถอยออกมาเห็นตัวละครเต็มตัว ถ้าในภาพมีใบหน้าคน ต้องเห็นใบหน้าชัดเจน เปิดโล่ง ไม่ถูกสินค้า มือ ผม หมวก หน้ากาก แว่น เงา ขอบภาพ หรือวัตถุใดๆ บดบัง และไม่เบลอหรือบิดเบี้ยว ถ้าฉากตั้งใจเป็น product-only, hands-only, close-up รายละเอียดสินค้า หรือมุมที่ไม่เห็นหน้า ก็ห้ามถอยกล้องหรือเปลี่ยน framing เพื่อ reveal หน้า ให้ไม่เห็นหน้าไปเลย`;
}

function dialogueForScene(product: GoogleFlowRunnerProduct, sceneNumber: number): string {
  const video = product.settings.video;
  if (video.dialogueMode === 'none') {
    return 'ไม่มีบทพูด ให้เป็นวิดีโอเงียบหรือมีเสียงบรรยากาศเท่านั้น';
  }
  if (video.dialogueMode === 'custom') {
    const lines = (video.dialogueList ?? []).map((line) => line.trim()).filter(Boolean);
    if (lines.length > 0) {
      return lines[(sceneNumber - 1) % lines.length];
    }
    if (video.dialogue.trim()) {
      return video.dialogue.trim();
    }
  }
  return product.caption?.trim() || 'พูดแนะนำจุดเด่นสินค้าแบบกระชับ เป็นภาษาไทย ฟังเป็นธรรมชาติ';
}

function multiSceneImagePrompt(
  product: GoogleFlowRunnerProduct,
  sceneNumber: number,
  totalScenes: number,
  sameAngle: boolean,
  basePrompt?: string
): string {
  const sceneInstruction = [
    `สร้างภาพฉากที่ ${sceneNumber}/${totalScenes} สำหรับวิดีโอหลายฉากของสินค้า "${product.name || 'สินค้า'}"`,
    getAutoMultiSceneImageVariationInstruction(sceneNumber, totalScenes),
    sameAngle ? SAME_ANGLE_PRESENTER_IMAGE_INSTRUCTION : 'คงตัวละครเดิม ใบหน้าเดิม สินค้าเดิม แพ็กเกจเดิม และแบรนด์เดิม แต่เปลี่ยนมุมกล้อง ระยะภาพ การกระทำ หรือบริบทให้ต่างจากฉากก่อนหน้าอย่างชัดเจน',
    FACE_VISIBILITY_IMAGE_INSTRUCTION,
    'ห้ามใส่ subtitle หรือข้อความบนภาพเองถ้าไม่ได้ตั้งค่าไว้',
  ]
    .filter(Boolean)
    .join(' ');

  return [basePrompt?.trim(), sceneInstruction].filter(Boolean).join('\n\n');
}

function multiSceneVideoPrompt(product: GoogleFlowRunnerProduct, basePrompt: string, sceneNumber: number, totalScenes: number, voiceover: boolean): string {
  const dialogue = dialogueForScene(product, sceneNumber);
  return [
    basePrompt,
    `สร้างวิดีโอฉากที่ ${sceneNumber}/${totalScenes} จากรูป reference นี้ โดยรักษาสินค้า ตัวละคร และแบรนด์ให้เหมือนภาพอ้างอิง`,
    getAutoMultiSceneImageVariationInstruction(sceneNumber, totalScenes),
    voiceover
      ? 'โหมดเสียงพากษ์: วิดีโอนี้ต้องเป็นภาพล้วน ไม่มีคนพูด ไม่มี lip sync ไม่มี subtitle ไม่มีข้อความบนจอ และไม่มีเสียงพูด เพราะเสียงพากษ์จะถูกประกอบภายหลัง'
      : `บทพูดภาษาไทยสำหรับฉากนี้: ${dialogue}`,
    'วิดีโอต้องเต็มจอ ไม่มีขอบดำ ไม่มี subtitle และเหมาะกับคลิปขายสินค้าสั้นบนมือถือ',
  ]
    .filter(Boolean)
    .join('\n');
}

function dataUrlToAiImage(dataUrl: string): { base64: string; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }
  return { mimeType: match[1] || 'image/jpeg', base64: match[2] || '' };
}

function cleanAiJsonText(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/g, '')
    .trim();
}

function cleanAiPromptText(text: string): string {
  return cleanAiJsonText(text)
    .replace(/^```(?:text|prompt)?\s*/i, '')
    .replace(/\s*```$/g, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

function extractBalancedJson(text: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char === '{' ? '}' : ']');
      continue;
    }

    if (char === '}' || char === ']') {
      if (stack.pop() !== char) {
        return null;
      }
      if (stack.length === 0) {
        return text.slice(0, index + 1);
      }
    }
  }

  return null;
}

function parseAiJsonText(text: string): unknown {
  const cleaned = cleanAiJsonText(text);
  const candidates = [cleaned];

  for (const match of String(text || '').matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]?.trim()) {
      candidates.push(match[1].trim());
    }
  }

  for (let index = 0; index < cleaned.length; index += 1) {
    if (cleaned[index] !== '{' && cleaned[index] !== '[') {
      continue;
    }
    const balanced = extractBalancedJson(cleaned.slice(index));
    if (balanced) {
      candidates.push(balanced);
    }
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // AI often wraps JSON in prose, markdown fences, or returns another JSON shape.
    }
  }

  throw new Error('Parse AI response ไม่ได้');
}

function parseSceneDialoguesFromText(text: string, sceneCount: number): Array<{ sceneNumber: number; dialogue: string }> {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const scenes: Array<{ sceneNumber: number; dialogue: string }> = [];

  for (const line of lines) {
    const match = line.match(/^(?:[-*]\s*)?(?:ฉาก|scene)\s*(\d+)\s*[:：.)-]\s*(.+)$/i);
    if (!match) {
      continue;
    }
    const sceneNumber = Math.min(sceneCount, Math.max(1, Number(match[1]) || scenes.length + 1));
    const dialogue = normalizeDialogueText(match[2].replace(/^["']|["']$/g, '').trim());
    if (dialogue) {
      scenes.push({ sceneNumber, dialogue });
    }
  }

  return scenes
    .sort((left, right) => left.sceneNumber - right.sceneNumber)
    .slice(0, sceneCount);
}

function normalizeDialogueText(text: string): string {
  return text
    .replace(/[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeVoiceoverScript(text: string): string {
  const allowedTags = new Set([
    'very fast',
    'excited',
    'curious',
    'serious',
    'amazed',
    'whispers',
    'shouting',
    'laughs',
    'sighs',
  ]);
  return text
    .replace(/\[([^\]]+)\]/g, (_match, rawTag: string) => {
      const tag = String(rawTag || '').trim().toLowerCase();
      return allowedTags.has(tag) ? `[${tag}]` : ' ';
    })
    .replace(/[!"#$%&'()*+,./:;<=>?@\\^_`{|}~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isAudioGenerationFailure(error?: string): boolean {
  return /\baudio\s+generation\s+failed\b/i.test(error || '');
}

function buildFlowFailedError(step: AutoPilotStepType, result: FlowResultPoll): string {
  const messages = (result.failedMessages ?? [])
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (messages.length > 0) {
    return `Flow แจ้งล้มเหลวสำหรับ${stepLabel(step)}: ${messages.join(' | ')}`;
  }
  return `Flow แจ้งล้มเหลวสำหรับ${stepLabel(step)}`;
}

function formatPromptPreview(prompt: string): string {
  const preview = prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('\n');
  return preview.length > 220 ? `${preview.slice(0, 220)}...` : preview;
}

const SCRIPT_STYLE_PRESETS: Record<string, string> = {
  '': 'รีวิวเป็นกันเอง พูดอย่างเป็นธรรมชาติ',
  normal: 'ปกติ รีวิวเป็นกันเอง เหมือนเพื่อนบอกต่อ',
  playful: 'กวนตีน ตลก มุกเบาๆ เฮฮา สนุกสนาน',
  polite: 'ผู้ดี สุภาพ น่าเชื่อถือ พูดจาดี มีมารยาท',
  hardsell: 'ขายแรงๆ กระตุ้นซื้อ เร่งด่วน รีบเลย ของมีจำกัด',
  isan: 'อีสานบ้านๆ ใส่คำอีสาน สำเนียงอีสาน',
  northern: 'คำเมืองเหนือ อ่อนหวานนุ่มนวล สำเนียงเหนือ',
  cute: 'น่ารักมุ้งมิ้ง สดใส ใช้คำน่ารักๆ',
  confident: 'มั่นใจจัด รู้จริง เชี่ยวชาญ พูดหนักแน่น',
  excited: 'ตื่นเต้นสุดๆ พลังเยอะ ร้องว้าว',
  peaceful: 'สงบสุข ผ่อนคลาย เสียงนุ่มนวล',
  romantic: 'หวานโรแมนติก อ่อนโยน เสียงหวาน',
};

const VOICE_CHARACTER_PRESETS: Record<string, string | null> = {
  '': '',
  female: 'เสียงผู้หญิงไทย',
  male: 'เสียงผู้ชายไทย',
  none: null,
  teen_girl: 'เสียงสาววัยรุ่นไทย อายุประมาณ 18-22 ปี พูดสดใส ร่าเริง',
  teen_boy: 'เสียงหนุ่มวัยรุ่นไทย อายุประมาณ 18-22 ปี พูดเท่ๆ คูลๆ',
  vendor_female: 'เสียงแม่ค้าไทย พูดเชียร์ขายของ กระตุ้นให้ซื้อ',
  vendor_male: 'เสียงพ่อค้าไทย พูดเชียร์ขายของ กระตุ้นให้ซื้อ',
  office_female: 'เสียงพี่สาวออฟฟิศ พูดสุภาพ มืออาชีพ น่าเชื่อถือ',
  office_male: 'เสียงพี่ชายออฟฟิศ พูดสุภาพ มืออาชีพ น่าเชื่อถือ',
  aunt: 'เสียงป้าไทย อายุประมาณ 40-50 ปี พูดเป็นกันเอง อบอุ่น',
  uncle: 'เสียงลุงไทย อายุประมาณ 40-50 ปี พูดเป็นกันเอง ใจดี',
};

function buildSceneDialoguePrompt(
  product: GoogleFlowRunnerProduct,
  sceneCount: number,
  voiceover: boolean,
  selectedVideoDuration: number,
  hasSceneImages: boolean
): string {
  const video = product.settings.video;
  const styleDesc = video.scriptStyleCustom || SCRIPT_STYLE_PRESETS[video.scriptStyle || ''] || SCRIPT_STYLE_PRESETS[''];
  const isNoVoice = video.voiceCharacter === 'none';
  const isAutoVoice = !video.voiceCharacter;
  const voiceDesc = video.voiceCharacterCustom || VOICE_CHARACTER_PRESETS[video.voiceCharacter || ''];
  const voiceSection = (() => {
    if (isNoVoice) {
      return 'เสียง: ไม่มีเสียงพูด วิดีโอเงียบมีแค่เพลงประกอบ';
    }
    if (isAutoVoice) {
      if (!hasSceneImages) {
        return [
          'เสียงพากย์: ออโต้จากข้อมูลสินค้า ใช้เสียงผู้บรรยายไทยกลางที่เหมาะกับสินค้า ถ้าไม่แน่ใจให้ใช้เสียงผู้หญิงไทยที่ขายของเป็นธรรมชาติ',
          `สไตล์บทพูด: ${styleDesc}`,
        ].join('\n');
      }
      return [
        'เสียงพากย์: ออโต้จากรูปฉาก ถ้าเห็นตัวละครหรือใบหน้าคน ให้เลือกเสียงพูดภาษาไทยที่เหมาะกับเพศและวัยของตัวละครในรูป เช่น ผู้หญิงใช้เสียงผู้หญิงไทย ผู้ชายใช้เสียงผู้ชายไทย ถ้าเห็นแค่มือหรือสินค้าและไม่เห็นคน ให้ใช้เสียงบรรยายไทยกลางที่เหมาะกับสินค้า',
        `สไตล์บทพูด: ${styleDesc}`,
      ].join('\n');
    }
    return [`เสียงพากย์: ${voiceDesc || 'เสียงพูดภาษาไทย'}`, `สไตล์บทพูด: ${styleDesc}`].join('\n');
  })();
  const voiceStyleGuidance = (() => {
    if (isNoVoice) {
      return '- ไม่ต้องสร้าง voiceStyleInstruction (ใส่ค่าว่าง "")';
    }
    if (isAutoVoice) {
      if (!hasSceneImages) {
        return '- voiceStyleInstruction ใช้เสียงผู้บรรยายไทยกลางที่เหมาะกับสินค้า พูดเร็วแบบ TikTok และ voiceGender ให้ใช้ "neutral" ถ้าไม่มีข้อมูลเพศชัดเจน';
      }
      return '- voiceStyleInstruction ต้องเลือกเพศและวัยของเสียงให้เหมาะกับตัวละครที่เห็นในรูปฉาก ถ้าไม่เห็นตัวละครหรือไม่เห็นหน้า ให้ใช้เสียงผู้บรรยายไทยกลางที่เหมาะกับสินค้า';
    }
    if (voiceDesc) {
      return `- voiceStyleInstruction ต้องสอดคล้องกับเสียงที่เลือก: "${voiceDesc}" ห้ามขัดกัน`;
    }
    return '';
  })();
  const safeVideoDuration = Math.max(1, Number(selectedVideoDuration) || 8);
  const voiceoverTargetDuration = Math.max(
    1,
    Math.round(sceneCount * Math.max(1, safeVideoDuration - AUTO_MULTI_SCENE_TRIM_END_SECONDS) - VOICEOVER_END_BUFFER_SECONDS)
  );
  const voiceoverTotalMinChars = Math.max(sceneCount * 42, Math.round(voiceoverTargetDuration * 12));
  const voiceoverTotalMaxChars = Math.max(voiceoverTotalMinChars + sceneCount * 8, Math.round(voiceoverTargetDuration * 15));
  const voiceoverSceneMinChars = Math.max(35, Math.round(voiceoverTotalMinChars / sceneCount));
  const voiceoverSceneMaxChars = Math.max(voiceoverSceneMinChars + 8, Math.round(voiceoverTotalMaxChars / sceneCount));
  const voiceoverPerSceneRule = voiceover
    ? `- โหมดเสียงพากษ์ต้องปรับความยาวบทตามความยาวคลิปที่เลือก: ผู้ใช้เลือกวิดีโอประมาณ ${safeVideoDuration} วินาทีต่อฉาก รวม ${sceneCount} ฉาก ดังนั้นบทพากษ์รวมควรพูดได้ประมาณ ${voiceoverTargetDuration} วินาที`
      + `\n- แต่ละช่วงควรยาวประมาณ ${voiceoverSceneMinChars} ถึง ${voiceoverSceneMaxChars} ตัวอักษรไทย และบทพากษ์รวมทั้งคลิปควรยาวประมาณ ${voiceoverTotalMinChars} ถึง ${voiceoverTotalMaxChars} ตัวอักษรไทย ไม่รวม Gemini TTS audio tags`
    : '- เป้าหมายความยาวต่อฉากประมาณ 65 ถึง 90 ตัวอักษรไทย หรือ 1 ถึง 2 ช่วงความคิดที่พูดต่อเนื่องกัน';
  const voiceoverConsistencyRule = voiceover
    ? `- โหมดเสียงพากษ์ไม่ต้องทำให้แต่ละช่วงยาว 6.5 วินาทีเท่ากัน ให้ยึดความยาวรวมประมาณ ${voiceoverTargetDuration} วินาที และกระจายเนื้อหาให้เหมาะกับภาพแต่ละฉาก`
    : '- บทพูดแต่ละฉากต้องพูดได้ประมาณ 6.5 วินาที โดยไม่เร่งจนฟังไม่รู้เรื่อง และเหลือช่วงภาพเงียบท้ายฉากให้น้อยที่สุด';
  const ttsTagGuidance = voiceover
    ? `
Gemini TTS audio tags สำหรับโหมดเสียงพากษ์:
- อนุญาตให้ใส่ tag ควบคุมเสียงใน voiceoverScript ได้ เฉพาะ tag เหล่านี้เท่านั้น: [very fast], [excited], [curious], [serious], [amazed], [whispers], [shouting], [laughs], [sighs]
- ต้องใส่ [very fast] ที่ต้น voiceoverScript เสมอ เพื่อให้เหมาะกับคลิป TikTok
- เลือก tag อารมณ์เพิ่มได้ตามบริบทสินค้า แต่ใช้เท่าที่จำเป็น ไม่เกิน 3 ถึง 5 tag ต่อบทพากษ์รวม
- ห้ามสร้าง tag เอง ห้ามใช้ tag ที่ไม่อยู่ในรายการ และห้ามใส่ tag ติดกันหลายอัน
- ห้ามใส่ tag ใน dialogue รายฉาก ให้ใส่เฉพาะ voiceoverScript เท่านั้น
- ตัวอย่าง voiceoverScript: "[very fast] หยุดก่อนถ้ายังหาหมวกที่ใส่ง่ายทุกวัน [curious] รุ่นนี้ทรงสวย แมตช์ง่าย และระบายอากาศดี [excited] กดตะกร้าได้เลย"
`
    : '';
  const customDialogue = (() => {
    if (video.dialogueMode !== 'custom') return '';
    const list = (video.dialogueList ?? []).map((line) => line.trim()).filter(Boolean);
    if (list.length > 0) {
      return list.length >= sceneCount
        ? ['บทพูดที่กำหนดให้แต่ละฉาก (ห้ามเปลี่ยน ใช้ตามนี้เท่านั้น):', ...list.slice(0, sceneCount).map((line, index) => `- ฉากที่ ${index + 1}: "${line}"`)].join('\n')
        : ['บทพูดที่กำหนดบางฉาก:', ...list.map((line, index) => `- ฉากที่ ${index + 1}: "${line}"`), '- ฉากที่เหลือ: ให้ AI คิดบทพูดเอง'].join('\n');
    }
    if (video.dialogue.trim()) {
      const parts = video.dialogue.split('|').map((line) => line.trim()).filter(Boolean);
      if (parts.length >= sceneCount) {
        return ['บทพูดที่กำหนดให้แต่ละฉาก (ห้ามเปลี่ยน ใช้ตามนี้เท่านั้น):', ...parts.slice(0, sceneCount).map((line, index) => `- ฉากที่ ${index + 1}: "${line}"`)].join('\n');
      }
      if (parts.length === 1) {
        return `บทพูดที่กำหนด (ใช้เป็นแนวทางทุกฉาก): "${parts[0]}"`;
      }
      return ['บทพูดที่กำหนดบางฉาก:', ...parts.map((line, index) => `- ฉากที่ ${index + 1}: "${line}"`), '- ฉากที่เหลือ: ให้ AI คิดบทพูดเอง'].join('\n');
    }
    return '';
  })();
  const sceneImageSection = hasSceneImages
    ? [
        'รูปภาพฉาก:',
        `- มีรูปแนบ ${sceneCount} รูป เรียงตามฉากที่ 1 ถึงฉากที่ ${sceneCount}`,
        '- ต้องคิดบทให้สัมพันธ์กับสิ่งที่เห็นในรูปแต่ละฉาก เช่น การถือสินค้า การใช้งานสินค้า มุมกล้อง หรือบริบทของฉากนั้น',
        '- ห้ามพูดสิ่งที่ขัดกับภาพ เช่น บอกว่ากำลังใช้งานถ้าในภาพเป็นแค่ packshot หรือพูดว่าถือสินค้าอยู่ถ้าในภาพไม่มีคนถือ',
        '- ให้บทแต่ละฉากต่อกันเป็นคลิปขายสินค้าเรื่องเดียว ไม่ใช่บทแยกหลายคลิป',
      ].join('\n')
    : [
        'รูปภาพฉาก:',
        '- ไม่มีรูปแนบให้ AI วิเคราะห์ในขั้นตอนคิดบท',
        '- ให้คิดบทจากข้อมูลสินค้า caption CTA สไตล์บทพูด และลำดับคลิปขายสินค้าแบบหลายฉาก',
        '- ให้บทแต่ละฉากต่อกันเป็นคลิปขายสินค้าเรื่องเดียว โดยไม่อ้างรายละเอียดภาพเฉพาะที่มองไม่เห็น',
      ].join('\n');

  return `
คุณคือผู้เชี่ยวชาญด้านการเขียนบทโฆษณาสินค้าบน TikTok

${voiceover
  ? `คิดบทพากษ์ภาษาไทยแบบต่อเนื่องสำหรับวิดีโอ ${sceneCount} ฉาก โดยแบ่งเนื้อหาเป็น ${sceneCount} ช่วงตามภาพแต่ละฉาก แต่เสียงจริงจะถูกนำไปอ่านต่อเนื่องเป็นไฟล์เดียว ไม่ใช่ให้ตัวละครในวิดีโอพูด`
  : `คิดบทพูดภาษาไทยสำหรับวิดีโอ ${sceneCount} ฉาก (แต่ละฉากยาวประมาณ ${safeVideoDuration} วินาที แต่เสียงพูดควรยาวประมาณ 6.5 วินาที)`}

ข้อมูลสินค้า:
- ชื่อ: ${product.name || 'สินค้า'}
- รายละเอียด: ${product.description || ''}
- Caption: ${product.caption || ''}
- Hashtags: ${product.hashtags || ''}
- CTA: ${product.cta || ''}

${sceneImageSection}

เป้าหมายบทพูดแบบ TikTok Direct Response:
- โฟกัสขายบน TikTok อย่างเดียว ต้องเร็ว แรง เข้าใจทันที ไม่ใช่บทโฆษณานุ่มแบบทีวี
- ฉากแรกต้องเป็น hook ภายในสามวินาทีแรก เช่น ปัญหาแรง ผลลัพธ์ที่อยากได้ คำเตือน ความคุ้ม หรือเหตุผลที่ต้องหยุดดู
- ห้ามเริ่มด้วยประโยคทั่วไป เช่น สวัสดีค่ะ วันนี้ หรือ มาแนะนำสินค้า
- ทุกฉากต้องพาคนดูเข้าใกล้การซื้อเร็วขึ้น ด้วยลำดับ Hook, Solution, Benefit, Proof, CTA
- CTA ฉากสุดท้ายต้องชัดแบบ TikTok Shop เช่น กดตะกร้า สั่งเลย ลิงก์อยู่ในตะกร้า

${voiceSection}
${video.dialogueMode === 'none' ? '\nบทพูด: ไม่มีบทพูด' : customDialogue ? `\n${customDialogue}` : ''}
${video.systemPrompt ? `\nคำสั่งเพิ่มเติม: ${video.systemPrompt}` : ''}

กฎสำคัญ:
- ตอบเป็น JSON เท่านั้น
- ต้องมีบทพูดครบ ${sceneCount} ฉากเท่านั้น ห้ามมากกว่าหรือน้อยกว่า
- บทพูดเป็นภาษาไทย
- ฉากที่ 1 ต้องเป็น Hook ที่หยุดนิ้วภายในสามวินาทีแรก
- ฉากสุดท้ายต้องเป็น CTA กระตุ้นให้ซื้อแบบตรงและสั้น
- ${voiceover ? 'แต่ละฉากคือช่วงของเสียงพากษ์รวม ต้องอ่านต่อเนื่องกันได้ลื่นไหลเหมือนคลิปเดียว ห้ามเขียนเหมือนตัวละครพูดในฉาก และห้ามมีคำบรรยายท่าทาง' : 'บทพูดแต่ละฉากต้องเหมาะกับตัวละครหรือผู้บรรยายในฉากนั้น'}
- ${voiceover ? `บทพากษ์ต้องยึดความยาวรวมประมาณ ${voiceoverTargetDuration} วินาที ไม่ต้องทำให้แต่ละช่วงยาวเท่ากัน` : 'ถ้าฉากมีเสียงพูด ให้บทพูดยาวพอสำหรับเสียงประมาณ 6.3 ถึง 7.0 วินาที โดยเป้าหมายหลักคือ 6.5 วินาที ห้ามเป็นวลีสั้นคำเดียว'}
${voiceoverPerSceneRule}

${ttsTagGuidance}

ข้อห้ามเรื่อง TTS:
- ห้ามใช้อักขระพิเศษทุกชนิด เช่น ๆ ! ? " " ( ) * # ... - ~ ฯ ห้ามหมด ถ้าต้องการพูดซ้ำให้พิมพ์ข้อความนั้นซ้ำแทนการใช้ ๆ${voiceover ? ' ยกเว้นวงเล็บเหลี่ยมที่อยู่ใน Gemini TTS audio tags ที่อนุญาตเท่านั้น' : ''}
- ห้ามใช้ emoji ทุกชนิดในบทพูด
- ห้ามลากเสียงหรือเพิ่มตัวอักษรซ้ำ เช่น กรี๊ดดด ทุกคนนน ให้เขียนคำปกติเท่านั้น
- ห้ามใช้คำแสลงหรือคำที่ TTS อ่านไม่ได้ ให้ใช้คำเต็มที่อ่านออกเสียงได้ชัดเจน
- ห้ามใช้ตัวเลขดิบ ให้เขียนเป็นตัวอักษรเสมอ เช่น 199 เขียนเป็น หนึ่งร้อยเก้าสิบเก้า
- ถ้าชื่อสินค้าเป็นภาษาอังกฤษ ให้เขียนทับศัพท์เป็นภาษาไทยที่ TTS อ่านได้

กฎความสม่ำเสมอ:
${voiceoverConsistencyRule}
- โทนเสียงและลักษณะการพูดต้องเหมือนกันทุกฉาก ห้ามเปลี่ยนกลางคัน
- ห้ามมีฉากที่พูดยาวกว่าฉากอื่นมาก

voiceStyleInstruction:
- คิด voiceStyleInstruction เป็นภาษาอังกฤษ 1 ประโยค สำหรับกำกับโทนเสียงพากย์ทุกฉาก
- ต้องระบุ: เพศ, อายุโดยประมาณ, ภาษา (Thai), อารมณ์/โทน, ความเร็วในการพูด
- ต้องสั่งให้พูดเร็วขึ้นเล็กน้อยแบบ TikTok short-form ad pace ห้ามเว้น pause ยาว และต้องจบก่อนเวลาภาพเล็กน้อย
- ตัวอย่าง: "Read aloud in a warm, cheerful young Thai female voice, energetic and friendly like a social media influencer, brisk slightly fast Thai short-form ad pace with no long pauses"
${voiceStyleGuidance}

voiceGender:
- ${hasSceneImages ? 'ถ้าเห็นตัวละครหรือใบหน้าชัดในรูปฉาก ให้เลือก "female" หรือ "male" ตามตัวละครหลักที่ควรเป็นเสียงพากย์' : 'ถ้าไม่มีรูปแนบและไม่มีเสียงที่เลือกชัดเจน ให้ใช้ "neutral"'}
- ถ้าเห็นหลายคน ให้เลือกตามตัวละครหลักหรือคนที่ถือสินค้าเด่นที่สุด
- ถ้าเป็นมือเท่านั้น สินค้าเท่านั้น ไม่เห็นหน้า หรือระบุเพศไม่ได้ ให้ใช้ "neutral"
- ค่า voiceGender ต้องเป็นหนึ่งใน: "female", "male", "neutral"

ตอบกลับเป็น JSON เท่านั้น:
{
  "voiceStyleInstruction": "English voice style instruction here",
  "voiceGender": "${voiceover ? 'female | male | neutral' : 'neutral'}",
  "voiceoverScript": "${voiceover ? 'บทพากษ์รวมทั้งคลิป' : ''}",
  "scenes": [
    { "sceneNumber": 1, "dialogue": "หยุดก่อนถ้ายังเจอปัญหานี้อยู่ วิธีนี้ช่วยให้เห็นทางแก้ไวขึ้นและทำตามได้ง่ายมาก" }
  ]
}
`.trim();
}

function parsePreparedScenes(text: string, sceneCount: number): Pick<PreparedMultiScenePromptResult, 'scenes' | 'voiceStyleInstruction' | 'voiceoverScript' | 'voiceGender'> {
  const buildFallbackPreparedScenes = (fallbackScenes: Array<{ sceneNumber: number; dialogue: string }>) => {
    const sceneByNumber = new Map(fallbackScenes.map((scene) => [scene.sceneNumber, scene]));
    return {
      scenes: Array.from({ length: sceneCount }, (_, index) => {
        const source = sceneByNumber.get(index + 1);
        return {
          sceneNumber: index + 1,
          dialogue: source?.dialogue || '',
        };
      }),
      voiceStyleInstruction: '',
      voiceoverScript: '',
      voiceGender: undefined,
    };
  };
  let parsed: {
    scenes?: Array<{ sceneNumber?: number; dialogue?: string; script?: string; text?: string }>;
    voiceStyleInstruction?: string;
    voiceoverScript?: string;
    voiceGender?: string;
  } | Array<{ sceneNumber?: number; dialogue?: string; script?: string; text?: string }>;

  try {
    parsed = parseAiJsonText(text) as typeof parsed;
  } catch {
    const fallbackScenes = parseSceneDialoguesFromText(text, sceneCount);
    if (fallbackScenes.length > 0) {
      return buildFallbackPreparedScenes(fallbackScenes);
    }
    throw new Error('Parse AI response ไม่ได้');
  }

  const parsedRecord = Array.isArray(parsed) ? {} : parsed;
  const sourceScenes = Array.isArray(parsed) ? parsed : Array.isArray(parsed.scenes) ? parsed.scenes : [];
  if (sourceScenes.length === 0) {
    const fallbackScenes = parseSceneDialoguesFromText(text, sceneCount);
    if (fallbackScenes.length > 0) {
      return buildFallbackPreparedScenes(fallbackScenes);
    }
    throw new Error('ไม่พบ scenes ใน AI response');
  }
  const rawVoiceGender = String(parsedRecord.voiceGender || '').trim().toLowerCase();
  const voiceGender = rawVoiceGender === 'female' || rawVoiceGender === 'male' || rawVoiceGender === 'neutral'
    ? rawVoiceGender
    : undefined;
  const scenes = Array.from({ length: sceneCount }, (_, index) => {
    const source = sourceScenes[index] ?? {};
    return {
      sceneNumber: Number(source.sceneNumber || index + 1),
      dialogue: normalizeDialogueText(String(source.dialogue || source.script || source.text || '')),
    };
  });
  return {
    scenes,
    voiceStyleInstruction: String(parsedRecord.voiceStyleInstruction || '').trim(),
    voiceoverScript: normalizeVoiceoverScript(String(parsedRecord.voiceoverScript || '')),
    voiceGender,
  };
}

const VOICEOVER_VIDEO_AUDIO_RULE_WITH_MUSIC =
  'Audio rule: no speech, narration, dialogue, lip sync, subtitles, or on-screen text. Add only subtle instrumental background music that fits the product, image mood, and scene. No vocals, no lyrics, no loud beats, no distracting sound effects. External voiceover will be added later.';

const VOICEOVER_VIDEO_SILENT_RETRY_RULE =
  'Retry audio rule: create silent visual-only product footage. No speech, narration, dialogue, lip sync, subtitles, on-screen text, background music, sound effects, vocals, or lyrics. External voiceover will be added later.';

function toVoiceoverSilentRetryPrompt(prompt: string): string {
  if (prompt.includes(VOICEOVER_VIDEO_AUDIO_RULE_WITH_MUSIC)) {
    return prompt.replace(VOICEOVER_VIDEO_AUDIO_RULE_WITH_MUSIC, VOICEOVER_VIDEO_SILENT_RETRY_RULE);
  }

  return [
    prompt,
    VOICEOVER_VIDEO_SILENT_RETRY_RULE,
  ].join('\n');
}

function buildDesktopLikeVideoPrompts({
  product,
  scenes,
  voiceStyleInstruction,
  voiceover,
}: {
  product: GoogleFlowRunnerProduct;
  scenes: Array<{ sceneNumber: number; dialogue: string }>;
  voiceStyleInstruction: string;
  voiceover: boolean;
}): string[] {
  const video = product.settings.video;
  const style = video.presetStyleCustom || video.presetStyle || 'natural product review footage with clear product-first composition';
  const cameraMotion = video.cameraMotionCustom || video.cameraMotion;

  return scenes.map((scene) => {
    if (voiceover) {
      return [
        `Create vertical product footage for scene ${scene.sceneNumber} using the attached reference image as the exact visual source.`,
        'Strictly preserve the scene, background, location, lighting direction, framing, visible product, visible character or hands from the reference image. Do not create a new scene, new location, new person, or new product.',
        product.name ? `Keep the product "${product.name}" clearly visible in the main frame throughout the clip.` : 'Keep the product clearly visible in the main frame throughout the clip.',
        'Use only the character, hands, pose direction, and product interaction implied by the reference image. If only hands are visible, show only hands. If the shot is product-only, keep it product-only.',
        'Face rule: if a face is visible in the reference image, keep the full face clear, sharp, natural, and unobstructed. If the reference image does not show a face, do not reveal a new face.',
        `Visual style: ${style}.`,
        'The character or hands may smile, pose, hold, point to, wear, use, or demonstrate the product naturally, but must not speak, mouth words, or perform lip sync.',
        cameraMotion ? `Camera motion: ${cameraMotion}. Keep movement subtle and keep the product visible.` : '',
        VOICEOVER_VIDEO_AUDIO_RULE_WITH_MUSIC,
        'Output must be full screen with no black bars.',
        video.systemPrompt ? `Additional user instructions: ${video.systemPrompt}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    return [
      'สร้างวิดีโอโฆษณาสินค้าภาษาไทย ต้องใช้ฉากและตัวละครหรือมือจากภาพที่แนบมาเท่านั้น ห้ามสร้างฉากใหม่ ห้ามเปลี่ยนสถานที่ตลอดทั้งวิดีโอ;',
      'ฉาก: ใช้ฉากจากภาพที่แนบมาเท่านั้น พื้นหลังและสถานที่ต้องเหมือนกับในภาพทุกประการ;',
      'ตัวละคร: ใช้ตัวละครหรือมือจากภาพที่แนบมา คงลักษณะเดิมทุกประการตลอดทั้งวิดีโอ ถ้าในภาพเห็นแค่มือก็ให้เห็นแค่มือ;',
      'ใบหน้าคน: ถ้าในภาพ reference เห็นใบหน้า ต้องรักษาให้ใบหน้าชัดเจน ไม่ถูกสินค้า มือ ผม หมวก หน้ากาก แว่น เงา ขอบภาพ หรือวัตถุใดๆ บดบัง และไม่เบลอ ถ้าภาพ reference ไม่เห็นหน้า ห้าม reveal หน้าใหม่;',
      'ตำแหน่งสินค้าและการโต้ตอบต้องเป็นไปตามภาพที่แนบมา;',
      `สไตล์วิดีโอ: ${style};`,
      cameraMotion ? `การเคลื่อนกล้อง: ${cameraMotion};` : '',
      video.voiceCharacter === 'none' || video.dialogueMode === 'none'
        ? 'บทพูด: ไม่มีบทพูด ห้ามมีเสียงพูดใดๆ ในวิดีโอ;'
        : [
            voiceStyleInstruction ? `สไตล์เสียง: ${voiceStyleInstruction};` : '',
            video.voiceCharacterCustom ? `เสียงพากย์: ${video.voiceCharacterCustom};` : '',
            `สไตล์บทพูด: ${video.scriptStyleCustom || video.scriptStyle || 'รีวิวเป็นกันเอง'};`,
            scene.dialogue ? `บทพูด: ${scene.dialogue};` : '',
          ].filter(Boolean).join('\n'),
      video.musicSfxMode === 'none' ? 'เสียงดนตรีและเอฟเฟค: ห้ามมีเสียงดนตรีหรือเสียงเอฟเฟคใดๆ ทั้งสิ้น;' : '',
      video.musicSfxMode === 'custom' && video.musicSfxCustom ? `เสียงดนตรีและเอฟเฟค: ${video.musicSfxCustom};` : '',
      'ความต่อเนื่อง: ห้ามเปลี่ยนฉาก ห้ามเปลี่ยนสถานที่ ห้ามเปลี่ยนพื้นหลัง วิดีโอทั้งหมดต้องอยู่ในที่เดียวตั้งแต่ต้นจนจบ;',
      'ข้อห้าม: ห้ามมี subtitle ห้ามมีข้อความบนจอ ทุกบทพูดต้องเป็นเสียงเท่านั้น ห้ามมีขอบดำ วิดีโอต้องเต็มจอ;',
      video.systemPrompt ? `คำสั่งเพิ่มเติม: ${video.systemPrompt}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  });
}

function stripPresetDialogueLine(prompt: string): string {
  return prompt
    .split(/;\s*|\n+/)
    .map((part) => part.trim())
    .filter((part) => part && !/^บทพูด\/ข้อความประกอบ\s*:/i.test(part))
    .join('\n');
}

function buildGoogleFlowSelfScriptVideoPrompts({
  product,
  sceneCount,
  videoDuration,
}: {
  product: GoogleFlowRunnerProduct;
  sceneCount: number;
  videoDuration: number;
}): string[] {
  const video = product.settings.video;
  const rawBasePrompt = promptForStep(product, 'video');
  const basePrompt = video.promptMode === 'auto' ? stripPresetDialogueLine(rawBasePrompt) : rawBasePrompt;
  const style = video.presetStyleCustom || video.presetStyle || 'natural product review footage with clear product-first composition';
  const cameraMotion = video.cameraMotionCustom || video.cameraMotion;
  const noSpeech = video.voiceCharacter === 'none' || video.dialogueMode === 'none';

  return Array.from({ length: sceneCount }, (_, index) => {
    const sceneNumber = index + 1;
    return [
      basePrompt,
      `สร้างวิดีโอโฆษณาสินค้าภาษาไทยฉากที่ ${sceneNumber}/${sceneCount} จากรูป reference นี้`,
      'ใช้ฉาก พื้นหลัง สถานที่ สินค้า ตัวละคร หรือมือจากภาพที่แนบมาเท่านั้น ห้ามสร้างฉากใหม่ ห้ามเปลี่ยนสถานที่ ห้ามเพิ่มคนใหม่',
      product.name ? `สินค้า "${product.name}" ต้องเห็นชัดในเฟรมหลักตลอดฉาก` : 'สินค้าต้องเห็นชัดในเฟรมหลักตลอดฉาก',
      'ถ้าในภาพ reference เห็นใบหน้า ต้องรักษาให้ใบหน้าชัดเจน เปิดโล่ง ไม่ถูกสินค้า มือ ผม หมวก แว่น เงา ขอบภาพ หรือวัตถุใดๆ บัง ถ้าไม่เห็นหน้า ห้าม reveal หน้าใหม่',
      `สไตล์วิดีโอ: ${style}`,
      cameraMotion ? `การเคลื่อนกล้อง: ${cameraMotion}` : '',
      noSpeech
        ? 'เสียง: ไม่มีเสียงพูด ไม่มีบทสนทนา ไม่มีคำบรรยายเสียง'
        : `เสียง: ให้ Google Flow คิดบทพูดภาษาไทยเองจากสินค้าและภาพฉากนี้ ไม่ต้องใช้บทพูดที่กำหนดไว้ล่วงหน้า เสียงควรพอดีกับคลิปประมาณ ${videoDuration} วินาที เป็นรีวิวสินค้าแบบ TikTok ที่พูดธรรมชาติและกระชับ`,
      video.musicSfxMode === 'none' ? 'เสียงดนตรีและเอฟเฟค: ห้ามมีเสียงดนตรีหรือเสียงเอฟเฟค' : '',
      video.musicSfxMode === 'custom' && video.musicSfxCustom ? `เสียงดนตรีและเอฟเฟค: ${video.musicSfxCustom}` : '',
      'ข้อห้าม: ห้ามมี subtitle ห้ามมีข้อความบนจอ ห้ามมีขอบดำ วิดีโอต้องเต็มจอ',
      video.systemPrompt ? `คำสั่งเพิ่มเติม: ${video.systemPrompt}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  });
}

function createFallbackMultiScenePromptResult({
  product,
  sceneCount,
  voiceover,
}: {
  product: GoogleFlowRunnerProduct;
  sceneCount: number;
  voiceover: boolean;
}): PreparedMultiScenePromptResult {
  const scenes = Array.from({ length: sceneCount }, (_, index) => ({
    sceneNumber: index + 1,
    dialogue: normalizeDialogueText(dialogueForScene(product, index + 1)),
  }));

  return {
    prompts: buildDesktopLikeVideoPrompts({
      product,
      scenes,
      voiceStyleInstruction: '',
      voiceover,
    }),
    scenes,
    voiceStyleInstruction: '',
    voiceoverScript: '',
    voiceGender: 'neutral',
  };
}

async function prepareAutoMultiScenePrompts({
  product,
  sceneCount,
  sceneImageDataUrls,
  sendImagesToAi,
  videoDuration,
  voiceover,
}: {
  product: GoogleFlowRunnerProduct;
  sceneCount: number;
  sceneImageDataUrls: string[];
  sendImagesToAi: boolean;
  videoDuration: number;
  voiceover: boolean;
}): Promise<PreparedMultiScenePromptResult> {
  const tokens = await getStoredAuthTokens();
  if (!tokens?.accessToken) {
    throw new Error('กรุณาเข้าสู่ระบบก่อนให้ AI คิดบทพูดหลายฉาก');
  }

  const images = sendImagesToAi
    ? sceneImageDataUrls.map(dataUrlToAiImage).filter((image): image is { base64: string; mimeType: string } => !!image?.base64)
    : [];
  if (sendImagesToAi && images.length < sceneCount) {
    throw new Error(`รูปฉากไม่ครบสำหรับให้ AI วิเคราะห์ (${images.length}/${sceneCount})`);
  }

  const response = await fetch(`${BACKEND_URL}/api/v1/ai/generate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      prompt: buildSceneDialoguePrompt(product, sceneCount, voiceover, videoDuration, sendImagesToAi),
      images,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as { text?: string; message?: string; error?: string };
  if (!response.ok) {
    throw new Error(data.message || data.error || 'AI คิดบทพูดหลายฉากไม่สำเร็จ');
  }
  if (!data.text?.trim()) {
    throw new Error('AI ไม่ส่งบทพูดหลายฉากกลับมา');
  }

  const prepared = parsePreparedScenes(data.text, sceneCount);
  const prompts = buildDesktopLikeVideoPrompts({
    product,
    scenes: prepared.scenes,
    voiceStyleInstruction: prepared.voiceStyleInstruction,
    voiceover,
  });
  return { ...prepared, prompts };
}

async function rewriteVideoPromptForFlowError({
  error,
  originalPrompt,
  product,
}: {
  error: string;
  originalPrompt: string;
  product: GoogleFlowRunnerProduct;
}): Promise<{ prompt: string | null; error?: string }> {
  if (!originalPrompt.trim()) {
    return { prompt: null, error: 'ไม่มี prompt เดิมให้ rewrite' };
  }

  const tokens = await getStoredAuthTokens();
  if (!tokens?.accessToken) {
    return { prompt: null, error: 'ยังไม่ได้เข้าสู่ระบบ' };
  }

  const audioFailure = isAudioGenerationFailure(error);
  const prompt = `${audioFailure
    ? 'Fix this Google Flow / Veo product video prompt because the previous generation failed specifically at audio generation.'
    : 'Rewrite this Google Flow / Veo product video prompt into a safer prompt because the previous generation failed.'}

Return only the final prompt text. Do not use markdown. Do not explain.

Product:
- Name: ${product.name || ''}
- Description: ${product.description || ''}
- Caption: ${product.caption || ''}
- CTA: ${product.cta || ''}

Failure:
${error || 'Generation failed'}

Original prompt:
"""${originalPrompt}"""

Rewrite requirements:
- Write clear generation instructions in English, except any spoken Thai dialogue.
- Preserve product identity, reference-image discipline, scene, character, camera framing, face visibility rule, no-subtitle rule, no-on-screen-text rule, and full-screen requirement from the original prompt.
- Keep the attached reference image as the exact visual source when the original prompt uses a reference image.
- Do not invent a new product, new person, new background, new location, or new face.
- If Thai speech is required, keep it plain, natural, TTS-safe, and about 6.3 to 7.0 seconds.
- If the failure is audio-related, simplify audio to one natural Thai narration voice. Remove or soften background music, sound effects, singing, shouting, whispering, ASMR, multiple speakers, and complex voice acting.
- If the original prompt requested no speech or voiceover visual-only footage, preserve that and do not add dialogue.
- Keep the final prompt concise enough for one Google Flow video generation.`.trim();

  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/ai/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        prompt,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { text?: string; message?: string; error?: string };
    if (!response.ok) {
      return { prompt: null, error: data.message || data.error || 'AI rewrite prompt ไม่สำเร็จ' };
    }

    const rewritten = cleanAiPromptText(data.text || '');
    if (rewritten.length < 20) {
      return { prompt: null, error: 'AI rewrite prompt สั้นเกินไป' };
    }

    return { prompt: rewritten };
  } catch (fetchError) {
    return {
      prompt: null,
      error: fetchError instanceof Error ? fetchError.message : String(fetchError),
    };
  }
}

function resolveGeminiTtsVoice(voiceCharacter?: string, voiceGender?: string): string {
  const directVoice = voiceCharacter?.startsWith('tts_') ? voiceCharacter.replace(/^tts_/, '') : '';
  if (directVoice) {
    return directVoice.charAt(0).toUpperCase() + directVoice.slice(1).toLowerCase();
  }
  const voiceMap: Record<string, string> = {
    female: 'Aoede',
    male: 'Puck',
    teen_girl: 'Leda',
    teen_boy: 'Fenrir',
    vendor_female: 'Kore',
    vendor_male: 'Charon',
    office_female: 'Callirrhoe',
    office_male: 'Iapetus',
    aunt: 'Sulafat',
    uncle: 'Orus',
    __custom__: 'Kore',
    '': voiceGender === 'female' ? 'Aoede' : voiceGender === 'male' ? 'Puck' : 'Kore',
  };
  return voiceMap[voiceCharacter || ''] || 'Kore';
}

async function generateVoiceoverAudioDataUrl({
  durationSeconds,
  product,
  sceneDialogues,
  sceneCount,
  voiceStyleInstruction,
  voiceoverScript,
  voiceGender,
}: {
  durationSeconds: number;
  product: GoogleFlowRunnerProduct;
  sceneDialogues?: string[];
  sceneCount: number;
  voiceStyleInstruction?: string;
  voiceoverScript?: string;
  voiceGender?: string;
}): Promise<string | null> {
  const aiSceneScript = sceneDialogues?.map((line) => line.trim()).filter(Boolean).join(' ') ?? '';
  const fallbackScript = Array.from({ length: sceneCount }, (_, index) => dialogueForScene(product, index + 1))
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
  const script = voiceoverScript?.trim() || aiSceneScript || fallbackScript;
  if (!script) {
    return null;
  }
  const tokens = await getStoredAuthTokens();
  if (!tokens?.accessToken) {
    throw new Error('กรุณาเข้าสู่ระบบก่อนสร้างเสียงพากษ์');
  }
  const response = await fetch(`${BACKEND_URL}/api/v1/ai/voiceover`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      voiceoverScript: script,
      sceneCount,
      durationSeconds,
      voiceStyleInstruction,
      voice: resolveGeminiTtsVoice(product.settings.video.voiceCharacter, voiceGender),
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    audioBase64?: string;
    mimeType?: string;
    error?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(data.message || data.error || 'สร้างเสียงพากษ์ไม่สำเร็จ');
  }
  const audioBase64 = data.audioBase64?.trim();
  if (!audioBase64) {
    throw new Error('API ไม่ส่งไฟล์เสียงพากษ์กลับมา');
  }
  if (audioBase64.startsWith('data:')) {
    return audioBase64;
  }
  return `data:${data.mimeType || 'audio/wav'};base64,${audioBase64}`;
}

function promptForStep(product: GoogleFlowRunnerProduct, step: AutoPilotStepType): string {
  const prompt = product.prompts?.[step]?.trim();
  if (prompt) return prompt;

  const productName = product.name?.trim() || 'สินค้า';
  const description = product.description?.trim();
  return [productName, description].filter(Boolean).join('\n');
}

function getProductReferenceFileName(
  product: GoogleFlowRunnerProduct,
  productIndex: number,
  round: number,
  step: AutoPilotStepType
): string {
  const code = product.productId || product.catalogId || product.id || 'product';
  const safeCode = code.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 38) || 'product';
  return `kubdee-product-reference-${safeCode}-p${productIndex + 1}-r${round}-${step}.png`;
}

function getProductReferenceLabel(productIndex: number): string {
  return `รูปสินค้า ลำดับ ${productIndex + 1}`;
}

function getUploadReferenceStage(referenceLabel: unknown): string {
  const label = String(referenceLabel || '').trim();
  if (/สินค้า/.test(label)) return 'upload_product_reference';
  if (/ตัวละคร/.test(label)) return 'upload_character_reference';
  if (/ฉากมุมเดียว/.test(label)) return 'upload_same_angle_scene_reference';
  if (/ฉากก่อนหน้า/.test(label)) return 'upload_previous_scene_reference';
  if (/ฉาก/.test(label)) return 'upload_scene_reference';
  if (/สร้างไว้/.test(label)) return 'upload_generated_image_reference';
  if (/เพิ่งสร้าง/.test(label)) return 'upload_recent_image_reference';
  return 'upload_reference';
}

function getGeneratedImageCacheKey(product: GoogleFlowRunnerProduct, round: number): string {
  return `${round}:${product.id || product.productId || product.catalogId || 'product'}`;
}

function getGeneratedImageReferenceFileName(
  product: GoogleFlowRunnerProduct,
  round: number,
  index = 0
): string {
  const code = product.productId || product.catalogId || product.id || 'product';
  const safeCode = code.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 42) || 'product';
  return `kubdee-generated-${safeCode}-r${round}-${index + 1}.png`;
}

function getSafeReferenceName(value: string | null | undefined, fallback: string): string {
  const clean = value?.trim() || fallback;
  return clean.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || fallback;
}

type AdditionalImageReference = {
  fileName: string;
  label: string;
  stage: string;
  uri: string;
};

function getAdditionalImageReferences(product: GoogleFlowRunnerProduct): AdditionalImageReference[] {
  const imageSettings = product.settings.image;
  const references: AdditionalImageReference[] = [];
  const usedUris = new Set<string>();
  const productPreview = product.preview?.trim();
  if (productPreview) {
    usedUris.add(productPreview);
  }

  const pushReference = ({
    fileName,
    label,
    stage,
    uri,
  }: {
    fileName: string;
    label: string;
    stage: string;
    uri: string | null | undefined;
  }): void => {
    const cleanUri = uri?.trim();
    if (!cleanUri || usedUris.has(cleanUri)) {
      return;
    }
    usedUris.add(cleanUri);
    references.push({ fileName, label, stage, uri: cleanUri });
  };

  if (imageSettings.characterMode !== 'auto' && imageSettings.characterMode !== 'none') {
    pushReference({
      fileName: `kubdee-character-reference-${getSafeReferenceName(
        imageSettings.selectedCharacterId,
        'character'
      )}.png`,
      label: 'ตัวละคร',
      stage: 'attach_character_reference',
      uri: imageSettings.customCharacterUri,
    });
  }

  if (imageSettings.sceneMode !== 'auto' && imageSettings.sceneMode !== 'none') {
    pushReference({
      fileName: `kubdee-scene-reference-${getSafeReferenceName(imageSettings.selectedSceneId, 'scene')}.png`,
      label: 'ฉาก',
      stage: 'attach_scene_reference',
      uri: imageSettings.customSceneUri,
    });
  }

  return references;
}

function getAdditionalVideoReferences(product: GoogleFlowRunnerProduct): AdditionalImageReference[] {
  const references = getAdditionalImageReferences(product);
  if (product.settings.video.characterMode === 'none') {
    return references.filter((reference) => reference.stage !== 'attach_character_reference');
  }
  return references;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('อ่านรูป reference ไม่สำเร็จ'));
    reader.readAsDataURL(blob);
  });
}

async function loadImageReferenceDataUrl(uri: string): Promise<string | null> {
  const cleanUri = uri.trim();
  if (!cleanUri) {
    return null;
  }
  if (cleanUri.startsWith('data:image/')) {
    return cleanUri;
  }
  if (isLocalReferenceUri(cleanUri)) {
    const localDataUrl = await readUriAsDataUrl(cleanUri).catch(() => null);
    if (localDataUrl?.startsWith('data:image/')) {
      return localDataUrl;
    }
  }

  try {
    const response = await fetch(cleanUri);
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    if (!blob.size) {
      return null;
    }
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

function isLocalReferenceUri(uri: string): boolean {
  return uri.startsWith('content://') || uri.startsWith('file://') || uri.startsWith('/');
}

export default function GoogleFlowWebViewRunnerHost({
  theme,
}: GoogleFlowWebViewRunnerHostProps): React.JSX.Element {
  const flowRef = useRef<FlowWebViewHandle>(null);
  const runningRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const payloadRef = useRef<GoogleFlowRunnerPayload | null>(null);
  const flowStatusRef = useRef<FlowConnectionState>('unknown');
  const flowUrlRef = useRef('');
  const actionLogContextRef = useRef<FlowActionLogContext | null>(null);
  const latestGeneratedImageDataUrlsRef = useRef<Map<string, string[]>>(new Map());
  const [visible, setVisible] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [flowStatus, setFlowStatus] = useState<FlowConnectionState>('unknown');
  const [flowWebViewKey, setFlowWebViewKey] = useState(0);
  const [overlayLogs, setOverlayLogs] = useState<OverlayLogLine[]>([]);
  const [overlayProgress, setOverlayProgress] = useState<OverlayProgressState | null>(null);

  const emit = useCallback((entry: Omit<GoogleFlowRunnerLogEntry, 'ts'> & { ts?: number }): void => {
    const ts = entry.ts ?? Date.now();
    const plannedAssetStats = payloadRef.current
      ? getPlannedOverlayAssetStats(payloadRef.current)
      : {
          plannedImages: 0,
          plannedVideos: 0,
          generatedImages: 0,
          generatedVideos: 0,
          failedImages: 0,
          failedVideos: 0,
        };
    const terminalStage =
      entry.status === 'completed' || entry.status === 'stopped' || entry.status === 'error'
        ? entry.status
        : null;
    emitGoogleFlowRunnerLog({ ...entry, ts });
    if (entry.event === 'progress') {
      setOverlayProgress((current) => ({
        currentRound: entry.currentRound ?? current?.currentRound ?? 0,
        totalRounds:
          entry.totalRounds ??
          current?.totalRounds ??
          payloadRef.current?.settings.totalRounds ??
          0,
        currentProduct: entry.currentProduct ?? current?.currentProduct ?? 0,
        totalProducts:
          entry.totalProducts ??
          current?.totalProducts ??
          payloadRef.current?.products.length ??
          0,
        step: entry.step ?? current?.step ?? null,
        stage: entry.stage ?? current?.stage ?? null,
        productName: entry.productName ?? current?.productName ?? '',
        flowStats: entry.flowStats ?? current?.flowStats,
        assetStats: updateOverlayAssetStats(current?.assetStats ?? plannedAssetStats, entry),
        startedAt: current?.startedAt ?? ts,
        updatedAt: ts,
      }));
    } else if (entry.event === 'asset') {
      setOverlayProgress((current) =>
        current
          ? {
              ...current,
              step: entry.step ?? current.step,
              stage: entry.stage ?? current.stage,
              productName: entry.productName ?? current.productName,
              assetStats: updateOverlayAssetStats(current.assetStats ?? plannedAssetStats, entry),
              updatedAt: ts,
            }
          : current
      );
    } else if (terminalStage) {
      setOverlayProgress((current) =>
        current
          ? {
              ...current,
              stage: terminalStage,
              updatedAt: ts,
            }
          : current
      );
    }
    if (entry.message) {
      setOverlayLogs((current) => [
        ...current.slice(-7),
        {
          id: `${ts}-${current.length}`,
          message: entry.message,
          ts,
          step: entry.step,
          stage: entry.stage ?? terminalStage ?? undefined,
        },
      ]);
    }
  }, []);

  const emitFlowActionLog = useCallback(
    (entry: FlowActionLogEntry): void => {
      if (!runningRef.current || !payloadRef.current) {
        return;
      }
      const context = actionLogContextRef.current;
      const payload = context?.payload ?? payloadRef.current;

      emit({
        event: 'progress',
        runId: payload.runId,
        status: 'running',
        level: entry.level,
        step: context?.step,
        stage: context?.stage ?? `flow_${entry.action}`,
        productId: context?.product.id,
        productName: context?.product.name,
        currentRound: context?.round,
        totalRounds: context?.payload.settings.totalRounds ?? payload.settings.totalRounds,
        currentProduct: context ? context.productIndex + 1 : undefined,
        totalProducts: context?.payload.products.length ?? payload.products.length,
        message: entry.message,
        ts: entry.ts,
      });
    },
    [emit]
  );

  const checkStop = useCallback((): void => {
    if (stopRequestedRef.current) {
      throw new GoogleFlowWebViewRunnerStopped();
    }
  }, []);

  const waitForHandle = useCallback(async (): Promise<FlowWebViewHandle> => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (flowRef.current) {
        return flowRef.current;
      }
      await sleep(250);
    }
    throw new Error('WebView ยังไม่พร้อม');
  }, []);

  const runActionOrThrow = useCallback(
    async (
      handle: FlowWebViewHandle,
      action: Parameters<FlowWebViewHandle['runAction']>[0],
      args: Record<string, unknown>,
      timeoutMs: number
    ): Promise<Record<string, unknown>> => {
      checkStop();
      const result = await handle.runAction(action, args, timeoutMs);
      checkStop();
      if (!result.ok) {
        throw new Error(result.error || `${action} ไม่สำเร็จ`);
      }
      return result.result ?? {};
    },
    [checkStop]
  );

  const downloadLatestFlowImage = useCallback(
    async (handle: FlowWebViewHandle, count = 1, baselineImageUrls: string[] = []): Promise<FlowImageDownloadItem | null> => {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        checkStop();
        try {
          const imagePayload = (await runActionOrThrow(
            handle,
            'downloadImages',
            { count, ignoreImageUrls: baselineImageUrls },
            90_000
          )) as FlowImageDownloadPayload;
          const image = imagePayload.images?.find((item) => item.dataUrl);
          if (image?.dataUrl) {
            return image;
          }
        } catch {
          // Retry below. Flow sometimes exposes the completed tile before its image URL is fetchable.
        }

        if (attempt < 3) {
          await sleep(1500);
        }
      }
      return null;
    },
    [checkStop, runActionOrThrow]
  );

  const openGoogleFlowProject = useCallback(
    async ({
      handle,
      payload,
      product,
      productIndex,
      round,
      step,
    }: {
      handle: FlowWebViewHandle;
      payload: GoogleFlowRunnerPayload;
      product: GoogleFlowRunnerProduct;
      productIndex: number;
      round: number;
      step: AutoPilotStepType;
    }): Promise<OpenGoogleFlowProjectResult> => {
      const startedAt = Date.now();
      let lastError = '';

      while (Date.now() - startedAt < 120_000) {
        checkStop();
        const status = flowStatusRef.current;
        const languageIssue = getFlowLanguageIssue(flowUrlRef.current);
        if (languageIssue) {
          const localeText = languageIssue.locale ? `/${languageIssue.locale}/` : 'ภาษาอื่น';
          const message =
            `Google Flow เปิดเป็น ${localeText} ซึ่งทำให้ระบบหาเมนูไม่ตรง ` +
            `กรุณาเปิด Google Flow เป็น English ก่อน แล้วเริ่มรันใหม่อีกครั้ง (${FLOW_ENGLISH_URL})`;
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            level: 'error',
            step,
            stage: 'flow_language_error',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message,
          });
          throw new Error(message);
        }
        if (status === 'signin' || status === 'loggedout') {
          throw new Error('ยังไม่ได้เชื่อมต่อ Google Flow ใน WebView');
        }

        try {
          const previousContext = actionLogContextRef.current;
          const context: FlowActionLogContext = {
            payload,
            product,
            productIndex,
            round,
            step,
            stage: 'open_project',
          };
          actionLogContextRef.current = context;
          try {
            const projectResult = (await runActionOrThrow(
              handle,
              'newProject',
              {},
              35_000
            )) as OpenGoogleFlowProjectResult;
            const prepareContext: FlowActionLogContext = {
              payload,
              product,
              productIndex,
              round,
              step,
              stage: 'prepare_project_ui',
            };
            actionLogContextRef.current = prepareContext;
            try {
              const prepareResult = (await runActionOrThrow(handle, 'prepareProjectUi', {}, 20_000)) as {
                success?: boolean;
                closeError?: string;
                agentError?: string;
              };
              if (prepareResult.success === false) {
                emit({
                  event: 'progress',
                  runId: payload.runId,
                  status: 'running',
                  level: 'warning',
                  step,
                  stage: 'prepare_project_ui',
                  productId: product.id,
                  productName: product.name,
                  currentRound: round,
                  totalRounds: payload.settings.totalRounds,
                  currentProduct: productIndex + 1,
                  totalProducts: payload.products.length,
                  message: `เตรียมหน้า Flow ไม่ครบ: ${prepareResult.closeError || prepareResult.agentError || 'unknown'}`,
                });
              }
            } catch (prepareError) {
              emit({
                event: 'progress',
                runId: payload.runId,
                status: 'running',
                level: 'warning',
                step,
                stage: 'prepare_project_ui',
                productId: product.id,
                productName: product.name,
                currentRound: round,
                totalRounds: payload.settings.totalRounds,
                currentProduct: productIndex + 1,
                totalProducts: payload.products.length,
                message: `เตรียมหน้า Flow ไม่สำเร็จ: ${prepareError instanceof Error ? prepareError.message : String(prepareError)}`,
              });
            }
            return projectResult;
          } finally {
            if (actionLogContextRef.current === context || actionLogContextRef.current?.stage === 'prepare_project_ui') {
              actionLogContextRef.current = previousContext;
            }
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'wait_flow_ready',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `รอ Google Flow WebView พร้อม (${status})`,
          });
          await sleep(3000);
        }
      }

      throw new Error(lastError || 'รอ Google Flow WebView พร้อมไม่สำเร็จ');
    },
    [checkStop, emit, runActionOrThrow]
  );

  const refreshGoogleFlowProject = useCallback(
    async ({
      handle,
      payload,
      product,
      productIndex,
      round,
      step,
      stage,
      message,
    }: {
      handle: FlowWebViewHandle;
      payload: GoogleFlowRunnerPayload;
      product: GoogleFlowRunnerProduct;
      productIndex: number;
      round: number;
      step: AutoPilotStepType;
      stage: string;
      message: string;
    }): Promise<OpenGoogleFlowProjectResult> => {
      checkStop();
      emit({
        event: 'progress',
        runId: payload.runId,
        status: 'running',
        step,
        stage,
        productId: product.id,
        productName: product.name,
        currentRound: round,
        totalRounds: payload.settings.totalRounds,
        currentProduct: productIndex + 1,
        totalProducts: payload.products.length,
        message,
      });
      handle.reload();
      await sleep(3500);
      checkStop();
      return openGoogleFlowProject({
        handle,
        payload,
        product,
        productIndex,
        round,
        step,
      });
    },
    [checkStop, emit, openGoogleFlowProject]
  );

  const cleanupLatestFlowProjectForProduct = useCallback(
    async ({
      handle,
      payload,
      product,
      productIndex,
      round,
    }: {
      handle: FlowWebViewHandle;
      payload: GoogleFlowRunnerPayload;
      product: GoogleFlowRunnerProduct;
      productIndex: number;
      round: number;
    }): Promise<void> => {
      if (!payload.settings.deleteLatestFlowProjectBeforeNewProject) return;
      if (payload.settings.startNewFlowProjectPerProduct === false) return;

      try {
        checkStop();
        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          stage: 'cleanup_latest_project',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: 'เปิดหน้า Flow หลักก่อนลบโปรเจกต์ที่สร้างต่อสินค้า',
        });
        flowUrlRef.current = FLOW_ENGLISH_URL;
        handle.goHome();
        await sleep(3000);
        checkStop();

        const result = (await runActionOrThrow(handle, 'deleteLatestProject', {}, 65_000)) as {
          success?: boolean;
          skipped?: boolean;
          error?: string;
        };
        if (result.success === false) {
          emit({
            runId: payload.runId,
            status: 'running',
            level: 'warning',
            message: `ลบโปรเจกต์ที่สร้างต่อสินค้าไม่สำเร็จ: ${result.error || 'unknown'}`,
          });
          return;
        }
        emit({
          runId: payload.runId,
          status: 'running',
          level: result.skipped ? 'info' : 'success',
          message: result.skipped ? 'ไม่พบโปรเจกต์ที่สร้างต่อสินค้าให้ลบ' : 'ลบโปรเจกต์ที่สร้างต่อสินค้าแล้ว',
        });
      } catch (error) {
        emit({
          runId: payload.runId,
          status: 'running',
          level: 'warning',
          message: `ลบโปรเจกต์ที่สร้างต่อสินค้าไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
    [checkStop, emit, runActionOrThrow]
  );

  const waitForStepResult = useCallback(
    async ({
      baselineVideoUrls,
      baselineImageUrls = [],
      baselineFailedCount = 0,
      count,
      handle,
      payload,
      product,
      productIndex,
      round,
      step,
      countFailure = true,
    }: {
      baselineVideoUrls: string[];
      baselineImageUrls?: string[];
      baselineFailedCount?: number;
      count: number;
      handle: FlowWebViewHandle;
      payload: GoogleFlowRunnerPayload;
      product: GoogleFlowRunnerProduct;
      productIndex: number;
      round: number;
      step: AutoPilotStepType;
      countFailure?: boolean;
    }): Promise<FlowResultPoll> => {
      const startedAt = Date.now();
      const timeoutMs = step === 'video' ? 300_000 : 180_000;
      const resultReadyTimeoutMs = step === 'video' ? 30_000 : 20_000;
      const noStartTimeoutMs = step === 'video' ? 55_000 : 40_000;
      let failConfirm = 0;
      let doneConfirm = 0;
      let hasSeenProgress = false;
      let hasSeenActiveWork = false;
      let lastSeenProgress = 0;
      let resultReadyWaitStart: number | null = null;
      let emptyTilesLogged = false;

      while (Date.now() - startedAt < timeoutMs) {
        checkStop();
        await sleep(resultReadyWaitStart ? 1000 : 4000);
        const result = (await runActionOrThrow(
          handle,
          'videoResults',
          { count, ignoreUrls: baselineVideoUrls, ignoreImageUrls: baselineImageUrls, ignoreFailedCount: baselineFailedCount },
          20_000
        )) as FlowResultPoll;

        const generating = result.generatingCount ?? 0;
        const queued = result.queuedCount ?? 0;
        const failed = result.failedCount ?? 0;
        const success = result.successCount ?? 0;
        const tilesFound = result.tilesFound ?? 0;
        const videos = result.videos ?? [];
        const imageCount = result.images ?? 0;
        const progress = result.progress;
        const expectedCount = Math.max(1, count);
        const readyCount = step === 'video' ? videos.length : imageCount;
        const resolvedCount = readyCount + failed;
        const hasOutput = readyCount > 0;
        const hasCompleteResolution = resolvedCount >= expectedCount;
        const isActive = generating > 0 || queued > 0 || progress != null;
        const elapsedMs = Date.now() - startedAt;
        if (progress != null) {
          hasSeenProgress = true;
          lastSeenProgress = Math.max(lastSeenProgress, progress);
        }
        if (isActive || hasOutput || failed > 0 || tilesFound > 0) {
          hasSeenActiveWork = true;
        }
        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'waiting_result',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          flowStats: {
            generating,
            queued,
            success: Math.max(success, readyCount),
            failed,
            tilesFound,
            progress: progress ?? null,
          },
          message: `รอผล${stepLabel(step)}: gen ${generating} queue ${queued} ok ${readyCount} fail ${failed}${
            progress != null ? ` ${progress}%` : ''
          } (${resolvedCount}/${expectedCount})`,
        });

        if (tilesFound === 0 && !isActive && !hasOutput && failed === 0) {
          failConfirm = 0;
          doneConfirm = 0;
          resultReadyWaitStart = null;
          if (!emptyTilesLogged && elapsedMs > 16_000) {
            emptyTilesLogged = true;
            emit({
              event: 'progress',
              runId: payload.runId,
              status: 'running',
              level: 'warning',
              step,
              stage: 'waiting_start',
              productId: product.id,
              productName: product.name,
              currentRound: round,
              totalRounds: payload.settings.totalRounds,
              currentProduct: productIndex + 1,
              totalProducts: payload.products.length,
              message: `ยังไม่พบ tile หรือ progress ของ${stepLabel(step)}หลัง submit กำลังรออีกสักครู่`,
            });
          }
          if (!hasSeenActiveWork && elapsedMs > noStartTimeoutMs) {
            throw new Error(`ไม่พบการเริ่มสร้าง${stepLabel(step)}ภายใน ${Math.round(noStartTimeoutMs / 1000)} วินาที`);
          }
          continue;
        }

        if (isActive) {
          failConfirm = 0;
          doneConfirm = 0;
          resultReadyWaitStart = null;
          continue;
        }

        if (hasOutput && hasCompleteResolution) {
          resultReadyWaitStart = null;
          doneConfirm += 1;
          if (doneConfirm >= 2) {
            const failedOutputCount = Math.max(0, expectedCount - readyCount);
            if (failedOutputCount > 0) {
              emit({
                event: 'progress',
                runId: payload.runId,
                status: 'running',
                level: 'warning',
                step,
                stage: countFailure ? 'failed' : 'flow_failed_detected',
                productId: product.id,
                productName: product.name,
                currentRound: round,
                totalRounds: payload.settings.totalRounds,
                currentProduct: productIndex + 1,
                totalProducts: payload.products.length,
                failedOutputs: failedOutputCount,
                message: `ได้ผล${stepLabel(step)} ${readyCount}/${expectedCount} และมี ${failedOutputCount} รายการที่สร้างไม่สำเร็จ`,
              });
            }
            return result;
          }
        } else if (!hasOutput && failed > 0 && hasCompleteResolution) {
          failConfirm += 1;
          if (failConfirm >= 3) {
            const failedError = buildFlowFailedError(step, result);
            emit({
              event: 'progress',
              runId: payload.runId,
              status: 'running',
              step,
              stage: countFailure ? 'failed' : 'flow_failed_detected',
              productId: product.id,
              productName: product.name,
              currentRound: round,
              totalRounds: payload.settings.totalRounds,
              currentProduct: productIndex + 1,
              totalProducts: payload.products.length,
              failedOutputs: Math.max(1, Math.min(expectedCount, failed)),
              message: failedError,
            });
            throw countFailure
              ? new GoogleFlowCountedStepFailure(failedError, step, Math.max(1, Math.min(expectedCount, failed)))
              : new Error(failedError);
          }
        } else if (hasOutput || failed > 0) {
          failConfirm = 0;
          doneConfirm = 0;
          if (!resultReadyWaitStart) {
            resultReadyWaitStart = Date.now();
            emit({
              event: 'progress',
              runId: payload.runId,
              status: 'running',
              level: 'warning',
              step,
              stage: 'waiting_result_settle',
              productId: product.id,
              productName: product.name,
              currentRound: round,
              totalRounds: payload.settings.totalRounds,
              currentProduct: productIndex + 1,
              totalProducts: payload.products.length,
              flowStats: {
                generating,
                queued,
                success: Math.max(success, readyCount),
                failed,
                tilesFound,
                progress: progress ?? null,
              },
              message: `พบผล${stepLabel(step)}บางส่วนแล้ว (${resolvedCount}/${expectedCount}) กำลังรอให้ครบตามจำนวน`,
            });
            continue;
          }
          const waitElapsed = Date.now() - resultReadyWaitStart;
          if (waitElapsed > resultReadyTimeoutMs) {
            if (hasOutput) {
              const failedOutputCount = Math.max(0, expectedCount - readyCount);
              if (failedOutputCount > 0) {
                emit({
                  event: 'progress',
                  runId: payload.runId,
                  status: 'running',
                  level: 'warning',
                  step,
                  stage: countFailure ? 'failed' : 'flow_failed_detected',
                  productId: product.id,
                  productName: product.name,
                  currentRound: round,
                  totalRounds: payload.settings.totalRounds,
                  currentProduct: productIndex + 1,
                  totalProducts: payload.products.length,
                  failedOutputs: failedOutputCount,
                  message: `รอผล${stepLabel(step)}ครบไม่สำเร็จ จะใช้ผลที่ได้ ${readyCount}/${expectedCount} และนับที่ไม่สำเร็จ ${failedOutputCount} รายการเป็นล้มเหลว`,
                });
              }
              return {
                ...result,
                failedCount: failedOutputCount,
                successCount: Math.max(success, readyCount),
              };
            }

            const failedResult = {
              ...result,
              failedCount: Math.max(failed, expectedCount),
            };
            const failedError = buildFlowFailedError(step, failedResult);
            emit({
              event: 'progress',
              runId: payload.runId,
              status: 'running',
              step,
              stage: countFailure ? 'failed' : 'flow_failed_detected',
              productId: product.id,
              productName: product.name,
              currentRound: round,
              totalRounds: payload.settings.totalRounds,
              currentProduct: productIndex + 1,
              totalProducts: payload.products.length,
              failedOutputs: Math.max(1, Math.min(expectedCount, failedResult.failedCount ?? expectedCount)),
              message: failedError,
            });
            throw countFailure
              ? new GoogleFlowCountedStepFailure(
                  failedError,
                  step,
                  Math.max(1, Math.min(expectedCount, failedResult.failedCount ?? expectedCount))
                )
              : new Error(failedError);
          }
        } else if (hasSeenProgress && lastSeenProgress >= 40) {
          failConfirm = 0;
          doneConfirm = 0;
          if (!resultReadyWaitStart) {
            resultReadyWaitStart = Date.now();
            emit({
              event: 'progress',
              runId: payload.runId,
              status: 'running',
              step,
              stage: 'waiting_result_settle',
              productId: product.id,
              productName: product.name,
              currentRound: round,
              totalRounds: payload.settings.totalRounds,
              currentProduct: productIndex + 1,
              totalProducts: payload.products.length,
              flowStats: {
                generating,
                queued,
                success,
                failed,
                tilesFound,
                progress: progress ?? null,
              },
              message: `Progress ${stepLabel(step)}หายหลังเห็น ${lastSeenProgress}% กำลังรอ URL/preview แสดงบนการ์ด`,
            });
            continue;
          }
          const waitElapsed = Date.now() - resultReadyWaitStart;
          if (waitElapsed > resultReadyTimeoutMs) {
            throw new Error(`รอ URL/preview ของ${stepLabel(step)}หลัง progress หายไม่สำเร็จ`);
          }
        } else {
          failConfirm = 0;
          doneConfirm = 0;
          resultReadyWaitStart = null;
        }
      }

      throw new Error(`หมดเวลารอผล${stepLabel(step)}`);
    },
    [checkStop, emit, runActionOrThrow]
  );

  const fillPromptAndSubmit = useCallback(
    async ({
      baselineVideoUrls,
      baselineImageUrls = [],
      baselineFailedCount = 0,
      count,
      handle,
      payload,
      product,
      productIndex,
      prompt,
      round,
      step,
    }: {
      baselineVideoUrls: string[];
      baselineImageUrls?: string[];
      baselineFailedCount?: number;
      count: number;
      handle: FlowWebViewHandle;
      payload: GoogleFlowRunnerPayload;
      product: GoogleFlowRunnerProduct;
      productIndex: number;
      prompt: string;
      round: number;
      step: AutoPilotStepType;
    }): Promise<void> => {
      checkStop();
      const startChecks = step === 'video' ? 8 : 7;
      const runActionWithLogContext = async (
        action: Parameters<FlowWebViewHandle['runAction']>[0],
        args: Record<string, unknown>,
        timeoutMs: number,
        stage: string
      ): Promise<Record<string, unknown>> => {
        const previousContext = actionLogContextRef.current;
        const context: FlowActionLogContext = {
          payload,
          product,
          productIndex,
          round,
          step,
          stage,
        };
        actionLogContextRef.current = context;
        try {
          return await runActionOrThrow(handle, action, args, timeoutMs);
        } finally {
          if (actionLogContextRef.current === context) {
            actionLogContextRef.current = previousContext;
          }
        }
      };
      const emitPromptFillVerification = (result: Record<string, unknown>, stage: string): void => {
        const expectedLength = typeof result.expectedLength === 'number' ? result.expectedLength : null;
        const actualLength = typeof result.actualLength === 'number' ? result.actualLength : null;
        const fillType = typeof result.type === 'string' ? result.type : 'unknown';
        if (expectedLength == null || actualLength == null) {
          return;
        }
        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          level: 'success',
          step,
          stage,
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: `ตรวจ prompt สำเร็จ (${fillType}) ${actualLength}/${expectedLength} ตัวอักษร`,
        });
      };

      const checkFlowStarted = async (maxChecks: number, stage: string): Promise<boolean> => {
        for (let startCheck = 1; startCheck <= maxChecks; startCheck += 1) {
          checkStop();
          const result = (await runActionOrThrow(
            handle,
            'videoResults',
            { count, ignoreUrls: baselineVideoUrls, ignoreImageUrls: baselineImageUrls, ignoreFailedCount: baselineFailedCount },
            20_000
          )) as FlowResultPoll;

          const generating = result.generatingCount ?? 0;
          const queued = result.queuedCount ?? 0;
          const success = result.successCount ?? 0;
          const failed = result.failedCount ?? 0;
          const progress = result.progress;
          const hasOutput = step === 'video' ? (result.videos ?? []).length > 0 : (result.images ?? 0) > 0;

          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step,
            stage,
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            flowStats: {
              generating,
              queued,
              success,
              failed,
              tilesFound: result.tilesFound ?? 0,
              progress: progress ?? null,
            },
            message: `ตรวจหลัง submit ${startCheck}/${maxChecks}: gen ${generating} queue ${queued} ok ${success} fail ${failed}${
              progress != null ? ` ${progress}%` : ''
            }`,
          });

          if (generating > 0 || queued > 0 || progress != null || hasOutput) {
            return true;
          }

          if (startCheck < maxChecks) {
            await sleep(step === 'video' ? 5_000 : 4_000);
          }
        }

        return false;
      };

      const fillPromptResult = await runActionWithLogContext('fillPrompt', { prompt }, 45_000, 'fill_prompt');
      emitPromptFillVerification(fillPromptResult, 'fill_prompt_verified');
      await runActionWithLogContext('submit', {}, 45_000, 'submitted');
      await sleep(step === 'video' ? 10_000 : 8_000);

      if (await checkFlowStarted(startChecks, 'submit_start_check')) {
        return;
      }

      emit({
        event: 'progress',
        runId: payload.runId,
        status: 'running',
        step,
        stage: 'retype_prompt_retry',
        productId: product.id,
        productName: product.name,
        currentRound: round,
        totalRounds: payload.settings.totalRounds,
        currentProduct: productIndex + 1,
        totalProducts: payload.products.length,
        message: `ยังไม่เห็น Flow เริ่มสร้าง${stepLabel(step)} จะ retype prompt แล้ว submit ซ้ำ 1 ครั้ง`,
      });

      const retypePromptResult = await runActionWithLogContext('fillPrompt', { prompt }, 45_000, 'retype_prompt_retry');
      emitPromptFillVerification(retypePromptResult, 'retype_prompt_verified');
      await runActionWithLogContext('submit', {}, 45_000, 'retype_submitted');
      await sleep(step === 'video' ? 10_000 : 8_000);

      if (await checkFlowStarted(Math.max(4, Math.ceil(startChecks / 2)), 'retype_start_check')) {
        return;
      }

      emit({
        event: 'progress',
        runId: payload.runId,
        status: 'running',
        step,
        stage: 'submit_wait_after_retype',
        productId: product.id,
        productName: product.name,
        currentRound: round,
        totalRounds: payload.settings.totalRounds,
        currentProduct: productIndex + 1,
        totalProducts: payload.products.length,
        message: `ยังไม่เห็น Flow เริ่มสร้าง${stepLabel(step)}หลัง retype จะรอผลต่อโดยไม่กดสร้างซ้ำ`,
      });
    },
    [checkStop, emit, runActionOrThrow]
  );

  const ensureVideoReferenceAttached = useCallback(
    async ({
      handle,
      payload,
      product,
      productIndex,
      round,
      step,
      message = 'ตรวจสอบรูป reference ก่อนกดสร้างวิดีโอ',
    }: {
      handle: FlowWebViewHandle;
      payload: GoogleFlowRunnerPayload;
      product: GoogleFlowRunnerProduct;
      productIndex: number;
      round: number;
      step: AutoPilotStepType;
      message?: string;
    }): Promise<void> => {
      emit({
        event: 'progress',
        runId: payload.runId,
        status: 'running',
        step,
        stage: 'ensure_video_reference',
        productId: product.id,
        productName: product.name,
        currentRound: round,
        totalRounds: payload.settings.totalRounds,
        currentProduct: productIndex + 1,
        totalProducts: payload.products.length,
        message,
      });

      const previousContext = actionLogContextRef.current;
      const context: FlowActionLogContext = {
        payload,
        product,
        productIndex,
        round,
        step,
        stage: 'ensure_video_reference',
      };
      actionLogContextRef.current = context;
      let result: { attachedCount?: number };
      try {
        result = (await runActionOrThrow(
          handle,
          'ensureVideoReferenceAttached',
          {},
          20_000
        )) as { attachedCount?: number };
      } finally {
        if (actionLogContextRef.current === context) {
          actionLogContextRef.current = previousContext;
        }
      }

      emit({
        event: 'progress',
        runId: payload.runId,
        status: 'running',
        step,
        stage: 'ensure_video_reference',
        productId: product.id,
        productName: product.name,
        currentRound: round,
        totalRounds: payload.settings.totalRounds,
        currentProduct: productIndex + 1,
        totalProducts: payload.products.length,
        message: `ตรวจพบรูป reference ก่อนสร้างวิดีโอแล้ว (${result.attachedCount || 1} รูป)`,
      });
    },
    [emit, runActionOrThrow]
  );

  const uploadReferenceImageOrThrow = useCallback(
    async ({
      args,
      handle,
      payload,
      product,
      productIndex,
      round,
      step,
    }: {
      args: Record<string, unknown>;
      handle: FlowWebViewHandle;
      payload: GoogleFlowRunnerPayload;
      product: GoogleFlowRunnerProduct;
      productIndex: number;
      round: number;
      step: AutoPilotStepType;
    }): Promise<Record<string, unknown>> => {
      const previousContext = actionLogContextRef.current;
      const context: FlowActionLogContext = {
        payload,
        product,
        productIndex,
        round,
        step,
        stage: getUploadReferenceStage(args.referenceLabel),
      };
      actionLogContextRef.current = context;
      try {
        const result = await runActionOrThrow(handle, 'uploadReferenceImage', args, 120_000);
        if (result.rateLimitRetried) {
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            level: 'warning',
            step,
            stage: 'upload_reference_retry',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: 'Google Flow จำกัดความถี่อัปโหลดรูป ระบบรอ 30 วิและอัปโหลด reference สำเร็จหลัง retry',
          });
        }
        return result;
      } finally {
        if (actionLogContextRef.current === context) {
          actionLogContextRef.current = previousContext;
        }
      }
    },
    [emit, runActionOrThrow]
  );

  const selectRecentImageOrThrow = useCallback(
    async ({
      handle,
      indexOffset = 0,
      payload,
      product,
      productIndex,
      round,
      stage,
      step,
    }: {
      handle: FlowWebViewHandle;
      indexOffset?: number;
      payload: GoogleFlowRunnerPayload;
      product: GoogleFlowRunnerProduct;
      productIndex: number;
      round: number;
      stage: string;
      step: AutoPilotStepType;
    }): Promise<Record<string, unknown>> => {
      const previousContext = actionLogContextRef.current;
      const context: FlowActionLogContext = {
        payload,
        product,
        productIndex,
        round,
        step,
        stage,
      };
      actionLogContextRef.current = context;
      try {
        return await runActionOrThrow(handle, 'selectRecentImage', { indexOffset }, 45_000);
      } finally {
        if (actionLogContextRef.current === context) {
          actionLogContextRef.current = previousContext;
        }
      }
    },
    [runActionOrThrow]
  );

  const runProductStep = useCallback(
    async ({
      handle,
      payload,
      product,
      productIndex,
      round,
      step,
    }: {
      handle: FlowWebViewHandle;
      payload: GoogleFlowRunnerPayload;
      product: GoogleFlowRunnerProduct;
      productIndex: number;
      round: number;
      step: AutoPilotStepType;
    }): Promise<void> => {
      const label = stepLabel(step);
      const count = outputCountForStep(product, step);
      const prompt = promptForStep(product, step);
      if (!prompt.trim()) {
        throw new Error(`prompt ${label} ว่าง`);
      }
      const runActionWithProductContext = async (
        action: Parameters<FlowWebViewHandle['runAction']>[0],
        args: Record<string, unknown>,
        timeoutMs: number,
        stage: string,
        contextStep: AutoPilotStepType = step
      ): Promise<Record<string, unknown>> => {
        const previousContext = actionLogContextRef.current;
        const context: FlowActionLogContext = {
          payload,
          product,
          productIndex,
          round,
          step: contextStep,
          stage,
        };
        actionLogContextRef.current = context;
        try {
          return await runActionOrThrow(handle, action, args, timeoutMs);
        } finally {
          if (actionLogContextRef.current === context) {
            actionLogContextRef.current = previousContext;
          }
        }
      };

      if (step === 'video' && isAutoMultiSceneVideo(product)) {
        const sceneCount = clampAutoSceneCount(product.settings.video.sceneCount);
        const sceneMode = autoMultiSceneMode(product);
        const useSameAngle = sceneMode === 'same_angle';
        const useVoiceover = sceneMode === 'voiceover';
        const imageModel = imageModelForProduct(product, payload.settings);
        const videoModel = videoModelForProduct(product, payload.settings);
        const videoDuration = videoDurationForProduct(product, payload.settings);

        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'multi_scene_start',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: `เริ่มวิดีโอหลายฉาก ${sceneCount} ฉาก (${useSameAngle ? 'มุมเดียว' : useVoiceover ? 'เสียงพากษ์' : 'หลายมุม'})`,
        });

        const initialProject = await openGoogleFlowProject({
          handle,
          payload,
          product,
          productIndex,
          round,
          step,
        });
        let skipNextRefresh = shouldSkipRefreshAfterFreshProjectOpen({
          productIndex,
          projectResult: initialProject,
          round,
        });
        const consumeSkipNextRefresh = (): boolean => {
          if (!skipNextRefresh) {
            return false;
          }
          skipNextRefresh = false;
          return true;
        };

        const hasPriorImageStep = payload.enabledSteps.includes('image');
        const neededSceneImages = useSameAngle ? (hasPriorImageStep ? 0 : 1) : hasPriorImageStep ? sceneCount - 1 : sceneCount;
        const firstGeneratedSceneNumber = !useSameAngle && hasPriorImageStep ? 2 : 1;
        const sceneImageDataUrls: string[] = [];

        if (hasPriorImageStep) {
          const cachedPriorImages = latestGeneratedImageDataUrlsRef.current.get(
            getGeneratedImageCacheKey(product, round)
          );
          const cachedPriorImage = cachedPriorImages?.[0];
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step: 'image',
            stage: 'multi_scene_capture_prior_image',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: cachedPriorImage
              ? 'ใช้รูปที่บันทึกไว้ของสินค้านี้เป็น reference วิดีโอหลายฉาก'
              : 'ดึงรูปที่เพิ่งสร้างจากหน้า Flow เพื่อใช้ต่อในวิดีโอหลายฉาก',
          });
          if (cachedPriorImage) {
            sceneImageDataUrls.push(cachedPriorImage);
          } else {
            const priorImage = await downloadLatestFlowImage(handle, 1);
            if (!priorImage?.dataUrl) {
              throw new Error('ดึงรูปที่เพิ่งสร้างจากหน้า Flow ไม่สำเร็จ');
            }
            sceneImageDataUrls.push(priorImage.dataUrl);
          }
        }

        for (let sceneIndex = 0; sceneIndex < neededSceneImages; sceneIndex += 1) {
          checkStop();
          const sceneNumber = firstGeneratedSceneNumber + sceneIndex;
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step: 'image',
            stage: 'multi_scene_image',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `หลายฉาก: สร้างรูปฉาก ${sceneNumber}/${sceneCount}`,
          });

          const sceneImagePrompt = multiSceneImagePrompt(
            product,
            sceneNumber,
            sceneCount,
            useSameAngle,
            promptForStep(product, 'image')
          );
          const maxSceneImageAttempts = 2;
          let sceneImage: FlowImageDownloadItem | null = null;

          for (let imageAttempt = 1; imageAttempt <= maxSceneImageAttempts; imageAttempt += 1) {
            const finalImageAttempt = imageAttempt >= maxSceneImageAttempts;
            try {
              checkStop();
              if (!consumeSkipNextRefresh()) {
                await refreshGoogleFlowProject({
                  handle,
                  payload,
                  product,
                  productIndex,
                  round,
                  step: 'image',
                  stage: imageAttempt === 1 ? 'multi_scene_refresh_image' : 'multi_scene_image_retry_refresh',
                  message:
                    imageAttempt === 1
                      ? `รีเฟรชหน้า Flow ก่อนสร้างรูปฉาก ${sceneNumber}/${sceneCount}`
                      : `รีเฟรชหน้า Flow ก่อน retry รูปฉาก ${sceneNumber}/${sceneCount}`,
                });
              }

              const config = (await runActionWithProductContext(
                'configurePopper',
                {
                  targetMode: 'image',
                  aspectRatio: product.settings.image.aspectRatio,
                  outputCount: 1,
                  imageModel,
                },
                70_000,
                imageAttempt === 1 ? 'multi_scene_config_image' : 'multi_scene_image_retry_config',
                'image'
              )) as { success?: boolean; error?: string };
              if (config.success === false) {
                throw new Error(`ตั้งค่า Flow รูปฉากไม่ครบ: ${config.error ?? 'unknown'}`);
              }

              if (product.preview) {
                emit({
                  event: 'progress',
                  runId: payload.runId,
                  status: 'running',
                  step: 'image',
                  stage: 'multi_scene_attach_product_reference',
                  productId: product.id,
                  productName: product.name,
                  currentRound: round,
                  totalRounds: payload.settings.totalRounds,
                  currentProduct: productIndex + 1,
                  totalProducts: payload.products.length,
                  message: `แนบ${getProductReferenceLabel(productIndex)}เป็น reference สำหรับสร้างรูปฉาก ${sceneNumber}/${sceneCount}: ${product.name || 'สินค้า'}`,
                });
                const productReferenceDataUrl = await loadImageReferenceDataUrl(product.preview);
                await uploadReferenceImageOrThrow({
                  handle,
                  payload,
                  product,
                  productIndex,
                  round,
                  step: 'image',
                  args: {
                    dataUrl: productReferenceDataUrl ?? undefined,
                    fileName: getProductReferenceFileName(product, productIndex, round, 'image'),
                    imageUrl: productReferenceDataUrl ? undefined : product.preview,
                    referenceLabel: getProductReferenceLabel(productIndex),
                  },
                });
              } else {
                emit({
                  event: 'progress',
                  runId: payload.runId,
                  status: 'running',
                  level: 'warning',
                  step: 'image',
                  stage: 'multi_scene_attach_product_reference',
                  productId: product.id,
                  productName: product.name,
                  currentRound: round,
                  totalRounds: payload.settings.totalRounds,
                  currentProduct: productIndex + 1,
                  totalProducts: payload.products.length,
                  message: `ไม่มีรูปสินค้าให้แนบสำหรับสร้างรูปฉาก ${sceneNumber}/${sceneCount}: ${product.name || 'สินค้า'}`,
                });
              }

              for (const reference of getAdditionalImageReferences(product)) {
                emit({
                  event: 'progress',
                  runId: payload.runId,
                  status: 'running',
                  step: 'image',
                  stage: reference.stage,
                  productId: product.id,
                  productName: product.name,
                  currentRound: round,
                  totalRounds: payload.settings.totalRounds,
                  currentProduct: productIndex + 1,
                  totalProducts: payload.products.length,
                  message: `แนบรูป${reference.label}เป็น reference สำหรับสร้างรูปฉาก ${sceneNumber}/${sceneCount}`,
                });
                const referenceDataUrl = await loadImageReferenceDataUrl(reference.uri);
                await uploadReferenceImageOrThrow({
                  handle,
                  payload,
                  product,
                  productIndex,
                  round,
                  step: 'image',
                  args: {
                    dataUrl: referenceDataUrl ?? undefined,
                    fileName: reference.fileName,
                    imageUrl: referenceDataUrl ? undefined : reference.uri,
                    referenceLabel: `รูป${reference.label}`,
                  },
                });
              }

              const previousSceneImageDataUrl = sceneImageDataUrls[sceneImageDataUrls.length - 1];
              if ((sceneNumber > 1 || hasPriorImageStep) && previousSceneImageDataUrl) {
                emit({
                  event: 'progress',
                  runId: payload.runId,
                  status: 'running',
                  step: 'image',
                  stage: 'multi_scene_attach_previous_image',
                  productId: product.id,
                  productName: product.name,
                  currentRound: round,
                  totalRounds: payload.settings.totalRounds,
                  currentProduct: productIndex + 1,
                  totalProducts: payload.products.length,
                  message: `เลือกรูปฉากก่อนหน้าจากรายการบนสุดใน Flow เป็น reference สำหรับสร้างรูปฉาก ${sceneNumber}`,
                });
                try {
                  await selectRecentImageOrThrow({
                    handle,
                    payload,
                    product,
                    productIndex,
                    round,
                    stage: 'multi_scene_select_recent_reference',
                    step: 'image',
                  });
                } catch (selectError) {
                  const reason = selectError instanceof Error ? selectError.message : String(selectError);
                  emit({
                    event: 'progress',
                    runId: payload.runId,
                    status: 'running',
                    level: 'warning',
                    step: 'image',
                    stage: 'multi_scene_upload_reference_fallback',
                    productId: product.id,
                    productName: product.name,
                    currentRound: round,
                    totalRounds: payload.settings.totalRounds,
                    currentProduct: productIndex + 1,
                    totalProducts: payload.products.length,
                    message: `เลือกรูปฉากก่อนหน้าล่าสุดไม่สำเร็จ: ${reason || 'unknown'} — จะอัปโหลดรูปฉากก่อนหน้าแทน`,
                  });
                  await uploadReferenceImageOrThrow({
                    handle,
                    payload,
                    product,
                    productIndex,
                    round,
                    step: 'image',
                    args: {
                      dataUrl: previousSceneImageDataUrl,
                      fileName: `kubdee-scene-reference-${sceneNumber}.png`,
                      referenceLabel: 'รูปฉากก่อนหน้า',
                    },
                  });
                }
              } else if (sceneNumber > 1 || hasPriorImageStep) {
                throw new Error(`ไม่มีรูป reference ของฉากก่อนหน้า สำหรับสร้างรูปฉาก ${sceneNumber}`);
              }

              const imageSnapshot = (await runActionOrThrow(handle, 'videoSnapshot', {}, 15_000)) as FlowSnapshot;
              const baselineImageUrls = imageSnapshot.imageUrls ?? [];
              const baselineFailedCount = imageSnapshot.failedCount ?? 0;
              emit({
                event: 'progress',
                runId: payload.runId,
                status: 'running',
                step: 'image',
                stage: 'flow_videoSnapshot',
                productId: product.id,
                productName: product.name,
                currentRound: round,
                totalRounds: payload.settings.totalRounds,
                currentProduct: productIndex + 1,
                totalProducts: payload.products.length,
                message: `บันทึกสถานะเดิมก่อนสร้างรูปฉาก ${sceneNumber}: รูป ${baselineImageUrls.length} · failed ${baselineFailedCount} · tiles ${imageSnapshot.tileCount ?? 0}`,
              });
              await fillPromptAndSubmit({
                baselineVideoUrls: [],
                baselineImageUrls,
                baselineFailedCount,
                count: 1,
                handle,
                payload,
                product,
                productIndex,
                prompt: sceneImagePrompt,
                round,
                step: 'image',
              });
              const imageResult = await waitForStepResult({
                baselineVideoUrls: [],
                baselineImageUrls,
                baselineFailedCount,
                countFailure: finalImageAttempt,
                count: 1,
                handle,
                payload,
                product,
                productIndex,
                round,
                step: 'image',
              });
              const imageCount = Math.max(1, Number(imageResult.images ?? 1) || 1);
              const firstImage = await downloadLatestFlowImage(handle, imageCount, baselineImageUrls);
              if (!firstImage?.dataUrl) {
                throw new Error(`ดึงรูปฉาก ${sceneNumber} จากหน้า Flow ไม่สำเร็จ`);
              }
              sceneImage = firstImage;
              break;
            } catch (error) {
              if (!isRetryableFlowError(error) || finalImageAttempt) {
                throw error;
              }
              const retryReason = error instanceof Error ? error.message : String(error);
              emit({
                event: 'progress',
                runId: payload.runId,
                status: 'running',
                level: 'warning',
                step: 'image',
                stage: 'multi_scene_image_retry',
                productId: product.id,
                productName: product.name,
                currentRound: round,
                totalRounds: payload.settings.totalRounds,
                currentProduct: productIndex + 1,
                totalProducts: payload.products.length,
                message: `รูปฉาก ${sceneNumber} ล้มเหลว จะ retry เฉพาะฉากนี้โดยใช้ reference เดิม: ${retryReason}`,
              });
            }
          }

          if (!sceneImage?.dataUrl) {
            throw new Error(`สร้างรูปฉาก ${sceneNumber} ไม่สำเร็จหลัง retry`);
          }

          sceneImageDataUrls.push(sceneImage.dataUrl);
          const downloaded = await saveGoogleFlowDataUrlAsset('image', sceneImage.dataUrl, sceneImage.fileName);
          if (downloaded?.uri) {
            emit({
              event: 'asset',
            runId: payload.runId,
            status: 'running',
            step: 'image',
            stage: 'generated',
            profileLocalId: payload.profileLocalId,
            productId: product.id,
            productName: product.name,
            fileUri: downloaded.uri,
              fileName: downloaded.fileName,
              mimeType: downloaded.mimeType || sceneImage.mimeType || 'image/png',
              sizeBytes: downloaded.sizeBytes || sceneImage.sizeBytes || undefined,
              createdAt: downloaded.createdAt || Date.now(),
              message: `ได้รูปฉาก ${sceneNumber}/${sceneCount} แล้ว`,
            });
          }
        }

        const useAiSceneScript = useVoiceover || product.settings.video.multiSceneAiScriptEnabled !== false;
        const sendImagesToAi = useAiSceneScript && product.settings.video.multiSceneSendImagesToAi === true;
        const promptImageDataUrls = sendImagesToAi
          ? useSameAngle
            ? Array.from({ length: sceneCount }, () => sceneImageDataUrls[0]).filter(Boolean)
            : sceneImageDataUrls.slice(0, sceneCount)
          : [];

        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'multi_scene_prepare_prompts',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: useAiSceneScript
            ? useVoiceover
              ? `[วิดีโอ] AI กำลังคิดบทพากย์รวม ${sceneCount} ฉาก${sendImagesToAi ? 'จากรูปทั้งหมด' : 'โดยไม่ส่งรูป'} ใช้เวลาสักครู่`
              : `[วิดีโอ] AI กำลังคิดบทพูด ${sceneCount} ฉาก${sendImagesToAi ? 'จากรูปทั้งหมด' : 'โดยไม่ส่งรูป'} ใช้เวลาสักครู่`
            : '[วิดีโอ] ปิด AI คิดบท ใช้ prompt วิดีโอปกติให้ Google Flow คิดเอง',
        });

        let promptResult = createFallbackMultiScenePromptResult({
          product,
          sceneCount,
          voiceover: useVoiceover,
        });
        if (useAiSceneScript) {
          promptResult = await prepareAutoMultiScenePrompts({
            product,
            sceneCount,
            sceneImageDataUrls: promptImageDataUrls,
            sendImagesToAi,
            videoDuration,
            voiceover: useVoiceover,
          });
        } else {
          promptResult = {
            prompts: buildGoogleFlowSelfScriptVideoPrompts({
              product,
              sceneCount,
              videoDuration,
            }),
            scenes: [],
            voiceStyleInstruction: '',
            voiceoverScript: '',
            voiceGender: 'neutral',
          };
        }

        for (const scene of promptResult.scenes) {
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'multi_scene_dialogue_ready',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `บทฉาก ${scene.sceneNumber}: ${scene.dialogue.slice(0, 80)}`,
          });
        }

        const sceneVideoUris: string[] = [];
        for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex += 1) {
          checkStop();
          const sceneNumber = sceneIndex + 1;
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'multi_scene_video',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `หลายฉาก: สร้างวิดีโอฉาก ${sceneNumber}/${sceneCount}`,
          });

          if (!consumeSkipNextRefresh()) {
            await refreshGoogleFlowProject({
              handle,
              payload,
              product,
              productIndex,
              round,
              step,
              stage: 'multi_scene_refresh_video',
              message: `รีเฟรชหน้า Flow ก่อนสร้างวิดีโอฉาก ${sceneNumber}/${sceneCount}`,
            });
          }

          const config = (await runActionWithProductContext(
            'configurePopper',
            {
              targetMode: 'video',
              aspectRatio: product.settings.video.aspectRatio,
              outputCount: 1,
              videoDuration,
              videoModel,
            },
            70_000,
            'multi_scene_config_video'
          )) as { success?: boolean; error?: string };
          if (config.success === false) {
            throw new Error(`ตั้งค่า Flow วิดีโอฉากไม่ครบ: ${config.error ?? 'unknown'}`);
          }

          const sceneReferenceDataUrl = useSameAngle
            ? sceneImageDataUrls[0]
            : sceneImageDataUrls[sceneIndex];
          const attachSceneReference = async (): Promise<boolean> => {
            if (useSameAngle && sceneReferenceDataUrl) {
              emit({
                event: 'progress',
                runId: payload.runId,
                status: 'running',
                step,
                stage: 'multi_scene_attach_same_angle_reference',
                productId: product.id,
                productName: product.name,
                currentRound: round,
                totalRounds: payload.settings.totalRounds,
                currentProduct: productIndex + 1,
                totalProducts: payload.products.length,
                message: `เลือกรูปฉากมุมเดียวล่าสุดจากรายการบนสุดเป็น reference สำหรับวิดีโอฉาก ${sceneNumber}`,
              });

              try {
                await selectRecentImageOrThrow({
                  handle,
                  payload,
                  product,
                  productIndex,
                  round,
                  stage: 'multi_scene_select_recent_reference',
                  step,
                });
              } catch (selectError) {
                const reason = selectError instanceof Error ? selectError.message : String(selectError);
                emit({
                  event: 'progress',
                  runId: payload.runId,
                  status: 'running',
                  level: 'warning',
                  step,
                  stage: 'multi_scene_upload_reference_fallback',
                  productId: product.id,
                  productName: product.name,
                  currentRound: round,
                  totalRounds: payload.settings.totalRounds,
                  currentProduct: productIndex + 1,
                  totalProducts: payload.products.length,
                  message: `เลือกรูปฉากมุมเดียวล่าสุดไม่สำเร็จ: ${reason || 'unknown'} — จะอัปโหลดรูปฉากมุมเดียวแทน`,
                });
                await uploadReferenceImageOrThrow({
                  handle,
                  payload,
                  product,
                  productIndex,
                  round,
                  step,
                  args: {
                    dataUrl: sceneReferenceDataUrl,
                    fileName: `kubdee-video-scene-reference-${sceneNumber}.png`,
                    referenceLabel: 'รูปฉากมุมเดียว',
                  },
                });
              }
              return true;
            } else if (sceneReferenceDataUrl) {
              emit({
                event: 'progress',
                runId: payload.runId,
                status: 'running',
                step,
                stage: 'multi_scene_attach_reference',
                productId: product.id,
                productName: product.name,
                currentRound: round,
                totalRounds: payload.settings.totalRounds,
                currentProduct: productIndex + 1,
                totalProducts: payload.products.length,
                message: useSameAngle
                  ? `แนบรูปฉากแรกเป็น reference สำหรับวิดีโอฉาก ${sceneNumber}`
                  : `แนบรูปฉาก ${sceneNumber} เป็น reference สำหรับวิดีโอ`,
              });
              await uploadReferenceImageOrThrow({
                handle,
                payload,
                product,
                productIndex,
                round,
                step,
                args: {
                  dataUrl: sceneReferenceDataUrl,
                  fileName: `kubdee-video-scene-reference-${sceneNumber}.png`,
                  referenceLabel: `รูปฉาก ${sceneNumber}`,
                },
              });
              return true;
            } else if (neededSceneImages > 0 || payload.enabledSteps.includes('image')) {
              throw new Error(`ไม่มีรูป reference สำหรับวิดีโอฉาก ${sceneNumber}`);
            } else if (product.preview) {
              emit({
                event: 'progress',
                runId: payload.runId,
                status: 'running',
                step,
                stage: 'multi_scene_attach_product_reference',
                productId: product.id,
                productName: product.name,
                currentRound: round,
                totalRounds: payload.settings.totalRounds,
                currentProduct: productIndex + 1,
                totalProducts: payload.products.length,
                message: `แนบ${getProductReferenceLabel(productIndex)}เป็น reference สำหรับวิดีโอฉาก ${sceneNumber}: ${product.name || 'สินค้า'}`,
              });
              const dataUrl = await loadImageReferenceDataUrl(product.preview);
              await uploadReferenceImageOrThrow({
                handle,
                payload,
                product,
                productIndex,
                round,
                step,
                args: {
                  dataUrl: dataUrl ?? undefined,
                  fileName: getProductReferenceFileName(product, productIndex, round, step),
                  imageUrl: dataUrl ? undefined : product.preview,
                  referenceLabel: getProductReferenceLabel(productIndex),
                },
              });
              return true;
            }
            return false;
          };

          const sceneReferenceAttached = await attachSceneReference();
          if (sceneReferenceAttached) {
            await ensureVideoReferenceAttached({
              handle,
              payload,
              product,
              productIndex,
              round,
              step,
              message: `ตรวจ reference วิดีโอฉาก ${sceneNumber}/${sceneCount} ก่อนกดสร้าง`,
            });
          }

          const scenePrompt = promptResult.prompts[sceneIndex] || multiSceneVideoPrompt(product, prompt, sceneNumber, sceneCount, useVoiceover);
          const runSceneVideo = async (nextPrompt: string, countFailure = true): Promise<FlowResultPoll> => {
            const snapshot = (await runActionOrThrow(handle, 'videoSnapshot', {}, 15_000)) as FlowSnapshot;
            const baselineVideoUrls = snapshot.videoUrls ?? [];
            const baselineImageUrls = snapshot.imageUrls ?? [];
            const baselineFailedCount = snapshot.failedCount ?? 0;
            await fillPromptAndSubmit({
              baselineVideoUrls,
              baselineImageUrls,
              baselineFailedCount,
              count: 1,
              handle,
              payload,
              product,
              productIndex,
              prompt: nextPrompt,
              round,
              step,
            });
            return waitForStepResult({
              baselineVideoUrls,
              baselineImageUrls,
              baselineFailedCount,
              countFailure,
              count: 1,
              handle,
              payload,
              product,
              productIndex,
              round,
              step,
            });
          };

          const maxSceneVideoAttempts = 2;
          let videoResult: FlowResultPoll | null = null;
          let activeScenePrompt = scenePrompt;
          let sceneRewriteAttempted = false;
          for (let sceneAttempt = 1; sceneAttempt <= maxSceneVideoAttempts; sceneAttempt += 1) {
            const finalSceneAttempt = sceneAttempt >= maxSceneVideoAttempts;
            try {
              videoResult = await runSceneVideo(activeScenePrompt, finalSceneAttempt);
              break;
            } catch (error) {
              if (!isRetryableFlowError(error) || finalSceneAttempt) {
                throw error;
              }

              const retryReason = error instanceof Error ? error.message : String(error);
              const retryAsSilentVoiceover = useVoiceover;
              emit({
                event: 'progress',
                runId: payload.runId,
                status: 'running',
                level: 'warning',
                step,
                stage: retryAsSilentVoiceover ? 'voiceover_video_retry' : 'multi_scene_video_retry',
                productId: product.id,
                productName: product.name,
                currentRound: round,
                totalRounds: payload.settings.totalRounds,
                currentProduct: productIndex + 1,
                totalProducts: payload.products.length,
                message: retryAsSilentVoiceover
                  ? `วิดีโอฉาก ${sceneNumber} ล้มเหลว จะลองใหม่แบบภาพล้วนไม่มีเสียง: ${retryReason}`
                  : `วิดีโอฉาก ${sceneNumber} ล้มเหลว จะ retry เฉพาะฉากนี้โดยใช้รูปเดิม: ${retryReason}`,
              });

              if (retryAsSilentVoiceover) {
                activeScenePrompt = toVoiceoverSilentRetryPrompt(activeScenePrompt);
              } else if (payload.settings.aiRewritePromptOnAudioFailure !== false && !sceneRewriteAttempted) {
                sceneRewriteAttempted = true;
                emit({
                  event: 'progress',
                  runId: payload.runId,
                  status: 'running',
                  level: 'action',
                  step,
                  stage: 'multi_scene_ai_rewrite',
                  productId: product.id,
                  productName: product.name,
                  currentRound: round,
                  totalRounds: payload.settings.totalRounds,
                  currentProduct: productIndex + 1,
                  totalProducts: payload.products.length,
                  message: isAudioGenerationFailure(retryReason)
                    ? `AI กำลังปรับบทพูด/prompt ของฉาก ${sceneNumber} หลังเสียงล้มเหลว`
                    : `AI กำลัง rewrite prompt ของฉาก ${sceneNumber} หลัง Google Flow error`,
                });
                const rewrite = await rewriteVideoPromptForFlowError({
                  error: retryReason,
                  originalPrompt: activeScenePrompt,
                  product,
                });
                if (rewrite.prompt?.trim()) {
                  activeScenePrompt = rewrite.prompt.trim();
                  emit({
                    event: 'progress',
                    runId: payload.runId,
                    status: 'running',
                    level: 'success',
                    step,
                    stage: 'multi_scene_ai_rewrite',
                    productId: product.id,
                    productName: product.name,
                    currentRound: round,
                    totalRounds: payload.settings.totalRounds,
                    currentProduct: productIndex + 1,
                    totalProducts: payload.products.length,
                    message: `AI rewrite prompt ฉาก ${sceneNumber} สำเร็จ (${activeScenePrompt.length} ตัวอักษร): ${formatPromptPreview(activeScenePrompt)}`,
                  });
                } else {
                  emit({
                    event: 'progress',
                    runId: payload.runId,
                    status: 'running',
                    level: 'warning',
                    step,
                    stage: 'multi_scene_ai_rewrite',
                    productId: product.id,
                    productName: product.name,
                    currentRound: round,
                    totalRounds: payload.settings.totalRounds,
                    currentProduct: productIndex + 1,
                    totalProducts: payload.products.length,
                    message: `AI rewrite prompt ฉาก ${sceneNumber} ไม่สำเร็จ จะ retry ด้วย prompt เดิม: ${rewrite.error || 'unknown'}`,
                  });
                }
              }

              await refreshGoogleFlowProject({
                handle,
                payload,
                product,
                productIndex,
                round,
                step,
                stage: retryAsSilentVoiceover ? 'voiceover_video_retry_refresh' : 'multi_scene_video_retry_refresh',
                message: retryAsSilentVoiceover
                  ? `รีเฟรชหน้า Flow ก่อน retry วิดีโอฉาก ${sceneNumber}/${sceneCount} แบบไม่มีเสียง`
                  : `รีเฟรชหน้า Flow ก่อน retry วิดีโอฉาก ${sceneNumber}/${sceneCount}`,
              });

              const retryConfig = (await runActionWithProductContext(
                'configurePopper',
                {
                  targetMode: 'video',
                  aspectRatio: product.settings.video.aspectRatio,
                  outputCount: 1,
                  videoDuration,
                  videoModel,
                },
                70_000,
                retryAsSilentVoiceover ? 'voiceover_video_retry_config' : 'multi_scene_video_retry_config'
              )) as { success?: boolean; error?: string };
              if (retryConfig.success === false) {
                throw new Error(`ตั้งค่า Flow วิดีโอฉากก่อน retry ไม่ครบ: ${retryConfig.error ?? 'unknown'}`);
              }

              const retryReferenceAttached = await attachSceneReference();
              if (retryReferenceAttached) {
                await ensureVideoReferenceAttached({
                  handle,
                  payload,
                  product,
                  productIndex,
                  round,
                  step,
                  message: `ตรวจ reference วิดีโอฉาก ${sceneNumber}/${sceneCount} ก่อน retry`,
                });
              }
            }
          }
          if (!videoResult) {
            throw new Error(`สร้างวิดีโอฉาก ${sceneNumber} ไม่สำเร็จหลัง retry`);
          }

          const [url] = videoResult.videos ?? [];
          if (!url) {
            throw new Error(`สร้างวิดีโอฉาก ${sceneNumber} แล้วแต่ไม่พบ URL สำหรับดาวน์โหลด`);
          }
          const downloadStartedAt = Date.now();
          const downloadPayload = (await runActionOrThrow(
            handle,
            'downloadVideo',
            { url, index: 0 },
            120_000
          )) as FlowDownloadPayload;
          let downloaded = downloadPayload.dataUrl
            ? await saveGoogleFlowDataUrlAsset('video', downloadPayload.dataUrl, downloadPayload.fileName)
            : null;
          if (!downloaded?.uri) {
            downloaded = await waitForGoogleFlowDownload('video', downloadStartedAt, 15_000);
          }
          if (!downloaded?.uri) {
            throw new Error(`ดาวน์โหลดวิดีโอฉาก ${sceneNumber} ลงมือถือไม่สำเร็จ`);
          }
          sceneVideoUris.push(downloaded.uri);
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'scene_video_ready',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `ได้วิดีโอฉาก ${sceneNumber}/${sceneCount} แล้ว เตรียมรวมไฟล์`,
          });
        }

        let voiceoverDataUrl: string | null = null;
        if (useVoiceover) {
          const fallbackMergedDuration = sceneCount * Math.max(1, videoDuration - AUTO_MULTI_SCENE_TRIM_END_SECONDS);
          let totalEffectiveDuration = fallbackMergedDuration;
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'voiceover_probe_videos',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `กำลังตรวจความยาววิดีโอจริง ${sceneCount} ฉาก เพื่อคำนวณเสียงพากษ์`,
          });
          const probeResult = await probeGoogleFlowVideos(sceneVideoUris, AUTO_MULTI_SCENE_TRIM_END_SECONDS);
          if (probeResult.success && probeResult.totalEffectiveDuration) {
            totalEffectiveDuration = probeResult.totalEffectiveDuration;
            const durationText = (probeResult.videos ?? [])
              .map((video, index) => `ฉาก ${index + 1}: ${video.duration.toFixed(1)} วิ`)
              .join(', ');
            if (durationText) {
              emit({
                event: 'progress',
                runId: payload.runId,
                status: 'running',
                step,
                stage: 'voiceover_probe_videos',
                productId: product.id,
                productName: product.name,
                currentRound: round,
                totalRounds: payload.settings.totalRounds,
                currentProduct: productIndex + 1,
                totalProducts: payload.products.length,
                message: `ความยาววิดีโอจริง: ${durationText}`,
              });
            }
          } else if (probeResult.error) {
            emit({
              event: 'progress',
              runId: payload.runId,
              status: 'running',
              step,
              stage: 'voiceover_probe_videos',
              productId: product.id,
              productName: product.name,
              currentRound: round,
              totalRounds: payload.settings.totalRounds,
              currentProduct: productIndex + 1,
              totalProducts: payload.products.length,
              message: `ตรวจความยาววิดีโอจริงไม่สำเร็จ: ${probeResult.error} ใช้ค่าจาก settings แทน`,
            });
          }

          const voiceoverTargetDuration = Math.max(1, Math.round(totalEffectiveDuration - VOICEOVER_END_BUFFER_SECONDS));
          const voiceoverVoice = resolveGeminiTtsVoice(product.settings.video.voiceCharacter, promptResult.voiceGender);
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'voiceover',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `กำลังสร้างเสียงพากษ์รวม เป้าหมายประมาณ ${voiceoverTargetDuration} วิ จากวิดีโอจริงหลังตัดท้าย ${AUTO_MULTI_SCENE_TRIM_END_SECONDS} วิ/ฉาก เสียง ${voiceoverVoice}${promptResult.voiceGender ? ` (${promptResult.voiceGender})` : ''}`,
          });
          voiceoverDataUrl = await generateVoiceoverAudioDataUrl({
            durationSeconds: voiceoverTargetDuration,
            product,
            sceneDialogues: promptResult.scenes.map((scene) => scene.dialogue),
            sceneCount,
            voiceStyleInstruction: promptResult.voiceStyleInstruction,
            voiceoverScript: promptResult.voiceoverScript,
            voiceGender: promptResult.voiceGender,
          });
          if (!voiceoverDataUrl) {
            throw new Error('สร้างเสียงพากษ์ไม่สำเร็จ: ไม่มีบทพูดหรือไฟล์เสียงสำหรับรวมวิดีโอ');
          }
        }

        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'merge_video',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: useVoiceover ? 'กำลังรวมวิดีโอหลายฉากพร้อมเสียงพากษ์' : 'กำลังรวมวิดีโอหลายฉาก',
        });
        const merged = await mergeGoogleFlowVideos(sceneVideoUris, voiceoverDataUrl);
        if (!merged?.uri) {
          throw new Error('รวมวิดีโอหลายฉากบนมือถือไม่สำเร็จ');
        }
        emit({
          event: 'asset',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'generated',
          profileLocalId: payload.profileLocalId,
          productId: product.id,
          productName: product.name,
          fileUri: merged.uri,
          fileName: merged.fileName,
          mimeType: merged.mimeType || 'video/mp4',
          sizeBytes: merged.sizeBytes,
          createdAt: merged.createdAt || Date.now(),
          message: useVoiceover ? 'ได้วิดีโอรวมพร้อมเสียงพากษ์แล้ว' : `ได้วิดีโอรวม ${sceneCount} ฉากแล้ว`,
        });

        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'multi_scene_done',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: `วิดีโอหลายฉากสร้างครบ ${sceneCount} ฉากแล้ว`,
        });
        return;
      }

      let latestBaselineImageUrls: string[] = [];
      const maxSingleStepAttempts = 3;
      const runSingleStepAttempt = async (attempt: number, attemptPrompt: string): Promise<FlowResultPoll> => {
        const retryAttempt = Math.max(0, attempt - 1);
        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: attempt === 1 ? 'open_project' : 'single_step_retry',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message:
            attempt === 1
              ? `เข้า Google Flow project สำหรับ${label}`
              : `Retry ${label} รอบ ${retryAttempt}/${maxSingleStepAttempts - 1}: ทำ Flow ใหม่ด้วย prompt ล่าสุด`,
        });
        const newProject = await openGoogleFlowProject({
          handle,
          payload,
          product,
          productIndex,
          round,
          step,
        });
        emit({
          runId: payload.runId,
          status: 'running',
          message: newProject.already ? 'อยู่ใน Google Flow project อยู่แล้ว' : 'เข้า Google Flow project แล้ว',
        });

        const skipRefresh =
          attempt === 1 &&
          shouldSkipRefreshAfterFreshProjectOpen({
            productIndex,
            projectResult: newProject,
            round,
          });
        if (!skipRefresh) {
          await refreshGoogleFlowProject({
            handle,
            payload,
            product,
            productIndex,
            round,
            step,
            stage: attempt === 1 ? 'refresh_before_config' : 'single_step_retry_refresh',
            message:
              attempt === 1
                ? `รีเฟรชหน้า Flow ก่อนตั้งค่า${label}`
                : `รีเฟรชหน้า Flow ก่อน retry ${label} รอบ ${retryAttempt}`,
          });
        }

        const configArgs =
          step === 'image'
            ? {
                targetMode: 'image',
                aspectRatio: product.settings.image.aspectRatio,
                outputCount: count,
                imageModel: imageModelForProduct(product, payload.settings),
              }
            : {
                targetMode: 'video',
                aspectRatio: product.settings.video.aspectRatio,
                outputCount: count,
                videoDuration: videoDurationForProduct(product, payload.settings),
                videoModel: videoModelForProduct(product, payload.settings),
              };
        const config = (await runActionWithProductContext(
          'configurePopper',
          configArgs,
          70_000,
          attempt === 1 ? 'configure_flow' : 'single_step_retry_config'
        )) as {
          success?: boolean;
          error?: string;
        };
        if (config.success === false) {
          emit({
            runId: payload.runId,
            status: 'running',
            message: `ตั้งค่า Flow ไม่ครบ: ${config.error ?? 'unknown'}`,
          });
          throw new Error(`ตั้งค่า Flow ไม่ครบ: ${config.error ?? 'unknown'}`);
        } else {
          emit({ runId: payload.runId, status: 'running', message: `ตั้งค่าโหมด${label}แล้ว` });
        }

        let videoReferenceAttached = false;
        const shouldUsePreviousImage = step === 'video' && payload.enabledSteps.includes('image');
        if (shouldUsePreviousImage) {
          const cachedImages = latestGeneratedImageDataUrlsRef.current.get(
            getGeneratedImageCacheKey(product, round)
          );
          const cachedImageDataUrl = cachedImages?.[0];
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'attach_recent_image_reference',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: 'เลือกรูปที่เพิ่งสร้างจากรายการบนสุดใน Google Flow เป็น reference สำหรับวิดีโอ',
          });

          try {
            await selectRecentImageOrThrow({
              handle,
              payload,
              product,
              productIndex,
              round,
              stage: 'attach_recent_image_reference',
              step,
            });
          } catch (selectError) {
            const reason = selectError instanceof Error ? selectError.message : String(selectError);
            const fallbackStage = cachedImageDataUrl
              ? 'attach_generated_image_reference'
              : product.preview
                ? 'attach_product_reference'
                : 'attach_recent_image_reference';
            emit({
              event: 'progress',
              runId: payload.runId,
              status: 'running',
              level: 'warning',
              step,
              stage: fallbackStage,
              productId: product.id,
              productName: product.name,
              currentRound: round,
              totalRounds: payload.settings.totalRounds,
              currentProduct: productIndex + 1,
              totalProducts: payload.products.length,
              message: `เลือกรูปล่าสุดไม่สำเร็จ: ${reason || 'unknown'} — จะอัปโหลดรูป fallback แทน`,
            });

            if (cachedImageDataUrl) {
              await uploadReferenceImageOrThrow({
                handle,
                payload,
                product,
                productIndex,
                round,
                step,
                args: {
                  dataUrl: cachedImageDataUrl,
                  fileName: getGeneratedImageReferenceFileName(product, round),
                  referenceLabel: 'รูปที่สร้างไว้',
                },
              });
            } else if (product.preview) {
              const dataUrl = await loadImageReferenceDataUrl(product.preview);
              await uploadReferenceImageOrThrow({
                handle,
                payload,
                product,
                productIndex,
                round,
                step,
                args: {
                  dataUrl: dataUrl ?? undefined,
                  fileName: getProductReferenceFileName(product, productIndex, round, step),
                  imageUrl: dataUrl ? undefined : product.preview,
                  referenceLabel: getProductReferenceLabel(productIndex),
                },
              });
            } else {
              throw new Error(`เลือกรูปล่าสุดไม่สำเร็จ และไม่มีรูป fallback ให้อัปโหลด: ${reason || 'unknown'}`);
            }
          }
          videoReferenceAttached = true;
        } else if (product.preview) {
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'attach_product_reference',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `แนบ${getProductReferenceLabel(productIndex)}เป็น reference สำหรับ${label}: ${product.name || 'สินค้า'}`,
          });
          const dataUrl = await loadImageReferenceDataUrl(product.preview);
          await uploadReferenceImageOrThrow({
            handle,
            payload,
            product,
            productIndex,
            round,
            step,
            args: {
              dataUrl: dataUrl ?? undefined,
              fileName: getProductReferenceFileName(product, productIndex, round, step),
              imageUrl: dataUrl ? undefined : product.preview,
              referenceLabel: getProductReferenceLabel(productIndex),
            },
          });
          videoReferenceAttached = step === 'video';
        } else if (step === 'image' || !shouldUsePreviousImage) {
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            level: 'warning',
            step,
            stage: 'attach_product_reference',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `ไม่มีรูปสินค้าให้แนบสำหรับ${label}: ${product.name || 'สินค้า'}`,
          });
        }

        if (step === 'video' && !shouldUsePreviousImage) {
          for (const reference of getAdditionalVideoReferences(product)) {
            emit({
              event: 'progress',
              runId: payload.runId,
              status: 'running',
              step,
              stage: reference.stage,
              productId: product.id,
              productName: product.name,
              currentRound: round,
              totalRounds: payload.settings.totalRounds,
              currentProduct: productIndex + 1,
              totalProducts: payload.products.length,
              message: `แนบรูป${reference.label}เป็น reference สำหรับ${label}`,
            });
            const referenceDataUrl = await loadImageReferenceDataUrl(reference.uri);
            await uploadReferenceImageOrThrow({
              handle,
              payload,
              product,
              productIndex,
              round,
              step,
              args: {
                dataUrl: referenceDataUrl ?? undefined,
                fileName: reference.fileName,
                imageUrl: referenceDataUrl ? undefined : reference.uri,
                referenceLabel: `รูป${reference.label}`,
              },
            });
            videoReferenceAttached = true;
          }
        }

        if (step === 'image') {
          for (const reference of getAdditionalImageReferences(product)) {
            emit({
              event: 'progress',
              runId: payload.runId,
              status: 'running',
              step,
              stage: reference.stage,
              productId: product.id,
              productName: product.name,
              currentRound: round,
              totalRounds: payload.settings.totalRounds,
              currentProduct: productIndex + 1,
              totalProducts: payload.products.length,
              message: `แนบรูป${reference.label}เป็น reference สำหรับ${label}`,
            });
            const referenceDataUrl = await loadImageReferenceDataUrl(reference.uri);
            await uploadReferenceImageOrThrow({
              handle,
              payload,
              product,
              productIndex,
              round,
              step,
              args: {
                dataUrl: referenceDataUrl ?? undefined,
                fileName: reference.fileName,
                imageUrl: referenceDataUrl ? undefined : reference.uri,
                referenceLabel: `รูป${reference.label}`,
              },
            });
          }
        }

        let baselineVideoUrls: string[] = [];
        let baselineImageUrls: string[] = [];
        let baselineFailedCount = 0;
        if (step === 'video') {
          if (videoReferenceAttached) {
            await ensureVideoReferenceAttached({
              handle,
              payload,
              product,
              productIndex,
              round,
              step,
            });
          }
        }
        const snapshot = (await runActionOrThrow(handle, 'videoSnapshot', {}, 15_000)) as FlowSnapshot;
        baselineVideoUrls = snapshot.videoUrls ?? [];
        baselineImageUrls = snapshot.imageUrls ?? [];
        baselineFailedCount = snapshot.failedCount ?? 0;
        latestBaselineImageUrls = baselineImageUrls;
        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'flow_videoSnapshot',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: `บันทึกสถานะเดิมก่อนสร้าง${label}: วิดีโอ ${baselineVideoUrls.length} · รูป ${baselineImageUrls.length} · failed ${baselineFailedCount} · tiles ${snapshot.tileCount ?? 0}`,
        });

        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: attempt === 1 ? 'fill_prompt' : 'single_step_retry_fill_prompt',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message:
            attempt === 1
              ? `กรอก prompt ${label}: ${(product.name || 'สินค้า').slice(0, 34)}`
              : `Retry ${label} รอบ ${retryAttempt}: กรอก prompt ซ้ำ`,
        });
        await fillPromptAndSubmit({
          baselineVideoUrls,
          baselineImageUrls,
          baselineFailedCount,
          count,
          handle,
          payload,
          product,
          productIndex,
          prompt: attemptPrompt,
          round,
          step,
        });
        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: attempt === 1 ? 'submitted' : 'single_step_retry_submitted',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: attempt === 1 ? `ส่ง prompt ${label} แล้ว` : `Retry ${label} รอบ ${retryAttempt}: ส่ง prompt แล้ว`,
        });

        return waitForStepResult({
          baselineVideoUrls,
          baselineImageUrls,
          baselineFailedCount,
          countFailure: attempt >= maxSingleStepAttempts,
          count,
          handle,
          payload,
          product,
          productIndex,
          round,
          step,
        });
      };

      let result: FlowResultPoll | null = null;
      let activePrompt = prompt;
      let rewriteAttempted = false;
      for (let attempt = 1; attempt <= maxSingleStepAttempts; attempt += 1) {
        try {
          result = await runSingleStepAttempt(attempt, activePrompt);
          break;
        } catch (error) {
          if (!isRetryableFlowError(error) || attempt >= maxSingleStepAttempts) {
            throw error;
          }

          const reason = error instanceof Error ? error.message : String(error);
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            level: 'warning',
            step,
            stage: 'single_step_retry',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `${label} ล้มเหลว จะ retry แบบทำ Flow ใหม่ (${attempt}/${maxSingleStepAttempts - 1}): ${reason}`,
          });
          let rewriteChanged = false;
          if (step === 'video' && payload.settings.aiRewritePromptOnAudioFailure !== false && !rewriteAttempted) {
            rewriteAttempted = true;
            emit({
              event: 'progress',
              runId: payload.runId,
              status: 'running',
              level: 'action',
              step,
              stage: 'single_step_ai_rewrite',
              productId: product.id,
              productName: product.name,
              currentRound: round,
              totalRounds: payload.settings.totalRounds,
              currentProduct: productIndex + 1,
              totalProducts: payload.products.length,
              message: isAudioGenerationFailure(reason)
                ? 'AI กำลังปรับบทพูด/prompt หลังเสียงล้มเหลว ก่อน retry'
                : 'AI กำลัง rewrite prompt หลัง Google Flow error ก่อน retry',
            });
            const rewrite = await rewriteVideoPromptForFlowError({
              error: reason,
              originalPrompt: activePrompt,
              product,
            });
            if (rewrite.prompt?.trim()) {
              activePrompt = rewrite.prompt.trim();
              rewriteChanged = true;
              emit({
                event: 'progress',
                runId: payload.runId,
                status: 'running',
                level: 'success',
                step,
                stage: 'single_step_ai_rewrite',
                productId: product.id,
                productName: product.name,
                currentRound: round,
                totalRounds: payload.settings.totalRounds,
                currentProduct: productIndex + 1,
                totalProducts: payload.products.length,
                message: `AI rewrite prompt สำเร็จ (${activePrompt.length} ตัวอักษร): ${formatPromptPreview(activePrompt)}`,
              });
            } else {
              emit({
                event: 'progress',
                runId: payload.runId,
                status: 'running',
                level: 'warning',
                step,
                stage: 'single_step_ai_rewrite',
                productId: product.id,
                productName: product.name,
                currentRound: round,
                totalRounds: payload.settings.totalRounds,
                currentProduct: productIndex + 1,
                totalProducts: payload.products.length,
                message: `AI rewrite prompt ไม่สำเร็จ จะ retry ด้วย prompt เดิม: ${rewrite.error || 'unknown'}`,
              });
            }
          }

          if (attempt === 1 && !rewriteChanged) {
            try {
              emit({
                event: 'progress',
                runId: payload.runId,
                status: 'running',
                level: 'action',
                step,
                stage: 'single_step_reuse_prompt',
                productId: product.id,
                productName: product.name,
                currentRound: round,
                totalRounds: payload.settings.totalRounds,
                currentProduct: productIndex + 1,
                totalProducts: payload.products.length,
                message: `Retry ${label} รอบ 1: ลอง Reuse Prompt จากการ์ดล่าสุดก่อนทำ Flow ใหม่`,
              });
              const reuseSnapshot = (await runActionOrThrow(handle, 'videoSnapshot', {}, 15_000)) as FlowSnapshot;
              const baselineVideoUrls = reuseSnapshot.videoUrls ?? [];
              const baselineImageUrls = reuseSnapshot.imageUrls ?? [];
              const baselineFailedCount = reuseSnapshot.failedCount ?? 0;
              latestBaselineImageUrls = baselineImageUrls;
              emit({
                event: 'progress',
                runId: payload.runId,
                status: 'running',
                step,
                stage: 'flow_videoSnapshot',
                productId: product.id,
                productName: product.name,
                currentRound: round,
                totalRounds: payload.settings.totalRounds,
                currentProduct: productIndex + 1,
                totalProducts: payload.products.length,
                message: `บันทึกสถานะเดิมก่อน Reuse Prompt: วิดีโอ ${baselineVideoUrls.length} · รูป ${baselineImageUrls.length} · failed ${baselineFailedCount} · tiles ${reuseSnapshot.tileCount ?? 0}`,
              });
              await runActionWithProductContext(
                'reusePromptAndSubmit',
                {},
                70_000,
                'single_step_reuse_prompt'
              );
              result = await waitForStepResult({
                baselineVideoUrls,
                baselineImageUrls,
                baselineFailedCount,
                countFailure: false,
                count,
                handle,
                payload,
                product,
                productIndex,
                round,
                step,
              });
              break;
            } catch (reuseError) {
              const reuseReason = reuseError instanceof Error ? reuseError.message : String(reuseError);
              emit({
                event: 'progress',
                runId: payload.runId,
                status: 'running',
                level: 'warning',
                step,
                stage: 'single_step_reuse_prompt',
                productId: product.id,
                productName: product.name,
                currentRound: round,
                totalRounds: payload.settings.totalRounds,
                currentProduct: productIndex + 1,
                totalProducts: payload.products.length,
                message: `Reuse Prompt ไม่สำเร็จ จะ fallback ไปทำ Flow ใหม่: ${reuseReason}`,
              });
            }
          }
        }
      }
      if (!result) {
        throw new Error(`สร้าง${label}ไม่สำเร็จหลัง retry`);
      }

      if (step === 'video') {
        const videos = result.videos ?? [];
        for (const [index, url] of videos.entries()) {
          const downloadStartedAt = Date.now();
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'downloading_result',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `ดาวน์โหลดวิดีโอ Google Flow ลงมือถือ (${index + 1}/${videos.length})`,
          });
          const downloadPayload = (await runActionOrThrow(
            handle,
            'downloadVideo',
            { url, index },
            120_000
          )) as FlowDownloadPayload;
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'download_triggered',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `รับวิดีโอจาก Flow: ${downloadPayload.method ?? 'unknown'}${
              downloadPayload.sizeBytes ? ` ${(downloadPayload.sizeBytes / 1024 / 1024).toFixed(1)}MB` : ''
            }`,
          });

          let downloaded = downloadPayload.dataUrl
            ? await saveGoogleFlowDataUrlAsset('video', downloadPayload.dataUrl, downloadPayload.fileName)
            : null;

          if (!downloaded?.uri) {
            downloaded = await waitForGoogleFlowDownload('video', downloadStartedAt, 15_000);
          }
          if (!downloaded?.uri) {
            emit({
              event: 'progress',
              runId: payload.runId,
              status: 'running',
              step,
              stage: 'download_missing',
              productId: product.id,
              productName: product.name,
              currentRound: round,
              totalRounds: payload.settings.totalRounds,
              currentProduct: productIndex + 1,
              totalProducts: payload.products.length,
              message: 'สร้างวิดีโอแล้ว แต่ดาวน์โหลดไฟล์ลงมือถือไม่สำเร็จ',
            });
            throw new GoogleFlowCountedStepFailure('สร้างวิดีโอแล้ว แต่ดาวน์โหลดไฟล์ลงมือถือไม่สำเร็จ', step, 1);
          }

          emit({
            event: 'asset',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'generated',
            profileLocalId: payload.profileLocalId,
            productId: product.id,
            productName: product.name,
            fileUri: downloaded.uri,
            fileName: downloaded.fileName,
            mimeType: downloaded.mimeType || 'video/mp4',
            sizeBytes: downloaded.sizeBytes,
            createdAt: downloaded.createdAt || Date.now(),
            message: `ได้วิดีโอจาก Google Flow แล้ว (${index + 1}/${videos.length})`,
          });
        }
      } else {
        const imageCount = Math.max(1, Number(result.images ?? count) || count);
        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'downloading_result',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: `Flow สร้างรูปภาพแล้ว กำลังบันทึกลงคลัง (${imageCount})`,
        });

        const imagePayload = (await runActionOrThrow(
          handle,
          'downloadImages',
          { count: imageCount, ignoreImageUrls: latestBaselineImageUrls },
          90_000
        )) as FlowImageDownloadPayload;
        const images = imagePayload.images ?? [];
        if (images.length === 0) {
          throw new Error(
            imagePayload.errors?.[0] || 'สร้างรูปภาพแล้ว แต่ดึงไฟล์รูปจาก Google Flow ไม่สำเร็จ'
          );
        }

        const generatedImageDataUrls: string[] = [];
        for (const [index, image] of images.entries()) {
          if (!image.dataUrl) {
            continue;
          }
          const downloaded = await saveGoogleFlowDataUrlAsset('image', image.dataUrl, image.fileName);
          if (!downloaded?.uri) {
            throw new Error('บันทึกรูปภาพลงมือถือไม่สำเร็จ');
          }
          generatedImageDataUrls.push(image.dataUrl);
          emit({
            event: 'asset',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'generated',
            profileLocalId: payload.profileLocalId,
            productId: product.id,
            productName: product.name,
            fileUri: downloaded.uri,
            fileName: downloaded.fileName,
            mimeType: downloaded.mimeType || image.mimeType || 'image/png',
            sizeBytes: downloaded.sizeBytes || image.sizeBytes || undefined,
            createdAt: downloaded.createdAt || Date.now(),
            creativeAssetKind: product.creativeAssetKind,
            creativeItemId: product.creativeItemId,
            creativeItemName: product.creativeItemName,
            creativeItemDescription: product.creativeItemDescription,
            creativeItemTags: product.creativeItemTags,
            message: `ได้รูปภาพจาก Google Flow แล้ว (${index + 1}/${images.length})`,
          });
        }
        if (generatedImageDataUrls.length > 0) {
          latestGeneratedImageDataUrlsRef.current.set(
            getGeneratedImageCacheKey(product, round),
            generatedImageDataUrls
          );
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'image_reference_cached',
            productId: product.id,
            productName: product.name,
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: productIndex + 1,
            totalProducts: payload.products.length,
            message: `บันทึกรูป reference ของสินค้านี้ไว้ใช้สร้างวิดีโอแล้ว (${generatedImageDataUrls.length})`,
          });
        }
      }
    },
    [
      downloadLatestFlowImage,
      emit,
      ensureVideoReferenceAttached,
      fillPromptAndSubmit,
      openGoogleFlowProject,
      refreshGoogleFlowProject,
      runActionOrThrow,
      selectRecentImageOrThrow,
      uploadReferenceImageOrThrow,
      waitForStepResult,
    ]
  );

  const runPayload = useCallback(
    async (payload: GoogleFlowRunnerPayload): Promise<void> => {
      try {
        const handle = await waitForHandle();
        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          stage: 'started',
          currentRound: 0,
          totalRounds: payload.settings.totalRounds,
          currentProduct: 0,
          totalProducts: payload.products.length,
          message: 'Google Flow WebView runner เริ่มทำงาน',
        });

        const totalRoundLoopCount = getRoundLoopCount(payload.settings);

        for (let round = 1; round <= totalRoundLoopCount; round += 1) {
          checkStop();
          emit({
            event: 'progress',
            runId: payload.runId,
            status: 'running',
            stage: 'round_started',
            currentRound: round,
            totalRounds: payload.settings.totalRounds,
            currentProduct: 0,
            totalProducts: payload.products.length,
            message: `เริ่มรอบ ${formatRoundProgress(round, payload.settings.totalRounds)}`,
          });

          for (let productIndex = 0; productIndex < payload.products.length; productIndex += 1) {
            const product = payload.products[productIndex];
            checkStop();
            emit({
              event: 'progress',
              runId: payload.runId,
              status: 'running',
              stage: 'product_started',
              productId: product.id,
              productName: product.name,
              currentRound: round,
              totalRounds: payload.settings.totalRounds,
              currentProduct: productIndex + 1,
              totalProducts: payload.products.length,
              message: `เริ่มสินค้า ${productIndex + 1}/${payload.products.length}: ${product.name || 'สินค้า'}`,
            });

            const shouldOpenFlowHomeBeforeProduct =
              payload.settings.startNewFlowProjectPerProduct !== false &&
              !(round === 1 && productIndex === 0);
            if (shouldOpenFlowHomeBeforeProduct) {
              emit({
                event: 'progress',
                runId: payload.runId,
                status: 'running',
                stage: 'flow_home_before_product',
                productId: product.id,
                productName: product.name,
                currentRound: round,
                totalRounds: payload.settings.totalRounds,
                currentProduct: productIndex + 1,
                totalProducts: payload.products.length,
                message: 'เปิดหน้า Flow หลักก่อนสร้างโปรเจกต์ใหม่สำหรับสินค้านี้',
              });
              flowUrlRef.current = FLOW_ENGLISH_URL;
              handle.goHome();
              await sleep(3000);
              checkStop();
            }

            let imageStepFailed = false;
            let imageStepError = '';

            const emitStepFailure = (
              step: AutoPilotStepType,
              error: unknown,
              failedOutputs: number
            ): void => {
              emit({
                event: 'progress',
                runId: payload.runId,
                status: 'running',
                level: 'error',
                step,
                stage: 'failed',
                productId: product.id,
                productName: product.name,
                currentRound: round,
                totalRounds: payload.settings.totalRounds,
                currentProduct: productIndex + 1,
                totalProducts: payload.products.length,
                failedOutputs,
                message: `สร้าง${stepLabel(step)}ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
              });
            };

            for (const step of payload.enabledSteps) {
              checkStop();

              if (step === 'video' && payload.enabledSteps.includes('image') && imageStepFailed) {
                const reason = imageStepError || 'ไม่มีรูปภาพที่สร้างสำเร็จสำหรับใช้เป็น reference';
                emit({
                  event: 'progress',
                  runId: payload.runId,
                  status: 'running',
                  level: 'error',
                  step,
                  stage: 'failed',
                  productId: product.id,
                  productName: product.name,
                  currentRound: round,
                  totalRounds: payload.settings.totalRounds,
                  currentProduct: productIndex + 1,
                  totalProducts: payload.products.length,
                  failedOutputs: getAutoVideoResultCount(product),
                  message: `ข้ามสร้างวิดีโอ: ${reason}`,
                });
                continue;
              }

              emit({
                event: 'progress',
                runId: payload.runId,
                status: 'running',
                step,
                stage: 'step_started',
                productId: product.id,
                productName: product.name,
                currentRound: round,
                totalRounds: payload.settings.totalRounds,
                currentProduct: productIndex + 1,
                totalProducts: payload.products.length,
                message: `เริ่ม${stepLabel(step)}สำหรับสินค้า ${productIndex + 1}/${payload.products.length}`,
              });
              try {
                await runProductStep({
                  handle,
                  payload,
                  product,
                  productIndex,
                  round,
                  step,
                });
              } catch (stepError) {
                if (stepError instanceof GoogleFlowWebViewRunnerStopped) {
                  throw stepError;
                }

                if (step === 'image') {
                  imageStepFailed = true;
                  imageStepError = stepError instanceof Error ? stepError.message : String(stepError);
                }

                if (!(stepError instanceof GoogleFlowCountedStepFailure)) {
                  const failedOutputs = step === 'video'
                    ? getAutoVideoResultCount(product)
                    : outputCountForRunnerStep(product, 'image');
                  emitStepFailure(step, stepError, failedOutputs);
                }
              }
            }

            await cleanupLatestFlowProjectForProduct({
              handle,
              payload,
              product,
              productIndex,
              round,
            });

            if (productIndex < payload.products.length - 1) {
              checkStop();
              const delayMs = randomAutoRunDelayMs(payload.settings);
              emit({
                event: 'progress',
                runId: payload.runId,
                status: 'running',
                stage: 'delay_between_products',
                productId: product.id,
                productName: product.name,
                currentRound: round,
                totalRounds: payload.settings.totalRounds,
                currentProduct: productIndex + 1,
                totalProducts: payload.products.length,
                message: `หน่วงเวลา ${(delayMs / 1000).toFixed(1)} วิ ก่อนเริ่มสินค้าถัดไป`,
              });
              await sleep(delayMs);
            }
          }
        }

        emit({
          runId: payload.runId,
          status: 'completed',
          stage: 'completed',
          message: 'Auto Pilot Google Flow WebView จบแล้ว',
        });
        setVisible(false);
      } catch (error) {
        if (error instanceof GoogleFlowWebViewRunnerStopped) {
          emit({
            runId: payload.runId,
            status: 'stopped',
            stage: 'stopped',
            message: 'หยุด Auto Pilot Google Flow WebView แล้ว',
          });
          setVisible(false);
        } else {
          emit({
            runId: payload.runId,
            status: 'error',
            stage: 'error',
            message: `Google Flow WebView error: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      } finally {
        runningRef.current = false;
        stopRequestedRef.current = false;
        payloadRef.current = null;
        latestGeneratedImageDataUrlsRef.current.clear();
        setActiveRunId(null);
      }
    },
    [checkStop, cleanupLatestFlowProjectForProduct, emit, runProductStep, waitForHandle]
  );

  useEffect(() => {
    return registerGoogleFlowWebViewRunnerHost({
      start(payload) {
        if (runningRef.current) {
          return false;
        }
        runningRef.current = true;
        stopRequestedRef.current = false;
        payloadRef.current = payload;
        latestGeneratedImageDataUrlsRef.current.clear();
        setActiveRunId(payload.runId);
        setFlowStatus('unknown');
        flowStatusRef.current = 'unknown';
        setOverlayLogs([]);
        setOverlayProgress(null);
        flowRef.current = null;
        setFlowWebViewKey((key) => key + 1);
        setVisible(true);
        flowUrlRef.current = '';
        void runPayload(payload);
        return true;
      },
      stop(runId) {
        const activePayload = payloadRef.current;
        if (!runningRef.current || (activePayload?.runId && activePayload.runId !== runId)) {
          return false;
        }
        stopRequestedRef.current = true;
        emit({
          runId,
          event: 'progress',
          stage: 'stopping',
          status: 'running',
          message: 'กำลังหยุด Google Flow WebView runner...',
        });
        return true;
      },
    });
  }, [emit, runPayload]);

  const requestStop = (): void => {
    const activePayload = payloadRef.current;
    if (!activePayload) {
      setVisible(false);
      return;
    }
    stopRequestedRef.current = true;
    emit({
      runId: activePayload.runId,
      event: 'progress',
      stage: 'stopping',
      status: 'running',
      message: 'กำลังหยุด Google Flow WebView runner...',
    });
  };

  const flowStatusLabel =
    flowStatus === 'connected'
      ? 'เชื่อมต่อแล้ว'
      : flowStatus === 'signin'
        ? 'รอเข้าสู่ระบบ'
        : flowStatus === 'loggedout'
          ? 'ยังไม่เชื่อมต่อ'
          : 'กำลังโหลด';
  const overlayTitle = overlayProgress?.productName?.trim() || 'Google Flow';
  const overlaySubtitle = overlayProgress
    ? `${formatOverlayStep(overlayProgress.step, overlayProgress.stage)} · Flow ${formatOverlayFlowStats(
        overlayProgress.flowStats
      )} · ${flowStatusLabel}`
    : flowStatusLabel;

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={requestStop}>
      <SafeAreaView className="flex-1 bg-kd-panel">
        <View className="h-12 flex-row items-center justify-between border-b border-kd-border bg-kd-panel px-4">
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-[13px] font-semibold leading-4 text-kd-text">
              {overlayTitle}
            </Text>
            <Text numberOfLines={1} className="text-[10px] leading-3 text-kd-text-muted">
              {overlaySubtitle}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="หยุด Google Flow WebView"
            accessibilityRole="button"
            activeOpacity={0.8}
            onPress={requestStop}
            className="h-10 w-10 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-card"
          >
            {runningRef.current ? (
              <Square size={14} color={theme.red} fill={theme.red} strokeWidth={2.2} />
            ) : (
              <X size={18} color={theme.textSubtle} strokeWidth={2.4} />
            )}
          </TouchableOpacity>
        </View>
        {overlayProgress ? (
          <View className="h-8 justify-center border-b border-kd-border bg-kd-panel px-3">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ alignItems: 'center', gap: 8, paddingRight: 8 }}
            >
              <OverlayStatChip
                color={theme.blue}
                label="รอบ"
                theme={theme}
                value={formatRoundProgress(overlayProgress.currentRound, overlayProgress.totalRounds)}
              />
              <OverlayStatChip
                color={theme.emerald}
                label="สินค้า"
                theme={theme}
                value={`${overlayProgress.currentProduct}/${overlayProgress.totalProducts || '-'}`}
              />
              {overlayProgress.assetStats.plannedImages > 0 ? (
                <OverlayStatChip
                  color={getOverlayAssetColor(
                    overlayProgress.assetStats.generatedImages,
                    overlayProgress.assetStats.failedImages,
                    overlayProgress.assetStats.plannedImages,
                    theme.amber,
                    theme
                  )}
                  label="รูป"
                  theme={theme}
                  value={formatOverlayAssetProgress(
                    overlayProgress.assetStats.generatedImages,
                    overlayProgress.assetStats.failedImages,
                    overlayProgress.assetStats.plannedImages
                  )}
                />
              ) : null}
              {overlayProgress.assetStats.plannedVideos > 0 ? (
                <OverlayStatChip
                  color={getOverlayAssetColor(
                    overlayProgress.assetStats.generatedVideos,
                    overlayProgress.assetStats.failedVideos,
                    overlayProgress.assetStats.plannedVideos,
                    theme.red,
                    theme
                  )}
                  label="วิดีโอ"
                  theme={theme}
                  value={formatOverlayAssetProgress(
                    overlayProgress.assetStats.generatedVideos,
                    overlayProgress.assetStats.failedVideos,
                    overlayProgress.assetStats.plannedVideos
                  )}
                />
              ) : null}
              <OverlayStatChip
                color={theme.cyan}
                label="ล่าสุด"
                theme={theme}
                value={formatOverlayTime(overlayProgress.updatedAt)}
              />
              <OverlayStatChip
                color={theme.textMuted}
                label="ใช้เวลา"
                theme={theme}
                value={formatOverlayDuration(overlayProgress.updatedAt - overlayProgress.startedAt)}
              />
            </ScrollView>
          </View>
        ) : null}
        <View className="relative flex-1">
          <FlowWebView
            key={flowWebViewKey}
            ref={flowRef}
            accountProbeEnabled={false}
            backgroundColor={theme.screen}
            onActionLog={emitFlowActionLog}
            onNavigationChange={(href) => {
              flowUrlRef.current = href;
            }}
            onStatusChange={(state, href) => {
              flowStatusRef.current = state;
              flowUrlRef.current = href;
              setFlowStatus(state);
            }}
          />
          {overlayLogs.length > 0 ? (
            <View
              pointerEvents="none"
              style={{ backgroundColor: 'rgba(0,0,0,0.66)' }}
              className="absolute inset-x-2 top-2 rounded-kd-lg px-3 py-2"
            >
              {overlayLogs.map((line, index) => {
                const firstLog = overlayLogs[0] ?? line;
                const previousLog = index > 0 ? overlayLogs[index - 1] : null;
                const deltaMs = previousLog ? Math.max(0, line.ts - previousLog.ts) : 0;
                const elapsedMs = Math.max(0, line.ts - firstLog.ts);
                const meta = formatOverlayLogMeta(line);
                return (
                  <Text key={line.id} numberOfLines={1} className="text-kd-micro leading-4 text-white">
                    <Text className="text-kd-micro" style={{ color: 'rgba(255,255,255,0.65)' }}>
                      {formatOverlayTime(line.ts)} +{formatOverlayDuration(deltaMs)} · {formatOverlayDuration(elapsedMs)}{' '}
                    </Text>
                    {meta ? (
                      <Text className="text-kd-micro font-semibold" style={{ color: 'rgba(255,255,255,0.88)' }}>
                        [{meta}]{' '}
                      </Text>
                    ) : null}
                    {line.message}
                  </Text>
                );
              })}
            </View>
          ) : null}
          {!flowRef.current ? (
            <View className="absolute inset-0 items-center justify-center bg-kd-panel/70">
              <ActivityIndicator size="small" color={theme.orange} />
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function OverlayStatChip({
  color,
  label,
  theme,
  value,
}: {
  color: string;
  label: string;
  theme: KubdeeTheme;
  value: string;
}): React.JSX.Element {
  return (
    <View
      className="h-5 flex-row items-center gap-1.5 rounded-kd-sm px-1.5"
      style={{
        backgroundColor: alpha(color, theme.isDark ? 0.16 : 0.08),
      }}
    >
      <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      <Text className="text-[9px] font-normal text-kd-text-subtle" numberOfLines={1}>
        {label}
      </Text>
      <Text className="text-[10px] font-medium" numberOfLines={1} style={{ color }}>
        {value}
      </Text>
    </View>
  );
}

function getOverlayAssetColor(
  generated: number,
  failed: number,
  planned: number,
  fallbackColor: string,
  theme: KubdeeTheme
): string {
  if (failed > 0) return theme.red;
  if (planned > 0 && generated >= planned) return theme.emerald;
  return fallbackColor;
}

function formatOverlayStep(step: AutoPilotStepType | null, stage: string | null): string {
  const stepText = step ? stepLabel(step) : 'รอเริ่ม';
  if (!stage) return stepText;
  if (stage === 'step_started') return stepText;
  const stageLabel = getAutoPilotStageLabel(stage, stage.replace(/^flow_/, ''));
  if (!step || isAutoPilotGlobalStage(stage)) return stageLabel;
  if (stage.startsWith('multi_scene_config_image')) return `รูปภาพ · ${stageLabel}`;
  return `${stepText} · ${stageLabel}`;
}

function formatOverlayFlowStats(stats?: AutoPilotFlowStats): string {
  if (!stats) return 'รอข้อมูล';
  if (stats.progress != null) return `${stats.progress}%`;
  const parts = [
    stats.generating > 0 ? `gen ${stats.generating}` : '',
    stats.queued > 0 ? `queue ${stats.queued}` : '',
    stats.success > 0 ? `ok ${stats.success}` : '',
    stats.failed > 0 ? `fail ${stats.failed}` : '',
    stats.tilesFound ? `tiles ${stats.tilesFound}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'รอข้อมูล';
}

function formatOverlayAssetProgress(generated: number, failed: number, planned: number): string {
  if (failed > 0) {
    return `${generated}·${failed}/${planned}`;
  }
  return `${generated}/${planned}`;
}

function formatOverlayLogMeta(line: OverlayLogLine): string | null {
  if (!line.step && !line.stage) return null;
  return formatOverlayStep(line.step ?? null, line.stage ?? null);
}

function formatOverlayTime(timestamp: number): string {
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

function formatOverlayDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

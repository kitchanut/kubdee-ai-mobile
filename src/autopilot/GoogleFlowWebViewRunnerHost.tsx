import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Square, X } from 'lucide-react-native';

import {
  emitGoogleFlowRunnerLog,
  registerGoogleFlowWebViewRunnerHost,
} from '@/autopilot/googleFlowRunnerBridge';
import { BACKEND_URL } from '@/auth/constants';
import { getStoredAuthTokens } from '@/auth/storage';
import type {
  AutoPilotSettings,
  AutoPilotStepType,
  GoogleFlowRunnerLogEntry,
  GoogleFlowRunnerPayload,
  GoogleFlowRunnerProduct,
} from '@/autopilot/types';
import FlowWebView, { type FlowConnectionState, type FlowWebViewHandle } from '@/flow/FlowWebView';
import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';
import {
  mergeGoogleFlowVideos,
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
  successCount?: number;
  generatingCount?: number;
  queuedCount?: number;
  tilesFound?: number;
  progress?: number | null;
}

interface FlowSnapshot {
  videoUrls?: string[];
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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

class GoogleFlowWebViewRunnerStopped extends Error {
  constructor() {
    super('Google Flow WebView runner stopped');
  }
}

function stepLabel(step: AutoPilotStepType): string {
  return step === 'image' ? 'รูปภาพ' : 'วิดีโอ';
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

function autoMultiSceneMode(product: GoogleFlowRunnerProduct): string {
  return product.settings.video.multiSceneAngleMode || 'same_angle';
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
      'ฉากที่ 2 ให้เป็น product hero หรือ close-up/detail shot เห็นสินค้า แพ็กเกจ โลโก้ รายละเอียด หรือมือที่กำลังถือ/ใช้สินค้าเด่นมากขึ้น',
    ],
    3: [
      'ฉากที่ 1 ให้เป็น hook shot เปิดเรื่อง เห็นสินค้าและปัญหาที่สินค้าแก้ได้ชัดเจน',
      'ฉากที่ 2 ให้เป็น usage/demo shot เห็นการใช้งานจริงหรือผลลัพธ์ที่ต่างจากฉากแรก',
      'ฉากที่ 3 ให้เป็น hero/CTA shot เห็นสินค้าเด่น ชัด พร้อมอารมณ์ปิดการขาย',
    ],
    4: [
      'ฉากที่ 1 ให้เป็น hook shot เปิดเรื่อง',
      'ฉากที่ 2 ให้เป็น usage/demo shot',
      'ฉากที่ 3 ให้เป็น benefit/proof shot เห็นรายละเอียดหรือผลลัพธ์',
      'ฉากที่ 4 ให้เป็น hero/CTA shot ปิดท้าย',
    ],
    5: [
      'ฉากที่ 1 ให้เป็น hook shot เปิดเรื่อง',
      'ฉากที่ 2 ให้เป็น problem/usage shot',
      'ฉากที่ 3 ให้เป็น close-up/detail shot',
      'ฉากที่ 4 ให้เป็น benefit/proof shot',
      'ฉากที่ 5 ให้เป็น hero/CTA shot ปิดท้าย',
    ],
  };
  return (shotPlans[clampedTotal] ?? shotPlans[3])[clampedScene - 1] ?? '';
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

function multiSceneImagePrompt(product: GoogleFlowRunnerProduct, sceneNumber: number, totalScenes: number, sameAngle: boolean): string {
  return [
    `สร้างภาพฉากที่ ${sceneNumber}/${totalScenes} สำหรับวิดีโอหลายฉากของสินค้า "${product.name || 'สินค้า'}"`,
    getAutoMultiSceneImageVariationInstruction(sceneNumber, totalScenes),
    sameAngle ? SAME_ANGLE_PRESENTER_IMAGE_INSTRUCTION : 'คงตัวละครเดิม ใบหน้าเดิม สินค้าเดิม แพ็กเกจเดิม และแบรนด์เดิม แต่เปลี่ยนมุมกล้อง ระยะภาพ การกระทำ หรือบริบทให้ต่างจากฉากก่อนหน้าอย่างชัดเจน',
    FACE_VISIBILITY_IMAGE_INSTRUCTION,
    'ห้ามใส่ subtitle หรือข้อความบนภาพเองถ้าไม่ได้ตั้งค่าไว้',
  ]
    .filter(Boolean)
    .join(' ');
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

function resolveGeminiTtsVoice(voiceCharacter?: string): string {
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
    '': 'Kore',
  };
  return voiceMap[voiceCharacter || ''] || 'Kore';
}

async function generateVoiceoverAudioDataUrl({
  durationSeconds,
  product,
  sceneCount,
}: {
  durationSeconds: number;
  product: GoogleFlowRunnerProduct;
  sceneCount: number;
}): Promise<string | null> {
  const voiceoverScript = Array.from({ length: sceneCount }, (_, index) => dialogueForScene(product, index + 1))
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ');
  if (!voiceoverScript) {
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
      voiceoverScript,
      sceneCount,
      durationSeconds,
      voice: resolveGeminiTtsVoice(product.settings.video.voiceCharacter),
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

function getReferenceFileName(product: GoogleFlowRunnerProduct): string {
  const code = product.productId || product.catalogId || product.id || 'product';
  return `kubdee-reference-${code.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 48)}.png`;
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

export default function GoogleFlowWebViewRunnerHost({
  theme,
}: GoogleFlowWebViewRunnerHostProps): React.JSX.Element {
  const flowRef = useRef<FlowWebViewHandle>(null);
  const runningRef = useRef(false);
  const stopRequestedRef = useRef(false);
  const payloadRef = useRef<GoogleFlowRunnerPayload | null>(null);
  const flowStatusRef = useRef<FlowConnectionState>('unknown');
  const [visible, setVisible] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [flowStatus, setFlowStatus] = useState<FlowConnectionState>('unknown');
  const [overlayLogs, setOverlayLogs] = useState<string[]>([]);

  const emit = useCallback((entry: Omit<GoogleFlowRunnerLogEntry, 'ts'> & { ts?: number }): void => {
    emitGoogleFlowRunnerLog(entry);
    if (entry.message) {
      setOverlayLogs((current) => [...current.slice(-7), entry.message]);
    }
  }, []);

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
    }): Promise<Record<string, unknown>> => {
      const startedAt = Date.now();
      let lastError = '';

      while (Date.now() - startedAt < 120_000) {
        checkStop();
        const status = flowStatusRef.current;
        if (status === 'signin' || status === 'loggedout') {
          throw new Error('ยังไม่ได้เชื่อมต่อ Google Flow ใน WebView');
        }

        try {
          return await runActionOrThrow(handle, 'newProject', {}, 35_000);
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

  const waitForStepResult = useCallback(
    async ({
      baselineVideoUrls,
      count,
      handle,
      payload,
      product,
      productIndex,
      round,
      step,
    }: {
      baselineVideoUrls: string[];
      count: number;
      handle: FlowWebViewHandle;
      payload: GoogleFlowRunnerPayload;
      product: GoogleFlowRunnerProduct;
      productIndex: number;
      round: number;
      step: AutoPilotStepType;
    }): Promise<FlowResultPoll> => {
      const startedAt = Date.now();
      const timeoutMs = step === 'video' ? 300_000 : 180_000;
      let failConfirm = 0;
      let doneConfirm = 0;

      while (Date.now() - startedAt < timeoutMs) {
        checkStop();
        await sleep(4000);
        const result = (await runActionOrThrow(
          handle,
          'videoResults',
          { count, ignoreUrls: baselineVideoUrls },
          20_000
        )) as FlowResultPoll;

        const generating = result.generatingCount ?? 0;
        const queued = result.queuedCount ?? 0;
        const failed = result.failedCount ?? 0;
        const videos = result.videos ?? [];
        const imageCount = result.images ?? 0;
        const progress = result.progress;
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
          message: `รอผล${stepLabel(step)}: gen ${generating} queue ${queued} ok ${result.successCount ?? 0} fail ${failed}${
            progress != null ? ` ${progress}%` : ''
          }`,
        });

        if (generating > 0 || queued > 0 || progress != null || (result.tilesFound ?? 0) === 0) {
          failConfirm = 0;
          doneConfirm = 0;
          continue;
        }

        const hasOutput = step === 'video' ? videos.length > 0 : imageCount > 0;
        if (hasOutput) {
          doneConfirm += 1;
          if (doneConfirm >= 2) {
            return result;
          }
        } else if (failed > 0) {
          failConfirm += 1;
          if (failConfirm >= 3) {
            emit({
              event: 'progress',
              runId: payload.runId,
              status: 'running',
              step,
              stage: 'failed',
              productId: product.id,
              productName: product.name,
              currentRound: round,
              totalRounds: payload.settings.totalRounds,
              currentProduct: productIndex + 1,
              totalProducts: payload.products.length,
              message: `Flow แจ้งล้มเหลวสำหรับ${stepLabel(step)}`,
            });
            throw new Error(`Flow แจ้งล้มเหลวสำหรับ${stepLabel(step)}`);
          }
        } else {
          failConfirm = 0;
          doneConfirm = 0;
        }
      }

      throw new Error(`หมดเวลารอผล${stepLabel(step)}`);
    },
    [checkStop, emit, runActionOrThrow]
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

        await openGoogleFlowProject({
          handle,
          payload,
          product,
          productIndex,
          round,
          step,
        });

        const hasPriorImageStep = payload.enabledSteps.includes('image');
        const neededSceneImages = useSameAngle ? (hasPriorImageStep ? 0 : 1) : hasPriorImageStep ? sceneCount - 1 : sceneCount;
        const firstGeneratedSceneNumber = !useSameAngle && hasPriorImageStep ? 2 : 1;
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

          const config = (await runActionOrThrow(
            handle,
            'configurePopper',
            {
              targetMode: 'image',
              aspectRatio: product.settings.image.aspectRatio,
              outputCount: 1,
              imageModel,
            },
            70_000
          )) as { success?: boolean; error?: string };
          if (config.success === false) {
            throw new Error(`ตั้งค่า Flow รูปฉากไม่ครบ: ${config.error ?? 'unknown'}`);
          }

          if (sceneNumber > 1 || hasPriorImageStep) {
            await runActionOrThrow(handle, 'selectRecentImage', { indexOffset: 0 }, 45_000);
          } else if (product.preview) {
            const dataUrl = await loadImageReferenceDataUrl(product.preview);
            await runActionOrThrow(
              handle,
              'uploadReferenceImage',
              {
                dataUrl: dataUrl ?? undefined,
                fileName: getReferenceFileName(product),
                imageUrl: dataUrl ? undefined : product.preview,
              },
              120_000
            );
          }

          await runActionOrThrow(
            handle,
            'fillPrompt',
            {
              prompt: multiSceneImagePrompt(product, sceneNumber, sceneCount, useSameAngle),
            },
            45_000
          );
          await runActionOrThrow(handle, 'submit', {}, 45_000);
          const imageResult = await waitForStepResult({
            baselineVideoUrls: [],
            count: 1,
            handle,
            payload,
            product,
            productIndex,
            round,
            step: 'image',
          });
          const imageCount = Math.max(1, Number(imageResult.images ?? 1) || 1);
          const imagePayload = (await runActionOrThrow(
            handle,
            'downloadImages',
            { count: imageCount },
            90_000
          )) as FlowImageDownloadPayload;
          const firstImage = imagePayload.images?.find((image) => image.dataUrl);
          if (firstImage?.dataUrl) {
            const downloaded = await saveGoogleFlowDataUrlAsset('image', firstImage.dataUrl, firstImage.fileName);
            if (downloaded?.uri) {
              emit({
                event: 'asset',
                runId: payload.runId,
                status: 'running',
                step: 'image',
                stage: 'generated',
                productId: product.id,
                productName: product.name,
                fileUri: downloaded.uri,
                fileName: downloaded.fileName,
                mimeType: downloaded.mimeType || firstImage.mimeType || 'image/png',
                sizeBytes: downloaded.sizeBytes || firstImage.sizeBytes || undefined,
                createdAt: downloaded.createdAt || Date.now(),
                message: `ได้รูปฉาก ${sceneNumber}/${sceneCount} แล้ว`,
              });
            }
          }
        }

        const sceneVideoUris: string[] = [];
        for (let sceneIndex = 0; sceneIndex < sceneCount; sceneIndex += 1) {
          checkStop();
          const sceneNumber = sceneIndex + 1;
          const referenceOffset = useSameAngle ? 0 : Math.max(0, sceneCount - sceneNumber);
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

          const config = (await runActionOrThrow(
            handle,
            'configurePopper',
            {
              targetMode: 'video',
              aspectRatio: product.settings.video.aspectRatio,
              outputCount: 1,
              videoDuration,
              videoModel,
            },
            70_000
          )) as { success?: boolean; error?: string };
          if (config.success === false) {
            throw new Error(`ตั้งค่า Flow วิดีโอฉากไม่ครบ: ${config.error ?? 'unknown'}`);
          }

          if (neededSceneImages > 0 || payload.enabledSteps.includes('image')) {
            await runActionOrThrow(handle, 'selectRecentImage', { indexOffset: referenceOffset }, 45_000);
          } else if (product.preview) {
            const dataUrl = await loadImageReferenceDataUrl(product.preview);
            await runActionOrThrow(
              handle,
              'uploadReferenceImage',
              {
                dataUrl: dataUrl ?? undefined,
                fileName: getReferenceFileName(product),
                imageUrl: dataUrl ? undefined : product.preview,
              },
              120_000
            );
          }

          const snapshot = (await runActionOrThrow(handle, 'videoSnapshot', {}, 15_000)) as FlowSnapshot;
          const baselineVideoUrls = snapshot.videoUrls ?? [];
          await runActionOrThrow(
            handle,
            'fillPrompt',
            { prompt: multiSceneVideoPrompt(product, prompt, sceneNumber, sceneCount, useVoiceover) },
            45_000
          );
          await runActionOrThrow(handle, 'submit', {}, 45_000);
          const videoResult = await waitForStepResult({
            baselineVideoUrls,
            count: 1,
            handle,
            payload,
            product,
            productIndex,
            round,
            step,
          });

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
            message: 'กำลังสร้างเสียงพากษ์รวมสำหรับวิดีโอหลายฉาก',
          });
          voiceoverDataUrl = await generateVoiceoverAudioDataUrl({
            durationSeconds: Math.max(1, Math.round(sceneCount * Math.max(1, videoDuration - 0.5) - 1)),
            product,
            sceneCount,
          });
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

      emit({
        event: 'progress',
        runId: payload.runId,
        status: 'running',
        step,
        stage: 'open_project',
        productId: product.id,
        productName: product.name,
        currentRound: round,
        totalRounds: payload.settings.totalRounds,
        currentProduct: productIndex + 1,
        totalProducts: payload.products.length,
        message: `เข้า Google Flow project สำหรับ${label}`,
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
      const config = (await runActionOrThrow(handle, 'configurePopper', configArgs, 70_000)) as {
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

      const shouldUsePreviousImage = step === 'video' && payload.enabledSteps.includes('image');
      if (shouldUsePreviousImage) {
        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'attach_reference',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: 'แนบรูปที่เพิ่งสร้างจาก Google Flow เป็น reference วิดีโอ',
        });
        await runActionOrThrow(handle, 'selectRecentImage', { indexOffset: 0 }, 45_000);
      } else if (product.preview) {
        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'attach_reference',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: `แนบรูปสินค้า reference สำหรับ${label}`,
        });
        const dataUrl = await loadImageReferenceDataUrl(product.preview);
        await runActionOrThrow(
          handle,
          'uploadReferenceImage',
          {
            dataUrl: dataUrl ?? undefined,
            fileName: getReferenceFileName(product),
            imageUrl: dataUrl ? undefined : product.preview,
          },
          120_000
        );
      }

      let baselineVideoUrls: string[] = [];
      if (step === 'video') {
        const snapshot = (await runActionOrThrow(handle, 'videoSnapshot', {}, 15_000)) as FlowSnapshot;
        baselineVideoUrls = snapshot.videoUrls ?? [];
      }

      emit({
        event: 'progress',
        runId: payload.runId,
        status: 'running',
        step,
        stage: 'fill_prompt',
        productId: product.id,
        productName: product.name,
        currentRound: round,
        totalRounds: payload.settings.totalRounds,
        currentProduct: productIndex + 1,
        totalProducts: payload.products.length,
        message: `กรอก prompt ${label}: ${(product.name || 'สินค้า').slice(0, 34)}`,
      });
      await runActionOrThrow(handle, 'fillPrompt', { prompt }, 45_000);
      await runActionOrThrow(handle, 'submit', {}, 45_000);
      emit({
        event: 'progress',
        runId: payload.runId,
        status: 'running',
        step,
        stage: 'submitted',
        productId: product.id,
        productName: product.name,
        currentRound: round,
        totalRounds: payload.settings.totalRounds,
        currentProduct: productIndex + 1,
        totalProducts: payload.products.length,
        message: `ส่ง prompt ${label} แล้ว`,
      });

      const result = await waitForStepResult({
        baselineVideoUrls,
        count,
        handle,
        payload,
        product,
        productIndex,
        round,
        step,
      });

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
            throw new Error('สร้างวิดีโอแล้ว แต่ดาวน์โหลดไฟล์ลงมือถือไม่สำเร็จ');
          }

          emit({
            event: 'asset',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'generated',
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
          { count: imageCount },
          90_000
        )) as FlowImageDownloadPayload;
        const images = imagePayload.images ?? [];
        if (images.length === 0) {
          throw new Error(
            imagePayload.errors?.[0] || 'สร้างรูปภาพแล้ว แต่ดึงไฟล์รูปจาก Google Flow ไม่สำเร็จ'
          );
        }

        for (const [index, image] of images.entries()) {
          if (!image.dataUrl) {
            continue;
          }
          const downloaded = await saveGoogleFlowDataUrlAsset('image', image.dataUrl, image.fileName);
          if (!downloaded?.uri) {
            throw new Error('บันทึกรูปภาพลงมือถือไม่สำเร็จ');
          }
          emit({
            event: 'asset',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'generated',
            productId: product.id,
            productName: product.name,
            fileUri: downloaded.uri,
            fileName: downloaded.fileName,
            mimeType: downloaded.mimeType || image.mimeType || 'image/png',
            sizeBytes: downloaded.sizeBytes || image.sizeBytes || undefined,
            createdAt: downloaded.createdAt || Date.now(),
            message: `ได้รูปภาพจาก Google Flow แล้ว (${index + 1}/${images.length})`,
          });
        }
      }
    },
    [emit, openGoogleFlowProject, runActionOrThrow, waitForStepResult]
  );

  const runPayload = useCallback(
    async (payload: GoogleFlowRunnerPayload): Promise<void> => {
      try {
        const handle = await waitForHandle();
        emit({
          runId: payload.runId,
          status: 'running',
          message: 'Google Flow WebView runner เริ่มทำงาน',
        });

        for (let round = 1; round <= payload.settings.totalRounds; round += 1) {
          for (let productIndex = 0; productIndex < payload.products.length; productIndex += 1) {
            const product = payload.products[productIndex];
            for (const step of payload.enabledSteps) {
              checkStop();
              await runProductStep({
                handle,
                payload,
                product,
                productIndex,
                round,
                step,
              });
            }
          }
        }

        emit({
          runId: payload.runId,
          status: 'completed',
          message: 'Auto Pilot Google Flow WebView จบแล้ว',
        });
        setVisible(false);
      } catch (error) {
        if (error instanceof GoogleFlowWebViewRunnerStopped) {
          emit({
            runId: payload.runId,
            status: 'stopped',
            message: 'หยุด Auto Pilot Google Flow WebView แล้ว',
          });
          setVisible(false);
        } else {
          emit({
            runId: payload.runId,
            status: 'error',
            message: `Google Flow WebView error: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      } finally {
        runningRef.current = false;
        stopRequestedRef.current = false;
        payloadRef.current = null;
        setActiveRunId(null);
      }
    },
    [checkStop, emit, runProductStep, waitForHandle]
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
        setActiveRunId(payload.runId);
        setFlowStatus('unknown');
        flowStatusRef.current = 'unknown';
        setOverlayLogs([]);
        setVisible(true);
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

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={requestStop}>
      <SafeAreaView className="flex-1 bg-kd-panel">
        <View className="h-14 flex-row items-center justify-between border-b border-kd-border bg-kd-panel px-4">
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-kd-title font-semibold text-kd-text">
              Google Flow WebView
            </Text>
            <Text numberOfLines={1} className="text-kd-caption text-kd-text-muted">
              {activeRunId ? `run ${activeRunId.slice(-8)} · ${flowStatusLabel}` : flowStatusLabel}
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
        <View className="relative flex-1">
          <FlowWebView
            ref={flowRef}
            backgroundColor={theme.screen}
            onStatusChange={(state) => {
              flowStatusRef.current = state;
              setFlowStatus(state);
            }}
          />
          {overlayLogs.length > 0 ? (
            <View
              pointerEvents="none"
              style={{ backgroundColor: 'rgba(0,0,0,0.66)' }}
              className="absolute inset-x-2 top-2 rounded-kd-lg px-3 py-2"
            >
              {overlayLogs.map((line, index) => (
                <Text key={`${index}-${line}`} numberOfLines={1} className="text-kd-micro leading-4 text-white">
                  {line}
                </Text>
              ))}
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

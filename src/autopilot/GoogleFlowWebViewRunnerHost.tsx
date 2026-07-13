import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Square, X } from 'lucide-react-native';

import {
  emitGoogleFlowRunnerLog,
  registerGoogleFlowWebViewRunnerHost,
} from '@/autopilot/googleFlowRunnerBridge';
import { postProductAfterGeneration } from '@/autopilot/autoProductPosting';
import type { AutoPilotProductVideoAsset } from '@/autopilot/autoProductPosting';
import type {
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
import type { KubdeeTheme } from '@/theme/tokens';
import { getCurrentMobileVersion, getCurrentMobileVersionCode } from '@/updates/mobileUpdate';
import { cacheProductImage } from '@/library/productImageCache';
import {
  mergeGoogleFlowVideos,
  probeGoogleFlowVideos,
  saveGoogleFlowDataUrlAsset,
  waitForGoogleFlowDownload,
} from '@/native/AccessibilityBridge';
import {
  AUTO_MULTI_SCENE_TRIM_END_SECONDS,
  GoogleFlowCountedStepFailure,
  GoogleFlowWebViewRunnerStopped,
  OverlayStatChip,
  VOICEOVER_END_BUFFER_SECONDS,
  autoMultiSceneMode,
  buildFlowFailedError,
  buildGoogleFlowSelfScriptVideoPrompts,
  clampAutoSceneCount,
  createFallbackMultiScenePromptResult,
  formatOverlayAssetProgress,
  formatOverlayDuration,
  formatOverlayFlowStats,
  formatOverlayLogMeta,
  formatOverlayStep,
  formatOverlayTime,
  formatPromptPreview,
  formatRoundProgress,
  generateVoiceoverAudioDataUrl,
  getAdditionalImageReferences,
  getAdditionalVideoReferences,
  getAutoVideoResultCount,
  getGeneratedImageCacheKey,
  getGeneratedImageReferenceFileName,
  getOverlayAssetColor,
  getOverlayLogMessageColor,
  getOverlayLogMessageLineCount,
  getPlannedOverlayAssetStats,
  getProductReferenceFileName,
  getProductReferenceLabel,
  getRoundLoopCount,
  getUploadReferenceStage,
  imageModelForProduct,
  isAudioGenerationFailure,
  isAutoMultiSceneVideo,
  isRetryableFlowError,
  loadImageReferenceDataUrl,
  multiSceneImagePrompt,
  multiSceneVideoPrompt,
  outputCountForRunnerStep,
  outputCountForStep,
  prepareAutoMultiScenePrompts,
  promptForStep,
  randomAutoRunDelayMs,
  rewriteVideoPromptForFlowError,
  resolveGeminiTtsVoice,
  resolveReferenceTransportArgs,
  shouldSkipRefreshAfterFreshProjectOpen,
  sleep,
  stepLabel,
  toVoiceoverSilentRetryPrompt,
  updateOverlayAssetStats,
  videoDurationForProduct,
  videoModelForProduct,
} from './google-flow-runner';
import type {
  FlowActionLogContext,
  FlowDownloadPayload,
  FlowImageDownloadItem,
  FlowImageDownloadPayload,
  FlowResultPoll,
  FlowSnapshot,
  OpenGoogleFlowProjectResult,
  OverlayLogLine,
  OverlayProgressState,
} from './google-flow-runner';

interface GoogleFlowWebViewRunnerHostProps {
  theme: KubdeeTheme;
}

interface TrackedProductAsset extends AutoPilotProductVideoAsset {
  step: AutoPilotStepType;
}

function describeReferenceTransport(args: Record<string, unknown>): string {
  const dataUrl = typeof args.dataUrl === 'string' ? args.dataUrl : '';
  if (dataUrl.startsWith('data:image/')) {
    const mime = dataUrl.slice(5, dataUrl.indexOf(';') > 5 ? dataUrl.indexOf(';') : 32);
    return `dataUrl จากแอป (${mime || 'image'})`;
  }

  const imageUrl = typeof args.imageUrl === 'string' ? args.imageUrl.trim() : '';
  if (!imageUrl) {
    return 'ไม่มี dataUrl/imageUrl';
  }
  if (imageUrl.startsWith('content://')) return 'fallback URL: content://';
  if (imageUrl.startsWith('file://')) return 'fallback URL: file://';
  if (imageUrl.startsWith('/')) return 'fallback path ในเครื่อง';
  try {
    const url = new URL(imageUrl);
    return `fallback URL: ${url.protocol}//${url.hostname}`;
  } catch {
    return `fallback URL: ${imageUrl.slice(0, 32)}`;
  }
}

function getRunnerVersionLabel(): string {
  const version = getCurrentMobileVersion();
  const buildCode = getCurrentMobileVersionCode();
  return buildCode != null ? `v${version} (${buildCode})` : `v${version}`;
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
  const latestProductAssetsRef = useRef<Map<string, TrackedProductAsset[]>>(new Map());
  const [visible, setVisible] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isFlowReady, setIsFlowReady] = useState(false);
  const [flowWebViewKey, setFlowWebViewKey] = useState(0);
  const [overlayLogs, setOverlayLogs] = useState<OverlayLogLine[]>([]);
  const [overlayProgress, setOverlayProgress] = useState<OverlayProgressState | null>(null);

  const emit = useCallback((entry: Omit<GoogleFlowRunnerLogEntry, 'ts'> & { ts?: number }): void => {
    if (entry.event === 'asset' && entry.productId && entry.step && entry.fileUri) {
      const existing = latestProductAssetsRef.current.get(entry.productId) ?? [];
      latestProductAssetsRef.current.set(entry.productId, [
        ...existing,
        { step: entry.step, fileUri: entry.fileUri, fileName: entry.fileName, mimeType: entry.mimeType },
      ]);
    }

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
        ...current.slice(-3),
        {
          id: `${ts}-${current.length}`,
          message: entry.message,
          ts,
          level: entry.level,
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

  const setFlowHandle = useCallback((handle: FlowWebViewHandle | null): void => {
    flowRef.current = handle;
    setIsFlowReady(handle !== null);
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
      const referenceLabel = String(args.referenceLabel || 'รูป reference').trim();
      const stage = getUploadReferenceStage(args.referenceLabel);
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
          message: `เริ่มเปิด dialog แนบ${referenceLabel}ใน Google Flow จะกดปุ่ม + และตรวจว่า dialog เปิดจริง (${describeReferenceTransport(args)})`,
        });
        const result = await runActionOrThrow(handle, 'uploadReferenceImage', args, 120_000);
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
          message: `แนบ${referenceLabel}ผ่าน Google Flow สำเร็จ`,
        });
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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || 'unknown');
        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          level: 'error',
          step,
          stage,
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: `แนบ${referenceLabel}ไม่สำเร็จ: ${message}`,
        });
        throw error;
      } finally {
        if (actionLogContextRef.current === context) {
          actionLogContextRef.current = previousContext;
        }
      }
    },
    [emit, runActionOrThrow]
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
                  message: `อัปโหลดรูปฉากก่อนหน้าจาก cache เป็น reference สำหรับสร้างรูปฉาก ${sceneNumber}`,
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
              } else if (sceneNumber > 1 || hasPriorImageStep) {
                throw new Error(`ไม่มีรูป reference ของฉากก่อนหน้า สำหรับสร้างรูปฉาก ${sceneNumber}`);
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
                  message: `แนบ${getProductReferenceLabel(product, productIndex)}เป็น reference สำหรับสร้างรูปฉาก ${sceneNumber}/${sceneCount}: ${product.name || 'สินค้า'}`,
                });
                let productReferenceUri = product.preview;
                let productReferenceDataUrl = await loadImageReferenceDataUrl(productReferenceUri);
                const previewFallbackUrl = product.previewFallbackUrl?.trim() || '';
                if (!productReferenceDataUrl && previewFallbackUrl && previewFallbackUrl !== productReferenceUri) {
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
                    message: `รูปสินค้าในเครื่องเปิดไม่ได้ กำลังโหลดรูปจาก URL แทน: ${product.name || 'สินค้า'}`,
                  });
                  productReferenceDataUrl = await loadImageReferenceDataUrl(previewFallbackUrl);
                  if (productReferenceDataUrl) {
                    productReferenceUri = previewFallbackUrl;
                    // ซ่อมไฟล์ cache ที่หายกลับคืน — ชื่อไฟล์ deterministic ต่อ (สินค้า, URL)
                    // จึงกลับมาตรง imagePath เดิมใน DB ให้รอบถัดไปอ่านไฟล์เครื่องได้ตามปกติ
                    void cacheProductImage({
                      externalProductId: product.productId,
                      name: product.name,
                      imageUrl: previewFallbackUrl,
                    }).catch(() => {});
                  }
                }
                await uploadReferenceImageOrThrow({
                  handle,
                  payload,
                  product,
                  productIndex,
                  round,
                  step: 'image',
                  args: {
                    ...resolveReferenceTransportArgs(productReferenceDataUrl, productReferenceUri),
                    fileName: getProductReferenceFileName(product, productIndex, round, 'image'),
                    referenceLabel: getProductReferenceLabel(product, productIndex),
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
                    ...resolveReferenceTransportArgs(referenceDataUrl, reference.uri),
                    fileName: reference.fileName,
                    referenceLabel: `รูป${reference.label}`,
                  },
                });
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
                message: `อัปโหลดรูปฉากมุมเดียวจาก cache เป็น reference สำหรับวิดีโอฉาก ${sceneNumber}`,
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
                  allowTopReadyFallback: true,
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
                message: `แนบ${getProductReferenceLabel(product, productIndex)}เป็น reference สำหรับวิดีโอฉาก ${sceneNumber}: ${product.name || 'สินค้า'}`,
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
                  ...resolveReferenceTransportArgs(dataUrl, product.preview),
                  fileName: getProductReferenceFileName(product, productIndex, round, step),
                  referenceLabel: getProductReferenceLabel(product, productIndex),
                },
              });
              return true;
            }
            return false;
          };

          const sceneReferenceAttached = await attachSceneReference();
          if (sceneReferenceAttached) {
            await sleep(1500);
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
          if (cachedImageDataUrl) {
            emit({
              event: 'progress',
              runId: payload.runId,
              status: 'running',
              step,
              stage: 'attach_generated_image_reference',
              productId: product.id,
              productName: product.name,
              currentRound: round,
              totalRounds: payload.settings.totalRounds,
              currentProduct: productIndex + 1,
              totalProducts: payload.products.length,
              message: 'อัปโหลดรูปที่เพิ่งสร้างจาก cache เป็น reference สำหรับวิดีโอ',
            });
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
          } else {
            emit({
              event: 'progress',
              runId: payload.runId,
              status: 'running',
              step,
              stage: 'attach_generated_image_reference',
              productId: product.id,
              productName: product.name,
              currentRound: round,
              totalRounds: payload.settings.totalRounds,
              currentProduct: productIndex + 1,
              totalProducts: payload.products.length,
              message: 'ไม่พบรูป cache ในแอป จะดึงรูปที่เพิ่งสร้างจากหน้า Flow แล้วอัปโหลดเป็น reference สำหรับวิดีโอ',
            });

            const latestImage = await downloadLatestFlowImage(handle, 1, latestBaselineImageUrls);
            if (!latestImage?.dataUrl) {
              throw new Error('ไม่พบรูปที่เพิ่งสร้างจากหน้า Flow สำหรับใช้เป็น reference วิดีโอ');
            }

            await uploadReferenceImageOrThrow({
              handle,
              payload,
              product,
              productIndex,
              round,
              step,
              args: {
                dataUrl: latestImage.dataUrl,
                fileName: getGeneratedImageReferenceFileName(product, round),
                referenceLabel: 'รูปที่สร้างไว้',
              },
            });
          }
          videoReferenceAttached = true;
        } else {
          if (step === 'image') {
            const referenceNames = [
              product.preview ? getProductReferenceLabel(product, productIndex) : null,
              ...getAdditionalImageReferences(product).map((reference) => `รูป${reference.label}`),
            ].filter(Boolean);
            emit({
              event: 'progress',
              runId: payload.runId,
              status: 'running',
              step,
              stage: 'attach_reference_plan',
              productId: product.id,
              productName: product.name,
              currentRound: round,
              totalRounds: payload.settings.totalRounds,
              currentProduct: productIndex + 1,
              totalProducts: payload.products.length,
              message: referenceNames.length
                ? `สร้างรูปฉากเดียว: จะอัปโหลด reference (${referenceNames.join(', ')})`
                : 'สร้างรูปฉากเดียว: ไม่มีรูป reference ให้แนบ',
            });
          }

          if (product.preview) {
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
              message: `แนบ${getProductReferenceLabel(product, productIndex)}เป็น reference สำหรับ${label}: ${product.name || 'สินค้า'}`,
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
                ...resolveReferenceTransportArgs(dataUrl, product.preview),
                fileName: getProductReferenceFileName(product, productIndex, round, step),
                referenceLabel: getProductReferenceLabel(product, productIndex),
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
                ...resolveReferenceTransportArgs(referenceDataUrl, reference.uri),
                fileName: reference.fileName,
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
                ...resolveReferenceTransportArgs(referenceDataUrl, reference.uri),
                fileName: reference.fileName,
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
      checkStop,
      emit,
      ensureVideoReferenceAttached,
      fillPromptAndSubmit,
      openGoogleFlowProject,
      refreshGoogleFlowProject,
      runActionOrThrow,
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
            // Multi-round runs revisit the same product id — drop any assets
            // tracked from a prior round before this round's steps run.
            latestProductAssetsRef.current.delete(product.id);
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

            // ครบทั้ง 4 platform — postProductAfterGeneration เช็ค flag+channel
            // รายตัวข้างในอีกชั้น (เคย gate แค่ Shopee/Facebook ทำให้เปิดเฉพาะ
            // Instagram/YouTube แล้วไม่โพสต์เงียบๆ — issue #16)
            const shouldPostAfterGeneration =
              payload.settings.autoPostShopee ||
              payload.settings.autoPostFacebook ||
              payload.settings.autoPostInstagram ||
              payload.settings.autoPostYoutube;
            if (shouldPostAfterGeneration) {
              const videoAssets = (latestProductAssetsRef.current.get(product.id) ?? []).filter(
                (asset) => asset.step === 'video'
              );
              try {
                await postProductAfterGeneration({
                  product,
                  videoAssets,
                  settings: payload.settings,
                  emit,
                  runId: payload.runId,
                  round,
                  totalRounds: payload.settings.totalRounds,
                  productIndex,
                  totalProducts: payload.products.length,
                });
              } catch (postingError) {
                // Posting failures must never stop the run — the remaining
                // products (and cleanup for this one) still need to happen.
                emit({
                  event: 'progress',
                  runId: payload.runId,
                  status: 'running',
                  level: 'error',
                  stage: 'failed',
                  productId: product.id,
                  productName: product.name,
                  currentRound: round,
                  totalRounds: payload.settings.totalRounds,
                  currentProduct: productIndex + 1,
                  totalProducts: payload.products.length,
                  message: `โพสต์สินค้าไม่สำเร็จ: ${postingError instanceof Error ? postingError.message : String(postingError)}`,
                });
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
        setIsRunning(false);
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
        setIsRunning(true);
        flowStatusRef.current = 'unknown';
        setOverlayLogs([]);
        setOverlayProgress(null);
        flowRef.current = null;
        setIsFlowReady(false);
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

  const overlayTitle = overlayProgress?.productName?.trim() || 'Google Flow';
  const overlayVersionLabel = getRunnerVersionLabel();
  const overlaySubtitle = overlayProgress
    ? `${overlayVersionLabel} · ${formatOverlayStep(overlayProgress.step, overlayProgress.stage)} · Flow ${formatOverlayFlowStats(
        overlayProgress.flowStats
      )}`
    : `${overlayVersionLabel} · รอเริ่ม`;

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
            {isRunning ? (
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
            ref={setFlowHandle}
            accountProbeEnabled={false}
            backgroundColor={theme.screen}
            onActionLog={emitFlowActionLog}
            onNavigationChange={(href) => {
              flowUrlRef.current = href;
            }}
            onStatusChange={(state, href) => {
              flowStatusRef.current = state;
              flowUrlRef.current = href;
            }}
          />
          {overlayLogs.length > 0 ? (
            <View
              pointerEvents="none"
              style={{ backgroundColor: 'rgba(0,0,0,0.66)' }}
              className="absolute inset-x-0 top-0 border-b border-black/20 px-3 py-2"
            >
              {overlayLogs.map((line, index) => {
                const firstLog = overlayLogs[0] ?? line;
                const previousLog = index > 0 ? overlayLogs[index - 1] : null;
                const deltaMs = previousLog ? Math.max(0, line.ts - previousLog.ts) : 0;
                const elapsedMs = Math.max(0, line.ts - firstLog.ts);
                const meta = formatOverlayLogMeta(line);
                const messageLineCount = getOverlayLogMessageLineCount(line);
                return (
                  <View key={line.id} className={index > 0 ? 'mt-1' : undefined}>
                    <Text numberOfLines={1} className="text-[8px] leading-3" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      {formatOverlayTime(line.ts)} +{formatOverlayDuration(deltaMs)} · {formatOverlayDuration(elapsedMs)}
                      {meta ? `  [${meta}]` : ''}
                    </Text>
                    <Text
                      numberOfLines={messageLineCount}
                      className="text-kd-micro leading-4 text-white"
                      style={{ color: getOverlayLogMessageColor(line) }}
                    >
                      {line.message}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
          {!isFlowReady ? (
            <View className="absolute inset-0 items-center justify-center bg-kd-panel/70">
              <ActivityIndicator size="small" color={theme.orange} />
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

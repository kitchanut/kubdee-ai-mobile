import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Square, X } from 'lucide-react-native';

import {
  emitGoogleFlowRunnerLog,
  registerGoogleFlowWebViewRunnerHost,
} from '@/autopilot/googleFlowRunnerBridge';
import type {
  AutoPilotStepType,
  GoogleFlowRunnerLogEntry,
  GoogleFlowRunnerPayload,
  GoogleFlowRunnerProduct,
} from '@/autopilot/types';
import FlowWebView, { type FlowConnectionState, type FlowWebViewHandle } from '@/flow/FlowWebView';
import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';

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

function promptForStep(product: GoogleFlowRunnerProduct, step: AutoPilotStepType): string {
  const prompt = product.prompts?.[step]?.trim();
  if (prompt) return prompt;

  const productName = product.name?.trim() || 'สินค้า';
  const description = product.description?.trim();
  return [productName, description].filter(Boolean).join('\n');
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
          ? { targetMode: 'image', imageModel: payload.settings.flowImageModel }
          : { targetMode: 'video', videoModel: payload.settings.flowVideoModel };
      const config = (await runActionOrThrow(handle, 'configurePopper', configArgs, 70_000)) as {
        success?: boolean;
        error?: string;
      };
      if (config.success === false) {
        emit({
          runId: payload.runId,
          status: 'running',
          message: `ตั้งค่า Flow ไม่ครบ: ${config.error ?? 'unknown'} จะทำต่อ`,
        });
      } else {
        emit({ runId: payload.runId, status: 'running', message: `ตั้งค่าโหมด${label}แล้ว` });
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
        videos.forEach((url, index) => {
          emit({
            event: 'asset',
            runId: payload.runId,
            status: 'running',
            step,
            stage: 'generated',
            productId: product.id,
            productName: product.name,
            fileUri: url,
            fileName: `google-flow-video-${Date.now()}-${index + 1}.mp4`,
            mimeType: 'video/mp4',
            createdAt: Date.now(),
            message: `ได้วิดีโอจาก Google Flow แล้ว (${index + 1}/${videos.length})`,
          });
        });
      } else {
        emit({
          event: 'progress',
          runId: payload.runId,
          status: 'running',
          step,
          stage: 'generated',
          productId: product.id,
          productName: product.name,
          currentRound: round,
          totalRounds: payload.settings.totalRounds,
          currentProduct: productIndex + 1,
          totalProducts: payload.products.length,
          message: `Flow สร้างรูปภาพแล้ว (${result.images ?? 1})`,
        });
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

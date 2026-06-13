import { useCallback, useEffect, useMemo, useState } from 'react';

import { DEFAULT_AUTO_PILOT_SETTINGS } from '@/autopilot/defaults';
import { useGeneratedMedia } from '@/autopilot/generatedMediaStore';
import {
  createGoogleFlowRunnerPayload,
  startGoogleFlowRunner,
  stopGoogleFlowRunner,
} from '@/autopilot/googleFlowRunnerBridge';
import { getAutoPilotProductId, toAutoPilotProduct } from '@/autopilot/productAdapter';
import type {
  AutoPilotImageSettings,
  AutoPilotLogLevel,
  AutoPilotProduct,
  AutoPilotProductSettings,
  AutoPilotRunState,
  AutoPilotSettings,
  AutoPilotStepType,
  AutoPilotVideoSettings,
} from '@/autopilot/types';
import type { AffiliateProduct } from '@/library/types';
import { subscribeGoogleFlowLogs } from '@/native/AccessibilityBridge';

const initialRunState: AutoPilotRunState = {
  runId: null,
  status: 'idle',
  progress: {
    currentRound: 0,
    totalRounds: 1,
    currentProduct: 0,
    totalProducts: 0,
    currentStep: null,
    currentStage: null,
    currentProductName: null,
    generatedImages: 0,
    generatedVideos: 0,
    failedImages: 0,
    failedVideos: 0,
  },
  logs: [],
};

function createRunId(): string {
  return `mobile-auto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useAutoPilotController({
  profileLocalId,
  sourceProducts,
}: {
  profileLocalId: string;
  sourceProducts: AffiliateProduct[];
}) {
  const { addGeneratedMediaAsset } = useGeneratedMedia();
  const [settings, setSettings] = useState<AutoPilotSettings>(DEFAULT_AUTO_PILOT_SETTINGS);
  const [enabledSteps, setEnabledSteps] = useState<AutoPilotStepType[]>(['image', 'video']);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [productSettingsById, setProductSettingsById] = useState<Record<string, AutoPilotProductSettings>>({});
  const [runState, setRunState] = useState<AutoPilotRunState>(initialRunState);

  const products = useMemo(
    () =>
      sourceProducts.map((sourceProduct) => {
        const product = toAutoPilotProduct(sourceProduct);
        const override = productSettingsById[product.id];
        return override ? { ...product, settings: override } : product;
      }),
    [productSettingsById, sourceProducts]
  );

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedProductIds.has(product.id)),
    [products, selectedProductIds]
  );

  const selectedImageSettings = selectedProducts[0]?.settings.image ?? products[0]?.settings.image;
  const selectedVideoSettings = selectedProducts[0]?.settings.video ?? products[0]?.settings.video;
  const productById = useMemo(() => {
    const map = new Map<string, AutoPilotProduct>();
    for (const product of products) {
      map.set(product.id, product);
      map.set(product.productId, product);
      map.set(product.catalogId, product);
    }
    return map;
  }, [products]);

  const appendLog = useCallback((level: AutoPilotLogLevel, message: string): void => {
    setRunState((current) => ({
      ...current,
      logs: [
        ...current.logs,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          level,
          message,
          timestamp: Date.now(),
        },
      ].slice(-120),
    }));
  }, []);

  useEffect(() => {
    const subscription = subscribeGoogleFlowLogs((entry) => {
      const terminalStatus =
        entry.status === 'completed' || entry.status === 'stopped' || entry.status === 'error'
          ? entry.status
          : null;
      const level =
        entry.status === 'completed'
          ? 'success'
          : entry.status === 'stopped'
            ? 'warning'
            : entry.status === 'error'
              ? 'error'
              : 'info';
      appendLog(level, entry.message);

      if (entry.event === 'progress') {
        const failedStage = entry.stage === 'failed' || entry.stage === 'download_missing';
        setRunState((current) => ({
          ...current,
          progress: {
            ...current.progress,
            currentRound: entry.currentRound ?? current.progress.currentRound,
            totalRounds: entry.totalRounds ?? current.progress.totalRounds,
            currentProduct: entry.currentProduct ?? current.progress.currentProduct,
            totalProducts: entry.totalProducts ?? current.progress.totalProducts,
            currentStep: entry.step ?? current.progress.currentStep,
            currentStage: entry.stage ?? current.progress.currentStage,
            currentProductName: entry.productName ?? current.progress.currentProductName,
            failedImages:
              failedStage && entry.step === 'image'
                ? current.progress.failedImages + 1
                : current.progress.failedImages,
            failedVideos:
              failedStage && entry.step === 'video'
                ? current.progress.failedVideos + 1
                : current.progress.failedVideos,
          },
        }));
      }

      if (entry.event === 'asset' && entry.step && (entry.fileUri || entry.fileName)) {
        const product = entry.productId ? productById.get(entry.productId) : undefined;
        const productId = entry.productId || product?.productId || product?.id || 'unknown';
        void addGeneratedMediaAsset({
          kind: entry.step === 'image' ? 'images' : 'videos',
          runId: runState.runId || 'mobile-auto',
          profileLocalId,
          productId,
          productName: entry.productName || product?.name || 'สินค้า',
          productCode: product?.productId || productId,
          fileUri: entry.fileUri,
          fileName: entry.fileName,
          mimeType: entry.mimeType,
          sizeBytes: entry.sizeBytes,
          createdAt: entry.createdAt,
        });

        setRunState((current) => ({
          ...current,
          progress: {
            ...current.progress,
            generatedImages:
              entry.step === 'image' ? current.progress.generatedImages + 1 : current.progress.generatedImages,
            generatedVideos:
              entry.step === 'video' ? current.progress.generatedVideos + 1 : current.progress.generatedVideos,
          },
        }));
      } else if (entry.event === 'asset' && entry.step) {
        appendLog('warning', `ยังไม่บันทึก${entry.step === 'image' ? 'รูปภาพ' : 'วิดีโอ'}เข้าคลัง เพราะยังไม่มีไฟล์ดาวน์โหลดจริง`);
      }

      if (terminalStatus) {
        setRunState((current) => ({
          ...current,
          status: terminalStatus,
          progress: {
            ...current.progress,
            currentStage: terminalStatus,
          },
        }));
      }
    });

    return () => {
      subscription?.remove();
    };
  }, [addGeneratedMediaAsset, appendLog, productById, profileLocalId, runState.runId]);

  const updateSetting = useCallback(
    <K extends keyof AutoPilotSettings>(key: K, value: AutoPilotSettings[K]): void => {
      setSettings((current) => ({ ...current, [key]: value }));
    },
    []
  );

  const toggleStep = useCallback((step: AutoPilotStepType): void => {
    setEnabledSteps((current) =>
      current.includes(step) ? current.filter((item) => item !== step) : [...current, step]
    );
  }, []);

  const toggleProduct = useCallback((productId: string): void => {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }, []);

  const selectAllVisibleProducts = useCallback((visibleProducts: AffiliateProduct[]): void => {
    setSelectedProductIds(new Set(visibleProducts.map(getAutoPilotProductId)));
  }, []);

  const clearProducts = useCallback((): void => {
    setSelectedProductIds(new Set());
  }, []);

  const updateSelectedImageSetting = useCallback(
    <K extends keyof AutoPilotImageSettings>(key: K, value: AutoPilotImageSettings[K]): void => {
      const targets = selectedProducts.length > 0 ? selectedProducts : products;
      setProductSettingsById((current) => {
        const next = { ...current };
        for (const product of targets) {
          next[product.id] = {
            ...product.settings,
            image: {
              ...product.settings.image,
              [key]: value,
            },
          };
        }
        return next;
      });
    },
    [products, selectedProducts]
  );

  const updateSelectedVideoSetting = useCallback(
    <K extends keyof AutoPilotVideoSettings>(key: K, value: AutoPilotVideoSettings[K]): void => {
      const targets = selectedProducts.length > 0 ? selectedProducts : products;
      setProductSettingsById((current) => {
        const next = { ...current };
        for (const product of targets) {
          next[product.id] = {
            ...product.settings,
            video: {
              ...product.settings.video,
              [key]: value,
            },
          };
        }
        return next;
      });
    },
    [products, selectedProducts]
  );

  const startRun = useCallback(async (): Promise<void> => {
    if (!profileLocalId) {
      appendLog('error', 'ยังไม่ได้เลือกโปรไฟล์');
      return;
    }

    if (enabledSteps.length === 0) {
      appendLog('error', 'ยังไม่ได้เลือกขั้นตอน');
      return;
    }

    if (selectedProducts.length === 0) {
      appendLog('error', 'ยังไม่ได้เลือกสินค้า');
      return;
    }

    const runId = createRunId();
    const payload = createGoogleFlowRunnerPayload({
      enabledSteps,
      products: selectedProducts,
      profileLocalId,
      runId,
      settings,
    });

    setRunState({
      runId,
      status: 'running',
      progress: {
        ...initialRunState.progress,
        totalRounds: settings.totalRounds,
        totalProducts: selectedProducts.length,
      },
      logs: [],
    });

    appendLog('action', `ส่งงานไป Google Flow บนมือถือ: ${selectedProducts.length} สินค้า`);
    const result = await startGoogleFlowRunner(payload);

    if (!result.success) {
      appendLog('error', result.error || 'เริ่ม Auto Pilot บนมือถือไม่สำเร็จ');
      setRunState((current) => ({ ...current, status: 'error' }));
      return;
    }

    appendLog('success', result.message || 'Google Flow runner บนมือถือรับงานแล้ว');
  }, [appendLog, enabledSteps, profileLocalId, selectedProducts, settings]);

  const stopRun = useCallback(async (): Promise<void> => {
    const runId = runState.runId;
    if (!runId) {
      return;
    }

    appendLog('warning', 'กำลังส่งคำสั่งหยุดไป Google Flow บนมือถือ');
    const result = await stopGoogleFlowRunner(runId);
    if (!result.success) {
      appendLog('error', result.error || 'หยุด Auto Pilot บนมือถือไม่สำเร็จ');
      return;
    }

    appendLog('success', result.message || 'ส่งคำสั่งหยุดแล้ว');
    setRunState((current) => ({ ...current, status: 'stopped' }));
  }, [appendLog, runState.runId]);

  return {
    appendLog,
    clearProducts,
    enabledSteps,
    products,
    runState,
    selectedProductIds,
    selectedProducts,
    selectedImageSettings,
    selectedVideoSettings,
    selectAllVisibleProducts,
    settings,
    startRun,
    stopRun,
    toggleProduct,
    toggleStep,
    updateSelectedImageSetting,
    updateSelectedVideoSetting,
    updateSetting,
  };
}

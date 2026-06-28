import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  beginAutomationActivityRun,
  clearAutomationActivityRun,
  pushAutomationActivityLog,
  setAutomationActivityRunning,
  setAutomationActivityStopping,
} from '@/activity/automationActivityLogStore';
import {
  DEFAULT_AUTO_PILOT_SETTINGS,
  AUTO_PILOT_INFINITE_ROUNDS,
  FLOW_IMAGE_MODELS,
  FLOW_VIDEO_MODELS,
} from '@/autopilot/defaults';
import { useGeneratedMedia } from '@/autopilot/generatedMediaStore';
import {
  createGoogleFlowRunnerPayload,
  startGoogleFlowRunner,
  stopGoogleFlowRunner,
  subscribeGoogleFlowRunnerLogs,
} from '@/autopilot/googleFlowRunnerBridge';
import {
  generateAutoPilotProductContent,
  getAutoPilotAiContentLabels,
} from '@/autopilot/aiCaption';
import { loadPromptCatalog } from '@/autopilot/promptCatalog/api';
import {
  getAutoPilotProductId,
  normalizeAutoPilotProductSettings,
  toAutoPilotProduct,
} from '@/autopilot/productAdapter';
import type {
  AutoPilotImageSettings,
  AutoPilotLogLevel,
  AutoPilotFlowStats,
  AutoPilotProduct,
  AutoPilotProductSettings,
  AutoPilotRunState,
  AutoPilotSettings,
  AutoPilotStepType,
  AutoPilotVideoSettings,
} from '@/autopilot/types';
import type { AffiliateProduct } from '@/library/types';

type AutoPilotProductEditableField = 'name' | 'productId' | 'productUrl' | 'caption' | 'hashtags' | 'cta';

const AUTO_PILOT_RUNTIME_SETTINGS_KEY = 'kubdee_ai_mobile_auto_runtime_settings_v1';
const DEFAULT_ENABLED_STEPS: AutoPilotStepType[] = ['image', 'video'];
const VALID_FLOW_IMAGE_MODELS = new Set<string>(FLOW_IMAGE_MODELS.map((model) => model.value));
const VALID_FLOW_VIDEO_MODELS = new Set<string>(FLOW_VIDEO_MODELS.map((model) => model.value));

const initialRunState: AutoPilotRunState = {
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

function createRunId(): string {
  return `mobile-auto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createManualSourceProduct(profileLocalId: string, localId: string): AffiliateProduct {
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

function normalizeRuntimeSettings(value: unknown): AutoPilotSettings {
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

function normalizeEnabledSteps(value: unknown): AutoPilotStepType[] {
  if (!Array.isArray(value)) {
    return DEFAULT_ENABLED_STEPS;
  }

  const steps = value.filter((step): step is AutoPilotStepType => step === 'image' || step === 'video');
  return steps.length > 0 ? Array.from(new Set(steps)) : DEFAULT_ENABLED_STEPS;
}

function clampAutoSceneCount(value?: string | number | null): number {
  const parsed = Number.parseInt(String(value ?? '1'), 10);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(5, Math.max(1, parsed));
}

function outputCountForStep(product: AutoPilotProduct, step: AutoPilotStepType): number {
  const raw = product.settings[step]?.outputCount;
  const parsed = Number.parseInt(String(raw ?? '1'), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function isAutoMultiSceneVideo(videoSettings: AutoPilotVideoSettings): boolean {
  return (videoSettings.videoMethod || 'extend') === 'multi' && clampAutoSceneCount(videoSettings.sceneCount) > 1;
}

function getAutoMultiSceneImageCount(product: AutoPilotProduct, enabledSteps: AutoPilotStepType[]): number {
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

function getAutoVideoResultCount(product: AutoPilotProduct): number {
  if (isAutoMultiSceneVideo(product.settings.video)) {
    return 1;
  }
  return outputCountForStep(product, 'video');
}

function getPlannedAutoTotals(
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

export function useAutoPilotController({
  initialSelectedProductIds = [],
  profileLocalId,
  sourceProducts,
}: {
  initialSelectedProductIds?: string[];
  profileLocalId: string;
  sourceProducts: AffiliateProduct[];
}) {
  const { addGeneratedMediaAsset } = useGeneratedMedia();
  const [settings, setSettings] = useState<AutoPilotSettings>(DEFAULT_AUTO_PILOT_SETTINGS);
  const [enabledSteps, setEnabledSteps] = useState<AutoPilotStepType[]>(DEFAULT_ENABLED_STEPS);
  const [manualProducts, setManualProducts] = useState<AffiliateProduct[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(
    () => new Set(initialSelectedProductIds)
  );
  const [productFieldsById, setProductFieldsById] = useState<
    Record<string, Partial<Pick<AutoPilotProduct, AutoPilotProductEditableField>>>
  >({});
  const [productSettingsById, setProductSettingsById] = useState<Record<string, AutoPilotProductSettings>>({});
  const [runState, setRunState] = useState<AutoPilotRunState>(initialRunState);
  const runIdRef = useRef<string | null>(null);
  const preparedProductByKeyRef = useRef<Map<string, AutoPilotProduct>>(new Map());
  const runtimeSettingsLoadedRef = useRef(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(AUTO_PILOT_RUNTIME_SETTINGS_KEY)
      .then((raw) => {
        if (!active || !raw) {
          return;
        }
        const parsed = JSON.parse(raw) as { settings?: unknown; enabledSteps?: unknown };
        setSettings(normalizeRuntimeSettings(parsed.settings));
        setEnabledSteps(normalizeEnabledSteps(parsed.enabledSteps));
      })
      .catch(() => {
        // Keep defaults when the saved runtime settings are unavailable or malformed.
      })
      .finally(() => {
        if (active) {
          runtimeSettingsLoadedRef.current = true;
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!runtimeSettingsLoadedRef.current) {
      return;
    }

    void AsyncStorage.setItem(
      AUTO_PILOT_RUNTIME_SETTINGS_KEY,
      JSON.stringify({
        settings,
        enabledSteps,
        updatedAt: Date.now(),
      })
    );
  }, [enabledSteps, settings]);

  const products = useMemo(
    () =>
      [...sourceProducts, ...manualProducts].map((sourceProduct) => {
        const product = toAutoPilotProduct(sourceProduct);
        const fieldOverride = productFieldsById[product.id];
        const override = productSettingsById[product.id];
        return {
          ...product,
          ...fieldOverride,
          settings: override ? normalizeAutoPilotProductSettings(override) : product.settings,
        };
      }),
    [manualProducts, productFieldsById, productSettingsById, sourceProducts]
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

  const appendLog = useCallback((
    level: AutoPilotLogLevel,
    message: string,
    options?: { timestamp?: number; flowStats?: AutoPilotFlowStats }
  ): void => {
    const timestamp = options?.timestamp ?? Date.now();
    setRunState((current) => ({
      ...current,
      logs: [
        ...current.logs,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          level,
          message,
          timestamp,
          flowStats: options?.flowStats,
        },
      ].slice(-120),
    }));
    pushAutomationActivityLog('auto-pilot', message, timestamp);
  }, []);

  useEffect(() => {
    runIdRef.current = runState.runId;
  }, [runState.runId]);

  useEffect(() => {
    const subscription = subscribeGoogleFlowRunnerLogs((entry) => {
      const incomingRunId = entry.runId?.trim();
      const activeRunId = runIdRef.current;
      if (incomingRunId && activeRunId && incomingRunId !== activeRunId) {
        return;
      }

      const terminalStatus =
        entry.status === 'completed' || entry.status === 'stopped' || entry.status === 'error'
          ? entry.status
          : null;
      const level =
        entry.level ??
        (entry.status === 'completed'
          ? 'success'
          : entry.status === 'stopped'
            ? 'warning'
            : entry.status === 'error'
              ? 'error'
              : 'info');
      appendLog(level, entry.message, { timestamp: entry.ts, flowStats: entry.flowStats });

      if (entry.event === 'progress') {
        const failedStage = entry.stage === 'failed' || entry.stage === 'download_missing';
        const generatedStage = entry.stage === 'generated';
        const shouldClearStep =
          entry.stage === 'started' ||
          entry.stage === 'round_started' ||
          entry.stage === 'product_started';
        const currentStepIndex = entry.step ? Math.max(1, enabledSteps.indexOf(entry.step) + 1) : null;
        setRunState((current) => ({
          ...current,
          progress: {
            ...current.progress,
            currentRound: entry.currentRound ?? current.progress.currentRound,
            totalRounds: entry.totalRounds ?? current.progress.totalRounds,
            currentProduct: entry.currentProduct ?? current.progress.currentProduct,
            totalProducts: entry.totalProducts ?? current.progress.totalProducts,
            currentStep: entry.step ?? (shouldClearStep ? null : current.progress.currentStep),
            currentStepIndex: currentStepIndex ?? (shouldClearStep ? 0 : current.progress.currentStepIndex),
            totalSteps: enabledSteps.length || current.progress.totalSteps,
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
            generatedImages:
              generatedStage && entry.step === 'image'
                ? current.progress.generatedImages + 1
                : current.progress.generatedImages,
            generatedVideos:
              generatedStage && entry.step === 'video'
                ? current.progress.generatedVideos + 1
                : current.progress.generatedVideos,
          },
        }));
      }

      if (entry.event === 'asset' && entry.step && (entry.fileUri || entry.fileName)) {
        const assetStep = entry.step;
        const preparedProduct = entry.productId ? preparedProductByKeyRef.current.get(entry.productId) : undefined;
        const product = preparedProduct ?? (entry.productId ? productById.get(entry.productId) : undefined);
        const productId = entry.productId || product?.productId || product?.id || 'unknown';
        const currentStepIndex = Math.max(1, enabledSteps.indexOf(assetStep) + 1);
        void addGeneratedMediaAsset({
          kind: assetStep === 'image' ? 'images' : 'videos',
          runId: incomingRunId || activeRunId || 'mobile-auto',
          profileLocalId,
          productId,
          productName: entry.productName || product?.name || 'สินค้า',
          productCode: product?.productId || productId,
          productUrl: product?.productUrl || null,
          caption: product?.caption || null,
          hashtags: product?.hashtags || null,
          platform: product?.platform || null,
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
            currentRound: entry.currentRound ?? current.progress.currentRound,
            totalRounds: entry.totalRounds ?? current.progress.totalRounds,
            currentProduct: entry.currentProduct ?? current.progress.currentProduct,
            totalProducts: entry.totalProducts ?? current.progress.totalProducts,
            currentStep: assetStep,
            currentStepIndex,
            totalSteps: enabledSteps.length || current.progress.totalSteps,
            currentStage: entry.stage ?? 'generated',
            currentProductName: entry.productName || product?.name || current.progress.currentProductName,
            generatedImages:
              assetStep === 'image' ? current.progress.generatedImages + 1 : current.progress.generatedImages,
            generatedVideos:
              assetStep === 'video' ? current.progress.generatedVideos + 1 : current.progress.generatedVideos,
          },
        }));
      } else if (entry.event === 'asset' && entry.step) {
        appendLog('warning', `ยังไม่บันทึก${entry.step === 'image' ? 'รูปภาพ' : 'วิดีโอ'}เข้าคลัง เพราะยังไม่มีไฟล์ดาวน์โหลดจริง`);
      }

      if (terminalStatus) {
        setAutomationActivityRunning('auto-pilot', false);
        setAutomationActivityStopping('auto-pilot', false);
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
  }, [addGeneratedMediaAsset, appendLog, enabledSteps, productById, profileLocalId]);

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

  const addManualProduct = useCallback((): void => {
    const localId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const product = createManualSourceProduct(profileLocalId, localId);

    setManualProducts((current) => [...current, product]);
    setProductFieldsById((current) => ({
      ...current,
      [localId]: {
        caption: '',
        cta: '',
        hashtags: '',
        name: '',
        productId: '',
        productUrl: '',
      },
    }));
    setSelectedProductIds((current) => {
      const next = new Set(current);
      next.add(localId);
      return next;
    });
  }, [profileLocalId]);

  const updateProductField = useCallback(
    (productId: string, field: AutoPilotProductEditableField, value: string): void => {
      setProductFieldsById((current) => ({
        ...current,
        [productId]: {
          ...current[productId],
          [field]: value,
        },
      }));
    },
    []
  );

  const selectAllVisibleProducts = useCallback((visibleProducts: AffiliateProduct[]): void => {
    setSelectedProductIds(new Set(visibleProducts.map(getAutoPilotProductId)));
  }, []);

  const replaceSelectedProductIds = useCallback((productIds: string[]): void => {
    setSelectedProductIds(new Set(productIds.filter(Boolean)));
  }, []);

  const setSelectedProductsFromCatalog = useCallback(
    (productIds: string[]): void => {
      const availableProductIds = new Set(products.map((product) => product.id));
      setSelectedProductIds(new Set(productIds.filter((productId) => availableProductIds.has(productId))));
    },
    [products]
  );

  const loadProductPreset = useCallback(
    (productIds: string[], settingsByProductId: Record<string, AutoPilotProductSettings>): void => {
      const availableProductIds = new Set(products.map((product) => product.id));
      const nextSelectedProductIds = productIds.filter((productId) => availableProductIds.has(productId));

      setSelectedProductIds(new Set(nextSelectedProductIds));
      setProductSettingsById((current) => {
        const next = { ...current };
        for (const productId of nextSelectedProductIds) {
          const settings = settingsByProductId[productId];
          if (settings) {
            next[productId] = {
              image: { ...settings.image },
              video: { ...settings.video },
            };
          }
        }
        return next;
      });
    },
    [products]
  );

  const clearProducts = useCallback((): void => {
    setManualProducts([]);
    setSelectedProductIds(new Set());
    setProductFieldsById((current) => {
      const next = { ...current };
      for (const productId of Object.keys(next)) {
        if (productId.startsWith('manual-')) {
          delete next[productId];
        }
      }
      return next;
    });
  }, []);

  const clearLogs = useCallback((): void => {
    setRunState((current) => ({
      ...current,
      logs: [],
    }));
    clearAutomationActivityRun('auto-pilot');
  }, []);

  const updateSelectedImageSetting = useCallback(
    <K extends keyof AutoPilotImageSettings>(key: K, value: AutoPilotImageSettings[K]): void => {
      const targets = selectedProducts.length > 0 ? selectedProducts : products;
      setProductSettingsById((current) => {
        const next = { ...current };
        for (const product of targets) {
          const baseSettings = current[product.id] ?? product.settings;
          next[product.id] = {
            ...baseSettings,
            image: {
              ...baseSettings.image,
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
          const baseSettings = current[product.id] ?? product.settings;
          next[product.id] = {
            ...baseSettings,
            video: {
              ...baseSettings.video,
              [key]: value,
            },
          };
        }
        return next;
      });
    },
    [products, selectedProducts]
  );

  const updateProductImageSetting = useCallback(
    <K extends keyof AutoPilotImageSettings>(productId: string, key: K, value: AutoPilotImageSettings[K]): void => {
      const product = products.find((item) => item.id === productId);
      if (!product) {
        return;
      }

      setProductSettingsById((current) => ({
        ...current,
        [product.id]: {
          ...(current[product.id] ?? product.settings),
          image: {
            ...(current[product.id]?.image ?? product.settings.image),
            [key]: value,
          },
        },
      }));
    },
    [products]
  );

  const updateProductVideoSetting = useCallback(
    <K extends keyof AutoPilotVideoSettings>(productId: string, key: K, value: AutoPilotVideoSettings[K]): void => {
      const product = products.find((item) => item.id === productId);
      if (!product) {
        return;
      }

      setProductSettingsById((current) => ({
        ...current,
        [product.id]: {
          ...(current[product.id] ?? product.settings),
          video: {
            ...(current[product.id]?.video ?? product.settings.video),
            [key]: value,
          },
        },
      }));
    },
    [products]
  );

  const replaceProductSettings = useCallback(
    (productId: string, nextSettings: AutoPilotProductSettings): void => {
      const product = products.find((item) => item.id === productId);
      if (!product) {
        return;
      }

      setProductSettingsById((current) => ({
        ...current,
        [product.id]: {
          ...normalizeAutoPilotProductSettings(nextSettings),
        },
      }));
    },
    [products]
  );

  const applyProductSettingsToAll = useCallback(
    (sourceProductId: string): void => {
      const sourceProduct = products.find((product) => product.id === sourceProductId);
      if (!sourceProduct) {
        return;
      }

      const targets = selectedProducts.length > 0 ? selectedProducts : products;
      setProductSettingsById((current) => {
        const next = { ...current };
        for (const product of targets) {
          next[product.id] = {
            image: { ...sourceProduct.settings.image },
            video: { ...sourceProduct.settings.video },
          };
        }
        return next;
      });
    },
    [products, selectedProducts]
  );

  const applyProductImageSectionToAll = useCallback(
    (sourceProductId: string, keys: Array<keyof AutoPilotImageSettings>): void => {
      const sourceProduct = products.find((product) => product.id === sourceProductId);
      if (!sourceProduct) {
        return;
      }

      const targets = selectedProducts.length > 0 ? selectedProducts : products;
      setProductSettingsById((current) => {
        const next = { ...current };
        const imageUpdates = keys.reduce<Partial<AutoPilotImageSettings>>((updates, key) => ({
          ...updates,
          [key]: sourceProduct.settings.image[key],
        }), {});
        for (const product of targets) {
          next[product.id] = {
            ...product.settings,
            image: {
              ...product.settings.image,
              ...imageUpdates,
            },
          };
        }
        return next;
      });
    },
    [products, selectedProducts]
  );

  const applyProductVideoSectionToAll = useCallback(
    (sourceProductId: string, keys: Array<keyof AutoPilotVideoSettings>): void => {
      const sourceProduct = products.find((product) => product.id === sourceProductId);
      if (!sourceProduct) {
        return;
      }

      const targets = selectedProducts.length > 0 ? selectedProducts : products;
      setProductSettingsById((current) => {
        const next = { ...current };
        const videoUpdates = keys.reduce<Partial<AutoPilotVideoSettings>>((updates, key) => ({
          ...updates,
          [key]: sourceProduct.settings.video[key],
        }), {});
        for (const product of targets) {
          next[product.id] = {
            ...product.settings,
            video: {
              ...product.settings.video,
              ...videoUpdates,
            },
          };
        }
        return next;
      });
    },
    [products, selectedProducts]
  );

  const resetProductSettings = useCallback((productId: string): void => {
    setProductSettingsById((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
  }, []);

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

    const catalogResult = await loadPromptCatalog();
    if (!catalogResult.catalog) {
      appendLog('error', 'โหลดชุด prompt ไม่สำเร็จ');
      return;
    }

    const runId = createRunId();
    runIdRef.current = runId;
    beginAutomationActivityRun('auto-pilot', `Auto Workflow · ${selectedProducts.length} สินค้า`);
    const plannedTotals = getPlannedAutoTotals(selectedProducts, enabledSteps, settings.totalRounds);

    setRunState({
      runId,
      status: 'running',
      progress: {
        ...initialRunState.progress,
        totalRounds: settings.totalRounds,
        totalProducts: selectedProducts.length,
        totalSteps: enabledSteps.length,
        ...plannedTotals,
      },
      logs: [],
    });

    const catalogSourceLabel =
      catalogResult.source === 'remote'
        ? 'เว็บ'
        : catalogResult.source === 'cache'
          ? 'cache'
          : 'fallback ในแอป';
    appendLog('info', `ใช้ชุด prompt จาก${catalogSourceLabel} v${catalogResult.version ?? '-'}`);

    const aiContentLabels = getAutoPilotAiContentLabels(settings);
    let preparedProducts = selectedProducts;
    if (aiContentLabels) {
      appendLog('action', `AI กำลังคิด ${aiContentLabels} สำหรับ ${selectedProducts.length} สินค้า...`);
      const preparedResults = await Promise.all(
        selectedProducts.map(async (product) => {
          const result = await generateAutoPilotProductContent({ product, settings });
          if (!result.success) {
            appendLog(
              'warning',
              `AI ${aiContentLabels} ไม่สำเร็จ (${product.name || 'สินค้า'}): ${result.error || 'unknown'} — ใช้ค่าเดิม`
            );
            return {
              product,
              updates: {} as Partial<Pick<AutoPilotProduct, 'caption' | 'hashtags' | 'cta'>>,
            };
          }

          const updates: Partial<Pick<AutoPilotProduct, 'caption' | 'hashtags' | 'cta'>> = {};
          if (settings.aiGenerateCaption && result.caption) {
            updates.caption = result.caption;
          }
          if (settings.aiGenerateHashtags && result.hashtags) {
            updates.hashtags = result.hashtags;
          }
          if (settings.aiGenerateCta && result.cta) {
            updates.cta = result.cta;
          }
          appendLog('success', `AI ${aiContentLabels} สำเร็จ: ${product.name || 'สินค้า'}`);
          if (updates.caption) {
            appendLog('info', `AI Caption: ${updates.caption.slice(0, 120)}`);
          }
          if (updates.hashtags) {
            appendLog('info', `AI Hashtags: ${updates.hashtags}`);
          }
          if (updates.cta) {
            appendLog('info', `AI CTA: ${updates.cta}`);
          }
          return { product, updates };
        })
      );

      preparedProducts = preparedResults.map(({ product, updates }) => ({ ...product, ...updates }));
      const fieldUpdates = preparedResults.reduce<
        Record<string, Partial<Pick<AutoPilotProduct, 'caption' | 'hashtags' | 'cta'>>>
      >((acc, { product, updates }) => {
        if (Object.keys(updates).length > 0) {
          acc[product.id] = updates;
        }
        return acc;
      }, {});

      if (Object.keys(fieldUpdates).length > 0) {
        setProductFieldsById((current) => {
          const next = { ...current };
          for (const [productId, updates] of Object.entries(fieldUpdates)) {
            next[productId] = {
              ...next[productId],
              ...updates,
            };
          }
          return next;
        });
      }
    }

    const payload = createGoogleFlowRunnerPayload({
      enabledSteps,
      promptCatalog: catalogResult.catalog,
      promptCatalogSource: catalogResult.source,
      promptCatalogVersion: catalogResult.version,
      products: preparedProducts,
      profileLocalId,
      runId,
      settings,
    });
    preparedProductByKeyRef.current = new Map();
    for (const product of preparedProducts) {
      for (const key of [product.id, product.productId, product.catalogId]) {
        if (key) {
          preparedProductByKeyRef.current.set(key, product);
        }
      }
    }

    appendLog('action', `ส่งงานไป Google Flow WebView: ${preparedProducts.length} สินค้า`);
    const result = await startGoogleFlowRunner(payload);

    if (!result.success) {
      appendLog('error', result.error || 'เริ่ม Auto Pilot บนมือถือไม่สำเร็จ');
      setRunState((current) => ({ ...current, status: 'error' }));
      setAutomationActivityRunning('auto-pilot', false);
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
    setAutomationActivityStopping('auto-pilot', true);
    const result = await stopGoogleFlowRunner(runId);
    if (!result.success) {
      appendLog('error', result.error || 'หยุด Auto Pilot บนมือถือไม่สำเร็จ');
      setAutomationActivityStopping('auto-pilot', false);
      return;
    }

    appendLog('success', result.message || 'ส่งคำสั่งหยุดแล้ว');
    setAutomationActivityRunning('auto-pilot', false);
    setAutomationActivityStopping('auto-pilot', false);
    setRunState((current) => ({ ...current, status: 'stopped' }));
  }, [appendLog, runState.runId]);

  return {
    appendLog,
    addManualProduct,
    clearLogs,
    clearProducts,
    enabledSteps,
    products,
    runState,
    selectedProductIds,
    selectedProducts,
    selectedImageSettings,
    selectedVideoSettings,
    loadProductPreset,
    selectAllVisibleProducts,
    setSelectedProductsFromCatalog,
    settings,
    startRun,
    stopRun,
    toggleProduct,
    toggleStep,
    updateProductField,
    applyProductImageSectionToAll,
    applyProductSettingsToAll,
    applyProductVideoSectionToAll,
    resetProductSettings,
    replaceProductSettings,
    replaceSelectedProductIds,
    updateProductImageSetting,
    updateProductVideoSetting,
    updateSelectedImageSetting,
    updateSelectedVideoSetting,
    updateSetting,
  };
}

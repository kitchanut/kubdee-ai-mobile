import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sparkles, Square } from 'lucide-react-native';

import {
  clearAutomationActivityRun,
  useAutomationActivitySnapshot,
  type AutomationActivityLogEntry,
  type AutomationActivityRun,
} from '@/activity/automationActivityLogStore';
import {
  getAutoPilotProductPresets,
  saveAutoPilotProductPreset,
  type AutoPilotProductPreset,
} from '@/autopilot/productPresetStore';
import {
  getAutoPilotSettingsPresets,
  saveAutoPilotSettingsPreset,
  type AutoPilotSettingsPreset,
} from '@/autopilot/settingsPresetStore';
import { useAutoPilotController } from '@/autopilot/useAutoPilotController';
import type { AutoPilotProductSelectionRequest } from '@/autopilot/selectionRequest';
import type { AutoPilotLogLevel, AutoPilotProductSettings, AutoPilotRunState } from '@/autopilot/types';
import Text from '@/components/ui/KubdeeText';
import { Button } from '@/components/ui/button';
import type { KubdeeTheme } from '@/theme/tokens';
import { useLibrary } from '@/library/LibraryContext';
import { ProductSettingsModal } from './autopilot/ProductSettingsModal';
import type { ProductSettingsTab } from './autopilot/constants';
import { ExtensionBasicSettingsBlock } from './autopilot/blocks/SettingsBlocks';
import { PipelineStepsBlock } from './autopilot/blocks/PipelineStepsBlock';
import { ActivityLogSheet, RunStatusSummaryBlock } from './autopilot/blocks/RunStatus';
import { ProductCatalogBlock } from './autopilot/blocks/ProductCatalog';
import {
  ProductPresetSheet,
  ProductSelectSheet,
  SettingsPresetSheet,
} from './autopilot/blocks/ProductSheets';

interface AutoPilotScreenProps {
  initialSelectedProductIds?: string[];
  onSelectedProductIdsChange?: (productIds: string[], profileLocalId: string) => void;
  selectedProfileId: string;
  selectionRequest?: AutoPilotProductSelectionRequest | null;
  theme: KubdeeTheme;
  onSelectionRequestHandled?: (requestId: number) => void;
}

export default function AutoPilotScreen({
  initialSelectedProductIds = [],
  onSelectedProductIdsChange,
  selectedProfileId,
  selectionRequest,
  theme,
  onSelectionRequestHandled,
}: AutoPilotScreenProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { products: allProducts, isSyncing, syncProducts } = useLibrary();
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productSelectSheetOpen, setProductSelectSheetOpen] = useState(false);
  const [productSettingsTab, setProductSettingsTab] = useState<ProductSettingsTab>('image');
  const [productPresetSheetOpen, setProductPresetSheetOpen] = useState(false);
  const [productPresetMode, setProductPresetMode] = useState<'save' | 'load'>('load');
  const [productPresetName, setProductPresetName] = useState('');
  const [productPresetMessage, setProductPresetMessage] = useState<string | null>(null);
  const [productPresets, setProductPresets] = useState<AutoPilotProductPreset[]>([]);
  const [settingsPresetSheetOpen, setSettingsPresetSheetOpen] = useState(false);
  const [settingsPresetMode, setSettingsPresetMode] = useState<'save' | 'load'>('load');
  const [settingsPresetName, setSettingsPresetName] = useState('');
  const [settingsPresetMessage, setSettingsPresetMessage] = useState<string | null>(null);
  const [settingsPresets, setSettingsPresets] = useState<AutoPilotSettingsPreset[]>([]);
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const activitySnapshot = useAutomationActivitySnapshot();

  const profileProducts = useMemo(() => {
    if (!selectedProfileId) {
      return allProducts;
    }

    return allProducts.filter((product) => product.profileLocalId === selectedProfileId);
  }, [allProducts, selectedProfileId]);

  const controller = useAutoPilotController({
    initialSelectedProductIds,
    profileLocalId: selectedProfileId,
    sourceProducts: profileProducts,
  });
  const replaceSelectedProductIds = controller.replaceSelectedProductIds;
  const initialSelectedProductIdsKey = initialSelectedProductIds.join('\u0000');
  const selectedProductIds = useMemo(
    () => Array.from(controller.selectedProductIds),
    [controller.selectedProductIds]
  );
  const selectedProductIdsKey = selectedProductIds.join('\u0000');

  useEffect(() => {
    replaceSelectedProductIds(initialSelectedProductIds);
  }, [initialSelectedProductIdsKey, replaceSelectedProductIds, selectedProfileId]);

  useEffect(() => {
    onSelectedProductIdsChange?.(selectedProductIds, selectedProfileId);
  }, [
    onSelectedProductIdsChange,
    selectedProductIds,
    selectedProductIdsKey,
    selectedProfileId,
  ]);

  useEffect(() => {
    if (!selectionRequest) {
      return;
    }

    if (selectionRequest.profileLocalId && selectionRequest.profileLocalId !== selectedProfileId) {
      return;
    }

    replaceSelectedProductIds(selectionRequest.productIds);
    onSelectionRequestHandled?.(selectionRequest.requestId);
  }, [
    onSelectionRequestHandled,
    replaceSelectedProductIds,
    selectedProfileId,
    selectionRequest,
  ]);

  const editingProduct = editingProductId
    ? controller.products.find((product) => product.id === editingProductId)
    : null;
  const isRunning = controller.runState.status === 'running';
  const isPreparingRun = controller.isStartingRun;
  const persistedAutoRun = activitySnapshot.runs['auto-pilot'];
  const persistedRunState = useMemo(
    () => createRunStateFromActivityRun(persistedAutoRun),
    [persistedAutoRun]
  );
  const displayRunState =
    controller.runState.logs.length > 0 || isRunning
      ? controller.runState
      : persistedRunState;
  const showingPersistedRunState = displayRunState !== controller.runState;
  const showRunStatus = isRunning || displayRunState.logs.length > 0;
  const canStart =
    !isRunning &&
    !isPreparingRun &&
    selectedProfileId.length > 0 &&
    controller.selectedProducts.length > 0 &&
    controller.enabledSteps.length > 0;
  // ยังไม่ได้เลือกสินค้าจากคลัง → ซ่อนปุ่มเริ่มสร้าง (แต่ตอนกำลังรันยังต้องเห็นปุ่มหยุด)
  const showStartBar = controller.selectedProducts.length > 0 || isRunning || isPreparingRun;
  const startButtonBottomPadding = Platform.OS === 'ios' ? Math.max(insets.bottom, 10) : 8;
  // bottom bar = pt-3 (12) + start button (50) + bottom padding, plus breathing room
  const startButtonScrollPadding = showStartBar
    ? 12 + 50 + startButtonBottomPadding + 16
    : startButtonBottomPadding + 16;

  const openProductSettings = (productId: string): void => {
    setEditingProductId(productId);
    setProductSettingsTab(controller.enabledSteps.includes('image') ? 'image' : 'video');
  };

  const refreshProductPresets = useCallback(async (): Promise<void> => {
    if (!selectedProfileId) {
      setProductPresets([]);
      return;
    }

    const presets = await getAutoPilotProductPresets(selectedProfileId);
    setProductPresets(presets);
  }, [selectedProfileId]);

  useEffect(() => {
    if (!productPresetSheetOpen) {
      return;
    }

    void refreshProductPresets();
  }, [productPresetSheetOpen, refreshProductPresets]);

  const openProductPresetSheet = (): void => {
    setProductPresetMode(controller.selectedProducts.length > 0 ? 'save' : 'load');
    setProductPresetMessage(null);
    setProductPresetSheetOpen(true);
  };

  const saveSelectedProductPreset = useCallback(async (): Promise<void> => {
    const name = productPresetName.trim();
    if (!selectedProfileId || !name || controller.selectedProducts.length === 0) {
      return;
    }

    const settingsByProductId = controller.selectedProducts.reduce<Record<string, AutoPilotProductSettings>>(
      (next, product) => ({
        ...next,
        [product.id]: {
          image: { ...product.settings.image },
          video: { ...product.settings.video },
        },
      }),
      {}
    );

    await saveAutoPilotProductPreset({
      name,
      profileLocalId: selectedProfileId,
      productIds: controller.selectedProducts.map((product) => product.id),
      settingsByProductId,
    });
    setProductPresetName('');
    setProductPresetMode('load');
    setProductPresetMessage('บันทึก preset แล้ว');
    await refreshProductPresets();
  }, [controller.selectedProducts, productPresetName, refreshProductPresets, selectedProfileId]);

  const loadSelectedProductPreset = (preset: AutoPilotProductPreset): void => {
    controller.loadProductPreset(preset.productIds, preset.settingsByProductId);
    setProductPresetMessage('โหลด preset แล้ว');
    setProductPresetSheetOpen(false);
  };

  const refreshSettingsPresets = useCallback(async (): Promise<void> => {
    const presets = await getAutoPilotSettingsPresets();
    setSettingsPresets(presets);
  }, []);

  useEffect(() => {
    if (!settingsPresetSheetOpen) {
      return;
    }

    void refreshSettingsPresets();
  }, [refreshSettingsPresets, settingsPresetSheetOpen]);

  const openSettingsPresetSheet = (mode: 'save' | 'load'): void => {
    setSettingsPresetMode(mode);
    setSettingsPresetMessage(null);
    setSettingsPresetSheetOpen(true);
  };

  const saveCurrentSettingsPreset = useCallback(async (): Promise<void> => {
    const name = settingsPresetName.trim();
    if (!editingProduct || !name) {
      return;
    }

    await saveAutoPilotSettingsPreset({
      name,
      imageSettings: editingProduct.settings.image,
      videoSettings: editingProduct.settings.video,
    });
    setSettingsPresetName('');
    setSettingsPresetMode('load');
    setSettingsPresetMessage('บันทึก preset ตั้งค่าแล้ว');
    await refreshSettingsPresets();
  }, [editingProduct, refreshSettingsPresets, settingsPresetName]);

  const loadSettingsPreset = (preset: AutoPilotSettingsPreset): void => {
    if (!editingProduct) {
      return;
    }

    controller.replaceProductSettings(editingProduct.id, {
      image: preset.imageSettings,
      video: preset.videoSettings,
    });
    setSettingsPresetMessage('โหลด preset ตั้งค่าแล้ว');
    setSettingsPresetSheetOpen(false);
  };

  return (
    <View className="flex-1 bg-kd-panel">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-4 pt-4"
        contentContainerStyle={{ paddingBottom: startButtonScrollPadding }}
      >
        <View className="gap-4">
          <ExtensionBasicSettingsBlock
            settings={controller.settings}
            theme={theme}
            onDelayChange={(value) => controller.updateSetting('delayPreset', value as typeof controller.settings.delayPreset)}
            onHashtagCountChange={(value) => controller.updateSetting('aiHashtagCount', value)}
            onRoundChange={(value) => controller.updateSetting('totalRounds', Number(value))}
            onToggleCaption={(value) => controller.updateSetting('aiGenerateCaption', value)}
            onToggleCta={(value) => controller.updateSetting('aiGenerateCta', value)}
            onToggleHashtags={(value) => controller.updateSetting('aiGenerateHashtags', value)}
            onToggleRewrite={(value) => controller.updateSetting('aiRewritePromptOnAudioFailure', value)}
            onToggleDeleteLatestProject={(value) => controller.updateSetting('deleteLatestFlowProjectBeforeNewProject', value)}
            onToggleStartNewProject={(value) => controller.updateSetting('startNewFlowProjectPerProduct', value)}
            onToggleSendImage={(value) => controller.updateSetting('aiSendImageToAi', value)}
          />

          <PipelineStepsBlock
            enabledSteps={controller.enabledSteps}
            theme={theme}
            onToggle={(value) => controller.toggleStep(value)}
          />

          {showRunStatus ? (
            <RunStatusSummaryBlock
              runState={displayRunState}
              theme={theme}
              onOpenLogs={() => setActivityLogOpen(true)}
            />
          ) : null}

          <ProductCatalogBlock
            isSyncing={isSyncing}
            profileProducts={profileProducts}
            selectedProducts={controller.selectedProducts}
            theme={theme}
            onAddManualProduct={controller.addManualProduct}
            onClearProducts={controller.clearProducts}
            onOpenSettings={openProductSettings}
            onOpenPreset={openProductPresetSheet}
            onOpenProductSelect={() => setProductSelectSheetOpen(true)}
            onRemoveProduct={(productId) => controller.toggleProduct(productId)}
            onSyncProducts={() => {
              void syncProducts();
            }}
            onUpdateProductField={controller.updateProductField}
          />
        </View>
      </ScrollView>

      {productSelectSheetOpen ? (
        <ProductSelectSheet
          bottomInset={insets.bottom}
          topInset={insets.top}
          products={profileProducts}
          selectedProductIds={controller.selectedProductIds}
          theme={theme}
          onClose={() => setProductSelectSheetOpen(false)}
          onConfirm={(productIds) => {
            controller.setSelectedProductsFromCatalog(productIds);
            setProductSelectSheetOpen(false);
          }}
        />
      ) : null}

      {editingProduct ? (
        <ProductSettingsModal
          bottomInset={insets.bottom}
          enabledSteps={controller.enabledSteps}
          profileLocalId={selectedProfileId}
          product={editingProduct}
          selectedProductCount={controller.selectedProducts.length}
          tab={productSettingsTab}
          theme={theme}
          onApplyAll={() => controller.applyProductSettingsToAll(editingProduct.id)}
          onApplyImageSection={(keys) => controller.applyProductImageSectionToAll(editingProduct.id, keys)}
          onApplyVideoSection={(keys) => controller.applyProductVideoSectionToAll(editingProduct.id, keys)}
          onClose={() => setEditingProductId(null)}
          onImageChange={(key, value) => controller.updateProductImageSetting(editingProduct.id, key, value)}
          onOpenSettingsPreset={openSettingsPresetSheet}
          onReset={() => controller.resetProductSettings(editingProduct.id)}
          onTabChange={setProductSettingsTab}
          onVideoChange={(key, value) => controller.updateProductVideoSetting(editingProduct.id, key, value)}
        />
      ) : null}

      {settingsPresetSheetOpen && editingProduct ? (
        <SettingsPresetSheet
          bottomInset={insets.bottom}
          mode={settingsPresetMode}
          name={settingsPresetName}
          presets={settingsPresets}
          saveDisabled={settingsPresetName.trim().length === 0}
          message={settingsPresetMessage}
          product={editingProduct}
          theme={theme}
          onClose={() => setSettingsPresetSheetOpen(false)}
          onLoad={loadSettingsPreset}
          onModeChange={setSettingsPresetMode}
          onNameChange={setSettingsPresetName}
          onSave={() => {
            void saveCurrentSettingsPreset();
          }}
        />
      ) : null}

      {productPresetSheetOpen ? (
        <ProductPresetSheet
          bottomInset={insets.bottom}
          mode={productPresetMode}
          name={productPresetName}
          presets={productPresets}
          saveDisabled={!selectedProfileId || productPresetName.trim().length === 0 || controller.selectedProducts.length === 0}
          selectedCount={controller.selectedProducts.length}
          message={productPresetMessage}
          theme={theme}
          onClose={() => setProductPresetSheetOpen(false)}
          onLoad={loadSelectedProductPreset}
          onModeChange={setProductPresetMode}
          onNameChange={setProductPresetName}
          onSave={() => {
            void saveSelectedProductPreset();
          }}
        />
      ) : null}

      {activityLogOpen ? (
        <ActivityLogSheet
          bottomInset={insets.bottom}
          runState={displayRunState}
          theme={theme}
          onClear={() => {
            if (showingPersistedRunState) {
              clearAutomationActivityRun('auto-pilot');
              return;
            }
            controller.clearLogs();
          }}
          onClose={() => setActivityLogOpen(false)}
          onStop={() => {
            if (showingPersistedRunState) {
              return;
            }
            void controller.stopRun();
          }}
        />
      ) : null}

      {showStartBar ? (
        <View
          className="absolute bottom-0 left-0 right-0 bg-kd-panel px-4 pt-3"
          style={{ paddingBottom: startButtonBottomPadding }}
        >
          <Button
            accessibilityRole="button"
            disabled={isPreparingRun || (!canStart && !isRunning)}
            onPress={() => {
              if (isPreparingRun) {
                return;
              }
              if (isRunning) {
                void controller.stopRun();
                return;
              }
              void controller.startRun();
            }}
            className={`h-[50px] flex-row items-center justify-center gap-2 rounded-kd-xl ${
              isRunning ? 'bg-kd-red' : canStart ? 'bg-kd-text' : 'bg-kd-border'
            }`}
          >
            {isRunning ? (
              <Square size={14} color={theme.white} fill={theme.white} strokeWidth={2} />
            ) : isPreparingRun ? (
              <ActivityIndicator color={theme.textSubtle} size="small" />
            ) : (
              <Sparkles size={16} color={canStart ? (theme.isDark ? '#000000' : theme.white) : theme.textSubtle} strokeWidth={2.2} />
            )}
            <Text className={`text-[13px] font-semibold ${isRunning ? 'text-white' : canStart ? (theme.isDark ? 'text-black' : 'text-white') : 'text-kd-text-subtle'}`}>
              {isRunning ? 'หยุด Auto Pilot' : isPreparingRun ? 'กำลังเตรียมงาน' : 'เริ่มสร้าง'}
            </Text>
          </Button>
        </View>
      ) : null}
    </View>
  );
}

function createRunStateFromActivityRun(run: AutomationActivityRun): AutoPilotRunState {
  const logs = run.logs.map((entry, index) => ({
    id: `persisted-${entry.ts}-${index}`,
    level: inferActivityLogLevel(entry),
    message: stripActivityStagePrefix(entry.message),
    timestamp: entry.ts,
    step: entry.step,
    stage: entry.stage,
    flowStats: entry.flowStats,
  }));
  const latestLog = logs[logs.length - 1] ?? null;

  return {
    runId: null,
    status: getActivityRunStatus(run),
    progress: {
      currentRound: logs.length > 0 ? 1 : 0,
      totalRounds: 1,
      currentProduct: logs.length > 0 ? 1 : 0,
      totalProducts: 1,
      currentStep: latestLog?.step ?? null,
      currentStepIndex: latestLog?.step ? 1 : 0,
      totalSteps: latestLog?.step ? 1 : 0,
      currentStage: latestLog?.stage ?? null,
      currentProductName: null,
      plannedImages: 0,
      plannedVideos: 0,
      generatedImages: 0,
      generatedVideos: 0,
      failedImages: 0,
      failedVideos: 0,
    },
    logs,
  };
}

function getActivityRunStatus(run: AutomationActivityRun): AutoPilotRunState['status'] {
  if (run.running) return 'running';
  const latestMessage = run.logs[run.logs.length - 1]?.message ?? '';
  if (/ไม่สำเร็จ|ผิดพลาด|error|failed|ล้มเหลว/i.test(latestMessage)) return 'error';
  if (/ถูกหยุด|ขาดตอน|stopped|interrupted/i.test(latestMessage)) return 'stopped';
  if (run.logs.length > 0) return 'completed';
  return 'idle';
}

function inferActivityLogLevel(entry: AutomationActivityLogEntry): AutoPilotLogLevel {
  const message = entry.message;
  if (/ไม่สำเร็จ|ผิดพลาด|error|failed|ล้มเหลว/i.test(message)) return 'error';
  if (/เตือน|warning|กำลังหยุด|ถูกหยุด|ขาดตอน|ยังไม่/i.test(message)) return 'warning';
  if (/สำเร็จ|เสร็จ|พร้อมใช้|รับงานแล้ว/i.test(message)) return 'success';
  return 'info';
}

function stripActivityStagePrefix(message: string): string {
  const match = message.match(/^\[[^\]]+]\s*(.*)$/);
  return match?.[1]?.trim() || message;
}

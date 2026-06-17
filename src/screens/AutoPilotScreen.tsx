import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Check,
  Clock3,
  Copy,
  FolderOpen,
  Image as ImageIcon,
  Link2,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Square,
  Star,
  Tag,
  Trash2,
  Video,
  X,
} from 'lucide-react-native';

import {
  AUTO_PILOT_DELAY_OPTIONS,
  AUTO_PILOT_ROUND_OPTIONS,
  AUTO_PILOT_STEPS,
  FLOW_IMAGE_MODELS,
  FLOW_VIDEO_MODELS,
  IMAGE_ASPECT_RATIO_OPTIONS,
  IMAGE_CHARACTER_MODE_OPTIONS,
  IMAGE_DETAIL_OPTIONS,
  IMAGE_FRAME_OPTIONS,
  IMAGE_PRODUCT_DISPLAY_OPTIONS,
  IMAGE_SCENE_MODE_OPTIONS,
  IMAGE_STYLE_OPTIONS,
  IMAGE_TEXT_OVERLAY_OPTIONS,
  OUTPUT_COUNT_OPTIONS,
  VIDEO_ASPECT_RATIO_OPTIONS,
  VIDEO_CHARACTER_MODE_OPTIONS,
  VIDEO_DURATION_OPTIONS,
  VIDEO_SCENE_OPTIONS,
} from '@/autopilot/defaults';
import { getAutoPilotProductId } from '@/autopilot/productAdapter';
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
import Text from '@/components/ui/KubdeeText';
import { FacebookLogo, TikTokLogo, YouTubeLogo } from '@/components/BrandLogos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { kubdeeFontFamilies } from '@/theme/fonts';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';
import { useLibrary } from '@/library/LibraryContext';
import type { AffiliateProduct } from '@/library/types';
import type {
  AutoPilotImageSettings,
  AutoPilotProduct,
  AutoPilotProductSettings,
  AutoPilotRunState,
  AutoPilotSettings,
  AutoPilotStepType,
  AutoPilotVideoSettings,
} from '@/autopilot/types';

interface AutoPilotScreenProps {
  selectedProfileId: string;
  theme: KubdeeTheme;
}

type OptionValue = string | number | boolean;
type ProductSettingsTab = 'image' | 'video';
type AutoPilotProductEditableField = 'name' | 'productId' | 'productUrl' | 'hashtags' | 'cta';

// Section grouping mirrors the kubdee-ai-extension settings modal:
// ตั้งค่าพื้นฐาน → ตัวละคร → การสร้าง Prompt → สไตล์รูปภาพ → ฉาก → คำสั่งเพิ่มเติม
const IMAGE_SECTION_KEYS = {
  basic: ['aspectRatio', 'outputCount'],
  character: ['characterMode', 'characterDescription'],
  prompt: ['promptMode', 'customPrompt'],
  style: [
    'presetStyle',
    'presetStyleCustom',
    'productDisplayMode',
    'lighting',
    'lightingCustom',
    'frame',
    'frameCustom',
    'textOverlay',
    'textOverlayCustom',
  ],
  scene: ['sceneMode', 'sceneDescription', 'background', 'backgroundCustom'],
  additional: ['systemPrompt'],
} satisfies Record<string, Array<keyof AutoPilotImageSettings>>;

// วิดีโอ: ตั้งค่าพื้นฐาน → ตัวละคร → การสร้าง Prompt → สไตล์วิดีโอ → คำสั่งเพิ่มเติม
const VIDEO_SECTION_KEYS = {
  basic: ['aspectRatio', 'outputCount', 'sceneCount'],
  character: ['characterMode'],
  prompt: ['promptMode', 'customPrompt'],
  style: [
    'presetStyle',
    'presetStyleCustom',
    'cameraMotion',
    'cameraMotionCustom',
    'voiceCharacter',
    'voiceCharacterCustom',
    'scriptStyle',
    'scriptStyleCustom',
    'dialogueMode',
    'dialogue',
    'musicSfxMode',
    'musicSfxCustom',
  ],
  additional: ['forbiddenWords', 'systemPrompt'],
} satisfies Record<string, Array<keyof AutoPilotVideoSettings>>;

// ยังไม่ใช้ฟีเจอร์ "ส่งรูปให้ AI วิเคราะห์" — ซ่อนแถวไว้ก่อน (สลับเป็น true เพื่อเปิดใช้)
const SHOW_SEND_IMAGE_TO_AI = false;

// Accent color for OptionGroup selected state — set per settings tab (image=amber,
// video=red) so the selected pill text matches the section accent without having
// to thread the color through every OptionGroup call.
const SettingsAccentContext = createContext<string | undefined>(undefined);

function formatPrice(price: string | null): string {
  if (!price) {
    return '-';
  }

  const numeric = Number(price);
  if (!Number.isFinite(numeric)) {
    return `฿${price}`;
  }

  return `฿${new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(numeric)}`;
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

export default function AutoPilotScreen({
  selectedProfileId,
  theme,
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

  const profileProducts = useMemo(() => {
    if (!selectedProfileId) {
      return allProducts;
    }

    return allProducts.filter((product) => product.profileLocalId === selectedProfileId);
  }, [allProducts, selectedProfileId]);

  const controller = useAutoPilotController({
    profileLocalId: selectedProfileId,
    sourceProducts: profileProducts,
  });

  const editingProduct = editingProductId
    ? controller.products.find((product) => product.id === editingProductId)
    : null;
  const isRunning = controller.runState.status === 'running';
  const canStart =
    !isRunning &&
    selectedProfileId.length > 0 &&
    controller.selectedProducts.length > 0 &&
    controller.enabledSteps.length > 0;
  // ยังไม่ได้เลือกสินค้าจากคลัง → ซ่อนปุ่มเริ่มสร้าง (แต่ตอนกำลังรันยังต้องเห็นปุ่มหยุด)
  const showStartBar = controller.selectedProducts.length > 0 || isRunning;
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
            onDurationChange={(value) => controller.updateSetting('flowVideoDuration', value)}
            onHashtagCountChange={(value) => controller.updateSetting('aiHashtagCount', value)}
            onImageModelChange={(value) => controller.updateSetting('flowImageModel', String(value))}
            onRoundChange={(value) => controller.updateSetting('totalRounds', Number(value))}
            onToggleCaption={(value) => controller.updateSetting('aiGenerateCaption', value)}
            onToggleCta={(value) => controller.updateSetting('aiGenerateCta', value)}
            onToggleRewrite={(value) => controller.updateSetting('aiRewritePromptOnAudioFailure', value)}
            onToggleSendImage={(value) => controller.updateSetting('aiSendImageToAi', value)}
            onVideoModelChange={(value) => {
              const nextModel = String(value);
              controller.updateSetting('flowVideoModel', nextModel);
              if (nextModel === 'omni_flash') {
                controller.updateSetting('flowVideoDuration', 10);
              } else if (controller.settings.flowVideoDuration === 10) {
                controller.updateSetting('flowVideoDuration', 8);
              }
            }}
          />

          <PipelineStepsBlock
            enabledSteps={controller.enabledSteps}
            theme={theme}
            onToggle={(value) => controller.toggleStep(value)}
          />

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

          {controller.runState.status === 'running' || controller.runState.logs.length > 0 ? (
            <ActivityLogBlock
              runState={controller.runState}
              theme={theme}
              onClear={controller.clearLogs}
              onStop={() => {
                void controller.stopRun();
              }}
            />
          ) : null}
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

      {showStartBar ? (
        <View
          className="absolute bottom-0 left-0 right-0 bg-kd-panel px-4 pt-3"
          style={{ paddingBottom: startButtonBottomPadding }}
        >
          <Button
            accessibilityRole="button"
            disabled={!canStart && !isRunning}
            onPress={() => {
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
            ) : (
              <Sparkles size={16} color={canStart ? (theme.isDark ? '#000000' : theme.white) : theme.textSubtle} strokeWidth={2.2} />
            )}
            <Text className={`text-[13px] font-semibold ${isRunning ? 'text-white' : canStart ? (theme.isDark ? 'text-black' : 'text-white') : 'text-kd-text-subtle'}`}>
              {isRunning ? 'หยุด Auto Pilot' : 'เริ่มสร้าง'}
            </Text>
          </Button>
        </View>
      ) : null}
    </View>
  );
}

function ExtensionBasicSettingsBlock({
  settings,
  theme,
  onDelayChange,
  onDurationChange,
  onHashtagCountChange,
  onImageModelChange,
  onRoundChange,
  onToggleCaption,
  onToggleCta,
  onToggleRewrite,
  onToggleSendImage,
  onVideoModelChange,
}: {
  settings: AutoPilotSettings;
  theme: KubdeeTheme;
  onDelayChange: (value: OptionValue) => void;
  onDurationChange: (value: number) => void;
  onHashtagCountChange: (value: number) => void;
  onImageModelChange: (value: OptionValue) => void;
  onRoundChange: (value: OptionValue) => void;
  onToggleCaption: (value: boolean) => void;
  onToggleCta: (value: boolean) => void;
  onToggleRewrite: (value: boolean) => void;
  onToggleSendImage: (value: boolean) => void;
  onVideoModelChange: (value: OptionValue) => void;
}): React.JSX.Element {
  const durationOptions = VIDEO_DURATION_OPTIONS.filter(
    (duration) => settings.flowVideoModel === 'omni_flash' || duration !== 10
  );

  return (
    <View className="gap-2">
      <ExtensionSectionTitle icon={Star} title="ตั้งค่าพื้นฐาน" theme={theme} />

      <View className="gap-1.5">
        <View className="flex-row gap-2.5">
          <SelectField
            label="จำนวนรอบ"
            options={AUTO_PILOT_ROUND_OPTIONS.map((round) => ({ label: String(round), value: round }))}
            theme={theme}
            value={settings.totalRounds}
            onChange={onRoundChange}
          />
          <SelectField
            label="หน่วงเวลา"
            options={AUTO_PILOT_DELAY_OPTIONS.map((option) => ({
              label:
                option.value === 'normal'
                  ? 'ปกติ (2-4 วิ)'
                  : option.value === 'fast'
                    ? 'เร็ว (1-2 วิ)'
                    : 'ช้า (4-7 วิ)',
              value: option.value,
            }))}
            theme={theme}
            value={settings.delayPreset}
            onChange={onDelayChange}
          />
        </View>

        <View className="flex-row gap-2.5">
          <SelectField
            label="Model รูป"
            options={FLOW_IMAGE_MODELS.map((model) => ({ label: model.label, value: model.value }))}
            theme={theme}
            value={settings.flowImageModel}
            onChange={onImageModelChange}
          />
          <SelectField
            label="Model วิดีโอ"
            options={FLOW_VIDEO_MODELS.map((model) => ({ label: model.label, value: model.value }))}
            theme={theme}
            value={settings.flowVideoModel}
            onChange={onVideoModelChange}
          />
        </View>
      </View>

      <DurationSegment
        options={durationOptions}
        theme={theme}
        value={settings.flowVideoDuration}
        onChange={onDurationChange}
      />

      <View className="gap-1.5">
        <View className="gap-1">
          <ExtensionToggleRow
            icon={Star}
            label="AI คิด Caption/Hashtags"
            rightSlot={settings.aiGenerateCaption ? (
              <HashtagCountSelector
                enabled={settings.aiGenerateCaption}
                theme={theme}
                value={settings.aiHashtagCount}
                onChange={onHashtagCountChange}
              />
            ) : null}
            theme={theme}
            value={settings.aiGenerateCaption}
            onValueChange={onToggleCaption}
          />
          {SHOW_SEND_IMAGE_TO_AI && settings.aiGenerateCaption ? (
            <View className="min-h-7 flex-row items-center gap-3 pl-7">
              <View className="min-w-0 flex-1 flex-row flex-wrap items-baseline gap-x-1.5">
                <Text className="text-kd-caption font-medium text-kd-text-muted">ส่งรูปให้ AI วิเคราะห์</Text>
                <Text className="text-kd-tiny text-kd-text-subtle">(ปิดไว้จะประหยัด token กว่า)</Text>
              </View>
              <Switch
                size="sm"
                checked={settings.aiSendImageToAi}
                onCheckedChange={onToggleSendImage}
                className={settings.aiSendImageToAi ? 'bg-black dark:bg-zinc-200' : 'bg-kd-border-strong dark:bg-kd-card-muted'}
              />
            </View>
          ) : null}
        </View>
        <ExtensionToggleRow
          icon={Copy}
          label="AI คิด CTA"
          theme={theme}
          value={settings.aiGenerateCta}
          onValueChange={onToggleCta}
        />
        <ExtensionToggleRow
          icon={Sparkles}
          label="AI rewrite prompt เมื่อเสียงล้มเหลว"
          theme={theme}
          value={settings.aiRewritePromptOnAudioFailure}
          onValueChange={onToggleRewrite}
        />
      </View>
    </View>
  );
}

function ExtensionSectionTitle({
  icon: Icon,
  theme,
  title,
}: {
  icon: typeof Star;
  theme: KubdeeTheme;
  title: string;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-2">
      <Icon size={16} color={theme.textMuted} strokeWidth={2} />
      <Text className="text-[13px] font-semibold text-kd-text">{title}</Text>
    </View>
  );
}

function DurationSegment({
  options,
  theme,
  value,
  onChange,
}: {
  options: readonly number[];
  theme: KubdeeTheme;
  value: number;
  onChange: (value: number) => void;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <Clock3 size={15} color={theme.textMuted} strokeWidth={2.1} />
        <Text className="text-kd-caption font-medium text-kd-text-muted">ความยาวคลิป</Text>
      </View>
      <ToggleGroup
        type="single"
        value={String(value)}
        onValueChange={(nextValue) => {
          if (!nextValue) {
            return;
          }
          onChange(Number(nextValue));
        }}
        className="flex-row gap-0.5 rounded-kd-lg bg-kd-panel-muted p-0.5 dark:bg-kd-card-muted"
      >
        {options.map((duration) => {
          const active = duration === value;
          return (
            <ToggleGroupItem
              accessibilityRole="button"
              key={duration}
              value={String(duration)}
              className={`h-[22px] items-center justify-center rounded-kd-md px-2.5 ${
                active ? 'bg-white dark:bg-kd-input' : ''
              }`}
              style={active ? { shadowColor: theme.shadow, shadowOpacity: 0.08, shadowRadius: 4 } : undefined}
            >
              <Text className={`text-kd-micro font-semibold ${active ? 'text-kd-amber' : 'text-kd-text-subtle'}`}>
                {duration}s
              </Text>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </View>
  );
}

function HashtagCountSelector({
  enabled,
  theme,
  value,
  onChange,
}: {
  enabled: boolean;
  theme: KubdeeTheme;
  value: number;
  onChange: (value: number) => void;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-1">
      <Text className="text-kd-micro font-semibold text-kd-text-subtle">#</Text>
      <ToggleGroup
        type="single"
        value={String(value)}
        onValueChange={(nextValue) => {
          if (!nextValue) {
            return;
          }
          onChange(Number(nextValue));
        }}
        disabled={!enabled}
        className="flex-row gap-0.5 bg-transparent"
      >
        {[1, 2, 3, 4, 5].map((count, index) => {
          const active = enabled && count === value;
          return (
            <ToggleGroupItem
              accessibilityRole="button"
              disabled={!enabled}
              isFirst={index === 0}
              isLast={index === 4}
              key={count}
              value={String(count)}
              className={`h-5 min-h-5 w-5 min-w-5 items-center justify-center rounded-full p-0 ${
                active ? 'bg-black dark:bg-white' : 'bg-transparent'
              }`}
              style={{ opacity: enabled ? 1 : 0.45 }}
            >
              <Text className={`text-kd-micro font-semibold ${active ? 'text-white dark:text-black' : 'text-kd-text-subtle'}`}>
                {count}
              </Text>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </View>
  );
}

function ExtensionToggleRow({
  icon: Icon,
  label,
  rightSlot,
  theme,
  value,
  onValueChange,
}: {
  icon: typeof Star;
  label: string;
  rightSlot?: React.ReactNode;
  theme: KubdeeTheme;
  value: boolean;
  onValueChange: (value: boolean) => void;
}): React.JSX.Element {
  return (
    <View className="min-h-6 flex-row items-center gap-2.5">
      <Icon size={15} color={theme.textMuted} strokeWidth={2} />
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        numberOfLines={1}
        className="min-w-0 flex-1 text-kd-caption font-medium text-kd-text-muted"
      >
        {label}
      </Text>
      {rightSlot}
      <Switch
        size="sm"
        checked={value}
        onCheckedChange={onValueChange}
        className={value ? 'bg-black dark:bg-zinc-200' : 'bg-kd-border-strong dark:bg-kd-card-muted'}
      />
    </View>
  );
}

function ActivityLogBlock({
  runState,
  theme,
  onClear,
  onStop,
}: {
  runState: AutoPilotRunState;
  theme: KubdeeTheme;
  onClear: () => void;
  onStop: () => void;
}): React.JSX.Element {
  const isRunning = runState.status === 'running';
  const logs = runState.logs.slice(-18);

  return (
    <View className="overflow-hidden rounded-[14px] border border-kd-border bg-kd-card">
      <View className="flex-row items-center justify-between border-b border-kd-border px-3 py-2.5">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <View className="h-2 w-2 rounded-full" style={{ backgroundColor: isRunning ? theme.emerald : theme.amber }} />
          <Text className="text-[13px] font-semibold text-kd-text">Activity Log</Text>
        </View>
        <View className="flex-row items-center gap-1">
          {isRunning ? (
            <Button
              accessibilityLabel="หยุด Auto Pilot"
              accessibilityRole="button"
              variant="ghost"
              size="icon"
              onPress={onStop}
              className="h-8 w-8 items-center justify-center rounded-kd-md"
              style={{ backgroundColor: alpha(theme.red, theme.isDark ? 0.18 : 0.1) }}
            >
              <Square size={13} color={theme.red} fill={theme.red} strokeWidth={2} />
            </Button>
          ) : null}
          <Button
            accessibilityLabel="ล้าง Activity Log"
            accessibilityRole="button"
            disabled={logs.length === 0}
            variant="ghost"
            size="icon"
            onPress={onClear}
            className="h-8 w-8 items-center justify-center rounded-kd-md bg-kd-panel-muted dark:bg-kd-card-muted"
            style={{ opacity: logs.length === 0 ? 0.45 : 1 }}
          >
            <Trash2 size={14} color={theme.textSubtle} strokeWidth={2} />
          </Button>
        </View>
      </View>

      <View style={{ maxHeight: 210 }}>
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerClassName="gap-1.5 px-3 py-2.5">
          {logs.length === 0 ? (
            <View className="min-h-[86px] items-center justify-center gap-1.5">
              <Clock3 size={22} color={theme.textSubtle} strokeWidth={1.8} />
              <Text className="text-kd-caption font-semibold text-kd-text-subtle">Ready to start...</Text>
            </View>
          ) : (
            logs.map((log) => (
              <View key={log.id} className="flex-row gap-2">
                <Text className="w-[58px] text-kd-micro text-kd-text-subtle">{formatTime(log.timestamp)}</Text>
                <Text className="flex-1 text-kd-caption leading-4" style={{ color: getLogTextColor(log.level, theme) }}>
                  {log.message}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function PipelineStepsBlock({
  enabledSteps,
  theme,
  onToggle,
}: {
  enabledSteps: AutoPilotStepType[];
  theme: KubdeeTheme;
  onToggle: (value: AutoPilotStepType) => void;
}): React.JSX.Element {
  return (
    <View className="gap-1.5">
      <ExtensionSectionTitle icon={Sparkles} title="ขั้นตอนการทำงาน" theme={theme} />
      <View className="flex-row items-center pt-1">
        {AUTO_PILOT_STEPS.map((step) => (
          <Fragment key={step.id}>
            <PipelineStepButton
              active={enabledSteps.includes(step.id)}
              label={step.id === 'image' ? 'รูปภาพ' : 'วิดีโอ'}
              step={step.id}
              theme={theme}
              onPress={() => onToggle(step.id)}
            />
            <View className="flex-1 items-center">
              <ChevronRight size={12} color={theme.border} strokeWidth={2} />
            </View>
          </Fragment>
        ))}
        <DisabledPipelineIcon icon="tiktok" theme={theme} />
        <View className="flex-1 items-center">
          <ChevronRight size={12} color={theme.border} strokeWidth={2} />
        </View>
        <DisabledPipelineIcon icon="youtube" theme={theme} />
        <View className="flex-1 items-center">
          <ChevronRight size={12} color={theme.border} strokeWidth={2} />
        </View>
        <DisabledPipelineIcon icon="facebook" theme={theme} />
      </View>
    </View>
  );
}

function DisabledPipelineIcon({
  icon,
  theme,
}: {
  icon: 'facebook' | 'tiktok' | 'youtube';
  theme: KubdeeTheme;
}): React.JSX.Element {
  const Icon = icon === 'tiktok' ? TikTokLogo : icon === 'youtube' ? YouTubeLogo : FacebookLogo;

  return (
    <View className="h-8 w-8 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-input opacity-40">
      <Icon size={16} color={theme.textSubtle} cutoutColor={theme.input} isDark={theme.isDark} />
    </View>
  );
}

function PipelineStepButton({
  active,
  label,
  step,
  theme,
  onPress,
}: {
  active: boolean;
  label: string;
  step: AutoPilotStepType;
  theme: KubdeeTheme;
  onPress: () => void;
}): React.JSX.Element {
  const color = step === 'image' ? theme.amber : theme.red;
  const Icon = step === 'image' ? ImageIcon : Video;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      className="relative h-8 w-8 items-center justify-center rounded-kd-lg border"
      style={{
        backgroundColor: active ? alpha(color, theme.isDark ? 0.18 : 0.1) : theme.input,
        borderColor: active ? alpha(color, 0.55) : theme.border,
      }}
    >
      <Icon size={16} color={active ? color : theme.textSubtle} strokeWidth={2} />
      {active ? (
        <View className="absolute -right-1 -top-1 h-3.5 w-3.5 items-center justify-center rounded-full bg-kd-emerald">
          <Check size={9} color={theme.white} strokeWidth={3} />
        </View>
      ) : null}
    </Pressable>
  );
}

function ProductCatalogBlock({
  isSyncing,
  profileProducts,
  selectedProducts,
  theme,
  onAddManualProduct,
  onClearProducts,
  onOpenSettings,
  onOpenPreset,
  onOpenProductSelect,
  onRemoveProduct,
  onSyncProducts,
  onUpdateProductField,
}: {
  isSyncing: boolean;
  profileProducts: AffiliateProduct[];
  selectedProducts: AutoPilotProduct[];
  theme: KubdeeTheme;
  onAddManualProduct: () => void;
  onClearProducts: () => void;
  onOpenSettings: (productId: string) => void;
  onOpenPreset: () => void;
  onOpenProductSelect: () => void;
  onRemoveProduct: (productId: string) => void;
  onSyncProducts: () => void;
  onUpdateProductField: (productId: string, field: AutoPilotProductEditableField, value: string) => void;
}): React.JSX.Element {
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-1.5">
        <ImageIcon size={16} color={theme.textMuted} strokeWidth={2} />
        <Text numberOfLines={1} className="text-[13px] font-semibold text-kd-text">
          ข้อมูลสินค้า ({selectedProducts.length})
        </Text>
        <View className="flex-1" />
        <Button
          accessibilityLabel="เปิด Product Preset"
          accessibilityRole="button"
          variant="ghost"
          onPress={onOpenPreset}
          className="h-8 flex-row items-center justify-center gap-1 rounded-kd-md px-2"
        >
          <Text className="text-kd-caption font-medium text-kd-text-subtle">Preset</Text>
          <ChevronDown size={12} color={theme.textSubtle} strokeWidth={2.2} />
        </Button>
        <View className="h-5 w-px bg-kd-border" />
        <Button
          accessibilityLabel="เลือกสินค้าจากคลัง"
          accessibilityRole="button"
          variant="ghost"
          onPress={onOpenProductSelect}
          className="h-8 w-8 items-center justify-center rounded-kd-md"
        >
          <FolderOpen size={16} color={theme.textSubtle} strokeWidth={2.1} />
        </Button>
        <Button
          accessibilityLabel="เพิ่มสินค้าเอง"
          accessibilityRole="button"
          variant="ghost"
          onPress={onAddManualProduct}
          className="h-8 w-8 items-center justify-center rounded-kd-md"
        >
          <Plus size={17} color={theme.textSubtle} strokeWidth={2.1} />
        </Button>
        {selectedProducts.length > 0 ? (
          <Button
            accessibilityLabel="ล้างสินค้าที่เลือก"
            accessibilityRole="button"
            variant="ghost"
            onPress={onClearProducts}
            className="h-8 w-8 items-center justify-center rounded-kd-md"
          >
            <Trash2 size={16} color={theme.textSubtle} strokeWidth={2.1} />
          </Button>
        ) : null}
      </View>

      {selectedProducts.length > 0 ? (
        <View className="gap-2">
          {selectedProducts.map((product, index) => (
            <ProductRow
              index={index}
              key={product.id}
              product={product}
              theme={theme}
              onOpenSettings={() => onOpenSettings(product.id)}
              onRemove={() => onRemoveProduct(product.id)}
              onUpdate={(field, value) => onUpdateProductField(product.id, field, value)}
            />
          ))}
        </View>
      ) : (
        <View className="min-h-[210px] items-center justify-center gap-3">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-kd-panel-muted dark:bg-kd-card-muted">
            <ImageIcon size={25} color={theme.textSubtle} strokeWidth={1.8} />
          </View>
          <Text className="text-kd-caption font-medium text-kd-text-subtle">
            {profileProducts.length === 0 ? 'ยังไม่มีสินค้าในโปรไฟล์นี้' : 'เพิ่มสินค้าจากคลังหรือเพิ่มเอง'}
          </Text>
          {profileProducts.length === 0 ? (
            <Button
              accessibilityLabel="ซิงก์คลังสินค้า"
              accessibilityRole="button"
              disabled={isSyncing}
              variant="ghost"
              onPress={onSyncProducts}
              className="h-8 flex-row items-center justify-center gap-1 rounded-kd-md border border-kd-border bg-kd-input px-2"
            >
              <RefreshCw size={13} color={theme.textSubtle} strokeWidth={2.1} />
              <Text className="text-kd-caption font-medium text-kd-text-subtle">{isSyncing ? 'กำลังซิงก์...' : 'ซิงก์คลังสินค้า'}</Text>
            </Button>
          ) : null}
        </View>
      )}
    </View>
  );
}

function ProductSelectSheet({
  bottomInset,
  topInset,
  products,
  selectedProductIds,
  theme,
  onClose,
  onConfirm,
}: {
  bottomInset: number;
  topInset: number;
  products: AffiliateProduct[];
  selectedProductIds: Set<string>;
  theme: KubdeeTheme;
  onClose: () => void;
  onConfirm: (productIds: string[]) => void;
}): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [draftSelectedIds, setDraftSelectedIds] = useState<Set<string>>(
    () => new Set(Array.from(selectedProductIds))
  );

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return products;
    }

    return products.filter((product) =>
      [
        product.name,
        product.externalProductId,
        product.localId,
        product.description,
        product.productUrl,
      ].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery)
    );
  }, [products, query]);

  const allFilteredSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((product) => draftSelectedIds.has(getAutoPilotProductId(product)));

  const toggleProduct = (productId: string): void => {
    setDraftSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const toggleAllFiltered = (): void => {
    setDraftSelectedIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) {
        for (const product of filteredProducts) {
          next.delete(getAutoPilotProductId(product));
        }
        return next;
      }
      for (const product of filteredProducts) {
        next.add(getAutoPilotProductId(product));
      }
      return next;
    });
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View
        className="flex-1 bg-black/60 px-2 pb-2"
        style={{ paddingTop: Math.max(topInset + 10, 40) }}
      >
        <View className="min-h-0 flex-1 overflow-hidden rounded-[18px] border border-kd-border bg-kd-panel">
          <View className="border-b border-kd-border bg-kd-card px-3 pt-3">
            <View className="flex-row items-center justify-between pb-2">
              <View className="min-w-0 flex-1 flex-row items-center gap-2">
                <View className="h-8 w-8 items-center justify-center rounded-kd-lg bg-kd-emerald-soft dark:bg-kd-card-muted">
                  <Package size={15} color={theme.emerald} strokeWidth={2.1} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[14px] font-semibold text-kd-text">เลือกจากคลังสินค้า</Text>
                  <Text className="text-kd-micro text-kd-text-subtle">{products.length} รายการในโปรไฟล์นี้</Text>
                </View>
              </View>
              <Button
                accessibilityLabel="ปิดเลือกสินค้าจากคลัง"
                accessibilityRole="button"
                variant="ghost"
                size="icon"
                onPress={onClose}
                className="h-8 w-8 items-center justify-center rounded-kd-md bg-kd-panel-muted dark:bg-kd-card-muted"
              >
                <X size={15} color={theme.textMuted} strokeWidth={2.3} />
              </Button>
            </View>

            <View className="pb-3">
              <View className="h-9 flex-row items-center gap-1.5 rounded-kd-md border border-kd-border bg-kd-input px-2">
                <Search size={13} color={theme.textSubtle} strokeWidth={2} />
                <Input
                  value={query}
                  onChangeText={setQuery}
                  placeholder="ค้นหาสินค้า..."
                  placeholderTextColor={theme.textSubtle}
                  className="h-9 flex-1 rounded-none border-0 bg-transparent p-0 text-kd-caption text-kd-text shadow-none"
                  style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
                />
                {query.length > 0 ? (
                  <Pressable accessibilityLabel="ล้างคำค้นหา" accessibilityRole="button" onPress={() => setQuery('')}>
                    <X size={13} color={theme.textSubtle} strokeWidth={2.5} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>

          <Separator className="bg-kd-border" />

          {filteredProducts.length > 0 ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allFilteredSelected }}
              onPress={toggleAllFiltered}
              className="min-h-10 flex-row items-center justify-between border-b border-kd-border px-3"
            >
              <View className="flex-row items-center gap-2">
                <View pointerEvents="none">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={toggleAllFiltered}
                    checkedClassName="border-kd-emerald"
                    indicatorClassName="bg-kd-emerald"
                    className="h-5 w-5 rounded-[6px] border-2 border-kd-border-strong bg-kd-input"
                  />
                </View>
                <Text className="text-kd-micro font-semibold text-kd-text-subtle">
                  เลือกทั้งหมด ({filteredProducts.length})
                </Text>
              </View>
              <Badge className="border-transparent bg-kd-emerald-soft px-2 dark:bg-kd-card-muted">
                <Text className="text-kd-micro font-medium text-kd-emerald">เลือกแล้ว {draftSelectedIds.size}</Text>
              </Badge>
            </Pressable>
          ) : null}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-1.5 p-2 pb-24">
            {filteredProducts.length === 0 ? (
              <View className="items-center gap-2 py-12">
                <Package size={28} color={theme.textSubtle} strokeWidth={1.7} />
                <Text className="text-kd-caption text-kd-text-subtle">
                  {query.trim() ? 'ไม่พบสินค้าที่ค้นหา' : 'ยังไม่มีสินค้าในโปรไฟล์นี้'}
                </Text>
              </View>
            ) : (
              filteredProducts.map((product) => (
                <CatalogSelectRow
                  key={getAutoPilotProductId(product)}
                  product={product}
                  selected={draftSelectedIds.has(getAutoPilotProductId(product))}
                  theme={theme}
                  onPress={() => toggleProduct(getAutoPilotProductId(product))}
                />
              ))
            )}
          </ScrollView>

          <View
            className="absolute bottom-0 left-0 right-0 flex-row items-center justify-end gap-2 border-t border-kd-border bg-kd-panel px-3 pt-2"
            style={{ paddingBottom: Math.max(bottomInset, 12) }}
          >
            <Button
              accessibilityRole="button"
              variant="ghost"
              onPress={onClose}
              className="h-10 justify-center rounded-kd-md px-3"
            >
              <Text className="text-kd-caption font-medium text-kd-text-muted">ยกเลิก</Text>
            </Button>
            <Button
              accessibilityRole="button"
              disabled={draftSelectedIds.size === 0}
              variant="ghost"
              onPress={() => onConfirm(Array.from(draftSelectedIds))}
              className={`h-10 flex-row items-center justify-center gap-1.5 rounded-kd-md px-4 ${
                draftSelectedIds.size === 0 ? 'bg-kd-border' : 'bg-kd-emerald'
              }`}
            >
              <Check size={14} color={theme.white} strokeWidth={2.4} />
              <Text className="text-kd-caption font-medium text-white">
                เลือก {draftSelectedIds.size > 0 ? `${draftSelectedIds.size} รายการ` : ''}
              </Text>
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CatalogSelectRow({
  product,
  selected,
  theme,
  onPress,
}: {
  product: AffiliateProduct;
  selected: boolean;
  theme: KubdeeTheme;
  onPress: () => void;
}): React.JSX.Element {
  const productId = product.externalProductId || product.localId;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className="flex-row items-center gap-2 rounded-kd-lg border p-2"
      style={{
        backgroundColor: selected ? alpha(theme.emerald, theme.isDark ? 0.14 : 0.08) : theme.panel,
        borderColor: selected ? alpha(theme.emerald, 0.55) : theme.border,
      }}
    >
      <View pointerEvents="none">
        <Checkbox
          checked={selected}
          onCheckedChange={onPress}
          checkedClassName="border-kd-emerald"
          indicatorClassName="bg-kd-emerald"
          className="h-5 w-5 rounded-[6px] border-2 border-kd-border-strong bg-kd-input"
        />
      </View>
      <View className="h-12 w-12 overflow-hidden rounded-kd-md bg-kd-panel-muted dark:bg-kd-card-muted">
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} className="h-full w-full" resizeMode="cover" />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <ImageIcon size={16} color={theme.textSubtle} strokeWidth={1.8} />
          </View>
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-kd-caption font-bold text-kd-text">
          {product.name || 'ไม่มีชื่อ'}
        </Text>
        <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">#{productId}</Text>
        <Text numberOfLines={1} className="text-kd-micro font-semibold text-kd-emerald">
          {formatPrice(product.price)}
        </Text>
      </View>
    </Pressable>
  );
}

function ProductPresetSheet({
  bottomInset,
  message,
  mode,
  name,
  presets,
  saveDisabled,
  selectedCount,
  theme,
  onClose,
  onLoad,
  onModeChange,
  onNameChange,
  onSave,
}: {
  bottomInset: number;
  message: string | null;
  mode: 'save' | 'load';
  name: string;
  presets: AutoPilotProductPreset[];
  saveDisabled: boolean;
  selectedCount: number;
  theme: KubdeeTheme;
  onClose: () => void;
  onLoad: (preset: AutoPilotProductPreset) => void;
  onModeChange: (mode: 'save' | 'load') => void;
  onNameChange: (value: string) => void;
  onSave: () => void;
}): React.JSX.Element {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View className="flex-1 justify-end bg-black/60">
        <View
          className="overflow-hidden rounded-t-[18px] border border-kd-border bg-kd-panel"
          style={{ maxHeight: '72%' }}
        >
          <View className="border-b border-kd-border bg-kd-card px-3 pt-3">
            <View className="flex-row items-center justify-between pb-2">
              <View className="min-w-0 flex-1 flex-row items-center gap-2">
                <View className="h-8 w-8 items-center justify-center rounded-kd-lg bg-kd-panel-muted dark:bg-kd-card-muted">
                  <FolderOpen size={15} color={theme.textMuted} strokeWidth={2.1} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[14px] font-semibold text-kd-text">Product Preset</Text>
                  <Text className="text-kd-micro text-kd-text-subtle">บันทึก/โหลดชุดสินค้าที่เลือกจากคลัง</Text>
                </View>
              </View>
              <Button
                accessibilityLabel="ปิด Product Preset"
                accessibilityRole="button"
                variant="ghost"
                size="icon"
                onPress={onClose}
                className="h-8 w-8 items-center justify-center rounded-kd-md bg-kd-panel-muted dark:bg-kd-card-muted"
              >
                <X size={15} color={theme.textMuted} strokeWidth={2.3} />
              </Button>
            </View>

            <Tabs
              value={mode}
              onValueChange={(nextMode) => onModeChange(nextMode as 'save' | 'load')}
              className="gap-0"
            >
              <TabsList className="mr-0 h-10 w-full rounded-none bg-transparent p-0">
                <TabsTrigger
                  value="save"
                  className={`min-h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-none border-0 border-b-2 bg-transparent ${
                    mode === 'save' ? 'border-kd-emerald' : 'border-transparent'
                  }`}
                >
                  <Save size={13} color={mode === 'save' ? theme.emerald : theme.textSubtle} strokeWidth={2.2} />
                  <Text className="text-kd-caption font-medium" style={{ color: mode === 'save' ? theme.emerald : theme.textSubtle }}>
                    บันทึก
                  </Text>
                </TabsTrigger>
                <TabsTrigger
                  value="load"
                  className={`min-h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-none border-0 border-b-2 bg-transparent ${
                    mode === 'load' ? 'border-kd-emerald' : 'border-transparent'
                  }`}
                >
                  <FolderOpen size={13} color={mode === 'load' ? theme.emerald : theme.textSubtle} strokeWidth={2.2} />
                  <Text className="text-kd-caption font-medium" style={{ color: mode === 'load' ? theme.emerald : theme.textSubtle }}>
                    โหลด
                  </Text>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerClassName="gap-3 px-3 py-3"
            contentContainerStyle={{ paddingBottom: Math.max(bottomInset, 20) }}
          >
            {message ? (
              <View className="rounded-kd-md border border-kd-emerald/40 bg-kd-emerald-soft px-2.5 py-2 dark:bg-kd-card-muted">
                <Text className="text-kd-caption font-semibold text-kd-text">{message}</Text>
              </View>
            ) : null}

            {mode === 'save' ? (
              <View className="gap-3">
                <View className="rounded-kd-lg border border-kd-border bg-kd-card px-3 py-3">
                  <Text className="text-kd-caption font-medium text-kd-text">บันทึกชุดสินค้าที่เลือก</Text>
                  <Text className="mt-0.5 text-kd-micro text-kd-text-subtle">
                    รวมสินค้า {selectedCount} รายการ พร้อม settings รูปภาพ/วิดีโอของแต่ละสินค้า
                  </Text>
                  <View className="mt-3 gap-1.5">
                    <Text className="text-kd-micro font-semibold text-kd-text-subtle">ชื่อ preset</Text>
                    <Input
                      value={name}
                      onChangeText={onNameChange}
                      placeholder="เช่น ชุดรีวิวสินค้า 9:16"
                      placeholderTextColor={theme.textSubtle}
                      className="min-h-10 rounded-kd-md border border-kd-border bg-kd-input px-2 text-kd-caption text-kd-text"
                      style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
                    />
                  </View>
                </View>
                <Button
                  accessibilityRole="button"
                  disabled={saveDisabled}
                  variant="ghost"
                  onPress={onSave}
                  className={`h-11 flex-row items-center justify-center gap-2 rounded-kd-lg ${
                    saveDisabled ? 'bg-kd-border' : 'bg-kd-text'
                  }`}
                >
                  <Save size={15} color={theme.isDark && !saveDisabled ? '#000000' : theme.white} strokeWidth={2.2} />
                  <Text className={`text-kd-body font-medium ${theme.isDark && !saveDisabled ? 'text-black' : 'text-white'}`}>
                    บันทึก preset
                  </Text>
                </Button>
              </View>
            ) : (
              <View className="gap-2">
                {presets.length === 0 ? (
                  <View className="items-center gap-2 rounded-kd-lg border border-kd-border bg-kd-card py-8">
                    <FolderOpen size={24} color={theme.textSubtle} strokeWidth={1.8} />
                    <Text className="text-kd-caption text-kd-text-subtle">ยังไม่มี Product Preset</Text>
                  </View>
                ) : (
                  presets.map((preset) => (
                    <Button
                      accessibilityRole="button"
                      variant="ghost"
                      key={preset.id}
                      onPress={() => onLoad(preset)}
                      className="flex-row items-center gap-2 rounded-kd-lg border border-kd-border bg-kd-card px-2 py-2"
                    >
                      <View className="h-10 w-10 items-center justify-center rounded-kd-md bg-kd-panel-muted dark:bg-kd-card-muted">
                        <Text className="text-kd-caption font-medium text-kd-text">{preset.productIds.length}</Text>
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text numberOfLines={1} className="text-kd-caption font-medium text-kd-text">{preset.name}</Text>
                        <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
                          {preset.productIds.length} สินค้า · {new Date(preset.createdAt).toLocaleDateString('th-TH')}
                        </Text>
                      </View>
                      <ChevronRight size={15} color={theme.textSubtle} strokeWidth={2.2} />
                    </Button>
                  ))
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SettingsPresetSheet({
  bottomInset,
  message,
  mode,
  name,
  presets,
  product,
  saveDisabled,
  theme,
  onClose,
  onLoad,
  onModeChange,
  onNameChange,
  onSave,
}: {
  bottomInset: number;
  message: string | null;
  mode: 'save' | 'load';
  name: string;
  presets: AutoPilotSettingsPreset[];
  product: AutoPilotProduct;
  saveDisabled: boolean;
  theme: KubdeeTheme;
  onClose: () => void;
  onLoad: (preset: AutoPilotSettingsPreset) => void;
  onModeChange: (mode: 'save' | 'load') => void;
  onNameChange: (value: string) => void;
  onSave: () => void;
}): React.JSX.Element {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View className="flex-1 justify-end bg-black/60">
        <View
          className="overflow-hidden rounded-t-[18px] border border-kd-border bg-kd-panel"
          style={{ maxHeight: '72%' }}
        >
          <View className="border-b border-kd-border bg-kd-card px-3 pt-3">
            <View className="flex-row items-center justify-between pb-2">
              <View className="min-w-0 flex-1 flex-row items-center gap-2">
                <View className="h-8 w-8 items-center justify-center rounded-kd-lg bg-kd-panel-muted dark:bg-kd-card-muted">
                  <Save size={15} color={theme.textMuted} strokeWidth={2.1} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[14px] font-semibold text-kd-text">Preset ตั้งค่า</Text>
                  <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
                    รูปภาพ+วิดีโอของ {product.name || product.productId || 'สินค้า'}
                  </Text>
                </View>
              </View>
              <Button
                accessibilityLabel="ปิด Preset ตั้งค่า"
                accessibilityRole="button"
                variant="ghost"
                size="icon"
                onPress={onClose}
                className="h-8 w-8 items-center justify-center rounded-kd-md bg-kd-panel-muted dark:bg-kd-card-muted"
              >
                <X size={15} color={theme.textMuted} strokeWidth={2.3} />
              </Button>
            </View>

            <Tabs
              value={mode}
              onValueChange={(nextMode) => onModeChange(nextMode as 'save' | 'load')}
              className="gap-0"
            >
              <TabsList className="mr-0 h-10 w-full rounded-none bg-transparent p-0">
                <TabsTrigger
                  value="save"
                  className={`min-h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-none border-0 border-b-2 bg-transparent ${
                    mode === 'save' ? 'border-kd-emerald' : 'border-transparent'
                  }`}
                >
                  <Save size={13} color={mode === 'save' ? theme.emerald : theme.textSubtle} strokeWidth={2.2} />
                  <Text className="text-kd-caption font-medium" style={{ color: mode === 'save' ? theme.emerald : theme.textSubtle }}>
                    บันทึก
                  </Text>
                </TabsTrigger>
                <TabsTrigger
                  value="load"
                  className={`min-h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-none border-0 border-b-2 bg-transparent ${
                    mode === 'load' ? 'border-kd-emerald' : 'border-transparent'
                  }`}
                >
                  <FolderOpen size={13} color={mode === 'load' ? theme.emerald : theme.textSubtle} strokeWidth={2.2} />
                  <Text className="text-kd-caption font-medium" style={{ color: mode === 'load' ? theme.emerald : theme.textSubtle }}>
                    โหลด
                  </Text>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerClassName="gap-3 px-3 py-3"
            contentContainerStyle={{ paddingBottom: Math.max(bottomInset, 20) }}
          >
            {message ? (
              <View className="rounded-kd-md border border-kd-emerald/40 bg-kd-emerald-soft px-2.5 py-2 dark:bg-kd-card-muted">
                <Text className="text-kd-caption font-semibold text-kd-text">{message}</Text>
              </View>
            ) : null}

            {mode === 'save' ? (
              <View className="gap-3">
                <View className="rounded-kd-lg border border-kd-border bg-kd-card px-3 py-3">
                  <Text className="text-kd-caption font-medium text-kd-text">บันทึก preset ตั้งค่า</Text>
                  <Text className="mt-0.5 text-kd-micro text-kd-text-subtle">
                    เก็บค่ารูปภาพและวิดีโอของสินค้านี้ไว้ใช้ซ้ำกับสินค้าอื่น
                  </Text>
                  <View className="mt-3 gap-1.5">
                    <Text className="text-kd-micro font-semibold text-kd-text-subtle">ชื่อ preset</Text>
                    <Input
                      value={name}
                      onChangeText={onNameChange}
                      placeholder="เช่น รีวิวสั้น 9:16 โทนพรีเมียม"
                      placeholderTextColor={theme.textSubtle}
                      className="min-h-10 rounded-kd-md border border-kd-border bg-kd-input px-2 text-kd-caption text-kd-text"
                      style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
                    />
                  </View>
                </View>
                <Button
                  accessibilityRole="button"
                  disabled={saveDisabled}
                  variant="ghost"
                  onPress={onSave}
                  className={`h-11 flex-row items-center justify-center gap-2 rounded-kd-lg ${
                    saveDisabled ? 'bg-kd-border' : 'bg-kd-text'
                  }`}
                >
                  <Save size={15} color={theme.isDark && !saveDisabled ? '#000000' : theme.white} strokeWidth={2.2} />
                  <Text className={`text-kd-body font-medium ${theme.isDark && !saveDisabled ? 'text-black' : 'text-white'}`}>
                    บันทึก preset ตั้งค่า
                  </Text>
                </Button>
              </View>
            ) : (
              <View className="gap-2">
                {presets.length === 0 ? (
                  <View className="items-center gap-2 rounded-kd-lg border border-kd-border bg-kd-card py-8">
                    <FolderOpen size={24} color={theme.textSubtle} strokeWidth={1.8} />
                    <Text className="text-kd-caption text-kd-text-subtle">ยังไม่มี Preset ตั้งค่า</Text>
                  </View>
                ) : (
                  presets.map((preset) => (
                    <Button
                      accessibilityRole="button"
                      variant="ghost"
                      key={preset.id}
                      onPress={() => onLoad(preset)}
                      className="flex-row items-center gap-2 rounded-kd-lg border border-kd-border bg-kd-card px-2 py-2"
                    >
                      <View className="h-10 w-10 items-center justify-center rounded-kd-md bg-kd-panel-muted dark:bg-kd-card-muted">
                        <Save size={15} color={theme.textMuted} strokeWidth={2.1} />
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text numberOfLines={1} className="text-kd-caption font-medium text-kd-text">{preset.name}</Text>
                        <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
                          รูปภาพ+วิดีโอ · {new Date(preset.createdAt).toLocaleDateString('th-TH')}
                        </Text>
                      </View>
                      <ChevronRight size={15} color={theme.textSubtle} strokeWidth={2.2} />
                    </Button>
                  ))
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ProductSettingsModal({
  bottomInset,
  enabledSteps,
  product,
  selectedProductCount,
  tab,
  theme,
  onApplyAll,
  onApplyImageSection,
  onApplyVideoSection,
  onClose,
  onImageChange,
  onOpenSettingsPreset,
  onReset,
  onTabChange,
  onVideoChange,
}: {
  bottomInset: number;
  enabledSteps: AutoPilotStepType[];
  product: AutoPilotProduct;
  selectedProductCount: number;
  tab: ProductSettingsTab;
  theme: KubdeeTheme;
  onApplyAll: () => void;
  onApplyImageSection: (keys: Array<keyof AutoPilotImageSettings>) => void;
  onApplyVideoSection: (keys: Array<keyof AutoPilotVideoSettings>) => void;
  onClose: () => void;
  onImageChange: <K extends keyof AutoPilotImageSettings>(key: K, value: AutoPilotImageSettings[K]) => void;
  onOpenSettingsPreset: (mode: 'save' | 'load') => void;
  onReset: () => void;
  onTabChange: (tab: ProductSettingsTab) => void;
  onVideoChange: <K extends keyof AutoPilotVideoSettings>(key: K, value: AutoPilotVideoSettings[K]) => void;
}): React.JSX.Element {
  const showImageTab = enabledSteps.includes('image');
  const showVideoTab = enabledSteps.includes('video');
  const activeTab = showImageTab && tab === 'image' ? 'image' : showVideoTab ? 'video' : 'image';
  const canApplyAll = selectedProductCount > 1;

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View className="flex-1 justify-end bg-black/60">
        <View
          className="overflow-hidden rounded-t-[18px] border border-kd-border bg-kd-panel"
          style={{ maxHeight: '94%', minHeight: '78%' }}
        >
          <View className="border-b border-kd-border bg-kd-card px-3 pt-3">
            <View className="flex-row items-center gap-2 pb-2">
              <View className="h-11 w-11 overflow-hidden rounded-kd-lg border border-kd-border bg-kd-panel-muted dark:bg-kd-card-muted">
                {product.preview ? (
                  <Image source={{ uri: product.preview }} className="h-full w-full" resizeMode="cover" />
                ) : (
                  <View className="h-full w-full items-center justify-center">
                    <Package size={18} color={theme.textSubtle} strokeWidth={1.8} />
                  </View>
                )}
              </View>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-[14px] font-semibold text-kd-text">
                  ตั้งค่า: {product.name || product.productId || 'สินค้า'}
                </Text>
                <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
                  #{product.productId || product.catalogId} · จากคลังสินค้า
                </Text>
              </View>
              <Button
                accessibilityLabel="ปิดตั้งค่าสินค้า"
                accessibilityRole="button"
                variant="ghost"
                size="icon"
                onPress={onClose}
                className="h-9 w-9 items-center justify-center rounded-kd-md bg-kd-panel-muted dark:bg-kd-card-muted"
              >
                <X size={16} color={theme.textMuted} strokeWidth={2.3} />
              </Button>
            </View>

            {showImageTab && showVideoTab ? (
              <Tabs
                value={activeTab}
                onValueChange={(nextTab) => onTabChange(nextTab as ProductSettingsTab)}
                className="gap-0"
              >
                <TabsList className="mr-0 h-10 w-full rounded-none bg-transparent p-0">
                  <TabsTrigger
                    value="image"
                    className={`min-h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-none border-0 border-b-2 bg-transparent ${
                      activeTab === 'image' ? 'border-kd-amber' : 'border-transparent'
                    }`}
                  >
                    <ImageIcon size={13} color={activeTab === 'image' ? theme.amber : theme.textSubtle} strokeWidth={2.2} />
                    <Text className="text-kd-caption font-medium" style={{ color: activeTab === 'image' ? theme.amber : theme.textSubtle }}>
                      รูปภาพ
                    </Text>
                  </TabsTrigger>
                  <TabsTrigger
                    value="video"
                    className={`min-h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-none border-0 border-b-2 bg-transparent ${
                      activeTab === 'video' ? 'border-kd-red' : 'border-transparent'
                    }`}
                  >
                    <Video size={13} color={activeTab === 'video' ? theme.red : theme.textSubtle} strokeWidth={2.2} />
                    <Text className="text-kd-caption font-medium" style={{ color: activeTab === 'video' ? theme.red : theme.textSubtle }}>
                      วิดีโอ
                    </Text>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            ) : null}
          </View>

          <SettingsAccentContext.Provider value={activeTab === 'video' ? theme.red : theme.amber}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerClassName="gap-4 px-3 py-3"
              contentContainerStyle={{ paddingBottom: 92 + Math.max(bottomInset, 12) }}
            >
              {activeTab === 'image' && showImageTab ? (
                <ImageProductSettingsForm
                  settings={product.settings.image}
                  theme={theme}
                  onApplySection={onApplyImageSection}
                  onChange={onImageChange}
                />
              ) : null}
              {activeTab === 'video' && showVideoTab ? (
                <VideoProductSettingsForm
                  settings={product.settings.video}
                  theme={theme}
                  onApplySection={onApplyVideoSection}
                  onChange={onVideoChange}
                />
              ) : null}
            </ScrollView>
          </SettingsAccentContext.Provider>

          <View
            className="absolute bottom-0 left-0 right-0 flex-row items-center gap-2 border-t border-kd-border bg-kd-panel px-3 pt-2"
            style={{ paddingBottom: Math.max(bottomInset, 12) }}
          >
            <Button
              accessibilityLabel="รีเซ็ตตั้งค่าสินค้า"
              accessibilityRole="button"
              variant="ghost"
              size="icon"
              onPress={onReset}
              className="h-10 w-10 items-center justify-center rounded-kd-md border border-kd-border bg-kd-input"
            >
              <RotateCcw size={15} color={theme.textMuted} strokeWidth={2.2} />
            </Button>
            <Button
              accessibilityLabel="บันทึก Preset ตั้งค่า"
              accessibilityRole="button"
              variant="ghost"
              size="icon"
              onPress={() => onOpenSettingsPreset('save')}
              className="h-10 w-10 items-center justify-center rounded-kd-md border border-kd-border bg-kd-input"
            >
              <Save size={15} color={theme.textMuted} strokeWidth={2.2} />
            </Button>
            <Button
              accessibilityLabel="โหลด Preset ตั้งค่า"
              accessibilityRole="button"
              variant="ghost"
              size="icon"
              onPress={() => onOpenSettingsPreset('load')}
              className="h-10 w-10 items-center justify-center rounded-kd-md border border-kd-border bg-kd-input"
            >
              <FolderOpen size={15} color={theme.textMuted} strokeWidth={2.2} />
            </Button>
            <Button
              accessibilityLabel="นำค่านี้ไปใช้กับสินค้าที่เลือกทั้งหมด"
              accessibilityRole="button"
              disabled={!canApplyAll}
              variant="ghost"
              onPress={onApplyAll}
              className={`h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-kd-md border ${
                canApplyAll
                  ? 'border-kd-border bg-kd-input'
                  : 'border-kd-border bg-kd-panel-muted opacity-45 dark:bg-kd-card-muted'
              }`}
            >
              <Copy size={14} color={theme.textMuted} strokeWidth={2.2} />
              <Text className="text-kd-caption font-medium text-kd-text-muted">นำไปใช้ทั้งหมด</Text>
            </Button>
            <Button
              accessibilityRole="button"
              variant="ghost"
              onPress={onClose}
              className="h-10 flex-1 items-center justify-center rounded-kd-md bg-kd-text"
            >
              <Text className="text-kd-caption font-medium text-white dark:text-black">เสร็จสิ้น</Text>
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ProductSettingsTabButton({
  active,
  color,
  icon: Icon,
  label,
  theme,
  onPress,
}: {
  active: boolean;
  color: string;
  icon: typeof Bot;
  label: string;
  theme: KubdeeTheme;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className="min-h-10 flex-1 flex-row items-center justify-center gap-1.5 border-b-2"
      style={{ borderBottomColor: active ? color : 'transparent' }}
    >
      <Icon size={13} color={active ? color : theme.textSubtle} strokeWidth={2.2} />
      <Text className="text-kd-caption font-medium" style={{ color: active ? color : theme.textSubtle }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SettingsSection({
  children,
  color,
  icon: Icon,
  theme,
  title,
  onApplyAll,
}: {
  children: React.ReactNode;
  color: string;
  icon: typeof Bot;
  theme: KubdeeTheme;
  title: string;
  onApplyAll: () => void;
}): React.JSX.Element {
  return (
    <View className="gap-2.5">
      <View className="flex-row items-center justify-between">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Icon size={14} color={color} strokeWidth={2.1} />
          <Text className="text-kd-caption font-medium text-kd-text">{title}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onApplyAll} className="px-1.5 py-1">
          <Text className="text-kd-micro font-semibold text-kd-text-subtle">นำไปใช้ทั้งหมด</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

function ImageProductSettingsForm({
  settings,
  theme,
  onApplySection,
  onChange,
}: {
  settings: AutoPilotImageSettings;
  theme: KubdeeTheme;
  onApplySection: (keys: Array<keyof AutoPilotImageSettings>) => void;
  onChange: <K extends keyof AutoPilotImageSettings>(key: K, value: AutoPilotImageSettings[K]) => void;
}): React.JSX.Element {
  return (
    <View className="gap-5">
      {/* 1. ตั้งค่าพื้นฐาน */}
      <SettingsSection
        color={theme.amber}
        icon={SlidersHorizontal}
        theme={theme}
        title="ตั้งค่าพื้นฐาน"
        onApplyAll={() => onApplySection(IMAGE_SECTION_KEYS.basic)}
      >
        <View className="gap-2">
          <OptionGroup
            columns={5}
            label="สัดส่วนภาพ"
            options={IMAGE_ASPECT_RATIO_OPTIONS.map((ratio) => ({ label: ratio, value: ratio }))}
            theme={theme}
            value={settings.aspectRatio}
            onChange={(value) => onChange('aspectRatio', String(value))}
          />
          <OptionGroup
            columns={4}
            label="จำนวน"
            options={OUTPUT_COUNT_OPTIONS.map((count) => ({ label: count, value: count }))}
            theme={theme}
            value={settings.outputCount}
            onChange={(value) => onChange('outputCount', String(value))}
          />
        </View>
      </SettingsSection>

      {/* 2. ตัวละคร */}
      <SettingsSection
        color={theme.amber}
        icon={Bot}
        theme={theme}
        title="ตัวละคร"
        onApplyAll={() => onApplySection(IMAGE_SECTION_KEYS.character)}
      >
        <View className="gap-2">
          <OptionGroup
            columns={3}
            label="โหมดตัวละคร"
            options={IMAGE_CHARACTER_MODE_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
            theme={theme}
            value={settings.characterMode}
            onChange={(value) => onChange('characterMode', String(value))}
          />
          {settings.characterMode === 'description' ? (
            <SettingInput
              label="อธิบายตัวละคร"
              placeholder="เช่น นางแบบวัยทำงานถือสินค้า"
              theme={theme}
              value={settings.characterDescription}
              onChangeText={(value) => onChange('characterDescription', value)}
            />
          ) : null}
        </View>
      </SettingsSection>

      {/* 3. การสร้าง Prompt */}
      <SettingsSection
        color={theme.amber}
        icon={Sparkles}
        theme={theme}
        title="การสร้าง Prompt"
        onApplyAll={() => onApplySection(IMAGE_SECTION_KEYS.prompt)}
      >
        <View className="gap-2">
          <OptionGroup
            label="โหมด Prompt"
            options={[
              { label: 'Auto Prompt', value: 'auto' },
              { label: 'Manual Prompt', value: 'custom' },
            ]}
            theme={theme}
            value={settings.promptMode}
            onChange={(value) => onChange('promptMode', value as AutoPilotImageSettings['promptMode'])}
          />
          {settings.promptMode === 'custom' ? (
            <SettingInput
              multiline
              label="Prompt กำหนดเอง"
              placeholder="ใส่ prompt รูปภาพสำหรับสินค้านี้"
              theme={theme}
              value={settings.customPrompt}
              onChangeText={(value) => onChange('customPrompt', value)}
            />
          ) : null}
        </View>
      </SettingsSection>

      {/* 4. สไตล์รูปภาพ */}
      <SettingsSection
        color={theme.amber}
        icon={Star}
        theme={theme}
        title="สไตล์รูปภาพ"
        onApplyAll={() => onApplySection(IMAGE_SECTION_KEYS.style)}
      >
        <View className="gap-2">
          <OptionGroup
            columns={4}
            variant="grid"
            label="สไตล์ภาพ"
            options={IMAGE_STYLE_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
            theme={theme}
            value={settings.presetStyle}
            onChange={(value) => onChange('presetStyle', String(value))}
          />
          {settings.presetStyle === 'custom' ? (
            <SettingInput
              label="สไตล์กำหนดเอง"
              placeholder="เช่น cozy creator, premium studio"
              theme={theme}
              value={settings.presetStyleCustom}
              onChangeText={(value) => onChange('presetStyleCustom', value)}
            />
          ) : null}
          <OptionGroup
            label="การแสดงสินค้า"
            options={IMAGE_PRODUCT_DISPLAY_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
            theme={theme}
            value={settings.productDisplayMode}
            onChange={(value) => onChange('productDisplayMode', String(value))}
          />
          <OptionGroup
            columns={5}
            label="การจัดแสง"
            options={IMAGE_DETAIL_OPTIONS
              .filter((option) => option.value !== 'marketplace')
              .map((option) => ({ label: option.label, value: option.value }))}
            theme={theme}
            value={settings.lighting}
            onChange={(value) => onChange('lighting', String(value))}
          />
          {settings.lighting === 'custom' ? (
            <SettingInput
              label="การจัดแสงกำหนดเอง"
              placeholder="เช่น soft window light, cinematic warm light"
              theme={theme}
              value={settings.lightingCustom}
              onChangeText={(value) => onChange('lightingCustom', value)}
            />
          ) : null}
          <View className="flex-row gap-2">
            <OptionGroup
              columns={3}
              label="มุมกล้อง"
              options={IMAGE_FRAME_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
              theme={theme}
              value={settings.frame}
              onChange={(value) => onChange('frame', String(value))}
            />
            <OptionGroup
              columns={3}
              label="ข้อความในภาพ"
              options={IMAGE_TEXT_OVERLAY_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
              theme={theme}
              value={settings.textOverlay}
              onChange={(value) => onChange('textOverlay', String(value))}
            />
          </View>
          {settings.frame === 'custom' ? (
            <SettingInput
              label="มุมกล้องกำหนดเอง"
              placeholder="เช่น hero close-up with product in hand"
              theme={theme}
              value={settings.frameCustom}
              onChangeText={(value) => onChange('frameCustom', value)}
            />
          ) : null}
          {settings.textOverlay === 'custom' ? (
            <SettingInput
              label="ข้อความกำหนดเอง"
              placeholder="เช่น ไม่มีข้อความ หรือ ใส่หัวข้อโปรโมชันสั้น ๆ"
              theme={theme}
              value={settings.textOverlayCustom}
              onChangeText={(value) => onChange('textOverlayCustom', value)}
            />
          ) : null}
        </View>
      </SettingsSection>

      {/* 5. ฉาก */}
      <SettingsSection
        color={theme.amber}
        icon={ImageIcon}
        theme={theme}
        title="ฉาก"
        onApplyAll={() => onApplySection(IMAGE_SECTION_KEYS.scene)}
      >
        <View className="gap-2">
          <OptionGroup
            columns={3}
            label="โหมดฉาก"
            options={IMAGE_SCENE_MODE_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
            theme={theme}
            value={settings.sceneMode}
            onChange={(value) => onChange('sceneMode', String(value))}
          />
          {settings.sceneMode === 'description' ? (
            <SettingInput
              label="อธิบายฉาก"
              placeholder="เช่น ห้องนั่งเล่นสว่าง โต๊ะไม้ โทนอบอุ่น"
              theme={theme}
              value={settings.sceneDescription}
              onChangeText={(value) => onChange('sceneDescription', value)}
            />
          ) : null}
          <OptionGroup
            columns={5}
            label="ฉากหลัก"
            options={IMAGE_DETAIL_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
            theme={theme}
            value={settings.background}
            onChange={(value) => onChange('background', String(value))}
          />
          {settings.background === 'custom' ? (
            <SettingInput
              label="ฉากกำหนดเอง"
              placeholder="เช่น ห้องนั่งเล่นแสงเช้า, โต๊ะขายของ"
              theme={theme}
              value={settings.backgroundCustom}
              onChangeText={(value) => onChange('backgroundCustom', value)}
            />
          ) : null}
        </View>
      </SettingsSection>

      {/* 6. คำสั่งเพิ่มเติม */}
      <SettingsSection
        color={theme.amber}
        icon={Settings2}
        theme={theme}
        title="คำสั่งเพิ่มเติม"
        onApplyAll={() => onApplySection(IMAGE_SECTION_KEYS.additional)}
      >
        <SettingInput
          label="คำสั่งเพิ่มเติม"
          placeholder="เช่น ห้ามมีข้อความบนภาพ"
          theme={theme}
          value={settings.systemPrompt}
          onChangeText={(value) => onChange('systemPrompt', value)}
        />
      </SettingsSection>
    </View>
  );
}

function VideoProductSettingsForm({
  settings,
  theme,
  onApplySection,
  onChange,
}: {
  settings: AutoPilotVideoSettings;
  theme: KubdeeTheme;
  onApplySection: (keys: Array<keyof AutoPilotVideoSettings>) => void;
  onChange: <K extends keyof AutoPilotVideoSettings>(key: K, value: AutoPilotVideoSettings[K]) => void;
}): React.JSX.Element {
  return (
    <View className="gap-5">
      {/* 1. ตั้งค่าพื้นฐาน */}
      <SettingsSection
        color={theme.red}
        icon={SlidersHorizontal}
        theme={theme}
        title="ตั้งค่าพื้นฐาน"
        onApplyAll={() => onApplySection(VIDEO_SECTION_KEYS.basic)}
      >
        <View className="gap-2">
          <OptionGroup
            columns={2}
            label="สัดส่วนภาพ"
            options={VIDEO_ASPECT_RATIO_OPTIONS.map((ratio) => ({ label: ratio, value: ratio }))}
            theme={theme}
            value={settings.aspectRatio}
            onChange={(value) => onChange('aspectRatio', String(value))}
          />
          <View className="flex-row gap-2">
            <OptionGroup
              columns={4}
              label="จำนวน"
              options={OUTPUT_COUNT_OPTIONS.map((count) => ({ label: count, value: count }))}
              theme={theme}
              value={settings.outputCount}
              onChange={(value) => onChange('outputCount', String(value))}
            />
            <OptionGroup
              columns={3}
              label="จำนวนฉาก"
              options={VIDEO_SCENE_OPTIONS.map((count) => ({ label: count, value: count }))}
              theme={theme}
              value={settings.sceneCount}
              onChange={(value) => onChange('sceneCount', String(value))}
            />
          </View>
        </View>
      </SettingsSection>

      {/* 2. ตัวละคร */}
      <SettingsSection
        color={theme.red}
        icon={Bot}
        theme={theme}
        title="ตัวละคร"
        onApplyAll={() => onApplySection(VIDEO_SECTION_KEYS.character)}
      >
        <OptionGroup
          label="โหมดตัวละคร"
          options={VIDEO_CHARACTER_MODE_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
          theme={theme}
          value={settings.characterMode}
          onChange={(value) => onChange('characterMode', String(value))}
        />
      </SettingsSection>

      {/* 3. การสร้าง Prompt */}
      <SettingsSection
        color={theme.red}
        icon={Sparkles}
        theme={theme}
        title="การสร้าง Prompt"
        onApplyAll={() => onApplySection(VIDEO_SECTION_KEYS.prompt)}
      >
        <View className="gap-2">
          <OptionGroup
            label="โหมด Prompt"
            options={[
              { label: 'Auto Prompt', value: 'auto' },
              { label: 'Manual Prompt', value: 'custom' },
            ]}
            theme={theme}
            value={settings.promptMode}
            onChange={(value) => onChange('promptMode', value as AutoPilotVideoSettings['promptMode'])}
          />
          {settings.promptMode === 'custom' ? (
            <SettingInput
              multiline
              label="Prompt กำหนดเอง"
              placeholder="ใส่ prompt วิดีโอสำหรับสินค้านี้"
              theme={theme}
              value={settings.customPrompt}
              onChangeText={(value) => onChange('customPrompt', value)}
            />
          ) : null}
        </View>
      </SettingsSection>

      {/* 4. สไตล์วิดีโอ */}
      <SettingsSection
        color={theme.red}
        icon={Star}
        theme={theme}
        title="สไตล์วิดีโอ"
        onApplyAll={() => onApplySection(VIDEO_SECTION_KEYS.style)}
      >
        <View className="gap-2">
          <SettingInput
            label="สไตล์ภาพวิดีโอ"
            placeholder="เช่น creator review, premium product demo"
            theme={theme}
            value={settings.presetStyle}
            onChangeText={(value) => onChange('presetStyle', value)}
          />
          <View className="flex-row gap-2">
            <SettingInput
              label="การเคลื่อนกล้อง"
              placeholder="เช่น close-up, dolly in"
              theme={theme}
              value={settings.cameraMotion}
              onChangeText={(value) => onChange('cameraMotion', value)}
            />
            <SettingInput
              label="เสียงพากย์"
              placeholder="เช่น ผู้หญิงวัยทำงาน"
              theme={theme}
              value={settings.voiceCharacter}
              onChangeText={(value) => onChange('voiceCharacter', value)}
            />
          </View>
          <SettingInput
            label="สไตล์บทพูด"
            placeholder="เช่น รีวิวสั้นตรงประเด็น, soft sell"
            theme={theme}
            value={settings.scriptStyle}
            onChangeText={(value) => onChange('scriptStyle', value)}
          />
          <OptionGroup
            label="บทพูด"
            options={[
              { label: 'ออโต้', value: 'auto' },
              { label: 'ไม่มี', value: 'none' },
              { label: 'กำหนดเอง', value: 'custom' },
            ]}
            theme={theme}
            value={settings.dialogueMode}
            onChange={(value) => onChange('dialogueMode', value as AutoPilotVideoSettings['dialogueMode'])}
          />
          {settings.dialogueMode === 'custom' ? (
            <SettingInput
              label="บทพูดกำหนดเอง"
              placeholder="ใส่บทพูดภาษาไทยสำหรับ Flow"
              theme={theme}
              value={settings.dialogue}
              onChangeText={(value) => onChange('dialogue', value)}
            />
          ) : null}
          <OptionGroup
            label="เสียงดนตรีและเอฟเฟค"
            options={[
              { label: 'ออโต้', value: 'auto' },
              { label: 'ไม่มี', value: 'none' },
              { label: 'กำหนดเอง', value: 'custom' },
            ]}
            theme={theme}
            value={settings.musicSfxMode}
            onChange={(value) => onChange('musicSfxMode', value as AutoPilotVideoSettings['musicSfxMode'])}
          />
          {settings.musicSfxMode === 'custom' ? (
            <SettingInput
              label="เสียงดนตรีและเอฟเฟคกำหนดเอง"
              placeholder="เช่น upbeat, soft pop, light whoosh"
              theme={theme}
              value={settings.musicSfxCustom}
              onChangeText={(value) => onChange('musicSfxCustom', value)}
            />
          ) : null}
        </View>
      </SettingsSection>

      {/* 5. คำสั่งเพิ่มเติม */}
      <SettingsSection
        color={theme.red}
        icon={Settings2}
        theme={theme}
        title="คำสั่งเพิ่มเติม"
        onApplyAll={() => onApplySection(VIDEO_SECTION_KEYS.additional)}
      >
        <View className="gap-2">
          <SettingInput
            label="คำต้องห้าม"
            placeholder="เช่น ห้ามพูดชื่อแบรนด์คู่แข่ง หรือคำเคลมเกินจริง"
            theme={theme}
            value={settings.forbiddenWords}
            onChangeText={(value) => onChange('forbiddenWords', value)}
          />
          <SettingInput
            label="คำสั่งเพิ่มเติม"
            placeholder="เช่น ห้าม subtitle, เต็มจอ"
            theme={theme}
            value={settings.systemPrompt}
            onChangeText={(value) => onChange('systemPrompt', value)}
          />
        </View>
      </SettingsSection>
    </View>
  );
}

function getRunStatusLabel(status: AutoPilotRunState['status']): string {
  switch (status) {
    case 'running':
      return 'กำลังทำงาน';
    case 'completed':
      return 'เสร็จแล้ว';
    case 'stopped':
      return 'หยุดแล้ว';
    case 'error':
      return 'ผิดพลาด';
    default:
      return 'พร้อมเริ่ม';
  }
}

function getRunStageLabel(stage: string | null): string {
  switch (stage) {
    case 'started':
      return 'เตรียมเปิด Flow';
    case 'round_started':
      return 'เริ่มรอบใหม่';
    case 'product_started':
      return 'เลือกสินค้า';
    case 'step_started':
      return 'เริ่มสร้างงาน';
    case 'submitted':
      return 'ส่งคำสั่งสร้างแล้ว';
    case 'failed':
      return 'สร้างไม่สำเร็จ';
    case 'download_missing':
      return 'ยังไม่พบไฟล์ดาวน์โหลด';
    case 'completed':
      return 'เสร็จแล้ว';
    case 'stopped':
      return 'หยุดแล้ว';
    case 'error':
      return 'ผิดพลาด';
    default:
      return 'รอเริ่มงาน';
  }
}

function getLogTextColor(level: AutoPilotRunState['logs'][number]['level'], theme: KubdeeTheme): string {
  switch (level) {
    case 'error':
      return theme.red;
    case 'success':
      return theme.emerald;
    case 'warning':
      return theme.amber;
    case 'action':
      return theme.blue;
    default:
      return theme.textMuted;
  }
}

function ProgressBlock({
  runState,
  theme,
}: {
  runState: AutoPilotRunState;
  theme: KubdeeTheme;
}): React.JSX.Element {
  const progress = runState.progress;
  const totalWork = Math.max(1, progress.totalRounds * Math.max(1, progress.totalProducts));
  const currentWork = Math.min(
    totalWork,
    Math.max(0, (Math.max(0, progress.currentRound - 1) * Math.max(1, progress.totalProducts)) + progress.currentProduct)
  );
  const progressRatio = runState.status === 'completed' ? 1 : currentWork / totalWork;
  const currentStepLabel =
    progress.currentStep === 'image'
      ? 'รูปภาพ'
      : progress.currentStep === 'video'
        ? 'วิดีโอ'
        : 'ยังไม่เลือกขั้นตอน';

  return (
    <SectionCard theme={theme} icon={Clock3} title="สถานะการทำงาน">
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <View className="min-w-0 flex-1">
            <Text className="text-kd-caption font-medium text-kd-text">
              {getRunStatusLabel(runState.status)} · {getRunStageLabel(progress.currentStage)}
            </Text>
            <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
              {progress.currentProductName || 'ยังไม่มีสินค้าที่กำลังทำ'} · {currentStepLabel}
            </Text>
          </View>
          <Text className="text-kd-caption font-medium text-kd-text">
            {Math.round(progressRatio * 100)}%
          </Text>
        </View>

        <Progress
          value={Math.max(0, Math.min(1, progressRatio)) * 100}
          className="h-2 bg-kd-panel-muted dark:bg-kd-card-muted"
          indicatorClassName="bg-kd-emerald"
        />

        <View className="flex-row gap-2">
          <ProgressMetric color={theme.blue} icon={RefreshCw} label="รอบ" theme={theme} value={`${progress.currentRound}/${progress.totalRounds}`} />
          <ProgressMetric color={theme.emerald} icon={Package} label="สินค้า" theme={theme} value={`${progress.currentProduct}/${progress.totalProducts}`} />
          <ProgressMetric color={theme.amber} icon={ImageIcon} label="รูป" theme={theme} value={`${progress.generatedImages}/${progress.failedImages}`} />
          <ProgressMetric color={theme.red} icon={Video} label="วิดีโอ" theme={theme} value={`${progress.generatedVideos}/${progress.failedVideos}`} />
        </View>
      </View>
    </SectionCard>
  );
}

function ProgressMetric({
  color,
  icon: Icon,
  label,
  theme,
  value,
}: {
  color: string;
  icon: typeof Bot;
  label: string;
  theme: KubdeeTheme;
  value: string;
}): React.JSX.Element {
  return (
    <View className="min-h-[74px] flex-1 items-center justify-center gap-1 rounded-kd-md bg-kd-panel-muted px-1.5 dark:bg-kd-card-muted">
      <View className="h-10 w-10 items-center justify-center rounded-full border px-0.5" style={{ borderColor: alpha(color, 0.55), backgroundColor: alpha(color, theme.isDark ? 0.14 : 0.08) }}>
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} className="text-kd-caption font-medium" style={{ color }}>{value}</Text>
      </View>
      <View className="flex-row items-center gap-1">
        <Icon size={10} color={theme.textSubtle} strokeWidth={2} />
        <Text numberOfLines={1} className="text-kd-micro font-semibold text-kd-text-subtle">{label}</Text>
      </View>
    </View>
  );
}

function SectionCard({
  children,
  icon: Icon,
  theme,
  title,
}: {
  children: React.ReactNode;
  icon: typeof Bot;
  theme: KubdeeTheme;
  title: string;
}): React.JSX.Element {
  return (
    <View className="gap-3 rounded-[14px] border border-kd-border bg-kd-card px-3 py-3">
      <View className="flex-row items-center gap-2">
        <View className="h-8 w-8 items-center justify-center rounded-kd-lg bg-kd-panel-muted dark:bg-kd-card-muted">
          <Icon size={15} color={theme.textMuted} strokeWidth={2} />
        </View>
        <Text className="text-[13px] font-semibold text-kd-text">{title}</Text>
      </View>
      {children}
    </View>
  );
}

function SelectField({
  label,
  options,
  theme,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ label: string; value: OptionValue }>;
  theme: KubdeeTheme;
  value: OptionValue;
  onChange: (value: OptionValue) => void;
}): React.JSX.Element {
  const selectedLabel = options.find((o) => String(o.value) === String(value))?.label ?? '';

  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text className="text-kd-micro font-normal text-kd-text-subtle">{label}</Text>
      <View className="w-full overflow-hidden rounded-kd-lg border border-kd-border bg-kd-input" style={{ height: 36 }}>
        {/* Custom text with correct font */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 10, right: 28, top: 0, bottom: 0, justifyContent: 'center' }}
        >
          <Text className="text-kd-caption font-normal text-kd-text" numberOfLines={1}>
            {selectedLabel}
          </Text>
        </View>
        {/* Cover native arrow + show custom ChevronDown */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 28, backgroundColor: theme.input, justifyContent: 'center', alignItems: 'center' }}
        >
          <ChevronDown size={13} color={theme.textMuted} strokeWidth={2} />
        </View>
        {/* Transparent Picker — handles tap + shows dialog */}
        <Picker
          selectedValue={String(value)}
          onValueChange={(itemValue) => {
            const original = options.find((o) => String(o.value) === String(itemValue));
            if (original) onChange(original.value);
          }}
          mode="dialog"
          dropdownIconColor={theme.input}
          style={{
            color: 'transparent',
            backgroundColor: 'transparent',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        >
          {options.map((option) => (
            <Picker.Item
              key={String(option.value)}
              label={option.label}
              value={String(option.value)}
              color={theme.text}
              style={{ fontSize: 12 }}
            />
          ))}
        </Picker>
      </View>
    </View>
  );
}

function OptionGroup({
  compact = false,
  columns,
  label,
  options,
  theme,
  value,
  variant = 'segmented',
  accent,
  onChange,
  onToggle,
}: {
  compact?: boolean;
  columns?: number;
  label: string;
  options: Array<{ label: string; value: OptionValue }>;
  theme: KubdeeTheme;
  value: OptionValue | OptionValue[];
  variant?: 'segmented' | 'grid';
  accent?: string;
  onChange?: (value: OptionValue) => void;
  onToggle?: (value: OptionValue) => void;
}): React.JSX.Element {
  const contextAccent = useContext(SettingsAccentContext);
  const accentColor = accent ?? contextAccent ?? theme.amber;
  const values = Array.isArray(value) ? value : [value];
  const valueStrings = values.map((item) => String(item));
  const isGrid = variant === 'grid';

  const handleSingleChange = (nextValue: string | undefined): void => {
    if (!nextValue) {
      return;
    }

    const originalOption = options.find((option) => String(option.value) === nextValue);
    if (originalOption) {
      onChange?.(originalOption.value);
    }
  };

  const handleMultipleChange = (nextValues: string[]): void => {
    const changedOption = options.find((option) => {
      const optionValue = String(option.value);
      return values.includes(option.value)
        ? !nextValues.includes(optionValue)
        : nextValues.includes(optionValue);
    });

    if (changedOption) {
      onToggle?.(changedOption.value);
    }
  };

  // segmented = light gray track with a white (accent-text) selected pill;
  // grid = individually bordered chips that tint with the accent when selected.
  const trackClass = isGrid
    ? 'flex-row flex-wrap gap-1.5 bg-transparent'
    : 'flex-row flex-wrap gap-0.5 rounded-kd-lg bg-kd-panel-muted p-0.5 dark:bg-kd-card-muted';
  const itemClass = `min-h-[30px] items-center justify-center rounded-kd-md px-2 ${isGrid ? 'border' : ''}`;

  const sizeStyle = columns
    ? { flexBasis: `${100 / columns - 1.5}%` as DimensionValue }
    : isGrid
      ? undefined
      : { flexGrow: 1, flexBasis: 0 as DimensionValue };

  const itemStyle = (active: boolean) => {
    if (isGrid) {
      return [
        sizeStyle,
        active
          ? { borderColor: accentColor, backgroundColor: alpha(accentColor, theme.isDark ? 0.18 : 0.1) }
          : { borderColor: theme.border, backgroundColor: theme.input },
      ];
    }
    return [
      sizeStyle,
      active
        ? {
            backgroundColor: theme.isDark ? theme.input : theme.white,
            shadowColor: theme.shadow,
            shadowOpacity: 0.08,
            shadowRadius: 3,
            elevation: 1,
          }
        : { backgroundColor: 'transparent' },
    ];
  };

  const renderItems = (): React.JSX.Element[] =>
    options.map((option) => {
      const active = values.includes(option.value);
      return (
        <ToggleGroupItem
          accessibilityRole={onToggle ? 'checkbox' : 'button'}
          accessibilityState={{ checked: active, selected: active }}
          key={String(option.value)}
          value={String(option.value)}
          className={itemClass}
          style={itemStyle(active)}
        >
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.78}
            numberOfLines={1}
            className={`${compact ? 'text-kd-micro' : 'text-kd-caption'} font-semibold`}
            style={{ color: active ? accentColor : theme.textSubtle }}
          >
            {option.label}
          </Text>
        </ToggleGroupItem>
      );
    });

  return (
    <View className="min-w-0 flex-1 gap-1.5">
      <Text className="text-kd-micro font-semibold text-kd-text-subtle">{label}</Text>
      {onToggle ? (
        <ToggleGroup
          type="multiple"
          value={valueStrings}
          onValueChange={handleMultipleChange}
          className={trackClass}
        >
          {renderItems()}
        </ToggleGroup>
      ) : (
        <ToggleGroup
          type="single"
          value={String(value)}
          onValueChange={handleSingleChange}
          className={trackClass}
        >
          {renderItems()}
        </ToggleGroup>
      )}
    </View>
  );
}

function ToggleRow({
  label,
  theme,
  value,
  onValueChange,
}: {
  label: string;
  theme: KubdeeTheme;
  value: boolean;
  onValueChange: (value: boolean) => void;
}): React.JSX.Element {
  return (
    <View className="min-h-8 flex-row items-center justify-between gap-2">
      <Text className="min-w-0 flex-1 text-kd-caption font-semibold text-kd-text-muted">{label}</Text>
      <Switch
        checked={value}
        onCheckedChange={onValueChange}
        className={value ? 'bg-black dark:bg-zinc-200' : 'bg-kd-border-strong dark:bg-kd-card-muted'}
      />
    </View>
  );
}

function SettingInput({
  label,
  multiline = false,
  placeholder,
  theme,
  value,
  onChangeText,
}: {
  label: string;
  multiline?: boolean;
  placeholder: string;
  theme: KubdeeTheme;
  value: string;
  onChangeText: (value: string) => void;
}): React.JSX.Element {
  return (
    <View className="min-w-0 flex-1 gap-1.5">
      <Text className="text-kd-micro font-semibold text-kd-text-subtle">{label}</Text>
      {multiline ? (
        <Textarea
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textSubtle}
          className="min-h-[82px] rounded-kd-md border border-kd-border bg-kd-input px-2 py-1.5 text-kd-caption text-kd-text"
          style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
        />
      ) : (
        <Input
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSubtle}
        textAlignVertical="center"
        className="min-h-9 rounded-kd-md border border-kd-border bg-kd-input px-2 py-1.5 text-kd-caption text-kd-text"
        style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
      />
      )}
    </View>
  );
}

function ProductRow({
  index,
  product,
  theme,
  onOpenSettings,
  onRemove,
  onUpdate,
}: {
  index: number;
  product: AutoPilotProduct;
  theme: KubdeeTheme;
  onOpenSettings: () => void;
  onRemove: () => void;
  onUpdate: (field: AutoPilotProductEditableField, value: string) => void;
}): React.JSX.Element {
  const isManualProduct = product.platform === 'manual' || product.id.startsWith('manual-');

  return (
    <View className="flex-row gap-2 rounded-kd-lg border border-kd-border bg-kd-card p-2">
      <Pressable
        accessibilityLabel="ตั้งค่ารายสินค้า"
        accessibilityRole="button"
        onPress={onOpenSettings}
        className="relative overflow-hidden rounded-kd-lg bg-kd-panel-muted dark:bg-kd-card-muted"
        style={{ height: 126, width: 86 }}
      >
        <View className="absolute left-0 top-0 z-10 h-7 min-w-7 items-center justify-center rounded-br-kd-md bg-black/55 px-1">
          <Text className="text-[11px] font-bold text-white">{index + 1}</Text>
        </View>
        {product.preview ? (
          <Image source={{ uri: product.preview }} className="h-full w-full" resizeMode="cover" />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <ImageIcon size={22} color={theme.textSubtle} strokeWidth={1.8} />
          </View>
        )}
      </Pressable>

      <View className="min-w-0 flex-1 gap-0.5">
        <View className="min-w-0 flex-row items-center gap-1">
          <Text className="text-[10px] font-medium text-kd-text-subtle">#</Text>
          {isManualProduct ? (
            <Input
              value={product.productId}
              onChangeText={(value) => onUpdate('productId', value)}
              placeholder="รหัสสินค้า"
              placeholderTextColor={theme.textSubtle}
              className="h-6 min-h-6 flex-1 rounded-none border-0 bg-transparent px-0 py-0 text-[10px] text-kd-text-subtle shadow-none"
              style={{ fontFamily: kubdeeFontFamilies.thai.regular, fontSize: 10, lineHeight: 13, paddingVertical: 0 }}
            />
          ) : (
            <Text
              numberOfLines={1}
              className="min-w-0 flex-1 text-kd-text-subtle"
              style={{ fontSize: 10, lineHeight: 13 }}
            >
              {product.productId || product.catalogId}
            </Text>
          )}
          <Button
            accessibilityLabel="ตั้งค่ารายสินค้า"
            accessibilityRole="button"
            variant="ghost"
            size="icon"
            onPress={onOpenSettings}
            className="h-6 w-6 shrink-0 items-center justify-center rounded-kd-sm"
          >
            <Settings2 size={13} color={theme.textSubtle} strokeWidth={2.2} />
          </Button>
          <Button
            accessibilityLabel="เอาสินค้าออกจาก Auto Pipeline"
            accessibilityRole="button"
            variant="ghost"
            size="icon"
            onPress={onRemove}
            className="h-6 w-6 shrink-0 items-center justify-center rounded-kd-sm"
          >
            <X size={13} color={theme.textSubtle} strokeWidth={2.2} />
          </Button>
        </View>

        <View className="min-w-0 flex-row items-center gap-1">
          <Link2 size={10} color={theme.textSubtle} strokeWidth={2} />
          {isManualProduct ? (
            <Input
              value={product.productUrl}
              onChangeText={(value) => onUpdate('productUrl', value)}
              placeholder="ลิงก์สินค้า"
              placeholderTextColor={theme.textSubtle}
              className="h-6 min-h-6 flex-1 rounded-none border-0 bg-transparent px-0 py-0 text-[10px] text-kd-text-subtle shadow-none"
              style={{ fontFamily: kubdeeFontFamilies.thai.regular, fontSize: 10, lineHeight: 13, paddingVertical: 0 }}
            />
          ) : (
            <Text
              numberOfLines={1}
              className="min-w-0 flex-1 text-kd-text-subtle"
              style={{ color: product.productUrl ? theme.textSubtle : alpha(theme.textSubtle, 0.55), fontSize: 10, lineHeight: 14 }}
            >
              {product.productUrl || 'ลิงก์สินค้า'}
            </Text>
          )}
        </View>

        {isManualProduct ? (
          <Textarea
            value={product.name}
            onChangeText={(value) => onUpdate('name', value)}
            placeholder="ชื่อสินค้า"
            placeholderTextColor={theme.textSubtle}
            numberOfLines={2}
            className="h-[42px] min-h-[42px] rounded-none border-0 bg-transparent px-0 py-0 text-kd-text shadow-none"
            style={{ fontFamily: kubdeeFontFamilies.thai.medium, fontSize: 11, lineHeight: 14, paddingVertical: 0 }}
          />
        ) : (
          <Text
            numberOfLines={2}
            className="min-h-[32px] text-kd-text"
            style={{ fontFamily: kubdeeFontFamilies.thai.medium, fontSize: 11, lineHeight: 14 }}
          >
            {product.name || 'ชื่อสินค้า'}
          </Text>
        )}

        {isManualProduct ? (
          <Input
            value={product.hashtags}
            onChangeText={(value) => onUpdate('hashtags', value)}
            placeholder="#แฮชแท็ก"
            placeholderTextColor={theme.textSubtle}
            className="h-6 min-h-6 rounded-none border-0 bg-transparent px-0 py-0 text-[10px] text-kd-text-subtle shadow-none"
            style={{ fontFamily: kubdeeFontFamilies.thai.regular, fontSize: 10, lineHeight: 13, paddingVertical: 0 }}
          />
        ) : (
          <Text
            numberOfLines={1}
            className="text-kd-text-subtle"
            style={{ color: product.hashtags ? theme.textSubtle : alpha(theme.textSubtle, 0.55), fontSize: 10, lineHeight: 14 }}
          >
            {product.hashtags || '#แฮชแท็ก'}
          </Text>
        )}

        {isManualProduct ? (
          <Input
            value={product.cta}
            onChangeText={(value) => onUpdate('cta', value)}
            placeholder="CTA (Call to Action)"
            placeholderTextColor={theme.textSubtle}
            className="h-6 min-h-6 rounded-none border-0 bg-transparent px-0 py-0 text-[10px] text-kd-text-subtle shadow-none"
            style={{ fontFamily: kubdeeFontFamilies.thai.regular, fontSize: 10, lineHeight: 13, paddingVertical: 0 }}
          />
        ) : (
          <Text
            numberOfLines={1}
            className="text-kd-text-subtle"
            style={{ color: product.cta ? theme.textSubtle : alpha(theme.textSubtle, 0.55), fontSize: 10, lineHeight: 14 }}
          >
            {product.cta || 'CTA (Call to Action)'}
          </Text>
        )}
      </View>
    </View>
  );
}

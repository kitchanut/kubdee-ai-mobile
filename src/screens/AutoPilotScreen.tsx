import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import {
  Bot,
  Check,
  Clock3,
  Image as ImageIcon,
  MonitorPlay,
  Play,
  Search,
  Settings2,
  SlidersHorizontal,
  Square,
  Video,
  Wifi,
  X,
} from 'lucide-react-native';

import {
  AUTO_PILOT_DELAY_OPTIONS,
  AUTO_PILOT_ROUND_OPTIONS,
  AUTO_PILOT_STEPS,
  DEFAULT_AUTO_PILOT_IMAGE_SETTINGS,
  DEFAULT_AUTO_PILOT_VIDEO_SETTINGS,
  FLOW_IMAGE_MODELS,
  FLOW_VIDEO_MODELS,
  IMAGE_ASPECT_RATIO_OPTIONS,
  IMAGE_DETAIL_OPTIONS,
  IMAGE_STYLE_OPTIONS,
  OUTPUT_COUNT_OPTIONS,
  VIDEO_ASPECT_RATIO_OPTIONS,
  VIDEO_DURATION_OPTIONS,
  VIDEO_SCENE_OPTIONS,
} from '@/autopilot/defaults';
import { getAutoPilotProductId } from '@/autopilot/productAdapter';
import { useAutoPilotController } from '@/autopilot/useAutoPilotController';
import Text from '@/components/ui/KubdeeText';
import { kubdeeFontFamilies } from '@/theme/fonts';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';
import { useLibrary } from '@/library/LibraryContext';
import type { AffiliateProduct } from '@/library/types';
import type { AutoPilotBrowserMode } from '@/autopilot/types';

interface AutoPilotScreenProps {
  selectedProfileId: string;
  theme: KubdeeTheme;
}

type OptionValue = string | number | boolean;

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
  const { products: allProducts, isSyncing, syncProducts } = useLibrary();
  const [searchQuery, setSearchQuery] = useState('');

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

  const visibleProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return profileProducts;
    }

    return profileProducts.filter((product) =>
      [
        product.name,
        product.externalProductId,
        product.localId,
        product.productUrl,
      ].filter(Boolean).join(' ').toLowerCase().includes(query)
    );
  }, [profileProducts, searchQuery]);

  const allVisibleSelected =
    visibleProducts.length > 0 &&
    visibleProducts.every((product) => controller.selectedProductIds.has(getAutoPilotProductId(product)));
  const imageSettings = controller.selectedImageSettings ?? DEFAULT_AUTO_PILOT_IMAGE_SETTINGS;
  const videoSettings = controller.selectedVideoSettings ?? DEFAULT_AUTO_PILOT_VIDEO_SETTINGS;
  const canStart =
    controller.runState.status !== 'running' &&
    selectedProfileId.length > 0 &&
    controller.selectedProducts.length > 0 &&
    controller.enabledSteps.length > 0;

  const toggleAllVisible = (): void => {
    if (allVisibleSelected) {
      controller.clearProducts();
      return;
    }

    controller.selectAllVisibleProducts(visibleProducts);
  };

  return (
    <View className="flex-1 bg-kd-panel">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-3 px-3 pb-28 pt-3">
        <HeaderBlock theme={theme} selectedCount={controller.selectedProducts.length} totalCount={profileProducts.length} />

        <RunnerBlock
          browserMode={controller.settings.browserMode}
          theme={theme}
          onBrowserModeChange={(value) => controller.updateSetting('browserMode', value)}
        />

        <SectionCard theme={theme} icon={Settings2} title="ตั้งค่าพื้นฐาน">
          <View className="gap-2">
            <View className="flex-row gap-2">
              <OptionGroup
                columns={5}
                label="รอบ"
                options={AUTO_PILOT_ROUND_OPTIONS.map((round) => ({ label: String(round), value: round }))}
                theme={theme}
                value={controller.settings.totalRounds}
                onChange={(value) => controller.updateSetting('totalRounds', Number(value))}
              />
              <OptionGroup
                columns={3}
                label="หน่วง"
                options={AUTO_PILOT_DELAY_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
                theme={theme}
                value={controller.settings.delayPreset}
                onChange={(value) => controller.updateSetting('delayPreset', value as typeof controller.settings.delayPreset)}
              />
            </View>

            <OptionGroup
              label="ขั้นตอน"
              options={AUTO_PILOT_STEPS.map((step) => ({ label: step.label, value: step.id }))}
              theme={theme}
              value={controller.enabledSteps}
              onToggle={(value) => controller.toggleStep(value as typeof controller.enabledSteps[number])}
            />

            <OptionGroup
              label="Model รูป"
              options={FLOW_IMAGE_MODELS.map((model) => ({ label: model.label, value: model.value }))}
              theme={theme}
              value={controller.settings.flowImageModel}
              onChange={(value) => controller.updateSetting('flowImageModel', String(value))}
            />

            <OptionGroup
              label="Model วิดีโอ"
              options={FLOW_VIDEO_MODELS.map((model) => ({ label: model.label, value: model.value }))}
              theme={theme}
              value={controller.settings.flowVideoModel}
              onChange={(value) => {
                const nextModel = String(value);
                controller.updateSetting('flowVideoModel', nextModel);
                if (nextModel === 'omni_flash') {
                  controller.updateSetting('flowVideoDuration', 10);
                } else if (controller.settings.flowVideoDuration === 10) {
                  controller.updateSetting('flowVideoDuration', 8);
                }
              }}
            />

            <OptionGroup
              label="ความยาวคลิป"
              options={VIDEO_DURATION_OPTIONS
                .filter((duration) => controller.settings.flowVideoModel === 'omni_flash' || duration !== 10)
                .map((duration) => ({ label: `${duration}s`, value: duration }))}
              theme={theme}
              value={controller.settings.flowVideoDuration}
              onChange={(value) => controller.updateSetting('flowVideoDuration', Number(value))}
            />

            <View className="gap-1 rounded-kd-lg bg-kd-panel-muted p-2 dark:bg-kd-card-muted">
              <ToggleRow
                label="AI Caption/Hashtags"
                theme={theme}
                value={controller.settings.aiGenerateCaption}
                onValueChange={(value) => controller.updateSetting('aiGenerateCaption', value)}
              />
              {controller.settings.aiGenerateCaption ? (
                <OptionGroup
                  compact
                  label="จำนวน hashtag"
                  options={[1, 2, 3, 4, 5].map((count) => ({ label: String(count), value: count }))}
                  theme={theme}
                  value={controller.settings.aiHashtagCount}
                  onChange={(value) => controller.updateSetting('aiHashtagCount', Number(value))}
                />
              ) : null}
              <ToggleRow
                label="AI CTA"
                theme={theme}
                value={controller.settings.aiGenerateCta}
                onValueChange={(value) => controller.updateSetting('aiGenerateCta', value)}
              />
              <ToggleRow
                label="AI rewrite prompt เมื่อเสียงล้มเหลว"
                theme={theme}
                value={controller.settings.aiRewritePromptOnAudioFailure}
                onValueChange={(value) => controller.updateSetting('aiRewritePromptOnAudioFailure', value)}
              />
            </View>
          </View>
        </SectionCard>

        <SectionCard theme={theme} icon={ImageIcon} title="ตั้งค่ารูปภาพ">
          <View className="gap-2">
            <View className="flex-row gap-2">
              <OptionGroup
                columns={5}
                label="สัดส่วน"
                options={IMAGE_ASPECT_RATIO_OPTIONS.map((ratio) => ({ label: ratio, value: ratio }))}
                theme={theme}
                value={imageSettings.aspectRatio}
                onChange={(value) => controller.updateSelectedImageSetting('aspectRatio', String(value))}
              />
              <OptionGroup
                columns={4}
                label="จำนวน"
                options={OUTPUT_COUNT_OPTIONS.map((count) => ({ label: count, value: count }))}
                theme={theme}
                value={imageSettings.outputCount}
                onChange={(value) => controller.updateSelectedImageSetting('outputCount', String(value))}
              />
            </View>
            <OptionGroup
              label="สไตล์"
              options={IMAGE_STYLE_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
              theme={theme}
              value={imageSettings.presetStyle}
              onChange={(value) => controller.updateSelectedImageSetting('presetStyle', String(value))}
            />
            <View className="flex-row gap-2">
              <OptionGroup
                columns={5}
                label="ฉาก"
                options={IMAGE_DETAIL_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
                theme={theme}
                value={imageSettings.background}
                onChange={(value) => controller.updateSelectedImageSetting('background', String(value))}
              />
              <OptionGroup
                columns={5}
                label="แสง"
                options={IMAGE_DETAIL_OPTIONS.slice(0, 4).map((option) => ({ label: option.label, value: option.value }))}
                theme={theme}
                value={imageSettings.lighting}
                onChange={(value) => controller.updateSelectedImageSetting('lighting', String(value))}
              />
            </View>
            <SettingInput
              label="คำสั่งรูปเพิ่มเติม"
              placeholder="เช่น ห้ามมีข้อความบนภาพ"
              theme={theme}
              value={imageSettings.systemPrompt}
              onChangeText={(value) => controller.updateSelectedImageSetting('systemPrompt', value)}
            />
          </View>
        </SectionCard>

        <SectionCard theme={theme} icon={Video} title="ตั้งค่าวิดีโอ">
          <View className="gap-2">
            <View className="flex-row gap-2">
              <OptionGroup
                columns={2}
                label="สัดส่วน"
                options={VIDEO_ASPECT_RATIO_OPTIONS.map((ratio) => ({ label: ratio, value: ratio }))}
                theme={theme}
                value={videoSettings.aspectRatio}
                onChange={(value) => controller.updateSelectedVideoSetting('aspectRatio', String(value))}
              />
              <OptionGroup
                columns={4}
                label="จำนวน"
                options={OUTPUT_COUNT_OPTIONS.map((count) => ({ label: count, value: count }))}
                theme={theme}
                value={videoSettings.outputCount}
                onChange={(value) => controller.updateSelectedVideoSetting('outputCount', String(value))}
              />
              <OptionGroup
                columns={3}
                label="ฉาก"
                options={VIDEO_SCENE_OPTIONS.map((count) => ({ label: count, value: count }))}
                theme={theme}
                value={videoSettings.sceneCount}
                onChange={(value) => controller.updateSelectedVideoSetting('sceneCount', String(value))}
              />
            </View>
            <OptionGroup
              label="บทพูด"
              options={[
                { label: 'ออโต้', value: 'auto' },
                { label: 'ไม่มี', value: 'none' },
                { label: 'กำหนดเอง', value: 'custom' },
              ]}
              theme={theme}
              value={videoSettings.dialogueMode}
              onChange={(value) => controller.updateSelectedVideoSetting('dialogueMode', value as typeof videoSettings.dialogueMode)}
            />
            {videoSettings.dialogueMode === 'custom' ? (
              <SettingInput
                label="บทพูดกำหนดเอง"
                placeholder="ใส่บทพูดภาษาไทยสำหรับ Flow"
                theme={theme}
                value={videoSettings.dialogue}
                onChangeText={(value) => controller.updateSelectedVideoSetting('dialogue', value)}
              />
            ) : null}
            <View className="flex-row gap-2">
              <SettingInput
                label="กล้อง"
                placeholder="เช่น close-up, dolly in"
                theme={theme}
                value={videoSettings.cameraMotion}
                onChangeText={(value) => controller.updateSelectedVideoSetting('cameraMotion', value)}
              />
              <SettingInput
                label="เสียง/เพลง"
                placeholder="เช่น upbeat, soft"
                theme={theme}
                value={videoSettings.musicSfxCustom}
                onChangeText={(value) => controller.updateSelectedVideoSetting('musicSfxCustom', value)}
              />
            </View>
            <SettingInput
              label="คำสั่งวิดีโอเพิ่มเติม"
              placeholder="เช่น ห้าม subtitle, เต็มจอ"
              theme={theme}
              value={videoSettings.systemPrompt}
              onChangeText={(value) => controller.updateSelectedVideoSetting('systemPrompt', value)}
            />
          </View>
        </SectionCard>

        <SectionCard theme={theme} icon={SlidersHorizontal} title="สินค้าในคลัง">
          <View className="gap-2">
            <View className="flex-row items-center gap-2">
              <View className="h-8 flex-1 flex-row items-center gap-1.5 rounded-kd-md border border-kd-border bg-kd-input px-2">
                <Search size={12} color={theme.textSubtle} strokeWidth={2} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="ค้นหาสินค้า..."
                  placeholderTextColor={theme.textSubtle}
                  className="h-8 flex-1 p-0 text-kd-caption text-kd-text"
                  style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
                />
                {searchQuery.length > 0 ? (
                  <Pressable accessibilityLabel="ล้างคำค้นหา" accessibilityRole="button" onPress={() => setSearchQuery('')}>
                    <X size={12} color={theme.textSubtle} strokeWidth={2.5} />
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void syncProducts();
                }}
                className="h-8 w-8 items-center justify-center rounded-kd-md border border-kd-border bg-kd-input"
              >
                {isSyncing ? (
                  <ActivityIndicator color={theme.textSubtle} size="small" />
                ) : (
                  <Wifi size={14} color={theme.textSubtle} strokeWidth={2} />
                )}
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allVisibleSelected }}
              onPress={toggleAllVisible}
              className="min-h-7 flex-row items-center justify-between rounded-kd-md bg-kd-panel-muted px-2 dark:bg-kd-card-muted"
            >
              <Text className="text-kd-caption font-semibold text-kd-text">
                เลือกสินค้าที่เห็น
              </Text>
              <Text className="text-kd-caption text-kd-text-subtle">
                {controller.selectedProducts.length} / {visibleProducts.length}
              </Text>
            </Pressable>

            <View className="gap-2">
              {visibleProducts.map((product) => (
                <ProductRow
                  key={getAutoPilotProductId(product)}
                  product={product}
                  selected={controller.selectedProductIds.has(getAutoPilotProductId(product))}
                  theme={theme}
                  onPress={() => controller.toggleProduct(getAutoPilotProductId(product))}
                />
              ))}
            </View>

            {profileProducts.length === 0 ? (
              <View className="items-center gap-2 py-8">
                <Bot size={26} color={theme.textSubtle} strokeWidth={1.8} />
                <Text className="text-kd-caption text-kd-text-subtle">ยังไม่มีสินค้าในโปรไฟล์นี้</Text>
              </View>
            ) : null}
          </View>
        </SectionCard>

        {controller.runState.logs.length > 0 ? (
          <SectionCard theme={theme} icon={Clock3} title="Activity Log">
            <View className="gap-1">
              {controller.runState.logs.slice(-8).map((log) => (
                <View key={log.id} className="flex-row gap-2 rounded-kd-md bg-kd-panel-muted px-2 py-1.5 dark:bg-kd-card-muted">
                  <Text className="w-[56px] text-kd-micro text-kd-text-subtle">{formatTime(log.timestamp)}</Text>
                  <Text className={`flex-1 text-kd-caption leading-4 ${log.level === 'error' ? 'text-kd-red' : log.level === 'success' ? 'text-kd-emerald' : 'text-kd-text-muted'}`}>
                    {log.message}
                  </Text>
                </View>
              ))}
            </View>
          </SectionCard>
        ) : null}
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 border-t border-kd-border bg-kd-panel px-3 pb-3 pt-2">
        <Pressable
          accessibilityRole="button"
          disabled={!canStart && controller.runState.status !== 'running'}
          onPress={() => {
            if (controller.runState.status === 'running') {
              void controller.stopRun();
              return;
            }
            void controller.startRun();
          }}
          className={`h-11 flex-row items-center justify-center gap-2 rounded-kd-lg ${
            controller.runState.status === 'running'
              ? 'bg-kd-red'
              : canStart
                ? 'bg-kd-text'
                : 'bg-kd-border'
          }`}
        >
          {controller.runState.status === 'running' ? (
            <Square size={15} color={theme.white} fill={theme.white} strokeWidth={2} />
          ) : (
            <Play size={15} color={theme.isDark ? '#000000' : theme.white} fill={theme.isDark ? '#000000' : theme.white} strokeWidth={2} />
          )}
          <Text className={`text-kd-body font-black ${controller.runState.status === 'running' ? 'text-white' : theme.isDark && canStart ? 'text-black' : 'text-white'}`}>
            {controller.runState.status === 'running' ? 'หยุด Auto Pilot' : 'เริ่มสร้างด้วย Google Flow'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function HeaderBlock({
  theme,
  selectedCount,
  totalCount,
}: {
  theme: KubdeeTheme;
  selectedCount: number;
  totalCount: number;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-3 rounded-[14px] border border-kd-border bg-kd-card px-3 py-3">
      <View className="h-10 w-10 items-center justify-center rounded-kd-lg" style={{ backgroundColor: alpha(theme.blue, theme.isDark ? 0.18 : 0.1) }}>
        <Bot size={20} color={theme.blue} strokeWidth={2.2} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-[15px] font-black text-kd-text">Auto Pilot</Text>
        <Text className="text-kd-caption text-kd-text-subtle">Google Flow บนมือถือ · {selectedCount}/{totalCount} สินค้า</Text>
      </View>
      <MonitorPlay size={18} color={theme.textSubtle} strokeWidth={2} />
    </View>
  );
}

function RunnerBlock({
  browserMode,
  theme,
  onBrowserModeChange,
}: {
  browserMode: AutoPilotBrowserMode;
  theme: KubdeeTheme;
  onBrowserModeChange: (value: AutoPilotBrowserMode) => void;
}): React.JSX.Element {
  return (
    <SectionCard theme={theme} icon={MonitorPlay} title="Google Flow บนมือถือ">
      <View className="gap-2">
        <View className="rounded-kd-lg bg-kd-panel-muted px-2.5 py-2 dark:bg-kd-card-muted">
          <Text className="text-kd-caption font-semibold leading-4 text-kd-text-muted">
            Standalone · ใช้ browser และ Accessibility บนเครื่องมือถือ
          </Text>
        </View>
        <OptionGroup
          label="Browser"
          options={[
            { label: 'Chrome', value: 'chrome' },
            { label: 'Browser ปริยาย', value: 'default' },
          ]}
          theme={theme}
          value={browserMode}
          onChange={(value) => onBrowserModeChange(value as AutoPilotBrowserMode)}
        />
      </View>
    </SectionCard>
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
        <Text className="text-[13px] font-black text-kd-text">{title}</Text>
      </View>
      {children}
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
  onChange,
  onToggle,
}: {
  compact?: boolean;
  columns?: number;
  label: string;
  options: Array<{ label: string; value: OptionValue }>;
  theme: KubdeeTheme;
  value: OptionValue | OptionValue[];
  onChange?: (value: OptionValue) => void;
  onToggle?: (value: OptionValue) => void;
}): React.JSX.Element {
  const values = Array.isArray(value) ? value : [value];

  return (
    <View className="min-w-0 flex-1 gap-1.5">
      <Text className="text-kd-micro font-semibold text-kd-text-subtle">{label}</Text>
      <View className="flex-row flex-wrap gap-1.5">
        {options.map((option) => {
          const active = values.includes(option.value);
          return (
            <Pressable
              accessibilityRole={onToggle ? 'checkbox' : 'button'}
              accessibilityState={onToggle ? { checked: active } : undefined}
              key={String(option.value)}
              onPress={() => {
                if (onToggle) {
                  onToggle(option.value);
                  return;
                }
                onChange?.(option.value);
              }}
              className={`min-h-[26px] items-center justify-center rounded-kd-md border px-2 ${
                active ? 'border-transparent bg-kd-text' : 'border-kd-border bg-kd-input'
              }`}
              style={columns ? { flexBasis: `${100 / columns - 2}%` } : undefined}
            >
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.78}
                numberOfLines={1}
                className={`${compact ? 'text-kd-micro' : 'text-kd-caption'} font-semibold ${
                  active ? 'text-white dark:text-black' : 'text-kd-text-muted'
                }`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
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
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.borderStrong, true: alpha(theme.emerald, 0.45) }}
        thumbColor={value ? theme.emerald : theme.textSubtle}
      />
    </View>
  );
}

function SettingInput({
  label,
  placeholder,
  theme,
  value,
  onChangeText,
}: {
  label: string;
  placeholder: string;
  theme: KubdeeTheme;
  value: string;
  onChangeText: (value: string) => void;
}): React.JSX.Element {
  return (
    <View className="min-w-0 flex-1 gap-1.5">
      <Text className="text-kd-micro font-semibold text-kd-text-subtle">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSubtle}
        className="min-h-9 rounded-kd-md border border-kd-border bg-kd-input px-2 py-1.5 text-kd-caption text-kd-text"
        style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
      />
    </View>
  );
}

function ProductRow({
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
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className={`flex-row items-center gap-2 rounded-[12px] border p-2 ${
        selected ? 'border-kd-emerald/50 bg-kd-emerald/5 dark:bg-kd-emerald/10' : 'border-kd-border bg-kd-panel'
      }`}
    >
      <View className="h-5 w-5 items-center justify-center rounded-full border border-kd-border-strong bg-kd-input">
        {selected ? <Check size={12} color={theme.emerald} strokeWidth={3} /> : null}
      </View>
      <View className="h-12 w-12 overflow-hidden rounded-kd-md bg-kd-panel-muted dark:bg-kd-card-muted">
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} className="h-full w-full" resizeMode="cover" />
        ) : null}
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={2} className="text-kd-caption font-bold leading-4 text-kd-text">
          {product.name}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-kd-micro text-kd-text-subtle">
          {(product.externalProductId || product.localId).slice(0, 24)} · {formatPrice(product.price)}
        </Text>
      </View>
    </Pressable>
  );
}

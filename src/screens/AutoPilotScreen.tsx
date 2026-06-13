import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import {
  Bot,
  ChevronRight,
  Check,
  Clock3,
  Image as ImageIcon,
  MonitorPlay,
  Package,
  Play,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Square,
  Tag,
  Trash2,
  Video,
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
import { useAutoPilotController } from '@/autopilot/useAutoPilotController';
import Text from '@/components/ui/KubdeeText';
import { kubdeeFontFamilies } from '@/theme/fonts';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';
import { useLibrary } from '@/library/LibraryContext';
import type { AffiliateProduct } from '@/library/types';
import type { AutoPilotBrowserMode, AutoPilotRunState, AutoPilotStepType } from '@/autopilot/types';

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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-3 px-3 pb-32 pt-3">
        <HeaderBlock
          enabledStepCount={controller.enabledSteps.length}
          runState={controller.runState}
          selectedCount={controller.selectedProducts.length}
          theme={theme}
          totalCount={profileProducts.length}
        />

        <ProgressBlock runState={controller.runState} theme={theme} />

        <ActivityLogBlock
          runState={controller.runState}
          theme={theme}
          onClear={controller.clearLogs}
          onStop={() => {
            void controller.stopRun();
          }}
        />

        <SectionCard theme={theme} icon={Settings2} title="ตั้งค่าพื้นฐาน">
          <View className="gap-2">
            <RunnerBlock
              browserMode={controller.settings.browserMode}
              theme={theme}
              onBrowserModeChange={(value) => controller.updateSetting('browserMode', value)}
            />

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

        <PipelineStepsBlock
          enabledSteps={controller.enabledSteps}
          theme={theme}
          onToggle={(value) => controller.toggleStep(value)}
        />

        <ProductCatalogBlock
          allVisibleSelected={allVisibleSelected}
          isSyncing={isSyncing}
          profileProducts={profileProducts}
          searchQuery={searchQuery}
          selectedProductIds={controller.selectedProductIds}
          selectedProductsCount={controller.selectedProducts.length}
          theme={theme}
          visibleProducts={visibleProducts}
          onSearchQueryChange={setSearchQuery}
          onSyncProducts={() => {
            void syncProducts();
          }}
          onToggleAllVisible={toggleAllVisible}
          onToggleProduct={(productId) => controller.toggleProduct(productId)}
        />

        <SectionCard theme={theme} icon={ImageIcon} title="ตั้งค่ารูปภาพ">
          <View className="gap-2">
            <OptionGroup
              label="Prompt รูป"
              options={[
                { label: 'ออโต้', value: 'auto' },
                { label: 'กำหนดเอง', value: 'custom' },
              ]}
              theme={theme}
              value={imageSettings.promptMode}
              onChange={(value) => controller.updateSelectedImageSetting('promptMode', value as typeof imageSettings.promptMode)}
            />
            {imageSettings.promptMode === 'custom' ? (
              <SettingInput
                multiline
                label="Prompt รูปกำหนดเอง"
                placeholder="ใส่ prompt รูปภาพทั้งหมดที่ต้องการส่งให้ Google Flow"
                theme={theme}
                value={imageSettings.customPrompt}
                onChangeText={(value) => controller.updateSelectedImageSetting('customPrompt', value)}
              />
            ) : null}
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
            <View className="flex-row gap-2">
              <OptionGroup
                columns={3}
                label="ตัวละคร"
                options={IMAGE_CHARACTER_MODE_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
                theme={theme}
                value={imageSettings.characterMode}
                onChange={(value) => controller.updateSelectedImageSetting('characterMode', String(value))}
              />
              <OptionGroup
                columns={3}
                label="ฉากหลัก"
                options={IMAGE_SCENE_MODE_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
                theme={theme}
                value={imageSettings.sceneMode}
                onChange={(value) => controller.updateSelectedImageSetting('sceneMode', String(value))}
              />
            </View>
            {imageSettings.characterMode === 'description' ? (
              <SettingInput
                label="อธิบายตัวละคร"
                placeholder="เช่น นางแบบวัยทำงานถือสินค้า"
                theme={theme}
                value={imageSettings.characterDescription}
                onChangeText={(value) => controller.updateSelectedImageSetting('characterDescription', value)}
              />
            ) : null}
            {imageSettings.sceneMode === 'description' ? (
              <SettingInput
                label="อธิบายฉาก"
                placeholder="เช่น ห้องนั่งเล่นสว่าง โต๊ะไม้ โทนอบอุ่น"
                theme={theme}
                value={imageSettings.sceneDescription}
                onChangeText={(value) => controller.updateSelectedImageSetting('sceneDescription', value)}
              />
            ) : null}
            <OptionGroup
              label="สไตล์"
              options={IMAGE_STYLE_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
              theme={theme}
              value={imageSettings.presetStyle}
              onChange={(value) => controller.updateSelectedImageSetting('presetStyle', String(value))}
            />
            {imageSettings.presetStyle === 'custom' ? (
              <SettingInput
                label="สไตล์กำหนดเอง"
                placeholder="เช่น cozy creator, premium studio"
                theme={theme}
                value={imageSettings.presetStyleCustom}
                onChangeText={(value) => controller.updateSelectedImageSetting('presetStyleCustom', value)}
              />
            ) : null}
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
                options={IMAGE_DETAIL_OPTIONS
                  .filter((option) => option.value !== 'marketplace')
                  .map((option) => ({ label: option.label, value: option.value }))}
                theme={theme}
                value={imageSettings.lighting}
                onChange={(value) => controller.updateSelectedImageSetting('lighting', String(value))}
              />
            </View>
            <View className="flex-row gap-2">
              <OptionGroup
                columns={3}
                label="เฟรม"
                options={IMAGE_FRAME_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
                theme={theme}
                value={imageSettings.frame}
                onChange={(value) => controller.updateSelectedImageSetting('frame', String(value))}
              />
              <OptionGroup
                columns={3}
                label="ข้อความ"
                options={IMAGE_TEXT_OVERLAY_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
                theme={theme}
                value={imageSettings.textOverlay}
                onChange={(value) => controller.updateSelectedImageSetting('textOverlay', String(value))}
              />
            </View>
            {imageSettings.background === 'custom' ? (
              <SettingInput
                label="ฉากกำหนดเอง"
                placeholder="เช่น ห้องนั่งเล่นแสงเช้า, โต๊ะขายของ"
                theme={theme}
                value={imageSettings.backgroundCustom}
                onChangeText={(value) => controller.updateSelectedImageSetting('backgroundCustom', value)}
              />
            ) : null}
            {imageSettings.lighting === 'custom' ? (
              <SettingInput
                label="แสงกำหนดเอง"
                placeholder="เช่น soft window light, cinematic warm light"
                theme={theme}
                value={imageSettings.lightingCustom}
                onChangeText={(value) => controller.updateSelectedImageSetting('lightingCustom', value)}
              />
            ) : null}
            {imageSettings.frame === 'custom' ? (
              <SettingInput
                label="เฟรมกำหนดเอง"
                placeholder="เช่น hero close-up with product in hand"
                theme={theme}
                value={imageSettings.frameCustom}
                onChangeText={(value) => controller.updateSelectedImageSetting('frameCustom', value)}
              />
            ) : null}
            {imageSettings.textOverlay === 'custom' ? (
              <SettingInput
                label="ข้อความกำหนดเอง"
                placeholder="เช่น ไม่มีข้อความ หรือ ใส่หัวข้อโปรโมชันสั้น ๆ"
                theme={theme}
                value={imageSettings.textOverlayCustom}
                onChangeText={(value) => controller.updateSelectedImageSetting('textOverlayCustom', value)}
              />
            ) : null}
            <OptionGroup
              label="การโชว์สินค้า"
              options={IMAGE_PRODUCT_DISPLAY_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
              theme={theme}
              value={imageSettings.productDisplayMode}
              onChange={(value) => controller.updateSelectedImageSetting('productDisplayMode', String(value))}
            />
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
            <OptionGroup
              label="Prompt วิดีโอ"
              options={[
                { label: 'ออโต้', value: 'auto' },
                { label: 'กำหนดเอง', value: 'custom' },
              ]}
              theme={theme}
              value={videoSettings.promptMode}
              onChange={(value) => controller.updateSelectedVideoSetting('promptMode', value as typeof videoSettings.promptMode)}
            />
            {videoSettings.promptMode === 'custom' ? (
              <SettingInput
                multiline
                label="Prompt วิดีโอกำหนดเอง"
                placeholder="ใส่ prompt วิดีโอทั้งหมดที่ต้องการส่งให้ Google Flow"
                theme={theme}
                value={videoSettings.customPrompt}
                onChangeText={(value) => controller.updateSelectedVideoSetting('customPrompt', value)}
              />
            ) : null}
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
              label="ตัวละครวิดีโอ"
              options={VIDEO_CHARACTER_MODE_OPTIONS.map((option) => ({ label: option.label, value: option.value }))}
              theme={theme}
              value={videoSettings.characterMode}
              onChange={(value) => controller.updateSelectedVideoSetting('characterMode', String(value))}
            />
            <SettingInput
              label="สไตล์วิดีโอ"
              placeholder="เช่น creator review, premium product demo"
              theme={theme}
              value={videoSettings.presetStyle}
              onChangeText={(value) => controller.updateSelectedVideoSetting('presetStyle', value)}
            />
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
                label="เสียงตัวละคร"
                placeholder="เช่น ผู้หญิงวัยทำงาน, ผู้ชายจริงใจ"
                theme={theme}
                value={videoSettings.voiceCharacter}
                onChangeText={(value) => controller.updateSelectedVideoSetting('voiceCharacter', value)}
              />
            </View>
            <SettingInput
              label="สไตล์สคริปต์"
              placeholder="เช่น รีวิวสั้นตรงประเด็น, soft sell, story telling"
              theme={theme}
              value={videoSettings.scriptStyle}
              onChangeText={(value) => controller.updateSelectedVideoSetting('scriptStyle', value)}
            />
            <OptionGroup
              label="เพลง/SFX"
              options={[
                { label: 'ออโต้', value: 'auto' },
                { label: 'ไม่มี', value: 'none' },
                { label: 'กำหนดเอง', value: 'custom' },
              ]}
              theme={theme}
              value={videoSettings.musicSfxMode}
              onChange={(value) => controller.updateSelectedVideoSetting('musicSfxMode', value as typeof videoSettings.musicSfxMode)}
            />
            {videoSettings.musicSfxMode === 'custom' ? (
              <SettingInput
                label="เพลง/SFX กำหนดเอง"
                placeholder="เช่น upbeat, soft pop, light whoosh"
                theme={theme}
                value={videoSettings.musicSfxCustom}
                onChangeText={(value) => controller.updateSelectedVideoSetting('musicSfxCustom', value)}
              />
            ) : null}
            <SettingInput
              label="คำต้องห้าม"
              placeholder="เช่น ห้ามพูดชื่อแบรนด์คู่แข่ง หรือคำเคลมเกินจริง"
              theme={theme}
              value={videoSettings.forbiddenWords}
              onChangeText={(value) => controller.updateSelectedVideoSetting('forbiddenWords', value)}
            />
            <SettingInput
              label="คำสั่งวิดีโอเพิ่มเติม"
              placeholder="เช่น ห้าม subtitle, เต็มจอ"
              theme={theme}
              value={videoSettings.systemPrompt}
              onChangeText={(value) => controller.updateSelectedVideoSetting('systemPrompt', value)}
            />
          </View>
        </SectionCard>

      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 border-t border-kd-border bg-kd-panel px-3 pb-3 pt-2">
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-kd-micro font-semibold text-kd-text-subtle">
            {controller.selectedProducts.length} สินค้า · {controller.enabledSteps.length} ขั้นตอน · {controller.settings.browserMode === 'chrome' ? 'Chrome' : 'Browser ปริยาย'}
          </Text>
          <Text className="text-kd-micro font-semibold text-kd-text-subtle">
            {controller.runState.status === 'running' ? 'กำลังทำงาน' : canStart ? 'พร้อมเริ่ม' : 'เลือกสินค้า/ขั้นตอนก่อน'}
          </Text>
        </View>
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
  enabledStepCount,
  runState,
  theme,
  selectedCount,
  totalCount,
}: {
  enabledStepCount: number;
  runState: AutoPilotRunState;
  theme: KubdeeTheme;
  selectedCount: number;
  totalCount: number;
}): React.JSX.Element {
  const isRunning = runState.status === 'running';
  const statusColor =
    runState.status === 'error'
      ? theme.red
      : runState.status === 'completed'
        ? theme.emerald
        : isRunning
          ? theme.amber
          : theme.textSubtle;

  return (
    <View className="gap-3 rounded-[14px] border border-kd-border bg-kd-card px-3 py-3">
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-kd-lg" style={{ backgroundColor: alpha(theme.amber, theme.isDark ? 0.18 : 0.12) }}>
          <Bot size={20} color={theme.amber} strokeWidth={2.2} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-black text-kd-text">Auto Pipeline</Text>
          <Text className="text-kd-caption text-kd-text-subtle">Google Flow standalone บนมือถือ</Text>
        </View>
        <View className="flex-row items-center gap-1 rounded-full border border-kd-border bg-kd-input px-2 py-1">
          <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
          <Text className="text-kd-micro font-black text-kd-text-muted">{getRunStatusLabel(runState.status)}</Text>
        </View>
      </View>

      <View className="flex-row gap-2">
        <HeaderMetric label="สินค้า" value={`${selectedCount}/${totalCount}`} theme={theme} />
        <HeaderMetric label="ขั้นตอน" value={String(enabledStepCount)} theme={theme} />
        <HeaderMetric label="Flow" value={runState.progress.currentStep === 'video' ? 'Video' : runState.progress.currentStep === 'image' ? 'Image' : 'Ready'} theme={theme} />
      </View>
    </View>
  );
}

function HeaderMetric({
  label,
  theme,
  value,
}: {
  label: string;
  theme: KubdeeTheme;
  value: string;
}): React.JSX.Element {
  return (
    <View className="min-h-10 flex-1 justify-center rounded-kd-md border border-kd-border bg-kd-input px-2">
      <Text className="text-kd-micro font-semibold text-kd-text-subtle">{label}</Text>
      <Text numberOfLines={1} className="text-kd-caption font-black text-kd-text">{value}</Text>
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
    <View className="gap-2 rounded-kd-lg bg-kd-panel-muted p-2 dark:bg-kd-card-muted">
      <View className="flex-row items-center gap-2">
        <MonitorPlay size={14} color={theme.textMuted} strokeWidth={2} />
        <Text className="flex-1 text-kd-caption font-semibold text-kd-text-muted">
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
          <Text className="text-[13px] font-black text-kd-text">Activity Log</Text>
        </View>
        <View className="flex-row items-center gap-1">
          {isRunning ? (
            <Pressable
              accessibilityLabel="หยุด Auto Pilot"
              accessibilityRole="button"
              onPress={onStop}
              className="h-8 w-8 items-center justify-center rounded-kd-md"
              style={{ backgroundColor: alpha(theme.red, theme.isDark ? 0.18 : 0.1) }}
            >
              <Square size={13} color={theme.red} fill={theme.red} strokeWidth={2} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel="ล้าง Activity Log"
            accessibilityRole="button"
            disabled={logs.length === 0}
            onPress={onClear}
            className="h-8 w-8 items-center justify-center rounded-kd-md bg-kd-panel-muted dark:bg-kd-card-muted"
            style={{ opacity: logs.length === 0 ? 0.45 : 1 }}
          >
            <Trash2 size={14} color={theme.textSubtle} strokeWidth={2} />
          </Pressable>
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
    <SectionCard theme={theme} icon={Sparkles} title="ขั้นตอนการทำงาน">
      <View className="flex-row items-center">
        {AUTO_PILOT_STEPS.map((step, index) => (
          <View key={step.id} className="flex-1 flex-row items-center">
            <PipelineStepButton
              active={enabledSteps.includes(step.id)}
              label={step.id === 'image' ? 'รูปภาพ' : 'วิดีโอ'}
              step={step.id}
              theme={theme}
              onPress={() => onToggle(step.id)}
            />
            {index < AUTO_PILOT_STEPS.length - 1 ? (
              <View className="w-8 items-center">
                <ChevronRight size={16} color={theme.textSubtle} strokeWidth={2.2} />
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </SectionCard>
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
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      className="min-h-[64px] flex-1 items-center justify-center gap-1.5 rounded-kd-lg border px-2"
      style={{
        backgroundColor: active ? alpha(color, theme.isDark ? 0.18 : 0.1) : theme.input,
        borderColor: active ? alpha(color, 0.55) : theme.border,
      }}
    >
      <View className="relative h-8 w-8 items-center justify-center rounded-kd-md" style={{ backgroundColor: active ? alpha(color, 0.16) : theme.panelMuted }}>
        <Icon size={17} color={active ? color : theme.textSubtle} strokeWidth={2.2} />
        {active ? (
          <View className="absolute -right-1 -top-1 h-4 w-4 items-center justify-center rounded-full bg-kd-emerald">
            <Check size={10} color={theme.white} strokeWidth={3} />
          </View>
        ) : null}
      </View>
      <Text className="text-kd-caption font-black" style={{ color: active ? color : theme.textMuted }}>{label}</Text>
    </Pressable>
  );
}

function ProductCatalogBlock({
  allVisibleSelected,
  isSyncing,
  profileProducts,
  searchQuery,
  selectedProductIds,
  selectedProductsCount,
  theme,
  visibleProducts,
  onSearchQueryChange,
  onSyncProducts,
  onToggleAllVisible,
  onToggleProduct,
}: {
  allVisibleSelected: boolean;
  isSyncing: boolean;
  profileProducts: AffiliateProduct[];
  searchQuery: string;
  selectedProductIds: Set<string>;
  selectedProductsCount: number;
  theme: KubdeeTheme;
  visibleProducts: AffiliateProduct[];
  onSearchQueryChange: (value: string) => void;
  onSyncProducts: () => void;
  onToggleAllVisible: () => void;
  onToggleProduct: (productId: string) => void;
}): React.JSX.Element {
  return (
    <SectionCard theme={theme} icon={Package} title={`ข้อมูลสินค้า (${profileProducts.length})`}>
      <View className="gap-2">
        <View className="flex-row items-center gap-2">
          <View className="h-9 flex-1 flex-row items-center gap-1.5 rounded-kd-md border border-kd-border bg-kd-input px-2">
            <Search size={13} color={theme.textSubtle} strokeWidth={2} />
            <TextInput
              value={searchQuery}
              onChangeText={onSearchQueryChange}
              placeholder="ค้นหาสินค้า..."
              placeholderTextColor={theme.textSubtle}
              className="h-9 flex-1 p-0 text-kd-caption text-kd-text"
              style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
            />
            {searchQuery.length > 0 ? (
              <Pressable accessibilityLabel="ล้างคำค้นหา" accessibilityRole="button" onPress={() => onSearchQueryChange('')}>
                <X size={13} color={theme.textSubtle} strokeWidth={2.5} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel="ซิงก์สินค้า"
            accessibilityRole="button"
            onPress={onSyncProducts}
            className="h-9 w-9 items-center justify-center rounded-kd-md border border-kd-border bg-kd-input"
          >
            {isSyncing ? (
              <ActivityIndicator color={theme.textSubtle} size="small" />
            ) : (
              <RefreshCw size={14} color={theme.textSubtle} strokeWidth={2} />
            )}
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: allVisibleSelected }}
          onPress={onToggleAllVisible}
          className="min-h-8 flex-row items-center justify-between rounded-kd-md bg-kd-panel-muted px-2.5 dark:bg-kd-card-muted"
        >
          <View className="flex-row items-center gap-2">
            <Tag size={13} color={theme.textMuted} strokeWidth={2} />
            <Text className="text-kd-caption font-semibold text-kd-text">เลือกสินค้าที่เห็น</Text>
          </View>
          <Text className="text-kd-caption font-black text-kd-text-muted">
            {selectedProductsCount} / {visibleProducts.length}
          </Text>
        </Pressable>

        <View className="gap-2">
          {visibleProducts.map((product, index) => (
            <ProductRow
              index={index}
              key={getAutoPilotProductId(product)}
              product={product}
              selected={selectedProductIds.has(getAutoPilotProductId(product))}
              theme={theme}
              onPress={() => onToggleProduct(getAutoPilotProductId(product))}
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
            <Text className="text-kd-caption font-black text-kd-text">
              {getRunStatusLabel(runState.status)} · {getRunStageLabel(progress.currentStage)}
            </Text>
            <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
              {progress.currentProductName || 'ยังไม่มีสินค้าที่กำลังทำ'} · {currentStepLabel}
            </Text>
          </View>
          <Text className="text-kd-caption font-black text-kd-text">
            {Math.round(progressRatio * 100)}%
          </Text>
        </View>

        <View className="h-2 overflow-hidden rounded-full bg-kd-panel-muted dark:bg-kd-card-muted">
          <View
            className="h-full rounded-full bg-kd-emerald"
            style={{ width: `${Math.max(0, Math.min(1, progressRatio)) * 100}%` }}
          />
        </View>

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
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} className="text-kd-caption font-black" style={{ color }}>{value}</Text>
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
        trackColor={{ false: theme.borderStrong, true: alpha(theme.amber, 0.5) }}
        thumbColor={value ? theme.amber : theme.textSubtle}
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
      <TextInput
        multiline={multiline}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSubtle}
        textAlignVertical={multiline ? 'top' : 'center'}
        className={`${multiline ? 'min-h-[82px]' : 'min-h-9'} rounded-kd-md border border-kd-border bg-kd-input px-2 py-1.5 text-kd-caption text-kd-text`}
        style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
      />
    </View>
  );
}

function ProductRow({
  index,
  product,
  selected,
  theme,
  onPress,
}: {
  index: number;
  product: AffiliateProduct;
  selected: boolean;
  theme: KubdeeTheme;
  onPress: () => void;
}): React.JSX.Element {
  const productCode = (product.externalProductId || product.localId).slice(0, 26);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className="flex-row items-stretch gap-2 rounded-[12px] border p-1.5"
      style={{
        backgroundColor: selected ? alpha(theme.emerald, theme.isDark ? 0.12 : 0.06) : theme.panel,
        borderColor: selected ? alpha(theme.emerald, 0.55) : theme.border,
      }}
    >
      <View className="relative h-[76px] w-[76px] overflow-hidden rounded-kd-md border border-kd-border bg-kd-panel-muted dark:bg-kd-card-muted">
        <View className="absolute left-1 top-1 z-10 h-5 min-w-5 items-center justify-center rounded-full border border-kd-border bg-kd-card px-1">
          <Text className="text-kd-micro font-black text-kd-text">{index + 1}</Text>
        </View>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} className="h-full w-full" resizeMode="cover" />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <ImageIcon size={20} color={theme.textSubtle} strokeWidth={1.8} />
          </View>
        )}
      </View>
      <View className="min-w-0 flex-1 justify-between rounded-kd-md border border-kd-border bg-kd-input px-2 py-1.5">
        <View className="min-w-0">
          <Text numberOfLines={2} className="text-kd-caption font-bold leading-4 text-kd-text">
            {product.name}
          </Text>
          <Text numberOfLines={1} className="mt-0.5 text-kd-micro text-kd-text-subtle">
            {productCode}
          </Text>
        </View>
        <View className="mt-1 flex-row items-center justify-between gap-2">
          <Text numberOfLines={1} className="text-kd-caption font-black text-kd-text">
            {formatPrice(product.price)}
          </Text>
          <View className="h-5 w-5 items-center justify-center rounded-full border border-kd-border-strong bg-kd-panel">
            {selected ? <Check size={12} color={theme.emerald} strokeWidth={3} /> : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

import { Image, KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Copy,
  FolderOpen,
  Image as ImageIcon,
  Package,
  RotateCcw,
  Save,
  Video,
  X,
} from 'lucide-react-native';

import Text from '@/components/ui/KubdeeText';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  AutoPilotImageSettings,
  AutoPilotProduct,
  AutoPilotStepType,
  AutoPilotVideoSettings,
} from '@/autopilot/types';
import type { KubdeeTheme } from '@/theme/tokens';

import { SettingsAccentContext, type ProductSettingsTab } from './constants';
import { ImageProductSettingsForm } from './settings/ImageProductSettingsForm';
import { VideoProductSettingsForm } from './settings/VideoProductSettingsForm';

export function ProductSettingsModal({
  bottomInset,
  enabledSteps,
  profileLocalId,
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
  profileLocalId: string;
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
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 bg-black/60 px-3"
        style={{
          // การ์ดลอยเว้นขอบบน/ล่างจอ — โครงเดียวกับ ProductSelectSheet
          paddingTop: Math.max(insets.top + 10, 40),
          paddingBottom: Math.max(bottomInset + 12, 20),
        }}
      >
        <View className="min-h-0 flex-1 overflow-hidden rounded-kd-2xl border border-kd-border bg-kd-panel">
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
                <Text numberOfLines={1} className="text-kd-label font-semibold text-kd-text">
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
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              contentContainerClassName="gap-4 px-3 py-3"
              contentContainerStyle={{ paddingBottom: 72 }}
            >
              {activeTab === 'image' && showImageTab ? (
                <ImageProductSettingsForm
                  profileLocalId={profileLocalId}
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

          <View className="absolute bottom-0 left-0 right-0 flex-row items-center gap-2 border-t border-kd-border bg-kd-panel px-3 py-2">
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
              <Copy size={15} color={theme.textMuted} strokeWidth={2.2} />
              <Text numberOfLines={1} className="text-kd-caption font-medium text-kd-text-muted">
                ทั้งหมด
              </Text>
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

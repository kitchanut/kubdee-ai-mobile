import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronDown, ChevronUp, Settings2 } from 'lucide-react-native';
import { AUTO_PILOT_DELAY_OPTIONS, AUTO_PILOT_INFINITE_ROUNDS, AUTO_PILOT_ROUND_OPTIONS } from '@/autopilot/defaults';
import Text from '@/components/ui/KubdeeText';
import { Switch } from '@/components/ui/switch';
import type { KubdeeTheme } from '@/theme/tokens';
import type { AutoPilotSettings } from '@/autopilot/types';
import { SHOW_SEND_IMAGE_TO_AI, type OptionValue } from '../constants';
import { SelectField } from '../primitives';

export function ExtensionBasicSettingsBlock({
  settings,
  theme,
  onDelayChange,
  onHashtagCountChange,
  onRoundChange,
  onToggleCaption,
  onToggleCta,
  onToggleHashtags,
  onToggleRewrite,
  onToggleDeleteLatestProject,
  onToggleStartNewProject,
  onToggleSendImage,
}: {
  settings: AutoPilotSettings;
  theme: KubdeeTheme;
  onDelayChange: (value: OptionValue) => void;
  onHashtagCountChange: (value: number) => void;
  onRoundChange: (value: OptionValue) => void;
  onToggleCaption: (value: boolean) => void;
  onToggleCta: (value: boolean) => void;
  onToggleHashtags: (value: boolean) => void;
  onToggleRewrite: (value: boolean) => void;
  onToggleDeleteLatestProject: (value: boolean) => void;
  onToggleStartNewProject: (value: boolean) => void;
  onToggleSendImage: (value: boolean) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(true);

  return (
    <View className="gap-2.5">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        className="flex-row items-center justify-between rounded-kd-md px-0.5 py-0.5"
      >
        <View className="flex-row items-center gap-2">
          <Settings2 size={16} color={theme.text} strokeWidth={2} />
          <Text className="text-kd-subtitle font-semibold text-kd-text">ตั้งค่าพื้นฐาน</Text>
        </View>
        <View className="h-5 w-5 items-center justify-center">
          {open ? (
            <ChevronUp size={14} color={theme.textSubtle} strokeWidth={2.2} />
          ) : (
            <ChevronDown size={14} color={theme.textSubtle} strokeWidth={2.2} />
          )}
        </View>
      </Pressable>

      {open ? (
        <>
          <View className="gap-1.5">
            <View className="flex-row gap-2.5">
              <SelectField
                label="จำนวนรอบ"
                options={AUTO_PILOT_ROUND_OPTIONS.map((round) => ({
                  label: round === AUTO_PILOT_INFINITE_ROUNDS ? '∞ ไม่สิ้นสุด' : `${round} รอบ`,
                  value: round,
                }))}
                theme={theme}
                value={settings.totalRounds}
                onChange={onRoundChange}
              />
              <SelectField
                label="หน่วงเวลา"
                options={AUTO_PILOT_DELAY_OPTIONS.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
                theme={theme}
                value={settings.delayPreset}
                onChange={onDelayChange}
              />
            </View>
          </View>

          <View className="gap-0.5">
            <View className="gap-0.5">
              <ExtensionToggleRow
                label="AI คิด Caption"
                theme={theme}
                value={settings.aiGenerateCaption}
                onValueChange={onToggleCaption}
              />
              <ExtensionToggleRow
                label="AI คิด Hashtags"
                rightSlot={settings.aiGenerateHashtags ? (
                  <HashtagCountSelector
                    enabled={settings.aiGenerateHashtags}
                    theme={theme}
                    value={settings.aiHashtagCount}
                    onChange={onHashtagCountChange}
                  />
                ) : null}
                theme={theme}
                value={settings.aiGenerateHashtags}
                onValueChange={onToggleHashtags}
              />
              {SHOW_SEND_IMAGE_TO_AI && (settings.aiGenerateCaption || settings.aiGenerateHashtags) ? (
                <View className="min-h-[24px] flex-row items-center gap-2">
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
              label="AI คิด CTA"
              theme={theme}
              value={settings.aiGenerateCta}
              onValueChange={onToggleCta}
            />
            <ExtensionToggleRow
              label="AI rewrite prompt เมื่อเกิด error"
              theme={theme}
              value={settings.aiRewritePromptOnAudioFailure}
              onValueChange={onToggleRewrite}
            />
            <ExtensionToggleRow
              label="สร้างโปรเจกต์ใหม่ต่อสินค้า"
              theme={theme}
              value={settings.startNewFlowProjectPerProduct}
              onValueChange={onToggleStartNewProject}
            />
            <ExtensionToggleRow
              disabled={!settings.startNewFlowProjectPerProduct}
              label="ลบโปรเจกต์ที่สร้างต่อสินค้า"
              theme={theme}
              value={settings.deleteLatestFlowProjectBeforeNewProject}
              onValueChange={onToggleDeleteLatestProject}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

export function HashtagCountSelector({
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
      <View className="flex-row gap-0.5">
        {[1, 2, 3, 4, 5].map((count) => {
          const active = enabled && count === value;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled: !enabled }}
              disabled={!enabled}
              key={count}
              onPress={() => onChange(count)}
              className={`h-5 min-h-5 w-5 min-w-5 items-center justify-center rounded-full p-0 ${
                active ? 'bg-black dark:bg-white' : 'bg-transparent'
              }`}
              style={{ opacity: enabled ? 1 : 0.45 }}
            >
              <Text className={`text-kd-micro font-semibold ${active ? 'text-white dark:text-black' : 'text-kd-text-subtle'}`}>
                {count}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ExtensionToggleRow({
  disabled = false,
  label,
  rightSlot,
  theme,
  value,
  onValueChange,
}: {
  disabled?: boolean;
  label: string;
  rightSlot?: React.ReactNode;
  theme: KubdeeTheme;
  value: boolean;
  onValueChange: (value: boolean) => void;
}): React.JSX.Element {
  return (
    <View className={`min-h-[24px] flex-row items-center gap-2 ${disabled ? 'opacity-50' : ''}`}>
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
        disabled={disabled}
        checked={value}
        onCheckedChange={onValueChange}
        className={value ? 'bg-black dark:bg-zinc-200' : 'bg-kd-border-strong dark:bg-kd-card-muted'}
      />
    </View>
  );
}

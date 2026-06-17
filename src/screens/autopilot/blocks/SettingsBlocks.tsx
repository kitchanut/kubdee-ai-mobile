import { Pressable, View } from 'react-native';
import { Clock3, Copy, Sparkles, Star } from 'lucide-react-native';
import { AUTO_PILOT_DELAY_OPTIONS, AUTO_PILOT_ROUND_OPTIONS, FLOW_IMAGE_MODELS, FLOW_VIDEO_MODELS, VIDEO_DURATION_OPTIONS } from '@/autopilot/defaults';
import Text from '@/components/ui/KubdeeText';
import { Switch } from '@/components/ui/switch';
import type { KubdeeTheme } from '@/theme/tokens';
import type { AutoPilotSettings } from '@/autopilot/types';
import { SHOW_SEND_IMAGE_TO_AI, type OptionValue } from '../constants';
import { ExtensionSectionTitle, SelectField } from '../primitives';

export function ExtensionBasicSettingsBlock({
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
      <View className="flex-row gap-0.5 rounded-kd-lg bg-kd-panel-muted p-0.5 dark:bg-kd-card-muted">
        {options.map((duration) => {
          const active = duration === value;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={duration}
              onPress={() => onChange(duration)}
              className={`h-[22px] items-center justify-center rounded-kd-md px-2.5 ${
                active ? 'bg-white dark:bg-kd-input' : ''
              }`}
              style={active ? { shadowColor: theme.shadow, shadowOpacity: 0.08, shadowRadius: 4 } : undefined}
            >
              <Text className={`text-kd-micro font-semibold ${active ? 'text-kd-amber' : 'text-kd-text-subtle'}`}>
                {duration}s
              </Text>
            </Pressable>
          );
        })}
      </View>
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

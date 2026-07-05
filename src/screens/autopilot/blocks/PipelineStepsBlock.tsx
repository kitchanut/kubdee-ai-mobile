import { Fragment } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronRight, Check, Image as ImageIcon, Sparkles, Video } from 'lucide-react-native';
import { AUTO_PILOT_STEPS } from '@/autopilot/defaults';
import { FacebookLogo, TikTokLogo, YouTubeLogo } from '@/components/BrandLogos';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';
import type { AutoPilotStepType } from '@/autopilot/types';
import { ExtensionSectionTitle } from '../primitives';

export function PipelineStepsBlock({
  enabledSteps,
  theme,
  onToggle,
}: {
  enabledSteps: AutoPilotStepType[];
  theme: KubdeeTheme;
  onToggle: (value: AutoPilotStepType) => void;
}): React.JSX.Element {
  return (
    <View className="gap-2.5">
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

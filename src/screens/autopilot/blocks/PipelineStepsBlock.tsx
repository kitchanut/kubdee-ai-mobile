import { Fragment } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronRight, Check, Image as ImageIcon, Sparkles, Video } from 'lucide-react-native';
import { AUTO_PILOT_STEPS } from '@/autopilot/defaults';
import { FacebookLogo, ShopeeLogo, TikTokLogo, YouTubeLogo } from '@/components/BrandLogos';
import { FACEBOOK_BLUE, SHOPEE_ORANGE, YOUTUBE_RED } from '@/theme/brandColors';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';
import type { AutoPilotStepType } from '@/autopilot/types';
import { ExtensionSectionTitle } from '../primitives';

export function PipelineStepsBlock({
  enabledSteps,
  shopeeEnabled,
  facebookEnabled,
  youtubeEnabled,
  theme,
  onToggle,
  onToggleShopee,
  onToggleFacebook,
  onToggleYoutube,
}: {
  enabledSteps: AutoPilotStepType[];
  shopeeEnabled: boolean;
  facebookEnabled: boolean;
  youtubeEnabled: boolean;
  theme: KubdeeTheme;
  onToggle: (value: AutoPilotStepType) => void;
  onToggleShopee: () => void;
  onToggleFacebook: () => void;
  onToggleYoutube: () => void;
}): React.JSX.Element {
  return (
    <View className="gap-2.5">
      <ExtensionSectionTitle icon={Sparkles} title="ขั้นตอนการทำงาน" theme={theme} />
      <View className="flex-row items-center pt-1">
        {AUTO_PILOT_STEPS.map((step) => (
          <Fragment key={step.id}>
            <PipelineToggleButton
              active={enabledSteps.includes(step.id)}
              label={step.id === 'image' ? 'รูปภาพ' : 'วิดีโอ'}
              accentColor={step.id === 'image' ? theme.amber : theme.red}
              renderIcon={(color) => {
                const Icon = step.id === 'image' ? ImageIcon : Video;
                return <Icon size={16} color={color} strokeWidth={2} />;
              }}
              theme={theme}
              onPress={() => onToggle(step.id)}
            />
            <View className="flex-1 items-center">
              <ChevronRight size={12} color={theme.border} strokeWidth={2} />
            </View>
          </Fragment>
        ))}
        <PipelineToggleButton
          active={shopeeEnabled}
          label="โพสต์ Shopee"
          accentColor={SHOPEE_ORANGE}
          renderIcon={(color) => <ShopeeLogo size={16} color={color} cutoutColor={theme.input} />}
          theme={theme}
          onPress={onToggleShopee}
        />
        <View className="flex-1 items-center">
          <ChevronRight size={12} color={theme.border} strokeWidth={2} />
        </View>
        <PipelineToggleButton
          active={facebookEnabled}
          label="โพสต์ Facebook"
          accentColor={FACEBOOK_BLUE}
          renderIcon={(color) => <FacebookLogo size={16} color={color} cutoutColor={theme.input} />}
          theme={theme}
          onPress={onToggleFacebook}
        />
        <View className="flex-1 items-center">
          <ChevronRight size={12} color={theme.border} strokeWidth={2} />
        </View>
        <DisabledPipelineIcon icon="tiktok" theme={theme} />
        <View className="flex-1 items-center">
          <ChevronRight size={12} color={theme.border} strokeWidth={2} />
        </View>
        <PipelineToggleButton
          active={youtubeEnabled}
          label="โพสต์ YouTube"
          accentColor={YOUTUBE_RED}
          renderIcon={(color) => <YouTubeLogo size={16} color={color} cutoutColor={theme.input} />}
          theme={theme}
          onPress={onToggleYoutube}
        />
      </View>
    </View>
  );
}

function DisabledPipelineIcon({
  icon,
  theme,
}: {
  icon: 'tiktok' | 'youtube';
  theme: KubdeeTheme;
}): React.JSX.Element {
  const Icon = icon === 'tiktok' ? TikTokLogo : YouTubeLogo;

  return (
    <View className="h-8 w-8 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-input opacity-40">
      <Icon size={16} color={theme.textSubtle} cutoutColor={theme.input} isDark={theme.isDark} />
    </View>
  );
}

function PipelineToggleButton({
  active,
  label,
  accentColor,
  renderIcon,
  theme,
  onPress,
}: {
  active: boolean;
  label: string;
  accentColor: string;
  renderIcon: (color: string) => React.ReactNode;
  theme: KubdeeTheme;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      className="relative h-8 w-8 items-center justify-center rounded-kd-lg border"
      style={{
        backgroundColor: active ? alpha(accentColor, theme.isDark ? 0.18 : 0.1) : theme.input,
        borderColor: active ? alpha(accentColor, 0.55) : theme.border,
      }}
    >
      {renderIcon(active ? accentColor : theme.textSubtle)}
      {active ? (
        <View className="absolute -right-1 -top-1 h-3.5 w-3.5 items-center justify-center rounded-full bg-kd-emerald">
          <Check size={9} color={theme.white} strokeWidth={3} />
        </View>
      ) : null}
    </Pressable>
  );
}

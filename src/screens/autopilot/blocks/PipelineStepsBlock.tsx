import { Fragment } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronRight, Check, Image as ImageIcon, Sparkles, Video } from 'lucide-react-native';
import { AUTO_PILOT_STEPS } from '@/autopilot/defaults';
import { FacebookLogo, InstagramLogo, ShopeeLogo, TikTokLogo, YouTubeLogo } from '@/components/BrandLogos';
import { FACEBOOK_BLUE, INSTAGRAM_PINK, SHOPEE_ORANGE, YOUTUBE_RED } from '@/theme/brandColors';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';
import type { AutoPilotStepType } from '@/autopilot/types';
import { ExtensionSectionTitle } from '../primitives';

export type BufferChannelTab = 'facebook' | 'instagram' | 'youtube';

export function PipelineStepsBlock({
  enabledSteps,
  shopeeEnabled,
  facebookChecked,
  instagramChecked,
  youtubeChecked,
  channelTab,
  theme,
  onToggle,
  onToggleShopee,
  onPressFacebook,
  onPressInstagram,
  onPressYoutube,
}: {
  enabledSteps: AutoPilotStepType[];
  shopeeEnabled: boolean;
  // Facebook/Instagram/YouTube behave as tabs, not toggles: tapping opens
  // that service's channel picker below, and the check badge only appears
  // once a channel is actually selected.
  facebookChecked: boolean;
  instagramChecked: boolean;
  youtubeChecked: boolean;
  channelTab: BufferChannelTab | null;
  theme: KubdeeTheme;
  onToggle: (value: AutoPilotStepType) => void;
  onToggleShopee: () => void;
  onPressFacebook: () => void;
  onPressInstagram: () => void;
  onPressYoutube: () => void;
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
          active={channelTab === 'facebook' || facebookChecked}
          checked={facebookChecked}
          label="โพสต์ Facebook"
          accentColor={FACEBOOK_BLUE}
          renderIcon={(color) => <FacebookLogo size={16} color={color} cutoutColor={theme.input} />}
          theme={theme}
          onPress={onPressFacebook}
        />
        <View className="flex-1 items-center">
          <ChevronRight size={12} color={theme.border} strokeWidth={2} />
        </View>
        <PipelineToggleButton
          active={channelTab === 'instagram' || instagramChecked}
          checked={instagramChecked}
          label="โพสต์ Instagram"
          accentColor={INSTAGRAM_PINK}
          renderIcon={(color) => <InstagramLogo size={16} color={color} />}
          theme={theme}
          onPress={onPressInstagram}
        />
        <View className="flex-1 items-center">
          <ChevronRight size={12} color={theme.border} strokeWidth={2} />
        </View>
        <PipelineToggleButton
          active={channelTab === 'youtube' || youtubeChecked}
          checked={youtubeChecked}
          label="โพสต์ YouTube"
          accentColor={YOUTUBE_RED}
          renderIcon={(color) => <YouTubeLogo size={16} color={color} cutoutColor={theme.input} />}
          theme={theme}
          onPress={onPressYoutube}
        />
        <View className="flex-1 items-center">
          <ChevronRight size={12} color={theme.border} strokeWidth={2} />
        </View>
        <DisabledPipelineIcon icon="tiktok" theme={theme} />
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
  checked,
  label,
  accentColor,
  renderIcon,
  theme,
  onPress,
}: {
  active: boolean;
  // Green check badge; defaults to following `active` (plain toggles), but
  // tab-style buttons highlight while open without being checked yet.
  checked?: boolean;
  label: string;
  accentColor: string;
  renderIcon: (color: string) => React.ReactNode;
  theme: KubdeeTheme;
  onPress: () => void;
}): React.JSX.Element {
  const showCheck = checked ?? active;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: showCheck }}
      onPress={onPress}
      className="relative h-8 w-8 items-center justify-center rounded-kd-lg border"
      style={{
        backgroundColor: active ? alpha(accentColor, theme.isDark ? 0.18 : 0.1) : theme.input,
        borderColor: active ? alpha(accentColor, 0.55) : theme.border,
      }}
    >
      {renderIcon(active ? accentColor : theme.textSubtle)}
      {showCheck ? (
        <View className="absolute -right-1 -top-1 h-3.5 w-3.5 items-center justify-center rounded-full bg-kd-emerald">
          <Check size={9} color={theme.white} strokeWidth={3} />
        </View>
      ) : null}
    </Pressable>
  );
}

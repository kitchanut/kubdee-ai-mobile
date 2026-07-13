import { Pressable, Switch, View } from 'react-native';

import PostSettingsModal from '@/components/post/PostSettingsModal';
import Text from '@/components/ui/KubdeeText';
import type { TikTokPostSettings } from '@/tiktok/tiktokPostSettingsStore';
import { alpha } from '@/theme/tokens';
import type { KubdeeTheme } from '@/theme/tokens';

const TIKTOK_PINK = '#fe2c55';

interface TikTokPostSettingsModalProps {
  onChange: <K extends keyof TikTokPostSettings>(key: K, value: TikTokPostSettings[K]) => void;
  onClose: () => void;
  settings: TikTokPostSettings;
  theme: KubdeeTheme;
  visible: boolean;
}

export default function TikTokPostSettingsModal({
  onChange,
  onClose,
  settings,
  theme,
  visible,
}: TikTokPostSettingsModalProps): React.JSX.Element {
  return (
    <PostSettingsModal onClose={onClose} theme={theme} title="ตั้งค่า TikTok Post" visible={visible}>
      <View className="gap-1.5">
        <Text className="text-kd-caption font-semibold text-kd-text-subtle">รูปแบบการส่ง</Text>
        <View className="flex-row gap-2">
          <PostActionOption
            checked={settings.postAction === 'publish'}
            label="เผยแพร่ทันที"
            onPress={() => onChange('postAction', 'publish')}
            theme={theme}
          />
          <PostActionOption
            checked={settings.postAction === 'draft'}
            label="บันทึกร่าง"
            onPress={() => onChange('postAction', 'draft')}
            theme={theme}
          />
        </View>
      </View>

      <View className="flex-row items-center gap-3 py-1">
        <View className="min-w-0 flex-1">
          <Text className="text-kd-body font-semibold text-kd-text">แนบสินค้า TikTok</Text>
          <Text className="mt-0.5 text-kd-micro text-kd-text-subtle">
            แนบเฉพาะวิดีโอที่ผูกกับสินค้า TikTok และมี Product ID
          </Text>
        </View>
        <Switch
          accessibilityLabel="แนบสินค้า TikTok"
          accessibilityRole="switch"
          onValueChange={(value) => onChange('enableProductLink', value)}
          thumbColor={settings.enableProductLink ? TIKTOK_PINK : theme.textSubtle}
          trackColor={{ false: theme.border, true: alpha(TIKTOK_PINK, 0.55) }}
          value={settings.enableProductLink}
        />
      </View>
    </PostSettingsModal>
  );
}

function PostActionOption({
  checked,
  label,
  onPress,
  theme,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
  theme: KubdeeTheme;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      onPress={onPress}
      className="h-11 flex-1 items-center justify-center rounded-kd-lg border active:opacity-75"
      style={{
        backgroundColor: checked ? alpha(TIKTOK_PINK, theme.isDark ? 0.12 : 0.07) : theme.card,
        borderColor: checked ? TIKTOK_PINK : theme.border,
      }}
    >
      <Text className="text-kd-caption font-semibold" style={{ color: checked ? TIKTOK_PINK : theme.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

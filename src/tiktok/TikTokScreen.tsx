import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { User } from 'lucide-react-native';

import { useAuth } from '@/auth/AuthContext';
import { TikTokLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import TikTokConnectionCard from '@/tiktok/TikTokConnectionCard';
import type { KubdeeTheme } from '@/theme/tokens';

interface TikTokScreenProps {
  profileId: string;
  theme: KubdeeTheme;
}

/**
 * TikTok tab — shows the active profile then the TikTok connection card so the
 * user can log in / manage the TikTok session for that profile (one active
 * profile at a time; each profile keeps its own session).
 */
export default function TikTokScreen({ profileId, theme }: TikTokScreenProps): React.JSX.Element {
  const { syncedProfiles } = useAuth();

  const activeProfile = useMemo(
    () => syncedProfiles.find((profile) => profile.id === profileId) ?? null,
    [profileId, syncedProfiles]
  );
  const profileName = activeProfile?.name ?? '';

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-3 px-3 pb-20 pt-3">
      {/* หัวข้อแท็บ TikTok */}
      <View className="flex-row items-center gap-2">
        <TikTokLogo size={16} isDark={theme.isDark} />
        <Text numberOfLines={1} className="shrink text-kd-caption font-semibold text-kd-text-muted">
          TikTok
        </Text>
      </View>

      {/* โปรไฟล์ที่กำลังใช้งาน */}
      <View className="flex-row items-center gap-2 rounded-kd-xl border border-kd-border bg-kd-panel px-2.5 py-2">
        <View className="h-7 w-7 shrink-0 items-center justify-center rounded-kd-lg bg-kd-panel-muted dark:bg-kd-card-muted">
          <User size={14} color={theme.textSubtle} strokeWidth={2.2} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-kd-tiny font-semibold text-kd-text-subtle">โปรไฟล์ที่ใช้งาน</Text>
          <Text numberOfLines={1} className="mt-px text-kd-body font-semibold text-kd-text">
            {profileName || 'ยังไม่ได้เลือกโปรไฟล์'}
          </Text>
        </View>
      </View>

      <TikTokConnectionCard profileId={profileId} profileName={profileName} theme={theme} />
    </ScrollView>
  );
}

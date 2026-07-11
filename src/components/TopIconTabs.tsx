import type { ComponentType } from 'react';
import {
  FolderOpen,
  ImagePlus,
  Smartphone,
  Star,
  UserCircle,
} from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { FacebookLogo, InstagramLogo, ShopeeLogo, TikTokLogo, YouTubeLogo } from '@/components/BrandLogos';
import type { KubdeeTheme } from '@/theme/tokens';
import type { TabId } from '@/types/navigation';

type TabIconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  isDark?: boolean;
  cutoutColor?: string;
};

const tabs: {
  id: TabId;
  label: string;
  icon: ComponentType<TabIconProps>;
  brandIcon?: boolean;
}[] = [
  { id: 'pipeline', label: 'Auto Pipeline', icon: Star },
  { id: 'image-create', label: 'สร้างภาพ', icon: ImagePlus },
  { id: 'library', label: 'คลัง', icon: FolderOpen },
  { id: 'tiktok', label: 'TikTok', icon: TikTokLogo, brandIcon: true },
  { id: 'shopee', label: 'Shopee', icon: ShopeeLogo, brandIcon: true },
  { id: 'youtube', label: 'YouTube', icon: YouTubeLogo, brandIcon: true },
  { id: 'facebook', label: 'Facebook', icon: FacebookLogo, brandIcon: true },
  { id: 'instagram', label: 'Instagram', icon: InstagramLogo, brandIcon: true },
  { id: 'mobile', label: 'มือถือ', icon: Smartphone },
  { id: 'profile', label: 'โปรไฟล์', icon: UserCircle },
];
interface TopIconTabsProps {
  activeTab: TabId;
  theme: KubdeeTheme;
  onTabChange: (tab: TabId) => void;
}

export default function TopIconTabs({
  activeTab,
  theme,
  onTabChange,
}: TopIconTabsProps): React.JSX.Element {
  return (
    <View className="w-full border-b border-kd-border bg-kd-tab-bar">
      <View className="w-full flex-row justify-between self-stretch px-2 py-[3px]">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          const activeBackground = theme.isDark ? theme.card : theme.white;
          const inactiveIconColor = theme.textSubtle;
          const activeIconColor = theme.isDark ? theme.text : '#111827';
          const iconColor = active ? activeIconColor : inactiveIconColor;
          const cutoutColor = active ? activeBackground : theme.tabBar;

          return (
            <Pressable
              accessibilityLabel={tab.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={tab.id}
              onPress={() => onTabChange(tab.id)}
              className="h-[44px] min-w-0 flex-1 items-center justify-center active:opacity-70"
            >
              <View className="h-[38px] w-[38px] items-center justify-center">
                <View
                  className={`h-[38px] w-[38px] items-center justify-center overflow-hidden rounded-kd-xl border ${
                    active
                      ? 'border-kd-border bg-white dark:bg-kd-card'
                      : 'border-transparent'
                  }`}
                >
                  {tab.brandIcon ? (
                    <Icon size={19} color={iconColor} cutoutColor={cutoutColor} isDark={theme.isDark} />
                  ) : (
                    <Icon size={20} color={iconColor} strokeWidth={2.2} />
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

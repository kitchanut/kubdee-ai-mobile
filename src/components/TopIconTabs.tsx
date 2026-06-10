import type { ComponentType } from 'react';
import {
  Bot,
  FolderOpen,
  Smartphone,
  UserCircle,
} from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { FacebookLogo, ShopeeLogo, TikTokLogo, YouTubeLogo } from '@/components/BrandLogos';
import type { KubdeeTheme } from '@/theme/tokens';
import type { TabId } from '@/types/navigation';

type TabIconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  isDark?: boolean;
  cutoutColor?: string;
};

const tabs: Array<{
  id: TabId;
  label: string;
  icon: ComponentType<TabIconProps>;
  brandIcon?: boolean;
}> = [
  { id: 'pipeline', label: 'Auto Pipeline', icon: Bot },
  { id: 'library', label: 'คลัง', icon: FolderOpen },
  { id: 'tiktok', label: 'TikTok', icon: TikTokLogo, brandIcon: true },
  { id: 'shopee', label: 'Shopee', icon: ShopeeLogo, brandIcon: true },
  { id: 'youtube', label: 'YouTube', icon: YouTubeLogo, brandIcon: true },
  { id: 'facebook', label: 'Facebook', icon: FacebookLogo, brandIcon: true },
  { id: 'mobile', label: 'มือถือ', icon: Smartphone },
  { id: 'profile', label: 'โปรไฟล์', icon: UserCircle },
];
const menuHorizontalPadding = 8;
const activePlateSize = 38;
const activePlateRadius = 12;

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
    <View style={[styles.wrapper, { backgroundColor: theme.tabBar, borderBottomColor: theme.border }]}>
      <View style={styles.content}>
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
              style={({ pressed }) => [
                styles.tab,
                {
                  opacity: pressed ? 0.72 : 1,
                },
              ]}
            >
              <View style={styles.iconShell}>
                <View
                  style={[
                    styles.iconPlate,
                    active
                      ? {
                          backgroundColor: activeBackground,
                          borderColor: theme.border,
                        }
                      : null,
                  ]}
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

const styles = StyleSheet.create({
  content: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: menuHorizontalPadding,
    paddingVertical: 3,
    width: '100%',
  },
  iconPlate: {
    alignItems: 'center',
    borderRadius: activePlateRadius,
    borderWidth: 1,
    borderColor: 'transparent',
    height: activePlateSize,
    justifyContent: 'center',
    overflow: 'hidden',
    width: activePlateSize,
  },
  iconShell: {
    alignItems: 'center',
    height: activePlateSize,
    justifyContent: 'center',
    width: activePlateSize,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    height: 44,
    justifyContent: 'center',
    minWidth: 0,
  },
  wrapper: {
    borderBottomWidth: 1,
    width: '100%',
  },
});

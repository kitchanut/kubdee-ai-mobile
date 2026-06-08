import type { ComponentType } from 'react';
import {
  ChartNoAxesColumn,
  Smartphone,
  UserCircle,
} from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { FacebookLogo, ShopeeLogo, TikTokLogo, YouTubeLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';
import { radii, typography } from '@/theme/tokens';
import type { TabId } from '@/types/navigation';

type TabIconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  isDark?: boolean;
};

const tabs: Array<{
  id: TabId;
  label: string;
  icon: ComponentType<TabIconProps>;
  brandIcon?: boolean;
}> = [
  { id: 'tiktok', label: 'TikTok', icon: TikTokLogo, brandIcon: true },
  { id: 'shopee', label: 'Shopee', icon: ShopeeLogo, brandIcon: true },
  { id: 'youtube', label: 'YouTube', icon: YouTubeLogo, brandIcon: true },
  { id: 'facebook', label: 'Facebook', icon: FacebookLogo, brandIcon: true },
  { id: 'profile', label: 'โปรไฟล์', icon: UserCircle },
  { id: 'mobile', label: 'มือถือ', icon: Smartphone },
  { id: 'logs', label: 'Logs', icon: ChartNoAxesColumn },
];
const menuHorizontalPadding = 8;

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

          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={tab.id}
              onPress={() => onTabChange(tab.id)}
              style={({ pressed }) => [
                styles.tab,
                {
                  backgroundColor: active ? theme.active : 'transparent',
                  opacity: pressed ? 0.72 : 1,
                  shadowColor: theme.shadow,
                },
                active ? styles.activeShadow : null,
              ]}
            >
              <View style={styles.iconSlot}>
                {tab.brandIcon ? (
                  <Icon size={18} isDark={theme.isDark} />
                ) : (
                  <Icon size={16} color={active ? theme.text : theme.textSubtle} strokeWidth={2.2} />
                )}
              </View>
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.82}
                numberOfLines={1}
                style={[styles.label, { color: active ? theme.text : theme.textSubtle }]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  activeShadow: {
    elevation: 2,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.14,
    shadowRadius: 3,
  },
  content: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: menuHorizontalPadding,
    paddingVertical: 6,
    width: '100%',
  },
  label: {
    fontSize: typography.micro,
    fontWeight: '700',
    letterSpacing: 0,
    textAlign: 'center',
  },
  iconSlot: {
    alignItems: 'center',
    height: 18,
    justifyContent: 'center',
    width: '100%',
  },
  tab: {
    alignItems: 'center',
    borderRadius: radii.lg,
    gap: 3,
    height: 48,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 2,
  },
  wrapper: {
    borderBottomWidth: 1,
    width: '100%',
  },
});

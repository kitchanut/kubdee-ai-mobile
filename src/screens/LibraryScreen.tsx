import type { ComponentType } from 'react';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  Image as ImageIcon,
  Presentation,
  ShoppingBag,
  User,
  Video,
} from 'lucide-react-native';

import Text from '@/components/ui/KubdeeText';
import MediaPanel from '@/components/library/MediaPanel';
import ProductPanel from '@/components/library/ProductPanel';
import SimpleListPanel from '@/components/library/SimpleListPanel';
import type { KubdeeTheme } from '@/theme/tokens';

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

interface LibraryScreenProps {
  theme: KubdeeTheme;
}

type LibraryTabId = 'products' | 'images' | 'videos' | 'characters' | 'scenes';

/**
 * Tab set mirrors extension GalleryPanel.jsx:
 * product สินค้า / image รูปภาพ / video วิดีโอ / character ตัวละคร / scene ฉาก
 * Monochrome: active = strong text + 2px underline, inactive = muted gray.
 */
const libraryTabs: Array<{
  id: LibraryTabId;
  label: string;
  icon: ComponentType<IconProps>;
}> = [
  { id: 'products', label: 'สินค้า', icon: ShoppingBag },
  { id: 'images', label: 'รูปภาพ', icon: ImageIcon },
  { id: 'videos', label: 'วิดีโอ', icon: Video },
  { id: 'characters', label: 'ตัวละคร', icon: User },
  { id: 'scenes', label: 'ฉาก', icon: Presentation },
];

export default function LibraryScreen({ theme }: LibraryScreenProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<LibraryTabId>('products');

  return (
    <View style={[styles.container, { backgroundColor: theme.panel }]}>
      {/* Extension: grid-cols-5 bg-gray-50 border-b border-gray-200 (dark: zinc-950 / zinc-800) */}
      <View
        style={[
          styles.tabBar,
          {
            backgroundColor: theme.isDark ? theme.panelMuted : theme.cardMuted,
            borderBottomColor: theme.border,
          },
        ]}
      >
        {libraryTabs.map((tab) => (
          <LibraryTab
            key={tab.id}
            active={tab.id === activeTab}
            icon={tab.icon}
            label={tab.label}
            theme={theme}
            onPress={() => setActiveTab(tab.id)}
          />
        ))}
      </View>

      {activeTab === 'products' ? <ProductPanel theme={theme} /> : null}
      {activeTab === 'images' ? <MediaPanel theme={theme} kind="images" /> : null}
      {activeTab === 'videos' ? <MediaPanel theme={theme} kind="videos" /> : null}
      {activeTab === 'characters' ? <SimpleListPanel theme={theme} kind="characters" /> : null}
      {activeTab === 'scenes' ? <SimpleListPanel theme={theme} kind="scenes" /> : null}
    </View>
  );
}

function LibraryTab({
  active,
  icon: Icon,
  label,
  theme,
  onPress,
}: {
  active: boolean;
  icon: ComponentType<IconProps>;
  label: string;
  theme: KubdeeTheme;
  onPress: () => void;
}): React.JSX.Element {
  const color = active ? theme.text : theme.textSubtle;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={styles.tab}
    >
      <Icon size={13} color={color} strokeWidth={2} />
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        numberOfLines={1}
        style={[
          styles.tabLabel,
          {
            color,
            fontWeight: active ? '600' : '500',
          },
        ]}
      >
        {label}
      </Text>
      {active ? <View style={[styles.tabIndicator, { backgroundColor: theme.text }]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 2,
    paddingVertical: 12,
  },
  tabBar: {
    alignSelf: 'stretch',
    borderBottomWidth: 1,
    flexDirection: 'row',
    width: '100%',
  },
  tabIndicator: {
    bottom: -1,
    height: 2,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  tabLabel: {
    flexShrink: 1,
    fontSize: 10,
    minWidth: 0,
  },
});

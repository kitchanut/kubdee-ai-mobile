import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
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

type LibraryTabId = 'products' | 'images' | 'videos' | 'characters' | 'scenes';
type LibraryTabRequest = { tab: LibraryTabId; requestId: number };

interface LibraryScreenProps {
  initialTabRequest?: LibraryTabRequest | null;
  selectedProfileId: string;
  theme: KubdeeTheme;
  onSendProductsToAutoPilot?: (productIds: string[], profileLocalId: string) => void;
  onSendVideosToShopee?: (videoIds: string[]) => void;
}

/**
 * Tab set mirrors extension GalleryPanel.jsx:
 * product สินค้า / image รูปภาพ / video วิดีโอ / character ตัวละคร / scene ฉาก
 * Monochrome: active = strong text + 2px underline, inactive = muted gray.
 */
const libraryTabs: {
  id: LibraryTabId;
  label: string;
  icon: ComponentType<IconProps>;
}[] = [
  { id: 'products', label: 'สินค้า', icon: ShoppingBag },
  { id: 'images', label: 'รูปภาพ', icon: ImageIcon },
  { id: 'videos', label: 'วิดีโอ', icon: Video },
  { id: 'characters', label: 'ตัวละคร', icon: User },
  { id: 'scenes', label: 'ฉาก', icon: Presentation },
];

export default function LibraryScreen({
  initialTabRequest,
  selectedProfileId,
  theme,
  onSendProductsToAutoPilot,
  onSendVideosToShopee,
}: LibraryScreenProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<LibraryTabId>('products');

  useEffect(() => {
    if (initialTabRequest) {
      setActiveTab(initialTabRequest.tab);
    }
  }, [initialTabRequest]);

  return (
    <View className="flex-1 bg-kd-panel">
      {/* Extension: grid-cols-5 bg-gray-50 border-b border-gray-200 (dark: zinc-950 / zinc-800) */}
      <View className="w-full flex-row self-stretch border-b border-kd-border bg-kd-card-muted dark:bg-kd-panel-muted">
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

      {activeTab === 'products' ? (
        <ProductPanel
          selectedProfileId={selectedProfileId}
          theme={theme}
          onSendProductsToAutoPilot={onSendProductsToAutoPilot}
        />
      ) : null}
      {activeTab === 'images' ? (
        <MediaPanel selectedProfileId={selectedProfileId} theme={theme} kind="images" />
      ) : null}
      {activeTab === 'videos' ? (
        <MediaPanel
          selectedProfileId={selectedProfileId}
          theme={theme}
          kind="videos"
          onSendVideosToShopee={onSendVideosToShopee}
        />
      ) : null}
      {activeTab === 'characters' ? (
        <SimpleListPanel theme={theme} kind="characters" selectedProfileId={selectedProfileId} />
      ) : null}
      {activeTab === 'scenes' ? (
        <SimpleListPanel theme={theme} kind="scenes" selectedProfileId={selectedProfileId} />
      ) : null}
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
      className="min-w-0 flex-1 flex-row items-center justify-center gap-1 px-0.5 py-3"
    >
      <Icon size={13} color={color} strokeWidth={2} />
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        numberOfLines={1}
        className={`min-w-0 flex-shrink text-kd-micro ${
          active ? 'font-semibold text-kd-text' : 'font-medium text-kd-text-subtle'
        }`}
      >
        {label}
      </Text>
      {active ? <View className="absolute -bottom-px left-0 right-0 h-0.5 bg-kd-text" /> : null}
    </Pressable>
  );
}

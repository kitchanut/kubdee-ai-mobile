import type { ComponentType } from 'react';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clapperboard,
  Edit3,
  Eye,
  Film,
  FolderOpen,
  Grid2X2,
  Image as ImageIcon,
  LayoutPanelTop,
  Plus,
  RefreshCw,
  Search,
  Scissors,
  ShoppingBag,
  Trash2,
  Upload,
  UserCircle,
  Video,
} from 'lucide-react-native';

import { TikTokLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import { galleryItems, type GalleryCategoryId, type GalleryItemRecord } from '@/data/mockData';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha, radii, spacing, typography } from '@/theme/tokens';

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

interface LibraryScreenProps {
  theme: KubdeeTheme;
}

type LibraryTabId = 'products' | 'images' | 'videos' | 'characters' | 'scenes';

const sceneCategoryIds: GalleryCategoryId[] = ['multiScene', 'storyboard', 'extendScene', 'videoCut'];

const categoryLabels: Record<GalleryCategoryId, string> = {
  products: 'สินค้า',
  images: 'รูปภาพ',
  videos: 'วิดีโอ',
  multiScene: 'วิดีโอหลายฉาก',
  storyboard: 'สตอรี่บอร์ด',
  extendScene: 'ขยายฉาก',
  videoCut: 'ตัดคลิป',
  characters: 'ตัวละคร',
};

const libraryTabs: Array<{
  id: LibraryTabId;
  label: string;
  title: string;
  tone: GalleryItemRecord['tone'];
  icon: ComponentType<IconProps>;
  categories: GalleryCategoryId[];
}> = [
  { id: 'products', label: 'สินค้า', title: 'คลังสินค้า', tone: 'emerald', icon: ShoppingBag, categories: ['products'] },
  { id: 'images', label: 'รูปภาพ', title: 'คลังรูปภาพ', tone: 'amber', icon: ImageIcon, categories: ['images'] },
  { id: 'videos', label: 'วิดีโอ', title: 'คลังวิดีโอ', tone: 'red', icon: Video, categories: ['videos'] },
  { id: 'characters', label: 'ตัวละคร', title: 'คลังตัวละคร', tone: 'blue', icon: UserCircle, categories: ['characters'] },
  { id: 'scenes', label: 'ฉาก', title: 'คลังฉาก', tone: 'cyan', icon: LayoutPanelTop, categories: sceneCategoryIds },
];

const mockProductStats: Record<string, { price: string; stock: string }> = {
  'prod-luggage': { price: '฿229.00', stock: '3,336 ชิ้น' },
  'prod-skincare': { price: '฿295.00', stock: '9,607 ชิ้น' },
};

const mockMediaCounts: Record<string, string> = {
  'img-luggage-hero': '6 รูป',
  'img-skincare-clean': '1 รูป',
  'vid-luggage-demo': '4 วิดีโอ',
  'vid-skincare-promo': '2 วิดีโอ',
  'scene-luggage-trip': '1 รายการ',
  'storyboard-skincare': '1 รายการ',
  'extend-before-after': '1 รายการ',
  'cut-luggage-ep': '1 รายการ',
};

const mockItemCodes: Record<string, string> = {
  'prod-luggage': 'SHP-1202',
  'prod-skincare': 'SHP-2088',
  'img-luggage-hero': '1730056701093775397',
  'img-skincare-clean': '1729613725777234941',
  'vid-luggage-demo': '1729481018102090199',
  'vid-skincare-promo': '1730056701093775397',
};

const mediaModeLabels = {
  images: ['รูปภาพสินค้า', 'รูปภาพทั่วไป'],
  videos: ['วิดีโอสินค้า', 'วิดีโอทั่วไป'],
};

export default function LibraryScreen({ theme }: LibraryScreenProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<LibraryTabId>('products');
  const [mediaMode, setMediaMode] = useState<'general' | 'product'>('product');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<'code' | 'date' | 'name'>('date');
  const [sortAscending, setSortAscending] = useState(false);
  const activeConfig = libraryTabs.find((tab) => tab.id === activeTab) ?? libraryTabs[0];
  const HeaderIcon = activeConfig.icon;
  const headerTone = getTone(theme, activeConfig.tone);
  const showMediaControls = activeTab === 'images' || activeTab === 'videos';
  const showSearchControls = activeTab === 'products' || showMediaControls;
  const showSimpleList = activeTab === 'characters' || activeTab === 'scenes';

  const totalItems = useMemo(
    () => galleryItems.filter((item) => activeConfig.categories.includes(item.category)),
    [activeConfig.categories]
  );

  const visibleItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return totalItems.filter((item) => {
      if (!query) return true;
      return [item.title, item.subtitle, item.meta, ...item.badges]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [searchQuery, totalItems]);

  const sortedItems = useMemo(() => {
    const next = [...visibleItems];
    next.sort((first, second) => {
      const direction = sortAscending ? 1 : -1;
      if (sortKey === 'name') {
        return direction * first.title.localeCompare(second.title, 'th');
      }
      if (sortKey === 'code') {
        return direction * getItemCode(first).localeCompare(getItemCode(second), 'th');
      }
      return direction * first.id.localeCompare(second.id, 'th');
    });
    return next;
  }, [sortAscending, sortKey, visibleItems]);

  const allSelected = sortedItems.length > 0 && sortedItems.every((item) => selectedIds.has(item.id));

  const toggleAll = (): void => {
    setSelectedIds((current) => {
      if (sortedItems.length === 0) return current;
      if (sortedItems.every((item) => current.has(item.id))) {
        return new Set();
      }
      const next = new Set(current);
      sortedItems.forEach((item) => next.add(item.id));
      return next;
    });
  };

  const changeSort = (nextKey: 'code' | 'date' | 'name'): void => {
    if (sortKey === nextKey) {
      setSortAscending((current) => !current);
      return;
    }
    setSortKey(nextKey);
    setSortAscending(nextKey !== 'date');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.panel }]}>
      <View style={[styles.extensionTabs, { backgroundColor: theme.tabBar, borderBottomColor: theme.border }]}>
        {libraryTabs.map((tab) => {
          const active = tab.id === activeTab;

          return (
            <LibraryTab
              active={active}
              icon={tab.icon}
              key={tab.id}
              label={tab.label}
              theme={theme}
              onPress={() => {
                setActiveTab(tab.id);
                setSearchQuery('');
                setSelectedIds(new Set());
              }}
            />
          );
        })}
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <View style={[styles.panelIcon, { backgroundColor: headerTone.soft }]}>
              <HeaderIcon size={17} color={headerTone.color} strokeWidth={2.2} />
            </View>
            <View style={styles.panelTitleWrap}>
              <View style={styles.panelTitleLine}>
                <Text style={[styles.panelTitle, { color: theme.text }]} numberOfLines={1}>
                  {activeConfig.title}
                </Text>
                <Text style={[styles.panelCount, { color: theme.textSubtle }]}>
                  {visibleItems.length} / {totalItems.length} รายการ
                </Text>
              </View>
            </View>
            <HeaderActions activeTab={activeTab} theme={theme} tone={headerTone} />
          </View>

          {showMediaControls ? (
            <View style={[styles.mediaModeRow, { borderBottomColor: theme.border }]}>
              {(['product', 'general'] as const).map((mode, index) => {
                const active = mediaMode === mode;
                const label = mediaModeLabels[activeTab][index];
                const count = mode === 'product' ? totalItems.length : 0;

                return (
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    key={mode}
                    onPress={() => setMediaMode(mode)}
                    style={[
                      styles.mediaModeTab,
                      {
                        borderBottomColor: active ? headerTone.color : 'transparent',
                      },
                    ]}
                  >
                    <Text style={[styles.mediaModeText, { color: active ? headerTone.color : theme.textSubtle }]}>
                      {label} ({count})
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {showSearchControls ? (
            <View style={styles.searchSection}>
              <View style={styles.controls}>
                <View style={[styles.searchBox, { backgroundColor: theme.input, borderColor: theme.border }]}>
                  <Search size={13} color={theme.textSubtle} strokeWidth={2.2} />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="ค้นหาชื่อ/รหัสสินค้า..."
                    placeholderTextColor={theme.textSubtle}
                    style={[styles.searchInput, { color: theme.text }]}
                  />
                </View>
                {showMediaControls ? (
                  <HeaderAction icon={Grid2X2} label="มุมมองตาราง" theme={theme} accentColor={headerTone.color} accentSoft={headerTone.soft} />
                ) : null}
              </View>

              <View style={styles.listToolsRow}>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: allSelected }} onPress={toggleAll} style={styles.selectAll}>
                  <View
                    style={[
                      styles.selectCircle,
                      {
                        backgroundColor: allSelected ? headerTone.color : theme.card,
                        borderColor: allSelected ? headerTone.color : theme.borderStrong,
                      },
                    ]}
                  >
                    {allSelected ? <CheckCircle2 size={11} color={theme.white} strokeWidth={2.8} /> : null}
                  </View>
                  <Text style={[styles.selectAllText, { color: theme.textSubtle }]}>ทั้งหมด ({sortedItems.length})</Text>
                </Pressable>

                <View style={styles.sortPills}>
                  <SortPill active={sortKey === 'name'} label="ชื่อ" theme={theme} tone={headerTone} onPress={() => changeSort('name')} />
                  <SortPill active={sortKey === 'code'} label="รหัส" theme={theme} tone={headerTone} onPress={() => changeSort('code')} />
                  <SortPill
                    active={sortKey === 'date'}
                    label="วันที่"
                    showDirection
                    sortAscending={sortAscending}
                    theme={theme}
                    tone={headerTone}
                    onPress={() => changeSort('date')}
                  />
                </View>
              </View>
            </View>
          ) : null}

          <View style={styles.list}>
            {sortedItems.map((item) => {
              if (activeTab === 'products') {
                return <ProductCard item={item} key={item.id} selected={selectedIds.has(item.id)} theme={theme} />;
              }

              if (activeTab === 'images' || activeTab === 'videos') {
                return <MediaLibraryCard item={item} key={item.id} theme={theme} />;
              }

              return (
                <SimpleLibraryCard
                  item={item}
                  key={item.id}
                  scene={showSimpleList && activeTab === 'scenes'}
                  theme={theme}
                />
              );
            })}
          </View>

          {sortedItems.length === 0 ? <EmptyState label={activeConfig.title} theme={theme} /> : null}
        </View>
      </ScrollView>
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
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.categoryTab, { borderBottomColor: active ? theme.text : 'transparent' }]}
    >
      <Icon size={13} color={active ? theme.text : theme.textSubtle} strokeWidth={2.2} />
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        numberOfLines={1}
        style={[styles.categoryTabText, { color: active ? theme.text : theme.textSubtle }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function HeaderAction({
  icon: Icon,
  label,
  theme,
  accentColor,
  accentSoft,
}: {
  icon: ComponentType<IconProps>;
  label: string;
  theme: KubdeeTheme;
  accentColor?: string;
  accentSoft?: string;
}): React.JSX.Element {
  const isAccent = Boolean(accentColor && accentSoft);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.headerAction,
        {
          backgroundColor: isAccent ? accentSoft : theme.cardMuted,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <Icon size={12} color={isAccent ? accentColor : theme.textSubtle} strokeWidth={2.2} />
    </Pressable>
  );
}

function HeaderActions({
  activeTab,
  theme,
  tone,
}: {
  activeTab: LibraryTabId;
  theme: KubdeeTheme;
  tone: { color: string; soft: string };
}): React.JSX.Element {
  if (activeTab === 'products') {
    return (
      <View style={styles.toolbar}>
        <HeaderAction icon={RefreshCw} label="รีเฟรช" theme={theme} />
        <HeaderAction icon={Upload} label="อัปโหลด" theme={theme} />
        <Pressable
          accessibilityLabel="ShowCase"
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.showcaseButton,
            {
              backgroundColor: theme.isDark ? theme.white : theme.text,
              opacity: pressed ? 0.78 : 1,
            },
          ]}
        >
          <TikTokLogo size={13} color={theme.isDark ? theme.text : theme.white} />
          <Text style={[styles.showcaseText, { color: theme.isDark ? theme.text : theme.white }]}>ShowCase</Text>
        </Pressable>
      </View>
    );
  }

  if (activeTab === 'characters' || activeTab === 'scenes') {
    return (
      <Pressable
        accessibilityLabel="เพิ่ม"
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.addButton,
          {
            backgroundColor: theme.isDark ? theme.white : theme.text,
            opacity: pressed ? 0.78 : 1,
          },
        ]}
      >
        <Plus size={14} color={theme.isDark ? theme.text : theme.white} strokeWidth={2.4} />
        <Text style={[styles.addButtonText, { color: theme.isDark ? theme.text : theme.white }]}>เพิ่ม</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.toolbar}>
      <HeaderAction icon={Upload} label="อัปโหลด" theme={theme} />
      <HeaderAction icon={RefreshCw} label="รีเฟรช" theme={theme} accentColor={tone.color} accentSoft={tone.soft} />
    </View>
  );
}

function SortPill({
  active,
  label,
  showDirection = false,
  sortAscending = false,
  theme,
  tone,
  onPress,
}: {
  active: boolean;
  label: string;
  showDirection?: boolean;
  sortAscending?: boolean;
  theme: KubdeeTheme;
  tone: { color: string; soft: string };
  onPress: () => void;
}): React.JSX.Element {
  const DirectionIcon = sortAscending ? ChevronUp : ChevronDown;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.sortPill,
        {
          backgroundColor: active ? tone.soft : theme.cardMuted,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <Text style={[styles.sortText, { color: active ? tone.color : theme.textSubtle }]}>{label}</Text>
      {showDirection && active ? <DirectionIcon size={10} color={tone.color} strokeWidth={2.5} /> : null}
    </Pressable>
  );
}

function ProductCard({
  item,
  selected,
  theme,
}: {
  item: GalleryItemRecord;
  selected: boolean;
  theme: KubdeeTheme;
}): React.JSX.Element {
  const Icon = getCategoryIcon(item.category);
  const tone = getDisplayTone(theme, item);
  const stats = mockProductStats[item.id] ?? { price: '฿189.00', stock: '67 ชิ้น' };

  return (
    <Pressable
      accessibilityRole="button"
      className="w-full self-stretch rounded-[10px] px-3 py-2.5"
      style={({ pressed }) => [
        styles.libraryItemCard,
        {
          backgroundColor: selected ? tone.soft : getTintedCard(theme, tone, 0.42),
          borderColor: selected ? alpha(tone.color, 0.45) : theme.border,
          borderWidth: 1,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <View className="w-full flex-row items-center gap-3" style={styles.itemRow}>
        <View style={[styles.largeThumb, { backgroundColor: theme.card, borderColor: alpha(tone.color, 0.18) }]}>
          <Icon size={24} color={tone.color} strokeWidth={2.1} />
        </View>

        <View className="min-w-0 flex-1" style={styles.flexMain}>
          <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.itemCode, { color: theme.textSubtle }]} numberOfLines={1}>
            #{getItemCode(item)}
          </Text>
          <View style={styles.priceLine}>
            <Text style={[styles.priceText, { color: tone.color }]}>{stats.price}</Text>
            <Text style={[styles.dotText, { color: theme.textSubtle }]}>·</Text>
            <Text style={[styles.stockText, { color: theme.textMuted }]}>{stats.stock}</Text>
          </View>
        </View>

        <View className="shrink-0 flex-row gap-2" style={styles.actionRow}>
          <SmallIconButton icon={Edit3} label="แก้ไข" theme={theme} />
          <SmallIconButton icon={Trash2} label="ลบ" theme={theme} />
        </View>
      </View>
    </Pressable>
  );
}

function MediaLibraryCard({ item, theme }: { item: GalleryItemRecord; theme: KubdeeTheme }): React.JSX.Element {
  const Icon = getCategoryIcon(item.category);
  const tone = getDisplayTone(theme, item);
  const count = mockMediaCounts[item.id] ?? '1 รายการ';

  return (
    <Pressable
      accessibilityRole="button"
      className="w-full self-stretch rounded-[10px] px-3 py-2.5"
      style={({ pressed }) => [
        styles.libraryItemCard,
        {
          backgroundColor: getTintedCard(theme, tone, 0.28),
          borderColor: theme.border,
          borderWidth: 1,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <View className="w-full flex-row items-center gap-3" style={styles.itemRow}>
        <View style={[styles.chevronCircle, { backgroundColor: theme.card }]}>
          <ChevronRight size={15} color={theme.textSubtle} strokeWidth={2.4} />
        </View>
        <View style={[styles.mediaThumb, { backgroundColor: tone.soft, borderColor: alpha(tone.color, 0.18) }]}>
          <Icon size={19} color={tone.color} strokeWidth={2.1} />
        </View>
        <View className="min-w-0 flex-1" style={styles.flexMain}>
          <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.itemCode, { color: theme.textSubtle }]} numberOfLines={1}>
            #{getItemCode(item)}
          </Text>
        </View>
        <Text style={[styles.mediaCount, { color: theme.textSubtle }]}>{count}</Text>
      </View>
    </Pressable>
  );
}

function SimpleLibraryCard({
  item,
  scene,
  theme,
}: {
  item: GalleryItemRecord;
  scene: boolean;
  theme: KubdeeTheme;
}): React.JSX.Element {
  const Icon = getCategoryIcon(item.category);
  const tone = getDisplayTone(theme, item);

  return (
    <Pressable
      accessibilityRole="button"
      className="w-full self-stretch rounded-[10px] px-3 py-2.5"
      style={({ pressed }) => [
        styles.libraryItemCard,
        {
          backgroundColor: getTintedCard(theme, tone, 0.22),
          borderColor: theme.border,
          borderWidth: 1,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <View className="w-full flex-row items-center gap-3" style={styles.itemRow}>
        <View style={[styles.simpleThumb, { backgroundColor: tone.soft, borderColor: alpha(tone.color, 0.18) }]}>
          <Icon size={scene ? 24 : 22} color={tone.color} strokeWidth={2.1} />
        </View>
        <View className="min-w-0 flex-1" style={styles.flexMain}>
          <Text style={[styles.simpleTitle, { color: theme.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.simpleMeta, { color: theme.textSubtle }]} numberOfLines={1}>
            {scene ? item.subtitle || 'ไม่ระบุรายละเอียดฉาก' : item.meta}
          </Text>
        </View>
        <View className="shrink-0 flex-row gap-2" style={styles.actionRow}>
          <SmallIconButton active icon={Eye} label="ดู" theme={theme} tone={getTone(theme, 'emerald')} />
          <SmallIconButton icon={Edit3} label="แก้ไข" theme={theme} />
          <SmallIconButton icon={Trash2} label="ลบ" theme={theme} />
        </View>
      </View>
    </Pressable>
  );
}

function SmallIconButton({
  active = false,
  icon: Icon,
  label,
  theme,
  tone,
}: {
  active?: boolean;
  icon: ComponentType<IconProps>;
  label: string;
  theme: KubdeeTheme;
  tone?: { color: string; soft: string };
}): React.JSX.Element {
  const resolvedTone = tone ?? { color: theme.textSubtle, soft: theme.cardMuted };

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.smallIconButton,
        {
          backgroundColor: active ? resolvedTone.soft : alpha(theme.card, theme.isDark ? 0.72 : 0.76),
          opacity: pressed ? 0.74 : 1,
        },
      ]}
    >
      <Icon size={15} color={active ? resolvedTone.color : theme.textSubtle} strokeWidth={2.2} />
    </Pressable>
  );
}

function EmptyState({ label, theme }: { label: string; theme: KubdeeTheme }): React.JSX.Element {
  return (
    <View style={styles.emptyState}>
      <FolderOpen size={24} color={theme.textSubtle} strokeWidth={1.9} />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>ยังไม่มีรายการ</Text>
      <Text style={[styles.emptyCopy, { color: theme.textSubtle }]}>{label} ยังไม่มีข้อมูลตรงกับการค้นหา</Text>
    </View>
  );
}

function getGroupLabel(item: GalleryItemRecord, activeTab: LibraryTabId): string {
  if (activeTab === 'scenes') {
    return categoryLabels[item.category] ?? 'ฉาก';
  }

  const profileLabel = item.subtitle.split('|')[1]?.trim();
  if (profileLabel) {
    return profileLabel;
  }

  if (item.badges.includes('Shopee')) {
    return 'Shopee';
  }

  return activeTab === 'characters' ? 'ตัวละครทั้งหมด' : 'ทั่วไป';
}

function getCategoryIcon(category: GalleryCategoryId): ComponentType<IconProps> {
  switch (category) {
    case 'products':
      return ShoppingBag;
    case 'images':
      return ImageIcon;
    case 'videos':
      return Video;
    case 'multiScene':
      return Film;
    case 'storyboard':
      return LayoutPanelTop;
    case 'extendScene':
      return Clapperboard;
    case 'videoCut':
      return Scissors;
    case 'characters':
      return UserCircle;
    default:
      return FolderOpen;
  }
}

function getItemCode(item: GalleryItemRecord): string {
  if (mockItemCodes[item.id]) {
    return mockItemCodes[item.id];
  }

  return item.subtitle.split('|')[0]?.trim().replace(/^#/, '') || item.id;
}

function getDisplayTone(theme: KubdeeTheme, item: GalleryItemRecord): { color: string; soft: string } {
  switch (item.category) {
    case 'products':
      return getTone(theme, 'emerald');
    case 'images':
      return getTone(theme, 'amber');
    case 'videos':
      return getTone(theme, 'red');
    case 'characters':
      return getTone(theme, 'blue');
    case 'multiScene':
    case 'storyboard':
    case 'extendScene':
    case 'videoCut':
      return getTone(theme, 'cyan');
    default:
      return getTone(theme, item.tone);
  }
}

function getTintedCard(theme: KubdeeTheme, tone: { color: string; soft: string }, _opacity: number): string {
  return theme.isDark ? alpha(tone.color, 0.11) : tone.soft;
}

function getTone(theme: KubdeeTheme, tone: GalleryItemRecord['tone']): { color: string; soft: string } {
  switch (tone) {
    case 'blue':
      return { color: theme.blue, soft: alpha(theme.blue, theme.isDark ? 0.18 : 0.1) };
    case 'cyan':
      return { color: theme.cyan, soft: theme.cyanSoft };
    case 'emerald':
      return { color: theme.emerald, soft: theme.emeraldSoft };
    case 'amber':
      return { color: theme.amber, soft: theme.amberSoft };
    case 'red':
      return { color: theme.red, soft: theme.redSoft };
    case 'orange':
    default:
      return { color: theme.orange, soft: theme.orangeSoft };
  }
}

function getStatus(
  item: GalleryItemRecord,
  theme: KubdeeTheme
): { label: string; color: string; background: string } {
  switch (item.status) {
    case 'active':
      return { label: 'ACTIVE', color: theme.emerald, background: theme.emeraldSoft };
    case 'ready':
      return { label: 'READY', color: theme.blue, background: alpha(theme.blue, theme.isDark ? 0.2 : 0.1) };
    case 'processing':
      return { label: 'RUN', color: theme.orange, background: theme.orangeSoft };
    case 'draft':
    default:
      return { label: 'DRAFT', color: theme.amber, background: theme.amberSoft };
  }
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 6,
    minWidth: 0,
  },
  badgeText: {
    fontSize: typography.tiny,
    fontWeight: '800',
    letterSpacing: 0,
  },
  addButton: {
    alignItems: 'center',
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: 7,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  addButtonText: {
    fontSize: typography.body,
    fontWeight: '900',
    letterSpacing: 0,
  },
  bulkActions: {
    flexDirection: 'row',
    gap: 6,
    marginLeft: 'auto',
  },
  bulkBar: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 15,
    minHeight: 42,
    paddingHorizontal: 10,
  },
  bulkCount: {
    alignItems: 'center',
    borderRadius: 999,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  bulkCountText: {
    fontSize: typography.caption,
    fontWeight: '900',
  },
  bulkText: {
    fontSize: typography.body,
    fontWeight: '900',
  },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: 8,
    minHeight: 112,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  cardAccent: {
    bottom: 0,
    left: 0,
    opacity: 0.72,
    position: 'absolute',
    top: 0,
    width: 3,
  },
  cardActions: {
    flexDirection: 'row',
    flexShrink: 0,
    gap: 4,
  },
  cardFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    paddingLeft: 68,
  },
  cardFooterBadges: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    minWidth: 0,
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
  },
  cardMeta: {
    fontSize: typography.caption,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: 4,
  },
  cardSubtitle: {
    fontSize: typography.caption,
    fontWeight: '600',
    letterSpacing: 0,
    marginTop: 3,
  },
  cardSide: {
    alignItems: 'flex-end',
    alignSelf: 'stretch',
    justifyContent: 'flex-start',
    width: 72,
  },
  cardRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  cardTitle: {
    fontSize: typography.label,
    fontWeight: '900',
    letterSpacing: 0,
  },
  chevronCircle: {
    alignItems: 'center',
    borderRadius: 999,
    elevation: 1,
    height: 28,
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    width: 28,
  },
  dotText: {
    fontSize: typography.body,
    fontWeight: '700',
  },
  itemCode: {
    fontSize: typography.caption,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: 5,
  },
  itemRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  itemTitle: {
    fontSize: typography.label,
    fontWeight: '900',
    letterSpacing: 0,
  },
  largeThumb: {
    alignItems: 'center',
    borderRadius: radii.xl,
    borderWidth: 1,
    flexShrink: 0,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  libraryItemCard: {
    borderRadius: radii.xl,
    elevation: 1,
    minHeight: 82,
    shadowColor: '#000000',
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  listToolsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  mediaCard: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: radii.xl,
    borderWidth: 1,
    elevation: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 80,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    width: '100%',
  },
  mediaCount: {
    flexShrink: 0,
    fontSize: typography.caption,
    fontWeight: '900',
    letterSpacing: 0,
    maxWidth: 58,
    textAlign: 'right',
  },
  mediaInfo: {
    flex: 1,
    minWidth: 0,
  },
  mediaModeRow: {
    borderBottomWidth: 1,
    flexDirection: 'row',
    marginHorizontal: 10,
    marginTop: 8,
  },
  mediaModeTab: {
    alignItems: 'center',
    borderBottomWidth: 2,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
  },
  mediaModeText: {
    fontSize: typography.body,
    fontWeight: '900',
    letterSpacing: 0,
  },
  mediaThumb: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    flexShrink: 0,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  panel: {
    borderRadius: 18,
    gap: 14,
    overflow: 'hidden',
    paddingBottom: 14,
  },
  priceLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    marginTop: 8,
  },
  priceText: {
    fontSize: typography.body,
    fontWeight: '900',
    letterSpacing: 0,
  },
  productActions: {
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8,
  },
  productCard: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: radii.xl,
    borderWidth: 1,
    elevation: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 94,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    width: '100%',
  },
  productInfo: {
    flex: 1,
    minWidth: 0,
  },
  searchSection: {
    gap: 10,
  },
  selectAll: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 26,
  },
  selectAllText: {
    fontSize: typography.body,
    fontWeight: '800',
    letterSpacing: 0,
  },
  selectCircle: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  showcaseButton: {
    alignItems: 'center',
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: 7,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 11,
  },
  showcaseText: {
    fontSize: typography.body,
    fontWeight: '900',
    letterSpacing: 0,
  },
  simpleActions: {
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8,
  },
  simpleCard: {
    alignItems: 'center',
    alignSelf: 'stretch',
    borderRadius: radii.xl,
    borderWidth: 1,
    elevation: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 86,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    width: '100%',
  },
  simpleInfo: {
    flex: 1,
    minWidth: 0,
  },
  simpleMeta: {
    fontSize: typography.caption,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: 5,
  },
  simpleThumb: {
    alignItems: 'center',
    borderRadius: radii.xl,
    borderWidth: 1,
    flexShrink: 0,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  simpleTitle: {
    fontSize: typography.label,
    fontWeight: '900',
    letterSpacing: 0,
  },
  smallIconButton: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  sortPill: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 3,
    minHeight: 23,
    paddingHorizontal: 9,
  },
  sortPills: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  sortText: {
    fontSize: typography.tiny,
    fontWeight: '900',
    letterSpacing: 0,
  },
  stockText: {
    fontSize: typography.body,
    fontWeight: '800',
    letterSpacing: 0,
  },
  categoryCount: {
    fontSize: typography.tiny,
    fontWeight: '900',
    lineHeight: 11,
    textAlign: 'center',
  },
  categoryTab: {
    alignItems: 'center',
    borderBottomWidth: 2,
    flex: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    marginBottom: -1,
    minHeight: 44,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: 1,
    paddingVertical: 11,
  },
  categoryTabText: {
    flexShrink: 1,
    fontSize: typography.body,
    fontWeight: '900',
    letterSpacing: 0,
    minWidth: 0,
  },
  checkBox: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  checkBoxFloating: {
    left: -5,
    position: 'absolute',
    top: -5,
  },
  container: {
    flex: 1,
  },
  content: {
    alignItems: 'stretch',
    gap: spacing.md,
    paddingBottom: 30,
    paddingTop: 14,
  },
  controls: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
  },
  emptyCopy: {
    fontSize: typography.body,
    fontWeight: '600',
    lineHeight: 17,
    maxWidth: 240,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 24,
    paddingVertical: 34,
  },
  emptyTitle: {
    fontSize: typography.label,
    fontWeight: '900',
  },
  extensionTabs: {
    alignSelf: 'stretch',
    borderBottomWidth: 1,
    flexDirection: 'row',
    width: '100%',
  },
  actionRow: {
    flexDirection: 'row',
    flexShrink: 0,
    gap: 8,
  },
  flexMain: {
    flex: 1,
    minWidth: 0,
  },
  filterButton: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  groupBlock: {
    gap: 8,
  },
  groupCount: {
    fontSize: typography.micro,
    fontWeight: '800',
  },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
  },
  groupList: {
    gap: 13,
  },
  groupTitle: {
    fontSize: typography.label,
    fontWeight: '900',
    letterSpacing: 0,
    maxWidth: 190,
  },
  groupTitleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
    minWidth: 0,
  },
  headerAction: {
    alignItems: 'center',
    borderRadius: radii.md,
    flexShrink: 0,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  list: {
    alignSelf: 'stretch',
    gap: 10,
    paddingHorizontal: 10,
    width: '100%',
  },
  panelCount: {
    flexShrink: 0,
    fontSize: typography.caption,
    fontWeight: '800',
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 10,
    paddingTop: 10,
  },
  panelIcon: {
    alignItems: 'center',
    borderRadius: radii.xl,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  panelSub: {
    fontSize: typography.caption,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: 2,
  },
  panelTitle: {
    flexShrink: 1,
    fontSize: typography.label,
    fontWeight: '900',
    letterSpacing: 0,
  },
  panelTitleLine: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
  },
  panelTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  scopeChip: {
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  scopeChipText: {
    fontSize: typography.caption,
    fontWeight: '900',
  },
  scopeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 15,
  },
  scroll: {
    flex: 1,
  },
  searchBox: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    height: 42,
    paddingHorizontal: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: '700',
    height: 42,
    padding: 0,
  },
  segment: {
    alignItems: 'center',
    borderRadius: radii.md,
    flex: 1,
    height: 30,
    justifyContent: 'center',
  },
  segmentActive: {
    alignItems: 'center',
    borderRadius: radii.md,
    flex: 1,
    height: 30,
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: typography.body,
    fontWeight: '900',
  },
  segmentTextActive: {
    fontSize: typography.body,
    fontWeight: '900',
  },
  segmented: {
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    marginHorizontal: 15,
    padding: 4,
  },
  status: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: typography.tiny,
    fontWeight: '900',
    letterSpacing: 0,
  },
  thumb: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  thumbWrap: {
    flexShrink: 0,
    position: 'relative',
  },
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
});

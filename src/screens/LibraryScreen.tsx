import type { ComponentType } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import {
  CheckCircle2,
  Clapperboard,
  Ellipsis,
  Film,
  FolderOpen,
  Image as ImageIcon,
  LayoutPanelTop,
  Layers,
  Plus,
  RefreshCw,
  Scissors,
  ShoppingBag,
  UserCircle,
  Video,
} from 'lucide-react-native';

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

const categories: Array<{
  id: GalleryCategoryId;
  label: string;
  icon: ComponentType<IconProps>;
}> = [
  { id: 'products', label: 'สินค้า', icon: ShoppingBag },
  { id: 'images', label: 'รูปภาพ', icon: ImageIcon },
  { id: 'videos', label: 'วิดีโอ', icon: Video },
  { id: 'multiScene', label: 'วิดีโอหลายฉาก', icon: Film },
  { id: 'storyboard', label: 'สตอรี่บอร์ด', icon: LayoutPanelTop },
  { id: 'extendScene', label: 'ขยายฉาก', icon: Clapperboard },
  { id: 'videoCut', label: 'ตัดคลิป', icon: Scissors },
  { id: 'characters', label: 'ตัวละคร', icon: UserCircle },
];
const otherCategoryIds: GalleryCategoryId[] = ['multiScene', 'storyboard', 'extendScene', 'videoCut'];
const mainCategories: Array<{
  id: GalleryCategoryId | 'other';
  label: string;
  icon: ComponentType<IconProps>;
}> = [
  { id: 'products', label: 'สินค้า', icon: ShoppingBag },
  { id: 'images', label: 'รูปภาพ', icon: ImageIcon },
  { id: 'videos', label: 'วิดีโอ', icon: Video },
  { id: 'characters', label: 'ตัวละคร', icon: UserCircle },
  { id: 'other', label: 'อื่นๆ', icon: Ellipsis },
];
const otherCategories = categories.filter((category) => otherCategoryIds.includes(category.id));

export default function LibraryScreen({ theme }: LibraryScreenProps): React.JSX.Element {
  const otherPickerRef = useRef<Picker<GalleryCategoryId> | null>(null);
  const [activeCategory, setActiveCategory] = useState<GalleryCategoryId>('products');
  const [otherSelectVisible, setOtherSelectVisible] = useState(false);
  const [otherSelectRequest, setOtherSelectRequest] = useState(0);

  const activeLabel = categories.find((category) => category.id === activeCategory)?.label ?? 'คลัง';
  const otherSelectedCategory = otherCategoryIds.includes(activeCategory)
    ? activeCategory
    : otherCategoryIds[0];

  useEffect(() => {
    if (!otherSelectVisible) return undefined;

    const timer = setTimeout(() => {
      otherPickerRef.current?.focus();
    }, 120);

    return () => clearTimeout(timer);
  }, [otherSelectRequest, otherSelectVisible]);

  const filteredItems = useMemo(() => {
    return galleryItems.filter((item) => item.category === activeCategory);
  }, [activeCategory]);

  return (
    <View style={styles.container}>
      <View style={[styles.categoryTabs, { borderBottomColor: theme.border }]}>
        {mainCategories.map((category) => {
          const active =
            category.id === 'other'
              ? otherSelectVisible || otherCategoryIds.includes(activeCategory)
              : category.id === activeCategory;
          const Icon = category.icon;

          return (
            <LibraryTab
              active={active}
              color={theme.orange}
              icon={Icon}
              key={category.id}
              label={category.label}
              theme={theme}
              onPress={() => {
                if (category.id === 'other') {
                  setOtherSelectVisible(true);
                  setOtherSelectRequest((current) => current + 1);
                } else {
                  setActiveCategory(category.id);
                  setOtherSelectVisible(false);
                }
              }}
            />
          );
        })}
      </View>

      {otherSelectVisible ? (
        <View style={styles.nativeSelectMount} pointerEvents="none">
          <Picker
            ref={otherPickerRef}
            selectedValue={otherSelectedCategory}
            mode="dialog"
            prompt="เลือกหมวดอื่นๆ"
            dropdownIconColor={theme.textSubtle}
            numberOfLines={1}
            style={[styles.nativePicker, { color: theme.text }]}
            onBlur={() => setOtherSelectVisible(false)}
            onValueChange={(itemValue: GalleryCategoryId) => {
              setActiveCategory(itemValue);
              setOtherSelectVisible(false);
            }}
          >
            {otherCategories.map((category) => {
              const count = galleryItems.filter((item) => item.category === category.id).length;

              return (
                <Picker.Item
                  key={category.id}
                  label={`${category.label} (${count} รายการ)`}
                  value={category.id}
                  color={theme.text}
                />
              );
            })}
          </Picker>
        </View>
      ) : null}

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleRow}>
            <Layers size={13} color={theme.textSubtle} strokeWidth={2.2} />
            <Text style={[styles.sectionTitle, { color: theme.textSubtle }]}>{activeLabel}</Text>
          </View>
          <View style={styles.toolbar}>
            <HeaderAction icon={RefreshCw} label="รีเฟรช" theme={theme} />
            <HeaderAction icon={Plus} label="เพิ่ม" theme={theme} accent />
          </View>
        </View>

        <View style={styles.list}>
          {filteredItems.map((item) => (
            <LibraryCard key={item.id} item={item} theme={theme} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function LibraryTab({
  active,
  color,
  icon: Icon,
  label,
  theme,
  onPress,
}: {
  active: boolean;
  color: string;
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
      style={[styles.categoryTab, { borderBottomColor: active ? color : 'transparent' }]}
    >
      <Icon size={14} color={active ? color : theme.textSubtle} strokeWidth={2.2} />
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.78}
        numberOfLines={1}
        style={[styles.categoryTabText, { color: active ? color : theme.textSubtle }]}
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
  accent = false,
}: {
  icon: ComponentType<IconProps>;
  label: string;
  theme: KubdeeTheme;
  accent?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.headerAction,
        {
          backgroundColor: accent ? theme.orangeSoft : theme.panelMuted,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <Icon size={12} color={accent ? theme.orange : theme.textSubtle} strokeWidth={2.2} />
    </Pressable>
  );
}

function LibraryCard({
  item,
  theme,
}: {
  item: GalleryItemRecord;
  theme: KubdeeTheme;
}): React.JSX.Element {
  const Icon = getCategoryIcon(item.category);
  const tone = getTone(theme, item.tone);
  const status = getStatus(item, theme);

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <View style={[styles.thumb, { backgroundColor: tone.soft }]}>
        <Icon size={22} color={tone.color} strokeWidth={2.1} />
      </View>
      <View style={styles.cardMain}>
        <View style={styles.cardTitleRow}>
          <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <View style={[styles.status, { backgroundColor: status.background }]}>
            <CheckCircle2 size={9} color={status.color} strokeWidth={2.4} />
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>
        <Text style={[styles.cardSubtitle, { color: theme.textSubtle }]} numberOfLines={1}>
          {item.subtitle}
        </Text>
        <Text style={[styles.cardMeta, { color: theme.textMuted }]} numberOfLines={1}>
          {item.meta}
        </Text>
        <View style={styles.badgeRow}>
          {item.badges.map((badge) => (
            <View key={badge} style={[styles.badge, { backgroundColor: theme.panelMuted }]}>
              <Text style={[styles.badgeText, { color: theme.textSubtle }]}>{badge}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
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
    marginTop: 8,
  },
  badgeText: {
    fontSize: typography.tiny,
    fontWeight: '700',
    letterSpacing: 0,
  },
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
  },
  cardMeta: {
    fontSize: typography.caption,
    fontWeight: '600',
    letterSpacing: 0,
    marginTop: 5,
  },
  cardSubtitle: {
    fontSize: typography.caption,
    letterSpacing: 0,
    marginTop: 3,
  },
  cardTitle: {
    flex: 1,
    fontSize: typography.label,
    fontWeight: '800',
    letterSpacing: 0,
    minWidth: 0,
  },
  cardTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  categoryTab: {
    alignItems: 'center',
    borderBottomWidth: 2,
    flex: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    marginBottom: -1,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: 1,
    paddingVertical: 10,
  },
  categoryTabText: {
    flexShrink: 1,
    fontSize: typography.body,
    fontWeight: '800',
    letterSpacing: 0,
    minWidth: 0,
  },
  categoryTabs: {
    alignSelf: 'stretch',
    borderBottomWidth: 1,
    flexDirection: 'row',
    width: '100%',
  },
  container: {
    flex: 1,
  },
  content: {
    alignItems: 'stretch',
    gap: spacing.lg,
    paddingTop: 15,
    paddingBottom: 28,
  },
  headerAction: {
    alignItems: 'center',
    borderRadius: radii.md,
    flexShrink: 0,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  list: {
    gap: 9,
    paddingHorizontal: 15,
  },
  nativePicker: {
    fontSize: typography.body,
    fontWeight: '800',
    height: 1,
    width: 1,
  },
  nativeSelectMount: {
    height: 1,
    left: -100,
    opacity: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: -100,
    width: 1,
  },
  scroll: {
    flex: 1,
  },
  sectionHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
  },
  sectionTitle: {
    fontSize: typography.micro,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
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
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  toolbar: {
    flexDirection: 'row',
    gap: 6,
  },
});

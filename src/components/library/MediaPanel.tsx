import { useMemo, useState } from 'react';
import { Image as NativeImage, Pressable, ScrollView, View } from 'react-native';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Download,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  Package,
  Pencil,
  Play,
  RefreshCw,
  Trash2,
  Upload,
  Video,
} from 'lucide-react-native';

import Text from '@/components/ui/KubdeeText';
import { useGeneratedMedia } from '@/autopilot/generatedMediaStore';
import type { GeneratedMediaAsset } from '@/autopilot/generatedMediaStore';
import { galleryItems, type GalleryItemRecord } from '@/data/mockData';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';

import {
  CardBackdrop,
  EmptyHint,
  EmptyState,
  HeaderIconButton,
  LibraryPanelHeader,
  RowIconButton,
  SearchBox,
  SelectCircle,
  SelectionBar,
  SortPill,
  getAccentTone,
  libraryCardStops,
  type IconComponent,
} from './shared';

export type MediaKind = 'images' | 'videos';

type MediaMode = 'product' | 'general';

interface MediaSubItem {
  id: string;
  parentId: string;
  title: string;
  productName: string;
  productCode: string;
  date: string;
  size: string;
  portrait: boolean;
  warnings: string[];
  uri?: string | null;
}

const mockMediaCounts: Record<string, number> = {
  'img-luggage-hero': 6,
  'img-skincare-clean': 3,
  'vid-luggage-demo': 4,
  'vid-skincare-promo': 2,
};

const mockItemCodes: Record<string, string> = {
  'img-luggage-hero': '1730056701',
  'img-skincare-clean': '1729613725',
  'vid-luggage-demo': '1729481018',
  'vid-skincare-promo': '1730056701',
};

const mockDates = ['10/06 14:32', '09/06 18:05', '08/06 11:20', '07/06 20:48', '05/06 09:14', '04/06 16:40'];
const mockSizes = ['4.2 MB', '2.8 MB', '5.1 MB', '3.4 MB', '2.1 MB', '6.3 MB'];

/** Accent wash/border classes per media kind (mirrors getAccentTone soft = alpha 0.1 light / 0.16 dark). */
const accentClasses: Record<MediaKind, { soft: string; border: string }> = {
  images: {
    soft: 'bg-kd-amber/10 dark:bg-kd-amber/15',
    border: 'border-kd-amber/40',
  },
  videos: {
    soft: 'bg-kd-red/10 dark:bg-kd-red/15',
    border: 'border-kd-red/40',
  },
};

const panelCopy: Record<
  MediaKind,
  {
    title: string;
    productTab: string;
    generalTab: string;
    unit: string;
    emptyTitle: string;
    emptyCopy: string;
    emptyGeneral: string;
  }
> = {
  images: {
    title: 'คลังรูปภาพ',
    productTab: 'รูปภาพสินค้า',
    generalTab: 'รูปภาพทั่วไป',
    unit: 'รูป',
    emptyTitle: 'ยังไม่มีรูปภาพ',
    emptyCopy: 'รูปภาพที่สร้างจะถูกบันทึกไว้ที่นี่โดยอัตโนมัติ',
    emptyGeneral: 'ยังไม่มีรูปภาพทั่วไป',
  },
  videos: {
    title: 'คลังวิดีโอ',
    productTab: 'วิดีโอสินค้า',
    generalTab: 'วิดีโอทั่วไป',
    unit: 'วิดีโอ',
    emptyTitle: 'ยังไม่มีวิดีโอ',
    emptyCopy: 'วิดีโอที่สร้างจะถูกบันทึกไว้ที่นี่โดยอัตโนมัติ',
    emptyGeneral: 'ยังไม่มีวิดีโอทั่วไป',
  },
};

function getItemCode(item: GalleryItemRecord): string {
  return mockItemCodes[item.id] ?? item.id;
}

function buildSubItems(item: GalleryItemRecord): MediaSubItem[] {
  const count = mockMediaCounts[item.id] ?? 1;
  const portrait = item.subtitle.includes('9:16');
  const warnings = item.badges.filter((badge) => badge === 'Cap' || badge === '#' || badge === 'CTA');

  return Array.from({ length: count }, (_, index) => ({
    id: `${item.id}-${index}`,
    parentId: item.id,
    title: `${item.title} ${index + 1}`,
    productName: item.title,
    productCode: getItemCode(item),
    date: mockDates[index % mockDates.length],
    size: mockSizes[index % mockSizes.length],
    portrait,
    warnings: index === 0 ? warnings : [],
  }));
}

function formatAssetDate(timestamp: number): string {
  return new Intl.DateTimeFormat('th-TH', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(timestamp));
}

function formatAssetSize(sizeBytes: number | null): string {
  if (!sizeBytes || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return '-';
  }

  const sizeMb = sizeBytes / 1024 / 1024;
  if (sizeMb >= 1) {
    return `${sizeMb.toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
}

function toGeneratedGroups(kind: MediaKind, assets: GeneratedMediaAsset[]): Array<{ item: GalleryItemRecord; media: MediaSubItem[] }> {
  const groupsByProduct = new Map<string, { item: GalleryItemRecord; media: MediaSubItem[] }>();
  const tone = kind === 'images' ? 'amber' : 'red';

  for (const asset of assets) {
    const groupId = `generated-${kind}-${asset.productCode || asset.productId}`;
    const existing = groupsByProduct.get(groupId);
    const group =
      existing ??
      {
        item: {
          id: groupId,
          category: kind,
          title: asset.productName,
          subtitle: 'Google Flow | Auto Pilot',
          meta: 'สร้างจาก Auto Pilot',
          status: 'ready',
          tone,
          badges: ['Flow', 'Auto'],
        },
        media: [],
      };

    group.media.push({
      id: asset.id,
      parentId: groupId,
      title: asset.title,
      productName: asset.productName,
      productCode: asset.productCode,
      date: formatAssetDate(asset.createdAt),
      size: formatAssetSize(asset.sizeBytes),
      portrait: true,
      warnings: [],
      uri: asset.fileUri,
    });

    groupsByProduct.set(groupId, group);
  }

  return Array.from(groupsByProduct.values()).map((group) => ({
    ...group,
    media: group.media.sort((first, second) => second.id.localeCompare(first.id)),
  }));
}

export default function MediaPanel({
  theme,
  kind,
  selectedProfileId,
}: {
  theme: KubdeeTheme;
  kind: MediaKind;
  selectedProfileId: string;
}): React.JSX.Element {
  const { getAssetsByKind } = useGeneratedMedia();
  const copy = panelCopy[kind];
  const accentColor = kind === 'images' ? theme.amber : theme.red;
  const accent = getAccentTone(theme, accentColor);
  const accentClass = accentClasses[kind];
  const HeaderIcon = kind === 'images' ? ImageIcon : Video;

  const modeTabs: Array<{ key: MediaMode; icon: IconComponent; label: string }> = [
    { key: 'product', icon: Package, label: copy.productTab },
    { key: 'general', icon: HeaderIcon, label: copy.generalTab },
  ];

  const [mediaMode, setMediaMode] = useState<MediaMode>('product');
  const [searchQuery, setSearchQuery] = useState('');
  const [groupByProduct, setGroupByProduct] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<'name' | 'code' | 'date'>('name');
  const [sortAscending, setSortAscending] = useState(true);

  const generatedAssets = getAssetsByKind(kind, selectedProfileId);
  const groups = useMemo(() => {
    const generatedGroups = toGeneratedGroups(kind, generatedAssets);
    if (generatedGroups.length > 0) {
      return generatedGroups;
    }

    return galleryItems
      .filter((item) => item.category === kind)
      .map((item) => ({ item, media: buildSubItems(item) }));
  }, [generatedAssets, kind]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const visibleGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = groups.filter(({ item }) => {
      if (!query) return true;
      return [item.title, getItemCode(item)].join(' ').toLowerCase().includes(query);
    });
    const direction = sortAscending ? 1 : -1;
    filtered.sort((first, second) => {
      if (sortKey === 'code') {
        return direction * getItemCode(first.item).localeCompare(getItemCode(second.item), 'th');
      }
      if (sortKey === 'date') {
        return direction * first.item.id.localeCompare(second.item.id, 'th');
      }
      return direction * first.item.title.localeCompare(second.item.title, 'th');
    });
    return filtered;
  }, [groups, searchQuery, sortAscending, sortKey]);

  const productMedia = useMemo(() => visibleGroups.flatMap((group) => group.media), [visibleGroups]);
  const totalMedia = useMemo(() => groups.reduce((sum, group) => sum + group.media.length, 0), [groups]);
  const allSelected = productMedia.length > 0 && productMedia.every((media) => selectedIds.has(media.id));

  const toggleSelect = (id: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (): void => {
    setSelectedIds(() => {
      if (allSelected) return new Set();
      return new Set(productMedia.map((media) => media.id));
    });
  };

  const changeSort = (next: 'name' | 'code' | 'date'): void => {
    if (sortKey === next) {
      setSortAscending((current) => !current);
      return;
    }
    setSortKey(next);
    setSortAscending(next !== 'date');
  };

  const toggleGroup = (id: string): void => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <View className="flex-1">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-3 px-3 pb-20 pt-3">
        <LibraryPanelHeader
          theme={theme}
          title={copy.title}
          count={productMedia.length}
          total={totalMedia}
          icon={HeaderIcon}
          tone={accent}
          actions={
            <>
              <HeaderIconButton theme={theme} icon={Upload} label="อัพโหลด" />
              <HeaderIconButton theme={theme} icon={RefreshCw} label="รีเฟรช" />
            </>
          }
        />

        <View className="gap-2">
          <View className="flex-row items-center gap-1.5">
            <SearchBox
              theme={theme}
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="ค้นหาชื่อ/รหัสสินค้า..."
            />
            <View className="h-8 shrink-0 flex-row items-center gap-0.5 rounded-kd-md border border-kd-border bg-kd-input px-0.5">
              {modeTabs.map(({ key, icon: TabIcon, label }) => {
                const isActive = mediaMode === key;

                return (
                  <Pressable
                    accessibilityLabel={label}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                    key={key}
                    onPress={() => {
                      setMediaMode(key);
                      setSelectedIds(new Set());
                    }}
                    className={`h-[26px] w-[30px] items-center justify-center rounded-kd-sm ${
                      isActive ? accentClass.soft : ''
                    }`}
                  >
                    <TabIcon size={13} color={isActive ? accentColor : theme.textSubtle} strokeWidth={2} />
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              accessibilityLabel={groupByProduct ? 'ยกเลิกจัดกลุ่ม' : 'จัดกลุ่มตามสินค้า'}
              accessibilityRole="button"
              accessibilityState={{ selected: groupByProduct }}
              onPress={() => setGroupByProduct((current) => !current)}
              className={`h-8 w-8 shrink-0 items-center justify-center rounded-kd-md border ${
                groupByProduct ? `${accentClass.soft} ${accentClass.border}` : 'border-kd-border bg-kd-input'
              }`}
            >
              <Grid2X2 size={13} color={groupByProduct ? accentColor : theme.textSubtle} strokeWidth={2} />
            </Pressable>
          </View>

          {mediaMode === 'product' ? (
            totalMedia === 0 ? (
              <EmptyState theme={theme} icon={HeaderIcon} title={copy.emptyTitle} copy={copy.emptyCopy} />
            ) : (
              <>
                <View className="flex-row items-center justify-between">
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: allSelected }}
                    onPress={toggleAll}
                    className="min-h-6 flex-row items-center gap-1.5"
                  >
                    <SelectCircle theme={theme} selected={allSelected} accent={accentColor} size={15} />
                    <Text className="text-kd-caption text-kd-text-subtle">
                      ทั้งหมด ({productMedia.length})
                    </Text>
                  </Pressable>

                  <View className="flex-row items-center gap-1">
                    <SortPill
                      theme={theme}
                      accent={accentColor}
                      active={sortKey === 'name'}
                      ascending={sortAscending}
                      label="ชื่อ"
                      onPress={() => changeSort('name')}
                    />
                    {groupByProduct ? (
                      <SortPill
                        theme={theme}
                        accent={accentColor}
                        active={sortKey === 'code'}
                        ascending={sortAscending}
                        label="รหัส"
                        onPress={() => changeSort('code')}
                      />
                    ) : (
                      <SortPill
                        theme={theme}
                        accent={accentColor}
                        active={sortKey === 'date'}
                        ascending={sortAscending}
                        label="วันที่"
                        onPress={() => changeSort('date')}
                      />
                    )}
                    {groupByProduct && visibleGroups.length > 1 ? (
                      <>
                        <View className="mx-[3px] h-3 w-px bg-kd-border" />
                        <Pressable
                          accessibilityLabel="ขยายทั้งหมด"
                          accessibilityRole="button"
                          onPress={() => setCollapsedGroups(new Set())}
                          className="h-[22px] w-5 items-center justify-center"
                        >
                          <ChevronsDown size={13} color={theme.textSubtle} strokeWidth={2} />
                        </Pressable>
                        <Pressable
                          accessibilityLabel="ย่อทั้งหมด"
                          accessibilityRole="button"
                          onPress={() => setCollapsedGroups(new Set(visibleGroups.map((group) => group.item.id)))}
                          className="h-[22px] w-5 items-center justify-center"
                        >
                          <ChevronsUp size={13} color={theme.textSubtle} strokeWidth={2} />
                        </Pressable>
                      </>
                    ) : null}
                  </View>
                </View>

                {groupByProduct ? (
                  visibleGroups.map(({ item, media }) => (
                    <MediaGroupCard
                      key={item.id}
                      theme={theme}
                      kind={kind}
                      accentColor={accentColor}
                      item={item}
                      media={media}
                      unit={copy.unit}
                      expanded={!collapsedGroups.has(item.id)}
                      selectedIds={selectedIds}
                      onToggleExpand={() => toggleGroup(item.id)}
                      onToggleSelect={toggleSelect}
                    />
                  ))
                ) : kind === 'images' ? (
                  <View className="flex-row flex-wrap gap-2">
                    {productMedia.map((media) => (
                      <ImageTile
                        key={media.id}
                        theme={theme}
                        accentColor={accentColor}
                        media={media}
                        selected={selectedIds.has(media.id)}
                        showProductInfo
                        onToggleSelect={() => toggleSelect(media.id)}
                      />
                    ))}
                  </View>
                ) : (
                  productMedia.map((media) => (
                    <View
                      key={media.id}
                      className="overflow-hidden rounded-[12px] border border-gray-100 bg-kd-panel dark:border-kd-border"
                      style={{
                        elevation: 1,
                        shadowOffset: { height: 1, width: 0 },
                        shadowOpacity: 0.05,
                        shadowRadius: 2,
                      }}
                    >
                      <CardBackdrop theme={theme} id="videos-flat" stops={libraryCardStops.videos} />
                      <View className="px-1.5">
                        <VideoRow
                          theme={theme}
                          accentColor={accentColor}
                          media={media}
                          selected={selectedIds.has(media.id)}
                          showDivider={false}
                          showProductInfo
                          onToggleSelect={() => toggleSelect(media.id)}
                        />
                      </View>
                    </View>
                  ))
                )}
              </>
            )
          ) : (
            <EmptyHint theme={theme} label={copy.emptyGeneral} />
          )}
        </View>
      </ScrollView>

      {selectedIds.size > 0 ? (
        <SelectionBar
          theme={theme}
          accent={accentColor}
          count={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
        />
      ) : null}
    </View>
  );
}

/**
 * Extension grouped view: rounded-xl card, soft tone header row
 * (chevron circle + 36px product thumb + name / #id + count), media inside
 */
function MediaGroupCard({
  theme,
  kind,
  accentColor,
  item,
  media,
  unit,
  expanded,
  selectedIds,
  onToggleExpand,
  onToggleSelect,
}: {
  theme: KubdeeTheme;
  kind: MediaKind;
  accentColor: string;
  item: GalleryItemRecord;
  media: MediaSubItem[];
  unit: string;
  expanded: boolean;
  selectedIds: Set<string>;
  onToggleExpand: () => void;
  onToggleSelect: (id: string) => void;
}): React.JSX.Element {
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;

  return (
    <View
      className="overflow-hidden rounded-[12px] border border-gray-100 bg-kd-panel dark:border-kd-border"
      style={{
        elevation: 1,
        shadowOffset: { height: 1, width: 0 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      }}
    >
      <CardBackdrop theme={theme} id={kind} stops={libraryCardStops[kind]} />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggleExpand}
        className="flex-row items-center gap-2.5 p-2.5"
      >
        <View className="h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/80 dark:bg-kd-card-muted/80">
          <ChevronIcon size={11} color={theme.textSubtle} strokeWidth={2.5} />
        </View>

        <View className="h-9 w-9 shrink-0 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-panel-muted dark:bg-kd-card-muted">
          <ImageIcon size={14} color={theme.textSubtle} strokeWidth={1.5} />
        </View>

        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
            {item.title}
          </Text>
          <View className="mt-[3px] flex-row items-center justify-between gap-2">
            <Text numberOfLines={1} className="shrink text-kd-micro text-kd-text-subtle">
              #{getItemCode(item)}
            </Text>
            <Text className="shrink-0 text-kd-micro font-medium text-kd-text-subtle">
              {media.length} {unit}
            </Text>
          </View>
        </View>
      </Pressable>

      {expanded ? (
        <View className="bg-white/50 p-2 dark:bg-kd-panel-muted/30">
          {kind === 'images' ? (
            <View className="flex-row flex-wrap gap-2">
              {media.map((entry) => (
                <ImageTile
                  key={entry.id}
                  theme={theme}
                  accentColor={accentColor}
                  media={entry}
                  selected={selectedIds.has(entry.id)}
                  onToggleSelect={() => onToggleSelect(entry.id)}
                />
              ))}
            </View>
          ) : (
            media.map((entry, index) => (
              <VideoRow
                key={entry.id}
                theme={theme}
                accentColor={accentColor}
                media={entry}
                selected={selectedIds.has(entry.id)}
                showDivider={index > 0}
                onToggleSelect={() => onToggleSelect(entry.id)}
              />
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Extension ImageGridItem: square tile, circular checkbox top-left,
 * date badge bottom-left or product overlay bottom
 */
function ImageTile({
  theme,
  accentColor,
  media,
  selected,
  showProductInfo = false,
  onToggleSelect,
}: {
  theme: KubdeeTheme;
  accentColor: string;
  media: MediaSubItem;
  selected: boolean;
  showProductInfo?: boolean;
  onToggleSelect: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onToggleSelect}
      className="aspect-square w-[31.4%] overflow-hidden rounded-kd-lg border-2 bg-kd-border dark:bg-kd-card-muted"
      style={{ borderColor: selected ? accentColor : 'transparent' }}
    >
      <View className="flex-1 items-center justify-center">
        {media.uri ? (
          <NativeImage source={{ uri: media.uri }} className="h-full w-full" resizeMode="cover" />
        ) : (
          <ImageIcon size={22} color={theme.textSubtle} strokeWidth={1.5} />
        )}
      </View>

      <View className="absolute left-1.5 top-1.5">
        <SelectCircle theme={theme} selected={selected} accent={accentColor} size={18} light />
      </View>

      {showProductInfo ? (
        <View className="absolute bottom-0 left-0 right-0 bg-black/55 px-1.5 py-1">
          <Text numberOfLines={1} className="text-kd-tiny font-medium text-white/90">
            {media.productName}
          </Text>
          <Text numberOfLines={1} className="text-[8px] text-white/60">
            #{media.productCode}
          </Text>
        </View>
      ) : (
        <View className="absolute bottom-1 left-1 rounded-kd-sm bg-black/60 px-[5px] py-0.5">
          <Text className="text-[8px] font-medium text-white/90">{media.date}</Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * Extension VideoItem (list variant): checkbox + thumbnail + title/meta + action icons,
 * provider badge top-right
 */
function VideoRow({
  theme,
  accentColor,
  media,
  selected,
  showDivider,
  showProductInfo = false,
  onToggleSelect,
}: {
  theme: KubdeeTheme;
  accentColor: string;
  media: MediaSubItem;
  selected: boolean;
  showDivider: boolean;
  showProductInfo?: boolean;
  onToggleSelect: () => void;
}): React.JSX.Element {
  return (
    <View
      className={`flex-row items-center gap-2.5 px-1 py-2 ${
        showDivider ? 'border-t border-kd-border' : ''
      }`}
      style={selected ? { backgroundColor: alpha(accentColor, theme.isDark ? 0.1 : 0.05) } : undefined}
    >
      <View className="absolute right-2 top-2 z-[1] flex-row items-center gap-[3px]">
        <View className="rounded-kd-sm bg-kd-blue/10 px-[5px] py-0.5 dark:bg-kd-blue/25">
          <Text className="text-[8px] font-medium text-kd-blue">ระบบ</Text>
        </View>
        {media.warnings.map((warning) => (
          <View key={warning} className="rounded-kd-sm bg-kd-amber/90 px-1 py-0.5">
            <Text className="text-[8px] font-bold text-white">{warning}</Text>
          </View>
        ))}
      </View>

      <Pressable accessibilityLabel="เลือก" accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onToggleSelect}>
        <SelectCircle theme={theme} selected={selected} accent={accentColor} size={20} />
      </Pressable>

      <View
        className={`shrink-0 items-center justify-center overflow-hidden rounded-kd-md bg-kd-border dark:bg-kd-card-muted ${
          media.portrait ? 'h-16 w-12' : 'h-12 w-20'
        }`}
      >
        <Play size={16} color={theme.textSubtle} strokeWidth={1.5} />
      </View>

      <View className="min-w-0 flex-1">
        {showProductInfo ? (
          <>
            <Text numberOfLines={1} className="pr-14 text-kd-body font-medium text-kd-text">
              {media.productName}
            </Text>
            <Text numberOfLines={1} className="mt-px text-kd-tiny text-kd-text-subtle">
              #{media.productCode}
            </Text>
          </>
        ) : (
          <Text numberOfLines={1} className="pr-14 text-kd-body font-medium text-kd-text">
            {media.title}
          </Text>
        )}

        <View className="mt-[3px] flex-row items-center gap-1.5">
          <Text className="text-kd-micro text-kd-text-subtle">{media.date}</Text>
          <View className="h-[3px] w-[3px] rounded-full bg-kd-border-strong" />
          <Text className="text-kd-micro text-kd-text-subtle">{media.size}</Text>
        </View>

        <View className="mt-0.5 flex-row items-center justify-end gap-0.5">
          <RowIconButton theme={theme} icon={Pencil} label="แก้ไข" />
          <RowIconButton theme={theme} icon={Play} label="เล่น" />
          <RowIconButton theme={theme} icon={Download} label="ดาวน์โหลด" />
          <RowIconButton theme={theme} icon={Heart} label="กดถูกใจ" />
          <RowIconButton theme={theme} icon={Trash2} label="ลบ" />
        </View>
      </View>
    </View>
  );
}

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Download,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  Pencil,
  Play,
  RefreshCw,
  Trash2,
  Upload,
  Video,
} from 'lucide-react-native';

import Text from '@/components/ui/KubdeeText';
import { galleryItems, type GalleryItemRecord } from '@/data/mockData';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';

import {
  EmptyHint,
  EmptyState,
  HeaderIconButton,
  LibraryPanelHeader,
  PanelSubTabs,
  RowIconButton,
  SearchBox,
  SelectCircle,
  SelectionBar,
  SortPill,
  getAccentTone,
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

export default function MediaPanel({
  theme,
  kind,
}: {
  theme: KubdeeTheme;
  kind: MediaKind;
}): React.JSX.Element {
  const copy = panelCopy[kind];
  const accentColor = kind === 'images' ? theme.amber : theme.red;
  const accent = getAccentTone(theme, accentColor);
  const HeaderIcon = kind === 'images' ? ImageIcon : Video;

  const [mediaMode, setMediaMode] = useState<MediaMode>('product');
  const [searchQuery, setSearchQuery] = useState('');
  const [groupByProduct, setGroupByProduct] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<'name' | 'code' | 'date'>('name');
  const [sortAscending, setSortAscending] = useState(true);

  const groups = useMemo(
    () =>
      galleryItems
        .filter((item) => item.category === kind)
        .map((item) => ({ item, media: buildSubItems(item) })),
    [kind]
  );

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
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
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

        <PanelSubTabs
          theme={theme}
          accent={accentColor}
          active={mediaMode}
          tabs={[
            { key: 'product' as const, label: `${copy.productTab} (${totalMedia})` },
            { key: 'general' as const, label: `${copy.generalTab} (0)` },
          ]}
          onChange={(next) => {
            setMediaMode(next);
            setSelectedIds(new Set());
          }}
        />

        {mediaMode === 'product' ? (
          totalMedia === 0 ? (
            <EmptyState theme={theme} icon={HeaderIcon} title={copy.emptyTitle} copy={copy.emptyCopy} />
          ) : (
            <View style={styles.section}>
              <View style={styles.searchRow}>
                <SearchBox
                  theme={theme}
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="ค้นหาชื่อ/รหัสสินค้า..."
                />
                <Pressable
                  accessibilityLabel={groupByProduct ? 'ยกเลิกจัดกลุ่ม' : 'จัดกลุ่มตามสินค้า'}
                  accessibilityRole="button"
                  accessibilityState={{ selected: groupByProduct }}
                  onPress={() => setGroupByProduct((current) => !current)}
                  style={[
                    styles.groupToggle,
                    {
                      backgroundColor: groupByProduct ? accent.soft : theme.input,
                      borderColor: groupByProduct ? alpha(accentColor, 0.4) : theme.border,
                    },
                  ]}
                >
                  <Grid2X2 size={13} color={groupByProduct ? accentColor : theme.textSubtle} strokeWidth={2} />
                </Pressable>
              </View>

              <View style={styles.toolsRow}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: allSelected }}
                  onPress={toggleAll}
                  style={styles.selectAll}
                >
                  <SelectCircle theme={theme} selected={allSelected} accent={accentColor} size={15} />
                  <Text style={[styles.selectAllText, { color: theme.textSubtle }]}>
                    ทั้งหมด ({productMedia.length})
                  </Text>
                </Pressable>

                <View style={styles.sortRow}>
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
                      <View style={[styles.toolsDivider, { backgroundColor: theme.border }]} />
                      <Pressable
                        accessibilityLabel="ขยายทั้งหมด"
                        accessibilityRole="button"
                        onPress={() => setCollapsedGroups(new Set())}
                        style={styles.expandButton}
                      >
                        <ChevronsDown size={13} color={theme.textSubtle} strokeWidth={2} />
                      </Pressable>
                      <Pressable
                        accessibilityLabel="ย่อทั้งหมด"
                        accessibilityRole="button"
                        onPress={() => setCollapsedGroups(new Set(visibleGroups.map((group) => group.item.id)))}
                        style={styles.expandButton}
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
              ) : (
                <View
                  style={[
                    styles.flatContainer,
                    {
                      backgroundColor: theme.isDark ? alpha(theme.panelMuted, 0.4) : alpha(theme.white, 0.5),
                      borderColor: theme.border,
                    },
                  ]}
                >
                  {kind === 'images' ? (
                    <View style={styles.grid}>
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
                    productMedia.map((media, index) => (
                      <VideoRow
                        key={media.id}
                        theme={theme}
                        accentColor={accentColor}
                        media={media}
                        selected={selectedIds.has(media.id)}
                        showDivider={index > 0}
                        showProductInfo
                        onToggleSelect={() => toggleSelect(media.id)}
                      />
                    ))
                  )}
                </View>
              )}
            </View>
          )
        ) : (
          <EmptyHint theme={theme} label={copy.emptyGeneral} />
        )}
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
    <View style={[styles.groupCard, { borderColor: theme.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggleExpand}
        style={[
          styles.groupHeader,
          { backgroundColor: theme.isDark ? theme.card : alpha(accentColor, 0.06) },
        ]}
      >
        <View
          style={[
            styles.groupChevron,
            { backgroundColor: theme.isDark ? alpha(theme.cardMuted, 0.8) : alpha(theme.white, 0.8) },
          ]}
        >
          <ChevronIcon size={11} color={theme.textSubtle} strokeWidth={2.5} />
        </View>

        <View
          style={[
            styles.groupThumb,
            {
              backgroundColor: theme.isDark ? theme.cardMuted : theme.panelMuted,
              borderColor: theme.border,
            },
          ]}
        >
          <ImageIcon size={14} color={theme.textSubtle} strokeWidth={1.5} />
        </View>

        <View style={styles.groupInfo}>
          <Text numberOfLines={1} style={[styles.groupName, { color: theme.text }]}>
            {item.title}
          </Text>
          <View style={styles.groupMetaRow}>
            <Text numberOfLines={1} style={[styles.groupCode, { color: theme.textSubtle }]}>
              #{getItemCode(item)}
            </Text>
            <Text style={[styles.groupCount, { color: theme.textSubtle }]}>
              {media.length} {unit}
            </Text>
          </View>
        </View>
      </Pressable>

      {expanded ? (
        <View
          style={[
            styles.groupBody,
            { backgroundColor: theme.isDark ? alpha(theme.panelMuted, 0.3) : alpha(theme.white, 0.5) },
          ]}
        >
          {kind === 'images' ? (
            <View style={styles.grid}>
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
      style={[
        styles.imageTile,
        {
          backgroundColor: theme.isDark ? theme.cardMuted : theme.border,
          borderColor: selected ? accentColor : 'transparent',
        },
      ]}
    >
      <View style={styles.imageTilePlaceholder}>
        <ImageIcon size={22} color={theme.textSubtle} strokeWidth={1.5} />
      </View>

      <View style={styles.imageTileCheck}>
        <SelectCircle theme={theme} selected={selected} accent={accentColor} size={18} light />
      </View>

      {showProductInfo ? (
        <View style={styles.imageTileOverlay}>
          <Text numberOfLines={1} style={styles.imageTileOverlayTitle}>
            {media.productName}
          </Text>
          <Text numberOfLines={1} style={styles.imageTileOverlayCode}>
            #{media.productCode}
          </Text>
        </View>
      ) : (
        <View style={styles.imageTileDate}>
          <Text style={styles.imageTileDateText}>{media.date}</Text>
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
      style={[
        styles.videoRow,
        showDivider ? { borderTopColor: theme.border, borderTopWidth: 1 } : null,
        selected ? { backgroundColor: alpha(accentColor, theme.isDark ? 0.1 : 0.05) } : null,
      ]}
    >
      <View style={styles.videoBadges}>
        <View style={[styles.providerBadge, { backgroundColor: alpha(theme.blue, theme.isDark ? 0.25 : 0.12) }]}>
          <Text style={[styles.providerBadgeText, { color: theme.blue }]}>ระบบ</Text>
        </View>
        {media.warnings.map((warning) => (
          <View key={warning} style={[styles.warningBadge, { backgroundColor: alpha(theme.amber, 0.9) }]}>
            <Text style={styles.warningBadgeText}>{warning}</Text>
          </View>
        ))}
      </View>

      <Pressable accessibilityLabel="เลือก" accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onToggleSelect}>
        <SelectCircle theme={theme} selected={selected} accent={accentColor} size={20} />
      </Pressable>

      <View
        style={[
          media.portrait ? styles.videoThumbPortrait : styles.videoThumbLandscape,
          { backgroundColor: theme.isDark ? theme.cardMuted : theme.border },
        ]}
      >
        <Play size={16} color={theme.textSubtle} strokeWidth={1.5} />
      </View>

      <View style={styles.videoInfo}>
        {showProductInfo ? (
          <>
            <Text numberOfLines={1} style={[styles.videoTitle, { color: theme.text }]}>
              {media.productName}
            </Text>
            <Text numberOfLines={1} style={[styles.videoCode, { color: theme.textSubtle }]}>
              #{media.productCode}
            </Text>
          </>
        ) : (
          <Text numberOfLines={1} style={[styles.videoTitle, { color: theme.text }]}>
            {media.title}
          </Text>
        )}

        <View style={styles.videoMetaRow}>
          <Text style={[styles.videoMeta, { color: theme.textSubtle }]}>{media.date}</Text>
          <View style={[styles.videoMetaDot, { backgroundColor: theme.borderStrong }]} />
          <Text style={[styles.videoMeta, { color: theme.textSubtle }]}>{media.size}</Text>
        </View>

        <View style={styles.videoActions}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingBottom: 80,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  expandButton: {
    alignItems: 'center',
    height: 22,
    justifyContent: 'center',
    width: 20,
  },
  flatContainer: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  groupBody: {
    padding: 8,
  },
  groupCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  groupChevron: {
    alignItems: 'center',
    borderRadius: 999,
    flexShrink: 0,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  groupCode: {
    flexShrink: 1,
    fontSize: 10,
  },
  groupCount: {
    flexShrink: 0,
    fontSize: 10,
    fontWeight: '500',
  },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  groupInfo: {
    flex: 1,
    minWidth: 0,
  },
  groupMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    marginTop: 3,
  },
  groupName: {
    fontSize: 12,
    fontWeight: '600',
  },
  groupThumb: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  groupToggle: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  imageTile: {
    aspectRatio: 1,
    borderRadius: 8,
    borderWidth: 2,
    overflow: 'hidden',
    width: '31.4%',
  },
  imageTileCheck: {
    left: 6,
    position: 'absolute',
    top: 6,
  },
  imageTileDate: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 4,
    bottom: 4,
    left: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    position: 'absolute',
  },
  imageTileDateText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 8,
    fontWeight: '500',
  },
  imageTileOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    bottom: 0,
    left: 0,
    paddingHorizontal: 6,
    paddingVertical: 4,
    position: 'absolute',
    right: 0,
  },
  imageTileOverlayCode: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 8,
  },
  imageTileOverlayTitle: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 9,
    fontWeight: '500',
  },
  imageTilePlaceholder: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  providerBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  providerBadgeText: {
    fontSize: 8,
    fontWeight: '500',
  },
  searchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  section: {
    gap: 8,
  },
  selectAll: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minHeight: 24,
  },
  selectAllText: {
    fontSize: 11,
  },
  sortRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  toolsDivider: {
    height: 12,
    marginHorizontal: 3,
    width: 1,
  },
  toolsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  videoActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'flex-end',
    marginTop: 2,
  },
  videoBadges: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    position: 'absolute',
    right: 8,
    top: 8,
    zIndex: 1,
  },
  videoCode: {
    fontSize: 9,
    marginTop: 1,
  },
  videoInfo: {
    flex: 1,
    minWidth: 0,
  },
  videoMeta: {
    fontSize: 10,
  },
  videoMetaDot: {
    borderRadius: 999,
    height: 3,
    width: 3,
  },
  videoMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 3,
  },
  videoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  videoThumbLandscape: {
    alignItems: 'center',
    borderRadius: 6,
    flexShrink: 0,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 80,
  },
  videoThumbPortrait: {
    alignItems: 'center',
    borderRadius: 6,
    flexShrink: 0,
    height: 64,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  videoTitle: {
    fontSize: 12,
    fontWeight: '500',
    paddingRight: 56,
  },
  warningBadge: {
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  warningBadgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '700',
  },
});

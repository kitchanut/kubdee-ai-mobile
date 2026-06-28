import { useMemo, useState } from 'react';
import { Alert, Image as NativeImage, Linking, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
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
  X,
} from 'lucide-react-native';
import { toast } from 'sonner-native';

import Text from '@/components/ui/KubdeeText';
import { useGeneratedMedia } from '@/autopilot/generatedMediaStore';
import type { GeneratedMediaAsset } from '@/autopilot/generatedMediaStore';
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
  mimeType?: string | null;
}

interface MediaGroupRecord {
  id: string;
  title: string;
  code: string;
  subtitle: string;
}

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

const ANDROID_VIEW_ACTION = 'android.intent.action.VIEW';
const FLAG_GRANT_READ_URI_PERMISSION = 1;

function getItemCode(item: MediaGroupRecord): string {
  return item.code || item.id;
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

function getFallbackMimeType(kind: MediaKind): string {
  return kind === 'images' ? 'image/*' : 'video/*';
}

async function openGeneratedFile(uri: string, kind: MediaKind, mimeType?: string | null): Promise<void> {
  if (Platform.OS === 'android' && uri.startsWith('file://')) {
    const contentUri = await FileSystem.getContentUriAsync(uri);
    await IntentLauncher.startActivityAsync(ANDROID_VIEW_ACTION, {
      data: contentUri,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
      type: mimeType || getFallbackMimeType(kind),
    });
    return;
  }

  await Linking.openURL(uri);
}

async function deleteLocalFiles(assets: GeneratedMediaAsset[]): Promise<number> {
  let failedCount = 0;
  for (const asset of assets) {
    if (!asset.fileUri?.startsWith('file://')) {
      continue;
    }

    try {
      await FileSystem.deleteAsync(asset.fileUri, { idempotent: true });
    } catch {
      failedCount += 1;
    }
  }
  return failedCount;
}

function toGeneratedGroups(kind: MediaKind, assets: GeneratedMediaAsset[]): Array<{ item: MediaGroupRecord; media: MediaSubItem[] }> {
  const groupsByProduct = new Map<string, { item: MediaGroupRecord; media: MediaSubItem[] }>();
  for (const asset of assets) {
    const groupId = `generated-${kind}-${asset.productCode || asset.productId}`;
    const existing = groupsByProduct.get(groupId);
    const group =
      existing ??
      {
        item: {
          id: groupId,
          title: asset.productName,
          code: asset.productCode,
          subtitle: 'Google Flow | Auto Pilot',
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
      mimeType: asset.mimeType,
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
  const { deleteGeneratedMediaAssets, getAssetsByKind, updateGeneratedMediaAsset } = useGeneratedMedia();
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
  const [previewMedia, setPreviewMedia] = useState<MediaSubItem | null>(null);
  const [editMedia, setEditMedia] = useState<MediaSubItem | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const generatedAssets = getAssetsByKind(kind, selectedProfileId);
  const generatedAssetById = useMemo(
    () => new Map(generatedAssets.map((asset) => [asset.id, asset])),
    [generatedAssets]
  );
  const groups = useMemo(() => {
    return toGeneratedGroups(kind, generatedAssets);
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

  const deleteSelected = async (): Promise<void> => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    confirmDelete(ids);
  };

  const openMedia = async (media: MediaSubItem): Promise<void> => {
    if (!media.uri) {
      toast.warning('ไม่พบไฟล์สำหรับเปิด');
      return;
    }

    if (kind === 'images') {
      setPreviewMedia(media);
      return;
    }

    try {
      await openGeneratedFile(media.uri, kind, media.mimeType);
    } catch {
      toast.error('เปิดวิดีโอไม่สำเร็จ');
    }
  };

  const openEdit = (media: MediaSubItem): void => {
    setEditMedia(media);
    setEditTitle(media.title);
  };

  const saveEdit = async (): Promise<void> => {
    if (!editMedia) return;
    const title = editTitle.trim();
    if (!title) {
      toast.warning('กรุณากรอกชื่อ');
      return;
    }

    const updated = await updateGeneratedMediaAsset(editMedia.id, { title });
    if (!updated) {
      toast.error('ไม่พบรายการที่จะแก้ไข');
      return;
    }

    setEditMedia(null);
    setPreviewMedia((current) => (current?.id === editMedia.id ? { ...current, title } : current));
    toast.success('บันทึกแล้ว');
  };

  const editSelected = (): void => {
    const ids = Array.from(selectedIds);
    if (ids.length !== 1) {
      toast.warning('เลือกทีละรายการเพื่อแก้ไข');
      return;
    }

    const selectedMedia = productMedia.find((media) => media.id === ids[0]);
    if (!selectedMedia) {
      toast.error('ไม่พบรายการที่จะแก้ไข');
      return;
    }

    openEdit(selectedMedia);
  };

  const downloadMedia = async (media: MediaSubItem): Promise<void> => {
    if (!media.uri) {
      toast.warning('ไม่พบไฟล์สำหรับดาวน์โหลด');
      return;
    }

    try {
      await openGeneratedFile(media.uri, kind, media.mimeType);
      toast.success('เปิดไฟล์แล้ว สามารถบันทึกจากแอปปลายทางได้');
    } catch {
      toast.error('เปิดไฟล์ไม่สำเร็จ');
    }
  };

  const performDelete = async (ids: string[]): Promise<void> => {
    const assetsToDelete = ids
      .map((id) => generatedAssetById.get(id))
      .filter((asset): asset is GeneratedMediaAsset => !!asset);
    if (assetsToDelete.length === 0) {
      toast.error('ไม่พบรายการที่จะลบ');
      return;
    }

    await deleteGeneratedMediaAssets(assetsToDelete.map((asset) => asset.id));
    const failedFileCount = await deleteLocalFiles(assetsToDelete);
    const idSet = new Set(assetsToDelete.map((asset) => asset.id));
    setSelectedIds((current) => new Set(Array.from(current).filter((id) => !idSet.has(id))));
    setPreviewMedia((current) => (current && idSet.has(current.id) ? null : current));
    setEditMedia((current) => (current && idSet.has(current.id) ? null : current));

    if (failedFileCount > 0) {
      toast.warning(`ลบรายการแล้ว แต่ลบไฟล์ไม่ได้ ${failedFileCount} ไฟล์`);
      return;
    }
    toast.success(`ลบแล้ว ${assetsToDelete.length} ${copy.unit}`);
  };

  const confirmDelete = (ids: string[]): void => {
    const cleanIds = ids.filter((id) => generatedAssetById.has(id));
    if (cleanIds.length === 0) return;

    Alert.alert(`ลบ${copy.unit}?`, `ต้องการลบ ${cleanIds.length} ${copy.unit} ออกจากคลังนี้หรือไม่`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: () => {
          void performDelete(cleanIds);
        },
      },
    ]);
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
              <HeaderIconButton
                theme={theme}
                icon={Upload}
                label="อัพโหลด"
                onPress={() => toast.info('อัพโหลดเข้าคลังจะเพิ่มในเวอร์ชันถัดไป')}
              />
              <HeaderIconButton
                theme={theme}
                icon={RefreshCw}
                label="รีเฟรช"
                onPress={() => toast.success('รีเฟรชคลังแล้ว')}
              />
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
                      onDeleteMedia={(media) => confirmDelete([media.id])}
                      onDownloadMedia={(media) => void downloadMedia(media)}
                      onEditMedia={openEdit}
                      onFavoriteMedia={() => toast.info('ฟีเจอร์ถูกใจจะเพิ่มในเวอร์ชันถัดไป')}
                      onViewMedia={(media) => void openMedia(media)}
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
                        onDelete={() => confirmDelete([media.id])}
                        onEdit={() => openEdit(media)}
                        onToggleSelect={() => toggleSelect(media.id)}
                        onView={() => void openMedia(media)}
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
                          onDelete={() => confirmDelete([media.id])}
                          onDownload={() => void downloadMedia(media)}
                          onEdit={() => openEdit(media)}
                          onFavorite={() => toast.info('ฟีเจอร์ถูกใจจะเพิ่มในเวอร์ชันถัดไป')}
                          onPlay={() => void openMedia(media)}
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
          onDelete={() => void deleteSelected()}
          onEdit={editSelected}
        />
      ) : null}

      <Modal
        animationType="fade"
        transparent
        visible={!!previewMedia}
        onRequestClose={() => setPreviewMedia(null)}
      >
        <View className="flex-1 bg-black/90 px-4 py-8">
          <View className="mb-3 flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-kd-body font-semibold text-white">
                {previewMedia?.title ?? 'รูปภาพ'}
              </Text>
              <Text numberOfLines={1} className="text-kd-caption text-white/60">
                {previewMedia?.productName ?? ''}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="ปิด"
              accessibilityRole="button"
              onPress={() => setPreviewMedia(null)}
              className="h-9 w-9 items-center justify-center rounded-full bg-white/15"
            >
              <X size={18} color={theme.white} strokeWidth={2.4} />
            </Pressable>
          </View>

          <View className="flex-1 items-center justify-center">
            {previewMedia?.uri ? (
              <NativeImage source={{ uri: previewMedia.uri }} className="h-full w-full" resizeMode="contain" />
            ) : (
              <View className="items-center gap-2">
                <ImageIcon size={36} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />
                <Text className="text-kd-caption text-white/60">ไม่พบไฟล์รูปภาพ</Text>
              </View>
            )}
          </View>

          {previewMedia ? (
            <View className="mt-4 flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                onPress={() => openEdit(previewMedia)}
                className="h-11 flex-1 items-center justify-center rounded-kd-lg bg-white/15"
              >
                <Text className="text-kd-body font-medium text-white">แก้ไข</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => confirmDelete([previewMedia.id])}
                className="h-11 flex-1 items-center justify-center rounded-kd-lg bg-kd-red"
              >
                <Text className="text-kd-body font-semibold text-white">ลบ</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={!!editMedia}
        onRequestClose={() => setEditMedia(null)}
      >
        <View className="flex-1 justify-end bg-black/45">
          <View className="gap-3 rounded-t-[20px] border border-kd-border bg-kd-panel p-4 pb-6">
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-kd-title font-semibold text-kd-text">
                แก้ไข{kind === 'images' ? 'รูปภาพ' : 'วิดีโอ'}
              </Text>
              <Pressable
                accessibilityLabel="ปิด"
                accessibilityRole="button"
                onPress={() => setEditMedia(null)}
                className="h-8 w-8 items-center justify-center rounded-full bg-kd-card-muted"
              >
                <X size={16} color={theme.textSubtle} strokeWidth={2.4} />
              </Pressable>
            </View>

            <TextInput
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="ชื่อรายการ"
              placeholderTextColor={theme.textMuted}
              className="h-11 rounded-kd-lg border border-kd-border bg-kd-input px-3 text-kd-body text-kd-text"
            />

            <View className="flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                onPress={() => setEditMedia(null)}
                className="h-11 flex-1 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-card"
              >
                <Text className="text-kd-body font-medium text-kd-text-subtle">ยกเลิก</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void saveEdit()}
                className="h-11 flex-1 items-center justify-center rounded-kd-lg bg-kd-text"
              >
                <Text className="text-kd-body font-semibold text-kd-panel">บันทึก</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  onDeleteMedia,
  onDownloadMedia,
  onEditMedia,
  onFavoriteMedia,
  onViewMedia,
}: {
  theme: KubdeeTheme;
  kind: MediaKind;
  accentColor: string;
  item: MediaGroupRecord;
  media: MediaSubItem[];
  unit: string;
  expanded: boolean;
  selectedIds: Set<string>;
  onToggleExpand: () => void;
  onToggleSelect: (id: string) => void;
  onDeleteMedia: (media: MediaSubItem) => void;
  onDownloadMedia: (media: MediaSubItem) => void;
  onEditMedia: (media: MediaSubItem) => void;
  onFavoriteMedia: (media: MediaSubItem) => void;
  onViewMedia: (media: MediaSubItem) => void;
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
                  onDelete={() => onDeleteMedia(entry)}
                  onEdit={() => onEditMedia(entry)}
                  onToggleSelect={() => onToggleSelect(entry.id)}
                  onView={() => onViewMedia(entry)}
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
                onDelete={() => onDeleteMedia(entry)}
                onDownload={() => onDownloadMedia(entry)}
                onEdit={() => onEditMedia(entry)}
                onFavorite={() => onFavoriteMedia(entry)}
                onPlay={() => onViewMedia(entry)}
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
  onDelete,
  onEdit,
  onToggleSelect,
  onView,
}: {
  theme: KubdeeTheme;
  accentColor: string;
  media: MediaSubItem;
  selected: boolean;
  showProductInfo?: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onToggleSelect: () => void;
  onView: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onLongPress={onToggleSelect}
      onPress={onView}
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

      <Pressable
        accessibilityLabel="เลือก"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        onPress={onToggleSelect}
        className="absolute left-1.5 top-1.5"
      >
        <SelectCircle theme={theme} selected={selected} accent={accentColor} size={18} light />
      </Pressable>

      <View className="absolute right-1.5 top-1.5 flex-row gap-1">
        <Pressable
          accessibilityLabel="แก้ไข"
          accessibilityRole="button"
          onPress={onEdit}
          className="h-6 w-6 items-center justify-center rounded-kd-sm bg-black/55"
        >
          <Pencil size={12} color={theme.white} strokeWidth={2.2} />
        </Pressable>
        <Pressable
          accessibilityLabel="ลบ"
          accessibilityRole="button"
          onPress={onDelete}
          className="h-6 w-6 items-center justify-center rounded-kd-sm bg-black/55"
        >
          <Trash2 size={12} color={theme.white} strokeWidth={2.2} />
        </Pressable>
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
  onDelete,
  onDownload,
  onEdit,
  onFavorite,
  onPlay,
  onToggleSelect,
}: {
  theme: KubdeeTheme;
  accentColor: string;
  media: MediaSubItem;
  selected: boolean;
  showDivider: boolean;
  showProductInfo?: boolean;
  onDelete: () => void;
  onDownload: () => void;
  onEdit: () => void;
  onFavorite: () => void;
  onPlay: () => void;
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

      <Pressable
        accessibilityLabel="เล่นวิดีโอ"
        accessibilityRole="button"
        onPress={onPlay}
        className={`shrink-0 items-center justify-center overflow-hidden rounded-kd-md bg-kd-border dark:bg-kd-card-muted ${
          media.portrait ? 'h-16 w-12' : 'h-12 w-20'
        }`}
      >
        <Play size={16} color={theme.textSubtle} strokeWidth={1.5} />
      </Pressable>

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
          <RowIconButton theme={theme} icon={Pencil} label="แก้ไข" onPress={onEdit} />
          <RowIconButton theme={theme} icon={Play} label="เล่น" onPress={onPlay} />
          <RowIconButton theme={theme} icon={Download} label="ดาวน์โหลด" onPress={onDownload} />
          <RowIconButton theme={theme} icon={Heart} label="กดถูกใจ" onPress={onFavorite} />
          <RowIconButton theme={theme} icon={Trash2} label="ลบ" onPress={onDelete} />
        </View>
      </View>
    </View>
  );
}

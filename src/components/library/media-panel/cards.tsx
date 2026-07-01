import { Image as NativeImage, Pressable, View } from 'react-native';
import { ChevronDown, ChevronRight, Download, Heart, Image as ImageIcon, Pencil, Play, Trash2, Video } from 'lucide-react-native';

import Text from '@/components/ui/KubdeeText';
import { alpha, type KubdeeTheme } from '@/theme/tokens';
import { CardBackdrop, RowIconButton, SelectCircle, libraryCardStops } from '../shared';
import type { MediaGroupRecord, MediaKind, MediaSubItem } from './types';
import { getItemCode } from './utils';
import { LocalVideoPlaceholder } from './video';

export function MediaGroupCard({
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
export function ImageTile({
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
export function VideoRow({
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
        <LocalVideoPlaceholder theme={theme} compact thumbnailUri={media.thumbnailUri} />
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

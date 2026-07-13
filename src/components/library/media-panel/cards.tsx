import type { ComponentType } from 'react';
import { Image as NativeImage, Pressable, View } from 'react-native';
import { Check, ChevronDown, ChevronRight, Download, Eye, Heart, Image as ImageIcon, Pencil, Play, Trash2 } from 'lucide-react-native';

import Text from '@/components/ui/KubdeeText';
import { FacebookLogo, InstagramLogo, ShopeeLogo, TikTokLogo, YouTubeLogo } from '@/components/BrandLogos';
import type { KubdeeTheme } from '@/theme/tokens';
import { CardBackdrop, RowIconButton, libraryCardStops } from '../shared';
import type { MediaGroupRecord, MediaKind, MediaSubItem } from './types';
import { getItemCode, resolveMediaPlatform } from './utils';
import { LocalVideoPlaceholder } from './video';

/**
 * Small source-platform logo shown after a product/media name — mirrors the
 * product library (ProductCard) placement so the two libraries read the same.
 */
function PlatformBadge({
  theme,
  platform,
  productUrl,
}: {
  theme: KubdeeTheme;
  platform?: string | null;
  productUrl?: string | null;
}): React.JSX.Element | null {
  const resolved = resolveMediaPlatform(platform, productUrl);
  if (resolved === 'tiktok') {
    return (
      <View accessible accessibilityLabel="แพลตฟอร์ม TikTok" accessibilityRole="image" className="shrink-0">
        <TikTokLogo size={15} isDark={theme.isDark} />
      </View>
    );
  }
  if (resolved === 'shopee') {
    return (
      <View accessible accessibilityLabel="แพลตฟอร์ม Shopee" accessibilityRole="image" className="shrink-0">
        <ShopeeLogo size={15} />
      </View>
    );
  }
  return null;
}

type BrandLogoComponent = ComponentType<{ size?: number; isDark?: boolean; color?: string; cutoutColor?: string }>;

/** Social destinations a video can be published to (order mirrors the Auto Pilot pipeline). */
const POSTED_DESTINATIONS: { key: string; label: string; Logo: BrandLogoComponent }[] = [
  { key: 'shopee', label: 'Shopee', Logo: ShopeeLogo },
  { key: 'facebook', label: 'Facebook', Logo: FacebookLogo },
  { key: 'instagram', label: 'Instagram', Logo: InstagramLogo },
  { key: 'youtube', label: 'YouTube', Logo: YouTubeLogo },
  { key: 'tiktok', label: 'TikTok', Logo: TikTokLogo },
];

/**
 * Per-video posting status — one small destination logo per platform, lit + green-check
 * where this video has been posted and dimmed elsewhere. A single video can be posted to
 * several platforms, so every matching logo lights up.
 */
function PostedStatusRow({
  theme,
  postedPlatforms,
}: {
  theme: KubdeeTheme;
  postedPlatforms?: Record<string, number> | null;
}): React.JSX.Element {
  const posted = postedPlatforms ?? {};
  const anyPosted = POSTED_DESTINATIONS.some((dest) => Boolean(posted[dest.key]));
  return (
    <View className="min-w-0 shrink flex-row items-center gap-1.5">
      {anyPosted ? (
        <Text className="shrink-0 text-[9px] font-semibold text-kd-emerald">โพสต์แล้ว</Text>
      ) : null}
      <View className="flex-row items-center gap-[5px]">
        {POSTED_DESTINATIONS.map(({ key, label, Logo }) => {
          const isPosted = Boolean(posted[key]);
          return (
            <View
              key={key}
              accessibilityLabel={`${label} ${isPosted ? 'โพสต์แล้ว' : 'ยังไม่โพส'}`}
              accessibilityRole="image"
              className="relative"
              style={{ opacity: isPosted ? 1 : 0.25 }}
            >
              <Logo size={14} isDark={theme.isDark} />
              {isPosted ? (
                <View className="absolute -right-1.5 -top-1.5 h-3 w-3 items-center justify-center rounded-full border border-kd-panel bg-kd-emerald">
                  <Check size={7} color="#ffffff" strokeWidth={4} />
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

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
  productImageUrl,
  onViewProductImage,
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
  /** Real product image for the group thumbnail; falls back to a placeholder icon when absent. */
  productImageUrl?: string | null;
  onViewProductImage?: (uri: string) => void;
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

        {productImageUrl ? (
          <Pressable
            accessibilityLabel="ดูรูปสินค้า"
            accessibilityRole="imagebutton"
            onPress={() => onViewProductImage?.(productImageUrl)}
            className="h-9 w-9 shrink-0 overflow-hidden rounded-kd-lg border border-kd-border active:opacity-70"
          >
            <NativeImage source={{ uri: productImageUrl }} className="h-full w-full" resizeMode="cover" />
          </Pressable>
        ) : (
          <View className="h-9 w-9 shrink-0 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-panel-muted dark:bg-kd-card-muted">
            <ImageIcon size={14} color={theme.textSubtle} strokeWidth={1.5} />
          </View>
        )}

        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text numberOfLines={1} className="min-w-0 flex-shrink text-kd-body font-semibold text-kd-text">
              {item.title}
            </Text>
            <PlatformBadge theme={theme} platform={item.platform} />
          </View>
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
      accessibilityLabel="เลือกรูป"
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
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

      <View className="absolute right-1.5 top-1.5 flex-row gap-1">
        <Pressable
          accessibilityLabel="ดูรูป"
          accessibilityRole="button"
          onPress={onView}
          className="h-6 w-6 items-center justify-center rounded-kd-sm bg-black/55"
        >
          <Eye size={12} color={theme.white} strokeWidth={2.2} />
        </Pressable>
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
  selectionByParent = false,
  productImageUrl,
  onViewProductImage,
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
  /** When true the parent card draws the selected outline, so the row skips its own. */
  selectionByParent?: boolean;
  /** Small product image shown before the platform badge (ungrouped rows). */
  productImageUrl?: string | null;
  onViewProductImage?: (uri: string) => void;
}): React.JSX.Element {
  const showOwnBorder = selected && !selectionByParent;
  return (
    <Pressable
      accessibilityLabel="เลือกวิดีโอ"
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onToggleSelect}
      className={`flex-row items-center gap-2.5 px-1 py-2 ${
        showDivider && !showOwnBorder ? 'border-t border-kd-border' : ''
      }`}
      style={showOwnBorder ? { borderWidth: 1.5, borderColor: accentColor, borderRadius: 10 } : undefined}
    >
      <View className="absolute right-2 top-2 z-[1] flex-row items-center gap-[3px]">
        {media.warnings.map((warning) => (
          <View key={warning} className="rounded-kd-sm bg-kd-amber/90 px-1 py-0.5">
            <Text className="text-[8px] font-bold text-white">{warning}</Text>
          </View>
        ))}
      </View>

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
          <View className="flex-row items-center gap-1.5">
            <Text numberOfLines={1} className="min-w-0 flex-1 text-kd-body font-medium text-kd-text">
              {media.productName}
            </Text>
            {productImageUrl ? (
              <Pressable
                accessibilityLabel="ดูรูปสินค้า"
                accessibilityRole="imagebutton"
                onPress={() => onViewProductImage?.(productImageUrl)}
                className="h-[18px] w-[18px] shrink-0 overflow-hidden rounded-kd-sm border border-kd-border active:opacity-70"
              >
                <NativeImage source={{ uri: productImageUrl }} className="h-full w-full" resizeMode="cover" />
              </Pressable>
            ) : null}
            <PlatformBadge theme={theme} platform={media.platform} productUrl={media.productUrl} />
          </View>
        ) : (
          <Text numberOfLines={1} className="pr-14 text-kd-body font-medium text-kd-text">
            {media.title}
          </Text>
        )}

        <View className="mt-[3px] flex-row items-center gap-1.5">
          {showProductInfo ? (
            <>
              <Text numberOfLines={1} className="min-w-0 shrink text-kd-micro text-kd-text-subtle">
                #{media.productCode}
              </Text>
              <View className="h-[3px] w-[3px] shrink-0 rounded-full bg-kd-border-strong" />
            </>
          ) : null}
          <Text className="shrink-0 text-kd-micro text-kd-text-subtle">{media.date}</Text>
          <View className="h-[3px] w-[3px] shrink-0 rounded-full bg-kd-border-strong" />
          <Text className="shrink-0 text-kd-micro text-kd-text-subtle">{media.size}</Text>
        </View>

        <View className="mt-1 flex-row items-center justify-between gap-2">
          <PostedStatusRow theme={theme} postedPlatforms={media.postedPlatforms} />
          <View className="shrink-0 flex-row items-center gap-0.5">
            <RowIconButton theme={theme} icon={Pencil} label="แก้ไข" onPress={onEdit} />
            <RowIconButton theme={theme} icon={Play} label="เล่น" onPress={onPlay} />
            <RowIconButton theme={theme} icon={Download} label="ดาวน์โหลด" onPress={onDownload} />
            <RowIconButton theme={theme} icon={Heart} label="กดถูกใจ" onPress={onFavorite} />
            <RowIconButton theme={theme} icon={Trash2} label="ลบ" onPress={onDelete} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

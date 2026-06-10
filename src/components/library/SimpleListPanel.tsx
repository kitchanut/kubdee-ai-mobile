import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Presentation,
  Trash2,
  User,
} from 'lucide-react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import Text from '@/components/ui/KubdeeText';
import { galleryItems, type GalleryCategoryId, type GalleryItemRecord } from '@/data/mockData';
import type { KubdeeTheme } from '@/theme/tokens';

import {
  CardBackdrop,
  DarkActionButton,
  EmptyState,
  LibraryPanelHeader,
  darkButtonContentColor,
  getAccentTone,
  libraryCardStops,
} from './shared';

export type SimpleListKind = 'characters' | 'scenes';

const sceneCategoryIds: GalleryCategoryId[] = ['multiScene', 'storyboard', 'extendScene', 'videoCut'];

const panelCopy: Record<SimpleListKind, { title: string; emptyTitle: string; emptyCopy: string }> = {
  characters: {
    title: 'คลังตัวละคร',
    emptyTitle: 'ยังไม่มีตัวละคร',
    emptyCopy: 'กดปุ่ม "เพิ่ม" เพื่อเริ่มต้น',
  },
  scenes: {
    title: 'คลังฉาก',
    emptyTitle: 'ยังไม่มีฉาก',
    emptyCopy: 'กดปุ่ม "เพิ่ม" เพื่อเริ่มต้น',
  },
};

/** Extension avatar colors — <tone>-100 gradient + <tone>-400/500 icon */
const kindPalette: Record<
  SimpleListKind,
  {
    avatarStops: [string, string];
    avatarIcon: string;
  }
> = {
  characters: {
    avatarStops: ['#ede9fe', '#f3e8ff'],
    avatarIcon: '#a78bfa',
  },
  scenes: {
    avatarStops: ['#cffafe', '#e0f2fe'],
    avatarIcon: '#06b6d4',
  },
};

export default function SimpleListPanel({
  theme,
  kind,
}: {
  theme: KubdeeTheme;
  kind: SimpleListKind;
}): React.JSX.Element {
  const copy = panelCopy[kind];
  const accentColor =
    kind === 'characters' ? (theme.isDark ? '#a78bfa' : '#7c3aed') : theme.cyan;
  const accent = getAccentTone(theme, accentColor);
  const HeaderIcon = kind === 'characters' ? User : Presentation;
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());

  const items = useMemo(
    () =>
      galleryItems.filter((item) =>
        kind === 'characters' ? item.category === 'characters' : sceneCategoryIds.includes(item.category)
      ),
    [kind]
  );

  const toggleEnabled = (id: string): void => {
    setDisabledIds((current) => {
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
          count={items.length}
          total={items.length}
          icon={HeaderIcon}
          tone={accent}
          actions={
            <DarkActionButton
              theme={theme}
              label="เพิ่ม"
              leading={<Plus size={12} color={darkButtonContentColor(theme)} strokeWidth={2.5} />}
            />
          }
        />

        <View className="gap-2">
          {items.map((item) => (
            <SimpleRow
              key={item.id}
              theme={theme}
              kind={kind}
              item={item}
              enabled={!disabledIds.has(item.id)}
              onToggleEnabled={() => toggleEnabled(item.id)}
            />
          ))}
        </View>

        {items.length === 0 ? (
          <EmptyState theme={theme} icon={HeaderIcon} title={copy.emptyTitle} copy={copy.emptyCopy} />
        ) : null}
      </ScrollView>
    </View>
  );
}

/**
 * Extension Character/Scene row: rounded-xl card, 48px avatar, name + AI chip,
 * meta line, actions: toggle (emerald) / edit / delete
 */
function SimpleRow({
  theme,
  kind,
  item,
  enabled,
  onToggleEnabled,
}: {
  theme: KubdeeTheme;
  kind: SimpleListKind;
  item: GalleryItemRecord;
  enabled: boolean;
  onToggleEnabled: () => void;
}): React.JSX.Element {
  const AvatarIcon = kind === 'characters' ? User : Presentation;
  const ToggleIcon = enabled ? Eye : EyeOff;
  const showAiChip = item.badges.includes('Ref') || item.badges.includes('Prompt');
  const metaLine = kind === 'scenes' ? item.subtitle : item.meta;
  const detailLine = kind === 'scenes' ? item.meta : null;
  const palette = kindPalette[kind];
  const avatarStops = theme.isDark ? [theme.cardMuted, theme.card] : palette.avatarStops;
  const avatarIconColor = theme.isDark ? theme.textSubtle : palette.avatarIcon;

  return (
    <View
      className={`overflow-hidden rounded-[12px] border border-[#f3f4f6] bg-kd-panel dark:border-kd-border ${
        enabled ? '' : 'opacity-50'
      }`}
      style={{
        elevation: 1,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      }}
    >
      <CardBackdrop theme={theme} id={kind} stops={libraryCardStops[kind]} />

      <View className="flex-row items-center gap-2.5 p-2">
        <View className="h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-[12px] border-2 border-white/50 bg-white/80 dark:border-kd-border-strong/50 dark:bg-kd-card-muted/80">
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <LinearGradient id={`avatar-grad-${kind}`} x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={avatarStops[0]} />
                <Stop offset="1" stopColor={avatarStops[1]} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#avatar-grad-${kind})`} />
          </Svg>
          <AvatarIcon size={20} color={avatarIconColor} strokeWidth={1.5} />
        </View>

        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text numberOfLines={1} className="flex-shrink text-kd-body font-semibold text-kd-text">
              {item.title}
            </Text>
            {showAiChip ? (
              <View className="rounded-full border border-kd-blue/40 bg-kd-blue/10 px-[5px] py-px dark:border-kd-blue/25 dark:bg-kd-blue/20">
                <Text className="text-[8px] font-semibold text-kd-blue">AI</Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={1} className="mt-0.5 text-kd-micro text-kd-text-subtle">
            {metaLine}
          </Text>
          {detailLine ? (
            <Text numberOfLines={1} className="mt-px text-kd-micro text-kd-text-subtle">
              {detailLine}
            </Text>
          ) : null}
        </View>

        <View className="flex-shrink-0 flex-row items-center gap-1">
          <Pressable
            accessibilityLabel={enabled ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
            accessibilityRole="button"
            onPress={onToggleEnabled}
            className={`h-7 w-7 items-center justify-center rounded-kd-lg ${
              enabled
                ? 'bg-kd-emerald/10 dark:bg-kd-emerald/20'
                : 'bg-white/50 dark:bg-kd-card-muted/50'
            }`}
          >
            <ToggleIcon size={14} color={enabled ? theme.emerald : theme.textSubtle} strokeWidth={2} />
          </Pressable>
          <Pressable
            accessibilityLabel="แก้ไข"
            accessibilityRole="button"
            className="h-7 w-7 items-center justify-center rounded-kd-lg bg-white/50 dark:bg-kd-card-muted/50"
          >
            <Pencil size={14} color={theme.textSubtle} strokeWidth={2} />
          </Pressable>
          <Pressable
            accessibilityLabel="ลบ"
            accessibilityRole="button"
            className="h-7 w-7 items-center justify-center rounded-kd-lg bg-white/50 dark:bg-kd-card-muted/50"
          >
            <Trash2 size={14} color={theme.textSubtle} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

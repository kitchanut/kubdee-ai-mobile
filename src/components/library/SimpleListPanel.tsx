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

import Text from '@/components/ui/KubdeeText';
import { galleryItems, type GalleryCategoryId, type GalleryItemRecord } from '@/data/mockData';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';

import {
  DarkActionButton,
  EmptyState,
  LibraryPanelHeader,
  darkButtonContentColor,
  getSlateTone,
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

export default function SimpleListPanel({
  theme,
  kind,
}: {
  theme: KubdeeTheme;
  kind: SimpleListKind;
}): React.JSX.Element {
  const copy = panelCopy[kind];
  const slate = getSlateTone(theme);
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
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <LibraryPanelHeader
          theme={theme}
          title={copy.title}
          count={items.length}
          total={items.length}
          icon={HeaderIcon}
          tone={slate}
          actions={
            <DarkActionButton
              theme={theme}
              label="เพิ่ม"
              leading={<Plus size={12} color={darkButtonContentColor(theme)} strokeWidth={2.5} />}
            />
          }
        />

        <View style={styles.list}>
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

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: theme.isDark ? theme.card : theme.cardMuted,
          borderColor: theme.border,
          opacity: enabled ? 1 : 0.5,
        },
      ]}
    >
      <View
        style={[
          styles.avatar,
          {
            backgroundColor: theme.isDark ? theme.cardMuted : theme.white,
            borderColor: theme.isDark ? theme.borderStrong : theme.white,
          },
        ]}
      >
        <AvatarIcon size={20} color={theme.textSubtle} strokeWidth={1.5} />
      </View>

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>
            {item.title}
          </Text>
          {showAiChip ? (
            <View
              style={[
                styles.aiChip,
                {
                  backgroundColor: alpha(theme.blue, theme.isDark ? 0.2 : 0.1),
                  borderColor: alpha(theme.blue, theme.isDark ? 0.25 : 0.4),
                },
              ]}
            >
              <Text style={[styles.aiChipText, { color: theme.blue }]}>AI</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} style={[styles.meta, { color: theme.textSubtle }]}>
          {metaLine}
        </Text>
        {detailLine ? (
          <Text numberOfLines={1} style={[styles.detail, { color: theme.textSubtle }]}>
            {detailLine}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel={enabled ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
          accessibilityRole="button"
          onPress={onToggleEnabled}
          style={[
            styles.actionButton,
            {
              backgroundColor: enabled
                ? alpha(theme.emerald, theme.isDark ? 0.18 : 0.1)
                : theme.isDark
                  ? alpha(theme.cardMuted, 0.5)
                  : alpha(theme.white, 0.5),
            },
          ]}
        >
          <ToggleIcon size={14} color={enabled ? theme.emerald : theme.textSubtle} strokeWidth={2} />
        </Pressable>
        <Pressable
          accessibilityLabel="แก้ไข"
          accessibilityRole="button"
          style={[
            styles.actionButton,
            { backgroundColor: theme.isDark ? alpha(theme.cardMuted, 0.5) : alpha(theme.white, 0.5) },
          ]}
        >
          <Pencil size={14} color={theme.textSubtle} strokeWidth={2} />
        </Pressable>
        <Pressable
          accessibilityLabel="ลบ"
          accessibilityRole="button"
          style={[
            styles.actionButton,
            { backgroundColor: theme.isDark ? alpha(theme.cardMuted, 0.5) : alpha(theme.white, 0.5) },
          ]}
        >
          <Trash2 size={14} color={theme.textSubtle} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 4,
  },
  aiChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  aiChipText: {
    fontSize: 8,
    fontWeight: '600',
  },
  avatar: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 2,
    flexShrink: 0,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  container: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingBottom: 80,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  detail: {
    fontSize: 10,
    marginTop: 1,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  list: {
    gap: 8,
  },
  meta: {
    fontSize: 10,
    marginTop: 2,
  },
  name: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  nameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  row: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 8,
  },
});

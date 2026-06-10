import type { ComponentType, ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Check, ChevronDown, ChevronUp, Pencil, Search, Star, Trash2, X } from 'lucide-react-native';

import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';

export type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
};

export type IconComponent = ComponentType<IconProps>;

export interface ToneColors {
  color: string;
  soft: string;
}

/** Extension: bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-300 */
export function getSlateTone(theme: KubdeeTheme): ToneColors {
  return {
    color: theme.textMuted,
    soft: theme.isDark ? theme.cardMuted : theme.panelMuted,
  };
}

/** Extension: bg-<tone>-500/10 text-<tone>-500 (dark /15) */
export function getAccentTone(theme: KubdeeTheme, color: string): ToneColors {
  return {
    color,
    soft: alpha(color, theme.isDark ? 0.16 : 0.1),
  };
}

/**
 * Replica of extension common/LibraryPanelHeader.jsx
 * icon chip 32x32 rounded-lg + title 13px semibold + "count / total รายการ" + actions
 */
export function LibraryPanelHeader({
  theme,
  title,
  count,
  total,
  icon: Icon,
  tone,
  actions,
}: {
  theme: KubdeeTheme;
  title: string;
  count: number;
  total: number;
  icon: IconComponent;
  tone: ToneColors;
  actions?: ReactNode;
}): React.JSX.Element {
  return (
    <View style={sharedStyles.headerRow}>
      <View style={[sharedStyles.headerIconChip, { backgroundColor: tone.soft }]}>
        <Icon size={16} color={tone.color} strokeWidth={2} />
      </View>
      <View style={sharedStyles.headerTitleWrap}>
        <Text numberOfLines={1} style={[sharedStyles.headerTitle, { color: theme.text }]}>
          {title}
        </Text>
        <Text style={[sharedStyles.headerCount, { color: theme.textSubtle }]}>
          {count} / {total} รายการ
        </Text>
      </View>
      {actions ? <View style={sharedStyles.headerActions}>{actions}</View> : null}
    </View>
  );
}

/** Extension: p-1 rounded-md text-gray-500 hover:bg-gray-100 */
export function HeaderIconButton({
  theme,
  icon: Icon,
  label,
  onPress,
}: {
  theme: KubdeeTheme;
  icon: IconComponent;
  label: string;
  onPress?: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={sharedStyles.headerIconButton}
    >
      <Icon size={14} color={theme.textSubtle} strokeWidth={2} />
    </Pressable>
  );
}

/** Extension: bg-gray-800 dark:bg-white text-white dark:text-gray-800 rounded-lg px-3 py-1.5 text-[10px] */
export function DarkActionButton({
  theme,
  label,
  leading,
  small = false,
  onPress,
}: {
  theme: KubdeeTheme;
  label: string;
  leading?: ReactNode;
  small?: boolean;
  onPress?: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={[
        small ? sharedStyles.darkButtonSmall : sharedStyles.darkButton,
        { backgroundColor: theme.isDark ? theme.white : '#1f2937' },
      ]}
    >
      {leading}
      <Text
        style={[
          sharedStyles.darkButtonText,
          { color: theme.isDark ? '#1f2937' : theme.white },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function darkButtonContentColor(theme: KubdeeTheme): string {
  return theme.isDark ? '#1f2937' : theme.white;
}

/** Extension: h-7 pl-6 pr-6 text-[10px] rounded-md border-gray-200 bg-white dark:bg-zinc-800 */
export function SearchBox({
  theme,
  value,
  onChange,
  placeholder,
}: {
  theme: KubdeeTheme;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}): React.JSX.Element {
  return (
    <View
      style={[
        sharedStyles.searchBox,
        { backgroundColor: theme.input, borderColor: theme.border },
      ]}
    >
      <Search size={12} color={theme.textSubtle} strokeWidth={2} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textSubtle}
        style={[sharedStyles.searchInput, { color: theme.text }]}
      />
      {value.length > 0 ? (
        <Pressable accessibilityLabel="ล้างคำค้นหา" accessibilityRole="button" onPress={() => onChange('')}>
          <X size={12} color={theme.textSubtle} strokeWidth={2.5} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Extension: circular checkbox (yellow/red/emerald when selected) */
export function SelectCircle({
  theme,
  selected,
  accent,
  size = 16,
  light = false,
}: {
  theme: KubdeeTheme;
  selected: boolean;
  accent: string;
  size?: number;
  /** on-image variant: white/90 background when unselected */
  light?: boolean;
}): React.JSX.Element {
  const unselectedBackground = light
    ? alpha(theme.isDark ? '#000000' : '#ffffff', theme.isDark ? 0.5 : 0.9)
    : theme.input;

  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: selected ? accent : unselectedBackground,
        borderColor: selected ? accent : theme.borderStrong,
        borderRadius: 999,
        borderWidth: selected ? 0 : 1,
        height: size,
        justifyContent: 'center',
        width: size,
      }}
    >
      {selected ? <Check size={size - 6} color={theme.white} strokeWidth={3.2} /> : null}
    </View>
  );
}

/** Extension: text-[9px] px-1.5 py-0.5 rounded-full / active bg-<tone>-100 text-<tone>-600 */
export function SortPill({
  theme,
  accent,
  active,
  label,
  ascending,
  onPress,
}: {
  theme: KubdeeTheme;
  accent: string;
  active: boolean;
  label: string;
  ascending?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const DirectionIcon = ascending ? ChevronUp : ChevronDown;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        sharedStyles.sortPill,
        {
          backgroundColor: active
            ? alpha(accent, theme.isDark ? 0.22 : 0.12)
            : theme.isDark
              ? theme.cardMuted
              : theme.panelMuted,
        },
      ]}
    >
      <Text style={[sharedStyles.sortPillText, { color: active ? accent : theme.textSubtle }]}>{label}</Text>
      {active ? <DirectionIcon size={9} color={accent} strokeWidth={3} /> : null}
    </Pressable>
  );
}

/** Extension: inner product/general tab bar with 2px tone underline */
export function PanelSubTabs<TKey extends string>({
  theme,
  accent,
  tabs,
  active,
  onChange,
}: {
  theme: KubdeeTheme;
  accent: string;
  tabs: Array<{ key: TKey; label: string }>;
  active: TKey;
  onChange: (next: TKey) => void;
}): React.JSX.Element {
  return (
    <View style={[sharedStyles.subTabs, { borderBottomColor: theme.border }]}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;

        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={sharedStyles.subTab}
          >
            <Text
              style={[
                sharedStyles.subTabText,
                {
                  color: isActive ? accent : theme.textSubtle,
                  fontWeight: '500',
                },
              ]}
            >
              {tab.label}
            </Text>
            {isActive ? <View style={[sharedStyles.subTabIndicator, { backgroundColor: accent }]} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Extension: 64px gray circle + title + copy */
export function EmptyState({
  theme,
  icon: Icon,
  title,
  copy,
}: {
  theme: KubdeeTheme;
  icon: IconComponent;
  title: string;
  copy: string;
}): React.JSX.Element {
  return (
    <View style={sharedStyles.emptyState}>
      <View
        style={[
          sharedStyles.emptyCircle,
          { backgroundColor: theme.isDark ? theme.cardMuted : theme.panelMuted },
        ]}
      >
        <Icon size={30} color={theme.textSubtle} strokeWidth={1.5} />
      </View>
      <Text style={[sharedStyles.emptyTitle, { color: theme.textMuted }]}>{title}</Text>
      <Text style={[sharedStyles.emptyCopy, { color: theme.textSubtle }]}>{copy}</Text>
    </View>
  );
}

/** Small centered hint, extension: text-[11px] text-gray-500 py-8 */
export function EmptyHint({ theme, label }: { theme: KubdeeTheme; label: string }): React.JSX.Element {
  return (
    <View style={sharedStyles.emptyHint}>
      <Text style={[sharedStyles.emptyHintText, { color: theme.textSubtle }]}>{label}</Text>
    </View>
  );
}

/** Extension: fixed bottom rounded-full selection bar */
export function SelectionBar({
  theme,
  accent,
  count,
  showAuto = false,
  onClear,
}: {
  theme: KubdeeTheme;
  accent: string;
  count: number;
  showAuto?: boolean;
  onClear: () => void;
}): React.JSX.Element {
  const inverseBackground = theme.isDark ? theme.white : '#000000';
  const inverseText = theme.isDark ? '#000000' : theme.white;

  return (
    <View pointerEvents="box-none" style={sharedStyles.selectionBarWrap}>
      <View
        style={[
          sharedStyles.selectionBar,
          {
            backgroundColor: theme.panel,
            borderColor: theme.border,
            shadowColor: theme.shadow,
          },
        ]}
      >
        <View style={sharedStyles.selectionBarLeft}>
          <View style={[sharedStyles.selectionCount, { backgroundColor: inverseBackground }]}>
            <Text style={[sharedStyles.selectionCountText, { color: inverseText }]}>{count}</Text>
          </View>
          <Text style={[sharedStyles.selectionLabel, { color: theme.text }]}>รายการที่เลือก</Text>
          <View style={[sharedStyles.selectionDivider, { backgroundColor: theme.border }]} />
          <Pressable accessibilityRole="button" onPress={onClear}>
            <Text style={[sharedStyles.selectionCancel, { color: theme.textSubtle }]}>ยกเลิก</Text>
          </Pressable>
        </View>

        <View style={sharedStyles.selectionBarRight}>
          {showAuto ? (
            <Pressable
              accessibilityLabel="ส่งไป Auto"
              accessibilityRole="button"
              style={[sharedStyles.selectionAuto, { backgroundColor: inverseBackground }]}
            >
              <Star size={11} color={inverseText} strokeWidth={2.5} />
              <Text style={[sharedStyles.selectionAutoText, { color: inverseText }]}>ออโต้</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel="แก้ไข"
            accessibilityRole="button"
            style={[sharedStyles.selectionAction, { backgroundColor: accent }]}
          >
            <Pencil size={12} color={theme.white} strokeWidth={2.5} />
          </Pressable>
          <Pressable
            accessibilityLabel="ลบ"
            accessibilityRole="button"
            style={[
              sharedStyles.selectionAction,
              {
                backgroundColor: theme.panel,
                borderColor: theme.border,
                borderWidth: 1,
              },
            ]}
          >
            <Trash2 size={12} color={theme.textSubtle} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Extension VideoItem action icons: h-6 w-6 rounded text-gray-400 */
export function RowIconButton({
  theme,
  icon: Icon,
  label,
  color,
  fill = false,
  onPress,
}: {
  theme: KubdeeTheme;
  icon: IconComponent;
  label: string;
  color?: string;
  fill?: boolean;
  onPress?: () => void;
}): React.JSX.Element {
  const iconColor = color ?? theme.textSubtle;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={sharedStyles.rowIconButton}
    >
      <Icon size={12} color={iconColor} strokeWidth={2} fill={fill ? iconColor : 'none'} />
    </Pressable>
  );
}

export const sharedStyles = StyleSheet.create({
  darkButton: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 6,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  darkButtonSmall: {
    alignItems: 'center',
    borderRadius: 6,
    flexDirection: 'row',
    gap: 4,
    height: 26,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  darkButtonText: {
    fontSize: 11,
    fontWeight: '500',
  },
  emptyCircle: {
    alignItems: 'center',
    borderRadius: 999,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  emptyCopy: {
    fontSize: 11,
    lineHeight: 16,
    maxWidth: 220,
    textAlign: 'center',
  },
  emptyHint: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyHintText: {
    fontSize: 11,
  },
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 44,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 6,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 6,
  },
  headerCount: {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '500',
  },
  headerIconButton: {
    alignItems: 'center',
    borderRadius: 6,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  headerIconChip: {
    alignItems: 'center',
    borderRadius: 8,
    flexShrink: 0,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  headerTitleWrap: {
    alignItems: 'baseline',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 6,
    minWidth: 0,
  },
  rowIconButton: {
    alignItems: 'center',
    borderRadius: 4,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  searchBox: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    height: 32,
    paddingHorizontal: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 11,
    height: 32,
    padding: 0,
  },
  selectionAction: {
    alignItems: 'center',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  selectionAuto: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 5,
    height: 28,
    paddingHorizontal: 12,
  },
  selectionAutoText: {
    fontSize: 10,
    fontWeight: '700',
  },
  selectionBar: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    elevation: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 6,
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  selectionBarLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 6,
  },
  selectionBarRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  selectionBarWrap: {
    bottom: 12,
    left: 12,
    position: 'absolute',
    right: 12,
  },
  selectionCancel: {
    fontSize: 11,
  },
  selectionCount: {
    alignItems: 'center',
    borderRadius: 999,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  selectionCountText: {
    fontSize: 11,
    fontWeight: '700',
  },
  selectionDivider: {
    height: 12,
    width: 1,
  },
  selectionLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  sortPill: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 2,
    height: 22,
    paddingHorizontal: 8,
  },
  sortPillText: {
    fontSize: 10,
    fontWeight: '500',
  },
  subTab: {
    alignItems: 'center',
    flex: 1,
    height: 36,
    justifyContent: 'center',
  },
  subTabIndicator: {
    bottom: 0,
    height: 2,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  subTabs: {
    borderBottomWidth: 1,
    flexDirection: 'row',
  },
  subTabText: {
    fontSize: 11,
  },
});

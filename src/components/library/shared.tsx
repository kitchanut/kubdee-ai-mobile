import type { ComponentType, ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Check, ChevronDown, ChevronUp, Pencil, Search, Star, Trash2, Upload, X } from 'lucide-react-native';
import Svg, { Circle, Defs, LinearGradient, Pattern, Rect, Stop } from 'react-native-svg';

import { ShopeeLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import { SHOPEE_ORANGE } from '@/theme/brandColors';
import { kubdeeFontFamilies } from '@/theme/fonts';
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

export type LibraryCardKind = 'characters' | 'scenes' | 'products' | 'images' | 'videos';

/** Extension-style card wash: tailwind *-50 tones left→right (80/50/30) */
export const libraryCardStops: Record<LibraryCardKind, [string, string, string]> = {
  characters: ['#f5f3ff', '#faf5ff', '#fdf4ff'],
  scenes: ['#ecfeff', '#f0f9ff', '#eff6ff'],
  products: ['#ecfdf5', '#f0fdf4', '#f0fdfa'],
  images: ['#fffbeb', '#fefce8', '#fff7ed'],
  videos: ['#fef2f2', '#fff1f2', '#fdf2f8'],
};

/**
 * Replica of extension card backdrop: horizontal tone gradient (80/50/30)
 * + 12px dot pattern at 3% (5% dark) opacity.
 * Host card must have no padding (absolute children are inset by parent padding).
 */
export function CardBackdrop({
  theme,
  id,
  stops,
}: {
  theme: KubdeeTheme;
  id: string;
  stops: [string, string, string];
}): React.JSX.Element {
  const gradientStops = theme.isDark
    ? ([theme.cardMuted, theme.cardMuted, theme.cardMuted] as const)
    : stops;
  const stopOpacities = theme.isDark ? [0.8, 0.6, 0.4] : [0.8, 0.5, 0.3];

  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <LinearGradient id={`card-grad-${id}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={gradientStops[0]} stopOpacity={stopOpacities[0]} />
          <Stop offset="0.5" stopColor={gradientStops[1]} stopOpacity={stopOpacities[1]} />
          <Stop offset="1" stopColor={gradientStops[2]} stopOpacity={stopOpacities[2]} />
        </LinearGradient>
        <Pattern id={`card-dots-${id}`} patternUnits="userSpaceOnUse" width="12" height="12">
          <Circle cx="1.5" cy="1.5" r="1" fill="#000000" fillOpacity="0.4" />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#card-grad-${id})`} />
      <Rect width="100%" height="100%" fill={`url(#card-dots-${id})`} opacity={theme.isDark ? 0.05 : 0.03} />
    </Svg>
  );
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
  suffix,
}: {
  theme: KubdeeTheme;
  title: string;
  count: number;
  total: number;
  icon: IconComponent;
  tone: ToneColors;
  actions?: ReactNode;
  /** Replaces the default " รายการ" after "count / total" (e.g. " · ซิงก์ล่าสุด 10:22") */
  suffix?: string;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center justify-between gap-2">
      <View
        className="h-8 w-8 flex-shrink-0 items-center justify-center rounded-kd-lg"
        style={{ backgroundColor: tone.soft }}
      >
        <Icon size={16} color={tone.color} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1 flex-row flex-wrap items-baseline gap-x-1.5">
        <Text numberOfLines={1} className="flex-shrink text-[13px] font-semibold text-kd-text">
          {title}
        </Text>
        <Text className="flex-shrink-0 text-kd-caption font-medium text-kd-text-subtle">
          {count} / {total}{suffix === undefined ? ' รายการ' : suffix}
        </Text>
      </View>
      {actions ? <View className="flex-shrink-0 flex-row items-center gap-1.5">{actions}</View> : null}
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
      className="h-7 w-7 items-center justify-center rounded-kd-md"
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
  iconOnly = false,
  onPress,
  color,
  disabled = false,
}: {
  theme: KubdeeTheme;
  label: string;
  leading?: ReactNode;
  small?: boolean;
  /** Renders only the leading icon; label is kept for accessibility */
  iconOnly?: boolean;
  onPress?: () => void;
  /** Fixed background (both modes) for brand buttons, e.g. Shopee orange */
  color?: string;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={color ? { backgroundColor: color } : undefined}
      className={`flex-row items-center justify-center bg-[#1f2937] dark:bg-white ${
        small
          ? `h-[26px] rounded-kd-md ${iconOnly ? 'w-[26px]' : 'gap-1 px-2'}`
          : `h-[30px] rounded-kd-lg ${iconOnly ? 'w-[30px]' : 'gap-1.5 px-3'}`
      } disabled:opacity-60`}
    >
      {leading}
      {iconOnly ? null : (
        <Text className="text-kd-caption font-medium text-white dark:text-[#1f2937]">
          {label}
        </Text>
      )}
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
  containerClassName = 'flex-1',
}: {
  theme: KubdeeTheme;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  containerClassName?: string;
}): React.JSX.Element {
  return (
    <View
      className={`h-8 min-h-8 flex-row items-center gap-1.5 rounded-kd-md border border-kd-border bg-kd-input px-2 ${containerClassName}`}
    >
      <Search size={12} color={theme.textSubtle} strokeWidth={2} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textSubtle}
        className="h-8 min-h-8 flex-1 p-0 text-kd-caption text-kd-text"
        style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
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
  return (
    <View
      className={`items-center justify-center rounded-full ${
        selected
          ? ''
          : light
            ? 'border border-kd-border-strong bg-white/90 dark:bg-black/50'
            : 'border border-kd-border-strong bg-kd-input'
      }`}
      style={[{ height: size, width: size }, selected ? { backgroundColor: accent } : null]}
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
      className={`h-[22px] flex-row items-center gap-0.5 rounded-full px-2 ${
        active ? '' : 'bg-kd-panel-muted dark:bg-kd-card-muted'
      }`}
      style={active ? { backgroundColor: alpha(accent, theme.isDark ? 0.22 : 0.12) } : undefined}
    >
      <Text
        className={`text-kd-micro font-medium ${active ? '' : 'text-kd-text-subtle'}`}
        style={active ? { color: accent } : undefined}
      >
        {label}
      </Text>
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
  tabs: { key: TKey; label: string }[];
  active: TKey;
  onChange: (next: TKey) => void;
}): React.JSX.Element {
  return (
    <View className="flex-row border-b border-kd-border">
      {tabs.map((tab) => {
        const isActive = tab.key === active;

        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            key={tab.key}
            onPress={() => onChange(tab.key)}
            className="h-9 flex-1 items-center justify-center"
          >
            <Text
              className={`text-kd-caption font-medium ${isActive ? '' : 'text-kd-text-subtle'}`}
              style={isActive ? { color: accent } : undefined}
            >
              {tab.label}
            </Text>
            {isActive ? (
              <View
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ backgroundColor: accent }}
              />
            ) : null}
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
    <View className="items-center gap-2 px-6 py-11">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-kd-panel-muted dark:bg-kd-card-muted">
        <Icon size={30} color={theme.textSubtle} strokeWidth={1.5} />
      </View>
      <Text className="mt-1.5 text-[13px] font-semibold text-kd-text-muted">{title}</Text>
      <Text className="max-w-[220px] text-center text-kd-caption leading-4 text-kd-text-subtle">{copy}</Text>
    </View>
  );
}

/** Small centered hint, extension: text-[11px] text-gray-500 py-8 */
export function EmptyHint({ theme, label }: { theme: KubdeeTheme; label: string }): React.JSX.Element {
  return (
    <View className="items-center py-8">
      <Text className="text-kd-caption text-kd-text-subtle">{label}</Text>
    </View>
  );
}

/** Extension: fixed bottom rounded-full selection bar */
export function SelectionBar({
  theme,
  accent,
  count,
  bottomInset = 0,
  showAuto = false,
  showCloudUpload = false,
  showShopee = false,
  onAuto,
  onCloudUpload,
  onShopee,
  onClear,
  onDelete,
  onEdit,
}: {
  theme: KubdeeTheme;
  accent: string;
  count: number;
  bottomInset?: number;
  showAuto?: boolean;
  showCloudUpload?: boolean;
  showShopee?: boolean;
  onAuto?: () => void;
  onCloudUpload?: () => void;
  onShopee?: () => void;
  onClear: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
}): React.JSX.Element {
  const inverseText = theme.isDark ? '#000000' : theme.white;
  const floatingBottom = Platform.OS === 'android' ? 12 : Math.max(bottomInset + 12, 12);

  return (
    <View
      pointerEvents="box-none"
      className="absolute left-3 right-3"
      style={{ bottom: floatingBottom }}
    >
      <View
        className="flex-row items-center justify-between rounded-full border border-kd-border bg-kd-panel px-2 py-1.5"
        style={{
          elevation: 6,
          shadowColor: theme.shadow,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.18,
          shadowRadius: 16,
        }}
      >
        <View className="flex-row items-center gap-2 pl-1.5">
          <View className="h-5 w-5 items-center justify-center rounded-full bg-black dark:bg-white">
            <Text className="text-kd-caption font-bold text-white dark:text-black">{count}</Text>
          </View>
          <Text className="text-kd-caption font-medium text-kd-text">รายการที่เลือก</Text>
          <View className="h-3 w-px bg-kd-border" />
          <Pressable accessibilityRole="button" onPress={onClear}>
            <Text className="text-kd-caption text-kd-text-subtle">ยกเลิก</Text>
          </Pressable>
        </View>

        <View className="flex-row items-center gap-1.5">
          {showAuto ? (
            <Pressable
              accessibilityLabel="ส่งไป Auto"
              accessibilityRole="button"
              disabled={!onAuto}
              onPress={onAuto}
              className="h-7 flex-row items-center gap-[5px] rounded-full bg-black px-3 dark:bg-white"
            >
              <Star size={11} color={inverseText} strokeWidth={2.5} />
              <Text className="text-kd-micro font-bold text-white dark:text-black">ออโต้</Text>
            </Pressable>
          ) : null}
          {showShopee ? (
            <Pressable
              accessibilityLabel="ส่งไป Shopee"
              accessibilityRole="button"
              disabled={!onShopee}
              onPress={onShopee}
              className="h-7 w-7 items-center justify-center rounded-full"
              style={{ backgroundColor: SHOPEE_ORANGE }}
            >
              <ShopeeLogo size={14} color={theme.white} cutoutColor={SHOPEE_ORANGE} />
            </Pressable>
          ) : null}
          {showCloudUpload ? (
            <Pressable
              accessibilityLabel="ส่งขึ้น Cloud Transfer"
              accessibilityRole="button"
              disabled={!onCloudUpload}
              onPress={onCloudUpload}
              className="h-7 w-7 items-center justify-center rounded-full bg-kd-blue"
            >
              <Upload size={12} color={theme.white} strokeWidth={2.5} />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel="แก้ไข"
            accessibilityRole="button"
            onPress={onEdit}
            className="h-7 w-7 items-center justify-center rounded-full"
            style={{ backgroundColor: accent }}
          >
            <Pencil size={12} color={theme.white} strokeWidth={2.5} />
          </Pressable>
          <Pressable
            accessibilityLabel="ลบ"
            accessibilityRole="button"
            onPress={onDelete}
            className="h-7 w-7 items-center justify-center rounded-full border border-kd-border bg-kd-panel"
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
      className="h-6 w-6 items-center justify-center rounded-kd-sm"
    >
      <Icon size={12} color={iconColor} strokeWidth={2} fill={fill ? iconColor : 'none'} />
    </Pressable>
  );
}

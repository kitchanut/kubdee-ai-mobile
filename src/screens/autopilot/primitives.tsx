import { useContext } from 'react';
import { Pressable, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Bot, ChevronDown } from 'lucide-react-native';

import Text from '@/components/ui/KubdeeText';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { kubdeeFontFamilies } from '@/theme/fonts';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';

import { SettingsAccentContext, type OptionValue } from './constants';

export function SectionCard({
  action,
  children,
  icon: Icon,
  theme,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  icon: typeof Bot;
  theme: KubdeeTheme;
  title: string;
}): React.JSX.Element {
  return (
    <View className="gap-2.5 rounded-kd-2xl border border-kd-border bg-kd-card p-2.5">
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <View className="h-8 w-8 items-center justify-center rounded-kd-lg bg-kd-panel-muted dark:bg-kd-card-muted">
            <Icon size={16} color={theme.textMuted} strokeWidth={2} />
          </View>
          <Text numberOfLines={1} className="text-kd-subtitle font-semibold text-kd-text">
            {title}
          </Text>
        </View>
        {action ? <View className="shrink-0">{action}</View> : null}
      </View>
      {children}
    </View>
  );
}

export function ProgressMetric({
  color,
  icon: Icon,
  label,
  theme,
  value,
}: {
  color: string;
  icon: typeof Bot;
  label: string;
  theme: KubdeeTheme;
  value: string;
}): React.JSX.Element {
  return (
    <View className="min-h-[74px] flex-1 items-center justify-center gap-1 rounded-kd-md bg-kd-panel-muted px-1.5 dark:bg-kd-card-muted">
      <View className="h-10 w-10 items-center justify-center rounded-full border px-0.5" style={{ borderColor: alpha(color, 0.55), backgroundColor: alpha(color, theme.isDark ? 0.14 : 0.08) }}>
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} className="text-kd-caption font-medium" style={{ color }}>{value}</Text>
      </View>
      <View className="flex-row items-center gap-1">
        <Icon size={10} color={theme.textSubtle} strokeWidth={2} />
        <Text numberOfLines={1} className="text-kd-micro font-semibold text-kd-text-subtle">{label}</Text>
      </View>
    </View>
  );
}

export function SelectField({
  label,
  options,
  theme,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ label: string; value: OptionValue }>;
  theme: KubdeeTheme;
  value: OptionValue;
  onChange: (value: OptionValue) => void;
}): React.JSX.Element {
  const selectedLabel = options.find((o) => String(o.value) === String(value))?.label ?? '';

  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text className="text-kd-micro font-normal text-kd-text-subtle">{label}</Text>
      <View className="h-9 w-full overflow-hidden rounded-kd-lg border border-kd-border bg-kd-input">
        {/* Custom text with correct font */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 10, right: 28, top: 0, bottom: 0, justifyContent: 'center' }}
        >
          <Text className="text-kd-caption font-normal text-kd-text" numberOfLines={1}>
            {selectedLabel}
          </Text>
        </View>
        {/* Cover native arrow + show custom ChevronDown */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 28, backgroundColor: theme.input, justifyContent: 'center', alignItems: 'center' }}
        >
          <ChevronDown size={13} color={theme.textMuted} strokeWidth={2} />
        </View>
        {/* Transparent Picker — handles tap + shows dialog */}
        <Picker
          selectedValue={String(value)}
          onValueChange={(itemValue) => {
            const original = options.find((o) => String(o.value) === String(itemValue));
            if (original) onChange(original.value);
          }}
          mode="dialog"
          dropdownIconColor={theme.input}
          style={{
            color: 'transparent',
            backgroundColor: 'transparent',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        >
          {options.map((option) => (
            <Picker.Item
              key={String(option.value)}
              label={option.label}
              value={String(option.value)}
              color={theme.text}
              style={{ fontSize: 12 }}
            />
          ))}
        </Picker>
      </View>
    </View>
  );
}

export function OptionGroup({
  compact = false,
  columns,
  disabledValues,
  label,
  options,
  theme,
  value,
  variant = 'segmented',
  accent,
  onChange,
  onToggle,
}: {
  compact?: boolean;
  columns?: number;
  disabledValues?: OptionValue[];
  label?: string;
  options: Array<{ label: string; value: OptionValue; disabled?: boolean }>;
  theme: KubdeeTheme;
  value: OptionValue | OptionValue[];
  variant?: 'segmented' | 'grid';
  accent?: string;
  onChange?: (value: OptionValue) => void;
  onToggle?: (value: OptionValue) => void;
}): React.JSX.Element {
  const contextAccent = useContext(SettingsAccentContext);
  const accentColor = accent ?? contextAccent ?? theme.amber;
  const values = Array.isArray(value) ? value : [value];
  const isGrid = variant === 'grid';

  const handlePress = (optionValue: OptionValue): void => {
    if (disabledValues?.some((disabledValue) => String(disabledValue) === String(optionValue))) {
      return;
    }
    if (onToggle) {
      onToggle(optionValue);
    } else {
      onChange?.(optionValue);
    }
  };

  // segmented = light gray track with a white (accent-text) selected pill;
  // grid = individually bordered chips that tint with the accent when selected.
  // NOTE: ใช้ Pressable + token rounded-kd-* ตรง ๆ (ไม่ใช้ ToggleGroup) เพราะ
  // ToggleGroupItem มี base `rounded-none` ที่ twMerge ไม่รู้จัก custom token เลย override ไม่ได้ → ขอบเหลี่ยม
  const sizeStyle = columns
    ? { flexBasis: `${100 / columns - 1.5}%` as DimensionValue }
    : isGrid
      ? undefined
      : { flexGrow: 1, flexBasis: 0 as DimensionValue };

  const itemStyle = (active: boolean) => {
    if (isGrid) {
      return [
        sizeStyle,
        active
          ? { borderColor: accentColor, backgroundColor: alpha(accentColor, theme.isDark ? 0.18 : 0.1) }
          : { borderColor: theme.border, backgroundColor: theme.input },
      ];
    }
    return [
      sizeStyle,
      active
        ? {
            backgroundColor: theme.isDark ? theme.input : theme.white,
            shadowColor: theme.shadow,
            shadowOpacity: 0.08,
            shadowRadius: 3,
            elevation: 1,
          }
        : { backgroundColor: 'transparent' },
    ];
  };

  return (
    <View className="min-w-0 flex-1 gap-1.5">
      {label ? <Text className="text-kd-micro font-semibold text-kd-text-subtle">{label}</Text> : null}
      <View
        className={
          isGrid
            ? 'flex-row flex-wrap gap-1.5'
            : 'flex-row flex-wrap gap-0.5 rounded-kd-lg bg-kd-panel-muted p-0.5 dark:bg-kd-card-muted'
        }
      >
        {options.map((option) => {
          const active = values.includes(option.value);
          const disabled = option.disabled || disabledValues?.some((disabledValue) => String(disabledValue) === String(option.value));
          return (
            <Pressable
              accessibilityRole={onToggle ? 'checkbox' : 'button'}
              accessibilityState={{ checked: active, disabled, selected: active }}
              disabled={disabled}
              key={String(option.value)}
              onPress={() => handlePress(option.value)}
              className={`min-h-[30px] items-center justify-center rounded-kd-md px-2 ${isGrid ? 'border' : ''}`}
              style={itemStyle(active)}
            >
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.78}
                numberOfLines={1}
                className={`${compact ? 'text-kd-micro' : 'text-kd-caption'} font-semibold`}
                style={{ color: active ? accentColor : theme.textSubtle, opacity: disabled ? 0.42 : 1 }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function SettingInput({
  label,
  multiline = false,
  placeholder,
  theme,
  value,
  onChangeText,
}: {
  label?: string;
  multiline?: boolean;
  placeholder: string;
  theme: KubdeeTheme;
  value: string;
  onChangeText: (value: string) => void;
}): React.JSX.Element {
  return (
    <View className="min-w-0 flex-1 gap-1.5">
      {label ? <Text className="text-kd-micro font-semibold text-kd-text-subtle">{label}</Text> : null}
      {multiline ? (
        <Textarea
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textSubtle}
          className="min-h-[82px] rounded-kd-md border border-kd-border bg-kd-input px-2 py-1.5 text-kd-caption text-kd-text"
          style={{ fontFamily: kubdeeFontFamilies.thai.regular, fontSize: 13, lineHeight: 18 }}
        />
      ) : (
        <Input
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textSubtle}
          textAlignVertical="center"
          className="min-h-9 rounded-kd-md border border-kd-border bg-kd-input px-2 py-1.5 text-kd-caption text-kd-text"
          style={{ fontFamily: kubdeeFontFamilies.thai.regular, fontSize: 13, lineHeight: 18 }}
        />
      )}
    </View>
  );
}

export function SettingsSection({
  children,
  color,
  icon: Icon,
  theme,
  title,
  onApplyAll,
}: {
  children: React.ReactNode;
  color: string;
  icon: typeof Bot;
  theme: KubdeeTheme;
  title: string;
  onApplyAll?: () => void;
}): React.JSX.Element {
  return (
    <View className="gap-2.5">
      <View className="flex-row items-center justify-between">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <Icon size={14} color={color} strokeWidth={2.1} />
          <Text className="text-kd-caption font-medium text-kd-text">{title}</Text>
        </View>
        {onApplyAll ? (
          <Pressable accessibilityRole="button" onPress={onApplyAll} className="px-1.5 py-1">
            <Text className="text-kd-micro font-semibold text-kd-text-subtle">นำไปใช้ทั้งหมด</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

// FieldHeader — หัวข้อย่อยแบบ extension (label uppercase + ปุ่ม "นำไปใช้ทั้งหมด")
export function FieldHeader({
  label,
  optional = false,
  onApplyAll,
}: {
  label: string;
  optional?: boolean;
  onApplyAll?: () => void;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-row items-center gap-1">
        <Text className="text-kd-micro font-semibold uppercase text-kd-text-subtle">{label}</Text>
        {optional ? <Text className="text-kd-micro text-kd-text-subtle">(ไม่บังคับ)</Text> : null}
      </View>
      {onApplyAll ? (
        <Pressable accessibilityRole="button" onPress={onApplyAll} className="px-1.5 py-0.5">
          <Text className="text-kd-micro font-semibold text-kd-text-subtle">นำไปใช้ทั้งหมด</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ExtensionSectionTitle — หัวข้อ section ใหญ่ (ไอคอน + ชื่อ) ใช้ใน block พื้นฐาน/ขั้นตอน
export function ExtensionSectionTitle({
  icon: Icon,
  theme,
  title,
}: {
  icon: typeof Bot;
  theme: KubdeeTheme;
  title: string;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-2">
      <Icon size={16} color={theme.textMuted} strokeWidth={2} />
      <Text className="text-kd-subtitle font-semibold text-kd-text">{title}</Text>
    </View>
  );
}

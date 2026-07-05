import { useContext } from 'react';
import { Pressable, View } from 'react-native';
import type { DimensionValue } from 'react-native';

import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';
import type { AutoPilotOption } from '@/autopilot/optionSets';

import { SettingsAccentContext } from '../constants';

/**
 * CardOptionGrid — กริดการ์ดเลือกตัวเลือกแบบ extension
 * selected = ขอบ accent + พื้น tint + ข้อความ accent ; NEW badge มุมขวาบน
 */
export function CardOptionGrid({
  options,
  value,
  onChange,
  theme,
  accent,
  columns = 4,
}: {
  options: AutoPilotOption[];
  value: string;
  onChange: (value: string) => void;
  theme: KubdeeTheme;
  accent?: string;
  columns?: number;
}): React.JSX.Element {
  const contextAccent = useContext(SettingsAccentContext);
  const accentColor = accent ?? contextAccent ?? theme.amber;
  const basis = `${100 / columns - 1.5}%` as DimensionValue;

  return (
    <View className="flex-row flex-wrap gap-1.5">
      {options.map((option) => {
        const active = String(value) === String(option.value);
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            className="min-h-[36px] items-center justify-center rounded-kd-lg border px-1.5 py-2"
            style={{
              flexBasis: basis,
              borderColor: active ? accentColor : theme.border,
              backgroundColor: active ? alpha(accentColor, theme.isDark ? 0.18 : 0.1) : theme.card,
            }}
          >
            {option.isNew ? (
              <View
                className="absolute -right-1 -top-1 rounded-kd-sm px-1"
                style={{ backgroundColor: theme.emerald }}
              >
                <Text className="text-[7px] font-bold leading-[11px] text-white">NEW</Text>
              </View>
            ) : null}
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              numberOfLines={1}
              className="text-kd-micro font-semibold"
              style={{ color: active ? accentColor : theme.textMuted }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * CategoryTabs — แท็บหมวดเล็ก (segmented) สำหรับ preset / viral
 */
export function CategoryTabs({
  tabs,
  value,
  onChange,
  theme,
  accent,
}: {
  tabs: Array<{ key: string; label: string }>;
  value: string;
  onChange: (key: string) => void;
  theme: KubdeeTheme;
  accent?: string;
}): React.JSX.Element {
  const contextAccent = useContext(SettingsAccentContext);
  const accentColor = accent ?? contextAccent ?? theme.amber;

  return (
    <View className="flex-row gap-0.5 rounded-kd-lg bg-kd-panel-muted p-0.5 dark:bg-kd-card-muted">
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(tab.key)}
            className="min-h-[26px] flex-1 items-center justify-center rounded-kd-md px-1"
            style={
              active
                ? {
                    backgroundColor: theme.isDark ? theme.input : theme.white,
                    shadowColor: theme.shadow,
                    shadowOpacity: 0.08,
                    shadowRadius: 3,
                    elevation: 1,
                  }
                : { backgroundColor: 'transparent' }
            }
          >
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              numberOfLines={1}
              className="text-kd-micro font-semibold"
              style={{ color: active ? accentColor : theme.textSubtle }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

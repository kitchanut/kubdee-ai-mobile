import { useContext } from 'react';
import { Pressable, View } from 'react-native';
import type { DimensionValue } from 'react-native';
import { Plus } from 'lucide-react-native';

import Text from '@/components/ui/KubdeeText';
import { Input } from '@/components/ui/input';
import { kubdeeFontFamilies } from '@/theme/fonts';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';
import type { AutoPilotOption } from '@/autopilot/optionSets';

import { SettingsAccentContext } from '../constants';

/**
 * UserPresetGridLite — เวอร์ชัน shell ของ UserPresetGrid (extension)
 * - แสดงปุ่ม built-in (เช่น "กำหนดเอง") + ปุ่ม "เพิ่ม" (shell, disabled)
 * - เมื่อเลือก __custom__ จะโชว์ช่องกรอกเอง (wired กับ *Custom field)
 * - ส่วน user-saved presets จะ wire ภายหลัง (AsyncStorage)
 */
export function UserPresetGridLite({
  builtInOptions = [{ value: '__custom__', label: 'กำหนดเอง' }],
  value,
  onChange,
  theme,
  accent,
  customValue = '',
  onCustomChange,
  customPlaceholder = 'พิมพ์ที่ต้องการ...',
  columns = 4,
}: {
  builtInOptions?: AutoPilotOption[];
  value: string;
  onChange: (value: string) => void;
  theme: KubdeeTheme;
  accent?: string;
  customValue?: string;
  onCustomChange?: (value: string) => void;
  customPlaceholder?: string;
  columns?: number;
}): React.JSX.Element {
  const contextAccent = useContext(SettingsAccentContext);
  const accentColor = accent ?? contextAccent ?? theme.amber;
  const basis = `${100 / columns - 1.5}%` as DimensionValue;
  const showCustom = String(value) === '__custom__' && !!onCustomChange;

  return (
    <View className="gap-1.5">
      <View className="flex-row flex-wrap gap-1.5">
        {builtInOptions.map((option) => {
          const active = String(value) === String(option.value);
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(option.value)}
              className="min-h-[34px] items-center justify-center rounded-kd-lg border px-1.5 py-1.5"
              style={{
                flexBasis: basis,
                borderColor: active ? accentColor : theme.border,
                backgroundColor: active ? alpha(accentColor, theme.isDark ? 0.18 : 0.1) : theme.card,
              }}
            >
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
        {/* ปุ่มเพิ่ม preset (shell — ยังไม่เปิดใช้) */}
        <View
          className="min-h-[34px] flex-row items-center justify-center gap-0.5 rounded-kd-lg border border-dashed px-1.5 py-1.5"
          style={{ flexBasis: basis, borderColor: theme.border, opacity: 0.5 }}
        >
          <Plus size={11} color={theme.textSubtle} strokeWidth={2.4} />
          <Text className="text-[9px] font-semibold text-kd-text-subtle">เพิ่ม</Text>
        </View>
      </View>

      {showCustom ? (
        <Input
          value={customValue}
          onChangeText={onCustomChange}
          placeholder={customPlaceholder}
          placeholderTextColor={theme.textSubtle}
          textAlignVertical="center"
          className="min-h-9 rounded-kd-md border bg-kd-input px-2 py-1.5 text-kd-caption text-kd-text"
          style={{ borderColor: alpha(accentColor, 0.5), fontFamily: kubdeeFontFamilies.thai.regular }}
        />
      ) : null}
    </View>
  );
}

import { Pressable, View } from 'react-native';

import Text from '@/components/ui/KubdeeText';
import { Textarea } from '@/components/ui/textarea';
import { kubdeeFontFamilies } from '@/theme/fonts';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';

/**
 * ManualPromptInput — ช่องกรอก prompt เอง พร้อมปุ่มแทรกตัวแปร
 * port จาก kubdee-ai-extension/src/components/ManualPromptInput.jsx
 * (ตัด PromptHistory ออก — รอ wire ภายหลัง)
 */
export function ManualPromptInput({
  value,
  onChangeText,
  placeholder,
  theme,
  accent,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  theme: KubdeeTheme;
  accent: string;
}): React.JSX.Element {
  const insert = (token: string): void => {
    const base = value || '';
    const next = base.length > 0 && !base.endsWith(' ') ? `${base} ${token}` : `${base}${token}`;
    onChangeText(next);
  };

  const chip = (label: string, token: string) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => insert(token)}
      className="rounded-full border px-2 py-0.5"
      style={{ borderColor: alpha(accent, 0.5), backgroundColor: alpha(accent, theme.isDark ? 0.18 : 0.1) }}
    >
      <Text className="text-[9px] font-semibold" style={{ color: accent }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text className="text-kd-micro font-semibold uppercase text-kd-text-subtle">Prompt ของคุณ</Text>
        <View className="flex-row gap-1">
          {chip('ชื่อสินค้า', '{{product_name}}')}
          {chip('รายละเอียด', '{{product_description}}')}
        </View>
      </View>
      <Textarea
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSubtle}
        className="min-h-[110px] rounded-kd-md border border-kd-border bg-kd-input px-2 py-1.5 text-kd-caption text-kd-text"
        style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
      />
    </View>
  );
}

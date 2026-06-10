import { Minus, Plus } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';

interface NumberStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  theme: KubdeeTheme;
  onChange: (value: number) => void;
}

export default function NumberStepper({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  theme,
  onChange,
}: NumberStepperProps): React.JSX.Element {
  const setValue = (nextValue: number): void => {
    onChange(Math.min(max, Math.max(min, nextValue)));
  };

  return (
    <View className="gap-[5px]">
      <Text className="text-kd-micro font-bold text-kd-text-subtle">{label}</Text>
      <View className="h-[34px] flex-row items-center justify-between overflow-hidden rounded-kd-md border border-kd-border bg-kd-input">
        <Pressable
          accessibilityRole="button"
          className="h-[28px] w-[30px] items-center justify-center active:opacity-65"
          onPress={() => setValue(value - step)}
        >
          <Minus size={12} color={theme.textSubtle} />
        </Pressable>
        <Text className="flex-1 text-center text-kd-body font-extrabold text-kd-text">
          {value}
          {suffix}
        </Text>
        <Pressable
          accessibilityRole="button"
          className="h-[28px] w-[30px] items-center justify-center active:opacity-65"
          onPress={() => setValue(value + step)}
        >
          <Plus size={12} color={theme.textSubtle} />
        </Pressable>
      </View>
    </View>
  );
}

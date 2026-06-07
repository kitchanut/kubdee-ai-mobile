import { Minus, Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { KubdeeTheme } from '@/theme/tokens';
import { radii, typography } from '@/theme/tokens';

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
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textSubtle }]}>{label}</Text>
      <View style={[styles.control, { backgroundColor: theme.input, borderColor: theme.border }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setValue(value - step)}
          style={({ pressed }) => [styles.button, { opacity: pressed ? 0.65 : 1 }]}
        >
          <Minus size={12} color={theme.textSubtle} />
        </Pressable>
        <Text style={[styles.value, { color: theme.text }]}>
          {value}
          {suffix}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setValue(value + step)}
          style={({ pressed }) => [styles.button, { opacity: pressed ? 0.65 : 1 }]}
        >
          <Plus size={12} color={theme.textSubtle} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 30,
  },
  container: {
    gap: 5,
  },
  control: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    height: 34,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  label: {
    fontSize: typography.micro,
    fontWeight: '700',
  },
  value: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: '800',
    textAlign: 'center',
  },
});

import { Bot, Clock3 } from 'lucide-react-native';
import { View } from 'react-native';

import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';

interface PlaceholderScreenProps {
  theme: KubdeeTheme;
  title: string;
  accent: 'blue' | 'cyan' | 'red';
  statusLabel?: string;
}

export default function PlaceholderScreen({
  theme,
  title,
  accent,
  statusLabel = 'รอ script module',
}: PlaceholderScreenProps): React.JSX.Element {
  const color = accent === 'blue' ? theme.blue : accent === 'cyan' ? theme.cyan : theme.red;

  return (
    <View className="flex-1 items-center justify-center gap-2.5 p-6">
      <View
        className={`h-14 w-14 items-center justify-center rounded-[28px] ${
          accent === 'red' ? 'bg-kd-red-soft' : 'bg-kd-cyan-soft'
        }`}
      >
        <Bot size={26} color={color} strokeWidth={2.2} />
      </View>
      <Text className="text-kd-title font-black text-kd-text">{title}</Text>
      <View className="flex-row items-center gap-1.5 rounded-kd-md border border-kd-border bg-kd-card px-2.5 py-[7px]">
        <Clock3 size={13} color={theme.textSubtle} />
        <Text className="text-kd-caption font-extrabold text-kd-text-subtle">{statusLabel}</Text>
      </View>
    </View>
  );
}

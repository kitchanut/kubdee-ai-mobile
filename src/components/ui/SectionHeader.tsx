import type { ComponentType } from 'react';
import { View } from 'react-native';

import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

interface SectionHeaderProps {
  title: string;
  theme: KubdeeTheme;
  icon?: ComponentType<IconProps>;
  right?: React.ReactNode;
}

export default function SectionHeader({
  title,
  theme,
  icon: Icon,
  right,
}: SectionHeaderProps): React.JSX.Element {
  return (
    <View className="min-h-[22px] flex-row items-center justify-between">
      <View className="flex-row items-center gap-1.5">
        {Icon ? <Icon size={12} color={theme.textSubtle} strokeWidth={2.2} /> : null}
        <Text className="text-kd-micro font-semibold text-kd-text-subtle">
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

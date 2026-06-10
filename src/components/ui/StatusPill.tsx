import type { ComponentType } from 'react';
import { View } from 'react-native';

import Text from '@/components/ui/KubdeeText';

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

interface StatusPillProps {
  label: string;
  color: string;
  backgroundColor: string;
  icon?: ComponentType<IconProps>;
}

export default function StatusPill({
  label,
  color,
  backgroundColor,
  icon: Icon,
}: StatusPillProps): React.JSX.Element {
  return (
    <View
      className="min-h-[16px] flex-row items-center gap-[3px] rounded-kd-sm px-[5px] py-0.5"
      style={{ backgroundColor }}
    >
      {Icon ? <Icon size={9} color={color} strokeWidth={2.3} /> : null}
      <Text className="text-kd-tiny font-bold tracking-[0px]" style={{ color }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

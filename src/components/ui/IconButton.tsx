import type { ComponentType } from 'react';
import { Pressable } from 'react-native';

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

interface IconButtonProps {
  icon: ComponentType<IconProps>;
  color: string;
  backgroundColor: string;
  onPress?: () => void;
  size?: number;
  iconSize?: number;
  disabled?: boolean;
}

export default function IconButton({
  icon: Icon,
  color,
  backgroundColor,
  onPress,
  size = 30,
  iconSize = 14,
  disabled = false,
}: IconButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      className="items-center justify-center rounded-kd-md active:opacity-70 disabled:opacity-45"
      disabled={disabled}
      onPress={onPress}
      style={{ width: size, height: size, backgroundColor }}
    >
      <Icon size={iconSize} color={color} strokeWidth={2} />
    </Pressable>
  );
}

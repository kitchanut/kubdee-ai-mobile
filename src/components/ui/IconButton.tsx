import type { ComponentType } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { radii } from '@/theme/tokens';

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
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          width: size,
          height: size,
          backgroundColor,
          opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
        },
      ]}
    >
      <Icon size={iconSize} color={color} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
});

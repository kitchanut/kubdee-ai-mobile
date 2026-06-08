import type { ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';

import Text from '@/components/ui/KubdeeText';
import { radii, typography } from '@/theme/tokens';

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
    <View style={[styles.pill, { backgroundColor }]}>
      {Icon ? <Icon size={9} color={color} strokeWidth={2.3} /> : null}
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: 3,
    minHeight: 16,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  label: {
    fontSize: typography.tiny,
    fontWeight: '700',
    letterSpacing: 0,
  },
});

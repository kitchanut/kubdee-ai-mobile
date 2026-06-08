import type { ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';

import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';
import { typography } from '@/theme/tokens';

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
    <View style={styles.row}>
      <View style={styles.titleRow}>
        {Icon ? <Icon size={12} color={theme.textSubtle} strokeWidth={2.2} /> : null}
        <Text style={[styles.title, { color: theme.textSubtle }]}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 22,
  },
  title: {
    fontSize: typography.micro,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
});

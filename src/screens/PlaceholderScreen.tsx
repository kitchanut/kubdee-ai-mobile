import { Bot, Clock3 } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';
import { radii, typography } from '@/theme/tokens';

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
  const background = accent === 'blue' ? theme.cyanSoft : accent === 'cyan' ? theme.cyanSoft : theme.redSoft;

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: background }]}>
        <Bot size={26} color={color} strokeWidth={2.2} />
      </View>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <View style={[styles.status, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Clock3 size={13} color={theme.textSubtle} />
        <Text style={[styles.statusText, { color: theme.textSubtle }]}>{statusLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flex: 1,
    gap: 10,
    justifyContent: 'center',
    padding: 24,
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  status: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusText: {
    fontSize: typography.caption,
    fontWeight: '800',
  },
  title: {
    fontSize: typography.title,
    fontWeight: '900',
  },
});

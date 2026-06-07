import { CircleAlert, CircleCheck, CircleX, Info } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import SectionHeader from '@/components/ui/SectionHeader';
import { logs } from '@/data/mockData';
import type { KubdeeTheme } from '@/theme/tokens';
import { radii, spacing, typography } from '@/theme/tokens';

interface LogsScreenProps {
  theme: KubdeeTheme;
}

export default function LogsScreen({ theme }: LogsScreenProps): React.JSX.Element {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <SectionHeader icon={Info} theme={theme} title="Activity" />
      {logs.map((log) => {
        const Icon =
          log.level === 'success'
            ? CircleCheck
            : log.level === 'warning'
              ? CircleAlert
              : log.level === 'error'
                ? CircleX
                : Info;
        const color =
          log.level === 'success'
            ? theme.emerald
            : log.level === 'warning'
              ? theme.amber
              : log.level === 'error'
                ? theme.red
                : theme.cyan;

        return (
          <View key={log.id} style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Icon size={15} color={color} />
            <Text style={[styles.time, { color: theme.textSubtle }]}>{log.timestamp}</Text>
            <Text style={[styles.message, { color: theme.text }]} numberOfLines={2}>
              {log.message}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  message: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: '700',
    lineHeight: 16,
  },
  row: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 10,
  },
  time: {
    fontSize: typography.micro,
    fontWeight: '800',
    width: 38,
  },
});

import { CheckCircle2, KeyRound, ShieldCheck, UserCircle } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import SectionHeader from '@/components/ui/SectionHeader';
import StatusPill from '@/components/ui/StatusPill';
import type { KubdeeTheme } from '@/theme/tokens';
import { radii, spacing, typography } from '@/theme/tokens';

interface ProfileScreenProps {
  theme: KubdeeTheme;
}

export default function ProfileScreen({ theme }: ProfileScreenProps): React.JSX.Element {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <SectionHeader icon={UserCircle} theme={theme} title="Profiles" />
      <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={[styles.avatar, { backgroundColor: theme.cyanSoft }]}>
          <UserCircle size={24} color={theme.cyan} />
        </View>
        <View style={styles.profileBody}>
          <Text style={[styles.profileName, { color: theme.text }]}>Shopee หลัก</Text>
          <Text style={[styles.profileMeta, { color: theme.textSubtle }]}>ผูกกับ Android เครื่องนี้</Text>
        </View>
        <StatusPill backgroundColor={theme.emeraldSoft} color={theme.emerald} icon={CheckCircle2} label="ACTIVE" />
      </View>

      <View style={[styles.row, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
        <KeyRound size={14} color={theme.blue} />
        <Text style={[styles.rowText, { color: theme.text }]}>Token sync: local dev</Text>
      </View>
      <View style={[styles.row, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
        <ShieldCheck size={14} color={theme.amber} />
        <Text style={[styles.rowText, { color: theme.text }]}>Sensitive actions require confirmation</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    borderRadius: radii.lg,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  content: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  profileBody: {
    flex: 1,
    minWidth: 0,
  },
  profileCard: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  profileMeta: {
    fontSize: typography.caption,
    marginTop: 2,
  },
  profileName: {
    fontSize: typography.label,
    fontWeight: '900',
  },
  row: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 10,
  },
  rowText: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: '700',
  },
});

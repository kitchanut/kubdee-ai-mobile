import { CheckCircle2, CreditCard, LogOut, RefreshCw, ShieldCheck, UserCircle } from 'lucide-react-native';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { formatExpiryLabel, formatPlanLabel } from '@/auth/plan';
import Text from '@/components/ui/KubdeeText';
import SectionHeader from '@/components/ui/SectionHeader';
import StatusPill from '@/components/ui/StatusPill';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha, radii, spacing, typography } from '@/theme/tokens';

interface ProfileScreenProps {
  theme: KubdeeTheme;
}

export default function ProfileScreen({ theme }: ProfileScreenProps): React.JSX.Element {
  const { isCheckingPlan, logout, recheckPlan, user } = useAuth();
  const displayName = user?.name || user?.email || 'Kubdee AI User';
  const planLabel = formatPlanLabel(user?.plan);
  const expiryLabel = formatExpiryLabel(user?.expiryDate);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <SectionHeader icon={UserCircle} theme={theme} title="Profiles" />
      <View style={[styles.profileCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {user?.image ? (
          <Image source={{ uri: user.image }} style={styles.avatarImage} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: theme.cyanSoft }]}>
            <UserCircle size={24} color={theme.cyan} />
          </View>
        )}
        <View style={styles.profileBody}>
          <Text style={[styles.profileName, { color: theme.text }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.profileMeta, { color: theme.textSubtle }]} numberOfLines={1}>
            {user?.email || 'Google account'}
          </Text>
        </View>
        <StatusPill backgroundColor={theme.emeraldSoft} color={theme.emerald} icon={CheckCircle2} label="ACTIVE" />
      </View>

      <View style={[styles.row, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
        <CreditCard size={14} color={theme.blue} />
        <Text style={[styles.rowText, { color: theme.text }]}>Plan: {planLabel}</Text>
        <Text style={[styles.rowMeta, { color: theme.textSubtle }]}>{expiryLabel}</Text>
      </View>
      <View style={[styles.row, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
        <ShieldCheck size={14} color={theme.amber} />
        <Text style={[styles.rowText, { color: theme.text }]}>Desktop plan verification</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={isCheckingPlan}
          onPress={recheckPlan}
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: theme.cardMuted,
              borderColor: theme.border,
              opacity: isCheckingPlan ? 0.55 : pressed ? 0.78 : 1,
            },
          ]}
        >
          <RefreshCw size={15} color={theme.blue} strokeWidth={2.2} />
          <Text style={[styles.actionText, { color: theme.text }]}>ตรวจสอบสิทธิ์</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={logout}
          style={({ pressed }) => [
            styles.actionButton,
            {
              backgroundColor: theme.redSoft,
              borderColor: alpha(theme.red, 0.3),
              opacity: pressed ? 0.78 : 1,
            },
          ]}
        >
          <LogOut size={15} color={theme.red} strokeWidth={2.2} />
          <Text style={[styles.actionText, { color: theme.red }]}>ออกจากระบบ</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  actionText: {
    fontSize: typography.body,
    fontWeight: '900',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  avatar: {
    alignItems: 'center',
    borderRadius: radii.lg,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  avatarImage: {
    borderRadius: radii.lg,
    height: 42,
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
  rowMeta: {
    fontSize: typography.caption,
    fontWeight: '800',
    maxWidth: 112,
    textAlign: 'right',
  },
});

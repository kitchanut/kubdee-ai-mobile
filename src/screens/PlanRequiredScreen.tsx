import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { LockKeyhole, LogOut, RefreshCw } from 'lucide-react-native';

import { BACKEND_URL } from '@/auth/constants';
import { toThaiPlanError } from '@/auth/plan';
import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha, radii, spacing, typography } from '@/theme/tokens';

interface PlanRequiredScreenProps {
  isCheckingPlan: boolean;
  planError: string | null;
  theme: KubdeeTheme;
  onLogout: () => Promise<void>;
  onRecheck: () => Promise<void>;
}

export default function PlanRequiredScreen({
  isCheckingPlan,
  planError,
  theme,
  onLogout,
  onRecheck,
}: PlanRequiredScreenProps): React.JSX.Element {
  return (
    <View style={[styles.container, { backgroundColor: theme.panel }]}>
      <View style={styles.center}>
        <View style={[styles.lockFrame, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <LockKeyhole size={30} color={theme.textSubtle} strokeWidth={2} />
        </View>

        <View style={styles.copy}>
          <Text style={[styles.title, { color: theme.text }]}>Ultra Plan Required</Text>
          <Text style={[styles.description, { color: theme.textSubtle }]}>{toThaiPlanError(planError)}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => Linking.openURL(BACKEND_URL)}
          style={({ pressed }) => [
            styles.primaryButton,
            {
              backgroundColor: theme.text,
              opacity: pressed ? 0.82 : 1,
            },
          ]}
        >
          <Text style={[styles.primaryText, { color: theme.panel }]}>อัปเกรดแพลน</Text>
        </Pressable>

        <View style={styles.secondaryRow}>
          <Pressable
            accessibilityRole="button"
            disabled={isCheckingPlan}
            onPress={onRecheck}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                backgroundColor: theme.cardMuted,
                borderColor: theme.border,
                opacity: isCheckingPlan ? 0.58 : pressed ? 0.78 : 1,
              },
            ]}
          >
            {isCheckingPlan ? (
              <ActivityIndicator color={theme.blue} size="small" />
            ) : (
              <RefreshCw size={15} color={theme.blue} strokeWidth={2.2} />
            )}
            <Text style={[styles.secondaryText, { color: theme.text }]}>ตรวจสอบ</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={onLogout}
            style={({ pressed }) => [
              styles.secondaryButton,
              {
                backgroundColor: theme.redSoft,
                borderColor: alpha(theme.red, 0.3),
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            <LogOut size={15} color={theme.red} strokeWidth={2.2} />
            <Text style={[styles.secondaryText, { color: theme.red }]}>ออกจากระบบ</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: spacing.md,
    paddingHorizontal: 22,
    paddingBottom: 22,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    gap: 18,
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  container: {
    flex: 1,
  },
  copy: {
    gap: 8,
    maxWidth: 300,
  },
  description: {
    fontSize: typography.body,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  lockFrame: {
    alignItems: 'center',
    borderRadius: radii.xl,
    borderWidth: 1,
    height: 76,
    justifyContent: 'center',
    width: 76,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: radii.lg,
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryText: {
    fontSize: typography.label,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  secondaryText: {
    fontSize: typography.body,
    fontWeight: '900',
  },
  title: {
    fontSize: typography.title,
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center',
  },
});

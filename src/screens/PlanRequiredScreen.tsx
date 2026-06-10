import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import { LockKeyhole, LogOut, RefreshCw } from 'lucide-react-native';

import { BACKEND_URL } from '@/auth/constants';
import { toThaiPlanError } from '@/auth/plan';
import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';

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
    <View className="flex-1 bg-kd-panel">
      <View className="flex-1 items-center justify-center gap-[18px] px-[26px]">
        <View className="h-[76px] w-[76px] items-center justify-center rounded-kd-xl border border-kd-border bg-kd-card">
          <LockKeyhole size={30} color={theme.textSubtle} strokeWidth={2} />
        </View>

        <View className="max-w-[300px] gap-2">
          <Text className="text-center text-kd-title font-black text-kd-text">Ultra Plan Required</Text>
          <Text className="text-center text-kd-body font-bold leading-[18px] text-kd-text-subtle">
            {toThaiPlanError(planError)}
          </Text>
        </View>
      </View>

      <View className="gap-2 px-[22px] pb-[22px]">
        <Pressable
          accessibilityRole="button"
          onPress={() => Linking.openURL(BACKEND_URL)}
          className="h-12 items-center justify-center rounded-kd-lg bg-kd-text px-4 active:opacity-80"
        >
          <Text className="text-kd-label font-black text-kd-panel">อัปเกรดแพลน</Text>
        </Pressable>

        <View className="flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            disabled={isCheckingPlan}
            onPress={onRecheck}
            className="h-[42px] flex-1 flex-row items-center justify-center gap-2 rounded-kd-lg border border-kd-border bg-kd-card-muted px-2.5 active:opacity-80 disabled:opacity-60"
          >
            {isCheckingPlan ? (
              <ActivityIndicator color={theme.blue} size="small" />
            ) : (
              <RefreshCw size={15} color={theme.blue} strokeWidth={2.2} />
            )}
            <Text className="text-kd-body font-black text-kd-text">ตรวจสอบ</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={onLogout}
            className="h-[42px] flex-1 flex-row items-center justify-center gap-2 rounded-kd-lg border border-kd-red/30 bg-kd-red-soft px-2.5 active:opacity-80"
          >
            <LogOut size={15} color={theme.red} strokeWidth={2.2} />
            <Text className="text-kd-body font-black text-kd-red">ออกจากระบบ</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

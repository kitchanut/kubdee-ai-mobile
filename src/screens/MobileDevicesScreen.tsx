import {
  CheckCircle2,
  MonitorSmartphone,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
} from 'lucide-react-native';
import type { ComponentType } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, ScrollView, View } from 'react-native';

import {
  clearAutomationActivityRun,
  pushAutomationActivityLog,
  setAutomationActivityRunning,
  setAutomationActivityStopping,
  useAutomationActivitySnapshot,
} from '@/activity/automationActivityLogStore';
import ActivityLogCard from '@/components/ui/ActivityLogCard';
import GoogleFlowConnectionCard from '@/components/GoogleFlowConnectionCard';
import Text from '@/components/ui/KubdeeText';
import StatusPill from '@/components/ui/StatusPill';
import {
  getAccessibilityStatus,
  openAccessibilitySettings,
  stopShopeeAutomation,
} from '@/native/AccessibilityBridge';
import type { AccessibilityStatus } from '@/native/AccessibilityBridge';
import type { KubdeeTheme } from '@/theme/tokens';

interface MobileDevicesScreenProps {
  theme: KubdeeTheme;
}

type HeaderIconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export default function MobileDevicesScreen({ theme }: MobileDevicesScreenProps): React.JSX.Element {
  const [accessibilityStatus, setAccessibilityStatus] = useState<AccessibilityStatus | null>(null);
  const [bridgeMessage, setBridgeMessage] = useState('ยังไม่ได้เช็คสถานะมือถือ');
  const [isStoppingImport, setIsStoppingImport] = useState(false);
  const [isStoppingPost, setIsStoppingPost] = useState(false);
  const activitySnapshot = useAutomationActivitySnapshot();
  const importRun = activitySnapshot.runs['shopee-import'];
  const postRun = activitySnapshot.runs['shopee-post'];
  const accessibilityEnabled = accessibilityStatus?.enabled ?? false;
  const accessibilityRunning = accessibilityStatus?.running ?? false;
  const hasActivityLogs =
    importRun.logs.length > 0 || postRun.logs.length > 0 || importRun.running || postRun.running;

  const importStats = useMemo(() => buildRunStats(importRun, theme), [importRun, theme]);
  const postStats = useMemo(() => buildRunStats(postRun, theme), [postRun, theme]);

  const refreshStatus = useCallback(async (): Promise<void> => {
    try {
      const status = await getAccessibilityStatus();
      setAccessibilityStatus(status);
      setBridgeMessage(
        status.enabled
          ? status.running
            ? 'Accessibility service เปิดและพร้อมรับคำสั่ง'
            : 'เปิดสิทธิ์แล้ว รอ Android bind service'
          : 'ยังไม่ได้เปิด Accessibility service'
      );
    } catch (error) {
      setBridgeMessage(`เช็คสถานะไม่สำเร็จ: ${String(error)}`);
      setAccessibilityStatus(null);
    }
  }, []);

  const openAccessibilitySetup = useCallback(async (): Promise<void> => {
    try {
      await openAccessibilitySettings();
      setBridgeMessage('เปิดหน้า Accessibility settings แล้ว');
    } catch (error) {
      setBridgeMessage(`เปิดหน้า settings ไม่สำเร็จ: ${String(error)}`);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refreshStatus();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [refreshStatus]);

  const stopRun = useCallback(
    async (kind: 'shopee-import' | 'shopee-post'): Promise<void> => {
      const setLocalStopping = kind === 'shopee-import' ? setIsStoppingImport : setIsStoppingPost;
      const label = kind === 'shopee-import' ? 'Shopee import' : 'Shopee post';
      setLocalStopping(true);
      setAutomationActivityStopping(kind, true);
      pushAutomationActivityLog(kind, `กำลังส่งคำสั่งหยุด ${label}...`);

      const stopped = await stopShopeeAutomation();
      if (!stopped) {
        pushAutomationActivityLog(kind, 'ยังหยุดไม่ได้ เพราะไม่พบ Accessibility Service ที่กำลังทำงาน');
        setAutomationActivityStopping(kind, false);
        setLocalStopping(false);
        return;
      }

      pushAutomationActivityLog(kind, `ส่งคำสั่งหยุด ${label} แล้ว`);
      setAutomationActivityRunning(kind, false);
      setLocalStopping(false);
    },
    []
  );

  const importStopping = isStoppingImport || importRun.stopping;
  const postStopping = isStoppingPost || postRun.stopping;

  return (
    <View className="flex-1">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-3 px-3 pb-20 pt-3">
        <MobileSectionHeader icon={MonitorSmartphone} theme={theme} title="ความพร้อมใช้งาน" />

        {!accessibilityEnabled ? (
          <View className="flex-row items-center gap-2 rounded-kd-xl border border-kd-amber bg-kd-amber-soft p-2">
            <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
              <ShieldCheck size={12} color={theme.amber} strokeWidth={2.2} />
              <Text className="flex-1 text-kd-caption font-extrabold text-kd-amber">
                ต้องเปิด Accessibility ก่อนเริ่ม automate
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={openAccessibilitySetup} className="active:opacity-75">
              <View className="rounded-kd-md border border-kd-amber bg-kd-card px-[9px] py-1.5">
                <Text className="text-kd-micro font-extrabold text-kd-amber">เปิดตั้งค่า</Text>
              </View>
            </Pressable>
          </View>
        ) : null}

        <View className="gap-2 rounded-kd-xl border border-kd-border bg-kd-panel p-2">
          <View className="flex-row items-center gap-2">
            <View
              className="h-[38px] w-[38px] items-center justify-center rounded-kd-xl"
              style={{ backgroundColor: theme.cyanSoft }}
            >
              <Smartphone size={18} color={theme.blue} strokeWidth={2.3} />
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-kd-body font-semibold text-kd-text">มือถือเครื่องนี้</Text>
              <Text className="mt-px text-kd-micro font-medium leading-[15px] text-kd-text-subtle" numberOfLines={2}>
                {bridgeMessage}
              </Text>
            </View>
            <StatusPill
              backgroundColor={accessibilityRunning ? theme.emeraldSoft : theme.amberSoft}
              color={accessibilityRunning ? theme.emerald : theme.amber}
              icon={accessibilityRunning ? CheckCircle2 : ShieldCheck}
              label={accessibilityRunning ? 'RUNNING' : accessibilityEnabled ? 'WAITING' : 'OFF'}
            />
          </View>
          <View className="flex-row gap-2">
            <Pressable
              accessibilityRole="button"
              onPress={refreshStatus}
              className="h-[34px] flex-1 flex-row items-center justify-center gap-1.5 rounded-kd-lg active:opacity-70"
              style={{ backgroundColor: theme.cardMuted }}
            >
              <RefreshCw size={14} color={theme.textSubtle} strokeWidth={2.1} />
              <Text className="text-kd-caption font-semibold text-kd-text-muted" numberOfLines={1}>
                รีเฟรช
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={openAccessibilitySetup}
              className="h-[34px] flex-1 flex-row items-center justify-center gap-1.5 rounded-kd-lg active:opacity-70"
              style={{ backgroundColor: theme.blue }}
            >
              <Settings size={14} color={theme.white} strokeWidth={2.2} />
              <Text className="text-kd-caption font-semibold text-white" numberOfLines={1}>
                Accessibility
              </Text>
            </Pressable>
          </View>
        </View>

        <GoogleFlowConnectionCard theme={theme} />

        <View className="gap-2">
          <MobileSectionHeader
            icon={MonitorSmartphone}
            theme={theme}
            title="Activity ล่าสุด"
            right={
              <Text className="shrink-0 text-kd-micro font-medium text-kd-text-subtle">
                {importRun.logs.length + postRun.logs.length} log
              </Text>
            }
          />
          {hasActivityLogs ? null : (
            <View className="items-center gap-1.5 rounded-kd-xl border border-dashed border-kd-border bg-kd-card-muted px-4 py-5 dark:bg-kd-panel-muted">
              <MonitorSmartphone size={22} color={theme.textSubtle} strokeWidth={1.9} />
              <Text className="text-center text-kd-body font-semibold text-kd-text">ยังไม่มีรอบการทำงานล่าสุด</Text>
              <Text className="text-center text-kd-micro font-medium leading-[15px] text-kd-text-subtle">
                เมื่อดึงสินค้า หรือโพสต์ Shopee แล้ว log ล่าสุดของแต่ละรอบจะมาแสดงตรงนี้
              </Text>
            </View>
          )}

          {importRun.logs.length > 0 || importRun.running ? (
            <ActivityLogCard
              icon={ShoppingBag}
              theme={theme}
              title={importRun.title}
              logs={importRun.logs}
              running={importRun.running}
              stopping={importStopping}
              startedAt={importRun.startedAt}
              updatedAt={importRun.updatedAt}
              runningText="กำลังดึงสินค้า Shopee"
              idleText="รอบล่าสุดเสร็จแล้ว"
              emptyText="ยังไม่มี log ของ Shopee import"
              maxVisible={12}
              stats={importStats}
              onStop={() => {
                void stopRun('shopee-import');
              }}
              onClear={() => clearAutomationActivityRun('shopee-import')}
            />
          ) : null}

          {postRun.logs.length > 0 || postRun.running ? (
            <ActivityLogCard
              icon={Send}
              theme={theme}
              title={postRun.title}
              logs={postRun.logs}
              running={postRun.running}
              stopping={postStopping}
              startedAt={postRun.startedAt}
              updatedAt={postRun.updatedAt}
              runningText="กำลังโพสต์ Shopee"
              idleText="รอบล่าสุดเสร็จแล้ว"
              emptyText="ยังไม่มี log ของ Shopee post"
              maxVisible={12}
              stats={postStats}
              onStop={() => {
                void stopRun('shopee-post');
              }}
              onClear={() => clearAutomationActivityRun('shopee-post')}
            />
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function MobileSectionHeader({
  icon: Icon,
  right,
  theme,
  title,
}: {
  icon: ComponentType<HeaderIconProps>;
  right?: React.ReactNode;
  theme: KubdeeTheme;
  title: string;
}): React.JSX.Element {
  return (
    <View className="mt-1 flex-row items-center justify-between gap-2">
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        <Icon size={14} color={theme.text} strokeWidth={2.4} />
        <Text numberOfLines={1} className="shrink text-kd-caption font-semibold text-kd-text-muted">
          {title}
        </Text>
      </View>
      {right ? <View className="shrink-0">{right}</View> : null}
    </View>
  );
}

function buildRunStats(
  run: {
    logs: Array<{ ts: number }>;
    running: boolean;
    startedAt: number | null;
    updatedAt: number | null;
  },
  theme: KubdeeTheme
): Array<{ label: string; value: string; color: string; backgroundColor: string }> {
  return [
    {
      label: 'สถานะ',
      value: run.running ? 'กำลังรัน' : run.logs.length > 0 ? 'เสร็จแล้ว' : 'ว่าง',
      color: run.running ? theme.emerald : theme.textSubtle,
      backgroundColor: run.running ? theme.emeraldSoft : theme.cardMuted,
    },
    {
      label: 'Log',
      value: `${run.logs.length}`,
      color: theme.cyan,
      backgroundColor: theme.cyanSoft,
    },
    {
      label: 'เริ่ม',
      value: run.startedAt ? formatShortTime(run.startedAt) : '-',
      color: theme.textSubtle,
      backgroundColor: theme.cardMuted,
    },
    {
      label: 'ล่าสุด',
      value: run.updatedAt ? formatShortTime(run.updatedAt) : '-',
      color: theme.textSubtle,
      backgroundColor: theme.cardMuted,
    },
  ];
}

function formatShortTime(timestamp: number): string {
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

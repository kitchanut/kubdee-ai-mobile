import {
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock3,
  Info,
  Play,
  Send,
  ShoppingBag,
} from 'lucide-react-native';
import { ScrollView, View } from 'react-native';

import {
  type AutomationActivityKind,
  type AutomationActivityRun,
  useAutomationActivitySnapshot,
} from '@/activity/automationActivityLogStore';
import Text from '@/components/ui/KubdeeText';
import SectionHeader from '@/components/ui/SectionHeader';
import type { KubdeeTheme } from '@/theme/tokens';

interface LogsScreenProps {
  theme: KubdeeTheme;
}

const ACTIVITY_ORDER: AutomationActivityKind[] = ['auto-pilot', 'shopee-import', 'shopee-post'];

export default function LogsScreen({ theme }: LogsScreenProps): React.JSX.Element {
  const snapshot = useAutomationActivitySnapshot();

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-2 p-2">
      <SectionHeader icon={Info} theme={theme} title="Activity" />
      {ACTIVITY_ORDER.map((kind) => (
        <ActivityRunCard key={kind} run={snapshot.runs[kind]} theme={theme} />
      ))}
    </ScrollView>
  );
}

function ActivityRunCard({
  run,
  theme,
}: {
  run: AutomationActivityRun;
  theme: KubdeeTheme;
}): React.JSX.Element {
  const Icon =
    run.kind === 'auto-pilot'
      ? Play
      : run.kind === 'shopee-post'
        ? Send
        : ShoppingBag;
  const latestLog = run.logs[run.logs.length - 1] ?? null;
  const logs = run.logs.slice(-8);
  const statusColor = run.stopping
    ? theme.amber
    : run.running
      ? theme.blue
      : run.logs.length > 0
        ? theme.emerald
        : theme.textSubtle;

  return (
    <View className="gap-2 rounded-kd-lg border border-kd-border bg-kd-card p-3">
      <View className="flex-row items-center gap-2">
        <View className="h-8 w-8 items-center justify-center rounded-kd-lg bg-kd-panel-muted dark:bg-kd-card-muted">
          <Icon size={15} color={statusColor} strokeWidth={2.2} />
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-kd-body font-black text-kd-text">
            {run.title}
          </Text>
          <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
            {getRunStatusText(run)}
            {run.startedAt ? ` · เริ่ม ${formatLogTime(run.startedAt)}` : ''}
            {run.updatedAt ? ` · ล่าสุด ${formatLogTime(run.updatedAt)}` : ''}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Clock3 size={12} color={theme.textSubtle} strokeWidth={2} />
          <Text className="text-kd-micro font-bold text-kd-text-subtle">{run.logs.length}</Text>
        </View>
      </View>

      {logs.length === 0 ? (
        <View className="rounded-kd-md bg-kd-panel-muted px-2.5 py-2 dark:bg-kd-card-muted">
          <Text className="text-kd-caption text-kd-text-subtle">ยังไม่มี Activity ล่าสุด</Text>
        </View>
      ) : (
        <View className="gap-1.5">
          {logs.map((log, index) => {
            const IconForLine = getLogIcon(log.message);
            const color = getLogColor(log.message, theme);
            return (
              <View key={`${log.ts}-${index}`} className="flex-row items-start gap-2">
                <IconForLine size={13} color={color} strokeWidth={2.2} />
                <Text className="w-[58px] text-kd-micro font-bold text-kd-text-subtle">
                  {formatLogTime(log.ts)}
                </Text>
                <Text className="min-w-0 flex-1 text-kd-caption leading-4 text-kd-text" numberOfLines={2}>
                  {log.message}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function getRunStatusText(run: AutomationActivityRun): string {
  if (run.stopping) return 'กำลังหยุด';
  if (run.running) return 'กำลังทำงาน';
  if (run.logs.length > 0) return 'เสร็จสิ้นล่าสุด';
  return 'ว่าง';
}

function getLogIcon(message: string): typeof Info {
  if (/ไม่สำเร็จ|ผิดพลาด|error|failed|ล้มเหลว/i.test(message)) return CircleX;
  if (/เตือน|warning|กำลังหยุด|ยังไม่/i.test(message)) return CircleAlert;
  if (/สำเร็จ|เสร็จ|พร้อมใช้|รับงานแล้ว/i.test(message)) return CircleCheck;
  return Info;
}

function getLogColor(message: string, theme: KubdeeTheme): string {
  if (/ไม่สำเร็จ|ผิดพลาด|error|failed|ล้มเหลว/i.test(message)) return theme.red;
  if (/เตือน|warning|กำลังหยุด|ยังไม่/i.test(message)) return theme.amber;
  if (/สำเร็จ|เสร็จ|พร้อมใช้|รับงานแล้ว/i.test(message)) return theme.emerald;
  return theme.cyan;
}

function formatLogTime(timestamp: number): string {
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

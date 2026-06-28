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
import { alpha, type KubdeeTheme } from '@/theme/tokens';

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
  const firstLog = run.logs[0] ?? null;
  const latestLog = run.logs[run.logs.length - 1] ?? null;
  const logs = run.logs.slice(-8);
  const elapsedMs = getRunElapsedMs(run);
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
            {elapsedMs != null ? ` · ใช้เวลา ${formatDuration(elapsedMs)}` : ''}
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
            const previousLog = index > 0 ? logs[index - 1] : null;
            const deltaMs = previousLog ? Math.max(0, log.ts - previousLog.ts) : 0;
            const sinceStartMs = firstLog ? Math.max(0, log.ts - firstLog.ts) : 0;
            const parsed =
              run.kind === 'auto-pilot'
                ? parseStagePrefix(log.message)
                : { stage: null, message: log.message };
            const IconForLine = getLogIcon(log.message);
            const color = getLogColor(log.message, theme);
            return (
              <View key={`${log.ts}-${index}`} className="flex-row items-start gap-2">
                <IconForLine size={13} color={color} strokeWidth={2.2} />
                <View className="w-[66px]">
                  <Text className="text-kd-micro font-bold text-kd-text-subtle">
                    {formatLogTime(log.ts)}
                  </Text>
                  <Text className="text-kd-tiny text-kd-text-subtle">
                    {index === 0 ? '+0s' : `+${formatDuration(deltaMs)}`} · {formatDuration(sinceStartMs)}
                  </Text>
                </View>
                <View className="min-w-0 flex-1">
                  {parsed.stage ? <StageChip label={parsed.stage} theme={theme} /> : null}
                  <Text className="text-kd-caption leading-4 text-kd-text" numberOfLines={2}>
                    {parsed.message}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function StageChip({ label, theme }: { label: string; theme: KubdeeTheme }): React.JSX.Element {
  return (
    <View
      className="mb-0.5 self-start rounded-kd-sm border px-1.5 py-0.5"
      style={{
        backgroundColor: alpha(theme.blue, theme.isDark ? 0.18 : 0.08),
        borderColor: alpha(theme.blue, theme.isDark ? 0.32 : 0.18),
      }}
    >
      <Text className="text-kd-tiny font-semibold" numberOfLines={1} style={{ color: theme.blue }}>
        {label}
      </Text>
    </View>
  );
}

function getRunStatusText(run: AutomationActivityRun): string {
  if (run.stopping) return 'กำลังหยุด';
  if (run.running) return 'กำลังทำงาน';
  if (run.logs.length > 0) return 'เสร็จสิ้นล่าสุด';
  return 'ว่าง';
}

function parseStagePrefix(message: string): { stage: string | null; message: string } {
  const match = message.match(/^\[([^\]]+)]\s*(.*)$/);
  if (!match) {
    return { stage: null, message };
  }
  return {
    stage: match[1]?.trim() || null,
    message: match[2]?.trim() || message,
  };
}

function getRunElapsedMs(run: AutomationActivityRun): number | null {
  const startedAt = run.startedAt ?? run.logs[0]?.ts ?? null;
  if (!startedAt) {
    return null;
  }
  const latestAt = run.running ? Date.now() : run.updatedAt ?? run.logs[run.logs.length - 1]?.ts ?? startedAt;
  return Math.max(0, latestAt - startedAt);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
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

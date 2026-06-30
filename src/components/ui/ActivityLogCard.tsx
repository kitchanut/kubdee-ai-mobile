import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { Clock3, Info, Square, Trash2, X } from 'lucide-react-native';

import { getAutoPilotStageLabel } from '@/autopilot/stageLabels';
import type { AutoPilotFlowStats, AutoPilotStepType } from '@/autopilot/types';
import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export interface ActivityLogEntry {
  message: string;
  ts: number;
  flowStats?: AutoPilotFlowStats;
  step?: AutoPilotStepType;
  stage?: string;
}

export interface ActivityLogStat {
  label: string;
  value: string;
  color?: string;
  backgroundColor?: string;
}

interface ActivityLogCardProps<TLog extends ActivityLogEntry = ActivityLogEntry> {
  theme: KubdeeTheme;
  logs: TLog[];
  icon?: ComponentType<IconProps>;
  title?: string;
  running?: boolean;
  stopping?: boolean;
  runningText?: string;
  idleText?: string;
  emptyText?: string;
  maxVisible?: number;
  initiallyExpanded?: boolean;
  stopLabel?: string;
  stoppingLabel?: string;
  clearLabel?: string;
  startedAt?: number | null;
  updatedAt?: number | null;
  stats?: ActivityLogStat[];
  onStop?: () => void;
  onClear?: () => void;
  formatTimestamp?: (timestamp: number) => string;
}

export default function ActivityLogCard<TLog extends ActivityLogEntry = ActivityLogEntry>({
  theme,
  logs,
  icon,
  title = 'Activity Log',
  running = false,
  stopping = false,
  runningText = 'กำลังทำงาน',
  idleText = 'ยังไม่มีรายการทำงาน',
  emptyText = 'ยังไม่มีรายการทำงาน',
  maxVisible = 80,
  initiallyExpanded = false,
  stopLabel = 'หยุด',
  stoppingLabel = 'กำลังหยุด',
  clearLabel = 'ล้างประวัติ',
  startedAt = null,
  updatedAt = null,
  stats = [],
  onStop,
  onClear,
  formatTimestamp = formatLogTime,
}: ActivityLogCardProps<TLog>): React.JSX.Element {
  const [drawerOpen, setDrawerOpen] = useState(initiallyExpanded);
  const now = useRunningNow(running);
  const visibleLogs = useMemo(() => logs.slice(-maxVisible), [logs, maxVisible]);
  const latestLog = logs[logs.length - 1] ?? null;
  const runStartedAt = startedAt ?? logs[0]?.ts ?? null;
  const runUpdatedAt = updatedAt ?? latestLog?.ts ?? null;
  const elapsedTarget = running ? now : runUpdatedAt;
  const elapsedText =
    runStartedAt != null && elapsedTarget != null
      ? `ใช้เวลา ${formatLogDuration(elapsedTarget - runStartedAt)}`
      : '';
  const latestTimeText = latestLog ? `ล่าสุด ${formatTimestamp(latestLog.ts)}` : '';
  const statusText = running
    ? [runningText, elapsedText, latestTimeText].filter(Boolean).join(' · ')
    : latestLog
      ? [latestTimeText, elapsedText, `${logs.length} รายการ`].filter(Boolean).join(' · ')
      : idleText;
  const visibleStartIndex = Math.max(0, logs.length - visibleLogs.length);
  const Icon = icon ?? Info;
  const statusColor = getRunStatusColor({ running, stopping, latestLog }, theme);
  const latestDisplay = latestLog ? parseDisplayMessage(latestLog.message) : null;

  return (
    <>
      <View className="gap-2.5 rounded-kd-xl border border-kd-border bg-kd-panel p-2">
        <View className="flex-row items-start justify-between gap-2">
          <View className="min-w-0 flex-1 flex-row items-center gap-2">
            <View className="h-8 w-8 shrink-0 items-center justify-center rounded-kd-lg bg-kd-card-muted dark:bg-kd-panel-muted">
              <Icon size={15} color={theme.textMuted} strokeWidth={2.1} />
            </View>
            <View className="min-w-0 flex-1">
              <View className="flex-row items-center gap-1.5">
                <View className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColor }} />
                <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
                  {title}
                </Text>
              </View>
              <Text numberOfLines={1} className="mt-px text-kd-micro font-medium text-kd-text-subtle">
                {statusText}
              </Text>
            </View>
          </View>

          <View className="shrink-0 flex-row items-center gap-1">
            {running && onStop ? (
              <Pressable
                accessibilityRole="button"
                disabled={stopping}
                onPress={onStop}
                className="h-8 w-8 items-center justify-center rounded-kd-md active:opacity-70 disabled:opacity-70"
                style={{ backgroundColor: alpha(theme.red, theme.isDark ? 0.18 : 0.1) }}
              >
                {stopping ? (
                  <ActivityIndicator color={theme.red} size="small" />
                ) : (
                  <Square size={13} color={theme.red} fill={theme.red} strokeWidth={2} />
                )}
              </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel="เปิดรายละเอียดการทำงาน"
              accessibilityRole="button"
              onPress={() => setDrawerOpen(true)}
              className="h-8 flex-row items-center justify-center gap-1.5 rounded-kd-md bg-kd-card-muted px-2.5 active:opacity-70 dark:bg-kd-panel-muted"
            >
              <Info size={13} color={theme.textMuted} strokeWidth={2.2} />
              <Text className="text-kd-micro font-semibold text-kd-text-subtle">รายละเอียด</Text>
            </Pressable>
          </View>
        </View>

        {latestLog && latestDisplay ? (
          <Pressable
            accessibilityLabel="เปิดรายละเอียดการทำงาน"
            accessibilityRole="button"
            onPress={() => setDrawerOpen(true)}
            className="rounded-kd-md bg-kd-card-muted px-2.5 py-2 active:opacity-75 dark:bg-kd-panel-muted"
          >
            <View className="flex-row flex-wrap items-center gap-1">
              <Text className="text-kd-micro font-semibold text-kd-text-subtle">
                ล่าสุด {formatTimestamp(latestLog.ts)}
              </Text>
              <LogStageMeta log={latestLog} parsedLabel={latestDisplay.stageLabel} theme={theme} compact />
            </View>
            <Text
              numberOfLines={2}
              className="mt-0.5 text-kd-caption leading-4"
              style={{ color: getLogTextColor(latestLog.message, theme) }}
            >
              {latestDisplay.message}
            </Text>
          </Pressable>
        ) : (
          <View className="rounded-kd-md bg-kd-card-muted px-2.5 py-2 dark:bg-kd-panel-muted">
            <Text className="text-kd-caption leading-4 text-kd-text-subtle">{emptyText}</Text>
          </View>
        )}

        {stats.length > 0 ? <ActivityLogStats stats={stats} theme={theme} /> : null}
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => setDrawerOpen(false)}
        statusBarTranslucent
        transparent
        visible={drawerOpen}
      >
        <View className="flex-1 justify-end bg-black/60">
          <Pressable
            accessibilityLabel="ปิดรายละเอียดการทำงาน"
            accessibilityRole="button"
            className="absolute inset-0"
            onPress={() => setDrawerOpen(false)}
          />

          <View
            accessibilityViewIsModal
            className="overflow-hidden rounded-t-[18px] border border-kd-border bg-kd-panel"
            style={{ maxHeight: '72%' }}
          >
            <View className="border-b border-kd-border bg-kd-card px-3 pt-3">
              <View className="flex-row items-center justify-between gap-2 pb-2">
                <View className="min-w-0 flex-1 flex-row items-center gap-2">
                  <View className="h-8 w-8 items-center justify-center rounded-kd-lg bg-kd-panel-muted dark:bg-kd-card-muted">
                    <Clock3 size={15} color={theme.textMuted} strokeWidth={2.1} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[14px] font-semibold text-kd-text">รายละเอียดการทำงาน</Text>
                    <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
                      {title}
                      {runStartedAt ? ` · เริ่ม ${formatTimestamp(runStartedAt)}` : ''}
                      {latestLog ? ` · ล่าสุด ${formatTimestamp(latestLog.ts)}` : ''}
                      {elapsedText ? ` · ${elapsedText}` : ''}
                      {` · log ${logs.length} รายการ`}
                    </Text>
                  </View>
                </View>
                <View className="flex-row items-center gap-1">
                  {running && onStop ? (
                    <Pressable
                      accessibilityLabel={stopLabel}
                      accessibilityRole="button"
                      disabled={stopping}
                      onPress={onStop}
                      className="h-8 w-8 items-center justify-center rounded-kd-md active:opacity-70 disabled:opacity-70"
                      style={{ backgroundColor: alpha(theme.red, theme.isDark ? 0.18 : 0.1) }}
                    >
                      {stopping ? (
                        <ActivityIndicator color={theme.red} size="small" />
                      ) : (
                        <Square size={13} color={theme.red} fill={theme.red} strokeWidth={2} />
                      )}
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityLabel={clearLabel}
                    accessibilityRole="button"
                    disabled={logs.length === 0 || running || !onClear}
                    onPress={onClear}
                    className="h-8 w-8 items-center justify-center rounded-kd-md bg-kd-panel-muted active:opacity-70 disabled:opacity-50 dark:bg-kd-card-muted"
                  >
                    <Trash2 size={14} color={theme.textSubtle} strokeWidth={2} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="ปิดรายละเอียดการทำงาน"
                    accessibilityRole="button"
                    onPress={() => setDrawerOpen(false)}
                    className="h-8 w-8 items-center justify-center rounded-kd-md bg-kd-panel-muted active:opacity-70 dark:bg-kd-card-muted"
                  >
                    <X size={15} color={theme.textMuted} strokeWidth={2.3} />
                  </Pressable>
                </View>
              </View>
            </View>

            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              contentContainerClassName="gap-1.5 px-3 py-3"
              contentContainerStyle={{ paddingBottom: 24 }}
            >
              {visibleLogs.length === 0 ? (
                <View className="min-h-[120px] items-center justify-center gap-1.5">
                  <Clock3 size={24} color={theme.textSubtle} strokeWidth={1.8} />
                  <Text className="text-kd-caption font-semibold text-kd-text-subtle">{emptyText}</Text>
                </View>
              ) : (
                visibleLogs.map((entry, index) => {
                  const absoluteIndex = visibleStartIndex + index;
                  const previousEntry = absoluteIndex > 0 ? logs[absoluteIndex - 1] : null;
                  const deltaMs = previousEntry ? Math.max(0, entry.ts - previousEntry.ts) : 0;
                  const sinceStartMs = runStartedAt != null ? Math.max(0, entry.ts - runStartedAt) : deltaMs;
                  const display = parseDisplayMessage(entry.message);

                  return (
                    <View key={`${entry.ts}-${index}`} className="flex-row gap-2 rounded-kd-md bg-kd-card px-2.5 py-2">
                      <View className="w-[68px]">
                        <Text className="text-kd-micro font-medium text-kd-text-subtle">
                          {formatTimestamp(entry.ts)}
                        </Text>
                        <Text className="mt-0.5 text-kd-tiny text-kd-text-subtle">
                          +{formatLogDuration(deltaMs)} · {formatLogDuration(sinceStartMs)}
                        </Text>
                      </View>
                      <View className="min-w-0 flex-1">
                        <LogStageMeta log={entry} parsedLabel={display.stageLabel} theme={theme} />
                        <Text
                          className="text-kd-caption leading-4"
                          style={{ color: getLogTextColor(entry.message, theme) }}
                        >
                          {display.message}
                        </Text>
                        {entry.flowStats ? <LogFlowStats stats={entry.flowStats} theme={theme} /> : null}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function ActivityLogStats({
  stats,
  theme,
}: {
  stats: ActivityLogStat[];
  theme: KubdeeTheme;
}): React.JSX.Element {
  return (
    <View className="flex-row gap-1">
      {stats.slice(0, 4).map((stat) => (
        <View
          key={`${stat.label}-${stat.value}`}
          className="min-h-[44px] flex-1 justify-center rounded-kd-md px-2 py-1.5"
          style={{ backgroundColor: stat.backgroundColor ?? theme.cardMuted }}
        >
          <Text className="text-[8px] font-medium text-kd-text-subtle" numberOfLines={1}>
            {stat.label}
          </Text>
          <Text className="mt-px text-kd-caption font-semibold" numberOfLines={1} style={{ color: stat.color ?? theme.text }}>
            {stat.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function LogStageMeta({
  compact = false,
  log,
  parsedLabel,
  theme,
}: {
  compact?: boolean;
  log: ActivityLogEntry;
  parsedLabel?: string | null;
  theme: KubdeeTheme;
}): React.JSX.Element | null {
  const stepLabel = log.step ? getCurrentStepLabel(log.step) : null;
  const stageLabel = parsedLabel || (log.stage ? getAutoPilotStageLabel(log.stage, '') : null);
  const label = [stepLabel, stageLabel].filter(Boolean).join(' · ');
  if (!label) {
    return null;
  }

  return (
    <View
      className={`self-start rounded-kd-sm border px-1.5 ${compact ? 'py-0' : 'mb-1 py-0.5'}`}
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

function LogFlowStats({
  stats,
  theme,
}: {
  stats: AutoPilotFlowStats;
  theme: KubdeeTheme;
}): React.JSX.Element {
  return (
    <View className="mt-1.5 flex-row flex-wrap gap-1">
      <LogFlowStat label="กำลัง" value={stats.generating} theme={theme} />
      <LogFlowStat label="คิว" value={stats.queued} theme={theme} />
      <LogFlowStat label="สำเร็จ" value={stats.success} theme={theme} />
      <LogFlowStat label="ล้มเหลว" value={stats.failed} theme={theme} warning={stats.failed > 0} />
      {stats.progress != null ? <LogFlowStat label="%" value={stats.progress} theme={theme} /> : null}
      {stats.tilesFound != null ? <LogFlowStat label="ทั้งหมด" value={stats.tilesFound} theme={theme} /> : null}
    </View>
  );
}

function LogFlowStat({
  label,
  value,
  theme,
  warning = false,
}: {
  label: string;
  value: number;
  theme: KubdeeTheme;
  warning?: boolean;
}): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-1 rounded-kd-sm bg-kd-panel-muted px-1.5 py-0.5 dark:bg-kd-card-muted">
      <Text className="text-kd-tiny text-kd-text-subtle">{label}</Text>
      <Text className="text-kd-tiny font-semibold" style={{ color: warning ? theme.red : theme.textMuted }}>
        {value}
      </Text>
    </View>
  );
}

function parseDisplayMessage(message: string): { message: string; stageLabel: string | null } {
  const match = message.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (!match) {
    return { message, stageLabel: null };
  }

  return {
    stageLabel: match[1]?.trim() || null,
    message: match[2]?.trim() || message,
  };
}

function getRunStatusColor(
  state: { running: boolean; stopping: boolean; latestLog: ActivityLogEntry | null },
  theme: KubdeeTheme
): string {
  if (state.stopping) return theme.amber;
  if (state.running) return theme.emerald;
  if (!state.latestLog) return theme.textSubtle;
  const level = inferMessageLevel(state.latestLog.message);
  if (level === 'error') return theme.red;
  if (level === 'warning') return theme.amber;
  if (level === 'success') return theme.emerald;
  return theme.blue;
}

function getLogTextColor(message: string, theme: KubdeeTheme): string {
  switch (inferMessageLevel(message)) {
    case 'error':
      return theme.red;
    case 'warning':
      return theme.amber;
    case 'success':
      return theme.emerald;
    case 'action':
      return theme.blue;
    default:
      return theme.textMuted;
  }
}

function inferMessageLevel(message: string): 'info' | 'success' | 'warning' | 'error' | 'action' {
  if (/ไม่สำเร็จ|ผิดพลาด|error|failed|ล้มเหลว/i.test(message)) return 'error';
  if (/เตือน|warning|กำลังหยุด|ถูกหยุด|ขาดตอน|ยังไม่/i.test(message)) return 'warning';
  if (/สำเร็จ|เสร็จ|พร้อมใช้|รับงานแล้ว|เลือกสินค้าแล้ว/i.test(message)) return 'success';
  if (/กำลัง|เริ่ม|เปิด|กด|ส่ง|ค้นหา|เลือก|เชื่อมต่อ/i.test(message)) return 'action';
  return 'info';
}

function getCurrentStepLabel(step: AutoPilotStepType): string {
  switch (step) {
    case 'image':
      return 'รูปภาพ';
    case 'video':
      return 'วิดีโอ';
    default:
      return 'ขั้นตอน';
  }
}

function formatLogTime(timestamp: number): string {
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

function formatLogDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

function useRunningNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) {
      return;
    }

    setNow(Date.now());
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [running]);

  return now;
}

import { Modal, ScrollView, View } from 'react-native';
import { Clock3, Image as ImageIcon, Info, Package, RefreshCw, Square, Trash2, Video, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import Text from '@/components/ui/KubdeeText';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AUTO_PILOT_INFINITE_ROUNDS } from '@/autopilot/defaults';
import { getAutoPilotStageLabel } from '@/autopilot/stageLabels';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';
import type { AutoPilotFlowStats, AutoPilotRunState } from '@/autopilot/types';
import { formatTime } from '../constants';
import { ProgressMetric, SectionCard } from '../primitives';

export function RunStatusSummaryBlock({
  runState,
  theme,
  onDismiss,
  onOpenLogs,
}: {
  runState: AutoPilotRunState;
  theme: KubdeeTheme;
  onDismiss?: () => void;
  onOpenLogs: () => void;
}): React.JSX.Element {
  useActivityNowTick(runState.status === 'running');
  const progress = runState.progress;
  const progressRatio = getRunProgressRatio(runState);
  const currentStepLabel = getCurrentStepLabel(progress.currentStep);
  const currentStepProgressLabel =
    progress.totalSteps > 1 && progress.currentStepIndex > 0
      ? `${currentStepLabel} ${progress.currentStepIndex}/${progress.totalSteps}`
      : currentStepLabel;
  const firstLog = getFirstLog(runState);
  const latestLog = getLatestLog(runState);
  const elapsedMs = getRunElapsedMs(runState);
  const flowStats = getLatestFlowStats(runState);

  const dismissible = runState.status !== 'running' && Boolean(onDismiss);

  return (
    <SectionCard
      theme={theme}
      icon={Clock3}
      title="สถานะการทำงาน"
      action={
        dismissible ? (
          <Button
            accessibilityLabel="ปิดสถานะการทำงาน"
            accessibilityRole="button"
            variant="ghost"
            size="icon"
            onPress={onDismiss}
            className="h-7 w-7 rounded-full bg-kd-panel-muted dark:bg-kd-card-muted"
          >
            <X size={14} color={theme.textMuted} strokeWidth={2.2} />
          </Button>
        ) : undefined
      }
    >
      <View className="gap-2.5">
        <View className="flex-row items-start justify-between gap-2">
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center gap-1.5">
              <View
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: getRunStatusColor(runState.status, theme) }}
              />
              <Text className="text-kd-caption font-medium text-kd-text">
                {getRunStatusLabel(runState.status)} · {getRunStageLabel(progress.currentStage)}
              </Text>
            </View>
            <Text numberOfLines={1} className="mt-1 text-kd-micro text-kd-text-subtle">
              {progress.currentProductName || 'ยังไม่มีสินค้าที่กำลังทำ'} · {currentStepProgressLabel}
            </Text>
            {firstLog || latestLog ? (
              <Text numberOfLines={1} className="mt-0.5 text-kd-micro text-kd-text-subtle">
                {firstLog ? `เริ่ม ${formatTime(firstLog.timestamp)}` : ''}
                {firstLog && latestLog ? ' · ' : ''}
                {latestLog ? `ล่าสุด ${formatTime(latestLog.timestamp)}` : ''}
                {elapsedMs != null ? ` · ใช้เวลา ${formatDuration(elapsedMs)}` : ''}
              </Text>
            ) : null}
          </View>

          <Button
            accessibilityLabel="เปิดรายละเอียดการทำงาน"
            accessibilityRole="button"
            variant="ghost"
            size="sm"
            onPress={onOpenLogs}
            className="h-8 flex-row items-center justify-center gap-1.5 rounded-kd-md bg-kd-panel-muted px-2.5 dark:bg-kd-card-muted"
          >
            <Info size={13} color={theme.textMuted} strokeWidth={2.2} />
            <Text className="text-kd-micro font-semibold text-kd-text-subtle">รายละเอียด</Text>
          </Button>
        </View>

        {latestLog ? (
          <View className="rounded-kd-md bg-kd-panel-muted px-2.5 py-2 dark:bg-kd-card-muted">
            <View className="flex-row flex-wrap items-center gap-1">
              <Text className="text-kd-micro font-semibold text-kd-text-subtle">
                ล่าสุด {formatTime(latestLog.timestamp)}
              </Text>
              <LogStageMeta log={latestLog} theme={theme} compact />
            </View>
            <Text
              numberOfLines={2}
              className="mt-0.5 text-kd-caption leading-4"
              style={{ color: getLogTextColor(latestLog.level, theme) }}
            >
              {latestLog.message}
            </Text>
          </View>
        ) : null}

        <View className="gap-1.5">
          <View className="flex-row items-center justify-between">
            <Text className="text-kd-micro text-kd-text-subtle">ความคืบหน้า</Text>
            <Text className="text-kd-micro font-semibold text-kd-text">
              {Math.round(progressRatio * 100)}%
            </Text>
          </View>
          <Progress
            value={Math.max(0, Math.min(1, progressRatio)) * 100}
            className="h-2 bg-kd-panel-muted dark:bg-kd-card-muted"
            indicatorClassName="bg-kd-emerald"
          />
        </View>

        <View className="flex-row gap-2">
          <ProgressMetric color={theme.blue} icon={RefreshCw} label="รอบ" theme={theme} value={formatRoundProgress(progress.currentRound, progress.totalRounds)} />
          <ProgressMetric color={theme.emerald} icon={Package} label="สินค้า" theme={theme} value={`${progress.currentProduct}/${progress.totalProducts}`} />
          {progress.plannedImages > 0 ? (
            <ProgressMetric color={theme.amber} icon={ImageIcon} label="รูป" theme={theme} value={formatAssetProgress(progress.generatedImages, progress.failedImages, progress.plannedImages)} />
          ) : null}
          {progress.plannedVideos > 0 ? (
            <ProgressMetric color={theme.red} icon={Video} label="วิดีโอ" theme={theme} value={formatAssetProgress(progress.generatedVideos, progress.failedVideos, progress.plannedVideos)} />
          ) : null}
        </View>

        {flowStats ? (
          <View className="gap-1.5 rounded-kd-md border border-kd-border bg-kd-panel-muted px-2.5 py-2 dark:bg-kd-card-muted">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="text-kd-micro font-semibold text-kd-text-subtle">สถานะ Google Flow</Text>
              {flowStats.progress != null ? (
                <Text className="text-kd-micro font-semibold text-kd-text">
                  {flowStats.progress}%
                </Text>
              ) : null}
            </View>
            <View className="flex-row flex-wrap gap-1.5">
              <MiniFlowStat label="กำลัง" value={flowStats.generating} theme={theme} />
              <MiniFlowStat label="คิว" value={flowStats.queued} theme={theme} />
              <MiniFlowStat label="สำเร็จ" value={flowStats.success} theme={theme} />
              <MiniFlowStat label="ล้มเหลว" value={flowStats.failed} theme={theme} warning={flowStats.failed > 0} />
              {flowStats.tilesFound != null ? (
                <MiniFlowStat label="ทั้งหมด" value={flowStats.tilesFound} theme={theme} />
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </SectionCard>
  );
}

export function ActivityLogSheet({
  bottomInset,
  runState,
  theme,
  onClear,
  onClose,
  onStop,
}: {
  bottomInset: number;
  runState: AutoPilotRunState;
  theme: KubdeeTheme;
  onClear: () => void;
  onClose: () => void;
  onStop: () => void;
}): React.JSX.Element {
  useActivityNowTick(runState.status === 'running');
  const isRunning = runState.status === 'running';
  const logs = runState.logs.slice(-80);
  const visibleStartIndex = Math.max(0, runState.logs.length - logs.length);
  const firstLog = getFirstLog(runState);
  const latestLog = getLatestLog(runState);
  const elapsedMs = getRunElapsedMs(runState);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View className="flex-1 justify-end bg-black/60">
        <View
          className="overflow-hidden rounded-t-[18px] border border-kd-border bg-kd-panel"
          style={{ maxHeight: '72%' }}
        >
          <View className="border-b border-kd-border bg-kd-card px-3 pt-3">
            <View className="flex-row items-center justify-between pb-2">
              <View className="min-w-0 flex-1 flex-row items-center gap-2">
                <View className="h-8 w-8 items-center justify-center rounded-kd-lg bg-kd-panel-muted dark:bg-kd-card-muted">
                  <Info size={15} color={theme.textMuted} strokeWidth={2.1} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[14px] font-semibold text-kd-text">รายละเอียดการทำงาน</Text>
                  <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
                    {getRunStatusLabel(runState.status)}
                    {firstLog ? ` · เริ่ม ${formatTime(firstLog.timestamp)}` : ''}
                    {latestLog ? ` · ล่าสุด ${formatTime(latestLog.timestamp)}` : ''}
                    {elapsedMs != null ? ` · ใช้เวลา ${formatDuration(elapsedMs)}` : ''}
                    {` · log ${logs.length} รายการ`}
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center gap-1">
                {isRunning ? (
                  <Button
                    accessibilityLabel="หยุด Auto Pilot"
                    accessibilityRole="button"
                    variant="ghost"
                    size="icon"
                    onPress={onStop}
                    className="h-8 w-8 items-center justify-center rounded-kd-md"
                    style={{ backgroundColor: alpha(theme.red, theme.isDark ? 0.18 : 0.1) }}
                  >
                    <Square size={13} color={theme.red} fill={theme.red} strokeWidth={2} />
                  </Button>
                ) : null}
                <Button
                  accessibilityLabel="ล้างรายละเอียดการทำงาน"
                  accessibilityRole="button"
                  disabled={logs.length === 0}
                  variant="ghost"
                  size="icon"
                  onPress={onClear}
                  className="h-8 w-8 items-center justify-center rounded-kd-md bg-kd-panel-muted dark:bg-kd-card-muted"
                  style={{ opacity: logs.length === 0 ? 0.45 : 1 }}
                >
                  <Trash2 size={14} color={theme.textSubtle} strokeWidth={2} />
                </Button>
                <Button
                  accessibilityLabel="ปิดรายละเอียดการทำงาน"
                  accessibilityRole="button"
                  variant="ghost"
                  size="icon"
                  onPress={onClose}
                  className="h-8 w-8 items-center justify-center rounded-kd-md bg-kd-panel-muted dark:bg-kd-card-muted"
                >
                  <X size={15} color={theme.textMuted} strokeWidth={2.3} />
                </Button>
              </View>
            </View>
          </View>

          <ScrollView
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            contentContainerClassName="gap-1.5 px-3 py-3"
            contentContainerStyle={{ paddingBottom: Math.max(bottomInset, 20) }}
          >
            {logs.length === 0 ? (
              <View className="min-h-[120px] items-center justify-center gap-1.5">
                <Clock3 size={24} color={theme.textSubtle} strokeWidth={1.8} />
                <Text className="text-kd-caption font-semibold text-kd-text-subtle">ยังไม่มีรายละเอียดการทำงาน</Text>
              </View>
            ) : (
              logs.map((log, index) => {
                const absoluteIndex = visibleStartIndex + index;
                const previousLog = absoluteIndex > 0 ? runState.logs[absoluteIndex - 1] : null;
                const deltaMs = previousLog ? Math.max(0, log.timestamp - previousLog.timestamp) : 0;
                const sinceStartMs = firstLog ? Math.max(0, log.timestamp - firstLog.timestamp) : 0;
                return (
                  <View key={log.id} className="flex-row gap-2 rounded-kd-md bg-kd-card px-2.5 py-2">
                    <View className="w-[68px]">
                      <Text className="text-kd-micro font-medium text-kd-text-subtle">{formatTime(log.timestamp)}</Text>
                      <Text className="mt-0.5 text-kd-tiny text-kd-text-subtle">
                        +{formatDuration(deltaMs)} · {formatDuration(sinceStartMs)}
                      </Text>
                    </View>
                    <View className="min-w-0 flex-1">
                      <LogStageMeta log={log} theme={theme} />
                      <Text className="text-kd-caption leading-4" style={{ color: getLogTextColor(log.level, theme) }}>
                        {log.message}
                      </Text>
                      {log.flowStats ? <LogFlowStats stats={log.flowStats} theme={theme} /> : null}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function useActivityNowTick(active: boolean): void {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const timer = setInterval(() => {
      setTick((value) => value + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [active]);
}

function LogStageMeta({
  log,
  theme,
  compact = false,
}: {
  log: AutoPilotRunState['logs'][number];
  theme: KubdeeTheme;
  compact?: boolean;
}): React.JSX.Element | null {
  if (!log.step && !log.stage) {
    return null;
  }

  const stepLabel = log.step ? getCurrentStepLabel(log.step) : null;
  const stageLabel = log.stage ? getAutoPilotStageLabel(log.stage, '') : null;
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
      <Text className="text-kd-tiny font-semibold" style={{ color: theme.blue }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function MiniFlowStat({
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
    <View className="min-w-[58px] flex-1 rounded-kd-md bg-kd-card px-2 py-1.5">
      <Text className="text-kd-tiny font-semibold text-kd-text-subtle">{label}</Text>
      <Text className="mt-px text-kd-caption font-semibold" style={{ color: warning ? theme.red : theme.text }}>
        {value}
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

function getRunProgressRatio(runState: AutoPilotRunState): number {
  const progress = runState.progress;
  const totalSteps = Math.max(1, progress.totalSteps || 1);
  const totalProducts = Math.max(1, progress.totalProducts);
  const isInfinite = progress.totalRounds >= AUTO_PILOT_INFINITE_ROUNDS;
  const totalRounds = isInfinite ? 1 : progress.totalRounds;
  const totalWork = Math.max(1, totalRounds * totalProducts * totalSteps);
  const currentWork = Math.min(
    totalWork,
    Math.max(
      0,
      (isInfinite ? 0 : Math.max(0, progress.currentRound - 1) * totalProducts * totalSteps) +
        (Math.max(0, progress.currentProduct - 1) * totalSteps) +
        Math.max(0, progress.currentStepIndex || (progress.currentStep ? 1 : 0))
    )
  );

  return runState.status === 'completed' ? 1 : currentWork / totalWork;
}

function formatRoundProgress(currentRound: number, totalRounds: number): string {
  if (totalRounds >= AUTO_PILOT_INFINITE_ROUNDS) {
    return `${currentRound}/∞`;
  }
  return `${currentRound}/${totalRounds}`;
}

function formatAssetProgress(generated: number, failed: number, planned: number): string {
  const safePlanned = Math.max(0, planned);
  const safeGenerated = safePlanned > 0 ? Math.min(Math.max(0, generated), safePlanned) : Math.max(0, generated);
  const safeFailed =
    safePlanned > 0
      ? Math.min(Math.max(0, failed), Math.max(0, safePlanned - safeGenerated))
      : Math.max(0, failed);
  const completed = safeFailed > 0 ? `${safeGenerated}·${safeFailed}` : `${safeGenerated}`;
  return `${completed}/${safePlanned}`;
}

function getFirstLog(runState: AutoPilotRunState): AutoPilotRunState['logs'][number] | null {
  return runState.logs[0] ?? null;
}

function getLatestLog(runState: AutoPilotRunState): AutoPilotRunState['logs'][number] | null {
  return runState.logs[runState.logs.length - 1] ?? null;
}

function getRunElapsedMs(runState: AutoPilotRunState): number | null {
  const firstLog = getFirstLog(runState);
  if (!firstLog) {
    return null;
  }

  const latestLog = getLatestLog(runState);
  const end = runState.status === 'running' ? Date.now() : latestLog?.timestamp ?? firstLog.timestamp;
  return Math.max(0, end - firstLog.timestamp);
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

function getLatestFlowStats(runState: AutoPilotRunState): AutoPilotFlowStats | null {
  for (let index = runState.logs.length - 1; index >= 0; index -= 1) {
    const log = runState.logs[index];
    if (log?.flowStats) {
      return log.flowStats;
    }

    const message = log?.message ?? '';
    const match = message.match(/gen\s+(\d+)\s+queue\s+(\d+)\s+ok\s+(\d+)\s+fail\s+(\d+)(?:\s+(\d+)%?)?/i);
    if (!match) {
      continue;
    }

    const progress = match[5] != null ? Number.parseInt(match[5], 10) : null;
    return {
      generating: Number.parseInt(match[1] ?? '0', 10) || 0,
      queued: Number.parseInt(match[2] ?? '0', 10) || 0,
      success: Number.parseInt(match[3] ?? '0', 10) || 0,
      failed: Number.parseInt(match[4] ?? '0', 10) || 0,
      progress: Number.isFinite(progress) ? progress : null,
    };
  }

  return null;
}

function getCurrentStepLabel(step: AutoPilotRunState['progress']['currentStep']): string {
  switch (step) {
    case 'image':
      return 'รูปภาพ';
    case 'video':
      return 'วิดีโอ';
    default:
      return 'ยังไม่เลือกขั้นตอน';
  }
}

function getRunStatusColor(status: AutoPilotRunState['status'], theme: KubdeeTheme): string {
  switch (status) {
    case 'running':
      return theme.emerald;
    case 'completed':
      return theme.blue;
    case 'error':
      return theme.red;
    case 'stopped':
      return theme.amber;
    default:
      return theme.textSubtle;
  }
}

function getRunStatusLabel(status: AutoPilotRunState['status']): string {
  switch (status) {
    case 'running':
      return 'กำลังทำงาน';
    case 'completed':
      return 'เสร็จแล้ว';
    case 'stopped':
      return 'หยุดแล้ว';
    case 'error':
      return 'ผิดพลาด';
    default:
      return 'พร้อมเริ่ม';
  }
}

function getRunStageLabel(stage: string | null): string {
  return getAutoPilotStageLabel(stage);
}

function getLogTextColor(level: AutoPilotRunState['logs'][number]['level'], theme: KubdeeTheme): string {
  switch (level) {
    case 'error':
      return theme.red;
    case 'success':
      return theme.emerald;
    case 'warning':
      return theme.amber;
    case 'action':
      return theme.blue;
    default:
      return theme.textMuted;
  }
}

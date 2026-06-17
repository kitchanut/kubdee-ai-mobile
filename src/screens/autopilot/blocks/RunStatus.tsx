import { ScrollView, View } from 'react-native';
import { Clock3, Image as ImageIcon, Package, RefreshCw, Square, Trash2, Video } from 'lucide-react-native';
import Text from '@/components/ui/KubdeeText';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';
import type { AutoPilotRunState } from '@/autopilot/types';
import { formatTime } from '../constants';
import { ProgressMetric, SectionCard } from '../primitives';

export function ActivityLogBlock({
  runState,
  theme,
  onClear,
  onStop,
}: {
  runState: AutoPilotRunState;
  theme: KubdeeTheme;
  onClear: () => void;
  onStop: () => void;
}): React.JSX.Element {
  const isRunning = runState.status === 'running';
  const logs = runState.logs.slice(-18);

  return (
    <View className="overflow-hidden rounded-[14px] border border-kd-border bg-kd-card">
      <View className="flex-row items-center justify-between border-b border-kd-border px-3 py-2.5">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <View className="h-2 w-2 rounded-full" style={{ backgroundColor: isRunning ? theme.emerald : theme.amber }} />
          <Text className="text-[13px] font-semibold text-kd-text">Activity Log</Text>
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
            accessibilityLabel="ล้าง Activity Log"
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
        </View>
      </View>

      <View style={{ maxHeight: 210 }}>
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerClassName="gap-1.5 px-3 py-2.5">
          {logs.length === 0 ? (
            <View className="min-h-[86px] items-center justify-center gap-1.5">
              <Clock3 size={22} color={theme.textSubtle} strokeWidth={1.8} />
              <Text className="text-kd-caption font-semibold text-kd-text-subtle">Ready to start...</Text>
            </View>
          ) : (
            logs.map((log) => (
              <View key={log.id} className="flex-row gap-2">
                <Text className="w-[58px] text-kd-micro text-kd-text-subtle">{formatTime(log.timestamp)}</Text>
                <Text className="flex-1 text-kd-caption leading-4" style={{ color: getLogTextColor(log.level, theme) }}>
                  {log.message}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
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
  switch (stage) {
    case 'started':
      return 'เตรียมเปิด Flow';
    case 'round_started':
      return 'เริ่มรอบใหม่';
    case 'product_started':
      return 'เลือกสินค้า';
    case 'step_started':
      return 'เริ่มสร้างงาน';
    case 'submitted':
      return 'ส่งคำสั่งสร้างแล้ว';
    case 'failed':
      return 'สร้างไม่สำเร็จ';
    case 'download_missing':
      return 'ยังไม่พบไฟล์ดาวน์โหลด';
    case 'completed':
      return 'เสร็จแล้ว';
    case 'stopped':
      return 'หยุดแล้ว';
    case 'error':
      return 'ผิดพลาด';
    default:
      return 'รอเริ่มงาน';
  }
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

function ProgressBlock({
  runState,
  theme,
}: {
  runState: AutoPilotRunState;
  theme: KubdeeTheme;
}): React.JSX.Element {
  const progress = runState.progress;
  const totalWork = Math.max(1, progress.totalRounds * Math.max(1, progress.totalProducts));
  const currentWork = Math.min(
    totalWork,
    Math.max(0, (Math.max(0, progress.currentRound - 1) * Math.max(1, progress.totalProducts)) + progress.currentProduct)
  );
  const progressRatio = runState.status === 'completed' ? 1 : currentWork / totalWork;
  const currentStepLabel =
    progress.currentStep === 'image'
      ? 'รูปภาพ'
      : progress.currentStep === 'video'
        ? 'วิดีโอ'
        : 'ยังไม่เลือกขั้นตอน';

  return (
    <SectionCard theme={theme} icon={Clock3} title="สถานะการทำงาน">
      <View className="gap-2">
        <View className="flex-row items-center justify-between">
          <View className="min-w-0 flex-1">
            <Text className="text-kd-caption font-medium text-kd-text">
              {getRunStatusLabel(runState.status)} · {getRunStageLabel(progress.currentStage)}
            </Text>
            <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
              {progress.currentProductName || 'ยังไม่มีสินค้าที่กำลังทำ'} · {currentStepLabel}
            </Text>
          </View>
          <Text className="text-kd-caption font-medium text-kd-text">
            {Math.round(progressRatio * 100)}%
          </Text>
        </View>

        <Progress
          value={Math.max(0, Math.min(1, progressRatio)) * 100}
          className="h-2 bg-kd-panel-muted dark:bg-kd-card-muted"
          indicatorClassName="bg-kd-emerald"
        />

        <View className="flex-row gap-2">
          <ProgressMetric color={theme.blue} icon={RefreshCw} label="รอบ" theme={theme} value={`${progress.currentRound}/${progress.totalRounds}`} />
          <ProgressMetric color={theme.emerald} icon={Package} label="สินค้า" theme={theme} value={`${progress.currentProduct}/${progress.totalProducts}`} />
          <ProgressMetric color={theme.amber} icon={ImageIcon} label="รูป" theme={theme} value={`${progress.generatedImages}/${progress.failedImages}`} />
          <ProgressMetric color={theme.red} icon={Video} label="วิดีโอ" theme={theme} value={`${progress.generatedVideos}/${progress.failedVideos}`} />
        </View>
      </View>
    </SectionCard>
  );
}

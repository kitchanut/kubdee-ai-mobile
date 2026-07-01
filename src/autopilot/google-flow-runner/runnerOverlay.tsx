import { View } from 'react-native';

import { getAutoPilotStageLabel, isAutoPilotGlobalStage } from '@/autopilot/stageLabels';
import type { AutoPilotFlowStats, AutoPilotStepType } from '@/autopilot/types';
import Text from '@/components/ui/KubdeeText';
import { alpha, type KubdeeTheme } from '@/theme/tokens';
import type { OverlayLogLine } from './runnerBasics';
import { stepLabel } from './runnerPlanning';

export function OverlayStatChip({
  color,
  label,
  theme,
  value,
}: {
  color: string;
  label: string;
  theme: KubdeeTheme;
  value: string;
}): React.JSX.Element {
  return (
    <View
      className="h-5 flex-row items-center gap-1.5 rounded-kd-sm px-1.5"
      style={{
        backgroundColor: alpha(color, theme.isDark ? 0.16 : 0.08),
      }}
    >
      <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      <Text className="text-[9px] font-normal text-kd-text-subtle" numberOfLines={1}>
        {label}
      </Text>
      <Text className="text-[10px] font-medium" numberOfLines={1} style={{ color }}>
        {value}
      </Text>
    </View>
  );
}

export function getOverlayAssetColor(
  generated: number,
  failed: number,
  planned: number,
  fallbackColor: string,
  theme: KubdeeTheme
): string {
  if (failed > 0) return theme.red;
  if (planned > 0 && generated >= planned) return theme.emerald;
  return fallbackColor;
}

export function formatOverlayStep(step: AutoPilotStepType | null, stage: string | null): string {
  const stepText = step ? stepLabel(step) : 'รอเริ่ม';
  if (!stage) return stepText;
  if (stage === 'step_started') return stepText;
  const stageLabel = getAutoPilotStageLabel(stage, stage.replace(/^flow_/, ''));
  if (!step || isAutoPilotGlobalStage(stage)) return stageLabel;
  if (stage.startsWith('multi_scene_config_image')) return `รูปภาพ · ${stageLabel}`;
  return `${stepText} · ${stageLabel}`;
}

export function formatOverlayFlowStats(stats?: AutoPilotFlowStats): string {
  if (!stats) return 'รอข้อมูล';
  if (stats.progress != null) return `${stats.progress}%`;
  const parts = [
    stats.generating > 0 ? `gen ${stats.generating}` : '',
    stats.queued > 0 ? `queue ${stats.queued}` : '',
    stats.success > 0 ? `ok ${stats.success}` : '',
    stats.failed > 0 ? `fail ${stats.failed}` : '',
    stats.tilesFound ? `tiles ${stats.tilesFound}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'รอข้อมูล';
}

export function formatOverlayAssetProgress(generated: number, failed: number, planned: number): string {
  if (failed > 0) {
    return `${generated}·${failed}/${planned}`;
  }
  return `${generated}/${planned}`;
}

export function formatOverlayLogMeta(line: OverlayLogLine): string | null {
  if (!line.step && !line.stage) return null;
  return formatOverlayStep(line.step ?? null, line.stage ?? null);
}

export function isImportantOverlayLog(line: OverlayLogLine): boolean {
  if (line.level === 'error' || line.level === 'warning') return true;
  return /ไม่สำเร็จ|ไม่พบ|ไม่ได้|ไม่เปิด|ล้มเหลว|Failed|Error|Retry/i.test(line.message);
}

export function getOverlayLogMessageLineCount(line: OverlayLogLine): number {
  return isImportantOverlayLog(line) ? 3 : 1;
}

export function getOverlayLogMessageColor(line: OverlayLogLine): string {
  if (line.level === 'error' || /ไม่สำเร็จ|ล้มเหลว|Failed|Error/i.test(line.message)) {
    return '#fecaca';
  }
  if (line.level === 'warning' || /Retry|ไม่พบ|ไม่ได้|ไม่เปิด/i.test(line.message)) {
    return '#fde68a';
  }
  return '#ffffff';
}

export function formatOverlayTime(timestamp: number): string {
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}

export function formatOverlayDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

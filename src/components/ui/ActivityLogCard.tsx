import { useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { ChevronDown, ChevronUp, Square, Trash2 } from 'lucide-react-native';

import Text from '@/components/ui/KubdeeText';
import SectionHeader from '@/components/ui/SectionHeader';
import type { KubdeeTheme } from '@/theme/tokens';

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export interface ActivityLogEntry {
  message: string;
  ts: number;
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
  maxVisible = 10,
  initiallyExpanded = false,
  stopLabel = 'หยุด',
  stoppingLabel = 'กำลังหยุด',
  clearLabel = 'ล้างประวัติ',
  stats = [],
  onStop,
  onClear,
  formatTimestamp = formatLogTime,
}: ActivityLogCardProps<TLog>): React.JSX.Element {
  const [drawerOpen, setDrawerOpen] = useState(initiallyExpanded);
  const visibleLogs = useMemo(() => logs.slice(-maxVisible), [logs, maxVisible]);
  const statusText = running ? runningText : logs.length > 0 ? `ล่าสุด ${logs.length} รายการ` : idleText;
  const Icon = icon;

  return (
    <>
      <View className="flex-row items-center justify-between gap-2 px-1 py-0.5">
        <Pressable
          accessibilityLabel="เปิด Activity Log"
          accessibilityRole="button"
          onPress={() => setDrawerOpen(true)}
          className="min-h-[34px] min-w-0 flex-1 flex-row items-center gap-1.5 rounded-kd-md px-1.5 active:opacity-70"
        >
          {Icon ? <Icon size={13} color={theme.textSubtle} strokeWidth={2.2} /> : null}
          <View className="min-w-0 flex-1">
            <Text className="text-kd-micro font-extrabold uppercase tracking-[0px] text-kd-text-subtle">
              {title}
            </Text>
            <Text className="text-kd-caption font-bold leading-4 text-kd-text-subtle" numberOfLines={1}>
              {statusText}
            </Text>
            {stats.length > 0 ? <ActivityLogStats stats={stats.slice(0, 3)} theme={theme} compact /> : null}
          </View>
          <ChevronUp size={14} color={theme.textSubtle} strokeWidth={2.2} />
        </Pressable>

        {running && onStop ? (
          <Pressable
            accessibilityRole="button"
            disabled={stopping}
            onPress={onStop}
            className="h-8 flex-row items-center justify-center gap-1.5 rounded-kd-md bg-kd-red px-2.5 active:opacity-70 disabled:opacity-70"
          >
            {stopping ? (
              <ActivityIndicator color={theme.white} size="small" />
            ) : (
              <Square size={12} color={theme.white} fill={theme.white} strokeWidth={2} />
            )}
            <Text className="text-kd-caption font-black text-white">
              {stopping ? stoppingLabel : stopLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => setDrawerOpen(false)}
        statusBarTranslucent
        transparent
        visible={drawerOpen}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}>
          <Pressable
            accessibilityLabel="ปิด Activity Log"
            accessibilityRole="button"
            className="absolute inset-0"
            onPress={() => setDrawerOpen(false)}
          />

          <View
            accessibilityViewIsModal
            className="rounded-t-[22px] border border-kd-border bg-kd-card px-4 pb-10 pt-2"
            style={{ maxHeight: '78%', minHeight: 260 }}
          >
            <View className="mb-3 h-1 w-10 self-center rounded-full bg-kd-border" />

            <View className="gap-0.5">
              <SectionHeader
                icon={icon}
                theme={theme}
                title={title}
                right={
                  <View className="flex-row items-center gap-1.5">
                    {!running && logs.length > 0 && onClear ? (
                      <Pressable
                        accessibilityLabel={clearLabel}
                        accessibilityRole="button"
                        onPress={onClear}
                        className="h-8 w-8 items-center justify-center rounded-kd-md bg-kd-card-muted active:opacity-70"
                      >
                        <Trash2 size={13} color={theme.textSubtle} strokeWidth={2.1} />
                      </Pressable>
                    ) : null}

                    {running && onStop ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={stopping}
                        onPress={onStop}
                        className="h-8 flex-row items-center justify-center gap-1.5 rounded-kd-md bg-kd-red px-2.5 active:opacity-70 disabled:opacity-70"
                      >
                        {stopping ? (
                          <ActivityIndicator color={theme.white} size="small" />
                        ) : (
                          <Square size={12} color={theme.white} fill={theme.white} strokeWidth={2} />
                        )}
                        <Text className="text-kd-caption font-black text-white">
                          {stopping ? stoppingLabel : stopLabel}
                        </Text>
                      </Pressable>
                    ) : null}

                    <Pressable
                      accessibilityLabel="ปิด Activity Log"
                      accessibilityRole="button"
                      onPress={() => setDrawerOpen(false)}
                      className="h-8 w-8 items-center justify-center rounded-kd-md bg-kd-card-muted active:opacity-70"
                    >
                      <ChevronDown size={15} color={theme.textSubtle} strokeWidth={2.2} />
                    </Pressable>
                  </View>
                }
              />
              <Text className="text-kd-caption font-bold leading-4 text-kd-text-subtle">{statusText}</Text>
              {stats.length > 0 ? <ActivityLogStats stats={stats} theme={theme} /> : null}
            </View>

            <ScrollView
              className="mt-3"
              contentContainerClassName="gap-1.5 rounded-kd-md bg-kd-card-muted p-2"
              showsVerticalScrollIndicator={false}
            >
              {visibleLogs.length > 0 ? (
                visibleLogs.map((entry, index) => (
                  <View key={`${entry.ts}-${index}`} className="flex-row gap-2">
                    <Text className="w-[48px] shrink-0 text-[10px] text-kd-text-muted">
                      {formatTimestamp(entry.ts)}
                    </Text>
                    <Text className="min-w-0 flex-1 text-[10px] leading-4 text-kd-text-subtle">
                      {entry.message}
                    </Text>
                  </View>
                ))
              ) : (
                <Text className="text-kd-caption text-kd-text-subtle">{emptyText}</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function ActivityLogStats({
  compact = false,
  stats,
  theme,
}: {
  compact?: boolean;
  stats: ActivityLogStat[];
  theme: KubdeeTheme;
}): React.JSX.Element {
  return (
    <View className={`mt-1 flex-row flex-wrap ${compact ? 'gap-1' : 'gap-1.5'}`}>
      {stats.map((stat) => (
        <View
          key={`${stat.label}-${stat.value}`}
          className="flex-row items-center gap-1 rounded-kd-md px-1.5 py-1"
          style={{ backgroundColor: stat.backgroundColor ?? theme.cardMuted }}
        >
          <Text
            className="text-[9px] font-extrabold uppercase text-kd-text-muted"
            numberOfLines={1}
          >
            {stat.label}
          </Text>
          <Text
            className="text-[10px] font-black"
            numberOfLines={1}
            style={{ color: stat.color ?? theme.text }}
          >
            {stat.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function formatLogTime(timestamp: number): string {
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

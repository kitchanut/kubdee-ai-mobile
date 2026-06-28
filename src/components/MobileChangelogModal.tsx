import { CheckCircle2, CircleDot, Wrench, X } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';
import { MOBILE_CHANGELOG, type MobileChangelogItem } from '@/updates/mobileChangelog';

interface MobileChangelogModalProps {
  visible: boolean;
  theme: KubdeeTheme;
  versionLabel: string;
  onClose: () => void;
}

function typeLabel(type: MobileChangelogItem['type']): string {
  if (type === 'fixed') return 'แก้ไข';
  if (type === 'changed') return 'ปรับปรุง';
  return 'เพิ่ม';
}

function typeColor(theme: KubdeeTheme, type: MobileChangelogItem['type']): string {
  if (type === 'fixed') return theme.red;
  if (type === 'changed') return theme.amber;
  return theme.emerald;
}

function TypeIcon({ type, color }: { type: MobileChangelogItem['type']; color: string }): React.JSX.Element {
  if (type === 'fixed') {
    return <Wrench size={13} color={color} strokeWidth={2.3} />;
  }

  if (type === 'changed') {
    return <CircleDot size={13} color={color} strokeWidth={2.3} />;
  }

  return <CheckCircle2 size={13} color={color} strokeWidth={2.3} />;
}

export default function MobileChangelogModal({
  visible,
  theme,
  versionLabel,
  onClose,
}: MobileChangelogModalProps): React.JSX.Element {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View className="flex-1 justify-end bg-black/55">
        <Pressable className="min-h-[18%] flex-1" onPress={onClose} />
        <View
          className="max-h-[82%] rounded-t-[22px] border border-kd-border bg-kd-panel px-4 pb-5 pt-4"
          style={{
            shadowColor: theme.shadow,
            shadowOffset: { width: 0, height: -12 },
            shadowOpacity: 0.2,
            shadowRadius: 22,
            elevation: 18,
          }}
        >
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="text-kd-title font-extrabold text-kd-text">เวอร์ชันและ Changelog</Text>
              <Text className="mt-1 text-kd-caption font-medium text-kd-text-subtle">
                เครื่องนี้ใช้ {versionLabel}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="ปิด changelog"
              accessibilityRole="button"
              onPress={onClose}
              className="h-9 w-9 items-center justify-center rounded-full bg-kd-card-muted active:opacity-75"
            >
              <X size={18} color={theme.textMuted} strokeWidth={2.3} />
            </Pressable>
          </View>

          <View className="mt-4 h-px bg-kd-border" />

          <ScrollView className="mt-4" showsVerticalScrollIndicator={false}>
            <View className="gap-3 pb-2">
              {MOBILE_CHANGELOG.map((release, releaseIndex) => (
                <View
                  key={release.version}
                  className="rounded-[12px] border border-kd-border bg-kd-card p-3"
                >
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="min-w-0 flex-1">
                      <Text className="text-kd-body font-extrabold text-kd-text">
                        v{release.version}
                      </Text>
                      <Text className="mt-0.5 text-kd-micro font-medium text-kd-text-subtle">
                        {release.date}
                      </Text>
                    </View>
                    {releaseIndex === 0 ? (
                      <View
                        className="rounded-full px-2 py-1"
                        style={{ backgroundColor: alpha(theme.emerald, theme.isDark ? 0.16 : 0.12) }}
                      >
                        <Text className="text-kd-tiny font-extrabold" style={{ color: theme.emerald }}>
                          ล่าสุด
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <Text className="mt-2 text-kd-caption font-semibold leading-[17px] text-kd-text">
                    {release.highlight}
                  </Text>

                  <View className="mt-3 gap-2">
                    {release.changes.map((change, index) => {
                      const color = typeColor(theme, change.type);

                      return (
                        <View key={`${release.version}-${index}`} className="flex-row items-start gap-2">
                          <View className="mt-[2px] h-5 w-5 items-center justify-center rounded-full bg-kd-panel-muted dark:bg-kd-card-muted">
                            <TypeIcon type={change.type} color={color} />
                          </View>
                          <View className="min-w-0 flex-1">
                            <Text className="text-kd-micro font-extrabold" style={{ color }}>
                              {typeLabel(change.type)}
                            </Text>
                            <Text className="mt-px text-kd-caption font-medium leading-[17px] text-kd-text-muted">
                              {change.text}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            className="mt-3 h-11 items-center justify-center rounded-kd-xl bg-[#0a0a0a] active:opacity-85 dark:bg-white"
          >
            <Text className="text-kd-label font-extrabold text-white dark:text-[#0a0a0a]">
              รับทราบ
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

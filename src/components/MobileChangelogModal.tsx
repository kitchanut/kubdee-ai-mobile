import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, View, useWindowDimensions } from 'react-native';

import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';
import {
  MOBILE_CHANGELOG,
  loadMobileChangelog,
  type MobileChangelogItem,
  type MobileChangelogRelease,
} from '@/updates/mobileChangelog';

interface MobileChangelogModalProps {
  visible: boolean;
  authToken?: string | null;
  theme: KubdeeTheme;
  versionLabel: string;
  onClose: () => void;
}

interface ChangeGroup {
  label: string;
  items: MobileChangelogItem[];
}

interface TypeConfig {
  color: string;
  label: string;
  order: number;
}

function getTypeConfig(theme: KubdeeTheme, type: MobileChangelogItem['type']): TypeConfig {
  const featureColor = theme.emerald;
  const improvedColor = theme.blue;
  const fixedColor = theme.amber;
  const removedColor = theme.red;

  if (type === 'feature' || type === 'added') {
    return { color: featureColor, label: 'FEATURES', order: 0 };
  }
  if (type === 'improved' || type === 'changed') {
    return { color: improvedColor, label: 'IMPROVEMENTS', order: 1 };
  }
  if (type === 'fixed') {
    return { color: fixedColor, label: 'BUG FIXES', order: 2 };
  }
  if (type === 'removed') {
    return { color: removedColor, label: 'REMOVED', order: 3 };
  }

  return { color: theme.textSubtle, label: 'OTHER', order: 99 };
}

function groupChangesByType(theme: KubdeeTheme, changes: MobileChangelogItem[]): ChangeGroup[] {
  const groups = new Map<string, MobileChangelogItem[]>();
  const orderMap = new Map<string, number>();

  for (const change of changes) {
    const config = getTypeConfig(theme, change.type);
    const existing = groups.get(config.label) || [];
    existing.push(change);
    groups.set(config.label, existing);
    orderMap.set(config.label, config.order);
  }

  return Array.from(groups.entries())
    .sort((first, second) => (orderMap.get(first[0]) ?? 99) - (orderMap.get(second[0]) ?? 99))
    .map(([label, items]) => ({ label, items }));
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MobileChangelogModal({
  visible,
  authToken,
  theme,
  versionLabel,
  onClose,
}: MobileChangelogModalProps): React.JSX.Element {
  const { height } = useWindowDimensions();
  const [releases, setReleases] = useState<MobileChangelogRelease[]>(MOBILE_CHANGELOG);
  const [isLoading, setIsLoading] = useState(false);
  const latestVersion = releases[0]?.version || versionLabel.replace(/^v/i, '');
  const timelineLineColor = theme.isDark ? '#374151' : '#e5e7eb';
  const oldDotBackground = theme.isDark ? '#1f2937' : '#ffffff';
  const oldDotBorder = theme.isDark ? '#4b5563' : '#d1d5db';

  useEffect(() => {
    if (!visible) {
      return;
    }

    let active = true;
    Promise.resolve()
      .then(() => {
        if (active) {
          setIsLoading(true);
        }
        return loadMobileChangelog(authToken);
      })
      .then((result) => {
        if (active) {
          setReleases(result.releases);
        }
      })
      .catch(() => {
        if (active) {
          setReleases(MOBILE_CHANGELOG);
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [authToken, visible]);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View className="flex-1 items-center justify-center bg-black/60 px-4">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View
          className="w-full max-w-[512px] overflow-hidden rounded-[12px] border border-kd-border bg-kd-panel"
          style={{
            shadowColor: theme.shadow,
            shadowOffset: { width: 0, height: 18 },
            shadowOpacity: 0.24,
            shadowRadius: 28,
            elevation: 18,
            maxHeight: Math.max(420, Math.floor(height * 0.84)),
          }}
        >
          <View className="px-5 pb-4 pt-5">
            <View className="flex-row items-center justify-between gap-3">
              <View className="min-w-0 flex-1">
                <View className="flex-row flex-wrap items-center gap-2.5">
                  <Text className="text-base font-semibold text-kd-text">
                    Kubdee AI — What&apos;s New
                  </Text>
                  <View className="rounded-full bg-[#111827] px-2 py-0.5 dark:bg-white">
                    <Text className="text-[10px] font-semibold text-white dark:text-[#111827]">
                      v{latestVersion}
                    </Text>
                  </View>
                </View>
                <Text className="mt-0.5 text-kd-caption text-kd-text-subtle">
                  Release notes and updates
                </Text>
              </View>
              {isLoading ? <ActivityIndicator color={theme.textSubtle} size="small" /> : null}
              <Pressable
                accessibilityLabel="ปิด changelog"
                accessibilityRole="button"
                onPress={onClose}
                className="mr-[-6px] h-8 w-8 items-center justify-center rounded-kd-lg active:bg-kd-panel-muted dark:active:bg-kd-card-muted"
              >
                <X size={16} color={theme.textSubtle} strokeWidth={2.2} />
              </Pressable>
            </View>
          </View>

          <FlatList
            data={releases}
            keyExtractor={(release) => release.version}
            renderItem={({ item: release, index: releaseIndex }) => {
              const isLatest = releaseIndex === 0;
              const isLast = releaseIndex === releases.length - 1;
              return (
                <View className="relative pl-6" style={{ paddingBottom: isLast ? 0 : 20 }}>
                  {!isLast ? (
                    <View
                      pointerEvents="none"
                      className="absolute bottom-[-20px] left-[5px] top-[18px] w-px"
                      style={{ backgroundColor: timelineLineColor }}
                    />
                  ) : null}
                  <View
                    className="absolute left-0 top-[5px] h-[11px] w-[11px] rounded-full border-2"
                    style={
                      isLatest
                        ? {
                            backgroundColor: theme.isDark ? '#ffffff' : '#111827',
                            borderColor: theme.isDark ? '#ffffff' : '#111827',
                          }
                        : {
                            backgroundColor: oldDotBackground,
                            borderColor: oldDotBorder,
                          }
                    }
                  />

                  <View className="flex-row items-baseline gap-2">
                    <Text
                      className="text-[13px] font-semibold"
                      style={{ color: isLatest ? theme.text : theme.textSubtle }}
                    >
                      {release.version}
                    </Text>
                    <Text className="text-kd-caption text-kd-text-subtle">
                      {formatDate(release.date)}
                    </Text>
                  </View>

                  {release.highlight ? (
                    <Text className="mt-0.5 text-kd-caption font-medium leading-[16px] text-kd-text-muted">
                      {release.highlight}
                    </Text>
                  ) : null}

                  <View className="mt-2 gap-2.5">
                    {groupChangesByType(theme, release.changes).map((group) => (
                      <View key={`${release.version}-${group.label}`}>
                        <Text className="text-kd-tiny font-bold uppercase text-kd-text-subtle">
                          {group.label}
                        </Text>
                        <View className="mt-1 gap-1">
                          {group.items.map((change, changeIndex) => {
                            const config = getTypeConfig(theme, change.type);
                            return (
                              <View
                                key={`${release.version}-${group.label}-${changeIndex}`}
                                className="flex-row items-start gap-2"
                              >
                                <View
                                  className="mt-[5px] h-1.5 w-1.5 flex-shrink-0 rounded-full opacity-80"
                                  style={{ backgroundColor: config.color }}
                                />
                                <Text className="min-w-0 flex-1 text-kd-caption leading-[17px] text-kd-text-muted">
                                  {change.text}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              );
            }}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingBottom: 20,
            }}
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: Math.max(340, Math.floor(height * 0.72)) }}
          />
        </View>
      </View>
    </Modal>
  );
}

import {
  Bot,
  CheckCircle2,
  Circle,
  KeyRound,
  Link,
  MonitorSmartphone,
  Play,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Square,
  StopCircle,
  Zap,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import SectionHeader from '@/components/ui/SectionHeader';
import StatusPill from '@/components/ui/StatusPill';
import { devices, scriptPresets } from '@/data/mockData';
import {
  getAccessibilityStatus,
  launchTargetApp,
  openAccessibilitySettings,
  performBack,
  swipeScreen,
  tapScreen,
} from '@/native/AccessibilityBridge';
import type { KubdeeTheme } from '@/theme/tokens';
import { radii, spacing, typography } from '@/theme/tokens';
import type { AccessibilityStatus } from '@/native/AccessibilityBridge';

interface MobileDevicesScreenProps {
  theme: KubdeeTheme;
  selectedDeviceIds: Set<string>;
  onToggleDevice: (deviceId: string) => void;
}

export default function MobileDevicesScreen({
  theme,
  selectedDeviceIds,
  onToggleDevice,
}: MobileDevicesScreenProps): React.JSX.Element {
  const [mode, setMode] = useState<'permissions' | 'devices'>('permissions');
  const [ocrFallback, setOcrFallback] = useState(true);
  const [confirmSensitive, setConfirmSensitive] = useState(true);
  const [accessibilityStatus, setAccessibilityStatus] = useState<AccessibilityStatus | null>(null);
  const [bridgeMessage, setBridgeMessage] = useState('ยังไม่ได้ทดสอบ native bridge');
  const accessibilityEnabled = accessibilityStatus?.enabled ?? false;
  const accessibilityRunning = accessibilityStatus?.running ?? false;

  const refreshStatus = useCallback(async (): Promise<void> => {
    try {
      const status = await getAccessibilityStatus();
      setAccessibilityStatus(status);
      setBridgeMessage(
        status.enabled
          ? status.running
            ? 'Accessibility service เปิดและกำลังทำงาน'
            : 'เปิดสิทธิ์แล้ว รอ Android bind service'
          : 'ยังไม่ได้เปิด Accessibility service'
      );
    } catch (error) {
      setBridgeMessage(`เช็คสถานะไม่สำเร็จ: ${String(error)}`);
      setAccessibilityStatus(null);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshStatus();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [refreshStatus]);

  const runBridgeAction = async (action: 'launch' | 'tap' | 'swipe' | 'back'): Promise<void> => {
    try {
      if (action === 'launch') {
        const launched = await launchTargetApp();
        setBridgeMessage(launched ? 'เปิด Shopee สำเร็จ' : 'เปิด Shopee ไม่สำเร็จ');
        return;
      }

      if (action === 'tap') {
        const tapped = await tapScreen(540, 1200);
        setBridgeMessage(tapped ? 'ส่ง gesture tap สำเร็จ' : 'ส่ง gesture tap ไม่สำเร็จ');
        return;
      }

      if (action === 'swipe') {
        const swiped = await swipeScreen(540, 1700, 540, 720, 520);
        setBridgeMessage(swiped ? 'ส่ง gesture swipe สำเร็จ' : 'ส่ง gesture swipe ไม่สำเร็จ');
        return;
      }

      const backed = await performBack();
      setBridgeMessage(backed ? 'ส่งคำสั่ง Back สำเร็จ' : 'ส่งคำสั่ง Back ไม่สำเร็จ');
    } catch (error) {
      setBridgeMessage(String(error));
    } finally {
      refreshStatus();
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: selectedDeviceIds.size > 0 ? 74 : 12 }]}
      >
        <View style={[styles.notice, { backgroundColor: theme.amberSoft, borderColor: theme.amber }]}>
          <View style={styles.noticeTitle}>
            <ShieldCheck size={12} color={theme.amber} strokeWidth={2.2} />
            <Text style={[styles.noticeText, { color: theme.amber }]}>
              ต้องเปิด Accessibility ก่อนเริ่ม automate
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={openAccessibilitySettings}
            style={({ pressed }) => [
              styles.noticeButton,
              { backgroundColor: theme.amber, opacity: pressed ? 0.75 : 1 },
            ]}
          >
            <Text style={styles.noticeButtonText}>เปิดตั้งค่า</Text>
          </Pressable>
        </View>

        <View style={[styles.underlineTabs, { borderBottomColor: theme.border }]}>
          <UnderlineTab
            active={mode === 'permissions'}
            icon={KeyRound}
            label="สิทธิ์"
            theme={theme}
            onPress={() => setMode('permissions')}
          />
          <UnderlineTab
            active={mode === 'devices'}
            icon={Link}
            label="เครื่อง"
            theme={theme}
            onPress={() => setMode('devices')}
          />
        </View>

        {mode === 'permissions' ? (
          <View style={styles.stack}>
            <PermissionRow
              active={accessibilityEnabled}
              description={accessibilityRunning ? 'service bind แล้ว พร้อมรับคำสั่ง gesture' : 'ควบคุมการแตะ เลื่อน และพิมพ์ใน Shopee'}
              label="Accessibility Service"
              theme={theme}
              right={
                <Pressable accessibilityRole="button" onPress={refreshStatus} style={styles.refreshButton}>
                  <RefreshCw size={13} color={theme.textSubtle} />
                </Pressable>
              }
            />
            <PermissionRow
              active={ocrFallback}
              description="ใช้เมื่อ Shopee ไม่ส่ง UI tree ที่อ่านได้"
              label="OCR fallback"
              theme={theme}
              right={
                <Switch
                  value={ocrFallback}
                  onValueChange={setOcrFallback}
                  trackColor={{ false: theme.borderStrong, true: theme.cyanSoft }}
                  thumbColor={ocrFallback ? theme.cyan : theme.textSubtle}
                />
              }
            />
            <PermissionRow
              active={confirmSensitive}
              description="หยุดรอ user ก่อน checkout, login, payment"
              label="User confirmation"
              theme={theme}
              right={
                <Switch
                  value={confirmSensitive}
                  onValueChange={setConfirmSensitive}
                  trackColor={{ false: theme.borderStrong, true: theme.emeraldSoft }}
                  thumbColor={confirmSensitive ? theme.emerald : theme.textSubtle}
                />
              }
            />
            <View style={[styles.bridgeCard, { backgroundColor: theme.cardMuted, borderColor: theme.border }]}>
              <View style={styles.bridgeHeader}>
                <StatusPill
                  backgroundColor={accessibilityRunning ? theme.emeraldSoft : theme.amberSoft}
                  color={accessibilityRunning ? theme.emerald : theme.amber}
                  icon={accessibilityRunning ? CheckCircle2 : ShieldCheck}
                  label={accessibilityRunning ? 'RUNNING' : 'WAITING'}
                />
                <Text style={[styles.bridgeTitle, { color: theme.text }]}>Native bridge test</Text>
              </View>
              <Text style={[styles.bridgeMessage, { color: theme.textSubtle }]} numberOfLines={2}>
                {bridgeMessage}
              </Text>
              <View style={styles.bridgeActions}>
                <BridgeButton
                  color={theme.orange}
                  disabled={false}
                  label="เปิด Shopee"
                  theme={theme}
                  onPress={() => runBridgeAction('launch')}
                />
                <BridgeButton
                  color={theme.cyan}
                  disabled={!accessibilityRunning}
                  label="Tap"
                  theme={theme}
                  onPress={() => runBridgeAction('tap')}
                />
                <BridgeButton
                  color={theme.blue}
                  disabled={!accessibilityRunning}
                  label="Swipe"
                  theme={theme}
                  onPress={() => runBridgeAction('swipe')}
                />
                <BridgeButton
                  color={theme.red}
                  disabled={!accessibilityRunning}
                  label="Back"
                  theme={theme}
                  onPress={() => runBridgeAction('back')}
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.stack}>
            <SectionHeader
              icon={Smartphone}
              theme={theme}
              title={`อุปกรณ์ (${devices.length})`}
              right={<RefreshCw size={11} color={theme.textSubtle} />}
            />
            {devices.map((device) => {
              const selected = selectedDeviceIds.has(device.id);
              const ready = device.status === 'ready' || accessibilityEnabled;

              return (
                <Pressable
                  accessibilityRole="button"
                  key={device.id}
                  onPress={() => onToggleDevice(device.id)}
                  style={({ pressed }) => [
                    styles.deviceCard,
                    {
                      backgroundColor: theme.cardMuted,
                      borderColor: selected ? theme.emerald : theme.border,
                      opacity: pressed ? 0.78 : 1,
                    },
                  ]}
                >
                  {selected ? (
                    <CheckCircle2 size={16} color={theme.emerald} strokeWidth={2.4} />
                  ) : (
                    <Circle size={16} color={theme.textSubtle} strokeWidth={2.2} />
                  )}
                  <View style={styles.deviceBody}>
                    <View style={styles.deviceNameRow}>
                      <Text style={[styles.deviceName, { color: theme.text }]} numberOfLines={1}>
                        {device.name}
                      </Text>
                      <StatusPill
                        backgroundColor={ready ? theme.emeraldSoft : theme.amberSoft}
                        color={ready ? theme.emerald : theme.amber}
                        icon={ready ? CheckCircle2 : ShieldCheck}
                        label={ready ? device.connection.toUpperCase() : 'PERMISSION'}
                      />
                    </View>
                    <Text style={[styles.deviceMeta, { color: theme.textSubtle }]} numberOfLines={1}>
                      {device.serial} | Android {device.androidVersion}
                    </Text>
                    <Text style={[styles.deviceProfile, { color: theme.textMuted }]} numberOfLines={1}>
                      โปรไฟล์: {device.profileName}
                    </Text>
                  </View>
                  <MonitorSmartphone size={15} color={ready ? theme.emerald : theme.textSubtle} />
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.stack}>
          <SectionHeader icon={Bot} theme={theme} title="Scripts" />
          {scriptPresets.map((script) => {
            const color =
              script.accent === 'orange'
                ? theme.orange
                : script.accent === 'cyan'
                  ? theme.cyan
                  : theme.emerald;
            const backgroundColor =
              script.accent === 'orange'
                ? theme.orangeSoft
                : script.accent === 'cyan'
                  ? theme.cyanSoft
                  : theme.emeraldSoft;

            return (
              <View
                key={script.id}
                style={[styles.scriptCard, { backgroundColor: theme.card, borderColor: theme.border }]}
              >
                <View style={[styles.scriptIcon, { backgroundColor }]}>
                  <Bot size={14} color={color} />
                </View>
                <View style={styles.scriptBody}>
                  <Text style={[styles.scriptTitle, { color: theme.text }]} numberOfLines={1}>
                    {script.title}
                  </Text>
                  <Text style={[styles.scriptDescription, { color: theme.textSubtle }]} numberOfLines={2}>
                    {script.description}
                  </Text>
                </View>
                <Play size={15} color={color} fill={color} />
              </View>
            );
          })}
        </View>
      </ScrollView>

      {selectedDeviceIds.size > 0 ? (
        <View style={[styles.bottomBar, { backgroundColor: theme.panel, borderTopColor: theme.border }]}>
          <Text style={[styles.bottomCount, { color: theme.textMuted }]}>{selectedDeviceIds.size} เครื่อง</Text>
          <View style={styles.bottomSpacer} />
          <FooterAction icon={Zap} label="เริ่มงาน" color={theme.emerald} backgroundColor={theme.emeraldSoft} />
          <FooterAction icon={StopCircle} label="หยุด" color={theme.red} backgroundColor={theme.redSoft} />
        </View>
      ) : null}
    </View>
  );
}

function UnderlineTab({
  active,
  icon: Icon,
  label,
  theme,
  onPress,
}: {
  active: boolean;
  icon: typeof KeyRound;
  label: string;
  theme: KubdeeTheme;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.underlineTab, { borderBottomColor: active ? theme.blue : 'transparent' }]}
    >
      <Icon size={12} color={active ? theme.blue : theme.textSubtle} />
      <Text style={[styles.underlineLabel, { color: active ? theme.blue : theme.textSubtle }]}>{label}</Text>
    </Pressable>
  );
}

function PermissionRow({
  active,
  description,
  label,
  theme,
  right,
}: {
  active: boolean;
  description: string;
  label: string;
  theme: KubdeeTheme;
  right?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={[styles.permissionRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <StatusPill
        backgroundColor={active ? theme.emeraldSoft : theme.redSoft}
        color={active ? theme.emerald : theme.red}
        icon={active ? CheckCircle2 : Square}
        label={active ? 'ON' : 'OFF'}
      />
      <View style={styles.permissionBody}>
        <Text style={[styles.permissionLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.permissionDescription, { color: theme.textSubtle }]} numberOfLines={2}>
          {description}
        </Text>
      </View>
      {right}
    </View>
  );
}

function BridgeButton({
  color,
  disabled,
  label,
  theme,
  onPress,
}: {
  color: string;
  disabled: boolean;
  label: string;
  theme: KubdeeTheme;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.bridgeButton,
        {
          backgroundColor: theme.input,
          borderColor: color,
          opacity: disabled ? 0.42 : pressed ? 0.72 : 1,
        },
      ]}
    >
      <Text style={[styles.bridgeButtonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function FooterAction({
  icon: Icon,
  label,
  color,
  backgroundColor,
}: {
  icon: typeof Zap;
  label: string;
  color: string;
  backgroundColor: string;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.footerAction, { backgroundColor, opacity: pressed ? 0.72 : 1 }]}
    >
      <Icon size={12} color={color} strokeWidth={2.2} />
      <Text style={[styles.footerActionLabel, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    alignItems: 'center',
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    gap: 8,
    left: 0,
    paddingHorizontal: 10,
    paddingVertical: 9,
    position: 'absolute',
    right: 0,
  },
  bottomCount: {
    fontSize: typography.caption,
    fontWeight: '800',
  },
  bottomSpacer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  bridgeActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  bridgeButton: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flex: 1,
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  bridgeButtonText: {
    fontSize: typography.caption,
    fontWeight: '900',
  },
  bridgeCard: {
    borderRadius: radii.md,
    borderWidth: 1,
    padding: 10,
  },
  bridgeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  bridgeMessage: {
    fontSize: typography.micro,
    lineHeight: 14,
    marginTop: 6,
  },
  bridgeTitle: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: '900',
  },
  deviceBody: {
    flex: 1,
    minWidth: 0,
  },
  deviceCard: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 10,
  },
  deviceMeta: {
    fontSize: typography.micro,
    marginTop: 2,
  },
  deviceName: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: '800',
  },
  deviceNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  deviceProfile: {
    fontSize: typography.micro,
    marginTop: 5,
  },
  footerAction: {
    alignItems: 'center',
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: 5,
    minHeight: 28,
    paddingHorizontal: 10,
  },
  footerActionLabel: {
    fontSize: typography.caption,
    fontWeight: '800',
  },
  notice: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 9,
  },
  noticeButton: {
    borderRadius: radii.md,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  noticeButtonText: {
    color: '#ffffff',
    fontSize: typography.micro,
    fontWeight: '800',
  },
  noticeText: {
    flex: 1,
    fontSize: typography.caption,
    fontWeight: '800',
  },
  noticeTitle: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
  },
  permissionBody: {
    flex: 1,
    minWidth: 0,
  },
  permissionDescription: {
    fontSize: typography.micro,
    lineHeight: 14,
    marginTop: 2,
  },
  permissionLabel: {
    fontSize: typography.body,
    fontWeight: '800',
  },
  permissionRow: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 58,
    padding: 10,
  },
  refreshButton: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  scriptBody: {
    flex: 1,
    minWidth: 0,
  },
  scriptCard: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 10,
  },
  scriptDescription: {
    fontSize: typography.micro,
    lineHeight: 14,
    marginTop: 2,
  },
  scriptIcon: {
    alignItems: 'center',
    borderRadius: radii.md,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  scriptTitle: {
    fontSize: typography.body,
    fontWeight: '800',
  },
  scrollContent: {
    gap: spacing.md,
    padding: spacing.md,
  },
  stack: {
    gap: spacing.sm,
  },
  underlineLabel: {
    fontSize: typography.caption,
    fontWeight: '800',
  },
  underlineTab: {
    alignItems: 'center',
    borderBottomWidth: 2,
    flex: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    marginBottom: -1,
    paddingBottom: 7,
  },
  underlineTabs: {
    borderBottomWidth: 1,
    flexDirection: 'row',
  },
});

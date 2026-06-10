import {
  Bot,
  CheckCircle2,
  Circle,
  KeyRound,
  Link,
  MonitorSmartphone,
  Play,
  RefreshCw,
  Settings,
  ShieldCheck,
  Smartphone,
  Square,
  StopCircle,
  Zap,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, Switch, View } from 'react-native';

import Text from '@/components/ui/KubdeeText';
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

  const openAccessibilitySetup = useCallback(async (): Promise<void> => {
    try {
      await openAccessibilitySettings();
      setBridgeMessage('เปิดหน้า Accessibility settings แล้ว');
    } catch (error) {
      setBridgeMessage(`เปิดหน้า settings ไม่สำเร็จ: ${String(error)}`);
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
    <View className="flex-1">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName={`gap-2 p-2 ${selectedDeviceIds.size > 0 ? 'pb-[74px]' : 'pb-3'}`}
      >
        {!accessibilityEnabled ? (
          <View className="flex-row items-center gap-2 rounded-kd-md border border-kd-amber bg-kd-amber-soft p-[9px]">
            <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
              <ShieldCheck size={12} color={theme.amber} strokeWidth={2.2} />
              <Text className="flex-1 text-kd-caption font-extrabold text-kd-amber">
                ต้องเปิด Accessibility ก่อนเริ่ม automate
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={openAccessibilitySetup}
              className="active:opacity-75"
            >
              <View className="rounded-kd-md border border-kd-amber bg-kd-card px-[9px] py-1.5">
                <Text className="text-kd-micro font-extrabold text-kd-amber">เปิดตั้งค่า</Text>
              </View>
            </Pressable>
          </View>
        ) : null}

        <View className="flex-row border-b border-kd-border">
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
          <View className="gap-1.5">
            <PermissionRow
              active={accessibilityEnabled}
              description={accessibilityRunning ? 'service bind แล้ว พร้อมรับคำสั่ง gesture' : 'ควบคุมการแตะ เลื่อน และพิมพ์ใน Shopee'}
              label="Accessibility Service (การช่วยเหลือการเข้าถึง)"
              theme={theme}
              right={
                <Pressable
                  accessibilityRole="button"
                  onPress={refreshStatus}
                  className="h-[30px] w-[30px] items-center justify-center rounded-kd-md border border-kd-border bg-kd-input active:opacity-70"
                >
                  <RefreshCw size={13} color={theme.textSubtle} />
                </Pressable>
              }
              action={
                <Pressable
                  accessibilityRole="button"
                  onPress={openAccessibilitySetup}
                  className="active:opacity-75"
                >
                  <View
                    className={`min-h-[34px] flex-row items-center justify-center gap-1.5 rounded-kd-md border px-2.5 ${
                      accessibilityEnabled ? 'border-kd-blue bg-kd-input' : 'border-kd-amber bg-kd-amber-soft'
                    }`}
                  >
                    <Settings
                      size={13}
                      color={accessibilityEnabled ? theme.blue : theme.amber}
                      strokeWidth={2.3}
                    />
                    <Text className={`text-kd-caption font-black ${accessibilityEnabled ? 'text-kd-blue' : 'text-kd-amber'}`}>
                      เปิดหน้า Accessibility Settings
                    </Text>
                  </View>
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
            <View className="rounded-kd-md border border-kd-border bg-kd-card-muted p-2.5">
              <View className="flex-row items-center gap-[7px]">
                <StatusPill
                  backgroundColor={accessibilityRunning ? theme.emeraldSoft : theme.amberSoft}
                  color={accessibilityRunning ? theme.emerald : theme.amber}
                  icon={accessibilityRunning ? CheckCircle2 : ShieldCheck}
                  label={accessibilityRunning ? 'RUNNING' : 'WAITING'}
                />
                <Text className="flex-1 text-kd-body font-black text-kd-text">Native bridge test</Text>
              </View>
              <Text className="mt-1.5 text-kd-micro leading-[14px] text-kd-text-subtle" numberOfLines={2}>
                {bridgeMessage}
              </Text>
              <View className="mt-2 flex-row gap-1.5">
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
          <View className="gap-1.5">
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
                  className={`flex-row items-center gap-2 rounded-kd-md border bg-kd-card-muted p-2.5 active:opacity-80 ${
                    selected ? 'border-kd-emerald' : 'border-kd-border'
                  }`}
                >
                  {selected ? (
                    <CheckCircle2 size={16} color={theme.emerald} strokeWidth={2.4} />
                  ) : (
                    <Circle size={16} color={theme.textSubtle} strokeWidth={2.2} />
                  )}
                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center gap-1.5">
                      <Text className="flex-1 text-kd-body font-extrabold text-kd-text" numberOfLines={1}>
                        {device.name}
                      </Text>
                      <StatusPill
                        backgroundColor={ready ? theme.emeraldSoft : theme.amberSoft}
                        color={ready ? theme.emerald : theme.amber}
                        icon={ready ? CheckCircle2 : ShieldCheck}
                        label={ready ? device.connection.toUpperCase() : 'PERMISSION'}
                      />
                    </View>
                    <Text className="mt-0.5 text-kd-micro text-kd-text-subtle" numberOfLines={1}>
                      {device.serial} | Android {device.androidVersion}
                    </Text>
                    <Text className="mt-[5px] text-kd-micro text-kd-text-muted" numberOfLines={1}>
                      โปรไฟล์: {device.profileName}
                    </Text>
                  </View>
                  <MonitorSmartphone size={15} color={ready ? theme.emerald : theme.textSubtle} />
                </Pressable>
              );
            })}
          </View>
        )}

        <View className="gap-1.5">
          <SectionHeader icon={Bot} theme={theme} title="Scripts" />
          {scriptPresets.map((script) => {
            const color =
              script.accent === 'orange'
                ? theme.orange
                : script.accent === 'cyan'
                  ? theme.cyan
                  : theme.emerald;
            const iconBackgroundClass =
              script.accent === 'orange'
                ? 'bg-kd-orange-soft'
                : script.accent === 'cyan'
                  ? 'bg-kd-cyan-soft'
                  : 'bg-kd-emerald-soft';

            return (
              <View
                key={script.id}
                className="flex-row items-center gap-2 rounded-kd-md border border-kd-border bg-kd-card p-2.5"
              >
                <View className={`h-[30px] w-[30px] items-center justify-center rounded-kd-md ${iconBackgroundClass}`}>
                  <Bot size={14} color={color} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-kd-body font-extrabold text-kd-text" numberOfLines={1}>
                    {script.title}
                  </Text>
                  <Text className="mt-0.5 text-kd-micro leading-[14px] text-kd-text-subtle" numberOfLines={2}>
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
        <View className="absolute bottom-0 left-0 right-0 flex-row items-center gap-2 border-t border-kd-border bg-kd-panel px-2.5 py-[9px]">
          <Text className="text-kd-caption font-extrabold text-kd-text-muted">{selectedDeviceIds.size} เครื่อง</Text>
          <View className="flex-1" />
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
      className={`-mb-px flex-1 flex-row items-center justify-center gap-[5px] border-b-2 pb-[7px] ${
        active ? 'border-b-kd-blue' : 'border-b-transparent'
      }`}
    >
      <Icon size={12} color={active ? theme.blue : theme.textSubtle} />
      <Text className={`text-kd-caption font-extrabold ${active ? 'text-kd-blue' : 'text-kd-text-subtle'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function PermissionRow({
  action,
  active,
  description,
  label,
  theme,
  right,
}: {
  action?: React.ReactNode;
  active: boolean;
  description: string;
  label: string;
  theme: KubdeeTheme;
  right?: React.ReactNode;
}): React.JSX.Element {
  return (
    <View className="min-h-[58px] gap-2 rounded-kd-md border border-kd-border bg-kd-card p-2.5">
      <View className="flex-row items-center gap-2">
        <StatusPill
          backgroundColor={active ? theme.emeraldSoft : theme.redSoft}
          color={active ? theme.emerald : theme.red}
          icon={active ? CheckCircle2 : Square}
          label={active ? 'ON' : 'OFF'}
        />
        <View className="min-w-0 flex-1">
          <Text className="text-kd-body font-extrabold text-kd-text">{label}</Text>
          <Text className="mt-0.5 text-kd-micro leading-[14px] text-kd-text-subtle" numberOfLines={2}>
            {description}
          </Text>
        </View>
        {right}
      </View>
      {action}
    </View>
  );
}

function BridgeButton({
  color,
  disabled,
  label,
  theme: _theme,
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
      className="min-h-[30px] flex-1 items-center justify-center rounded-kd-md border bg-kd-input px-2 active:opacity-70 disabled:opacity-40"
      style={{ borderColor: color }}
    >
      <Text className="text-kd-caption font-black" style={{ color }}>{label}</Text>
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
      className="min-h-7 flex-row items-center gap-[5px] rounded-kd-md px-2.5 active:opacity-70"
      style={{ backgroundColor }}
    >
      <Icon size={12} color={color} strokeWidth={2.2} />
      <Text className="text-kd-caption font-extrabold" style={{ color }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

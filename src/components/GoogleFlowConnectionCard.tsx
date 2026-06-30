import { ActivityIndicator, Image, Modal, TextInput, TouchableOpacity, View } from 'react-native';
import { CheckCircle2, RefreshCw, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GoogleLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import FlowWebView, {
  type FlowAccount,
  type FlowConnectionState,
  type FlowWebViewHandle,
} from '@/flow/FlowWebView';
import {
  loadFlowAccount,
  loadFlowConnectionState,
  saveFlowAccount,
  saveFlowConnectionState,
} from '@/flow/flowConnection';
import type { KubdeeTheme } from '@/theme/tokens';

interface GoogleFlowConnectionCardProps {
  theme: KubdeeTheme;
}

export default function GoogleFlowConnectionCard({ theme }: GoogleFlowConnectionCardProps): React.JSX.Element {
  const [flowOpen, setFlowOpen] = useState(false);
  const [flowState, setFlowState] = useState<FlowConnectionState | null>(null);
  const [flowAccount, setFlowAccount] = useState<FlowAccount | null>(null);
  const [flowReloadKey, setFlowReloadKey] = useState(0);
  const flowRef = useRef<FlowWebViewHandle>(null);
  const [flowPrompt, setFlowPrompt] = useState(
    'a cinematic shot of a fluffy cat walking on a beach at sunset, slow motion'
  );
  const [flowLogs, setFlowLogs] = useState<string[]>([]);
  const [flowRunning, setFlowRunning] = useState(false);
  const flowConnected = flowState === 'connected';

  useEffect(() => {
    void loadFlowConnectionState().then((stored) => {
      if (stored) {
        setFlowState(stored);
      }
    });
    void loadFlowAccount().then((account) => {
      if (account) {
        setFlowAccount(account);
      }
    });
  }, []);

  const handleFlowStatus = (state: FlowConnectionState): void => {
    setFlowState(state);
    void saveFlowConnectionState(state);
  };

  const handleFlowAccount = (account: FlowAccount): void => {
    setFlowAccount((prev) => {
      const merged: FlowAccount = {
        email: account.email || prev?.email,
        name: account.name || prev?.name,
        photo: account.photo || prev?.photo,
      };
      void saveFlowAccount(merged);
      return merged;
    });
  };

  const appendFlowLog = (message: string): void => {
    setFlowLogs((prev) => [...prev.slice(-24), message]);
  };

  const runFlowTest = async (): Promise<void> => {
    if (flowRunning) return;
    const prompt = flowPrompt.trim();
    if (!prompt) {
      appendFlowLog('ใส่ prompt ก่อน');
      return;
    }
    setFlowRunning(true);
    setFlowLogs([]);
    try {
      appendFlowLog('New project...');
      const np = await flowRef.current?.runAction('newProject', {}, 25000);
      if (!np?.ok) {
        appendFlowLog(`New project ไม่สำเร็จ: ${np?.error ?? 'no handle'}`);
        return;
      }
      appendFlowLog(np.result?.already ? 'อยู่ในโปรเจกต์อยู่แล้ว' : 'เข้าโปรเจกต์แล้ว');

      const videoModel = 'veo_31_fast';
      appendFlowLog(`ตั้งค่าโหมดวิดีโอ (${videoModel})...`);
      const cfg = await flowRef.current?.runAction(
        'configurePopper',
        { targetMode: 'video', videoModel },
        60000
      );
      const cfgRes = cfg?.result as { success?: boolean; error?: string } | undefined;
      if (cfg?.ok && cfgRes?.success) {
        appendFlowLog('ตั้งค่าโหมดวิดีโอ + model แล้ว');
      } else {
        appendFlowLog(`configurePopper: ${cfgRes?.error ?? cfg?.error ?? 'ไม่สำเร็จ'} - ทำต่อ`);
      }

      appendFlowLog('กรอก prompt...');
      const fp = await flowRef.current?.runAction('fillPrompt', { prompt }, 30000);
      if (!fp?.ok) {
        appendFlowLog(`fillPrompt ไม่สำเร็จ: ${fp?.error ?? 'no handle'}`);
        return;
      }
      appendFlowLog(`กรอก prompt แล้ว (${String(fp.result?.type ?? '')})`);

      let baselineUrls: string[] = [];
      const snap = await flowRef.current?.runAction('videoSnapshot', {}, 15000);
      const snapRes = snap?.result as { videoUrls?: string[]; tileCount?: number } | undefined;
      if (snap?.ok && snapRes) {
        baselineUrls = snapRes.videoUrls ?? [];
        appendFlowLog(`ก่อนสร้าง: วิดีโอเดิม ${baselineUrls.length} · tiles ${snapRes.tileCount ?? 0}`);
      }

      appendFlowLog('กด submit...');
      const sb = await flowRef.current?.runAction('submit', {}, 45000);
      if (!sb?.ok) {
        appendFlowLog(`submit ไม่สำเร็จ: ${sb?.error ?? 'no handle'}`);
        return;
      }
      const cleared = sb.result?.clearedPrompt ? ', prompt เคลียร์' : '';
      appendFlowLog(`submit แล้ว (${String(sb.result?.method ?? '')}${cleared})`);

      appendFlowLog('รอผลวิดีโอ (สูงสุด 5 นาที)...');
      const startedAt = Date.now();
      let resultUrls: string[] = [];
      let allFailed = false;
      let failConfirm = 0;
      let doneConfirm = 0;
      while (Date.now() - startedAt < 300000) {
        await new Promise((r) => setTimeout(r, 4000));
        const vr = await flowRef.current?.runAction(
          'videoResults',
          { count: 4, ignoreUrls: baselineUrls },
          20000
        );
        const vrr = vr?.result as
          | {
              videos?: string[];
              successCount?: number;
              failedCount?: number;
              generatingCount?: number;
              queuedCount?: number;
              tilesFound?: number;
              progress?: number | null;
            }
          | undefined;
        if (!vr?.ok || !vrr) continue;
        const generating = vrr.generatingCount ?? 0;
        const queued = vrr.queuedCount ?? 0;
        const failed = vrr.failedCount ?? 0;
        const okCount = vrr.successCount ?? 0;
        const videos = vrr.videos ?? [];
        const pct = vrr.progress;
        appendFlowLog(
          `... ${pct != null ? `${pct}% · ` : ''}gen ${generating} · queue ${queued} · ok ${okCount} · fail ${failed}`
        );
        if (generating > 0 || queued > 0 || pct != null || (vrr.tilesFound ?? 0) === 0) {
          failConfirm = 0;
          doneConfirm = 0;
          continue;
        }
        if (videos.length > 0) {
          doneConfirm += 1;
          if (doneConfirm >= 2) {
            resultUrls = videos;
            break;
          }
        } else if (failed > 0) {
          failConfirm += 1;
          if (failConfirm >= 3) {
            allFailed = true;
            break;
          }
        } else {
          failConfirm = 0;
          doneConfirm = 0;
        }
      }
      if (resultUrls.length > 0) {
        appendFlowLog(`เสร็จ ${resultUrls.length} วิดีโอ ${resultUrls[0].slice(0, 40)}...`);
      } else if (allFailed) {
        appendFlowLog('การสร้างล้มเหลว (Failed)');
      } else {
        appendFlowLog('หมดเวลารอ ยังสร้างไม่เสร็จ');
      }
    } catch (error) {
      appendFlowLog(`error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setFlowRunning(false);
    }
  };

  return (
    <>
      <View className={`gap-2 rounded-kd-xl border p-2 ${flowConnected ? 'border-kd-border bg-kd-panel' : 'border-kd-orange bg-kd-orange-soft'}`}>
        <View className="flex-row items-center gap-2">
          {flowConnected && flowAccount?.photo ? (
            <Image source={{ uri: flowAccount.photo }} className="h-[38px] w-[38px] rounded-kd-xl" />
          ) : (
            <View className="h-[38px] w-[38px] items-center justify-center rounded-kd-xl bg-white dark:bg-kd-card-muted">
              <GoogleLogo size={20} />
            </View>
          )}
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
              Google Flow
            </Text>
            <Text numberOfLines={1} className="mt-px text-kd-micro font-medium text-kd-text-subtle">
              {flowConnected
                ? flowAccount?.email || flowAccount?.name || 'เชื่อมต่อพร้อมใช้งาน'
                : 'ยังไม่เชื่อม — เข้าสู่ระบบ Google ก่อนเริ่ม Auto'}
            </Text>
          </View>
          <View
            className={`shrink-0 rounded-kd-md border px-2 py-1 ${
              flowConnected
                ? 'border-kd-emerald/40 bg-kd-emerald/10 dark:bg-kd-emerald/15'
                : 'border-kd-orange bg-white dark:bg-kd-card-muted'
            }`}
          >
            <Text className={`text-kd-tiny font-semibold ${flowConnected ? 'text-kd-emerald' : 'text-kd-orange'}`}>
              {flowConnected ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อม'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.82}
          onPress={() => {
            setFlowReloadKey((key) => key + 1);
            setFlowOpen(true);
          }}
          className={`h-[34px] flex-row items-center justify-center gap-1.5 rounded-kd-lg border ${
            flowConnected ? 'border-kd-border bg-kd-panel' : 'border-transparent bg-kd-orange'
          }`}
        >
          {flowConnected ? <CheckCircle2 size={13} color={theme.textMuted} strokeWidth={2.2} /> : null}
          <Text className={`text-kd-caption font-semibold ${flowConnected ? 'text-kd-text-muted' : 'text-white'}`} numberOfLines={1}>
            {flowConnected ? 'จัดการการเชื่อมต่อ' : 'เชื่อมต่อ / เข้าสู่ระบบ Google Flow'}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal animationType="slide" visible={flowOpen} onRequestClose={() => setFlowOpen(false)}>
        <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-kd-screen">
          <View className="flex-row items-center gap-2 border-b border-kd-border bg-kd-panel px-3 py-2">
            <GoogleLogo size={16} />
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
                Google Flow
              </Text>
              <Text numberOfLines={1} className="text-kd-micro font-medium text-kd-text-subtle">
                {flowState === 'connected'
                  ? 'เชื่อมต่อแล้ว — login ครั้งเดียวใช้ได้ตลอด'
                  : flowState === 'signin'
                    ? 'กำลังเข้าสู่ระบบ Google...'
                    : 'เข้าสู่ระบบ Google เพื่อเชื่อมต่อ'}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="โหลดใหม่"
              accessibilityRole="button"
              activeOpacity={0.7}
              onPress={() => setFlowReloadKey((key) => key + 1)}
              className="h-8 w-8 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-panel"
            >
              <RefreshCw size={15} color={theme.textMuted} strokeWidth={2.2} />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="ปิด"
              accessibilityRole="button"
              activeOpacity={0.7}
              onPress={() => setFlowOpen(false)}
              className="h-8 w-8 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-panel"
            >
              <X size={16} color={theme.textSubtle} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
          <View className="border-b border-kd-border bg-kd-panel px-3 py-2">
            <View className="flex-row items-end gap-2">
              <TextInput
                value={flowPrompt}
                onChangeText={setFlowPrompt}
                placeholder="prompt สำหรับทดสอบ"
                placeholderTextColor={theme.textMuted}
                multiline
                editable={!flowRunning}
                className="max-h-20 min-h-[40px] flex-1 rounded-kd-lg border border-kd-border bg-kd-card px-3 py-2 text-kd-body text-kd-text"
              />
              <TouchableOpacity
                accessibilityLabel="รันทดสอบ automation"
                accessibilityRole="button"
                activeOpacity={0.8}
                disabled={flowRunning}
                onPress={() => void runFlowTest()}
                className={`h-10 min-w-[64px] flex-row items-center justify-center gap-1.5 rounded-kd-lg px-3 ${
                  flowRunning ? 'bg-kd-border' : 'bg-kd-orange'
                }`}
              >
                {flowRunning ? (
                  <ActivityIndicator size="small" color={theme.textMuted} />
                ) : (
                  <Text className="text-kd-body font-semibold text-white">รัน</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
          <View className="relative flex-1">
            <FlowWebView
              key={flowReloadKey}
              ref={flowRef}
              backgroundColor={theme.screen}
              onStatusChange={handleFlowStatus}
              onAccount={handleFlowAccount}
            />
            {flowLogs.length > 0 ? (
              <View
                pointerEvents="none"
                style={{ backgroundColor: 'rgba(0,0,0,0.62)' }}
                className="absolute inset-x-2 top-2 rounded-kd-lg px-3 py-2"
              >
                {flowLogs.slice(-8).map((line, idx) => (
                  <Text key={idx} numberOfLines={1} className="text-kd-micro leading-4 text-white">
                    {line}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

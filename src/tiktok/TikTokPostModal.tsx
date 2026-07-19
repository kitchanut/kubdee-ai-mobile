import { Dimensions, Modal, PixelRatio, Pressable, StyleSheet, View } from 'react-native';
import { Square, X } from 'lucide-react-native';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

import type { OverlayLogLine } from '@/autopilot/google-flow-runner/runnerBasics';
import {
  formatOverlayDuration,
  formatOverlayTime,
  getOverlayLogMessageColor,
  getOverlayLogMessageLineCount,
} from '@/autopilot/google-flow-runner/runnerOverlay';
import { TikTokLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import {
  clearTikTokWebViewUpload,
  prepareTikTokWebViewUpload,
  pressImeEnter,
  tapScreen,
} from '@/native/AccessibilityBridge';
import { DESKTOP_CHROME_UA, DESKTOP_ENV_SPOOF } from '@/tiktok/desktopSpoof';
import { buildTikTokPostScript } from '@/tiktok/tiktokPostScript';
import type {
  TikTokPostAction,
  TikTokPostScheduleInput,
  TikTokPostSoundInput,
  TikTokPostVideoInput,
} from '@/tiktok/tiktokPostScript';
import {
  isProfileLoggedIn,
  restoreProfileCookies,
  snapshotProfileCookies,
} from '@/tiktok/tiktokCookieStore';
import { TIKTOK_STORAGE_CLEAR_BEFORE, TIKTOK_STORAGE_RESET_URL } from '@/tiktok/TikTokWebView';

export type { TikTokPostAction, TikTokPostVideoInput } from '@/tiktok/tiktokPostScript';

const STUDIO_UPLOAD_URL = 'https://www.tiktok.com/tiktokstudio/upload?from=webapp';
const POST_RUN_TIMEOUT_MS = 10 * 60 * 1000;
const TIKTOK_STUDIO_DEVICE_WIDTH = Math.round(Dimensions.get('window').width);
const TIKTOK_STUDIO_DESKTOP_SPOOF =
  `window.__kubdeeDesktopWidth=1280;window.__kubdeeDesktopDeviceWidth=${TIKTOK_STUDIO_DEVICE_WIDTH};\n` +
  DESKTOP_ENV_SPOOF;

function isTikTokHttpsUrl(rawUrl: string): boolean {
  if (rawUrl === 'about:blank') return true;
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' &&
      (url.hostname === 'tiktok.com' || url.hostname.endsWith('.tiktok.com'));
  } catch {
    return false;
  }
}

export interface TikTokPostCompleteResult {
  success: boolean;
  error?: string;
}

export interface TikTokPostRunStats {
  total: number;
  success: number;
  failed: number;
  current: number;
}

export interface TikTokPostModalProps {
  visible: boolean;
  profileLocalId: string;
  video: TikTokPostVideoInput;
  postAction: TikTokPostAction;
  enableProductLink: boolean;
  schedule?: TikTokPostScheduleInput | null;
  sound?: TikTokPostSoundInput | null;
  stats?: TikTokPostRunStats;
  onLog: (message: string) => void;
  onComplete: (result: TikTokPostCompleteResult) => void;
  onClose: () => void;
}

type RunnerPhase = 'checking' | 'clearing' | 'restoring' | 'preparing-file' | 'posting' | 'error';

export interface TikTokPostRunnerHandle {
  requestStop: () => void;
}

function TikTokPostStatChip({ color, label, value }: {
  color: string;
  label: string;
  value: string;
}): React.JSX.Element {
  return (
    <View style={styles.statChip}>
      <View style={[styles.statDot, { backgroundColor: color }]} />
      <Text numberOfLines={1} style={styles.statLabel}>{label}</Text>
      <Text numberOfLines={1} style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

function TikTokPostStatBar({ stats }: { stats: TikTokPostRunStats }): React.JSX.Element {
  // timer แยกอยู่ใน component นี้ เพื่อไม่ให้ tick ทุกวินาทีไป re-render runner/WebView
  const startedAtRef = useRef(Date.now());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.statBar}>
      <TikTokPostStatChip color="#60a5fa" label="คลิป" value={`${stats.current}/${stats.total}`} />
      <TikTokPostStatChip color="#34d399" label="สำเร็จ" value={String(stats.success)} />
      <TikTokPostStatChip color={stats.failed > 0 ? '#f87171' : '#737373'} label="ล้มเหลว" value={String(stats.failed)} />
      <TikTokPostStatChip color="#fbbf24" label="เวลา" value={formatOverlayDuration(Math.max(0, now - startedAtRef.current))} />
    </View>
  );
}

export default function TikTokPostModal({
  visible,
  profileLocalId,
  video,
  postAction,
  enableProductLink,
  schedule,
  sound,
  stats,
  onLog,
  onComplete,
  onClose,
}: TikTokPostModalProps): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const [overlayLogs, setOverlayLogs] = useState<OverlayLogLine[]>([]);
  const [runnerReady, setRunnerReady] = useState(false);
  const [runnerStopped, setRunnerStopped] = useState(false);
  const runnerRef = useRef<TikTokPostRunnerHandle>(null);

  const handleLog = useCallback((message: string): void => {
    onLog(message);
    const ts = Date.now();
    setOverlayLogs((current) => [
      ...current.slice(-3),
      { id: `${ts}-${current.length}`, message, ts },
    ]);
  }, [onLog]);

  useEffect(() => {
    if (visible) setOverlayLogs([]);
  }, [visible]);

  // remount เฉพาะ runner/WebView ต่อคลิป — Modal ค้างไว้ทั้งคิวเพื่อไม่ให้จอปิด-เปิดระหว่างคลิป
  const runnerKey = video.galleryVideoId || video.fileUri || video.fileName || 'clip';

  useEffect(() => {
    // header (parent) ค้างไว้ข้ามคลิป แต่ runner remount ใหม่ทุกคลิป — reset ทันทีที่เปลี่ยนคลิป
    // กันปุ่ม Stop ของ header โชว์สถานะ "หยุดแล้ว" ค้างจากคลิปก่อนแวบนึงก่อน runner ใหม่รายงานสถานะ
    // ต้องอยู่ก่อน early return ด้านล่างเสมอ (React Hooks ต้องถูกเรียกลำดับเดิมทุก render)
    setRunnerReady(false);
    setRunnerStopped(false);
  }, [runnerKey]);

  if (!visible) return null;

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.header}>
          <TikTokLogo size={18} isDark />
          <View style={styles.headerText}>
            <Text numberOfLines={1} style={styles.title}>โพสต์ TikTok</Text>
            <Text numberOfLines={1} style={styles.subtitle}>{video.fileName || video.productName || 'วิดีโอ'}</Text>
          </View>
          {runnerReady ? (
            runnerStopped ? (
              <View style={styles.headerStoppedPill}>
                <Text numberOfLines={1} style={styles.headerStoppedPillText}>หยุดแล้ว</Text>
              </View>
            ) : (
              <Pressable
                accessibilityLabel="หยุดการทำงานอัตโนมัติ (คงหน้าไว้ตรวจสอบ)"
                accessibilityRole="button"
                onPress={() => runnerRef.current?.requestStop()}
                style={styles.headerStopButton}
              >
                <Square size={13} color="#ffffff" strokeWidth={2.4} />
              </Pressable>
            )
          ) : null}
          <Pressable accessibilityLabel="หยุดและปิดการโพสต์ TikTok" accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
            <X size={18} color="#ffffff" strokeWidth={2.4} />
          </Pressable>
        </View>
        {stats ? <TikTokPostStatBar stats={stats} /> : null}
        <TikTokPostRunner
          key={runnerKey}
          ref={runnerRef}
          profileLocalId={profileLocalId}
          video={video}
          postAction={postAction}
          enableProductLink={enableProductLink}
          schedule={schedule}
          sound={sound}
          onLog={handleLog}
          onComplete={onComplete}
          onReadyChange={setRunnerReady}
          onStoppedChange={setRunnerStopped}
        />
        {overlayLogs.length > 0 ? (
          <View pointerEvents="none" style={[styles.logOverlay, { paddingBottom: 8 + insets.bottom }]}>
            {overlayLogs.map((line, index) => {
              const firstLog = overlayLogs[0] ?? line;
              const previousLog = index > 0 ? overlayLogs[index - 1] : null;
              const deltaMs = previousLog ? Math.max(0, line.ts - previousLog.ts) : 0;
              const elapsedMs = Math.max(0, line.ts - firstLog.ts);
              return (
                <View key={line.id} style={index > 0 ? styles.logLineSpacing : undefined}>
                  <Text numberOfLines={1} style={styles.logTime}>
                    {formatOverlayTime(line.ts)} +{formatOverlayDuration(deltaMs)} · {formatOverlayDuration(elapsedMs)}
                  </Text>
                  <Text
                    numberOfLines={getOverlayLogMessageLineCount(line)}
                    style={[styles.logMessage, { color: getOverlayLogMessageColor(line) }]}
                  >
                    {line.message}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

interface TikTokPostRunnerProps extends Omit<TikTokPostModalProps, 'visible' | 'onClose'> {
  onReadyChange: (ready: boolean) => void;
  onStoppedChange: (stopped: boolean) => void;
}

const TikTokPostRunner = forwardRef<TikTokPostRunnerHandle, TikTokPostRunnerProps>(
  function TikTokPostRunner({
    profileLocalId,
    video,
    postAction,
    enableProductLink,
    schedule,
    sound,
    onLog,
    onComplete,
    onReadyChange,
    onStoppedChange,
  }, ref) {
  const [phase, setPhase] = useState<RunnerPhase>('checking');
  const [needsStorageReset, setNeedsStorageReset] = useState(false);
  const [ready, setReady] = useState(false);
  const [stopped, setStopped] = useState(false);
  const mountedRef = useRef(true);
  const initStartedRef = useRef(false);
  const restoreStartedRef = useRef(false);
  const completedRef = useRef(false);
  const completionStartedRef = useRef(false);
  const stoppedRef = useRef(false);
  const webViewContainerRef = useRef<View>(null);
  const webViewRef = useRef<WebView>(null);

  const script = useMemo(
    () => buildTikTokPostScript({ video, postAction, enableProductLink, schedule, sound }),
    [enableProductLink, postAction, schedule, sound, video]
  );

  const complete = useCallback((result: TikTokPostCompleteResult): void => {
    if (!mountedRef.current || completedRef.current) return;
    completedRef.current = true;
    void clearTikTokWebViewUpload().catch(() => undefined);
    onComplete(result);
  }, [onComplete]);

  const fail = useCallback((message: string): void => {
    // หลังกด Stop ต้องไม่ให้ error ใดๆ (timeout, WebView error, native tap ล้มเหลว ฯลฯ)
    // มา unmount WebView ทิ้ง — ผู้ใช้ต้องการคงหน้าไว้ตรวจสอบเอง
    if (!mountedRef.current || stoppedRef.current) return;
    setNeedsStorageReset(false);
    setReady(false);
    setPhase('error');
    onLog(message);
    complete({ success: false, error: message });
  }, [complete, onLog]);

  const handleStop = useCallback((): void => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    // กันไม่ให้ผลลัพธ์จาก script (ทั้งสำเร็จ/ล้มเหลว) ที่จะตามมาทีหลังไป trigger onComplete
    // ต่อ — ผู้ใช้กด Stop แปลว่าอยากคุมเองจากตรงนี้ ไม่ใช่ให้คิวเดินต่ออัตโนมัติ
    completedRef.current = true;
    completionStartedRef.current = true;
    setStopped(true);
    onLog('ผู้ใช้สั่งหยุดการทำงาน — คงหน้า TikTok Studio ไว้ให้ตรวจสอบ');
    webViewRef.current?.injectJavaScript('window.__kubdeeTikTokPostStopRequested = true; true;');
  }, [onLog]);

  useImperativeHandle(ref, () => ({ requestStop: handleStop }), [handleStop]);

  useEffect(() => { onReadyChange(ready); }, [ready, onReadyChange]);
  useEffect(() => { onStoppedChange(stopped); }, [stopped, onStoppedChange]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void clearTikTokWebViewUpload().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    // รันครั้งเดียวต่อ runner (remount ต่อคลิปด้วย key อยู่แล้ว) — ห้ามรันซ้ำเมื่อ dep
    // identity เปลี่ยนกลางคัน (เช่น fail เปลี่ยนเพราะ screen re-render ระหว่าง Modal ค้างทั้งคิว)
    // ไม่งั้น phase จะถูก set กลับเป็น 'clearing' ระหว่างโพสต์ แล้ว timer 15 วิ ตัดจบคลิปทิ้ง
    if (initStartedRef.current) return;
    initStartedRef.current = true;
    let active = true;
    void clearTikTokWebViewUpload()
      .then(() => isProfileLoggedIn(profileLocalId))
      .then((loggedIn) => {
        if (!active) return;
        if (!loggedIn) {
          fail('โปรไฟล์นี้ยังไม่ได้เข้าสู่ระบบ TikTok');
          return;
        }
        if (!video.fileUri?.trim()) {
          fail('ไม่พบไฟล์วิดีโอในเครื่อง');
          return;
        }
        if (enableProductLink && video.platform?.trim().toLowerCase() !== 'tiktok') {
          fail('แนบสินค้าได้เฉพาะสินค้าที่มาจาก TikTok');
          return;
        }
        if (enableProductLink && !video.productId?.trim()) {
          fail('ไม่พบ TikTok Product ID สำหรับแนบสินค้า');
          return;
        }
        setPhase('clearing');
        setNeedsStorageReset(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        fail(error instanceof Error ? error.message : 'ตรวจสอบ TikTok session ไม่สำเร็จ');
      });
    return () => { active = false; };
  }, [enableProductLink, fail, profileLocalId, video.fileUri, video.platform, video.productId]);

  useEffect(() => {
    if (phase !== 'clearing') return;
    const timer = setTimeout(() => fail('หมดเวลาล้างข้อมูล TikTok ก่อนโพสต์'), 15000);
    return () => clearTimeout(timer);
  }, [fail, phase]);

  useEffect(() => {
    if (phase !== 'posting') return;
    const timer = setTimeout(
      () => fail('โพสต์ TikTok ใช้เวลานานเกิน 10 นาที จึงยกเลิกเพื่อความปลอดภัย'),
      POST_RUN_TIMEOUT_MS
    );
    return () => clearTimeout(timer);
  }, [fail, phase]);

  const handleStorageResetMessage = useCallback((event: WebViewMessageEvent): void => {
    let data: { type?: string; ok?: boolean; error?: string | null };
    try {
      data = JSON.parse(event.nativeEvent.data) as typeof data;
    } catch {
      return;
    }
    if (data.type !== 'tiktok-storage-reset' || restoreStartedRef.current) return;
    if (!data.ok) {
      fail(data.error || 'ล้างข้อมูล TikTok ก่อนโพสต์ไม่สำเร็จ');
      return;
    }
    restoreStartedRef.current = true;
    setNeedsStorageReset(false);
    setPhase('restoring');
    restoreProfileCookies(profileLocalId)
      .then(() => {
        if (!mountedRef.current) return;
        setPhase('preparing-file');
        return prepareTikTokWebViewUpload(video.fileUri || '');
      })
      .then(() => {
        if (!mountedRef.current) return;
        setReady(true);
        setPhase('posting');
      })
      .catch((error: unknown) => {
        fail(error instanceof Error ? error.message : 'เตรียม TikTok WebView ไม่สำเร็จ');
      });
  }, [fail, profileLocalId, video.fileUri]);

  const handlePostMessage = useCallback((event: WebViewMessageEvent): void => {
    let data: {
      type?: string;
      message?: string;
      success?: boolean;
      error?: string | null;
      code?: string;
      xRatio?: number;
      yRatio?: number;
      label?: string;
      diagnostics?: unknown;
    };
    try {
      data = JSON.parse(event.nativeEvent.data) as typeof data;
    } catch {
      return;
    }
    if (data.type === 'tiktok-post-log' && data.message) {
      onLog(data.message);
      return;
    }
    if (data.type === 'tiktok-post-native-enter') {
      // trusted Enter (ACTION_IME_ENTER) เข้า input ที่ focus อยู่ใน WebView —
      // ใช้ trigger การค้นหาสินค้า TikTok แบบเดียวกับ CDP pressKey ของ desktop
      // native ส่งผ่าน IPC ไปยัง :automation process (fire-and-forget เหมือน trusted tap)
      void pressImeEnter()
        .then((success) => {
          onLog(success
            ? 'Trusted Enter TikTok: ส่งคำสั่งแล้ว'
            : 'Trusted Enter TikTok: native ปฏิเสธ (ต้องใช้ Android 11+ และเปิด Accessibility Service)');
        })
        .catch(() => onLog('Trusted Enter TikTok: เรียก native ไม่สำเร็จ (เปิด Accessibility Service หรือยัง?)'));
      return;
    }
    if (data.type === 'tiktok-post-native-tap') {
      const xRatio = Number(data.xRatio);
      const yRatio = Number(data.yRatio);
      const tapLabel = data.label?.trim() || 'ปุ่ม TikTok';
      if (
        !Number.isFinite(xRatio) ||
        !Number.isFinite(yRatio) ||
        xRatio < 0 ||
        xRatio > 1 ||
        yRatio < 0 ||
        yRatio > 1 ||
        !webViewContainerRef.current
      ) {
        fail(`คำนวณตำแหน่ง${tapLabel}ไม่สำเร็จ`);
        return;
      }
      webViewContainerRef.current.measureInWindow((x, y, width, height) => {
        const density = PixelRatio.get();
        const screenX = (x + width * xRatio) * density;
        const screenY = (y + height * yRatio) * density;
        onLog(
          `Trusted tap TikTok (${tapLabel}): ${Math.round(screenX)},${Math.round(screenY)} ` +
            `(ratio ${xRatio.toFixed(3)},${yRatio.toFixed(3)})`
        );
        void tapScreen(screenX, screenY)
          .then((success) => {
            if (!success) {
              fail(`แตะ${tapLabel}ไม่สำเร็จ กรุณาเปิด Accessibility Service`);
            }
          })
          .catch(() => {
            fail(`แตะ${tapLabel}ไม่สำเร็จ กรุณาเปิด Accessibility Service`);
          });
      });
      return;
    }
    if (data.type !== 'tiktok-post-result') return;
    if (completionStartedRef.current) return;
    completionStartedRef.current = true;
    if (data.success) {
      // TikTok may rotate session cookies while posting. Preserve the refreshed snapshot for
      // the next run, but never turn a verified successful post into a failure if this write fails.
      void snapshotProfileCookies(profileLocalId)
        .catch(() => undefined)
        .finally(() => complete({ success: true }));
    } else {
      if (data.diagnostics) {
        onLog(`TikTok diagnostics: ${JSON.stringify(data.diagnostics).slice(0, 1200)}`);
      }
      complete({ success: false, error: data.error || data.code || 'โพสต์ TikTok ไม่สำเร็จ' });
    }
  }, [complete, fail, onLog, profileLocalId]);

  if (ready) {
    return (
      <View ref={webViewContainerRef} style={styles.webview}>
        <WebView
          ref={webViewRef}
          source={{ uri: STUDIO_UPLOAD_URL }}
          userAgent={DESKTOP_CHROME_UA}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          scalesPageToFit
          setBuiltInZoomControls={false}
          setDisplayZoomControls={false}
          injectedJavaScriptBeforeContentLoaded={TIKTOK_STUDIO_DESKTOP_SPOOF}
          injectedJavaScript={`${TIKTOK_STUDIO_DESKTOP_SPOOF}\n${script}`}
          onMessage={handlePostMessage}
          onShouldStartLoadWithRequest={(request) =>
            isTikTokHttpsUrl(request.url) || request.url.startsWith('blob:')
          }
          onError={() => fail('เปิดหน้า TikTok Studio ไม่สำเร็จ')}
          onHttpError={(event) => fail(`TikTok Studio ตอบกลับด้วยรหัส ${event.nativeEvent.statusCode}`)}
          style={styles.webview}
        />
      </View>
    );
  }

  return (
    <View style={styles.loading}>
      <Text style={styles.loadingText}>
        {phase === 'clearing'
          ? 'กำลังแยกข้อมูล TikTok ของโปรไฟล์นี้...'
          : phase === 'restoring'
            ? 'กำลังกู้คืน TikTok session...'
            : phase === 'preparing-file'
              ? 'กำลังเตรียมไฟล์วิดีโอ...'
              : phase === 'error'
                ? 'เตรียมโพสต์ TikTok ไม่สำเร็จ'
                : 'กำลังตรวจสอบ TikTok...'}
      </Text>
      {needsStorageReset ? (
        <WebView
          source={{ uri: TIKTOK_STORAGE_RESET_URL }}
          userAgent={DESKTOP_CHROME_UA}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          sharedCookiesEnabled
          cacheEnabled={false}
          injectedJavaScriptBeforeContentLoaded={TIKTOK_STORAGE_CLEAR_BEFORE}
          originWhitelist={['https://*']}
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={(request) => isTikTokHttpsUrl(request.url)}
          onMessage={handleStorageResetMessage}
          onError={() => fail('เปิดพื้นที่จัดเก็บ TikTok ไม่สำเร็จ')}
          style={styles.hiddenWebview}
        />
      ) : null}
    </View>
  );
  }
);

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000000' },
  header: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#303030',
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  subtitle: { color: '#a3a3a3', fontSize: 11, marginTop: 1 },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerStopButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  headerStoppedPill: {
    height: 24,
    borderRadius: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(251,191,36,0.15)',
  },
  headerStoppedPillText: { color: '#fbbf24', fontSize: 10, fontWeight: '700' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000' },
  loadingText: { color: '#d4d4d4', fontSize: 13 },
  hiddenWebview: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  webview: { flex: 1, backgroundColor: '#000000' },
  logOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.66)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logLineSpacing: { marginTop: 4 },
  logTime: { color: 'rgba(255,255,255,0.6)', fontSize: 8, lineHeight: 12 },
  logMessage: { fontSize: 10, lineHeight: 16, color: '#ffffff' },
  statBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#0a0a0a',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#303030',
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
    paddingHorizontal: 6,
    height: 20,
  },
  statDot: { width: 6, height: 6, borderRadius: 3 },
  statLabel: { color: '#a3a3a3', fontSize: 9 },
  statValue: { fontSize: 10, fontWeight: '600' },
});

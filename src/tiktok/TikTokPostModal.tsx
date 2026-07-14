import { Dimensions, Modal, PixelRatio, Pressable, StyleSheet, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

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
import type { TikTokPostAction, TikTokPostVideoInput } from '@/tiktok/tiktokPostScript';
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
  `window.__kubdeeDesktopWidth=1920;window.__kubdeeDesktopDeviceWidth=${TIKTOK_STUDIO_DEVICE_WIDTH};\n` +
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

export interface TikTokPostModalProps {
  visible: boolean;
  profileLocalId: string;
  video: TikTokPostVideoInput;
  postAction: TikTokPostAction;
  enableProductLink: boolean;
  onLog: (message: string) => void;
  onComplete: (result: TikTokPostCompleteResult) => void;
  onClose: () => void;
}

type RunnerPhase = 'checking' | 'clearing' | 'restoring' | 'preparing-file' | 'posting' | 'error';

export default function TikTokPostModal({
  visible,
  profileLocalId,
  video,
  postAction,
  enableProductLink,
  onLog,
  onComplete,
  onClose,
}: TikTokPostModalProps): React.JSX.Element | null {
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
          <Pressable accessibilityLabel="หยุดและปิดการโพสต์ TikTok" accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
            <X size={18} color="#ffffff" strokeWidth={2.4} />
          </Pressable>
        </View>
        <TikTokPostRunner
          profileLocalId={profileLocalId}
          video={video}
          postAction={postAction}
          enableProductLink={enableProductLink}
          onLog={onLog}
          onComplete={onComplete}
        />
      </SafeAreaView>
    </Modal>
  );
}

function TikTokPostRunner({
  profileLocalId,
  video,
  postAction,
  enableProductLink,
  onLog,
  onComplete,
}: Omit<TikTokPostModalProps, 'visible' | 'onClose'>): React.JSX.Element {
  const [phase, setPhase] = useState<RunnerPhase>('checking');
  const [needsStorageReset, setNeedsStorageReset] = useState(false);
  const [ready, setReady] = useState(false);
  const mountedRef = useRef(true);
  const restoreStartedRef = useRef(false);
  const completedRef = useRef(false);
  const completionStartedRef = useRef(false);
  const webViewContainerRef = useRef<View>(null);

  const script = useMemo(
    () => buildTikTokPostScript({ video, postAction, enableProductLink }),
    [enableProductLink, postAction, video]
  );

  const complete = useCallback((result: TikTokPostCompleteResult): void => {
    if (!mountedRef.current || completedRef.current) return;
    completedRef.current = true;
    void clearTikTokWebViewUpload().catch(() => undefined);
    onComplete(result);
  }, [onComplete]);

  const fail = useCallback((message: string): void => {
    if (!mountedRef.current) return;
    setNeedsStorageReset(false);
    setReady(false);
    setPhase('error');
    onLog(message);
    complete({ success: false, error: message });
  }, [complete, onLog]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void clearTikTokWebViewUpload().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
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
      void pressImeEnter()
        .then((success) => {
          onLog(success
            ? 'Trusted Enter TikTok: สำเร็จ'
            : 'Trusted Enter TikTok: native ปฏิเสธ (ต้องใช้ Android 11+ และเปิด Accessibility Service)');
        })
        .catch(() => onLog('Trusted Enter TikTok: เรียก native ไม่สำเร็จ'));
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
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000' },
  loadingText: { color: '#d4d4d4', fontSize: 13 },
  hiddenWebview: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  webview: { flex: 1, backgroundColor: '#000000' },
});

import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

import { TikTokLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import { DESKTOP_CHROME_UA, DESKTOP_ENV_SPOOF } from '@/tiktok/desktopSpoof';
import { buildShowcaseScraperScript } from '@/tiktok/showcaseScraperScript';
import { isProfileLoggedIn, restoreProfileCookies } from '@/tiktok/tiktokCookieStore';
import {
  TIKTOK_STORAGE_CLEAR_BEFORE,
  TIKTOK_STORAGE_RESET_URL,
} from '@/tiktok/TikTokWebView';
import type { KubdeeTheme } from '@/theme/tokens';

const STUDIO_UPLOAD_URL = 'https://www.tiktok.com/tiktokstudio/upload?from=webapp';

export interface TikTokShowcaseProduct {
  name: string;
  productId: string;
  imageUrl: string;
  price: string;
  stock: number;
  status: string;
}

interface ShowcaseResult {
  ok: boolean;
  products: TikTokShowcaseProduct[];
  error: string | null;
}

export interface TikTokShowcaseImportSummary {
  imported: number;
  created?: number;
  updated?: number;
  syncWarning?: string | null;
}

type ImportPhase = 'saving' | 'syncing';
type RunnerPhase =
  | 'checking'
  | 'clearing'
  | 'restoring'
  | 'scraping'
  | ImportPhase
  | 'done'
  | 'error';

function isTikTokHttpsUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'tiktok.com' || url.hostname.endsWith('.tiktok.com'))
    );
  } catch {
    return false;
  }
}

interface TikTokShowcaseModalProps {
  profileId: string;
  profileName?: string;
  theme: KubdeeTheme;
  visible: boolean;
  onClose: () => void;
  onComplete: (summary: TikTokShowcaseImportSummary) => void;
  onImportProducts: (
    products: TikTokShowcaseProduct[],
    onPhaseChange: (phase: ImportPhase) => void
  ) => Promise<TikTokShowcaseImportSummary>;
}

/**
 * Drives TikTok Studio in a WebView with the selected profile's session, scrapes the
 * seller's Showcase products, then saves and syncs them through the product library.
 *
 * The runner is a child mounted only while visible, so its state resets on each open.
 */
export default function TikTokShowcaseModal({
  profileId,
  profileName,
  theme,
  visible,
  onClose,
  onComplete,
  onImportProducts,
}: TikTokShowcaseModalProps): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => {
    if (!busy) {
      onClose();
    }
  }, [busy, onClose]);

  return (
    <Modal animationType="slide" visible={visible} onRequestClose={close}>
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-kd-screen">
        <View className="flex-row items-center gap-2 border-b border-kd-border bg-kd-panel px-3 py-2">
          <TikTokLogo size={16} isDark={theme.isDark} />
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
              ดึงสินค้า Showcase
            </Text>
            <Text numberOfLines={1} className="text-kd-micro font-medium text-kd-text-subtle">
              {profileName ? `โปรไฟล์ ${profileName}` : 'PoC — ดึงจาก TikTok Studio'}
            </Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="ปิด"
            accessibilityRole="button"
            activeOpacity={0.7}
            disabled={busy}
            onPress={close}
            style={{ opacity: busy ? 0.45 : 1 }}
            className="h-8 w-8 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-panel"
          >
            <X size={16} color={theme.textSubtle} strokeWidth={2.4} />
          </TouchableOpacity>
        </View>

        {visible ? (
          <ShowcaseRunner
            profileId={profileId}
            theme={theme}
            onBusyChange={setBusy}
            onComplete={onComplete}
            onImportProducts={onImportProducts}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function ShowcaseRunner({
  profileId,
  theme,
  onBusyChange,
  onComplete,
  onImportProducts,
}: {
  profileId: string;
  theme: KubdeeTheme;
  onBusyChange: (busy: boolean) => void;
  onComplete: TikTokShowcaseModalProps['onComplete'];
  onImportProducts: TikTokShowcaseModalProps['onImportProducts'];
}): React.JSX.Element {
  // null = กำลังเช็ค, false = ยังไม่ login TikTok, true = login แล้ว
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [restored, setRestored] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<ShowcaseResult | null>(null);
  const [phase, setPhase] = useState<RunnerPhase>('checking');
  const [needsStorageReset, setNeedsStorageReset] = useState(false);
  const [importSummary, setImportSummary] = useState<TikTokShowcaseImportSummary | null>(null);
  const importStartedRef = useRef(false);
  const completionSentRef = useRef(false);
  const restoreStartedRef = useRef(false);
  const mountedRef = useRef(true);

  const script = useMemo(() => buildShowcaseScraperScript(), []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const failPreparation = useCallback((message: string): void => {
    if (!mountedRef.current) return;
    setNeedsStorageReset(false);
    setResult({ ok: false, products: [], error: message });
    setPhase('error');
  }, []);

  // Check the durable snapshot first. The shared WebView storage is cleared separately before
  // restoring cookies so a previous profile's TikTok state cannot leak into this Showcase run.
  useEffect(() => {
    let active = true;
    (async () => {
      let li: boolean;
      try {
        li = await isProfileLoggedIn(profileId);
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : String(error);
        setResult({ ok: false, products: [], error: `ตรวจสอบ session TikTok ไม่สำเร็จ: ${message}` });
        setPhase('error');
        return;
      }
      if (!active) return;
      setLoggedIn(li);
      if (!li) {
        setPhase('error');
        return;
      }
      setPhase('clearing');
      setNeedsStorageReset(true);
    })();
    return () => {
      active = false;
    };
  }, [profileId]);

  useEffect(() => {
    if (phase !== 'clearing') return;
    const timer = setTimeout(() => {
      failPreparation('หมดเวลาล้างข้อมูล TikTok ก่อนดึงสินค้า');
    }, 15000);
    return () => clearTimeout(timer);
  }, [failPreparation, phase]);

  const handleStorageResetMessage = useCallback(
    (event: WebViewMessageEvent): void => {
      let data: { type?: string; ok?: boolean; error?: string | null };
      try {
        data = JSON.parse(event.nativeEvent.data) as typeof data;
      } catch {
        return;
      }
      if (data.type !== 'tiktok-storage-reset' || restoreStartedRef.current) {
        return;
      }
      if (!data.ok) {
        failPreparation(data.error || 'ล้างข้อมูล TikTok ก่อนดึงสินค้าไม่สำเร็จ');
        return;
      }

      restoreStartedRef.current = true;
      setNeedsStorageReset(false);
      setPhase('restoring');
      void restoreProfileCookies(profileId)
        .then(() => {
          if (!mountedRef.current) return;
          setRestored(true);
          setPhase('scraping');
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          failPreparation(`กู้คืน session TikTok ไม่สำเร็จ: ${message}`);
        });
    },
    [failPreparation, profileId]
  );

  // Scraping can take minutes and is safe to cancel by unmounting the WebView. Only lock
  // closing while local writes or queue sync are in flight.
  const busy = phase === 'saving' || phase === 'syncing';
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);

  useEffect(() => {
    if (phase !== 'done' || !importSummary) return;
    const timer = setTimeout(() => {
      if (!mountedRef.current || completionSentRef.current) return;
      completionSentRef.current = true;
      onComplete(importSummary);
    }, 900);
    return () => clearTimeout(timer);
  }, [importSummary, onComplete, phase]);

  const handleMessage = useCallback((event: WebViewMessageEvent): void => {
    // Mirror every page message to logcat (ReactNativeJS) so DOM diagnostics are readable.
    console.log('[SHOWCASE]', event.nativeEvent.data);
    let data: {
      type?: string;
      message?: string;
      ok?: boolean;
      products?: TikTokShowcaseProduct[];
      error?: string | null;
    };
    try {
      data = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (data.type === 'showcase-log' && typeof data.message === 'string') {
      const line = data.message;
      setLogs((prev) => [...prev.slice(-40), line]);
    } else if (data.type === 'showcase-result') {
      const nextResult: ShowcaseResult = {
        ok: !!data.ok,
        products: Array.isArray(data.products) ? data.products : [],
        error: typeof data.error === 'string' ? data.error : null,
      };
      setResult(nextResult);
      if (!nextResult.ok) {
        setPhase('error');
        return;
      }
      if (importStartedRef.current) {
        return;
      }
      importStartedRef.current = true;
      setPhase('saving');
      void onImportProducts(nextResult.products, setPhase)
        .then((summary) => {
          if (!mountedRef.current) return;
          setImportSummary(summary);
          setPhase('done');
        })
        .catch((error: unknown) => {
          if (!mountedRef.current) return;
          const message = error instanceof Error ? error.message : String(error);
          setResult((current) => ({
            ok: false,
            products: current?.products ?? [],
            error: message || 'บันทึกสินค้า TikTok ไม่สำเร็จ',
          }));
          setPhase('error');
        });
    }
  }, [onImportProducts]);

  const latest = logs[logs.length - 1] ?? 'กำลังเตรียม...';
  const phaseLabel = phase === 'checking'
    ? 'กำลังตรวจสอบการเข้าสู่ระบบ TikTok...'
    : phase === 'clearing'
      ? 'กำลังแยกข้อมูล TikTok ของโปรไฟล์นี้...'
    : phase === 'restoring'
      ? 'กำลังกู้คืน session TikTok...'
      : phase === 'saving'
        ? 'กำลังบันทึกสินค้าเข้าคลัง...'
        : phase === 'syncing'
          ? 'กำลังซิงก์สินค้าขึ้น Cloud...'
          : latest;

  return (
    <>
      <View className="flex-1">
        {loggedIn === false ? (
          <View className="flex-1 items-center justify-center gap-3 px-8">
            <TikTokLogo size={30} isDark={theme.isDark} />
            <Text className="text-kd-body font-semibold text-kd-text">ยังไม่ได้เข้าสู่ระบบ TikTok</Text>
            <Text className="text-center text-kd-caption font-medium text-kd-text-subtle">
              โปรไฟล์นี้ยังไม่ได้ล็อกอิน TikTok — ไปเมนูโปรไฟล์ แตะปุ่ม TikTok เข้าสู่ระบบก่อน
              แล้วค่อยดึงสินค้า Showcase
            </Text>
          </View>
        ) : restored ? (
          <WebView
            source={{ uri: STUDIO_UPLOAD_URL }}
            userAgent={DESKTOP_CHROME_UA}
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
            sharedCookiesEnabled
            scalesPageToFit
            setBuiltInZoomControls
            setDisplayZoomControls={false}
            injectedJavaScriptBeforeContentLoaded={DESKTOP_ENV_SPOOF}
            injectedJavaScript={`${DESKTOP_ENV_SPOOF}\n${script}`}
            onMessage={handleMessage}
            onShouldStartLoadWithRequest={(request) =>
              request.url.startsWith('https://') ||
              request.url.startsWith('http://') ||
              request.url.startsWith('about:')
            }
            style={styles.webview}
          />
        ) : (
          <View className="flex-1 items-center justify-center bg-black">
            <ActivityIndicator color="#ffffff" />
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
                onShouldStartLoadWithRequest={(request) =>
                  isTikTokHttpsUrl(request.url)
                }
                onMessage={handleStorageResetMessage}
                onError={() =>
                  failPreparation('เปิดพื้นที่จัดเก็บ TikTok เพื่อแยกโปรไฟล์ไม่สำเร็จ')
                }
                style={styles.hiddenWebview}
              />
            ) : null}
          </View>
        )}
      </View>

      {loggedIn === false ? null : (
      <View className="max-h-[42%] border-t border-kd-border bg-kd-panel px-3 py-2">
        {phase === 'done' && result?.ok ? (
          <>
            <Text className="text-kd-caption font-semibold text-kd-emerald">
              {`บันทึกสำเร็จ ${importSummary?.imported ?? result.products.length} รายการ`}
            </Text>
            {typeof importSummary?.created === 'number' || typeof importSummary?.updated === 'number' ? (
              <Text className="mt-0.5 text-kd-tiny font-medium text-kd-text-subtle">
                เพิ่มใหม่ {importSummary?.created ?? 0} · อัปเดต {importSummary?.updated ?? 0}
              </Text>
            ) : null}
            <ScrollView className="mt-1.5" showsVerticalScrollIndicator={false}>
              {result.products.map((product, index) => (
                <View
                  key={`${product.productId}-${index}`}
                  className="flex-row gap-2 border-b border-kd-border/50 py-1"
                >
                  <Text className="w-6 text-kd-tiny text-kd-text-subtle">{index + 1}</Text>
                  <Text numberOfLines={1} className="flex-1 text-kd-tiny text-kd-text">
                    {product.name}
                  </Text>
                  <Text className="text-kd-tiny font-semibold text-kd-text-muted">฿{product.price}</Text>
                </View>
              ))}
            </ScrollView>
          </>
        ) : phase === 'error' && result ? (
          <Text className="text-kd-caption font-semibold text-kd-red">
            ไม่สำเร็จ: {result.error ?? 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}
          </Text>
        ) : (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator size="small" color={theme.textMuted} />
            <Text numberOfLines={1} className="flex-1 text-kd-caption font-medium text-kd-text-subtle">
              {phaseLabel}
            </Text>
          </View>
        )}
      </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  hiddenWebview: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  webview: { flex: 1, backgroundColor: '#000000' },
});

import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

import { TikTokLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import { DESKTOP_CHROME_UA, DESKTOP_ENV_SPOOF } from '@/tiktok/desktopSpoof';
import { buildShowcaseScraperScript } from '@/tiktok/showcaseScraperScript';
import { isProfileLoggedIn, restoreProfileCookies } from '@/tiktok/tiktokCookieStore';
import type { KubdeeTheme } from '@/theme/tokens';

const STUDIO_UPLOAD_URL = 'https://www.tiktok.com/tiktokstudio/upload?from=webapp';

interface ScrapedProduct {
  name: string;
  productId: string;
  imageUrl: string;
  price: string;
  stock: number;
  status: string;
}

interface ShowcaseResult {
  ok: boolean;
  products: ScrapedProduct[];
  error: string | null;
}

interface TikTokShowcaseModalProps {
  profileId: string;
  profileName?: string;
  theme: KubdeeTheme;
  visible: boolean;
  onClose: () => void;
}

/**
 * PoC: drives TikTok Studio in a WebView (with the profile's session) to scrape the
 * seller's Showcase products, showing live progress + the scraped result. Saving into
 * the product library comes in the next phase.
 *
 * The runner is a child mounted only while visible, so its state resets on each open.
 */
export default function TikTokShowcaseModal({
  profileId,
  profileName,
  theme,
  visible,
  onClose,
}: TikTokShowcaseModalProps): React.JSX.Element {
  return (
    <Modal animationType="slide" visible={visible} onRequestClose={onClose}>
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
            onPress={onClose}
            className="h-8 w-8 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-panel"
          >
            <X size={16} color={theme.textSubtle} strokeWidth={2.4} />
          </TouchableOpacity>
        </View>

        {visible ? <ShowcaseRunner profileId={profileId} theme={theme} /> : null}
      </SafeAreaView>
    </Modal>
  );
}

function ShowcaseRunner({ profileId, theme }: { profileId: string; theme: KubdeeTheme }): React.JSX.Element {
  // null = กำลังเช็ค, false = ยังไม่ login TikTok, true = login แล้ว
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [restored, setRestored] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<ShowcaseResult | null>(null);

  const script = useMemo(() => buildShowcaseScraperScript(), []);

  // เช็ค login ก่อน — ถ้ายังไม่ login ไม่ต้องโหลด Studio (กันรันเปล่า). ถ้า login แล้ว
  // restore cookies ต่อ แล้วค่อยโหลด. setState อยู่ใน async callback (ไม่ sync ใน effect body)
  useEffect(() => {
    let active = true;
    (async () => {
      const li = await isProfileLoggedIn(profileId).catch(() => false);
      if (!active) return;
      setLoggedIn(li);
      if (!li) return;
      try {
        await restoreProfileCookies(profileId);
      } catch {
        // ignore — scraper จะรายงานเองถ้า session หลุด
      }
      if (active) {
        setRestored(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [profileId]);

  const handleMessage = useCallback((event: WebViewMessageEvent): void => {
    // Mirror every page message to logcat (ReactNativeJS) so DOM diagnostics are readable.
    console.log('[SHOWCASE]', event.nativeEvent.data);
    let data: {
      type?: string;
      message?: string;
      ok?: boolean;
      products?: ScrapedProduct[];
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
      setResult({
        ok: !!data.ok,
        products: Array.isArray(data.products) ? data.products : [],
        error: typeof data.error === 'string' ? data.error : null,
      });
    }
  }, []);

  const latest = logs[logs.length - 1] ?? 'กำลังเตรียม...';

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
            injectedJavaScriptBeforeContentLoaded={DESKTOP_ENV_SPOOF}
            injectedJavaScript={script}
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
          </View>
        )}
      </View>

      {loggedIn === false ? null : (
      <View className="max-h-[42%] border-t border-kd-border bg-kd-panel px-3 py-2">
        {result ? (
          <>
            <Text
              className={`text-kd-caption font-semibold ${result.ok ? 'text-kd-emerald' : 'text-kd-red'}`}
            >
              {result.ok
                ? `ดึงสำเร็จ ${result.products.length} รายการ`
                : `ไม่สำเร็จ: ${result.error ?? 'unknown'}`}
            </Text>
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
        ) : (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator size="small" color={theme.textMuted} />
            <Text numberOfLines={1} className="flex-1 text-kd-caption font-medium text-kd-text-subtle">
              {latest}
            </Text>
          </View>
        )}
      </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: '#000000' },
});

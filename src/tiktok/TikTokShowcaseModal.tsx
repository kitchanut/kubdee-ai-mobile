import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

import { TikTokLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import { buildShowcaseScraperScript } from '@/tiktok/showcaseScraperScript';
import { restoreProfileCookies } from '@/tiktok/tiktokCookieStore';
import type { KubdeeTheme } from '@/theme/tokens';

// Desktop UA so TikTok serves the desktop DOM (same selectors as the desktop app) and
// does not deep-link into the native app. See TikTokWebView for the rationale.
const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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
  const [restored, setRestored] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<ShowcaseResult | null>(null);

  const script = useMemo(() => buildShowcaseScraperScript(), []);

  // Restore this profile's TikTok cookies before loading Studio (authenticated scrape).
  // setState happens in the async callback (not synchronously in the effect body).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await restoreProfileCookies(profileId);
      } catch {
        // load anyway; the scraper reports "not logged in" if the session is gone
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
        {restored ? (
          <WebView
            source={{ uri: STUDIO_UPLOAD_URL }}
            userAgent={DESKTOP_CHROME_UA}
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
            sharedCookiesEnabled
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
    </>
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: '#000000' },
});

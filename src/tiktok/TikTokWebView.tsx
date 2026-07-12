import { X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewNavigation } from 'react-native-webview';

import {
  TIKTOK_LOGIN_URL,
  readLiveLoginState,
  restoreProfileCookies,
  snapshotProfileCookies,
} from '@/tiktok/tiktokCookieStore';

// Present as DESKTOP Chrome. TikTok's mobile web aggressively deep-links into the native
// TikTok app (snssdk1233://, intent://, …) which yanks the user out of this WebView — that
// redirect does not exist on the desktop site (there is no desktop app to open). Desktop UA
// also renders the same cookie-based login, so per-profile sessions still work.
const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export interface TikTokWebViewProps {
  profileId: string;
  onLoginStateChange?: (loggedIn: boolean) => void;
  onClose?: () => void;
}

/**
 * TikTok login WebView, scoped to one profile.
 *
 * On mount it restores the profile's saved cookies into the shared Android cookie jar
 * BEFORE loading TikTok, so a previously logged-in profile comes up already signed in.
 * It re-snapshots the live cookies on navigation, when the app backgrounds, and on unmount
 * so the session is captured the moment login completes and is never lost.
 */
export function TikTokWebView({
  profileId,
  onLoginStateChange,
  onClose,
}: TikTokWebViewProps): React.JSX.Element {
  // Which profile has finished restoring. `restored` is derived, so switching profiles
  // resets readiness during render (no setState needed) until the new restore completes.
  const [readyProfile, setReadyProfile] = useState<string | null>(null);
  const restored = readyProfile === profileId;

  // Keep the latest callback in a ref so the polling effect never re-subscribes on
  // every parent render.
  const onLoginStateChangeRef = useRef(onLoginStateChange);
  useEffect(() => {
    onLoginStateChangeRef.current = onLoginStateChange;
  }, [onLoginStateChange]);

  // Remember the last reported login state so we only fire the callback on a real change.
  const lastLoggedInRef = useRef<boolean | null>(null);

  // Snapshot the live tiktok cookies, then report the current login state (only when it
  // actually changed). Runs after navigation settles and on a light interval, since TikTok
  // is a SPA and login can complete without a full page load.
  const syncSession = useCallback(async () => {
    await snapshotProfileCookies(profileId);
    const loggedIn = await readLiveLoginState();
    if (lastLoggedInRef.current !== loggedIn) {
      lastLoggedInRef.current = loggedIn;
      onLoginStateChangeRef.current?.(loggedIn);
    }
  }, [profileId]);

  // Restore this profile's cookies before the WebView loads. On unmount (or when the
  // profile changes) snapshot the OLD profile so nothing is lost when switching.
  useEffect(() => {
    let active = true;
    lastLoggedInRef.current = null;
    (async () => {
      try {
        await restoreProfileCookies(profileId);
      } catch {
        // fall through and still show the login page
      }
      if (active) {
        setReadyProfile(profileId);
      }
    })();
    return () => {
      active = false;
      void snapshotProfileCookies(profileId);
    };
  }, [profileId]);

  // Capture the session when the app goes to the background — Android can kill the process
  // without ever unmounting the component.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        void snapshotProfileCookies(profileId);
      }
    });
    return () => subscription.remove();
  }, [profileId]);

  // Light interval to catch SPA logins that do not trigger a navigation change.
  useEffect(() => {
    if (!restored) {
      return;
    }
    const timer = setInterval(() => {
      void syncSession();
    }, 3000);
    return () => clearInterval(timer);
  }, [restored, syncSession]);

  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      if (navState.loading) {
        return;
      }
      void syncSession();
    },
    [syncSession]
  );

  if (!restored) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {onClose ? (
        <View style={styles.header}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="ปิด"
          >
            <X size={22} color="#ffffff" />
          </Pressable>
        </View>
      ) : null}
      <WebView
        source={{ uri: TIKTOK_LOGIN_URL }}
        userAgent={DESKTOP_CHROME_UA}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        cacheEnabled
        originWhitelist={['https://*', 'http://*']}
        setSupportMultipleWindows={false}
        // อยู่ในเว็บ TikTok เท่านั้น — บล็อก deep link (snssdk1233://, tiktok://, intent://,
        // market:// ฯลฯ) ที่หน้าเว็บใช้เปิดแอป TikTok เนทีฟ ไม่งั้น WebView จะเด้งออกไปเปิดแอป
        onShouldStartLoadWithRequest={(request) =>
          request.url.startsWith('https://') ||
          request.url.startsWith('http://') ||
          request.url.startsWith('about:')
        }
        onNavigationStateChange={handleNavigationStateChange}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#000000',
  },
  closeButton: {
    height: 36,
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000000',
  },
});

export default TikTokWebView;

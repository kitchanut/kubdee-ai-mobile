import { ArrowLeft, RotateCcw, X } from 'lucide-react-native';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type {
  WebViewMessageEvent,
  WebViewNavigation,
} from 'react-native-webview';

import Text from '@/components/ui/KubdeeText';
import { DESKTOP_CHROME_UA, DESKTOP_ENV_SPOOF } from '@/tiktok/desktopSpoof';
import {
  TIKTOK_URL,
  TIKTOK_LOGIN_URL,
  clearLiveTikTokCookies,
  readLiveLoginState,
  restoreProfileCookies,
  snapshotProfileCookies,
} from '@/tiktok/tiktokCookieStore';

type WebViewErrorEvent = Parameters<
  NonNullable<ComponentProps<typeof WebView>['onError']>
>[0];
type WebViewHttpErrorEvent = Parameters<
  NonNullable<ComponentProps<typeof WebView>['onHttpError']>
>[0];

// Desktop UA + env spoof (touch/platform/viewport) shared with the Showcase scraper — see
// desktopSpoof.ts. Logging in under the desktop spoof also avoids the native-app deep-link
// redirect and gives a "desktop" session that should unlock the Creator Showcase.

const ALLOWED_IDP_HOSTS = new Set([
  'accounts.google.com',
  'appleid.apple.com',
  'www.facebook.com',
  'm.facebook.com',
  'facebook.com',
  'api.twitter.com',
  'twitter.com',
  'x.com',
  'access.line.me',
  'line.me',
  'accounts.kakao.com',
  'kauth.kakao.com',
]);

// Same TikTok origin, but unlike the homepage this response does not run TikTok application
// JavaScript that can reopen IndexedDB while the hidden cleanup WebView is deleting it.
export const TIKTOK_STORAGE_RESET_URL = `${TIKTOK_URL}/robots.txt`;

// The native WebViews share one cookie jar. Queue restores so a quickly closed profile cannot
// finish restoring after a newly opened profile and overwrite that newer profile's session.
let cookieRestoreQueue: Promise<void> = Promise.resolve();

function enqueueCookieRestore(profileId: string): Promise<void> {
  const operation = cookieRestoreQueue
    .catch(() => undefined)
    .then(() => restoreProfileCookies(profileId));
  cookieRestoreQueue = operation.catch(() => undefined);
  return operation;
}

// Run the complete reset at document-start. TikTok can keep its root page loading indefinitely,
// so waiting for injectedJavaScript (document-end) causes a false timeout on real devices.
export const TIKTOK_STORAGE_CLEAR_BEFORE = `(async function(){
  var result = { type: 'tiktok-storage-reset', ok: false, error: null };
  try {
    try { window.stop(); } catch (e) {}
    localStorage.clear();
    sessionStorage.clear();
    if (!window.indexedDB || typeof indexedDB.databases !== 'function') {
      throw new Error('อุปกรณ์นี้ไม่รองรับการตรวจสอบ IndexedDB');
    }
    var databases = await Promise.race([
      indexedDB.databases(),
      new Promise(function(resolve){ setTimeout(function(){ resolve([]); }, 2000); })
    ]);
    var deletionResults = await Promise.all(databases.filter(function(db){ return !!db.name; }).map(function(db){
      return new Promise(function(resolve, reject){
        var request = indexedDB.deleteDatabase(db.name);
        var settled = false;
        var finish = function(value){
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        };
        // Some Android WebView versions never dispatch success, error, or blocked while a
        // previous renderer is still releasing the database connection.
        var timer = setTimeout(function(){ finish(false); }, 2000);
        request.onsuccess = function(){ finish(true); };
        request.onerror = function(){
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(request.error || new Error('ล้าง IndexedDB ไม่สำเร็จ'));
        };
        // The delete request stays queued and completes after the hidden WebView is unmounted.
        // Do not fail the whole profile switch merely because another renderer is closing slowly.
        request.onblocked = function(){ finish(false); };
      });
    }));
    var hasQueuedDeletion = deletionResults.some(function(deleted){ return deleted === false; });
    // Enumerating again while a deletion is blocked can wait behind that same request forever.
    var remaining = hasQueuedDeletion ? [] : await indexedDB.databases();
    if (localStorage.length !== 0 || sessionStorage.length !== 0 || (!hasQueuedDeletion && remaining.some(function(db){ return !!db.name; }))) {
      throw new Error('ตรวจพบข้อมูล TikTok ที่ยังล้างไม่หมด');
    }
    result.ok = true;
  } catch (error) {
    result.error = error && error.message ? error.message : 'ล้างพื้นที่จัดเก็บ TikTok ไม่สำเร็จ';
  }
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(result));
})(); true;`;

function isAllowedLoginUrl(rawUrl: string): boolean {
  if (rawUrl === 'about:blank') {
    return true;
  }
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') {
      return false;
    }
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === 'tiktok.com' ||
      hostname.endsWith('.tiktok.com') ||
      ALLOWED_IDP_HOSTS.has(hostname)
    );
  } catch {
    return false;
  }
}

function displayHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname || 'TikTok';
  } catch {
    return 'TikTok';
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export interface TikTokWebViewProps {
  profileId: string;
  onLoginStateChange?: (loggedIn: boolean) => void;
  onClose?: () => void;
}

export interface TikTokWebViewHandle {
  goBack: () => boolean;
  flushSession: () => Promise<void>;
}

interface PreparationState {
  profileId: string;
  attempt: number;
  status: 'clearingCookies' | 'clearing' | 'restoring' | 'ready' | 'error';
  error?: string;
}

interface PageError {
  title: string;
  message: string;
}

/**
 * TikTok login WebView, scoped to one profile.
 *
 * Before loading the visible login page it clears and verifies TikTok's shared browser storage,
 * then restores this profile's saved cookies into the shared Android cookie jar. It re-snapshots
 * the live cookies on navigation, when the app backgrounds, and on unmount so the session is
 * captured when login completes and is not mixed with another profile.
 */
export const TikTokWebView = forwardRef<
  TikTokWebViewHandle,
  TikTokWebViewProps
>(function TikTokWebView(
  { profileId, onLoginStateChange, onClose },
  ref
): React.JSX.Element {
  const [preparation, setPreparation] = useState<PreparationState>(() => ({
    profileId,
    attempt: 0,
    status: 'clearingCookies',
  }));
  const currentPreparation =
    preparation.profileId === profileId
      ? preparation
      : { profileId, attempt: 0, status: 'clearingCookies' as const };
  const restored = currentPreparation.status === 'ready';
  const restoringRef = useRef(false);
  const restoredProfileRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const webViewRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(TIKTOK_LOGIN_URL);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState<PageError | null>(null);
  const [reloadAttempt, setReloadAttempt] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

  const activeProfileRef = useRef(profileId);
  activeProfileRef.current = profileId;

  // Only snapshot after this profile has completed storage isolation and cookie restore.
  // Closing during preparation must not accidentally save the previous profile's live jar.
  useEffect(() => {
    return () => {
      if (restoredProfileRef.current === profileId) {
        void snapshotProfileCookies(profileId);
      }
    };
  }, [profileId]);

  useEffect(() => {
    restoringRef.current = false;
    restoredProfileRef.current = null;
    lastLoggedInRef.current = null;
    canGoBackRef.current = false;
    setCanGoBack(false);
    setCurrentUrl(TIKTOK_LOGIN_URL);
    setPageError(null);
    setPreparation({ profileId, attempt: 0, status: 'clearingCookies' });
  }, [profileId]);

  const failPreparation = useCallback(
    (message: string): void => {
      restoringRef.current = false;
      setPreparation((current) => {
        if (current.profileId !== profileId) {
          return current;
        }
        return {
          ...current,
          status: 'error',
          error: message,
        };
      });
    },
    [profileId]
  );

  const handlePreparationMessage = useCallback(
    (event: WebViewMessageEvent): void => {
      let result: { type?: string; ok?: boolean; error?: string | null };
      try {
        result = JSON.parse(event.nativeEvent.data) as typeof result;
      } catch {
        return;
      }
      if (result.type !== 'tiktok-storage-reset' || restoringRef.current) {
        return;
      }
      if (!result.ok) {
        failPreparation(result.error || 'ล้างข้อมูล TikTok เดิมไม่สำเร็จ');
        return;
      }

      restoringRef.current = true;
      setPreparation((current) =>
        current.profileId === profileId
          ? { ...current, status: 'restoring', error: undefined }
          : current
      );
      void enqueueCookieRestore(profileId)
        .then(() => {
          if (!mountedRef.current || activeProfileRef.current !== profileId) {
            return;
          }
          restoringRef.current = false;
          restoredProfileRef.current = profileId;
          setPreparation((current) =>
            current.profileId === profileId
              ? { ...current, status: 'ready', error: undefined }
              : current
          );
        })
        .catch((error: unknown) => {
          if (mountedRef.current && activeProfileRef.current === profileId) {
            failPreparation(
              errorMessage(error, 'กู้คืนเซสชันของโปรไฟล์นี้ไม่สำเร็จ')
            );
          }
        });
    },
    [failPreparation, profileId]
  );

  const retryPreparation = useCallback((): void => {
    restoringRef.current = false;
    restoredProfileRef.current = null;
    setPreparation((current) => ({
      profileId,
      attempt: current.profileId === profileId ? current.attempt + 1 : 0,
      status: 'clearingCookies',
    }));
  }, [profileId]);

  // Never let the hidden preparation page load with another profile's live cookies. Clear the
  // native shared jar first, then use the hidden TikTok-origin WebView to clear browser storage.
  useEffect(() => {
    if (currentPreparation.status !== 'clearingCookies') {
      return;
    }
    let active = true;
    void clearLiveTikTokCookies()
      .then(() => {
        if (!active || activeProfileRef.current !== profileId) {
          return;
        }
        setPreparation((current) =>
          current.profileId === profileId
            ? { ...current, status: 'clearing', error: undefined }
            : current
        );
      })
      .catch((error: unknown) => {
        if (active && activeProfileRef.current === profileId) {
          failPreparation(
            errorMessage(error, 'ล้าง cookie TikTok เดิมไม่สำเร็จ')
          );
        }
      });
    return () => {
      active = false;
    };
  }, [currentPreparation.status, failPreparation, profileId]);

  useEffect(() => {
    if (
      currentPreparation.status !== 'clearingCookies' &&
      currentPreparation.status !== 'clearing'
    ) {
      return;
    }
    const timer = setTimeout(() => {
      failPreparation('หมดเวลารอล้างข้อมูล TikTok กรุณาลองใหม่');
    }, 15000);
    return () => clearTimeout(timer);
  }, [currentPreparation.status, currentPreparation.attempt, failPreparation]);

  // Capture the session when the app goes to the background — Android can kill the process
  // without ever unmounting the component.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (
        restoredProfileRef.current === profileId &&
        (state === 'background' || state === 'inactive')
      ) {
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
      canGoBackRef.current = navState.canGoBack;
      setCanGoBack(navState.canGoBack);
      setCurrentUrl(navState.url);
      setPageLoading(navState.loading);
      if (navState.loading) {
        return;
      }
      void syncSession();
    },
    [syncSession]
  );

  const goBack = useCallback((): boolean => {
    if (!canGoBackRef.current || !webViewRef.current) {
      return false;
    }
    webViewRef.current.goBack();
    return true;
  }, []);

  const flushSession = useCallback(async (): Promise<void> => {
    if (restoredProfileRef.current === profileId) {
      await snapshotProfileCookies(profileId);
    }
  }, [profileId]);

  useImperativeHandle(ref, () => ({ goBack, flushSession }), [
    flushSession,
    goBack,
  ]);

  const retryPage = useCallback((): void => {
    canGoBackRef.current = false;
    setCanGoBack(false);
    setCurrentUrl(TIKTOK_LOGIN_URL);
    setPageError(null);
    setPageLoading(true);
    setReloadAttempt((current) => current + 1);
  }, []);

  const handleWebViewError = useCallback((event: WebViewErrorEvent): void => {
    setPageLoading(false);
    setPageError({
      title: 'เปิดหน้าเข้าสู่ระบบไม่สำเร็จ',
      message:
        event.nativeEvent.description || 'กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
    });
  }, []);

  const handleHttpError = useCallback((event: WebViewHttpErrorEvent): void => {
    setPageLoading(false);
    setPageError({
      title: `TikTok ตอบกลับด้วยรหัส ${event.nativeEvent.statusCode}`,
      message: event.nativeEvent.description || 'กรุณาลองโหลดหน้าอีกครั้ง',
    });
  }, []);

  const allowNavigation = useCallback((url: string): boolean => {
    const allowed = isAllowedLoginUrl(url);
    if (!allowed) {
      setPageLoading(false);
      setPageError({
        title: 'บล็อกลิงก์ที่ไม่ปลอดภัย',
        message: `ไม่อนุญาตให้เปิด ${displayHostname(url)} ในหน้าล็อกอิน TikTok`,
      });
    }
    return allowed;
  }, []);

  if (!restored) {
    return (
      <View style={styles.loadingContainer} accessibilityLiveRegion="polite">
        {currentPreparation.status === 'error' ? (
          <View accessible accessibilityRole="alert" style={styles.messageCard}>
            <Text style={styles.errorTitle}>เตรียม TikTok ไม่สำเร็จ</Text>
            <Text style={styles.errorMessage}>
              {currentPreparation.error || 'ไม่สามารถแยกเซสชันของโปรไฟล์นี้ได้'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ลองเตรียม TikTok ใหม่"
              onPress={retryPreparation}
              style={styles.primaryButton}
            >
              <RotateCcw size={16} color="#ffffff" />
              <Text style={styles.primaryButtonText}>ลองใหม่</Text>
            </Pressable>
          </View>
        ) : (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={
              currentPreparation.status === 'restoring'
                ? 'กำลังกู้คืนเซสชัน TikTok ของโปรไฟล์นี้'
                : currentPreparation.status === 'clearingCookies'
                  ? 'กำลังล้าง cookie TikTok เดิมเพื่อแยกโปรไฟล์'
                  : 'กำลังล้างข้อมูล TikTok เดิมเพื่อแยกโปรไฟล์'
            }
            style={styles.loadingContent}
          >
            <ActivityIndicator color="#ffffff" />
            <Text style={styles.loadingText}>
              {currentPreparation.status === 'restoring'
                ? 'กำลังกู้คืนเซสชัน...'
                : currentPreparation.status === 'clearingCookies'
                  ? 'กำลังล้าง cookie TikTok...'
                  : 'กำลังเตรียม TikTok สำหรับโปรไฟล์นี้...'}
            </Text>
          </View>
        )}
        {currentPreparation.status === 'clearing' ? (
          <WebView
            key={`prepare-${profileId}-${currentPreparation.attempt}`}
            source={{ uri: TIKTOK_STORAGE_RESET_URL }}
            userAgent={DESKTOP_CHROME_UA}
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
            sharedCookiesEnabled
            cacheEnabled={false}
            injectedJavaScriptBeforeContentLoaded={`${TIKTOK_STORAGE_CLEAR_BEFORE}\n${DESKTOP_ENV_SPOOF}`}
            originWhitelist={['https://*', 'about:blank']}
            setSupportMultipleWindows={false}
            onShouldStartLoadWithRequest={(request) =>
              isAllowedLoginUrl(request.url)
            }
            onMessage={handlePreparationMessage}
            onError={() =>
              failPreparation('เปิดพื้นที่จัดเก็บของ TikTok ไม่สำเร็จ')
            }
            style={styles.hiddenWebview}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          disabled={!canGoBack}
          onPress={goBack}
          style={[styles.headerButton, !canGoBack && styles.disabledButton]}
          accessibilityRole="button"
          accessibilityLabel="ย้อนกลับในหน้า TikTok"
          accessibilityState={{ disabled: !canGoBack }}
        >
          <ArrowLeft size={20} color="#ffffff" />
        </Pressable>
        <Text numberOfLines={1} style={styles.hostname}>
          {displayHostname(currentUrl)}
        </Text>
        {onClose ? (
          <Pressable
            onPress={onClose}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="ปิด"
          >
            <X size={20} color="#ffffff" />
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>
      <WebView
        key={`login-${profileId}-${reloadAttempt}`}
        ref={webViewRef}
        source={{ uri: TIKTOK_LOGIN_URL }}
        userAgent={DESKTOP_CHROME_UA}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled
        cacheEnabled
        scalesPageToFit
        injectedJavaScriptBeforeContentLoaded={`window.__kubdeeAllowZoom=true;\n${DESKTOP_ENV_SPOOF}`}
        originWhitelist={['https://*', 'about:blank']}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(request) => allowNavigation(request.url)}
        onNavigationStateChange={handleNavigationStateChange}
        onLoadStart={() => {
          setPageLoading(true);
          setPageError(null);
        }}
        onLoadEnd={() => setPageLoading(false)}
        onError={handleWebViewError}
        onHttpError={handleHttpError}
        style={styles.webview}
      />
      {pageLoading && !pageError ? (
        <View
          pointerEvents="none"
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="กำลังโหลดหน้า TikTok"
          accessibilityLiveRegion="polite"
          style={styles.pageOverlay}
        >
          <ActivityIndicator color="#ffffff" />
          <Text style={styles.loadingText}>กำลังโหลด TikTok...</Text>
        </View>
      ) : null}
      {pageError ? (
        <View style={styles.pageOverlay} accessibilityLiveRegion="assertive">
          <View accessible accessibilityRole="alert" style={styles.messageCard}>
            <Text style={styles.errorTitle}>{pageError.title}</Text>
            <Text style={styles.errorMessage}>{pageError.message}</Text>
            <View style={styles.actionRow}>
              {canGoBack ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ย้อนกลับจากหน้าที่มีปัญหา"
                  onPress={() => {
                    setPageError(null);
                    goBack();
                  }}
                  style={styles.secondaryButton}
                >
                  <ArrowLeft size={16} color="#ffffff" />
                  <Text style={styles.secondaryButtonText}>ย้อนกลับ</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="ลองโหลดหน้า TikTok ใหม่"
                onPress={retryPage}
                style={styles.primaryButton}
              >
                <RotateCcw size={16} color="#ffffff" />
                <Text style={styles.primaryButtonText}>ลองใหม่</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
});

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
  loadingContent: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: 4,
    backgroundColor: '#000000',
    borderBottomColor: '#27272a',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerButton: {
    height: 44,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.3,
  },
  headerSpacer: {
    height: 44,
    width: 44,
  },
  hostname: {
    flex: 1,
    color: '#d4d4d8',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000000',
  },
  hiddenWebview: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  pageOverlay: {
    position: 'absolute',
    top: 44,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    paddingHorizontal: 24,
  },
  messageCard: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: 12,
    borderColor: '#3f3f46',
    borderWidth: 1,
    borderRadius: 16,
    backgroundColor: '#18181b',
    padding: 20,
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorMessage: {
    color: '#d4d4d8',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderColor: '#52525b',
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: '#27272a',
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default TikTokWebView;

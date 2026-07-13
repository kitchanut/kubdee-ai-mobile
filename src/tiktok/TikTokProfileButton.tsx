import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, RotateCcw, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { TikTokLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import {
  TIKTOK_STORAGE_CLEAR_BEFORE,
  TIKTOK_STORAGE_RESET_URL,
  TikTokWebView,
  type TikTokWebViewHandle,
} from '@/tiktok/TikTokWebView';
import { DESKTOP_CHROME_UA } from '@/tiktok/desktopSpoof';
import {
  clearLiveTikTokCookies,
  clearProfileTikTokSession,
  isProfileLoggedIn,
  readLiveLoginState,
} from '@/tiktok/tiktokCookieStore';
import type { KubdeeTheme } from '@/theme/tokens';

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

interface TikTokProfileButtonProps {
  profileId: string;
  profileName?: string;
  theme: KubdeeTheme;
}

/**
 * Compact per-profile TikTok login control for a ProfileRow — every profile gets
 * its own, mirroring the desktop app where each profile logs in / keeps its own
 * TikTok session. Tapping opens a full-screen WebView scoped to that profile; a
 * status dot shows whether that profile is currently logged in.
 */
export default function TikTokProfileButton({
  profileId,
  profileName,
  theme,
}: TikTokProfileButtonProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  // ผลตรวจ login ผูกกับ profileId เพื่อ derive สถานะโดยไม่ต้อง reset state ใน effect
  const [status, setStatus] = useState<{
    profileId: string;
    loggedIn: boolean;
  } | null>(null);
  const [resetting, setResetting] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const loginWebViewRef = useRef<TikTokWebViewHandle>(null);
  const finishingResetRef = useRef(false);
  const closingLoginRef = useRef(false);
  const signOutCleanupErrorRef = useRef<string | null>(null);
  const loggedIn =
    status && status.profileId === profileId ? status.loggedIn : null;

  useEffect(() => {
    if (!profileId) {
      return;
    }
    let active = true;
    isProfileLoggedIn(profileId)
      .then((result: boolean) => {
        if (active) {
          setStatus({ profileId, loggedIn: result });
        }
      })
      .catch(() => {
        if (active) {
          setStatus({ profileId, loggedIn: false });
        }
      });
    return () => {
      active = false;
    };
  }, [profileId]);

  const handleLoginState = useCallback(
    (value: boolean): void => {
      setStatus({ profileId, loggedIn: value });
    },
    [profileId]
  );

  const closeModal = useCallback((): void => {
    if (closingLoginRef.current) {
      return;
    }
    closingLoginRef.current = true;
    const webView = loginWebViewRef.current;
    void (async () => {
      try {
        await webView?.flushSession();
      } catch {
        // The WebView cleanup performs another best-effort snapshot on unmount.
      }
      setOpen(false);
      if (profileId) {
        try {
          handleLoginState(await isProfileLoggedIn(profileId));
        } catch {
          // Keep the previous state when the encrypted snapshot cannot be read.
        }
      }
      closingLoginRef.current = false;
    })();
  }, [profileId, handleLoginState]);

  // Mark logout complete only after both browser storage and the native cookie snapshots
  // have been verified. A timeout or WebView failure becomes a retryable error state.
  const finishReset = useCallback(
    async (storageVerified: boolean, storageError?: string): Promise<void> => {
      if (finishingResetRef.current) {
        return;
      }
      finishingResetRef.current = true;
      let liveLoggedIn = true;
      let savedLoggedIn = true;
      try {
        await clearLiveTikTokCookies();
        [liveLoggedIn, savedLoggedIn] = await Promise.all([
          readLiveLoginState(),
          isProfileLoggedIn(profileId),
        ]);
      } catch {
        storageVerified = false;
      }

      const cleanupError = signOutCleanupErrorRef.current;
      const verified =
        storageVerified &&
        cleanupError === null &&
        !liveLoggedIn &&
        !savedLoggedIn;
      setResetting(false);
      if (verified) {
        setResetError(null);
        handleLoginState(false);
      } else {
        setResetError(
          storageError ||
            cleanupError ||
            (liveLoggedIn || savedLoggedIn
              ? 'ตรวจพบเซสชัน TikTok ที่ยังล้างไม่หมด'
              : 'ไม่สามารถยืนยันว่าล้างข้อมูล TikTok สำเร็จ')
        );
        handleLoginState(liveLoggedIn || savedLoggedIn);
      }
    },
    [handleLoginState, profileId]
  );

  // ออกจากระบบ = ล้าง cookie + snapshot แล้วเปิด reset webview ไปล้าง localStorage/IndexedDB
  // บน origin tiktok (ไม่งั้น TikTok เอา token ใน localStorage มา auth กลับ = ยัง login อยู่)
  const performSignOut = useCallback(async (): Promise<void> => {
    setResetError(null);
    setSignOutPending(true);
    finishingResetRef.current = false;
    signOutCleanupErrorRef.current = null;
    try {
      await clearProfileTikTokSession(profileId);
    } catch {
      signOutCleanupErrorRef.current = 'ลบ session ที่บันทึกไว้ไม่สำเร็จ';
    }
    setSignOutPending(false);
    setResetting(true);
  }, [profileId]);

  const signOut = useCallback((): void => {
    Alert.alert(
      'ออกจากระบบ TikTok?',
      `เซสชัน TikTok ของ "${profileName || 'โปรไฟล์นี้'}" จะถูกล้างออกจากเครื่อง ต้องล็อกอินใหม่เมื่อใช้งานอีกครั้ง`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ออกจากระบบ',
          style: 'destructive',
          onPress: () => {
            void performSignOut();
          },
        },
      ]
    );
  }, [profileName, performSignOut]);

  // A timeout is a failed verification, never a successful logout.
  useEffect(() => {
    if (!resetting) {
      return;
    }
    const timer = setTimeout(() => {
      void finishReset(false, 'หมดเวลารอล้างข้อมูล TikTok กรุณาลองใหม่');
    }, 15000);
    return () => clearTimeout(timer);
  }, [resetting, finishReset]);

  const handleModalBackRequest = useCallback((): void => {
    if (!loginWebViewRef.current?.goBack()) {
      closeModal();
    }
  }, [closeModal]);

  // แตะปุ่ม: ยังไม่ล็อกอิน → เปิด WebView; ล็อกอินแล้ว → เมนู เปิด/ออกจากระบบ
  const handlePress = useCallback((): void => {
    if (loggedIn) {
      Alert.alert(
        profileName ? `TikTok · ${profileName}` : 'TikTok',
        'เชื่อมต่ออยู่',
        [
          { text: 'เปิดหน้า TikTok', onPress: () => setOpen(true) },
          {
            text: 'ออกจากระบบ / ล้าง session',
            style: 'destructive',
            onPress: signOut,
          },
          { text: 'ยกเลิก', style: 'cancel' },
        ]
      );
    } else {
      setOpen(true);
    }
  }, [loggedIn, profileName, signOut]);

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={
          loggedIn === null
            ? `กำลังตรวจสอบ TikTok ของ ${profileName || 'โปรไฟล์นี้'}`
            : loggedIn
              ? `จัดการ TikTok ของ ${profileName || 'โปรไฟล์นี้'}`
              : `ล็อกอิน TikTok ให้ ${profileName || 'โปรไฟล์นี้'}`
        }
        accessibilityState={{ busy: loggedIn === null }}
        activeOpacity={0.7}
        onPress={handlePress}
        className="w-11 items-center justify-center border-l border-kd-border"
      >
        <View className="relative">
          {loggedIn === null ? (
            <ActivityIndicator color={theme.textSubtle} size="small" />
          ) : (
            <TikTokLogo size={18} isDark={theme.isDark} />
          )}
          {/* badge ติ๊กถูกสีเขียว โชว์เฉพาะตอนเชื่อมต่อแล้ว */}
          {loggedIn ? (
            <View className="absolute -bottom-1 -right-1 h-3.5 w-3.5 items-center justify-center rounded-full border border-kd-panel bg-kd-emerald">
              <Check size={9} color="#ffffff" strokeWidth={3.5} />
            </View>
          ) : null}
        </View>
      </TouchableOpacity>

      <Modal
        animationType="slide"
        visible={open}
        onRequestClose={handleModalBackRequest}
      >
        <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-kd-screen">
          <View className="flex-row items-center gap-2 border-b border-kd-border bg-kd-panel px-3 py-2">
            <TikTokLogo size={16} isDark={theme.isDark} />
            <View className="min-w-0 flex-1">
              <Text
                numberOfLines={1}
                className="text-kd-body font-semibold text-kd-text"
              >
                TikTok
              </Text>
              <Text
                numberOfLines={1}
                className="text-kd-micro font-medium text-kd-text-subtle"
              >
                {loggedIn
                  ? 'เชื่อมต่อแล้ว — เซสชันจะถูกเก็บไว้ในโปรไฟล์นี้'
                  : profileName
                    ? `เข้าสู่ระบบ TikTok สำหรับ ${profileName}`
                    : 'เข้าสู่ระบบ TikTok เพื่อเชื่อมต่อ'}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="ปิด"
              accessibilityRole="button"
              activeOpacity={0.7}
              hitSlop={4}
              onPress={closeModal}
              className="h-11 w-11 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-panel"
            >
              <X size={16} color={theme.textSubtle} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
          <View className="flex-1">
            {open ? (
              <TikTokWebView
                ref={loginWebViewRef}
                profileId={profileId}
                onLoginStateChange={handleLoginState}
              />
            ) : (
              <View className="flex-1 items-center justify-center bg-black">
                <ActivityIndicator color="#ffffff" />
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>

      {/* reset webview (ซ่อน) — ล้าง localStorage/IndexedDB บน origin tiktok ตอนออกจากระบบ */}
      <Modal
        visible={signOutPending || resetting || resetError !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (signOutPending) {
            return;
          }
          if (resetting) {
            void finishReset(false, 'การตรวจสอบถูกยกเลิกก่อนเสร็จ');
          } else {
            setResetError(null);
          }
        }}
      >
        <View className="flex-1 items-center justify-center bg-black/70">
          <View
            accessible
            accessibilityRole={resetError ? 'alert' : 'progressbar'}
            accessibilityLabel={resetError || 'กำลังล้างและตรวจสอบข้อมูล TikTok'}
            accessibilityLiveRegion={resetError ? 'assertive' : 'polite'}
            className="mx-6 items-center gap-3 rounded-kd-xl bg-kd-panel px-6 py-5"
          >
            {resetError ? (
              <>
                <Text className="text-center text-kd-body font-semibold text-kd-red">
                  ออกจากระบบไม่สำเร็จ
                </Text>
                <Text className="text-center text-kd-caption font-medium text-kd-text-subtle">
                  {resetError}
                </Text>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="ปิดข้อความออกจากระบบไม่สำเร็จ"
                    activeOpacity={0.75}
                    onPress={() => setResetError(null)}
                    className="h-11 items-center justify-center rounded-kd-lg border border-kd-border px-4"
                  >
                    <Text className="text-kd-caption font-semibold text-kd-text">
                      ปิด
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="ลองออกจากระบบ TikTok ใหม่"
                    activeOpacity={0.75}
                    onPress={() => {
                      void performSignOut();
                    }}
                    className="h-11 flex-row items-center justify-center gap-2 rounded-kd-lg bg-kd-red px-4"
                  >
                    <RotateCcw size={15} color="#ffffff" />
                    <Text className="text-kd-caption font-semibold text-white">
                      ลองใหม่
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <ActivityIndicator color={theme.textMuted} />
                <Text className="text-kd-caption font-medium text-kd-text">
                  {signOutPending
                    ? 'กำลังลบ session ที่บันทึกไว้...'
                    : 'กำลังล้างและตรวจสอบข้อมูล TikTok...'}
                </Text>
              </>
            )}
          </View>
          {resetting ? (
            <WebView
              source={{ uri: TIKTOK_STORAGE_RESET_URL }}
              userAgent={DESKTOP_CHROME_UA}
              javaScriptEnabled
              domStorageEnabled
              thirdPartyCookiesEnabled
              sharedCookiesEnabled
              cacheEnabled={false}
              injectedJavaScriptBeforeContentLoaded={
                TIKTOK_STORAGE_CLEAR_BEFORE
              }
              originWhitelist={['https://*']}
              setSupportMultipleWindows={false}
              onShouldStartLoadWithRequest={(request) =>
                isTikTokHttpsUrl(request.url)
              }
              onMessage={(event) => {
                let result: {
                  type?: string;
                  ok?: boolean;
                  error?: string | null;
                };
                try {
                  result = JSON.parse(event.nativeEvent.data) as typeof result;
                } catch {
                  return;
                }
                if (result.type === 'tiktok-storage-reset') {
                  void finishReset(!!result.ok, result.error || undefined);
                }
              }}
              onError={() => {
                void finishReset(
                  false,
                  'เปิดหน้า TikTok เพื่อล้างข้อมูลไม่สำเร็จ'
                );
              }}
              style={styles.hiddenWebview}
            />
          ) : null}
        </View>
      </Modal>
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
});

import { ActivityIndicator, Modal, TouchableOpacity, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TikTokLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import { TikTokWebView } from '@/tiktok/TikTokWebView';
import { isProfileLoggedIn } from '@/tiktok/tiktokCookieStore';
import type { KubdeeTheme } from '@/theme/tokens';

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
  const [status, setStatus] = useState<{ profileId: string; loggedIn: boolean } | null>(null);
  const loggedIn = status && status.profileId === profileId ? status.loggedIn : null;

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
    setOpen(false);
    // ยืนยันสถานะเซสชันที่บันทึกไว้อีกครั้งหลังปิด WebView
    if (profileId) {
      void isProfileLoggedIn(profileId)
        .then(handleLoginState)
        .catch(() => {
          // คงสถานะเดิมไว้ถ้าตรวจซ้ำไม่สำเร็จ
        });
    }
  }, [profileId, handleLoginState]);

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={
          loggedIn
            ? `จัดการ TikTok ของ ${profileName || 'โปรไฟล์นี้'}`
            : `ล็อกอิน TikTok ให้ ${profileName || 'โปรไฟล์นี้'}`
        }
        activeOpacity={0.7}
        onPress={() => setOpen(true)}
        className="w-11 items-center justify-center gap-1 border-l border-kd-border"
      >
        <TikTokLogo size={17} isDark={theme.isDark} />
        <View
          className={`h-1.5 w-1.5 rounded-full ${
            loggedIn ? 'bg-kd-emerald' : loggedIn === false ? 'bg-kd-border-strong' : 'bg-transparent'
          }`}
        />
      </TouchableOpacity>

      <Modal animationType="slide" visible={open} onRequestClose={closeModal}>
        <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-kd-screen">
          <View className="flex-row items-center gap-2 border-b border-kd-border bg-kd-panel px-3 py-2">
            <TikTokLogo size={16} isDark={theme.isDark} />
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
                TikTok
              </Text>
              <Text numberOfLines={1} className="text-kd-micro font-medium text-kd-text-subtle">
                {loggedIn
                  ? 'เชื่อมต่อแล้ว — login ครั้งเดียวใช้ได้ตลอด'
                  : profileName
                    ? `เข้าสู่ระบบ TikTok สำหรับ ${profileName}`
                    : 'เข้าสู่ระบบ TikTok เพื่อเชื่อมต่อ'}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityLabel="ปิด"
              accessibilityRole="button"
              activeOpacity={0.7}
              onPress={closeModal}
              className="h-8 w-8 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-panel"
            >
              <X size={16} color={theme.textSubtle} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
          <View className="flex-1">
            {open ? (
              <TikTokWebView
                profileId={profileId}
                onLoginStateChange={handleLoginState}
                onClose={closeModal}
              />
            ) : (
              <View className="flex-1 items-center justify-center bg-black">
                <ActivityIndicator color="#ffffff" />
              </View>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

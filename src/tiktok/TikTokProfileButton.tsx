import { ActivityIndicator, Alert, Modal, TouchableOpacity, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TikTokLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import { TikTokWebView } from '@/tiktok/TikTokWebView';
import { clearProfileTikTokSession, isProfileLoggedIn } from '@/tiktok/tiktokCookieStore';
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

  // ออกจากระบบ = ล้าง cookie TikTok ของโปรไฟล์นี้ + ลบไฟล์ snapshot
  const signOut = useCallback((): void => {
    Alert.alert(
      'ออกจากระบบ TikTok?',
      `เซสชัน TikTok ของ "${profileName || 'โปรไฟล์นี้'}" จะถูกล้างออกจากเครื่อง (ลบ cookie) ต้องล็อกอินใหม่เมื่อใช้งานอีกครั้ง`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ออกจากระบบ',
          style: 'destructive',
          onPress: () => {
            void clearProfileTikTokSession(profileId)
              .then(() => handleLoginState(false))
              .catch(() => {
                Alert.alert('ล้าง session ไม่สำเร็จ', 'ลองใหม่อีกครั้ง');
              });
          },
        },
      ]
    );
  }, [profileId, profileName, handleLoginState]);

  // แตะปุ่ม: ยังไม่ล็อกอิน → เปิด WebView; ล็อกอินแล้ว → เมนู เปิด/ออกจากระบบ
  const handlePress = useCallback((): void => {
    if (loggedIn) {
      Alert.alert(profileName ? `TikTok · ${profileName}` : 'TikTok', 'เชื่อมต่ออยู่', [
        { text: 'เปิดหน้า TikTok', onPress: () => setOpen(true) },
        { text: 'ออกจากระบบ / ล้าง session', style: 'destructive', onPress: signOut },
        { text: 'ยกเลิก', style: 'cancel' },
      ]);
    } else {
      setOpen(true);
    }
  }, [loggedIn, profileName, signOut]);

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
        onPress={handlePress}
        className="w-11 items-center justify-center border-l border-kd-border"
      >
        <View className="relative">
          <TikTokLogo size={18} isDark={theme.isDark} />
          {/* badge ติ๊กถูกสีเขียว โชว์เฉพาะตอนเชื่อมต่อแล้ว */}
          {loggedIn ? (
            <View className="absolute -bottom-1 -right-1 h-3.5 w-3.5 items-center justify-center rounded-full border border-kd-panel bg-kd-emerald">
              <Check size={9} color="#ffffff" strokeWidth={3.5} />
            </View>
          ) : null}
        </View>
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
              // ไม่ส่ง onClose — ใช้ปุ่มปิดของ header ด้านบนอันเดียว
              // (ถ้าส่ง TikTokWebView จะ render header + ปุ่มปิดของตัวเองซ้อนขึ้นมาอีกแถบ)
              <TikTokWebView profileId={profileId} onLoginStateChange={handleLoginState} />
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

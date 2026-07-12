import { ActivityIndicator, Alert, Modal, TouchableOpacity, View } from 'react-native';
import { CheckCircle2, LogOut, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TikTokLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import { TikTokWebView } from '@/tiktok/TikTokWebView';
import { clearProfileTikTokSession, isProfileLoggedIn } from '@/tiktok/tiktokCookieStore';
import type { KubdeeTheme } from '@/theme/tokens';

interface TikTokConnectionCardProps {
  profileId: string;
  profileName?: string;
  theme: KubdeeTheme;
}

/**
 * TikTok connection card for the active profile — mirrors the layout/behaviour of
 * GoogleFlowConnectionCard. Shows the login badge, opens the TikTokWebView in a
 * full-screen modal to log in, and clears the per-profile session on sign out.
 * Each profile keeps its own TikTok session (one active profile at a time).
 */
export default function TikTokConnectionCard({
  profileId,
  profileName,
  theme,
}: TikTokConnectionCardProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  // ผลตรวจ login ผูกกับ profileId ที่ตรวจ เพื่อ derive สถานะโดยไม่ต้อง reset state ใน effect:
  // พอ active profile เปลี่ยน สถานะจะกลับเป็น "กำลังตรวจสอบ" อัตโนมัติจนกว่าผลใหม่จะมา
  const [status, setStatus] = useState<{ profileId: string; loggedIn: boolean } | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const hasProfile = Boolean(profileId);
  // null = กำลังตรวจสอบ, true = ล็อกอินแล้ว, false = ยังไม่ล็อกอิน
  const loggedIn = status && status.profileId === profileId ? status.loggedIn : null;
  const checking = hasProfile && loggedIn === null;

  const setLoggedIn = useCallback(
    (value: boolean): void => {
      setStatus({ profileId, loggedIn: value });
    },
    [profileId]
  );

  // ตรวจสถานะ login ตอน mount และทุกครั้งที่เปลี่ยน active profile.
  // เมื่อไม่มี profileId การ์ดจะ render สาขา "ยังไม่ได้เลือกโปรไฟล์" อยู่แล้ว
  // (ไม่อ่าน loggedIn/checking) จึงไม่ต้อง reset state ที่นี่
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

  const closeModal = useCallback((): void => {
    setOpen(false);
    // ยืนยันสถานะเซสชันที่บันทึกไว้อีกครั้งหลังปิด WebView
    if (profileId) {
      void isProfileLoggedIn(profileId)
        .then(setLoggedIn)
        .catch(() => {
          // คงสถานะเดิมไว้ถ้าตรวจซ้ำไม่สำเร็จ
        });
    }
  }, [profileId, setLoggedIn]);

  const performSignOut = useCallback(async (): Promise<void> => {
    if (!profileId) {
      return;
    }

    setSigningOut(true);
    try {
      await clearProfileTikTokSession(profileId);
      setLoggedIn(false);
    } catch (error) {
      Alert.alert(
        'ออกจากระบบไม่สำเร็จ',
        error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง'
      );
    } finally {
      setSigningOut(false);
    }
  }, [profileId, setLoggedIn]);

  const handleSignOut = useCallback((): void => {
    Alert.alert(
      'ออกจากระบบ TikTok?',
      'เซสชัน TikTok ของโปรไฟล์นี้จะถูกลบออกจากเครื่อง ต้องล็อกอินใหม่เมื่อใช้งานอีกครั้ง',
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
  }, [performSignOut]);

  // ยังไม่ได้เลือกโปรไฟล์ — เชื่อม TikTok ต่อโปรไฟล์ไม่ได้
  if (!hasProfile) {
    return (
      <View className="gap-2 rounded-kd-xl border border-dashed border-kd-border bg-kd-card-muted p-3 dark:bg-kd-panel-muted">
        <View className="flex-row items-center gap-2">
          <View className="h-[38px] w-[38px] items-center justify-center rounded-kd-xl bg-white dark:bg-kd-card-muted">
            <TikTokLogo size={20} isDark={theme.isDark} />
          </View>
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
              TikTok
            </Text>
            <Text numberOfLines={2} className="mt-px text-kd-micro font-medium text-kd-text-subtle">
              เลือกโปรไฟล์ก่อน แล้วจึงเชื่อมต่อ TikTok ให้โปรไฟล์นั้น
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <>
      <View
        className={`gap-2 rounded-kd-xl border p-2 ${
          loggedIn ? 'border-kd-border bg-kd-panel' : 'border-kd-cyan/50 bg-kd-cyan-soft'
        }`}
      >
        <View className="flex-row items-center gap-2">
          <View className="h-[38px] w-[38px] items-center justify-center rounded-kd-xl bg-white dark:bg-kd-card-muted">
            <TikTokLogo size={20} isDark={theme.isDark} />
          </View>
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
              TikTok
            </Text>
            <Text numberOfLines={1} className="mt-px text-kd-micro font-medium text-kd-text-subtle">
              {loggedIn
                ? profileName
                  ? `เชื่อมต่อแล้ว · ${profileName}`
                  : 'เชื่อมต่อพร้อมใช้งาน'
                : profileName
                  ? `ยังไม่ล็อกอิน · ${profileName}`
                  : 'ยังไม่ล็อกอิน — เข้าสู่ระบบ TikTok ก่อนเริ่ม'}
            </Text>
          </View>
          <View
            className={`shrink-0 flex-row items-center gap-1 rounded-kd-md border px-2 py-1 ${
              loggedIn
                ? 'border-kd-emerald/40 bg-kd-emerald/10 dark:bg-kd-emerald/15'
                : 'border-kd-cyan/50 bg-white dark:bg-kd-card-muted'
            }`}
          >
            {checking ? (
              <ActivityIndicator size="small" color={theme.textMuted} />
            ) : (
              <Text
                className={`text-kd-tiny font-semibold ${loggedIn ? 'text-kd-emerald' : 'text-kd-cyan'}`}
              >
                {loggedIn ? 'เชื่อมต่อแล้ว' : 'ยังไม่ล็อกอิน'}
              </Text>
            )}
          </View>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          activeOpacity={0.82}
          onPress={() => setOpen(true)}
          className={`h-[34px] flex-row items-center justify-center gap-1.5 rounded-kd-lg border ${
            loggedIn ? 'border-kd-border bg-kd-panel' : 'border-transparent bg-kd-cyan'
          }`}
        >
          {loggedIn ? <CheckCircle2 size={13} color={theme.textMuted} strokeWidth={2.2} /> : null}
          <Text
            className={`text-kd-caption font-semibold ${loggedIn ? 'text-kd-text-muted' : 'text-white'}`}
            numberOfLines={1}
          >
            {loggedIn ? 'จัดการการเชื่อมต่อ' : 'เปิด / ล็อกอิน TikTok'}
          </Text>
        </TouchableOpacity>

        {loggedIn ? (
          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.78}
            disabled={signingOut}
            onPress={handleSignOut}
            className="h-[34px] flex-row items-center justify-center gap-1.5 rounded-kd-lg border border-kd-red/35 bg-kd-red/5 disabled:opacity-50 dark:bg-kd-red/10"
          >
            {signingOut ? (
              <ActivityIndicator size="small" color={theme.red} />
            ) : (
              <LogOut size={13} color={theme.red} strokeWidth={2.2} />
            )}
            <Text className="text-kd-caption font-semibold text-kd-red" numberOfLines={1}>
              {signingOut ? 'กำลังออกจากระบบ' : 'ออกจากระบบ TikTok'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

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
            <TikTokWebView
              profileId={profileId}
              onLoginStateChange={setLoggedIn}
              onClose={closeModal}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

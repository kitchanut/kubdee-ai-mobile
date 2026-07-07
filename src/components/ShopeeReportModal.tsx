import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, TextInput, View } from 'react-native';
import { toast } from 'sonner-native';

import Text from '@/components/ui/KubdeeText';
import {
  discardShopeeManualReport,
  sendShopeeManualReport,
  takePendingShopeeManualReport,
  type ShopeeManualReport,
} from '@/lib/shopeeDiagnostic';
import { kubdeeFontFamilies } from '@/theme/fonts';
import type { KubdeeTheme } from '@/theme/tokens';
import { getCurrentMobileVersion } from '@/updates/mobileUpdate';

interface ShopeeReportModalProps {
  theme: KubdeeTheme;
}

/**
 * When the user taps "รายงานปัญหา" on the Shopee overlay (after Stop), the native side captures
 * the run log + screen tree + screenshot and jumps back into the app. This modal picks that
 * pending report up (on app start AND on foreground, so a cold start still catches it), lets the
 * user describe what went wrong, and sends everything to Sentry.
 */
export default function ShopeeReportModal({ theme }: ShopeeReportModalProps): React.JSX.Element | null {
  const [report, setReport] = useState<ShopeeManualReport | null>(null);
  const [description, setDescription] = useState('');
  const [isSending, setIsSending] = useState(false);

  const checkPendingReport = useCallback(() => {
    void takePendingShopeeManualReport().then((pending) => {
      if (pending) {
        setReport((current) => current ?? pending);
      }
    });
  }, []);

  useEffect(() => {
    // Cold start: AppState never transitions to 'active', so check once on mount too.
    checkPendingReport();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkPendingReport();
      }
    });
    return () => subscription.remove();
  }, [checkPendingReport]);

  const closeAndReset = useCallback(() => {
    setReport(null);
    setDescription('');
    setIsSending(false);
  }, []);

  const handleSend = useCallback(() => {
    if (!report || isSending) return;
    setIsSending(true);
    void sendShopeeManualReport(report, description, { appVersion: getCurrentMobileVersion() })
      .then(() => {
        closeAndReset();
        toast.success('ส่งรายงานให้ทีมแล้ว ขอบคุณครับ');
      })
      .catch(() => {
        closeAndReset();
      });
  }, [closeAndReset, description, isSending, report]);

  const handleDiscard = useCallback(() => {
    if (isSending) return;
    void discardShopeeManualReport();
    closeAndReset();
  }, [closeAndReset, isSending]);

  if (!report) return null;

  return (
    <Modal animationType="fade" onRequestClose={handleDiscard} transparent visible>
      <View className="flex-1 items-center justify-center bg-black/60 px-5">
        <View
          className="w-full max-w-[420px] rounded-[12px] border border-kd-border bg-kd-panel p-5"
          style={{
            shadowColor: theme.shadow,
            shadowOffset: { width: 0, height: 18 },
            shadowOpacity: 0.24,
            shadowRadius: 28,
            elevation: 18,
          }}
        >
          <Text className="text-base font-semibold text-kd-text">รายงานปัญหาถึงทีม</Text>
          <Text className="mt-1 text-kd-caption leading-[18px] text-kd-text-subtle">
            ระบบเก็บ log การทำงานและภาพหน้าจอไว้ให้แล้ว เล่าเพิ่มเติมหน่อยว่าเกิดอะไรขึ้น
            จะช่วยให้ทีมแก้ปัญหาได้เร็วขึ้น
          </Text>

          <TextInput
            autoFocus
            editable={!isSending}
            multiline
            numberOfLines={4}
            placeholder="เช่น กดดึงสินค้าแล้วค้างที่หน้ารายการถูกใจ ไม่ยอมเลื่อน (ไม่บังคับ)"
            placeholderTextColor={theme.textSubtle}
            textAlignVertical="top"
            value={description}
            onChangeText={setDescription}
            className="mt-4 min-h-24 rounded-kd-lg border border-kd-border bg-kd-input px-3 py-2 text-kd-body text-kd-text"
            style={{ fontFamily: kubdeeFontFamilies.thai.regular }}
          />

          <View className="mt-4 flex-row justify-end gap-2">
            <Pressable
              accessibilityLabel="ไม่ส่งรายงาน"
              accessibilityRole="button"
              disabled={isSending}
              onPress={handleDiscard}
              className="rounded-kd-lg border border-kd-border px-4 py-2 active:bg-kd-panel-muted dark:active:bg-kd-card-muted"
            >
              <Text className="text-kd-body font-medium text-kd-text-muted">ไม่ส่ง</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="ส่งรายงานปัญหา"
              accessibilityRole="button"
              disabled={isSending}
              onPress={handleSend}
              className="flex-row items-center gap-2 rounded-kd-lg bg-[#111827] px-4 py-2 active:opacity-80 dark:bg-white"
            >
              {isSending ? (
                <ActivityIndicator color={theme.isDark ? '#111827' : '#ffffff'} size="small" />
              ) : null}
              <Text className="text-kd-body font-semibold text-white dark:text-[#111827]">
                ส่งรายงาน
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

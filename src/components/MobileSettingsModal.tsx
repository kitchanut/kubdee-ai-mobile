import { BrainCircuit, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { toast } from 'sonner-native';

import {
  DEFAULT_AI_BRAIN_SETTINGS,
  getAiBrainSettings,
  saveAiBrainSettings,
  type AiBrainSettings,
} from '@/autopilot/aiBrainSettingsStore';
import Text from '@/components/ui/KubdeeText';
import AiBrainSettingsForm from '@/screens/profile/AiBrainSettingsCard';
import type { KubdeeTheme } from '@/theme/tokens';

interface MobileSettingsModalProps {
  visible: boolean;
  theme: KubdeeTheme;
  onClose: () => void;
}

// โมดัล "ตั้งค่า" — mirror จาก kubdee-ai-extension SettingsModal
// extension มี tab สมอง/Prompt/เครื่องมือ — mobile มีเฉพาะ tab "สมอง" ก่อน (โครง tab bar เดียวกัน)
// แก้ค่าเป็น draft ในเครื่อง แล้วบันทึกจริงเมื่อกด "บันทึก" (ยกเลิก/X = ปิดโดยไม่บันทึก)
// backdrop ปิดได้เฉพาะตอนยังไม่แก้อะไร — กันเผลอแตะพื้นหลังแล้ว draft หาย
export default function MobileSettingsModal({
  visible,
  theme,
  onClose,
}: MobileSettingsModalProps): React.JSX.Element {
  const { height } = useWindowDimensions();
  const [draft, setDraft] = useState<AiBrainSettings>(DEFAULT_AI_BRAIN_SETTINGS);
  const [original, setOriginal] = useState<AiBrainSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // โหลดค่าที่บันทึกไว้ใหม่ทุกครั้งที่เปิดโมดัล — ทิ้ง draft เดิมที่ไม่ได้บันทึก
  useEffect(() => {
    if (!visible) {
      return;
    }

    let active = true;
    Promise.resolve()
      .then(() => {
        if (active) {
          setIsLoading(true);
          setSaveError(null);
        }
        return getAiBrainSettings();
      })
      .then((stored) => {
        if (active) {
          setDraft(stored);
          setOriginal(stored);
        }
      })
      .catch(() => {
        if (active) {
          setDraft(DEFAULT_AI_BRAIN_SETTINGS);
          setOriginal(DEFAULT_AI_BRAIN_SETTINGS);
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [visible]);

  const isDirty = original !== null && JSON.stringify(draft) !== JSON.stringify(original);

  const handleBackdropPress = (): void => {
    if (!isDirty && !isSaving) {
      onClose();
    }
  };

  const handleSave = async (): Promise<void> => {
    if (isSaving || isLoading) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      await saveAiBrainSettings(draft);
      toast.success('บันทึกการตั้งค่าแล้ว');
      onClose();
    } catch {
      setSaveError('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View className="flex-1 items-center justify-center bg-black/60 px-4">
        <Pressable className="absolute inset-0" onPress={handleBackdropPress} />
        <View
          className="w-full max-w-[512px] overflow-hidden rounded-[12px] border border-kd-border bg-kd-panel"
          style={{
            shadowColor: theme.shadow,
            shadowOffset: { width: 0, height: 18 },
            shadowOpacity: 0.24,
            shadowRadius: 28,
            elevation: 18,
            maxHeight: Math.max(380, Math.floor(height * 0.84)),
          }}
        >
          {/* header — title + X แถวบน แล้วตามด้วย underline tab bar (โครงเดียวกับ extension) */}
          <View className="border-b border-kd-border">
            <View className="flex-row items-center justify-between gap-3 px-4 pb-1 pt-4">
              <Text className="text-base font-semibold text-kd-text">ตั้งค่า</Text>
              <Pressable
                accessibilityLabel="ปิดการตั้งค่า"
                accessibilityRole="button"
                hitSlop={8}
                onPress={onClose}
                className="mr-[-6px] h-8 w-8 items-center justify-center rounded-kd-lg active:bg-kd-panel-muted dark:active:bg-kd-card-muted"
              >
                <X size={16} color={theme.textSubtle} strokeWidth={2.2} />
              </Pressable>
            </View>

            {/* tab bar — extension มี สมอง/Prompt/เครื่องมือ; mobile มีแค่ "สมอง" (active เสมอ) */}
            <View className="flex-row gap-1 px-4">
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: true }}
                className="flex-row items-center gap-1.5 border-b-2 border-gray-900 px-3 py-2 dark:border-white"
              >
                <BrainCircuit size={12} color={theme.text} strokeWidth={2.4} />
                <Text className="text-kd-body font-semibold text-kd-text">สมอง</Text>
              </Pressable>
            </View>
          </View>

          {/* tab "สมอง" — controlled form; draft อยู่ที่โมดัลนี้ */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: Math.max(240, Math.floor(height * 0.6)) }}
          >
            {isLoading ? (
              // กัน default แวบก่อนค่าจริงโหลดเสร็จ — คง layout สูงใกล้เคียงฟอร์มจริง
              <View className="h-[220px] items-center justify-center">
                <ActivityIndicator color={theme.textMuted} size="small" />
              </View>
            ) : (
              <View className="gap-2.5 p-4">
                <AiBrainSettingsForm theme={theme} settings={draft} onChange={setDraft} />
              </View>
            )}
          </ScrollView>

          {/* footer — ยกเลิก/บันทึก 2 ปุ่มตาม pattern ของแอป (create-profile modal) */}
          <View className="gap-2 border-t border-kd-border p-3">
            {saveError ? (
              <Text className="text-kd-micro font-medium text-kd-red">{saveError}</Text>
            ) : null}
            <View className="flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                disabled={isSaving}
                onPress={onClose}
                className="h-[34px] flex-1 flex-row items-center justify-center rounded-kd-lg border border-kd-border bg-kd-panel active:bg-kd-panel-muted dark:active:bg-kd-card-muted"
              >
                <Text className="text-kd-body font-semibold text-kd-text-muted">ยกเลิก</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: isSaving || isLoading }}
                disabled={isSaving || isLoading}
                onPress={() => {
                  void handleSave();
                }}
                className={`h-[34px] flex-1 flex-row items-center justify-center gap-1.5 rounded-kd-lg bg-gray-900 active:opacity-85 dark:bg-white ${
                  isSaving || isLoading ? 'opacity-60' : ''
                }`}
              >
                {isSaving ? (
                  <ActivityIndicator color={theme.isDark ? '#0f172a' : '#ffffff'} size="small" />
                ) : null}
                <Text className="text-kd-body font-semibold text-white dark:text-gray-900">บันทึก</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

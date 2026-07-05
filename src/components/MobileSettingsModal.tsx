import { BrainCircuit, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';

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
// แก้ค่าเป็น draft ในเครื่อง แล้วบันทึกจริงเมื่อกด "บันทึก" (X/backdrop = ปิดโดยไม่บันทึก)
export default function MobileSettingsModal({
  visible,
  theme,
  onClose,
}: MobileSettingsModalProps): React.JSX.Element {
  const { height } = useWindowDimensions();
  const [draft, setDraft] = useState<AiBrainSettings>(DEFAULT_AI_BRAIN_SETTINGS);

  // โหลดค่าที่บันทึกไว้ใหม่ทุกครั้งที่เปิดโมดัล — ทิ้ง draft เดิมที่ไม่ได้บันทึก
  useEffect(() => {
    if (!visible) {
      return;
    }

    let active = true;
    getAiBrainSettings()
      .then((stored) => {
        if (active) {
          setDraft(stored);
        }
      })
      .catch(() => {
        if (active) {
          setDraft(DEFAULT_AI_BRAIN_SETTINGS);
        }
      });

    return () => {
      active = false;
    };
  }, [visible]);

  const handleSave = (): void => {
    void saveAiBrainSettings(draft);
    onClose();
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View className="flex-1 items-center justify-center bg-black/60 px-4">
        <Pressable className="absolute inset-0" onPress={onClose} />
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
            <View className="gap-2.5 p-4">
              <AiBrainSettingsForm theme={theme} settings={draft} onChange={setDraft} />
            </View>
          </ScrollView>

          {/* footer — บันทึก draft แล้วปิด */}
          <View className="flex-row justify-end border-t border-kd-border p-3">
            <Pressable
              accessibilityRole="button"
              onPress={handleSave}
              className="h-[34px] flex-row items-center justify-center rounded-kd-lg bg-gray-900 px-4 active:opacity-85 dark:bg-white"
            >
              <Text className="text-kd-body font-semibold text-white dark:text-gray-900">บันทึก</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

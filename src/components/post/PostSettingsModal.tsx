import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Settings, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';

interface PostSettingsModalProps {
  children: ReactNode;
  onClose: () => void;
  theme: KubdeeTheme;
  title: string;
  visible: boolean;
}

/** Shared settings shell for social post screens. Keep layout consistent with Shopee. */
export default function PostSettingsModal({
  children,
  onClose,
  theme,
  title,
  visible,
}: PostSettingsModalProps): React.JSX.Element {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View
        className="flex-1 justify-center bg-black/60"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View
          className="mx-3 overflow-hidden rounded-kd-2xl border border-kd-border bg-kd-panel"
          style={{ height: '95%' }}
        >
          <View className="flex-row items-center justify-between border-b border-kd-border bg-kd-card px-3 py-3">
            <View className="min-w-0 flex-1 flex-row items-center gap-2">
              <View className="h-8 w-8 items-center justify-center rounded-kd-lg bg-kd-panel-muted dark:bg-kd-card-muted">
                <Settings size={15} color={theme.textMuted} strokeWidth={2.1} />
              </View>
              <Text numberOfLines={1} className="min-w-0 flex-1 text-kd-label font-semibold text-kd-text">
                {title}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={`ปิด${title}`}
              accessibilityRole="button"
              onPress={onClose}
              className="h-8 w-8 items-center justify-center rounded-kd-md bg-kd-panel-muted active:opacity-70 dark:bg-kd-card-muted"
            >
              <X size={15} color={theme.textMuted} strokeWidth={2.3} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-1.5 p-2.5">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

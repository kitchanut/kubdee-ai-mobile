import { View } from 'react-native';
import { Check, Sparkles, Tag, TriangleAlert } from 'lucide-react-native';

import Text from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';

// สถานะช่องเนื้อหา (แคปชั่น/แฮชแท็ก) ต่อคลิป — ใช้ร่วมกันทั้งหน้าโพสต์ Shopee และ TikTok
// present  = มีแล้ว
// ai       = ยังไม่มีแต่ AI จะคิดให้ตอนโพสต์ (เฉพาะหน้าที่เปิด AI คิด content)
// product  = ยังไม่มีแต่จะ fallback ใช้ชื่อสินค้าเป็นแคปชั่นแทน
// missing  = ไม่มีเลย (เตือน)
export type PostFieldState = 'present' | 'ai' | 'product' | 'missing';

export function resolvePostCaptionState(
  caption: string | null | undefined,
  aiWillGenerate: boolean,
  hasProductFallback: boolean
): PostFieldState {
  if (caption?.trim()) {
    return 'present';
  }
  if (aiWillGenerate) {
    return 'ai';
  }
  if (hasProductFallback) {
    return 'product';
  }
  return 'missing';
}

export function resolvePostHashtagState(
  hashtags: string | null | undefined,
  aiWillGenerate: boolean
): PostFieldState {
  if (hashtags?.trim()) {
    return 'present';
  }
  if (aiWillGenerate) {
    return 'ai';
  }
  return 'missing';
}

export function PostContentChip({
  label,
  state,
  theme,
}: {
  label: string;
  state: PostFieldState;
  theme: KubdeeTheme;
}): React.JSX.Element {
  const isMissing = state === 'missing';
  const text =
    state === 'present'
      ? label
      : state === 'ai'
        ? `${label} · AI`
        : state === 'product'
          ? 'ใช้ชื่อสินค้าเป็นแคปชั่น'
          : `ไม่มี${label}`;

  return (
    <View
      className={`flex-row items-center gap-1 rounded-kd-md border px-1.5 py-0.5 ${
        isMissing ? 'border-kd-amber/40 bg-kd-amber/10' : 'border-kd-border bg-kd-panel-muted dark:bg-kd-card-muted'
      }`}
    >
      {state === 'present' ? (
        <Check size={10} color={theme.emerald} strokeWidth={2.6} />
      ) : state === 'ai' ? (
        <Sparkles size={10} color={theme.textMuted} strokeWidth={2.2} />
      ) : state === 'product' ? (
        <Tag size={10} color={theme.textMuted} strokeWidth={2.2} />
      ) : (
        <TriangleAlert size={10} color={theme.amber} strokeWidth={2.4} />
      )}
      <Text className={`text-kd-micro ${isMissing ? 'text-kd-amber' : 'text-kd-text-subtle'}`}>{text}</Text>
    </View>
  );
}

// chip เตือนสีเหลืองทั่วไป (เช่น "ไฟล์ยังไม่พร้อม") — หน้าตาเดียวกับสถานะ missing
export function PostWarnChip({ text, theme }: { text: string; theme: KubdeeTheme }): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-1 rounded-kd-md border border-kd-amber/40 bg-kd-amber/10 px-1.5 py-0.5">
      <TriangleAlert size={10} color={theme.amber} strokeWidth={2.4} />
      <Text className="text-kd-micro text-kd-amber">{text}</Text>
    </View>
  );
}

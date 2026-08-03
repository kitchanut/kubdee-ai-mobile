import { cn } from '@/lib/utils';
import * as ProgressPrimitive from '@rn-primitives/progress';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  indicatorClassName?: string;
}) {
  return (
    <ProgressPrimitive.Root
      className={cn('bg-primary/20 relative h-2 w-full overflow-hidden rounded-full', className)}
      {...props}>
      <Indicator value={value} className={indicatorClassName} />
    </ProgressPrimitive.Root>
  );
}

export { Progress };

const Indicator = Platform.select({
  web: WebIndicator,
  native: NativeIndicator,
  default: NullIndicator,
});

type IndicatorProps = {
  value: number | undefined | null;
  className?: string;
};

function WebIndicator({ value, className }: IndicatorProps) {
  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <View
      className={cn('bg-primary h-full w-full flex-1 transition-all', className)}
      style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}>
      <ProgressPrimitive.Indicator className={cn('h-full w-full', className)} />
    </View>
  );
}

function NativeIndicator({ value, className }: IndicatorProps) {
  // spring ต้อง retarget (ไม่ restart) เมื่อ value เปลี่ยน: เก็บ progress เป็น shared value
  // แล้วสั่ง withSpring จาก useEffect — reanimated จะสานต่อจากตำแหน่ง/ความเร็วปัจจุบัน
  // (แบบเดิมที่ withSpring อยู่ใน useAnimatedStyle deps [value] จะเริ่ม spring ใหม่ทุกอัปเดต)
  const progress = useSharedValue(clampProgress(value));
  const trackWidth = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(clampProgress(value), { overshootClamping: true });
  }, [progress, value]);

  // เลื่อนแท่ง w-full ด้วย translateX แทนการ animate width% — transform ไม่แตะ layout
  // (ไม่เกิด Fabric mount transaction ต่อเฟรม) ภาพเท่าเดิมเพราะ Root เป็นคน clip มุมโค้ง
  // ด้วย overflow-hidden rounded-full อยู่แล้ว (วิธีเดียวกับ WebIndicator ด้านบน)
  const indicator = useAnimatedStyle(() => {
    if (trackWidth.value === 0) {
      // ยังไม่รู้ความกว้าง track — ซ่อนไว้ก่อน กันแท่งเต็มวาบหนึ่งเฟรมตอน mount
      return { opacity: 0, transform: [{ translateX: 0 }] };
    }
    const visiblePercent = interpolate(progress.value, [0, 100], [1, 100], Extrapolation.CLAMP);
    return {
      opacity: 1,
      transform: [{ translateX: (-trackWidth.value * (100 - visiblePercent)) / 100 }],
    };
  });

  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <ProgressPrimitive.Indicator asChild>
      <Animated.View
        onLayout={(event) => {
          trackWidth.value = event.nativeEvent.layout.width;
        }}
        style={indicator}
        className={cn('bg-foreground h-full w-full', className)}
      />
    </ProgressPrimitive.Indicator>
  );
}

function clampProgress(value: number | undefined | null): number {
  return Math.max(0, Math.min(100, value ?? 0));
}

function NullIndicator(_props: IndicatorProps) {
  return null;
}

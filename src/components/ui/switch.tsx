import { cn } from '@/lib/utils';
import * as SwitchPrimitives from '@rn-primitives/switch';
import { useEffect, useState } from 'react';
import { Animated, Platform } from 'react-native';

type SwitchSize = 'md' | 'sm';

const sizeConfig: Record<SwitchSize, { root: string; thumb: string; thumbSize: number; onX: number; offX: number }> = {
  md: {
    root: 'h-8 w-14',
    thumb: 'size-7',
    thumbSize: 28,
    onX: 24,
    offX: 0,
  },
  sm: {
    root: 'h-5 w-9',
    thumb: 'size-4',
    thumbSize: 16,
    onX: 16,
    offX: 2,
  },
};

function Switch({
  className,
  size = 'md',
  ...props
}: React.ComponentProps<typeof SwitchPrimitives.Root> & { size?: SwitchSize }) {
  const config = sizeConfig[size];
  const [translateX] = useState(
    () => new Animated.Value(props.checked ? config.onX : config.offX)
  );

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: props.checked ? config.onX : config.offX,
      useNativeDriver: true,
      bounciness: 4,
      speed: 20,
    }).start();
  }, [props.checked, config.onX, config.offX, translateX]);

  return (
    <SwitchPrimitives.Root
      className={cn(
        'flex shrink-0 flex-row items-center rounded-full border border-transparent shadow-sm shadow-black/5',
        config.root,
        Platform.select({
          web: 'focus-visible:border-ring focus-visible:ring-ring/50 peer inline-flex outline-none transition-all focus-visible:ring-[3px] disabled:cursor-not-allowed',
        }),
        props.checked ? 'bg-kd-amber' : 'bg-kd-border-strong dark:bg-kd-card-muted',
        props.disabled && 'opacity-50',
        className
      )}
      {...props}>
      <Animated.View style={{ transform: [{ translateX }] }}>
        <SwitchPrimitives.Thumb
          className={cn(
            'rounded-full bg-white dark:bg-white',
            config.thumb,
            Platform.select({ web: 'pointer-events-none block ring-0' })
          )}
        />
      </Animated.View>
    </SwitchPrimitives.Root>
  );
}

export { Switch };

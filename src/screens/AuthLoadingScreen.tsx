import { cssInterop } from 'nativewind';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Text as NativeText, View } from 'react-native';

import KubdeeText from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';

const logoDark = require('../../assets/logo-dark.png');
const logoLight = require('../../assets/logo-light.png');

// Animated.View is not interopped by NativeWind's preset — resolve className
// into style (same pattern as KubdeeText). Animated values stay in style={}.
cssInterop(Animated.View, { className: 'style' });

const verifySteps = [
  'กำลังยืนยันเซสชันผู้ใช้',
  'กำลังตรวจสอบสิทธิ์การใช้งาน',
  'กำลังเตรียมข้อมูลโปรไฟล์',
];

interface AuthLoadingScreenProps {
  theme: KubdeeTheme;
  useSystemText?: boolean;
}

interface LoadingTextProps {
  children: string;
  className: string;
  useSystemText: boolean;
}

function LoadingText({ children, className, useSystemText }: LoadingTextProps): React.JSX.Element {
  if (useSystemText) {
    return <NativeText className={className}>{children}</NativeText>;
  }

  return <KubdeeText className={className}>{children}</KubdeeText>;
}

export default function AuthLoadingScreen({
  theme,
  useSystemText = false,
}: AuthLoadingScreenProps): React.JSX.Element {
  const entrance = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const logoPulse = useRef(new Animated.Value(1)).current;
  const stepOpacity = useRef(new Animated.Value(1)).current;
  const [stepIndex, setStepIndex] = useState(0);

  const progressTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-48, 144],
  });
  const entranceTranslateY = entrance.interpolate({
    inputRange: [0, 1],
    outputRange: [10, 0],
  });

  useEffect(() => {
    Animated.timing(entrance, {
      duration: 520,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [entrance]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          duration: 1200,
          easing: Easing.inOut(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          duration: 0,
          toValue: 0,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [progress]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(logoPulse, {
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          toValue: 0.82,
          useNativeDriver: true,
        }),
        Animated.timing(logoPulse, {
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [logoPulse]);

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(stepOpacity, {
        duration: 200,
        toValue: 0,
        useNativeDriver: true,
      }).start(() => {
        setStepIndex((current) => (current + 1) % verifySteps.length);
        Animated.timing(stepOpacity, {
          duration: 240,
          toValue: 1,
          useNativeDriver: true,
        }).start();
      });
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [stepOpacity]);

  return (
    <View className="flex-1 items-center justify-center bg-white pb-7 pt-12 dark:bg-[#0a0a0a]">
      <Animated.View
        className="flex-1 items-center justify-center gap-7 px-8"
        style={{ opacity: entrance, transform: [{ translateY: entranceTranslateY }] }}
      >
        <Animated.View style={{ opacity: logoPulse }}>
          <Image source={theme.isDark ? logoLight : logoDark} resizeMode="contain" className="h-[52px] w-[52px]" />
        </Animated.View>

        <View className="max-w-[280px] items-center gap-1.5">
          <LoadingText
            className="text-center text-[15px] font-bold leading-[21px] tracking-[0.2px] text-[#0a0a0a] dark:text-[#fafafa]"
            useSystemText={useSystemText}
          >
            กำลังตรวจสอบบัญชี
          </LoadingText>
          <Animated.View style={{ opacity: stepOpacity }}>
            <LoadingText
              className="text-center text-kd-body font-medium leading-[17px] text-[#6b6b6b] dark:text-[#8f8f8f]"
              useSystemText={useSystemText}
            >
              {verifySteps[stepIndex]}
            </LoadingText>
          </Animated.View>
        </View>

        <View
          accessibilityLabel="กำลังตรวจสอบบัญชี"
          accessibilityRole="progressbar"
          className="h-0.5 w-36 overflow-hidden rounded-full bg-[#f0f0f0] dark:bg-[#1f1f1f]"
        >
          <Animated.View
            className="h-full w-12 rounded-full bg-[#0a0a0a] dark:bg-[#fafafa]"
            style={{ transform: [{ translateX: progressTranslateX }] }}
          />
        </View>
      </Animated.View>

      <Animated.View className="items-center" style={{ opacity: entrance }}>
        <LoadingText
          className="text-center text-kd-tiny font-bold tracking-[2.5px] text-[#a3a3a3] dark:text-[#5c5c5c]"
          useSystemText={useSystemText}
        >
          KUBDEE AI
        </LoadingText>
      </Animated.View>
    </View>
  );
}

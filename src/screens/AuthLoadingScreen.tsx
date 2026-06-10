import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text as NativeText, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';

import KubdeeText from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';

const logoDark = require('../../assets/logo-dark.png');
const logoLight = require('../../assets/logo-light.png');

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
  style: StyleProp<TextStyle>;
  useSystemText: boolean;
}

function getLoadingPalette(isDark: boolean) {
  return isDark
    ? {
        background: '#0a0a0a',
        progressFill: '#fafafa',
        progressTrack: '#1f1f1f',
        text: '#fafafa',
        textMuted: '#8f8f8f',
        textSubtle: '#5c5c5c',
      }
    : {
        background: '#ffffff',
        progressFill: '#0a0a0a',
        progressTrack: '#f0f0f0',
        text: '#0a0a0a',
        textMuted: '#6b6b6b',
        textSubtle: '#a3a3a3',
      };
}

function LoadingText({ children, style, useSystemText }: LoadingTextProps): React.JSX.Element {
  if (useSystemText) {
    return <NativeText style={style}>{children}</NativeText>;
  }

  return <KubdeeText style={style}>{children}</KubdeeText>;
}

export default function AuthLoadingScreen({
  theme,
  useSystemText = false,
}: AuthLoadingScreenProps): React.JSX.Element {
  const palette = useMemo(() => getLoadingPalette(theme.isDark), [theme.isDark]);
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
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <Animated.View
        style={[
          styles.center,
          { opacity: entrance, transform: [{ translateY: entranceTranslateY }] },
        ]}
      >
        <Animated.View style={{ opacity: logoPulse }}>
          <Image source={theme.isDark ? logoLight : logoDark} resizeMode="contain" style={styles.logo} />
        </Animated.View>

        <View style={styles.copy}>
          <LoadingText style={[styles.title, { color: palette.text }]} useSystemText={useSystemText}>
            กำลังตรวจสอบบัญชี
          </LoadingText>
          <Animated.View style={{ opacity: stepOpacity }}>
            <LoadingText
              style={[styles.description, { color: palette.textMuted }]}
              useSystemText={useSystemText}
            >
              {verifySteps[stepIndex]}
            </LoadingText>
          </Animated.View>
        </View>

        <View
          accessibilityLabel="กำลังตรวจสอบบัญชี"
          accessibilityRole="progressbar"
          style={[styles.progressTrack, { backgroundColor: palette.progressTrack }]}
        >
          <Animated.View
            style={[
              styles.progressFill,
              {
                backgroundColor: palette.progressFill,
                transform: [{ translateX: progressTranslateX }],
              },
            ]}
          />
        </View>
      </Animated.View>

      <Animated.View style={[styles.footer, { opacity: entrance }]}>
        <LoadingText style={[styles.footerText, { color: palette.textSubtle }]} useSystemText={useSystemText}>
          KUBDEE AI
        </LoadingText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    flex: 1,
    gap: 28,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 28,
    paddingTop: 48,
  },
  copy: {
    alignItems: 'center',
    gap: 6,
    maxWidth: 280,
  },
  description: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    textAlign: 'center',
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.5,
    textAlign: 'center',
  },
  logo: {
    height: 52,
    width: 52,
  },
  progressFill: {
    borderRadius: 999,
    height: '100%',
    width: 48,
  },
  progressTrack: {
    borderRadius: 999,
    height: 2,
    overflow: 'hidden',
    width: 144,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
    lineHeight: 21,
    textAlign: 'center',
  },
});

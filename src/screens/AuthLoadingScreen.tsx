import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text as NativeText, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';

import KubdeeText from '@/components/ui/KubdeeText';
import type { KubdeeTheme } from '@/theme/tokens';
import { typography } from '@/theme/tokens';

const logoDark = require('../../assets/logo-dark.png');
const logoLight = require('../../assets/logo-light.png');

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
        background: '#050505',
        progressFill: '#f5f5f5',
        progressTrack: '#242424',
        text: '#f5f5f5',
        textMuted: '#a3a3a3',
        textSubtle: '#737373',
      }
    : {
        background: '#ffffff',
        progressFill: '#111111',
        progressTrack: '#eeeeee',
        text: '#111111',
        textMuted: '#525252',
        textSubtle: '#8a8a8a',
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
  const progress = useRef(new Animated.Value(0)).current;
  const progressTranslateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-56, 168],
  });

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          duration: 1150,
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

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <View style={styles.center}>
        <Image source={theme.isDark ? logoLight : logoDark} resizeMode="contain" style={styles.logo} />

        <View style={styles.copy}>
          <LoadingText style={[styles.kicker, { color: palette.textSubtle }]} useSystemText={useSystemText}>
            KUBDEE AI
          </LoadingText>
          <LoadingText style={[styles.title, { color: palette.text }]} useSystemText={useSystemText}>
            กำลังตรวจสอบบัญชี
          </LoadingText>
          <LoadingText style={[styles.description, { color: palette.textMuted }]} useSystemText={useSystemText}>
            กำลังยืนยันเซสชันและสิทธิ์การใช้งาน
          </LoadingText>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    flex: 1,
    gap: 22,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 48,
  },
  copy: {
    alignItems: 'center',
    gap: 7,
    maxWidth: 280,
  },
  description: {
    fontSize: typography.body,
    fontWeight: '600',
    lineHeight: 18,
    textAlign: 'center',
  },
  kicker: {
    fontSize: typography.micro,
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center',
  },
  logo: {
    height: 76,
    width: 76,
  },
  progressFill: {
    borderRadius: 999,
    height: '100%',
    width: 54,
  },
  progressTrack: {
    borderRadius: 999,
    height: 3,
    overflow: 'hidden',
    width: 168,
  },
  title: {
    fontSize: typography.title,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 25,
    textAlign: 'center',
  },
});

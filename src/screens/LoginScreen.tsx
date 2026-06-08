import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Moon, Sun, TriangleAlert } from 'lucide-react-native';

import IconButton from '@/components/ui/IconButton';
import Text from '@/components/ui/KubdeeText';
import { toThaiPlanError } from '@/auth/plan';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha, radii, spacing, typography } from '@/theme/tokens';

const logoDark = require('../../assets/logo-dark.png');
const logoLight = require('../../assets/logo-light.png');

interface LoginScreenProps {
  authError: string | null;
  isLoggingIn: boolean;
  theme: KubdeeTheme;
  onLogin: () => Promise<void>;
  onThemeModeToggle: () => void;
}

function GoogleLogo(): React.JSX.Element {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.6 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10 0 19-7.3 19-20 0-1.3-.1-2.4-.4-3.5z"
      />
      <Path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.2 18.9 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.2C29.4 35.1 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.5 16.2 44 24 44z"
      />
      <Path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </Svg>
  );
}

export default function LoginScreen({
  authError,
  isLoggingIn,
  theme,
  onLogin,
  onThemeModeToggle,
}: LoginScreenProps): React.JSX.Element {
  const ThemeIcon = theme.isDark ? Moon : Sun;
  const loginBackground = theme.isDark ? theme.white : '#111827';
  const loginForeground = theme.isDark ? '#111827' : theme.white;

  return (
    <View style={[styles.container, { backgroundColor: theme.panel }]}>
      <View style={styles.topRow}>
        <IconButton
          icon={ThemeIcon}
          size={36}
          iconSize={18}
          color={theme.isDark ? theme.blue : theme.amber}
          backgroundColor={theme.isDark ? theme.active : theme.amberSoft}
          onPress={onThemeModeToggle}
        />
      </View>

      <View style={styles.center}>
        <Image source={theme.isDark ? logoLight : logoDark} resizeMode="contain" style={styles.logo} />

        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: theme.text }]}>Kubdee AI</Text>
          <Text style={[styles.subtitle, { color: theme.textSubtle }]}>Mobile Automation</Text>
        </View>

        <View style={styles.loginSection}>
          <Pressable
            accessibilityRole="button"
            disabled={isLoggingIn}
            onPress={onLogin}
            style={({ pressed }) => [
              styles.loginPressable,
              {
                opacity: isLoggingIn ? 0.65 : pressed ? 0.82 : 1,
              },
            ]}
          >
            <View style={[styles.loginButton, { backgroundColor: loginBackground }]}>
              {isLoggingIn ? <ActivityIndicator color={loginForeground} size="small" /> : <GoogleLogo />}
              <Text style={[styles.loginText, { color: loginForeground }]}>
                {isLoggingIn ? 'กำลังเปิด Google' : 'เข้าสู่ระบบด้วย Google'}
              </Text>
            </View>
          </Pressable>
        </View>

        <Text style={[styles.planText, { color: theme.textSubtle }]}>ใช้สิทธิ์แพลน Ultra</Text>

        {authError ? (
          <View style={[styles.errorBox, { backgroundColor: theme.redSoft, borderColor: alpha(theme.red, 0.35) }]}>
            <TriangleAlert size={15} color={theme.red} strokeWidth={2.2} />
            <Text style={[styles.errorText, { color: theme.red }]}>{toThaiPlanError(authError)}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    flex: 1,
    gap: 14,
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  container: {
    flex: 1,
  },
  errorBox: {
    alignItems: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    fontSize: typography.body,
    fontWeight: '800',
    lineHeight: 17,
  },
  loginButton: {
    alignItems: 'center',
    borderRadius: radii.lg,
    flexDirection: 'row',
    gap: 10,
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  loginPressable: {
    alignSelf: 'stretch',
  },
  loginSection: {
    alignSelf: 'stretch',
    gap: spacing.md,
    marginTop: 6,
    maxWidth: 320,
  },
  loginText: {
    fontSize: typography.label,
    fontWeight: '700',
  },
  logo: {
    height: 86,
    width: 86,
  },
  planText: {
    fontSize: typography.body,
    fontWeight: '600',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.body,
    fontWeight: '600',
    letterSpacing: 0,
    textAlign: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0,
    textAlign: 'center',
  },
  titleBlock: {
    gap: 4,
  },
  topRow: {
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});

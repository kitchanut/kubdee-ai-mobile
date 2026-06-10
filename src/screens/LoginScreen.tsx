import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Moon, Sun, TriangleAlert } from 'lucide-react-native';

import IconButton from '@/components/ui/IconButton';
import Text from '@/components/ui/KubdeeText';
import { toThaiPlanError } from '@/auth/plan';
import type { KubdeeTheme } from '@/theme/tokens';

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
  const loginForeground = theme.isDark ? '#111827' : theme.white;

  return (
    <View className="flex-1 bg-kd-panel">
      <View className="items-end px-4 pt-3">
        <IconButton
          icon={ThemeIcon}
          size={36}
          iconSize={18}
          color={theme.isDark ? theme.blue : theme.amber}
          backgroundColor={theme.isDark ? theme.active : theme.amberSoft}
          onPress={onThemeModeToggle}
        />
      </View>

      <View className="flex-1 items-center justify-center gap-3.5 px-[26px]">
        <Image source={theme.isDark ? logoLight : logoDark} resizeMode="contain" className="h-[86px] w-[86px]" />

        <View className="gap-1">
          <Text className="text-center text-[26px] font-extrabold text-kd-text">Kubdee AI</Text>
          <Text className="text-center text-kd-body font-semibold text-kd-text-subtle">Mobile Automation</Text>
        </View>

        <View className="mt-1.5 max-w-[320px] gap-2 self-stretch">
          <Pressable
            accessibilityRole="button"
            disabled={isLoggingIn}
            onPress={onLogin}
            className="self-stretch active:opacity-80 disabled:opacity-65"
          >
            <View className="h-12 flex-row items-center justify-center gap-2.5 rounded-kd-lg bg-[#111827] px-4 dark:bg-white">
              {isLoggingIn ? <ActivityIndicator color={loginForeground} size="small" /> : <GoogleLogo />}
              <Text className="text-kd-label font-bold text-white dark:text-[#111827]">
                {isLoggingIn ? 'กำลังเปิด Google' : 'เข้าสู่ระบบด้วย Google'}
              </Text>
            </View>
          </Pressable>
        </View>

        <Text className="text-center text-kd-body font-semibold text-kd-text-subtle">ใช้สิทธิ์แพลน Ultra</Text>

        {authError ? (
          <View className="min-h-[42px] flex-row items-center gap-2 rounded-kd-lg border border-kd-red/35 bg-kd-red-soft px-3 py-2.5">
            <TriangleAlert size={15} color={theme.red} strokeWidth={2.2} />
            <Text className="flex-1 text-kd-body font-extrabold leading-[17px] text-kd-red">
              {toThaiPlanError(authError)}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

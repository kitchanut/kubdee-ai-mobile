import type { ConfigContext, ExpoConfig } from 'expo/config';

// package.json is the single source of truth for the version string.
// Bump with `npm version <patch|minor|major>`; scripts/check-release.mjs guards it.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('./package.json') as { version: string };

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Kubdee AI',
  slug: 'kubdee-ai-mobile',
  scheme: 'kubdeeai',
  version: pkg.version,
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  ios: {
    ...config.ios,
    supportsTablet: true,
    bundleIdentifier: 'ai.kubdee.mobile',
  },
  android: {
    ...config.android,
    package: 'ai.kubdee.mobile',
    versionCode: 164,
    predictiveBackGestureEnabled: false,
    permissions: [
      'android.permission.INTERNET',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      // Android 14+ partial photo access: declared so the runtime dialog behaves
      // predictably when the user picks "Select photos" instead of "Allow all".
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.VIBRATE',
      'android.permission.REQUEST_INSTALL_PACKAGES',
      // See other apps so we can free their background RAM before a heavy import on low-RAM phones.
      'android.permission.QUERY_ALL_PACKAGES',
    ],
    adaptiveIcon: {
      backgroundColor: '#111827',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
  },
  web: {
    ...config.web,
    favicon: './assets/favicon.png',
  },
  plugins: [
    [
      'expo-audio',
      {
        recordAudioAndroid: false,
        enableBackgroundRecording: false,
        enableBackgroundPlayback: false,
      },
    ],
    'expo-dev-client',
    'expo-video',
    'expo-sqlite',
    'expo-splash-screen',
    '@sentry/react-native',
    ['expo-secure-store', { configureAndroidBackup: false }],
    './plugins/withTikTokCookieBackupExclusion',
    [
      './plugins/withKubdeeAccessibility',
      {
        targetPackage: 'com.shopee.th',
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 26,
        },
      },
    ],
  ],
  extra: {
    ...config.extra,
    automation: {
      runtime: 'android-accessibility-dev-build',
      targetPackages: ['com.shopee.th'],
    },
  },
});

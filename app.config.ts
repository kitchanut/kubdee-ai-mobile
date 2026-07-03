import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Kubdee AI',
  slug: 'kubdee-ai-mobile',
  scheme: 'kubdeeai',
  version: '0.2.39',
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
    versionCode: 91,
    predictiveBackGestureEnabled: false,
    permissions: [
      'android.permission.INTERNET',
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.VIBRATE',
      'android.permission.REQUEST_INSTALL_PACKAGES',
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

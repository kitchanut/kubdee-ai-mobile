import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Kubdee Mobile',
  slug: 'kubdee-ai-mobile',
  scheme: 'kubdeeai',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  ios: {
    ...config.ios,
    supportsTablet: true,
    bundleIdentifier: 'com.kubdee.aimobile',
  },
  android: {
    ...config.android,
    package: 'com.kubdee.aimobile',
    predictiveBackGestureEnabled: false,
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
    'expo-dev-client',
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

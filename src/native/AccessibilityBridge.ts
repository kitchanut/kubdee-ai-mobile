import { Linking, NativeModules, Platform } from 'react-native';

export interface AccessibilityStatus {
  available: boolean;
  enabled: boolean;
  running?: boolean;
  packageName: string;
  serviceComponent?: string;
  targetPackage?: string;
}

type NativeAccessibilityModule = {
  openAccessibilitySettings?: () => Promise<boolean> | boolean;
  getStatus?: () => Promise<AccessibilityStatus>;
  launchApp?: (packageName: string) => Promise<boolean>;
  tap?: (x: number, y: number) => Promise<boolean>;
  swipe?: (startX: number, startY: number, endX: number, endY: number, durationMs: number) => Promise<boolean>;
  clickByText?: (text: string) => Promise<boolean>;
  inputText?: (text: string) => Promise<boolean>;
  pressImeEnter?: () => Promise<boolean>;
  runShopeeSearch?: (keyword: string) => Promise<boolean>;
  performBack?: () => Promise<boolean>;
};

const moduleName = 'KubdeeAccessibility';
const nativeModule = NativeModules[moduleName] as NativeAccessibilityModule | undefined;

export async function openAccessibilitySettings(): Promise<void> {
  if (Platform.OS === 'android' && nativeModule?.openAccessibilitySettings) {
    await nativeModule.openAccessibilitySettings();
    return;
  }

  await Linking.openSettings();
}

export async function getAccessibilityStatus(): Promise<AccessibilityStatus> {
  if (Platform.OS === 'android' && nativeModule?.getStatus) {
    return nativeModule.getStatus();
  }

  return {
    available: Platform.OS === 'android',
    enabled: false,
    running: false,
    packageName: 'com.kubdee.aimobile',
    targetPackage: 'com.shopee.th',
  };
}

export async function launchTargetApp(packageName = 'com.shopee.th'): Promise<boolean> {
  if (Platform.OS === 'android' && nativeModule?.launchApp) {
    return nativeModule.launchApp(packageName);
  }

  return false;
}

export async function tapScreen(x: number, y: number): Promise<boolean> {
  if (Platform.OS === 'android' && nativeModule?.tap) {
    return nativeModule.tap(x, y);
  }

  return false;
}

export async function swipeScreen(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  durationMs = 420
): Promise<boolean> {
  if (Platform.OS === 'android' && nativeModule?.swipe) {
    return nativeModule.swipe(startX, startY, endX, endY, durationMs);
  }

  return false;
}

export async function clickByText(text: string): Promise<boolean> {
  if (Platform.OS === 'android' && nativeModule?.clickByText) {
    return nativeModule.clickByText(text);
  }

  return false;
}

export async function inputText(text: string): Promise<boolean> {
  if (Platform.OS === 'android' && nativeModule?.inputText) {
    return nativeModule.inputText(text);
  }

  return false;
}

export async function pressImeEnter(): Promise<boolean> {
  if (Platform.OS === 'android' && nativeModule?.pressImeEnter) {
    return nativeModule.pressImeEnter();
  }

  return false;
}

export async function runShopeeSearch(keyword: string): Promise<boolean> {
  if (Platform.OS === 'android' && nativeModule?.runShopeeSearch) {
    return nativeModule.runShopeeSearch(keyword);
  }

  return false;
}

export async function performBack(): Promise<boolean> {
  if (Platform.OS === 'android' && nativeModule?.performBack) {
    return nativeModule.performBack();
  }

  return false;
}

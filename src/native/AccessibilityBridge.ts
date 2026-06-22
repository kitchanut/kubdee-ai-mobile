import { Linking, NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import type { EmitterSubscription } from 'react-native';
import type { Permission } from 'react-native';

export interface AccessibilityStatus {
  available: boolean;
  enabled: boolean;
  running?: boolean;
  packageName: string;
  serviceComponent?: string;
  targetPackage?: string;
}

export interface NativeShopeeLikedProduct {
  name: string;
  price?: string | null;
  stock?: number | null;
  productUrl?: string | null;
  externalProductId?: string | null;
  imageUrl?: string | null;
  status?: string | null;
  scrapedAt?: number | null;
}

export interface NativeShopeeImportLog {
  message: string;
  ts: number;
}

export interface NativeShopeePostLog {
  message: string;
  ts: number;
}

export interface NativeShopeePostingVideoInput {
  fileUri: string;
  productName?: string | null;
  productId?: string | null;
  productUrl?: string | null;
  caption?: string | null;
  hashtags?: string | null;
  galleryVideoId?: string | null;
  platform?: string | null;
}

export interface NativeShopeePostingResult {
  success: boolean;
  error?: string;
  postedCount?: number;
  successCount?: number;
  stopped?: boolean;
  results?: Array<{
    videoIndex: number;
    success: boolean;
    error?: string;
    dryRun?: boolean;
  }>;
}

export interface NativeGoogleFlowLog {
  message: string;
  ts: number;
  runId?: string;
  status?: 'running' | 'completed' | 'stopped' | 'error';
  event?: 'asset' | 'progress';
  step?: 'image' | 'video';
  stage?: string;
  productId?: string;
  productName?: string;
  currentRound?: number;
  totalRounds?: number;
  currentProduct?: number;
  totalProducts?: number;
  fileUri?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt?: number;
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
  importShopeeLikedProducts?: (maxItems: number) => Promise<NativeShopeeLikedProduct[]>;
  postShopeeVideos?: (payloadJson: string) => Promise<string>;
  stopShopeeAutomation?: () => Promise<boolean>;
  startGoogleFlowAutoPilot?: (payloadJson: string) => Promise<boolean>;
  stopGoogleFlowAutoPilot?: () => Promise<boolean>;
  performBack?: () => Promise<boolean>;
  addListener?: (eventName: string) => void;
  removeListeners?: (count: number) => void;
};

const moduleName = 'KubdeeAccessibility';
const nativeModule = NativeModules[moduleName] as NativeAccessibilityModule | undefined;
const nativeEventEmitter =
  Platform.OS === 'android' && nativeModule ? new NativeEventEmitter(nativeModule as never) : null;

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
    packageName: 'ai.kubdee.mobile',
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

export async function importShopeeLikedProducts(maxItems = 40): Promise<NativeShopeeLikedProduct[]> {
  if (Platform.OS === 'android' && nativeModule?.importShopeeLikedProducts) {
    return nativeModule.importShopeeLikedProducts(maxItems);
  }

  return [];
}

export async function postShopeeVideos(
  videos: NativeShopeePostingVideoInput[],
  settings: { postAction?: 'publish' | 'dryRun' } = {}
): Promise<NativeShopeePostingResult> {
  if (Platform.OS === 'android' && nativeModule?.postShopeeVideos) {
    const payloadJson = await nativeModule.postShopeeVideos(JSON.stringify({
      videos,
      postAction: settings.postAction || 'publish',
    }));
    try {
      return JSON.parse(payloadJson) as NativeShopeePostingResult;
    } catch {
      return { success: false, error: 'อ่านผลลัพธ์ Shopee posting จาก native ไม่สำเร็จ' };
    }
  }

  return { success: false, error: 'Shopee posting ใช้ได้เฉพาะ Android native build' };
}

export async function stopShopeeAutomation(): Promise<boolean> {
  if (Platform.OS === 'android' && nativeModule?.stopShopeeAutomation) {
    return nativeModule.stopShopeeAutomation();
  }

  return false;
}

export async function startGoogleFlowAutoPilot(payload: unknown): Promise<boolean> {
  if (Platform.OS === 'android' && nativeModule?.startGoogleFlowAutoPilot) {
    return nativeModule.startGoogleFlowAutoPilot(JSON.stringify(payload));
  }

  return false;
}

export async function stopGoogleFlowAutoPilot(): Promise<boolean> {
  if (Platform.OS === 'android' && nativeModule?.stopGoogleFlowAutoPilot) {
    return nativeModule.stopGoogleFlowAutoPilot();
  }

  return false;
}

export async function requestGoogleFlowMediaPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  const platformVersion =
    typeof Platform.Version === 'number' ? Platform.Version : Number.parseInt(String(Platform.Version), 10);
  const permissions: Permission[] =
    platformVersion >= 33
      ? ['android.permission.READ_MEDIA_IMAGES', 'android.permission.READ_MEDIA_VIDEO']
      : [PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE];

  try {
    const results = await PermissionsAndroid.requestMultiple(permissions);
    return permissions.every((permission) => results[permission] === PermissionsAndroid.RESULTS.GRANTED);
  } catch {
    return false;
  }
}

export async function requestAndroidVideoPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  const platformVersion =
    typeof Platform.Version === 'number' ? Platform.Version : Number.parseInt(String(Platform.Version), 10);
  const permission =
    platformVersion >= 33
      ? 'android.permission.READ_MEDIA_VIDEO'
      : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

  try {
    const result = await PermissionsAndroid.request(permission);
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export function subscribeShopeeImportLogs(
  listener: (entry: NativeShopeeImportLog) => void
): EmitterSubscription | null {
  if (!nativeEventEmitter) {
    return null;
  }

  return nativeEventEmitter.addListener('KubdeeShopeeImportLog', (payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const entry = payload as Partial<NativeShopeeImportLog>;
    if (typeof entry.message !== 'string') {
      return;
    }

    listener({
      message: entry.message,
      ts: typeof entry.ts === 'number' ? entry.ts : Date.now(),
    });
  });
}

export function subscribeShopeePostLogs(
  listener: (entry: NativeShopeePostLog) => void
): EmitterSubscription | null {
  if (!nativeEventEmitter) {
    return null;
  }

  return nativeEventEmitter.addListener('KubdeeShopeePostLog', (payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const entry = payload as Partial<NativeShopeePostLog>;
    if (typeof entry.message !== 'string') {
      return;
    }

    listener({
      message: entry.message,
      ts: typeof entry.ts === 'number' ? entry.ts : Date.now(),
    });
  });
}

export function subscribeGoogleFlowLogs(
  listener: (entry: NativeGoogleFlowLog) => void
): EmitterSubscription | null {
  if (!nativeEventEmitter) {
    return null;
  }

  return nativeEventEmitter.addListener('KubdeeGoogleFlowLog', (payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const entry = payload as Partial<NativeGoogleFlowLog>;
    if (typeof entry.message !== 'string') {
      return;
    }

    listener({
      message: entry.message,
      ts: typeof entry.ts === 'number' ? entry.ts : Date.now(),
      runId: typeof entry.runId === 'string' ? entry.runId : undefined,
      status:
        entry.status === 'running' ||
        entry.status === 'completed' ||
        entry.status === 'stopped' ||
        entry.status === 'error'
          ? entry.status
          : undefined,
      event: entry.event === 'asset' || entry.event === 'progress' ? entry.event : undefined,
      step: entry.step === 'image' || entry.step === 'video' ? entry.step : undefined,
      stage: typeof entry.stage === 'string' ? entry.stage : undefined,
      productId: typeof entry.productId === 'string' ? entry.productId : undefined,
      productName: typeof entry.productName === 'string' ? entry.productName : undefined,
      currentRound: typeof entry.currentRound === 'number' ? entry.currentRound : undefined,
      totalRounds: typeof entry.totalRounds === 'number' ? entry.totalRounds : undefined,
      currentProduct: typeof entry.currentProduct === 'number' ? entry.currentProduct : undefined,
      totalProducts: typeof entry.totalProducts === 'number' ? entry.totalProducts : undefined,
      fileUri: typeof entry.fileUri === 'string' ? entry.fileUri : undefined,
      fileName: typeof entry.fileName === 'string' ? entry.fileName : undefined,
      mimeType: typeof entry.mimeType === 'string' ? entry.mimeType : undefined,
      sizeBytes: typeof entry.sizeBytes === 'number' ? entry.sizeBytes : undefined,
      createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : undefined,
    });
  });
}

export async function performBack(): Promise<boolean> {
  if (Platform.OS === 'android' && nativeModule?.performBack) {
    return nativeModule.performBack();
  }

  return false;
}

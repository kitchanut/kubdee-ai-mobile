import { Linking, NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import type { EmitterSubscription } from 'react-native';

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
  profileLocalId?: string | null;
}

export interface NativeShopeeImportLog {
  message: string;
  ts: number;
}

export interface NativeShopeeImportProduct extends NativeShopeeLikedProduct {
  ts: number;
}

export type NativeShopeeImportSource = 'liked' | 'offers';
export type NativeShopeeOfferCategory = string;

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
  cta?: string | null;
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
  }>;
}

export interface NativeShopeeConvertLog {
  message: string;
  ts: number;
}

export interface NativeShopeeConvertLinkInput {
  localId: string;
  url: string;
}

export interface NativeShopeeConvertResult {
  success: boolean;
  stopped?: boolean;
  error?: string | null;
  convertedCount?: number;
  results?: Array<{
    localId: string;
    url: string;
    shortUrl?: string | null;
    error?: string | null;
  }>;
}

// ผลแปลงลิงก์ที่ :automation เขียนค้างบน disk ทีละลิงก์ระหว่างรัน
// อ่านได้แม้แอปหลักโดนฆ่าก่อน automation จบ
export interface NativeShopeePendingConvertResult {
  localId: string;
  url: string;
  shortUrl: string;
  ts: number;
}

export interface NativeGoogleFlowDownloadedAsset {
  uri: string;
  fileName: string;
  mimeType: string;
  thumbnailUri?: string | null;
  sizeBytes: number;
  createdAt: number;
}

export interface NativeDeleteGoogleFlowAssetsResult {
  deleted: number;
  failed: number;
}

export interface NativeGoogleFlowVideoProbe {
  success: boolean;
  error?: string;
  totalEffectiveDuration?: number;
  videos?: Array<{
    uri: string;
    duration: number;
    effectiveDuration: number;
    hasAudio?: boolean;
  }>;
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
  importShopeeLikedProducts?: (
    maxItems: number,
    profileLocalId?: string | null
  ) => Promise<NativeShopeeLikedProduct[]>;
  importShopeeProducts?: (
    maxItems: number,
    profileLocalId?: string | null,
    importSource?: NativeShopeeImportSource | null,
    offerCategory?: NativeShopeeOfferCategory | null
  ) => Promise<NativeShopeeLikedProduct[]>;
  getPendingShopeeImportProducts?: () => Promise<NativeShopeeImportProduct[]>;
  clearPendingShopeeImportProducts?: () => Promise<boolean>;
  postShopeeVideos?: (payloadJson: string) => Promise<string>;
  convertShopeeLinks?: (payloadJson: string) => Promise<string>;
  getPendingShopeeConvertResults?: () => Promise<string>;
  clearPendingShopeeConvertResults?: () => Promise<boolean>;
  stopShopeeAutomation?: () => Promise<boolean>;
  waitForGoogleFlowDownload?: (
    step: 'image' | 'video',
    sinceMs: number,
    timeoutMs: number
  ) => Promise<NativeGoogleFlowDownloadedAsset | null>;
  saveGoogleFlowDataUrlAsset?: (
    step: 'image' | 'video',
    dataUrl: string,
    fileName?: string | null
  ) => Promise<NativeGoogleFlowDownloadedAsset | null>;
  readUriAsDataUrl?: (
    uriString: string
  ) => Promise<string | null>;
  listGoogleFlowAssets?: (
    step: 'image' | 'video',
    limit: number
  ) => Promise<NativeGoogleFlowDownloadedAsset[]>;
  createGoogleFlowVideoThumbnail?: (
    uriString: string
  ) => Promise<string | null>;
  deleteGoogleFlowAssets?: (
    uriStrings: string[]
  ) => Promise<NativeDeleteGoogleFlowAssetsResult>;
  mergeGoogleFlowVideos?: (
    videoUris: string[],
    voiceoverDataUrl?: string | null
  ) => Promise<NativeGoogleFlowDownloadedAsset | null>;
  probeGoogleFlowVideos?: (
    videoUris: string[],
    trimEndSeconds?: number
  ) => Promise<NativeGoogleFlowVideoProbe>;
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

export async function importShopeeLikedProducts(
  maxItems = 40,
  profileLocalId?: string | null
): Promise<NativeShopeeLikedProduct[]> {
  return importShopeeProducts('liked', maxItems, profileLocalId);
}

export async function importShopeeProducts(
  importSource: NativeShopeeImportSource,
  maxItems = 40,
  profileLocalId?: string | null,
  offerCategory?: NativeShopeeOfferCategory | null
): Promise<NativeShopeeLikedProduct[]> {
  const normalizedSource: NativeShopeeImportSource = importSource === 'offers' ? 'offers' : 'liked';
  const normalizedOfferCategory =
    normalizedSource === 'offers' ? offerCategory?.trim() || null : null;
  if (Platform.OS === 'android' && nativeModule?.importShopeeProducts) {
    return nativeModule.importShopeeProducts(
      maxItems,
      profileLocalId ?? null,
      normalizedSource,
      normalizedOfferCategory
    );
  }

  if (Platform.OS === 'android' && nativeModule?.importShopeeLikedProducts) {
    if (normalizedSource !== 'liked') {
      return [];
    }
    return nativeModule.importShopeeLikedProducts(maxItems, profileLocalId ?? null);
  }

  return [];
}

export async function getPendingShopeeImportProducts(): Promise<NativeShopeeImportProduct[]> {
  if (Platform.OS === 'android' && nativeModule?.getPendingShopeeImportProducts) {
    const products = await nativeModule.getPendingShopeeImportProducts();
    return products
      .map((product) => normalizeNativeShopeeProduct(product))
      .filter((product): product is NativeShopeeImportProduct => !!product);
  }

  return [];
}

export async function clearPendingShopeeImportProducts(): Promise<boolean> {
  if (Platform.OS === 'android' && nativeModule?.clearPendingShopeeImportProducts) {
    return nativeModule.clearPendingShopeeImportProducts();
  }

  return true;
}

export async function postShopeeVideos(videos: NativeShopeePostingVideoInput[]): Promise<NativeShopeePostingResult> {
  if (Platform.OS === 'android' && nativeModule?.postShopeeVideos) {
    const payloadJson = await nativeModule.postShopeeVideos(JSON.stringify({
      videos,
    }));
    try {
      return JSON.parse(payloadJson) as NativeShopeePostingResult;
    } catch {
      return { success: false, error: 'อ่านผลลัพธ์ Shopee posting จาก native ไม่สำเร็จ' };
    }
  }

  return { success: false, error: 'Shopee posting ใช้ได้เฉพาะ Android native build' };
}

export async function convertShopeeLinks(
  links: NativeShopeeConvertLinkInput[]
): Promise<NativeShopeeConvertResult> {
  if (Platform.OS === 'android' && nativeModule?.convertShopeeLinks) {
    const payloadJson = await nativeModule.convertShopeeLinks(JSON.stringify({
      links,
    }));
    try {
      return JSON.parse(payloadJson) as NativeShopeeConvertResult;
    } catch {
      return { success: false, error: 'อ่านผลลัพธ์การแปลงลิงก์ Shopee จาก native ไม่สำเร็จ' };
    }
  }

  return { success: false, error: 'แปลงลิงก์ Shopee ใช้ได้เฉพาะ Android native build' };
}

export async function getPendingShopeeConvertResults(): Promise<NativeShopeePendingConvertResult[]> {
  if (Platform.OS !== 'android' || !nativeModule?.getPendingShopeeConvertResults) {
    return [];
  }

  try {
    const raw = await nativeModule.getPendingShopeeConvertResults();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((row): row is NativeShopeePendingConvertResult => {
      if (!row || typeof row !== 'object') {
        return false;
      }

      const item = row as Partial<NativeShopeePendingConvertResult>;
      return typeof item.localId === 'string' && item.localId.trim().length > 0
        && typeof item.shortUrl === 'string' && item.shortUrl.trim().length > 0;
    });
  } catch {
    return [];
  }
}

export async function clearPendingShopeeConvertResults(): Promise<boolean> {
  if (Platform.OS === 'android' && nativeModule?.clearPendingShopeeConvertResults) {
    return nativeModule.clearPendingShopeeConvertResults();
  }

  return false;
}

export async function stopShopeeAutomation(): Promise<boolean> {
  if (Platform.OS === 'android' && nativeModule?.stopShopeeAutomation) {
    return nativeModule.stopShopeeAutomation();
  }

  return false;
}

export async function waitForGoogleFlowDownload(
  step: 'image' | 'video',
  sinceMs: number,
  timeoutMs = 90_000
): Promise<NativeGoogleFlowDownloadedAsset | null> {
  if (Platform.OS === 'android' && nativeModule?.waitForGoogleFlowDownload) {
    return nativeModule.waitForGoogleFlowDownload(step, sinceMs, timeoutMs);
  }

  return null;
}

export async function saveGoogleFlowDataUrlAsset(
  step: 'image' | 'video',
  dataUrl: string,
  fileName?: string | null
): Promise<NativeGoogleFlowDownloadedAsset | null> {
  if (Platform.OS === 'android' && nativeModule?.saveGoogleFlowDataUrlAsset) {
    return nativeModule.saveGoogleFlowDataUrlAsset(step, dataUrl, fileName ?? null);
  }

  return null;
}

export async function readUriAsDataUrl(uriString: string): Promise<string | null> {
  if (Platform.OS === 'android' && nativeModule?.readUriAsDataUrl) {
    return nativeModule.readUriAsDataUrl(uriString);
  }

  return null;
}

export async function listGoogleFlowAssets(
  step: 'image' | 'video',
  limit = 200
): Promise<NativeGoogleFlowDownloadedAsset[]> {
  if (Platform.OS === 'android' && nativeModule?.listGoogleFlowAssets) {
    return nativeModule.listGoogleFlowAssets(step, limit);
  }

  return [];
}

export async function createGoogleFlowVideoThumbnail(uriString: string): Promise<string | null> {
  if (Platform.OS === 'android' && nativeModule?.createGoogleFlowVideoThumbnail) {
    return nativeModule.createGoogleFlowVideoThumbnail(uriString);
  }

  return null;
}

export async function deleteGoogleFlowAssets(uriStrings: string[]): Promise<NativeDeleteGoogleFlowAssetsResult> {
  if (Platform.OS === 'android' && nativeModule?.deleteGoogleFlowAssets) {
    return nativeModule.deleteGoogleFlowAssets(uriStrings);
  }

  return { deleted: 0, failed: uriStrings.length };
}

export async function mergeGoogleFlowVideos(
  videoUris: string[],
  voiceoverDataUrl?: string | null
): Promise<NativeGoogleFlowDownloadedAsset | null> {
  if (Platform.OS === 'android' && nativeModule?.mergeGoogleFlowVideos) {
    return nativeModule.mergeGoogleFlowVideos(videoUris, voiceoverDataUrl ?? null);
  }

  return null;
}

export async function probeGoogleFlowVideos(
  videoUris: string[],
  trimEndSeconds = 0.3
): Promise<NativeGoogleFlowVideoProbe> {
  if (Platform.OS === 'android' && nativeModule?.probeGoogleFlowVideos) {
    return nativeModule.probeGoogleFlowVideos(videoUris, trimEndSeconds);
  }

  return { success: false, error: 'native probeGoogleFlowVideos ไม่พร้อม' };
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

function normalizeNativeShopeeProduct(payload: unknown): NativeShopeeImportProduct | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const entry = payload as Partial<NativeShopeeImportProduct>;
  if (typeof entry.name !== 'string' || entry.name.trim().length === 0) {
    return null;
  }

  return {
    name: entry.name,
    price: typeof entry.price === 'string' ? entry.price : null,
    stock: typeof entry.stock === 'number' ? entry.stock : null,
    productUrl: typeof entry.productUrl === 'string' ? entry.productUrl : null,
    externalProductId: typeof entry.externalProductId === 'string' ? entry.externalProductId : null,
    imageUrl: typeof entry.imageUrl === 'string' ? entry.imageUrl : null,
    status: typeof entry.status === 'string' ? entry.status : null,
    scrapedAt: typeof entry.scrapedAt === 'number' ? entry.scrapedAt : null,
    profileLocalId: typeof entry.profileLocalId === 'string' ? entry.profileLocalId : null,
    ts: typeof entry.ts === 'number' ? entry.ts : Date.now(),
  };
}

export function subscribeShopeeImportProducts(
  listener: (entry: NativeShopeeImportProduct) => void
): EmitterSubscription | null {
  if (!nativeEventEmitter) {
    return null;
  }

  return nativeEventEmitter.addListener('KubdeeShopeeImportProduct', (payload: unknown) => {
    const product = normalizeNativeShopeeProduct(payload);
    if (product) {
      listener(product);
    }
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

export function subscribeShopeeConvertLogs(
  listener: (entry: NativeShopeeConvertLog) => void
): EmitterSubscription | null {
  if (!nativeEventEmitter) {
    return null;
  }

  return nativeEventEmitter.addListener('KubdeeShopeeConvertLog', (payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    const entry = payload as Partial<NativeShopeeConvertLog>;
    if (typeof entry.message !== 'string') {
      return;
    }

    listener({
      message: entry.message,
      ts: typeof entry.ts === 'number' ? entry.ts : Date.now(),
    });
  });
}

export async function performBack(): Promise<boolean> {
  if (Platform.OS === 'android' && nativeModule?.performBack) {
    return nativeModule.performBack();
  }

  return false;
}

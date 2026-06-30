import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';

import { refreshAuthToken } from '@/auth/api';
import { APP_TYPE, CLIENT_APP } from '@/auth/constants';
import { getStoredAuthTokens, saveStoredAuthTokens } from '@/auth/storage';

export const MAX_CLOUD_TRANSFER_VIDEO_BYTES = 40 * 1024 * 1024;

const TRANSFER_API_URL = 'https://api.kubdee.ai';
const DEVICE_ID_KEY = 'kubdee_ai_mobile_cloud_transfer_device_id';
const SOURCE_APP = 'mobile';

export type CloudTransferPhase =
  | 'preparing'
  | 'creating'
  | 'uploading'
  | 'finalizing'
  | 'downloading'
  | 'saving'
  | 'accepting'
  | 'completed'
  | 'failed';

export interface CloudTransferProgress {
  mode: 'upload' | 'download';
  phase: CloudTransferPhase;
  current: number;
  total: number;
  filename: string;
  bytesWritten?: number;
  totalBytes?: number;
}

export interface CloudTransferItem {
  id: string;
  filename: string;
  displayName?: string | null;
  mimeType: string;
  size: number;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  sourceApp?: string | null;
  sourceDeviceId?: string | null;
  createdAt: number;
  expiresAt: number;
  metadata?: Record<string, unknown> | null;
}

export interface CloudTransferVideoUploadItem {
  id?: string;
  fileUri: string;
  fileName?: string | null;
  title?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  profileLocalId?: string | null;
  productId?: string | null;
  productCode?: string | null;
  productName?: string | null;
  productUrl?: string | null;
  caption?: string | null;
  hashtags?: string | null;
  cta?: string | null;
  platform?: string | null;
}

export interface CloudTransferItemResult {
  id: string;
  filename: string;
  success: boolean;
  transferId?: string;
  deduped?: boolean;
  error?: string;
}

export interface CloudTransferUploadResult {
  success: boolean;
  total: number;
  uploaded: number;
  failed: number;
  results: CloudTransferItemResult[];
  error?: string;
}

export interface CloudTransferListResult {
  success: boolean;
  transfers: CloudTransferItem[];
  error?: string;
}

export interface DownloadedCloudTransferVideo {
  transfer: CloudTransferItem;
  fileUri: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseJsonSafe(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = await response.json();
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseTransferApiError(data: Record<string, unknown>, fallback: string): string {
  const message = data.message || data.error;
  return typeof message === 'string' && message.trim() ? message.trim() : fallback;
}

function randomId(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    return `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

async function getOrCreateCloudTransferDeviceId(): Promise<string> {
  const storedDeviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (storedDeviceId) return storedDeviceId;

  const deviceId = randomId();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  const tokens = await getStoredAuthTokens();
  if (!tokens?.accessToken) {
    throw new Error('กรุณาเข้าสู่ระบบก่อนใช้ Cloud Transfer');
  }

  if (!forceRefresh) {
    return tokens.accessToken;
  }

  if (!tokens.refreshToken) {
    return tokens.accessToken;
  }

  const refreshed = await refreshAuthToken(tokens.refreshToken);
  if (!refreshed.ok || !refreshed.data?.accessToken) {
    return tokens.accessToken;
  }

  await saveStoredAuthTokens({
    accessToken: refreshed.data.accessToken,
    refreshToken: tokens.refreshToken,
  });

  return refreshed.data.accessToken;
}

async function buildHeaders(
  deviceId: string,
  extraHeaders: Record<string, string> = {},
  forceRefresh = false
): Promise<Record<string, string>> {
  const token = await getAccessToken(forceRefresh);
  return {
    Authorization: `Bearer ${token}`,
    'X-App-Type': APP_TYPE,
    'X-Client-App': CLIENT_APP,
    'X-Device-Id': deviceId,
    'X-Source-App': SOURCE_APP,
    ...extraHeaders,
  };
}

async function transferFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const deviceId = await getOrCreateCloudTransferDeviceId();
  const request = async (forceRefresh = false): Promise<Response> => {
    const headers = await buildHeaders(
      deviceId,
      Object.fromEntries(new Headers(options.headers).entries()),
      forceRefresh
    );
    return fetch(`${TRANSFER_API_URL}${path}`, {
      ...options,
      headers,
    });
  };

  let response = await request(false);
  if (response.status === 401) {
    response = await request(true);
  }
  return response;
}

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256File(fileUri: string): Promise<string> {
  const bytes = await new File(fileUri).bytes();
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return arrayBufferToHex(digest);
}

function getFileExtension(value: string, fallback: string): string {
  const extension = value.split('?')[0]?.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
  return extension || fallback;
}

function stripFileExtension(value: string): string {
  return value.replace(/\.[^/.]+$/, '').trim();
}

function sanitizeFileName(value: string, fallback: string): string {
  const cleanValue = value
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleanValue || fallback;
}

function normalizeFilename(item: CloudTransferVideoUploadItem, index: number): string {
  const name = cleanText(item.fileName) || cleanText(item.title) || `mobile-video-${index + 1}.mp4`;
  const mimeType = normalizeMimeType(item.mimeType, name);
  const fallbackExtension = mimeType === 'video/quicktime' ? 'mov' : 'mp4';
  const extension = getFileExtension(name, fallbackExtension);
  const baseName = sanitizeFileName(stripFileExtension(name), `mobile-video-${index + 1}`);
  return `${baseName}.${extension}`;
}

function normalizeMimeType(mimeType?: string | null, filename = ''): string {
  const cleanMimeType = cleanText(mimeType).toLowerCase();
  if (cleanMimeType.startsWith('video/')) return cleanMimeType;
  const extension = getFileExtension(filename, 'mp4');
  if (extension === 'webm') return 'video/webm';
  if (extension === 'mov') return 'video/quicktime';
  if (extension === 'm4v') return 'video/x-m4v';
  return 'video/mp4';
}

function getExtensionFromMimeOrName(mimeType?: string | null, filename = ''): string {
  const extension = getFileExtension(filename, '');
  if (extension) return extension;
  const cleanMimeType = cleanText(mimeType).toLowerCase();
  if (cleanMimeType === 'video/webm') return 'webm';
  if (cleanMimeType === 'video/quicktime' || cleanMimeType === 'video/mov') return 'mov';
  if (cleanMimeType === 'video/x-m4v') return 'm4v';
  return 'mp4';
}

function inferPlatform(productCode: string, productUrl: string, platform?: string | null): string {
  const cleanPlatform = cleanText(platform).toLowerCase();
  if (cleanPlatform) return cleanPlatform;
  const separatorIndex = productCode.indexOf(':');
  if (separatorIndex > 0) return productCode.slice(0, separatorIndex).trim().toLowerCase();
  const lowerUrl = productUrl.toLowerCase();
  if (lowerUrl.includes('shopee')) return 'shopee';
  if (lowerUrl.includes('tiktok')) return 'tiktok';
  return '';
}

function buildCloudMetadata(item: CloudTransferVideoUploadItem, filename: string): Record<string, unknown> {
  const productCode = cleanText(item.productCode);
  const productDbId = cleanText(item.productId);
  const productUrl = cleanText(item.productUrl);
  const productName = cleanText(item.productName);
  const platform = inferPlatform(productCode, productUrl, item.platform);
  const caption = cleanText(item.caption);
  const hashtags = cleanText(item.hashtags);
  const cta = cleanText(item.cta);
  const title = cleanText(item.title) || productName || stripFileExtension(filename);
  const binding = {
    platform,
    productDbId,
    productId: productCode || productDbId,
    productUrl,
    productName,
    caption,
    hashtag: hashtags,
    hashtags,
    cta,
    profileId: cleanText(item.profileLocalId),
  };

  return {
    source: 'kubdee-ai-mobile',
    galleryVideoId: item.id,
    profileId: cleanText(item.profileLocalId),
    localName: filename,
    title,
    displayName: productName || title,
    platform,
    productDbId,
    productName,
    productId: productCode || productDbId,
    productUrl,
    caption,
    hashtags,
    cta,
    platformBindings: productName || productCode || productDbId || productUrl ? [binding] : [],
  };
}

async function ensureUploadFileUri(
  item: CloudTransferVideoUploadItem,
  filename: string
): Promise<{ fileUri: string; sizeBytes: number; temporary: boolean }> {
  if (!FileSystem.cacheDirectory) {
    throw new Error('ไม่พบพื้นที่เก็บไฟล์ชั่วคราวบนเครื่อง');
  }

  let fileUri = item.fileUri;
  let temporary = false;
  if (!fileUri.startsWith('file://')) {
    const cacheDir = `${FileSystem.cacheDirectory}cloud-transfer-upload/`;
    await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
    const targetUri = `${cacheDir}${Date.now()}-${sanitizeFileName(filename, 'video.mp4')}`;
    await FileSystem.copyAsync({ from: fileUri, to: targetUri });
    fileUri = targetUri;
    temporary = true;
  }

  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists || info.isDirectory) {
    throw new Error('ไม่พบไฟล์วิดีโอ');
  }

  return {
    fileUri,
    sizeBytes: typeof info.size === 'number' ? info.size : item.sizeBytes || 0,
    temporary,
  };
}

async function uploadBinaryFile(
  deviceId: string,
  transferId: string,
  uploadToken: string,
  fileUri: string,
  mimeType: string
): Promise<FileSystem.FileSystemUploadResult> {
  const upload = async (forceRefresh = false): Promise<FileSystem.FileSystemUploadResult> => {
    const headers = await buildHeaders(
      deviceId,
      {
        'Content-Type': mimeType,
        'X-Upload-Token': uploadToken,
      },
      forceRefresh
    );
    return FileSystem.uploadAsync(`${TRANSFER_API_URL}/api/v1/transfers/${transferId}/video`, fileUri, {
      headers,
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });
  };

  let result = await upload(false);
  if (result.status === 401) {
    result = await upload(true);
  }
  return result;
}

async function safeDeleteTemporaryFile(fileUri: string, temporary: boolean): Promise<void> {
  if (!temporary) return;
  try {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  } catch {
    // Best effort cleanup only.
  }
}

export async function uploadCloudTransferVideos(
  items: CloudTransferVideoUploadItem[],
  onProgress?: (progress: CloudTransferProgress) => void
): Promise<CloudTransferUploadResult> {
  const sourceItems = items.filter((item) => !!item.fileUri);
  const results: CloudTransferItemResult[] = [];
  const deviceId = await getOrCreateCloudTransferDeviceId();

  if (sourceItems.length === 0) {
    return { success: false, total: 0, uploaded: 0, failed: 0, results: [], error: 'ไม่พบไฟล์วิดีโอที่เลือก' };
  }

  for (let index = 0; index < sourceItems.length; index += 1) {
    const item = sourceItems[index];
    const filename = normalizeFilename(item, index);
    let prepared: { fileUri: string; sizeBytes: number; temporary: boolean } | null = null;

    try {
      onProgress?.({ mode: 'upload', phase: 'preparing', current: index + 1, total: sourceItems.length, filename });

      prepared = await ensureUploadFileUri(item, filename);
      if (prepared.sizeBytes <= 0) {
        throw new Error('ไฟล์วิดีโอว่าง');
      }
      if (prepared.sizeBytes > MAX_CLOUD_TRANSFER_VIDEO_BYTES) {
        throw new Error('ไฟล์ใหญ่เกิน 40MB');
      }

      const mimeType = normalizeMimeType(item.mimeType, filename);
      const sha256 = await sha256File(prepared.fileUri);

      onProgress?.({ mode: 'upload', phase: 'creating', current: index + 1, total: sourceItems.length, filename });

      const createResponse = await transferFetch('/api/v1/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceApp: SOURCE_APP,
          sourceDeviceId: deviceId,
          filename,
          mimeType,
          size: prepared.sizeBytes,
          duration:
            typeof item.durationMs === 'number' && Number.isFinite(item.durationMs) && item.durationMs > 0
              ? item.durationMs / 1000
              : null,
          width: item.width,
          height: item.height,
          sha256,
          metadata: buildCloudMetadata(item, filename),
        }),
      });
      const createData = await readJson(createResponse);
      if (!createResponse.ok || createData.success !== true || typeof (createData.transfer as { id?: unknown } | undefined)?.id !== 'string') {
        throw new Error(parseTransferApiError(createData, `สร้าง transfer ไม่สำเร็จ (${createResponse.status})`));
      }

      const transferId = (createData.transfer as { id: string }).id;
      if (createData.deduped === true) {
        results.push({ id: item.id || filename, filename, success: true, transferId, deduped: true });
        continue;
      }

      const uploadToken = cleanText((createData.upload as { token?: unknown } | undefined)?.token);
      if (!uploadToken) {
        throw new Error('ไม่พบ upload token');
      }

      onProgress?.({ mode: 'upload', phase: 'uploading', current: index + 1, total: sourceItems.length, filename });

      const uploadResult = await uploadBinaryFile(deviceId, transferId, uploadToken, prepared.fileUri, mimeType);
      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        throw new Error(parseTransferApiError(parseJsonSafe(uploadResult.body), `อัปโหลดวิดีโอไม่สำเร็จ (${uploadResult.status})`));
      }

      onProgress?.({ mode: 'upload', phase: 'finalizing', current: index + 1, total: sourceItems.length, filename });

      const completeResponse = await transferFetch(`/api/v1/transfers/${transferId}/upload-complete`, {
        method: 'POST',
        headers: { 'X-Upload-Token': uploadToken },
      });
      const completeData = await readJson(completeResponse);
      if (!completeResponse.ok || completeData.success !== true) {
        throw new Error(parseTransferApiError(completeData, `ยืนยันอัปโหลดไม่สำเร็จ (${completeResponse.status})`));
      }

      results.push({ id: item.id || filename, filename, success: true, transferId });
    } catch (error) {
      results.push({
        id: item.id || filename,
        filename,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (prepared) {
        await safeDeleteTemporaryFile(prepared.fileUri, prepared.temporary);
      }
    }
  }

  const uploaded = results.filter((result) => result.success).length;
  const failed = results.length - uploaded;
  return {
    success: uploaded > 0 && failed === 0,
    total: sourceItems.length,
    uploaded,
    failed,
    results,
    ...(uploaded === 0 ? { error: 'ส่งขึ้น Cloud Transfer ไม่สำเร็จ' } : {}),
  };
}

export async function listCloudTransferInbox(): Promise<CloudTransferListResult> {
  const response = await transferFetch('/api/v1/transfers/inbox?limit=100');
  const data = await readJson(response);
  if (!response.ok || data.success !== true) {
    return {
      success: false,
      transfers: [],
      error: parseTransferApiError(data, `โหลด Cloud Transfer ไม่สำเร็จ (${response.status})`),
    };
  }

  return {
    success: true,
    transfers: Array.isArray(data.transfers) ? (data.transfers as CloudTransferItem[]) : [],
  };
}

async function uniqueFileUri(directory: string, filename: string): Promise<{ fileUri: string; fileName: string }> {
  const extension = getFileExtension(filename, 'mp4');
  const baseName = sanitizeFileName(stripFileExtension(filename), 'cloud-transfer-video');

  for (let index = 0; index < 999; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`;
    const fileName = `${Date.now()}-${baseName}${suffix}.${extension}`;
    const fileUri = `${directory}${fileName}`;
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) {
      return { fileUri, fileName };
    }
  }

  const fileName = `${Date.now()}-${randomId()}.${extension}`;
  return { fileUri: `${directory}${fileName}`, fileName };
}

export async function downloadCloudTransferVideo(
  transfer: CloudTransferItem,
  onProgress?: (progress: CloudTransferProgress) => void,
  index = 0,
  total = 1
): Promise<DownloadedCloudTransferVideo> {
  if (!FileSystem.documentDirectory) {
    throw new Error('ไม่พบพื้นที่เก็บไฟล์บนเครื่อง');
  }

  const filename = sanitizeFileName(
    transfer.filename || `${transfer.displayName || transfer.id}.${getExtensionFromMimeOrName(transfer.mimeType, transfer.filename)}`,
    `${transfer.id}.mp4`
  );
  const directory = `${FileSystem.documentDirectory}creative-media/videos/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const target = await uniqueFileUri(directory, filename);
  const deviceId = await getOrCreateCloudTransferDeviceId();

  const downloadOnce = async (forceRefresh = false): Promise<FileSystem.FileSystemDownloadResult | undefined> => {
    const headers = await buildHeaders(deviceId, {}, forceRefresh);
    const download = FileSystem.createDownloadResumable(
      `${TRANSFER_API_URL}/api/v1/transfers/${transfer.id}/video`,
      target.fileUri,
      { headers },
      (progress) => {
        onProgress?.({
          mode: 'download',
          phase: 'downloading',
          current: index + 1,
          total,
          filename: transfer.displayName || filename,
          bytesWritten: progress.totalBytesWritten,
          totalBytes: progress.totalBytesExpectedToWrite,
        });
      }
    );
    return download.downloadAsync();
  };

  let result = await downloadOnce(false);
  if (result?.status === 401) {
    result = await downloadOnce(true);
  }

  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error(`ดาวน์โหลดไม่สำเร็จ (${result?.status || 0})`);
  }

  const info = await FileSystem.getInfoAsync(result.uri);
  return {
    transfer,
    fileUri: result.uri,
    fileName: target.fileName,
    mimeType: transfer.mimeType || normalizeMimeType(null, target.fileName),
    sizeBytes: info.exists && typeof info.size === 'number' ? info.size : transfer.size || null,
    width: typeof transfer.width === 'number' && transfer.width > 0 ? transfer.width : null,
    height: typeof transfer.height === 'number' && transfer.height > 0 ? transfer.height : null,
    durationMs:
      typeof transfer.duration === 'number' && Number.isFinite(transfer.duration) && transfer.duration > 0
        ? Math.round(transfer.duration * 1000)
        : null,
  };
}

export async function acceptCloudTransfer(transferId: string): Promise<void> {
  const response = await transferFetch(`/api/v1/transfers/${encodeURIComponent(transferId)}/accept`, {
    method: 'POST',
  });
  if (!response.ok) {
    const data = await readJson(response);
    throw new Error(parseTransferApiError(data, `ยืนยันรับไฟล์ไม่สำเร็จ (${response.status})`));
  }
}

export function getCloudTransferText(transfer: CloudTransferItem | null | undefined, ...keys: string[]): string {
  const metadata = transfer?.metadata && typeof transfer.metadata === 'object' ? transfer.metadata : null;
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }

  const bindings = metadata?.platformBindings;
  if (Array.isArray(bindings)) {
    for (const binding of bindings) {
      if (!binding || typeof binding !== 'object' || Array.isArray(binding)) continue;
      for (const key of keys) {
        const value = (binding as Record<string, unknown>)[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (typeof value === 'number' && Number.isFinite(value)) return String(value);
      }
    }
  }

  return '';
}


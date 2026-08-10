import * as FileSystem from 'expo-file-system/legacy';

import { refreshAuthToken } from '@/auth/api';
import { APP_TYPE, CLIENT_APP } from '@/auth/constants';
import { getStoredAuthTokens, saveStoredAuthTokens } from '@/auth/storage';
import {
  BufferAssetUploadError,
  createBufferAssetRateLimitError,
  isStaleLocalFileError,
  staleLocalFileError,
} from '@/autopilot/bufferPostingErrors';
import { readUriAsDataUrl } from '@/native/AccessibilityBridge';

export { isBufferAssetUploadRateLimitError } from '@/autopilot/bufferPostingErrors';

// Thin client for kubdee-ai-api's Buffer (buffer.com) integration — status,
// Facebook channel listing, and posting a video generated on-device. Mirrors
// the auth/fetch pattern in src/services/cloudTransferService.ts.
const BUFFER_API_URL = 'https://api.kubdee.ai';
// Without a timeout, a stalled connection (dead socket, server never
// responding) hangs this call forever with no way to recover — and since
// this runs inside the auto pilot loop, that stalls the entire run, not just
// this one product. Upload gets longer since it can carry a multi-MB video.
const BUFFER_REQUEST_TIMEOUT_MS = 30_000;
const BUFFER_UPLOAD_TIMEOUT_MS = 90_000;
// API เก็บ asset ไว้ 48 ชม. ใช้ TTL สั้นกว่านั้นเพื่อเผื่อเวลาที่ Buffer ดึงไฟล์หลังสร้างโพสต์
// cache นี้อยู่แค่ใน JS session จึงช่วยทั้ง retry หลัง post ล้มเหลวและโพสต์ไฟล์เดียวกันหลาย platform
// โดยไม่ทิ้ง URL เก่าไว้ข้ามการเปิดแอป
const BUFFER_ASSET_CACHE_TTL_MS = 45 * 60 * 60 * 1000;
const BUFFER_RATE_LIMIT_FALLBACK_MS = 10 * 60 * 1000;

class BufferRequestTimeoutError extends Error {}

export interface BufferConnectionStatus {
  connected: boolean;
  bufferName: string | null;
}

export interface BufferChannel {
  id: string;
  name: string;
  displayName: string | null;
  service: string;
  avatar: string | null;
  isQueuePaused: boolean;
}

export type BufferPostAssetType = 'image' | 'video';

export interface CreateFacebookBufferPostParams {
  channelId: string;
  text: string;
  assetUrl: string;
  assetType?: BufferPostAssetType;
  firstComment?: string;
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  const tokens = await getStoredAuthTokens();
  if (!tokens?.accessToken) {
    throw new Error('กรุณาเข้าสู่ระบบก่อนใช้งาน Buffer');
  }

  if (!forceRefresh || !tokens.refreshToken) {
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
  extraHeaders: Record<string, string> = {},
  forceRefresh = false
): Promise<Record<string, string>> {
  const token = await getAccessToken(forceRefresh);
  return {
    Authorization: `Bearer ${token}`,
    'X-App-Type': APP_TYPE,
    'X-Client-App': CLIENT_APP,
    ...extraHeaders,
  };
}

async function bufferFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const request = async (forceRefresh = false): Promise<Response> => {
    const headers = await buildHeaders(Object.fromEntries(new Headers(options.headers).entries()), forceRefresh);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BUFFER_REQUEST_TIMEOUT_MS);
    try {
      return await fetch(`${BUFFER_API_URL}${path}`, { ...options, headers, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  let response = await request(false);
  if (response.status === 401) {
    response = await request(true);
  }
  return response;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseJsonSafe(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractApiError(data: Record<string, unknown>, fallback: string): string {
  return typeof data.error === 'string' && data.error ? data.error : fallback;
}

function readPayloadText(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readPositiveNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// Facebook/Instagram/YouTube posting screens each mount their own channel
// picker, and switching between those tabs used to re-fetch status + the
// full channel list every time — this cache (short TTL, shared across the 3
// services, de-duped in-flight requests) makes tab switches instant instead
// of flashing a loading state on every visit.
const BUFFER_CACHE_TTL_MS = 60_000;

let connectionStatusCache: { value: BufferConnectionStatus; expiresAt: number } | null = null;
let connectionStatusPromise: Promise<BufferConnectionStatus> | null = null;

export async function getBufferConnectionStatus(): Promise<BufferConnectionStatus> {
  if (connectionStatusCache && connectionStatusCache.expiresAt > Date.now()) {
    return connectionStatusCache.value;
  }
  if (connectionStatusPromise) {
    return connectionStatusPromise;
  }

  connectionStatusPromise = (async () => {
    let value: BufferConnectionStatus;
    try {
      const response = await bufferFetch('/api/v1/integrations/buffer');
      const data = await readJson(response);
      value = !response.ok
        ? { connected: false, bufferName: null }
        : {
            connected: data.connected === true,
            bufferName: typeof data.bufferName === 'string' ? data.bufferName : null,
          };
    } catch {
      value = { connected: false, bufferName: null };
    }
    connectionStatusCache = { value, expiresAt: Date.now() + BUFFER_CACHE_TTL_MS };
    connectionStatusPromise = null;
    return value;
  })();

  return connectionStatusPromise;
}

export type BufferChannelService = 'facebook' | 'youtube' | 'instagram';

let allChannelsCache: { value: BufferChannel[]; expiresAt: number } | null = null;
let allChannelsPromise: Promise<BufferChannel[]> | null = null;

// Fetches every connected channel once (unfiltered) so Facebook/Instagram/
// YouTube pickers share a single cached response instead of each hitting
// this same endpoint on its own.
async function listAllBufferChannels(): Promise<BufferChannel[]> {
  if (allChannelsCache && allChannelsCache.expiresAt > Date.now()) {
    return allChannelsCache.value;
  }
  if (allChannelsPromise) {
    return allChannelsPromise;
  }

  allChannelsPromise = (async () => {
    const response = await bufferFetch('/api/v1/integrations/buffer/channels');
    const data = await readJson(response);
    const value: BufferChannel[] =
      !response.ok || !Array.isArray(data.channels)
        ? []
        : (data.channels as Record<string, unknown>[])
            .filter((channel): channel is Record<string, unknown> => !!channel && typeof channel.id === 'string')
            .map((channel) => ({
              id: channel.id as string,
              name: typeof channel.name === 'string' ? channel.name : '',
              displayName: typeof channel.displayName === 'string' ? channel.displayName : null,
              service: typeof channel.service === 'string' ? channel.service : '',
              avatar: typeof channel.avatar === 'string' ? channel.avatar : null,
              isQueuePaused: channel.isQueuePaused === true,
            }));
    allChannelsCache = { value, expiresAt: Date.now() + BUFFER_CACHE_TTL_MS };
    return value;
  })();

  try {
    return await allChannelsPromise;
  } finally {
    // ล้าง in-flight promise เสมอแม้ fetch throw — ไม่งั้น request ถัดไปจะรอ promise ที่ตายไปแล้วตลอดกาล
    allChannelsPromise = null;
  }
}

export async function listBufferChannelsByService(service: BufferChannelService): Promise<BufferChannel[]> {
  const channels = await listAllBufferChannels();
  return channels.filter((channel) => channel.service === service);
}

interface BufferAssetCacheEntry {
  expiresAt: number;
  url: string;
}

const bufferAssetCache = new Map<string, BufferAssetCacheEntry>();
const bufferAssetUploadPromises = new Map<string, Promise<string>>();
let bufferAssetRateLimit: { message: string; retryAt: number } | null = null;

function bufferAssetCacheKey(fileUri: string, mimeType: string): string {
  return `${mimeType.trim().toLowerCase()}\u0000${fileUri.trim()}`;
}

function getCachedBufferAssetUrl(cacheKey: string): string | null {
  const cached = bufferAssetCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now() + 60_000) {
    bufferAssetCache.delete(cacheKey);
    return null;
  }
  return cached.url;
}

function getActiveBufferAssetRateLimitError(): BufferAssetUploadError | null {
  if (!bufferAssetRateLimit) return null;
  const retryAfterMs = bufferAssetRateLimit.retryAt - Date.now();
  if (retryAfterMs <= 0) {
    bufferAssetRateLimit = null;
    return null;
  }
  return new BufferAssetUploadError(bufferAssetRateLimit.message, 'rate-limit', {
    retryAfterMs,
    status: 429,
  });
}

function getAssetCacheExpiresAt(data: Record<string, unknown>): number {
  const raw = data.expiresAt ?? data.expires_at;
  if (typeof raw === 'string') {
    const parsedDate = Date.parse(raw);
    if (Number.isFinite(parsedDate) && parsedDate > Date.now()) {
      return Math.min(parsedDate, Date.now() + BUFFER_ASSET_CACHE_TTL_MS);
    }
  }

  const numeric = readPositiveNumber(raw);
  if (numeric) {
    const milliseconds = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    if (milliseconds > Date.now()) {
      return Math.min(milliseconds, Date.now() + BUFFER_ASSET_CACHE_TTL_MS);
    }
  }
  return Date.now() + BUFFER_ASSET_CACHE_TTL_MS;
}

async function assertLocalUploadFileExists(fileUri: string): Promise<void> {
  if (fileUri.startsWith('content://')) return;
  if (!fileUri.startsWith('file://') && !fileUri.startsWith('/')) return;

  const info = await FileSystem.getInfoAsync(fileUri).catch((error: unknown) => {
    if (isStaleLocalFileError(error)) throw staleLocalFileError(error);
    throw error;
  });
  if (!info.exists || info.isDirectory) {
    throw staleLocalFileError();
  }
}

async function uploadBufferAssetOnce(
  fileUri: string,
  mimeType: string,
  forceRefresh: boolean
): Promise<FileSystem.FileSystemUploadResult> {
  const headers = await buildHeaders({ 'Content-Type': mimeType }, forceRefresh);
  const task = FileSystem.createUploadTask(
    `${BUFFER_API_URL}/api/v1/integrations/buffer/assets`,
    fileUri,
    {
      headers,
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    }
  );

  // ต้อง cancel native task ให้เสร็จก่อน reject เพื่อให้ caller ลบ temp file ได้อย่างปลอดภัย
  // (Promise.race แบบเดิมหยุดแค่การรอ แล้ว finally ลบไฟล์ขณะที่ native ยัง upload อยู่)
  return new Promise<FileSystem.FileSystemUploadResult>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      void task.cancelAsync()
        .catch(() => {})
        .finally(() => reject(new BufferRequestTimeoutError('อัปโหลดไฟล์ไป Buffer หมดเวลา (นานเกิน 90 วินาที)')));
    }, BUFFER_UPLOAD_TIMEOUT_MS);

    void task.uploadAsync().then(
      (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!result) {
          reject(new Error('การอัปโหลดไฟล์ไป Buffer ถูกยกเลิก'));
          return;
        }
        resolve(result);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// FileSystem.uploadAsync only knows how to stream a real file:// path — it can't read a
// content:// uri (e.g. Google Flow videos saved into the shared Downloads collection via
// MediaStore on Android, as this app does) and fails with an IOException about a directory
// that doesn't exist. readUriAsDataUrl (native bridge) already reads content:// correctly
// elsewhere in this app (local reference images) via ContentResolver, so reuse it: read the
// file as base64, write it back out to a real local path, then upload that path instead.
async function materializeUploadableFileUri(fileUri: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
  if (!fileUri.startsWith('content://')) {
    return { path: fileUri, cleanup: async () => {} };
  }

  const dataUrl = await readUriAsDataUrl(fileUri);
  const commaIndex = dataUrl?.indexOf(',') ?? -1;
  if (!dataUrl || commaIndex === -1) {
    throw staleLocalFileError();
  }

  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) {
    throw new Error('ไม่พบพื้นที่ cache ของแอป');
  }

  const tempPath = `${cacheDir}kubdee-buffer-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await FileSystem.writeAsStringAsync(tempPath, dataUrl.slice(commaIndex + 1), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return {
    path: tempPath,
    cleanup: async () => {
      await FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
    },
  };
}

async function uploadBufferAssetUncached(fileUri: string, mimeType: string): Promise<string> {
  await assertLocalUploadFileExists(fileUri);
  const { path: uploadPath, cleanup } = await materializeUploadableFileUri(fileUri);
  let result: FileSystem.FileSystemUploadResult;
  try {
    result = await uploadBufferAssetOnce(uploadPath, mimeType, false);
    if (result.status === 401) {
      result = await uploadBufferAssetOnce(uploadPath, mimeType, true);
    }
  } finally {
    await cleanup();
  }

  if (result.status < 200 || result.status >= 300) {
    const data = parseJsonSafe(result.body);
    if (result.status === 429) {
      const rateLimitError = createBufferAssetRateLimitError(data, result.headers, result.status);
      bufferAssetRateLimit = {
        message: rateLimitError.message,
        retryAt: Date.now() + (rateLimitError.retryAfterMs ?? BUFFER_RATE_LIMIT_FALLBACK_MS),
      };
      throw rateLimitError;
    }
    const error = extractApiError(data, `อัปโหลดไฟล์ไป Buffer ไม่สำเร็จ (${result.status})`);
    const detail = readPayloadText(data, 'message');
    throw new BufferAssetUploadError(
      detail && detail !== error ? `${error}: ${detail}` : error,
      'upload',
      { status: result.status }
    );
  }

  const parsed = parseJsonSafe(result.body);
  if (typeof parsed.url !== 'string' || !parsed.url) {
    throw new BufferAssetUploadError('ไม่ได้ URL ไฟล์กลับจาก Buffer', 'upload', { status: result.status });
  }

  const cacheKey = bufferAssetCacheKey(fileUri, mimeType);
  bufferAssetCache.set(cacheKey, { url: parsed.url, expiresAt: getAssetCacheExpiresAt(parsed) });
  return parsed.url;
}

export async function uploadBufferAsset(fileUri: string, mimeType: string): Promise<string> {
  const cleanFileUri = fileUri.trim();
  if (!cleanFileUri) throw staleLocalFileError();
  const normalizedFileUri = cleanFileUri.startsWith('/') ? `file://${cleanFileUri}` : cleanFileUri;
  const normalizedMimeType = mimeType.trim().toLowerCase() || 'video/mp4';
  const cacheKey = bufferAssetCacheKey(normalizedFileUri, normalizedMimeType);
  const cachedUrl = getCachedBufferAssetUrl(cacheKey);
  if (cachedUrl) return cachedUrl;

  const rateLimitError = getActiveBufferAssetRateLimitError();
  if (rateLimitError) throw rateLimitError;

  const inFlight = bufferAssetUploadPromises.get(cacheKey);
  if (inFlight) return inFlight;

  const uploadPromise = uploadBufferAssetUncached(normalizedFileUri, normalizedMimeType).catch((error: unknown) => {
    if (error instanceof BufferAssetUploadError) throw error;
    if (isStaleLocalFileError(error)) throw staleLocalFileError(error);
    throw error;
  });
  bufferAssetUploadPromises.set(cacheKey, uploadPromise);

  try {
    return await uploadPromise;
  } finally {
    if (bufferAssetUploadPromises.get(cacheKey) === uploadPromise) {
      bufferAssetUploadPromises.delete(cacheKey);
    }
  }
}

export async function createFacebookBufferPost({
  channelId,
  text,
  assetUrl,
  assetType = 'video',
  firstComment,
}: CreateFacebookBufferPostParams): Promise<void> {
  const response = await bufferFetch('/api/v1/integrations/buffer/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelId,
      text,
      mode: 'now',
      assets: [{ type: assetType, url: assetUrl }],
      ...(firstComment ? { facebook: { firstComment } } : {}),
    }),
  });

  const data = await readJson(response);
  if (!response.ok || data.success !== true) {
    throw new Error(extractApiError(data, `โพสต์ Facebook ไม่สำเร็จ (${response.status})`));
  }
}

export interface CreateInstagramBufferPostParams {
  channelId: string;
  text: string;
  assetUrl: string;
  firstComment?: string;
}

// Buffer posts the generated video to Instagram as a reel that also shows in
// the feed; the videos are AI-made, so the AI disclosure is always sent.
export async function createInstagramBufferPost({
  channelId,
  text,
  assetUrl,
  firstComment,
}: CreateInstagramBufferPostParams): Promise<void> {
  const response = await bufferFetch('/api/v1/integrations/buffer/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelId,
      text,
      mode: 'now',
      assets: [{ type: 'video', url: assetUrl }],
      instagram: {
        type: 'reel',
        shouldShareToFeed: true,
        isAiGenerated: true,
        ...(firstComment ? { firstComment } : {}),
      },
    }),
  });

  const data = await readJson(response);
  if (!response.ok || data.success !== true) {
    throw new Error(extractApiError(data, `โพสต์ Instagram ไม่สำเร็จ (${response.status})`));
  }
}

export interface CreateYoutubeBufferPostParams {
  channelId: string;
  text: string;
  assetUrl: string;
  title: string;
}

// Buffer publishes YouTube posts as Shorts and requires exactly one video
// asset plus a title. The generated videos are AI-made, so the YouTube
// "altered content" disclosure is always sent.
export async function createYoutubeBufferPost({
  channelId,
  text,
  assetUrl,
  title,
}: CreateYoutubeBufferPostParams): Promise<void> {
  const response = await bufferFetch('/api/v1/integrations/buffer/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelId,
      text,
      mode: 'now',
      assets: [{ type: 'video', url: assetUrl }],
      youtube: { title, isAiGenerated: true },
    }),
  });

  const data = await readJson(response);
  if (!response.ok || data.success !== true) {
    throw new Error(extractApiError(data, `โพสต์ YouTube ไม่สำเร็จ (${response.status})`));
  }
}

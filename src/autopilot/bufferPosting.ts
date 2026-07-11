import * as FileSystem from 'expo-file-system/legacy';

import { refreshAuthToken } from '@/auth/api';
import { APP_TYPE, CLIENT_APP } from '@/auth/constants';
import { getStoredAuthTokens, saveStoredAuthTokens } from '@/auth/storage';
import { readUriAsDataUrl } from '@/native/AccessibilityBridge';

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

class BufferRequestTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new BufferRequestTimeoutError(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

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

export async function getBufferConnectionStatus(): Promise<BufferConnectionStatus> {
  try {
    const response = await bufferFetch('/api/v1/integrations/buffer');
    const data = await readJson(response);
    if (!response.ok) return { connected: false, bufferName: null };

    return {
      connected: data.connected === true,
      bufferName: typeof data.bufferName === 'string' ? data.bufferName : null,
    };
  } catch {
    return { connected: false, bufferName: null };
  }
}

export type BufferChannelService = 'facebook' | 'youtube';

export async function listBufferChannelsByService(service: BufferChannelService): Promise<BufferChannel[]> {
  const response = await bufferFetch('/api/v1/integrations/buffer/channels');
  const data = await readJson(response);
  if (!response.ok || !Array.isArray(data.channels)) {
    return [];
  }

  return (data.channels as Record<string, unknown>[])
    .filter((channel): channel is Record<string, unknown> => {
      return !!channel && typeof channel.id === 'string' && channel.service === service;
    })
    .map((channel) => ({
      id: channel.id as string,
      name: typeof channel.name === 'string' ? channel.name : service,
      displayName: typeof channel.displayName === 'string' ? channel.displayName : null,
      service,
      avatar: typeof channel.avatar === 'string' ? channel.avatar : null,
      isQueuePaused: channel.isQueuePaused === true,
    }));
}

async function uploadBufferAssetOnce(
  fileUri: string,
  mimeType: string,
  forceRefresh: boolean
): Promise<FileSystem.FileSystemUploadResult> {
  const headers = await buildHeaders({ 'Content-Type': mimeType }, forceRefresh);
  // FileSystem.uploadAsync has no AbortSignal/cancellation support, so a timeout here can only
  // stop *waiting* on it (via Promise.race), not cancel the underlying native upload task — still
  // far better than hanging the whole auto pilot run forever on a stalled connection.
  return withTimeout(
    FileSystem.uploadAsync(`${BUFFER_API_URL}/api/v1/integrations/buffer/assets`, fileUri, {
      headers,
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    }),
    BUFFER_UPLOAD_TIMEOUT_MS,
    'อัปโหลดไฟล์ไป Buffer หมดเวลา (นานเกิน 90 วินาที)'
  );
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
    throw new Error('อ่านไฟล์วิดีโอจาก content URI ไม่สำเร็จ');
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

export async function uploadBufferAsset(fileUri: string, mimeType: string): Promise<string> {
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
    throw new Error(extractApiError(parseJsonSafe(result.body), `อัปโหลดไฟล์ไป Buffer ไม่สำเร็จ (${result.status})`));
  }

  const parsed = parseJsonSafe(result.body);
  if (typeof parsed.url !== 'string' || !parsed.url) {
    throw new Error('ไม่ได้ URL ไฟล์กลับจาก Buffer');
  }

  return parsed.url;
}

export async function createFacebookBufferPost({
  channelId,
  text,
  assetUrl,
  assetType = 'video',
}: CreateFacebookBufferPostParams): Promise<void> {
  const response = await bufferFetch('/api/v1/integrations/buffer/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channelId,
      text,
      mode: 'now',
      assets: [{ type: assetType, url: assetUrl }],
    }),
  });

  const data = await readJson(response);
  if (!response.ok || data.success !== true) {
    throw new Error(extractApiError(data, `โพสต์ Facebook ไม่สำเร็จ (${response.status})`));
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

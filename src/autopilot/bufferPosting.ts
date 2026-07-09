import * as FileSystem from 'expo-file-system/legacy';

import { refreshAuthToken } from '@/auth/api';
import { APP_TYPE, CLIENT_APP } from '@/auth/constants';
import { getStoredAuthTokens, saveStoredAuthTokens } from '@/auth/storage';

// Thin client for kubdee-ai-api's Buffer (buffer.com) integration — status,
// Facebook channel listing, and posting a video generated on-device. Mirrors
// the auth/fetch pattern in src/services/cloudTransferService.ts.
const BUFFER_API_URL = 'https://api.kubdee.ai';

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
    return fetch(`${BUFFER_API_URL}${path}`, { ...options, headers });
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

export async function listFacebookBufferChannels(): Promise<BufferChannel[]> {
  const response = await bufferFetch('/api/v1/integrations/buffer/channels');
  const data = await readJson(response);
  if (!response.ok || !Array.isArray(data.channels)) {
    return [];
  }

  return (data.channels as Record<string, unknown>[])
    .filter((channel): channel is Record<string, unknown> => {
      return !!channel && typeof channel.id === 'string' && channel.service === 'facebook';
    })
    .map((channel) => ({
      id: channel.id as string,
      name: typeof channel.name === 'string' ? channel.name : 'Facebook',
      displayName: typeof channel.displayName === 'string' ? channel.displayName : null,
      service: 'facebook',
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
  return FileSystem.uploadAsync(`${BUFFER_API_URL}/api/v1/integrations/buffer/assets`, fileUri, {
    headers,
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
  });
}

export async function uploadBufferAsset(fileUri: string, mimeType: string): Promise<string> {
  let result = await uploadBufferAssetOnce(fileUri, mimeType, false);
  if (result.status === 401) {
    result = await uploadBufferAssetOnce(fileUri, mimeType, true);
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

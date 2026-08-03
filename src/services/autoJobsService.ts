import * as FileSystem from 'expo-file-system/legacy';

import { refreshAuthToken } from '@/auth/api';
import { APP_TYPE, BACKEND_URL, CLIENT_APP } from '@/auth/constants';
import { getStoredAuthTokens, saveStoredAuthTokens } from '@/auth/storage';

// runId convention สำหรับ dedup กับคลังคลิปในเครื่อง: `web-auto-${jobId}`
export const WEB_AUTO_RUN_ID_PREFIX = 'web-auto-';

// ลิงก์วิดีโอ external (signed GCS จาก GeminiGen) มักหมดอายุ — ถือว่าเก่าเกินหลัง 24 ชั่วโมง
export const WEB_CLIP_STALE_EXTERNAL_MS = 24 * 60 * 60 * 1000;

const DEFAULT_LIST_LIMIT = 100;

export type WebAutoClip = {
  id: string;
  jobId: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  title: string;
  productName: string;
  productId: string;
  productUrl: string;
  caption: string;
  hashtags: string;
  cta: string;
  platform: string;
  profileName: string;
  workflowMode: 'single' | 'multi_scene';
  createdAtMs: number | null;
  socialPostStatus: Record<string, unknown> | null;
  urlKind: 'r2' | 'external';
};

export type WebClipDownloadProgress = {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
};

export type WebClipDownloadResult = {
  fileUri: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
};

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function parseAutoJobsApiError(data: unknown, fallback: string): string {
  const record = asRecord(data);
  const message = record.message || record.error;
  return typeof message === 'string' && message.trim() ? message.trim() : fallback;
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  const tokens = await getStoredAuthTokens();
  if (!tokens?.accessToken) {
    throw new Error('กรุณาเข้าสู่ระบบก่อนดึงคลิปจากเว็บ');
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

async function autoJobsFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const request = async (forceRefresh = false): Promise<Response> => {
    const headers = await buildHeaders(
      Object.fromEntries(new Headers(options.headers).entries()),
      forceRefresh
    );
    return fetch(`${BACKEND_URL}${path}`, {
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

// ทำ URL ให้เป็น absolute เสมอ — finalVideoUrl/finalThumbnailUrl จากเว็บอาจเป็น path เช่น /api/images/...
function toAbsoluteUrl(value: unknown): string | null {
  const raw = cleanText(value);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  return `${BACKEND_URL}${raw.startsWith('/') ? '' : '/'}${raw}`;
}

// hostname kubdee.ai / *.kubdee.ai = ไฟล์ถาวรบน R2, ที่เหลือ (GCS/GeminiGen) = ลิงก์ชั่วคราว
// หมายเหตุ: ใช้ regex แทน new URL() เพราะ URL ของ React Native ยัง implement ไม่ครบ
function getUrlKind(url: string): 'r2' | 'external' {
  const host = url.match(/^https?:\/\/([^/?#:]+)/i)?.[1]?.toLowerCase() || '';
  return host === 'kubdee.ai' || host.endsWith('.kubdee.ai') ? 'r2' : 'external';
}

// createdAt จากเว็บเป็น epoch milliseconds อยู่แล้ว — ห้ามแปลงเป็นวินาที
function toEpochMs(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function normalizeHashtags(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string' && !!item.trim())
      .map((item) => item.trim())
      .join(' ');
  }
  return cleanText(value);
}

function normalizeSocialPostStatus(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Ignore malformed JSON.
    }
  }
  return null;
}

// รองรับหลายทรง response: { jobs }, { data: { jobs } }, { data: [] } หรือ array ตรง ๆ
function extractJobs(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.map(asRecord);
  const record = asRecord(payload);
  if (Array.isArray(record.jobs)) return record.jobs.map(asRecord);
  const data = record.data;
  if (Array.isArray(data)) return data.map(asRecord);
  const dataRecord = asRecord(data);
  if (Array.isArray(dataRecord.jobs)) return dataRecord.jobs.map(asRecord);
  return [];
}

function normalizeJob(raw: Record<string, unknown>): WebAutoClip | null {
  const jobId = cleanText(raw.id);
  if (!jobId) return null;

  const workflowMode: 'single' | 'multi_scene' =
    cleanText(raw.workflowMode) === 'multi_scene' ? 'multi_scene' : 'single';

  // multi_scene ต้องใช้คลิปที่รวมแล้ว (finalVideoUrl) เท่านั้น — videoUrl รายฉากไม่ใช่คลิปเต็ม
  const videoUrl =
    workflowMode === 'multi_scene' ? toAbsoluteUrl(raw.finalVideoUrl) : toAbsoluteUrl(raw.videoUrl);
  if (!videoUrl) return null;

  const product = asRecord(raw.product);
  const productName = cleanText(product.name);
  const thumbnailUrl =
    toAbsoluteUrl(raw.finalThumbnailUrl) ||
    toAbsoluteUrl(raw.thumbnailUrl) ||
    toAbsoluteUrl(product.imageUrl) ||
    toAbsoluteUrl(product.image);

  return {
    id: `web:${jobId}`,
    jobId,
    videoUrl,
    thumbnailUrl,
    title: productName || `คลิปจากเว็บ #${jobId}`,
    productName,
    productId: cleanText(product.productId),
    productUrl: cleanText(product.productUrl),
    caption: cleanText(product.caption),
    hashtags: normalizeHashtags(product.hashtags),
    cta: cleanText(product.cta),
    platform: cleanText(product.platform).toLowerCase(),
    profileName: cleanText(product.profileName),
    workflowMode,
    createdAtMs: toEpochMs(raw.createdAt),
    socialPostStatus: normalizeSocialPostStatus(raw.socialPostStatus),
    urlKind: getUrlKind(videoUrl),
  };
}

export function getWebAutoJobIdFromRunId(runId: string): string | null {
  if (typeof runId !== 'string' || !runId.startsWith(WEB_AUTO_RUN_ID_PREFIX)) return null;
  const jobId = runId.slice(WEB_AUTO_RUN_ID_PREFIX.length).trim();
  return jobId || null;
}

export function isWebClipLinkStale(clip: WebAutoClip, maxAgeMs = WEB_CLIP_STALE_EXTERNAL_MS): boolean {
  if (clip.urlKind !== 'external') return false;
  if (clip.createdAtMs === null) return false;
  return Date.now() - clip.createdAtMs > maxAgeMs;
}

export async function listWebAutoClips(options: { limit?: number } = {}): Promise<WebAutoClip[]> {
  const limit =
    typeof options.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0
      ? Math.floor(options.limit)
      : DEFAULT_LIST_LIMIT;

  const response = await autoJobsFetch(`/api/user/auto-jobs?limit=${limit}`);
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(parseAutoJobsApiError(data, `โหลดคลิปจากเว็บไม่สำเร็จ (${response.status})`));
  }

  const clips = extractJobs(data)
    .map(normalizeJob)
    .filter((clip): clip is WebAutoClip => clip !== null);

  clips.sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
  return clips;
}

function buildDownloadErrorMessage(clip: WebAutoClip, status: number): string {
  const base = `ดาวน์โหลดคลิป "${clip.title}" ไม่สำเร็จ (${status})`;
  return clip.urlKind === 'external' ? `${base} ลิงก์ต้นทางอาจหมดอายุแล้ว` : base;
}

async function safeDeletePartialFile(fileUri: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(fileUri, { idempotent: true });
  } catch {
    // Best effort cleanup only.
  }
}

export async function downloadWebAutoClip(
  clip: WebAutoClip,
  onProgress?: (progress: WebClipDownloadProgress) => void
): Promise<WebClipDownloadResult> {
  if (!FileSystem.documentDirectory) {
    throw new Error('ไม่พบพื้นที่เก็บไฟล์บนเครื่อง');
  }

  const directory = `${FileSystem.documentDirectory}creative-media/videos/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const fileName = `${Date.now()}-web-auto-${clip.jobId}.mp4`;
  const fileUri = `${directory}${fileName}`;

  // ลิงก์วิดีโอเป็น public URL (signed GCS หรือ kubdee.ai) — ห้ามส่ง auth headers เพราะจะทำ signed URL พัง
  const download = FileSystem.createDownloadResumable(clip.videoUrl, fileUri, {}, (progress) => {
    onProgress?.({
      totalBytesWritten: progress.totalBytesWritten,
      totalBytesExpectedToWrite: progress.totalBytesExpectedToWrite,
    });
  });

  let result: FileSystem.FileSystemDownloadResult | undefined;
  try {
    result = await download.downloadAsync();
  } catch {
    await safeDeletePartialFile(fileUri);
    throw new Error(buildDownloadErrorMessage(clip, 0));
  }

  if (!result || result.status < 200 || result.status >= 300) {
    await safeDeletePartialFile(fileUri);
    throw new Error(buildDownloadErrorMessage(clip, result?.status || 0));
  }

  const info = await FileSystem.getInfoAsync(result.uri);
  return {
    fileUri: result.uri,
    fileName,
    mimeType: 'video/mp4',
    sizeBytes: info.exists && typeof info.size === 'number' ? info.size : null,
  };
}

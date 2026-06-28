import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';

import packageJson from '../../package.json';

import { APP_TYPE, BACKEND_URL, CLIENT_APP } from '@/auth/constants';

const APK_MIME_TYPE = 'application/vnd.android.package-archive';
const FLAG_GRANT_READ_URI_PERMISSION = 1;

interface ReleaseResponse {
  releases?: MobileRelease[];
  error?: string;
  message?: string;
}

export interface MobileRelease {
  id: string;
  version: string;
  date?: string | null;
  highlight?: string | null;
  changes?: string | Array<{ type?: string; text?: string }>;
  apkSize?: number | null;
  apkFileName?: string | null;
  fileName?: string | null;
  versionCode?: number | null;
  minSupportedVersionCode?: number | null;
  forceUpdate?: boolean | null;
}

export interface MobileUpdateResult {
  currentVersion: string;
  currentVersionCode: number | null;
  latest: MobileRelease | null;
  hasUpdate: boolean;
  forceUpdate: boolean;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'X-Client-App': CLIENT_APP,
    'X-App-Type': APP_TYPE,
    'X-Mobile-Version': getCurrentMobileVersion(),
    'X-Mobile-Version-Code': String(getCurrentMobileVersionCode() ?? ''),
  };
}

function normalizeVersion(version = ''): string {
  return String(version || '').trim().replace(/^v/i, '');
}

function compareVersions(leftVersion: string, rightVersion: string): number {
  const left = normalizeVersion(leftVersion).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = normalizeVersion(rightVersion).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }

  return 0;
}

function asNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.floor(numberValue) : null;
}

function parseChanges(changes: MobileRelease['changes']): string[] {
  const withoutMetadata = (lines: string[]): string[] =>
    lines.filter((line) => !/^(versionCode|version_code|build|buildCode|minSupportedVersionCode|min_supported_version_code|minBuild|min_build|forceUpdate|force_update|force)\s*:/i.test(line));

  if (Array.isArray(changes)) {
    return withoutMetadata(changes.map((change) => change.text?.trim()).filter(Boolean) as string[]);
  }

  if (typeof changes !== 'string' || !changes.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(changes) as Array<{ text?: string }>;
    if (Array.isArray(parsed)) {
      return withoutMetadata(parsed.map((change) => change.text?.trim()).filter(Boolean) as string[]);
    }
  } catch {
    return withoutMetadata(
      changes
        .split('\n')
        .map((line) => line.replace(/^[-*]\s*/, '').trim())
        .filter(Boolean)
    );
  }

  return [];
}

export function getCurrentMobileVersion(): string {
  return Application.nativeApplicationVersion || packageJson.version || '0.1.0';
}

export function getCurrentMobileVersionCode(): number | null {
  return asNumber(Application.nativeBuildVersion);
}

export function getCurrentMobileVersionLabel(): string {
  const version = getCurrentMobileVersion();
  return `v${version}`;
}

export function getReleaseNotes(release: MobileRelease | null): string[] {
  if (!release) {
    return [];
  }

  return parseChanges(release.changes).slice(0, 4);
}

export function getReleaseFileName(release: MobileRelease): string {
  return release.apkFileName || release.fileName || `kubdee-ai-mobile-v${normalizeVersion(release.version)}.apk`;
}

export async function checkMobileUpdate(token: string): Promise<MobileUpdateResult> {
  const response = await fetch(`${BACKEND_URL}/api/user/releases?app=mobile`, {
    headers: authHeaders(token),
  });

  let body: ReleaseResponse = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) {
    throw new Error(body.error || body.message || 'เช็คอัปเดตไม่สำเร็จ');
  }

  const currentVersion = getCurrentMobileVersion();
  const currentVersionCode = getCurrentMobileVersionCode();
  const latest = Array.isArray(body.releases) ? body.releases[0] ?? null : null;
  const latestVersionCode = asNumber(latest?.versionCode);
  const minSupportedVersionCode = asNumber(latest?.minSupportedVersionCode);

  const hasUpdate = latest
    ? latestVersionCode && currentVersionCode
      ? latestVersionCode > currentVersionCode
      : compareVersions(latest.version, currentVersion) > 0
    : false;

  const forceUpdate = Boolean(
    latest &&
      (latest.forceUpdate ||
        (minSupportedVersionCode && currentVersionCode && currentVersionCode < minSupportedVersionCode))
  );

  return {
    currentVersion,
    currentVersionCode,
    latest,
    hasUpdate,
    forceUpdate,
  };
}

export async function downloadAndOpenMobileUpdate(token: string, release: MobileRelease): Promise<string> {
  if (Platform.OS !== 'android') {
    await Linking.openURL(`${BACKEND_URL}/download?app=mobile`);
    return '';
  }

  const fileName = getReleaseFileName(release);
  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) {
    throw new Error('ไม่พบพื้นที่เก็บไฟล์ชั่วคราวบนเครื่อง');
  }

  const fileUri = `${cacheDirectory}${fileName}`;
  const downloadUrl = `${BACKEND_URL}/api/user/releases/${encodeURIComponent(release.id)}/download`;
  const result = await FileSystem.downloadAsync(downloadUrl, fileUri, {
    headers: authHeaders(token),
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`ดาวน์โหลดไฟล์อัปเดตไม่สำเร็จ (${result.status})`);
  }

  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    flags: FLAG_GRANT_READ_URI_PERMISSION,
    type: APK_MIME_TYPE,
  });

  return result.uri;
}

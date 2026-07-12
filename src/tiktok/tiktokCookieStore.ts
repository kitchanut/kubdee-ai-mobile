import CookieManager, { type Cookie } from '@react-native-cookies/cookies';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

/**
 * Per-profile TikTok session persistence.
 *
 * The login cookies that matter (`sessionid`, `sid_tt`, `sid_guard`, `uid_tt`) are
 * httpOnly, so `document.cookie` in the WebView can never see them. We read/write them
 * through the native Android cookie jar via `@react-native-cookies/cookies` and keep a
 * durable snapshot per profile as a JSON file in the app sandbox.
 *
 * Android quirks this module is built around (verified against the native module):
 *  - The WebView shares ONE cookie jar app-wide, so clearing must be scoped to the
 *    tiktok domain only — Google Flow's session on google.com/labs.google must survive.
 *  - `CookieManager.clearByName` is NOT supported on Android (it rejects). We instead
 *    expire each tiktok cookie by writing a `Max-Age=0` Set-Cookie string for that name,
 *    which only touches the tiktok domain.
 *  - `CookieManager.get(url)` on Android returns only `name`/`value` per cookie (parsed
 *    from the Cookie header), losing the real `expires`. That is why we ALSO persist a
 *    file snapshot and re-inject it on every mount — session cookies would otherwise not
 *    reliably survive a process restart.
 */

export const TIKTOK_URL = 'https://www.tiktok.com';
export const TIKTOK_LOGIN_URL = 'https://www.tiktok.com/login';

// Folder (inside the app's private document directory) that holds one JSON snapshot
// per profile. SecureStore is unusable here: Android caps a value at ~2KB and TikTok's
// combined cookies routinely exceed that.
const COOKIE_DIRECTORY = 'tiktok-cookies';

// Presence of any of these (with a value) in a snapshot marks the profile as logged in.
const SESSION_COOKIE_NAMES = ['sessionid', 'sid_tt'];

interface CookieSnapshot {
  updatedAt: number;
  cookies: Cookie[];
}

function ensureDocumentDirectory(): string {
  if (!FileSystem.documentDirectory) {
    throw new Error('ไม่พบพื้นที่จัดเก็บของแอป');
  }
  return FileSystem.documentDirectory;
}

async function cookieDirectory(): Promise<string> {
  const directory = `${ensureDocumentDirectory()}${COOKIE_DIRECTORY}/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  return directory;
}

// Keep the filename filesystem-safe regardless of what a profile id contains.
function sanitizeProfileId(profileId: string): string {
  const cleaned = (profileId || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return cleaned || 'default';
}

async function profileFilePath(profileId: string): Promise<string> {
  const directory = await cookieDirectory();
  return `${directory}${sanitizeProfileId(profileId)}.json`;
}

async function readSnapshot(profileId: string): Promise<CookieSnapshot | null> {
  try {
    const path = await profileFilePath(profileId);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.isDirectory) {
      return null;
    }

    const raw = await FileSystem.readAsStringAsync(path);
    const parsed = JSON.parse(raw) as Partial<CookieSnapshot>;
    if (!parsed || !Array.isArray(parsed.cookies)) {
      return null;
    }

    const cookies = parsed.cookies.filter(
      (cookie): cookie is Cookie =>
        !!cookie && typeof cookie.name === 'string' && typeof cookie.value === 'string'
    );
    return { updatedAt: Number(parsed.updatedAt) || 0, cookies };
  } catch {
    return null;
  }
}

async function writeSnapshot(profileId: string, cookies: Cookie[]): Promise<void> {
  const path = await profileFilePath(profileId);
  const snapshot: CookieSnapshot = { updatedAt: Date.now(), cookies };
  await FileSystem.writeAsStringAsync(path, JSON.stringify(snapshot));
}

// Read every cookie the Android WebView currently holds for the tiktok domain.
async function getLiveTikTokCookies(): Promise<Cookie[]> {
  try {
    const cookies = await CookieManager.get(TIKTOK_URL, false);
    return Object.values(cookies).filter((cookie) => !!cookie?.name && cookie.value != null);
  } catch {
    return [];
  }
}

// Persist cookies to the WebView's on-disk store (Android). Ignored elsewhere.
async function flushCookies(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    await CookieManager.flush();
  } catch {
    // best-effort
  }
}

// Remove a single cookie scoped to the tiktok domain ONLY.
//   - Android has no clearByName, so we expire it with a Max-Age=0 Set-Cookie string
//     for both the host-only (www.tiktok.com) and domain-wide (.tiktok.com) variants.
//   - iOS supports clearByName directly.
// Both paths are best-effort; the unsupported one simply rejects and is ignored.
async function expireTikTokCookie(name: string): Promise<void> {
  const expired = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0`;
  await Promise.allSettled([
    CookieManager.clearByName(TIKTOK_URL, name, false),
    CookieManager.setFromResponse(TIKTOK_URL, expired),
    CookieManager.setFromResponse(TIKTOK_URL, `${expired}; Domain=.tiktok.com`),
  ]);
}

/**
 * Read the live TikTok cookies from the WebView jar and save them to this profile's file.
 * Skips writing when the jar has no tiktok cookies, so a transient empty read never
 * clobbers a good saved session (explicit logout is handled by clearProfileTikTokSession).
 */
export async function snapshotProfileCookies(profileId: string): Promise<void> {
  const cookies = await getLiveTikTokCookies();
  if (cookies.length === 0) {
    return;
  }
  try {
    await writeSnapshot(profileId, cookies);
  } catch {
    // best-effort; a failed snapshot must never crash the WebView
  }
}

/**
 * Clear whatever tiktok cookies are live, then push this profile's saved cookies back into
 * the WebView jar. Never touches non-tiktok domains (Google Flow's session is preserved).
 */
export async function restoreProfileCookies(profileId: string): Promise<void> {
  await clearLiveTikTokCookies();

  const snapshot = await readSnapshot(profileId);
  if (!snapshot || snapshot.cookies.length === 0) {
    return;
  }

  for (const cookie of snapshot.cookies) {
    try {
      await CookieManager.set(TIKTOK_URL, cookie, false);
    } catch {
      // skip individual cookies that fail to set
    }
  }
  await flushCookies();
}

/**
 * Remove every tiktok-domain cookie from the WebView jar. Scoped to tiktok only — it walks
 * the live cookie names and expires each one; it never calls clearAll.
 */
export async function clearLiveTikTokCookies(): Promise<void> {
  const cookies = await getLiveTikTokCookies();
  for (const cookie of cookies) {
    await expireTikTokCookie(cookie.name);
  }
  await flushCookies();
}

/**
 * Log this profile out: clear the live tiktok cookies and delete its saved snapshot file.
 */
export async function clearProfileTikTokSession(profileId: string): Promise<void> {
  await clearLiveTikTokCookies();
  try {
    const path = await profileFilePath(profileId);
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    // best-effort
  }
}

/**
 * Whether this profile is considered logged in, judged from its saved snapshot
 * (has a `sessionid`/`sid_tt` cookie with a value).
 */
export async function isProfileLoggedIn(profileId: string): Promise<boolean> {
  const snapshot = await readSnapshot(profileId);
  if (!snapshot) {
    return false;
  }
  return snapshot.cookies.some(
    (cookie) => SESSION_COOKIE_NAMES.includes(cookie.name) && !!cookie.value
  );
}

/**
 * Whether the WebView jar right now holds a logged-in TikTok session (has `sessionid`).
 */
export async function readLiveLoginState(): Promise<boolean> {
  const cookies = await getLiveTikTokCookies();
  return cookies.some((cookie) => cookie.name === 'sessionid' && !!cookie.value);
}

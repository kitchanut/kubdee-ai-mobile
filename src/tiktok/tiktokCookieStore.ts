import CookieManager, { type Cookie } from '@react-native-cookies/cookies';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Per-profile TikTok session persistence.
 *
 * The login cookies that matter (`sessionid`, `sid_tt`, `sid_guard`, `uid_tt`) are
 * httpOnly, so `document.cookie` in the WebView can never see them. We read/write them
 * through the native Android cookie jar via `@react-native-cookies/cookies` and keep a
 * chunked, device-bound SecureStore snapshot per profile.
 *
 * Android quirks this module is built around (verified against the native module):
 *  - The WebView shares ONE cookie jar app-wide, so clearing must be scoped to the
 *    tiktok domain only — Google Flow's session on google.com/labs.google must survive.
 *  - `CookieManager.clearByName` is NOT supported on Android (it rejects). We instead
 *    expire each tiktok cookie by writing a `Max-Age=0` Set-Cookie string for that name,
 *    which only touches the tiktok domain.
 *  - `CookieManager.get(url)` on Android returns only `name`/`value` per cookie (parsed
 *    from the Cookie header), losing the original Set-Cookie attributes. That is why we
 *    persist a hardened snapshot and re-inject it on every mount — session cookies would
 *    otherwise not reliably survive a process restart.
 */

export const TIKTOK_URL = 'https://www.tiktok.com';
export const TIKTOK_LOGIN_URL = 'https://www.tiktok.com/login';

// Legacy plaintext snapshots are read once for migration. They are deliberately retained
// until an explicit profile logout; automatic migration/invalidation never deletes them.
const COOKIE_DIRECTORY = 'tiktok-cookies';

// SecureStore can reject large payloads on some platform/version combinations. Keep every
// value comfortably below 2KB and reconstruct the JSON from chunks.
const SECURE_SNAPSHOT_PREFIX = 'kubdee_tiktok_cookie_v2';
const SECURE_SNAPSHOT_CHUNK_SIZE = 1500;
const SECURE_SNAPSHOT_MAX_CHUNKS = 128;
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// Both stored and live login state must use the exact same cookie criterion.
const SESSION_COOKIE_NAMES = new Set(['sessionid', 'sid_tt']);

// Android strips attributes when reading the Cookie header. Harden all known TikTok
// authentication cookies explicitly when they are persisted and restored.
const SENSITIVE_COOKIE_NAMES = new Set([
  ...SESSION_COOKIE_NAMES,
  'sessionid_ss',
  'sid_guard',
  'uid_tt',
  'uid_tt_ss',
]);
// Android WebView normalizes domain cookies without a leading dot. Supplying `.tiktok.com`
// to setCookie can be rejected on some WebView versions, leaving the old auth cookie intact.
const TIKTOK_COOKIE_DOMAIN = 'tiktok.com';
const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const UNSAFE_COOKIE_VALUE_PATTERN = /[;\u0000-\u001f\u007f]/;

// Every WebView shares this one native jar. Serialize all jar operations, and track the
// current owner so a delayed snapshot from profile A cannot capture profile B's cookies.
let cookieJarQueue: Promise<void> = Promise.resolve();
let liveCookieProfileId: string | null = null;

function withCookieJarLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = cookieJarQueue.then(operation);
  cookieJarQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

interface CookieSnapshot {
  updatedAt: number;
  cookies: Cookie[];
}

interface SecureSnapshotMeta {
  version: 1;
  chunkCount: number;
  updatedAt: number;
  invalidated?: boolean;
}

interface SecureSnapshotReadResult {
  present: boolean;
  snapshot: CookieSnapshot | null;
}

function normalizedCookieName(name: string): string {
  return name.trim().toLowerCase();
}

function hasLoginSession(cookies: Cookie[]): boolean {
  return cookies.some(
    (cookie) =>
      SESSION_COOKIE_NAMES.has(normalizedCookieName(cookie.name)) &&
      !!cookie.value
  );
}

function normalizeTikTokDomain(domain?: string): string {
  const normalized = (domain || '').trim().toLowerCase().replace(/^\./, '');
  if (normalized === 'tiktok.com' || normalized.endsWith('.tiktok.com')) {
    return `.${normalized}`;
  }
  return TIKTOK_COOKIE_DOMAIN;
}

function normalizeCookiePath(path?: string): string {
  if (!path || !path.startsWith('/') || /[;\r\n]/.test(path)) {
    return '/';
  }
  return path;
}

function normalizeCookie(cookie: Cookie): Cookie | null {
  const name = cookie.name?.trim();
  const value = cookie.value;
  if (
    !name ||
    !COOKIE_NAME_PATTERN.test(name) ||
    typeof value !== 'string' ||
    UNSAFE_COOKIE_VALUE_PATTERN.test(value)
  ) {
    return null;
  }

  const sensitive = SENSITIVE_COOKIE_NAMES.has(normalizedCookieName(name));
  const normalized: Cookie = {
    name,
    value,
    domain: sensitive
      ? TIKTOK_COOKIE_DOMAIN
      : normalizeTikTokDomain(cookie.domain),
    path: sensitive ? '/' : normalizeCookiePath(cookie.path),
    secure: true,
    httpOnly: sensitive || cookie.httpOnly === true,
  };

  if (cookie.expires) {
    const expiresAt = Date.parse(cookie.expires);
    if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
      // The native module parses the ISO-8601 format used by its Cookie object API.
      normalized.expires = new Date(expiresAt).toISOString();
    }
  }
  return normalized;
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

function parseSnapshot(raw: string): CookieSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CookieSnapshot>;
    if (!parsed || !Array.isArray(parsed.cookies)) {
      return null;
    }
    const cookies = parsed.cookies
      .filter(
        (cookie): cookie is Cookie =>
          !!cookie &&
          typeof cookie.name === 'string' &&
          typeof cookie.value === 'string'
      )
      .map(normalizeCookie)
      .filter((cookie): cookie is Cookie => cookie !== null);
    return { updatedAt: Number(parsed.updatedAt) || 0, cookies };
  } catch {
    return null;
  }
}

function secureSnapshotBaseKey(profileId: string): string {
  return `${SECURE_SNAPSHOT_PREFIX}.${sanitizeProfileId(profileId)}`;
}

function secureSnapshotMetaKey(profileId: string): string {
  return `${secureSnapshotBaseKey(profileId)}.meta`;
}

function secureSnapshotChunkKey(profileId: string, index: number): string {
  return `${secureSnapshotBaseKey(profileId)}.chunk.${index}`;
}

function parseSecureMeta(raw: string): SecureSnapshotMeta | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SecureSnapshotMeta>;
    const chunkCount = Number(parsed.chunkCount);
    if (
      parsed.version !== 1 ||
      !Number.isInteger(chunkCount) ||
      chunkCount < 0 ||
      chunkCount > SECURE_SNAPSHOT_MAX_CHUNKS
    ) {
      return null;
    }
    return {
      version: 1,
      chunkCount,
      updatedAt: Number(parsed.updatedAt) || 0,
      invalidated: parsed.invalidated === true,
    };
  } catch {
    return null;
  }
}

async function readSecureSnapshot(
  profileId: string
): Promise<SecureSnapshotReadResult> {
  const rawMeta = await SecureStore.getItemAsync(
    secureSnapshotMetaKey(profileId),
    SECURE_STORE_OPTIONS
  );
  if (rawMeta == null) {
    return { present: false, snapshot: null };
  }

  const meta = parseSecureMeta(rawMeta);
  if (!meta || meta.invalidated || meta.chunkCount === 0) {
    // A present tombstone/corrupt record must not fall back to a stale plaintext session.
    return { present: true, snapshot: null };
  }

  const chunks: string[] = [];
  for (let index = 0; index < meta.chunkCount; index += 1) {
    const chunk = await SecureStore.getItemAsync(
      secureSnapshotChunkKey(profileId, index),
      SECURE_STORE_OPTIONS
    );
    if (chunk == null) {
      return { present: true, snapshot: null };
    }
    chunks.push(chunk);
  }
  return { present: true, snapshot: parseSnapshot(chunks.join('')) };
}

async function readLegacySnapshot(
  profileId: string
): Promise<CookieSnapshot | null> {
  try {
    const path = await profileFilePath(profileId);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.isDirectory) {
      return null;
    }
    return parseSnapshot(await FileSystem.readAsStringAsync(path));
  } catch {
    return null;
  }
}

async function writeSecureSnapshot(
  profileId: string,
  snapshot: CookieSnapshot
): Promise<void> {
  const serialized = JSON.stringify(snapshot);
  const chunks: string[] = [];
  for (
    let offset = 0;
    offset < serialized.length;
    offset += SECURE_SNAPSHOT_CHUNK_SIZE
  ) {
    chunks.push(serialized.slice(offset, offset + SECURE_SNAPSHOT_CHUNK_SIZE));
  }
  if (chunks.length === 0 || chunks.length > SECURE_SNAPSHOT_MAX_CHUNKS) {
    throw new Error('TikTok session มีขนาดใหญ่เกินพื้นที่จัดเก็บที่ปลอดภัย');
  }

  const metaKey = secureSnapshotMetaKey(profileId);
  const previousRawMeta = await SecureStore.getItemAsync(
    metaKey,
    SECURE_STORE_OPTIONS
  );
  const previousChunkCount = previousRawMeta
    ? (parseSecureMeta(previousRawMeta)?.chunkCount ?? 0)
    : 0;

  for (let index = 0; index < chunks.length; index += 1) {
    await SecureStore.setItemAsync(
      secureSnapshotChunkKey(profileId, index),
      chunks[index],
      SECURE_STORE_OPTIONS
    );
  }
  const meta: SecureSnapshotMeta = {
    version: 1,
    chunkCount: chunks.length,
    updatedAt: snapshot.updatedAt,
  };
  // Commit metadata last so readers never observe an incomplete new chunk count.
  await SecureStore.setItemAsync(
    metaKey,
    JSON.stringify(meta),
    SECURE_STORE_OPTIONS
  );

  for (let index = chunks.length; index < previousChunkCount; index += 1) {
    await SecureStore.deleteItemAsync(
      secureSnapshotChunkKey(profileId, index),
      SECURE_STORE_OPTIONS
    );
  }
}

async function writeSnapshot(
  profileId: string,
  cookies: Cookie[]
): Promise<void> {
  await writeSecureSnapshot(profileId, { updatedAt: Date.now(), cookies });
}

async function readSnapshot(profileId: string): Promise<CookieSnapshot | null> {
  try {
    const secure = await readSecureSnapshot(profileId);
    if (secure.present) {
      return secure.snapshot;
    }

    const legacy = await readLegacySnapshot(profileId);
    if (legacy) {
      // Migrate forward but intentionally retain the legacy file. It is removed only by an
      // explicit logout, while config-level backup exclusion protects existing installs.
      await writeSecureSnapshot(profileId, legacy).catch(() => undefined);
    }
    return legacy;
  } catch {
    // A SecureStore access failure is not equivalent to "no record"; do not revive legacy.
    return null;
  }
}

async function invalidateSecureSnapshot(profileId: string): Promise<void> {
  const metaKey = secureSnapshotMetaKey(profileId);
  const previousRawMeta = await SecureStore.getItemAsync(
    metaKey,
    SECURE_STORE_OPTIONS
  );
  const previousChunkCount = previousRawMeta
    ? (parseSecureMeta(previousRawMeta)?.chunkCount ?? 0)
    : 0;
  const tombstone: SecureSnapshotMeta = {
    version: 1,
    chunkCount: 0,
    updatedAt: Date.now(),
    invalidated: true,
  };
  await SecureStore.setItemAsync(
    metaKey,
    JSON.stringify(tombstone),
    SECURE_STORE_OPTIONS
  );
  await Promise.allSettled(
    Array.from({ length: previousChunkCount }, (_, index) =>
      SecureStore.deleteItemAsync(
        secureSnapshotChunkKey(profileId, index),
        SECURE_STORE_OPTIONS
      )
    )
  );
}

async function deleteSnapshotForExplicitLogout(
  profileId: string
): Promise<void> {
  const secureKeys = [secureSnapshotMetaKey(profileId)];
  for (let index = 0; index < SECURE_SNAPSHOT_MAX_CHUNKS; index += 1) {
    secureKeys.push(secureSnapshotChunkKey(profileId, index));
  }
  const results = await Promise.allSettled(
    secureKeys.map((key) =>
      SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS)
    )
  );
  if (results.some((result) => result.status === 'rejected')) {
    throw new Error('ลบ TikTok session จาก SecureStore ไม่สำเร็จ');
  }

  // Explicit logout preserves the original behavior and is the only automatic action that
  // is allowed to remove the legacy plaintext file.
  const path = await profileFilePath(profileId);
  await FileSystem.deleteAsync(path, { idempotent: true });
}

// Read every cookie the Android WebView currently holds for the tiktok domain. Errors are
// intentionally propagated so destructive operations can distinguish failure from empty.
async function getLiveTikTokCookies(): Promise<Cookie[]> {
  const cookies = await CookieManager.get(TIKTOK_URL, false);
  return Object.values(cookies)
    .filter(
      (cookie): cookie is Cookie =>
        !!cookie &&
        typeof cookie.name === 'string' &&
        typeof cookie.value === 'string'
    )
    .map(normalizeCookie)
    .filter((cookie): cookie is Cookie => cookie !== null);
}

// Persist cookies to the WebView's on-disk store (Android). Ignored elsewhere.
async function flushCookies(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await CookieManager.flush();
}

// Remove a single cookie scoped to the tiktok domain ONLY.
//   - Android has no clearByName, so we expire it with a Max-Age=0 Set-Cookie string
//     for both the host-only (www.tiktok.com) and domain-wide (.tiktok.com) variants.
//   - iOS supports clearByName directly.
async function expireTikTokCookie(name: string): Promise<void> {
  const expired = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0`;
  await Promise.allSettled([
    CookieManager.clearByName(TIKTOK_URL, name, false),
    CookieManager.setFromResponse(TIKTOK_URL, expired),
    CookieManager.setFromResponse(
      TIKTOK_URL,
      `${expired}; Domain=www.tiktok.com`
    ),
    CookieManager.setFromResponse(
      TIKTOK_URL,
      `${expired}; Domain=${TIKTOK_COOKIE_DOMAIN}`
    ),
  ]);
}

async function setSnapshotCookie(cookie: Cookie): Promise<void> {
  if (SENSITIVE_COOKIE_NAMES.has(normalizedCookieName(cookie.name))) {
    // The object API has no SameSite field and Android's read API stripped all attributes.
    // Use a hardened Set-Cookie response so auth cookies never become JS-readable/insecure.
    const header = `${cookie.name}=${cookie.value}; Domain=${TIKTOK_COOKIE_DOMAIN}; Path=/; Secure; HttpOnly; SameSite=Lax`;
    const didSet = await CookieManager.setFromResponse(TIKTOK_URL, header);
    if (!didSet) {
      throw new Error(`ไม่สามารถคืนค่า TikTok cookie: ${cookie.name}`);
    }
    return;
  }

  const didSet = await CookieManager.set(TIKTOK_URL, cookie, false);
  if (!didSet) {
    throw new Error(`ไม่สามารถคืนค่า TikTok cookie: ${cookie.name}`);
  }
}

async function clearLiveTikTokCookiesUnlocked(): Promise<void> {
  const cookies = await getLiveTikTokCookies();
  const cookieNames = [
    ...new Set([
      ...cookies.map((cookie) => cookie.name),
      ...SENSITIVE_COOKIE_NAMES,
    ]),
  ];
  for (const name of cookieNames) {
    await expireTikTokCookie(name);
  }
  await flushCookies();

  const remainingCookies = await getLiveTikTokCookies();
  const remainingSensitiveNames = remainingCookies
    .filter(
      (cookie) =>
        SENSITIVE_COOKIE_NAMES.has(normalizedCookieName(cookie.name)) &&
        !!cookie.value
    )
    .map((cookie) => cookie.name);
  if (remainingSensitiveNames.length > 0) {
    throw new Error(
      `ล้าง TikTok session ไม่สำเร็จ (${remainingSensitiveNames.join(', ')})`
    );
  }
  liveCookieProfileId = null;
}

/**
 * Read the live TikTok cookies and save them to this profile's chunked SecureStore record.
 * An empty successful read invalidates a snapshot that previously represented a login.
 */
export async function snapshotProfileCookies(profileId: string): Promise<void> {
  await withCookieJarLock(async () => {
    if (liveCookieProfileId && liveCookieProfileId !== profileId) {
      return;
    }

    try {
      const cookies = await getLiveTikTokCookies();
      liveCookieProfileId = profileId;
      if (cookies.length === 0) {
        const previous = await readSnapshot(profileId);
        if (previous && hasLoginSession(previous.cookies)) {
          // Tombstone blocks fallback to the retained legacy file.
          await invalidateSecureSnapshot(profileId);
        }
        return;
      }
      await writeSnapshot(profileId, cookies);
    } catch {
      // Navigation/background/unmount callers intentionally treat snapshotting as best effort.
    }
  });
}

/**
 * Clear whatever tiktok cookies are live, then push this profile's saved cookies back into
 * the WebView jar. Never touches non-tiktok domains (Google Flow's session is preserved).
 */
export async function restoreProfileCookies(profileId: string): Promise<void> {
  await withCookieJarLock(async () => {
    await clearLiveTikTokCookiesUnlocked();

    const snapshot = await readSnapshot(profileId);
    if (!snapshot || snapshot.cookies.length === 0) {
      liveCookieProfileId = profileId;
      return;
    }

    try {
      for (const cookie of snapshot.cookies) {
        await setSnapshotCookie(cookie);
      }
      await flushCookies();

      const restoredCookies = await getLiveTikTokCookies();
      if (
        hasLoginSession(snapshot.cookies) &&
        !hasLoginSession(restoredCookies)
      ) {
        throw new Error('คืนค่า TikTok session ไม่สำเร็จ');
      }
      liveCookieProfileId = profileId;
    } catch (error) {
      // Never leave a partially restored account in the global jar.
      await clearLiveTikTokCookiesUnlocked().catch(() => undefined);
      throw error;
    }
  });
}

/**
 * Remove every tiktok-domain cookie from the WebView jar. Scoped to tiktok only — it walks
 * the live cookie names and expires each one; it never calls clearAll.
 */
export async function clearLiveTikTokCookies(): Promise<void> {
  await withCookieJarLock(clearLiveTikTokCookiesUnlocked);
}

/**
 * Log this profile out: clear the live tiktok cookies and delete its saved snapshot file.
 */
export async function clearProfileTikTokSession(
  profileId: string
): Promise<void> {
  await withCookieJarLock(async () => {
    // The global jar is transient and every profile has its own durable snapshot. Always clear
    // it before the logout WebView opens, otherwise that WebView could expose another profile's
    // live cookies while it clears shared browser storage.
    await clearLiveTikTokCookiesUnlocked();

    await deleteSnapshotForExplicitLogout(profileId);
    const remainingSnapshot = await readSnapshot(profileId);
    if (remainingSnapshot && hasLoginSession(remainingSnapshot.cookies)) {
      throw new Error('ลบ TikTok session ที่บันทึกไว้ไม่สำเร็จ');
    }
  });
}

/**
 * Whether this profile is considered logged in, judged from its saved snapshot
 * (has a `sessionid`/`sid_tt` cookie with a value).
 */
export async function isProfileLoggedIn(profileId: string): Promise<boolean> {
  return withCookieJarLock(async () => {
    const snapshot = await readSnapshot(profileId);
    return snapshot ? hasLoginSession(snapshot.cookies) : false;
  });
}

/**
 * Whether the WebView jar holds the same login-cookie criterion used by stored snapshots.
 */
export async function readLiveLoginState(): Promise<boolean> {
  return withCookieJarLock(async () => {
    try {
      return hasLoginSession(await getLiveTikTokCookies());
    } catch {
      // Preserve the existing boolean polling API. Destructive operations use strict reads.
      return false;
    }
  });
}

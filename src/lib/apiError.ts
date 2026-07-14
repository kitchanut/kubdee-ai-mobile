/**
 * Central classifier for errors thrown out of `fetch`/JSON handling.
 *
 * The API layer used to `catch {}` and return a single generic string, so a
 * network drop, a JSON-parse bug, and a TypeError all looked identical and the
 * real cause was lost (code review H-2). `toApiError` classifies the thrown
 * value, reports it to telemetry with context, and returns a structured result.
 *
 * IMPORTANT: `userMessage` defaults to OFFLINE_ERROR_MESSAGE for every kind.
 * That exact string is a load-bearing sentinel — `auth/plan.ts` and
 * `auth/AuthContext.tsx` compare against it to decide "offline, keep cached
 * data". Keeping it identical preserves behavior; the win here is that the real
 * error is now captured in telemetry instead of being swallowed.
 */
import { reportError, reportInfo } from '@/lib/telemetry';

/** Sentinel string checked by auth/plan.ts + auth/AuthContext.tsx. Do not reword. */
export const OFFLINE_ERROR_MESSAGE = 'Online verification required. Please check your internet connection.';

export type ApiErrorKind = 'network' | 'parse' | 'unknown';

export interface ApiError {
  kind: ApiErrorKind;
  /** HTTP status when known; 0 for thrown (pre-response) errors. */
  status: number;
  /** User-facing string. Defaults to OFFLINE_ERROR_MESSAGE for compatibility. */
  userMessage: string;
  /** The original thrown value, for logging. */
  cause: unknown;
}

function classify(error: unknown): ApiErrorKind {
  // React Native fetch throws a TypeError ("Network request failed") on a
  // connectivity failure before any response arrives.
  if (error instanceof TypeError) return 'network';
  if (error instanceof SyntaxError) return 'parse'; // JSON.parse of a bad body
  const message = error instanceof Error ? error.message : String(error);
  // expo/RN Android โยน CodedError (ไม่ใช่ TypeError) ข้อความเป็น exception ฝั่ง Java —
  // ต้อง match ตรงๆ ไม่งั้นเน็ตหลุดธรรมดากลายเป็น kind='unknown' แล้วถูกรายงานเป็น
  // exception ทุกครั้ง (Sentry MOBILE-6: 56 events / 23 users จาก UnknownHostException ฯลฯ)
  if (
    /network request failed|network error|timeout|timed out|abort|fetch failed|UnknownHostException|Unable to resolve host|Failed to connect|ConnectException|SocketException|SocketTimeoutException|ECONNREFUSED|ECONNRESET|ENETUNREACH|software caused connection abort/i.test(
      message
    )
  ) {
    return 'network';
  }
  return 'unknown';
}

/**
 * Classify a thrown error, report it to telemetry, and return a structured result.
 * @param error   the caught value
 * @param context e.g. { op: 'fetchUserProfile' } — merged into the telemetry event
 */
export function toApiError(error: unknown, context?: Record<string, unknown>): ApiError {
  const kind = classify(error);
  if (kind === 'network') {
    // เน็ตหลุด/DNS ล้มเป็นสภาพแวดล้อมปกติของมือถือ ไม่ใช่บั๊ก — เก็บเป็น local
    // diagnostics พอ (เดิมถูกรายงานเป็น exception ทุกครั้ง = Sentry MOBILE-6
    // เสียงดังสุดใน project: 56 events / 23 users)
    reportInfo(`api.${context?.op ?? 'request'} failed (network)`, {
      error: error instanceof Error ? error.message : String(error),
      ...context,
    });
  } else {
    reportError(`api.${context?.op ?? 'request'} failed (${kind})`, {
      error,
      context: { kind, ...context },
    });
  }
  return { kind, status: 0, userMessage: OFFLINE_ERROR_MESSAGE, cause: error };
}

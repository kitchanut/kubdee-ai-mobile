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
import { reportError } from '@/lib/telemetry';

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
  if (/network request failed|network error|timeout|timed out|abort/i.test(message)) return 'network';
  return 'unknown';
}

/**
 * Classify a thrown error, report it to telemetry, and return a structured result.
 * @param error   the caught value
 * @param context e.g. { op: 'fetchUserProfile' } — merged into the telemetry event
 */
export function toApiError(error: unknown, context?: Record<string, unknown>): ApiError {
  const kind = classify(error);
  reportError(`api.${context?.op ?? 'request'} failed (${kind})`, {
    error,
    context: { kind, ...context },
  });
  return { kind, status: 0, userMessage: OFFLINE_ERROR_MESSAGE, cause: error };
}

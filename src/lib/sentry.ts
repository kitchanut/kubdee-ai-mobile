/**
 * Sentry backend for the telemetry seam (code review H-2, part 2).
 *
 * `initTelemetry()` boots Sentry and registers it as the telemetry reporter, so
 * every existing `reportError` / `toApiError` call in the app flows to Sentry
 * with zero call-site changes. Call it once, first thing, from the entry point.
 *
 * The DSN is not a secret — it only permits sending events, not reading them —
 * so embedding it in the client is the intended Sentry setup.
 */
import * as Sentry from '@sentry/react-native';

import { setTelemetryReporter, type TelemetryReporter } from '@/lib/telemetry';

const SENTRY_DSN =
  'https://d0c1149571b869829984cfd3dab6972f@o4511691129552896.ingest.us.sentry.io/4511692084084746';

const __DEV__flag = typeof __DEV__ !== 'undefined' && __DEV__;

function sentryLevel(severity: 'error' | 'warning' | 'info'): Sentry.SeverityLevel {
  return severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'info';
}

const sentryReporter: TelemetryReporter = {
  capture(event) {
    const extra = { message: event.message, ...event.context };
    if (event.severity === 'error' && event.error !== undefined && event.error !== null) {
      Sentry.captureException(event.error, { extra });
    } else {
      Sentry.captureMessage(event.message, { level: sentryLevel(event.severity), extra });
    }
  },
};

export function initTelemetry(): void {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: __DEV__flag ? 'development' : 'production',
    // Errors only — skip performance tracing to stay well within the free tier.
    tracesSampleRate: 0,
    // Native automation runs in a separate `:automation` process that does not
    // boot React; this SDK covers the main JS/RN process.
    enableAutoSessionTracking: true,
  });
  setTelemetryReporter(sentryReporter);
}

/**
 * Send a Shopee scrape-failure diagnostic — the on-screen accessibility tree — to Sentry as an
 * ATTACHMENT (not `extra`, which Sentry truncates), so we can inspect the full tree of a user's
 * device/Shopee version remotely. No-op if the dump is empty or Sentry isn't initialised.
 */
export function captureShopeeDiagnostic(
  message: string,
  dump: string,
  context?: Record<string, unknown>
): void {
  if (!dump) return;
  try {
    Sentry.withScope((scope) => {
      scope.addAttachment({ filename: 'shopee-tree.txt', data: dump });
      Sentry.captureMessage(message, { level: 'warning', extra: context });
    });
  } catch {
    // best-effort — diagnostics must never throw
  }
}

/** Wrap the root component so React render errors are captured. */
export const wrapWithSentry = Sentry.wrap;

/**
 * Provider-agnostic telemetry seam.
 *
 * The app currently swallows most errors into generic user strings, so field
 * failures are invisible (code review H-2). This module is the single place
 * everything reports to. Today the default backend keeps a small in-memory ring
 * buffer + logs in dev; when a Sentry DSN is available, call
 * `setTelemetryReporter(sentryReporter)` at startup and every existing
 * `reportError` call flows to Sentry unchanged — no call-site edits.
 *
 * Reporting must never throw or block app flow: every backend call is guarded.
 */
export type TelemetrySeverity = 'error' | 'warning' | 'info';

export interface TelemetryEvent {
  severity: TelemetrySeverity;
  message: string;
  /** Structured context — e.g. { op: 'fetchUserProfile', status: 0, kind: 'network' } */
  context?: Record<string, unknown>;
  /** The original thrown value, when there is one. */
  error?: unknown;
  timestamp: number;
}

export interface TelemetryReporter {
  capture(event: TelemetryEvent): void;
}

const RING_BUFFER_SIZE = 50;
const recentEvents: TelemetryEvent[] = [];

const __DEV__flag = typeof __DEV__ !== 'undefined' && __DEV__;

/** Default backend: ring buffer for on-device inspection + dev console. */
const defaultReporter: TelemetryReporter = {
  capture(event) {
    recentEvents.push(event);
    if (recentEvents.length > RING_BUFFER_SIZE) recentEvents.shift();
    if (__DEV__flag) {
      const tag = `[telemetry:${event.severity}]`;
      // eslint-disable-next-line no-console
      console[event.severity === 'error' ? 'error' : 'log'](tag, event.message, event.context ?? '', event.error ?? '');
    }
  },
};

let reporter: TelemetryReporter = defaultReporter;

/** Swap the backend (e.g. a Sentry-backed reporter) once a DSN is configured. */
export function setTelemetryReporter(next: TelemetryReporter): void {
  reporter = next;
}

function capture(event: TelemetryEvent): void {
  try {
    reporter.capture(event);
  } catch {
    // Telemetry must never break the caller.
  }
}

export function reportError(message: string, options?: { error?: unknown; context?: Record<string, unknown> }): void {
  capture({ severity: 'error', message, error: options?.error, context: options?.context, timestamp: Date.now() });
}

export function reportWarning(message: string, context?: Record<string, unknown>): void {
  capture({ severity: 'warning', message, context, timestamp: Date.now() });
}

export function reportInfo(message: string, context?: Record<string, unknown>): void {
  capture({ severity: 'info', message, context, timestamp: Date.now() });
}

/** Snapshot of recent events — for a future in-app "diagnostics / export logs" view. */
export function getRecentTelemetry(): readonly TelemetryEvent[] {
  return recentEvents.slice();
}

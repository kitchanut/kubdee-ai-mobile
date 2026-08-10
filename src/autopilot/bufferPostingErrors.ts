const BUFFER_RATE_LIMIT_FALLBACK_MS = 10 * 60 * 1000;

export type BufferAssetUploadErrorReason = 'rate-limit' | 'stale-file' | 'upload';

export class BufferAssetUploadError extends Error {
  readonly reason: BufferAssetUploadErrorReason;
  readonly retryAfterMs: number | null;
  readonly status: number | null;

  constructor(
    message: string,
    reason: BufferAssetUploadErrorReason,
    options: { retryAfterMs?: number | null; status?: number | null; cause?: unknown } = {}
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'BufferAssetUploadError';
    this.reason = reason;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.status = options.status ?? null;
  }
}

export function isBufferAssetUploadRateLimitError(error: unknown): error is BufferAssetUploadError {
  return error instanceof BufferAssetUploadError && error.reason === 'rate-limit';
}

function readPayloadText(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readPositiveNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readHeader(headers: Record<string, string>, name: string): string | null {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function parseRetryAfter(value: unknown, now: number, numericIsMilliseconds: boolean): number | null {
  const numeric = readPositiveNumber(value);
  if (numeric) return numericIsMilliseconds ? numeric : numeric * 1000;

  if (typeof value !== 'string' || !value.trim()) return null;
  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return null;
  return Math.max(1_000, retryAt - now);
}

function getRetryAfterMs(
  data: Record<string, unknown>,
  headers: Record<string, string>,
  now: number
): number | null {
  const explicitMs = parseRetryAfter(data.retryAfterMs ?? data.retry_after_ms, now, true);
  if (explicitMs) return explicitMs;

  const payload = parseRetryAfter(
    data.retryAfter ?? data.retry_after ?? data.retryAfterSeconds ?? data.retry_after_seconds,
    now,
    false
  );
  if (payload) return payload;

  return parseRetryAfter(readHeader(headers, 'Retry-After'), now, false);
}

function formatRetryWait(retryAfterMs: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  if (seconds < 60) return `${seconds} วินาที`;
  return `${Math.ceil(seconds / 60)} นาที`;
}

function translateRateLimitDetail(detail: string | null): string | null {
  if (!detail) return null;
  const match = detail.match(/limit\s+is\s+(\d+)\s+attempts?\s+per\s+(\d+)\s+minutes?/i);
  return match ? `จำกัด ${match[1]} ครั้งต่อ ${match[2]} นาที` : detail;
}

export function createBufferAssetRateLimitError(
  data: Record<string, unknown>,
  headers: Record<string, string>,
  status = 429,
  now = Date.now()
): BufferAssetUploadError {
  const retryAfterMs = getRetryAfterMs(data, headers, now) ?? BUFFER_RATE_LIMIT_FALLBACK_MS;
  const detail = translateRateLimitDetail(readPayloadText(data, 'message'));
  const wait = formatRetryWait(retryAfterMs);
  return new BufferAssetUploadError(
    `อัปโหลดถี่เกินกำหนด กรุณารอประมาณ ${wait} แล้วลองใหม่${detail ? ` (${detail})` : ''}`,
    'rate-limit',
    { retryAfterMs, status }
  );
}

export function isStaleLocalFileError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /FileNotFoundException/i.test(message) ||
    /No item at content:\/\/media/i.test(message) ||
    /\bENOENT\b/i.test(message) ||
    /\bEACCES\b/i.test(message) ||
    /no such file/i.test(message) ||
    /file .*does not exist/i.test(message) ||
    /SecurityException/i.test(message) ||
    /Permission Denial/i.test(message) ||
    /permission denied/i.test(message)
  );
}

export function staleLocalFileError(cause?: unknown): BufferAssetUploadError {
  return new BufferAssetUploadError(
    'เปิดไฟล์วิดีโอไม่ได้ ไฟล์อาจถูกลบ ย้ายที่ หรือสิทธิ์หมดอายุ กรุณาลบคลิปนี้ออกแล้วเพิ่มวิดีโอใหม่',
    'stale-file',
    { cause }
  );
}

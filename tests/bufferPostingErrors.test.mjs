import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBufferAssetRateLimitError,
  isBufferAssetUploadRateLimitError,
  isStaleLocalFileError,
  staleLocalFileError,
} from '../src/autopilot/bufferPostingErrors.ts';

test('maps stale content and file URI errors without hiding unrelated network errors', () => {
  assert.equal(
    isStaleLocalFileError(new Error('java.io.FileNotFoundException: No item at content://media/external/downloads/12')),
    true
  );
  assert.equal(isStaleLocalFileError(new Error('ENOENT: no such file or directory')), true);
  assert.equal(isStaleLocalFileError(new Error('SecurityException: Permission Denial')), true);
  assert.equal(isStaleLocalFileError(new Error('Network request failed')), false);

  const mapped = staleLocalFileError();
  assert.match(mapped.message, /ไฟล์อาจถูกลบ ย้ายที่ หรือสิทธิ์หมดอายุ/);
  assert.equal(mapped.reason, 'stale-file');
});

test('reads retryAfter and API message from a 429 payload', () => {
  const error = createBufferAssetRateLimitError(
    { retryAfter: 30, message: 'Limit is 20 attempts per 10 minutes.' },
    {},
    429,
    Date.UTC(2026, 7, 10)
  );

  assert.equal(error.retryAfterMs, 30_000);
  assert.equal(error.status, 429);
  assert.match(error.message, /30 วินาที/);
  assert.match(error.message, /จำกัด 20 ครั้งต่อ 10 นาที/);
  assert.equal(isBufferAssetUploadRateLimitError(error), true);
});

test('supports case-insensitive Retry-After headers and a safe ten-minute fallback', () => {
  const now = Date.UTC(2026, 7, 10, 0, 0, 0);
  const fromHeader = createBufferAssetRateLimitError(
    {},
    { 'retry-after': new Date(now + 90_000).toUTCString() },
    429,
    now
  );
  assert.equal(fromHeader.retryAfterMs, 90_000);
  assert.match(fromHeader.message, /2 นาที/);

  const fallback = createBufferAssetRateLimitError({}, {}, 429, now);
  assert.equal(fallback.retryAfterMs, 10 * 60 * 1000);
  assert.match(fallback.message, /10 นาที/);
});

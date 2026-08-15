import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLegacyGeneratedMediaCache,
  buildLiveGeneratedMediaAssets,
} from '../src/autopilot/generatedMediaCollection.ts';

function mediaAsset(id, kind, createdAt, fileUri = `file:///media/${id}`, profileLocalId = 'profile-a') {
  return { id, kind, createdAt, fileUri, profileLocalId };
}

test('keeps every SQLite asset visible when images and videos exceed the legacy 300-item cache', () => {
  const oldestVideos = Array.from({ length: 31 }, (_, index) => mediaAsset(`old-video-${index}`, 'videos', index + 1));
  const remainingVideos = Array.from({ length: 173 }, (_, index) =>
    mediaAsset(`video-${index}`, 'videos', index + 100),
  );
  const existingImages = Array.from({ length: 96 }, (_, index) => mediaAsset(`image-${index}`, 'images', index + 300));
  const newImages = Array.from({ length: 20 }, (_, index) => mediaAsset(`new-image-${index}`, 'images', index + 1_000));
  const newVideos = Array.from({ length: 11 }, (_, index) => mediaAsset(`new-video-${index}`, 'videos', index + 1_100));

  const liveAssets = buildLiveGeneratedMediaAssets([
    ...oldestVideos,
    ...remainingVideos,
    ...existingImages,
    ...newImages,
    ...newVideos,
  ]);

  assert.equal(liveAssets.length, 331);
  assert.equal(liveAssets.filter((asset) => asset.kind === 'videos').length, 215);

  const legacyCache = buildLegacyGeneratedMediaCache(liveAssets);
  assert.equal(legacyCache.length, 300);
  assert.equal(legacyCache.filter((asset) => asset.kind === 'videos').length, 184);
});

test('keeps the newest SQLite row when duplicate rows reference the same file', () => {
  const liveAssets = buildLiveGeneratedMediaAssets([
    mediaAsset('older-row', 'videos', 100, 'file:///media/shared.mp4'),
    mediaAsset('newer-row', 'videos', 200, 'file:///media/shared.mp4'),
  ]);

  assert.deepEqual(
    liveAssets.map((asset) => asset.id),
    ['newer-row'],
  );
});

test('does not let newer media from another profile evict videos from the selected profile', () => {
  const selectedProfileVideos = Array.from({ length: 204 }, (_, index) =>
    mediaAsset(`profile-a-video-${index}`, 'videos', index + 1),
  );
  const otherProfileImages = Array.from({ length: 400 }, (_, index) =>
    mediaAsset(`profile-b-image-${index}`, 'images', index + 1_000, undefined, 'profile-b'),
  );

  const liveAssets = buildLiveGeneratedMediaAssets([...selectedProfileVideos, ...otherProfileImages]);
  const visibleVideos = liveAssets.filter(
    (asset) => asset.kind === 'videos' && asset.profileLocalId === 'profile-a',
  );

  assert.equal(liveAssets.length, 604);
  assert.equal(visibleVideos.length, 204);
});

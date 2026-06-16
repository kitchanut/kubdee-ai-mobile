/**
 * videoResults — inspect the first N tiles of the Flow result list and report
 * which are ready / failed, returning the ready video URLs.
 *
 * Derived from the desktop `checkFirstNTiles` (used by waitForGeneration +
 * extractVideos) but the readiness heuristic is adapted for the mobile WebView:
 * the desktop poster/readyState/blur-amount signals do not fire there, so a tile
 * is considered done when it has a resolved <video> URL and is neither still
 * generating (Queued / a percentage) nor failed. One call covers BOTH "is it
 * done yet?" (poll it from RN) and "give me the result URLs" — so we don't need
 * the 895-line waitForGeneration; the poll loop lives on the React Native side.
 *
 * Reads `args`: { count?: number } (how many leading tiles to inspect).
 * Returns `{ videos: string[], images: number, failedCount, successCount, tilesFound }`.
 *
 * NOTE: regex backslashes are doubled (\\b, \\s, \\d) so the outer template
 * literal yields the correct regex source when injected.
 */
export const VIDEO_RESULTS_BODY = `
  var n = args.count || 1;
  var itemList = document.querySelector('[data-testid="virtuoso-item-list"]');
  if (!itemList) return { videos: [], images: 0, failedCount: 0, successCount: 0, tilesFound: 0 };

  function normalizeMediaUrl(value){
    var src = (value || '').trim();
    if (!src || src.indexOf('data:') === 0) return '';
    if (src.indexOf('http') === 0 || src.indexOf('blob:') === 0) return src;
    if (src.indexOf('/fx/') === 0) { try { return new URL(src, window.location.origin).href; } catch (e) { return ''; } }
    return '';
  }
  function getVideoUrl(video){
    var direct = [video.currentSrc, video.src, video.getAttribute('src')];
    for (var i = 0; i < direct.length; i++) { var u = normalizeMediaUrl(direct[i]); if (u) return u; }
    var source = video.querySelector('source');
    return source ? normalizeMediaUrl(source.src || source.getAttribute('src')) : '';
  }

  var tiles = [];
  for (var idx = 0; tiles.length < n; idx++) {
    var row = itemList.querySelector('[data-index="' + idx + '"]');
    if (!row) break;
    var allTileEls = Array.prototype.slice.call(row.querySelectorAll('[data-tile-id]'));
    var rowTiles = allTileEls.filter(function(el){ return !(el.parentElement && el.parentElement.closest('[data-tile-id]')); });
    if (rowTiles.length === 0) break;
    for (var t = 0; t < rowTiles.length; t++) tiles.push(rowTiles[t]);
  }

  var result = { videos: [], images: 0, failedCount: 0, successCount: 0, generatingCount: 0, tilesFound: tiles.length };
  var limit = tiles.slice(0, n);
  for (var z = 0; z < limit.length; z++) {
    var tile = limit[z];
    var tileText = tile.textContent || '';
    var video = tile.querySelector('video');
    // Failed text is glued into the tile's textContent (e.g. "warningFailedOops..."),
    // so a word-boundary regex misses it — use a plain lowercase substring match.
    var isFailed = tileText.toLowerCase().indexOf('failed') !== -1 || tileText.indexOf('สร้างไม่สำเร็จ') !== -1;
    if (isFailed) { result.failedCount++; continue; }
    // Still working: the tile is Queued, shows a percentage, or the Thai label.
    // (Queued tiles have no video URL yet — they must NOT be treated as failed.)
    var generating = /\\bQueued\\b/i.test(tileText) || tileText.indexOf('กำลังสร้าง') !== -1 || /\\d{1,3}\\s?%/.test(tileText);
    if (generating) { result.generatingCount++; continue; }
    var url = video ? getVideoUrl(video) : '';
    // A tile with a resolved video URL that is neither generating nor failed is done.
    if (url) {
      if (result.videos.indexOf(url) === -1) result.videos.push(url);
      result.successCount++;
      continue;
    }
    var img = tile.querySelector('img[alt="Generated image"], img[alt="รูปภาพที่สร้างขึ้น"]');
    if (img) { result.images++; result.successCount++; continue; }
    // Anything else (tile still rendering, no clear state) — treat as still working
    // so the poller waits instead of declaring failure prematurely.
    result.generatingCount++;
  }
  return result;
`;

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

  var result = { videos: [], images: 0, failedCount: 0, successCount: 0, generatingCount: 0, tilesFound: tiles.length, progress: null };
  var progressVals = [];
  var limit = tiles.slice(0, n);
  for (var z = 0; z < limit.length; z++) {
    var tile = limit[z];
    var tileText = tile.textContent || '';
    var video = tile.querySelector('video');
    // Generating signals (Queued / a percentage / the Thai label) are checked
    // FIRST: a still-generating tile keeps a hidden "Failed" overlay in its DOM,
    // so checking failed first would wrongly count an in-progress tile as failed.
    var pm = tileText.match(/(\\d{1,3})\\s?%/);
    var generating = /\\bQueued\\b/i.test(tileText) || tileText.indexOf('กำลังสร้าง') !== -1 || !!pm;
    if (generating) {
      if (pm) progressVals.push(parseInt(pm[1], 10));
      result.generatingCount++;
      continue;
    }
    // Failed text is glued into the tile's textContent (e.g. "warningFailedOops..."),
    // so a word-boundary regex misses it — use a plain lowercase substring match.
    var isFailed = tileText.toLowerCase().indexOf('failed') !== -1 || tileText.indexOf('สร้างไม่สำเร็จ') !== -1;
    if (isFailed) { result.failedCount++; continue; }
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
  // Progress %: page-wide scan for an element whose text is exactly "NN%"
  // (desktop Strategy 1) — more robust than tile-text matching because the
  // percentage badge may sit just outside the inspected tiles.
  var pdivs = document.querySelectorAll('div, span');
  for (var d = 0; d < pdivs.length; d++) {
    var dt = (pdivs[d].textContent || '').trim();
    if (/^\\d{1,3}\\s?%$/.test(dt)) {
      var r2 = pdivs[d].getBoundingClientRect();
      if (r2.width > 0 && r2.height > 0) progressVals.push(parseInt(dt, 10));
    }
  }
  // Lowest percentage (the slowest output) — matches desktop minProgress.
  if (progressVals.length > 0) {
    var minP = progressVals[0];
    for (var pIdx = 1; pIdx < progressVals.length; pIdx++) { if (progressVals[pIdx] < minP) minP = progressVals[pIdx]; }
    result.progress = minP;
  }
  return result;
`;

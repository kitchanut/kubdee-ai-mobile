/**
 * videoResults — inspect the first N tiles of the Flow result list and report
 * which are ready / failed, returning the ready video URLs.
 *
 * Derived from the desktop `checkFirstNTiles` + `countFailedGenerations`. The
 * readiness heuristic is adapted for the mobile WebView (desktop poster/
 * readyState/blur signals do not fire there): a tile is done when it has a
 * resolved <video> URL and is neither still generating (Queued / a percentage)
 * nor failed.
 *
 * IMPORTANT — the hidden "Failed" overlay:
 * A still-generating tile keeps a "Failed" overlay in its DOM but hidden inside
 * an `opacity:0` wrapper. Reading the whole tile's textContent for "failed" (as
 * an earlier version did) therefore counts an in-progress/Queued tile as failed.
 * So failure is detected ONLY from a Failed element that is actually visible
 * (non-zero box AND no opacity:0 ancestor up to the tile), mirroring the desktop
 * `countFailedGenerations` opacity filter. Queued is matched broadly
 * (Queue/Queued/in queue/คิว) so a queued tile is treated as "still working".
 *
 * Reads `args`: { count?: number, ignoreUrls?: string[] } — how many leading
 * tiles to inspect, and a snapshot of pre-existing video URLs to ignore (so an
 * old video that predates this generation is not counted as a new output).
 * Returns `{ videos, images, failedCount, successCount, generatingCount, queuedCount, tilesFound, progress }`.
 *
 * NOTE: regex backslashes are doubled (\\b, \\s, \\d) so the outer template
 * literal yields the correct regex source when injected.
 */
export const VIDEO_RESULTS_BODY = `
  var n = args.count || 1;
  var ignore = args.ignoreUrls || [];
  var itemList = document.querySelector('[data-testid="virtuoso-item-list"]');
  if (!itemList) return { videos: [], images: 0, failedCount: 0, successCount: 0, generatingCount: 0, queuedCount: 0, tilesFound: 0, progress: null };

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
  function isVisible(el){
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  // Walk ancestors up to the tile; any opacity:0 inline style means this node is
  // part of a hidden overlay (the generating tile's hidden "Failed" state).
  function isHiddenByOpacity(el, scopeEl){
    var node = el;
    while (node && node !== scopeEl) {
      var style = node.getAttribute('style') || '';
      if (/(?:^|;)\\s*opacity\\s*:\\s*0\\s*(?:;|$)/.test(style)) return true;
      node = node.parentElement;
    }
    return false;
  }
  // Queued status: a short, visible label (Queue / Queued / in queue / คิว).
  function tileQueued(tile){
    var els = tile.querySelectorAll('div, span');
    for (var i = 0; i < els.length; i++) {
      var t = (els[i].textContent || '').trim();
      if (!t || t.length > 30) continue;
      var low = t.toLowerCase();
      var hit = low === 'queued' || low === 'queue' || low === 'in queue' || low === 'queueing' || low === 'queuing' || t.indexOf('คิว') !== -1;
      if (hit && isVisible(els[i])) return true;
    }
    return false;
  }
  // A REAL failure: a short element whose text is exactly Failed / สร้างไม่สำเร็จ,
  // that is actually visible (non-zero box, not inside an opacity:0 overlay) and
  // is the innermost node carrying that text.
  function tileFailed(tile){
    var patterns = ['failed', 'failed generation', 'สร้างไม่สำเร็จ'];
    var els = tile.querySelectorAll('div, span, button, p');
    for (var i = 0; i < els.length; i++) {
      var t = (els[i].textContent || '').trim();
      if (!t || t.length > 50) continue;
      if (patterns.indexOf(t.toLowerCase()) === -1) continue;
      if (!isVisible(els[i]) || isHiddenByOpacity(els[i], tile)) continue;
      var inner = els[i].querySelectorAll('*');
      var hasChildSame = false;
      for (var c = 0; c < inner.length; c++) { if ((inner[c].textContent || '').trim() === t) { hasChildSame = true; break; } }
      if (!hasChildSame) return true;
    }
    return false;
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

  var result = { videos: [], images: 0, failedCount: 0, successCount: 0, generatingCount: 0, queuedCount: 0, tilesFound: tiles.length, progress: null };
  var progressVals = [];
  var limit = tiles.slice(0, n);
  for (var z = 0; z < limit.length; z++) {
    var tile = limit[z];
    var tileText = tile.textContent || '';
    var video = tile.querySelector('video');
    // Generating/queued signals checked FIRST so a still-rendering tile is never
    // misread as failed via its hidden overlay. Queued (no % yet) is reported
    // separately from actively-rendering (% / กำลังสร้าง).
    if (tileQueued(tile)) { result.queuedCount++; continue; }
    var pm = tileText.match(/(\\d{1,3})\\s?%/);
    var generating = tileText.indexOf('กำลังสร้าง') !== -1 || !!pm;
    if (generating) {
      if (pm) progressVals.push(parseInt(pm[1], 10));
      result.generatingCount++;
      continue;
    }
    // Only a VISIBLE Failed element counts (hidden opacity:0 overlay is ignored).
    if (tileFailed(tile)) { result.failedCount++; continue; }
    var url = video ? getVideoUrl(video) : '';
    // A tile with a resolved video URL that is neither generating nor failed is done.
    if (url) {
      // Skip videos that already existed before this generation (snapshot).
      if (ignore.indexOf(url) !== -1) continue;
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

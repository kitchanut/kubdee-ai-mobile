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
 * Reads `args`: { count?: number, ignoreUrls?: string[], ignoreImageUrls?: string[], ignoreFailedCount?: number } —
 * how many leading tiles to inspect, and snapshots of pre-existing media URLs
 * / failed cards to ignore (so old results that predate this generation are
 * not counted as new).
 * Returns `{ videos, images, failedCount, failedMessages, successCount, generatingCount, queuedCount, tilesFound, progress }`.
 *
 * NOTE: regex backslashes are doubled (\\b, \\s, \\d) so the outer template
 * literal yields the correct regex source when injected.
 */
export const VIDEO_RESULTS_BODY = `
  var n = args.count || 1;
  var ignore = args.ignoreUrls || [];
  var ignoreImages = args.ignoreImageUrls || args.ignoreImages || [];
  var ignoreFailedCount = Math.max(0, Number(args.ignoreFailedCount || args.baselineFailedCount || 0) || 0);
  var itemList = document.querySelector('[data-testid="virtuoso-item-list"]');

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
  function getImageUrl(img){
    return normalizeMediaUrl(img.currentSrc || img.src || img.getAttribute('src') || '');
  }
  function isVisible(el){
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function composerTop(){
    var candidates = Array.prototype.slice.call(document.querySelectorAll('[contenteditable="true"], textarea, [role="textbox"]'));
    var best = null;
    for (var i = 0; i < candidates.length; i++) {
      if (!isVisible(candidates[i])) continue;
      var r = candidates[i].getBoundingClientRect();
      if (r.top > window.innerHeight * 0.45 && (!best || r.top > best)) best = r.top;
    }
    return best;
  }
  function looksReadyImage(img){
    if (!img || !isVisible(img)) return false;
    var src = normalizeMediaUrl(img.currentSrc || img.src || img.getAttribute('src'));
    if (!src) return false;
    var r = img.getBoundingClientRect();
    var alt = (img.getAttribute('alt') || '').toLowerCase();
    if (alt === 'generated image' || alt === 'รูปภาพที่สร้างขึ้น' || alt.indexOf('flow image:') === 0) return true;
    if (r.width < 120 || r.height < 120) return false;
    if (/avatar|profile|logo|icon/i.test(src) || /avatar|profile|user profile|logo|icon/i.test(alt)) return false;
    if (img.closest('button, [role="button"][aria-label], [data-testid*="prompt"], [data-testid*="composer"]')) return false;
    var top = composerTop();
    if (top != null && r.top > top - 180) return false;
    return !!img.closest('[data-tile-id], [data-index], [data-testid="virtuoso-item-list"], main');
  }
  function collectReadyImages(scope){
    var root = scope || document;
    var seen = {};
    var images = [];
    var selectors = [
      'img[alt="Generated image"]',
      'img[alt="รูปภาพที่สร้างขึ้น"]',
      'img[alt^="Flow Image:"]',
      '[data-tile-id] img',
      '[data-index] img',
      '[data-testid="virtuoso-item-list"] img',
      'main img',
      'img'
    ];
    for (var s = 0; s < selectors.length; s++) {
      var list = Array.prototype.slice.call(root.querySelectorAll(selectors[s]));
      for (var i = 0; i < list.length; i++) {
        if (!looksReadyImage(list[i])) continue;
        var src = getImageUrl(list[i]);
        if (!src || ignoreImages.indexOf(src) !== -1 || seen[src]) continue;
        seen[src] = true;
        images.push(src);
      }
      if (images.length >= n) break;
    }
    return images.slice(0, n);
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
  function collectVisibleFailures(scope){
    var root = scope || document.body;
    var failures = [];
    var els = Array.prototype.slice.call(root.querySelectorAll('div, span, button, p'));
    for (var i = 0; i < els.length; i++) {
      var t = (els[i].textContent || '').replace(/\\s+/g, ' ').trim();
      if (!t || t.length > 220) continue;
      if (!/\\bFailed\\b|generation failed|สร้างไม่สำเร็จ/i.test(t)) continue;
      if (!isVisible(els[i]) || isHiddenByOpacity(els[i], root)) continue;
      var inner = els[i].querySelectorAll('*');
      var hasChildSame = false;
      for (var c = 0; c < inner.length; c++) {
        if ((inner[c].textContent || '').replace(/\\s+/g, ' ').trim() === t) { hasChildSame = true; break; }
      }
      if (!hasChildSame) failures.push({ el: els[i], text: t });
    }
    return failures;
  }
  function countVisibleFailures(scope){
    return collectVisibleFailures(scope).length;
  }
  function collectFailedMessages(scope, skipCount, maxCount){
    var messages = [];
    var seen = {};
    function addMessage(rawText){
      var text = (rawText || '').replace(/\\s+/g, ' ').trim();
      if (!text || text.length < 6) return;
      if (!/\\bFailed\\b|generation failed|สร้างไม่สำเร็จ/i.test(text)) return;
      var message = '';
      if (/Audio generation failed/i.test(text)) {
        message = 'Audio generation failed';
      } else {
        message = text
          .replace(/^warning/i, '')
          .replace(/^Failed/i, 'Failed:')
          .replace(/refreshRetry.*$/i, '')
          .replace(/undoReuse Prompt.*$/i, '')
          .replace(/delete_foreverDelete.*$/i, '')
          .trim();
      }
      if (!message || message.length > 220 || seen[message]) return;
      seen[message] = true;
      messages.push(message);
    }
    var root = scope || document.body;
    var failures = collectVisibleFailures(root).slice(Math.max(0, skipCount || 0));
    var limitCount = Math.max(1, maxCount || 3);
    for (var i = 0; i < failures.length; i++) {
      addMessage(failures[i].text);
      if (messages.length >= limitCount) break;
    }
    return messages.slice(0, limitCount);
  }
  function estimateBlurProgress(scope){
    var blurEls = Array.prototype.slice.call(scope.querySelectorAll('[style*="blur-amount"]'));
    var values = [];
    for (var i = 0; i < blurEls.length; i++) {
      if (!isVisible(blurEls[i])) continue;
      var style = blurEls[i].getAttribute('style') || '';
      var match = style.match(/--blur-amount:\\s*([\\d.]+)px/);
      if (!match) continue;
      var blurAmount = parseFloat(match[1]);
      if (!isFinite(blurAmount) || blurAmount <= 0.5) continue;
      var maxBlur = 30;
      values.push(Math.round(Math.max(0, Math.min(99, (1 - blurAmount / maxBlur) * 100))));
    }
    if (values.length === 0) return null;
    var min = values[0];
    for (var v = 1; v < values.length; v++) { if (values[v] < min) min = values[v]; }
    return min;
  }

  var tiles = [];
  if (itemList) {
    for (var idx = 0; tiles.length < n; idx++) {
      var row = itemList.querySelector('[data-index="' + idx + '"]');
      if (!row) break;
      var allTileEls = Array.prototype.slice.call(row.querySelectorAll('[data-tile-id]'));
      var rowTiles = allTileEls.filter(function(el){ return !(el.parentElement && el.parentElement.closest('[data-tile-id]')); });
      if (rowTiles.length === 0 && row.querySelector('img, video')) rowTiles = [row];
      if (rowTiles.length === 0) break;
      for (var t = 0; t < rowTiles.length; t++) tiles.push(rowTiles[t]);
    }
  }

  var result = { videos: [], images: 0, failedCount: 0, failedMessages: [], successCount: 0, generatingCount: 0, queuedCount: 0, tilesFound: tiles.length, progress: null };
  var explicitProgressVals = [];
  var blurProgressVals = [];
  function pushProgress(list, value){
    var parsed = parseInt(value, 10);
    if (!isFinite(parsed)) return;
    list.push(Math.max(0, Math.min(100, parsed)));
  }
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
    var blurProgress = estimateBlurProgress(tile);
    var generating = tileText.indexOf('กำลังสร้าง') !== -1 || !!pm;
    if (generating || blurProgress != null) {
      if (pm) pushProgress(explicitProgressVals, pm[1]);
      if (blurProgress != null) pushProgress(blurProgressVals, blurProgress);
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
    var img = tile.querySelector('img[alt="Generated image"], img[alt="รูปภาพที่สร้างขึ้น"], img[alt^="Flow Image:"]');
    if (!img) {
      var tileImages = collectReadyImages(tile);
      if (tileImages.length > 0) img = tile.querySelector('img');
    }
    if (img) {
      var imageUrl = getImageUrl(img);
      if (imageUrl && ignoreImages.indexOf(imageUrl) === -1) {
        result.images++;
        result.successCount++;
        continue;
      }
    }
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
      if (r2.width > 0 && r2.height > 0) pushProgress(explicitProgressVals, dt);
    }
  }
  var pageBlurProgress = estimateBlurProgress(document);
  if (pageBlurProgress != null) pushProgress(blurProgressVals, pageBlurProgress);
  // Mobile WebView/Flow sometimes exposes the progress only through the
  // accessible label of the card, e.g. "play_circle 27% ... Reuse prompt".
  // Read attributes as a fallback so the submit-start guard does not resubmit.
  var attrEls = document.querySelectorAll('[aria-label], [title]');
  for (var a = 0; a < attrEls.length; a++) {
    if (!isVisible(attrEls[a])) continue;
    var attrText = [
      attrEls[a].getAttribute('aria-label') || '',
      attrEls[a].getAttribute('title') || '',
      attrEls[a].textContent || '',
    ].join(' ');
    var am = attrText.match(/(?:^|\\D)(\\d{1,3})\\s?%(?:\\D|$)/);
    if (am) pushProgress(explicitProgressVals, am[1]);
  }
  // Prefer real visible/accessible percentages over blur estimates. Some Flow
  // cards expose "75%" while a separate blur layer still estimates to 0%; mixing
  // both makes the status bar show Flow 0% even though the card is progressing.
  var progressVals = explicitProgressVals.length > 0 ? explicitProgressVals : blurProgressVals;
  if (progressVals.length > 0) {
    var minP = progressVals[0];
    for (var pIdx = 1; pIdx < progressVals.length; pIdx++) { if (progressVals[pIdx] < minP) minP = progressVals[pIdx]; }
    result.progress = minP;
  }
  if (result.images === 0 && result.videos.length === 0 && result.failedCount === 0 && result.generatingCount === 0 && result.queuedCount === 0 && result.progress == null) {
    var fallbackImages = collectReadyImages(document);
    if (fallbackImages.length > 0) {
      result.images = fallbackImages.length;
      result.successCount = Math.max(result.successCount, fallbackImages.length);
    }
  }
  var visibleFailedTotal = countVisibleFailures(itemList || document.body);
  if (ignoreFailedCount > 0 || visibleFailedTotal > result.failedCount) {
    result.failedCount = Math.max(0, Math.min(n, visibleFailedTotal - ignoreFailedCount));
  }
  if (result.failedCount > 0) {
    result.failedMessages = collectFailedMessages(itemList || document.body, ignoreFailedCount, Math.min(3, result.failedCount));
  }
  return result;
`;

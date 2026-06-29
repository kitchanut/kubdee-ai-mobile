/**
 * videoSnapshot — record the page state BEFORE a generation starts, so the
 * results poll can filter out media that already existed (desktop snapshots
 * existing media URLs before submit and passes them to result extraction).
 *
 * Returns `{ videoUrls: string[], imageUrls: string[], tileCount: number }`:
 *   - videoUrls: every resolvable <video> URL currently on the page (the "old"
 *     set — any of these that reappears later is NOT a new output).
 *   - imageUrls: every generated-image URL currently on the page (same old set
 *     for image generation; avoids counting previous result cards as new work).
 *   - tileCount: how many top-level result tiles exist now (baseline).
 *
 * NOTE: kept self-contained (its own normalizeMediaUrl/getVideoUrl) so the body
 * is a standalone injectable string, mirroring the other flow-core actions.
 */
export const VIDEO_SNAPSHOT_BODY = `
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
    if (!el || !el.isConnected) return false;
    var r = el.getBoundingClientRect();
    var st = window.getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
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
  function looksGeneratedImage(img){
    if (!img || !isVisible(img)) return false;
    var src = normalizeMediaUrl(img.currentSrc || img.src || img.getAttribute('src') || '');
    if (!src) return false;
    if (/avatar|profile|logo|icon|googleusercontent/i.test(src)) return false;
    var r = img.getBoundingClientRect();
    var alt = (img.getAttribute('alt') || '').toLowerCase();
    if (alt === 'generated image' || alt === 'รูปภาพที่สร้างขึ้น' || alt.indexOf('flow image:') === 0) return true;
    if (r.width < 120 || r.height < 120) return false;
    if (img.closest('button, [role="button"][aria-label], [data-testid*="prompt"], [data-testid*="composer"]')) return false;
    var top = composerTop();
    if (top != null && r.top > top - 180) return false;
    return !!img.closest('[data-tile-id], [data-index], [data-testid="virtuoso-item-list"], main');
  }

  var urls = [];
  var videos = document.querySelectorAll('video');
  for (var i = 0; i < videos.length; i++) {
    var u = getVideoUrl(videos[i]);
    if (u && urls.indexOf(u) === -1) urls.push(u);
  }

  var imageUrls = [];
  var imageSelectors = [
    'img[alt="Generated image"]',
    'img[alt="รูปภาพที่สร้างขึ้น"]',
    'img[alt^="Flow Image:"]',
    '[data-testid="virtuoso-item-list"] img',
    '[data-tile-id] img',
    'main img'
  ];
  for (var s = 0; s < imageSelectors.length; s++) {
    var images = Array.prototype.slice.call(document.querySelectorAll(imageSelectors[s]));
    for (var imgIndex = 0; imgIndex < images.length; imgIndex++) {
      if (!looksGeneratedImage(images[imgIndex])) continue;
      var imageUrl = normalizeMediaUrl(images[imgIndex].currentSrc || images[imgIndex].src || images[imgIndex].getAttribute('src') || '');
      if (imageUrl && imageUrls.indexOf(imageUrl) === -1) imageUrls.push(imageUrl);
    }
  }

  var tileCount = 0;
  var itemList = document.querySelector('[data-testid="virtuoso-item-list"]');
  if (itemList) {
    var all = Array.prototype.slice.call(itemList.querySelectorAll('[data-tile-id]'));
    tileCount = all.filter(function(el){ return !(el.parentElement && el.parentElement.closest('[data-tile-id]')); }).length;
  }

  return { videoUrls: urls, imageUrls: imageUrls, tileCount: tileCount };
`;

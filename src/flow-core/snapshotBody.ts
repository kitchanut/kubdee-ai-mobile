/**
 * videoSnapshot — record the page state BEFORE a generation starts, so the
 * results poll can filter out videos that already existed (desktop snapshots
 * `existingVideoUrls` before submit and passes them to `extractVideos`).
 *
 * Returns `{ videoUrls: string[], tileCount: number }`:
 *   - videoUrls: every resolvable <video> URL currently on the page (the "old"
 *     set — any of these that reappears later is NOT a new output).
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

  var urls = [];
  var videos = document.querySelectorAll('video');
  for (var i = 0; i < videos.length; i++) {
    var u = getVideoUrl(videos[i]);
    if (u && urls.indexOf(u) === -1) urls.push(u);
  }

  var tileCount = 0;
  var itemList = document.querySelector('[data-testid="virtuoso-item-list"]');
  if (itemList) {
    var all = Array.prototype.slice.call(itemList.querySelectorAll('[data-tile-id]'));
    tileCount = all.filter(function(el){ return !(el.parentElement && el.parentElement.closest('[data-tile-id]')); }).length;
  }

  return { videoUrls: urls, tileCount: tileCount };
`;

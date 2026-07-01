export const DOWNLOAD_IMAGES_BODY = `
  var n = Math.max(1, Number(args.count || 1) || 1);
  var ignore = args.ignoreImageUrls || args.ignoreUrls || [];
  function normalizeMediaUrl(value){
    var src = (value || '').trim();
    if (!src) return '';
    if (src.indexOf('http') === 0 || src.indexOf('blob:') === 0 || src.indexOf('data:image/') === 0) return src;
    if (src.indexOf('/fx/') === 0) { try { return new URL(src, window.location.origin).href; } catch (e) { return ''; } }
    return '';
  }
  function isVisible(el){
    if (!el || !el.isConnected) return false;
    var r = el.getBoundingClientRect();
    var st = window.getComputedStyle(el);
    return r.width > 40 && r.height > 40 && st.display !== 'none' && st.visibility !== 'hidden';
  }
  function looksGeneratedImage(img){
    if (!img || !isVisible(img)) return false;
    var src = normalizeMediaUrl(img.currentSrc || img.src || img.getAttribute('src') || '');
    if (!src) return false;
    var alt = (img.getAttribute('alt') || '').toLowerCase();
    if (alt === 'generated image' || alt === 'รูปภาพที่สร้างขึ้น' || alt.indexOf('flow image:') === 0) return true;
    var r = img.getBoundingClientRect();
    if (r.width < 160 || r.height < 160) return false;
    if (/avatar|profile|logo|icon/i.test(src) || /avatar|profile|user profile|logo|icon/i.test(alt)) return false;
    return !!img.closest('[data-tile-id], [data-testid="virtuoso-item-list"], main');
  }
  function collectImageUrls(){
    var seen = {};
    var urls = [];
    var selectors = [
      'img[alt="Generated image"]',
      'img[alt="รูปภาพที่สร้างขึ้น"]',
      'img[alt^="Flow Image:"]',
      '[data-testid="virtuoso-item-list"] img',
      '[data-tile-id] img'
    ];
    for (var s = 0; s < selectors.length; s++) {
      var images = Array.prototype.slice.call(document.querySelectorAll(selectors[s]));
      for (var i = 0; i < images.length; i++) {
        if (!looksGeneratedImage(images[i])) continue;
        var src = normalizeMediaUrl(images[i].currentSrc || images[i].src || images[i].getAttribute('src') || '');
        if (!src || ignore.indexOf(src) !== -1 || seen[src]) continue;
        seen[src] = true;
        urls.push(src);
      }
      if (urls.length >= n) break;
    }
    return urls.slice(0, n);
  }
  function blobToDataUrl(blob){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onloadend = function(){ resolve(String(reader.result || '')); };
      reader.onerror = function(){ reject(new Error('อ่านรูปจาก blob ไม่สำเร็จ')); };
      reader.readAsDataURL(blob);
    });
  }
  function fileNameFor(mimeType, index){
    var ext = 'png';
    var mime = String(mimeType || '').toLowerCase();
    if (mime.indexOf('jpeg') !== -1 || mime.indexOf('jpg') !== -1) ext = 'jpg';
    else if (mime.indexOf('webp') !== -1) ext = 'webp';
    return 'kubdee-flow-image-' + Date.now() + '-' + (index + 1) + '.' + ext;
  }
  async function fetchImageDataUrl(url, index){
    if (url.indexOf('data:image/') === 0) {
      var mime = (url.match(/^data:([^;]+)/) || [])[1] || 'image/png';
      return { url: url, dataUrl: url, fileName: fileNameFor(mime, index), mimeType: mime, sizeBytes: null };
    }
    var response = await fetch(url);
    if (!response.ok) throw new Error('fetch image HTTP ' + response.status);
    var blob = await response.blob();
    if (!blob || !blob.size) throw new Error('image blob ว่าง');
    var mimeType = blob.type || response.headers.get('content-type') || 'image/png';
    var dataUrl = await blobToDataUrl(blob);
    if (!dataUrl || dataUrl.indexOf('data:image/') !== 0) throw new Error('แปลงรูปเป็น data URL ไม่สำเร็จ');
    return {
      url: url,
      dataUrl: dataUrl,
      fileName: fileNameFor(mimeType, index),
      mimeType: mimeType,
      sizeBytes: blob.size
    };
  }

  var urls = collectImageUrls();
  var images = [];
  var errors = [];
  for (var i = 0; i < urls.length; i++) {
    try {
      images.push(await fetchImageDataUrl(urls[i], i));
    } catch (error) {
      errors.push(String((error && error.message) || error));
    }
  }
  return { images: images, found: urls.length, errors: errors };
`;

export const DOWNLOAD_VIDEO_BODY = `
  var targetUrl = String(args.url || '').trim();
  var targetIndex = Number.isFinite(Number(args.index)) ? Number(args.index) : 0;
  if (!targetUrl) throw new Error('video url ว่าง');

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
  function dispatchHover(el){
    try {
      var r = el.getBoundingClientRect();
      var opts = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      el.dispatchEvent(new MouseEvent('mouseover', opts));
      el.dispatchEvent(new MouseEvent('mouseenter', opts));
      el.dispatchEvent(new MouseEvent('mousemove', opts));
    } catch (e) {}
  }
  function nodeText(el){
    return [
      el.textContent || '',
      el.getAttribute('aria-label') || '',
      el.getAttribute('title') || '',
      el.getAttribute('data-testid') || ''
    ].join(' ').toLowerCase();
  }
  function looksDownloadButton(btn){
    var txt = nodeText(btn);
    if (txt.indexOf('download') !== -1 || txt.indexOf('ดาวน์โหลด') !== -1 || txt.indexOf('บันทึก') !== -1) return true;
    var icons = btn.querySelectorAll('i, span');
    for (var i = 0; i < icons.length; i++) {
      var icon = (icons[i].textContent || '').trim().toLowerCase();
      if (icon === 'download' || icon === 'file_download' || icon === 'save_alt') return true;
    }
    return false;
  }
  function clickReactAware(btn){
    btn.scrollIntoView({ behavior: 'instant', block: 'center' });
    var rect = btn.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var fakeEvent = {
      type: 'click', target: btn, currentTarget: btn,
      nativeEvent: { type: 'click', isTrusted: true, button: 0, buttons: 1, clientX: cx, clientY: cy },
      preventDefault: function () {}, stopPropagation: function () {}, stopImmediatePropagation: function () {},
      isDefaultPrevented: function () { return false; }, isPropagationStopped: function () { return false; },
      persist: function () {}, bubbles: true, cancelable: true, button: 0, buttons: 1,
      clientX: cx, clientY: cy, isTrusted: true
    };
    var propsKey = Object.keys(btn).find(function (k) { return k.indexOf('__reactProps$') === 0; });
    if (propsKey && btn[propsKey] && typeof btn[propsKey].onClick === 'function') {
      btn[propsKey].onClick(fakeEvent);
      return 'reactProps.onClick';
    }
    btn.click();
    return 'native.click';
  }
  function findTile(){
    var tiles = Array.prototype.slice.call(document.querySelectorAll('[data-tile-id]'))
      .filter(function(el){ return !(el.parentElement && el.parentElement.closest('[data-tile-id]')); });
    var matched = [];
    for (var i = 0; i < tiles.length; i++) {
      var video = tiles[i].querySelector('video');
      var url = video ? getVideoUrl(video) : '';
      if (url && (url === targetUrl || url.indexOf(targetUrl) !== -1 || targetUrl.indexOf(url) !== -1)) matched.push(tiles[i]);
    }
    return matched[targetIndex] || matched[0] || null;
  }
  function fileNameFor(mimeType){
    var ext = 'mp4';
    var mime = String(mimeType || '').toLowerCase();
    if (mime.indexOf('webm') !== -1) ext = 'webm';
    else if (mime.indexOf('quicktime') !== -1 || mime.indexOf('mov') !== -1) ext = 'mov';
    return 'kubdee-flow-video-' + Date.now() + '.' + ext;
  }
  function blobToDataUrl(blob){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onloadend = function(){ resolve(String(reader.result || '')); };
      reader.onerror = function(){ reject(new Error('อ่านวิดีโอจาก blob ไม่สำเร็จ')); };
      reader.readAsDataURL(blob);
    });
  }
  async function fetchVideoDataUrl(url){
    var response = await fetch(url);
    if (!response.ok) throw new Error('fetch video HTTP ' + response.status);
    var blob = await response.blob();
    if (!blob || !blob.size) throw new Error('video blob ว่าง');
    var mimeType = blob.type || response.headers.get('content-type') || 'video/mp4';
    var dataUrl = await blobToDataUrl(blob);
    if (!dataUrl || dataUrl.indexOf('data:') !== 0) throw new Error('แปลงวิดีโอเป็น data URL ไม่สำเร็จ');
    return {
      triggered: true,
      method: 'page.fetch.dataUrl',
      urlKind: targetUrl.indexOf('blob:') === 0 ? 'blob' : 'remote',
      url: targetUrl,
      dataUrl: dataUrl,
      fileName: fileNameFor(mimeType),
      mimeType: mimeType,
      sizeBytes: blob.size
    };
  }

  var tile = findTile();
  if (tile) {
    tile.scrollIntoView({ behavior: 'instant', block: 'center' });
    dispatchHover(tile);
    await wait(500);
  }

  try {
    return await fetchVideoDataUrl(targetUrl);
  } catch (fetchError) {
    if (tile) {
      var buttons = Array.prototype.slice.call(tile.querySelectorAll('button, [role="button"]'));
      for (var b = 0; b < buttons.length; b++) {
        if (isVisible(buttons[b]) && looksDownloadButton(buttons[b])) {
          return {
            triggered: true,
            method: clickReactAware(buttons[b]),
            urlKind: targetUrl.indexOf('blob:') === 0 ? 'blob' : 'remote',
            url: targetUrl,
            error: String((fetchError && fetchError.message) || fetchError)
          };
        }
      }
    }

    // Fallback: let Android WebView's platform download path try the media URL.
    var a = document.createElement('a');
    a.href = targetUrl;
    a.download = fileNameFor('video/mp4');
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ try { a.remove(); } catch (e) {} }, 3000);
    return {
      triggered: true,
      method: 'anchor.download',
      urlKind: targetUrl.indexOf('blob:') === 0 ? 'blob' : 'remote',
      url: targetUrl,
      error: String((fetchError && fetchError.message) || fetchError)
    };
  }
`;

export type TikTokPostAction = 'publish' | 'draft';

export interface TikTokPostVideoInput {
  fileUri: string | null;
  fileName?: string | null;
  productName?: string | null;
  productId?: string | null;
  caption?: string | null;
  hashtags?: string | null;
  cta?: string | null;
  platform?: string | null;
  galleryVideoId?: string | null;
}

interface TikTokPostScriptOptions {
  video: TikTokPostVideoInput;
  postAction: TikTokPostAction;
  enableProductLink: boolean;
}

/**
 * Runs one fail-closed TikTok Studio post inside the profile-scoped WebView.
 * The Android WebChromeClient must already have a pending content URI prepared;
 * clicking the file input consumes that URI through onShowFileChooser.
 */
export function buildTikTokPostScript({
  video,
  postAction,
  enableProductLink,
}: TikTokPostScriptOptions): string {
  const payload = JSON.stringify({
    productName: video.productName?.trim() || '',
    productId: video.productId?.trim() || '',
    caption: video.caption?.trim() || '',
    hashtags: video.hashtags?.trim() || '',
    cta: video.cta?.trim() || '',
    postAction,
    enableProductLink,
  }).replace(/</g, '\\u003c');

  return `(function(){
  if (window.__kubdeeTikTokPostRunning) return true;
  window.__kubdeeTikTokPostRunning = true;
  var INPUT = ${payload};
  var RESULT_SENT = false;
  var VERIFY_KEY = 'kubdee:tiktok-post:verify:v1';

  function send(value){
    try { window.ReactNativeWebView.postMessage(JSON.stringify(value)); } catch (_) {}
  }
  function log(code, message){
    send({ type: 'tiktok-post-log', code: String(code), message: String(message) });
  }
  function finish(success, code, error, diagnostics){
    if (RESULT_SENT) return;
    RESULT_SENT = true;
    try { sessionStorage.removeItem(VERIFY_KEY); } catch (_) {}
    send({
      type: 'tiktok-post-result',
      success: !!success,
      code: String(code),
      error: error ? String(error) : null,
      diagnostics: diagnostics || null
    });
  }
  function sleep(ms){ return new Promise(function(resolve){ setTimeout(resolve, ms); }); }
  function visible(element){
    if (!element) return false;
    var style = window.getComputedStyle(element);
    var rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
  }
  function normalized(value){ return String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase(); }
  function waitFor(check, timeoutMs, intervalMs){
    return new Promise(function(resolve){
      var startedAt = Date.now();
      var poll = async function(){
        while (Date.now() - startedAt < timeoutMs) {
          try {
            var value = check();
            if (value) { resolve(value); return; }
          } catch (_) {}
          await sleep(intervalMs || 500);
        }
        resolve(null);
      };
      poll();
    });
  }
  function findButton(labels, root, exactOnly){
    var scope = root || document;
    var buttons = scope.querySelectorAll('button, .TUXButton, [role="button"]');
    for (var i = 0; i < buttons.length; i++) {
      if (!visible(buttons[i])) continue;
      var text = normalized(buttons[i].textContent);
      for (var j = 0; j < labels.length; j++) {
        var label = normalized(labels[j]);
        if (text === label || (!exactOnly && text.indexOf(label) >= 0)) return buttons[i];
      }
    }
    return null;
  }
  // modal สินค้า = modal ที่มองเห็นตัวบนสุด (อันท้ายสุดใน DOM) — ใช้จำกัดขอบเขตการหาปุ่ม
  function findProductModal(){
    var candidates = document.querySelectorAll('.common-modal, .TUXModal, [role="dialog"]');
    var topmost = null;
    for (var i = 0; i < candidates.length; i++) {
      if (visible(candidates[i])) topmost = candidates[i];
    }
    return topmost;
  }
  // หาปุ่ม action เฉพาะใน footer ของ modal สินค้า — ห้ามสแกน .button-group ทั้ง document
  // เพราะหน้า editor ข้างใต้มี footer ของตัวเอง (ปุ่ม "โพสต์"/"บันทึกแบบร่าง") จะโดนกดผิดปุ่ม
  // จับคู่แบบ exact ก่อนค่อย substring กันคำสั้นอย่าง "เพิ่ม" ไปโดน "เพิ่มเพลง" ฯลฯ
  function findModalAction(labels){
    var modal = findProductModal();
    var containers = modal
      ? modal.querySelectorAll('.common-modal-footer, .button-group, footer')
      : document.querySelectorAll('.common-modal-footer');
    var scopes = [];
    for (var i = 0; i < containers.length; i++) {
      if (visible(containers[i])) scopes.push(containers[i]);
    }
    if (!scopes.length && modal) scopes.push(modal);
    for (var pass = 0; pass < 2; pass++) {
      for (var s = 0; s < scopes.length; s++) {
        var button = findButton(labels, scopes[s], pass === 0);
        if (button) return button;
      }
    }
    return null;
  }
  // ปิด dialog ประกาศ/แนะนำของ TikTok Studio ที่โผล่มาบังหน้าอัปโหลด/แก้ไข (เช่น "เข้าใจแล้ว")
  // คลิกเฉพาะปุ่มรับทราบ/ข้าม เท่านั้น — ห้ามแตะ "เริ่มแก้ไข" / "โพสต์" / ปุ่มที่ทำงานจริง
  function dismissBlockingDialogs(){
    var ACK = ['เข้าใจแล้ว', 'รับทราบ', 'got it', 'i understand', 'i got it', 'ข้ามไปก่อน', 'ข้าม', 'skip', 'ภายหลัง', 'later', 'ไม่เป็นไร', 'ปิด'];
    var scopes = document.querySelectorAll('[role="dialog"], .TUXModal, [class*="modal" i], [class*="popup" i], [class*="dialog" i], [class*="guide" i], [class*="onboarding" i]');
    var clicked = false;
    for (var i = 0; i < scopes.length; i++) {
      if (!visible(scopes[i])) continue;
      var buttons = scopes[i].querySelectorAll('button, .TUXButton, [role="button"]');
      for (var j = 0; j < buttons.length; j++) {
        if (!visible(buttons[j])) continue;
        var text = normalized(buttons[j].textContent);
        if (!text) continue;
        // กันแตะปุ่มที่พาไป editor หรือสั่งโพสต์จริง
        if (text.indexOf('เริ่มแก้ไข') >= 0 || text.indexOf('edit') >= 0 || text.indexOf('โพสต์') >= 0 || text.indexOf('post') >= 0) continue;
        for (var k = 0; k < ACK.length; k++) {
          var label = normalized(ACK[k]);
          if (text === label || text.indexOf(label) >= 0) {
            buttons[j].click();
            log('DIALOG_DISMISSED', 'ปิด dialog TikTok: ' + text.slice(0, 40));
            clicked = true;
            break;
          }
        }
        if (clicked) break;
      }
      if (clicked) break;
    }
    return clicked;
  }
  function diagnostics(stage){
    var buttons = [];
    var nodes = document.querySelectorAll('button, .TUXButton, [role="button"]');
    for (var i = 0; i < nodes.length && buttons.length < 30; i++) {
      var text = normalized(nodes[i].textContent);
      if (text) buttons.push(text.slice(0, 48));
    }
    return {
      stage: stage,
      url: location.href,
      title: document.title,
      fileInputs: document.querySelectorAll('input[type="file"]').length,
      buttons: buttons,
      body: normalized(document.body && document.body.innerText).slice(0, 800)
    };
  }
  function setNativeValue(input, value){
    var descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (descriptor && descriptor.set) descriptor.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // แตะ element ด้วย gesture จริงผ่าน Accessibility Service (isTrusted) — คืน false ถ้าอยู่นอกจอ
  async function nativeTapOn(element, label){
    element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
    await sleep(350);
    var rect = element.getBoundingClientRect();
    var visualViewport = window.visualViewport;
    var viewportLeft = visualViewport ? visualViewport.offsetLeft : 0;
    var viewportTop = visualViewport ? visualViewport.offsetTop : 0;
    var viewportWidth = Math.max(1, visualViewport ? visualViewport.width : window.innerWidth);
    var viewportHeight = Math.max(1, visualViewport ? visualViewport.height : window.innerHeight);
    var xRatio = (rect.left + rect.width / 2 - viewportLeft) / viewportWidth;
    var yRatio = (rect.top + rect.height / 2 - viewportTop) / viewportHeight;
    if (xRatio < 0 || xRatio > 1 || yRatio < 0 || yRatio > 1) return false;
    send({ type: 'tiktok-post-native-tap', xRatio: xRatio, yRatio: yRatio, label: String(label || '') });
    return true;
  }
  function expectedText(){
    var caption = normalized(INPUT.caption || INPUT.productName);
    var hashtags = String(INPUT.hashtags || '').trim();
    return normalized(caption + (hashtags ? ' ' + hashtags : ''));
  }

  function saveVerificationMarker(){
    sessionStorage.setItem(VERIFY_KEY, JSON.stringify({
      expected: expectedText(),
      postAction: INPUT.postAction,
      createdAt: Date.now()
    }));
  }

  function readVerificationMarker(){
    try {
      var parsed = JSON.parse(sessionStorage.getItem(VERIFY_KEY) || 'null');
      if (!parsed || !parsed.expected || !parsed.createdAt) return null;
      if (Date.now() - Number(parsed.createdAt) > 120000) {
        sessionStorage.removeItem(VERIFY_KEY);
        return null;
      }
      return parsed;
    } catch (_) { return null; }
  }
  function textMatches(actual, expected){
    var a = normalized(actual);
    var e = normalized(expected);
    if (!a || !e) return false;
    var prefix = e.slice(0, Math.min(30, e.length));
    return a.indexOf(prefix) >= 0 || e.indexOf(a.slice(0, Math.min(30, a.length))) >= 0;
  }

  async function uploadVideo(){
    log('UPLOAD_WAIT_PAGE', 'รอหน้าอัปโหลด TikTok Studio...');
    var input = await waitFor(function(){
      return document.querySelector('input[type="file"][accept*="video"]') || document.querySelector('input[type="file"]');
    }, 30000, 500);
    if (!input) throw { code: 'UPLOAD_INPUT_NOT_FOUND', message: 'ไม่พบช่องอัปโหลดวิดีโอ', stage: 'upload-input' };
    // ปิด dialog ต้อนรับ/ประกาศที่อาจบังปุ่มอัปโหลด ก่อนหาปุ่มที่จะแตะ
    dismissBlockingDialogs();
    await sleep(300);
    dismissBlockingDialogs();
    // The upload card itself is visible but TikTok only opens the native picker from the
    // actual button on some Studio builds. Prefer that button and use the card as fallback.
    var uploadTarget = findButton(['เลือกวิดีโอ', 'Select video']);
    if (!uploadTarget || !visible(uploadTarget)) {
      uploadTarget = input.closest('label, button, [role="button"]');
    }
    if (!uploadTarget || !visible(uploadTarget)) {
      uploadTarget = findButton(['อัปโหลด', 'Upload']);
    }
    if (!uploadTarget || !visible(uploadTarget)) {
      uploadTarget = document.querySelector('[data-e2e="select_video_container"], .upload-card, .upload-stage-container');
    }
    if (!uploadTarget || !visible(uploadTarget)) {
      throw { code: 'UPLOAD_TAP_TARGET_NOT_FOUND', message: 'ไม่พบปุ่มอัปโหลดวิดีโอที่แตะได้', stage: 'upload-tap-target' };
    }
    log('UPLOAD_OPEN_PICKER', 'กำลังแตะปุ่มอัปโหลดวิดีโอ...');
    var uploadTapped = await nativeTapOn(uploadTarget, 'ปุ่มอัปโหลดวิดีโอ');
    if (!uploadTapped) {
      throw { code: 'UPLOAD_TAP_TARGET_OUTSIDE_VIEWPORT', message: 'ปุ่มอัปโหลดอยู่นอกพื้นที่หน้าจอ', stage: 'upload-tap-target' };
    }

    var selected = await waitFor(function(){
      var editor = document.querySelector('.public-DraftEditor-content');
      var status = document.querySelector('[data-e2e="upload_status_container"]');
      return editor || status || (input.files && input.files.length > 0);
    }, 30000, 500);
    if (!selected) throw { code: 'UPLOAD_FILE_NOT_ACCEPTED', message: 'TikTok ไม่ได้รับไฟล์จากเครื่อง', stage: 'upload-picker' };
  }

  async function waitForEditorAndUpload(){
    log('EDITOR_WAIT', 'รอหน้าแก้ไขวิดีโอ...');
    var editor = await waitFor(function(){
      return document.querySelector('.public-DraftEditor-content') ||
        document.querySelector('button[data-e2e="post_video_button"]') ||
        document.querySelector('button[data-e2e="save_draft_button"]');
    }, 120000, 1000);
    if (!editor) throw { code: 'EDITOR_TIMEOUT', message: 'หมดเวลารอหน้าแก้ไขวิดีโอ', stage: 'editor' };

    // ปิด dialog "เข้าใจแล้ว"/ประกาศ ที่มักโผล่หลังเข้าหน้าแก้ไข
    dismissBlockingDialogs();

    log('UPLOAD_PROCESSING', 'รอ TikTok ประมวลผลวิดีโอ...');
    var uploadState = await waitFor(function(){
      var container = document.querySelector('[data-e2e="upload_status_container"]');
      if (!container) return null;
      if (container.querySelector('.info-status.success, [data-icon="CheckCircleFill"]')) return { done: true };
      var text = normalized(container.textContent);
      var hasError = !!container.querySelector('.info-status.error, .status-error, [data-icon="ExclamationCircleFill"]') ||
        text.indexOf('failed') >= 0 || text.indexOf('error') >= 0 || text.indexOf('ล้มเหลว') >= 0 ||
        text.indexOf('ไม่รองรับ') >= 0 || text.indexOf('too large') >= 0;
      if (hasError) return { done: false, error: text.slice(0, 240) || 'TikTok ปฏิเสธไฟล์วิดีโอ' };
      return text.indexOf('uploaded') >= 0 || text.indexOf('อัปโหลดแล้ว') >= 0 ? { done: true } : null;
    }, 300000, 1500);
    if (!uploadState) throw { code: 'UPLOAD_PROCESSING_TIMEOUT', message: 'หมดเวลารอ TikTok ประมวลผลวิดีโอ', stage: 'upload-processing' };
    if (!uploadState.done) throw { code: 'UPLOAD_REJECTED', message: uploadState.error || 'TikTok ปฏิเสธไฟล์วิดีโอ', stage: 'upload-processing' };
  }

  // ตัด zero-width chars ที่ DraftJS อาจแทรก (กัน verify fail ทั้งที่ข้อความถูก)
  function stripInvisible(value){
    return String(value || '').replace(/[\\u200B\\u200C\\u200D\\uFEFF]/g, '');
  }
  function editorFocused(editor){
    var active = document.activeElement;
    return !!active && (active === editor || editor.contains(active));
  }
  function caretToEnd(editor){
    editor.focus();
    var range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
  // เคลียร์ข้อความเฉพาะใน editor ผ่าน Selection API — ห้าม execCommand('selectAll') ระดับ document
  // (desktop เคยพัง: focus หลุดแล้ว selectAll ไฮไลต์ทั้งหน้า ข้อความพิมพ์ไม่เข้าแต่โพสต์ออกไป)
  function clearEditorScoped(editor){
    var range = document.createRange();
    range.selectNodeContents(editor);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('delete', false, null);
  }

  async function fillCaption(){
    var caption = String(INPUT.caption || INPUT.productName || '').replace(/\\s*[\\r\\n]+\\s*/g, ' ').trim();
    if (!caption) throw { code: 'CAPTION_REQUIRED', message: 'ไม่มี Caption หรือชื่อสินค้า จึงไม่โพสต์', stage: 'caption' };

    log('CAPTION_FILL', 'กำลังใส่ Caption...');
    var editor = document.querySelector('.public-DraftEditor-content');
    if (!editor) throw { code: 'CAPTION_EDITOR_NOT_FOUND', message: 'ไม่พบช่อง Caption', stage: 'caption' };

    // desktop parity: focus → clear เฉพาะ editor → พิมพ์ → อ่านทวน — retry สูงสุด 3 รอบ
    var captionOk = false;
    for (var attempt = 1; attempt <= 3 && !captionOk; attempt++) {
      if (attempt > 1) {
        log('CAPTION_RETRY', 'กรอกคำบรรยายไม่เข้า ลองใหม่รอบ ' + attempt + '/3...');
        await sleep(800);
      }
      editor.click();
      editor.focus();
      await sleep(250);
      if (!editorFocused(editor)) { caretToEnd(editor); await sleep(200); }
      if (!editorFocused(editor)) continue;
      clearEditorScoped(editor);
      await sleep(150);
      if (!document.execCommand('insertText', false, caption)) {
        editor.textContent = caption;
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: caption }));
      }
      await sleep(800);
      var typed = stripInvisible(normalized(editor.innerText || editor.textContent));
      var expected = stripInvisible(normalized(caption));
      if (typed === expected) { captionOk = true; break; }
      // TikTok ตัด caption ยาวเกิน limit → ยอมรับเมื่อได้ prefix อย่างน้อย 90%
      if (typed && expected.indexOf(typed) === 0 && typed.length >= Math.floor(expected.length * 0.9)) {
        log('CAPTION_TRUNCATED', 'caption โดนตัดท้ายที่ ' + typed.length + '/' + expected.length + ' ตัวอักษร (ยอมรับ)');
        captionOk = true;
        break;
      }
      log('CAPTION_MISMATCH', 'ข้อความใน editor ไม่ตรง (ได้ "' + typed.slice(0, 30) + '")');
    }
    if (!captionOk) {
      throw { code: 'CAPTION_VERIFY_FAILED', message: 'ตรวจสอบ Caption ที่กรอกไม่ผ่าน — ข้ามคลิปนี้ ไม่โพสต์', stage: 'caption-verify' };
    }

    await typeHashtags(editor);

    if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
    await sleep(250);
  }

  // พิมพ์ hashtag ทีละแท็ก + เลือกจาก autocomplete (desktop parity) — fail-soft ทั้งฟังก์ชัน:
  // dropdown ไม่ขึ้น/เลือกไม่ติด = ปล่อยเป็นข้อความธรรมดา ไม่ล้มโพสต์ (caption ผ่าน verify แล้ว)
  async function typeHashtags(editor){
    var hashtags = String(INPUT.hashtags || '').trim();
    if (!hashtags) return;
    var tags = hashtags.match(/#[^#\\s]+/g) || [];
    if (!tags.length) return;
    log('HASHTAG_FILL', 'กำลังพิมพ์ hashtag ' + tags.length + ' แท็ก (เลือกจาก autocomplete)...');
    await sleep(1000);
    for (var t = 0; t < tags.length; t++) {
      var tagText = tags[t].slice(1);
      if (!editorFocused(editor)) {
        caretToEnd(editor);
        await sleep(200);
        if (!editorFocused(editor)) {
          log('HASHTAG_FOCUS_LOST', 'focus หลุดก่อนพิมพ์ ' + tags[t] + ' — เติมแท็กที่เหลือเป็นข้อความธรรมดา');
          document.execCommand('insertText', false, ' ' + tags.slice(t).join(' ') + ' ');
          return;
        }
      }
      document.execCommand('insertText', false, ' ');
      await sleep(120);
      document.execCommand('insertText', false, '#');
      await sleep(200);
      // พิมพ์ทีละตัวอักษรให้ dropdown autocomplete เด้ง (พิมพ์ทั้งก้อน dropdown ไม่ขึ้น)
      for (var c = 0; c < tagText.length; c++) {
        document.execCommand('insertText', false, tagText.charAt(c));
        await sleep(45);
      }
      // รอ dropdown สูงสุด 10 วิ — เจอตัวตรงกับแท็กหยุดรอทันที ครบเวลาไม่เจอ = ข้อความธรรมดา
      var expectedTag = normalized(tagText).replace(/\\s+/g, '');
      var picked = null;
      var matchedPick = false;
      var tagDeadline = Date.now() + 10000;
      while (Date.now() < tagDeadline) {
        await sleep(400);
        var items = document.querySelectorAll('.hashtag-suggestion-item');
        var visibleItems = [];
        for (var i = 0; i < items.length; i++) { if (visible(items[i])) visibleItems.push(items[i]); }
        if (!visibleItems.length) continue;
        var matchItem = null;
        var focusedItem = null;
        for (var j = 0; j < visibleItems.length; j++) {
          var topic = visibleItems[j].querySelector('.hash-tag-topic');
          var textJ = normalized((topic ? topic.textContent : visibleItems[j].textContent) || '').replace(/^#/, '').replace(/\\s+/g, '');
          if (textJ && (textJ === expectedTag || textJ.indexOf(expectedTag) === 0 || expectedTag.indexOf(textJ) === 0)) matchItem = matchItem || visibleItems[j];
          if (visibleItems[j].classList.contains('focused')) focusedItem = focusedItem || visibleItems[j];
        }
        picked = matchItem || focusedItem || visibleItems[0];
        matchedPick = !!matchItem;
        if (matchedPick) break;
      }
      if (picked) {
        picked.click();
        await sleep(700);
        // dropdown ยังค้าง = คลิกไม่ติด → เคาะ space ปิดให้แท็กจบเป็นข้อความธรรมดา
        var stillOpen = false;
        var itemsAfter = document.querySelectorAll('.hashtag-suggestion-item');
        for (var k = 0; k < itemsAfter.length; k++) { if (visible(itemsAfter[k])) { stillOpen = true; break; } }
        if (stillOpen) {
          document.execCommand('insertText', false, ' ');
          log('HASHTAG_PLAIN', 'เลือก autocomplete ไม่ติดสำหรับ ' + tags[t] + ' — ใช้ข้อความธรรมดา');
        } else {
          log('HASHTAG_PICKED', 'เลือก hashtag: ' + tags[t] + (matchedPick ? '' : ' (ตัวใกล้เคียง)'));
        }
      } else {
        document.execCommand('insertText', false, ' ');
        log('HASHTAG_PLAIN', 'ไม่พบ autocomplete สำหรับ ' + tags[t] + ' ภายใน 10 วิ (ใช้ข้อความธรรมดา)');
      }
      await sleep(300);
    }
  }

  async function bindProduct(){
    if (!INPUT.enableProductLink) {
      log('PRODUCT_SKIPPED', 'ข้ามการแนบสินค้า');
      return;
    }
    if (!INPUT.productId) throw { code: 'PRODUCT_ID_REQUIRED', message: 'เปิดแนบสินค้าแต่ไม่มี TikTok Product ID', stage: 'product' };

    log('PRODUCT_OPEN', 'กำลังเปิดรายการสินค้า TikTok...');
    dismissBlockingDialogs();
    var anchor = document.querySelector('div[data-e2e="anchor_container"]');
    var addButton = anchor && (anchor.querySelector('.TUXButton') || findButton(['เพิ่ม', 'Add'], anchor));
    if (!addButton) throw { code: 'PRODUCT_ADD_NOT_FOUND', message: 'ไม่พบปุ่มเพิ่มสินค้า', stage: 'product-add' };
    addButton.click();
    await sleep(1200);

    var dropdown = document.querySelector('button.TUXSelect-button[role="combobox"]');
    if (dropdown) {
      var current = normalized(dropdown.textContent);
      if (current.indexOf('สินค้า') < 0 && current.indexOf('product') < 0) {
        dropdown.click();
        var option = await waitFor(function(){
          var options = document.querySelectorAll('[role="option"], [role="listbox"] li, .TUXSelect-option');
          for (var i = 0; i < options.length; i++) {
            var text = normalized(options[i].textContent);
            if (text.indexOf('สินค้า') >= 0 || text.indexOf('product') >= 0) return options[i];
          }
          return null;
        }, 8000, 300);
        if (!option) throw { code: 'PRODUCT_TYPE_NOT_FOUND', message: 'ไม่พบประเภทลิงก์สินค้า', stage: 'product-type' };
        option.click();
      }
    }

    var nextButton = findModalAction(['ถัดไป', 'Next']);
    if (!nextButton) throw { code: 'PRODUCT_NEXT_NOT_FOUND', message: 'ไม่พบปุ่มถัดไปของสินค้า', stage: 'product-next' };
    nextButton.click();
    await sleep(1000);

    var showcaseTab = await waitFor(function(){
      var tabs = document.querySelectorAll('.TUXTabBar-itemTitle, [role="tab"]');
      for (var i = 0; i < tabs.length; i++) {
        var text = normalized(tabs[i].textContent);
        if (text.indexOf('นำเสนอสินค้า') >= 0 || text.indexOf('showcase products') >= 0) return tabs[i];
      }
      return null;
    }, 10000, 300);
    if (!showcaseTab) throw { code: 'PRODUCT_SHOWCASE_NOT_FOUND', message: 'ไม่พบรายการสินค้านำเสนอ', stage: 'product-showcase' };
    showcaseTab.click();

    var search = await waitFor(function(){
      return document.querySelector('input[placeholder="ค้นหาสินค้า"], input[placeholder="Search products"], input[placeholder*="Product ID" i]');
    }, 20000, 500);
    if (!search) throw { code: 'PRODUCT_SEARCH_NOT_FOUND', message: 'ไม่พบช่องค้นหาสินค้า', stage: 'product-search' };
    // TikTok ยิงค้นหาเมื่อได้ Enter แบบ trusted เท่านั้น (desktop ใช้ CDP pressKey) —
    // Enter สังเคราะห์จาก JS ทำ search พัง และ input/change เฉยๆ ไม่ trigger ค้นหา
    // → แตะช่องค้นหาด้วย gesture จริงให้ focus + คีย์บอร์ดเด้ง แล้วให้ native แตะปุ่ม Go/ค้นหา
    // บนคีย์บอร์ด (ACTION_IME_ENTER บน WebView ไม่ทำงาน จึงกดปุ่มคีย์บอร์ดโดยตรงแทน)
    // desktop parity: รอผลค้นหาจริงสูงสุด 3 นาที (เดิมรอ ~20 วิแล้ว fail — เน็ตช้าไม่ทัน)
    // เจอแถวที่มี productId → เลือกแถวนั้น / เหลือแถวเดียวนิ่ง 3 รอบ → ใช้แถวนั้น
    // empty state นิ่ง 3 รอบ = ไม่พบสินค้า / ครบเวลา = timeout → ทั้งคู่ข้ามคลิปนี้ ไม่โพสต์
    // ระหว่างรอถ้ายังไม่มีผล ยิงปุ่มค้นหาบนคีย์บอร์ด (trusted Enter) ซ้ำทุก ~30 วิ
    // สำคัญ: ห้ามเลือก radio ทันทีหลังยิง Enter — รายการ showcase โชว์สินค้าทั้งหมดอยู่แล้ว
    // ต้องรอให้ Go (async มี latency) ลงจริง + search กรอง แล้วบังคับปิดคีย์บอร์ด (blur) ค่อยเลือก
    var pidNorm = normalized(INPUT.productId);
    var productRows = function(){
      var rows = document.querySelectorAll('tbody tr, .product-tb-row, [data-e2e*="product-row"]');
      var out = [];
      for (var i = 0; i < rows.length; i++) { if (visible(rows[i])) out.push(rows[i]); }
      return out;
    };
    var fireSearch = async function(label){
      log('PRODUCT_SEARCH_FILLED', 'ค้นหา Product ID: ' + String(INPUT.productId) + ' — กดปุ่มค้นหาบนคีย์บอร์ด' + (label ? ' (' + label + ')' : ''));
      var tapped = await nativeTapOn(search, 'ช่องค้นหาสินค้า');
      if (!tapped) search.click();
      await sleep(900); // รอคีย์บอร์ดเด้งขึ้นก่อน
      setNativeValue(search, INPUT.productId);
      await sleep(500);
      send({ type: 'tiktok-post-native-enter' });
      await sleep(2800);
      try {
        if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
      } catch (e) {}
      await sleep(700);
    };
    await fireSearch('');
    var radio = null;
    var notFoundStable = false;
    var singleStreak = 0;
    var emptyStreak = 0;
    var searchDeadline = Date.now() + 180000;
    var lastFireAt = Date.now();
    var lastWaitLogAt = Date.now();
    while (Date.now() < searchDeadline) {
      var rowsNow = productRows();
      var idRow = null;
      for (var r = 0; r < rowsNow.length; r++) {
        if (normalized(rowsNow[r].textContent).indexOf(pidNorm) >= 0) { idRow = rowsNow[r]; break; }
      }
      if (idRow) {
        radio = idRow.querySelector('input[type="radio"]');
        if (radio) { log('PRODUCT_SELECTED', 'พบสินค้าตรงรหัส กำลังเลือก...'); break; }
      }
      if (rowsNow.length === 1 && Date.now() - lastFireAt >= 8000) {
        // แถวผลลัพธ์มักโชว์ชื่อสินค้าไม่ใช่ ID — ใช้แถวเดียวที่เหลือได้เมื่อนิ่งติดกัน 3 รอบ
        // และผ่านไปแล้วอย่างน้อย 8 วิหลังยิงค้นหา (กัน showcase 1 ตัวที่ filter ยังไม่ทันบนเน็ตช้า)
        singleStreak++;
        emptyStreak = 0;
        if (singleStreak >= 3) {
          radio = rowsNow[0].querySelector('input[type="radio"]');
          if (radio) { log('PRODUCT_SELECTED', 'ผลค้นหาเหลือรายการเดียว กำลังเลือก...'); break; }
        }
      } else if (rowsNow.length === 0) {
        singleStreak = 0;
        var modalArea = findProductModal() || document.body;
        var areaText = normalized(modalArea.textContent);
        if (areaText.indexOf('ไม่พบ') >= 0 || areaText.indexOf('ไม่มีสินค้า') >= 0 || areaText.indexOf('no products') >= 0 || areaText.indexOf('no results') >= 0) {
          emptyStreak++;
          if (emptyStreak >= 3) { notFoundStable = true; break; }
        } else {
          emptyStreak = 0;
        }
      } else {
        // หลายแถว = ยังไม่กรอง (รายการเต็ม) — ห้ามเดาแถวแรก (จะแนบสินค้าผิดตัว) รอต่อ
        singleStreak = 0;
        emptyStreak = 0;
      }
      if (!idRow && Date.now() - lastFireAt >= 30000) {
        lastFireAt = Date.now();
        await fireSearch('ยิงซ้ำ');
        continue;
      }
      if (Date.now() - lastWaitLogAt >= 30000) {
        lastWaitLogAt = Date.now();
        log('PRODUCT_SEARCH_WAIT', 'ยังรอผลค้นหาสินค้า... (เหลือ ' + Math.round((searchDeadline - Date.now()) / 1000) + ' วิ)');
      }
      await sleep(1000);
    }
    if (!radio) {
      if (notFoundStable) {
        throw { code: 'PRODUCT_NOT_FOUND', message: 'ไม่พบสินค้า ' + String(INPUT.productId) + ' ใน Showcase — ข้ามคลิปนี้ ไม่โพสต์', stage: 'product-result' };
      }
      throw { code: 'PRODUCT_SEARCH_TIMEOUT', message: 'รอผลค้นหาสินค้าเกิน 3 นาที (เหลือ ' + productRows().length + ' รายการ จับคู่ Product ID ไม่ได้) — ข้ามคลิปนี้ ไม่โพสต์', stage: 'product-result' };
    }
    radio.click();
    await sleep(1000); // ให้ TikTok enable ปุ่มถัดไปหลังเลือก radio (desktop ก็รอ 1 วิ)

    function productBound(){
      var anchorText = normalized(anchor && anchor.textContent);
      if (INPUT.productId && anchorText.indexOf(normalized(INPUT.productId)) >= 0) return true;
      // หลังผูก anchor มักโชว์ "ชื่อสินค้า" ไม่ใช่ ID — เช็คชื่อ/รูปสินค้าด้วย กัน false-negative
      var pname = normalized(INPUT.productName);
      if (pname && pname.length >= 6 && anchorText.indexOf(pname.slice(0, 12)) >= 0) return true;
      return !!document.querySelector('[data-e2e="anchor_container"] img, [data-e2e="anchor_container"] [data-e2e*="product"]');
    }

    // desktop parity: รอให้เข้าหน้าใส่ CTA/ยืนยันจริงก่อนไปต่อ (เน็ตช้าหน้าเปลี่ยนไม่ทัน
    // เดิมเคยเสี่ยงพิมพ์ CTA ลงช่องค้นหาเพราะเป็น TUX input เหมือนกัน) — สูงสุด 60 วิ
    // สัญญาณหน้า CTA: ช่องค้นหาหายไป + มีปุ่มยืนยัน เพิ่ม/Add ใน footer ของ modal
    // ระหว่างรอถ้ายังค้างหน้าเลือกสินค้า จะติ๊กสินค้า + กดถัดไปซ้ำให้เอง
    var isSearchVisible = function(){
      var inputs = document.querySelectorAll('input[placeholder="ค้นหาสินค้า"], input[placeholder="Search products"], input[placeholder*="Product ID" i]');
      for (var i = 0; i < inputs.length; i++) { if (visible(inputs[i])) return true; }
      return false;
    };
    var ctaPageDeadline = Date.now() + 60000;
    var onCtaPage = false;
    var nextClickedOnce = false;
    while (Date.now() < ctaPageDeadline) {
      dismissBlockingDialogs(); // กัน dialog ประกาศของ TikTok เด้งมาเป็น topmost แทน modal สินค้า
      var modalNow = findProductModal();
      if (!modalNow) { onCtaPage = true; break; } // บางรุ่นเพิ่มทันทีไม่มีหน้า CTA — modal ปิดเลย
      var confirmProbe = findModalAction(['เพิ่ม', 'Add', 'ยืนยัน', 'Confirm', 'เสร็จสิ้น', 'Done']);
      if (!isSearchVisible() && confirmProbe) { onCtaPage = true; break; }
      if (isSearchVisible()) {
        // ยังค้างหน้าเลือกสินค้า — ติ๊กสินค้าซ้ำ (ถ้าหลุด) แล้วกดถัดไปอีกครั้ง
        try {
          if (radio && !radio.isConnected) {
            // React re-render ทำ node เดิม detach — หาแถวที่ตรงรหัส (หรือแถวเดียวที่เหลือ) ใหม่
            var rowsAgain = productRows();
            var reRow = null;
            for (var ra = 0; ra < rowsAgain.length; ra++) {
              if (normalized(rowsAgain[ra].textContent).indexOf(pidNorm) >= 0) { reRow = rowsAgain[ra]; break; }
            }
            if (!reRow && rowsAgain.length === 1) reRow = rowsAgain[0];
            if (reRow) radio = reRow.querySelector('input[type="radio"]') || radio;
          }
          if (radio && !radio.checked) { radio.click(); await sleep(400); }
        } catch (e) {}
        var nextButton2 = findModalAction(['ถัดไป', 'Next']);
        if (!nextButton2) {
          // fallback ปุ่ม primary เฉพาะใน footer ของ modal สินค้าเท่านั้น —
          // ห้ามค้นทั้งหน้า เพราะปุ่ม primary ของหน้า editor คือ "โพสต์"
          var prim = modalNow.querySelector('.common-modal-footer .TUXButton--primary, .button-group .TUXButton--primary, footer .TUXButton--primary');
          if (prim && visible(prim)) nextButton2 = prim;
        }
        if (nextButton2) {
          log('PRODUCT_STEP_NEXT', 'กดปุ่ม "' + normalized(nextButton2.textContent).slice(0, 40) + '" ใน modal สินค้า');
          nextButton2.click();
          nextClickedOnce = true;
        } else if (!nextClickedOnce) {
          throw { code: 'PRODUCT_SELECT_NEXT_NOT_FOUND', message: 'เลือกสินค้าแล้วแต่ไม่พบปุ่มถัดไป', stage: 'product-select' };
        }
      } else {
        // หน้ากลางระหว่าง transition — บางรุ่นมีหน้า "ถัดไป" คั่นเพิ่ม
        var nextMid = findModalAction(['ถัดไป', 'Next']);
        if (nextMid) nextMid.click();
      }
      await sleep(1500);
    }
    if (!onCtaPage) {
      throw { code: 'PRODUCT_CTA_PAGE_TIMEOUT', message: 'หน้าใส่ CTA ไม่ขึ้นหลังกดถัดไป (เกิน 60 วิ) — ข้ามคลิปนี้ ไม่โพสต์', stage: 'product-cta' };
    }

    // เติม CTA — เฉพาะ input ใน modal ที่ "ไม่ใช่" ช่องค้นหา (กันพิมพ์ผิดช่อง)
    var modalCta = findProductModal();
    if (INPUT.cta && modalCta) {
      var ctaInput = null;
      var ctaCandidates = modalCta.querySelectorAll('input.TUXTextInputCore-input, input[placeholder*="ชื่อ"], input[placeholder*="Name" i], input[data-e2e*="cta"]');
      for (var ci = 0; ci < ctaCandidates.length; ci++) {
        var ph = ctaCandidates[ci].getAttribute('placeholder') || '';
        if (ph === 'ค้นหาสินค้า' || ph === 'Search products') continue;
        if (!visible(ctaCandidates[ci])) continue;
        ctaInput = ctaCandidates[ci];
        break;
      }
      if (ctaInput && ctaInput.value !== INPUT.cta) {
        ctaInput.click();
        setNativeValue(ctaInput, INPUT.cta);
        await sleep(300);
      }
      if (!ctaInput) log('PRODUCT_CTA_INPUT_MISSING', 'ไม่พบช่อง CTA — ใช้ข้อความปุ่มค่าเริ่มต้นของ TikTok');
    }

    // กดยืนยัน "เพิ่ม" แล้วรอ modal ปิดจริง (hard verify แบบ desktop) สูงสุด 30 วิ —
    // modal ไม่ปิด = เพิ่มสินค้าไม่สำเร็จ ห้ามเดินหน้าไปโพสต์
    var confirmClicked = false;
    var lastConfirmAt = 0;
    var confirmDeadline = Date.now() + 30000;
    while (Date.now() < confirmDeadline) {
      dismissBlockingDialogs(); // กัน dialog แปลกปลอมทำให้เข้าใจผิดว่า modal สินค้ายังไม่ปิด
      if (!findProductModal()) break;
      var confirmButton = findModalAction(['เพิ่ม', 'Add', 'ยืนยัน', 'Confirm', 'เสร็จสิ้น', 'Done']);
      if (confirmButton && (!confirmClicked || Date.now() - lastConfirmAt >= 8000)) {
        log('PRODUCT_CONFIRM_CLICK', 'กดปุ่มยืนยันสินค้า: "' + normalized(confirmButton.textContent).slice(0, 40) + '"');
        confirmButton.click();
        confirmClicked = true;
        lastConfirmAt = Date.now();
      }
      await sleep(1000);
    }
    if (findProductModal()) {
      throw { code: 'PRODUCT_CONFIRM_TIMEOUT', message: 'กดยืนยันแล้วหน้าต่างสินค้าไม่ปิด (เกิน 30 วิ) — ข้ามคลิปนี้ ไม่โพสต์', stage: 'product-confirm' };
    }
    log('PRODUCT_MODAL_CLOSED', 'modal สินค้าปิดแล้ว — เพิ่มสินค้าเสร็จ');

    // ตรวจ anchor เป็น soft-verify เพิ่มเติม (anchor มักโชว์ชื่อสินค้าไม่ใช่ ID จึงไม่ hard fail)
    var bound = await waitFor(function(){ return productBound() ? true : null; }, 6000, 500);
    if (!bound) {
      log('PRODUCT_BIND_SOFT', 'ยืนยันการแนบสินค้าจาก DOM ไม่ชัด — ดำเนินการต่อ (เหมือน flow desktop)');
    }
  }

  async function enableAiContent(){
    log('AI_CONTENT', 'กำลังเปิดการระบุเนื้อหาที่สร้างด้วย AI...');
    var advanced = document.querySelector('[data-e2e="advanced_settings_container"]');
    if (advanced && advanced.classList.contains('collapsed')) {
      var more = advanced.querySelector('.more-btn, button');
      if (more) { more.click(); await sleep(500); }
    }
    var container = document.querySelector('[data-e2e="aigc_container"]');
    if (!container) { log('AI_CONTENT_UNAVAILABLE', 'ไม่พบตัวเลือกเนื้อหา AI — ใช้ค่าเดิมของ TikTok'); return; }
    var toggle = container.querySelector('.Switch__content, [role="switch"], .Switch__root');
    if (!toggle) throw { code: 'AI_CONTENT_TOGGLE_NOT_FOUND', message: 'พบส่วนเนื้อหา AI แต่ไม่พบสวิตช์', stage: 'ai-content' };
    function isEnabled(){
      var nodes = container.querySelectorAll('.Switch__content, [role="switch"], .Switch__root, input[type="checkbox"]');
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.checked === true || node.getAttribute('aria-checked') === 'true' || node.getAttribute('data-state') === 'checked') return true;
        if (/(^|\\s)(checked|active|on)(\\s|$)/i.test(String(node.className || ''))) return true;
      }
      return false;
    }
    var checked = isEnabled();
    if (!checked) {
      toggle.click();
      var enabled = await waitFor(isEnabled, 1500, 250);
      if (!enabled) {
        var root = container.querySelector('.Switch__root');
        if (root && root !== toggle) root.click();
        enabled = await waitFor(isEnabled, 1500, 250);
      }
      // TikTok variants do not all expose switch state in the DOM. Match the desktop flow:
      // make a best-effort click and do not block the actual post solely on missing ARIA state.
      if (!enabled) log('AI_CONTENT_VERIFY_UNAVAILABLE', 'TikTok ไม่เปิดเผยสถานะเนื้อหา AI — ดำเนินการต่อหลังสั่งเปิดแล้ว');
    }
  }

  async function verifyContent(marker){
    var isDraft = marker.postAction === 'draft';
    var captionSelector = isDraft
      ? '[data-tt="components_DraftCells_TruncateText"] [data-tt="components_DraftCells_TUXText"]'
      : '[data-tt="components_PostInfoCell_a"]';
    var matched = await waitFor(function(){
      var captions = document.querySelectorAll(captionSelector);
      for (var i = 0; i < captions.length; i++) {
        if (textMatches(captions[i].textContent, marker.expected)) return captions[i].textContent;
      }
      return null;
    }, 30000, 1000);
    if (!matched) throw { code: 'SUBMIT_VERIFY_FAILED', message: 'ไม่พบโพสต์ที่มี Caption ตรงกันในหน้า Content', stage: 'submit-verify' };
    return matched;
  }

  async function submitAndVerify(){
    // ปิด dialog ที่อาจบังปุ่มบันทึกแบบร่าง/โพสต์
    dismissBlockingDialogs();
    log('SUBMIT_WAIT_CHECKS', 'รอ TikTok ตรวจสอบวิดีโอ...');
    await sleep(1000);
    var checkState = await waitFor(function(){
      var checking = document.querySelector('[data-e2e="copyright_container"] .spinning, .status-result.status-checking[data-show="true"]');
      if (checking) return null;
      var rejected = document.querySelector('.status-result.status-error[data-show="true"], .status-result.status-warn[data-show="true"], [data-e2e="copyright_container"] .status-error');
      if (rejected) return { done: false, error: normalized(rejected.textContent).slice(0, 240) };
      return { done: true };
    }, 30000, 1000);
    if (!checkState) throw { code: 'CONTENT_CHECK_TIMEOUT', message: 'หมดเวลารอ TikTok ตรวจสอบวิดีโอ', stage: 'content-check' };
    if (!checkState.done) throw { code: 'CONTENT_CHECK_REJECTED', message: checkState.error || 'TikTok ไม่ผ่านการตรวจสอบเนื้อหา', stage: 'content-check' };

    var isDraft = INPUT.postAction === 'draft';
    var selector = isDraft ? 'button[data-e2e="save_draft_button"]' : 'button[data-e2e="post_video_button"]';
    var button = document.querySelector(selector);
    if (!button || !visible(button) || button.disabled) {
      throw { code: 'SUBMIT_BUTTON_NOT_READY', message: isDraft ? 'ปุ่มบันทึกแบบร่างยังไม่พร้อม' : 'ปุ่มโพสต์ยังไม่พร้อม', stage: 'submit' };
    }
    log('SUBMIT_CLICK', isDraft ? 'กำลังบันทึกแบบร่าง...' : 'กำลังโพสต์ TikTok...');
    saveVerificationMarker();
    button.click();

    for (var i = 0; i < 5; i++) {
      await sleep(700);
      var confirm = findButton(['โพสต์ต่อ', 'Continue posting', 'Continue to post', 'Post anyway'], document.querySelector('.TUXModal') || document);
      if (confirm) { confirm.click(); break; }
    }

    var reachedContent = await waitFor(function(){ return location.href.indexOf('/tiktokstudio/content') >= 0 ? true : null; }, 45000, 1000);
    if (!reachedContent) throw { code: 'SUBMIT_NAVIGATION_TIMEOUT', message: 'TikTok ไม่ไปหน้ารายการหลังส่งโพสต์', stage: 'submit-navigation' };
    return verifyContent({ expected: expectedText(), postAction: INPUT.postAction });
  }

  (async function(){
    try {
      var pendingVerification = readVerificationMarker();
      if (location.href.indexOf('/tiktokstudio/content') >= 0) {
        // มาถึงหน้า Content = กดบันทึก/โพสต์ไปแล้ว คือสัญญาณสำเร็จหลัก (เหมือน flow desktop)
        // ถ้ามี marker ลอง verify caption ให้ตรง (best-effort) แต่ถ้า marker หาย/ไม่ตรง ก็ยังถือว่าสำเร็จ
        // เพราะทางเดียวที่จะมาหน้านี้ในรอบนี้คือกดปุ่มบันทึก/โพสต์สำเร็จ
        var resumeIsDraft = pendingVerification ? pendingVerification.postAction === 'draft' : INPUT.postAction === 'draft';
        var resumedMatch = '';
        if (pendingVerification) {
          log('SUBMIT_VERIFY', 'กำลังยืนยันโพสต์ในหน้า Content...');
          try { resumedMatch = await verifyContent(pendingVerification); } catch (verifyErr) {
            log('SUBMIT_VERIFY_SOFT', 'ยืนยัน caption ไม่ตรงแต่ถึงหน้า Content แล้ว — ถือว่าสำเร็จ');
          }
        }
        log('POST_SUCCESS', resumeIsDraft ? 'บันทึกแบบร่างสำเร็จ' : 'โพสต์ TikTok สำเร็จ');
        finish(true, 'SUCCESS', null, { matchedCaption: String(resumedMatch || '').slice(0, 120), url: location.href, verified: !!resumedMatch });
        return;
      }
      await uploadVideo();
      await waitForEditorAndUpload();
      await fillCaption();
      await bindProduct();
      await enableAiContent();
      var matched = await submitAndVerify();
      log('POST_SUCCESS', INPUT.postAction === 'draft' ? 'บันทึกแบบร่างสำเร็จ' : 'โพสต์ TikTok สำเร็จ');
      finish(true, 'SUCCESS', null, { matchedCaption: String(matched || '').slice(0, 120), url: location.href });
    } catch (error) {
      var code = error && error.code ? error.code : 'UNEXPECTED_ERROR';
      var message = error && error.message ? error.message : String(error || 'เกิดข้อผิดพลาด');
      var stage = error && error.stage ? error.stage : 'unexpected';
      log(code, message);
      finish(false, code, message, diagnostics(stage));
    }
  })();
})(); true;`;
}

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
  function findButton(labels, root){
    var scope = root || document;
    var buttons = scope.querySelectorAll('button, .TUXButton, [role="button"]');
    for (var i = 0; i < buttons.length; i++) {
      if (!visible(buttons[i])) continue;
      var text = normalized(buttons[i].textContent);
      for (var j = 0; j < labels.length; j++) {
        var label = normalized(labels[j]);
        if (text === label || text.indexOf(label) >= 0) return buttons[i];
      }
    }
    return null;
  }
  function findModalAction(labels){
    var scopes = document.querySelectorAll('.common-modal-footer, .button-group, [role="dialog"] footer');
    for (var i = 0; i < scopes.length; i++) {
      if (!visible(scopes[i])) continue;
      var button = findButton(labels, scopes[i]);
      if (button) return button;
    }
    return null;
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
    uploadTarget.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
    await sleep(350);
    var targetRect = uploadTarget.getBoundingClientRect();
    var visualViewport = window.visualViewport;
    var viewportLeft = visualViewport ? visualViewport.offsetLeft : 0;
    var viewportTop = visualViewport ? visualViewport.offsetTop : 0;
    var viewportWidth = Math.max(1, visualViewport ? visualViewport.width : window.innerWidth);
    var viewportHeight = Math.max(1, visualViewport ? visualViewport.height : window.innerHeight);
    var xRatio = (targetRect.left + targetRect.width / 2 - viewportLeft) / viewportWidth;
    var yRatio = (targetRect.top + targetRect.height / 2 - viewportTop) / viewportHeight;
    if (xRatio < 0 || xRatio > 1 || yRatio < 0 || yRatio > 1) {
      throw { code: 'UPLOAD_TAP_TARGET_OUTSIDE_VIEWPORT', message: 'ปุ่มอัปโหลดอยู่นอกพื้นที่หน้าจอ', stage: 'upload-tap-target' };
    }
    log('UPLOAD_OPEN_PICKER', 'กำลังแตะปุ่มอัปโหลดวิดีโอ...');
    send({ type: 'tiktok-post-native-tap', xRatio: xRatio, yRatio: yRatio });

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

  async function fillCaption(){
    var caption = String(INPUT.caption || INPUT.productName || '').replace(/\\s*[\\r\\n]+\\s*/g, ' ').trim();
    var hashtags = String(INPUT.hashtags || '').trim();
    var content = (caption + (hashtags ? ' ' + hashtags : '')).trim();
    if (!content) throw { code: 'CAPTION_REQUIRED', message: 'ไม่มี Caption หรือชื่อสินค้า จึงไม่โพสต์', stage: 'caption' };

    log('CAPTION_FILL', 'กำลังใส่ Caption และ Hashtags...');
    var editor = document.querySelector('.public-DraftEditor-content');
    if (!editor) throw { code: 'CAPTION_EDITOR_NOT_FOUND', message: 'ไม่พบช่อง Caption', stage: 'caption' };
    editor.click();
    editor.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    if (!document.execCommand('insertText', false, content)) {
      editor.textContent = content;
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: content }));
    }
    await sleep(800);
    if (!textMatches(editor.innerText || editor.textContent, content)) {
      throw { code: 'CAPTION_VERIFY_FAILED', message: 'ตรวจสอบ Caption ที่กรอกไม่ผ่าน', stage: 'caption-verify' };
    }
    if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur();
    await sleep(250);
  }

  async function bindProduct(){
    if (!INPUT.enableProductLink) {
      log('PRODUCT_SKIPPED', 'ข้ามการแนบสินค้า');
      return;
    }
    if (!INPUT.productId) throw { code: 'PRODUCT_ID_REQUIRED', message: 'เปิดแนบสินค้าแต่ไม่มี TikTok Product ID', stage: 'product' };

    log('PRODUCT_OPEN', 'กำลังเปิดรายการสินค้า TikTok...');
    var anchor = document.querySelector('div[data-e2e="anchor_container"]');
    var addButton = anchor && (anchor.querySelector('button, .TUXButton') || findButton(['เพิ่ม', 'Add'], anchor));
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
    search.click();
    setNativeValue(search, INPUT.productId);
    await sleep(500);
    // TikTok บางรุ่นค้นหาจาก input event ทันที แต่บางรุ่นต้องกดปุ่มหรือ submit form.
    // ใช้ element.click() เป็นหลักตาม convention ของ content actions.
    var searchScope = search.closest('form, [class*="search" i]') || search.parentElement || document;
    var searchButton = findButton(['ค้นหา', 'Search'], searchScope);
    if (searchButton) searchButton.click();
    else {
      var form = search.closest('form');
      if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
    }

    var radio = await waitFor(function(){
      var rows = document.querySelectorAll('tbody tr, .product-tb-row, [data-e2e*="product-row"]');
      for (var i = 0; i < rows.length; i++) {
        if (normalized(rows[i].textContent).indexOf(normalized(INPUT.productId)) < 0) continue;
        var candidate = rows[i].querySelector('input[type="radio"]');
        if (candidate) return candidate;
      }
      return null;
    }, 20000, 500);
    if (!radio) throw { code: 'PRODUCT_NOT_FOUND', message: 'ไม่พบ TikTok Product ID ที่เลือก', stage: 'product-result' };
    radio.click();

    nextButton = findModalAction(['ถัดไป', 'Next']);
    if (!nextButton) throw { code: 'PRODUCT_SELECT_NEXT_NOT_FOUND', message: 'เลือกสินค้าแล้วแต่ไม่พบปุ่มถัดไป', stage: 'product-select' };
    nextButton.click();
    await sleep(800);

    if (INPUT.cta) {
      var ctaInput = document.querySelector('input[placeholder*="ชื่อ"], input[placeholder*="Name" i], input[data-e2e*="cta"]');
      if (ctaInput) { ctaInput.click(); setNativeValue(ctaInput, INPUT.cta); }
    }
    var confirmButton = findModalAction(['ยืนยัน', 'Confirm', 'เพิ่ม', 'Add']);
    if (!confirmButton) throw { code: 'PRODUCT_CONFIRM_NOT_FOUND', message: 'ไม่พบปุ่มยืนยันสินค้า', stage: 'product-confirm' };
    confirmButton.click();

    var bound = await waitFor(function(){
      var text = normalized(anchor && anchor.textContent);
      return text.indexOf(normalized(INPUT.productId)) >= 0 || document.querySelector('[data-e2e="anchor_container"] [data-e2e*="product"]');
    }, 15000, 500);
    if (!bound) throw { code: 'PRODUCT_BIND_VERIFY_FAILED', message: 'ยืนยันการแนบสินค้าไม่สำเร็จ', stage: 'product-verify' };
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
        if (!pendingVerification) {
          throw { code: 'VERIFY_MARKER_MISSING', message: 'ไม่พบข้อมูลสำหรับยืนยันผลโพสต์', stage: 'verify-marker' };
        }
        log('SUBMIT_VERIFY', 'กำลังยืนยันโพสต์ในหน้า Content...');
        var resumedMatch = await verifyContent(pendingVerification);
        log('POST_SUCCESS', pendingVerification.postAction === 'draft' ? 'บันทึกแบบร่างสำเร็จ' : 'โพสต์ TikTok สำเร็จ');
        finish(true, 'SUCCESS', null, { matchedCaption: String(resumedMatch || '').slice(0, 120), url: location.href });
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

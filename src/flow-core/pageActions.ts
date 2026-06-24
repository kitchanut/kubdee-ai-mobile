/**
 * Google Flow automation actions — platform-agnostic page logic.
 *
 * Each action body is the source of an async function `(args) => result` that
 * runs INSIDE the Google Flow page (the page's main JS world), so it can reach
 * React fiber / Slate editor internals directly. The logic is ported from the
 * desktop app's `flows/googleFlow/actions/*.ts`.
 *
 * Two consumers, one source of truth:
 *   - mobile (react-native-webview): `injectJavaScript(buildActionScript(...))`,
 *     result arrives via `window.ReactNativeWebView.postMessage`.
 *   - desktop (Playwright/CDP, later): `page.evaluate("(async a=>{<body>})(args)")`,
 *     result is returned directly.
 *
 * Keep this module pure TS with ZERO runtime dependencies (only `./selectors`)
 * so it lifts cleanly into a standalone `@kubdee/flow-core` package later.
 */

import { CONFIGURE_POPPER_BODY } from './configurePopperBody';
import { VIDEO_RESULTS_BODY } from './extractVideosBody';
import { VIDEO_SNAPSHOT_BODY } from './snapshotBody';
import { FLOW_SELECTORS } from './selectors';

export type FlowActionName =
  | 'newProject'
  | 'configurePopper'
  | 'selectRecentImage'
  | 'uploadReferenceImage'
  | 'fillPrompt'
  | 'submit'
  | 'videoSnapshot'
  | 'videoResults'
  | 'downloadImages'
  | 'downloadVideo';

export interface FlowActionResult {
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

const SLATE = FLOW_SELECTORS.slateEditor;
const SUBMIT_ICON = JSON.stringify(FLOW_SELECTORS.submitIcon);
const NEW_PROJECT_LABELS = JSON.stringify(FLOW_SELECTORS.newProjectText);

// --- newProject: click the "New project" tile and wait for the prompt editor ---
const NEW_PROJECT_BODY = `
  if (document.querySelector('${SLATE}')) return { entered: true, already: true };
  var labels = ${NEW_PROJECT_LABELS};
  var btns = document.querySelectorAll('button');
  var target = null;
  for (var i = 0; i < btns.length; i++) {
    var txt = (btns[i].textContent || '').trim();
    var hit = false;
    for (var k = 0; k < labels.length; k++) { if (txt.indexOf(labels[k]) !== -1) { hit = true; break; } }
    if (hit) {
      var r = btns[i].getBoundingClientRect();
      if (r.width > 0 && r.height > 0) { target = btns[i]; break; }
    }
  }
  if (!target) throw new Error('ไม่พบปุ่ม New project (อาจยังไม่ได้ login หรือหน้ายังโหลดไม่เสร็จ)');
  target.click();
  for (var a = 0; a < 30; a++) {
    await wait(500);
    if (document.querySelector('${SLATE}')) return { entered: true };
  }
  throw new Error('กด New project แล้ว แต่ช่อง prompt ไม่ปรากฏ');
`;

// --- fillPrompt: write into the Slate editor via its React fiber instance ---
// Ported from desktop fillPrompt.ts (Strategy 1: Slate fiber, fallback: execCommand).
const FILL_PROMPT_BODY = `
  var promptText = String(args.prompt || '');
  if (!promptText) throw new Error('prompt ว่าง');

  function getVisibleSlate() {
    var eds = document.querySelectorAll('${SLATE}');
    for (var i = 0; i < eds.length; i++) {
      var el = eds[i];
      var rect = el.getBoundingClientRect();
      var st = window.getComputedStyle(el);
      if (rect.width > 0 && rect.height > 0 && st.visibility !== 'hidden' && st.display !== 'none') return el;
    }
    return null;
  }
  function wasInserted() {
    var exp = promptText.trim().slice(0, Math.min(24, promptText.trim().length));
    if (!exp) return true;
    var e2 = getVisibleSlate();
    return ((e2 && e2.textContent) || '').trim().indexOf(exp) !== -1;
  }

  var el = null;
  for (var w = 0; w < 15; w++) {
    el = getVisibleSlate();
    if (el && el.offsetParent) break;
    await wait(1000);
  }
  if (!el || !el.offsetParent) throw new Error('ไม่พบช่อง Prompt (Slate editor)');

  el.scrollIntoView({ behavior: 'instant', block: 'center' });
  await wait(200);
  el.focus();
  await wait(300);

  // Strategy 1: find the Slate editor instance in the React fiber tree
  var fiberKey = Object.keys(el).find(function (k) {
    return k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0;
  });
  if (fiberKey) {
    var slateEditor = null;
    var fiber = el[fiberKey];
    for (var i = 0; i < 50 && fiber; i++) {
      if (fiber.memoizedProps) {
        var vals = Object.values(fiber.memoizedProps);
        for (var j = 0; j < vals.length; j++) {
          var val = vals[j];
          if (val && typeof val === 'object' && !Array.isArray(val) &&
              typeof val.insertText === 'function' &&
              typeof val.deleteBackward === 'function' &&
              Array.isArray(val.children)) {
            slateEditor = val;
            break;
          }
        }
      }
      if (slateEditor) break;
      fiber = fiber.return;
    }
    if (slateEditor) {
      if (slateEditor.children && slateEditor.children.length > 0) {
        var lastBlockIdx = slateEditor.children.length - 1;
        var lastBlock = slateEditor.children[lastBlockIdx];
        var lastInlineIdx = ((lastBlock.children || []).length) - 1;
        var lastInline = (lastBlock.children || [])[Math.max(0, lastInlineIdx)];
        var endOffset = ((lastInline && lastInline.text) || '').length;
        slateEditor.selection = {
          anchor: { path: [0, 0], offset: 0 },
          focus: { path: [lastBlockIdx, Math.max(0, lastInlineIdx)], offset: endOffset }
        };
        if (endOffset > 0 || slateEditor.children.length > 1) slateEditor.deleteFragment();
      }
      slateEditor.insertText(promptText);
      await wait(500);
      if (!wasInserted()) throw new Error('Slate insertText ไม่ติด');
      return { type: 'slate-fiber' };
    }
  }

  // Fallback: execCommand insertText
  el.focus();
  el.click();
  await wait(300);
  var sel = window.getSelection();
  if (sel) {
    var range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  await wait(100);
  document.execCommand('insertText', false, promptText);
  await wait(500);
  if (!wasInserted()) throw new Error('กรอก Prompt ไม่สำเร็จ');
  return { type: 'slate-execCommand' };
`;

// --- submit: click the arrow_forward button via its React onClick handler ---
// Ported from desktop submitGenerate.ts (PRIMARY: reactProps/fiber onClick; the
// CDP-mouse fallback is desktop-only, native click() is the last resort here).
const SUBMIT_BODY = `
  function isDisabled(b) {
    return b.disabled || b.getAttribute('aria-disabled') === 'true' ||
      b.hasAttribute('data-disabled') || b.getAttribute('data-state') === 'disabled';
  }
  function findBtn() {
    var all = document.querySelectorAll('button');
    for (var i = 0; i < all.length; i++) {
      var b = all[i];
      if (b.closest('[role="menu"]') || b.closest('nav')) continue;
      var ic = b.querySelector('i');
      if (!ic) continue;
      var t = (ic.textContent || '').trim().toLowerCase();
      if (t.indexOf(${SUBMIT_ICON}) !== -1 && !isDisabled(b)) return b;
    }
    return null;
  }

  // Wait up to 30s for the submit button to be enabled
  var btn = null;
  for (var a = 0; a < 60; a++) {
    btn = findBtn();
    if (btn) { if (a === 0) await wait(1000); break; }
    await wait(500);
  }
  if (!btn) throw new Error('ไม่พบปุ่มสร้าง (' + ${SUBMIT_ICON} + ') หรือยัง disabled อยู่');

  var bt = (btn.textContent || '').trim().toLowerCase();
  if (bt.indexOf('create image') !== -1 || bt.indexOf('text to video') !== -1) {
    throw new Error('เจอปุ่มเปลี่ยนโหมด ไม่ใช่ปุ่มสร้าง');
  }

  var editorBefore = document.querySelector('${SLATE}');
  var lenBefore = ((editorBefore && editorBefore.textContent) || '').trim().length;

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

  var method = null;
  var propsKey = Object.keys(btn).find(function (k) { return k.indexOf('__reactProps$') === 0; });
  if (propsKey) {
    var props = btn[propsKey];
    if (props && typeof props.onClick === 'function') { props.onClick(fakeEvent); method = 'reactProps.onClick'; }
  }
  if (!method) {
    var fiberKey = Object.keys(btn).find(function (k) {
      return k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0;
    });
    if (fiberKey) {
      var fiber = btn[fiberKey];
      for (var i = 0; i < 30 && fiber; i++) {
        var p = fiber.memoizedProps || fiber.pendingProps;
        if (p && typeof p.onClick === 'function') { p.onClick(fakeEvent); method = 'fiber.onClick@' + i; break; }
        fiber = fiber.return;
      }
    }
  }
  if (!method) { btn.click(); method = 'native.click'; }

  await wait(2500);
  var editorAfter = document.querySelector('${SLATE}');
  var lenAfter = ((editorAfter && editorAfter.textContent) || '').trim().length;
  var clearedPrompt = lenBefore > 0 && lenAfter === 0;
  return { method: method, clearedPrompt: clearedPrompt, lenBefore: lenBefore, lenAfter: lenAfter };
`;

const IMAGE_DIALOG_HELPERS_BODY = `
  function isVisible(el){
    if (!el || !el.isConnected) return false;
    var r = el.getBoundingClientRect();
    var st = window.getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden';
  }
  function showRipple(el){
    if (!el || !el.getBoundingClientRect) return;
    var rect = el.getBoundingClientRect();
    var ripple = document.createElement('div');
    Object.assign(ripple.style, {
      position:'fixed', left:(rect.left+rect.width/2)+'px', top:(rect.top+rect.height/2)+'px',
      width:'0', height:'0', borderRadius:'50%', background:'rgba(255,0,0,0.4)',
      transform:'translate(-50%,-50%)', pointerEvents:'none', zIndex:'999999',
      transition:'all 0.6s ease-out'
    });
    document.body.appendChild(ripple);
    requestAnimationFrame(function(){ Object.assign(ripple.style, {width:'60px',height:'60px',opacity:'0'}); });
    setTimeout(function(){ try { ripple.remove(); } catch (e) {} }, 800);
  }
  async function openImageDialog(){
    for (var attempt = 0; attempt < 10; attempt++) {
      var triggers = Array.prototype.slice.call(document.querySelectorAll('button[aria-haspopup="dialog"], [aria-haspopup="dialog"]'));
      for (var i = 0; i < triggers.length; i++) {
        var btn = triggers[i];
        if (!isVisible(btn) && !btn.closest('[data-state="open"]')) continue;
        var txt = (btn.textContent || '').trim().toLowerCase();
        var icons = Array.prototype.slice.call(btn.querySelectorAll('i')).map(function(icon){ return (icon.textContent || '').trim().toLowerCase(); });
        if (icons.indexOf('add_2') !== -1 || txt === 'start' || txt === 'create' || txt === 'เริ่ม') {
          showRipple(btn);
          btn.click();
          await wait(1200);
          var dialog = getOpenDialog();
          if (dialog) return dialog;
        }
      }
      await wait(800);
    }
    throw new Error('หาปุ่ม Start/Create สำหรับแนบรูปไม่เจอ');
  }
  function getOpenDialog(){
    var dialogs = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"][data-state="open"]'));
    for (var i = 0; i < dialogs.length; i++) { if (isVisible(dialogs[i])) return dialogs[i]; }
    var popover = document.querySelector('[data-radix-popper-content-wrapper] [data-state="open"]');
    return isVisible(popover) ? popover : null;
  }
  async function handleAgreeDialog(){
    for (var i = 0; i < 4; i++) {
      var buttons = Array.prototype.slice.call(document.querySelectorAll('button'));
      for (var b = 0; b < buttons.length; b++) {
        var txt = (buttons[b].textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase();
        if ((txt === 'i agree' || txt === 'agree' || txt.indexOf('ยอมรับ') !== -1) && isVisible(buttons[b])) {
          showRipple(buttons[b]);
          buttons[b].click();
          await wait(800);
          return true;
        }
      }
      await wait(300);
    }
    return false;
  }
  function imageItems(scope){
    var root = scope || document;
    var indexed = Array.prototype.slice.call(root.querySelectorAll('[data-testid="virtuoso-item-list"] [data-index], [data-index]'))
      .filter(function(item){ return isVisible(item) && item.querySelector('img'); });
    if (indexed.length) return indexed;
    return Array.prototype.slice.call(root.querySelectorAll('[role="option"], [role="gridcell"], [role="button"]'))
      .filter(function(item){ return isVisible(item) && item.querySelector('img'); });
  }
  function readyImageItem(item){
    if (!item || !isVisible(item)) return false;
    var img = item.querySelector('img') || (item.tagName === 'IMG' ? item : null);
    if (!img || !isVisible(img)) return false;
    if (img.complete === false) return false;
    return (img.naturalWidth || 0) > 20 && (img.naturalHeight || 0) > 20;
  }
  function itemSignature(item){
    var img = item && (item.querySelector('img') || (item.tagName === 'IMG' ? item : null));
    if (!img) return '';
    return [img.currentSrc || img.src || img.getAttribute('src') || '', img.getAttribute('alt') || '', item.getAttribute('data-index') || ''].join('|');
  }
  function clickImageItem(item){
    var target = item.querySelector('[role="option"]') || item.querySelector('img') || item;
    target.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
    showRipple(target);
    target.click();
  }
  async function clickAddToPrompt(dialog){
    var scope = dialog && dialog.isConnected ? dialog : getOpenDialog();
    if (!scope) return false;
    var buttons = Array.prototype.slice.call(scope.querySelectorAll('button'));
    for (var i = 0; i < buttons.length; i++) {
      var txt = (buttons[i].textContent || '').replace(/\\s+/g, ' ').trim();
      if (/^(add to prompt|select|done|use image|เลือก|เพิ่ม)$/i.test(txt) && isVisible(buttons[i]) && !buttons[i].disabled) {
        showRipple(buttons[i]);
        buttons[i].click();
        await wait(700);
        return true;
      }
    }
    return false;
  }
  async function waitForDialogClosed(dialog, timeoutMs){
    var started = Date.now();
    while (Date.now() - started < (timeoutMs || 7000)) {
      await wait(400);
      if (!dialog || !dialog.isConnected || !isVisible(dialog) || !getOpenDialog()) return true;
    }
    return false;
  }
`;

const SELECT_RECENT_IMAGE_BODY = `
  ${IMAGE_DIALOG_HELPERS_BODY}
  var indexOffset = Math.max(0, Number(args.indexOffset || 0) || 0);
  var dialog = await openImageDialog();
  await handleAgreeDialog();
  dialog = getOpenDialog() || dialog;
  var scroller = dialog.querySelector('[data-testid="virtuoso-scroller"]') || document.querySelector('[data-testid="virtuoso-scroller"]');
  if (scroller) {
    for (var s = 0; s < 3; s++) { scroller.scrollTop = 0; await wait(200); }
  }
  await wait(1200);
  var picked = null;
  for (var attempt = 0; attempt < 12 && !picked; attempt++) {
    var items = imageItems(dialog)
      .filter(readyImageItem)
      .sort(function(a, b){
        var ai = parseInt(a.getAttribute('data-index') || '', 10);
        var bi = parseInt(b.getAttribute('data-index') || '', 10);
        var safeA = Number.isFinite(ai) ? ai : Number.MAX_SAFE_INTEGER;
        var safeB = Number.isFinite(bi) ? bi : Number.MAX_SAFE_INTEGER;
        return safeA - safeB || a.getBoundingClientRect().top - b.getBoundingClientRect().top;
      });
    picked = items[Math.min(indexOffset, Math.max(0, items.length - 1))] || null;
    if (!picked) await wait(500);
  }
  if (!picked) throw new Error('ไม่พบรูปในรายการล่าสุดสำหรับแนบ reference');
  var dataIndex = picked.getAttribute('data-index');
  clickImageItem(picked);
  await wait(1000);
  if (!(await waitForDialogClosed(dialog, 4500))) {
    await clickAddToPrompt(dialog);
    await waitForDialogClosed(dialog, 4500);
  }
  return { success: true, dataIndex: dataIndex };
`;

const UPLOAD_REFERENCE_IMAGE_BODY = `
  ${IMAGE_DIALOG_HELPERS_BODY}
  var dataUrl = String(args.dataUrl || '');
  var imageUrl = String(args.imageUrl || '');
  var fileName = String(args.fileName || 'kubdee-reference.png');
  function blobToDataUrl(blob){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onloadend = function(){ resolve(String(reader.result || '')); };
      reader.onerror = function(){ reject(new Error('อ่านรูปเป็น data URL ไม่สำเร็จ')); };
      reader.readAsDataURL(blob);
    });
  }
  async function resolveDataUrl(){
    if (dataUrl.indexOf('data:image/') === 0) return dataUrl;
    if (!imageUrl) throw new Error('ไม่มีรูป reference');
    var response = await fetch(imageUrl);
    if (!response.ok) throw new Error('โหลดรูป reference ไม่สำเร็จ HTTP ' + response.status);
    var blob = await response.blob();
    if (!blob || !blob.size) throw new Error('รูป reference ว่าง');
    return await blobToDataUrl(blob);
  }
  function dataUrlToFile(value, name){
    var comma = value.indexOf(',');
    if (comma === -1) throw new Error('data URL รูปไม่ถูกต้อง');
    var header = value.slice(0, comma);
    var payload = value.slice(comma + 1);
    var mime = (header.match(/^data:([^;]+)/) || [])[1] || 'image/png';
    var binary = header.indexOf(';base64') !== -1 ? atob(payload) : decodeURIComponent(payload);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    var ext = mime.indexOf('jpeg') !== -1 ? '.jpg' : mime.indexOf('webp') !== -1 ? '.webp' : '.png';
    var safeName = /\\.[a-z0-9]+$/i.test(name) ? name : name + ext;
    return new File([bytes], safeName, { type: mime });
  }
  function findUploadButton(dialog){
    var buttons = Array.prototype.slice.call(dialog.querySelectorAll('button, [role="button"]'));
    for (var i = 0; i < buttons.length; i++) {
      var txt = (buttons[i].textContent || '').replace(/\\s+/g, ' ').trim();
      var icon = buttons[i].querySelector('i');
      var iconText = icon ? (icon.textContent || '').trim().toLowerCase() : '';
      if ((/upload image|upload|อัปโหลดรูปภาพ|อัพโหลดรูปภาพ/i.test(txt) || iconText === 'upload') && isVisible(buttons[i])) {
        return buttons[i];
      }
    }
    return null;
  }
  var resolvedDataUrl = await resolveDataUrl();
  var dialog = await openImageDialog();
  await handleAgreeDialog();
  dialog = getOpenDialog() || dialog;
  var known = imageItems(dialog).filter(readyImageItem).map(itemSignature).filter(Boolean);
  var uploadButton = findUploadButton(dialog);
  if (uploadButton) {
    showRipple(uploadButton);
    uploadButton.click();
    await wait(600);
  }
  var input = null;
  for (var f = 0; f < 20 && !input; f++) {
    input = document.querySelector('input[type="file"]');
    if (!input) await wait(300);
  }
  if (!input) throw new Error('ไม่พบ input upload รูปใน Google Flow');
  var dt = new DataTransfer();
  dt.items.add(dataUrlToFile(resolvedDataUrl, fileName));
  input.files = dt.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  var picked = null;
  for (var attempt = 0; attempt < 90 && !picked; attempt++) {
    await wait(1000);
    var items = imageItems(getOpenDialog() || dialog).filter(readyImageItem);
    for (var i = 0; i < items.length; i++) {
      var sig = itemSignature(items[i]);
      if (sig && known.indexOf(sig) === -1) { picked = items[i]; break; }
    }
    if (!picked && attempt > 6 && items.length > 0) {
      items.sort(function(a, b){
        var ai = parseInt(a.getAttribute('data-index') || '', 10);
        var bi = parseInt(b.getAttribute('data-index') || '', 10);
        return (Number.isFinite(ai) ? ai : 999999) - (Number.isFinite(bi) ? bi : 999999);
      });
      picked = items[0];
    }
  }
  if (!picked) throw new Error('อัปโหลดรูปแล้วแต่ไม่พบ thumbnail พร้อมเลือก');
  var dataIndex = picked.getAttribute('data-index');
  clickImageItem(picked);
  await wait(1000);
  if (!(await waitForDialogClosed(dialog, 5000))) {
    await clickAddToPrompt(dialog);
    await waitForDialogClosed(dialog, 5000);
  }
  return { success: true, dataIndex: dataIndex };
`;

// --- downloadVideo: read the ready video through the page session and return it as data URL ---
const DOWNLOAD_IMAGES_BODY = `
  var n = Math.max(1, Number(args.count || 1) || 1);
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
    if (/avatar|profile|logo|icon|googleusercontent/i.test(src)) return false;
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
        if (!src || seen[src]) continue;
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

// --- downloadVideo: read the ready video through the page session and return it as data URL ---
const DOWNLOAD_VIDEO_BODY = `
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

const ACTION_BODIES: Record<FlowActionName, string> = {
  newProject: NEW_PROJECT_BODY,
  configurePopper: CONFIGURE_POPPER_BODY,
  selectRecentImage: SELECT_RECENT_IMAGE_BODY,
  uploadReferenceImage: UPLOAD_REFERENCE_IMAGE_BODY,
  fillPrompt: FILL_PROMPT_BODY,
  submit: SUBMIT_BODY,
  videoSnapshot: VIDEO_SNAPSHOT_BODY,
  videoResults: VIDEO_RESULTS_BODY,
  downloadImages: DOWNLOAD_IMAGES_BODY,
  downloadVideo: DOWNLOAD_VIDEO_BODY,
};

/**
 * The raw async-function body for an action (the `(args) => result` source).
 * Desktop can wrap this for `page.evaluate`; mobile uses `buildActionScript`.
 */
export function getActionBody(action: FlowActionName): string {
  return ACTION_BODIES[action];
}

/**
 * Build the injected-JS string for the mobile WebView. The body runs inside an
 * async IIFE; its return value (or thrown error) is posted back to RN tagged
 * with `id` as `{type:'flowResult', id, ok, result?, error?}`.
 */
export function buildActionScript(
  id: string,
  action: FlowActionName,
  args: Record<string, unknown> = {}
): string {
  const body = ACTION_BODIES[action];
  return `(function(){
  var __id = ${JSON.stringify(id)};
  var __args = ${JSON.stringify(args)};
  function __post(p){ try { window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: 'flowResult', id: __id }, p))); } catch (e) {} }
  function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  (async function(){
    try {
      var __r = await (async function(args){ ${body} })(__args);
      __post({ ok: true, result: __r });
    } catch (e) {
      __post({ ok: false, error: String((e && e.message) || e) });
    }
  })();
})();
true;`;
}

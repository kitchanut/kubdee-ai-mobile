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
  | 'deleteLatestProject'
  | 'prepareProjectUi'
  | 'configurePopper'
  | 'selectRecentImage'
  | 'uploadReferenceImage'
  | 'ensureVideoReferenceAttached'
  | 'fillPrompt'
  | 'submit'
  | 'reusePromptAndSubmit'
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
  function setStatus(message, level){
    try {
      if (typeof __flowLog === 'function') __flowLog(String(message || ''), level || 'info');
    } catch (e) {}
  }
  if (document.querySelector('${SLATE}')) {
    setStatus('อยู่ใน Google Flow project อยู่แล้ว ช่อง prompt พร้อมใช้งาน', 'success');
    return { entered: true, already: true };
  }
  setStatus('กำลังหา New project ใน Google Flow...', 'info');
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
  setStatus('พบปุ่ม New project แล้ว กำลังเปิดโปรเจกต์ใหม่...', 'action');
  target.click();
  for (var a = 0; a < 30; a++) {
    await wait(500);
    if (document.querySelector('${SLATE}')) {
      setStatus('เข้า Google Flow project แล้ว ช่อง prompt พร้อมใช้งาน', 'success');
      return { entered: true };
    }
    if (a === 3 || a === 10 || a === 20) {
      setStatus('กด New project แล้ว กำลังรอช่อง prompt ปรากฏ...', 'info');
    }
  }
  throw new Error('กด New project แล้ว แต่ช่อง prompt ไม่ปรากฏ');
`;

// --- deleteLatestProject: delete the top project card on the Flow home page. ---
const DELETE_LATEST_PROJECT_BODY = `
  function setStatus(message, level){
    try {
      if (typeof __flowLog === 'function') __flowLog(String(message || ''), level || 'info');
    } catch (e) {}
  }
  function isVisible(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 2 || rect.height <= 2) return false;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
  }
  function dispatchHover(el) {
    try {
      ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'mousemove'].forEach(function(type) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      });
    } catch (e) {}
  }
  function findScrollContainer() {
    var candidates = Array.prototype.slice.call(document.querySelectorAll('*'))
      .filter(function(el) {
        var style = window.getComputedStyle(el);
        return style.overflowY === 'auto' && el.scrollHeight > el.clientHeight + 100;
      })
      .sort(function(a, b) { return (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight); });
    return candidates[0] || document.scrollingElement || document.documentElement;
  }
  function findCard(button) {
    var node = button;
    for (var depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
      var text = (node.innerText || node.textContent || '').trim();
      var rect = node.getBoundingClientRect();
      var hasActions =
        (text.indexOf('Delete project') !== -1 || text.indexOf('ลบโปรเจกต์') !== -1) &&
        (text.indexOf('Edit project') !== -1 || text.indexOf('แก้ไขโปรเจกต์') !== -1);
      if (hasActions && rect.width >= 120 && rect.height >= 80) return node;
    }
    return null;
  }
  function collectProjects() {
    return Array.prototype.slice.call(document.querySelectorAll('button, [role="button"]'))
      .filter(function(button) {
        var text = (button.innerText || button.textContent || '').trim();
        return text.indexOf('Delete project') !== -1 || text.indexOf('ลบโปรเจกต์') !== -1;
      })
      .map(function(button) {
        var card = findCard(button);
        return card ? { button: button, card: card, projectText: (card.innerText || card.textContent || '').trim() } : null;
      })
      .filter(Boolean);
  }
  function projectCount() {
    return collectProjects().filter(function(item) { return isVisible(item.card); }).length;
  }
  function hasDeleteDialog() {
    var text = document.body ? (document.body.innerText || document.body.textContent || '') : '';
    return text.indexOf('Are you sure you want to delete this project?') !== -1 ||
      text.indexOf('Delete Project') !== -1 ||
      text.indexOf('ยืนยัน') !== -1 && text.indexOf('ลบ') !== -1;
  }
  function findConfirmButton() {
    var dialogs = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog, div'))
      .filter(function(el) { return isVisible(el); })
      .filter(function(el) {
        var text = (el.innerText || el.textContent || '').trim();
        return text.indexOf('Are you sure you want to delete this project?') !== -1 ||
          text.indexOf('Delete Project') !== -1 ||
          text.indexOf('ยืนยัน') !== -1 && text.indexOf('ลบ') !== -1;
      });
    for (var i = 0; i < dialogs.length; i += 1) {
      var buttons = Array.prototype.slice.call(dialogs[i].querySelectorAll('button, [role="button"]'));
      for (var j = 0; j < buttons.length; j += 1) {
        var text = (buttons[j].innerText || buttons[j].textContent || '').trim();
        if (isVisible(buttons[j]) && (text === 'Delete Project' || text.indexOf('Delete Project') !== -1 || text.indexOf('ลบ') !== -1)) {
          return buttons[j];
        }
      }
    }
    return null;
  }

  setStatus('ลบโปรเจกต์ที่สร้างต่อสินค้า...', 'action');
  var scroller = findScrollContainer();
  if (scroller) {
    scroller.scrollTop = 0;
    await wait(350);
  }
  var projects = collectProjects();
  if (!projects.length && scroller) {
    scroller.scrollTop = 0;
    await wait(650);
    projects = collectProjects();
  }
  if (!projects.length) {
    setStatus('ไม่พบโปรเจกต์ที่สร้างต่อสินค้าให้ลบ', 'info');
    return { success: true, skipped: true, reason: 'no_project_delete_buttons' };
  }

  projects.sort(function(a, b) {
    var ar = a.card.getBoundingClientRect();
    var br = b.card.getBoundingClientRect();
    return ar.top === br.top ? ar.left - br.left : ar.top - br.top;
  });
  var target = projects[0];
  var beforeCount = projects.length;
  var targetText = target.projectText || '';
  target.card.scrollIntoView({ block: 'center', inline: 'center' });
  await wait(350);
  dispatchHover(target.card);
  await wait(250);

  setStatus('พบโปรเจกต์ล่าสุดแล้ว กำลังกด Delete project...', 'action');
  target.button.click();
  await wait(900);

  var confirmButton = findConfirmButton();
  if (!confirmButton) {
    throw new Error('ไม่พบปุ่มยืนยัน Delete Project');
  }
  confirmButton.click();

  for (var attempt = 0; attempt < 24; attempt += 1) {
    await wait(500);
    var bodyText = document.body ? (document.body.innerText || document.body.textContent || '') : '';
    var deletedToast = bodyText.indexOf('Project deleted') !== -1 || bodyText.indexOf('ลบโปรเจกต์แล้ว') !== -1;
    var stillVisible = targetText ? collectProjects().some(function(item) { return item.projectText === targetText && isVisible(item.card); }) : false;
    if (!hasDeleteDialog() && (deletedToast || projectCount() < beforeCount || !stillVisible)) {
      setStatus('ลบโปรเจกต์ที่สร้างต่อสินค้าแล้ว', 'success');
      return { success: true };
    }
  }

  throw new Error('กดยืนยันลบแล้ว แต่ยังยืนยันผลลบโปรเจกต์ไม่ได้');
`;

// --- prepareProjectUi: close Google Flow Agent panel/toggle like desktop/extension. ---
const PREPARE_PROJECT_UI_BODY = `
  function setStatus(message, level){
    try {
      if (typeof __flowLog === 'function') __flowLog(String(message || ''), level || 'info');
    } catch (e) {}
  }
  function waitLocal(ms){ return new Promise(function(resolve){ setTimeout(resolve, ms); }); }
  function isFlowProjectPage(){
    var href = window.location.href || '';
    return href.indexOf('/project/') !== -1 && href.indexOf('/edit/') === -1;
  }
  function isVisible(el){
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    var style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
  }
  function clickVisible(el){
    if (!el) return;
    try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch (e) {}
    el.click();
  }
  function hasAgentPanelText(el){
    var node = el;
    for (var depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      var text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
      if (
        text.indexOf('Untitled session') !== -1 ||
        text.indexOf('What would you like to do?') !== -1 ||
        text.indexOf('Hi ') !== -1 ||
        (text.indexOf('History') !== -1 && text.indexOf('New session') !== -1)
      ) {
        return true;
      }
    }
    return false;
  }
  function findAgentPanelCloseButton(){
    var buttons = Array.prototype.slice.call(document.querySelectorAll('button, [role="button"]')).filter(isVisible);
    for (var i = 0; i < buttons.length; i += 1) {
      var btn = buttons[i];
      var iconText = Array.prototype.slice.call(btn.querySelectorAll('i'))
        .map(function(icon){ return (icon.textContent || '').trim().toLowerCase(); })
        .filter(Boolean)[0] || '';
      var text = (btn.textContent || '').trim().toLowerCase();
      var label = (btn.getAttribute('aria-label') || '').trim().toLowerCase();
      var looksLikeClose =
        iconText === 'close' ||
        text === 'close' ||
        text === 'x' ||
        text === '×' ||
        label === 'close' ||
        label.indexOf('close') !== -1 ||
        label.indexOf('dismiss') !== -1 ||
        label.indexOf('ปิด') !== -1;
      if (looksLikeClose && hasAgentPanelText(btn)) return btn;
    }
    return null;
  }
  async function closeAgentPanelIfOpen(){
    var clicked = false;
    for (var i = 0; i < 3; i += 1) {
      var closeBtn = findAgentPanelCloseButton();
      if (!closeBtn) {
        if (clicked) setStatus('ปิด Agent panel สำเร็จ', 'success');
        return { success: true, closed: clicked };
      }
      setStatus('ปิด Agent panel ที่บัง prompt toolbar...', 'info');
      clickVisible(closeBtn);
      clicked = true;
      await waitLocal(600);
    }
    if (findAgentPanelCloseButton()) {
      setStatus('ปิด Agent panel ไม่สำเร็จหลังลอง 3 ครั้ง', 'warning');
      return { success: false, closed: false, error: 'agent_panel_close_failed' };
    }
    setStatus('ปิด Agent panel สำเร็จ', 'success');
    return { success: true, closed: true };
  }
  function findAgentButton(){
    var buttons = Array.prototype.slice.call(document.querySelectorAll('button[aria-pressed]'));
    for (var i = 0; i < buttons.length; i += 1) {
      var btn = buttons[i];
      if (!isVisible(btn)) continue;
      if (btn.closest('[role="menu"]') || btn.closest('[role="dialog"]')) continue;
      var span = btn.querySelector('span.content');
      if (span && (span.textContent || '').trim() === 'Agent') return btn;
      if ((btn.textContent || '').trim() === 'Agent') return btn;
    }
    return null;
  }
  async function ensureAgentOff(){
    var btn = findAgentButton();
    if (!btn) return { success: true, changed: false };
    var isOn = btn.getAttribute('aria-pressed') === 'true';
    if (!isOn) return { success: true, changed: false };
    setStatus('ปิด Agent toggle เพื่อไม่ให้บังการตั้งค่า Flow...', 'info');
    clickVisible(btn);
    await waitLocal(800);
    var updated = findAgentButton();
    if (updated && updated.getAttribute('aria-pressed') === 'true') {
      setStatus('ปิด Agent toggle ไม่สำเร็จ', 'warning');
      return { success: false, changed: false, error: 'agent_toggle_still_on' };
    }
    setStatus('ปิด Agent toggle สำเร็จ', 'success');
    return { success: true, changed: true };
  }

  setStatus('เตรียมหน้า Google Flow project...', 'info');
  for (var waitAttempt = 0; waitAttempt < 10; waitAttempt += 1) {
    if (isFlowProjectPage() || findAgentPanelCloseButton() || findAgentButton()) break;
    await waitLocal(500);
  }
  var hasAgentUi = !!findAgentPanelCloseButton() || !!findAgentButton();
  if (!hasAgentUi && !isFlowProjectPage()) {
    setStatus('ไม่พบ Agent UI ที่ต้องจัดการ ข้ามการเตรียมหน้า Flow', 'info');
    return { success: true, skipped: true, reason: 'no_agent_ui_detected' };
  }
  var closeResult = await closeAgentPanelIfOpen();
  var agentResult = await ensureAgentOff();
  return {
    success: closeResult.success && agentResult.success,
    closedPanel: closeResult.closed,
    disabledAgent: agentResult.changed,
    closeError: closeResult.error,
    agentError: agentResult.error
  };
`;

// --- fillPrompt: write into the Slate editor via its React fiber instance ---
// Ported from desktop fillPrompt.ts (Strategy 1: Slate fiber, fallback: execCommand).
const FILL_PROMPT_BODY = `
  var promptText = String(args.prompt || '');
  if (!promptText) throw new Error('prompt ว่าง');
  function setStatus(message, level){
    try {
      if (typeof __flowLog === 'function') __flowLog(String(message || ''), level || 'info');
    } catch (e) {}
  }
  setStatus('กำลังกรอก prompt เข้า Google Flow...', 'action');

  function isVisiblePromptEl(el) {
    if (!el || !el.isConnected) return false;
    var rect = el.getBoundingClientRect();
    var st = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
  }
  function sortBottomMost(a, b) {
    var ar = a.getBoundingClientRect();
    var br = b.getBoundingClientRect();
    return (br.bottom - ar.bottom) || (br.left - ar.left);
  }
  function isLikelyComposer(el) {
    var rect = el.getBoundingClientRect();
    var expandedPrompt = rect.height > 90 && rect.bottom > (window.innerHeight * 0.55);
    return rect.top > (window.innerHeight * 0.5) || expandedPrompt;
  }
  function findSubmitButton(includeDisabled) {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('button'));
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      if (btn.closest('[role="menu"]') || btn.closest('nav')) continue;
      var icon = btn.querySelector('i');
      var iconText = icon ? (icon.textContent || '').trim().toLowerCase() : '';
      var buttonText = (btn.textContent || '').trim().toLowerCase();
      var disabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true' ||
        btn.hasAttribute('data-disabled') || btn.getAttribute('data-state') === 'disabled';
      if ((iconText.indexOf(${SUBMIT_ICON}) !== -1 || buttonText.indexOf(${SUBMIT_ICON}) !== -1) &&
          (includeDisabled || !disabled)) return btn;
    }
    return null;
  }
  function getComposerRoot() {
    var btn = findSubmitButton(true);
    if (!btn) return null;
    var node = btn.parentElement;
    for (var depth = 0; depth < 10 && node; depth++) {
      var rect = node.getBoundingClientRect();
      var hasPrompt = node.querySelector('${SLATE}, [contenteditable="true"][role="textbox"], [contenteditable="true"], textarea, input[type="text"]');
      if (hasPrompt && rect.width > 180 && rect.height > 60 && rect.bottom > (window.innerHeight * 0.55)) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }
  function sortBySubmitProximity(items) {
    var btn = findSubmitButton(true);
    if (!btn) {
      items.sort(sortBottomMost);
      return items;
    }
    var br = btn.getBoundingClientRect();
    items.sort(function(a, b) {
      var ar = a.getBoundingClientRect();
      var cr = b.getBoundingClientRect();
      var aGap = Math.abs(ar.bottom - br.top) + Math.max(0, br.left - ar.right) * 0.15;
      var bGap = Math.abs(cr.bottom - br.top) + Math.max(0, br.left - cr.right) * 0.15;
      return (aGap - bGap) || (cr.bottom - ar.bottom);
    });
    return items;
  }
  function getVisibleSlate() {
    var eds = Array.prototype.slice.call(document.querySelectorAll('${SLATE}, [contenteditable="true"][role="textbox"], [contenteditable="true"]'));
    var root = getComposerRoot();
    var visible = [];
    var rootVisible = [];
    for (var i = 0; i < eds.length; i++) {
      var el = eds[i];
      if (!isVisiblePromptEl(el)) continue;
      if (root && root.contains(el)) rootVisible.push(el);
      else if (isLikelyComposer(el)) visible.push(el);
    }
    if (rootVisible.length) visible = rootVisible;
    sortBySubmitProximity(visible);
    return visible[0] || null;
  }
  function getVisibleTextarea() {
    var root = getComposerRoot();
    var allFields = Array.prototype.slice.call(document.querySelectorAll('textarea, input[type="text"]'));
    var rootFields = root ? allFields.filter(function(field){
      return root.contains(field) && isVisiblePromptEl(field) && !field.disabled && !field.readOnly;
    }) : [];
    var fields = rootFields.length ? rootFields : allFields.filter(function(field){
      return isVisiblePromptEl(field) && isLikelyComposer(field) && !field.disabled && !field.readOnly;
    });
    sortBySubmitProximity(fields);
    return fields[0] || null;
  }
  function normalizePromptText(value) {
    return String(value || '').replace(/\\s+/g, ' ').trim();
  }
  function getCurrentPromptText() {
    var f2 = getVisibleTextarea();
    if (f2 && f2.value) return f2.value;
    var e2 = getVisibleSlate();
    return (e2 && e2.textContent) || '';
  }
  function promptLooksInserted(currentValue) {
    var expected = normalizePromptText(promptText);
    var current = normalizePromptText(currentValue);
    if (!expected) return true;
    if (!current) return false;

    var head = expected.slice(0, Math.min(32, expected.length));
    var tail = expected.length > 72 ? expected.slice(-32) : '';
    var minLen = Math.min(expected.length, Math.max(12, Math.floor(expected.length * 0.88)));

    if (current.indexOf(head) === -1) return false;
    if (tail && current.indexOf(tail) === -1 && current.length < Math.floor(expected.length * 0.95)) return false;
    return current.length >= minLen;
  }
  function buildFillResult(type) {
    return {
      type: type,
      expectedLength: normalizePromptText(promptText).length,
      actualLength: normalizePromptText(getCurrentPromptText()).length
    };
  }
  function wasInserted() {
    return promptLooksInserted(getCurrentPromptText());
  }
  function assertInserted(message) {
    if (wasInserted()) return;
    var detail = buildFillResult('verify');
    throw new Error(message + ' (' + detail.actualLength + '/' + detail.expectedLength + ' ตัวอักษร)');
  }
  function hasEnabledSubmitButton() {
    return !!findSubmitButton(false);
  }
  function fillTextField(field) {
    field.scrollIntoView({ behavior: 'instant', block: 'center' });
    field.focus();
    field.click();
    var setter = Object.getOwnPropertyDescriptor(field.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype, 'value');
    if (setter && setter.set) setter.set.call(field, promptText);
    else field.value = promptText;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function findSlateEditorIn(value, seen, depth) {
    if (!value || typeof value !== 'object' || depth > 5) return null;
    if (seen.indexOf(value) !== -1) return null;
    seen.push(value);
    if (!Array.isArray(value) &&
        typeof value.insertText === 'function' &&
        typeof value.deleteBackward === 'function' &&
        Array.isArray(value.children)) {
      return value;
    }
    var vals = [];
    try { vals = Object.values(value); } catch (e) { vals = []; }
    for (var i = 0; i < vals.length; i++) {
      var found = findSlateEditorIn(vals[i], seen, depth + 1);
      if (found) return found;
    }
    return null;
  }

  var preferredField = null;
  for (var pfw = 0; pfw < 6; pfw++) {
    preferredField = getVisibleTextarea();
    if (preferredField && preferredField.offsetParent) break;
    await wait(300);
  }
  if (preferredField && preferredField.offsetParent) {
    fillTextField(preferredField);
    await wait(500);
    assertInserted('กรอก Prompt ไม่ครบ');
    setStatus('กรอก prompt สำเร็จด้วยช่อง text field', 'success');
    return buildFillResult('textarea-preferred');
  }

  var el = null;
  for (var w = 0; w < 15; w++) {
    el = getVisibleSlate();
    if (el && el.offsetParent) break;
    if (w === 0 || w === 5 || w === 10) setStatus('กำลังรอช่อง prompt ของ Google Flow พร้อม...', 'info');
    await wait(1000);
  }
  if (!el || !el.offsetParent) {
    var field = null;
    for (var fw = 0; fw < 8; fw++) {
      field = getVisibleTextarea();
      if (field && field.offsetParent) break;
      await wait(500);
    }
    if (!field || !field.offsetParent) throw new Error('ไม่พบช่อง Prompt (Slate editor)');
    fillTextField(field);
    await wait(500);
    assertInserted('กรอก Prompt ไม่ครบ');
    setStatus('กรอก prompt สำเร็จด้วย fallback text field', 'success');
    return buildFillResult('textarea');
  }

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
      assertInserted('Slate insertText กรอก Prompt ไม่ครบ');
      setStatus('กรอก prompt สำเร็จด้วย Slate editor', 'success');
      return buildFillResult('slate-fiber');
    }
    var deepFiber = el[fiberKey];
    for (var d = 0; d < 50 && deepFiber; d++) {
      slateEditor = findSlateEditorIn(deepFiber.memoizedProps, [], 0) ||
        findSlateEditorIn(deepFiber.pendingProps, [], 0) ||
        findSlateEditorIn(deepFiber.memoizedState, [], 0) ||
        findSlateEditorIn(deepFiber.stateNode, [], 0);
      if (slateEditor) break;
      deepFiber = deepFiber.return;
    }
    if (slateEditor) {
      if (slateEditor.children && slateEditor.children.length > 0) {
        var deepLastBlockIdx = slateEditor.children.length - 1;
        var deepLastBlock = slateEditor.children[deepLastBlockIdx];
        var deepLastInlineIdx = ((deepLastBlock.children || []).length) - 1;
        var deepLastInline = (deepLastBlock.children || [])[Math.max(0, deepLastInlineIdx)];
        var deepEndOffset = ((deepLastInline && deepLastInline.text) || '').length;
        slateEditor.selection = {
          anchor: { path: [0, 0], offset: 0 },
          focus: { path: [deepLastBlockIdx, Math.max(0, deepLastInlineIdx)], offset: deepEndOffset }
        };
        if (deepEndOffset > 0 || slateEditor.children.length > 1) slateEditor.deleteFragment();
      }
      slateEditor.insertText(promptText);
      await wait(500);
      assertInserted('Slate deep insertText กรอก Prompt ไม่ครบ');
      setStatus('กรอก prompt สำเร็จด้วย Slate editor deep fallback', 'success');
      return buildFillResult('slate-fiber-deep');
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
  try {
    el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: promptText }));
  } catch (e) {}
  document.execCommand('insertText', false, promptText);
  await wait(500);
  if (!wasInserted()) {
    try {
      el.textContent = promptText;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: promptText }));
    } catch (e) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await wait(500);
  }
  assertInserted('กรอก Prompt ไม่ครบ');
  setStatus('กรอก prompt สำเร็จด้วย execCommand fallback', 'success');
  return buildFillResult('slate-execCommand');
`;

// --- submit: click the arrow_forward button via its React onClick handler ---
// Ported from desktop submitGenerate.ts (PRIMARY: reactProps/fiber onClick; the
// CDP-mouse fallback is desktop-only, native click() is the last resort here).
const SUBMIT_BODY = `
  function setStatus(message, level){
    try {
      if (typeof __flowLog === 'function') __flowLog(String(message || ''), level || 'info');
    } catch (e) {}
  }
  setStatus('กำลังหาปุ่มสร้างของ Google Flow...', 'info');
  function isVisiblePromptEl(el) {
    if (!el || !el.isConnected) return false;
    var rect = el.getBoundingClientRect();
    var st = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
  }
  function sortBottomMost(a, b) {
    var ar = a.getBoundingClientRect();
    var br = b.getBoundingClientRect();
    return (br.bottom - ar.bottom) || (br.left - ar.left);
  }
  function isLikelyComposer(el) {
    var rect = el.getBoundingClientRect();
    var expandedPrompt = rect.height > 90 && rect.bottom > (window.innerHeight * 0.55);
    return rect.top > (window.innerHeight * 0.5) || expandedPrompt;
  }
  function findSubmitButtonAny() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('button'));
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      if (btn.closest('[role="menu"]') || btn.closest('nav')) continue;
      var icon = btn.querySelector('i');
      var iconText = icon ? (icon.textContent || '').trim().toLowerCase() : '';
      var buttonText = (btn.textContent || '').trim().toLowerCase();
      if (iconText.indexOf(${SUBMIT_ICON}) !== -1 || buttonText.indexOf(${SUBMIT_ICON}) !== -1) return btn;
    }
    return null;
  }
  function getComposerRoot() {
    var btn = findSubmitButtonAny();
    if (!btn) return null;
    var node = btn.parentElement;
    for (var depth = 0; depth < 10 && node; depth++) {
      var rect = node.getBoundingClientRect();
      var hasPrompt = node.querySelector('${SLATE}, [contenteditable="true"][role="textbox"], [contenteditable="true"], textarea, input[type="text"]');
      if (hasPrompt && rect.width > 180 && rect.height > 60 && rect.bottom > (window.innerHeight * 0.55)) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }
  function sortBySubmitProximity(items) {
    var btn = findSubmitButtonAny();
    if (!btn) {
      items.sort(sortBottomMost);
      return items;
    }
    var br = btn.getBoundingClientRect();
    items.sort(function(a, b) {
      var ar = a.getBoundingClientRect();
      var cr = b.getBoundingClientRect();
      var aGap = Math.abs(ar.bottom - br.top) + Math.max(0, br.left - ar.right) * 0.15;
      var bGap = Math.abs(cr.bottom - br.top) + Math.max(0, br.left - cr.right) * 0.15;
      return (aGap - bGap) || (cr.bottom - ar.bottom);
    });
    return items;
  }
  function getPromptElement() {
    var root = getComposerRoot();
    var allFields = Array.prototype.slice.call(document.querySelectorAll('textarea, input[type="text"]'));
    var rootFields = root ? allFields.filter(function(field){
      return root.contains(field) && isVisiblePromptEl(field) && !field.disabled && !field.readOnly;
    }) : [];
    var fields = rootFields.length ? rootFields : allFields.filter(function(field){
      return isVisiblePromptEl(field) && isLikelyComposer(field) && !field.disabled && !field.readOnly;
    });
    sortBySubmitProximity(fields);
    if (fields[0]) return fields[0];
    var allEditors = Array.prototype.slice.call(document.querySelectorAll('${SLATE}, [contenteditable="true"][role="textbox"], [contenteditable="true"]'));
    var rootEditors = root ? allEditors.filter(function(editor){
      return root.contains(editor) && isVisiblePromptEl(editor);
    }) : [];
    var editors = rootEditors.length ? rootEditors : allEditors.filter(function(editor){
      return isVisiblePromptEl(editor) && isLikelyComposer(editor);
    });
    sortBySubmitProximity(editors);
    return editors[0] || null;
  }
  function getPromptText() {
    var el = getPromptElement();
    if (!el) return '';
    return ((el.value || el.textContent || '') + '').trim();
  }
  function isDisabled(b) {
    return b.disabled || b.getAttribute('aria-disabled') === 'true' ||
      b.hasAttribute('data-disabled') || b.getAttribute('data-state') === 'disabled';
  }
  function hasSubmitIcon(btn) {
    var icon = btn.querySelector('i');
    var iconText = icon ? (icon.textContent || '').trim().toLowerCase() : '';
    var buttonText = (btn.textContent || '').trim().toLowerCase();
    return iconText.indexOf(${SUBMIT_ICON}) !== -1 || buttonText.indexOf(${SUBMIT_ICON}) !== -1;
  }
  function submitCandidates() {
    var all = document.querySelectorAll('button');
    var candidates = [];
    for (var i = 0; i < all.length; i++) {
      var b = all[i];
      if (b.closest('[role="menu"]') || b.closest('nav')) continue;
      var rect = b.getBoundingClientRect();
      var st = window.getComputedStyle(b);
      if (rect.width <= 0 || rect.height <= 0 || st.display === 'none' || st.visibility === 'hidden') continue;
      if (!hasSubmitIcon(b)) continue;
      candidates.push(b);
    }
    candidates.sort(function(a, b) {
      var ar = a.getBoundingClientRect();
      var br = b.getBoundingClientRect();
      return (br.bottom - ar.bottom) || (br.right - ar.right);
    });
    return candidates;
  }
  function findBtn(includeDisabled) {
    var candidates = submitCandidates();
    var preferred = candidates[0] || null;
    if (includeDisabled) return preferred;
    return preferred && !isDisabled(preferred) ? preferred : null;
  }

  // Wait up to 30s for the submit button to be enabled
  var btn = null;
  for (var a = 0; a < 60; a++) {
    btn = findBtn(false);
    if (btn) { if (a === 0) await wait(1000); break; }
    if (a === 0 || a === 10 || a === 30) setStatus('ยังไม่พบปุ่มสร้างที่พร้อมกด กำลังรอ...', 'info');
    await wait(500);
  }
  if (!btn) {
    var disabledBtn = findBtn(true);
    if (disabledBtn && isDisabled(disabledBtn)) {
      throw new Error('ปุ่มสร้างยัง disabled อยู่หลังกรอก Prompt');
    }
    throw new Error('ไม่พบปุ่มสร้าง (' + ${SUBMIT_ICON} + ')');
  }

  var bt = (btn.textContent || '').trim().toLowerCase();
  if (bt.indexOf('create image') !== -1 || bt.indexOf('text to video') !== -1) {
    throw new Error('เจอปุ่มเปลี่ยนโหมด ไม่ใช่ปุ่มสร้าง');
  }

  var lenBefore = getPromptText().length;
  if (lenBefore <= 0) throw new Error('ยังไม่ได้กรอก Prompt ก่อนกดสร้าง');
  setStatus('พบปุ่มสร้างแล้ว กำลังกดส่ง prompt...', 'action');

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
  var lenAfter = getPromptText().length;
  var clearedPrompt = lenBefore > 0 && lenAfter === 0;
  if (!clearedPrompt && lenAfter > 0) {
    setStatus('prompt ยังไม่ถูก clear หลัง submit กำลังลองกด Clear prompt...', 'info');
    var clearBtn = null;
    var clearButtons = Array.prototype.slice.call(document.querySelectorAll('button'));
    for (var cb = 0; cb < clearButtons.length; cb++) {
      var clearCandidate = clearButtons[cb];
      if (clearCandidate.closest('[role="menu"]') || clearCandidate.closest('nav')) continue;
      var clearSpan = clearCandidate.querySelector('span');
      var clearIcon = clearCandidate.querySelector('i');
      var spanText = ((clearSpan && clearSpan.textContent) || '').trim().toLowerCase();
      var iconText = ((clearIcon && clearIcon.textContent) || '').trim().toLowerCase();
      var buttonText = (clearCandidate.textContent || '').trim().toLowerCase();
      var isClearPrompt =
        iconText === 'close' &&
        (spanText.indexOf('clear prompt') !== -1 ||
          buttonText.indexOf('clear prompt') !== -1 ||
          buttonText.indexOf('ล้าง prompt') !== -1 ||
          buttonText.indexOf('ล้างพรอมป์') !== -1);
      if (isClearPrompt && !isDisabled(clearCandidate)) {
        clearBtn = clearCandidate;
        break;
      }
    }
    if (clearBtn) {
      await wait(3000);
      clearBtn.click();
      await wait(500);
      lenAfter = getPromptText().length;
      clearedPrompt = lenAfter === 0;
      setStatus(clearedPrompt ? 'Clear prompt หลัง submit สำเร็จ' : 'กด Clear prompt แล้ว แต่ยังมีข้อความค้างอยู่', clearedPrompt ? 'success' : 'warning');
    }
  }
  setStatus('กดปุ่มสร้างแล้ว (' + method + ')', 'success');
  return { method: method, clearedPrompt: clearedPrompt, lenBefore: lenBefore, lenAfter: lenAfter };
`;

const REUSE_PROMPT_AND_SUBMIT_BODY = `
  function setStatus(message, level){
    try {
      if (typeof __flowLog === 'function') __flowLog(String(message || ''), level || 'info');
    } catch (e) {}
  }
  function waitLocal(ms){ return new Promise(function(resolve){ setTimeout(resolve, ms); }); }
  function isVisible(el){
    if (!el || !el.isConnected) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return false;
    var style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
  }
  function isDisabled(btn){
    return btn.disabled ||
      btn.getAttribute('aria-disabled') === 'true' ||
      btn.hasAttribute('data-disabled') ||
      btn.getAttribute('data-state') === 'disabled';
  }
  function clickReactFirst(btn){
    if (!btn) return { ok: false, method: 'none' };
    var rect = btn.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var fakeEvent = {
      type: 'click', target: btn, currentTarget: btn,
      nativeEvent: { type: 'click', isTrusted: true, button: 0, buttons: 1, clientX: cx, clientY: cy },
      preventDefault: function(){}, stopPropagation: function(){}, stopImmediatePropagation: function(){},
      isDefaultPrevented: function(){ return false; }, isPropagationStopped: function(){ return false; },
      persist: function(){}, bubbles: true, cancelable: true, button: 0, buttons: 1,
      clientX: cx, clientY: cy, isTrusted: true
    };
    var propsKey = Object.keys(btn).find(function(k){ return k.indexOf('__reactProps$') === 0; });
    if (propsKey) {
      var props = btn[propsKey];
      if (props && typeof props.onClick === 'function') {
        props.onClick(fakeEvent);
        return { ok: true, method: 'reactProps.onClick' };
      }
    }
    var fiberKey = Object.keys(btn).find(function(k){
      return k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0;
    });
    if (fiberKey) {
      var fiber = btn[fiberKey];
      for (var i = 0; i < 30 && fiber; i++) {
        var p = fiber.memoizedProps || fiber.pendingProps;
        if (p && typeof p.onClick === 'function') {
          p.onClick(fakeEvent);
          return { ok: true, method: 'fiber.onClick@' + i };
        }
        fiber = fiber.return;
      }
    }
    btn.click();
    return { ok: true, method: 'native.click' };
  }
  function findReuseButton(){
    var itemList = document.querySelector('[data-testid="virtuoso-item-list"]');
    var scopes = [];
    if (itemList) {
      for (var idx = 0; idx < 6; idx++) {
        var row = itemList.querySelector('[data-index="' + idx + '"]');
        if (row) scopes.push(row);
      }
    }
    for (var s = 0; s < scopes.length; s++) {
      var buttons = Array.prototype.slice.call(scopes[s].querySelectorAll('button, [role="button"]'));
      for (var b = 0; b < buttons.length; b++) {
        var button = buttons[b];
        if (!isVisible(button) || isDisabled(button) || button.closest('[role="menu"]') || button.closest('nav')) continue;
        var textParts = [
          button.textContent || '',
          button.getAttribute('aria-label') || '',
          button.getAttribute('title') || '',
        ].join(' ').toLowerCase();
        var icons = Array.prototype.slice.call(button.querySelectorAll('i, span'));
        var iconHit = icons.some(function(icon){
          var iconText = (icon.textContent || '').trim().toLowerCase();
          return iconText === 'undo' || iconText === 'redo' || iconText === 'wrap_text';
        });
        var textHit =
          textParts.indexOf('reuse prompt') !== -1 ||
          textParts.indexOf('reuse') !== -1 ||
          textParts.indexOf('ใช้พรอมต์ซ้ำ') !== -1 ||
          textParts.indexOf('ใช้ prompt ซ้ำ') !== -1;
        if (iconHit || textHit) return button;
      }
    }
    return null;
  }
  function findSubmitButton(){
    var buttons = Array.prototype.slice.call(document.querySelectorAll('button'));
    var candidates = [];
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      if (!isVisible(btn) || isDisabled(btn) || btn.closest('[role="menu"]') || btn.closest('nav')) continue;
      var icon = btn.querySelector('i');
      var iconText = icon ? (icon.textContent || '').trim().toLowerCase() : '';
      var buttonText = (btn.textContent || '').trim().toLowerCase();
      if (iconText.indexOf(${SUBMIT_ICON}) !== -1 || buttonText.indexOf(${SUBMIT_ICON}) !== -1) {
        candidates.push(btn);
      }
    }
    candidates.sort(function(a, b){
      var ar = a.getBoundingClientRect();
      var br = b.getBoundingClientRect();
      return (br.bottom - ar.bottom) || (br.right - ar.right);
    });
    return candidates[0] || null;
  }

  setStatus('Retry 1: กำลังหาปุ่ม Reuse Prompt จากการ์ดล่าสุด...', 'info');
  var reuseButton = findReuseButton();
  if (!reuseButton) {
    throw new Error('ไม่พบปุ่ม Reuse Prompt บนการ์ดล่าสุด');
  }
  reuseButton.scrollIntoView({ behavior: 'instant', block: 'center' });
  var reuseClick = clickReactFirst(reuseButton);
  setStatus('กด Reuse Prompt แล้ว (' + reuseClick.method + ')', 'success');
  await waitLocal(3000);

  var submitButton = null;
  for (var attempt = 0; attempt < 30; attempt++) {
    submitButton = findSubmitButton();
    if (submitButton) break;
    if (attempt === 0 || attempt === 10 || attempt === 20) {
      setStatus('Reuse Prompt แล้ว กำลังรอปุ่มสร้างพร้อมกด...', 'info');
    }
    await waitLocal(500);
  }
  if (!submitButton) {
    throw new Error('Reuse Prompt แล้ว แต่ไม่พบปุ่มสร้างที่พร้อมกด');
  }
  submitButton.scrollIntoView({ behavior: 'instant', block: 'center' });
  var submitClick = clickReactFirst(submitButton);
  setStatus('ส่ง Reuse Prompt แล้ว (' + submitClick.method + ')', 'success');
  await waitLocal(2000);
  return { success: true, reuseMethod: reuseClick.method, submitMethod: submitClick.method };
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
        var icons = Array.prototype.slice.call(btn.querySelectorAll('i, span')).map(function(icon){ return (icon.textContent || '').trim().toLowerCase(); });
        if (icons.indexOf('add_2') !== -1 || icons.indexOf('add') !== -1 || txt === 'add' || txt.indexOf('start') !== -1 || txt.indexOf('create') !== -1 || txt.indexOf('เริ่ม') !== -1) {
          showRipple(btn);
          btn.click();
          await wait(1200);
          var dialog = getOpenDialog();
          if (dialog) return dialog;
        }
      }

      var allIcons = Array.prototype.slice.call(document.querySelectorAll('i, span'));
      for (var j = 0; j < allIcons.length; j++) {
        var icon = allIcons[j];
        var iconText = (icon.textContent || '').trim().toLowerCase();
        if (iconText !== 'add' && iconText !== 'add_photo_alternate') continue;
        var iconBtn = icon.closest('button, [role="button"]');
        if (!iconBtn || !isVisible(iconBtn)) continue;
        if (iconBtn.closest('[role="menu"]') || iconBtn.closest('nav') || iconBtn.closest('aside')) continue;

        var container = iconBtn.parentElement;
        var foundArrowForward = false;
        for (var depth = 0; depth < 10 && container; depth++) {
          var containerIcons = Array.prototype.slice.call(container.querySelectorAll('i, span'));
          for (var c = 0; c < containerIcons.length; c++) {
            if ((containerIcons[c].textContent || '').trim().toLowerCase() === 'arrow_forward') {
              foundArrowForward = true;
              break;
            }
          }
          if (foundArrowForward) break;
          container = container.parentElement;
        }
        if (!foundArrowForward && iconText !== 'add_photo_alternate') continue;
        showRipple(iconBtn);
        iconBtn.click();
        await wait(1200);
        var fallbackDialog = getOpenDialog();
        if (fallbackDialog) return fallbackDialog;
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
  function getUploadRateLimitToast(){
    var rateLimitPattern = /uploading\\s+too\\s+quickly|please\\s+wait\\s+a\\s+moment\\s+and\\s+try\\s+later|อัปโหลด.*เร็ว|อัพโหลด.*เร็ว/i;
    var candidates = Array.prototype.slice.call(document.querySelectorAll(
      '[data-sonner-toast], [role="alert"], [role="status"], [aria-live], [class*="toast"], [class*="snackbar"], section, div'
    ));
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (!isVisible(el)) continue;
      var rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) continue;
      var text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
      if (text && text.length < 400 && rateLimitPattern.test(text)) return text;
    }
    return null;
  }
  function dismissUploadRateLimitToast(){
    if (!getUploadRateLimitToast()) return false;
    var buttons = Array.prototype.slice.call(document.querySelectorAll('button, [role="button"]'));
    for (var i = 0; i < buttons.length; i++) {
      if (!isVisible(buttons[i])) continue;
      var text = (buttons[i].textContent || '').replace(/\\s+/g, ' ').trim();
      if (/dismiss|ปิด|ตกลง|ok/i.test(text)) {
        showRipple(buttons[i]);
        buttons[i].click();
        return true;
      }
    }
    return false;
  }
  function selectableImageItem(item){
    if (!item || !item.isConnected || !isVisible(item)) return null;
    return item.closest('[data-index]') || item;
  }
  function dedupeItems(items){
    var result = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (!item || result.indexOf(item) !== -1) continue;
      result.push(item);
    }
    return result;
  }
  function imageItems(scope){
    var root = scope || document;
    var indexed = Array.prototype.slice.call(root.querySelectorAll('[data-testid="virtuoso-item-list"] [data-index], [data-index]'))
      .map(selectableImageItem)
      .filter(function(item){ return item && isVisible(item) && (item.querySelector('img') || item.tagName === 'IMG'); });
    if (indexed.length) return dedupeItems(indexed);

    var optionItems = Array.prototype.slice.call(root.querySelectorAll('[role="option"], [role="gridcell"], [role="button"]'))
      .map(selectableImageItem)
      .filter(function(item){ return item && isVisible(item) && (item.querySelector('img') || item.tagName === 'IMG'); });
    if (optionItems.length) return dedupeItems(optionItems);

    return dedupeItems(Array.prototype.slice.call(root.querySelectorAll('img'))
      .filter(function(img){
        return isVisible(img) &&
          (img.complete !== false) &&
          ((img.naturalWidth || 0) > 20) &&
          ((img.naturalHeight || 0) > 20);
      })
      .map(function(img){
        return selectableImageItem(img.closest('[role="option"], [role="gridcell"], [role="button"], [data-index]') || img.parentElement || img);
      })
      .filter(Boolean));
  }
  function itemHasUploadActivity(item){
    if (!item || !item.isConnected) return false;
    var text = (item.textContent || '').trim();
    if (/\\b\\d+%\\b/.test(text)) return true;
    var progressItems = Array.prototype.slice.call(item.querySelectorAll('i, [role="progressbar"], [aria-busy="true"]'));
    for (var p = 0; p < progressItems.length; p++) {
      var txt = (progressItems[p].textContent || '').trim().toLowerCase();
      if (
        txt === 'progress_activity' ||
        txt === 'autorenew' ||
        txt === 'hourglass_empty' ||
        progressItems[p].getAttribute('role') === 'progressbar' ||
        progressItems[p].getAttribute('aria-busy') === 'true'
      ) return true;
    }
    return false;
  }
  function itemLooksLikeVideo(item){
    var selectable = selectableImageItem(item);
    if (!selectable) return false;
    if (selectable.querySelector && selectable.querySelector('video')) return true;
    var text = ((selectable.textContent || '') + ' ' +
      (selectable.getAttribute('aria-label') || '') + ' ' +
      (selectable.getAttribute('title') || '')).toLowerCase();
    if (text.indexOf('play_circle') !== -1 ||
        text.indexOf('videocam') !== -1 ||
        text.indexOf('video') !== -1 ||
        text.indexOf('วิดีโอ') !== -1) return true;
    var icons = Array.prototype.slice.call(selectable.querySelectorAll ? selectable.querySelectorAll('i, span') : []);
    for (var i = 0; i < icons.length; i++) {
      var iconText = (icons[i].textContent || '').trim().toLowerCase();
      if (iconText === 'play_circle' || iconText === 'videocam' || iconText === 'movie') return true;
    }
    return false;
  }
  function readyImageItem(item){
    if (!item || !isVisible(item)) return false;
    var selectable = selectableImageItem(item);
    if (itemHasUploadActivity(selectable)) return false;
    if (itemLooksLikeVideo(selectable)) return false;
    var img = selectable.querySelector('img') || (selectable.tagName === 'IMG' ? selectable : null);
    if (!img || !isVisible(img)) return false;
    if (img.complete === false) return false;
    return (img.naturalWidth || 0) > 20 && (img.naturalHeight || 0) > 20;
  }
  function itemSignature(item){
    var selectable = selectableImageItem(item);
    var img = selectable && (selectable.querySelector('img') || (selectable.tagName === 'IMG' ? selectable : null));
    if (!img) return '';
    var src = img.currentSrc || img.src || img.getAttribute('src') || '';
    var alt = img.getAttribute('alt') || '';
    var aria = selectable.getAttribute('aria-label') || '';
    var mediaId = selectable.getAttribute('data-media-id') || selectable.getAttribute('data-id') || selectable.getAttribute('data-testid') || '';
    return [src, alt, aria, mediaId].filter(Boolean).join('|');
  }
  function optionThumbnailClickTarget(option){
    if (!option || !option.isConnected) return null;
    var children = Array.prototype.slice.call(option.children || []);
    for (var i = 0; i < children.length; i++) {
      if (isVisible(children[i]) && children[i].querySelector && children[i].querySelector('img')) return children[i];
    }
    var imgs = Array.prototype.slice.call(option.querySelectorAll ? option.querySelectorAll('img') : []);
    for (var j = 0; j < imgs.length; j++) {
      if (isVisible(imgs[j])) return imgs[j].parentElement || imgs[j];
    }
    return null;
  }
  function mediaListClickTarget(item){
    if (!item || !item.isConnected) return null;
    var option = (item.matches && item.matches('[role="option"]'))
      ? item
      : (item.querySelector && item.querySelector('[role="option"]')) || (item.closest && item.closest('[role="option"]'));
    if (option && isVisible(option)) return optionThumbnailClickTarget(option) || option;
    return item;
  }
  function clickImageItem(item){
    var target = mediaListClickTarget(item) || item.querySelector('img') || item;
    target.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
    showRipple(target);
    target.click();
  }
  async function clickAddToPrompt(dialog){
    var scope = dialog && dialog.isConnected ? dialog : getOpenDialog();
    if (!scope) return false;
    function findButton(root){
      var buttons = Array.prototype.slice.call(root.querySelectorAll('button'));
      for (var i = 0; i < buttons.length; i++) {
        var txt = (buttons[i].textContent || '').replace(/\\s+/g, ' ').trim();
        if (/^(add to prompt|select|done|use image|เลือก|เพิ่ม)$/i.test(txt) && isVisible(buttons[i]) && !buttons[i].disabled) {
          return buttons[i];
        }
      }
      return null;
    }
    var button = findButton(scope) || (scope !== document ? findButton(document) : null);
    if (button) {
        showRipple(button);
        button.click();
        await wait(700);
        return true;
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
  function setStatus(message, level){
    try {
      if (typeof __flowLog === 'function') __flowLog(String(message || ''), level || 'info');
    } catch (e) {}
  }
  var indexOffset = Math.max(0, Number(args.indexOffset || 0) || 0);
  setStatus(indexOffset > 0 ? ('เลือกรูปย้อนหลังลำดับ ' + (indexOffset + 1) + ' จากรายการ...') : 'เลือกรูปล่าสุดจากรายการ...', 'info');
  setStatus('กำลังเปิด dialog รูป reference...', 'action');
  var dialog = await openImageDialog();
  await handleAgreeDialog();
  dialog = getOpenDialog() || dialog;
  setStatus('Dialog รูปเปิดแล้ว กำลังเลื่อนไปรายการบนสุด...', 'info');
  var scroller = dialog.querySelector('[data-testid="virtuoso-scroller"]') || document.querySelector('[data-testid="virtuoso-scroller"]');
  if (scroller) {
    for (var s = 0; s < 3; s++) { scroller.scrollTop = 0; await wait(200); }
  }
  setStatus(indexOffset > 0 ? ('Scroll ไปรูปย้อนหลังลำดับ ' + (indexOffset + 1) + ' แล้วรอ 2 วิ ก่อนเลือก...') : 'Scroll ไปรูปแรก (ใหม่สุด) แล้วรอ 2 วิ ก่อนเลือก...', 'info');
  await wait(1800);
  var picked = null;
  for (var attempt = 0; attempt < 24 && !picked; attempt++) {
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
    if (!picked) {
      if (attempt === 0 || attempt === 8 || attempt === 16) {
        setStatus('ยังไม่พบรูปที่พร้อมเลือก กำลังรอรายการรูปโหลด...', 'info');
      }
      await wait(500);
    }
  }
  if (!picked) throw new Error('ไม่พบรูปในรายการล่าสุดสำหรับแนบ reference');
  setStatus('พบรูปที่พร้อมเลือกแล้ว รอให้รายการนิ่ง 2 วิ...', 'info');
  await wait(2000);
  var stablePicked = null;
  for (var stableAttempt = 0; stableAttempt < 12 && !stablePicked; stableAttempt++) {
    var stableItems = imageItems(getOpenDialog() || dialog)
      .filter(readyImageItem)
      .sort(function(a, b){
        var ai = parseInt(a.getAttribute('data-index') || '', 10);
        var bi = parseInt(b.getAttribute('data-index') || '', 10);
        var safeA = Number.isFinite(ai) ? ai : Number.MAX_SAFE_INTEGER;
        var safeB = Number.isFinite(bi) ? bi : Number.MAX_SAFE_INTEGER;
        return safeA - safeB || a.getBoundingClientRect().top - b.getBoundingClientRect().top;
    });
    stablePicked = stableItems[Math.min(indexOffset, Math.max(0, stableItems.length - 1))] || null;
    if (!stablePicked) {
      if (stableAttempt === 0 || stableAttempt === 6) {
        setStatus('กำลังตรวจรูปที่เลือกอีกครั้งหลังรอ 2 วิ...', 'info');
      }
      await wait(500);
    }
  }
  picked = stablePicked || picked;
  var dataIndex = picked.getAttribute('data-index');
  setStatus('เลือกรูป reference [' + (dataIndex || '?') + ']...', 'action');
  clickImageItem(picked);
  await wait(1000);
  if (!(await waitForDialogClosed(dialog, 4500))) {
    setStatus('เลือกรูปแล้วแต่ dialog ยังไม่ปิด กำลังกด Add to Prompt...', 'action');
    if (!(await clickAddToPrompt(dialog))) throw new Error('เลือกรูปแล้วแต่ไม่พบปุ่ม Add to Prompt');
    if (!(await waitForDialogClosed(dialog, 4500))) throw new Error('เลือกรูปแล้วแต่ dialog ยังไม่ปิด');
  }
  setStatus('เลือกรูปล่าสุดเป็น reference สำเร็จ', 'success');
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
  function setStatus(message, level){
    try {
      if (typeof __flowLog === 'function') __flowLog(String(message || ''), level || 'info');
    } catch (e) {}
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
  function isDialogOpen(dialog){
    var active = getOpenDialog() || dialog;
    return !!(active && active.isConnected && isVisible(active));
  }
  function sortImageItemsByTop(items){
    return items.sort(function(a, b){
      var ai = parseInt(a.getAttribute('data-index') || '', 10);
      var bi = parseInt(b.getAttribute('data-index') || '', 10);
      var safeA = Number.isFinite(ai) ? ai : Number.MAX_SAFE_INTEGER;
      var safeB = Number.isFinite(bi) ? bi : Number.MAX_SAFE_INTEGER;
      if (safeA !== safeB) return safeA - safeB;
      var ar = a.getBoundingClientRect();
      var br = b.getBoundingClientRect();
      return (ar.top - br.top) || (ar.left - br.left);
    });
  }
  async function scrollImageListTop(dialog){
    var scope = dialog && dialog.isConnected ? dialog : document;
    var scroller = scope.querySelector('[data-testid="virtuoso-scroller"]') || document.querySelector('[data-testid="virtuoso-scroller"]');
    if (scroller) {
      for (var s = 0; s < 3; s++) {
        scroller.scrollTop = 0;
        await wait(200);
      }
    }
  }
  async function waitForTopReadyImageItem(dialog, retries){
    await scrollImageListTop(dialog);
    for (var r = 0; r < (retries || 12); r++) {
      var scope = getOpenDialog() || dialog || document;
      var topItems = sortImageItemsByTop(imageItems(scope).filter(readyImageItem));
      if (topItems.length > 0) return topItems[0];
      await wait(350);
    }
    return null;
  }
  async function waitForStableTopReadyImageItem(dialog){
    var topItem = await waitForTopReadyImageItem(dialog, 12);
    if (!topItem) return null;
    await wait(2000);
    return (await waitForTopReadyImageItem(dialog, 8)) || topItem;
  }
  function getUploadActivity(dialog){
    var scope = dialog && dialog.isConnected ? dialog : document;
    var textCandidates = Array.prototype.slice.call(scope.querySelectorAll('[data-index] div, [data-testid="virtuoso-item-list"] div, [role="progressbar"]'));
    for (var t = 0; t < textCandidates.length; t++) {
      var txt = (textCandidates[t].textContent || '').trim();
      if (/^\\d+%$/.test(txt)) {
        return {
          active: true,
          percent: txt,
          item: textCandidates[t].closest('[data-index], [role="option"], [role="gridcell"], [role="button"]')
        };
      }
    }
    var progressItems = Array.prototype.slice.call(scope.querySelectorAll('i, [role="progressbar"], [aria-busy="true"]'));
    for (var p = 0; p < progressItems.length; p++) {
      var ptxt = (progressItems[p].textContent || '').trim().toLowerCase();
      if (
        ptxt === 'progress_activity' ||
        ptxt === 'autorenew' ||
        ptxt === 'hourglass_empty' ||
        progressItems[p].getAttribute('role') === 'progressbar' ||
        progressItems[p].getAttribute('aria-busy') === 'true'
      ) {
        var item = progressItems[p].closest('[data-index], [role="option"], [role="gridcell"], [role="button"]');
        if (item && isVisible(item)) return { active: true, percent: null, item: item };
      }
    }
    return { active: false, percent: null, item: null };
  }
  function findReadyUploadedImageItem(dialog, knownSignatures, lastUploadItem){
    var scope = dialog && dialog.isConnected ? dialog : document;
    var preferred = lastUploadItem && (lastUploadItem.closest('[data-index]') || lastUploadItem);
    if (preferred && readyImageItem(preferred)) {
      var preferredSig = itemSignature(preferred);
      if (preferredSig && knownSignatures.indexOf(preferredSig) === -1) return preferred;
    }
    var seen = [];
    var items = sortImageItemsByTop(imageItems(scope).filter(readyImageItem)).filter(function(item){
      if (seen.indexOf(item) !== -1) return false;
      seen.push(item);
      return true;
    });
    for (var i = 0; i < items.length; i++) {
      var sig = itemSignature(items[i]);
      if (sig && knownSignatures.indexOf(sig) === -1) return items[i];
    }
    return null;
  }
  async function waitForUploadedImageItem(dialog, knownSignatures){
    var lastUploadItem = null;
    var stableSignature = '';
    var stableCount = 0;
    var lastStatusMessage = '';
    var lastStatusAt = 0;
    function logUploadStatus(message){
      var now = Date.now();
      if (message !== lastStatusMessage || now - lastStatusAt > 5000) {
        lastStatusMessage = message;
        lastStatusAt = now;
        setStatus(message, 'info');
      }
    }
    for (var attempt = 0; attempt < 90; attempt++) {
      var activeDialog = getOpenDialog() || dialog;
      if (!isDialogOpen(activeDialog)) return { autoAttached: true, item: null };
      var uploadActivity = getUploadActivity(activeDialog);
      if (uploadActivity.item) lastUploadItem = uploadActivity.item;
      if (uploadActivity.active) {
        logUploadStatus(uploadActivity.percent ? ('กำลังอัปโหลดรูป reference: ' + uploadActivity.percent) : 'รูป reference กำลังอัปโหลด/ประมวลผลใน Google Flow...');
      } else {
        logUploadStatus('กำลังรอรูป reference ที่อัปโหลดเสร็จพร้อมเลือก...');
      }
      if (!uploadActivity.active) {
        var uploadedItem = findReadyUploadedImageItem(activeDialog, knownSignatures, lastUploadItem);
        if (uploadedItem) {
          var sig = itemSignature(uploadedItem) || ('item:' + (uploadedItem.getAttribute('data-index') || '?'));
          if (sig === stableSignature) stableCount += 1;
          else {
            stableSignature = sig;
            stableCount = 1;
          }
          if (stableCount >= 2) return { autoAttached: false, item: uploadedItem };
        } else {
          stableSignature = '';
          stableCount = 0;
        }
      } else {
        stableSignature = '';
        stableCount = 0;
      }
      await wait(1000);
    }
    return { autoAttached: false, item: findReadyUploadedImageItem(getOpenDialog() || dialog, knownSignatures, lastUploadItem) };
  }
  async function waitBeforeUploadRetry(){
    dismissUploadRateLimitToast();
    for (var remaining = 30; remaining > 0; remaining -= 5) {
      setStatus('Google Flow จำกัดความถี่การอัปโหลดรูป — รอ ' + remaining + ' วิ แล้วจะลองอัปโหลดใหม่', 'warning');
      await wait(Math.min(5000, remaining * 1000));
    }
  }
  setStatus('เตรียมรูป reference สำหรับอัปโหลดเข้า Google Flow...', 'info');
  var resolvedDataUrl = await resolveDataUrl();
  setStatus('กำลังเปิด dialog เลือกรูป reference...', 'action');
  var dialog = await openImageDialog();
  await handleAgreeDialog();
  dialog = getOpenDialog() || dialog;
  setStatus('Dialog เลือกรูปเปิดแล้ว กำลังเตรียมอัปโหลด...', 'info');
  var lastRateLimitText = '';
  for (var uploadAttempt = 1; uploadAttempt <= 2; uploadAttempt++) {
    dialog = getOpenDialog() || (dialog && isDialogOpen(dialog) ? dialog : null);
    if (!dialog) {
      setStatus('Dialog ปิดไปแล้ว กำลังเปิดใหม่ก่อน retry อัปโหลดรูป...', 'warning');
      dialog = await openImageDialog();
      await handleAgreeDialog();
      dialog = getOpenDialog() || dialog;
    }
    var known = imageItems(dialog).filter(readyImageItem).map(itemSignature).filter(Boolean);
    var knownInputs = Array.prototype.slice.call(document.querySelectorAll('input[type="file"]'));
    var uploadButton = findUploadButton(dialog);
    if (uploadButton) {
      setStatus('พบปุ่ม Upload แล้ว กำลังส่งไฟล์รูป reference (ครั้งที่ ' + uploadAttempt + '/2)...', 'action');
      showRipple(uploadButton);
      uploadButton.click();
      await wait(600);
    }
    var rateLimitAfterButton = getUploadRateLimitToast();
    if (rateLimitAfterButton) {
      lastRateLimitText = rateLimitAfterButton;
      if (uploadAttempt < 2) {
        await waitBeforeUploadRetry();
        continue;
      }
      throw new Error('Google Flow จำกัดความถี่การอัปโหลดรูป (' + lastRateLimitText + ') — รอ 30 วิและลองอัปโหลดใหม่แล้ว แต่ยังไม่สำเร็จ');
    }

    var input = null;
    setStatus('กำลังค้นหา file input สำหรับส่งรูปให้ Google Flow...', 'info');
    for (var f = 0; f < 20 && !input; f++) {
      var allInputs = Array.prototype.slice.call(document.querySelectorAll('input[type="file"]'));
      var newInputs = allInputs.filter(function(candidate){ return knownInputs.indexOf(candidate) === -1; });
      var candidates = newInputs.length ? newInputs : allInputs;
      input = candidates[candidates.length - 1] || null;
      if (!input) {
        var rateLimitWhileFindingInput = getUploadRateLimitToast();
        if (rateLimitWhileFindingInput) break;
        await wait(300);
      }
    }
    if (!input) {
      var rateLimitWithoutInput = getUploadRateLimitToast();
      if (rateLimitWithoutInput) {
        lastRateLimitText = rateLimitWithoutInput;
        if (uploadAttempt < 2) {
          await waitBeforeUploadRetry();
          continue;
        }
        throw new Error('Google Flow จำกัดความถี่การอัปโหลดรูป (' + lastRateLimitText + ') — รอ 30 วิและลองอัปโหลดใหม่แล้ว แต่ยังไม่สำเร็จ');
      }
      throw new Error('ไม่พบ input upload รูปใน Google Flow');
    }

    var dt = new DataTransfer();
    dt.items.add(dataUrlToFile(resolvedDataUrl, fileName));
    setStatus('กำลังใส่ไฟล์รูปเข้า file input และเริ่มอัปโหลด...', 'action');
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(1200);
    var rateLimitAfterInput = getUploadRateLimitToast();
    if (rateLimitAfterInput) {
      lastRateLimitText = rateLimitAfterInput;
      if (uploadAttempt < 2) {
        await waitBeforeUploadRetry();
        continue;
      }
      throw new Error('Google Flow จำกัดความถี่การอัปโหลดรูป (' + lastRateLimitText + ') — รอ 30 วิและลองอัปโหลดใหม่แล้ว แต่ยังไม่สำเร็จ');
    }

    if (!isDialogOpen(dialog)) {
      setStatus('Google Flow แนบรูป reference อัตโนมัติแล้ว', 'success');
      return { success: true, dataIndex: null, autoAttached: true, rateLimitRetried: uploadAttempt > 1 };
    }
    setStatus('ส่งไฟล์แล้ว กำลังรอ Google Flow อัปโหลด/ประมวลผลรูป...', 'info');
    var uploadResult = await waitForUploadedImageItem(dialog, known);
    if (uploadResult.autoAttached) {
      setStatus('Google Flow แนบรูป reference อัตโนมัติแล้ว', 'success');
      return { success: true, dataIndex: null, autoAttached: true, rateLimitRetried: uploadAttempt > 1 };
    }
    var rateLimitAfterUploadWait = getUploadRateLimitToast();
    if (rateLimitAfterUploadWait) {
      lastRateLimitText = rateLimitAfterUploadWait;
      if (uploadAttempt < 2) {
        await waitBeforeUploadRetry();
        continue;
      }
      throw new Error('Google Flow จำกัดความถี่การอัปโหลดรูป (' + lastRateLimitText + ') — รอ 30 วิและลองอัปโหลดใหม่แล้ว แต่ยังไม่สำเร็จ');
    }

    var picked = uploadResult.item;
    if (!picked) {
      setStatus('ยังไม่พบ signature รูปใหม่ กำลังเลือกรูปบนสุดที่พร้อมเลือกแทน...', 'warning');
      picked = await waitForStableTopReadyImageItem(dialog);
    }
    if (!picked) {
      setStatus('ยังไม่พบรูปใหม่ที่พร้อมเลือก กำลังลองกด Add to Prompt...', 'warning');
      if (await clickAddToPrompt(dialog)) {
        if (await waitForDialogClosed(dialog, 5000)) return { success: true, dataIndex: null, confirmed: true, rateLimitRetried: uploadAttempt > 1 };
      }
    }
    if (!picked) throw new Error('อัปโหลดรูปแล้วแต่ไม่พบรูปใหม่ที่พร้อมเลือก');
    var dataIndex = picked.getAttribute('data-index');
    setStatus('อัปโหลดเสร็จแล้ว กำลังเลือกรูป reference บนสุด [' + (dataIndex || '?') + ']...', 'action');
    clickImageItem(picked);
    await wait(1000);
    if (!(await waitForDialogClosed(dialog, 5000))) {
      setStatus('เลือกรูปแล้ว กำลังกด Add to Prompt...', 'action');
      if (!(await clickAddToPrompt(dialog))) throw new Error('เลือกรูปอัปโหลดแล้วแต่ไม่พบปุ่ม Add to Prompt');
      if (!(await waitForDialogClosed(dialog, 5000))) throw new Error('เลือกรูปอัปโหลดแล้วแต่ dialog ยังไม่ปิด');
    }
    setStatus('แนบรูป reference เข้า prompt สำเร็จ', 'success');
    return { success: true, dataIndex: dataIndex, rateLimitRetried: uploadAttempt > 1 };
  }
  throw new Error('Google Flow จำกัดความถี่การอัปโหลดรูป (' + (lastRateLimitText || 'uploading too quickly') + ') — รอ 30 วิและลองอัปโหลดใหม่แล้ว แต่ยังไม่สำเร็จ');
`;

const ENSURE_VIDEO_REFERENCE_ATTACHED_BODY = `
  function isVisible(el){
    if (!el || !el.isConnected) return false;
    var rect = el.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return false;
    var style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0;
  }
  function isDisabled(btn){
    return btn.disabled ||
      btn.getAttribute('aria-disabled') === 'true' ||
      btn.hasAttribute('data-disabled') ||
      btn.getAttribute('data-state') === 'disabled';
  }
  function findCreateButton(){
    var buttons = Array.prototype.slice.call(document.querySelectorAll('button'));
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      if (button.closest('[role="menu"]') || button.closest('nav')) continue;
      var icon = button.querySelector('i');
      var iconText = icon ? (icon.textContent || '').trim().toLowerCase() : '';
      if (iconText.indexOf(${SUBMIT_ICON}) !== -1 && !isDisabled(button) && isVisible(button)) {
        return button;
      }
    }
    return null;
  }
  function findComposer(createButton){
    var node = createButton;
    for (var depth = 0; node && depth < 12; depth++) {
      if (
        node.querySelector('${SLATE}, [contenteditable="true"][role="textbox"], [contenteditable="true"], textarea') &&
        node.querySelector('[aria-haspopup="dialog"]')
      ) {
        return node;
      }
      node = node.parentElement;
    }

    var editor = document.querySelector('${SLATE}, [contenteditable="true"][role="textbox"], [contenteditable="true"], textarea');
    node = editor;
    for (var ed = 0; node && ed < 12; ed++) {
      var icons = Array.prototype.slice.call(node.querySelectorAll('button i, button span'));
      for (var i = 0; i < icons.length; i++) {
        if ((icons[i].textContent || '').trim().toLowerCase().indexOf(${SUBMIT_ICON}) !== -1) {
          return node;
        }
      }
      node = node.parentElement;
    }
    return null;
  }
  function findFrameScope(composer){
    var icons = Array.prototype.slice.call(composer.querySelectorAll('i, span'));
    for (var i = 0; i < icons.length; i++) {
      if ((icons[i].textContent || '').trim().toLowerCase() === 'swap_horiz') {
        var button = icons[i].closest('button');
        return (button && button.parentElement) || composer;
      }
    }
    return composer;
  }
  function checkOnce(){
    var createButton = findCreateButton();
    var composer = findComposer(createButton);
    if (!composer) {
      return {
        ok: false,
        error: 'หา prompt composer ไม่เจอ จึงตรวจสอบรูป reference ก่อนสร้างวิดีโอไม่ได้'
      };
    }

    var frameScope = findFrameScope(composer);
    var visibleImages = Array.prototype.slice.call(frameScope.querySelectorAll('img')).filter(function(img){
      if (!isVisible(img)) return false;
      var src = img.currentSrc || img.src || img.getAttribute('src') || '';
      return !!String(src || '').trim();
    });
    var visibleMediaCards = Array.prototype.slice.call(frameScope.querySelectorAll('[data-card-open], button, [role="button"]')).filter(function(card){
      if (!isVisible(card)) return false;
      if (card.hasAttribute('aria-haspopup')) return false;
      return !!card.querySelector('img');
    });

    var attachedCount = Math.max(visibleImages.length, visibleMediaCards.length);
    if (attachedCount > 0) {
      return { ok: true, attachedCount: attachedCount };
    }

    var frameText = (frameScope.textContent || '').replace(/\\s+/g, ' ').trim();
    var hasStartPlaceholder = /\\bstart\\b|เริ่ม/i.test(frameText);
    var hasEndPlaceholder = /\\bend\\b|จบ/i.test(frameText);
    var detail = [
      hasStartPlaceholder ? 'ยังเห็นช่อง Start' : '',
      hasEndPlaceholder ? 'ยังเห็นช่อง End' : ''
    ].filter(Boolean).join(', ');

    return {
      ok: false,
      attachedCount: 0,
      detail: detail,
      error: detail
        ? 'ยังไม่มีรูป reference แนบในช่องวิดีโอ (' + detail + ')'
        : 'ยังไม่มีรูป reference แนบในช่องวิดีโอ'
    };
  }

  var result = checkOnce();
  for (var attempt = 1; !result.ok && attempt < 10; attempt++) {
    await wait(500);
    result = checkOnce();
  }
  if (!result.ok) {
    throw new Error(result.error || 'ยังไม่มีรูป reference แนบในช่องวิดีโอ');
  }
  return { success: true, attachedCount: result.attachedCount || 1 };
`;

// --- downloadVideo: read the ready video through the page session and return it as data URL ---
const DOWNLOAD_IMAGES_BODY = `
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
  deleteLatestProject: DELETE_LATEST_PROJECT_BODY,
  prepareProjectUi: PREPARE_PROJECT_UI_BODY,
  configurePopper: CONFIGURE_POPPER_BODY,
  selectRecentImage: SELECT_RECENT_IMAGE_BODY,
  uploadReferenceImage: UPLOAD_REFERENCE_IMAGE_BODY,
  ensureVideoReferenceAttached: ENSURE_VIDEO_REFERENCE_ATTACHED_BODY,
  fillPrompt: FILL_PROMPT_BODY,
  submit: SUBMIT_BODY,
  reusePromptAndSubmit: REUSE_PROMPT_AND_SUBMIT_BODY,
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
  var __action = ${JSON.stringify(action)};
  var __args = ${JSON.stringify(args)};
  function __post(p){ try { window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: 'flowResult', id: __id }, p))); } catch (e) {} }
  function __flowLog(message, level){ try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'flowActionLog', id: __id, action: __action, message: String(message || ''), level: level || 'info', ts: Date.now() })); } catch (e) {} }
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

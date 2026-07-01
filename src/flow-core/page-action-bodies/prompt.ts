import { FLOW_SELECTORS } from '../selectors';

const SLATE = FLOW_SELECTORS.slateEditor;
const SUBMIT_ICON = JSON.stringify(FLOW_SELECTORS.submitIcon);

export const FILL_PROMPT_BODY = `
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

export const SUBMIT_BODY = `
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

export const REUSE_PROMPT_AND_SUBMIT_BODY = `
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

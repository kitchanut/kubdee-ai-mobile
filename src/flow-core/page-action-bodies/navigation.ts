import { FLOW_SELECTORS } from '../selectors';

const SLATE = FLOW_SELECTORS.slateEditor;
const NEW_PROJECT_LABELS = JSON.stringify(FLOW_SELECTORS.newProjectText);

export const NEW_PROJECT_BODY = `
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

export const DELETE_LATEST_PROJECT_BODY = `
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

export const PREPARE_PROJECT_UI_BODY = `
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

/**
 * configurePopper (video core) — open the Flow config popper, switch to VIDEO
 * mode, pick the sub-mode (Frames for Veo / Ingredients for Omni) and select
 * the video model. Ported from the desktop configurePopper.ts page.evaluate
 * body; aspect-ratio / output-count / duration settings are a follow-up (2b).
 *
 * Authored as a plain-JS STRING (not a function) on purpose: React Native's
 * Hermes engine does not return real source from Function.prototype.toString(),
 * so the ".toString()-and-inject" trick is unavailable — the body must already
 * be a string. Template literals are written as string concatenation so the
 * whole body lives inside an outer template literal without escaping.
 *
 * Reads `args`: { targetMode: 'video' | 'image', videoModel?, imageModel?, skipTab? }.
 * Returns `{ success, error?, logs }` (logical failures return success:false,
 * they do not throw).
 */
export const CONFIGURE_POPPER_BODY = `
  var mode = args.targetMode;
  var skip = args.skipTab || false;
  var vidModel = args.videoModel;
  var hMode = !!mode;
  var isImageMode = hMode && (mode === 'image');
  var logs = [];
  function sendLog(message, level){ logs.push({ level: level || 'info', message: message }); }

  function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  function heavyClick(element){ if (!element) return; element.click(); }
  function clickRadixOption(element){
    if (!element) return;
    var rect = element.getBoundingClientRect();
    var opts = { bubbles: true, cancelable: true, pointerType: 'mouse', clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    element.dispatchEvent(new PointerEvent('pointermove', opts));
    element.dispatchEvent(new PointerEvent('pointerdown', opts));
    element.dispatchEvent(new PointerEvent('pointerup', opts));
    element.click();
  }
  async function clickRadixTab(element){
    if (!element) return;
    var el = element;
    var active = function(){ return el.getAttribute('data-state') === 'active' || el.getAttribute('aria-selected') === 'true'; };
    el.focus(); await wait(100); if (active()) return;
    el.click(); await wait(100); if (active()) return;
    var rect = el.getBoundingClientRect();
    var opts = { bubbles: true, cancelable: true, pointerType: 'mouse', clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    el.dispatchEvent(new PointerEvent('pointerdown', opts)); await wait(50);
    el.dispatchEvent(new PointerEvent('pointerup', opts)); await wait(50);
    el.click(); await wait(100); if (active()) return;
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await wait(50);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); el.click();
  }
  async function clickRadixTrigger(element){
    if (!element) return;
    var rect = element.getBoundingClientRect();
    var opts = { bubbles: true, cancelable: true, pointerType: 'mouse', clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    element.dispatchEvent(new PointerEvent('pointerdown', opts)); await wait(100);
    element.dispatchEvent(new PointerEvent('pointerup', opts)); await wait(100);
    element.click();
  }
  async function closeStaleMenus(){
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await wait(200); document.body.click(); await wait(300);
  }
  function findConfigTriggerButton(){
    var buttons = document.querySelectorAll('button[aria-haspopup="menu"]');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      if (!btn.offsetParent) continue;
      if (btn.closest('[data-radix-popper-content-wrapper]')) continue;
      if (btn.closest('[role="menu"]')) continue;
      if (!btn.querySelector('[data-type="button-overlay"]')) continue;
      var icons = btn.querySelectorAll('i');
      for (var j = 0; j < icons.length; j++) {
        if ((icons[j].textContent || '').trim().toLowerCase().indexOf('crop_') !== -1) return btn;
      }
    }
    return null;
  }
  async function openConfigPopper(){
    var triggerBtn = findConfigTriggerButton();
    if (!triggerBtn) { sendLog('หาปุ่ม config trigger ไม่เจอ', 'warning'); return null; }
    var isOpen = triggerBtn.getAttribute('aria-expanded') === 'true' || triggerBtn.getAttribute('data-state') === 'open';
    if (!isOpen) { sendLog('กดเปิด config popper...', 'info'); await clickRadixTrigger(triggerBtn); await wait(800); }
    for (var i = 0; i < 10; i++) {
      var popper = document.querySelector('[data-radix-menu-content][data-state="open"]') || document.querySelector('[role="menu"][data-state="open"]');
      if (popper && popper.getBoundingClientRect().height > 0) { sendLog('Config popper เปิดแล้ว', 'success'); return popper; }
      await wait(300);
    }
    sendLog('Popper ไม่เปิด - ลองกดที่ overlay...', 'info');
    var overlay = triggerBtn.querySelector('[data-type="button-overlay"]');
    if (overlay) { await clickRadixTrigger(overlay); await wait(800); } else { await clickRadixTrigger(triggerBtn); await wait(800); }
    for (var k = 0; k < 5; k++) {
      var popper2 = document.querySelector('[data-radix-menu-content][data-state="open"]') || document.querySelector('[role="menu"][data-state="open"]');
      if (popper2 && popper2.getBoundingClientRect().height > 0) { sendLog('Config popper เปิดแล้ว (retry)', 'success'); return popper2; }
      await wait(300);
    }
    sendLog('Config popper ไม่เปิด', 'warning');
    return null;
  }
  async function closeConfigPopper(){
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await wait(300); document.body.click(); await wait(200);
  }
  function refetchPopper(fallback){
    return document.querySelector('[data-radix-menu-content][data-state="open"]') || document.querySelector('[role="menu"][data-state="open"]') || fallback;
  }

  var MODEL_MAP = {
    'nano_banana_pro': 'nano banana pro',
    'nano_banana_2': 'nano banana 2',
    'imagen_4': 'imagen 4',
    'omni_flash': 'omni flash',
    'veo_31_lite': 'veo 3.1 - lite',
    'veo_31_lite_lower': 'veo 3.1 - lite [lower priority]',
    'veo_31_fast': 'veo 3.1 - fast',
    'veo_31_quality': 'veo 3.1 - quality'
  };

  if (!hMode) return { success: true, logs: logs };

  await closeStaleMenus();

  var popper = null;
  for (var ro = 0; ro < 10; ro++) {
    popper = await openConfigPopper();
    if (popper) break;
    if (ro < 9) { sendLog('หา config trigger ไม่เจอ รอ... (' + (ro + 1) + '/10)', 'info'); await wait(1000); }
  }
  if (!popper) { sendLog('เปิด Config Popper ไม่ได้ หลังลอง 10 ครั้ง', 'warning'); return { success: false, error: 'เปิด Config Popper ไม่ได้', logs: logs }; }

  // --- 2a: select IMAGE/VIDEO tab ---
  if (!skip) {
    var targetIcons = isImageMode ? ['image'] : ['play_circle', 'videocam'];
    var targetLabel = isImageMode ? 'IMAGE' : 'VIDEO';
    var isTargetTabActive = function(p){
      var activeTab = p.querySelector('button[role="tab"][aria-selected="true"], button[role="tab"][data-state="active"]');
      if (!activeTab) return false;
      return (activeTab.getAttribute('aria-controls') || '').toUpperCase().indexOf(targetLabel) !== -1;
    };
    sendLog('กำลังหา Tab: ' + targetLabel, 'info');
    var tabActivated = false;
    if (isTargetTabActive(popper)) { sendLog('Tab ' + targetLabel + ' ถูกเลือกอยู่แล้ว', 'success'); tabActivated = true; }
    for (var tr = 0; tr < 3 && !tabActivated; tr++) {
      if (tr > 0) { popper = refetchPopper(popper); await wait(500); }
      var tabs = popper.querySelectorAll('button[role="tab"]');
      for (var a = 0; a < tabs.length; a++) {
        var icon = tabs[a].querySelector('i'); if (!icon) continue;
        if (targetIcons.indexOf((icon.textContent || '').trim().toLowerCase()) === -1) continue;
        await clickRadixTab(tabs[a]); await wait(800); popper = refetchPopper(popper);
        if (isTargetTabActive(popper)) { tabActivated = true; sendLog('เลือก Tab ' + targetLabel + ' สำเร็จ (icon)', 'success'); }
        break;
      }
      if (!tabActivated) {
        var tabs2 = popper.querySelectorAll('button[role="tab"]');
        for (var b = 0; b < tabs2.length; b++) {
          if ((tabs2[b].getAttribute('aria-controls') || '').toUpperCase().indexOf(targetLabel) !== -1) {
            await clickRadixTab(tabs2[b]); await wait(800); popper = refetchPopper(popper);
            if (isTargetTabActive(popper)) { tabActivated = true; sendLog('เลือก Tab ' + targetLabel + ' สำเร็จ (aria-controls)', 'success'); }
            break;
          }
        }
      }
      if (!tabActivated) {
        var kw = isImageMode ? ['IMAGE', 'รูปภาพ'] : ['VIDEO', 'วิดีโอ'];
        var tabs3 = popper.querySelectorAll('button[role="tab"]');
        for (var d = 0; d < tabs3.length; d++) {
          var txt = (tabs3[d].textContent || '').trim().toUpperCase();
          var match = false;
          for (var e = 0; e < kw.length; e++) { if (txt.indexOf(kw[e].toUpperCase()) !== -1) { match = true; break; } }
          if (match) {
            await clickRadixTab(tabs3[d]); await wait(800); popper = refetchPopper(popper);
            if (isTargetTabActive(popper)) { tabActivated = true; sendLog('เลือก Tab ' + targetLabel + ' สำเร็จ (text)', 'success'); }
            break;
          }
        }
      }
    }
    if (!tabActivated && !isImageMode) { await closeConfigPopper(); return { success: false, error: 'เลือก Tab VIDEO ไม่สำเร็จ', logs: logs }; }
    await wait(500); popper = refetchPopper(popper);
  }

  // --- 2b: select sub-mode (video only) ---
  if (!isImageMode) {
    popper = refetchPopper(popper); await wait(500);
    var isOmni = vidModel === 'omni_flash';
    var subModeLabel = isOmni ? 'Ingredients' : 'Frames';
    var subModeIcons = isOmni ? ['chrome_extension'] : ['crop_free', 'movie_filter', 'video_camera_front'];
    var subModeControlsKey = isOmni ? 'REFERENCES' : 'FRAMES';
    var subModeTextKeyword = isOmni ? 'ingredient' : 'frame';
    sendLog('กำลังหา Sub-mode Tab: ' + subModeLabel, 'info');
    var subFound = false;
    for (var sr = 0; sr < 3 && !subFound; sr++) {
      if (sr > 0) { await wait(800); popper = refetchPopper(popper); }
      var allTabs = popper.querySelectorAll('button[role="tab"]');
      for (var f = 0; f < allTabs.length; f++) {
        var ic2 = allTabs[f].querySelector('i'); if (!ic2) continue;
        if (subModeIcons.indexOf((ic2.textContent || '').trim().toLowerCase()) === -1) continue;
        var act = allTabs[f].getAttribute('data-state') === 'active' || allTabs[f].getAttribute('aria-selected') === 'true';
        if (!act) { await clickRadixTab(allTabs[f]); await wait(800); }
        subFound = true; break;
      }
      if (!subFound) {
        for (var g = 0; g < allTabs.length; g++) {
          if ((allTabs[g].getAttribute('aria-controls') || '').toUpperCase().indexOf(subModeControlsKey) !== -1) { await clickRadixTab(allTabs[g]); await wait(800); subFound = true; break; }
        }
      }
      if (!subFound) {
        for (var h = 0; h < allTabs.length; h++) {
          if ((allTabs[h].textContent || '').trim().toLowerCase().indexOf(subModeTextKeyword) !== -1) { await clickRadixTab(allTabs[h]); await wait(800); subFound = true; break; }
        }
      }
    }
    if (!subFound) { await closeConfigPopper(); return { success: false, error: 'หา Sub-mode ' + subModeLabel + ' ไม่เจอ', logs: logs }; }
  }

  // --- 2c: select model ---
  popper = refetchPopper(popper);
  var modelDropdown = null;
  var pBtns = popper.querySelectorAll('button[aria-haspopup="menu"]');
  for (var mi = 0; mi < pBtns.length; mi++) {
    var mIcons = pBtns[mi].querySelectorAll('i');
    for (var ni = 0; ni < mIcons.length; ni++) {
      if ((mIcons[ni].textContent || '').trim().toLowerCase().indexOf('arrow_drop') !== -1) { modelDropdown = pBtns[mi]; break; }
    }
    if (modelDropdown) break;
  }
  if (modelDropdown) {
    var currentModelText = (modelDropdown.textContent || '').trim().toLowerCase().replace('arrow_drop_down', '').replace('arrow_drop_up', '').trim();
    var selectedModelKey = isImageMode ? (args.imageModel || 'nano_banana_pro') : (vidModel || 'veo_31_fast');
    var selectedModel = MODEL_MAP[selectedModelKey];
    if (!selectedModel) { await closeConfigPopper(); return { success: false, error: 'unknown model key: ' + selectedModelKey, logs: logs }; }
    var currentModelKey = null, longestMatch = 0;
    for (var key in MODEL_MAP) {
      var value = MODEL_MAP[key];
      if (currentModelText.indexOf(value) !== -1 && value.length > longestMatch) { currentModelKey = key; longestMatch = value.length; }
    }
    if (currentModelKey === selectedModelKey) {
      sendLog('โมเดลปัจจุบัน OK: "' + currentModelText + '"', 'success');
    } else {
      sendLog('เปลี่ยนโมเดลเป็น "' + selectedModel + '"...', 'info');
      var existingMenus = new Set(document.querySelectorAll('[data-radix-menu-content]'));
      await clickRadixTrigger(modelDropdown); await wait(1000);
      var modelMenu = null;
      for (var mm = 0; mm < 8; mm++) {
        var opened = document.querySelectorAll('[data-radix-menu-content][data-state="open"]');
        for (var oi = 0; oi < opened.length; oi++) { if (!existingMenus.has(opened[oi]) && opened[oi].getBoundingClientRect().height > 0) { modelMenu = opened[oi]; break; } }
        if (modelMenu) break;
        await wait(300);
      }
      var menuItems = modelMenu ? modelMenu.querySelectorAll('[role="menuitem"]') : document.querySelectorAll('[role="menuitem"]');
      sendLog('พบ ' + menuItems.length + ' model items, หา key: "' + selectedModelKey + '"', 'info');
      var targetItem = null;
      for (var pi = 0; pi < menuItems.length; pi++) {
        var item = menuItems[pi];
        var rect2 = item.getBoundingClientRect();
        if (rect2.width === 0 || rect2.height === 0) continue;
        if (item.hasAttribute('data-disabled') || item.getAttribute('aria-disabled') === 'true') continue;
        var itemText = (item.textContent || '').trim().toLowerCase();
        var itemKey = null, longest = 0;
        for (var k2 in MODEL_MAP) { var v2 = MODEL_MAP[k2]; if (itemText.indexOf(v2) !== -1 && v2.length > longest) { itemKey = k2; longest = v2.length; } }
        if (itemKey === selectedModelKey) { targetItem = item; break; }
      }
      if (!targetItem) {
        var available = [];
        for (var qi = 0; qi < menuItems.length; qi++) available.push((menuItems[qi].textContent || '').trim());
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        await wait(300); await closeConfigPopper();
        return { success: false, error: 'model not in menu: ' + selectedModel + ' (available: ' + available.join(' | ') + ')', logs: logs };
      }
      sendLog('เลือก model: "' + (targetItem.textContent || '').trim() + '"', 'info');
      targetItem.scrollIntoView({ behavior: 'instant', block: 'center' }); await wait(300);
      var innerBtn = targetItem.querySelector('button');
      if (innerBtn) heavyClick(innerBtn); else clickRadixOption(targetItem);
      await wait(800);
    }
  } else {
    sendLog('ไม่พบปุ่ม model dropdown ใน popper', 'info');
  }

  await closeConfigPopper(); await wait(500);
  sendLog('ตั้งค่า Popper (video) สำเร็จ!', 'success');
  return { success: true, logs: logs };
`;

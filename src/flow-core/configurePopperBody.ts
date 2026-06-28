/**
 * configurePopper (video core) — open the Flow config popper, switch to VIDEO
 * mode, pick the video sub-mode (Frames) and select
 * the video model. Ported from the desktop configurePopper.ts page.evaluate
 * body; includes mode, model, aspect-ratio, output-count and duration settings.
 *
 * Authored as a plain-JS STRING (not a function) on purpose: React Native's
 * Hermes engine does not return real source from Function.prototype.toString(),
 * so the ".toString()-and-inject" trick is unavailable — the body must already
 * be a string. Template literals are written as string concatenation so the
 * whole body lives inside an outer template literal without escaping.
 *
 * Reads `args`: { targetMode: 'video' | 'image', videoModel?, imageModel?, aspectRatio?, outputCount?, videoDuration?, skipTab? }.
 * Returns `{ success, error?, logs }` (logical failures return success:false,
 * they do not throw).
 */
export const CONFIGURE_POPPER_BODY = `
  var mode = args.targetMode;
  var skip = args.skipTab || false;
  var vidModel = args.videoModel;
  var imgModel = args.imageModel;
  var ratio = args.aspectRatio ? String(args.aspectRatio) : '';
  var count = Number.parseInt(String(args.outputCount || ''), 10);
  var duration = Number.parseInt(String(args.videoDuration || ''), 10);
  var hMode = !!mode;
  var hSettings = !!(ratio || count || duration);
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

  var RATIO_MAP = {
    '16:9': 'crop_16_9',
    'landscape': 'crop_16_9',
    '4:3': 'crop_landscape',
    '1:1': 'crop_square',
    '3:4': 'crop_portrait',
    '9:16': 'crop_9_16',
    'portrait': 'crop_9_16'
  };
  var RATIO_LABEL_MAP = {
    'crop_16_9': 'LANDSCAPE',
    'crop_landscape': 'LANDSCAPE_4_3',
    'crop_square': 'SQUARE',
    'crop_portrait': 'PORTRAIT_3_4',
    'crop_9_16': 'PORTRAIT'
  };
  function resolveRatioIcon(aspectRatio){
    var lower = String(aspectRatio || '').toLowerCase();
    if (RATIO_MAP[lower]) return RATIO_MAP[lower];
    var match = lower.match(/(\\d+:\\d+)/);
    if (match && RATIO_MAP[match[1]]) return RATIO_MAP[match[1]];
    return null;
  }
  function isTargetRatio(aspectRatio, iconText){
    var targetIcon = resolveRatioIcon(aspectRatio);
    return !!targetIcon && iconText === targetIcon;
  }
  function checkCurrentValuesFromTrigger(aspectRatio, outputCount){
    var result = { ratioOk: !aspectRatio, countOk: !outputCount };
    var triggerBtn = findConfigTriggerButton();
    if (!triggerBtn) return result;
    if (aspectRatio) {
      var icons = triggerBtn.querySelectorAll('i');
      for (var i = 0; i < icons.length; i++) {
        var iconText = (icons[i].textContent || '').trim().toLowerCase();
        if (isTargetRatio(aspectRatio, iconText)) { result.ratioOk = true; break; }
      }
    }
    if (outputCount) {
      var cleaned = triggerBtn.textContent || '';
      var iconEls = triggerBtn.querySelectorAll('i');
      for (var j = 0; j < iconEls.length; j++) {
        var t = iconEls[j].textContent || '';
        if (t) cleaned = cleaned.replace(t, ' ');
      }
      cleaned = cleaned.trim().toLowerCase();
      var countRe = new RegExp('(?:^|[^0-9])(?:x' + outputCount + '|' + outputCount + 'x)(?:$|[^0-9])');
      if (countRe.test(cleaned)) result.countOk = true;
    }
    return result;
  }
  async function selectAspectRatioTab(popper, aspectRatio){
    var targetIcon = resolveRatioIcon(aspectRatio);
    if (!targetIcon) { sendLog('aspectRatio "' + aspectRatio + '" ไม่รองรับ', 'error'); return false; }
    var targetLabel = RATIO_LABEL_MAP[targetIcon] || targetIcon;
    sendLog('ตั้งค่า Ratio: ' + targetLabel + ' (' + aspectRatio + ')', 'info');
    var tabs = popper.querySelectorAll('button[role="tab"]');
    for (var i = 0; i < tabs.length; i++) {
      var icon = tabs[i].querySelector('i');
      if (!icon) continue;
      var iconText = (icon.textContent || '').trim().toLowerCase();
      if (iconText !== targetIcon) continue;
      var active = tabs[i].getAttribute('data-state') === 'active' || tabs[i].getAttribute('aria-selected') === 'true';
      if (active) { sendLog('Ratio ' + targetLabel + ' ถูกเลือกอยู่แล้ว', 'success'); return true; }
      await clickRadixTab(tabs[i]); await wait(500);
      active = tabs[i].getAttribute('data-state') === 'active' || tabs[i].getAttribute('aria-selected') === 'true';
      if (active) { sendLog('เลือก Ratio ' + targetLabel + ' สำเร็จ', 'success'); return true; }
      sendLog('Ratio อาจไม่เปลี่ยน (state: ' + tabs[i].getAttribute('data-state') + ')', 'warning');
      return false;
    }
    sendLog('หา tab ' + targetLabel + ' ไม่เจอ', 'error');
    return false;
  }
  function findCountTablist(popper){
    var tablists = popper.querySelectorAll('[role="tablist"]');
    var pattern = /^x?\\d+x?$/;
    for (var i = 0; i < tablists.length; i++) {
      var tabs = tablists[i].querySelectorAll('button[role="tab"]');
      if (!tabs.length) continue;
      var allMatch = true;
      for (var j = 0; j < tabs.length; j++) {
        var txt = (tabs[j].textContent || '').trim().toLowerCase();
        if (!pattern.test(txt)) { allMatch = false; break; }
      }
      if (allMatch) return tablists[i];
    }
    return null;
  }
  function findDurationTablist(popper){
    var tablists = popper.querySelectorAll('[role="tablist"]');
    var pattern = /^\\d+s$/;
    for (var i = 0; i < tablists.length; i++) {
      var tabs = tablists[i].querySelectorAll('button[role="tab"]');
      if (!tabs.length) continue;
      var allMatch = true;
      for (var j = 0; j < tabs.length; j++) {
        var txt = (tabs[j].textContent || '').trim().toLowerCase();
        if (!pattern.test(txt)) { allMatch = false; break; }
      }
      if (allMatch) return tablists[i];
    }
    return null;
  }
  async function selectOutputCountTab(popper, outputCount){
    var targetText = 'x' + outputCount;
    var altText = outputCount + 'x';
    sendLog('ตั้งค่าจำนวน: ' + targetText, 'info');
    var countTablist = findCountTablist(popper);
    if (!countTablist) { sendLog('ไม่พบ count tablist (Nx/xN) ใน popper', 'error'); return false; }
    var tabs = countTablist.querySelectorAll('button[role="tab"]');
    for (var i = 0; i < tabs.length; i++) {
      var txt = (tabs[i].textContent || '').trim().toLowerCase();
      if (txt !== targetText && txt !== altText && txt !== String(outputCount)) continue;
      var active = tabs[i].getAttribute('data-state') === 'active' || tabs[i].getAttribute('aria-selected') === 'true';
      if (active) { sendLog('จำนวน ' + targetText + ' ถูกเลือกอยู่แล้ว', 'success'); return true; }
      await clickRadixTab(tabs[i]); await wait(500);
      active = tabs[i].getAttribute('data-state') === 'active' || tabs[i].getAttribute('aria-selected') === 'true';
      if (active) { sendLog('เลือกจำนวน ' + targetText + ' สำเร็จ', 'success'); return true; }
      sendLog('จำนวนอาจไม่เปลี่ยน (state: ' + tabs[i].getAttribute('data-state') + ')', 'warning');
      return false;
    }
    sendLog('หา tab จำนวน ' + targetText + ' ไม่เจอ', 'error');
    return false;
  }
  async function selectDurationTab(popper, videoDuration){
    var targetText = videoDuration + 's';
    sendLog('ตั้งค่า Duration: ' + targetText, 'info');
    var durationTablist = findDurationTablist(popper);
    if (!durationTablist) { sendLog('ไม่พบ duration tablist ใน popper', 'error'); return false; }
    var tabs = durationTablist.querySelectorAll('button[role="tab"]');
    for (var i = 0; i < tabs.length; i++) {
      var txt = (tabs[i].textContent || '').trim().toLowerCase();
      if (txt !== targetText) continue;
      var active = tabs[i].getAttribute('data-state') === 'active' || tabs[i].getAttribute('aria-selected') === 'true';
      if (active) { sendLog('Duration ' + targetText + ' ถูกเลือกอยู่แล้ว', 'success'); return true; }
      await clickRadixTab(tabs[i]); await wait(500);
      active = tabs[i].getAttribute('data-state') === 'active' || tabs[i].getAttribute('aria-selected') === 'true';
      if (active) { sendLog('เลือก Duration ' + targetText + ' สำเร็จ', 'success'); return true; }
      sendLog('Duration อาจไม่เปลี่ยน (state: ' + tabs[i].getAttribute('data-state') + ')', 'warning');
      return false;
    }
    sendLog('หา tab Duration ' + targetText + ' ไม่เจอ', 'error');
    return false;
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
    var subModeLabel = 'Frames';
    var subModeIcons = ['crop_free', 'movie_filter', 'video_camera_front'];
    var subModeControlsKey = 'FRAMES';
    var subModeTextKeyword = 'frame';
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
    var selectedModelKey = isImageMode ? (imgModel || 'nano_banana_pro') : (vidModel || 'veo_31_fast');
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

  if (hSettings) {
    var check = checkCurrentValuesFromTrigger(ratio, count);
    popper = refetchPopper(popper);
    if (ratio && !check.ratioOk) {
      var ratioOk = await selectAspectRatioTab(popper, ratio);
      if (!ratioOk) { await closeConfigPopper(); return { success: false, error: 'ตั้งค่า aspect ratio ไม่สำเร็จ: ' + ratio, logs: logs }; }
      await wait(500);
    }
    if (count && !check.countOk) {
      popper = refetchPopper(popper);
      var countOk = await selectOutputCountTab(popper, count);
      if (!countOk) { await closeConfigPopper(); return { success: false, error: 'ตั้งค่า output count ไม่สำเร็จ: ' + count, logs: logs }; }
      await wait(500);
    }
    if (!isImageMode && duration) {
      popper = refetchPopper(popper);
      var durationOk = await selectDurationTab(popper, duration);
      if (!durationOk) { await closeConfigPopper(); return { success: false, error: 'ตั้งค่า video duration ไม่สำเร็จ: ' + duration + 's', logs: logs }; }
      await wait(500);
    }
  }

  await closeConfigPopper(); await wait(500);
  sendLog('ตั้งค่า Popper สำเร็จ!', 'success');
  return { success: true, logs: logs };
`;

import { FLOW_SELECTORS } from '../selectors';

const SLATE = FLOW_SELECTORS.slateEditor;

export const IMAGE_DIALOG_HELPERS_BODY = `
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
  function isDisabled(el){
    return !!(el && (
      el.disabled ||
      el.getAttribute('aria-disabled') === 'true' ||
      el.hasAttribute('disabled') ||
      el.hasAttribute('data-disabled') ||
      el.getAttribute('data-state') === 'disabled'
    ));
  }
  function textAndIcons(el){
    var parts = [el.textContent || '', el.getAttribute('aria-label') || '', el.getAttribute('title') || ''];
    var icons = Array.prototype.slice.call(el.querySelectorAll ? el.querySelectorAll('i, span, svg') : []);
    for (var i = 0; i < icons.length; i++) parts.push(icons[i].textContent || icons[i].getAttribute('aria-label') || '');
    return parts.join(' ').replace(/\\s+/g, ' ').trim().toLowerCase();
  }
  function hasIconText(el, values){
    var icons = Array.prototype.slice.call(el.querySelectorAll ? el.querySelectorAll('i, span') : []);
    for (var i = 0; i < icons.length; i++) {
      var iconText = (icons[i].textContent || '').trim().toLowerCase();
      if (values.indexOf(iconText) !== -1) return true;
    }
    return false;
  }
  function hasSubmitArrowNear(el){
    var container = el.parentElement;
    for (var depth = 0; depth < 10 && container; depth++) {
      if (hasIconText(container, ['arrow_forward', 'send'])) return true;
      container = container.parentElement;
    }
    return false;
  }
  function findPromptComposer(){
    var buttons = Array.prototype.slice.call(document.querySelectorAll('button, [role="button"]'));
    var submitButtons = buttons.filter(function(btn){
      if (!isVisible(btn) || isDisabled(btn) || btn.closest('[role="menu"]') || btn.closest('nav') || btn.closest('aside')) return false;
      return hasIconText(btn, ['arrow_forward', 'send']);
    });
    submitButtons.sort(function(a, b){
      var ar = a.getBoundingClientRect();
      var br = b.getBoundingClientRect();
      return (br.bottom - ar.bottom) || (br.right - ar.right);
    });
    for (var i = 0; i < submitButtons.length; i++) {
      var node = submitButtons[i];
      for (var depth = 0; node && depth < 12; depth++, node = node.parentElement) {
        if (
          node.querySelector &&
          node.querySelector('${SLATE}, [contenteditable="true"][role="textbox"], [contenteditable="true"], textarea') &&
          (node.querySelector('[aria-haspopup="dialog"]') || hasIconText(node, ['add', 'add_2', 'add_photo_alternate']))
        ) {
          return node;
        }
      }
    }
    var editor = document.querySelector('${SLATE}, [contenteditable="true"][role="textbox"], [contenteditable="true"], textarea');
    var node = editor;
    for (var ed = 0; node && ed < 12; ed++, node = node.parentElement) {
      if (node.querySelector && hasIconText(node, ['arrow_forward', 'send']) && hasIconText(node, ['add', 'add_2', 'add_photo_alternate'])) {
        return node;
      }
    }
    return null;
  }
  function isAddDialogTrigger(el, strictComposerScope){
    if (!el || !isVisible(el) || isDisabled(el)) return false;
    if (el.closest('[role="menu"]') || el.closest('nav') || el.closest('aside')) return false;
    var ariaHasDialog = el.getAttribute('aria-haspopup') === 'dialog';
    var haystack = textAndIcons(el);
    var hasAddIcon =
      haystack.indexOf('add_photo_alternate') !== -1 ||
      haystack.indexOf('add_2') !== -1 ||
      /(^|\\s)\\+(\\s|$)/.test(haystack) ||
      /(^|\\s)add(\\s|$)/.test(haystack);
    var hasCreateStartLabel =
      haystack.indexOf('create') !== -1 ||
      haystack.indexOf('start') !== -1 ||
      haystack.indexOf('เริ่ม') !== -1;
    if (strictComposerScope) {
      return hasAddIcon || (ariaHasDialog && hasCreateStartLabel);
    }
    return (ariaHasDialog && (hasAddIcon || hasCreateStartLabel)) || (hasAddIcon && hasSubmitArrowNear(el));
  }
  function dedupeElements(items){
    var result = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i] && result.indexOf(items[i]) === -1) result.push(items[i]);
    }
    return result;
  }
  function collectImageDialogTriggers(){
    var composer = findPromptComposer();
    var scoped = [];
    if (composer) {
      scoped = Array.prototype.slice.call(composer.querySelectorAll('button, [role="button"], [aria-haspopup="dialog"]'))
        .filter(function(el){ return isAddDialogTrigger(el, true); });
      scoped.sort(function(a, b){
        var ar = a.getBoundingClientRect();
        var br = b.getBoundingClientRect();
        return (br.bottom - ar.bottom) || (ar.left - br.left);
      });
      if (scoped.length) {
        return dedupeElements(scoped);
      }
    }
    var global = Array.prototype.slice.call(document.querySelectorAll('button, [role="button"], [aria-haspopup="dialog"]'))
      .filter(function(el){ return scoped.indexOf(el) === -1 && isAddDialogTrigger(el, false); });
    global.sort(function(a, b){
      var ar = a.getBoundingClientRect();
      var br = b.getBoundingClientRect();
      return (br.bottom - ar.bottom) || (ar.left - br.left);
    });
    return dedupeElements(scoped.concat(global));
  }
  function reactClick(el){
    if (!el) return null;
    var rect = el.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var fakeEvent = {
      type: 'click', target: el, currentTarget: el,
      nativeEvent: { type: 'click', isTrusted: true, button: 0, buttons: 1, clientX: cx, clientY: cy },
      preventDefault: function(){}, stopPropagation: function(){}, stopImmediatePropagation: function(){},
      isDefaultPrevented: function(){ return false; }, isPropagationStopped: function(){ return false; },
      persist: function(){}, bubbles: true, cancelable: true, button: 0, buttons: 1,
      clientX: cx, clientY: cy, isTrusted: true
    };
    var propsKey = Object.keys(el).find(function(k){ return k.indexOf('__reactProps$') === 0; });
    if (propsKey && el[propsKey] && typeof el[propsKey].onClick === 'function') {
      el[propsKey].onClick(fakeEvent);
      return 'reactProps.onClick';
    }
    var fiberKey = Object.keys(el).find(function(k){ return k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0; });
    if (fiberKey) {
      var fiber = el[fiberKey];
      for (var i = 0; i < 30 && fiber; i++) {
        var p = fiber.memoizedProps || fiber.pendingProps;
        if (p && typeof p.onClick === 'function') {
          p.onClick(fakeEvent);
          return 'fiber.onClick@' + i;
        }
        fiber = fiber.return;
      }
    }
    return null;
  }
  function dispatchPointerClick(el){
    var rect = el.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var pointerOpts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1, pointerId: 1, pointerType: 'touch', isPrimary: true };
    try {
      if (typeof PointerEvent !== 'undefined') {
        el.dispatchEvent(new PointerEvent('pointerover', pointerOpts));
        el.dispatchEvent(new PointerEvent('pointerenter', pointerOpts));
        el.dispatchEvent(new PointerEvent('pointerdown', pointerOpts));
        el.dispatchEvent(new PointerEvent('pointerup', pointerOpts));
      }
    } catch (e) {}
    try {
      var mouseOpts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };
      el.dispatchEvent(new MouseEvent('mouseover', mouseOpts));
      el.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
      el.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
      el.dispatchEvent(new MouseEvent('click', mouseOpts));
    } catch (e2) {}
  }
  async function waitForImageDialogAfterClick(ms){
    var started = Date.now();
    while (Date.now() - started < ms) {
      var dialog = getOpenDialog();
      if (dialog) return dialog;
      await wait(250);
    }
    return null;
  }
  async function clickDialogTrigger(trigger, attempt, source){
    try { trigger.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' }); } catch (e) {}
    await wait(120);
    showRipple(trigger);
    setStatus('กดปุ่ม + เพื่อเปิด dialog รูป (' + source + ', ครั้ง ' + attempt + ')', 'action');
    var reactMethod = reactClick(trigger);
    var dialog = await waitForImageDialogAfterClick(900);
    if (dialog) {
      setStatus('Dialog รูปเปิดแล้ว (' + (reactMethod || 'react-none') + ')', 'success');
      return dialog;
    }
    trigger.click();
    dialog = await waitForImageDialogAfterClick(900);
    if (dialog) {
      setStatus('Dialog รูปเปิดแล้ว (native.click)', 'success');
      return dialog;
    }
    dispatchPointerClick(trigger);
    dialog = await waitForImageDialogAfterClick(1200);
    if (dialog) {
      setStatus('Dialog รูปเปิดแล้ว (pointer/mouse fallback)', 'success');
      return dialog;
    }
    return null;
  }
  async function openImageDialog(){
    var existing = getOpenDialog();
    if (existing) return existing;
    var totalCandidates = 0;
    var clickedCandidates = 0;
    for (var attempt = 1; attempt <= 8; attempt++) {
      var triggers = collectImageDialogTriggers();
      totalCandidates = Math.max(totalCandidates, triggers.length);
      if (!triggers.length) {
        if (attempt === 1 || attempt === 4 || attempt === 8) {
          setStatus('ยังไม่พบปุ่ม + สำหรับแนบรูปใน composer (ครั้ง ' + attempt + '/8)', 'warning');
        }
        await wait(800);
        continue;
      }
      for (var i = 0; i < Math.min(3, triggers.length); i++) {
        clickedCandidates++;
        var dialog = await clickDialogTrigger(triggers[i], attempt, i === 0 ? 'composer' : 'fallback-' + i);
        if (dialog) return dialog;
        setStatus('กดปุ่ม + แล้ว dialog รูปยังไม่เปิด จะลองวิธีถัดไป', 'warning');
      }
      await wait(700);
    }
    if (clickedCandidates > 0) {
      throw new Error('กดปุ่ม + สำหรับแนบรูปแล้ว แต่ dialog รูปไม่เปิดบนเครื่องนี้');
    }
    throw new Error('หาปุ่ม + สำหรับแนบรูปใน Google Flow ไม่เจอ (candidate ' + totalCandidates + ')');
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
    var selectable = selectableImageItem(item);
    var isIndexedItem = selectable && selectable.hasAttribute && selectable.hasAttribute('data-index');
    var img = selectable && (selectable.querySelector('img') || (selectable.tagName === 'IMG' ? selectable : null));
    if (isIndexedItem && !img) {
      return true;
    }
    if (img && isVisible(img)) {
      var src = img.currentSrc || img.src || img.getAttribute('src') || '';
      if (!String(src || '').trim()) return true;
      if (img.complete === false) return true;
      if ((img.naturalWidth || 0) <= 20 || (img.naturalHeight || 0) <= 20) return true;
      var opacity = Number(window.getComputedStyle(img).opacity || '1');
      if (opacity < 0.95) return true;
    }
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

import { FLOW_SELECTORS } from '../selectors';
import { IMAGE_DIALOG_HELPERS_BODY } from './imageDialogHelpers';

const SLATE = FLOW_SELECTORS.slateEditor;
const SUBMIT_ICON = JSON.stringify(FLOW_SELECTORS.submitIcon);

export const SELECT_RECENT_IMAGE_BODY = `
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

export const UPLOAD_REFERENCE_IMAGE_BODY = `
  ${IMAGE_DIALOG_HELPERS_BODY}
  var dataUrl = String(args.dataUrl || '');
  var imageUrl = String(args.imageUrl || '');
  var fileName = String(args.fileName || 'kubdee-reference.png');
  var referenceLabel = String(args.referenceLabel || 'รูป reference');
  var allowTopReadyFallback = args.allowTopReadyFallback === true;
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
    var topIndexedItems = sortImageItemsByTop(Array.prototype.slice.call(scope.querySelectorAll('[data-testid="virtuoso-item-list"] [data-index], [data-index]'))
      .map(selectableImageItem)
      .filter(function(item){ return item && isVisible(item); }));
    for (var top = 0; top < Math.min(2, topIndexedItems.length); top++) {
      if (itemHasUploadActivity(topIndexedItems[top])) {
        return { active: true, percent: null, item: topIndexedItems[top], placeholder: true };
      }
    }
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
  function findReadyUploadedImageItem(dialog, knownSignatures, knownItems, lastUploadItem, trustLastUploadItem){
    var scope = dialog && dialog.isConnected ? dialog : document;
    var preferred = lastUploadItem && (lastUploadItem.closest('[data-index]') || lastUploadItem);
    if (preferred && readyImageItem(preferred)) {
      if (trustLastUploadItem) return preferred;
      var preferredSig = itemSignature(preferred);
      var preferredIsNewElement = knownItems.indexOf(preferred) === -1;
      if ((preferredSig && knownSignatures.indexOf(preferredSig) === -1) || preferredIsNewElement) return preferred;
    }
    var seen = [];
    var items = sortImageItemsByTop(imageItems(scope).filter(readyImageItem)).filter(function(item){
      if (seen.indexOf(item) !== -1) return false;
      seen.push(item);
      return true;
    });
    for (var i = 0; i < items.length; i++) {
      var sig = itemSignature(items[i]);
      var isNewSignature = sig && knownSignatures.indexOf(sig) === -1;
      var isNewElement = knownItems.indexOf(items[i]) === -1;
      if (isNewSignature || (knownSignatures.length === 0 && isNewElement)) return items[i];
    }
    return null;
  }
  async function waitForUploadedImageItem(dialog, knownSignatures, knownItems){
    var lastUploadItem = null;
    var sawUploadActivity = false;
    var uploadBecameIdleAt = 0;
    var idleDelayLogged = false;
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
      if (!isDialogOpen(activeDialog)) {
        setStatus('Dialog รูปปิดแล้วหลังอัปโหลด' + referenceLabel + ' — Google Flow น่าจะแนบรูปอัตโนมัติ', 'success');
        return { autoAttached: true, item: null };
      }
      var uploadActivity = getUploadActivity(activeDialog);
      if (uploadActivity.item) {
        lastUploadItem = uploadActivity.item;
        sawUploadActivity = true;
      }
      if (uploadActivity.active) {
        uploadBecameIdleAt = 0;
        idleDelayLogged = false;
        logUploadStatus(uploadActivity.percent ? ('ยังเห็น progress/blur ของ' + referenceLabel + ': ' + uploadActivity.percent) : 'ยังเห็น progress/blur/placeholder ของ' + referenceLabel + ' — Google Flow กำลังอัปโหลด/ประมวลผล...');
      } else {
        logUploadStatus((sawUploadActivity ? 'progress/blur หายไปแล้ว ' : '') + 'กำลังเช็ค' + referenceLabel + ' ในรายการรูป...');
      }
      if (!uploadActivity.active) {
        if (sawUploadActivity && !uploadBecameIdleAt) {
          uploadBecameIdleAt = Date.now();
          idleDelayLogged = true;
          setStatus('progress/blur/placeholder ของ' + referenceLabel + ' หายไปแล้ว — รอ 2 วิให้รายการนิ่งก่อนเช็ครูป', 'info');
        }
        if (uploadBecameIdleAt && Date.now() - uploadBecameIdleAt < 2000) {
          await wait(500);
          continue;
        } else if (idleDelayLogged) {
          idleDelayLogged = false;
          setStatus('รอ 2 วิหลัง progress/blur หายแล้ว กำลังเช็ค' + referenceLabel + ' ที่พร้อมเลือก', 'info');
        }
        var uploadedItem = findReadyUploadedImageItem(activeDialog, knownSignatures, knownItems, lastUploadItem, sawUploadActivity);
        if (uploadedItem) {
          var sig = itemSignature(uploadedItem) || ('item:' + (uploadedItem.getAttribute('data-index') || '?'));
          if (sig === stableSignature) stableCount += 1;
          else {
            stableSignature = sig;
            stableCount = 1;
          }
          if (stableCount === 1) {
            setStatus('เจอ' + referenceLabel + ' ที่พร้อมเลือกแล้ว กำลังรอให้รายการนิ่งอีกครั้ง [' + (uploadedItem.getAttribute('data-index') || '?') + ']', 'info');
          }
          if (stableCount >= 2) return { autoAttached: false, item: uploadedItem };
        } else {
          if (attempt === 0 || attempt % 5 === 0) {
            var readyCount = sortImageItemsByTop(imageItems(activeDialog).filter(readyImageItem)).length;
            setStatus((sawUploadActivity ? 'progress/blur หายแล้ว แต่' : '') + 'ยังเช็คไม่เจอ' + referenceLabel + ' ใหม่ที่พร้อมเลือก (รอบ ' + (attempt + 1) + '/90, รูปพร้อมเลือกทั้งหมด ' + readyCount + ')', 'warning');
          }
          stableSignature = '';
          stableCount = 0;
        }
      } else {
        stableSignature = '';
        stableCount = 0;
      }
      await wait(1000);
    }
    setStatus('รอครบเวลาแล้วยังเช็คไม่เจอ' + referenceLabel + ' ใหม่ที่พร้อมเลือก จะคืนผลล่าสุดให้ขั้นตอน fallback จัดการต่อ', 'warning');
    return { autoAttached: false, item: findReadyUploadedImageItem(getOpenDialog() || dialog, knownSignatures, knownItems, lastUploadItem, sawUploadActivity) };
  }
  async function waitBeforeUploadRetry(){
    dismissUploadRateLimitToast();
    for (var remaining = 30; remaining > 0; remaining -= 5) {
      setStatus('Google Flow จำกัดความถี่การอัปโหลดรูป — รอ ' + remaining + ' วิ แล้วจะลองอัปโหลดใหม่', 'warning');
      await wait(Math.min(5000, remaining * 1000));
    }
  }
  setStatus('เตรียม' + referenceLabel + ' สำหรับอัปโหลดเข้า Google Flow...', 'info');
  var resolvedDataUrl = await resolveDataUrl();
  setStatus('กำลังเปิด dialog เลือก' + referenceLabel + '...', 'action');
  var dialog = await openImageDialog();
  await handleAgreeDialog();
  dialog = getOpenDialog() || dialog;
  setStatus('Dialog เลือกรูปเปิดแล้ว กำลังเตรียมอัปโหลด' + referenceLabel + '...', 'info');
  var lastRateLimitText = '';
  for (var uploadAttempt = 1; uploadAttempt <= 2; uploadAttempt++) {
    dialog = getOpenDialog() || (dialog && isDialogOpen(dialog) ? dialog : null);
    if (!dialog) {
      setStatus('Dialog ปิดไปแล้ว กำลังเปิดใหม่ก่อน retry อัปโหลดรูป...', 'warning');
      dialog = await openImageDialog();
      await handleAgreeDialog();
      dialog = getOpenDialog() || dialog;
    }
    var knownItems = imageItems(dialog)
      .filter(readyImageItem)
      .map(function(item){ return item && (item.closest('[data-index]') || item); })
      .filter(Boolean);
    var known = knownItems.map(itemSignature).filter(Boolean);
    var knownInputs = Array.prototype.slice.call(document.querySelectorAll('input[type="file"]'));
    var uploadButton = findUploadButton(dialog);
    if (uploadButton) {
      setStatus('พบปุ่ม Upload แล้ว กำลังส่งไฟล์' + referenceLabel + ' (ครั้งที่ ' + uploadAttempt + '/2)...', 'action');
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
    setStatus('กำลังค้นหา file input สำหรับส่ง' + referenceLabel + ' ให้ Google Flow...', 'info');
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
    setStatus('กำลังใส่ไฟล์' + referenceLabel + ' เข้า file input และเริ่มอัปโหลด...', 'action');
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
      setStatus('Google Flow แนบ' + referenceLabel + ' อัตโนมัติแล้ว', 'success');
      return { success: true, dataIndex: null, autoAttached: true, rateLimitRetried: uploadAttempt > 1 };
    }
    setStatus('ส่งไฟล์แล้ว กำลังรอ Google Flow อัปโหลด/ประมวลผล' + referenceLabel + '...', 'info');
    var uploadResult = await waitForUploadedImageItem(dialog, known, knownItems);
    if (uploadResult.autoAttached) {
      setStatus('Google Flow แนบ' + referenceLabel + ' อัตโนมัติแล้ว', 'success');
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
      setStatus('อัปโหลด' + referenceLabel + ' แล้ว แต่ยังยืนยันรูปที่อัปโหลดใหม่ไม่ได้ จึงไม่เลือกจากรายการบนสุดเพื่อเลี่ยงเลือกผิด', 'warning');
    }
    if (!picked && allowTopReadyFallback) {
      setStatus('ยังยืนยัน' + referenceLabel + ' ใหม่ไม่ได้ แต่โหมดนี้อนุญาตให้เลือกรูปบนสุดหลังอัปโหลดได้ กำลังรอรายการนิ่ง...', 'warning');
      picked = await waitForStableTopReadyImageItem(dialog);
      if (picked) {
        setStatus('เลือกรูปบนสุดหลังอัปโหลดเป็น' + referenceLabel + ' ตาม fallback ของวิดีโอหลายฉาก', 'warning');
      }
    }
    if (!picked) {
      setStatus('ยังไม่พบ' + referenceLabel + ' ใหม่ที่พร้อมเลือก กำลังลองกด Add to Prompt...', 'warning');
      if (await clickAddToPrompt(dialog)) {
        if (await waitForDialogClosed(dialog, 5000)) return { success: true, dataIndex: null, confirmed: true, rateLimitRetried: uploadAttempt > 1 };
      }
    }
    if (!picked) throw new Error('อัปโหลด' + referenceLabel + ' แล้วแต่ไม่พบรูปใหม่ที่พร้อมเลือก');
    var dataIndex = picked.getAttribute('data-index');
    setStatus('อัปโหลดเสร็จแล้ว กำลังเลือก' + referenceLabel + ' บนสุด [' + (dataIndex || '?') + ']...', 'action');
    clickImageItem(picked);
    await wait(1000);
    if (!(await waitForDialogClosed(dialog, 5000))) {
      setStatus('เลือก' + referenceLabel + ' แล้ว กำลังกด Add to Prompt...', 'action');
      if (!(await clickAddToPrompt(dialog))) throw new Error('เลือก' + referenceLabel + ' อัปโหลดแล้วแต่ไม่พบปุ่ม Add to Prompt');
      if (!(await waitForDialogClosed(dialog, 5000))) throw new Error('เลือก' + referenceLabel + ' อัปโหลดแล้วแต่ dialog ยังไม่ปิด');
    }
    setStatus('แนบ' + referenceLabel + ' เข้า prompt สำเร็จ', 'success');
    return { success: true, dataIndex: dataIndex, rateLimitRetried: uploadAttempt > 1 };
  }
  throw new Error('Google Flow จำกัดความถี่การอัปโหลดรูป (' + (lastRateLimitText || 'uploading too quickly') + ') — รอ 30 วิและลองอัปโหลดใหม่แล้ว แต่ยังไม่สำเร็จ');
`;

export const ENSURE_VIDEO_REFERENCE_ATTACHED_BODY = `
  function setStatus(message, level){
    try {
      if (typeof __flowLog === 'function') __flowLog(String(message || ''), level || 'info');
    } catch (e) {}
  }
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
        var node = button && button.parentElement;
        for (var depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
          var text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
          var mediaCount = node.querySelectorAll('img, canvas, video, [data-card-open]').length;
          var dialogButtonCount = node.querySelectorAll('[aria-haspopup="dialog"]').length;
          if (mediaCount > 0 || dialogButtonCount >= 2 || /\\bstart\\b|\\bend\\b|เริ่ม|จบ/i.test(text)) {
            return node;
          }
        }
        return (button && button.parentElement) || composer;
      }
    }
    return composer;
  }
  function hasBackgroundImage(el){
    try {
      var bg = window.getComputedStyle(el).backgroundImage || '';
      return bg && bg !== 'none' && /url\\(/i.test(bg);
    } catch (e) {
      return false;
    }
  }
  function hasVisualMedia(el){
    if (!el || !isVisible(el)) return false;
    if (el.tagName && /^(IMG|CANVAS|VIDEO)$/i.test(el.tagName)) {
      if (el.tagName.toUpperCase() === 'IMG') {
        var src = el.currentSrc || el.src || el.getAttribute('src') || '';
        return !!String(src || '').trim();
      }
      return true;
    }
    if (hasBackgroundImage(el)) return true;
    var media = Array.prototype.slice.call(el.querySelectorAll('img, canvas, video'));
    for (var m = 0; m < media.length; m += 1) {
      if (hasVisualMedia(media[m])) return true;
    }
    var bgNodes = Array.prototype.slice.call(el.querySelectorAll('*')).slice(0, 80);
    for (var b = 0; b < bgNodes.length; b += 1) {
      if (isVisible(bgNodes[b]) && hasBackgroundImage(bgNodes[b])) return true;
    }
    return false;
  }
  function countAttachedMedia(scope){
    var visibleImages = Array.prototype.slice.call(scope.querySelectorAll('img')).filter(function(img){
      if (!isVisible(img)) return false;
      var src = img.currentSrc || img.src || img.getAttribute('src') || '';
      return !!String(src || '').trim();
    });
    var visibleCanvases = Array.prototype.slice.call(scope.querySelectorAll('canvas, video')).filter(isVisible);
    var visibleBackgrounds = Array.prototype.slice.call(scope.querySelectorAll('*')).filter(function(el){
      return isVisible(el) && hasBackgroundImage(el);
    });
    var visibleMediaCards = Array.prototype.slice.call(scope.querySelectorAll('[data-card-open], button, [role="button"], [aria-label]')).filter(function(card){
      if (!isVisible(card)) return false;
      if (card.hasAttribute('aria-haspopup')) return false;
      var label = (card.getAttribute('aria-label') || '').toLowerCase();
      if (card.hasAttribute('aria-label') && label && label.indexOf('image') === -1 && label.indexOf('รูป') === -1 && !hasVisualMedia(card)) return false;
      return hasVisualMedia(card);
    });
    return Math.max(
      visibleImages.length,
      visibleCanvases.length,
      visibleBackgrounds.length,
      visibleMediaCards.length
    );
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
    var attachedCount = Math.max(countAttachedMedia(frameScope), countAttachedMedia(composer));
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
  if (!result.ok) {
    setStatus('กำลังเช็ค reference ใน composer ก่อนสร้างวิดีโอ — ยังไม่เจอรูปที่แนบ: ' + (result.detail || result.error || 'ไม่พบ media card'), 'info');
  }
  for (var attempt = 1; !result.ok && attempt < 24; attempt++) {
    await wait(750);
    result = checkOnce();
    if (result.ok) {
      setStatus('เจอรูป reference ใน composer แล้ว พร้อมกดสร้างวิดีโอ (' + (result.attachedCount || 1) + ' รูป)', 'success');
    } else if (attempt === 1 || attempt % 4 === 0 || attempt >= 20) {
      setStatus('กำลังเช็ค reference ใน composer รอบ ' + (attempt + 1) + '/24 — ยังไม่เจอรูปที่แนบ: ' + (result.detail || result.error || 'ไม่พบ media card'), 'warning');
    }
  }
  if (!result.ok) {
    setStatus('เช็ค reference ครบแล้วแต่ยังไม่เจอรูปใน composer: ' + (result.detail || result.error || 'ไม่พบ media card'), 'error');
    throw new Error(result.error || 'ยังไม่มีรูป reference แนบในช่องวิดีโอ');
  }
  return { success: true, attachedCount: result.attachedCount || 1 };
`;

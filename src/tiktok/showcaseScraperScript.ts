import { PLACEHOLDER_VIDEO_BASE64 } from '@/tiktok/placeholderVideoBase64';

/**
 * PoC TikTok Showcase scraper — one self-contained async IIFE injected into the
 * TikTok Studio upload page. Ported from the desktop `runShowcaseWorkflow`
 * (kubdee-ai-desktop/src/main/services/flows/tiktok/showcaseWorkflow.ts).
 *
 * Desktop drives the page with synchronous CDP `evaluate` calls; here the whole
 * flow runs in-page and reports back through `window.ReactNativeWebView.postMessage`:
 *   { type: 'showcase-log', message }            — progress line
 *   { type: 'showcase-result', ok, products, error } — final result
 *
 * Flow: wait upload page → upload placeholder video → wait editor → click "เพิ่ม"
 * → ensure link type = สินค้า → Next → "นำเสนอสินค้า" tab → scrape table + paginate.
 * (PoC scrapes metadata + imageUrl only; image base64 download is added later.)
 */
export function buildShowcaseScraperScript(): string {
  return `(function(){
  if (window.__kubdeeShowcaseRan) { return; }
  window.__kubdeeShowcaseRan = true;

  var PLACEHOLDER = "${PLACEHOLDER_VIDEO_BASE64}";

  function post(o){ try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch(e){} }
  function log(m){ post({ type: 'showcase-log', message: String(m) }); }
  function done(ok, products, error){ post({ type: 'showcase-result', ok: !!ok, products: products || [], error: error ? String(error) : null }); }
  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  function qs(s){ return document.querySelector(s); }
  function textOf(s){ var el = qs(s); return el ? (el.textContent || '') : ''; }
  function visible(s){ var el = qs(s); return !!(el && (el.offsetParent !== null || el.getClientRects().length)); }
  function clickSel(s){ var el = qs(s); if (el) { el.click(); return true; } return false; }

  async function waitFor(fn, timeout, interval){
    var start = Date.now();
    while (Date.now() - start < timeout){
      try { if (fn()) return true; } catch(e){}
      await sleep(interval || 1000);
    }
    return false;
  }

  function waitUploadPage(){
    return waitFor(function(){
      return !!(qs('input[type="file"]') || qs('[data-e2e="select_video_container"]'));
    }, 30000, 1000);
  }

  function uploadPlaceholder(){
    try {
      var byteChars = atob(PLACEHOLDER);
      var byteNumbers = new Array(byteChars.length);
      for (var i = 0; i < byteChars.length; i++) { byteNumbers[i] = byteChars.charCodeAt(i); }
      var byteArray = new Uint8Array(byteNumbers);
      var blob = new Blob([byteArray], { type: 'video/mp4' });
      var file = new File([blob], 'placeholder.mp4', { type: 'video/mp4' });
      var input = qs('input[type="file"][accept*="video"]') || qs('input[type="file"]');
      if (input) {
        var dt = new DataTransfer(); dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true };
      }
      var dz = qs('[data-e2e="select_video_container"]') || qs('.upload-card') || qs('.upload-stage-container');
      if (dz) {
        var dt2 = new DataTransfer(); dt2.items.add(file);
        ['dragenter','dragover'].forEach(function(t){ dz.dispatchEvent(new DragEvent(t, { bubbles:true, cancelable:true, dataTransfer: dt2 })); });
        dz.dispatchEvent(new DragEvent('drop', { bubbles:true, cancelable:true, dataTransfer: dt2 }));
        return { success: true };
      }
      return { success: false, error: 'ไม่พบช่องอัปโหลดวิดีโอ' };
    } catch(e){ return { success: false, error: e.message }; }
  }

  function waitUploadComplete(){
    return waitFor(function(){
      var t = textOf('[data-e2e="upload_status_container"]');
      if (t && (t.indexOf('Uploaded') >= 0 || t.indexOf('อัปโหลดแล้ว') >= 0)) return true;
      if (visible('[data-e2e="upload_status_container"] [data-icon="CheckCircleFill"]')) return true;
      if (visible('[data-e2e="upload_status_container"] .info-status.success')) return true;
      return false;
    }, 180000, 2000);
  }

  function waitEditor(){
    return waitFor(function(){
      if (visible('.public-DraftEditor-content')) return true;
      if (visible('div[data-e2e="anchor_container"]')) return true;
      var btns = document.querySelectorAll('button, .TUXButton');
      for (var i=0;i<btns.length;i++){ var t = btns[i].textContent || ''; if (t.indexOf('Post')>=0 || t.indexOf('โพสต์')>=0) return true; }
      return false;
    }, 120000, 2000);
  }

  function clickAdd(){
    var container = qs('div[data-e2e="anchor_container"]');
    if (!container) return false;
    var btn = container.querySelector('.TUXButton');
    if (!btn) {
      var buttons = container.querySelectorAll('button');
      for (var i=0;i<buttons.length;i++){ var t = buttons[i].textContent || ''; if (t.indexOf('เพิ่ม')>=0 || t.indexOf('Add')>=0){ btn = buttons[i]; break; } }
    }
    if (btn){ btn.click(); return true; }
    return false;
  }

  async function ensureProductType(){
    var dropdownBtn = qs('button.TUXSelect-button[role="combobox"]');
    if (!dropdownBtn) return;
    var selectedLabel = dropdownBtn.querySelector('.select-option-label');
    var placeholderEl = dropdownBtn.querySelector('.TUXSelect-buttonText--placeholder');
    var cur = selectedLabel ? selectedLabel.textContent.trim() : '';
    var isProduct = cur === 'สินค้า' || cur.toLowerCase().indexOf('product') >= 0;
    if (!placeholderEl && isProduct) return;
    dropdownBtn.click();
    await sleep(1500);
    var options = document.querySelectorAll('[role="option"], [role="listbox"] li, .TUXSelect-option');
    for (var i=0;i<options.length;i++){ var t = options[i].textContent.trim(); if (t.indexOf('สินค้า')>=0 || t.indexOf('Product')>=0){ options[i].click(); break; } }
    await sleep(500);
  }

  function clickNext(){
    var footerSelectors = ['.common-modal-footer', '.button-group'];
    for (var s=0;s<footerSelectors.length;s++){
      var footers = document.querySelectorAll(footerSelectors[s]);
      for (var f=0;f<footers.length;f++){
        var buttons = footers[f].querySelectorAll('.TUXButton, button');
        for (var b=0;b<buttons.length;b++){
          var labelEl = buttons[b].querySelector('.TUXButton-label');
          var label = labelEl ? labelEl.textContent.trim() : buttons[b].textContent.trim();
          if (label === 'ถัดไป' || label === 'Next'){ buttons[b].click(); return true; }
        }
      }
    }
    return false;
  }

  function clickShowcaseTab(){
    var labels = ['นำเสนอสินค้า','Showcase products'];
    var tabs = document.querySelectorAll('.TUXTabBar-itemTitle, .TUXTabBar-item');
    for (var i=0;i<tabs.length;i++){ var t = (tabs[i].textContent||'').trim(); for (var l=0;l<labels.length;l++){ if (t.indexOf(labels[l])>=0){ tabs[i].click(); return true; } } }
    return false;
  }

  function scrapePage(){
    var products = [];
    var rows = document.querySelectorAll('tr.product-tb-row');
    for (var i=0;i<rows.length;i++){
      try {
        var row = rows[i];
        var cells = row.querySelectorAll('td');
        if (cells.length < 4) continue;
        var nameEl = row.querySelector('span.product-name');
        var name = nameEl ? nameEl.textContent.trim() : '';
        var imgEl = row.querySelector('img.product-image');
        var imageUrl = imgEl ? imgEl.src : '';
        var productIdCell = cells[1] ? cells[1].querySelector('.product-tb-cell') : null;
        var productId = productIdCell ? productIdCell.textContent.trim() : '';
        var priceCell = cells[2] ? cells[2].querySelector('.product-tb-cell') : null;
        var priceText = priceCell ? priceCell.textContent.trim() : '';
        var price = priceText.replace(/[^\\d.]/g, '');
        var stockCell = cells[3] ? cells[3].querySelector('.product-tb-cell') : null;
        var stockText = stockCell ? stockCell.textContent.trim() : '';
        var stock = parseInt(stockText.replace(/,/g, ''), 10) || 0;
        var statusEl = row.querySelector('.product-status');
        var status = statusEl ? statusEl.textContent.trim() : '';
        var isActive = (status === 'ดำเนินอยู่' || status === 'Active');
        if (name && productId && isActive){ products.push({ name:name, productId:productId, imageUrl:imageUrl, price:price, stock:stock, status:status }); }
      } catch(e){}
    }
    var currentPage = 1, lastPage = 1;
    var activePage = qs('.tiktok-pagination-item-is-active');
    if (activePage){ var n = parseInt(activePage.textContent.trim(),10); if (!isNaN(n)) currentPage = n; }
    var pageItems = document.querySelectorAll('.tiktok-pagination-item');
    for (var p=0;p<pageItems.length;p++){
      if (pageItems[p].classList.contains('tiktok-pagination-item-left-arrow') || pageItems[p].classList.contains('tiktok-pagination-item-right-arrow') || pageItems[p].classList.contains('tiktok-pagination-item-no-border')) continue;
      var pn = parseInt(pageItems[p].textContent.trim(),10); if (!isNaN(pn) && pn > lastPage) lastPage = pn;
    }
    return { products: products, currentPage: currentPage, lastPage: lastPage, hasNextPage: currentPage < lastPage };
  }

  (async function(){
    try {
      log('รอหน้าอัปโหลด TikTok Studio...');
      if (!(await waitUploadPage())) { done(false, [], 'ไม่พบหน้าอัปโหลด (30 วิ) — เช็คว่า login โปรไฟล์นี้แล้วหรือยัง'); return; }
      log('อัปโหลดวิดีโอ placeholder...');
      var up = uploadPlaceholder();
      if (!up.success){ done(false, [], up.error || 'อัปโหลดไม่สำเร็จ'); return; }
      log('รอวิดีโออัปโหลดเสร็จ...');
      if (await waitUploadComplete()) { log('อัปโหลดเสร็จ'); } else { log('เช็คสถานะอัปโหลดไม่ได้ (อาจเสร็จแล้ว)'); }
      log('รอหน้าแก้ไข (editor)...');
      if (!(await waitEditor())){ done(false, [], 'ไม่พบหน้าแก้ไข (2 นาที)'); return; }
      log('คลิกปุ่มเพิ่มสินค้า...');
      if (!clickAdd()){ done(false, [], 'ไม่พบปุ่มเพิ่มสินค้า (anchor_container)'); return; }
      await sleep(2000);
      log('ตรวจประเภทลิงก์ = สินค้า...');
      await ensureProductType();
      log('คลิกถัดไป...');
      if (!clickNext()){ done(false, [], 'ไม่พบปุ่มถัดไป'); return; }
      await sleep(1500);
      log('เลือกแท็บนำเสนอสินค้า...');
      clickShowcaseTab();
      await sleep(1500);
      log('ดึงข้อมูลสินค้า...');
      var all = [];
      var guard = 0;
      while (guard < 100){
        guard++;
        var sc = scrapePage();
        for (var i=0;i<sc.products.length;i++){ all.push(sc.products[i]); }
        log('หน้า ' + sc.currentPage + '/' + sc.lastPage + ': ' + sc.products.length + ' ชิ้น (รวม ' + all.length + ')');
        if (!sc.hasNextPage) break;
        if (!clickSel('.tiktok-pagination-item-right-arrow')) break;
        await sleep(1500);
      }
      done(true, all, null);
    } catch(e){ done(false, [], (e && e.message) || e); }
  })();
})(); true;`;
}

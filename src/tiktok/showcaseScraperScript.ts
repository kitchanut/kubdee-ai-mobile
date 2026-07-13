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

  function findAddLinkButton(){
    // 1) original desktop selector
    var container = qs('div[data-e2e="anchor_container"]');
    if (container){ var b = container.querySelector('.TUXButton') || container.querySelector('button'); if (b) return b; }
    // 2) any anchor-ish container
    var anchors = document.querySelectorAll('[data-e2e*="anchor"], [class*="anchor"], [class*="Anchor"]');
    for (var i=0;i<anchors.length;i++){ if (anchors[i].querySelector){ var bb = anchors[i].querySelector('.TUXButton, button, [role="button"]'); if (bb) return bb; } }
    // 3) by text: an "เพิ่ม"/"Add"/"เพิ่มลิงก์" button
    var buttons = document.querySelectorAll('.TUXButton, button, [role="button"]');
    for (var j=0;j<buttons.length;j++){ var t = (buttons[j].textContent||'').trim(); if (t === 'เพิ่ม' || t === 'Add' || t.indexOf('เพิ่มลิงก์')>=0 || t.indexOf('Add link')>=0 || t.indexOf('ลิงก์สินค้า')>=0){ return buttons[j]; } }
    return null;
  }

  function clickAdd(){
    var btn = findAddLinkButton();
    if (btn){ btn.click(); return true; }
    return false;
  }

  // Diagnostic dump for updating selectors when the flow stalls (posts to logcat via the modal).
  function domDiag(){
    var e2e = [], seen = {};
    document.querySelectorAll('[data-e2e]').forEach(function(el){ var v = el.getAttribute('data-e2e'); if(!seen[v]){ seen[v]=1; e2e.push(v); } });
    var btns = [];
    document.querySelectorAll('.TUXButton, button, [role="button"]').forEach(function(el){
      var t = (el.textContent||'').trim().slice(0,24); if (!t) return;
      btns.push(t + ' | e2e=' + (el.getAttribute('data-e2e')||'') + ' | cls=' + ((el.className||'')+'').slice(0,44));
    });
    return { url: location.href, e2e: e2e, buttons: btns.slice(0, 70) };
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
    var tabs = document.querySelectorAll('.TUXTabBar-itemTitle, .TUXTabBar-item, [role="tab"]');
    for (var i=0;i<tabs.length;i++){
      var t = (tabs[i].textContent||'').trim();
      for (var l=0;l<labels.length;l++){
        if (t.indexOf(labels[l])>=0){
          var target = tabs[i].closest('[role="tab"], .TUXTabBar-item') || tabs[i];
          target.click();
          return true;
        }
      }
    }
    return false;
  }

  function showcaseArea(){
    var candidates = document.querySelectorAll('[role="dialog"], [class*="common-modal"], [class*="TUXModal"]');
    for (var i=0;i<candidates.length;i++){
      var text = (candidates[i].textContent || '').replace(/\\s+/g, ' ');
      var hasShowcase = text.indexOf('นำเสนอสินค้า') >= 0 || text.indexOf('Showcase products') >= 0;
      var hasProductColumns = text.indexOf('ID สินค้า') >= 0 || text.indexOf('Product ID') >= 0;
      if (hasShowcase && hasProductColumns) return candidates[i];
    }
    return document;
  }

  function showcaseListReady(){
    var area = showcaseArea();
    return !!area.querySelector('tr.product-tb-row, table tbody, [class*="product-table"] tbody, [data-e2e*="product-list"], [data-testid*="product-list"], [class*="product-list"], [data-e2e*="empty"], [class*="product"][class*="empty"]');
  }

  // Diagnostic for when 0 products scrape — dumps the real modal/list structure so we
  // can rewrite selectors (TikTok moved off the old <table> layout).
  function scrapeDiag(){
    var modal = document.querySelector('[role="dialog"]') || document.querySelector('[class*="common-modal"]') || document.querySelector('[class*="TUXModal"]') || document.querySelector('[class*="modal"]');
    var area = modal || document.body;
    var html = '';
    try {
      html = area.innerHTML
        .replace(/<svg[\\s\\S]*?<\\/svg>/g, '<svg/>')
        .replace(/<style[\\s\\S]*?<\\/style>/g, '')
        .replace(/\\s+/g, ' ')
        .slice(0, 2600);
    } catch(e){ html = 'ERR ' + (e && e.message); }
    return {
      allTr: document.querySelectorAll('tr').length,
      modalCls: modal ? ((modal.className||'')+'').slice(0,70) : 'NO-MODAL',
      html: html
    };
  }

  function firstIn(root, selectors){
    for (var i=0;i<selectors.length;i++){ var found = root.querySelector(selectors[i]); if (found) return found; }
    return null;
  }

  function cleanText(el){ return el ? (el.textContent || '').replace(/\\s+/g, ' ').trim() : ''; }

  function productRows(){
    var area = showcaseArea();
    var selectors = ['tr.product-tb-row', 'table tbody tr', '[class*="product-table"] tbody tr', '[data-e2e*="product-list"] [data-e2e*="product-row"]', '[data-testid*="product-list"] [data-testid*="product-row"]', '[data-e2e*="product-item"]', '[data-testid*="product-item"]', '[class*="product-list"] [class*="product-item"]'];
    for (var i=0;i<selectors.length;i++){ var rows = area.querySelectorAll(selectors[i]); if (rows.length) return rows; }
    return [];
  }

  function getCurrentPage(){
    var active = firstIn(document, ['.tiktok-pagination-item-is-active', '.tiktok-pagination-item[aria-current="page"]', '[class*="pagination"] [aria-current="page"]']);
    var n = parseInt(cleanText(active), 10);
    return isNaN(n) ? 1 : n;
  }

  function findNextPageButton(){
    var selectors = ['.tiktok-pagination-item-right-arrow', 'button[aria-label="Next page"]', 'button[aria-label="ถัดไป"]', '[class*="pagination"] button[aria-label*="next" i]'];
    for (var i=0;i<selectors.length;i++){
      var el = qs(selectors[i]);
      if (!el) continue;
      var cls = ((el.className || '') + '').toLowerCase();
      var disabledParent = el.closest('[aria-disabled="true"], [class*="disabled"]');
      if (!el.disabled && el.getAttribute('aria-disabled') !== 'true' && cls.indexOf('disabled') < 0 && !disabledParent) return el;
    }
    return null;
  }

  function scrapePage(){
    var products = [];
    var rows = productRows();
    for (var i=0;i<rows.length;i++){
      try {
        var row = rows[i];
        var cells = row.querySelectorAll('td, [role="cell"]');
        var nameEl = firstIn(row, ['span.product-name', '[data-e2e*="product-name"]', '[data-testid*="product-name"]', '[class*="product-name"]']);
        var name = cleanText(nameEl);
        if (!name && cells[0]) name = cleanText(cells[0]).replace(/(?:รหัสสินค้า|Product ID|ID)\\s*[:：]?\\s*\\d+/i, '').trim();
        var imgEl = firstIn(row, ['img.product-image', '[data-e2e*="product-image"] img', '[data-testid*="product-image"] img', 'img[src]']);
        var imageUrl = imgEl ? (imgEl.currentSrc || imgEl.src || '') : '';
        var productIdEl = firstIn(row, ['[data-e2e*="product-id"]', '[data-testid*="product-id"]', '[class*="product-id"]']);
        var productIdText = cleanText(productIdEl) || (row.getAttribute('data-product-id') || '') || (cells[1] ? cleanText(cells[1]) : '');
        var productIdMatch = productIdText.match(/(?:รหัสสินค้า|Product ID|ID)?\\s*[:：]?\\s*(\\d{5,})/i);
        var productId = productIdMatch ? productIdMatch[1] : '';
        var priceEl = firstIn(row, ['[data-e2e*="price"]', '[data-testid*="price"]', '[class*="product-price"]']);
        var priceText = cleanText(priceEl) || (cells[2] ? cleanText(cells[2]) : '');
        var priceMatch = priceText.replace(/,/g, '').match(/\\d+(?:\\.\\d+)?/);
        var price = priceMatch ? priceMatch[0] : '';
        var stockEl = firstIn(row, ['[data-e2e*="stock"]', '[data-testid*="stock"]', '[class*="product-stock"]']);
        var stockText = cleanText(stockEl) || (cells[3] ? cleanText(cells[3]) : '');
        var stockMatch = stockText.replace(/,/g, '').match(/\\d+/);
        var stock = stockMatch ? parseInt(stockMatch[0], 10) || 0 : 0;
        var statusEl = firstIn(row, ['.product-status', '[data-e2e*="status"]', '[data-testid*="status"]', '[class*="product-status"]']);
        var status = cleanText(statusEl);
        if (!status){ var rowText = cleanText(row); if (/(?:^|\\s)ดำเนินอยู่(?:\\s|$)/.test(rowText)) status = 'ดำเนินอยู่'; else if (/(?:^|\\s)Active(?:\\s|$)/i.test(rowText)) status = 'Active'; }
        var isActive = (status === 'ดำเนินอยู่' || status.toLowerCase() === 'active');
        if (name && productId && isActive){ products.push({ name:name, productId:productId, imageUrl:imageUrl, price:price, stock:stock, status:status }); }
      } catch(e){}
    }
    var currentPage = getCurrentPage(), lastPage = currentPage;
    var pageItems = document.querySelectorAll('.tiktok-pagination-item, [class*="pagination"] [role="button"]');
    for (var p=0;p<pageItems.length;p++){
      if (pageItems[p].classList.contains('tiktok-pagination-item-left-arrow') || pageItems[p].classList.contains('tiktok-pagination-item-right-arrow') || pageItems[p].classList.contains('tiktok-pagination-item-no-border')) continue;
      var pn = parseInt(cleanText(pageItems[p]),10); if (!isNaN(pn) && pn > lastPage) lastPage = pn;
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
      window.scrollTo(0, 0);
      await sleep(1500);
      if (!clickAdd()){
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(1500);
        if (!clickAdd()){
          log('DIAG ' + JSON.stringify(domDiag()));
          done(false, [], 'ไม่พบปุ่มเพิ่มสินค้า — ดู DIAG ใน log');
          return;
        }
      }
      await sleep(2000);
      log('ตรวจประเภทลิงก์ = สินค้า...');
      await ensureProductType();
      log('คลิกถัดไป...');
      if (!clickNext()){ done(false, [], 'ไม่พบปุ่มถัดไป'); return; }
      await sleep(1500);
      log('เลือกแท็บนำเสนอสินค้า...');
      if (!clickShowcaseTab()){ done(false, [], 'ไม่พบแท็บนำเสนอสินค้า'); return; }
      if (!(await waitFor(showcaseListReady, 30000, 500))){
        log('DIAG ' + JSON.stringify(domDiag()));
        done(false, [], 'รายการสินค้านำเสนอไม่พร้อม (30 วิ)');
        return;
      }
      log('ดึงข้อมูลสินค้า...');
      var all = [];
      var seenProductIds = {};
      var guard = 0;
      while (guard < 100){
        guard++;
        var sc = scrapePage();
        for (var i=0;i<sc.products.length;i++){
          var product = sc.products[i];
          if (!seenProductIds[product.productId]){ seenProductIds[product.productId] = true; all.push(product); }
        }
        log('หน้า ' + sc.currentPage + '/' + sc.lastPage + ': ' + sc.products.length + ' ชิ้น (รวม ' + all.length + ')');
        if (!sc.hasNextPage) break;
        var previousPage = sc.currentPage;
        var nextButton = findNextPageButton();
        if (!nextButton) break;
        nextButton.click();
        if (!(await waitFor(function(){ return getCurrentPage() !== previousPage; }, 15000, 300))){
          log('ปุ่มหน้าถัดไปไม่เปลี่ยนหน้า — บันทึกรายการที่ดึงได้ ' + all.length + ' ชิ้น');
          break;
        }
        await waitFor(showcaseListReady, 10000, 300);
      }
      if (all.length === 0){
        done(false, [], 'SCRAPE-DIAG ' + JSON.stringify(scrapeDiag()));
        return;
      }
      done(true, all, null);
    } catch(e){ done(false, [], (e && e.message) || e); }
  })();
})(); true;`;
}

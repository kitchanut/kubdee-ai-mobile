/**
 * Shared desktop spoof for the TikTok WebViews (login + Showcase scraper).
 *
 * A desktop User-Agent alone is not enough: TikTok also detects mobile via touch/platform
 * signals and (a) deep-links into the native app and (b) gates the Creator Showcase, serving
 * an empty modal on mobile even for an account that has products on real desktop. So before
 * TikTok's own scripts run we override those signals and force a wide desktop viewport,
 * zoomed out so the full width fits the phone screen.
 *
 * Applying this at LOGIN time (not just when scraping) is intentional — the session may be
 * tagged desktop/mobile when it is created, so logging in under the desktop spoof gives a
 * "desktop" session that should unlock the Showcase.
 */
export const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const DESKTOP_ENV_SPOOF = `(function(){
  try { Object.defineProperty(navigator, 'maxTouchPoints', { get: function(){ return 0; }, configurable: true }); } catch(e){}
  try { Object.defineProperty(navigator, 'platform', { get: function(){ return 'MacIntel'; }, configurable: true }); } catch(e){}
  try { Object.defineProperty(navigator, 'vendor', { get: function(){ return 'Google Inc.'; }, configurable: true }); } catch(e){}
  try { Object.defineProperty(navigator, 'userAgentData', { get: function(){ return undefined; }, configurable: true }); } catch(e){}
  try { delete window.ontouchstart; } catch(e){}

  var DESKTOP_WIDTH = Math.max(1024, Number(window.__kubdeeDesktopWidth) || 1440);
  var deviceWidth = Number(window.__kubdeeDesktopDeviceWidth) || Number(screen && screen.width) || 360;
  var fitScale = Math.max(0.1, Math.min(1, deviceWidth / DESKTOP_WIDTH));
  var s = fitScale.toFixed(4);
  // ล็อก zoom ที่ระดับ fit เป็นค่า default ทุกหน้าอัตโนมัติ — กัน mobile WebView auto-zoom ตอน focus
  // ช่อง caption/ค้นหา (ทำให้ปุ่ม/เลย์เอาต์เพี้ยนกลางการทำงาน) เฉพาะหน้า login ตั้ง __kubdeeAllowZoom
  // เพื่อให้ผู้ใช้ pinch-zoom กรอกรหัสได้
  var WANT = window.__kubdeeAllowZoom
    ? 'width=' + DESKTOP_WIDTH + ', initial-scale=' + s + ', minimum-scale=0.1, maximum-scale=3, user-scalable=yes'
    : 'width=' + DESKTOP_WIDTH + ', initial-scale=' + s + ', minimum-scale=' + s + ', maximum-scale=' + s + ', user-scalable=no';
  function apply(){
    var m = document.querySelector('meta[name="viewport"]');
    if (!m){ m = document.createElement('meta'); m.setAttribute('name','viewport'); (document.head||document.documentElement).appendChild(m); }
    if (m.getAttribute('content') !== WANT) m.setAttribute('content', WANT);
  }
  apply();
  try {
    if (window.__kubdeeDesktopViewportObserver) window.__kubdeeDesktopViewportObserver.disconnect();
    window.__kubdeeDesktopViewportObserver = new MutationObserver(apply);
    window.__kubdeeDesktopViewportObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['content', 'name']
    });
  } catch(e){}
  try { document.addEventListener('DOMContentLoaded', apply, { once:true }); } catch(e){}
  try { window.addEventListener('load', apply, { once:true }); } catch(e){}
  setTimeout(apply, 250);
  setTimeout(apply, 1000);
})(); true;`;

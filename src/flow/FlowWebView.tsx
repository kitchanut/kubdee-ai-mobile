import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import type { WebViewRenderProcessGoneEvent, WebViewTerminatedEvent } from 'react-native-webview/lib/WebViewTypes';

import { buildActionScript } from '@kubdee/flow-core';
import type { FlowActionName, FlowActionResult } from '@kubdee/flow-core';

// เปิด Chrome DevTools/CDP inspect หน้า Google Flow ผ่าน adb/USB (localhost เท่านั้น
// remote ต่อไม่ได้) — ช่วย debug ตอน Google Flow เปลี่ยน UI (เช่น การแนบรูปช่อง Start
// ของโหมดวิดีโอ). ไม่กระทบการทำงาน/perf. ความเสี่ยง = คนที่ต่อ USB+adb เข้าเครื่องดู
// session ในหน้า Flow ได้ — ตั้ง false ก่อน distribute ให้คนนอกทีมถ้ากังวล
const FLOW_WEBVIEW_DEBUG_ENABLED = true;

export type FlowConnectionState = 'unknown' | 'signin' | 'loggedout' | 'connected';

// Renderer (process แยกของ Chromium) crash/ถูกระบบฆ่าแล้ว native WebView ตัวนี้ตายถาวร
// (RNCWebViewClient คืน true กันแอป crash แต่ inject อะไรต่อก็เงียบหมด) — ทางฟื้นเดียวคือ
// parent remount ด้วย key ใหม่ ระหว่างนั้นทุก action ต้อง fail ทันทีด้วยข้อความนี้
// แทนที่จะปล่อยให้รอ timeout เต็มทีละ 20-120 วิ แบบแยกไม่ออกว่าเกิดอะไร
// (runnerPlanning จับคำว่า "WebView renderer gone" เพื่อ abort run — ห้ามเปลี่ยนข้อความโดยไม่แก้คู่กัน)
export const FLOW_RENDERER_GONE_ERROR =
  'หน้า Google Flow crash (WebView renderer gone) — รีสตาร์ทหน้า Flow ใหม่แล้ว กรุณาเริ่มรันใหม่';

type PendingFlowAction = { resolve: (r: FlowActionResult) => void; timer: ReturnType<typeof setTimeout> };

function failAllPendingActions(pending: Map<string, PendingFlowAction>, error: string): void {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.resolve({ ok: false, error });
  }
  pending.clear();
}

export interface FlowAccount {
  email?: string;
  name?: string;
  photo?: string;
}

export interface FlowActionLogEntry {
  id: string;
  action: FlowActionName;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error' | 'action';
  ts: number;
}

export const FLOW_ENGLISH_URL = 'https://labs.google/fx/en/tools/flow';
export const FLOW_URL = FLOW_ENGLISH_URL;

export interface FlowLanguageIssue {
  locale: string;
  url: string;
}

export function getFlowLanguageIssue(url: string | null | undefined): FlowLanguageIssue | null {
  try {
    const parsedUrl = new URL(url || '');
    if (parsedUrl.hostname !== 'labs.google') return null;

    const localeMatch = parsedUrl.pathname.match(/^\/fx\/([^/]+)\/tools\/flow(?:\/|$)/i);
    if (!localeMatch) return null;

    const locale = localeMatch[1] || '';
    if (/^en(?:-|$)/i.test(locale)) return null;

    return { locale, url: parsedUrl.href };
  } catch {
    return null;
  }
}

// UA สลับตามโฮสต์ (per-host) ภายใน WebView เดียวกัน:
// - labs.google ต้องเป็น DESKTOP Chrome — ตั้งแต่ 2026-07-14 Flow เวอร์ชันใหม่ crash
//   ทั้งหน้าเมื่อเสิร์ฟ mobile experience (TypeError: reading 'service' ในหน้า project)
//   ยืนยันด้วย CDP บนเครื่องจริง: UA mobile = Application error ทุกครั้ง
// - accounts.google.com (และโฮสต์อื่น) ต้องเป็น MOBILE Chrome (NO "; wv" token) —
//   ใช้ desktop Mac UA บนเครื่อง Android จริง Google จับ mismatch ได้แล้วบล็อก sign-in
//   ("เบราว์เซอร์หรือแอปนี้อาจไม่ปลอดภัย") ส่วน mobile UA ตัวนี้ login ผ่านมาตลอด
//   ก่อน e6b7f46 — ห้ามใช้ desktop UA กับหน้า login เด็ดขาด
const CHROME_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
const CHROME_MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-A075F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36';

function userAgentForUrl(url: string): string {
  try {
    return new URL(url).hostname === 'labs.google' ? CHROME_DESKTOP_UA : CHROME_MOBILE_UA;
  } catch {
    return CHROME_DESKTOP_UA;
  }
}

// บังคับ viewport เป็นความกว้างจอคอม (1280px) ให้ Flow เรนเดอร์เหมือนเปิดบน desktop จริง
// ทุกมิติ ไม่ใช่แค่ UA — layout/พฤติกรรม refresh ของ Flow จะตรงกับที่ desktop app ใช้แล้วเวิร์ค
// (Next.js อาจเขียน meta viewport ทับหลัง hydrate จึงต้องคอยบังคับซ้ำช่วงแรกของทุก page load)
const FORCE_DESKTOP_VIEWPORT_JS = `
(function () {
  try {
    if (window.__kbDesktopViewportLocked) return;
    window.__kbDesktopViewportLocked = true;
    // บังคับเฉพาะหน้า labs.google — หน้า login (accounts.google.com) คง viewport มือถือปกติ
    if (window.location.hostname !== 'labs.google') return;
    // user-scalable=no กัน Android auto-zoom ตอน focus ช่อง prompt (zoom แล้วไม่คืน)
    var content = 'width=1280, user-scalable=no';
    function applyViewport() {
      var meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        if (!document.head) return;
        meta = document.createElement('meta');
        meta.setAttribute('name', 'viewport');
        document.head.appendChild(meta);
      }
      if (meta.getAttribute('content') !== content) meta.setAttribute('content', content);
    }
    applyViewport();
    // ทับทันทีที่ Next.js เขียน meta viewport กลับ — ห้ามใช้ interval เพราะจอจะ
    // กระพริบสลับขนาดคอม/มือถือ (observer ทับก่อน paint จึงไม่เห็นการกระพริบ)
    var observer = new MutationObserver(applyViewport);
    function observeHead() {
      if (!document.head) return false;
      observer.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content', 'name'] });
      return true;
    }
    if (!observeHead()) document.addEventListener('DOMContentLoaded', observeHead);
  } catch (e) {}
})();
true;
`;

// Runs in the page after each document load. Detects whether Google Flow is
// signed in (dashboard has a "New project" button), logged out (marketing CTA),
// or on the Google sign-in page, and reports it back to React Native. The page
// is a SPA so content arrives asynchronously — re-check on an interval.
const STATUS_JS = `
(function(){
  if (window.__kbFlowStatus) return true;
  window.__kbFlowStatus = true;
  var EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}/i;
  function detect(){
    try {
      var href = location.href || '';
      if (href.indexOf('accounts.google.com') !== -1) return 'signin';
      var btns = Array.prototype.slice.call(document.querySelectorAll('button'));
      var hasNew = btns.some(function(b){ return /New project|โปรเจ็กต์ใหม่/.test(b.textContent || ''); });
      if (hasNew) return 'connected';
      var body = (document.body && document.body.innerText) || '';
      if (/Create with Google Flow/i.test(body)) return 'loggedout';
      return 'unknown';
    } catch (e) { return 'unknown'; }
  }
  function pickEmail(str){
    if (!str) return null;
    var all = str.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}/gi);
    if (!all) return null;
    for (var z = 0; z < all.length; z++) {
      var e = all[z].toLowerCase();
      if (/(noreply|no-reply|support|example|sentry|@google\\.com$|@gstatic|@schema|@labs\\.google)/.test(e)) continue;
      return all[z];
    }
    return null;
  }
  function getPhoto(){
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      if (/googleusercontent\\.com/.test(imgs[i].src || '')) return imgs[i].src;
    }
    return null;
  }
  function getName(email){
    try {
      // 1) Google's avatar button exposes the identity as an aria-label/title in the
      //    form "<label>: <Name> (<email>)" (works in English and Thai). Pull the name
      //    that precedes the parenthesised email.
      var nodes = document.querySelectorAll('[aria-label],[title]');
      for (var j = 0; j < nodes.length; j++) {
        var t = nodes[j].getAttribute('aria-label') || nodes[j].getAttribute('title') || '';
        var m = t.match(/:\\s*([^():]+?)\\s*\\(\\s*[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}\\s*\\)/i);
        if (m && m[1] && m[1].indexOf('@') === -1) return m[1].trim();
      }
      // 2) When the account menu is open, the display name is the visible line right
      //    above the email line.
      if (email && document.body) {
        var lines = document.body.innerText.split('\\n').map(function(s){ return s.trim(); }).filter(function(s){ return s.length > 0; });
        for (var i = 1; i < lines.length; i++) {
          if (lines[i].indexOf(email) !== -1) {
            var cand = lines[i - 1];
            if (cand && cand.indexOf('@') === -1 && cand.length >= 2 && cand.length <= 60) return cand;
          }
        }
      }
      return null;
    } catch (e) { return null; }
  }
  function getEmail(){
    try {
      var ein = document.querySelector('input[type="email"], input[name="identifier"]');
      if (ein && EMAIL_RE.test(ein.value || '')) return ein.value.match(EMAIL_RE)[0];
      var nodes = document.querySelectorAll('[data-email],[aria-label],[title]');
      for (var j = 0; j < nodes.length; j++) {
        var de = nodes[j].getAttribute('data-email');
        if (de && EMAIL_RE.test(de)) return de.match(EMAIL_RE)[0];
        var t = (nodes[j].getAttribute('aria-label') || '') + ' ' + (nodes[j].getAttribute('title') || '');
        var am = pickEmail(t); if (am) return am;
      }
      // Visible text: the opened Google account menu (same document) and the sign-in password step.
      var be = pickEmail(document.body ? document.body.innerText : ''); if (be) return be;
      try { for (var li = 0; li < localStorage.length; li++) { var lm = pickEmail(localStorage.getItem(localStorage.key(li)) || ''); if (lm) return lm; } } catch (e) {}
      var scripts = document.querySelectorAll('script');
      for (var si = 0; si < scripts.length; si++) {
        var sc = scripts[si].textContent || '';
        if (sc.length > 0 && sc.length < 300000 && sc.indexOf('@') !== -1) { var sm = pickEmail(sc); if (sm) return sm; }
      }
      return null;
    } catch (e) { return null; }
  }
  function avatarClickable(){
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      if ((im.getAttribute('alt') || '') === 'User profile image' || /googleusercontent\\.com/.test(im.src || '')) {
        var el = im;
        for (var d = 0; d < 6 && el; d++) {
          if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button') return el;
          el = el.parentElement;
        }
        return im;
      }
    }
    return null;
  }
  var emailFound = false;
  var menuOpenedAt = 0;
  function send(){
    try {
      var state = detect();
      var shouldProbeAccount = window.__kbFlowAccountProbeEnabled !== false;
      var email = shouldProbeAccount && (state === 'connected' || state === 'signin') ? getEmail() : null;
      var photo = shouldProbeAccount && state === 'connected' ? getPhoto() : null;
      var name = shouldProbeAccount && state === 'connected' ? getName(email) : null;
      if (email) emailFound = true;
      // The email lives in the Google account menu (same document, hidden until opened). If we are
      // connected but cannot see it yet, briefly click the avatar to reveal it, then press Escape
      // to close the menu once captured.
      if (shouldProbeAccount && state === 'connected' && !emailFound) {
        var nowMs = +new Date();
        if (nowMs - menuOpenedAt > 6000) {
          var av = avatarClickable();
          if (av) { menuOpenedAt = nowMs; av.click(); }
        }
      } else if (shouldProbeAccount && state === 'connected' && emailFound && menuOpenedAt) {
        try {
          document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, which: 27, bubbles: true }));
        } catch (e) {}
        menuOpenedAt = 0;
      }
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'flowStatus', state: state, href: location.href,
        account: (email || photo || name) ? { email: email, photo: photo, name: name } : null
      }));
    } catch (e) {}
  }
  send();
  setInterval(send, 1500);
})();
true;
`;

interface FlowWebViewProps {
  onStatusChange?: (state: FlowConnectionState, href: string) => void;
  onAccount?: (account: FlowAccount) => void;
  onNavigationChange?: (href: string) => void;
  onActionLog?: (entry: FlowActionLogEntry) => void;
  /** Renderer ตาย (crash/ถูกระบบฆ่า) — instance นี้ใช้ต่อไม่ได้ parent ต้อง remount ด้วย key ใหม่ */
  onRendererGone?: (didCrash: boolean) => void;
  style?: StyleProp<ViewStyle>;
  backgroundColor?: string;
  accountProbeEnabled?: boolean;
}

/**
 * Imperative API exposed via ref — lets a parent drive Google Flow by injecting
 * the shared page actions and awaiting their postMessage result.
 */
export interface FlowWebViewHandle {
  runAction: (
    action: FlowActionName,
    args?: Record<string, unknown>,
    timeoutMs?: number
  ) => Promise<FlowActionResult>;
  goHome: () => void;
  reload: () => void;
}

/**
 * Shared Google Flow WebView. Persists its Google session via the app-wide
 * Android CookieManager (shared cookies) so logging in once is enough — both
 * this connection screen and the automation runner reuse the same session.
 */
const FlowWebView = forwardRef<FlowWebViewHandle, FlowWebViewProps>(function FlowWebView(
  {
    onStatusChange,
    onAccount,
    onNavigationChange,
    onActionLog,
    onRendererGone,
    style,
    backgroundColor = '#000000',
    accountProbeEnabled = true,
  },
  ref
) {
  const innerRef = useRef<WebView>(null);
  const pendingRef = useRef<Map<string, PendingFlowAction>>(new Map());
  const idRef = useRef(0);
  const rendererGoneRef = useRef(false);

  // UA per-host: เปลี่ยน prop userAgent กลางคันได้ (native แค่ set settings.userAgentString
  // ไม่ reload เอง) — พอ navigation ข้ามโฮสต์ที่ต้องการ UA คนละตัว ให้ block ไว้ก่อน
  // อัปเดต UA แล้วค่อยนำทางต่อเอง (onShouldStartLoadWithRequest ฝั่ง Android เป็น
  // blocking synchronous จึงกันหน้า login โหลดด้วย UA ผิดได้จริง)
  // ใช้ object ใหม่ทุกครั้ง (seq) แทนสตริง UA ตรงๆ — กันเคส navigation ข้ามโฮสต์ 2 ครั้ง
  // ใน batch เดียวทำให้ค่า UA วนกลับมาเท่าเดิมแล้ว effect ไม่ยิง (navigation ค้างถาวร)
  const [uaState, setUaState] = useState({ ua: CHROME_DESKTOP_UA, seq: 0 });
  const userAgentRef = useRef(CHROME_DESKTOP_UA);
  const pendingNavUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const url = pendingNavUrlRef.current;
    if (!url) return;
    pendingNavUrlRef.current = null;
    // หน่วงสั้นๆ ให้ prop userAgent ลงถึง native WebView ก่อนค่อยนำทางต่อ
    const timer = setTimeout(() => {
      innerRef.current?.injectJavaScript(`window.location.href = ${JSON.stringify(url)}; true;`);
    }, 50);
    return () => clearTimeout(timer);
  }, [uaState]);

  useImperativeHandle(
    ref,
    () => ({
      runAction(action, args = {}, timeoutMs = 30000) {
        if (rendererGoneRef.current) {
          return Promise.resolve<FlowActionResult>({ ok: false, error: FLOW_RENDERER_GONE_ERROR });
        }
        return new Promise<FlowActionResult>((resolve) => {
          const id = `act_${(idRef.current += 1)}`;
          const timer = setTimeout(() => {
            pendingRef.current.delete(id);
            resolve({ ok: false, error: `timeout (${timeoutMs}ms): ${action}` });
          }, timeoutMs);
          pendingRef.current.set(id, { resolve, timer });
          innerRef.current?.injectJavaScript(buildActionScript(id, action, args));
        });
      },
      goHome() {
        innerRef.current?.injectJavaScript(`window.location.href = ${JSON.stringify(FLOW_ENGLISH_URL)}; true;`);
      },
      reload() {
        innerRef.current?.reload();
      },
    }),
    []
  );

  return (
    <WebView
      ref={innerRef}
      source={{ uri: FLOW_URL }}
      userAgent={uaState.ua}
      onShouldStartLoadWithRequest={(request) => {
        // สนใจเฉพาะ http(s) main-frame navigation — scheme อื่น (intent:, about:blank)
        // ปล่อยผ่านตามเดิม; iframe https ไม่เข้า callback นี้อยู่แล้ว
        if (!/^https?:\/\//i.test(request.url)) return true;
        const desired = userAgentForUrl(request.url);
        if (desired === userAgentRef.current) return true;
        userAgentRef.current = desired;
        pendingNavUrlRef.current = request.url;
        setUaState((prev) => ({ ua: desired, seq: prev.seq + 1 }));
        return false;
      }}
      javaScriptEnabled
      domStorageEnabled
      thirdPartyCookiesEnabled
      sharedCookiesEnabled
      cacheEnabled
      webviewDebuggingEnabled={FLOW_WEBVIEW_DEBUG_ENABLED}
      originWhitelist={['https://*', 'http://*']}
      setSupportMultipleWindows={false}
      onRenderProcessGone={(event: WebViewRenderProcessGoneEvent) => {
        rendererGoneRef.current = true;
        failAllPendingActions(pendingRef.current, FLOW_RENDERER_GONE_ERROR);
        onRendererGone?.(event.nativeEvent?.didCrash === true);
      }}
      onContentProcessDidTerminate={(_event: WebViewTerminatedEvent) => {
        rendererGoneRef.current = true;
        failAllPendingActions(pendingRef.current, FLOW_RENDERER_GONE_ERROR);
        onRendererGone?.(true);
      }}
      injectedJavaScriptBeforeContentLoaded={FORCE_DESKTOP_VIEWPORT_JS}
      injectedJavaScript={`${FORCE_DESKTOP_VIEWPORT_JS}\nwindow.__kbFlowAccountProbeEnabled = ${accountProbeEnabled ? 'true' : 'false'};\n${STATUS_JS}`}
      onNavigationStateChange={(navState) => onNavigationChange?.(navState.url)}
      onMessage={(event: WebViewMessageEvent) => {
        try {
          const data = JSON.parse(event.nativeEvent.data) as {
            type?: string;
            state?: FlowConnectionState;
            href?: string;
            account?: FlowAccount | null;
            id?: string;
            ok?: boolean;
            result?: Record<string, unknown>;
            error?: string;
            action?: FlowActionName;
            message?: string;
            level?: FlowActionLogEntry['level'];
            ts?: number;
          };
          if (data?.type === 'flowActionLog' && data.id && data.message) {
            onActionLog?.({
              id: data.id,
              action: data.action ?? 'fillPrompt',
              message: data.message,
              level: data.level ?? 'info',
              ts: data.ts ?? Date.now(),
            });
            return;
          }
          if (data?.type === 'flowResult' && data.id) {
            const entry = pendingRef.current.get(data.id);
            if (entry) {
              clearTimeout(entry.timer);
              pendingRef.current.delete(data.id);
              entry.resolve({ ok: !!data.ok, result: data.result, error: data.error });
            }
            return;
          }
          if (data?.type === 'flowStatus' && data.state) {
            onStatusChange?.(data.state, data.href ?? '');
            if (data.account && (data.account.email || data.account.photo || data.account.name)) {
              onAccount?.(data.account);
            }
          }
        } catch {
          // ignore non-JSON messages
        }
      }}
      style={[{ flex: 1, backgroundColor }, style]}
    />
  );
});

export default FlowWebView;

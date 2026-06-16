import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';

import { buildActionScript } from '@kubdee/flow-core';
import type { FlowActionName, FlowActionResult } from '@kubdee/flow-core';

export type FlowConnectionState = 'unknown' | 'signin' | 'loggedout' | 'connected';

export interface FlowAccount {
  email?: string;
  name?: string;
  photo?: string;
}

export const FLOW_URL = 'https://labs.google/fx/tools/flow';

// Pretend to be real mobile Chrome (NO "; wv" token) so Google's WebView sign-in
// block ("this browser may not be secure") does not trigger.
const CHROME_MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-A075F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Mobile Safari/537.36';

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
      var email = (state === 'connected' || state === 'signin') ? getEmail() : null;
      var photo = state === 'connected' ? getPhoto() : null;
      var name = (state === 'connected') ? getName(email) : null;
      if (email) emailFound = true;
      // The email lives in the Google account menu (same document, hidden until opened). If we are
      // connected but cannot see it yet, briefly click the avatar to reveal it, then press Escape
      // to close the menu once captured.
      if (state === 'connected' && !emailFound) {
        var nowMs = +new Date();
        if (nowMs - menuOpenedAt > 6000) {
          var av = avatarClickable();
          if (av) { menuOpenedAt = nowMs; av.click(); }
        }
      } else if (state === 'connected' && emailFound && menuOpenedAt) {
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
  style?: StyleProp<ViewStyle>;
  backgroundColor?: string;
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
  reload: () => void;
}

/**
 * Shared Google Flow WebView. Persists its Google session via the app-wide
 * Android CookieManager (shared cookies) so logging in once is enough — both
 * this connection screen and the automation runner reuse the same session.
 */
const FlowWebView = forwardRef<FlowWebViewHandle, FlowWebViewProps>(function FlowWebView(
  { onStatusChange, onAccount, onNavigationChange, style, backgroundColor = '#000000' },
  ref
) {
  const innerRef = useRef<WebView>(null);
  const pendingRef = useRef<
    Map<string, { resolve: (r: FlowActionResult) => void; timer: ReturnType<typeof setTimeout> }>
  >(new Map());
  const idRef = useRef(0);

  useImperativeHandle(
    ref,
    () => ({
      runAction(action, args = {}, timeoutMs = 30000) {
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
      userAgent={CHROME_MOBILE_UA}
      javaScriptEnabled
      domStorageEnabled
      thirdPartyCookiesEnabled
      sharedCookiesEnabled
      cacheEnabled
      originWhitelist={['https://*', 'http://*']}
      setSupportMultipleWindows={false}
      injectedJavaScript={STATUS_JS}
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
          };
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

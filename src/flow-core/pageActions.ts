/**
 * Google Flow automation actions — platform-agnostic page logic.
 *
 * Each action body is the source of an async function `(args) => result` that
 * runs INSIDE the Google Flow page (the page's main JS world), so it can reach
 * React fiber / Slate editor internals directly. The logic is ported from the
 * desktop app's `flows/googleFlow/actions/*.ts`.
 *
 * Two consumers, one source of truth:
 *   - mobile (react-native-webview): `injectJavaScript(buildActionScript(...))`,
 *     result arrives via `window.ReactNativeWebView.postMessage`.
 *   - desktop (Playwright/CDP, later): `page.evaluate("(async a=>{<body>})(args)")`,
 *     result is returned directly.
 *
 * Keep this module pure TS with ZERO runtime dependencies so it lifts cleanly
 * into a standalone `@kubdee/flow-core` package later.
 */

import { CONFIGURE_POPPER_BODY } from './configurePopperBody';
import { VIDEO_RESULTS_BODY } from './extractVideosBody';
import {
  DELETE_LATEST_PROJECT_BODY,
  DOWNLOAD_IMAGES_BODY,
  DOWNLOAD_VIDEO_BODY,
  ENSURE_VIDEO_REFERENCE_ATTACHED_BODY,
  FILL_PROMPT_BODY,
  NEW_PROJECT_BODY,
  PREPARE_PROJECT_UI_BODY,
  REUSE_PROMPT_AND_SUBMIT_BODY,
  SELECT_RECENT_IMAGE_BODY,
  SUBMIT_BODY,
  UPLOAD_REFERENCE_IMAGE_BODY,
} from './page-action-bodies';
import { VIDEO_SNAPSHOT_BODY } from './snapshotBody';

export type FlowActionName =
  | 'newProject'
  | 'deleteLatestProject'
  | 'prepareProjectUi'
  | 'configurePopper'
  | 'selectRecentImage'
  | 'uploadReferenceImage'
  | 'ensureVideoReferenceAttached'
  | 'fillPrompt'
  | 'submit'
  | 'reusePromptAndSubmit'
  | 'videoSnapshot'
  | 'videoResults'
  | 'downloadImages'
  | 'downloadVideo';

export interface FlowActionResult {
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

const ACTION_BODIES: Record<FlowActionName, string> = {
  newProject: NEW_PROJECT_BODY,
  deleteLatestProject: DELETE_LATEST_PROJECT_BODY,
  prepareProjectUi: PREPARE_PROJECT_UI_BODY,
  configurePopper: CONFIGURE_POPPER_BODY,
  selectRecentImage: SELECT_RECENT_IMAGE_BODY,
  uploadReferenceImage: UPLOAD_REFERENCE_IMAGE_BODY,
  ensureVideoReferenceAttached: ENSURE_VIDEO_REFERENCE_ATTACHED_BODY,
  fillPrompt: FILL_PROMPT_BODY,
  submit: SUBMIT_BODY,
  reusePromptAndSubmit: REUSE_PROMPT_AND_SUBMIT_BODY,
  videoSnapshot: VIDEO_SNAPSHOT_BODY,
  videoResults: VIDEO_RESULTS_BODY,
  downloadImages: DOWNLOAD_IMAGES_BODY,
  downloadVideo: DOWNLOAD_VIDEO_BODY,
};

/**
 * The raw async-function body for an action (the `(args) => result` source).
 * Desktop can wrap this for `page.evaluate`; mobile uses `buildActionScript`.
 */
export function getActionBody(action: FlowActionName): string {
  return ACTION_BODIES[action];
}

/**
 * Build the injected-JS string for the mobile WebView. The body runs inside an
 * async IIFE; its return value (or thrown error) is posted back to RN tagged
 * with `id` as `{type:'flowResult', id, ok, result?, error?}`.
 */
export function buildActionScript(
  id: string,
  action: FlowActionName,
  args: Record<string, unknown> = {}
): string {
  const body = ACTION_BODIES[action];
  return `(function(){
  var __id = ${JSON.stringify(id)};
  var __action = ${JSON.stringify(action)};
  var __args = ${JSON.stringify(args)};
  function __post(p){ try { window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({ type: 'flowResult', id: __id }, p))); } catch (e) {} }
  function __flowLog(message, level){ try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'flowActionLog', id: __id, action: __action, message: String(message || ''), level: level || 'info', ts: Date.now() })); } catch (e) {} }
  var __kbOriginalClick = null;
  var __kbOriginalDispatchEvent = null;
  var __kbTapLastKey = '';
  var __kbTapLastAt = 0;
  var __kbTapSequenceKey = '';
  var __kbTapSequence = 0;
  var __kbTapMarker = null;
  var __kbTapMarkerHideTimer = null;
  var __kbTapMarkerRemoveTimer = null;
  function __kbTapText(el){
    try {
      var label = String(
        (el && (el.getAttribute && (
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          el.getAttribute('data-testid')
        ))) ||
        (el && (el.innerText || el.textContent)) ||
        (el && el.tagName) ||
        ''
      ).replace(/\\s+/g, ' ').trim();
      return label.length > 48 ? label.slice(0, 48) : label;
    } catch (e) {
      return '';
    }
  }
  function __kbRemoveNode(node){
    try {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    } catch (e) {}
  }
  function __showFlowTapMarker(x, y, sequence){
    try {
      var doc = document;
      var root = doc.body || doc.documentElement;
      if (!root) return;

      if (__kbTapMarkerHideTimer) {
        clearTimeout(__kbTapMarkerHideTimer);
        __kbTapMarkerHideTimer = null;
      }
      if (__kbTapMarkerRemoveTimer) {
        clearTimeout(__kbTapMarkerRemoveTimer);
        __kbTapMarkerRemoveTimer = null;
      }
      try {
        var oldMarkers = doc.querySelectorAll('[data-kubdee-flow-tap-marker="true"]');
        for (var i = 0; i < oldMarkers.length; i++) __kbRemoveNode(oldMarkers[i]);
      } catch (e) {}

      var outer = doc.createElement('div');
      outer.setAttribute('data-kubdee-flow-tap-marker', 'true');
      outer.setAttribute('aria-hidden', 'true');
      var s = outer.style;
      s.position = 'fixed';
      s.left = Math.round(x - 29) + 'px';
      s.top = Math.round(y - 29) + 'px';
      s.width = '58px';
      s.height = '58px';
      s.borderRadius = '999px';
      s.boxSizing = 'border-box';
      s.alignItems = 'center';
      s.justifyContent = 'center';
      s.display = 'flex';
      s.pointerEvents = 'none';
      s.zIndex = '2147483647';
      s.background = 'rgba(239,68,68,0.18)';
      s.border = '3px solid #ef4444';
      s.opacity = '0';
      s.transform = 'scale(0.78)';
      s.transition = 'opacity 120ms ease, transform 120ms ease';

      var inner = doc.createElement('div');
      var is = inner.style;
      is.width = '30px';
      is.height = '30px';
      is.borderRadius = '999px';
      is.background = '#ffffff';
      is.color = '#dc2626';
      is.display = 'flex';
      is.alignItems = 'center';
      is.justifyContent = 'center';
      is.fontSize = '17px';
      is.fontWeight = '800';
      is.lineHeight = '30px';
      is.fontFamily = 'Arial, sans-serif';
      is.boxShadow = '0 4px 12px rgba(0,0,0,0.22)';
      inner.textContent = sequence > 99 ? '99+' : String(sequence);

      outer.appendChild(inner);
      root.appendChild(outer);
      __kbTapMarker = outer;
      try { void outer.offsetHeight; } catch (e) {}
      var show = function(){
        try {
          if (__kbTapMarker !== outer) return;
          outer.style.opacity = '1';
          outer.style.transform = 'scale(1)';
        } catch (e) {}
      };
      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(show);
      } else {
        show();
      }
      __kbTapMarkerHideTimer = setTimeout(function(){
        try {
          if (__kbTapMarker !== outer) return;
          outer.style.opacity = '0';
          outer.style.transform = 'scale(0.9)';
        } catch (e) {}
        __kbTapMarkerRemoveTimer = setTimeout(function(){
          if (__kbTapMarker === outer) __kbTapMarker = null;
          __kbRemoveNode(outer);
        }, 180);
      }, 740);
    } catch (e) {}
  }
  function __flowTap(el, source){
    try {
      if (!el || typeof el.getBoundingClientRect !== 'function') return;
      var rect = el.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      var x = Math.max(0, Math.min(window.innerWidth || 0, rect.left + rect.width / 2));
      var y = Math.max(0, Math.min(window.innerHeight || 0, rect.top + rect.height / 2));
      if (!isFinite(x) || !isFinite(y)) return;
      var label = __kbTapText(el);
      var eventKey = [__action, source || 'click', label || (el.tagName || 'element')].join(':').toLowerCase();
      var now = Date.now();
      if (__kbTapLastKey === eventKey && now - __kbTapLastAt < 160) return;
      __kbTapLastKey = eventKey;
      __kbTapLastAt = now;
      __kbTapSequence = __kbTapSequenceKey === eventKey ? __kbTapSequence + 1 : 1;
      __kbTapSequenceKey = eventKey;
      __showFlowTapMarker(x, y, __kbTapSequence);
    } catch (e) {}
  }
  function __installTapIndicator(){
    try {
      if (window.__kbFlowTapIndicatorActive) return;
      window.__kbFlowTapIndicatorActive = true;
      __kbOriginalClick = HTMLElement && HTMLElement.prototype ? HTMLElement.prototype.click : null;
      if (__kbOriginalClick) {
        HTMLElement.prototype.click = function(){
          var self = this;
          var args = arguments;
          __flowTap(self, 'click');
          setTimeout(function(){
            try {
              __kbOriginalClick.apply(self, args);
            } catch (e) {}
          }, 80);
          return undefined;
        };
      }
      __kbOriginalDispatchEvent = EventTarget && EventTarget.prototype ? EventTarget.prototype.dispatchEvent : null;
      if (__kbOriginalDispatchEvent) {
        EventTarget.prototype.dispatchEvent = function(event){
          try {
            if (event && event.type === 'click' && this && this.nodeType === 1) {
              __flowTap(this, 'dispatch');
            }
          } catch (e) {}
          return __kbOriginalDispatchEvent.apply(this, arguments);
        };
      }
    } catch (e) {}
  }
  function __restoreTapIndicator(){
    try {
      if (__kbOriginalClick && HTMLElement && HTMLElement.prototype) HTMLElement.prototype.click = __kbOriginalClick;
      if (__kbOriginalDispatchEvent && EventTarget && EventTarget.prototype) EventTarget.prototype.dispatchEvent = __kbOriginalDispatchEvent;
      window.__kbFlowTapIndicatorActive = false;
    } catch (e) {}
  }
  function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  (async function(){
    try {
      __installTapIndicator();
      var __r = await (async function(args){ ${body} })(__args);
      __post({ ok: true, result: __r });
    } catch (e) {
      __post({ ok: false, error: String((e && e.message) || e) });
    } finally {
      __restoreTapIndicator();
    }
  })();
})();
true;`;
}

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
  function wait(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
  (async function(){
    try {
      var __r = await (async function(args){ ${body} })(__args);
      __post({ ok: true, result: __r });
    } catch (e) {
      __post({ ok: false, error: String((e && e.message) || e) });
    }
  })();
})();
true;`;
}

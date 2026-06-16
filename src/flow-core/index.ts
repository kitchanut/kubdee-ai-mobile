/**
 * @kubdee/flow-core — shared, platform-agnostic Google Flow page automation.
 *
 * Public API. Keep this module pure (no React Native / Electron imports) so it
 * can be promoted to a standalone package without code changes — see README.md.
 */
export { buildActionScript, getActionBody } from './pageActions';
export type { FlowActionName, FlowActionResult } from './pageActions';
export { FLOW_SELECTORS } from './selectors';

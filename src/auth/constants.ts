export const BACKEND_URL = 'https://kubdee.ai';
export const APP_TYPE = 'autogen';
export const REQUIRED_PLAN = 'ultra';
export const OAUTH_SCHEME = 'kubdeeai';
export const LOGIN_URL = `${BACKEND_URL}/api/oauth/signin?theme=dark&v=2.0&scheme=${OAUTH_SCHEME}`;
export const PLAN_RECHECK_INTERVAL_MS = 5 * 60 * 1000;
export const HEARTBEAT_INTERVAL_MS = 60 * 1000;

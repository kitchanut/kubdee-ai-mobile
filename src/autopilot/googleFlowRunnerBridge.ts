import { toGoogleFlowRunnerProduct } from '@/autopilot/productAdapter';
import { buildGoogleFlowPromptBundle } from '@/autopilot/promptCatalog/mobilePromptBuilder';
import type { PromptCatalogSource } from '@/autopilot/promptCatalog/api';
import type { PromptCatalog } from '@/autopilot/promptCatalog/types';
import type {
  AutoPilotProduct,
  AutoPilotSettings,
  AutoPilotStepType,
  GoogleFlowRunnerLogEntry,
  GoogleFlowRunnerPayload,
  GoogleFlowRunnerStartResult,
} from '@/autopilot/types';

interface GoogleFlowWebViewRunnerHost {
  start: (payload: GoogleFlowRunnerPayload) => boolean;
  stop: (runId: string) => boolean;
}

let webViewRunnerHost: GoogleFlowWebViewRunnerHost | null = null;
const logListeners = new Set<(entry: GoogleFlowRunnerLogEntry) => void>();

export function registerGoogleFlowWebViewRunnerHost(host: GoogleFlowWebViewRunnerHost): () => void {
  webViewRunnerHost = host;
  return () => {
    if (webViewRunnerHost === host) {
      webViewRunnerHost = null;
    }
  };
}

export function emitGoogleFlowRunnerLog(entry: Omit<GoogleFlowRunnerLogEntry, 'ts'> & { ts?: number }): void {
  const normalized: GoogleFlowRunnerLogEntry = {
    ...entry,
    ts: entry.ts ?? Date.now(),
  };

  for (const listener of logListeners) {
    listener(normalized);
  }
}

export function subscribeGoogleFlowRunnerLogs(
  listener: (entry: GoogleFlowRunnerLogEntry) => void
): { remove: () => void } {
  logListeners.add(listener);
  return {
    remove: () => {
      logListeners.delete(listener);
    },
  };
}

export function createGoogleFlowRunnerPayload({
  enabledSteps,
  promptCatalog,
  promptCatalogSource,
  promptCatalogVersion,
  products,
  profileLocalId,
  runId,
  settings,
}: {
  enabledSteps: AutoPilotStepType[];
  promptCatalog: PromptCatalog;
  promptCatalogSource: PromptCatalogSource;
  promptCatalogVersion: number | null;
  products: AutoPilotProduct[];
  profileLocalId: string;
  runId: string;
  settings: AutoPilotSettings;
}): GoogleFlowRunnerPayload {
  return {
    sourceApp: 'mobile',
    runner: 'on-device-google-flow-webview',
    version: 1,
    profileLocalId,
    runId,
    enabledSteps,
    settings,
    products: products.map((product) => ({
      ...toGoogleFlowRunnerProduct(product),
      prompts: buildGoogleFlowPromptBundle({
        catalog: promptCatalog,
        enabledSteps,
        product,
        settings,
      }),
    })),
    promptCatalogVersion,
    promptCatalogSource,
    createdAt: Date.now(),
  };
}

export async function startGoogleFlowRunner(
  payload: GoogleFlowRunnerPayload
): Promise<GoogleFlowRunnerStartResult> {
  if (!webViewRunnerHost) {
    return {
      success: false,
      error: 'WebView runner ยังไม่พร้อมใช้งาน',
    };
  }

  const started = webViewRunnerHost.start(payload);
  return started
    ? {
        success: true,
        runId: payload.runId,
        message: 'เริ่ม Google Flow WebView บนมือถือแล้ว',
      }
    : {
        success: false,
        error: 'มี Google Flow WebView runner ทำงานอยู่แล้ว',
      };
}

export async function stopGoogleFlowRunner(runId: string): Promise<GoogleFlowRunnerStartResult> {
  if (!runId) {
    return {
      success: false,
      error: 'ไม่มี run ที่หยุดได้',
    };
  }

  if (!webViewRunnerHost) {
    return {
      success: false,
      error: 'WebView runner ยังไม่พร้อมใช้งาน',
    };
  }

  const stopped = webViewRunnerHost.stop(runId);
  return stopped
    ? {
        success: true,
        runId,
        message: 'ส่งคำสั่งหยุดแล้ว',
      }
    : {
        success: false,
        error: 'ส่งคำสั่งหยุด Google Flow WebView ไม่สำเร็จ',
      };
}

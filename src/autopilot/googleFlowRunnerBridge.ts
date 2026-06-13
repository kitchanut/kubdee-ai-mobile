import { toGoogleFlowRunnerProduct } from '@/autopilot/productAdapter';
import type {
  AutoPilotProduct,
  AutoPilotSettings,
  AutoPilotStepType,
  GoogleFlowRunnerPayload,
  GoogleFlowRunnerStartResult,
} from '@/autopilot/types';
import {
  startGoogleFlowAutoPilot,
  stopGoogleFlowAutoPilot,
} from '@/native/AccessibilityBridge';

export function createGoogleFlowRunnerPayload({
  enabledSteps,
  products,
  profileLocalId,
  runId,
  settings,
}: {
  enabledSteps: AutoPilotStepType[];
  products: AutoPilotProduct[];
  profileLocalId: string;
  runId: string;
  settings: AutoPilotSettings;
}): GoogleFlowRunnerPayload {
  return {
    sourceApp: 'mobile',
    runner: 'on-device-google-flow-browser',
    version: 1,
    profileLocalId,
    runId,
    enabledSteps,
    settings,
    products: products.map(toGoogleFlowRunnerProduct),
    createdAt: Date.now(),
  };
}

export async function startGoogleFlowRunner(
  payload: GoogleFlowRunnerPayload
): Promise<GoogleFlowRunnerStartResult> {
  const started = await startGoogleFlowAutoPilot(payload);
  return started
    ? {
        success: true,
        runId: payload.runId,
        message: 'เริ่ม Google Flow บนมือถือแล้ว',
      }
    : {
        success: false,
        error: 'เริ่ม Google Flow runner บนมือถือไม่สำเร็จ',
      };
}

export async function stopGoogleFlowRunner(runId: string): Promise<GoogleFlowRunnerStartResult> {
  if (!runId) {
    return {
      success: false,
      error: 'ไม่มี run ที่หยุดได้',
    };
  }

  const stopped = await stopGoogleFlowAutoPilot();
  return stopped
    ? {
        success: true,
        runId,
        message: 'ส่งคำสั่งหยุดแล้ว',
      }
    : {
        success: false,
        error: 'ส่งคำสั่งหยุด Google Flow บนมือถือไม่สำเร็จ',
      };
}

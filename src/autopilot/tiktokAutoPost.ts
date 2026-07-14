import type { TikTokPostAction, TikTokPostVideoInput } from '@/tiktok/tiktokPostScript';

export interface TikTokAutoPostRequest {
  profileLocalId: string;
  video: TikTokPostVideoInput;
  postAction: TikTokPostAction;
  enableProductLink: boolean;
  onLog: (message: string) => void;
}

export interface TikTokAutoPostResult {
  success: boolean;
  error?: string;
}

type TikTokAutoPostHostFn = (request: TikTokAutoPostRequest) => Promise<TikTokAutoPostResult>;

// การโพสต์ TikTok ต้องใช้ WebView modal ที่มองเห็นบนจอ (TikTokPostModal) ซึ่ง
// postProductToTikTok (pure async function ใน runner) render เองไม่ได้ — จึงใช้
// bridge แบบเดียวกับ googleFlowRunnerBridge: host ระดับแอปลงทะเบียนตัวเองไว้
// แล้วฝั่ง runner ยิง request เป็น promise ทีละคลิป
let tiktokAutoPostHost: TikTokAutoPostHostFn | null = null;

export function registerTikTokAutoPostHost(host: TikTokAutoPostHostFn): () => void {
  tiktokAutoPostHost = host;
  return () => {
    if (tiktokAutoPostHost === host) {
      tiktokAutoPostHost = null;
    }
  };
}

export async function postTikTokVideoViaHost(
  request: TikTokAutoPostRequest
): Promise<TikTokAutoPostResult> {
  if (!tiktokAutoPostHost) {
    return { success: false, error: 'TikTok post host ยังไม่พร้อมใช้งาน' };
  }
  return tiktokAutoPostHost(request);
}

import { useCallback, useEffect, useRef, useState } from 'react';

import { registerTikTokAutoPostHost } from '@/autopilot/tiktokAutoPost';
import type { TikTokAutoPostRequest, TikTokAutoPostResult } from '@/autopilot/tiktokAutoPost';
import TikTokPostModal from '@/tiktok/TikTokPostModal';

interface ActiveTikTokPost {
  id: number;
  request: TikTokAutoPostRequest;
  resolve: (result: TikTokAutoPostResult) => void;
}

// Host ระดับแอปที่ทำให้ auto pilot โพสต์ TikTok ได้จริง: TikTokPostModal เป็น WebView
// modal ที่ต้องมองเห็นบนจอ (แบบเดียวกับหน้าโพสต์ manual) จึง mount ตัวนี้ไว้ใน
// KubdeeMobileApp คู่กับ GoogleFlowWebViewRunnerHost — modal นี้ mount ทีหลังตอนโพสต์
// จึงซ้อนอยู่บน modal ของ runner เอง
export default function TikTokAutoPostHost(): React.JSX.Element | null {
  const [active, setActive] = useState<ActiveTikTokPost | null>(null);
  const activeRef = useRef<ActiveTikTokPost | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    return registerTikTokAutoPostHost(
      (request) =>
        new Promise<TikTokAutoPostResult>((resolve) => {
          if (activeRef.current) {
            resolve({ success: false, error: 'มีงานโพสต์ TikTok ค้างอยู่ก่อนหน้า' });
            return;
          }
          requestIdRef.current += 1;
          const next: ActiveTikTokPost = { id: requestIdRef.current, request, resolve };
          activeRef.current = next;
          setActive(next);
        })
    );
  }, []);

  const finish = useCallback((result: TikTokAutoPostResult): void => {
    const current = activeRef.current;
    if (!current) return;
    activeRef.current = null;
    setActive(null);
    current.resolve(result);
  }, []);

  if (!active) return null;

  return (
    <TikTokPostModal
      key={active.id}
      visible
      profileLocalId={active.request.profileLocalId}
      video={active.request.video}
      postAction={active.request.postAction}
      enableProductLink={active.request.enableProductLink}
      onLog={active.request.onLog}
      onComplete={finish}
      onClose={() => finish({ success: false, error: 'ปิดหน้าต่างโพสต์ TikTok ก่อนเสร็จ' })}
    />
  );
}

import {
  createFacebookBufferPost,
  createInstagramBufferPost,
  createYoutubeBufferPost,
  uploadBufferAsset,
} from '@/autopilot/bufferPosting';
import {
  buildBufferPostText,
  buildBufferPostTextWithLink,
  buildProductLinkFirstComment,
  buildYoutubeTitle,
} from '@/autopilot/bufferPostText';
import type { AutoPilotLogLevel, AutoPilotSettings, GoogleFlowRunnerLogEntry, GoogleFlowRunnerProduct } from '@/autopilot/types';
import { limitShopeePostTextParts } from '@/autopilot/shopeePostTextLimit';
import { postTikTokVideoViaHost } from '@/autopilot/tiktokAutoPost';
import { isShopeeShortLink } from '@/library/shopeeLinks';
import { reportWarning } from '@/lib/telemetry';
import { getTikTokPostSettings } from '@/tiktok/tiktokPostSettingsStore';
import { AppState } from 'react-native';

import {
  clearPendingShopeePostResults,
  getAccessibilityStatus,
  getPendingShopeePostResults,
  postShopeeVideos,
  requestAndroidVideoPermission,
  stopShopeeAutomation,
} from '@/native/AccessibilityBridge';
import type { NativeShopeePostingResult, NativeShopeePostingVideoInput } from '@/native/AccessibilityBridge';

export interface AutoPilotProductVideoAsset {
  fileUri: string;
  fileName?: string;
  mimeType?: string;
}

// Safety net for postShopeeVideos(): normally resolves via a native broadcast once the
// accessibility automation finishes (see KubdeeAccessibilityService.kt), and that automation
// itself already caps at 20 minutes. But the broadcast can be silently dropped if the app's main
// process is backgrounded/frozen at the wrong instant (observed on-device), which would otherwise
// hang this one product — and the whole remaining auto pilot run behind it — for the full 20
// minutes. 5 minutes is well above the ~2 minutes a real Shopee post takes end to end.
export const SHOPEE_POST_TIMEOUT_MS = 5 * 60_000;

// เพดานรอผลฝั่ง native 20 นาทีต่อ run (KubdeeAccessibilityModule มี timer reject ของตัวเองที่ 20 นาที) —
// timeout ฝั่ง JS ต้องยิงก่อนเพดาน native เสมอ (เผื่อ 1 นาที) ไม่งั้น error ที่หลุดมาไม่ใช่
// ShopeePostTimeoutError แล้ว path stop+reconcile ใน catch จะไม่ทำงาน
const SHOPEE_POST_NATIVE_RUN_CAP_MS = 20 * 60_000;
const SHOPEE_POST_JS_WAIT_CAP_MS = SHOPEE_POST_NATIVE_RUN_CAP_MS - 60_000;

// batch หลายคลิปใน call เดียวใช้เวลาเกิน 5 นาที (~2-2.5 นาที/คลิป, เครื่องช้า 3-5 นาที) —
// สเกล timeout ตามจำนวนคลิปใต้เพดาน (ใช้ร่วมกันทั้ง auto pilot และหน้า Shopee)
export function shopeePostBatchTimeoutMs(videoCount: number): number {
  return Math.min(SHOPEE_POST_TIMEOUT_MS * Math.max(1, videoCount), SHOPEE_POST_JS_WAIT_CAP_MS);
}

// TikTokPostModal มี timeout 10 นาทีในตัวเอง — เผื่ออีก 2 นาทีกันเคส promise จาก host
// ไม่ resolve (เช่น host โดน unmount กลางคัน) แล้วทั้ง run ค้าง
export const TIKTOK_POST_TIMEOUT_MS = 12 * 60_000;

export class ShopeePostTimeoutError extends Error {}

// ช่องทางสำรองของผลโพสต์ Shopee (Sentry MOBILE-G): broadcast จาก :automation หายได้
// ถ้าแอปหลักโดน freeze — native จึง persist ผลลง disk ณ วินาทีเดียวกับที่ยิง broadcast
// (KubdeeShopeePostResults) ฝั่งนี้ poll ไฟล์ควบคู่กับการรอ broadcast + poll ทันทีเมื่อ
// แอปกลับ foreground แล้วใช้ผลจากช่องทางที่มาถึงก่อน (settle ครั้งเดียว)
// สมมติฐาน: ผู้เรียกโพสต์ Shopee ทีละงาน (single in-flight) จึง correlate ด้วย
// ts >= startedAt ได้โดยไม่ต้องส่ง runId ข้าม bridge — ทั้ง auto pilot และหน้า Shopee
// (โพสต์ทีละคลิปตามลำดับ) เข้าเงื่อนไขนี้
const SHOPEE_POST_RESULT_POLL_MS = 5_000;

export function awaitShopeePostResult(
  broadcastPromise: Promise<NativeShopeePostingResult>,
  startedAt: number,
  // batch หลายคลิปใน call เดียวใช้เวลานานกว่า 5 นาที — ผู้เรียกสเกล timeout ตามจำนวนคลิปได้
  // (native เองมีเพดานรอผล 20 นาทีต่อ run ใน KubdeeAccessibilityModule)
  timeoutMs: number = SHOPEE_POST_TIMEOUT_MS
): Promise<NativeShopeePostingResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (pollTimer) clearTimeout(pollTimer);
      appStateSub.remove();
      fn();
    };

    const poll = async (): Promise<void> => {
      if (settled) return;
      try {
        const pending = await getPendingShopeePostResults();
        const record = pending
          .filter((row) => row.ts >= startedAt)
          .sort((a, b) => b.ts - a.ts)[0];
        if (record) {
          const parsed = JSON.parse(record.resultJson) as NativeShopeePostingResult;
          settle(() => {
            reportWarning('postProductToShopee: reconciled result from disk (broadcast missed)', {
              runId: record.runId,
            });
            void clearPendingShopeePostResults().catch(() => {});
            resolve(parsed);
          });
          return;
        }
      } catch {
        // poll เป็น best-effort — รอบถัดไปลองใหม่
      }
      if (!settled) {
        pollTimer = setTimeout(() => {
          void poll();
        }, SHOPEE_POST_RESULT_POLL_MS);
      }
    };

    const timeoutTimer = setTimeout(() => {
      // เช็คไฟล์รอบสุดท้ายก่อนตัดสิน timeout — เผื่อผลเพิ่งถูกเขียนพอดี
      void poll().finally(() => {
        settle(() => {
          reportWarning('postProductToShopee: withTimeout fired', { timeoutMs });
          reject(
            new ShopeePostTimeoutError(
              `โพสต์ Shopee หมดเวลา (นานเกิน ${Math.round(timeoutMs / 60_000)} นาที ไม่ได้รับผลลัพธ์จากระบบอัตโนมัติ)`
            )
          );
        });
      });
    }, timeoutMs);

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void poll();
      }
    });

    broadcastPromise.then(
      (value) =>
        settle(() => {
          void clearPendingShopeePostResults().catch(() => {});
          resolve(value);
        }),
      (error) =>
        settle(() => {
          reportWarning('postProductToShopee: postShopeeVideos rejected', {
            error: error instanceof Error ? error.message : String(error),
          });
          reject(error);
        })
    );

    pollTimer = setTimeout(() => {
      void poll();
    }, SHOPEE_POST_RESULT_POLL_MS);
  });
}

// sentryLabel = ชื่อ call site (เช่น 'postProductToTikTok') — เดิม hardcode เป็นข้อความฝั่ง Shopee
// ทำให้ timeout ของ TikTok ไป group รวมใน Sentry issue MOBILE-G ของ Shopee
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string, sentryLabel: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reportWarning(`${sentryLabel}: withTimeout fired`, { timeoutMs });
      reject(new ShopeePostTimeoutError(message));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reportWarning(`${sentryLabel}: promise rejected`, {
          error: error instanceof Error ? error.message : String(error),
        });
        reject(error);
      }
    );
  });
}

type EmitFn = (entry: Omit<GoogleFlowRunnerLogEntry, 'ts'> & { ts?: number }) => void;

export interface PostProductAfterGenerationParams {
  product: GoogleFlowRunnerProduct;
  videoAssets: AutoPilotProductVideoAsset[];
  settings: AutoPilotSettings;
  /** โปรไฟล์ที่ auto pilot รันอยู่ — TikTokPostModal ใช้เลือก session/cookie ของ TikTok */
  profileLocalId: string;
  emit: EmitFn;
  runId: string;
  round: number;
  totalRounds: number;
  productIndex: number;
  totalProducts: number;
  /** Called when the product's video(s) are successfully posted to a platform, so the
   * library can flag which destinations each video has been published to. */
  onProductPosted?: (platform: string, fileUris: string[]) => void;
}

// เดาว่าสินค้ามาจากตลาดไหน (Shopee/TikTok) จาก platform flag ก่อน แล้ว fallback ที่
// host ของลิงก์ — พอร์ตจาก resolveVideoMarketplace ของหน้าโพสต์ Shopee manual
function resolveProductMarketplace(product: GoogleFlowRunnerProduct): 'shopee' | 'tiktok' | null {
  const flag = product.platform?.trim().toLowerCase() ?? '';
  if (flag.includes('shopee')) return 'shopee';
  if (flag.includes('tiktok')) return 'tiktok';

  const url = product.productUrl?.trim().toLowerCase() ?? '';
  if (url.includes('shopee') || url.includes('shp.ee')) return 'shopee';
  if (url.includes('tiktok') || url.includes('tokopedia')) return 'tiktok';

  return null;
}

// TikTok Studio ค้นหาสินค้าใน showcase ด้วยเลข TikTok จริง (เลขล้วน ≥6 หลัก) เท่านั้น —
// กติกาเดียวกับ tiktokProductId ของหน้าโพสต์ manual
function tiktokNumericProductId(product: GoogleFlowRunnerProduct): string | null {
  const value = product.productId?.trim();
  return value && /^\d{6,}$/.test(value) ? value : null;
}

// Runs after auto pilot finishes generating (image +) video for one product,
// before the loop advances to the next one — deliberately awaited by the
// caller so posting always finishes before the next product starts. TikTok,
// Shopee, Facebook and YouTube are independent: one failing is logged but never
// blocks the others or throws out to the caller (same "log and continue"
// behavior the image/video generation steps already have).
export async function postProductAfterGeneration(params: PostProductAfterGenerationParams): Promise<void> {
  const { product, videoAssets, settings, profileLocalId, emit, runId, round, totalRounds, productIndex, totalProducts, onProductPosted } = params;

  const emitStage = (stage: string, message: string, level: AutoPilotLogLevel = 'info'): void => {
    emit({
      event: 'progress',
      runId,
      status: 'running',
      level,
      stage,
      productId: product.id,
      productName: product.name,
      currentRound: round,
      totalRounds,
      currentProduct: productIndex + 1,
      totalProducts,
      message,
    });
  };

  // ลำดับตามแถบ workflow: TikTok มาก่อน Shopee
  if (settings.autoPostTiktok) {
    await postProductToTikTok(product, videoAssets, profileLocalId, emitStage, onProductPosted);
  }

  if (settings.autoPostShopee) {
    await postProductToShopee(product, videoAssets, emitStage, onProductPosted);
  }

  if (settings.autoPostFacebook && settings.facebookChannelId) {
    await postProductToFacebook(product, videoAssets, settings.facebookChannelId, emitStage, onProductPosted);
  }

  if (settings.autoPostInstagram && settings.instagramChannelId) {
    await postProductToInstagram(product, videoAssets, settings.instagramChannelId, emitStage, onProductPosted);
  }

  if (settings.autoPostYoutube && settings.youtubeChannelId) {
    await postProductToYoutube(product, videoAssets, settings.youtubeChannelId, emitStage, onProductPosted);
  }
}

// Post text composition lives in bufferPostText.ts (shared with the library
// social post modal) — buildBufferPostText (caption + hashtags, link goes to
// the first comment), buildBufferPostTextWithLink (link in the body, for when
// Buffer rejects the first comment), buildProductLinkFirstComment, and
// buildYoutubeTitle. GoogleFlowRunnerProduct is structurally compatible with
// the builders' source object, so products pass straight through.

// Buffer's exact wording: "Invalid post: First comment requires a paid plan.
// Please upgrade to use this feature."
function isFirstCommentNotAllowedError(error: unknown): boolean {
  return error instanceof Error && /first comment requires a paid plan/i.test(error.message);
}

// Buffer's free plan rejects first comments (confirmed live 2026-07-11), so
// this stays off until it becomes a per-channel posting setting — the whole
// first-comment path (composition, fallback, API support) is kept wired so
// flipping this back on is all it takes.
const USE_FIRST_COMMENT = false;

// โพสต์วิดีโอของสินค้าขึ้น TikTok ผ่าน TikTokAutoPostHost (WebView modal เดียวกับ
// หน้าโพสต์ manual) ทีละคลิป — ใช้ค่าตั้ง publish/draft + แนบสินค้า จากหน้าโพสต์ TikTok
async function postProductToTikTok(
  product: GoogleFlowRunnerProduct,
  videoAssets: AutoPilotProductVideoAsset[],
  profileLocalId: string,
  emitStage: (stage: string, message: string, level?: AutoPilotLogLevel) => void,
  onProductPosted?: (platform: string, fileUris: string[]) => void
): Promise<void> {
  if (videoAssets.length === 0) {
    emitStage('posting_tiktok', 'ข้ามโพสต์ TikTok: ยังไม่มีวิดีโอสำหรับสินค้านี้', 'warning');
    return;
  }

  // gate แพลตฟอร์ม: ขั้น TikTok โพสต์เฉพาะสินค้าที่มาจาก TikTok — สินค้าแพลตฟอร์มอื่น
  // ข้ามแล้วไปขั้นถัดไป (Shopee/Facebook/...) ตาม workflow
  const marketplace = resolveProductMarketplace(product);
  if (marketplace !== 'tiktok') {
    emitStage(
      'posting_tiktok',
      `ข้ามโพสต์ TikTok: ${product.name || 'สินค้า'} ${marketplace === 'shopee' ? 'เป็นสินค้า Shopee' : 'ไม่ทราบแพลตฟอร์มสินค้า'}`,
      'warning'
    );
    return;
  }

  if (!profileLocalId) {
    emitStage('posting_tiktok', 'ข้ามโพสต์ TikTok: ยังไม่ได้เลือกโปรไฟล์', 'warning');
    return;
  }

  try {
    const tiktokSettings = await getTikTokPostSettings();
    const numericProductId = tiktokNumericProductId(product);
    if (tiktokSettings.enableProductLink && !numericProductId) {
      emitStage('posting_tiktok', 'ข้ามโพสต์ TikTok: เปิดแนบสินค้าแต่ไม่พบ TikTok Product ID (เลขล้วน)', 'warning');
      return;
    }

    const postedUris: string[] = [];
    for (const [index, video] of videoAssets.entries()) {
      emitStage(
        'posting_tiktok',
        `กำลังโพสต์ TikTok (${index + 1}/${videoAssets.length}): ${product.name || 'สินค้า'}`
      );

      const result = await withTimeout(
        postTikTokVideoViaHost({
          profileLocalId,
          postAction: tiktokSettings.postAction,
          enableProductLink: tiktokSettings.enableProductLink,
          onLog: (message) => emitStage('posting_tiktok', `TikTok: ${message}`),
          video: {
            fileUri: video.fileUri,
            fileName: video.fileName ?? null,
            productName: product.name?.trim() || null,
            productId: numericProductId,
            caption: product.caption?.trim() || null,
            hashtags: product.hashtags?.trim() || null,
            cta: product.cta?.trim() || null,
            platform: product.platform || 'tiktok',
            galleryVideoId: null,
          },
        }),
        TIKTOK_POST_TIMEOUT_MS,
        'โพสต์ TikTok หมดเวลา (นานเกิน 12 นาที ไม่ได้รับผลลัพธ์)',
        'postProductToTikTok'
      );

      if (!result.success) {
        emitStage('failed', `โพสต์ TikTok ไม่สำเร็จ: ${result.error || 'ไม่ทราบสาเหตุ'}`, 'error');
        continue;
      }
      postedUris.push(video.fileUri);
    }

    if (postedUris.length > 0) {
      emitStage(
        'posted_tiktok',
        `${tiktokSettings.postAction === 'draft' ? 'บันทึกร่าง' : 'โพสต์'} TikTok สำเร็จ ${postedUris.length}/${videoAssets.length} วิดีโอ`,
        'success'
      );
      // draft ยังไม่ถือว่า "โพสต์แล้ว" — mark เฉพาะโหมด publish (ตามหน้า manual)
      if (tiktokSettings.postAction === 'publish') {
        onProductPosted?.('tiktok', postedUris);
      }
    }
  } catch (error) {
    reportWarning('postProductToTikTok: caught error, emitting failed stage', {
      error: error instanceof Error ? error.message : String(error),
    });
    emitStage(
      'failed',
      `โพสต์ TikTok ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
  }
}

// หลัง timeout: run จริงอาจไปเสร็จหลังจาก JS เลิกรอ (ผลถูกเขียนลง disk ทีหลัง) — poll ซ้ำ
// อีกครั้งเดียวแบบ fire-and-forget เพื่อ mark posted ให้ตรงความจริง กันรอบถัดไปโพสต์คลิปเดิมซ้ำ
// ห้าม clear ไฟล์ในนี้: run ถัดไป (ทั้ง auto pilot และหน้า Shopee) clear เองตอนเริ่มอยู่แล้ว
// และ RN timer อาจโดนเลื่อน (แอปถูก background) ไปยิงตอน run ใหม่กำลังวิ่ง — clear ตรงนี้
// จะลบผลของ run ใหม่ทิ้งก่อนเจ้าของได้อ่าน; ขอบบนเวลา (armedAt + delay) กันหยิบผลข้าม run
// ในเคส timer ยิงช้าด้วยเหตุเดียวกัน
const SHOPEE_LATE_RECONCILE_DELAY_MS = 120_000;

function scheduleShopeeLateResultReconcile(
  startedAt: number,
  fileUris: string[],
  onProductPosted?: (platform: string, fileUris: string[]) => void
): void {
  const armedAt = Date.now();
  setTimeout(() => {
    void (async () => {
      const pending = await getPendingShopeePostResults();
      const record = pending
        .filter((row) => row.ts >= startedAt && row.ts <= armedAt + SHOPEE_LATE_RECONCILE_DELAY_MS)
        .sort((a, b) => b.ts - a.ts)[0];
      if (!record) return;
      const result = JSON.parse(record.resultJson) as NativeShopeePostingResult;
      const successCount =
        result.successCount ?? result.results?.filter((entry) => entry.success).length ?? result.postedCount ?? 0;
      reportWarning('postProductToShopee: late result reconciled after timeout', {
        runId: record.runId,
        success: result.success === true,
        stopped: result.stopped === true,
        successCount,
      });
      // เงื่อนไข mark เดียวกับ path ปกติ: สำเร็จ (ไม่ถูกหยุดกลางคัน) และมีคลิปโพสต์ได้จริง
      if (result.success && !result.stopped && successCount > 0) {
        onProductPosted?.('shopee', fileUris);
      }
    })().catch(() => {
      // best-effort — พลาดแค่การ mark posted ไม่กระทบ loop หลัก
    });
  }, SHOPEE_LATE_RECONCILE_DELAY_MS);
}

async function postProductToShopee(
  product: GoogleFlowRunnerProduct,
  videoAssets: AutoPilotProductVideoAsset[],
  emitStage: (stage: string, message: string, level?: AutoPilotLogLevel) => void,
  onProductPosted?: (platform: string, fileUris: string[]) => void
): Promise<void> {
  if (videoAssets.length === 0) {
    emitStage('posting_shopee', 'ข้ามโพสต์ Shopee: ยังไม่มีวิดีโอสำหรับสินค้านี้', 'warning');
    return;
  }

  // gate แพลตฟอร์ม: ขั้น Shopee โพสต์เฉพาะสินค้าที่มาจาก Shopee — สินค้า TikTok/อื่น
  // ข้ามแล้วไปขั้นถัดไปตาม workflow (กติกาเดียวกับ getShopeePostBlock ของหน้า manual)
  const shopeeMarketplace = resolveProductMarketplace(product);
  if (shopeeMarketplace !== 'shopee') {
    emitStage(
      'posting_shopee',
      `ข้ามโพสต์ Shopee: ${product.name || 'สินค้า'} ${shopeeMarketplace === 'tiktok' ? 'เป็นสินค้า TikTok' : 'ไม่ทราบแพลตฟอร์มสินค้า'}`,
      'warning'
    );
    return;
  }

  // hoist ไว้ให้ catch ใช้ schedule reconcile หลัง timeout ได้ (0 = ยังไม่ได้เริ่มโพสต์)
  let postStartedAt = 0;
  try {
    const status = await getAccessibilityStatus();
    if (!status.running) {
      emitStage('posting_shopee', 'ข้ามโพสต์ Shopee: ยังไม่ได้เปิด Accessibility Service', 'warning');
      return;
    }

    const mediaAllowed = await requestAndroidVideoPermission();
    if (!mediaAllowed) {
      emitStage('posting_shopee', 'ข้ามโพสต์ Shopee: ยังไม่อนุญาตอ่านวิดีโอ', 'warning');
      return;
    }

    emitStage('posting_shopee', `กำลังโพสต์ Shopee: ${product.name || 'สินค้า'}`);

    const productName = product.name?.trim() || null;
    const productId = product.productId?.trim() || null;
    const productUrl = isShopeeShortLink(product.productUrl) ? product.productUrl : null;

    const videos: NativeShopeePostingVideoInput[] = videoAssets.map((asset) => {
      const limitedText = limitShopeePostTextParts({
        caption: product.caption,
        cta: product.cta,
        fallbackCaption: productName,
        hashtags: product.hashtags,
      });

      return {
        fileUri: asset.fileUri,
        productName,
        productId,
        productUrl,
        caption: limitedText.caption || null,
        hashtags: limitedText.hashtags || null,
        cta: limitedText.cta || null,
        galleryVideoId: null,
        platform: product.platform || 'shopee',
      };
    });

    // เคลียร์ผลค้างของรอบก่อนออกก่อนเริ่ม (ts filter กันข้ามรอบอยู่แล้ว — นี่กันไฟล์โต)
    await clearPendingShopeePostResults().catch(() => {});
    postStartedAt = Date.now();
    const result = await awaitShopeePostResult(
      postShopeeVideos(videos, { skipReturnNavigation: true }),
      postStartedAt,
      // timeout สเกลตามจำนวนคลิป — flat 5 นาทีไม่พอเมื่อสินค้ามีหลายคลิป (Sentry MOBILE-G)
      shopeePostBatchTimeoutMs(videos.length)
    );

    if (result.stopped) {
      emitStage(
        'posted_shopee',
        `หยุดโพสต์ Shopee ก่อนครบ: ${result.postedCount || 0}/${videos.length} วิดีโอ`,
        'warning'
      );
      return;
    }

    if (!result.success) {
      emitStage('failed', `โพสต์ Shopee ไม่สำเร็จ: ${result.error || 'ไม่ทราบสาเหตุ'}`, 'error');
      return;
    }

    const successCount =
      result.successCount ?? result.results?.filter((entry) => entry.success).length ?? result.postedCount ?? 0;
    emitStage('posted_shopee', `โพสต์ Shopee สำเร็จ ${successCount}/${videos.length} วิดีโอ`, 'success');
    if (successCount > 0) {
      onProductPosted?.('shopee', videoAssets.map((asset) => asset.fileUri));
    }
  } catch (error) {
    reportWarning('postProductToShopee: caught error, emitting failed stage', {
      error: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof ShopeePostTimeoutError) {
      // JS เลิกรอแล้ว แต่ native run เดิมอาจยังขับ Shopee ต่อได้ถึง 20 นาที — สั่งหยุด
      // กันสินค้าถัดไปชน "Shopee post กำลังทำงานอยู่แล้ว" (หยุดพลาดก็ห้ามล้ม loop หลัก)
      try {
        await stopShopeeAutomation();
      } catch {
        // best-effort
      }
      if (postStartedAt > 0) {
        scheduleShopeeLateResultReconcile(
          postStartedAt,
          videoAssets.map((asset) => asset.fileUri),
          onProductPosted
        );
      }
    }
    emitStage(
      'failed',
      `โพสต์ Shopee ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
  }
}

async function postProductToFacebook(
  product: GoogleFlowRunnerProduct,
  videoAssets: AutoPilotProductVideoAsset[],
  channelId: string,
  emitStage: (stage: string, message: string, level?: AutoPilotLogLevel) => void,
  onProductPosted?: (platform: string, fileUris: string[]) => void
): Promise<void> {
  if (videoAssets.length === 0) {
    emitStage('posting_facebook', 'ข้ามโพสต์ Facebook: ยังไม่มีวิดีโอสำหรับสินค้านี้', 'warning');
    return;
  }

  // Facebook posts through Buffer take one asset — post the first generated
  // video for this product (most auto pilot configs generate one anyway).
  const video = videoAssets[0];

  try {
    emitStage('uploading_facebook_asset', `กำลังอัปโหลดวิดีโอไป Facebook: ${product.name || 'สินค้า'}`);
    const assetUrl = await uploadBufferAsset(video.fileUri, video.mimeType || 'video/mp4');

    emitStage('posting_facebook', `กำลังโพสต์ Facebook: ${product.name || 'สินค้า'}`);
    const firstComment = USE_FIRST_COMMENT ? buildProductLinkFirstComment(product) : undefined;
    try {
      await createFacebookBufferPost({
        channelId,
        text: firstComment ? buildBufferPostText(product) : buildBufferPostTextWithLink(product),
        assetUrl,
        assetType: 'video',
        firstComment,
      });
    } catch (error) {
      if (!firstComment || !isFirstCommentNotAllowedError(error)) throw error;
      emitStage('posting_facebook', 'Buffer แพลนฟรีใช้คอมเมนต์แรกไม่ได้ — ใส่ลิงก์ในโพสต์แทนแล้วลองใหม่', 'warning');
      await createFacebookBufferPost({
        channelId,
        text: buildBufferPostTextWithLink(product),
        assetUrl,
        assetType: 'video',
      });
    }
    emitStage('posted_facebook', `โพสต์ Facebook สำเร็จ: ${product.name || 'สินค้า'}`, 'success');
    onProductPosted?.('facebook', [video.fileUri]);
  } catch (error) {
    emitStage(
      'failed',
      `โพสต์ Facebook ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
  }
}

async function postProductToInstagram(
  product: GoogleFlowRunnerProduct,
  videoAssets: AutoPilotProductVideoAsset[],
  channelId: string,
  emitStage: (stage: string, message: string, level?: AutoPilotLogLevel) => void,
  onProductPosted?: (platform: string, fileUris: string[]) => void
): Promise<void> {
  if (videoAssets.length === 0) {
    emitStage('posting_instagram', 'ข้ามโพสต์ Instagram: ยังไม่มีวิดีโอสำหรับสินค้านี้', 'warning');
    return;
  }

  // Instagram reels take exactly one video — post the first generated one,
  // same as Facebook/YouTube.
  const video = videoAssets[0];

  try {
    emitStage('uploading_instagram_asset', `กำลังอัปโหลดวิดีโอไป Instagram: ${product.name || 'สินค้า'}`);
    const assetUrl = await uploadBufferAsset(video.fileUri, video.mimeType || 'video/mp4');

    emitStage('posting_instagram', `กำลังโพสต์ Instagram: ${product.name || 'สินค้า'}`);
    const firstComment = USE_FIRST_COMMENT ? buildProductLinkFirstComment(product) : undefined;
    try {
      await createInstagramBufferPost({
        channelId,
        text: firstComment ? buildBufferPostText(product) : buildBufferPostTextWithLink(product),
        assetUrl,
        firstComment,
      });
    } catch (error) {
      if (!firstComment || !isFirstCommentNotAllowedError(error)) throw error;
      emitStage('posting_instagram', 'Buffer แพลนฟรีใช้คอมเมนต์แรกไม่ได้ — ใส่ลิงก์ในโพสต์แทนแล้วลองใหม่', 'warning');
      await createInstagramBufferPost({
        channelId,
        text: buildBufferPostTextWithLink(product),
        assetUrl,
      });
    }
    emitStage('posted_instagram', `โพสต์ Instagram สำเร็จ: ${product.name || 'สินค้า'}`, 'success');
    onProductPosted?.('instagram', [video.fileUri]);
  } catch (error) {
    emitStage(
      'failed',
      `โพสต์ Instagram ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
  }
}

async function postProductToYoutube(
  product: GoogleFlowRunnerProduct,
  videoAssets: AutoPilotProductVideoAsset[],
  channelId: string,
  emitStage: (stage: string, message: string, level?: AutoPilotLogLevel) => void,
  onProductPosted?: (platform: string, fileUris: string[]) => void
): Promise<void> {
  if (videoAssets.length === 0) {
    emitStage('posting_youtube', 'ข้ามโพสต์ YouTube: ยังไม่มีวิดีโอสำหรับสินค้านี้', 'warning');
    return;
  }

  // Buffer publishes YouTube posts as Shorts with exactly one video — post
  // the first generated video, same as Facebook.
  const video = videoAssets[0];

  try {
    emitStage('uploading_youtube_asset', `กำลังอัปโหลดวิดีโอไป YouTube: ${product.name || 'สินค้า'}`);
    const assetUrl = await uploadBufferAsset(video.fileUri, video.mimeType || 'video/mp4');

    emitStage('posting_youtube', `กำลังโพสต์ YouTube: ${product.name || 'สินค้า'}`);
    const title = buildYoutubeTitle(product);
    const text = buildBufferPostTextWithLink(product);

    await createYoutubeBufferPost({ channelId, text, assetUrl, title });
    emitStage('posted_youtube', `โพสต์ YouTube สำเร็จ: ${product.name || 'สินค้า'}`, 'success');
    onProductPosted?.('youtube', [video.fileUri]);
  } catch (error) {
    emitStage(
      'failed',
      `โพสต์ YouTube ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
  }
}

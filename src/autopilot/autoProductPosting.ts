import {
  createFacebookBufferPost,
  createInstagramBufferPost,
  createYoutubeBufferPost,
  uploadBufferAsset,
} from '@/autopilot/bufferPosting';
import type { AutoPilotLogLevel, AutoPilotSettings, GoogleFlowRunnerLogEntry, GoogleFlowRunnerProduct } from '@/autopilot/types';
import { limitShopeePostTextParts } from '@/autopilot/shopeePostTextLimit';
import { isShopeeShortLink } from '@/library/shopeeLinks';
import { reportWarning } from '@/lib/telemetry';
import {
  getAccessibilityStatus,
  postShopeeVideos,
  requestAndroidVideoPermission,
} from '@/native/AccessibilityBridge';
import type { NativeShopeePostingVideoInput } from '@/native/AccessibilityBridge';

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
const SHOPEE_POST_TIMEOUT_MS = 5 * 60_000;

class ShopeePostTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reportWarning('postProductToShopee: withTimeout fired', { timeoutMs });
      reject(new ShopeePostTimeoutError(message));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        reportWarning('postProductToShopee: postShopeeVideos resolved', {});
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reportWarning('postProductToShopee: postShopeeVideos rejected', {
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
  emit: EmitFn;
  runId: string;
  round: number;
  totalRounds: number;
  productIndex: number;
  totalProducts: number;
}

// Runs after auto pilot finishes generating (image +) video for one product,
// before the loop advances to the next one — deliberately awaited by the
// caller so posting always finishes before the next product starts. Shopee,
// Facebook and YouTube are independent: one failing is logged but never
// blocks the others or throws out to the caller (same "log and continue"
// behavior the image/video generation steps already have).
export async function postProductAfterGeneration(params: PostProductAfterGenerationParams): Promise<void> {
  const { product, videoAssets, settings, emit, runId, round, totalRounds, productIndex, totalProducts } = params;

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

  if (settings.autoPostShopee) {
    await postProductToShopee(product, videoAssets, emitStage);
  }

  if (settings.autoPostFacebook && settings.facebookChannelId) {
    await postProductToFacebook(product, videoAssets, settings.facebookChannelId, emitStage);
  }

  if (settings.autoPostInstagram && settings.instagramChannelId) {
    await postProductToInstagram(product, videoAssets, settings.instagramChannelId, emitStage);
  }

  if (settings.autoPostYoutube && settings.youtubeChannelId) {
    await postProductToYoutube(product, videoAssets, settings.youtubeChannelId, emitStage);
  }
}

// Post body = caption + hashtags; the affiliate link goes into the post's
// first comment instead ("พิกัดอยู่คอมเมนต์แรก" — links in the Facebook post
// body get reach-suppressed, so this is the standard affiliate tactic).
function buildBufferPostText(product: GoogleFlowRunnerProduct): string {
  return [product.caption?.trim(), product.hashtags?.trim()]
    .filter((part): part is string => !!part)
    .join('\n\n');
}

// Fallback composition with the link in the post body, for when Buffer
// rejects the first comment (free-plan limitation, confirmed live 2026-07-11).
function buildBufferPostTextWithLink(product: GoogleFlowRunnerProduct): string {
  const productUrl = product.productUrl?.trim();
  return [product.caption?.trim(), productUrl ? `พิกัด: ${productUrl}` : null, product.hashtags?.trim()]
    .filter((part): part is string => !!part)
    .join('\n\n');
}

function buildProductLinkFirstComment(product: GoogleFlowRunnerProduct): string | undefined {
  const productUrl = product.productUrl?.trim();
  return productUrl ? `พิกัด: ${productUrl}` : undefined;
}

// Buffer's exact wording: "Invalid post: First comment requires a paid plan.
// Please upgrade to use this feature."
function isFirstCommentNotAllowedError(error: unknown): boolean {
  return error instanceof Error && /first comment requires a paid plan/i.test(error.message);
}

async function postProductToShopee(
  product: GoogleFlowRunnerProduct,
  videoAssets: AutoPilotProductVideoAsset[],
  emitStage: (stage: string, message: string, level?: AutoPilotLogLevel) => void
): Promise<void> {
  if (videoAssets.length === 0) {
    emitStage('posting_shopee', 'ข้ามโพสต์ Shopee: ยังไม่มีวิดีโอสำหรับสินค้านี้', 'warning');
    return;
  }

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

    reportWarning('postProductToShopee: calling postShopeeVideos', { videoCount: videos.length });
    const result = await withTimeout(
      postShopeeVideos(videos, { skipReturnNavigation: true }),
      SHOPEE_POST_TIMEOUT_MS,
      'โพสต์ Shopee หมดเวลา (นานเกิน 5 นาที ไม่ได้รับผลลัพธ์จากระบบอัตโนมัติ)'
    );
    reportWarning('postProductToShopee: withTimeout settled, got result', { success: result.success });

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
  } catch (error) {
    reportWarning('postProductToShopee: caught error, emitting failed stage', {
      error: error instanceof Error ? error.message : String(error),
    });
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
  emitStage: (stage: string, message: string, level?: AutoPilotLogLevel) => void
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
    const firstComment = buildProductLinkFirstComment(product);
    try {
      await createFacebookBufferPost({
        channelId,
        text: buildBufferPostText(product),
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
  emitStage: (stage: string, message: string, level?: AutoPilotLogLevel) => void
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
    const firstComment = buildProductLinkFirstComment(product);
    try {
      await createInstagramBufferPost({
        channelId,
        text: buildBufferPostText(product),
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
  } catch (error) {
    emitStage(
      'failed',
      `โพสต์ Instagram ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
  }
}

// YouTube caps titles at 100 characters (enforced server-side too).
const YOUTUBE_TITLE_MAX_LENGTH = 100;

async function postProductToYoutube(
  product: GoogleFlowRunnerProduct,
  videoAssets: AutoPilotProductVideoAsset[],
  channelId: string,
  emitStage: (stage: string, message: string, level?: AutoPilotLogLevel) => void
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
    const title = (product.name?.trim() || product.caption?.trim().split('\n')[0] || 'วิดีโอสินค้า').slice(
      0,
      YOUTUBE_TITLE_MAX_LENGTH
    );
    const productUrl = product.productUrl?.trim();
    const text = [
      product.caption?.trim(),
      productUrl ? `พิกัด: ${productUrl}` : null,
      product.hashtags?.trim(),
    ]
      .filter((part): part is string => !!part)
      .join('\n\n');

    await createYoutubeBufferPost({ channelId, text, assetUrl, title });
    emitStage('posted_youtube', `โพสต์ YouTube สำเร็จ: ${product.name || 'สินค้า'}`, 'success');
  } catch (error) {
    emitStage(
      'failed',
      `โพสต์ YouTube ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
  }
}

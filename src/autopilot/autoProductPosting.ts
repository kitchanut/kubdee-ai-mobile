import {
  createFacebookBufferPost,
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
// caller so posting always finishes before the next product starts. Shopee
// and Facebook are independent: one failing is logged but never blocks the
// other or throws out to the caller (same "log and continue" behavior the
// image/video generation steps already have).
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
    const productUrl = product.productUrl?.trim();
    const text = [
      product.caption?.trim(),
      productUrl ? `พิกัด: ${productUrl}` : null,
      product.hashtags?.trim(),
    ]
      .filter((part): part is string => !!part)
      .join('\n\n');

    await createFacebookBufferPost({ channelId, text, assetUrl, assetType: 'video' });
    emitStage('posted_facebook', `โพสต์ Facebook สำเร็จ: ${product.name || 'สินค้า'}`, 'success');
  } catch (error) {
    emitStage(
      'failed',
      `โพสต์ Facebook ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
      'error'
    );
  }
}

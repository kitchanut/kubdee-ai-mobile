import {
  createFacebookBufferPost,
  uploadBufferAsset,
} from '@/autopilot/bufferPosting';
import type { AutoPilotLogLevel, AutoPilotSettings, GoogleFlowRunnerLogEntry, GoogleFlowRunnerProduct } from '@/autopilot/types';
import { limitShopeePostTextParts } from '@/autopilot/shopeePostTextLimit';
import { isShopeeShortLink } from '@/library/shopeeLinks';
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

    const result = await postShopeeVideos(videos);

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
    const text = [product.caption, product.cta, product.hashtags, product.productUrl]
      .map((part) => part?.trim())
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

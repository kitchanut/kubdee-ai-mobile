import { Linking, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as IntentLauncher from 'expo-intent-launcher';

import type { GeneratedMediaAsset } from '@/autopilot/generatedMediaStore';
import type { AffiliateProduct } from '@/library/types';
import { createGoogleFlowVideoThumbnail, deleteGoogleFlowAssets } from '@/native/AccessibilityBridge';
import {
  getCloudTransferText,
  type CloudTransferItem,
  type CloudTransferProgress,
  type CloudTransferVideoUploadItem,
} from '@/services/cloudTransferService';
import type { MediaKind, MediaGroupRecord, UploadDraft } from './types';

export const ANDROID_VIEW_ACTION = 'android.intent.action.VIEW';
export const FLAG_GRANT_READ_URI_PERMISSION = 1;

export function getItemCode(item: MediaGroupRecord): string {
  return item.code || item.id;
}

export function cleanText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

export function isGenericProductLabel(value: string | null | undefined): boolean {
  const label = cleanText(value);
  return !label || label === 'ไฟล์นำเข้า' || label === 'สินค้า';
}

export function isPlaceholderProductCode(value: string | null | undefined): boolean {
  const code = cleanText(value).toLowerCase();
  return !code || code === 'unknown' || code === 'device-import' || code === 'mobile-device-import';
}

export function getProductCode(product: AffiliateProduct): string {
  return cleanText(product.externalProductId) || cleanText(product.localId) || String(product.id ?? '');
}

export function getProductImageUri(product: AffiliateProduct | null | undefined): string | null {
  return cleanText(product?.imagePath) || cleanText(product?.imageUrl) || null;
}

export function getProductKey(product: AffiliateProduct): string {
  return cleanText(product.localId) || String(product.id ?? '');
}

export function findProductForAsset(products: AffiliateProduct[], asset: GeneratedMediaAsset | null | undefined): AffiliateProduct | null {
  if (!asset) {
    return null;
  }

  const productId = cleanText(asset.productId);
  const productCode = cleanText(asset.productCode);
  const productUrl = cleanText(asset.productUrl);
  const productName = cleanText(asset.productName);

  return products.find((product) => {
    const localId = cleanText(product.localId);
    const externalId = cleanText(product.externalProductId);
    const url = cleanText(product.productUrl);
    const name = cleanText(product.name);
    return (
      (!!productId && (productId === localId || productId === externalId || productId === String(product.id))) ||
      (!!productCode && (productCode === externalId || productCode === localId)) ||
      (!!productUrl && productUrl === url) ||
      (!!productName && !isGenericProductLabel(productName) && productName === name)
    );
  }) ?? null;
}

export function formatAssetDate(timestamp: number): string {
  return new Intl.DateTimeFormat('th-TH', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(timestamp));
}

export function formatAssetSize(sizeBytes: number | null): string {
  if (!sizeBytes || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return '-';
  }

  const sizeMb = sizeBytes / 1024 / 1024;
  if (sizeMb >= 1) {
    return `${sizeMb.toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
}

export function formatCloudTransferPhase(phase: CloudTransferProgress['phase']): string {
  if (phase === 'preparing') return 'เตรียมไฟล์';
  if (phase === 'creating') return 'สร้าง transfer';
  if (phase === 'uploading') return 'กำลังส่งไฟล์';
  if (phase === 'finalizing') return 'ยืนยันอัปโหลด';
  if (phase === 'downloading') return 'กำลังดาวน์โหลด';
  if (phase === 'saving') return 'บันทึกเข้าคลัง';
  if (phase === 'accepting') return 'ยืนยันรับไฟล์';
  if (phase === 'completed') return 'สำเร็จ';
  if (phase === 'failed') return 'ไม่สำเร็จ';
  return 'กำลังประมวลผล';
}

export function getCloudTransferProgress(status: CloudTransferProgress | null): number {
  if (!status || status.total <= 0) {
    return 0;
  }
  if (typeof status.bytesWritten === 'number' && typeof status.totalBytes === 'number' && status.totalBytes > 0) {
    const itemProgress = Math.max(0, Math.min(1, status.bytesWritten / status.totalBytes));
    return Math.min(1, (Math.max(0, status.current - 1) + itemProgress) / status.total);
  }
  if (status.phase === 'completed') {
    return 1;
  }
  return Math.min(1, Math.max(0, status.current - 0.65) / status.total);
}

export function formatCloudExpiry(timestamp: number | null | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return '-';
  }
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function getCloudTransferDisplayName(transfer: CloudTransferItem): string {
  return (
    getCloudTransferText(transfer, 'displayName') ||
    getCloudTransferText(transfer, 'productName') ||
    getCloudTransferText(transfer, 'title') ||
    getCloudTransferText(transfer, 'localName') ||
    cleanText(transfer.displayName) ||
    cleanText(transfer.filename) ||
    'Cloud Transfer Video'
  );
}

export function getCloudTransferTitle(transfer: CloudTransferItem): string {
  return stripFileExtension(getCloudTransferDisplayName(transfer)) || 'Cloud Transfer Video';
}

export function buildCloudUploadItem(asset: GeneratedMediaAsset): CloudTransferVideoUploadItem {
  return {
    id: asset.id,
    fileUri: asset.fileUri || '',
    fileName: asset.fileName,
    title: asset.title,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    profileLocalId: asset.profileLocalId,
    productId: asset.productId,
    productCode: asset.productCode,
    productName: asset.productName,
    productUrl: asset.productUrl,
    caption: asset.caption,
    hashtags: asset.hashtags,
    cta: asset.cta,
    platform: asset.platform,
  };
}

export function resolveCloudTransferProductFields(transfer: CloudTransferItem, fallbackProfileId: string): {
  caption: string | null;
  cta: string | null;
  hashtags: string | null;
  platform: string | null;
  productCode: string;
  productId: string;
  productName: string;
  productUrl: string | null;
  profileLocalId: string;
  title: string;
} {
  const title = getCloudTransferTitle(transfer);
  const productName = getCloudTransferText(transfer, 'productName') || 'ไฟล์นำเข้า';
  const productCode = getCloudTransferText(transfer, 'productId', 'productCode') || 'cloud-transfer';
  const productDbId = getCloudTransferText(transfer, 'productDbId');
  const productUrl = getCloudTransferText(transfer, 'productUrl') || null;
  const platform = getCloudTransferText(transfer, 'platform') || null;
  const caption = getCloudTransferText(transfer, 'caption') || null;
  const hashtags = getCloudTransferText(transfer, 'hashtags', 'hashtag') || null;
  const cta = getCloudTransferText(transfer, 'cta') || null;
  const profileLocalId = getCloudTransferText(transfer, 'profileId') || fallbackProfileId;

  return {
    caption,
    cta,
    hashtags,
    platform,
    productCode,
    productId: productDbId || productCode || transfer.id,
    productName,
    productUrl,
    profileLocalId,
    title,
  };
}

export function getFallbackMimeType(kind: MediaKind): string {
  return kind === 'images' ? 'image/*' : 'video/*';
}

export function getFallbackExtension(kind: MediaKind): string {
  return kind === 'images' ? 'jpg' : 'mp4';
}

export function getPickedFileName(uri: string, fileName?: string | null): string {
  const cleanFileName = cleanText(fileName);
  if (cleanFileName) {
    return cleanFileName;
  }

  const lastPathSegment = uri.split('?')[0]?.split('/').filter(Boolean).pop();
  if (!lastPathSegment) {
    return '';
  }

  try {
    return decodeURIComponent(lastPathSegment);
  } catch {
    return lastPathSegment;
  }
}

export function getFileExtension(value: string, fallback: string): string {
  const extension = value.split('?')[0]?.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
  return extension || fallback;
}

export function stripFileExtension(value: string): string {
  return value.replace(/\.[^/.]+$/, '').trim();
}

export function sanitizeFileNamePart(value: string, fallback: string): string {
  const cleanValue = value
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return cleanValue || fallback;
}

export function guessPickedMimeType(kind: MediaKind, fileName: string, provided?: string | null): string {
  const cleanMimeType = cleanText(provided);
  if (cleanMimeType) {
    return cleanMimeType;
  }

  const extension = getFileExtension(fileName, getFallbackExtension(kind));
  const imageMimeTypes: Record<string, string> = {
    avif: 'image/avif',
    gif: 'image/gif',
    heic: 'image/heic',
    heif: 'image/heif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  const videoMimeTypes: Record<string, string> = {
    m4v: 'video/x-m4v',
    mov: 'video/quicktime',
    mp4: 'video/mp4',
    webm: 'video/webm',
  };

  return kind === 'images'
    ? imageMimeTypes[extension] ?? 'image/jpeg'
    : videoMimeTypes[extension] ?? 'video/mp4';
}

export function getPickedAssetMatchesKind(kind: MediaKind, asset: ImagePicker.ImagePickerAsset): boolean {
  const fileName = getPickedFileName(asset.uri, asset.fileName).toLowerCase();
  const extension = getFileExtension(fileName, '');
  const imageExtensions = new Set(['avif', 'gif', 'heic', 'heif', 'jpeg', 'jpg', 'png', 'webp']);
  const videoExtensions = new Set(['m4v', 'mov', 'mp4', 'webm']);

  if (kind === 'images') {
    return (
      asset.type === 'image' ||
      (!asset.type && cleanText(asset.mimeType).startsWith('image/')) ||
      (!asset.type && imageExtensions.has(extension))
    );
  }

  return (
    asset.type === 'video' ||
    (!asset.type && cleanText(asset.mimeType).startsWith('video/')) ||
    (!asset.type && videoExtensions.has(extension))
  );
}

export async function copyPickedMediaToLibrary(
  kind: MediaKind,
  asset: ImagePicker.ImagePickerAsset,
  index: number
): Promise<{
  durationMs: number | null;
  fileName: string;
  fileUri: string;
  height: number | null;
  mimeType: string;
  sizeBytes: number | null;
  thumbnailUri: string | null;
  title: string;
  width: number | null;
}> {
  if (!FileSystem.documentDirectory) {
    throw new Error('Document directory is not available');
  }

  const fallbackExtension = getFallbackExtension(kind);
  const originalName = getPickedFileName(asset.uri, asset.fileName) || `${kind}-${Date.now()}-${index}.${fallbackExtension}`;
  const extension = getFileExtension(originalName, fallbackExtension);
  const title = stripFileExtension(originalName) || (kind === 'images' ? 'รูปภาพนำเข้า' : 'วิดีโอนำเข้า');
  const safeName = sanitizeFileNamePart(title, `${kind}-${index}`);
  const storageDirectory = `${FileSystem.documentDirectory}creative-media/${kind}`;
  const fileName = `${Date.now()}-${index}-${safeName}.${extension}`;
  const fileUri = `${storageDirectory}/${fileName}`;

  await FileSystem.makeDirectoryAsync(storageDirectory, { intermediates: true });
  await FileSystem.copyAsync({ from: asset.uri, to: fileUri });

  const width = asset.width > 0 ? asset.width : null;
  const height = asset.height > 0 ? asset.height : null;
  const durationMs =
    kind === 'videos' && typeof asset.duration === 'number' && Number.isFinite(asset.duration) && asset.duration > 0
      ? Math.round(asset.duration)
      : null;
  const thumbnailUri = kind === 'videos'
    ? await createGoogleFlowVideoThumbnail(fileUri).catch(() => null)
    : fileUri;

  return {
    durationMs,
    fileName,
    fileUri,
    height,
    mimeType: guessPickedMimeType(kind, originalName, asset.mimeType),
    sizeBytes: typeof asset.fileSize === 'number' && Number.isFinite(asset.fileSize) ? asset.fileSize : null,
    thumbnailUri,
    title,
    width,
  };
}

export async function createUploadDraft(
  kind: MediaKind,
  asset: ImagePicker.ImagePickerAsset,
  index: number
): Promise<UploadDraft> {
  const fallbackExtension = getFallbackExtension(kind);
  const originalName = getPickedFileName(asset.uri, asset.fileName) || `${kind}-${Date.now()}-${index}.${fallbackExtension}`;
  const title = stripFileExtension(originalName) || (kind === 'images' ? 'รูปภาพนำเข้า' : 'วิดีโอนำเข้า');
  const thumbnailUri = kind === 'videos'
    ? await createGoogleFlowVideoThumbnail(asset.uri).catch(() => null)
    : asset.uri;

  return {
    id: `upload-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    asset,
    fileName: originalName,
    title,
    productId: '',
    productName: '',
    productUrl: '',
    caption: '',
    hashtags: '',
    cta: '',
    thumbnailUri,
    sizeBytes: typeof asset.fileSize === 'number' && Number.isFinite(asset.fileSize) ? asset.fileSize : null,
  };
}

export async function openGeneratedFile(uri: string, kind: MediaKind, mimeType?: string | null): Promise<void> {
  if (Platform.OS === 'android' && uri.startsWith('file://')) {
    const contentUri = await FileSystem.getContentUriAsync(uri);
    await IntentLauncher.startActivityAsync(ANDROID_VIEW_ACTION, {
      data: contentUri,
      flags: FLAG_GRANT_READ_URI_PERMISSION,
      type: mimeType || getFallbackMimeType(kind),
    });
    return;
  }

  await Linking.openURL(uri);
}

export async function deleteLocalFiles(assets: GeneratedMediaAsset[]): Promise<number> {
  const fileUris = assets
    .map((asset) => asset.fileUri)
    .filter((uri): uri is string => !!uri && (uri.startsWith('content://') || uri.startsWith('file://')));
  if (fileUris.length === 0) {
    return 0;
  }

  try {
    const result = await deleteGoogleFlowAssets(fileUris);
    if (result.deleted > 0 || result.failed < fileUris.length) {
      return result.failed;
    }
  } catch {
    // Fallback below covers legacy file:// paths.
  }

  let failedCount = 0;
  for (const uri of fileUris) {
    if (!uri.startsWith('file://')) {
      failedCount += 1;
      continue;
    }
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      failedCount += 1;
    }
  }
  return failedCount;
}

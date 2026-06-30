import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image as NativeImage, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as IntentLauncher from 'expo-intent-launcher';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Download,
  Grid2X2,
  Heart,
  Image as ImageIcon,
  Link2,
  Package,
  Pencil,
  Play,
  RefreshCw,
  Search,
  ShoppingBag,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import { useAuth } from '@/auth/AuthContext';
import Text from '@/components/ui/KubdeeText';
import { useGeneratedMedia } from '@/autopilot/generatedMediaStore';
import type { GeneratedMediaAsset } from '@/autopilot/generatedMediaStore';
import { getLocalProducts } from '@/library/localProductDb';
import type { AffiliateProduct } from '@/library/types';
import { createGoogleFlowVideoThumbnail, deleteGoogleFlowAssets } from '@/native/AccessibilityBridge';
import {
  acceptCloudTransfer,
  downloadCloudTransferVideo,
  getCloudTransferText,
  listCloudTransferInbox,
  MAX_CLOUD_TRANSFER_VIDEO_BYTES,
  uploadCloudTransferVideos,
  type CloudTransferItem,
  type CloudTransferProgress,
  type CloudTransferVideoUploadItem,
} from '@/services/cloudTransferService';
import type { KubdeeTheme } from '@/theme/tokens';
import { alpha } from '@/theme/tokens';

import {
  CardBackdrop,
  EmptyHint,
  EmptyState,
  HeaderIconButton,
  LibraryPanelHeader,
  RowIconButton,
  SearchBox,
  SelectCircle,
  SelectionBar,
  SortPill,
  getAccentTone,
  libraryCardStops,
  type IconComponent,
} from './shared';

export type MediaKind = 'images' | 'videos';

type MediaMode = 'product' | 'general';

interface MediaSubItem {
  id: string;
  parentId: string;
  title: string;
  productName: string;
  productCode: string;
  date: string;
  size: string;
  portrait: boolean;
  warnings: string[];
  uri?: string | null;
  mimeType?: string | null;
  thumbnailUri?: string | null;
  productUrl?: string | null;
  caption?: string | null;
  hashtags?: string | null;
  cta?: string | null;
  platform?: string | null;
}

interface MediaGroupRecord {
  id: string;
  title: string;
  code: string;
  subtitle: string;
}

interface UploadDraft {
  id: string;
  asset: ImagePicker.ImagePickerAsset;
  fileName: string;
  title: string;
  productId: string;
  productName: string;
  productUrl: string;
  caption: string;
  hashtags: string;
  cta: string;
  thumbnailUri: string | null;
  sizeBytes: number | null;
}

/** Accent wash/border classes per media kind (mirrors getAccentTone soft = alpha 0.1 light / 0.16 dark). */
const accentClasses: Record<MediaKind, { soft: string; border: string }> = {
  images: {
    soft: 'bg-kd-amber/10 dark:bg-kd-amber/15',
    border: 'border-kd-amber/40',
  },
  videos: {
    soft: 'bg-kd-red/10 dark:bg-kd-red/15',
    border: 'border-kd-red/40',
  },
};

const panelCopy: Record<
  MediaKind,
  {
    title: string;
    productTab: string;
    generalTab: string;
    unit: string;
    emptyTitle: string;
    emptyCopy: string;
    emptyGeneral: string;
  }
> = {
  images: {
    title: 'คลังรูปภาพ',
    productTab: 'รูปภาพสินค้า',
    generalTab: 'รูปภาพทั่วไป',
    unit: 'รูป',
    emptyTitle: 'ยังไม่มีรูปภาพ',
    emptyCopy: 'รูปภาพที่สร้างหรือเพิ่มจากเครื่องจะถูกบันทึกไว้ที่นี่',
    emptyGeneral: 'ยังไม่มีรูปภาพทั่วไป',
  },
  videos: {
    title: 'คลังวิดีโอ',
    productTab: 'วิดีโอสินค้า',
    generalTab: 'วิดีโอทั่วไป',
    unit: 'วิดีโอ',
    emptyTitle: 'ยังไม่มีวิดีโอ',
    emptyCopy: 'วิดีโอที่สร้างหรือเพิ่มจากเครื่องจะถูกบันทึกไว้ที่นี่',
    emptyGeneral: 'ยังไม่มีวิดีโอทั่วไป',
  },
};

const ANDROID_VIEW_ACTION = 'android.intent.action.VIEW';
const FLAG_GRANT_READ_URI_PERMISSION = 1;

function getItemCode(item: MediaGroupRecord): string {
  return item.code || item.id;
}

function cleanText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function isGenericProductLabel(value: string | null | undefined): boolean {
  const label = cleanText(value);
  return !label || label === 'ไฟล์นำเข้า' || label === 'สินค้า';
}

function isPlaceholderProductCode(value: string | null | undefined): boolean {
  const code = cleanText(value).toLowerCase();
  return !code || code === 'unknown' || code === 'device-import' || code === 'mobile-device-import';
}

function getProductCode(product: AffiliateProduct): string {
  return cleanText(product.externalProductId) || cleanText(product.localId) || String(product.id ?? '');
}

function getProductImageUri(product: AffiliateProduct | null | undefined): string | null {
  return cleanText(product?.imageUrl) || cleanText(product?.imagePath) || null;
}

function getProductKey(product: AffiliateProduct): string {
  return cleanText(product.localId) || String(product.id ?? '');
}

function findProductForAsset(products: AffiliateProduct[], asset: GeneratedMediaAsset | null | undefined): AffiliateProduct | null {
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

function formatAssetDate(timestamp: number): string {
  return new Intl.DateTimeFormat('th-TH', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(timestamp));
}

function formatAssetSize(sizeBytes: number | null): string {
  if (!sizeBytes || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return '-';
  }

  const sizeMb = sizeBytes / 1024 / 1024;
  if (sizeMb >= 1) {
    return `${sizeMb.toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
}

function formatCloudTransferPhase(phase: CloudTransferProgress['phase']): string {
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

function getCloudTransferProgress(status: CloudTransferProgress | null): number {
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

function formatCloudExpiry(timestamp: number | null | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return '-';
  }
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function getCloudTransferDisplayName(transfer: CloudTransferItem): string {
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

function getCloudTransferTitle(transfer: CloudTransferItem): string {
  return stripFileExtension(getCloudTransferDisplayName(transfer)) || 'Cloud Transfer Video';
}

function buildCloudUploadItem(asset: GeneratedMediaAsset): CloudTransferVideoUploadItem {
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

function resolveCloudTransferProductFields(transfer: CloudTransferItem, fallbackProfileId: string): {
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

function getFallbackMimeType(kind: MediaKind): string {
  return kind === 'images' ? 'image/*' : 'video/*';
}

function getFallbackExtension(kind: MediaKind): string {
  return kind === 'images' ? 'jpg' : 'mp4';
}

function getPickedFileName(uri: string, fileName?: string | null): string {
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

function getFileExtension(value: string, fallback: string): string {
  const extension = value.split('?')[0]?.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
  return extension || fallback;
}

function stripFileExtension(value: string): string {
  return value.replace(/\.[^/.]+$/, '').trim();
}

function sanitizeFileNamePart(value: string, fallback: string): string {
  const cleanValue = value
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return cleanValue || fallback;
}

function guessPickedMimeType(kind: MediaKind, fileName: string, provided?: string | null): string {
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

function getPickedAssetMatchesKind(kind: MediaKind, asset: ImagePicker.ImagePickerAsset): boolean {
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

async function copyPickedMediaToLibrary(
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

async function createUploadDraft(
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

async function openGeneratedFile(uri: string, kind: MediaKind, mimeType?: string | null): Promise<void> {
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

async function deleteLocalFiles(assets: GeneratedMediaAsset[]): Promise<number> {
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

function LocalVideoPlaceholder({
  theme,
  compact = false,
  thumbnailUri,
}: {
  theme: KubdeeTheme;
  compact?: boolean;
  thumbnailUri?: string | null;
}): React.JSX.Element {
  return (
    <View className="h-full w-full items-center justify-center bg-kd-border dark:bg-kd-card-muted">
      {thumbnailUri ? (
        <NativeImage source={{ uri: thumbnailUri }} className="h-full w-full" resizeMode="cover" />
      ) : (
        <Video size={compact ? 18 : 28} color={theme.textSubtle} strokeWidth={1.5} />
      )}
      <View className="absolute inset-0 bg-black/10" />
      <View
        className={`absolute items-center justify-center rounded-full bg-black/35 ${
          compact ? 'h-7 w-7' : 'h-11 w-11'
        }`}
      >
        <Play size={compact ? 14 : 20} color={theme.white} strokeWidth={2.2} />
      </View>
    </View>
  );
}

function LocalVideoPlayer({
  media,
  theme,
}: {
  media: MediaSubItem;
  theme: KubdeeTheme;
}): React.JSX.Element {
  const player = useVideoPlayer(
    media.uri ? { uri: media.uri, metadata: { title: media.title, artist: media.productName } } : null,
    (nextPlayer) => {
      nextPlayer.loop = false;
      nextPlayer.muted = false;
      nextPlayer.play();
    }
  );
  if (!media.uri) {
    return (
      <View className="items-center gap-2">
        <Video size={36} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />
        <Text className="text-kd-caption text-white/60">ไม่พบไฟล์วิดีโอ</Text>
      </View>
    );
  }

  return (
    <View className="w-full overflow-hidden rounded-[18px] bg-black" style={{ aspectRatio: media.portrait ? 9 / 16 : 16 / 9 }}>
      <VideoView
        player={player}
        nativeControls
        contentFit="contain"
        useExoShutter={false}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function toGeneratedGroups(kind: MediaKind, assets: GeneratedMediaAsset[]): Array<{ item: MediaGroupRecord; media: MediaSubItem[] }> {
  const groupsByProduct = new Map<string, { item: MediaGroupRecord; media: MediaSubItem[] }>();
  for (const asset of assets) {
    const groupId = `generated-${kind}-${asset.productCode || asset.productId}`;
    const subtitle = asset.source === 'mobile-local-upload'
      ? 'เพิ่มจากเครื่อง'
      : asset.source === 'mobile-device-import'
        ? 'นำเข้าไฟล์จากเครื่อง'
        : asset.source === 'cloud-transfer'
          ? 'รับจาก Cloud Transfer'
          : 'Google Flow | Auto Pilot';
    const existing = groupsByProduct.get(groupId);
    const group =
      existing ??
      {
        item: {
          id: groupId,
          title: asset.productName,
          code: asset.productCode,
          subtitle,
        },
        media: [],
      };

    group.media.push({
      id: asset.id,
      parentId: groupId,
      title: asset.title,
      productName: asset.productName,
      productCode: asset.productCode,
      date: formatAssetDate(asset.createdAt),
      size: formatAssetSize(asset.sizeBytes),
      portrait: true,
      warnings: [],
      uri: asset.fileUri,
      mimeType: asset.mimeType,
      thumbnailUri: asset.thumbnailUri,
      productUrl: asset.productUrl,
      caption: asset.caption,
      hashtags: asset.hashtags,
      cta: asset.cta,
      platform: asset.platform,
    });

    groupsByProduct.set(groupId, group);
  }

  return Array.from(groupsByProduct.values()).map((group) => ({
    ...group,
    media: group.media.sort((first, second) => second.id.localeCompare(first.id)),
  }));
}

export default function MediaPanel({
  theme,
  kind,
  selectedProfileId,
  onSendVideosToShopee,
}: {
  theme: KubdeeTheme;
  kind: MediaKind;
  selectedProfileId: string;
  onSendVideosToShopee?: (videoIds: string[]) => void;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const {
    addGeneratedMediaAsset,
    deleteGeneratedMediaAssets,
    ensureGeneratedVideoThumbnails,
    getAssetsByKind,
    refreshGeneratedMediaAssets,
    updateGeneratedMediaAsset,
  } = useGeneratedMedia();
  const copy = panelCopy[kind];
  const accentColor = kind === 'images' ? theme.amber : theme.red;
  const accent = getAccentTone(theme, accentColor);
  const accentClass = accentClasses[kind];
  const HeaderIcon = kind === 'images' ? ImageIcon : Video;

  const modeTabs: Array<{ key: MediaMode; icon: IconComponent; label: string }> = [
    { key: 'product', icon: Package, label: copy.productTab },
    { key: 'general', icon: HeaderIcon, label: copy.generalTab },
  ];

  const [mediaMode, setMediaMode] = useState<MediaMode>('product');
  const [searchQuery, setSearchQuery] = useState('');
  const [groupByProduct, setGroupByProduct] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<'name' | 'code' | 'date'>('name');
  const [sortAscending, setSortAscending] = useState(true);
  const [previewMedia, setPreviewMedia] = useState<MediaSubItem | null>(null);
  const [editMedia, setEditMedia] = useState<MediaSubItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editProductName, setEditProductName] = useState('');
  const [editProductCode, setEditProductCode] = useState('');
  const [editProductUrl, setEditProductUrl] = useState('');
  const [editCaption, setEditCaption] = useState('');
  const [editHashtags, setEditHashtags] = useState('');
  const [editCta, setEditCta] = useState('');
  const [productOptions, setProductOptions] = useState<AffiliateProduct[]>([]);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productPickerQuery, setProductPickerQuery] = useState('');
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isAddingMedia, setIsAddingMedia] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [uploadDrafts, setUploadDrafts] = useState<UploadDraft[]>([]);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cloudInboxOpen, setCloudInboxOpen] = useState(false);
  const [cloudInboxLoading, setCloudInboxLoading] = useState(false);
  const [cloudTransfers, setCloudTransfers] = useState<CloudTransferItem[]>([]);
  const [selectedCloudTransferIds, setSelectedCloudTransferIds] = useState<Set<string>>(new Set());
  const [cloudUploadConfirmAssets, setCloudUploadConfirmAssets] = useState<GeneratedMediaAsset[]>([]);
  const [cloudTransferStatus, setCloudTransferStatus] = useState<CloudTransferProgress | null>(null);
  const [cloudTransferWorking, setCloudTransferWorking] = useState(false);
  const ensuringVideoThumbnailsRef = useRef(false);

  const generatedAssets = getAssetsByKind(kind, selectedProfileId);
  useEffect(() => {
    let cancelled = false;
    setIsLoadingProducts(true);
    void getLocalProducts({ profileLocalId: selectedProfileId })
      .then((products) => {
        if (!cancelled) {
          setProductOptions(products);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProductOptions([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingProducts(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProfileId]);
  useEffect(() => {
    if (kind !== 'videos' || ensuringVideoThumbnailsRef.current) {
      return;
    }
    ensuringVideoThumbnailsRef.current = true;
    void ensureGeneratedVideoThumbnails(selectedProfileId).finally(() => {
      ensuringVideoThumbnailsRef.current = false;
    });
  }, [ensureGeneratedVideoThumbnails, kind, selectedProfileId]);

  const generatedAssetById = useMemo(
    () => new Map(generatedAssets.map((asset) => [asset.id, asset])),
    [generatedAssets]
  );
  const editAsset = editMedia ? generatedAssetById.get(editMedia.id) ?? null : null;
  const selectedEditProduct = useMemo(
    () => findProductForAsset(productOptions, editAsset),
    [editAsset, productOptions]
  );
  const editFieldMatchedProduct = useMemo(() => {
    const productName = cleanText(editProductName);
    const productCode = cleanText(editProductCode);
    const productUrl = cleanText(editProductUrl);
    return productOptions.find((product) => {
      const code = getProductCode(product);
      return (
        (!!productCode && productCode === code) ||
        (!!productUrl && productUrl === cleanText(product.productUrl)) ||
        (!!productName && productName === cleanText(product.name))
      );
    }) ?? null;
  }, [editProductCode, editProductName, editProductUrl, productOptions]);
  const editProductImageUri = getProductImageUri(editFieldMatchedProduct ?? selectedEditProduct);
  const filteredProductOptions = useMemo(() => {
    const query = productPickerQuery.trim().toLowerCase();
    if (!query) {
      return productOptions;
    }

    return productOptions.filter((product) =>
      [
        product.name,
        product.externalProductId,
        product.productUrl,
        product.caption,
        product.hashtags,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [productOptions, productPickerQuery]);
  const groups = useMemo(() => {
    return toGeneratedGroups(kind, generatedAssets);
  }, [generatedAssets, kind]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const visibleGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = groups.filter(({ item }) => {
      if (!query) return true;
      return [item.title, getItemCode(item)].join(' ').toLowerCase().includes(query);
    });
    const direction = sortAscending ? 1 : -1;
    filtered.sort((first, second) => {
      if (sortKey === 'code') {
        return direction * getItemCode(first.item).localeCompare(getItemCode(second.item), 'th');
      }
      if (sortKey === 'date') {
        return direction * first.item.id.localeCompare(second.item.id, 'th');
      }
      return direction * first.item.title.localeCompare(second.item.title, 'th');
    });
    return filtered;
  }, [groups, searchQuery, sortAscending, sortKey]);

  const productMedia = useMemo(() => visibleGroups.flatMap((group) => group.media), [visibleGroups]);
  const totalMedia = useMemo(() => groups.reduce((sum, group) => sum + group.media.length, 0), [groups]);
  const allSelected = productMedia.length > 0 && productMedia.every((media) => selectedIds.has(media.id));
  const allCloudTransfersSelected =
    cloudTransfers.length > 0 && cloudTransfers.every((transfer) => selectedCloudTransferIds.has(transfer.id));
  const cloudUploadConfirmTotalBytes = useMemo(
    () => cloudUploadConfirmAssets.reduce((sum, asset) => sum + (asset.sizeBytes || 0), 0),
    [cloudUploadConfirmAssets]
  );
  const cloudUploadConfirmTooLargeCount = useMemo(
    () => cloudUploadConfirmAssets.filter((asset) => (asset.sizeBytes || 0) > MAX_CLOUD_TRANSFER_VIDEO_BYTES).length,
    [cloudUploadConfirmAssets]
  );
  const cloudUploadConfirmPreview = useMemo(
    () => cloudUploadConfirmAssets.slice(0, 5),
    [cloudUploadConfirmAssets]
  );
  const cloudProgressValue = getCloudTransferProgress(cloudTransferStatus);

  const toggleSelect = (id: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (): void => {
    setSelectedIds(() => {
      if (allSelected) return new Set();
      return new Set(productMedia.map((media) => media.id));
    });
  };

  const changeSort = (next: 'name' | 'code' | 'date'): void => {
    if (sortKey === next) {
      setSortAscending((current) => !current);
      return;
    }
    setSortKey(next);
    setSortAscending(next !== 'date');
  };

  const toggleGroup = (id: string): void => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = async (): Promise<void> => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    confirmDelete(ids);
  };

  const sendSelectedVideosToShopee = (): void => {
    if (kind !== 'videos' || !onSendVideosToShopee) {
      return;
    }

    const ids = Array.from(selectedIds).filter((id) => generatedAssetById.has(id));
    if (ids.length === 0) {
      toast.warning('เลือกวิดีโอก่อนส่งไป Shopee');
      return;
    }

    onSendVideosToShopee(ids);
    setSelectedIds(new Set());
    toast.success(`ส่งไป Shopee ${ids.length} วิดีโอ`);
  };

  const openCloudInbox = async (): Promise<void> => {
    if (kind !== 'videos') {
      return;
    }
    if (!token) {
      toast.warning('กรุณาเข้าสู่ระบบก่อนใช้ Cloud Transfer');
      return;
    }
    if (cloudInboxLoading || cloudTransferWorking) {
      return;
    }

    setCloudInboxOpen(true);
    setCloudInboxLoading(true);
    try {
      const result = await listCloudTransferInbox();
      if (!result.success) {
        setCloudTransfers([]);
        setSelectedCloudTransferIds(new Set());
        toast.error(result.error || 'โหลด Cloud Transfer ไม่สำเร็จ');
        return;
      }

      setCloudTransfers(result.transfers);
      setSelectedCloudTransferIds(new Set());
      if (result.transfers.length === 0) {
        toast.info('ยังไม่มีวิดีโอใน Cloud Transfer');
      }
    } catch (error) {
      setCloudTransfers([]);
      setSelectedCloudTransferIds(new Set());
      toast.error(error instanceof Error ? error.message : 'โหลด Cloud Transfer ไม่สำเร็จ');
    } finally {
      setCloudInboxLoading(false);
    }
  };

  const toggleCloudTransfer = (id: string): void => {
    setSelectedCloudTransferIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllCloudTransfers = (): void => {
    setSelectedCloudTransferIds(() => {
      if (allCloudTransfersSelected) return new Set();
      return new Set(cloudTransfers.map((transfer) => transfer.id));
    });
  };

  const performCloudUpload = async (assets: GeneratedMediaAsset[]): Promise<void> => {
    setCloudTransferWorking(true);
    setCloudTransferStatus({
      mode: 'upload',
      phase: 'preparing',
      current: 1,
      total: assets.length,
      filename: '',
    });

    try {
      const result = await uploadCloudTransferVideos(assets.map(buildCloudUploadItem), setCloudTransferStatus);
      setCloudTransferStatus({
        mode: 'upload',
        phase: result.failed > 0 ? 'failed' : 'completed',
        current: result.total,
        total: result.total,
        filename: '',
      });

      if (result.uploaded > 0) {
        setSelectedIds(new Set());
      }

      const deduped = result.results.filter((item) => item.deduped).length;
      if (result.failed > 0) {
        toast.warning(`ส่งขึ้น Cloud สำเร็จ ${result.uploaded}/${result.total} ไฟล์`);
      } else {
        toast.success(`ส่งขึ้น Cloud Transfer แล้ว ${result.uploaded} ไฟล์${deduped ? ` · ซ้ำ ${deduped}` : ''}`);
      }
    } catch (error) {
      setCloudTransferStatus((current) => current ? { ...current, phase: 'failed' } : null);
      toast.error(error instanceof Error ? error.message : 'ส่งขึ้น Cloud Transfer ไม่สำเร็จ');
    } finally {
      setTimeout(() => {
        setCloudTransferWorking(false);
        setCloudTransferStatus(null);
      }, 500);
    }
  };

  const uploadSelectedVideosToCloud = (): void => {
    if (kind !== 'videos') {
      return;
    }
    if (!token) {
      toast.warning('กรุณาเข้าสู่ระบบก่อนใช้ Cloud Transfer');
      return;
    }

    const assets = Array.from(selectedIds)
      .map((id) => generatedAssetById.get(id))
      .filter((asset): asset is GeneratedMediaAsset => !!asset?.fileUri);

    if (assets.length === 0) {
      toast.warning('เลือกวิดีโอที่มีไฟล์ก่อนส่งขึ้น Cloud');
      return;
    }

    setCloudUploadConfirmAssets(assets);
  };

  const confirmCloudUpload = async (): Promise<void> => {
    const assets = cloudUploadConfirmAssets;
    if (assets.length === 0 || cloudTransferWorking) {
      return;
    }

    setCloudUploadConfirmAssets([]);
    await performCloudUpload(assets);
  };

  const downloadSelectedCloudTransfers = async (): Promise<void> => {
    if (cloudTransferWorking) {
      return;
    }
    if (!token) {
      toast.warning('กรุณาเข้าสู่ระบบก่อนใช้ Cloud Transfer');
      return;
    }

    const selectedTransfers = cloudTransfers.filter((transfer) => selectedCloudTransferIds.has(transfer.id));
    if (selectedTransfers.length === 0) {
      toast.warning('เลือกรายการจาก Cloud Transfer ก่อน');
      return;
    }

    setCloudInboxOpen(false);
    setCloudTransferWorking(true);
    let downloaded = 0;
    let failed = 0;

    try {
      for (let index = 0; index < selectedTransfers.length; index += 1) {
        const transfer = selectedTransfers[index];
        const filename = getCloudTransferDisplayName(transfer);

        try {
          setCloudTransferStatus({
            mode: 'download',
            phase: 'downloading',
            current: index + 1,
            total: selectedTransfers.length,
            filename,
          });

          const downloadedVideo = await downloadCloudTransferVideo(
            transfer,
            setCloudTransferStatus,
            index,
            selectedTransfers.length
          );
          const fields = resolveCloudTransferProductFields(transfer, selectedProfileId);

          setCloudTransferStatus({
            mode: 'download',
            phase: 'saving',
            current: index + 1,
            total: selectedTransfers.length,
            filename,
          });

          const thumbnailUri = await createGoogleFlowVideoThumbnail(downloadedVideo.fileUri).catch(() => null);
          await addGeneratedMediaAsset({
            kind: 'videos',
            runId: 'cloud-transfer',
            profileLocalId: fields.profileLocalId,
            productId: fields.productId,
            productName: fields.productName,
            productCode: fields.productCode,
            productUrl: fields.productUrl,
            caption: fields.caption,
            hashtags: fields.hashtags,
            cta: fields.cta,
            platform: fields.platform,
            title: fields.title,
            fileUri: downloadedVideo.fileUri,
            fileName: downloadedVideo.fileName,
            mimeType: downloadedVideo.mimeType,
            thumbnailUri,
            sizeBytes: downloadedVideo.sizeBytes,
            width: downloadedVideo.width,
            height: downloadedVideo.height,
            durationMs: downloadedVideo.durationMs,
            source: 'cloud-transfer',
            createdAt: Date.now() + index,
          });

          setCloudTransferStatus({
            mode: 'download',
            phase: 'accepting',
            current: index + 1,
            total: selectedTransfers.length,
            filename,
          });
          await acceptCloudTransfer(transfer.id).catch(() => undefined);
          downloaded += 1;
        } catch (error) {
          failed += 1;
          toast.error(error instanceof Error ? error.message : `รับ ${filename} ไม่สำเร็จ`);
        }
      }

      await refreshGeneratedMediaAssets();
      setSelectedCloudTransferIds(new Set());
      setCloudTransfers((current) => current.filter((transfer) => !selectedTransfers.some((item) => item.id === transfer.id)));

      setCloudTransferStatus({
        mode: 'download',
        phase: failed > 0 ? 'failed' : 'completed',
        current: selectedTransfers.length,
        total: selectedTransfers.length,
        filename: '',
      });

      if (downloaded > 0 && failed === 0) {
        toast.success(`รับวิดีโอจาก Cloud Transfer แล้ว ${downloaded} ไฟล์`);
      } else if (downloaded > 0) {
        toast.warning(`รับสำเร็จ ${downloaded}/${selectedTransfers.length} ไฟล์`);
      } else {
        toast.error('รับวิดีโอจาก Cloud Transfer ไม่สำเร็จ');
      }
    } finally {
      setTimeout(() => {
        setCloudTransferWorking(false);
        setCloudTransferStatus(null);
      }, 500);
    }
  };

  const openMedia = async (media: MediaSubItem): Promise<void> => {
    if (!media.uri) {
      toast.warning('ไม่พบไฟล์สำหรับเปิด');
      return;
    }

    setPreviewMedia(media);
  };

  const openEdit = (media: MediaSubItem): void => {
    const asset = generatedAssetById.get(media.id);
    setEditMedia(media);
    setEditTitle(media.title);
    setEditProductName(isGenericProductLabel(asset?.productName ?? media.productName) ? '' : cleanText(asset?.productName ?? media.productName));
    setEditProductCode(isPlaceholderProductCode(asset?.productCode ?? media.productCode) ? '' : cleanText(asset?.productCode ?? media.productCode));
    setEditProductUrl(cleanText(asset?.productUrl ?? media.productUrl));
    setEditCaption(cleanText(asset?.caption ?? media.caption));
    setEditHashtags(cleanText(asset?.hashtags ?? media.hashtags));
    setEditCta(cleanText(asset?.cta ?? media.cta));
    setProductPickerQuery('');
  };

  const applyProductToEdit = (product: AffiliateProduct | null): void => {
    if (!product) {
      setEditProductName('');
      setEditProductCode('');
      setEditProductUrl('');
      setEditCaption('');
      setEditHashtags('');
      setEditCta('');
      setProductPickerOpen(false);
      return;
    }

    setEditProductName(product.name);
    setEditProductCode(getProductCode(product));
    setEditProductUrl(cleanText(product.productUrl));
    setEditCaption(cleanText(product.caption));
    setEditHashtags(cleanText(product.hashtags));
    setEditCta(cleanText(product.cta));
    setProductPickerOpen(false);
  };

  const saveEdit = async (): Promise<void> => {
    if (!editMedia) return;
    const title = editTitle.trim();
    if (!title) {
      toast.warning('กรุณากรอกชื่อ');
      return;
    }

    const productName = editProductName.trim();
    const productCode = editProductCode.trim();
    const productUrl = editProductUrl.trim();
    const caption = editCaption.trim();
    const hashtags = editHashtags.trim();
    const cta = editCta.trim();
    const hasBinding = Boolean(productName || productCode || productUrl || caption || hashtags || cta);
    const selectedProduct = productOptions.find((product) => {
      const code = getProductCode(product);
      return (
        (!!productCode && productCode === code) ||
        (!!productUrl && productUrl === cleanText(product.productUrl)) ||
        (!!productName && productName === cleanText(product.name))
      );
    }) ?? null;

    const updated = await updateGeneratedMediaAsset(editMedia.id, {
      title,
      productId: hasBinding ? (selectedProduct ? getProductKey(selectedProduct) : productCode || productName || editMedia.id) : 'device-import',
      productName: hasBinding ? productName || productCode || 'สินค้า' : 'ไฟล์นำเข้า',
      productCode: hasBinding ? productCode || productName || 'unknown' : 'device-import',
      productUrl: productUrl || null,
      caption: caption || null,
      hashtags: hashtags || null,
      cta: cta || null,
      platform: hasBinding ? selectedProduct?.platform || 'shopee' : null,
    });
    if (!updated) {
      toast.error('ไม่พบรายการที่จะแก้ไข');
      return;
    }

    setEditMedia(null);
    setProductPickerOpen(false);
    setPreviewMedia((current) => (
      current?.id === editMedia.id
        ? {
          ...current,
          title,
          productName: updated.productName,
          productCode: updated.productCode,
          productUrl: updated.productUrl,
          caption: updated.caption,
          hashtags: updated.hashtags,
          cta: updated.cta,
          platform: updated.platform,
        }
        : current
    ));
    toast.success('บันทึกแล้ว');
  };

  const editSelected = (): void => {
    const ids = Array.from(selectedIds);
    if (ids.length !== 1) {
      toast.warning('เลือกทีละรายการเพื่อแก้ไข');
      return;
    }

    const selectedMedia = productMedia.find((media) => media.id === ids[0]);
    if (!selectedMedia) {
      toast.error('ไม่พบรายการที่จะแก้ไข');
      return;
    }

    openEdit(selectedMedia);
  };

  const downloadMedia = async (media: MediaSubItem): Promise<void> => {
    if (!media.uri) {
      toast.warning('ไม่พบไฟล์สำหรับดาวน์โหลด');
      return;
    }

    try {
      await openGeneratedFile(media.uri, kind, media.mimeType);
      toast.success('เปิดไฟล์แล้ว สามารถบันทึกจากแอปปลายทางได้');
    } catch {
      toast.error('เปิดไฟล์ไม่สำเร็จ');
    }
  };

  const performDelete = async (ids: string[]): Promise<void> => {
    const assetsToDelete = ids
      .map((id) => generatedAssetById.get(id))
      .filter((asset): asset is GeneratedMediaAsset => !!asset);
    if (assetsToDelete.length === 0) {
      toast.error('ไม่พบรายการที่จะลบ');
      return;
    }

    await deleteGeneratedMediaAssets(assetsToDelete.map((asset) => asset.id));
    const failedFileCount = await deleteLocalFiles(assetsToDelete);
    const idSet = new Set(assetsToDelete.map((asset) => asset.id));
    setSelectedIds((current) => new Set(Array.from(current).filter((id) => !idSet.has(id))));
    setPreviewMedia((current) => (current && idSet.has(current.id) ? null : current));
    setEditMedia((current) => (current && idSet.has(current.id) ? null : current));

    if (failedFileCount > 0) {
      toast.warning(`ลบรายการแล้ว แต่ลบไฟล์ไม่ได้ ${failedFileCount} ไฟล์`);
      return;
    }
    toast.success(`ลบแล้ว ${assetsToDelete.length} ${copy.unit}`);
  };

  const confirmDelete = (ids: string[]): void => {
    const cleanIds = ids.filter((id) => generatedAssetById.has(id));
    if (cleanIds.length === 0) return;

    Alert.alert(`ลบ${copy.unit}?`, `ต้องการลบ ${cleanIds.length} ${copy.unit} ออกจากคลังนี้หรือไม่`, [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: () => {
          void performDelete(cleanIds);
        },
      },
    ]);
  };

  const refreshMedia = async (): Promise<void> => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshGeneratedMediaAssets();
      toast.success('รีเฟรชคลังแล้ว');
    } catch {
      toast.error('รีเฟรชคลังไม่สำเร็จ');
    } finally {
      setIsRefreshing(false);
    }
  };

  const pickMediaFiles = async (append = false): Promise<void> => {
    if (isAddingMedia || isUploadingMedia) return;
    setIsAddingMedia(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast.warning('กรุณาอนุญาตให้เข้าถึงคลังรูป/วิดีโอก่อน');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: kind === 'images' ? ['images'] : ['videos'],
        quality: 1,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const pickedAssets = result.assets.filter((asset) => getPickedAssetMatchesKind(kind, asset));
      if (pickedAssets.length === 0) {
        toast.warning(kind === 'images' ? 'กรุณาเลือกรูปภาพเท่านั้น' : 'กรุณาเลือกวิดีโอเท่านั้น');
        return;
      }

      const startIndex = append ? uploadDrafts.length : 0;
      const nextDrafts = await Promise.all(
        pickedAssets.map((asset, index) => createUploadDraft(kind, asset, startIndex + index))
      );
      setUploadDrafts((current) => (append ? [...current, ...nextDrafts] : nextDrafts));
      setUploadModalOpen(true);
    } catch {
      toast.error('เลือกไฟล์ไม่สำเร็จ');
    } finally {
      setIsAddingMedia(false);
    }
  };

  const updateUploadDraft = (id: string, field: keyof Pick<UploadDraft, 'caption' | 'cta' | 'hashtags' | 'productId' | 'productName' | 'productUrl' | 'title'>, value: string): void => {
    setUploadDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, [field]: value } : draft)));
  };

  const removeUploadDraft = (id: string): void => {
    setUploadDrafts((current) => {
      const next = current.filter((draft) => draft.id !== id);
      if (next.length === 0) {
        setUploadModalOpen(false);
      }
      return next;
    });
  };

  const closeUploadModal = (): void => {
    if (isUploadingMedia) return;
    setUploadModalOpen(false);
    setUploadDrafts([]);
  };

  const confirmUploadDrafts = async (): Promise<void> => {
    if (isUploadingMedia || uploadDrafts.length === 0) return;
    setIsUploadingMedia(true);
    try {
      let imported = 0;
      for (const [index, draft] of uploadDrafts.entries()) {
        const copiedAsset = await copyPickedMediaToLibrary(kind, draft.asset, index);
        const title = cleanText(draft.title) || copiedAsset.title;
        const productId = cleanText(draft.productId);
        const productName = cleanText(draft.productName);
        const productUrl = cleanText(draft.productUrl);
        const caption = cleanText(draft.caption);
        const hashtags = cleanText(draft.hashtags);
        const cta = cleanText(draft.cta);
        const hasProductBinding = Boolean(productId || productName || productUrl);

        await addGeneratedMediaAsset({
          kind,
          runId: 'mobile-local-upload',
          profileLocalId: selectedProfileId,
          productId: hasProductBinding ? productId || productUrl || productName : 'device-import',
          productName: hasProductBinding ? productName || productId || 'สินค้าจากลิงก์' : 'ไฟล์นำเข้า',
          productCode: hasProductBinding ? productId || productName || 'shopee-link' : 'device-import',
          productUrl: productUrl || null,
          caption: caption || null,
          hashtags: hashtags || null,
          cta: cta || null,
          platform: hasProductBinding ? 'shopee' : null,
          title,
          fileUri: copiedAsset.fileUri,
          fileName: copiedAsset.fileName,
          mimeType: copiedAsset.mimeType,
          thumbnailUri: copiedAsset.thumbnailUri,
          sizeBytes: copiedAsset.sizeBytes,
          width: copiedAsset.width,
          height: copiedAsset.height,
          durationMs: copiedAsset.durationMs,
          source: 'mobile-local-upload',
          createdAt: Date.now() + index,
        });
        imported += 1;
      }

      await refreshGeneratedMediaAssets();
      if (imported > 0) {
        setMediaMode('product');
        setUploadDrafts([]);
        setUploadModalOpen(false);
        toast.success(`เพิ่มเข้าคลังแล้ว ${imported} ${copy.unit}`);
        return;
      }
    } catch {
      toast.error('อัพโหลดไฟล์ไม่สำเร็จ');
    } finally {
      setIsUploadingMedia(false);
    }
  };

  return (
    <View className="flex-1">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-3 px-3 pb-20 pt-3">
        <LibraryPanelHeader
          theme={theme}
          title={copy.title}
          count={productMedia.length}
          total={totalMedia}
          icon={HeaderIcon}
          tone={accent}
          actions={
            <>
              <HeaderIconButton
                theme={theme}
                icon={Upload}
                label={isAddingMedia ? 'กำลังเพิ่ม' : kind === 'images' ? 'เพิ่มรูป' : 'เพิ่มวิดีโอ'}
                onPress={() => void pickMediaFiles()}
              />
              {kind === 'videos' ? (
                <HeaderIconButton
                  theme={theme}
                  icon={Download}
                  label={cloudInboxLoading ? 'กำลังโหลด Cloud Transfer' : 'รับ Cloud Transfer'}
                  onPress={() => void openCloudInbox()}
                />
              ) : null}
              <HeaderIconButton
                theme={theme}
                icon={RefreshCw}
                label={isRefreshing ? 'กำลังรีเฟรช' : 'รีเฟรช'}
                onPress={() => void refreshMedia()}
              />
            </>
          }
        />

        <View className="gap-2">
          <View className="flex-row items-center gap-1.5">
            <SearchBox
              theme={theme}
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="ค้นหาชื่อ/รหัสสินค้า..."
            />
            <View className="h-8 shrink-0 flex-row items-center gap-0.5 rounded-kd-md border border-kd-border bg-kd-input px-0.5">
              {modeTabs.map(({ key, icon: TabIcon, label }) => {
                const isActive = mediaMode === key;

                return (
                  <Pressable
                    accessibilityLabel={label}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                    key={key}
                    onPress={() => {
                      setMediaMode(key);
                      setSelectedIds(new Set());
                    }}
                    className={`h-[26px] w-[30px] items-center justify-center rounded-kd-sm ${
                      isActive ? accentClass.soft : ''
                    }`}
                  >
                    <TabIcon size={13} color={isActive ? accentColor : theme.textSubtle} strokeWidth={2} />
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              accessibilityLabel={groupByProduct ? 'ยกเลิกจัดกลุ่ม' : 'จัดกลุ่มตามสินค้า'}
              accessibilityRole="button"
              accessibilityState={{ selected: groupByProduct }}
              onPress={() => setGroupByProduct((current) => !current)}
              className={`h-8 w-8 shrink-0 items-center justify-center rounded-kd-md border ${
                groupByProduct ? `${accentClass.soft} ${accentClass.border}` : 'border-kd-border bg-kd-input'
              }`}
            >
              <Grid2X2 size={13} color={groupByProduct ? accentColor : theme.textSubtle} strokeWidth={2} />
            </Pressable>
          </View>

          {mediaMode === 'product' ? (
            totalMedia === 0 ? (
              <EmptyState theme={theme} icon={HeaderIcon} title={copy.emptyTitle} copy={copy.emptyCopy} />
            ) : (
              <>
                <View className="flex-row items-center justify-between">
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: allSelected }}
                    onPress={toggleAll}
                    className="min-h-6 flex-row items-center gap-1.5"
                  >
                    <SelectCircle theme={theme} selected={allSelected} accent={accentColor} size={15} />
                    <Text className="text-kd-caption text-kd-text-subtle">
                      ทั้งหมด ({productMedia.length})
                    </Text>
                  </Pressable>

                  <View className="flex-row items-center gap-1">
                    <SortPill
                      theme={theme}
                      accent={accentColor}
                      active={sortKey === 'name'}
                      ascending={sortAscending}
                      label="ชื่อ"
                      onPress={() => changeSort('name')}
                    />
                    {groupByProduct ? (
                      <SortPill
                        theme={theme}
                        accent={accentColor}
                        active={sortKey === 'code'}
                        ascending={sortAscending}
                        label="รหัส"
                        onPress={() => changeSort('code')}
                      />
                    ) : (
                      <SortPill
                        theme={theme}
                        accent={accentColor}
                        active={sortKey === 'date'}
                        ascending={sortAscending}
                        label="วันที่"
                        onPress={() => changeSort('date')}
                      />
                    )}
                    {groupByProduct && visibleGroups.length > 1 ? (
                      <>
                        <View className="mx-[3px] h-3 w-px bg-kd-border" />
                        <Pressable
                          accessibilityLabel="ขยายทั้งหมด"
                          accessibilityRole="button"
                          onPress={() => setCollapsedGroups(new Set())}
                          className="h-[22px] w-5 items-center justify-center"
                        >
                          <ChevronsDown size={13} color={theme.textSubtle} strokeWidth={2} />
                        </Pressable>
                        <Pressable
                          accessibilityLabel="ย่อทั้งหมด"
                          accessibilityRole="button"
                          onPress={() => setCollapsedGroups(new Set(visibleGroups.map((group) => group.item.id)))}
                          className="h-[22px] w-5 items-center justify-center"
                        >
                          <ChevronsUp size={13} color={theme.textSubtle} strokeWidth={2} />
                        </Pressable>
                      </>
                    ) : null}
                  </View>
                </View>

                {groupByProduct ? (
                  visibleGroups.map(({ item, media }) => (
                    <MediaGroupCard
                      key={item.id}
                      theme={theme}
                      kind={kind}
                      accentColor={accentColor}
                      item={item}
                      media={media}
                      unit={copy.unit}
                      expanded={!collapsedGroups.has(item.id)}
                      selectedIds={selectedIds}
                      onToggleExpand={() => toggleGroup(item.id)}
                      onToggleSelect={toggleSelect}
                      onDeleteMedia={(media) => confirmDelete([media.id])}
                      onDownloadMedia={(media) => void downloadMedia(media)}
                      onEditMedia={openEdit}
                      onFavoriteMedia={() => toast.info('ฟีเจอร์ถูกใจจะเพิ่มในเวอร์ชันถัดไป')}
                      onViewMedia={(media) => void openMedia(media)}
                    />
                  ))
                ) : kind === 'images' ? (
                  <View className="flex-row flex-wrap gap-2">
                    {productMedia.map((media) => (
                      <ImageTile
                        key={media.id}
                        theme={theme}
                        accentColor={accentColor}
                        media={media}
                        selected={selectedIds.has(media.id)}
                        showProductInfo
                        onDelete={() => confirmDelete([media.id])}
                        onEdit={() => openEdit(media)}
                        onToggleSelect={() => toggleSelect(media.id)}
                        onView={() => void openMedia(media)}
                      />
                    ))}
                  </View>
                ) : (
                  productMedia.map((media) => (
                    <View
                      key={media.id}
                      className="overflow-hidden rounded-[12px] border border-gray-100 bg-kd-panel dark:border-kd-border"
                      style={{
                        elevation: 1,
                        shadowOffset: { height: 1, width: 0 },
                        shadowOpacity: 0.05,
                        shadowRadius: 2,
                      }}
                    >
                      <CardBackdrop theme={theme} id="videos-flat" stops={libraryCardStops.videos} />
                      <View className="px-1.5">
                        <VideoRow
                          theme={theme}
                          accentColor={accentColor}
                          media={media}
                          selected={selectedIds.has(media.id)}
                          showDivider={false}
                          showProductInfo
                          onDelete={() => confirmDelete([media.id])}
                          onDownload={() => void downloadMedia(media)}
                          onEdit={() => openEdit(media)}
                          onFavorite={() => toast.info('ฟีเจอร์ถูกใจจะเพิ่มในเวอร์ชันถัดไป')}
                          onPlay={() => void openMedia(media)}
                          onToggleSelect={() => toggleSelect(media.id)}
                        />
                      </View>
                    </View>
                  ))
                )}
              </>
            )
          ) : (
            <EmptyHint theme={theme} label={copy.emptyGeneral} />
          )}
        </View>
      </ScrollView>

      {selectedIds.size > 0 ? (
        <SelectionBar
          theme={theme}
          accent={accentColor}
          bottomInset={insets.bottom}
          count={selectedIds.size}
          showCloudUpload={kind === 'videos'}
          showShopee={kind === 'videos'}
          onClear={() => setSelectedIds(new Set())}
          onDelete={() => void deleteSelected()}
          onEdit={editSelected}
          onCloudUpload={kind === 'videos' ? uploadSelectedVideosToCloud : undefined}
          onShopee={kind === 'videos' ? sendSelectedVideosToShopee : undefined}
        />
      ) : null}

      <Modal
        animationType="fade"
        transparent
        visible={cloudUploadConfirmAssets.length > 0}
        onRequestClose={() => {
          if (!cloudTransferWorking) setCloudUploadConfirmAssets([]);
        }}
      >
        <View className="flex-1 items-center justify-center bg-black/55 px-4">
          <View className="w-full max-w-[420px] overflow-hidden rounded-[18px] border border-kd-border bg-kd-panel">
            <View className="flex-row items-center gap-3 border-b border-kd-red/15 px-4 py-3 dark:border-kd-red/30">
              <View className="h-10 w-10 items-center justify-center rounded-kd-lg bg-kd-red-soft">
                <Upload size={18} color={accentColor} strokeWidth={2.2} />
              </View>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
                  ส่งขึ้น Cloud Transfer
                </Text>
                <Text className="text-kd-caption text-kd-text-subtle">
                  ตรวจสอบรายการก่อนเริ่มอัปโหลด
                </Text>
              </View>
              <Pressable
                accessibilityLabel="ปิด"
                accessibilityRole="button"
                disabled={cloudTransferWorking}
                onPress={() => setCloudUploadConfirmAssets([])}
                className="h-8 w-8 items-center justify-center rounded-kd-md disabled:opacity-50"
              >
                <X size={16} color={theme.textSubtle} strokeWidth={2.3} />
              </Pressable>
            </View>

            <View className="gap-3 p-4">
              <View className="rounded-kd-lg border border-kd-red/15 bg-kd-red-soft/70 p-3 dark:border-kd-red/35 dark:bg-kd-red-soft">
                <View className="gap-1.5">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-kd-caption text-kd-text-subtle">จำนวนไฟล์:</Text>
                    <Text className="text-kd-caption font-semibold text-kd-text">{cloudUploadConfirmAssets.length} ไฟล์</Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-kd-caption text-kd-text-subtle">ขนาดรวม:</Text>
                    <Text className="text-kd-caption font-semibold text-kd-text">{formatAssetSize(cloudUploadConfirmTotalBytes)}</Text>
                  </View>
                  <View className="flex-row items-center justify-between">
                    <Text className="text-kd-caption text-kd-text-subtle">จำกัดต่อไฟล์:</Text>
                    <Text className="text-kd-caption font-semibold text-kd-text">{formatAssetSize(MAX_CLOUD_TRANSFER_VIDEO_BYTES)}</Text>
                  </View>
                </View>

                {cloudUploadConfirmTooLargeCount > 0 ? (
                  <View className="mt-3 rounded-kd-md border border-kd-amber/35 bg-kd-amber/10 px-2 py-1.5">
                    <Text className="text-kd-caption text-kd-amber">
                      มี {cloudUploadConfirmTooLargeCount} ไฟล์เกินขนาด ระบบจะข้ามไฟล์เหล่านี้
                    </Text>
                  </View>
                ) : null}

                <View className="mt-3 gap-1.5">
                  {cloudUploadConfirmPreview.map((asset) => (
                    <View key={asset.id} className="flex-row items-center justify-between gap-3 rounded-kd-md bg-kd-panel px-2 py-1.5">
                      <View className="min-w-0 flex-1">
                        <Text numberOfLines={1} className="text-kd-caption font-semibold text-kd-text">
                          {asset.productName || asset.title || asset.fileName || 'วิดีโอ'}
                        </Text>
                        <Text numberOfLines={1} className="mt-px text-kd-micro text-kd-text-subtle">
                          {asset.fileName || asset.productCode || 'Cloud Transfer'}
                        </Text>
                      </View>
                      <Text className="shrink-0 text-kd-micro text-kd-text-muted">
                        {formatAssetSize(asset.sizeBytes)}
                      </Text>
                    </View>
                  ))}
                  {cloudUploadConfirmAssets.length > cloudUploadConfirmPreview.length ? (
                    <Text className="text-kd-micro text-kd-text-muted">
                      และอีก {cloudUploadConfirmAssets.length - cloudUploadConfirmPreview.length} รายการ
                    </Text>
                  ) : null}
                </View>
              </View>
            </View>

            <View className="flex-row justify-end gap-2 border-t border-kd-red/15 px-4 py-3 dark:border-kd-red/30">
              <Pressable
                accessibilityRole="button"
                disabled={cloudTransferWorking}
                onPress={() => setCloudUploadConfirmAssets([])}
                className="h-9 items-center justify-center rounded-kd-lg px-3 disabled:opacity-50"
              >
                <Text className="text-kd-caption font-semibold text-kd-text-subtle">ยกเลิก</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={cloudTransferWorking || cloudUploadConfirmAssets.length === 0}
                onPress={() => void confirmCloudUpload()}
                className="h-9 flex-row items-center justify-center gap-1.5 rounded-kd-lg bg-kd-red px-3 disabled:opacity-50"
              >
                {cloudTransferWorking ? <ActivityIndicator color={theme.white} size="small" /> : <Upload size={13} color={theme.white} strokeWidth={2.4} />}
                <Text className="text-kd-caption font-semibold text-white">เริ่มส่งขึ้น</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={!!cloudTransferStatus && cloudTransferWorking}
      >
        <View className="flex-1 items-center justify-center bg-black/45 px-6">
          <View className="w-full max-w-[340px] overflow-hidden rounded-[18px] border border-kd-border bg-kd-panel">
            <View className="flex-row items-center gap-3 border-b border-kd-border px-4 py-3">
              <View className="h-10 w-10 items-center justify-center rounded-kd-lg bg-kd-red-soft">
                {cloudTransferStatus?.mode === 'download' ? (
                  <Download size={18} color={accentColor} strokeWidth={2.2} />
                ) : (
                  <Upload size={18} color={accentColor} strokeWidth={2.2} />
                )}
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-kd-body font-semibold text-kd-text">
                  {cloudTransferStatus?.mode === 'download' ? 'กำลังรับจาก Cloud Transfer' : 'กำลังส่งขึ้น Cloud Transfer'}
                </Text>
                <View className="mt-1 flex-row items-center gap-1.5">
                  <View className="rounded-full bg-kd-red-soft px-2 py-0.5">
                    <Text className="text-kd-micro font-semibold text-kd-red">
                      {cloudTransferStatus ? formatCloudTransferPhase(cloudTransferStatus.phase) : ''}
                    </Text>
                  </View>
                  <Text className="text-kd-caption text-kd-text-subtle">
                    {cloudTransferStatus ? `${cloudTransferStatus.current}/${cloudTransferStatus.total}` : ''}
                  </Text>
                </View>
              </View>
            </View>

            <View className="gap-3 p-4">
              {cloudTransferStatus?.filename ? (
                <View className="rounded-kd-lg border border-kd-border bg-kd-card-muted px-3 py-2">
                  <Text numberOfLines={2} className="text-kd-caption font-medium text-kd-text">
                    {cloudTransferStatus.filename}
                  </Text>
                </View>
              ) : null}
              <View className="h-2 overflow-hidden rounded-full bg-kd-card-muted">
                <View className="h-full rounded-full bg-kd-red" style={{ width: `${Math.round(cloudProgressValue * 100)}%` }} />
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-kd-micro text-kd-text-subtle">
                  {Math.round(cloudProgressValue * 100)}%
                </Text>
                {typeof cloudTransferStatus?.bytesWritten === 'number' && cloudTransferStatus.totalBytes ? (
                  <Text className="text-kd-micro text-kd-text-subtle">
                    {formatAssetSize(cloudTransferStatus.bytesWritten)} / {formatAssetSize(cloudTransferStatus.totalBytes)}
                  </Text>
                ) : (
                  <ActivityIndicator color={accentColor} size="small" />
                )}
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={cloudInboxOpen}
        onRequestClose={() => {
          if (!cloudTransferWorking) setCloudInboxOpen(false);
        }}
      >
        <View className="flex-1 justify-end bg-black/45">
          <View
            className="max-h-[88%] rounded-t-[20px] border border-kd-border bg-kd-panel"
            style={{ paddingBottom: Math.max(insets.bottom + 12, 20) }}
          >
            <View className="flex-row items-center justify-between gap-3 border-b border-kd-border px-4 py-3">
              <View className="min-w-0 flex-1 flex-row items-center gap-2">
                <Download size={16} color={accentColor} strokeWidth={2.2} />
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-kd-title font-semibold text-kd-text">
                    Cloud Transfer
                  </Text>
                  <Text className="text-kd-caption text-kd-text-subtle">
                    รับวิดีโอเข้าคลังตามโปรไฟล์ต้นทาง
                  </Text>
                </View>
              </View>
              <View className="flex-row items-center gap-1">
                <Pressable
                  accessibilityLabel="รีเฟรช Cloud Transfer"
                  accessibilityRole="button"
                  disabled={cloudInboxLoading}
                  onPress={() => void openCloudInbox()}
                  className="h-8 w-8 items-center justify-center rounded-full bg-kd-card-muted disabled:opacity-50"
                >
                  {cloudInboxLoading ? (
                    <ActivityIndicator color={theme.textSubtle} size="small" />
                  ) : (
                    <RefreshCw size={15} color={theme.textSubtle} strokeWidth={2.2} />
                  )}
                </Pressable>
                <Pressable
                  accessibilityLabel="ปิด"
                  accessibilityRole="button"
                  disabled={cloudTransferWorking}
                  onPress={() => setCloudInboxOpen(false)}
                  className="h-8 w-8 items-center justify-center rounded-full bg-kd-card-muted disabled:opacity-50"
                >
                  <X size={16} color={theme.textSubtle} strokeWidth={2.4} />
                </Pressable>
              </View>
            </View>

            {cloudTransfers.length > 0 ? (
              <View className="flex-row items-center justify-between px-4 py-2">
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: allCloudTransfersSelected }}
                  onPress={toggleAllCloudTransfers}
                  className="min-h-7 flex-row items-center gap-2"
                >
                  <SelectCircle theme={theme} selected={allCloudTransfersSelected} accent={accentColor} size={16} />
                  <Text className="text-kd-caption text-kd-text-subtle">
                    เลือกทั้งหมด ({cloudTransfers.length})
                  </Text>
                </Pressable>
                <Text className="text-kd-caption text-kd-text-muted">
                  เลือกแล้ว {selectedCloudTransferIds.size}
                </Text>
              </View>
            ) : null}

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerClassName="gap-2 px-4 py-3"
            >
              {cloudInboxLoading ? (
                <View className="gap-2 py-6">
                  {[0, 1, 2].map((item) => (
                    <View key={item} className="rounded-kd-lg border border-kd-border bg-kd-card p-3">
                      <View className="flex-row items-center gap-3">
                        <View className="h-5 w-5 rounded-full bg-kd-card-muted" />
                        <View className="h-12 w-12 rounded-kd-md bg-kd-card-muted" />
                        <View className="min-w-0 flex-1 gap-2">
                          <View className="h-3 w-2/3 rounded-full bg-kd-card-muted" />
                          <View className="h-2 w-1/2 rounded-full bg-kd-card-muted" />
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ) : cloudTransfers.length > 0 ? (
                cloudTransfers.map((transfer) => {
                  const selected = selectedCloudTransferIds.has(transfer.id);
                  const displayName = getCloudTransferDisplayName(transfer);
                  const rawFilename = stripFileExtension(cleanText(transfer.filename));
                  const showRawFilename = rawFilename && rawFilename !== displayName;
                  const productName = getCloudTransferText(transfer, 'productName');
                  const profileId = getCloudTransferText(transfer, 'profileId');
                  const expiresText = formatCloudExpiry(transfer.expiresAt);

                  return (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      key={transfer.id}
                      onPress={() => toggleCloudTransfer(transfer.id)}
                      className={`rounded-kd-lg border p-3 active:opacity-80 ${
                        selected ? 'border-kd-red bg-kd-red-soft' : 'border-kd-border bg-kd-card'
                      }`}
                    >
                      <View className="flex-row items-start gap-3">
                        <View className="mt-0.5">
                          <SelectCircle theme={theme} selected={selected} accent={accentColor} size={18} />
                        </View>
                        <View className="h-12 w-12 items-center justify-center rounded-kd-md bg-kd-card-muted">
                          <Video size={18} color={selected ? accentColor : theme.textSubtle} strokeWidth={1.7} />
                        </View>
                        <View className="min-w-0 flex-1">
                          <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
                            {displayName}
                          </Text>
                          {showRawFilename ? (
                            <Text numberOfLines={1} className="mt-px text-kd-micro text-kd-text-muted">
                              {rawFilename}
                            </Text>
                          ) : null}
                          <View className="mt-1.5 flex-row flex-wrap gap-1">
                            <View className="rounded-full bg-kd-card-muted px-2 py-0.5">
                              <Text className="text-kd-micro text-kd-text-subtle">
                                {productName || transfer.sourceApp || 'Cloud Transfer'}
                              </Text>
                            </View>
                            <View className="rounded-full bg-kd-card-muted px-2 py-0.5">
                              <Text className="text-kd-micro text-kd-text-subtle">
                                {formatAssetSize(transfer.size)}
                              </Text>
                            </View>
                            <View className="rounded-full bg-kd-card-muted px-2 py-0.5">
                              <Text className="text-kd-micro text-kd-text-subtle">
                                หมดอายุ {expiresText}
                              </Text>
                            </View>
                          </View>
                          {profileId ? (
                            <Text numberOfLines={1} className="mt-1 text-kd-micro text-kd-text-muted">
                              โปรไฟล์ต้นทาง: {profileId}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </Pressable>
                  );
                })
              ) : (
                <View className="items-center justify-center gap-2 py-12">
                  <Download size={28} color={theme.textSubtle} strokeWidth={1.5} />
                  <Text className="text-kd-body font-semibold text-kd-text-muted">ยังไม่มีวิดีโอใน Cloud Transfer</Text>
                  <Text className="max-w-[240px] text-center text-kd-caption text-kd-text-subtle">
                    วิดีโอที่ส่งจาก Desktop หรือ Extension จะมาแสดงที่นี่
                  </Text>
                </View>
              )}
            </ScrollView>

            <View className="flex-row gap-2 border-t border-kd-border px-4 pt-3">
              <Pressable
                accessibilityRole="button"
                disabled={cloudTransferWorking}
                onPress={() => setCloudInboxOpen(false)}
                className="h-11 flex-1 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-card disabled:opacity-50"
              >
                <Text className="text-kd-body font-medium text-kd-text-subtle">ปิด</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={selectedCloudTransferIds.size === 0 || cloudTransferWorking}
                onPress={() => void downloadSelectedCloudTransfers()}
                className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-kd-lg bg-kd-red px-3 disabled:opacity-50"
              >
                <Download size={14} color={theme.white} strokeWidth={2.3} />
                <Text className="text-kd-body font-semibold text-white">
                  รับเข้าคลัง {selectedCloudTransferIds.size || ''}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent
        visible={uploadModalOpen}
        onRequestClose={closeUploadModal}
      >
        <View className="flex-1 justify-end bg-black/45">
          <View
            className="max-h-[94%] rounded-t-[20px] border border-kd-border bg-kd-panel"
            style={{ paddingBottom: Math.max(insets.bottom + 10, 18) }}
          >
            <View className="flex-row items-center justify-between gap-3 border-b border-kd-border px-4 py-3">
              <View className="min-w-0 flex-1 flex-row items-center gap-2">
                <Upload size={16} color={accentColor} strokeWidth={2.2} />
                <Text numberOfLines={1} className="text-kd-title font-semibold text-kd-text">
                  อัพโหลด{kind === 'images' ? 'รูปภาพ' : 'วิดีโอ'} ({uploadDrafts.length} ไฟล์)
                </Text>
              </View>
              <Pressable
                accessibilityLabel="ปิด"
                accessibilityRole="button"
                disabled={isUploadingMedia}
                onPress={closeUploadModal}
                className="h-8 w-8 items-center justify-center rounded-full bg-kd-card-muted disabled:opacity-50"
              >
                <X size={16} color={theme.textSubtle} strokeWidth={2.4} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerClassName="gap-3 p-3"
            >
              {uploadDrafts.map((draft) => (
                <View key={draft.id} className="overflow-hidden rounded-kd-lg border border-kd-border bg-kd-card">
                  <View className="flex-row items-center gap-3 border-b border-kd-border bg-kd-card-muted px-2.5 py-2">
                    <View className="h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-kd-md bg-kd-panel">
                      {draft.thumbnailUri ? (
                        <NativeImage source={{ uri: draft.thumbnailUri }} className="h-full w-full" resizeMode="cover" />
                      ) : kind === 'images' ? (
                        <ImageIcon size={16} color={theme.textMuted} strokeWidth={1.6} />
                      ) : (
                        <Play size={16} color={theme.textMuted} strokeWidth={1.8} />
                      )}
                    </View>

                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} className="text-kd-caption font-semibold text-kd-text">
                        {draft.fileName}
                      </Text>
                      <Text numberOfLines={1} className="mt-0.5 text-[10px] text-kd-text-muted">
                        {formatAssetSize(draft.sizeBytes)}
                      </Text>
                    </View>

                    <Pressable
                      accessibilityLabel="ลบไฟล์"
                      accessibilityRole="button"
                      disabled={isUploadingMedia}
                      onPress={() => removeUploadDraft(draft.id)}
                      className="h-8 w-8 items-center justify-center rounded-full disabled:opacity-50"
                    >
                      <X size={15} color={theme.textMuted} strokeWidth={2.2} />
                    </Pressable>
                  </View>

                  <View>
                    <UploadDraftInput
                      value={draft.productId}
                      onChangeText={(value) => updateUploadDraft(draft.id, 'productId', value)}
                      placeholder="รหัสสินค้า (ID)..."
                      editable={!isUploadingMedia}
                      mono
                      theme={theme}
                    />
                    <UploadDraftInput
                      value={draft.productName}
                      onChangeText={(value) => updateUploadDraft(draft.id, 'productName', value)}
                      placeholder="ชื่อสินค้า..."
                      editable={!isUploadingMedia}
                      multiline
                      theme={theme}
                    />
                    <UploadDraftInput
                      value={draft.productUrl}
                      onChangeText={(value) => updateUploadDraft(draft.id, 'productUrl', value)}
                      placeholder="ลิงก์สินค้า เช่น Shopee link..."
                      editable={!isUploadingMedia}
                      theme={theme}
                    />
                    <UploadDraftInput
                      value={draft.caption}
                      onChangeText={(value) => updateUploadDraft(draft.id, 'caption', value)}
                      placeholder="Caption..."
                      editable={!isUploadingMedia}
                      multiline
                      theme={theme}
                    />
                    <UploadDraftInput
                      value={draft.hashtags}
                      onChangeText={(value) => updateUploadDraft(draft.id, 'hashtags', value)}
                      placeholder="#แฮชแท็ก..."
                      editable={!isUploadingMedia}
                      theme={theme}
                    />
                    <UploadDraftInput
                      value={draft.cta}
                      onChangeText={(value) => updateUploadDraft(draft.id, 'cta', value)}
                      placeholder="Call to Action (CTA)..."
                      editable={!isUploadingMedia}
                      last
                      theme={theme}
                    />
                  </View>
                </View>
              ))}
            </ScrollView>

            <View className="flex-row items-center justify-between gap-3 border-t border-kd-border px-4 pt-3">
              <Pressable
                accessibilityRole="button"
                disabled={isAddingMedia || isUploadingMedia}
                onPress={() => void pickMediaFiles(true)}
                className="min-h-10 flex-row items-center gap-1.5 rounded-kd-lg px-1 disabled:opacity-50"
              >
                <Upload size={13} color={accentColor} strokeWidth={2.2} />
                <Text className="text-kd-caption font-semibold" style={{ color: accentColor }}>
                  เพิ่มไฟล์
                </Text>
              </Pressable>

              <View className="flex-1 flex-row justify-end gap-2">
                <Pressable
                  accessibilityRole="button"
                  disabled={isUploadingMedia}
                  onPress={closeUploadModal}
                  className="h-10 min-w-20 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-card px-3 disabled:opacity-50"
                >
                  <Text className="text-kd-caption font-semibold text-kd-text-subtle">ยกเลิก</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isUploadingMedia || uploadDrafts.length === 0}
                  onPress={() => void confirmUploadDrafts()}
                  className="h-10 min-w-28 flex-row items-center justify-center gap-1.5 rounded-kd-lg px-4 disabled:opacity-50"
                  style={{ backgroundColor: accentColor }}
                >
                  {isUploadingMedia ? <ActivityIndicator color={theme.white} size="small" /> : <Upload size={13} color={theme.white} strokeWidth={2.2} />}
                  <Text className="text-kd-caption font-semibold text-white">
                    {isUploadingMedia ? 'กำลังอัพโหลด...' : `อัพโหลด ${uploadDrafts.length} ไฟล์`}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={!!previewMedia}
        onRequestClose={() => setPreviewMedia(null)}
      >
        <View
          className="flex-1 bg-black/90 px-4"
          style={{
            paddingBottom: Math.max(insets.bottom + 16, 24),
            paddingTop: Math.max(insets.top + 12, 32),
          }}
        >
          <View className="mb-3 flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text numberOfLines={1} className="text-kd-body font-semibold text-white">
                {previewMedia?.title ?? 'รูปภาพ'}
              </Text>
              <Text numberOfLines={1} className="text-kd-caption text-white/60">
                {previewMedia?.productName ?? ''}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="ปิด"
              accessibilityRole="button"
              onPress={() => setPreviewMedia(null)}
              className="h-9 w-9 items-center justify-center rounded-full bg-white/15"
            >
              <X size={18} color={theme.white} strokeWidth={2.4} />
            </Pressable>
          </View>

          <View className="flex-1 items-center justify-center">
            {previewMedia?.uri ? (
              kind === 'images' ? (
                <NativeImage source={{ uri: previewMedia.uri }} className="h-full w-full" resizeMode="contain" />
              ) : (
                <LocalVideoPlayer media={previewMedia} theme={theme} />
              )
            ) : (
              <View className="items-center gap-2">
                {kind === 'images' ? (
                  <ImageIcon size={36} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />
                ) : (
                  <Video size={36} color="rgba(255,255,255,0.5)" strokeWidth={1.5} />
                )}
                <Text className="text-kd-caption text-white/60">
                  ไม่พบไฟล์{kind === 'images' ? 'รูปภาพ' : 'วิดีโอ'}
                </Text>
              </View>
            )}
          </View>

          {previewMedia ? (
            <View className="mt-4 flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                onPress={() => openEdit(previewMedia)}
                className="h-11 flex-1 items-center justify-center rounded-kd-lg bg-white/15"
              >
                <Text className="text-kd-body font-medium text-white">แก้ไข</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => confirmDelete([previewMedia.id])}
                className="h-11 flex-1 items-center justify-center rounded-kd-lg bg-kd-red"
              >
                <Text className="text-kd-body font-semibold text-white">ลบ</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={!!editMedia}
        onRequestClose={() => {
          setEditMedia(null);
          setProductPickerOpen(false);
        }}
      >
        <View className="flex-1 justify-end bg-black/45">
          <View
            className="max-h-[88%] rounded-t-[20px] border border-kd-border bg-kd-panel"
            style={{ paddingBottom: Math.max(insets.bottom + 12, 20) }}
          >
            <View className="flex-row items-center justify-between gap-3 px-4 pt-4">
              <Text className="text-kd-title font-semibold text-kd-text">
                แก้ไข{kind === 'images' ? 'รูปภาพ' : 'วิดีโอ'}
              </Text>
              <Pressable
                accessibilityLabel="ปิด"
                accessibilityRole="button"
                onPress={() => {
                  setEditMedia(null);
                  setProductPickerOpen(false);
                }}
                className="h-8 w-8 items-center justify-center rounded-full bg-kd-card-muted"
              >
                <X size={16} color={theme.textSubtle} strokeWidth={2.4} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerClassName="gap-3 px-4 py-3"
            >
              <LabeledTextInput
                label="ชื่อรายการ"
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="ชื่อรายการ"
                theme={theme}
              />

              {kind === 'videos' ? (
                <View className="gap-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-kd-caption font-semibold text-kd-text-subtle">ผูกกับสินค้า</Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => applyProductToEdit(null)}
                      className="h-7 justify-center"
                    >
                      <Text className="text-kd-caption font-semibold text-kd-text-muted">ล้างสินค้า</Text>
                    </Pressable>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setProductPickerOpen(true)}
                    className="flex-row items-center gap-2 rounded-kd-lg bg-kd-card-muted p-2 active:opacity-75"
                  >
                    <View className="h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-kd-md bg-kd-panel">
                      {editProductImageUri ? (
                        <NativeImage source={{ uri: editProductImageUri }} className="h-full w-full" resizeMode="cover" />
                      ) : (
                        <ShoppingBag size={20} color={theme.textSubtle} strokeWidth={1.7} />
                      )}
                    </View>
                    <View className="min-w-0 flex-1">
                      <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
                        {editProductName || 'เลือกสินค้าจากคลัง'}
                      </Text>
                      <Text numberOfLines={1} className="mt-0.5 text-kd-caption text-kd-text-subtle">
                        {editProductCode ? `#${editProductCode}` : 'แตะเพื่อผูกสินค้า'}
                      </Text>
                    </View>
                    <ChevronRight size={17} color={theme.textMuted} strokeWidth={2} />
                  </Pressable>

                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <LabeledTextInput
                        label="Product ID"
                        value={editProductCode}
                        onChangeText={setEditProductCode}
                        placeholder="รหัสสินค้า"
                        theme={theme}
                      />
                    </View>
                    <View className="flex-1">
                      <LabeledTextInput
                        label="ชื่อสินค้า"
                        value={editProductName}
                        onChangeText={setEditProductName}
                        placeholder="ชื่อสินค้า"
                        theme={theme}
                      />
                    </View>
                  </View>

                  <LabeledTextInput
                    label="ลิงก์สินค้า"
                    value={editProductUrl}
                    onChangeText={setEditProductUrl}
                    placeholder="https://..."
                    theme={theme}
                  />

                  <LabeledTextInput
                    label="Caption"
                    value={editCaption}
                    onChangeText={setEditCaption}
                    placeholder="คำบรรยาย"
                    multiline
                    theme={theme}
                  />

                  <LabeledTextInput
                    label="Hashtag"
                    value={editHashtags}
                    onChangeText={setEditHashtags}
                    placeholder="#แฮชแท็ก"
                    theme={theme}
                  />

                  <LabeledTextInput
                    label="CTA"
                    value={editCta}
                    onChangeText={setEditCta}
                    placeholder="สั่งซื้อเลย"
                    theme={theme}
                  />
                </View>
              ) : null}
            </ScrollView>

            <View className="flex-row gap-2 px-4 pt-1">
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setEditMedia(null);
                  setProductPickerOpen(false);
                }}
                className="h-11 flex-1 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-card"
              >
                <Text className="text-kd-body font-medium text-kd-text-subtle">ยกเลิก</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => void saveEdit()}
                className="h-11 flex-1 items-center justify-center rounded-kd-lg bg-kd-text"
              >
                <Text className="text-kd-body font-semibold text-kd-panel">บันทึก</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={productPickerOpen}
        onRequestClose={() => setProductPickerOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/45">
          <View
            className="max-h-[82%] rounded-t-[20px] border border-kd-border bg-kd-panel"
            style={{ paddingBottom: Math.max(insets.bottom + 12, 20) }}
          >
            <View className="flex-row items-center justify-between px-4 pt-4">
              <View className="flex-row items-center gap-2">
                <ShoppingBag size={16} color={accentColor} strokeWidth={2.2} />
                <Text className="text-kd-title font-semibold text-kd-text">เลือกสินค้า</Text>
              </View>
              <Pressable
                accessibilityLabel="ปิด"
                accessibilityRole="button"
                onPress={() => setProductPickerOpen(false)}
                className="h-8 w-8 items-center justify-center rounded-full bg-kd-card-muted"
              >
                <X size={16} color={theme.textSubtle} strokeWidth={2.4} />
              </Pressable>
            </View>

            <View className="mx-4 mt-3 flex-row items-center gap-2 rounded-kd-lg border border-kd-border bg-kd-input px-3">
              <Search size={13} color={theme.textSubtle} strokeWidth={2} />
              <TextInput
                value={productPickerQuery}
                onChangeText={setProductPickerQuery}
                placeholder="ค้นหาสินค้า..."
                placeholderTextColor={theme.textMuted}
                className="h-10 flex-1 text-kd-body text-kd-text"
              />
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerClassName="gap-2 px-4 py-3"
            >
              <ProductPickerRow
                active={!editProductName && !editProductCode && !editProductUrl}
                imageUri={null}
                meta="ไม่แนบข้อมูลสินค้าไปกับวิดีโอนี้"
                name="ไม่ผูกสินค้า"
                theme={theme}
                onPress={() => applyProductToEdit(null)}
              />

              {isLoadingProducts ? (
                <View className="items-center justify-center gap-2 py-8">
                  <ActivityIndicator color={accentColor} />
                  <Text className="text-kd-caption text-kd-text-subtle">กำลังโหลดสินค้า...</Text>
                </View>
              ) : filteredProductOptions.length > 0 ? (
                filteredProductOptions.map((product) => {
                  const productCode = getProductCode(product);
                  const isActive =
                    (!!editProductCode && productCode === editProductCode) ||
                    (!!editProductUrl && cleanText(product.productUrl) === editProductUrl) ||
                    (!!editProductName && cleanText(product.name) === editProductName);

                  return (
                    <ProductPickerRow
                      active={isActive}
                      imageUri={getProductImageUri(product)}
                      key={getProductKey(product)}
                      meta={`${productCode ? `#${productCode}` : 'ไม่มีรหัส'}${product.productUrl ? ' · มีลิงก์สินค้า' : ''}`}
                      name={product.name}
                      theme={theme}
                      onPress={() => applyProductToEdit(product)}
                    />
                  );
                })
              ) : (
                <View className="items-center justify-center gap-2 py-8">
                  <Package size={24} color={theme.textSubtle} strokeWidth={1.6} />
                  <Text className="text-kd-caption text-kd-text-subtle">
                    {productOptions.length === 0 ? 'ยังไม่มีสินค้าในคลัง' : 'ไม่พบสินค้าที่ค้นหา'}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function LabeledTextInput({
  label,
  value,
  placeholder,
  multiline = false,
  theme,
  onChangeText,
}: {
  label: string;
  value: string;
  placeholder: string;
  multiline?: boolean;
  theme: KubdeeTheme;
  onChangeText: (value: string) => void;
}): React.JSX.Element {
  return (
    <View className="gap-1">
      <Text className="text-kd-caption font-medium text-kd-text-subtle">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        className={`rounded-kd-lg border border-kd-border bg-kd-input px-3 text-kd-body text-kd-text ${
          multiline ? 'min-h-[76px] py-2' : 'h-11'
        }`}
      />
    </View>
  );
}

function UploadDraftInput({
  value,
  placeholder,
  editable,
  last = false,
  mono = false,
  multiline = false,
  theme,
  onChangeText,
}: {
  value: string;
  placeholder: string;
  editable: boolean;
  last?: boolean;
  mono?: boolean;
  multiline?: boolean;
  theme: KubdeeTheme;
  onChangeText: (value: string) => void;
}): React.JSX.Element {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={theme.textMuted}
      editable={editable}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      className={`${multiline ? 'min-h-[58px] py-2' : 'h-10'} w-full bg-transparent px-3 text-kd-body text-kd-text ${mono ? 'font-mono' : ''} ${last ? '' : 'border-b border-kd-border'}`}
    />
  );
}

function ProductPickerRow({
  active,
  imageUri,
  meta,
  name,
  theme,
  onPress,
}: {
  active: boolean;
  imageUri: string | null;
  meta: string;
  name: string;
  theme: KubdeeTheme;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className={`flex-row items-center gap-2 rounded-kd-lg border p-2 active:opacity-75 ${
        active ? 'border-kd-red bg-kd-red-soft' : 'border-kd-border bg-kd-card'
      }`}
    >
      <View className="h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-kd-md bg-kd-panel">
        {imageUri ? (
          <NativeImage source={{ uri: imageUri }} className="h-full w-full" resizeMode="cover" />
        ) : (
          <ShoppingBag size={19} color={theme.textSubtle} strokeWidth={1.7} />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
          {name}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-1">
          {meta.includes('ลิงก์') ? <Link2 size={10} color={theme.orange} strokeWidth={2} /> : null}
          <Text numberOfLines={1} className="min-w-0 flex-1 text-kd-caption text-kd-text-subtle">
            {meta}
          </Text>
        </View>
      </View>
      {active ? (
        <View className="h-5 w-5 items-center justify-center rounded-full bg-kd-red">
          <Check size={12} color={theme.white} strokeWidth={3} />
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Extension grouped view: rounded-xl card, soft tone header row
 * (chevron circle + 36px product thumb + name / #id + count), media inside
 */
function MediaGroupCard({
  theme,
  kind,
  accentColor,
  item,
  media,
  unit,
  expanded,
  selectedIds,
  onToggleExpand,
  onToggleSelect,
  onDeleteMedia,
  onDownloadMedia,
  onEditMedia,
  onFavoriteMedia,
  onViewMedia,
}: {
  theme: KubdeeTheme;
  kind: MediaKind;
  accentColor: string;
  item: MediaGroupRecord;
  media: MediaSubItem[];
  unit: string;
  expanded: boolean;
  selectedIds: Set<string>;
  onToggleExpand: () => void;
  onToggleSelect: (id: string) => void;
  onDeleteMedia: (media: MediaSubItem) => void;
  onDownloadMedia: (media: MediaSubItem) => void;
  onEditMedia: (media: MediaSubItem) => void;
  onFavoriteMedia: (media: MediaSubItem) => void;
  onViewMedia: (media: MediaSubItem) => void;
}): React.JSX.Element {
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;

  return (
    <View
      className="overflow-hidden rounded-[12px] border border-gray-100 bg-kd-panel dark:border-kd-border"
      style={{
        elevation: 1,
        shadowOffset: { height: 1, width: 0 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      }}
    >
      <CardBackdrop theme={theme} id={kind} stops={libraryCardStops[kind]} />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggleExpand}
        className="flex-row items-center gap-2.5 p-2.5"
      >
        <View className="h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/80 dark:bg-kd-card-muted/80">
          <ChevronIcon size={11} color={theme.textSubtle} strokeWidth={2.5} />
        </View>

        <View className="h-9 w-9 shrink-0 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-panel-muted dark:bg-kd-card-muted">
          <ImageIcon size={14} color={theme.textSubtle} strokeWidth={1.5} />
        </View>

        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
            {item.title}
          </Text>
          <View className="mt-[3px] flex-row items-center justify-between gap-2">
            <Text numberOfLines={1} className="shrink text-kd-micro text-kd-text-subtle">
              #{getItemCode(item)}
            </Text>
            <Text className="shrink-0 text-kd-micro font-medium text-kd-text-subtle">
              {media.length} {unit}
            </Text>
          </View>
        </View>
      </Pressable>

      {expanded ? (
        <View className="bg-white/50 p-2 dark:bg-kd-panel-muted/30">
          {kind === 'images' ? (
            <View className="flex-row flex-wrap gap-2">
              {media.map((entry) => (
                <ImageTile
                  key={entry.id}
                  theme={theme}
                  accentColor={accentColor}
                  media={entry}
                  selected={selectedIds.has(entry.id)}
                  onDelete={() => onDeleteMedia(entry)}
                  onEdit={() => onEditMedia(entry)}
                  onToggleSelect={() => onToggleSelect(entry.id)}
                  onView={() => onViewMedia(entry)}
                />
              ))}
            </View>
          ) : (
            media.map((entry, index) => (
              <VideoRow
                key={entry.id}
                theme={theme}
                accentColor={accentColor}
                media={entry}
                selected={selectedIds.has(entry.id)}
                showDivider={index > 0}
                onDelete={() => onDeleteMedia(entry)}
                onDownload={() => onDownloadMedia(entry)}
                onEdit={() => onEditMedia(entry)}
                onFavorite={() => onFavoriteMedia(entry)}
                onPlay={() => onViewMedia(entry)}
                onToggleSelect={() => onToggleSelect(entry.id)}
              />
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Extension ImageGridItem: square tile, circular checkbox top-left,
 * date badge bottom-left or product overlay bottom
 */
function ImageTile({
  theme,
  accentColor,
  media,
  selected,
  showProductInfo = false,
  onDelete,
  onEdit,
  onToggleSelect,
  onView,
}: {
  theme: KubdeeTheme;
  accentColor: string;
  media: MediaSubItem;
  selected: boolean;
  showProductInfo?: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onToggleSelect: () => void;
  onView: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onLongPress={onToggleSelect}
      onPress={onView}
      className="aspect-square w-[31.4%] overflow-hidden rounded-kd-lg border-2 bg-kd-border dark:bg-kd-card-muted"
      style={{ borderColor: selected ? accentColor : 'transparent' }}
    >
      <View className="flex-1 items-center justify-center">
        {media.uri ? (
          <NativeImage source={{ uri: media.uri }} className="h-full w-full" resizeMode="cover" />
        ) : (
          <ImageIcon size={22} color={theme.textSubtle} strokeWidth={1.5} />
        )}
      </View>

      <Pressable
        accessibilityLabel="เลือก"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        onPress={onToggleSelect}
        className="absolute left-1.5 top-1.5"
      >
        <SelectCircle theme={theme} selected={selected} accent={accentColor} size={18} light />
      </Pressable>

      <View className="absolute right-1.5 top-1.5 flex-row gap-1">
        <Pressable
          accessibilityLabel="แก้ไข"
          accessibilityRole="button"
          onPress={onEdit}
          className="h-6 w-6 items-center justify-center rounded-kd-sm bg-black/55"
        >
          <Pencil size={12} color={theme.white} strokeWidth={2.2} />
        </Pressable>
        <Pressable
          accessibilityLabel="ลบ"
          accessibilityRole="button"
          onPress={onDelete}
          className="h-6 w-6 items-center justify-center rounded-kd-sm bg-black/55"
        >
          <Trash2 size={12} color={theme.white} strokeWidth={2.2} />
        </Pressable>
      </View>

      {showProductInfo ? (
        <View className="absolute bottom-0 left-0 right-0 bg-black/55 px-1.5 py-1">
          <Text numberOfLines={1} className="text-kd-tiny font-medium text-white/90">
            {media.productName}
          </Text>
          <Text numberOfLines={1} className="text-[8px] text-white/60">
            #{media.productCode}
          </Text>
        </View>
      ) : (
        <View className="absolute bottom-1 left-1 rounded-kd-sm bg-black/60 px-[5px] py-0.5">
          <Text className="text-[8px] font-medium text-white/90">{media.date}</Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * Extension VideoItem (list variant): checkbox + thumbnail + title/meta + action icons,
 * provider badge top-right
 */
function VideoRow({
  theme,
  accentColor,
  media,
  selected,
  showDivider,
  showProductInfo = false,
  onDelete,
  onDownload,
  onEdit,
  onFavorite,
  onPlay,
  onToggleSelect,
}: {
  theme: KubdeeTheme;
  accentColor: string;
  media: MediaSubItem;
  selected: boolean;
  showDivider: boolean;
  showProductInfo?: boolean;
  onDelete: () => void;
  onDownload: () => void;
  onEdit: () => void;
  onFavorite: () => void;
  onPlay: () => void;
  onToggleSelect: () => void;
}): React.JSX.Element {
  return (
    <View
      className={`flex-row items-center gap-2.5 px-1 py-2 ${
        showDivider ? 'border-t border-kd-border' : ''
      }`}
      style={selected ? { backgroundColor: alpha(accentColor, theme.isDark ? 0.1 : 0.05) } : undefined}
    >
      <View className="absolute right-2 top-2 z-[1] flex-row items-center gap-[3px]">
        <View className="rounded-kd-sm bg-kd-blue/10 px-[5px] py-0.5 dark:bg-kd-blue/25">
          <Text className="text-[8px] font-medium text-kd-blue">ระบบ</Text>
        </View>
        {media.warnings.map((warning) => (
          <View key={warning} className="rounded-kd-sm bg-kd-amber/90 px-1 py-0.5">
            <Text className="text-[8px] font-bold text-white">{warning}</Text>
          </View>
        ))}
      </View>

      <Pressable accessibilityLabel="เลือก" accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onToggleSelect}>
        <SelectCircle theme={theme} selected={selected} accent={accentColor} size={20} />
      </Pressable>

      <Pressable
        accessibilityLabel="เล่นวิดีโอ"
        accessibilityRole="button"
        onPress={onPlay}
        className={`shrink-0 items-center justify-center overflow-hidden rounded-kd-md bg-kd-border dark:bg-kd-card-muted ${
          media.portrait ? 'h-16 w-12' : 'h-12 w-20'
        }`}
      >
        <LocalVideoPlaceholder theme={theme} compact thumbnailUri={media.thumbnailUri} />
      </Pressable>

      <View className="min-w-0 flex-1">
        {showProductInfo ? (
          <>
            <Text numberOfLines={1} className="pr-14 text-kd-body font-medium text-kd-text">
              {media.productName}
            </Text>
            <Text numberOfLines={1} className="mt-px text-kd-tiny text-kd-text-subtle">
              #{media.productCode}
            </Text>
          </>
        ) : (
          <Text numberOfLines={1} className="pr-14 text-kd-body font-medium text-kd-text">
            {media.title}
          </Text>
        )}

        <View className="mt-[3px] flex-row items-center gap-1.5">
          <Text className="text-kd-micro text-kd-text-subtle">{media.date}</Text>
          <View className="h-[3px] w-[3px] rounded-full bg-kd-border-strong" />
          <Text className="text-kd-micro text-kd-text-subtle">{media.size}</Text>
        </View>

        <View className="mt-0.5 flex-row items-center justify-end gap-0.5">
          <RowIconButton theme={theme} icon={Pencil} label="แก้ไข" onPress={onEdit} />
          <RowIconButton theme={theme} icon={Play} label="เล่น" onPress={onPlay} />
          <RowIconButton theme={theme} icon={Download} label="ดาวน์โหลด" onPress={onDownload} />
          <RowIconButton theme={theme} icon={Heart} label="กดถูกใจ" onPress={onFavorite} />
          <RowIconButton theme={theme} icon={Trash2} label="ลบ" onPress={onDelete} />
        </View>
      </View>
    </View>
  );
}

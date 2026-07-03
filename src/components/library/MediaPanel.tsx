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
import {
  ImageTile,
  LabeledTextInput,
  LocalVideoPlayer,
  MediaGroupCard,
  ProductPickerRow,
  UploadDraftInput,
  VideoRow,
  MediaPanelModals,
  accentClasses,
  buildCloudUploadItem,
  cleanText,
  copyPickedMediaToLibrary,
  createUploadDraft,
  deleteLocalFiles,
  findProductForAsset,
  formatAssetSize,
  formatCloudExpiry,
  formatCloudTransferPhase,
  getCloudTransferDisplayName,
  getCloudTransferProgress,
  getItemCode,
  getPickedAssetMatchesKind,
  getProductCode,
  getProductImageUri,
  getProductKey,
  getCloudTransferTitle,
  isGenericProductLabel,
  isPlaceholderProductCode,
  openGeneratedFile,
  panelCopy,
  resolveCloudTransferProductFields,
  stripFileExtension,
  toGeneratedGroups,
} from './media-panel';
import type { MediaGroupRecord, MediaKind, MediaMode, MediaSubItem, UploadDraft } from './media-panel';

export type { MediaKind } from './media-panel';

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
  const [isReplacingEditVideo, setIsReplacingEditVideo] = useState(false);
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

  const replaceEditVideoFile = async (): Promise<void> => {
    if (kind !== 'videos' || !editMedia || isReplacingEditVideo) {
      return;
    }

    setIsReplacingEditVideo(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast.warning('กรุณาอนุญาตให้เข้าถึงคลังวิดีโอก่อน');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: false,
        mediaTypes: ['videos'],
        quality: 1,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      if (!asset || !getPickedAssetMatchesKind('videos', asset)) {
        toast.warning('กรุณาเลือกวิดีโอเท่านั้น');
        return;
      }

      const copiedAsset = await copyPickedMediaToLibrary('videos', asset, 0);
      const updated = await updateGeneratedMediaAsset(editMedia.id, {
        fileUri: copiedAsset.fileUri,
        fileName: copiedAsset.fileName,
        mimeType: copiedAsset.mimeType,
        thumbnailUri: copiedAsset.thumbnailUri,
        sizeBytes: copiedAsset.sizeBytes,
        width: copiedAsset.width,
        height: copiedAsset.height,
        durationMs: copiedAsset.durationMs,
        source: 'mobile-local-upload',
      });

      if (!updated) {
        toast.error('ไม่พบรายการที่จะแทนที่วิดีโอ');
        return;
      }

      const nextMedia: MediaSubItem = {
        ...editMedia,
        uri: updated.fileUri,
        mimeType: updated.mimeType,
        thumbnailUri: updated.thumbnailUri,
        size: formatAssetSize(updated.sizeBytes),
        portrait:
          typeof updated.width === 'number' && typeof updated.height === 'number'
            ? updated.height >= updated.width
            : editMedia.portrait,
      };

      setEditMedia(nextMedia);
      setPreviewMedia((current) => (current?.id === editMedia.id ? nextMedia : current));
      toast.success('แทนที่วิดีโอแล้ว');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'แทนที่วิดีโอไม่สำเร็จ');
    } finally {
      setIsReplacingEditVideo(false);
    }
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

      <MediaPanelModals
        accentColor={accentColor}
        allCloudTransfersSelected={allCloudTransfersSelected}
        applyProductToEdit={applyProductToEdit}
        cleanText={cleanText}
        closeUploadModal={closeUploadModal}
        cloudInboxLoading={cloudInboxLoading}
        cloudInboxOpen={cloudInboxOpen}
        cloudProgressValue={cloudProgressValue}
        cloudTransferStatus={cloudTransferStatus}
        cloudTransferWorking={cloudTransferWorking}
        cloudTransfers={cloudTransfers}
        cloudUploadConfirmAssets={cloudUploadConfirmAssets}
        cloudUploadConfirmPreview={cloudUploadConfirmPreview}
        cloudUploadConfirmTooLargeCount={cloudUploadConfirmTooLargeCount}
        cloudUploadConfirmTotalBytes={cloudUploadConfirmTotalBytes}
        confirmCloudUpload={confirmCloudUpload}
        confirmDelete={confirmDelete}
        confirmUploadDrafts={confirmUploadDrafts}
        downloadSelectedCloudTransfers={downloadSelectedCloudTransfers}
        editCaption={editCaption}
        editCta={editCta}
        editHashtags={editHashtags}
        editMedia={editMedia}
        editProductCode={editProductCode}
        editProductImageUri={editProductImageUri}
        editProductName={editProductName}
        editProductUrl={editProductUrl}
        editTitle={editTitle}
        filteredProductOptions={filteredProductOptions}
        getProductCode={getProductCode}
        getProductImageUri={getProductImageUri}
        getProductKey={getProductKey}
        insets={insets}
        isAddingMedia={isAddingMedia}
        isLoadingProducts={isLoadingProducts}
        isReplacingEditVideo={isReplacingEditVideo}
        isUploadingMedia={isUploadingMedia}
        kind={kind}
        openCloudInbox={openCloudInbox}
        openEdit={openEdit}
        pickMediaFiles={pickMediaFiles}
        previewMedia={previewMedia}
        productOptions={productOptions}
        productPickerOpen={productPickerOpen}
        productPickerQuery={productPickerQuery}
        removeUploadDraft={removeUploadDraft}
        replaceEditVideoFile={replaceEditVideoFile}
        saveEdit={saveEdit}
        selectedCloudTransferIds={selectedCloudTransferIds}
        setCloudInboxOpen={setCloudInboxOpen}
        setCloudUploadConfirmAssets={setCloudUploadConfirmAssets}
        setEditCaption={setEditCaption}
        setEditCta={setEditCta}
        setEditHashtags={setEditHashtags}
        setEditMedia={setEditMedia}
        setEditProductCode={setEditProductCode}
        setEditProductName={setEditProductName}
        setEditProductUrl={setEditProductUrl}
        setEditTitle={setEditTitle}
        setPreviewMedia={setPreviewMedia}
        setProductPickerOpen={setProductPickerOpen}
        setProductPickerQuery={setProductPickerQuery}
        theme={theme}
        toggleAllCloudTransfers={toggleAllCloudTransfers}
        toggleCloudTransfer={toggleCloudTransfer}
        updateUploadDraft={updateUploadDraft}
        uploadModalOpen={uploadModalOpen}
        uploadDrafts={uploadDrafts}
      />
    </View>
  );
}

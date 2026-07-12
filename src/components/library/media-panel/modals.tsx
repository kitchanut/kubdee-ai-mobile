import { ActivityIndicator, Image as NativeImage, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { ChevronRight, CloudDownload, CloudUpload, Image as ImageIcon, Package, Play, RefreshCw, Search, ShoppingBag, Upload, Video, X } from 'lucide-react-native';

import type { GeneratedMediaAsset } from '@/autopilot/generatedMediaStore';
import Text from '@/components/ui/KubdeeText';
import type { AffiliateProduct } from '@/library/types';
import { getCloudTransferText, MAX_CLOUD_TRANSFER_VIDEO_BYTES, type CloudTransferItem, type CloudTransferProgress } from '@/services/cloudTransferService';
import type { KubdeeTheme } from '@/theme/tokens';
import {
  LabeledTextInput,
  LocalVideoPlayer,
  ProductPickerRow,
  UploadDraftInput,
  formatAssetSize,
  formatCloudExpiry,
  formatCloudTransferPhase,
  getCloudTransferDisplayName,
  stripFileExtension,
} from './index';
import { SelectCircle } from '../shared';
import type { MediaKind, MediaSubItem, UploadDraft } from './types';

type MediaPanelModalsProps = {
  accentColor: string;
  allCloudTransfersSelected: boolean;
  applyProductToEdit: (product: AffiliateProduct | null) => void;
  cleanText: (value: string | null | undefined) => string;
  closeUploadModal: () => void;
  cloudInboxLoading: boolean;
  cloudInboxOpen: boolean;
  cloudProgressValue: number;
  cloudTransferStatus: CloudTransferProgress | null;
  cloudTransferWorking: boolean;
  cloudTransfers: CloudTransferItem[];
  cloudUploadConfirmAssets: GeneratedMediaAsset[];
  cloudUploadConfirmPreview: GeneratedMediaAsset[];
  cloudUploadConfirmTooLargeCount: number;
  cloudUploadConfirmTotalBytes: number;
  confirmCloudUpload: () => void | Promise<void>;
  confirmDelete: (ids: string[]) => void;
  confirmUploadDrafts: () => void | Promise<void>;
  downloadSelectedCloudTransfers: () => void | Promise<void>;
  editCaption: string; editCta: string; editHashtags: string;
  editMedia: MediaSubItem | null;
  editProductCode: string; editProductImageUri: string | null; editProductName: string; editProductUrl: string; editTitle: string;
  filteredProductOptions: AffiliateProduct[];
  getProductCode: (product: AffiliateProduct) => string;
  getProductImageUri: (product: AffiliateProduct | null | undefined) => string | null;
  getProductKey: (product: AffiliateProduct) => string;
  insets: { bottom: number; top: number };
  isAddingMedia: boolean;
  isLoadingProducts: boolean;
  isReplacingEditVideo: boolean;
  isUploadingMedia: boolean;
  kind: MediaKind;
  openCloudInbox: () => void | Promise<void>;
  openEdit: (media: MediaSubItem) => void;
  pickMediaFiles: (append?: boolean) => void | Promise<void>;
  previewMedia: MediaSubItem | null;
  productOptions: AffiliateProduct[];
  productPickerOpen: boolean;
  productPickerQuery: string;
  removeUploadDraft: (id: string) => void;
  replaceEditVideoFile: () => void | Promise<void>;
  saveEdit: () => void | Promise<void>;
  selectedCloudTransferIds: Set<string>;
  setCloudInboxOpen: (value: boolean) => void;
  setCloudUploadConfirmAssets: (value: GeneratedMediaAsset[]) => void;
  setEditCaption: (value: string) => void;
  setEditCta: (value: string) => void;
  setEditHashtags: (value: string) => void;
  setEditMedia: (value: MediaSubItem | null) => void;
  setEditProductCode: (value: string) => void;
  setEditProductName: (value: string) => void;
  setEditProductUrl: (value: string) => void;
  setEditTitle: (value: string) => void;
  setPreviewMedia: (value: MediaSubItem | null) => void;
  setProductPickerOpen: (value: boolean) => void;
  setProductPickerQuery: (value: string) => void;
  theme: KubdeeTheme;
  toggleAllCloudTransfers: () => void;
  toggleCloudTransfer: (id: string) => void;
  updateUploadDraft: (
    id: string,
    field: keyof Pick<UploadDraft, 'caption' | 'cta' | 'hashtags' | 'productId' | 'productName' | 'productUrl' | 'title'>,
    value: string
  ) => void;
  uploadModalOpen: boolean; uploadDrafts: UploadDraft[];
};

export function MediaPanelModals({
  accentColor,
  allCloudTransfersSelected,
  applyProductToEdit,
  cleanText,
  closeUploadModal,
  cloudInboxLoading,
  cloudInboxOpen,
  cloudProgressValue,
  cloudTransferStatus,
  cloudTransferWorking,
  cloudTransfers,
  cloudUploadConfirmAssets,
  cloudUploadConfirmPreview,
  cloudUploadConfirmTooLargeCount,
  cloudUploadConfirmTotalBytes,
  confirmCloudUpload,
  confirmDelete,
  confirmUploadDrafts,
  downloadSelectedCloudTransfers,
  editCaption,
  editCta,
  editHashtags,
  editMedia,
  editProductCode,
  editProductImageUri,
  editProductName,
  editProductUrl,
  editTitle,
  filteredProductOptions,
  getProductCode,
  getProductImageUri,
  getProductKey,
  insets,
  isAddingMedia,
  isLoadingProducts,
  isReplacingEditVideo,
  isUploadingMedia,
  kind,
  openCloudInbox,
  openEdit,
  pickMediaFiles,
  previewMedia,
  productOptions,
  productPickerOpen,
  productPickerQuery,
  removeUploadDraft,
  replaceEditVideoFile,
  saveEdit,
  selectedCloudTransferIds,
  setCloudInboxOpen,
  setCloudUploadConfirmAssets,
  setEditCaption,
  setEditCta,
  setEditHashtags,
  setEditMedia,
  setEditProductCode,
  setEditProductName,
  setEditProductUrl,
  setEditTitle,
  setPreviewMedia,
  setProductPickerOpen,
  setProductPickerQuery,
  theme,
  toggleAllCloudTransfers,
  toggleCloudTransfer,
  updateUploadDraft,
  uploadModalOpen,
  uploadDrafts,
}: MediaPanelModalsProps): React.JSX.Element {
  return (
    <>
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
                <CloudUpload size={18} color={accentColor} strokeWidth={2.2} />
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
                {cloudTransferWorking ? <ActivityIndicator color={theme.white} size="small" /> : <CloudUpload size={13} color={theme.white} strokeWidth={2.4} />}
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
                  <CloudDownload size={18} color={accentColor} strokeWidth={2.2} />
                ) : (
                  <CloudUpload size={18} color={accentColor} strokeWidth={2.2} />
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
                <CloudDownload size={16} color={accentColor} strokeWidth={2.2} />
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
                  <CloudDownload size={28} color={theme.textSubtle} strokeWidth={1.5} />
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
                <CloudDownload size={14} color={theme.white} strokeWidth={2.3} />
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
                <CloudUpload size={13} color={accentColor} strokeWidth={2.2} />
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
                  {isUploadingMedia ? <ActivityIndicator color={theme.white} size="small" /> : <CloudUpload size={13} color={theme.white} strokeWidth={2.2} />}
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
                  <View className="rounded-kd-lg border border-kd-border bg-kd-card-muted p-3">
                    <View className="flex-row items-center gap-3">
                      <View className="h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-kd-md bg-kd-panel">
                        {editMedia?.thumbnailUri ? (
                          <NativeImage source={{ uri: editMedia.thumbnailUri }} className="h-full w-full" resizeMode="cover" />
                        ) : (
                          <Video size={19} color={theme.textSubtle} strokeWidth={1.7} />
                        )}
                      </View>
                      <View className="min-w-0 flex-1">
                        <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">
                          {editMedia?.title || 'วิดีโอ'}
                        </Text>
                        <Text numberOfLines={1} className="mt-0.5 text-kd-caption text-kd-text-subtle">
                          {editMedia?.size || '-'}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        disabled={isReplacingEditVideo}
                        onPress={() => void replaceEditVideoFile()}
                        className="h-9 flex-row items-center justify-center gap-1.5 rounded-kd-lg bg-kd-red px-3 disabled:opacity-50"
                      >
                        {isReplacingEditVideo ? (
                          <ActivityIndicator color={theme.white} size="small" />
                        ) : (
                          <CloudUpload size={13} color={theme.white} strokeWidth={2.3} />
                        )}
                        <Text className="text-kd-caption font-semibold text-white">
                          {isReplacingEditVideo ? 'กำลังแทนที่' : 'แทนที่'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

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
    </>
  );
}

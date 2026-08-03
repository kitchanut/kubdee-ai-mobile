import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { CloudDownload, Download, Globe, LogIn, Play, RefreshCw, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import { useAuth } from '@/auth/AuthContext';
import { ShopeeLogo, TikTokLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import { useGeneratedMedia } from '@/autopilot/generatedMediaStore';
import type { GeneratedMediaAsset } from '@/autopilot/generatedMediaStore';
import { createGoogleFlowVideoThumbnail } from '@/native/AccessibilityBridge';
import {
  WEB_AUTO_RUN_ID_PREFIX,
  downloadWebAutoClip,
  isWebClipLinkStale,
  listWebAutoClips,
  type WebAutoClip,
} from '@/services/autoJobsService';
import { SHOPEE_ORANGE } from '@/theme/brandColors';
import type { KubdeeTheme } from '@/theme/tokens';

import {
  EmptyState,
  HeaderIconButton,
  LibraryPanelHeader,
  RowIconButton,
  SearchBox,
  SelectCircle,
  getAccentTone,
} from './shared';
import {
  LocalVideoPlaceholder,
  LocalVideoPlayer,
  cleanText,
  formatAssetDate,
  resolveMediaPlatform,
} from './media-panel';
import type { MediaSubItem } from './media-panel';

/**
 * แท็บ "จากเว็บ" — ดึงรายการคลิปที่ผู้ใช้สร้างจากหน้า /auto บน kubdee.ai มาแสดงสดๆ
 * เล่นสตรีมจากลิงก์ได้ทันที เก็บเข้าคลังในเครื่อง หรือส่งต่อไปคิวโพสต์ Shopee/TikTok
 * (ส่งโพสต์จะดาวน์โหลดเข้าคลังให้ก่อนอัตโนมัติ ถ้ายังไม่มี)
 */

type WebDownloadStatus = {
  phase: 'downloading' | 'saving' | 'completed' | 'failed';
  current: number;
  total: number;
  filename: string;
  bytesWritten?: number;
  totalBytes?: number;
};

type EnsureOutcome = {
  assetIds: string[];
  downloaded: number;
  reused: number;
  failed: number;
};

function formatWebDownloadPhase(phase: WebDownloadStatus['phase']): string {
  if (phase === 'downloading') return 'กำลังดาวน์โหลด';
  if (phase === 'saving') return 'บันทึกเข้าคลัง';
  if (phase === 'completed') return 'สำเร็จ';
  return 'ไม่สำเร็จ';
}

/** สัดส่วนความคืบหน้าแบบเดียวกับ Cloud Transfer (utils.getCloudTransferProgress) */
function getWebDownloadProgress(status: WebDownloadStatus | null): number {
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

function getClipDisplayName(clip: WebAutoClip): string {
  return cleanText(clip.title) || cleanText(clip.productName) || clip.jobId;
}

function getClipRunId(clip: WebAutoClip): string {
  return `${WEB_AUTO_RUN_ID_PREFIX}${clip.jobId}`;
}

export default function WebJobsPanel({
  theme,
  selectedProfileId,
  onSendVideosToShopee,
  onSendVideosToTikTok,
}: {
  theme: KubdeeTheme;
  selectedProfileId: string;
  onSendVideosToShopee?: (videoIds: string[]) => void;
  onSendVideosToTikTok?: (videoIds: string[]) => void;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { addGeneratedMediaAsset, assets, refreshGeneratedMediaAssets } = useGeneratedMedia();
  const accentColor = theme.blue;
  const accent = getAccentTone(theme, accentColor);

  const [clips, setClips] = useState<WebAutoClip[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewClip, setPreviewClip] = useState<WebAutoClip | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<WebDownloadStatus | null>(null);
  const [downloadWorking, setDownloadWorking] = useState(false);
  const hasLoadedRef = useRef(false);

  // ดัชนีคลิปเว็บที่ถูกเก็บเข้าคลังแล้ว (dedup ด้วย runId = web-auto-<jobId> ของวิดีโอในคลัง)
  const assetByRunId = useMemo(() => {
    const map = new Map<string, GeneratedMediaAsset>();
    for (const asset of assets) {
      if (asset.kind === 'videos' && asset.runId.startsWith(WEB_AUTO_RUN_ID_PREFIX) && !map.has(asset.runId)) {
        map.set(asset.runId, asset);
      }
    }
    return map;
  }, [assets]);

  const getLibraryAsset = useCallback(
    (clip: WebAutoClip): GeneratedMediaAsset | null => assetByRunId.get(getClipRunId(clip)) ?? null,
    [assetByRunId]
  );

  const loadClips = useCallback(async (mode: 'initial' | 'refresh' = 'initial'): Promise<void> => {
    if (mode === 'refresh') {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setLoadError(null);
    try {
      const nextClips = await listWebAutoClips({ limit: 100 });
      setClips(nextClips);
      setSelectedIds(new Set());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'โหลดคลิปจากเว็บไม่สำเร็จ');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!token || hasLoadedRef.current) {
      return;
    }
    hasLoadedRef.current = true;
    void loadClips();
  }, [loadClips, token]);

  const visibleClips = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return clips;
    }
    return clips.filter((clip) =>
      [clip.title, clip.productName, clip.productId, clip.jobId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [clips, searchQuery]);

  const selectedClips = useMemo(
    () => clips.filter((clip) => selectedIds.has(clip.id)),
    [clips, selectedIds]
  );
  const allSelected = visibleClips.length > 0 && visibleClips.every((clip) => selectedIds.has(clip.id));

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
      return new Set(visibleClips.map((clip) => clip.id));
    });
  };

  const guardDownloadReady = (): boolean => {
    if (downloadWorking) {
      return false;
    }
    if (!token) {
      toast.warning('กรุณาเข้าสู่ระบบก่อนใช้งานคลิปจากเว็บ');
      return false;
    }
    if (!selectedProfileId) {
      toast.warning('เลือกโปรไฟล์ก่อนเก็บคลิปเข้าคลัง');
      return false;
    }
    return true;
  };

  /**
   * ดาวน์โหลดคลิปที่ยังไม่อยู่ในคลังทีละไฟล์ (ข้ามตัวที่มีอยู่แล้ว — ใช้ asset id เดิม)
   * พลาดตัวไหนข้ามตัวนั้นแล้วไปต่อ แบบเดียวกับลูป Cloud Transfer ใน MediaPanel
   */
  const ensureClipsInLibrary = async (targets: WebAutoClip[]): Promise<EnsureOutcome> => {
    const outcome: EnsureOutcome = { assetIds: [], downloaded: 0, reused: 0, failed: 0 };
    const pendingCount = targets.filter((clip) => !getLibraryAsset(clip)).length;
    let downloadIndex = 0;

    setDownloadWorking(true);
    try {
      for (const clip of targets) {
        const existing = getLibraryAsset(clip);
        if (existing) {
          outcome.assetIds.push(existing.id);
          outcome.reused += 1;
          continue;
        }

        downloadIndex += 1;
        const current = downloadIndex;
        const filename = getClipDisplayName(clip);

        try {
          setDownloadStatus({ phase: 'downloading', current, total: pendingCount, filename });
          const downloaded = await downloadWebAutoClip(clip, (progress) => {
            setDownloadStatus({
              phase: 'downloading',
              current,
              total: pendingCount,
              filename,
              bytesWritten: progress.totalBytesWritten,
              totalBytes: progress.totalBytesExpectedToWrite,
            });
          });

          setDownloadStatus({ phase: 'saving', current, total: pendingCount, filename });
          const localThumbnail = await createGoogleFlowVideoThumbnail(downloaded.fileUri).catch(() => null);
          const productCode = cleanText(clip.productId) || 'web-auto';
          const asset = await addGeneratedMediaAsset({
            kind: 'videos',
            runId: getClipRunId(clip),
            // profileLocalId ฝั่งเว็บเป็นคนละชุดกับเครื่องนี้ — ต้องเกาะโปรไฟล์ที่เลือกอยู่เสมอ
            // ไม่งั้นคลิปจะไม่โผล่ในคิวโพสต์ (บทเรียนเดียวกับ Cloud Transfer)
            profileLocalId: selectedProfileId,
            productId: cleanText(clip.productId) || clip.jobId,
            productName: cleanText(clip.productName) || cleanText(clip.title) || 'สินค้า',
            productCode,
            productUrl: cleanText(clip.productUrl) || null,
            caption: cleanText(clip.caption) || null,
            hashtags: cleanText(clip.hashtags) || null,
            cta: cleanText(clip.cta) || null,
            platform: cleanText(clip.platform) || 'shopee',
            title: cleanText(clip.title) || cleanText(clip.productName) || filename,
            fileUri: downloaded.fileUri,
            fileName: downloaded.fileName,
            mimeType: downloaded.mimeType,
            thumbnailUri: localThumbnail ?? (cleanText(clip.thumbnailUrl) || null),
            sizeBytes: downloaded.sizeBytes,
            source: 'web-auto',
            createdAt: clip.createdAtMs ?? Date.now(),
          });

          outcome.assetIds.push(asset.id);
          outcome.downloaded += 1;
        } catch (error) {
          outcome.failed += 1;
          toast.error(error instanceof Error ? error.message : `ดาวน์โหลด ${filename} ไม่สำเร็จ`);
        }
      }

      if (outcome.downloaded > 0) {
        await refreshGeneratedMediaAssets().catch(() => undefined);
      }
      if (pendingCount > 0) {
        setDownloadStatus({
          phase: outcome.failed > 0 ? 'failed' : 'completed',
          current: pendingCount,
          total: pendingCount,
          filename: '',
        });
      }
    } finally {
      setTimeout(() => {
        setDownloadWorking(false);
        setDownloadStatus(null);
      }, 500);
    }

    return outcome;
  };

  const saveSelectedToLibrary = async (): Promise<void> => {
    if (!guardDownloadReady()) {
      return;
    }
    const targets = selectedClips;
    if (targets.length === 0) {
      toast.warning('เลือกคลิปก่อนเก็บเข้าคลัง');
      return;
    }

    const outcome = await ensureClipsInLibrary(targets);
    if (outcome.downloaded > 0 && outcome.failed === 0) {
      setSelectedIds(new Set());
      toast.success(
        `เก็บเข้าคลังแล้ว ${outcome.downloaded} คลิป${outcome.reused ? ` · ข้ามที่มีอยู่แล้ว ${outcome.reused}` : ''}`
      );
    } else if (outcome.downloaded > 0) {
      toast.warning(`เก็บเข้าคลังสำเร็จ ${outcome.downloaded}/${outcome.downloaded + outcome.failed} คลิป`);
    } else if (outcome.failed > 0) {
      toast.error('เก็บเข้าคลังไม่สำเร็จ');
    } else {
      setSelectedIds(new Set());
      toast.info('คลิปที่เลือกอยู่ในคลังแล้วทั้งหมด');
    }
  };

  const saveClipToLibrary = async (clip: WebAutoClip): Promise<void> => {
    if (!guardDownloadReady()) {
      return;
    }
    if (getLibraryAsset(clip)) {
      toast.info('คลิปนี้อยู่ในคลังแล้ว');
      return;
    }
    const outcome = await ensureClipsInLibrary([clip]);
    if (outcome.downloaded > 0) {
      toast.success('เก็บเข้าคลังแล้ว 1 คลิป');
    }
  };

  // ส่งไปคิวโพสต์: ดาวน์โหลดเข้าคลังก่อนถ้ายังไม่มี แล้วส่ง asset id ให้คิวของแพลตฟอร์มนั้น
  const sendSelectedToPost = async (destination: 'shopee' | 'tiktok'): Promise<void> => {
    const callback = destination === 'shopee' ? onSendVideosToShopee : onSendVideosToTikTok;
    if (!callback || !guardDownloadReady()) {
      return;
    }
    const targets = selectedClips;
    if (targets.length === 0) {
      toast.warning('เลือกคลิปก่อนส่งไปโพสต์');
      return;
    }

    const outcome = await ensureClipsInLibrary(targets);
    if (outcome.assetIds.length === 0) {
      toast.error('ส่งไปโพสต์ไม่สำเร็จ เพราะดาวน์โหลดคลิปไม่ได้');
      return;
    }

    callback(outcome.assetIds);
    setSelectedIds(new Set());
    const label = destination === 'shopee' ? 'Shopee' : 'TikTok';
    if (outcome.failed > 0) {
      toast.warning(`ส่งไป ${label} ${outcome.assetIds.length} วิดีโอ · ข้ามที่โหลดไม่สำเร็จ ${outcome.failed}`);
    } else {
      toast.success(`ส่งไป ${label} ${outcome.assetIds.length} วิดีโอ`);
    }
  };

  const previewMedia: MediaSubItem | null = useMemo(() => {
    if (!previewClip) {
      return null;
    }
    return {
      id: previewClip.id,
      parentId: previewClip.jobId,
      title: getClipDisplayName(previewClip),
      productName: cleanText(previewClip.productName),
      productCode: cleanText(previewClip.productId),
      date: previewClip.createdAtMs ? formatAssetDate(previewClip.createdAtMs) : '-',
      size: '-',
      portrait: true,
      warnings: [],
      uri: previewClip.videoUrl,
      thumbnailUri: previewClip.thumbnailUrl,
    };
  }, [previewClip]);

  const progressValue = getWebDownloadProgress(downloadStatus);
  const floatingBottom = Platform.OS === 'android' ? 12 : Math.max(insets.bottom + 12, 12);
  const inverseText = theme.isDark ? '#000000' : theme.white;

  if (!token) {
    return (
      <View className="flex-1">
        <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-3 px-3 pb-20 pt-3">
          <LibraryPanelHeader
            theme={theme}
            title="คลิปจากเว็บ"
            count={0}
            total={0}
            icon={Globe}
            tone={accent}
          />
          <EmptyState
            theme={theme}
            icon={LogIn}
            title="เข้าสู่ระบบก่อนใช้งาน"
            copy="ล็อกอินบัญชี kubdee.ai เพื่อดูคลิปที่สร้างจากหน้าเว็บ /auto"
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-3 px-3 pb-20 pt-3"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadClips('refresh')}
            colors={[accentColor]}
            tintColor={accentColor}
          />
        }
      >
        <LibraryPanelHeader
          theme={theme}
          title="คลิปจากเว็บ"
          count={visibleClips.length}
          total={clips.length}
          icon={Globe}
          tone={accent}
          actions={
            <HeaderIconButton
              theme={theme}
              icon={RefreshCw}
              label={isLoading || isRefreshing ? 'กำลังโหลดคลิปจากเว็บ' : 'รีเฟรชคลิปจากเว็บ'}
              onPress={() => void loadClips('refresh')}
            />
          }
        />

        <SearchBox
          theme={theme}
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="ค้นหาชื่อ/สินค้า/รหัสงาน..."
        />

        {isLoading ? (
          <View className="gap-2 py-2">
            {[0, 1, 2].map((item) => (
              <View key={item} className="rounded-kd-lg border border-kd-border bg-kd-card p-3">
                <View className="flex-row items-center gap-3">
                  <View className="h-5 w-5 rounded-full bg-kd-card-muted" />
                  <View className="h-16 w-12 rounded-kd-md bg-kd-card-muted" />
                  <View className="min-w-0 flex-1 gap-2">
                    <View className="h-3 w-2/3 rounded-full bg-kd-card-muted" />
                    <View className="h-2 w-1/2 rounded-full bg-kd-card-muted" />
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : loadError ? (
          <View className="items-center gap-3 py-10">
            <Globe size={28} color={theme.textSubtle} strokeWidth={1.5} />
            <Text className="max-w-[260px] text-center text-kd-caption text-kd-text-subtle">{loadError}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadClips()}
              className="h-9 flex-row items-center justify-center gap-1.5 rounded-kd-lg border border-kd-border bg-kd-card px-4"
            >
              <RefreshCw size={13} color={theme.textSubtle} strokeWidth={2.2} />
              <Text className="text-kd-caption font-semibold text-kd-text-muted">ลองใหม่</Text>
            </Pressable>
          </View>
        ) : clips.length === 0 ? (
          <EmptyState
            theme={theme}
            icon={Globe}
            title="ยังไม่มีคลิปจากเว็บ"
            copy="คลิปที่สร้างจากหน้า /auto บน kubdee.ai จะแสดงที่นี่"
          />
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
                  ทั้งหมด ({visibleClips.length})
                </Text>
              </Pressable>
              {selectedIds.size > 0 ? (
                <Text className="text-kd-caption text-kd-text-muted">เลือกแล้ว {selectedIds.size}</Text>
              ) : null}
            </View>

            {visibleClips.map((clip) => (
              <WebClipRow
                key={clip.id}
                theme={theme}
                accentColor={accentColor}
                clip={clip}
                selected={selectedIds.has(clip.id)}
                inLibrary={!!getLibraryAsset(clip)}
                onToggleSelect={() => toggleSelect(clip.id)}
                onPlay={() => setPreviewClip(clip)}
                onSave={() => void saveClipToLibrary(clip)}
              />
            ))}

            {visibleClips.length === 0 ? (
              <View className="items-center py-8">
                <Text className="text-kd-caption text-kd-text-subtle">ไม่พบคลิปที่ค้นหา</Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {selectedIds.size > 0 ? (
        <View pointerEvents="box-none" className="absolute left-3 right-3" style={{ bottom: floatingBottom }}>
          <View
            className="flex-row items-center justify-between rounded-full border border-kd-border bg-kd-panel px-2 py-1.5"
            style={{
              elevation: 6,
              shadowColor: theme.shadow,
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.18,
              shadowRadius: 16,
            }}
          >
            <View className="flex-row items-center gap-2 pl-1.5">
              <View className="h-5 w-5 items-center justify-center rounded-full bg-black dark:bg-white">
                <Text className="text-kd-caption font-bold text-white dark:text-black">{selectedIds.size}</Text>
              </View>
              <View className="h-3 w-px bg-kd-border" />
              <Pressable accessibilityRole="button" onPress={() => setSelectedIds(new Set())}>
                <Text className="text-kd-caption text-kd-text-subtle">ยกเลิก</Text>
              </Pressable>
            </View>

            <View className="flex-row items-center gap-1.5">
              <Pressable
                accessibilityLabel="เก็บเข้าคลัง"
                accessibilityRole="button"
                disabled={downloadWorking}
                onPress={() => void saveSelectedToLibrary()}
                className="h-7 flex-row items-center gap-[5px] rounded-full bg-black px-3 disabled:opacity-60 dark:bg-white"
              >
                <Download size={11} color={inverseText} strokeWidth={2.5} />
                <Text className="text-kd-micro font-bold text-white dark:text-black">เก็บเข้าคลัง</Text>
              </Pressable>
              {onSendVideosToShopee ? (
                <Pressable
                  accessibilityLabel="โพสต์ Shopee"
                  accessibilityRole="button"
                  disabled={downloadWorking}
                  onPress={() => void sendSelectedToPost('shopee')}
                  className="h-7 w-7 items-center justify-center rounded-full disabled:opacity-60"
                  style={{ backgroundColor: SHOPEE_ORANGE }}
                >
                  <ShopeeLogo size={14} color={theme.white} cutoutColor={SHOPEE_ORANGE} />
                </Pressable>
              ) : null}
              {onSendVideosToTikTok ? (
                <Pressable
                  accessibilityLabel="โพสต์ TikTok"
                  accessibilityRole="button"
                  disabled={downloadWorking}
                  onPress={() => void sendSelectedToPost('tiktok')}
                  className="h-7 w-7 items-center justify-center rounded-full border border-kd-border bg-kd-panel disabled:opacity-60"
                >
                  <TikTokLogo size={14} isDark={theme.isDark} />
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      <Modal animationType="fade" transparent visible={!!downloadStatus && downloadWorking}>
        <View className="flex-1 items-center justify-center bg-black/45 px-6">
          <View className="w-full max-w-[340px] overflow-hidden rounded-[18px] border border-kd-border bg-kd-panel">
            <View className="flex-row items-center gap-3 border-b border-kd-border px-4 py-3">
              <View className="h-10 w-10 items-center justify-center rounded-kd-lg bg-kd-blue/10 dark:bg-kd-blue/15">
                <CloudDownload size={18} color={accentColor} strokeWidth={2.2} />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-kd-body font-semibold text-kd-text">กำลังรับคลิปจากเว็บ</Text>
                <View className="mt-1 flex-row items-center gap-1.5">
                  <View className="rounded-full bg-kd-blue/10 px-2 py-0.5 dark:bg-kd-blue/15">
                    <Text className="text-kd-micro font-semibold text-kd-blue">
                      {downloadStatus ? formatWebDownloadPhase(downloadStatus.phase) : ''}
                    </Text>
                  </View>
                  <Text className="text-kd-caption text-kd-text-subtle">
                    {downloadStatus ? `${downloadStatus.current}/${downloadStatus.total}` : ''}
                  </Text>
                </View>
              </View>
            </View>

            <View className="gap-3 p-4">
              {downloadStatus?.filename ? (
                <View className="rounded-kd-lg border border-kd-border bg-kd-card-muted px-3 py-2">
                  <Text numberOfLines={2} className="text-kd-caption font-medium text-kd-text">
                    {downloadStatus.filename}
                  </Text>
                </View>
              ) : null}
              <View className="h-2 overflow-hidden rounded-full bg-kd-card-muted">
                <View
                  className="h-full rounded-full bg-kd-blue"
                  style={{ width: `${Math.round(progressValue * 100)}%` }}
                />
              </View>
              <View className="flex-row items-center justify-between">
                <Text className="text-kd-micro text-kd-text-subtle">{Math.round(progressValue * 100)}%</Text>
                <ActivityIndicator color={accentColor} size="small" />
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={!!previewClip}
        onRequestClose={() => setPreviewClip(null)}
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
                {previewClip ? getClipDisplayName(previewClip) : 'วิดีโอ'}
              </Text>
              <Text numberOfLines={1} className="text-kd-caption text-white/60">
                {previewClip?.productName ?? ''}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="ปิด"
              accessibilityRole="button"
              onPress={() => setPreviewClip(null)}
              className="h-9 w-9 items-center justify-center rounded-full bg-white/15"
            >
              <X size={18} color={theme.white} strokeWidth={2.4} />
            </Pressable>
          </View>

          <View className="flex-1 items-center justify-center">
            {previewMedia ? <LocalVideoPlayer media={previewMedia} theme={theme} /> : null}
          </View>

          {previewClip ? (
            <View className="mt-4 flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                disabled={downloadWorking || !!getLibraryAsset(previewClip)}
                onPress={() => {
                  const clip = previewClip;
                  setPreviewClip(null);
                  void saveClipToLibrary(clip);
                }}
                className="h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-kd-lg bg-white/15 disabled:opacity-60"
              >
                <Download size={14} color={theme.white} strokeWidth={2.2} />
                <Text className="text-kd-body font-medium text-white">
                  {getLibraryAsset(previewClip) ? 'อยู่ในคลังแล้ว' : 'เก็บเข้าคลัง'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

/** แถวคลิปจากเว็บ — โครงเดียวกับ VideoRow (checkbox + thumbnail + ชื่อ/เมทา + ปุ่มแอ็กชัน) */
function WebClipRow({
  theme,
  accentColor,
  clip,
  selected,
  inLibrary,
  onToggleSelect,
  onPlay,
  onSave,
}: {
  theme: KubdeeTheme;
  accentColor: string;
  clip: WebAutoClip;
  selected: boolean;
  inLibrary: boolean;
  onToggleSelect: () => void;
  onPlay: () => void;
  onSave: () => void;
}): React.JSX.Element {
  const platform = resolveMediaPlatform(clip.platform, clip.productUrl);
  const isExternal = clip.urlKind === 'external';
  const isStale = isWebClipLinkStale(clip);
  const dateLabel = clip.createdAtMs ? formatAssetDate(clip.createdAtMs) : '-';
  const productCode = cleanText(clip.productId);
  const profileName = cleanText(clip.profileName);

  return (
    <Pressable
      accessibilityLabel="เลือกคลิปจากเว็บ"
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onToggleSelect}
      className={`rounded-kd-lg border p-2.5 active:opacity-80 ${
        selected ? 'bg-kd-blue/10 dark:bg-kd-blue/15' : 'border-kd-border bg-kd-card'
      }`}
      style={selected ? { borderColor: accentColor } : undefined}
    >
      <View className="flex-row items-start gap-2.5">
        <View className="mt-0.5">
          <SelectCircle theme={theme} selected={selected} accent={accentColor} size={16} />
        </View>

        <Pressable
          accessibilityLabel="เล่นวิดีโอ"
          accessibilityRole="button"
          onPress={onPlay}
          className="h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-kd-md bg-kd-border dark:bg-kd-card-muted"
        >
          <LocalVideoPlaceholder theme={theme} compact thumbnailUri={cleanText(clip.thumbnailUrl) || null} />
        </Pressable>

        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text numberOfLines={1} className="min-w-0 flex-1 text-kd-body font-medium text-kd-text">
              {getClipDisplayName(clip)}
            </Text>
            {platform === 'tiktok' ? (
              <View accessible accessibilityLabel="แพลตฟอร์ม TikTok" accessibilityRole="image" className="shrink-0">
                <TikTokLogo size={15} isDark={theme.isDark} />
              </View>
            ) : platform === 'shopee' ? (
              <View accessible accessibilityLabel="แพลตฟอร์ม Shopee" accessibilityRole="image" className="shrink-0">
                <ShopeeLogo size={15} />
              </View>
            ) : null}
          </View>

          <View className="mt-[3px] flex-row items-center gap-1.5">
            {productCode ? (
              <>
                <Text numberOfLines={1} className="min-w-0 shrink text-kd-micro text-kd-text-subtle">
                  #{productCode}
                </Text>
                <View className="h-[3px] w-[3px] shrink-0 rounded-full bg-kd-border-strong" />
              </>
            ) : null}
            <Text className="shrink-0 text-kd-micro text-kd-text-subtle">{dateLabel}</Text>
            {profileName ? (
              <>
                <View className="h-[3px] w-[3px] shrink-0 rounded-full bg-kd-border-strong" />
                <Text numberOfLines={1} className="min-w-0 shrink text-kd-micro text-kd-text-subtle">
                  {profileName}
                </Text>
              </>
            ) : null}
          </View>

          <View className="mt-1 flex-row items-center justify-between gap-2">
            <View className="min-w-0 shrink flex-row flex-wrap items-center gap-1">
              {inLibrary ? (
                <View className="rounded-full border border-kd-emerald bg-kd-emerald/10 px-1.5 py-0.5">
                  <Text className="text-[8px] font-bold text-kd-emerald">อยู่ในคลังแล้ว</Text>
                </View>
              ) : null}
              {isStale ? (
                <View className="rounded-full border border-kd-amber bg-kd-amber/10 px-1.5 py-0.5">
                  <Text className="text-[8px] font-bold text-kd-amber">ลิงก์อาจหมดอายุ</Text>
                </View>
              ) : isExternal ? (
                <View className="rounded-full border border-kd-amber bg-kd-amber/10 px-1.5 py-0.5">
                  <Text className="text-[8px] font-bold text-kd-amber">ลิงก์ภายนอก</Text>
                </View>
              ) : null}
            </View>
            <View className="shrink-0 flex-row items-center gap-0.5">
              <RowIconButton theme={theme} icon={Play} label="เล่น" onPress={onPlay} />
              <RowIconButton
                theme={theme}
                icon={Download}
                label={inLibrary ? 'อยู่ในคลังแล้ว' : 'เก็บเข้าคลัง'}
                color={inLibrary ? theme.emerald : undefined}
                onPress={onSave}
              />
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

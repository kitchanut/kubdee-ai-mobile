import { ActivityIndicator, Image as NativeImage, Pressable, ScrollView, View } from 'react-native';
import { FolderOpen, RotateCcw, Send, SlidersHorizontal, TriangleAlert, Video, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner-native';

import {
  beginAutomationActivityRun,
  flushAutomationActivitySnapshot,
  pushAutomationActivityLog,
  setAutomationActivityRunning,
  setAutomationActivityStopping,
} from '@/activity/automationActivityLogStore';
import { useGeneratedMedia } from '@/autopilot/generatedMediaStore';
import type { GeneratedMediaAsset } from '@/autopilot/generatedMediaStore';
import { TikTokLogo } from '@/components/BrandLogos';
import { PostContentChip, PostWarnChip, resolvePostCaptionState, resolvePostHashtagState } from '@/components/post/PostStatusChips';
import Text from '@/components/ui/KubdeeText';
import TikTokPostModal from '@/tiktok/TikTokPostModal';
import type { TikTokPostVideoInput } from '@/tiktok/TikTokPostModal';
import TikTokPostSettingsModal from '@/tiktok/TikTokPostSettingsModal';
import {
  DEFAULT_TIKTOK_POST_SETTINGS,
  getTikTokPostSettings,
  saveTikTokPostSettings,
} from '@/tiktok/tiktokPostSettingsStore';
import type { TikTokPostSettings } from '@/tiktok/tiktokPostSettingsStore';
import { alpha } from '@/theme/tokens';
import type { KubdeeTheme } from '@/theme/tokens';

const TIKTOK_PINK = '#fe2c55';

interface TikTokPostScreenProps {
  pendingVideoIds: string[];
  selectedProfileId: string;
  theme: KubdeeTheme;
  onClearPendingVideos: () => void;
  onOpenVideoLibrary: () => void;
  onRemovePendingVideo: (videoId: string) => void;
}

function isLocalPostableVideo(asset: GeneratedMediaAsset): boolean {
  const uri = asset.fileUri?.trim();
  return Boolean(uri && (uri.startsWith('content://') || uri.startsWith('file://') || uri.startsWith('/')));
}

function videoLabel(asset: GeneratedMediaAsset, index: number): string {
  return asset.title?.trim() || asset.fileName?.trim() || `วิดีโอ ${index + 1}`;
}

function isTikTokProductVideo(asset: GeneratedMediaAsset): boolean {
  return asset.platform?.trim().toLowerCase() === 'tiktok';
}

// TikTok Showcase product ID เป็นตัวเลขล้วนยาว (เช่น 1730056701093775397) เก็บใน productId เป็นหลัก
// (บาง asset productId เป็น UUID ภายใน) — เลือกเฉพาะค่าที่เป็นตัวเลขล้วนไปค้นหา/จับคู่สินค้าใน TikTok
function tiktokProductId(asset: GeneratedMediaAsset): string | null {
  for (const candidate of [asset.productId, asset.productCode]) {
    const value = candidate?.trim();
    if (value && /^\d{6,}$/.test(value)) {
      return value;
    }
  }
  return null;
}

function toTikTokPostVideo(asset: GeneratedMediaAsset): TikTokPostVideoInput {
  const isTikTokProduct = isTikTokProductVideo(asset);
  return {
    fileUri: asset.fileUri,
    fileName: asset.fileName,
    productName: isTikTokProduct ? asset.productName : null,
    productId: isTikTokProduct ? tiktokProductId(asset) : null,
    caption: asset.caption,
    hashtags: asset.hashtags,
    cta: asset.cta,
    platform: asset.platform,
    galleryVideoId: asset.id,
  };
}

// แคปชั่นตอนโพสต์ = แคปชั่นที่มี หรือ fallback ชื่อสินค้า TikTok — ถ้าว่างทั้งคู่ native script
// โยน CAPTION_REQUIRED ("ไม่มี Caption หรือชื่อสินค้า จึงไม่โพสต์") คือโพสต์ไม่ได้เลย
function hasTikTokPostableText(asset: GeneratedMediaAsset): boolean {
  if (asset.caption?.trim()) {
    return true;
  }
  return isTikTokProductVideo(asset) && Boolean(asset.productName?.trim());
}

// เมื่อเปิด "แนบสินค้า" native flow จะ fail ทั้งโพสต์ถ้าแนบไม่ได้ (ไม่ใช่สินค้า TikTok / ไม่มี
// Product ID) จึงต้องเช็คตั้งแต่ post list แล้วข้ามรายการที่แนบไม่ได้แทนที่จะไป fail ลึกใน WebView
export type TikTokProductAttachIssue = 'not-tiktok' | 'no-id' | null;

function getTikTokProductAttachIssue(asset: GeneratedMediaAsset, enableProductLink: boolean): TikTokProductAttachIssue {
  if (!enableProductLink) {
    return null;
  }
  if (!isTikTokProductVideo(asset)) {
    return 'not-tiktok';
  }
  if (!tiktokProductId(asset)) {
    return 'no-id';
  }
  return null;
}

type TikTokPostBlock = 'ok' | 'no-file' | 'no-caption' | 'product-not-tiktok' | 'product-no-id';

function getTikTokPostBlock(asset: GeneratedMediaAsset, enableProductLink: boolean): TikTokPostBlock {
  if (!isLocalPostableVideo(asset)) {
    return 'no-file';
  }
  const attachIssue = getTikTokProductAttachIssue(asset, enableProductLink);
  if (attachIssue === 'not-tiktok') {
    return 'product-not-tiktok';
  }
  if (attachIssue === 'no-id') {
    return 'product-no-id';
  }
  if (!hasTikTokPostableText(asset)) {
    return 'no-caption';
  }
  return 'ok';
}

function isTikTokPostable(asset: GeneratedMediaAsset, enableProductLink: boolean): boolean {
  return getTikTokPostBlock(asset, enableProductLink) === 'ok';
}

interface TikTokSkipBreakdown {
  noFile: number;
  noCaption: number;
  productNotTiktok: number;
  productNoId: number;
}

function summarizeTikTokPostBlocks(videos: GeneratedMediaAsset[], enableProductLink: boolean): TikTokSkipBreakdown {
  const breakdown: TikTokSkipBreakdown = { noFile: 0, noCaption: 0, productNotTiktok: 0, productNoId: 0 };
  for (const video of videos) {
    const block = getTikTokPostBlock(video, enableProductLink);
    if (block === 'no-file') breakdown.noFile += 1;
    else if (block === 'no-caption') breakdown.noCaption += 1;
    else if (block === 'product-not-tiktok') breakdown.productNotTiktok += 1;
    else if (block === 'product-no-id') breakdown.productNoId += 1;
  }
  return breakdown;
}

function formatTikTokSkipBanner(breakdown: TikTokSkipBreakdown): string {
  const total = breakdown.noFile + breakdown.noCaption + breakdown.productNotTiktok + breakdown.productNoId;
  const parts: string[] = [];
  if (breakdown.productNotTiktok > 0) parts.push(`ไม่ใช่สินค้า TikTok ${breakdown.productNotTiktok}`);
  if (breakdown.productNoId > 0) parts.push(`ไม่มี Product ID ${breakdown.productNoId}`);
  if (breakdown.noCaption > 0) parts.push(`ไม่มีแคปชั่น/ชื่อสินค้า ${breakdown.noCaption}`);
  if (breakdown.noFile > 0) parts.push(`ไฟล์ไม่พร้อม ${breakdown.noFile}`);
  return parts.length > 0 ? `ข้าม ${total} รายการที่โพสต์ไม่ได้ · ${parts.join(' · ')}` : '';
}

export default function TikTokPostScreen({
  pendingVideoIds,
  selectedProfileId,
  theme,
  onClearPendingVideos,
  onOpenVideoLibrary,
  onRemovePendingVideo,
}: TikTokPostScreenProps): React.JSX.Element {
  const { getAssetsByKind, markPosted } = useGeneratedMedia();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<TikTokPostSettings>(DEFAULT_TIKTOK_POST_SETTINGS);
  const [isPosting, setIsPosting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  // คลิปที่โพสต์ไม่สำเร็จในรอบปัจจุบัน — ข้ามไปคลิปถัดไปแทนการหยุดทั้งคิว (desktop parity)
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const stopRequestedRef = useRef(false);
  const completedRef = useRef(false);
  const settingsSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const postAction = settings.postAction;
  const enableProductLink = settings.enableProductLink;

  useEffect(() => {
    let cancelled = false;
    void getTikTokPostSettings().then((savedSettings) => {
      if (!cancelled) setSettings(savedSettings);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSetting = useCallback(
    <K extends keyof TikTokPostSettings>(key: K, value: TikTokPostSettings[K]): void => {
      setSettings((current) => {
        const next = { ...current, [key]: value };
        settingsSaveQueueRef.current = settingsSaveQueueRef.current
          .then(() => saveTikTokPostSettings(next))
          .catch(() => {
            toast.error('บันทึกการตั้งค่า TikTok ไม่สำเร็จ');
          });
        return next;
      });
    },
    []
  );

  const generatedVideos = useMemo(
    () => getAssetsByKind('videos', selectedProfileId),
    [getAssetsByKind, selectedProfileId]
  );
  const queuedVideos = useMemo(() => {
    const byId = new Map(generatedVideos.map((video) => [video.id, video]));
    return pendingVideoIds
      .map((id) => byId.get(id))
      .filter((video): video is GeneratedMediaAsset => Boolean(video));
  }, [generatedVideos, pendingVideoIds]);
  // โพสต์เฉพาะคลิปที่มีไฟล์ + แคปชั่น/ชื่อสินค้า และ (ถ้าเปิดแนบสินค้า) แนบสินค้า TikTok ได้จริง
  const postableVideos = useMemo(
    () => queuedVideos.filter((video) => isTikTokPostable(video, enableProductLink)),
    [queuedVideos, enableProductLink]
  );
  const skipBreakdown = useMemo(
    () => summarizeTikTokPostBlocks(queuedVideos, enableProductLink),
    [queuedVideos, enableProductLink]
  );
  const blockedCount = queuedVideos.length - postableVideos.length;
  // ทำงานกับหัวคิวที่โพสต์ได้เสมอ เมื่อสำเร็จ App จะนำรายการนั้นออกและคลิปถัดไปเลื่อนขึ้นมา
  // คลิปแดง (ข้าม) จะไม่ถูกหยิบขึ้นมาโพสต์ จึงค้างอยู่ในลิสต์ให้ผู้ใช้แก้/เอาออกเอง
  // คลิปที่ fail ระหว่างรอบนี้ (failedIds) จะถูกข้ามเพื่อให้คิวเดินต่อ (desktop parity) —
  // ค้างในลิสต์ให้ผู้ใช้กด "ลองใหม่" ซึ่งล้าง failedIds แล้วเริ่มรอบใหม่
  const activeVideo = isPosting
    ? postableVideos.find((video) => !failedIds.has(video.id)) ?? null
    : null;
  const missingCount = pendingVideoIds.length - queuedVideos.length;
  const canPost = Boolean(selectedProfileId && postableVideos.length > 0 && !isPosting);

  const appendLog = useCallback((message: string): void => {
    pushAutomationActivityLog('tiktok-post', message);
    void flushAutomationActivitySnapshot();
  }, []);

  const finishRun = useCallback((message: string, error = false): void => {
    appendLog(message);
    setIsPosting(false);
    setIsStopping(false);
    setAutomationActivityRunning('tiktok-post', false);
    setAutomationActivityStopping('tiktok-post', false);
    if (error) toast.error(message);
    else toast.success(message);
  }, [appendLog]);

  const startPosting = useCallback((): void => {
    // กันกดซ้ำระหว่างรันอยู่ — ล้าง failedIds กลางรันจะทำ modal ของคลิปที่กำลังโพสต์
    // unmount แล้วเริ่มคลิปเดิมใหม่ = เสี่ยงโพสต์ซ้ำบน TikTok
    if (isPosting) return;
    if (!selectedProfileId) {
      toast.warning('เลือกโปรไฟล์ก่อนโพสต์ TikTok');
      return;
    }
    if (queuedVideos.length === 0) {
      toast.warning('เลือกวิดีโอก่อนโพสต์ TikTok');
      return;
    }
    if (postableVideos.length === 0) {
      toast.warning('ไม่มีวิดีโอที่โพสต์ได้ — ต้องมีไฟล์ในเครื่องและมีแคปชั่นหรือชื่อสินค้า TikTok');
      return;
    }

    // โพสต์เฉพาะคลิปที่พร้อม — คลิปที่แนบสินค้าไม่ได้/ไม่มีแคปชั่น/ไฟล์ไม่พร้อม ข้ามไปพร้อมเตือน
    const { noCaption, noFile, productNotTiktok, productNoId } = skipBreakdown;
    if (productNotTiktok > 0) {
      toast.warning(`ข้าม ${productNotTiktok} รายการที่แนบสินค้าไม่ได้ (ไม่ใช่สินค้า TikTok)`);
    }
    if (productNoId > 0) {
      toast.warning(`ข้าม ${productNoId} รายการที่แนบสินค้าไม่ได้ (ไม่พบ TikTok Product ID)`);
    }
    if (noCaption > 0) {
      toast.warning(`ข้าม ${noCaption} รายการที่ไม่มีแคปชั่น/ชื่อสินค้า`);
    }
    if (noFile > 0) {
      toast.warning(`ข้าม ${noFile} รายการที่ไฟล์ยังไม่พร้อม`);
    }

    stopRequestedRef.current = false;
    completedRef.current = false;
    setLastError(null);
    setFailedIds(new Set());
    setIsStopping(false);
    setIsPosting(true);
    beginAutomationActivityRun('tiktok-post', `TikTok post · ${postableVideos.length} วิดีโอ`);
    appendLog(`เริ่ม${postAction === 'publish' ? 'โพสต์' : 'บันทึกร่าง'} TikTok ${postableVideos.length} วิดีโอ`);
  }, [appendLog, isPosting, postAction, postableVideos, queuedVideos.length, selectedProfileId, skipBreakdown]);

  const stopPosting = useCallback((): void => {
    if (!isPosting || isStopping) return;
    stopRequestedRef.current = true;
    setIsStopping(true);
    setAutomationActivityStopping('tiktok-post', true);
    appendLog('กำลังหยุด TikTok post...');
    finishRun('หยุด TikTok post แล้ว');
  }, [appendLog, finishRun, isPosting, isStopping]);

  const handleModalLog = useCallback((message: string): void => {
    appendLog(message);
  }, [appendLog]);

  const handleComplete = useCallback((result: { success: boolean; error?: string | null }): void => {
    if (completedRef.current || !activeVideo) return;
    completedRef.current = true;

    if (!result.success) {
      // desktop parity: คลิป fail = ข้ามคลิปนั้นแล้วเดินคิวต่อ ไม่หยุดทั้งชุด
      const message = result.error?.trim() || `ทำรายการ ${videoLabel(activeVideo, 0)} ไม่สำเร็จ`;
      appendLog(`ข้ามคลิปที่ล้มเหลว: ${message}`);
      setLastError(message);
      const nextFailed = new Set(failedIds).add(activeVideo.id);
      setFailedIds(nextFailed);
      const remainingAfterFail = queuedVideos.filter(
        (video) => !nextFailed.has(video.id) && isTikTokPostable(video, enableProductLink)
      ).length;
      if (stopRequestedRef.current || remainingAfterFail === 0) {
        finishRun(`TikTok post จบ — ล้มเหลว ${nextFailed.size} คลิป (กด "ลองใหม่" เพื่อโพสต์ซ้ำ)`, true);
        return;
      }
      toast.error(message);
      completedRef.current = false;
      return;
    }

    appendLog(`${postAction === 'publish' ? 'โพสต์' : 'บันทึกร่าง'}สำเร็จ: ${videoLabel(activeVideo, 0)}`);
    if (postAction === 'publish') {
      void markPosted(activeVideo.id, 'tiktok');
    }
    onRemovePendingVideo(activeVideo.id);
    const remainingPostable = queuedVideos.filter(
      (video) => video.id !== activeVideo.id && !failedIds.has(video.id) && isTikTokPostable(video, enableProductLink)
    ).length;
    if (stopRequestedRef.current || remainingPostable === 0) {
      if (failedIds.size > 0) {
        finishRun(`${postAction === 'publish' ? 'โพสต์' : 'บันทึกร่าง'} TikTok จบ — ล้มเหลว ${failedIds.size} คลิป (กด "ลองใหม่" เพื่อโพสต์ซ้ำ)`, true);
      } else {
        finishRun(`${postAction === 'publish' ? 'โพสต์' : 'บันทึกร่าง'} TikTok ครบแล้ว`);
      }
      return;
    }

    completedRef.current = false;
  }, [activeVideo, appendLog, enableProductLink, failedIds, finishRun, markPosted, onRemovePendingVideo, postAction, queuedVideos]);

  const handleModalClose = useCallback((): void => {
    if (completedRef.current) return;
    if (isPosting) {
      stopRequestedRef.current = true;
      finishRun('หยุด TikTok post แล้ว');
    }
  }, [finishRun, isPosting]);

  return (
    <View className="flex-1 bg-kd-screen">
      <View className="flex-row items-center gap-2 border-b border-kd-border bg-kd-screen px-3 py-2">
        <View
          className="h-8 w-8 items-center justify-center rounded-kd-lg"
          style={{ backgroundColor: alpha(TIKTOK_PINK, theme.isDark ? 0.16 : 0.1) }}
        >
          <TikTokLogo size={17} isDark={theme.isDark} />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-kd-label font-semibold text-kd-text">TikTok</Text>
          <Text className="text-kd-micro text-kd-text-subtle">โพสต์ผ่าน TikTok Studio</Text>
        </View>
        <Pressable
          accessibilityLabel="ตั้งค่า TikTok Post"
          accessibilityRole="button"
          disabled={isPosting}
          onPress={() => setIsSettingsOpen(true)}
          className="h-8 w-8 items-center justify-center rounded-kd-lg bg-kd-panel-muted active:opacity-70 disabled:opacity-40 dark:bg-kd-card-muted"
        >
          <SlidersHorizontal size={15} color={theme.textMuted} strokeWidth={2.2} />
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="pb-[92px]" showsVerticalScrollIndicator={false}>
        {queuedVideos.length > 0 ? (
          <>
            <View className="flex-row items-center justify-between border-b border-kd-border px-3 py-2">
              <Text className="text-kd-caption font-semibold text-kd-text-subtle">{queuedVideos.length} วิดีโอ</Text>
              <View className="flex-row gap-4">
                <Pressable disabled={isPosting} onPress={onOpenVideoLibrary}>
                  <Text className="text-kd-caption font-semibold" style={{ color: TIKTOK_PINK }}>เพิ่มวิดีโอ</Text>
                </Pressable>
                <Pressable disabled={isPosting} onPress={onClearPendingVideos}>
                  <Text className="text-kd-caption font-semibold text-kd-red">ล้างทั้งหมด</Text>
                </Pressable>
              </View>
            </View>
            {lastError ? (
              <View className="flex-row items-center gap-2 border-b border-kd-border bg-kd-red-soft px-3 py-2">
                <Text numberOfLines={2} className="min-w-0 flex-1 text-kd-caption text-kd-red">{lastError}</Text>
                <Pressable
                  accessibilityLabel="ลองโพสต์ TikTok ใหม่"
                  accessibilityRole="button"
                  disabled={isPosting}
                  onPress={startPosting}
                  className={`flex-row items-center gap-1 rounded-kd-md border border-kd-red px-2 py-1 ${isPosting ? 'opacity-40' : ''}`}
                >
                  <RotateCcw size={12} color={theme.red} />
                  <Text className="text-kd-micro font-semibold text-kd-red">ลองใหม่</Text>
                </Pressable>
              </View>
            ) : null}
            {blockedCount > 0 ? (
              <View className="flex-row items-center gap-2 border-b border-kd-border bg-kd-red-soft px-3 py-2">
                <TriangleAlert size={14} color={theme.red} strokeWidth={2.2} />
                <Text numberOfLines={2} className="min-w-0 flex-1 text-kd-caption text-kd-red">
                  {formatTikTokSkipBanner(skipBreakdown)}
                </Text>
              </View>
            ) : null}
            {queuedVideos.map((video, index) => {
              const block = getTikTokPostBlock(video, enableProductLink);
              const isBlockedRed = block === 'no-caption' || block === 'product-not-tiktok' || block === 'product-no-id';
              const isTikTokProduct = isTikTokProductVideo(video);
              // TikTok fallback ใช้ชื่อสินค้าเป็นแคปชั่นได้เฉพาะเมื่อ product มาจาก TikTok (native ส่ง productName เฉพาะกรณีนั้น)
              const captionState = resolvePostCaptionState(
                video.caption,
                false,
                isTikTokProduct && Boolean(video.productName?.trim())
              );
              const hashtagState = resolvePostHashtagState(video.hashtags, false);
              // เช็คการแนบสินค้าตั้งแต่หน้า list — ถ้าแนบไม่ได้ native flow จะ fail ทั้งโพสต์
              const attachIssue = getTikTokProductAttachIssue(video, enableProductLink);
              const productLine = !enableProductLink
                ? 'ไม่แนบสินค้า'
                : attachIssue === 'not-tiktok'
                  ? 'แนบสินค้าไม่ได้ — ไม่ใช่สินค้าจาก TikTok'
                  : attachIssue === 'no-id'
                    ? 'แนบสินค้าไม่ได้ — ไม่พบ TikTok Product ID'
                    : `แนบสินค้า TikTok · #${tiktokProductId(video)}`;
              const productLineDanger = attachIssue !== null;
              return (
                <View
                  key={video.id}
                  className={`flex-row items-center gap-2 border-b border-kd-border px-3 py-2 ${
                    isBlockedRed ? 'bg-kd-red/5 dark:bg-kd-red/10' : ''
                  }`}
                  style={isBlockedRed ? { borderLeftWidth: 2, borderLeftColor: theme.red } : undefined}
                >
                  <View className="h-14 w-10 overflow-hidden rounded-kd-md bg-kd-card-muted">
                    {video.thumbnailUri ? (
                      <NativeImage source={{ uri: video.thumbnailUri }} className="h-full w-full" resizeMode="cover" />
                    ) : (
                      <View className="h-full w-full items-center justify-center"><Video size={16} color={theme.textSubtle} /></View>
                    )}
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">{videoLabel(video, index)}</Text>
                    <Text numberOfLines={1} className={`text-kd-micro ${productLineDanger ? 'text-kd-red' : 'text-kd-text-subtle'}`}>
                      {productLine}
                    </Text>
                    <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
                      {block === 'no-file' ? <PostWarnChip text="ไฟล์ยังไม่พร้อม" theme={theme} /> : null}
                      <PostContentChip label="แคปชั่น" state={captionState} theme={theme} />
                      <PostContentChip label="แฮชแท็ก" state={hashtagState} theme={theme} />
                    </View>
                  </View>
                  {!isPosting ? (
                    <Pressable accessibilityLabel="นำวิดีโอออกจากคิว" onPress={() => onRemovePendingVideo(video.id)}>
                      <X size={15} color={theme.textSubtle} />
                    </Pressable>
                  ) : activeVideo?.id === video.id ? <ActivityIndicator color={TIKTOK_PINK} size="small" /> : null}
                </View>
              );
            })}
          </>
        ) : (
          <View className="min-h-[500px] items-center justify-center px-8">
            <TikTokLogo size={34} isDark={theme.isDark} />
            <Text className="mt-3 text-kd-subtitle font-semibold text-kd-text">ยังไม่มีวิดีโอในคิว</Text>
            <Text className="mt-1 text-center text-kd-caption text-kd-text-subtle">เลือกวิดีโอจากคลังแล้วส่งมา TikTok</Text>
            <Pressable onPress={onOpenVideoLibrary} className="mt-3 h-9 flex-row items-center gap-1.5 rounded-kd-lg px-3" style={{ backgroundColor: TIKTOK_PINK }}>
              <FolderOpen size={14} color={theme.white} />
              <Text className="text-kd-body font-semibold text-white">ไปคลังวิดีโอ</Text>
            </Pressable>
          </View>
        )}
        {missingCount > 0 ? <Text className="p-2 text-center text-kd-caption text-kd-text-subtle">หาไม่พบในคลัง {missingCount} วิดีโอ</Text> : null}
      </ScrollView>

      {queuedVideos.length > 0 || isPosting ? (
        <View className="absolute bottom-0 left-0 right-0 bg-kd-screen px-4 pb-3 pt-3">
          <Pressable
            accessibilityRole="button"
            disabled={isPosting ? isStopping : !canPost}
            onPress={isPosting ? stopPosting : startPosting}
            className="h-[50px] flex-row items-center justify-center gap-2 rounded-kd-xl disabled:opacity-60"
            style={{ backgroundColor: isPosting ? theme.text : TIKTOK_PINK }}
          >
            {isStopping ? <ActivityIndicator color={theme.white} /> : isPosting ? <X size={16} color={theme.white} /> : <Send size={16} color={theme.white} />}
            <Text className="text-kd-subtitle font-semibold text-white">
              {isPosting ? (isStopping ? 'กำลังหยุด...' : 'หยุด TikTok post') : `${postAction === 'publish' ? 'โพสต์' : 'บันทึกร่าง'} TikTok ${postableVideos.length} คลิป`}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {activeVideo ? (
        <TikTokPostModal
          visible
          profileLocalId={selectedProfileId}
          video={toTikTokPostVideo(activeVideo)}
          postAction={postAction}
          enableProductLink={enableProductLink && activeVideo.platform?.trim().toLowerCase() === 'tiktok'}
          onLog={handleModalLog}
          onComplete={handleComplete}
          onClose={handleModalClose}
        />
      ) : null}

      <TikTokPostSettingsModal
        visible={isSettingsOpen}
        settings={settings}
        theme={theme}
        onChange={updateSetting}
        onClose={() => setIsSettingsOpen(false)}
      />
    </View>
  );
}

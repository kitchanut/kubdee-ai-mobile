import { ActivityIndicator, Image as NativeImage, Pressable, ScrollView, View } from 'react-native';
import { FolderOpen, RotateCcw, Send, SlidersHorizontal, Video, X } from 'lucide-react-native';
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

function toTikTokPostVideo(asset: GeneratedMediaAsset): TikTokPostVideoInput {
  const isTikTokProduct = asset.platform?.trim().toLowerCase() === 'tiktok';
  return {
    fileUri: asset.fileUri,
    fileName: asset.fileName,
    productName: isTikTokProduct ? asset.productName : null,
    productId: isTikTokProduct ? asset.productId || asset.productCode : null,
    caption: asset.caption,
    hashtags: asset.hashtags,
    cta: asset.cta,
    platform: asset.platform,
    galleryVideoId: asset.id,
  };
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
  // ทำงานกับหัวคิวเสมอ เมื่อสำเร็จ App จะนำรายการนั้นออกและคลิปถัดไปเลื่อนขึ้นมา
  // วิธีนี้ไม่พึ่ง index ที่เปลี่ยนหลัง array หด จึงไม่ข้ามคลิปกลางคิว
  const activeVideo = isPosting ? queuedVideos[0] ?? null : null;
  const missingCount = pendingVideoIds.length - queuedVideos.length;
  const readyCount = queuedVideos.filter(isLocalPostableVideo).length;
  const canPost = Boolean(
    selectedProfileId && queuedVideos.length > 0 && readyCount === queuedVideos.length && !isPosting
  );

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
    if (!selectedProfileId) {
      toast.warning('เลือกโปรไฟล์ก่อนโพสต์ TikTok');
      return;
    }
    if (queuedVideos.length === 0) {
      toast.warning('เลือกวิดีโอก่อนโพสต์ TikTok');
      return;
    }
    if (readyCount !== queuedVideos.length) {
      toast.warning(`มีวิดีโอที่ไม่มีไฟล์ในเครื่อง ${queuedVideos.length - readyCount} รายการ`);
      return;
    }

    stopRequestedRef.current = false;
    completedRef.current = false;
    setLastError(null);
    setIsStopping(false);
    setIsPosting(true);
    beginAutomationActivityRun('tiktok-post', `TikTok post · ${queuedVideos.length} วิดีโอ`);
    appendLog(`เริ่ม${postAction === 'publish' ? 'โพสต์' : 'บันทึกร่าง'} TikTok ${queuedVideos.length} วิดีโอ`);
  }, [appendLog, postAction, queuedVideos, readyCount, selectedProfileId]);

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
      const message = result.error?.trim() || `ทำรายการ ${videoLabel(activeVideo, 0)} ไม่สำเร็จ`;
      setLastError(message);
      finishRun(message, true);
      return;
    }

    appendLog(`${postAction === 'publish' ? 'โพสต์' : 'บันทึกร่าง'}สำเร็จ: ${videoLabel(activeVideo, 0)}`);
    if (postAction === 'publish') {
      void markPosted(activeVideo.id, 'tiktok');
    }
    onRemovePendingVideo(activeVideo.id);
    if (stopRequestedRef.current || queuedVideos.length <= 1) {
      finishRun(`${postAction === 'publish' ? 'โพสต์' : 'บันทึกร่าง'} TikTok ครบแล้ว`);
      return;
    }

    completedRef.current = false;
  }, [activeVideo, appendLog, finishRun, markPosted, onRemovePendingVideo, postAction, queuedVideos.length]);

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
                  onPress={startPosting}
                  className="flex-row items-center gap-1 rounded-kd-md border border-kd-red px-2 py-1"
                >
                  <RotateCcw size={12} color={theme.red} />
                  <Text className="text-kd-micro font-semibold text-kd-red">ลองใหม่</Text>
                </Pressable>
              </View>
            ) : null}
            {queuedVideos.map((video, index) => {
              const hasTikTokProduct = video.platform?.trim().toLowerCase() === 'tiktok';
              return (
                <View key={video.id} className="flex-row items-center gap-2 border-b border-kd-border px-3 py-2">
                  <View className="h-14 w-10 overflow-hidden rounded-kd-md bg-kd-card-muted">
                    {video.thumbnailUri ? (
                      <NativeImage source={{ uri: video.thumbnailUri }} className="h-full w-full" resizeMode="cover" />
                    ) : (
                      <View className="h-full w-full items-center justify-center"><Video size={16} color={theme.textSubtle} /></View>
                    )}
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-kd-body font-semibold text-kd-text">{videoLabel(video, index)}</Text>
                    <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
                      {enableProductLink && hasTikTokProduct
                        ? `สินค้า TikTok · ${video.productName || video.productCode}`
                        : enableProductLink
                          ? 'ไม่แนบสินค้า — สินค้าไม่ได้มาจาก TikTok'
                          : 'ไม่แนบสินค้า'}
                    </Text>
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
              {isPosting ? (isStopping ? 'กำลังหยุด...' : 'หยุด TikTok post') : `${postAction === 'publish' ? 'โพสต์' : 'บันทึกร่าง'} TikTok ${queuedVideos.length} คลิป`}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {activeVideo ? (
        <TikTokPostModal
          key={activeVideo.id}
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

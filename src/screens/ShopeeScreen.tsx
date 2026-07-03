import { ActivityIndicator, Alert, Image as NativeImage, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { FolderOpen, Send, Settings, Video, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner-native';

import {
  MAX_AUTOMATION_LOGS_PER_RUN,
  beginAutomationActivityRun,
  flushAutomationActivitySnapshot,
  pushAutomationActivityLog,
  setAutomationActivityRunning,
  setAutomationActivityStopping,
} from '@/activity/automationActivityLogStore';
import { useGeneratedMedia } from '@/autopilot/generatedMediaStore';
import type { GeneratedMediaAsset } from '@/autopilot/generatedMediaStore';
import Text from '@/components/ui/KubdeeText';
import SectionHeader from '@/components/ui/SectionHeader';
import {
  getAccessibilityStatus,
  openAccessibilitySettings,
  postShopeeVideos,
  requestAndroidVideoPermission,
  stopShopeeAutomation,
  subscribeShopeePostLogs,
} from '@/native/AccessibilityBridge';
import type { NativeShopeePostLog, NativeShopeePostingResult } from '@/native/AccessibilityBridge';
import { SHOPEE_ORANGE, SHOPEE_ORANGE_SOFT } from '@/theme/brandColors';
import type { KubdeeTheme } from '@/theme/tokens';

interface ShopeeScreenProps {
  pendingVideoIds: string[];
  selectedProfileId: string;
  theme: KubdeeTheme;
  onClearPendingVideos?: () => void;
  onOpenVideoLibrary?: () => void;
  onRemovePendingVideo?: (videoId: string) => void;
}

export default function ShopeeScreen({
  pendingVideoIds,
  selectedProfileId,
  theme,
  onClearPendingVideos,
  onOpenVideoLibrary,
  onRemovePendingVideo,
}: ShopeeScreenProps): React.JSX.Element {
  const [subMode, setSubMode] = useState<'post' | 'settings'>('post');
  const [postMessage, setPostMessage] = useState('เลือกวิดีโอจากคลังเพื่อเตรียมโพสต์ Shopee');
  const [postLogs, setPostLogs] = useState<NativeShopeePostLog[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [isStoppingPost, setIsStoppingPost] = useState(false);
  const { getAssetsByKind } = useGeneratedMedia();

  const generatedVideos = useMemo(
    () => getAssetsByKind('videos', selectedProfileId),
    [getAssetsByKind, selectedProfileId]
  );
  const postQueueVideos = useMemo(() => {
    const byId = new Map(generatedVideos.map((video) => [video.id, video]));
    return pendingVideoIds
      .map((videoId) => byId.get(videoId))
      .filter((video): video is GeneratedMediaAsset => !!video);
  }, [generatedVideos, pendingVideoIds]);
  const readyPostVideoCount = useMemo(
    () => postQueueVideos.filter(isLocalPostableVideo).length,
    [postQueueVideos]
  );
  const missingQueuedVideoCount = pendingVideoIds.length - postQueueVideos.length;
  const canPost =
    postQueueVideos.length > 0 &&
    readyPostVideoCount === postQueueVideos.length &&
    !isPosting &&
    !!selectedProfileId;

  const appendPostLog = useCallback((message: string, ts = Date.now()): void => {
    setPostLogs((current) => [...current, { message, ts }].slice(-MAX_AUTOMATION_LOGS_PER_RUN));
    setPostMessage(message);
    pushAutomationActivityLog('shopee-post', message, ts);
  }, []);

  useEffect(() => {
    const subscription = subscribeShopeePostLogs((entry) => {
      setPostLogs((current) => [...current, entry].slice(-MAX_AUTOMATION_LOGS_PER_RUN));
      setPostMessage(entry.message);
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  const handlePostShopeeVideos = useCallback(async (): Promise<void> => {
    if (postQueueVideos.length === 0) {
      toast.warning('เลือกวิดีโอก่อนเตรียมโพสต์ Shopee');
      return;
    }

    const missingFileCount = postQueueVideos.filter((video) => !isLocalPostableVideo(video)).length;

    if (missingFileCount > 0) {
      const message = `ยังไม่พร้อมโพสต์: ต้องใช้ไฟล์วิดีโอในเครื่อง ${missingFileCount}`;
      setPostMessage(message);
      toast.warning(message);
      return;
    }

    if (isPosting) {
      return;
    }

    const videosWithoutProductUrl = postQueueVideos.filter((video) => !video.productUrl);
    const productNameFallbackCount = videosWithoutProductUrl.filter((video) => !!getPostPayloadProductName(video)).length;
    const missingProductInfoCount = videosWithoutProductUrl.length - productNameFallbackCount;

    setIsPosting(true);
    setIsStoppingPost(false);
    setPostLogs([]);
    beginAutomationActivityRun('shopee-post');
    appendPostLog(`เริ่มโพสต์ Shopee ${postQueueVideos.length} วิดีโอ`);

    try {
      await flushAutomationActivitySnapshot();

      if (productNameFallbackCount > 0) {
        const message = `ไม่มีลิงก์สินค้า ${productNameFallbackCount} รายการ จะค้นหาด้วยชื่อสินค้าแทน`;
        appendPostLog(message);
        toast.warning(message);
      }
      if (missingProductInfoCount > 0) {
        const message = `ไม่มีข้อมูลสินค้า ${missingProductInfoCount} รายการ จะโพสต์โดยไม่แนบสินค้า`;
        appendPostLog(message);
        toast.warning(message);
      }

      const status = await getAccessibilityStatus();
      if (!status.running) {
        const message = 'หยุดโพสต์: ยังไม่ได้เปิด Accessibility Service';
        appendPostLog(message);
        Alert.alert(
          'เปิด Accessibility ก่อน',
          'Kubdee AI ต้องใช้ Accessibility เพื่อเปิด Shopee และโพสต์วิดีโอผ่านเครื่องนี้',
          [
            { text: 'ยกเลิก', style: 'cancel' },
            {
              text: 'เปิดตั้งค่า',
              onPress: () => {
                void openAccessibilitySettings();
              },
            },
          ]
        );
        return;
      }

      const mediaAllowed = await requestAndroidVideoPermission();
      if (!mediaAllowed) {
        const message = 'หยุดโพสต์: ต้องอนุญาตอ่านวิดีโอเพื่อโพสต์ Shopee';
        appendPostLog(message);
        toast.warning(message);
        return;
      }

      await flushAutomationActivitySnapshot();

      const result = await postShopeeVideos(
        postQueueVideos.map((video) => ({
          fileUri: video.fileUri || '',
          productName: getPostPayloadProductName(video),
          productId: getPostPayloadProductCode(video),
          productUrl: video.productUrl || null,
          caption: video.caption,
          hashtags: video.hashtags,
          cta: video.cta,
          galleryVideoId: video.id,
          platform: video.platform || 'shopee',
        }))
      );

      if (result.stopped) {
        const message = `หยุดโพสต์ Shopee แล้ว (${result.postedCount || 0}/${postQueueVideos.length})`;
        appendPostLog(message);
        removePostedVideosFromQueue(result, postQueueVideos, onClearPendingVideos, onRemovePendingVideo);
        toast.warning(message);
        return;
      }

      if (!result.success) {
        const message = result.error || 'โพสต์ Shopee ไม่สำเร็จ';
        appendPostLog(message);
        toast.error(message);
        return;
      }

      const successCount =
        result.successCount ?? result.results?.filter((entry) => entry.success).length ?? result.postedCount ?? 0;
      const message = `โพสต์ Shopee สำเร็จ ${result.postedCount || successCount}/${postQueueVideos.length} วิดีโอ`;
      appendPostLog(message);
      removePostedVideosFromQueue(result, postQueueVideos, onClearPendingVideos, onRemovePendingVideo);
      toast.success(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendPostLog(message);
      toast.error(message);
    } finally {
      setIsPosting(false);
      setIsStoppingPost(false);
      setAutomationActivityRunning('shopee-post', false);
      void flushAutomationActivitySnapshot();
    }
  }, [appendPostLog, isPosting, onClearPendingVideos, onRemovePendingVideo, postQueueVideos]);

  const handleStopPost = useCallback(async (): Promise<void> => {
    if (!isPosting || isStoppingPost) {
      return;
    }

    setIsStoppingPost(true);
    setAutomationActivityStopping('shopee-post', true);
    appendPostLog('กำลังส่งคำสั่งหยุด Shopee post...');
    const stopped = await stopShopeeAutomation();
    if (!stopped) {
      toast.warning('ยังหยุดไม่ได้ เพราะไม่พบ Accessibility Service ที่กำลังทำงาน');
      setIsStoppingPost(false);
      setAutomationActivityStopping('shopee-post', false);
      return;
    }

    toast.success('ส่งคำสั่งหยุด Shopee post แล้ว');
  }, [appendPostLog, isPosting, isStoppingPost]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      <View className="flex-row border-b border-kd-border px-2">
        <SubTab
          active={subMode === 'post'}
          color={SHOPEE_ORANGE}
          icon={Video}
          label="โพส"
          theme={theme}
          onPress={() => setSubMode('post')}
        />
        <SubTab
          active={subMode === 'settings'}
          color={theme.textSubtle}
          icon={Settings}
          label="ตั้งค่า"
          theme={theme}
          onPress={() => setSubMode('settings')}
        />
      </View>

      <View className="flex-1">
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerClassName={subMode === 'post' ? 'pb-[104px]' : 'gap-1.5 p-2 pb-[18px]'}
        >
          {subMode === 'post' ? (
            <View className="min-h-full bg-kd-screen">
              {postQueueVideos.length > 0 ? (
                <View className="flex-row items-center justify-between border-b border-kd-border px-3 py-2">
                  <Text className="text-kd-caption font-semibold text-kd-text-subtle">
                    {postQueueVideos.length} วิดีโอ
                  </Text>
                  <View className="flex-row items-center gap-3">
                    {onOpenVideoLibrary ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={onOpenVideoLibrary}
                        className="h-7 justify-center active:opacity-70"
                      >
                        <Text className="text-kd-caption font-bold" style={{ color: SHOPEE_ORANGE }}>
                          เพิ่มวิดีโอ
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={onClearPendingVideos}
                      className="h-7 justify-center active:opacity-70"
                    >
                      <Text className="text-kd-caption font-bold text-kd-red">ล้างทั้งหมด</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {postQueueVideos.length > 0 ? (
                <Text numberOfLines={1} className="border-b border-kd-border px-3 py-1.5 text-kd-micro text-kd-text-subtle">
                  {postMessage}
                </Text>
              ) : null}

              {postQueueVideos.length > 0 ? (
                postQueueVideos.map((video, index) => (
                  <PostVideoRow
                    key={video.id}
                    index={index}
                    theme={theme}
                    video={video}
                    onRemove={() => onRemovePendingVideo?.(video.id)}
                  />
                ))
              ) : (
                <View className="min-h-[520px] items-center justify-center px-8">
                  <View
                    className="h-14 w-14 items-center justify-center rounded-full"
                    style={{ backgroundColor: SHOPEE_ORANGE_SOFT }}
                  >
                    <Video size={24} color={SHOPEE_ORANGE} strokeWidth={1.8} />
                  </View>
                  <Text className="mt-2 text-kd-body font-black text-kd-text">ยังไม่มีวิดีโอในคิว</Text>
                  <Text className="mt-1 text-center text-kd-caption leading-4 text-kd-text-subtle">
                    เลือกวิดีโอจากคลัง แล้วกดปุ่ม Shopee เพื่อส่งมาเตรียมโพสต์
                  </Text>
                  {onOpenVideoLibrary ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={onOpenVideoLibrary}
                      className="mt-3 h-9 flex-row items-center justify-center gap-1.5 rounded-kd-md px-3 active:opacity-75"
                      style={{ backgroundColor: SHOPEE_ORANGE }}
                    >
                      <FolderOpen size={14} color={theme.white} strokeWidth={2.2} />
                      <Text className="text-kd-body font-black text-white">ไปคลังวิดีโอ</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}

              {missingQueuedVideoCount > 0 ? (
                <Text className="px-3 py-2 text-center text-kd-caption text-kd-text-subtle">
                  มีรายการที่หาไม่พบในคลัง {missingQueuedVideoCount} วิดีโอ
                </Text>
              ) : null}
            </View>
          ) : (
            <View className="gap-1.5">
              <SectionHeader icon={Settings} theme={theme} title="Shopee Settings" />
              <SettingsRow label="Target package" value="com.shopee.th" theme={theme} />
              <SettingsRow label="Product source" value="คลังสินค้า" theme={theme} />
              <SettingsRow label="Click strategy" value="Accessibility action + gesture fallback" theme={theme} />
              <SettingsRow label="Sync target" value="Kubdee Cloud product library" theme={theme} />
            </View>
          )}
        </ScrollView>

        {subMode === 'post' ? (
          <View className="absolute bottom-0 left-0 right-0 bg-kd-panel px-4 pb-3 pt-3">
            {isPosting ? (
              <Pressable
                accessibilityRole="button"
                disabled={isStoppingPost}
                onPress={() => {
                  void handleStopPost();
                }}
                className="h-[50px] flex-row items-center justify-center gap-2 rounded-kd-xl bg-kd-text active:opacity-80 disabled:opacity-60"
              >
                {isStoppingPost ? (
                  <ActivityIndicator color={theme.white} size="small" />
                ) : (
                  <X size={14} color={theme.white} strokeWidth={2.4} />
                )}
                <Text className="text-[13px] font-semibold text-white">
                  {isStoppingPost ? 'กำลังหยุด...' : 'หยุดโพส Shopee'}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={!canPost}
                onPress={() => {
                  void handlePostShopeeVideos();
                }}
                className="h-[50px] flex-row items-center justify-center gap-2 rounded-kd-xl active:opacity-80 disabled:opacity-60"
                style={{ backgroundColor: SHOPEE_ORANGE }}
              >
                <Send size={16} color={theme.white} strokeWidth={2.2} />
                <Text className="text-[13px] font-semibold text-white">
                  {`โพส Shopee ${postQueueVideos.length} คลิป`}
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function isLocalPostableVideo(video: GeneratedMediaAsset): boolean {
  const fileUri = video.fileUri?.trim();
  if (!fileUri) {
    return false;
  }

  return (
    fileUri.startsWith('content://') ||
    fileUri.startsWith('file://') ||
    fileUri.startsWith('/')
  );
}

function isGenericPostVideoLabel(value: string | null | undefined): boolean {
  const label = value?.trim();
  return !label || label === 'ไฟล์นำเข้า' || label === 'สินค้า';
}

function isPlaceholderProductCode(value: string | null | undefined): boolean {
  const code = value?.trim().toLowerCase();
  return !code || code === 'unknown' || code === 'device-import' || code === 'mobile-device-import';
}

function getPostPayloadProductName(video: GeneratedMediaAsset): string | null {
  const productName = video.productName?.trim();
  if (!isGenericPostVideoLabel(productName)) {
    return productName;
  }

  return null;
}

function getPostPayloadProductCode(video: GeneratedMediaAsset): string | null {
  const productCode = video.productCode?.trim();
  if (!isPlaceholderProductCode(productCode)) {
    return productCode;
  }

  return null;
}

function getPostedVideoIds(result: NativeShopeePostingResult, videos: GeneratedMediaAsset[]): string[] {
  const resultSuccessIds = result.results
    ?.filter((entry) => entry.success)
    .map((entry) => videos[entry.videoIndex]?.id)
    .filter((videoId): videoId is string => Boolean(videoId));

  if (resultSuccessIds?.length) {
    return resultSuccessIds;
  }

  const postedCount = Math.max(0, Math.min(result.postedCount ?? result.successCount ?? 0, videos.length));
  if (postedCount > 0) {
    return videos.slice(0, postedCount).map((video) => video.id);
  }

  if (result.success) {
    return videos.map((video) => video.id);
  }

  return [];
}

function removePostedVideosFromQueue(
  result: NativeShopeePostingResult,
  videos: GeneratedMediaAsset[],
  onClearPendingVideos: (() => void) | undefined,
  onRemovePendingVideo: ((videoId: string) => void) | undefined
): void {
  const postedVideoIds = getPostedVideoIds(result, videos);
  if (postedVideoIds.length === 0) {
    return;
  }

  if (postedVideoIds.length >= videos.length) {
    onClearPendingVideos?.();
    return;
  }

  postedVideoIds.forEach((videoId) => onRemovePendingVideo?.(videoId));
}

function getPostVideoFallbackLabel(video: GeneratedMediaAsset, index: number): string {
  return video.title?.trim() || video.fileName?.trim() || `วิดีโอ ${index + 1}`;
}

function PostVideoRow({
  index,
  theme,
  video,
  onRemove,
}: {
  index: number;
  theme: KubdeeTheme;
  video: GeneratedMediaAsset;
  onRemove: () => void;
}): React.JSX.Element {
  const hasFile = isLocalPostableVideo(video);
  const hasProductUrl = Boolean(video.productUrl);
  const productName = getPostPayloadProductName(video);
  const productCode = getPostPayloadProductCode(video);
  const productLabel = productName || getPostVideoFallbackLabel(video, index);
  const hasProductInfo = hasProductUrl || Boolean(productName || productCode);
  const productMeta = productCode ? `#${productCode}` : productName ? 'มีชื่อสินค้า แต่ยังไม่มีรหัส' : 'ยังไม่ได้ผูกสินค้า';
  const productStatus = hasProductUrl
    ? 'มีลิงก์สินค้า'
    : hasProductInfo
      ? 'ไม่มีลิงก์สินค้า จะค้นหาด้วยชื่อสินค้า'
      : 'ไม่มีข้อมูลสินค้า';

  return (
    <View className="flex-row items-center gap-2.5 border-b border-kd-border bg-kd-screen px-3 py-2.5">
      <View className="h-[54px] w-[72px] shrink-0 overflow-hidden rounded-kd-sm bg-kd-card-muted">
        {video.thumbnailUri ? (
          <NativeImage source={{ uri: video.thumbnailUri }} className="h-full w-full" resizeMode="cover" />
        ) : (
          <View className="h-full w-full items-center justify-center">
            <Video size={17} color={theme.textSubtle} strokeWidth={1.8} />
          </View>
        )}
        {video.thumbnailUri ? <View className="absolute inset-0 bg-black/5" /> : null}
      </View>

      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-1.5">
          <Text className="text-kd-body font-black" style={{ color: SHOPEE_ORANGE }}>
            #{index + 1}
          </Text>
          <Text numberOfLines={1} className="min-w-0 flex-1 text-kd-body font-bold text-kd-text">
            {productLabel}
          </Text>
        </View>
        <Text numberOfLines={1} className="mt-0.5 text-kd-caption text-kd-text-subtle">
          {productMeta}
        </Text>
        <Text
          numberOfLines={1}
          className={`mt-0.5 text-kd-caption ${hasProductUrl ? '' : hasProductInfo ? 'text-kd-text-subtle' : hasFile ? 'text-kd-amber' : 'text-kd-amber'}`}
          style={hasProductUrl ? { color: SHOPEE_ORANGE } : undefined}
        >
          {hasFile ? productStatus : 'ไฟล์ไม่พร้อม'}
        </Text>
      </View>

      <Pressable
        accessibilityLabel="เอาออกจากคิว"
        accessibilityRole="button"
        onPress={onRemove}
        className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
      >
        <X size={19} color={theme.textMuted} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

function SubTab({
  active,
  color,
  icon: Icon,
  label,
  theme,
  onPress,
}: {
  active: boolean;
  color: string;
  icon: typeof Video;
  label: string;
  theme: KubdeeTheme;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className="-mb-px flex-1 flex-row items-center justify-center gap-1.5 border-b-2 py-2.5"
      // Dynamic prop-driven accent color — className cannot express it.
      style={{ borderBottomColor: active ? color : 'transparent' }}
    >
      <Icon size={14} color={active ? color : theme.textSubtle} strokeWidth={2.2} />
      <Text className="text-kd-body font-extrabold" style={{ color: active ? color : theme.textSubtle }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SettingsRow({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: KubdeeTheme;
}): React.JSX.Element {
  return (
    <View className="flex-row gap-2.5 rounded-kd-md border border-kd-border bg-kd-card p-2.5">
      <Text className="min-w-[104px] text-kd-micro font-extrabold text-kd-text-subtle">{label}</Text>
      <Text className="flex-1 text-kd-body font-bold text-kd-text" numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

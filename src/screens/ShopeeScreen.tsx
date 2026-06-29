import { ActivityIndicator, Alert, Image as NativeImage, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { CheckCircle2, FolderOpen, Link, Send, Settings, Video, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner-native';

import {
  beginAutomationActivityRun,
  pushAutomationActivityLog,
  setAutomationActivityRunning,
  setAutomationActivityStopping,
} from '@/activity/automationActivityLogStore';
import { useGeneratedMedia } from '@/autopilot/generatedMediaStore';
import type { GeneratedMediaAsset } from '@/autopilot/generatedMediaStore';
import ActivityLogCard from '@/components/ui/ActivityLogCard';
import Text from '@/components/ui/KubdeeText';
import SectionHeader from '@/components/ui/SectionHeader';
import StatusPill from '@/components/ui/StatusPill';
import {
  getAccessibilityStatus,
  openAccessibilitySettings,
  postShopeeVideos,
  requestAndroidVideoPermission,
  stopShopeeAutomation,
  subscribeShopeePostLogs,
} from '@/native/AccessibilityBridge';
import type { NativeShopeePostLog } from '@/native/AccessibilityBridge';
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

  const appendPostLog = useCallback((message: string, ts = Date.now()): void => {
    setPostLogs((current) => [...current, { message, ts }].slice(-100));
    setPostMessage(message);
    pushAutomationActivityLog('shopee-post', message, ts);
  }, []);

  useEffect(() => {
    const subscription = subscribeShopeePostLogs((entry) => {
      setPostLogs((current) => [...current, entry].slice(-100));
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

    const missingProductUrlCount = postQueueVideos.filter((video) => !video.productUrl).length;
    if (missingProductUrlCount > 0) {
      toast.warning(`ไม่มีลิงก์สินค้า ${missingProductUrlCount} รายการ จะค้นหาด้วยชื่อสินค้าแทน`);
    }

    if (isPosting) {
      return;
    }

    try {
      const status = await getAccessibilityStatus();
      if (!status.running) {
        setPostMessage('กรุณาเปิด Kubdee AI ใน Accessibility ก่อน');
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
        toast.warning('ต้องอนุญาตอ่านวิดีโอเพื่อโพสต์ Shopee');
        setPostMessage('ต้องอนุญาตอ่านวิดีโอเพื่อโพสต์ Shopee');
        return;
      }

      setIsPosting(true);
      setIsStoppingPost(false);
      setPostLogs([]);
      beginAutomationActivityRun('shopee-post');
      appendPostLog(`เริ่มโพสต์ Shopee ${postQueueVideos.length} วิดีโอ`);

      const result = await postShopeeVideos(
        postQueueVideos.map((video) => ({
          fileUri: video.fileUri || '',
          productName: video.productName,
          productId: video.productCode,
          productUrl: video.productUrl,
          caption: video.caption,
          hashtags: video.hashtags,
          galleryVideoId: video.id,
          platform: video.platform || 'shopee',
        }))
      );

      if (result.stopped) {
        const message = `หยุดโพสต์ Shopee แล้ว (${result.postedCount || 0}/${postQueueVideos.length})`;
        appendPostLog(message);
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
      toast.success(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendPostLog(message);
      toast.error(message);
    } finally {
      setIsPosting(false);
      setIsStoppingPost(false);
      setAutomationActivityRunning('shopee-post', false);
    }
  }, [appendPostLog, isPosting, postQueueVideos]);

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
          color={theme.orange}
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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-2 p-2 pb-[18px]">
        {subMode === 'post' ? (
          <View className="gap-2">
            <View className="flex-row items-center gap-2.5 rounded-kd-lg border border-kd-orange bg-kd-orange-soft p-3">
              <Send size={22} color={theme.orange} strokeWidth={2.2} />
              <View className="min-w-0 flex-1">
                <Text className="text-kd-label font-black text-kd-text">Shopee Post Queue</Text>
                <Text className="mt-0.5 text-kd-caption leading-[15px] text-kd-text-subtle" numberOfLines={2}>
                  รายการวิดีโอจากคลังที่เตรียมโพสต์ลง Shopee
                </Text>
              </View>
              <StatusPill
                backgroundColor={theme.orangeSoft}
                color={theme.orange}
                icon={Video}
                label={`${postQueueVideos.length} วิดีโอ`}
              />
            </View>

            <View className="flex-row gap-2">
              <SummaryTile label="ในคิว" value={`${postQueueVideos.length}`} theme={theme} />
              <SummaryTile label="พร้อมโพสต์" value={`${readyPostVideoCount}`} theme={theme} />
            </View>

            <View className="flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                disabled={
                  postQueueVideos.length === 0 ||
                  readyPostVideoCount !== postQueueVideos.length ||
                  isPosting ||
                  !selectedProfileId
                }
                onPress={() => {
                  void handlePostShopeeVideos();
                }}
                className="h-[38px] flex-1 flex-row items-center justify-center gap-1.5 rounded-kd-md bg-kd-orange active:opacity-70 disabled:opacity-60"
              >
                {isPosting ? (
                  <ActivityIndicator color={theme.white} size="small" />
                ) : (
                  <Send size={14} color={theme.white} strokeWidth={2.2} />
                )}
                <Text className="text-kd-body font-black text-white">
                  {isPosting ? 'กำลังโพส Shopee' : `โพส Shopee ${postQueueVideos.length} คลิป`}
                </Text>
              </Pressable>
            </View>
            <Text className="text-center text-kd-caption font-bold leading-4 text-kd-text-subtle">{postMessage}</Text>

            <ActivityLogCard
              icon={Send}
              theme={theme}
              logs={postLogs}
              running={isPosting}
              stopping={isStoppingPost}
              runningText="กำลังโพสต์ Shopee"
              onStop={() => {
                void handleStopPost();
              }}
            />

            <View className="gap-1.5">
              <View className="flex-row items-center justify-between gap-2">
                <SectionHeader icon={Video} theme={theme} title="รายการเตรียมโพสต์" />
                {postQueueVideos.length > 0 ? (
                  <View className="flex-row items-center gap-3">
                    {onOpenVideoLibrary ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={onOpenVideoLibrary}
                        className="h-7 justify-center rounded-kd-md active:opacity-70"
                      >
                        <Text className="text-kd-caption font-bold text-kd-orange">เพิ่มวิดีโอ</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={onClearPendingVideos}
                      className="h-7 justify-center rounded-kd-md active:opacity-70"
                    >
                      <Text className="text-kd-caption font-bold text-kd-red">ล้างทั้งหมด</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              {postQueueVideos.length > 0 ? (
                postQueueVideos.map((video, index) => (
                  <PostVideoCard
                    key={video.id}
                    index={index}
                    theme={theme}
                    video={video}
                    onRemove={() => onRemovePendingVideo?.(video.id)}
                  />
                ))
              ) : (
                <View className="items-center rounded-kd-md border border-kd-border bg-kd-card p-5">
                  <Video size={24} color={theme.textSubtle} strokeWidth={1.8} />
                  <Text className="mt-2 text-kd-body font-black text-kd-text">ยังไม่มีวิดีโอในคิว</Text>
                  <Text className="mt-1 text-center text-kd-caption leading-4 text-kd-text-subtle">
                    เลือกวิดีโอจากคลัง แล้วกดปุ่ม Shopee เพื่อส่งมาเตรียมโพสต์
                  </Text>
                  {onOpenVideoLibrary ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={onOpenVideoLibrary}
                      className="mt-3 h-9 flex-row items-center justify-center gap-1.5 rounded-kd-md bg-kd-orange px-3 active:opacity-75"
                    >
                      <FolderOpen size={14} color={theme.white} strokeWidth={2.2} />
                      <Text className="text-kd-body font-black text-white">ไปคลังวิดีโอ</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
              {missingQueuedVideoCount > 0 ? (
                <Text className="text-center text-kd-caption text-kd-text-subtle">
                  มีรายการที่หาไม่พบในคลัง {missingQueuedVideoCount} วิดีโอ
                </Text>
              ) : null}
            </View>

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
    </KeyboardAvoidingView>
  );
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
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

function PostVideoCard({
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
  const hasCaption = Boolean(video.caption);
  const hasHashtags = Boolean(video.hashtags);
  const ready = hasFile;

  return (
    <View className="rounded-kd-md border border-kd-border bg-kd-card p-2.5">
      <View className="flex-row items-start gap-2.5">
        <View
          className="h-16 w-12 shrink-0 overflow-hidden rounded-kd-md bg-kd-card-muted"
        >
          {video.thumbnailUri ? (
            <NativeImage source={{ uri: video.thumbnailUri }} className="h-full w-full" resizeMode="cover" />
          ) : (
            <View className="h-full w-full items-center justify-center">
              <Video size={17} color={theme.textSubtle} strokeWidth={1.8} />
            </View>
          )}
          <View className="absolute inset-0 items-center justify-center bg-black/15">
            <View className="h-6 w-6 items-center justify-center rounded-full bg-black/45">
              <Video size={12} color={theme.white} strokeWidth={2.2} />
            </View>
          </View>
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-start gap-2">
            <View className="min-w-0 flex-1">
              <Text className="text-kd-micro font-black text-kd-orange">#{index + 1}</Text>
              <Text numberOfLines={1} className="text-kd-body font-black text-kd-text">
                {video.productName}
              </Text>
              <Text numberOfLines={1} className="mt-0.5 text-kd-micro text-kd-text-subtle">
                #{video.productCode} · {formatTime(video.createdAt)}
              </Text>
            </View>
            <StatusPill
              backgroundColor={ready ? theme.emeraldSoft : theme.amberSoft}
              color={ready ? theme.emerald : theme.amber}
              icon={ready ? CheckCircle2 : Link}
              label={ready ? 'READY' : 'CHECK'}
            />
            <Pressable
              accessibilityLabel="เอาออกจากคิว"
              accessibilityRole="button"
              onPress={onRemove}
              className="h-7 w-7 items-center justify-center rounded-full bg-kd-card-muted"
            >
              <X size={13} color={theme.textSubtle} strokeWidth={2.4} />
            </Pressable>
          </View>

          <View className="mt-2 flex-row flex-wrap gap-1">
            <PostMetaPill active={hasFile} label="ไฟล์" theme={theme} />
            <PostMetaPill active={hasProductUrl} label="ลิงก์สินค้า" theme={theme} />
            <PostMetaPill active={hasCaption} label="Caption" theme={theme} />
            <PostMetaPill active={hasHashtags} label="Hashtag" theme={theme} />
          </View>

          {video.productUrl ? (
            <Text numberOfLines={1} className="mt-1.5 text-kd-micro text-kd-text-subtle">
              {video.productUrl}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function PostMetaPill({
  active,
  label,
  theme,
}: {
  active: boolean;
  label: string;
  theme: KubdeeTheme;
}): React.JSX.Element {
  return (
    <View
      className="rounded-kd-sm px-1.5 py-0.5"
      style={{ backgroundColor: active ? theme.emeraldSoft : theme.cardMuted }}
    >
      <Text
        className="text-[9px] font-bold"
        style={{ color: active ? theme.emerald : theme.textMuted }}
      >
        {label}
      </Text>
    </View>
  );
}

function SummaryTile({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: KubdeeTheme;
}): React.JSX.Element {
  return (
    <View className="min-h-[58px] flex-1 justify-center rounded-kd-md border border-kd-border bg-kd-card px-2.5 py-2">
      <Text className="text-kd-micro font-extrabold text-kd-text-subtle">{label}</Text>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.72}
        numberOfLines={1}
        className="mt-0.5 text-kd-body font-black text-kd-text"
      >
        {value}
      </Text>
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

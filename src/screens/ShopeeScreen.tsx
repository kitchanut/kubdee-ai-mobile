import { ActivityIndicator, Alert, Image as NativeImage, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FolderOpen, Send, Settings, SlidersHorizontal, Video, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { generateAutoPilotProductContent, getAutoPilotAiContentLabels } from '@/autopilot/aiCaption';
import { SHOPEE_POST_TIMEOUT_MS, withTimeout } from '@/autopilot/autoProductPosting';
import {
  DEFAULT_SHOPEE_AI_CONTENT_SETTINGS,
  getShopeeAiContentSettings,
  saveShopeeAiContentSettings,
} from '@/autopilot/shopeeAiContentSettingsStore';
import type { ShopeeAiContentSettings } from '@/autopilot/shopeeAiContentSettingsStore';
import { ExtensionToggleRow, HashtagCountSelector } from '@/screens/autopilot/blocks/SettingsBlocks';
import { ShopeeLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import {
  getAccessibilityStatus,
  launchTargetApp,
  openAccessibilitySettings,
  postShopeeVideos,
  requestAndroidVideoPermission,
  stopShopeeAutomation,
  subscribeShopeePostLogs,
} from '@/native/AccessibilityBridge';
import type { NativeShopeePostLog, NativeShopeePostingResult, NativeShopeePostingVideoInput } from '@/native/AccessibilityBridge';
import { SHOPEE_POST_SAFE_WORD_LIMIT, limitShopeePostTextParts } from '@/autopilot/shopeePostTextLimit';
import { isShopeeShortLink } from '@/library/shopeeLinks';
import { SHOPEE_ORANGE, SHOPEE_ORANGE_SOFT } from '@/theme/brandColors';
import { alpha } from '@/theme/tokens';
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [postLogs, setPostLogs] = useState<NativeShopeePostLog[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [isStoppingPost, setIsStoppingPost] = useState(false);
  const [aiContentSettings, setAiContentSettings] = useState<ShopeeAiContentSettings>(DEFAULT_SHOPEE_AI_CONTENT_SETTINGS);
  const { getAssetsByKind, updateGeneratedMediaAsset } = useGeneratedMedia();
  const insets = useSafeAreaInsets();
  const postLogScrollRef = useRef<ScrollView>(null);
  // native เคลียร์ stop-flag ของตัวเองใหม่ทุกครั้งที่เรียก postShopeeVideos (ต่อคลิป) — ใช้ ref นี้กันเอง
  // ฝั่ง JS แทน ไม่งั้นกด "หยุด" ระหว่างรอยต่อของคลิปจะโดนเคลียร์ทิ้งเงียบๆ แล้วคลิปถัดไปโพสต์ต่อ
  const stopRequestedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void getShopeeAiContentSettings().then((settings) => {
      if (!cancelled) {
        setAiContentSettings(settings);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateAiContentSetting = useCallback(
    <K extends keyof ShopeeAiContentSettings>(key: K, value: ShopeeAiContentSettings[K]): void => {
      setAiContentSettings((current) => {
        const next = { ...current, [key]: value };
        void saveShopeeAiContentSettings(next);
        return next;
      });
    },
    []
  );

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
    pushAutomationActivityLog('shopee-post', message, ts);
  }, []);

  useEffect(() => {
    const subscription = subscribeShopeePostLogs((entry) => {
      setPostLogs((current) => [...current, entry].slice(-MAX_AUTOMATION_LOGS_PER_RUN));
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
      setPostLogs([{ message, ts: Date.now() }]);
      toast.warning(message);
      return;
    }

    if (isPosting) {
      return;
    }

    // ช่องค้นหาสินค้าของ Shopee หาเจอเฉพาะ short link — ลิงก์เต็มถือว่าใช้ค้นหาไม่ได้
    const videosWithoutProductUrl = postQueueVideos.filter((video) => !isShopeeShortLink(video.productUrl));
    const productNameFallbackCount = videosWithoutProductUrl.filter((video) => !!getPostPayloadProductName(video)).length;
    const missingProductInfoCount = videosWithoutProductUrl.length - productNameFallbackCount;

    setIsPosting(true);
    setIsStoppingPost(false);
    setPostLogs([]);
    stopRequestedRef.current = false;
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

      // เปิดแอป Shopee ทันที (แค่ launch เฉยๆ ยังไม่ automation) ให้รู้สึกว่าเริ่มทำงานทันที
      // ไม่ต้องรอ AI คิด caption เสร็จก่อน — ตอนคลิปแรกพร้อม native จะ reset+navigate เข้า flow จริงอีกที
      appendPostLog('เปิดแอป Shopee...');
      launchTargetApp('com.shopee.th').catch(() => {});

      const shouldGenerateAiContent = aiContentSettings.aiGenerateCaption || aiContentSettings.aiGenerateHashtags;
      const aiSettings = {
        aiGenerateCaption: aiContentSettings.aiGenerateCaption,
        aiGenerateHashtags: aiContentSettings.aiGenerateHashtags,
        aiGenerateCta: false,
        aiHashtagCount: aiContentSettings.aiHashtagCount,
      };
      const generateClipAiContent = async (
        video: GeneratedMediaAsset,
        index: number
      ): Promise<Partial<Pick<GeneratedMediaAsset, 'caption' | 'hashtags'>>> => {
        if (!shouldGenerateAiContent) {
          return {};
        }

        // ปิด "เขียนทับของเดิม" อยู่ → คิดเฉพาะ field ที่คลิปนี้ยังว่างเท่านั้น กันเขียนทับ
        // caption/hashtags ที่ผู้ใช้ตั้งใจแก้เองไว้แล้ว
        const needsCaption = aiContentSettings.aiGenerateCaption
          && (aiContentSettings.aiOverwriteExisting || !video.caption?.trim());
        const needsHashtags = aiContentSettings.aiGenerateHashtags
          && (aiContentSettings.aiOverwriteExisting || !video.hashtags?.trim());
        if (!needsCaption && !needsHashtags) {
          return {};
        }

        const clipAiSettings = { ...aiSettings, aiGenerateCaption: needsCaption, aiGenerateHashtags: needsHashtags };
        const clipAiContentLabels = getAutoPilotAiContentLabels(clipAiSettings);

        const result = await generateAutoPilotProductContent({
          product: {
            name: getPostPayloadProductName(video) || getPostVideoFallbackLabel(video, index),
            description: '',
            productId: getPostPayloadProductCode(video) || '',
            productUrl: video.productUrl || '',
            caption: video.caption || '',
            hashtags: video.hashtags || '',
            cta: video.cta || '',
          },
          settings: clipAiSettings,
        });

        if (stopRequestedRef.current) {
          // ผู้ใช้กดหยุดระหว่าง AI กำลังคิดคลิปนี้ล่วงหน้า — คลิปนี้จะไม่ได้โพสต์รอบนี้แล้ว
          // อย่าเขียนทับ caption/hashtags เดิมของมันด้วยผลจาก AI ที่คิดไปแล้วเสียเปล่า
          return {};
        }

        if (!result.success) {
          appendPostLog(
            `AI ${clipAiContentLabels} ไม่สำเร็จ (${getPostVideoFallbackLabel(video, index)}): ${result.error || 'unknown'} — ใช้ค่าเดิม`
          );
          return {};
        }

        const patch: Partial<Pick<GeneratedMediaAsset, 'caption' | 'hashtags'>> = {};
        if (needsCaption && result.caption) {
          patch.caption = result.caption;
        }
        if (needsHashtags && result.hashtags) {
          patch.hashtags = result.hashtags;
        }
        if (Object.keys(patch).length > 0) {
          void updateGeneratedMediaAsset(video.id, patch);
        }
        return patch;
      };

      const total = postQueueVideos.length;
      let successCount = 0;
      let failedCount = 0;
      let stoppedEarly = false;
      let abortedOnError = false;
      // คิด caption ของคลิปแรกทันที ให้ overlap กับตอนแอป Shopee กำลังเปิดด้านบน
      let nextAiContentPromise = generateClipAiContent(postQueueVideos[0], 0);

      for (let index = 0; index < total; index += 1) {
        // เช็คก่อนเริ่มคลิปใหม่ทุกครั้ง — native เคลียร์ stop-flag ของตัวเองใหม่ทุกครั้งที่เรียก
        // postShopeeVideos ต่อคลิป เลยต้องกันเองฝั่ง JS ไม่งั้นคลิปถัดไปจะโพสต์ต่อทั้งที่กดหยุดแล้ว
        if (stopRequestedRef.current) {
          stoppedEarly = true;
          appendPostLog(`หยุดโพสต์ Shopee แล้ว (${successCount}/${total})`);
          break;
        }

        const video = postQueueVideos[index];
        appendPostLog(`กำลังทำคลิปที่ ${index + 1}/${total}: ${getPostVideoFallbackLabel(video, index)}`);

        const aiPatch = await nextAiContentPromise;
        const effectiveVideo = { ...video, ...aiPatch };

        // คิด caption คลิปถัดไปตอนนี้เลย ให้ทำงานคู่ขนานกับตอนคลิปนี้กำลังโพสต์ผ่าน native automation
        // (ไม่คิดต่อถ้ากดหยุดแล้ว กันคิด caption เสียเปล่าเพิ่มสำหรับคลิปที่ไม่มีทางได้โพสต์รอบนี้)
        const nextVideo = postQueueVideos[index + 1];
        nextAiContentPromise = nextVideo && !stopRequestedRef.current
          ? generateClipAiContent(nextVideo, index + 1)
          : Promise.resolve({});

        const productName = getPostPayloadProductName(effectiveVideo);
        const productCode = getPostPayloadProductCode(effectiveVideo);
        const limitedText = limitShopeePostTextParts({
          caption: effectiveVideo.caption,
          cta: effectiveVideo.cta,
          fallbackCaption: productName,
          hashtags: effectiveVideo.hashtags,
        });
        if (limitedText.wasLimited) {
          appendPostLog(`ปรับแคปชั่น/แฮชแท็กคลิปที่ ${index + 1} ให้อยู่ไม่เกิน ${SHOPEE_POST_SAFE_WORD_LIMIT} คำ`);
        }

        const payload: NativeShopeePostingVideoInput = {
          fileUri: effectiveVideo.fileUri || '',
          productName,
          productId: productCode,
          productUrl: isShopeeShortLink(effectiveVideo.productUrl) ? effectiveVideo.productUrl : null,
          caption: limitedText.caption || null,
          hashtags: limitedText.hashtags || null,
          cta: limitedText.cta || null,
          galleryVideoId: effectiveVideo.id,
          platform: effectiveVideo.platform || 'shopee',
        };

        let result: NativeShopeePostingResult;
        try {
          // skipReturnNavigation ทุกคลิปยกเว้นคลิปสุดท้าย — จะได้ค้างอยู่ใน Shopee ต่อเนื่องไม่กระโดดกลับแอปเรากลางคัน
          // withTimeout กัน native broadcast หายเงียบๆ (เกิดได้ง่ายขึ้นเพราะสลับ background/foreground ทุกคลิปแล้ว)
          result = await withTimeout(
            postShopeeVideos([payload], { skipReturnNavigation: index < total - 1 }),
            SHOPEE_POST_TIMEOUT_MS,
            `คลิปที่ ${index + 1} หมดเวลา (native ไม่ตอบสนอง)`
          );
        } catch (error) {
          failedCount += 1;
          const message = error instanceof Error ? error.message : String(error);
          appendPostLog(`คลิปที่ ${index + 1} ล้มเหลว: ${message} — หยุดที่เหลือเพราะน่าจะเป็นปัญหาระบบ`);
          // error ที่ throw ออกมา (ไม่ใช่แค่ result.success===false ต่อคลิป) มักเป็นปัญหาระบบ
          // (bridge/accessibility service พัง) ลองต่อคลิปที่เหลือไปก็รอเสียเวลาแล้วพังซ้ำเหมือนกัน
          abortedOnError = true;
          break;
        }

        if (result.stopped) {
          stoppedEarly = true;
          appendPostLog(`หยุดโพสต์ Shopee แล้ว (${successCount}/${total})`);
          break;
        }

        if (result.success) {
          successCount += 1;
          onRemovePendingVideo?.(video.id);
        } else {
          failedCount += 1;
          appendPostLog(`คลิปที่ ${index + 1} ล้มเหลว: ${result.error || 'unknown'}`);
        }
      }

      if (stoppedEarly) {
        toast.warning(`หยุดโพสต์ Shopee แล้ว (${successCount}/${total})`);
      } else if (abortedOnError) {
        const message = `โพสต์ Shopee หยุดกลางทาง สำเร็จ ${successCount}/${total} วิดีโอ (เหลือ ${total - successCount - failedCount} วิดีโอที่ยังไม่ได้ลอง)`;
        appendPostLog(message);
        toast.error(message);
      } else if (successCount === total) {
        const message = `โพสต์ Shopee สำเร็จ ${successCount}/${total} วิดีโอ`;
        appendPostLog(message);
        toast.success(message);
      } else if (successCount > 0) {
        const message = `โพสต์ Shopee สำเร็จ ${successCount}/${total} วิดีโอ (ล้มเหลว ${failedCount})`;
        appendPostLog(message);
        toast.warning(message);
      } else {
        const message = 'โพสต์ Shopee ไม่สำเร็จทั้งหมด';
        appendPostLog(message);
        toast.error(message);
      }
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
  }, [aiContentSettings, appendPostLog, isPosting, onRemovePendingVideo, postQueueVideos, updateGeneratedMediaAsset]);

  const handleStopPost = useCallback(async (): Promise<void> => {
    if (!isPosting || isStoppingPost) {
      return;
    }

    // ตั้ง ref ทันทีก่อนอย่างอื่น กันคลิปถัดไปเริ่มระหว่างที่ยัง await native call อยู่
    stopRequestedRef.current = true;
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
      <View className="border-b border-kd-border bg-kd-screen px-3 py-2">
        <View className="flex-row items-center gap-2">
          <View
            className="h-8 w-8 items-center justify-center rounded-kd-lg"
            style={{ backgroundColor: alpha(SHOPEE_ORANGE, theme.isDark ? 0.16 : 0.1) }}
          >
            <ShopeeLogo size={17} color={SHOPEE_ORANGE} cutoutColor={theme.isDark ? theme.card : '#ffffff'} />
          </View>
          <View className="min-w-0 flex-1">
            <Text numberOfLines={1} className="text-kd-label font-semibold text-kd-text">
              Shopee
            </Text>
            <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
              โพสต์วิดีโอผ่าน Shopee
            </Text>
          </View>
          <Pressable
            accessibilityLabel="ตั้งค่า Shopee"
            accessibilityRole="button"
            onPress={() => setIsSettingsOpen(true)}
            className="h-8 w-8 items-center justify-center rounded-kd-lg bg-kd-panel-muted active:opacity-70 dark:bg-kd-card-muted"
          >
            <SlidersHorizontal size={15} color={theme.textMuted} strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>

      <View className="flex-1">
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerClassName={postQueueVideos.length > 0 || isPosting ? 'pb-[104px]' : 'pb-[18px]'}
        >
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
                      <Text className="text-kd-caption font-semibold" style={{ color: SHOPEE_ORANGE }}>
                        เพิ่มวิดีโอ
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={onClearPendingVideos}
                    className="h-7 justify-center active:opacity-70"
                  >
                    <Text className="text-kd-caption font-semibold text-kd-red">ล้างทั้งหมด</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* โชว์ log แบบ scroll เฉพาะตอนมีความคืบหน้าจริง — ให้เห็นทุกขั้นตอน (รวม AI คิด caption/hashtags) ไม่ใช่แค่บรรทัดล่าสุด */}
            {postQueueVideos.length > 0 && postLogs.length > 0 ? (
              <ScrollView
                ref={postLogScrollRef}
                onContentSizeChange={() => postLogScrollRef.current?.scrollToEnd({ animated: true })}
                showsVerticalScrollIndicator={false}
                className="max-h-[92px] border-b border-kd-border"
                contentContainerClassName="gap-1 px-3 py-1.5"
              >
                {postLogs.map((log, index) => (
                  <Text
                    key={`${log.ts}-${index}`}
                    numberOfLines={1}
                    className="text-kd-micro text-kd-text-subtle"
                  >
                    {log.message}
                  </Text>
                ))}
              </ScrollView>
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
                <Text className="mt-2 text-kd-subtitle font-semibold text-kd-text">ยังไม่มีวิดีโอในคิว</Text>
                <Text className="mt-1 text-center text-kd-caption leading-4 text-kd-text-subtle">
                  เลือกวิดีโอจากคลัง แล้วกดปุ่ม Shopee เพื่อส่งมาเตรียมโพสต์
                </Text>
                {onOpenVideoLibrary ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={onOpenVideoLibrary}
                    className="mt-3 h-9 flex-row items-center justify-center gap-1.5 rounded-kd-lg px-3 active:opacity-75"
                    style={{ backgroundColor: SHOPEE_ORANGE }}
                  >
                    <FolderOpen size={14} color={theme.white} strokeWidth={2.2} />
                    <Text className="text-kd-body font-semibold text-white">ไปคลังวิดีโอ</Text>
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
        </ScrollView>

        {/* คิวว่างซ่อนปุ่มโพส (empty state มีปุ่มไปคลังวิดีโอนำทางแล้ว) — ตอนกำลังโพสคงปุ่มหยุดไว้ */}
        {postQueueVideos.length > 0 || isPosting ? (
          <View className="absolute bottom-0 left-0 right-0 bg-kd-screen px-4 pb-3 pt-3">
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
                <Text className="text-kd-subtitle font-semibold text-white">
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
                <Text className="text-kd-subtitle font-semibold text-white">
                  {`โพส Shopee ${postQueueVideos.length} คลิป`}
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}
      </View>

      {isSettingsOpen ? (
        <Modal animationType="fade" onRequestClose={() => setIsSettingsOpen(false)} transparent visible>
          {/* backdrop อยู่ใน Modal ได้แล้ว (ก่อนหน้านี้แยกไว้นอก Modal เพราะ animationType="slide" จะลาก
              backdrop ขึ้นมาพร้อม sheet — ตอนนี้เปลี่ยนเป็น "fade" แล้วไม่มีปัญหานั้น และ Modal เป็น native
              overlay เต็มจอเสมอ ต่างจาก View ธรรมดาที่ครอบได้แค่พื้นที่ของ ShopeeScreen เอง ไม่รวมแถบ tab/status bar */}
          <View
            className="flex-1 justify-center bg-black/60"
            style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
          >
            <View
              className="mx-3 overflow-hidden rounded-kd-2xl border border-kd-border bg-kd-panel"
              style={{ height: '95%' }}
            >
              <View className="flex-row items-center justify-between border-b border-kd-border bg-kd-card px-3 py-3">
                <View className="min-w-0 flex-1 flex-row items-center gap-2">
                  <View className="h-8 w-8 items-center justify-center rounded-kd-lg bg-kd-panel-muted dark:bg-kd-card-muted">
                    <Settings size={15} color={theme.textMuted} strokeWidth={2.1} />
                  </View>
                  <Text className="text-kd-label font-semibold text-kd-text">ตั้งค่า Shopee</Text>
                </View>
                <Pressable
                  accessibilityLabel="ปิดตั้งค่า Shopee"
                  accessibilityRole="button"
                  onPress={() => setIsSettingsOpen(false)}
                  className="h-8 w-8 items-center justify-center rounded-kd-md bg-kd-panel-muted dark:bg-kd-card-muted"
                >
                  <X size={15} color={theme.textMuted} strokeWidth={2.3} />
                </Pressable>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-1.5 p-2.5">
                <ExtensionToggleRow
                  label="AI คิด Caption"
                  theme={theme}
                  value={aiContentSettings.aiGenerateCaption}
                  onValueChange={(value) => updateAiContentSetting('aiGenerateCaption', value)}
                />
                <ExtensionToggleRow
                  label="AI คิด Hashtags"
                  rightSlot={
                    aiContentSettings.aiGenerateHashtags ? (
                      <HashtagCountSelector
                        enabled={aiContentSettings.aiGenerateHashtags}
                        theme={theme}
                        value={aiContentSettings.aiHashtagCount}
                        onChange={(value) => updateAiContentSetting('aiHashtagCount', value)}
                      />
                    ) : null
                  }
                  theme={theme}
                  value={aiContentSettings.aiGenerateHashtags}
                  onValueChange={(value) => updateAiContentSetting('aiGenerateHashtags', value)}
                />
                {aiContentSettings.aiGenerateCaption || aiContentSettings.aiGenerateHashtags ? (
                  <>
                    <ExtensionToggleRow
                      label="เขียนทับของเดิม"
                      theme={theme}
                      value={aiContentSettings.aiOverwriteExisting}
                      onValueChange={(value) => updateAiContentSetting('aiOverwriteExisting', value)}
                    />
                    <Text className="text-kd-micro text-kd-text-subtle">
                      {aiContentSettings.aiOverwriteExisting
                        ? 'AI จะคิดใหม่ทับ caption/hashtags เดิมทุกคลิป (ใช้เครดิต KUBDEE AI)'
                        : 'AI จะคิดเฉพาะคลิปที่ยังไม่มี caption/hashtags เท่านั้น'}
                    </Text>
                  </>
                ) : null}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
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
  const hasPostableLink = isShopeeShortLink(video.productUrl);
  const productName = getPostPayloadProductName(video);
  const productCode = getPostPayloadProductCode(video);
  const productLabel = productName || getPostVideoFallbackLabel(video, index);
  const hasProductInfo = hasProductUrl || Boolean(productName || productCode);
  const productMeta = productCode ? `#${productCode}` : productName ? 'มีชื่อสินค้า แต่ยังไม่มีรหัส' : 'ยังไม่ได้ผูกสินค้า';
  const productStatus = hasPostableLink
    ? 'มีลิงก์สินค้า'
    : hasProductUrl
      ? 'ลิงก์แบบเต็มใช้ค้นหาไม่ได้ จะค้นหาด้วยชื่อสินค้า'
      : hasProductInfo
        ? 'ไม่มีลิงก์สินค้า จะค้นหาด้วยชื่อสินค้า'
        : 'ไม่มีข้อมูลสินค้า';

  return (
    <View className="flex-row items-center gap-2.5 bg-kd-screen px-3 py-2.5">
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
          <Text className="text-kd-caption font-semibold" style={{ color: SHOPEE_ORANGE }}>
            #{index + 1}
          </Text>
          <Text numberOfLines={1} className="min-w-0 flex-1 text-kd-body font-semibold text-kd-text">
            {productLabel}
          </Text>
        </View>
        <Text numberOfLines={1} className="mt-0.5 text-kd-caption text-kd-text-subtle">
          {productMeta}
        </Text>
        <Text
          numberOfLines={1}
          className={`mt-0.5 text-kd-caption ${
            hasPostableLink
              ? 'text-kd-emerald'
              : hasProductUrl
                ? 'text-kd-amber'
                : hasProductInfo
                  ? 'text-kd-text-subtle'
                  : 'text-kd-amber'
          }`}
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

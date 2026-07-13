import { ActivityIndicator, Image as NativeImage, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FolderOpen, Send, Settings, SlidersHorizontal, TriangleAlert, Video, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner-native';

import { generateAutoPilotProductContent } from '@/autopilot/aiCaption';
import {
  createFacebookBufferPost,
  createInstagramBufferPost,
  createYoutubeBufferPost,
  uploadBufferAsset,
} from '@/autopilot/bufferPosting';
import {
  buildBufferPostTextWithLink,
  buildYoutubeTitle,
  YOUTUBE_TITLE_MAX_LENGTH,
  type BufferPostTextSource,
} from '@/autopilot/bufferPostText';
import { useGeneratedMedia } from '@/autopilot/generatedMediaStore';
import type { GeneratedMediaAsset } from '@/autopilot/generatedMediaStore';
import {
  DEFAULT_SOCIAL_POST_AI_CONTENT_SETTINGS,
  getSocialPostAiContentSettings,
  saveSocialPostAiContentSettings,
} from '@/autopilot/socialPostAiContentSettingsStore';
import type { SocialPostAiContentSettings } from '@/autopilot/socialPostAiContentSettingsStore';
import { FacebookLogo, InstagramLogo, YouTubeLogo } from '@/components/BrandLogos';
import { PostContentChip, PostWarnChip, resolvePostCaptionState, resolvePostHashtagState } from '@/components/post/PostStatusChips';
import Text from '@/components/ui/KubdeeText';
import {
  FacebookPostingSettingsBlock,
  InstagramPostingSettingsBlock,
  YoutubePostingSettingsBlock,
} from '@/screens/autopilot/blocks/FacebookPostingSettingsBlock';
import { ExtensionToggleRow, HashtagCountSelector } from '@/screens/autopilot/blocks/SettingsBlocks';
import { FACEBOOK_BLUE, INSTAGRAM_PINK, YOUTUBE_RED } from '@/theme/brandColors';
import { alpha } from '@/theme/tokens';
import type { KubdeeTheme } from '@/theme/tokens';
import type { SocialService } from '@/types/navigation';

// ช่อง Buffer ที่เลือกไว้แชร์กันทุกแพลตฟอร์ม (key/shape เดิมของ SocialPostModal
// ที่ถูกแทนที่ด้วยหน้านี้ — เก็บไว้เพื่อไม่ให้ผู้ใช้ต้องเลือกช่องใหม่)
const LIBRARY_SOCIAL_CHANNELS_KEY = 'kubdee_ai_mobile_library_social_channels_v1';

interface LibrarySocialChannels {
  facebookChannelId: string | null;
  instagramChannelId: string | null;
  youtubeChannelId: string | null;
}

const EMPTY_CHANNELS: LibrarySocialChannels = {
  facebookChannelId: null,
  instagramChannelId: null,
  youtubeChannelId: null,
};

const CHANNEL_KEYS: Record<SocialService, keyof LibrarySocialChannels> = {
  facebook: 'facebookChannelId',
  instagram: 'instagramChannelId',
  youtube: 'youtubeChannelId',
};

interface SocialServiceMeta {
  label: string;
  color: string;
  subtitle: string;
}

const SERVICE_META: Record<SocialService, SocialServiceMeta> = {
  facebook: { label: 'Facebook', color: FACEBOOK_BLUE, subtitle: 'โพสต์วิดีโอผ่าน Buffer' },
  instagram: { label: 'Instagram', color: INSTAGRAM_PINK, subtitle: 'โพสต์เป็น Reels ผ่าน Buffer' },
  youtube: { label: 'YouTube', color: YOUTUBE_RED, subtitle: 'โพสต์เป็น Shorts ผ่าน Buffer' },
};

function normalizeChannelId(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

async function loadStoredChannels(): Promise<LibrarySocialChannels> {
  try {
    const raw = await AsyncStorage.getItem(LIBRARY_SOCIAL_CHANNELS_KEY);
    if (!raw) {
      return { ...EMPTY_CHANNELS };
    }
    const parsed = JSON.parse(raw) as Partial<LibrarySocialChannels>;
    return {
      facebookChannelId: normalizeChannelId(parsed.facebookChannelId),
      instagramChannelId: normalizeChannelId(parsed.instagramChannelId),
      youtubeChannelId: normalizeChannelId(parsed.youtubeChannelId),
    };
  } catch {
    return { ...EMPTY_CHANNELS };
  }
}

async function saveStoredChannels(channels: LibrarySocialChannels): Promise<void> {
  try {
    await AsyncStorage.setItem(LIBRARY_SOCIAL_CHANNELS_KEY, JSON.stringify(channels));
  } catch {
    // จำ channel ล่าสุดไม่ได้ก็ไม่ควรขวางการโพสต์
  }
}

// mirror ของ isLocalPostableVideo ใน ShopeeScreen.tsx — โพสต์ได้เฉพาะวิดีโอ
// ที่มีไฟล์อยู่ในเครื่องจริง (content:// / file:// / absolute path)
function isLocalPostableVideo(asset: GeneratedMediaAsset): boolean {
  const fileUri = asset.fileUri?.trim();
  if (!fileUri) {
    return false;
  }

  return fileUri.startsWith('content://') || fileUri.startsWith('file://') || fileUri.startsWith('/');
}

// mirror ของ getPostPayloadProductName ใน ShopeeScreen.tsx — ชื่อสินค้า
// placeholder ('ไฟล์นำเข้า'/'สินค้า') แปลว่า "ไม่มีสินค้า" ต้องไม่หลุดไปในโพสต์
function isGenericProductLabel(value: string | null | undefined): boolean {
  const label = value?.trim();
  return !label || label === 'ไฟล์นำเข้า' || label === 'สินค้า';
}

function getPostProductName(asset: GeneratedMediaAsset): string | null {
  const productName = asset.productName?.trim();
  if (!productName || isGenericProductLabel(productName)) {
    return null;
  }

  return productName;
}

function getPostVideoFallbackLabel(asset: GeneratedMediaAsset, index: number): string {
  return asset.title?.trim() || asset.fileName?.trim() || `วิดีโอ ${index + 1}`;
}

interface AssetPostResult {
  ok: boolean;
  message: string;
}

interface SocialPostScreenProps {
  service: SocialService;
  pendingVideoIds: string[];
  selectedProfileId: string;
  theme: KubdeeTheme;
  onClearPendingVideos: () => void;
  onRemovePendingVideo: (videoId: string) => void;
  onOpenVideoLibrary: () => void;
}

export default function SocialPostScreen({
  service,
  pendingVideoIds,
  selectedProfileId,
  theme,
  onClearPendingVideos,
  onRemovePendingVideo,
  onOpenVideoLibrary,
}: SocialPostScreenProps): React.JSX.Element {
  const meta = SERVICE_META[service];
  const { getAssetsByKind, markPosted, updateGeneratedMediaAsset } = useGeneratedMedia();
  const insets = useSafeAreaInsets();
  const [channels, setChannels] = useState<LibrarySocialChannels>({ ...EMPTY_CHANNELS });
  const [isPosting, setIsPosting] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [stopRequested, setStopRequested] = useState(false);
  const [assetResults, setAssetResults] = useState<Record<string, AssetPostResult>>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [aiContentSettings, setAiContentSettings] = useState<SocialPostAiContentSettings>(DEFAULT_SOCIAL_POST_AI_CONTENT_SETTINGS);
  const stopRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadStoredChannels().then((stored) => {
      if (!cancelled) {
        setChannels(stored);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getSocialPostAiContentSettings().then((settings) => {
      if (!cancelled) {
        setAiContentSettings(settings);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateChannels = useCallback((patch: Partial<LibrarySocialChannels>): void => {
    setChannels((current) => {
      const next = { ...current, ...patch };
      void saveStoredChannels(next);
      return next;
    });
  }, []);

  const updateAiContentSetting = useCallback(
    <K extends keyof SocialPostAiContentSettings>(key: K, value: SocialPostAiContentSettings[K]): void => {
      setAiContentSettings((current) => {
        const next = { ...current, [key]: value };
        void saveSocialPostAiContentSettings(next);
        return next;
      });
    },
    []
  );

  const channelId = channels[CHANNEL_KEYS[service]];

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
  // โพสต์ได้เฉพาะคลิปที่มีไฟล์ในเครื่อง — คลิปไม่มีไฟล์จะถูกข้าม (แต่ยังโชว์ในลิสต์)
  const postableVideos = useMemo(() => postQueueVideos.filter(isLocalPostableVideo), [postQueueVideos]);
  const blockedCount = postQueueVideos.length - postableVideos.length;
  const missingQueuedVideoCount = pendingVideoIds.length - postQueueVideos.length;
  const canPost = postableVideos.length > 0 && !isPosting && !!channelId;

  const requestStop = useCallback((): void => {
    stopRef.current = true;
    setStopRequested(true);
  }, []);

  const recordResult = useCallback((assetId: string, result: AssetPostResult): void => {
    setAssetResults((current) => ({ ...current, [assetId]: result }));
  }, []);

  const startPosting = useCallback(async (): Promise<void> => {
    if (postQueueVideos.length === 0) {
      toast.warning(`เลือกวิดีโอก่อนโพสต์ ${meta.label}`);
      return;
    }

    if (!channelId) {
      toast.warning(`เลือกช่อง ${meta.label} ที่จะโพสต์ก่อน`);
      return;
    }

    if (isPosting) {
      return;
    }

    // snapshot ตอนกดโพสต์ — เปลี่ยน channel/คิวระหว่างโพสต์ไม่มีผลกับรอบนี้
    const serviceChannelId = channelId;
    const assets = postQueueVideos;

    setIsPosting(true);
    setStopRequested(false);
    stopRef.current = false;
    setAssetResults({});

    const postedIds: string[] = [];
    let failureCount = 0;
    let stoppedEarly = false;

    const shouldGenerateAiContent = aiContentSettings.aiGenerateCaption || aiContentSettings.aiGenerateHashtags;
    const aiSettings = {
      aiGenerateCaption: aiContentSettings.aiGenerateCaption,
      aiGenerateHashtags: aiContentSettings.aiGenerateHashtags,
      aiGenerateCta: false,
      aiHashtagCount: aiContentSettings.aiHashtagCount,
    };

    const generateAssetAiContent = async (
      asset: GeneratedMediaAsset,
      index: number
    ): Promise<Partial<Pick<GeneratedMediaAsset, 'caption' | 'hashtags'>>> => {
      if (!shouldGenerateAiContent) {
        return {};
      }

      // ปิด "เขียนทับของเดิม" อยู่ → คิดเฉพาะ field ที่คลิปนี้ยังว่างเท่านั้น
      const needsCaption = aiContentSettings.aiGenerateCaption
        && (aiContentSettings.aiOverwriteExisting || !asset.caption?.trim());
      const needsHashtags = aiContentSettings.aiGenerateHashtags
        && (aiContentSettings.aiOverwriteExisting || !asset.hashtags?.trim());
      if (!needsCaption && !needsHashtags) {
        return {};
      }

      const result = await generateAutoPilotProductContent({
        product: {
          name: getPostProductName(asset) || getPostVideoFallbackLabel(asset, index),
          description: '',
          productId: '',
          productUrl: asset.productUrl || '',
          caption: asset.caption || '',
          hashtags: asset.hashtags || '',
          cta: '',
        },
        settings: { ...aiSettings, aiGenerateCaption: needsCaption, aiGenerateHashtags: needsHashtags },
      });

      if (stopRef.current || !result.success) {
        // กดหยุดระหว่าง AI กำลังคิดคลิปนี้ล่วงหน้า หรือ AI พัง — ใช้ค่าเดิม ไม่เขียนทับ
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
        void updateGeneratedMediaAsset(asset.id, patch);
      }
      return patch;
    };

    // คิด caption ของคลิปแรกทันที ให้ overlap กับตอนคลิปแรกกำลังอัปโหลด/โพสต์
    let nextAiContentPromise = generateAssetAiContent(assets[0], 0);

    try {
      for (let index = 0; index < assets.length; index += 1) {
        // "หยุดหลังคลิปนี้" — เช็คก่อนเริ่มคลิปถัดไป คลิปที่กำลังโพสต์อยู่ทำจนจบ
        if (stopRef.current) {
          stoppedEarly = true;
          break;
        }

        const asset = assets[index];
        const label = getPostVideoFallbackLabel(asset, index);
        const position = `${index + 1}/${assets.length}`;

        const aiPatch = await nextAiContentPromise;
        const effectiveAsset = { ...asset, ...aiPatch };

        // คิด caption คลิปถัดไปตอนนี้เลย ให้ทำงานคู่ขนานกับตอนคลิปนี้กำลังอัปโหลด/โพสต์
        const nextAsset = assets[index + 1];
        nextAiContentPromise = nextAsset && !stopRef.current
          ? generateAssetAiContent(nextAsset, index + 1)
          : Promise.resolve({});

        if (!isLocalPostableVideo(effectiveAsset) || !effectiveAsset.fileUri) {
          failureCount += 1;
          recordResult(asset.id, { ok: false, message: 'ข้าม: ไม่พบไฟล์วิดีโอในเครื่อง' });
          continue;
        }

        setProgressText(`กำลังอัปโหลด ${position}: ${label}`);
        let assetUrl: string;
        try {
          assetUrl = await uploadBufferAsset(effectiveAsset.fileUri, effectiveAsset.mimeType || 'video/mp4');
        } catch (error) {
          failureCount += 1;
          recordResult(asset.id, {
            ok: false,
            message: `อัปโหลดไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
          });
          continue;
        }

        const source: BufferPostTextSource = {
          caption: effectiveAsset.caption,
          hashtags: effectiveAsset.hashtags,
          productUrl: effectiveAsset.productUrl,
          name: getPostProductName(effectiveAsset),
        };
        // ลิงก์สินค้าใส่ในตัวโพสต์เลย — พฤติกรรมเดียวกับ auto pilot ตอนนี้
        // (first comment ปิดอยู่เพราะ Buffer แพลนฟรีไม่รับ first comment)
        const text = buildBufferPostTextWithLink(source);

        setProgressText(`โพสต์ ${meta.label} ${position}: ${label}`);
        try {
          if (service === 'facebook') {
            await createFacebookBufferPost({ channelId: serviceChannelId, text, assetUrl, assetType: 'video' });
          } else if (service === 'instagram') {
            await createInstagramBufferPost({ channelId: serviceChannelId, text, assetUrl });
          } else {
            // ไม่มีชื่อสินค้า/แคปชัน → ใช้ชื่อรายการในคลังแทน fallback กลางๆ
            const hasContentTitle = !!(source.name?.trim() || source.caption?.trim());
            const title = hasContentTitle
              ? buildYoutubeTitle(source)
              : (effectiveAsset.title?.trim() || 'วิดีโอสินค้า').slice(0, YOUTUBE_TITLE_MAX_LENGTH);
            await createYoutubeBufferPost({ channelId: serviceChannelId, text, assetUrl, title });
          }
          postedIds.push(asset.id);
          void markPosted(asset.id, service);
          recordResult(asset.id, { ok: true, message: 'โพสต์สำเร็จ' });
        } catch (error) {
          failureCount += 1;
          recordResult(asset.id, {
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      setIsPosting(false);
      setStopRequested(false);
      setProgressText(null);
    }

    const stopSuffix = stoppedEarly ? ' · หยุดก่อนครบคิว' : '';
    if (postedIds.length > 0 && failureCount === 0) {
      toast.success(`โพสต์ ${meta.label} สำเร็จ ${postedIds.length}/${assets.length} คลิป${stopSuffix}`);
    } else if (postedIds.length > 0) {
      toast.warning(
        `โพสต์ ${meta.label} สำเร็จ ${postedIds.length}/${assets.length} คลิป · ล้มเหลว ${failureCount}${stopSuffix}`
      );
    } else {
      toast.error(`โพสต์ ${meta.label} ไม่สำเร็จ${stopSuffix}`);
    }

    // เอาคลิปที่โพสต์สำเร็จออกจากคิว (แนวเดียวกับ removePostedVideosFromQueue
    // ของ ShopeeScreen) — คลิปที่พลาดคงอยู่ให้เห็นเหตุผล/ลองใหม่
    if (postedIds.length >= assets.length && postedIds.length > 0) {
      onClearPendingVideos();
    } else {
      postedIds.forEach((videoId) => onRemovePendingVideo(videoId));
    }
  }, [
    aiContentSettings,
    channelId,
    isPosting,
    meta.label,
    markPosted,
    onClearPendingVideos,
    onRemovePendingVideo,
    postQueueVideos,
    recordResult,
    service,
    updateGeneratedMediaAsset,
  ]);

  const renderChannelPicker = (): React.JSX.Element => {
    if (service === 'facebook') {
      return (
        <FacebookPostingSettingsBlock
          facebookChannelId={channels.facebookChannelId}
          theme={theme}
          onSelectChannel={(nextChannelId) => updateChannels({ facebookChannelId: nextChannelId })}
          onClearChannel={() => updateChannels({ facebookChannelId: null })}
        />
      );
    }

    if (service === 'instagram') {
      return (
        <InstagramPostingSettingsBlock
          instagramChannelId={channels.instagramChannelId}
          theme={theme}
          onSelectChannel={(nextChannelId) => updateChannels({ instagramChannelId: nextChannelId })}
          onClearChannel={() => updateChannels({ instagramChannelId: null })}
        />
      );
    }

    return (
      <YoutubePostingSettingsBlock
        youtubeChannelId={channels.youtubeChannelId}
        theme={theme}
        onSelectChannel={(nextChannelId) => updateChannels({ youtubeChannelId: nextChannelId })}
        onClearChannel={() => updateChannels({ youtubeChannelId: null })}
      />
    );
  };

  const renderServiceLogo = (size: number): React.JSX.Element => {
    if (service === 'facebook') {
      return <FacebookLogo size={size} color={meta.color} cutoutColor="#ffffff" />;
    }
    if (service === 'instagram') {
      return <InstagramLogo size={size} color={meta.color} />;
    }
    return <YouTubeLogo size={size} color={meta.color} cutoutColor="#ffffff" />;
  };

  return (
    <View className="flex-1">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName={
          postQueueVideos.length > 0 || isPosting ? 'pb-[104px]' : 'pb-[18px]'
        }
      >
        <View className="min-h-full bg-kd-screen">
          <View
            className={`gap-1.5 px-3 py-2 ${postQueueVideos.length > 0 ? 'border-b border-kd-border' : ''}`}
          >
            <View className="flex-row items-center gap-2">
              <View
                className="h-8 w-8 items-center justify-center rounded-kd-lg"
                style={{ backgroundColor: alpha(meta.color, theme.isDark ? 0.16 : 0.1) }}
              >
                {renderServiceLogo(17)}
              </View>
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-kd-label font-semibold text-kd-text">
                  {meta.label}
                </Text>
                <Text numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
                  {meta.subtitle}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={`ตั้งค่า ${meta.label}`}
                accessibilityRole="button"
                onPress={() => setIsSettingsOpen(true)}
                className="h-8 w-8 items-center justify-center rounded-kd-lg bg-kd-panel-muted active:opacity-70 dark:bg-kd-card-muted"
              >
                <SlidersHorizontal size={15} color={theme.textMuted} strokeWidth={2.2} />
              </Pressable>
            </View>
            {renderChannelPicker()}
          </View>

          {postQueueVideos.length > 0 ? (
            <View className="flex-row items-center justify-between border-b border-kd-border px-3 py-2">
              <Text className="text-kd-caption font-semibold text-kd-text-subtle">
                {postQueueVideos.length} วิดีโอ
              </Text>
              <View className="flex-row items-center gap-3">
                <Pressable
                  accessibilityRole="button"
                  onPress={onOpenVideoLibrary}
                  className="h-7 justify-center active:opacity-70"
                >
                  <Text className="text-kd-caption font-semibold" style={{ color: meta.color }}>
                    เพิ่มวิดีโอ
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={isPosting}
                  onPress={onClearPendingVideos}
                  className="h-7 justify-center active:opacity-70 disabled:opacity-50"
                >
                  <Text className="text-kd-caption font-semibold text-kd-red">ล้างทั้งหมด</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* เตือนสำคัญสุด: ยังไม่ได้เลือกช่อง → โพสต์ไม่ได้เลย (ปุ่ม disabled) */}
          {postQueueVideos.length > 0 && !channelId ? (
            <View className="flex-row items-center gap-2 border-b border-kd-border bg-kd-amber/10 px-3 py-2">
              <TriangleAlert size={14} color={theme.amber} strokeWidth={2.2} />
              <Text numberOfLines={2} className="min-w-0 flex-1 text-kd-caption text-kd-amber">
                {`ยังไม่ได้เลือกช่อง ${meta.label} — เลือกช่องด้านบนก่อนโพสต์`}
              </Text>
            </View>
          ) : null}

          {blockedCount > 0 ? (
            <View className="flex-row items-center gap-2 border-b border-kd-border bg-kd-amber/10 px-3 py-2">
              <TriangleAlert size={14} color={theme.amber} strokeWidth={2.2} />
              <Text numberOfLines={2} className="min-w-0 flex-1 text-kd-caption text-kd-amber">
                {`ข้าม ${blockedCount} รายการที่ไฟล์ยังไม่พร้อม`}
              </Text>
            </View>
          ) : null}

          {isPosting && progressText ? (
            <View className="flex-row items-center gap-2 border-b border-kd-border px-3 py-1.5">
              <ActivityIndicator size="small" color={meta.color} />
              <Text numberOfLines={1} className="flex-1 text-kd-micro text-kd-text-subtle">
                {progressText}
              </Text>
            </View>
          ) : null}

          {postQueueVideos.length > 0 ? (
            postQueueVideos.map((video, index) => (
              <PostVideoRow
                key={video.id}
                index={index}
                accentColor={meta.color}
                aiCaption={aiContentSettings.aiGenerateCaption}
                aiHashtags={aiContentSettings.aiGenerateHashtags}
                disabled={isPosting}
                result={assetResults[video.id] ?? null}
                theme={theme}
                video={video}
                onRemove={() => onRemovePendingVideo(video.id)}
              />
            ))
          ) : (
            <View className="items-center justify-center px-8 py-16">
              <View
                className="h-14 w-14 items-center justify-center rounded-full"
                style={{ backgroundColor: alpha(meta.color, theme.isDark ? 0.16 : 0.1) }}
              >
                <Video size={24} color={meta.color} strokeWidth={1.8} />
              </View>
              <Text className="mt-2 text-kd-subtitle font-semibold text-kd-text">ยังไม่มีวิดีโอในคิว</Text>
              <Text className="mt-1 text-center text-kd-caption leading-4 text-kd-text-subtle">
                เลือกวิดีโอจากคลัง แล้วกดปุ่มโพสต์โซเชียล เพื่อส่งมาเตรียมโพสต์ {meta.label}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={onOpenVideoLibrary}
                className="mt-3 h-9 flex-row items-center justify-center gap-1.5 rounded-kd-lg px-3 active:opacity-75"
                style={{ backgroundColor: meta.color }}
              >
                <FolderOpen size={14} color={theme.white} strokeWidth={2.2} />
                <Text className="text-kd-body font-semibold text-white">ไปคลังวิดีโอ</Text>
              </Pressable>
            </View>
          )}

          {missingQueuedVideoCount > 0 ? (
            <Text className="px-3 py-2 text-center text-kd-caption text-kd-text-subtle">
              มีรายการที่หาไม่พบในคลัง {missingQueuedVideoCount} วิดีโอ
            </Text>
          ) : null}
        </View>
      </ScrollView>

      {/* คิวว่างซ่อนปุ่มโพสต์ (empty state มีปุ่มไปคลังวิดีโอนำทางแล้ว) — ตอนกำลังโพสต์คงปุ่มหยุดไว้ */}
      {postQueueVideos.length > 0 || isPosting ? (
        <View className="absolute bottom-0 left-0 right-0 bg-kd-screen px-4 pb-3 pt-3">
          {isPosting ? (
            <Pressable
              accessibilityRole="button"
              disabled={stopRequested}
              onPress={requestStop}
              className="h-[50px] flex-row items-center justify-center gap-2 rounded-kd-xl bg-kd-text active:opacity-80 disabled:opacity-60"
            >
              {stopRequested ? (
                <ActivityIndicator color={theme.white} size="small" />
              ) : (
                <X size={14} color={theme.white} strokeWidth={2.4} />
              )}
              <Text className="text-kd-subtitle font-semibold text-white">
                {stopRequested ? 'จะหยุดหลังคลิปนี้...' : 'หยุดหลังคลิปนี้'}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={!canPost}
              onPress={() => {
                void startPosting();
              }}
              className="h-[50px] flex-row items-center justify-center gap-2 rounded-kd-xl active:opacity-80 disabled:opacity-60"
              style={{ backgroundColor: meta.color }}
            >
              <Send size={16} color={theme.white} strokeWidth={2.2} />
              <Text className="text-kd-subtitle font-semibold text-white">
                {`โพสต์ ${meta.label} ${postableVideos.length} คลิป`}
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {isSettingsOpen ? (
        <Modal animationType="fade" onRequestClose={() => setIsSettingsOpen(false)} transparent visible>
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
                  <Text className="text-kd-label font-semibold text-kd-text">ตั้งค่า {meta.label}</Text>
                </View>
                <Pressable
                  accessibilityLabel={`ปิดตั้งค่า ${meta.label}`}
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
    </View>
  );
}

function PostVideoRow({
  index,
  accentColor,
  aiCaption,
  aiHashtags,
  disabled,
  result,
  theme,
  video,
  onRemove,
}: {
  index: number;
  accentColor: string;
  aiCaption: boolean;
  aiHashtags: boolean;
  disabled: boolean;
  result: AssetPostResult | null;
  theme: KubdeeTheme;
  video: GeneratedMediaAsset;
  onRemove: () => void;
}): React.JSX.Element {
  const hasFile = isLocalPostableVideo(video);
  const hasProductUrl = Boolean(video.productUrl?.trim());
  const productName = getPostProductName(video);
  const productLabel = productName || getPostVideoFallbackLabel(video, index);
  // body ของโพสต์ (buildBufferPostTextWithLink) = caption + link + hashtags — ไม่ fallback ชื่อสินค้า
  const captionState = resolvePostCaptionState(video.caption, aiCaption, false);
  const hashtagState = resolvePostHashtagState(video.hashtags, aiHashtags);
  const linkStatus = hasProductUrl ? 'มีลิงก์สินค้า (พิกัดใส่ในโพสต์)' : 'ไม่มีลิงก์สินค้า';

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
          <Text className="text-kd-caption font-semibold" style={{ color: accentColor }}>
            #{index + 1}
          </Text>
          <Text numberOfLines={1} className="min-w-0 flex-1 text-kd-body font-semibold text-kd-text">
            {productLabel}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          className={`mt-0.5 text-kd-caption ${hasProductUrl ? 'text-kd-emerald' : 'text-kd-text-subtle'}`}
        >
          {linkStatus}
        </Text>
        <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
          {!hasFile ? <PostWarnChip text="ไฟล์ยังไม่พร้อม" theme={theme} /> : null}
          <PostContentChip label="แคปชั่น" state={captionState} theme={theme} />
          <PostContentChip label="แฮชแท็ก" state={hashtagState} theme={theme} />
        </View>
        {result ? (
          <Text
            numberOfLines={2}
            className={`mt-0.5 text-kd-caption ${result.ok ? 'text-kd-emerald' : 'text-kd-red'}`}
          >
            {result.message}
          </Text>
        ) : null}
      </View>

      <Pressable
        accessibilityLabel="เอาออกจากคิว"
        accessibilityRole="button"
        disabled={disabled}
        onPress={onRemove}
        className="h-9 w-9 items-center justify-center rounded-full active:opacity-70 disabled:opacity-40"
      >
        <X size={19} color={theme.textMuted} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

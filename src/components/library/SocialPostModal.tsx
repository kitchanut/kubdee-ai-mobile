import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Share2, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

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
import type { GeneratedMediaAsset } from '@/autopilot/generatedMediaStore';
import { FacebookLogo, InstagramLogo, YouTubeLogo } from '@/components/BrandLogos';
import { KubdeeToaster } from '@/components/KubdeeToaster';
import Text from '@/components/ui/KubdeeText';
import {
  FacebookPostingSettingsBlock,
  InstagramPostingSettingsBlock,
  YoutubePostingSettingsBlock,
} from '@/screens/autopilot/blocks/FacebookPostingSettingsBlock';
import { FACEBOOK_BLUE, INSTAGRAM_PINK, YOUTUBE_RED } from '@/theme/brandColors';
import type { KubdeeTheme } from '@/theme/tokens';

// สีม่วงเดียวกับปุ่ม "โพสต์โซเชียล" ใน SelectionBar (shared.tsx)
const SOCIAL_VIOLET = '#7c3aed';

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

type SocialService = 'facebook' | 'instagram' | 'youtube';

const SERVICE_LABELS: Record<SocialService, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  youtube: 'YouTube',
};

interface ServicePostResult {
  service: SocialService;
  ok: boolean;
  error?: string;
}

interface AssetPostResult {
  assetId: string;
  title: string;
  /** ตั้งค่าเมื่อคลิปนี้ถูกข้ามทั้งคลิป (ไม่มีไฟล์ / อัปโหลดไม่สำเร็จ) */
  skipReason?: string;
  services: ServicePostResult[];
}

const SUMMARY_PREVIEW_COUNT = 5;

export default function SocialPostModal({
  visible,
  assets,
  theme,
  onClose,
  onPosted,
}: {
  visible: boolean;
  assets: GeneratedMediaAsset[];
  theme: KubdeeTheme;
  onClose: () => void;
  /** เรียกเมื่อโพสต์สำเร็จอย่างน้อย 1 รายการ — ให้ MediaPanel ล้าง selection */
  onPosted?: () => void;
}): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [channels, setChannels] = useState<LibrarySocialChannels>({ ...EMPTY_CHANNELS });
  const [isPosting, setIsPosting] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [stopRequested, setStopRequested] = useState(false);
  const [results, setResults] = useState<AssetPostResult[]>([]);
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

  // เปิด modal รอบใหม่ = เริ่มรอบใหม่ — ล้างผล/สถานะของรอบก่อนตอน visible
  // พลิกเป็น true (adjust-state-during-render ตาม react.dev แทน useEffect)
  const [lastVisible, setLastVisible] = useState(visible);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      // ไม่ต้องแตะ stopRef ตรงนี้ — startPosting รีเซ็ตเองก่อนเริ่มทุกรอบ
      setResults([]);
      setProgressText(null);
      setStopRequested(false);
    }
  }

  const updateChannels = (patch: Partial<LibrarySocialChannels>): void => {
    setChannels((current) => {
      const next = { ...current, ...patch };
      void saveStoredChannels(next);
      return next;
    });
  };

  const enabledServices: SocialService[] = [
    ...(channels.facebookChannelId ? (['facebook'] as const) : []),
    ...(channels.instagramChannelId ? (['instagram'] as const) : []),
    ...(channels.youtubeChannelId ? (['youtube'] as const) : []),
  ];
  const canPost = !isPosting && assets.length > 0 && enabledServices.length > 0;
  const previewAssets = assets.slice(0, SUMMARY_PREVIEW_COUNT);

  const requestStop = (): void => {
    stopRef.current = true;
    setStopRequested(true);
  };

  const startPosting = async (): Promise<void> => {
    if (!canPost) {
      return;
    }

    // snapshot ตอนกดโพสต์ — เปลี่ยน channel ระหว่างโพสต์ไม่มีผลกับรอบนี้
    const facebookChannelId = channels.facebookChannelId;
    const instagramChannelId = channels.instagramChannelId;
    const youtubeChannelId = channels.youtubeChannelId;

    setIsPosting(true);
    setStopRequested(false);
    stopRef.current = false;
    setResults([]);

    const collected: AssetPostResult[] = [];
    try {
      for (let index = 0; index < assets.length; index += 1) {
        // "หยุดหลังคลิปนี้" — เช็คก่อนเริ่มคลิปถัดไป คลิปที่กำลังโพสต์อยู่ทำจนจบ
        if (stopRef.current) {
          break;
        }

        const asset = assets[index];
        const label = asset.title?.trim() || asset.fileName?.trim() || `วิดีโอ ${index + 1}`;
        const position = `${index + 1}/${assets.length}`;

        if (!isLocalPostableVideo(asset) || !asset.fileUri) {
          collected.push({
            assetId: asset.id,
            title: label,
            skipReason: 'ข้าม: ไม่พบไฟล์วิดีโอในเครื่อง',
            services: [],
          });
          setResults([...collected]);
          continue;
        }

        // อัปโหลดครั้งเดียวต่อคลิป แล้วใช้ assetUrl ซ้ำกับทุก service ที่เปิดไว้
        setProgressText(`กำลังอัปโหลด ${position}: ${label}`);
        let assetUrl: string;
        try {
          assetUrl = await uploadBufferAsset(asset.fileUri, asset.mimeType || 'video/mp4');
        } catch (error) {
          collected.push({
            assetId: asset.id,
            title: label,
            skipReason: `อัปโหลดไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
            services: [],
          });
          setResults([...collected]);
          continue;
        }

        const source: BufferPostTextSource = {
          caption: asset.caption,
          hashtags: asset.hashtags,
          productUrl: asset.productUrl,
          name: getPostProductName(asset),
        };
        // ลิงก์สินค้าใส่ในตัวโพสต์เลย — พฤติกรรมเดียวกับ auto pilot ตอนนี้
        // (USE_FIRST_COMMENT ปิดอยู่เพราะ Buffer แพลนฟรีไม่รับ first comment)
        const text = buildBufferPostTextWithLink(source);
        const serviceResults: ServicePostResult[] = [];

        if (facebookChannelId) {
          setProgressText(`โพสต์ Facebook ${position}...`);
          try {
            await createFacebookBufferPost({ channelId: facebookChannelId, text, assetUrl, assetType: 'video' });
            serviceResults.push({ service: 'facebook', ok: true });
          } catch (error) {
            serviceResults.push({
              service: 'facebook',
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        if (instagramChannelId) {
          setProgressText(`โพสต์ Instagram ${position}...`);
          try {
            await createInstagramBufferPost({ channelId: instagramChannelId, text, assetUrl });
            serviceResults.push({ service: 'instagram', ok: true });
          } catch (error) {
            serviceResults.push({
              service: 'instagram',
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        if (youtubeChannelId) {
          setProgressText(`โพสต์ YouTube ${position}...`);
          // ไม่มีชื่อสินค้า/แคปชัน → ใช้ชื่อรายการในคลังแทน fallback กลางๆ
          const hasContentTitle = !!(source.name?.trim() || source.caption?.trim());
          const title = hasContentTitle
            ? buildYoutubeTitle(source)
            : (asset.title?.trim() || 'วิดีโอสินค้า').slice(0, YOUTUBE_TITLE_MAX_LENGTH);
          try {
            await createYoutubeBufferPost({ channelId: youtubeChannelId, text, assetUrl, title });
            serviceResults.push({ service: 'youtube', ok: true });
          } catch (error) {
            serviceResults.push({
              service: 'youtube',
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        collected.push({ assetId: asset.id, title: label, services: serviceResults });
        setResults([...collected]);
      }
    } finally {
      setIsPosting(false);
      setProgressText(null);
    }

    const successByService: Record<SocialService, number> = { facebook: 0, instagram: 0, youtube: 0 };
    let successCount = 0;
    let failureCount = 0;
    for (const item of collected) {
      if (item.skipReason) {
        failureCount += 1;
        continue;
      }
      for (const service of item.services) {
        if (service.ok) {
          successByService[service.service] += 1;
          successCount += 1;
        } else {
          failureCount += 1;
        }
      }
    }

    const stoppedEarly = collected.length < assets.length;
    const summaryParts = enabledServices.map(
      (service) => `${SERVICE_LABELS[service]} ${successByService[service]}/${collected.length}`
    );
    const stopSuffix = stoppedEarly ? ` · หยุดหลังคลิปที่ ${collected.length}` : '';

    if (successCount > 0 && failureCount === 0) {
      toast.success(`โพสต์สำเร็จ: ${summaryParts.join(' · ')}${stopSuffix}`);
    } else if (successCount > 0) {
      toast.warning(`โพสต์สำเร็จบางส่วน: ${summaryParts.join(' · ')} · ล้มเหลว ${failureCount}${stopSuffix}`);
    } else {
      toast.error(`โพสต์โซเชียลไม่สำเร็จ${stopSuffix}`);
    }

    if (successCount > 0) {
      onPosted?.();
    }
  };

  const handleClose = (): void => {
    if (isPosting) {
      return;
    }
    onClose();
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={handleClose}>
      <View className="flex-1 justify-end bg-black/45">
        <View
          className="max-h-[92%] rounded-t-[20px] border border-kd-border bg-kd-panel"
          style={{ paddingBottom: Math.max(insets.bottom + 12, 20) }}
        >
          <View className="flex-row items-center justify-between gap-3 border-b border-kd-border px-4 py-3">
            <View className="min-w-0 flex-1 flex-row items-center gap-2">
              <Share2 size={16} color={SOCIAL_VIOLET} strokeWidth={2.2} />
              <View className="min-w-0 flex-1">
                <Text numberOfLines={1} className="text-kd-title font-semibold text-kd-text">
                  โพสต์ไปโซเชียล
                </Text>
                <Text numberOfLines={1} className="text-kd-caption text-kd-text-subtle">
                  Facebook · Instagram Reels · YouTube Shorts ผ่าน Buffer
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityLabel="ปิด"
              accessibilityRole="button"
              disabled={isPosting}
              onPress={handleClose}
              className="h-8 w-8 items-center justify-center rounded-full bg-kd-card-muted disabled:opacity-50"
            >
              <X size={16} color={theme.textSubtle} strokeWidth={2.4} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="gap-4 px-4 py-3">
            <View className="rounded-kd-lg border border-kd-border bg-kd-card p-3">
              <Text className="text-kd-caption font-semibold text-kd-text">จะโพสต์ {assets.length} วิดีโอ</Text>
              <View className="mt-1.5 gap-0.5">
                {previewAssets.map((asset, index) => (
                  <Text key={asset.id} numberOfLines={1} className="text-kd-micro text-kd-text-subtle">
                    {index + 1}. {asset.title?.trim() || asset.fileName?.trim() || 'วิดีโอ'}
                  </Text>
                ))}
                {assets.length > previewAssets.length ? (
                  <Text className="text-kd-micro text-kd-text-muted">
                    และอีก {assets.length - previewAssets.length} รายการ
                  </Text>
                ) : null}
              </View>
            </View>

            <View
              className={`gap-4 ${isPosting ? 'opacity-60' : ''}`}
              pointerEvents={isPosting ? 'none' : 'auto'}
            >
              <View className="gap-2">
                <View className="flex-row items-center gap-2">
                  <FacebookLogo size={16} color={FACEBOOK_BLUE} cutoutColor={theme.panel} />
                  <Text className="flex-1 text-kd-caption font-semibold text-kd-text">Facebook</Text>
                  <Text
                    className="text-kd-micro font-medium"
                    style={{ color: channels.facebookChannelId ? FACEBOOK_BLUE : theme.textSubtle }}
                  >
                    {channels.facebookChannelId ? 'จะโพสต์' : 'ไม่โพสต์'}
                  </Text>
                </View>
                <FacebookPostingSettingsBlock
                  facebookChannelId={channels.facebookChannelId}
                  theme={theme}
                  onSelectChannel={(channelId) => updateChannels({ facebookChannelId: channelId })}
                  onClearChannel={() => updateChannels({ facebookChannelId: null })}
                />
              </View>

              <View className="gap-2">
                <View className="flex-row items-center gap-2">
                  <InstagramLogo size={16} color={INSTAGRAM_PINK} />
                  <Text className="flex-1 text-kd-caption font-semibold text-kd-text">Instagram (Reels)</Text>
                  <Text
                    className="text-kd-micro font-medium"
                    style={{ color: channels.instagramChannelId ? INSTAGRAM_PINK : theme.textSubtle }}
                  >
                    {channels.instagramChannelId ? 'จะโพสต์' : 'ไม่โพสต์'}
                  </Text>
                </View>
                <InstagramPostingSettingsBlock
                  instagramChannelId={channels.instagramChannelId}
                  theme={theme}
                  onSelectChannel={(channelId) => updateChannels({ instagramChannelId: channelId })}
                  onClearChannel={() => updateChannels({ instagramChannelId: null })}
                />
              </View>

              <View className="gap-2">
                <View className="flex-row items-center gap-2">
                  <YouTubeLogo size={16} color={YOUTUBE_RED} cutoutColor={theme.panel} />
                  <Text className="flex-1 text-kd-caption font-semibold text-kd-text">YouTube (Shorts)</Text>
                  <Text
                    className="text-kd-micro font-medium"
                    style={{ color: channels.youtubeChannelId ? YOUTUBE_RED : theme.textSubtle }}
                  >
                    {channels.youtubeChannelId ? 'จะโพสต์' : 'ไม่โพสต์'}
                  </Text>
                </View>
                <YoutubePostingSettingsBlock
                  youtubeChannelId={channels.youtubeChannelId}
                  theme={theme}
                  onSelectChannel={(channelId) => updateChannels({ youtubeChannelId: channelId })}
                  onClearChannel={() => updateChannels({ youtubeChannelId: null })}
                />
              </View>
            </View>

            {isPosting ? (
              <View className="gap-2.5 rounded-kd-lg border border-kd-border bg-kd-card p-3">
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator size="small" color={SOCIAL_VIOLET} />
                  <Text numberOfLines={2} className="flex-1 text-kd-caption text-kd-text">
                    {progressText || 'กำลังโพสต์...'}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={stopRequested}
                  onPress={requestStop}
                  className="h-9 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-input disabled:opacity-50"
                >
                  <Text className="text-kd-caption font-semibold text-kd-text-muted">
                    {stopRequested ? 'จะหยุดหลังคลิปนี้...' : 'หยุดหลังคลิปนี้'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {results.length > 0 ? (
              <View className="gap-1.5 rounded-kd-lg border border-kd-border bg-kd-card p-3">
                <Text className="text-kd-caption font-semibold text-kd-text">ผลการโพสต์</Text>
                {results.map((item) => (
                  <View key={item.assetId} className="gap-0.5 rounded-kd-md bg-kd-panel px-2 py-1.5">
                    <Text numberOfLines={1} className="text-kd-caption font-medium text-kd-text">
                      {item.title}
                    </Text>
                    {item.skipReason ? (
                      <Text numberOfLines={2} className="text-kd-micro" style={{ color: theme.red }}>
                        {item.skipReason}
                      </Text>
                    ) : (
                      item.services.map((service) => (
                        <Text
                          key={service.service}
                          numberOfLines={2}
                          className="text-kd-micro"
                          style={{ color: service.ok ? theme.emerald : theme.red }}
                        >
                          {SERVICE_LABELS[service.service]}: {service.ok ? 'สำเร็จ' : service.error || 'ไม่สำเร็จ'}
                        </Text>
                      ))
                    )}
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <View className="flex-row gap-2 border-t border-kd-border px-4 pt-3">
            <Pressable
              accessibilityRole="button"
              disabled={isPosting}
              onPress={handleClose}
              className="h-11 flex-1 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-card disabled:opacity-50"
            >
              <Text className="text-kd-body font-medium text-kd-text-subtle">ปิด</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!canPost}
              onPress={() => void startPosting()}
              className="h-11 flex-[2] flex-row items-center justify-center gap-1.5 rounded-kd-lg px-3 disabled:opacity-50"
              style={{ backgroundColor: SOCIAL_VIOLET }}
            >
              {isPosting ? (
                <ActivityIndicator color={theme.white} size="small" />
              ) : (
                <Share2 size={14} color={theme.white} strokeWidth={2.3} />
              )}
              <Text className="text-kd-body font-semibold text-white">
                {isPosting ? 'กำลังโพสต์...' : `โพสต์ (${assets.length})`}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
      <KubdeeToaster isDark={theme.isDark} />
    </Modal>
  );
}

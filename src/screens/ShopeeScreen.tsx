import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { CheckCircle2, Cloud, Heart, Link, ListChecks, Send, Settings, ShoppingBag, Video } from 'lucide-react-native';
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
import NumberStepper from '@/components/ui/NumberStepper';
import SectionHeader from '@/components/ui/SectionHeader';
import StatusPill from '@/components/ui/StatusPill';
import { useShopeeIncrementalProductSaver } from '@/hooks/useShopeeIncrementalProductSaver';
import { useLibrary } from '@/library/LibraryContext';
import { storePendingTab } from '@/navigation/pendingNavigation';
import {
  getAccessibilityStatus,
  importShopeeLikedProducts,
  launchTargetApp,
  openAccessibilitySettings,
  postShopeeVideos,
  requestAndroidVideoPermission,
  stopShopeeAutomation,
  subscribeShopeeImportLogs,
  subscribeShopeePostLogs,
} from '@/native/AccessibilityBridge';
import type { NativeShopeeImportLog, NativeShopeePostLog } from '@/native/AccessibilityBridge';
import type { KubdeeTheme } from '@/theme/tokens';

interface ShopeeScreenProps {
  selectedProfileId: string;
  theme: KubdeeTheme;
  selectedCount: number;
  onImportFinished?: () => void;
}

const KUBDEE_ANDROID_PACKAGE = 'ai.kubdee.mobile';

export default function ShopeeScreen({
  selectedProfileId,
  theme,
  selectedCount,
  onImportFinished,
}: ShopeeScreenProps): React.JSX.Element {
  const [subMode, setSubMode] = useState<'import' | 'post' | 'settings'>('import');
  const [importLimit, setImportLimit] = useState(50);
  const [isImporting, setIsImporting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [runMessage, setRunMessage] = useState('พร้อมดึงสินค้าจาก Shopee');
  const [logs, setLogs] = useState<NativeShopeeImportLog[]>([]);
  const [selectedPostVideoIds, setSelectedPostVideoIds] = useState<Set<string>>(new Set());
  const [postMessage, setPostMessage] = useState('เลือกวิดีโอจาก Auto Pilot เพื่อเตรียมโพสต์ Shopee');
  const [postLogs, setPostLogs] = useState<NativeShopeePostLog[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [isStoppingPost, setIsStoppingPost] = useState(false);
  const { getAssetsByKind } = useGeneratedMedia();
  const {
    products,
    isSyncing,
    lastSyncedAt,
    syncProducts,
    importShopeeProducts,
  } = useLibrary();

  const profileProductCount = useMemo(() => {
    if (!selectedProfileId) {
      return 0;
    }

    return products.filter((product) => product.profileLocalId === selectedProfileId).length;
  }, [products, selectedProfileId]);

  const generatedVideos = useMemo(
    () => getAssetsByKind('videos', selectedProfileId),
    [getAssetsByKind, selectedProfileId]
  );
  const selectedPostVideos = useMemo(
    () => generatedVideos.filter((video) => selectedPostVideoIds.has(video.id)),
    [generatedVideos, selectedPostVideoIds]
  );
  const readyPostVideoCount = useMemo(
    () => selectedPostVideos.filter(isLocalPostableVideo).length,
    [selectedPostVideos]
  );

  const appendLog = useCallback((message: string, ts = Date.now()): void => {
    setLogs((current) => [...current, { message, ts }].slice(-100));
    setRunMessage(message);
    pushAutomationActivityLog('shopee-import', message, ts);
  }, []);

  const appendPostLog = useCallback((message: string, ts = Date.now()): void => {
    setPostLogs((current) => [...current, { message, ts }].slice(-100));
    setPostMessage(message);
    pushAutomationActivityLog('shopee-post', message, ts);
  }, []);

  const shopeeProductSaver = useShopeeIncrementalProductSaver({
    selectedProfileId,
    importShopeeProducts,
    appendLog,
  });

  const syncImportedProducts = useCallback(async (): Promise<void> => {
    const result = await syncProducts();
    if (!result) {
      appendLog('บันทึกไว้ในเครื่องแล้ว รอซิงก์ cloud');
      return;
    }

    if (result.success) {
      appendLog(`ซิงก์ cloud แล้ว ${result.count} รายการ`);
      return;
    }

    appendLog(result.error || 'ซิงก์ cloud ยังไม่สำเร็จ จะลองใหม่รอบถัดไป');
  }, [appendLog, syncProducts]);

  const returnToProductLibrary = useCallback(async (): Promise<void> => {
    const status = await getAccessibilityStatus().catch(() => null);
    const packageName = status?.packageName?.trim() || KUBDEE_ANDROID_PACKAGE;
    appendLog('กลับไป Kubdee AI > คลังสินค้า');
    setTimeout(() => {
      onImportFinished?.();
      void launchTargetApp(packageName).catch(() => false);
    }, 50);
  }, [appendLog, onImportFinished]);

  useEffect(() => {
    const subscription = subscribeShopeeImportLogs((entry) => {
      setLogs((current) => [...current, entry].slice(-100));
      setRunMessage(entry.message);
    });

    return () => {
      subscription?.remove();
    };
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

  useEffect(() => {
    setSelectedPostVideoIds((current) => {
      const availableIds = new Set(generatedVideos.map((video) => video.id));
      const next = new Set(Array.from(current).filter((id) => availableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [generatedVideos]);

  const handleImportShopeeProducts = useCallback(async (): Promise<void> => {
    if (!selectedProfileId) {
      toast.error('เลือกโปรไฟล์ก่อนดึงสินค้า');
      return;
    }

    if (isImporting || isPosting || isSyncing) {
      return;
    }

    setIsImporting(true);
    setIsStopping(false);
    setLogs([]);
    beginAutomationActivityRun('shopee-import');
    shopeeProductSaver.startSession(selectedProfileId);
    appendLog('เริ่มดึงสินค้า Shopee จากสิ่งที่ถูกใจ');

    try {
      await shopeeProductSaver.savePendingProducts();
      const status = await getAccessibilityStatus();
      if (!status.running) {
        setRunMessage('กรุณาเปิด Kubdee AI ใน Accessibility ก่อน');
        Alert.alert(
          'เปิด Accessibility ก่อน',
          'Kubdee AI ต้องใช้ Accessibility เพื่อเปิด Shopee และอ่านรายการสินค้าถูกใจบนเครื่องนี้',
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

      appendLog('เปิด Shopee และเข้าเมนูสิ่งที่ฉันถูกใจ');
      await storePendingTab('library');
      const scrapedProducts = await importShopeeLikedProducts(importLimit, selectedProfileId);
      await shopeeProductSaver.waitForIdle();
      await shopeeProductSaver.savePendingProducts();
      await shopeeProductSaver.waitForIdle();

      if (scrapedProducts.length === 0 && shopeeProductSaver.getSavedCount() === 0) {
        appendLog('ไม่พบสินค้า Shopee ที่นำเข้าได้');
        toast.warning('ไม่พบสินค้า Shopee ที่นำเข้าได้');
        await returnToProductLibrary();
        return;
      }

      const result = await shopeeProductSaver.saveRemainingProducts(scrapedProducts);

      if (!result) {
        const savedCount = shopeeProductSaver.getSavedCount();
        const summary = `นำเข้า Shopee สำเร็จ ${savedCount} รายการ`;
        appendLog(summary);
        toast.success(summary);
        await shopeeProductSaver.clearPendingProducts();
        await syncImportedProducts();
        await returnToProductLibrary();
        return;
      }

      if (!result.success) {
        appendLog(result.error || 'นำเข้าสินค้า Shopee ไม่สำเร็จ');
        toast.error(result.error || 'นำเข้าสินค้า Shopee ไม่สำเร็จ');
        return;
      }

      const savedCount = shopeeProductSaver.getSavedCount();
      const queuedText = result.queued > 0 ? ` · รอซิงก์ cloud ${result.queued}` : '';
      const summary = `นำเข้า Shopee สำเร็จ ${savedCount > 0 ? savedCount : result.imported} รายการ${queuedText}`;
      appendLog(summary);
      toast.success(summary);
      await shopeeProductSaver.clearPendingProducts();
      await syncImportedProducts();
      await returnToProductLibrary();
    } catch (error) {
      await shopeeProductSaver.waitForIdle();
      const message = error instanceof Error ? error.message : String(error);
      appendLog(message);
      toast.error(message);
    } finally {
      shopeeProductSaver.stopSession();
      setIsImporting(false);
      setIsStopping(false);
      setAutomationActivityRunning('shopee-import', false);
    }
  }, [
    appendLog,
    importLimit,
    isImporting,
    isPosting,
    isSyncing,
    returnToProductLibrary,
    selectedProfileId,
    shopeeProductSaver,
    syncImportedProducts,
  ]);

  const handleStopImport = useCallback(async (): Promise<void> => {
    if (!isImporting || isStopping) {
      return;
    }

    setIsStopping(true);
    setAutomationActivityStopping('shopee-import', true);
    appendLog('กำลังส่งคำสั่งหยุด Shopee import...');
    const stopped = await stopShopeeAutomation();
    if (!stopped) {
      toast.warning('ยังหยุดไม่ได้ เพราะไม่พบ Accessibility Service ที่กำลังทำงาน');
      setIsStopping(false);
      setAutomationActivityStopping('shopee-import', false);
      return;
    }

    toast.success('ส่งคำสั่งหยุด Shopee import แล้ว');
  }, [appendLog, isImporting, isStopping]);

  const handleSyncProducts = useCallback(async (): Promise<void> => {
    if (isSyncing) {
      return;
    }

    const result = await syncProducts();
    if (!result) {
      return;
    }

    if (result.success) {
      toast.success(`ซิงก์แล้ว ${result.count} รายการ`);
      return;
    }

    toast.error(result.error || 'ซิงก์คลังสินค้าไม่สำเร็จ');
  }, [isSyncing, syncProducts]);

  const togglePostVideo = useCallback((videoId: string): void => {
    setSelectedPostVideoIds((current) => {
      const next = new Set(current);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
      }
      return next;
    });
  }, []);

  const handlePostShopeeVideos = useCallback(async (postAction: 'publish' | 'dryRun' = 'publish'): Promise<void> => {
    if (selectedPostVideos.length === 0) {
      toast.warning('เลือกวิดีโอก่อนเตรียมโพสต์ Shopee');
      return;
    }

    const missingFileCount = selectedPostVideos.filter((video) => !isLocalPostableVideo(video)).length;

    if (missingFileCount > 0) {
      const message = `ยังไม่พร้อมโพสต์: ต้องใช้ไฟล์วิดีโอในเครื่อง ${missingFileCount}`;
      setPostMessage(message);
      toast.warning(message);
      return;
    }

    const missingProductUrlCount = selectedPostVideos.filter((video) => !video.productUrl).length;
    if (missingProductUrlCount > 0) {
      toast.warning(`ไม่มีลิงก์สินค้า ${missingProductUrlCount} รายการ จะค้นหาด้วยชื่อสินค้าแทน`);
    }

    if (isPosting || isImporting) {
      if (isImporting) {
        toast.warning('กำลังดึงสินค้า Shopee อยู่ รอให้จบก่อนโพสต์');
      }
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
      appendPostLog(
        postAction === 'dryRun'
          ? `เริ่มทดสอบโพสต์ Shopee ${selectedPostVideos.length} วิดีโอ`
          : `เริ่มโพสต์ Shopee ${selectedPostVideos.length} วิดีโอ`
      );

      const result = await postShopeeVideos(
        selectedPostVideos.map((video) => ({
          fileUri: video.fileUri || '',
          productName: video.productName,
          productId: video.productCode,
          productUrl: video.productUrl,
          caption: video.caption,
          hashtags: video.hashtags,
          galleryVideoId: video.id,
          platform: video.platform || 'shopee',
        })),
        { postAction }
      );

      if (result.stopped) {
        const message = `หยุดโพสต์ Shopee แล้ว (${result.postedCount || 0}/${selectedPostVideos.length})`;
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
      const message = postAction === 'dryRun'
        ? `ทดสอบโพสต์ Shopee สำเร็จ ${successCount}/${selectedPostVideos.length} วิดีโอ`
        : `โพสต์ Shopee สำเร็จ ${result.postedCount || 0}/${selectedPostVideos.length} วิดีโอ`;
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
  }, [appendPostLog, isImporting, isPosting, selectedPostVideos]);

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
          active={subMode === 'import'}
          color={theme.orange}
          icon={ShoppingBag}
          label="สินค้า"
          theme={theme}
          onPress={() => setSubMode('import')}
        />
        <SubTab
          active={subMode === 'post'}
          color={theme.red}
          icon={Video}
          label="โพสต์"
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
        {subMode === 'import' ? (
          <>
            <View className="flex-row items-center gap-2.5 rounded-kd-lg border border-kd-orange bg-kd-orange-soft p-3">
              <ShoppingBag size={22} color={theme.orange} strokeWidth={2.2} />
              <View className="min-w-0 flex-1">
                <Text className="text-kd-label font-black text-kd-text">Shopee Import</Text>
                <Text className="mt-0.5 text-kd-caption leading-[15px] text-kd-text-subtle" numberOfLines={2}>
                  เปิด Shopee แล้วดึงสินค้าจากสิ่งที่ฉันถูกใจเข้าคลังสินค้า
                </Text>
              </View>
              <StatusPill
                backgroundColor={theme.emeraldSoft}
                color={theme.emerald}
                icon={CheckCircle2}
                label={`${selectedCount} DEVICE`}
              />
            </View>

            <View className="gap-1.5">
              <SectionHeader icon={ListChecks} theme={theme} title="Import Config" />
              <View className="flex-row gap-2">
                <View className="min-w-0 flex-1">
                  <NumberStepper
                    label="จำนวน"
                    max={120}
                    min={1}
                    suffix=" ชิ้น"
                    theme={theme}
                    value={importLimit}
                    onChange={setImportLimit}
                  />
                </View>
                <SummaryTile
                  label="ในคลัง"
                  value={`${profileProductCount}`}
                  theme={theme}
                />
              </View>
              <View className="flex-row gap-2">
                <SummaryTile
                  label="โปรไฟล์"
                  value={selectedProfileId ? 'พร้อม' : 'ยังไม่เลือก'}
                  theme={theme}
                />
                <SummaryTile
                  label="ซิงก์ล่าสุด"
                  value={lastSyncedAt ? formatTime(lastSyncedAt) : '-'}
                  theme={theme}
                />
              </View>
            </View>

            <View className="flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                disabled={selectedCount === 0 || isSyncing || !selectedProfileId || isImporting || isPosting}
                onPress={() => {
                  void handleImportShopeeProducts();
                }}
                className="h-[38px] flex-1 flex-row items-center justify-center gap-1.5 rounded-kd-md bg-kd-orange active:opacity-70 disabled:opacity-70"
              >
                {isImporting ? (
                  <ActivityIndicator color={theme.white} size="small" />
                ) : (
                  <ShoppingBag size={14} color="#ffffff" strokeWidth={2.2} />
                )}
                <Text className="text-kd-body font-black text-white">
                  {isImporting ? 'กำลังดึงสินค้า' : 'ดึงสินค้า Shopee'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={isSyncing || isImporting || isPosting}
                onPress={() => {
                  void handleSyncProducts();
                }}
                className="h-[38px] flex-row items-center justify-center gap-1.5 rounded-kd-md bg-kd-card-muted px-3.5 active:opacity-70 disabled:opacity-60"
              >
                {isSyncing ? (
                  <ActivityIndicator color={theme.textMuted} size="small" />
                ) : (
                  <Cloud size={14} color={theme.textSubtle} strokeWidth={2} />
                )}
                <Text className="text-kd-body font-black text-kd-text-subtle">ซิงก์</Text>
              </Pressable>
            </View>
            <Text className="text-center text-kd-caption font-bold leading-4 text-kd-text-subtle">{runMessage}</Text>

            <ActivityLogCard
              icon={Heart}
              theme={theme}
              logs={logs}
              running={isImporting}
              stopping={isStopping}
              runningText="กำลังดึงสินค้า Shopee"
              onStop={handleStopImport}
            />
          </>
        ) : subMode === 'post' ? (
          <View className="gap-2">
            <View className="flex-row items-center gap-2.5 rounded-kd-lg border border-kd-red bg-kd-red-soft p-3">
              <Send size={22} color={theme.red} strokeWidth={2.2} />
              <View className="min-w-0 flex-1">
                <Text className="text-kd-label font-black text-kd-text">Shopee Post Queue</Text>
                <Text className="mt-0.5 text-kd-caption leading-[15px] text-kd-text-subtle" numberOfLines={2}>
                  เลือกวิดีโอที่สร้างจาก Auto Pilot แล้วเตรียม metadata สำหรับโพสต์ Shopee
                </Text>
              </View>
              <StatusPill
                backgroundColor={theme.redSoft}
                color={theme.red}
                icon={Video}
                label={`${generatedVideos.length} VIDEO`}
              />
            </View>

            <View className="flex-row gap-2">
              <SummaryTile label="เลือกแล้ว" value={`${selectedPostVideos.length}`} theme={theme} />
              <SummaryTile label="พร้อมโพสต์" value={`${readyPostVideoCount}`} theme={theme} />
            </View>

            <View className="flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                disabled={
                  selectedPostVideos.length === 0 ||
                  readyPostVideoCount !== selectedPostVideos.length ||
                  isPosting ||
                  isImporting
                }
                onPress={() => {
                  void handlePostShopeeVideos('dryRun');
                }}
                className="h-[38px] flex-row items-center justify-center gap-1.5 rounded-kd-md bg-kd-card-muted px-3.5 active:opacity-70 disabled:opacity-60"
              >
                <CheckCircle2 size={14} color={theme.textSubtle} strokeWidth={2.2} />
                <Text className="text-kd-body font-black text-kd-text-subtle">ทดสอบ</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={
                  selectedPostVideos.length === 0 ||
                  readyPostVideoCount !== selectedPostVideos.length ||
                  isPosting ||
                  isImporting
                }
                onPress={() => {
                  void handlePostShopeeVideos('publish');
                }}
                className="h-[38px] flex-1 flex-row items-center justify-center gap-1.5 rounded-kd-md bg-kd-red active:opacity-70 disabled:opacity-60"
              >
                {isPosting ? (
                  <ActivityIndicator color={theme.white} size="small" />
                ) : (
                  <Send size={14} color={theme.white} strokeWidth={2.2} />
                )}
                <Text className="text-kd-body font-black text-white">
                  {isPosting ? 'กำลังโพสต์ Shopee' : 'โพสต์ Shopee'}
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
              <SectionHeader icon={Video} theme={theme} title="Auto Pilot Videos" />
              {generatedVideos.length > 0 ? (
                generatedVideos.map((video) => (
                  <PostVideoCard
                    key={video.id}
                    selected={selectedPostVideoIds.has(video.id)}
                    theme={theme}
                    video={video}
                    onToggle={() => togglePostVideo(video.id)}
                  />
                ))
              ) : (
                <View className="items-center rounded-kd-md border border-kd-border bg-kd-card p-5">
                  <Video size={24} color={theme.textSubtle} strokeWidth={1.8} />
                  <Text className="mt-2 text-kd-body font-black text-kd-text">ยังไม่มีวิดีโอจาก Auto Pilot</Text>
                  <Text className="mt-1 text-center text-kd-caption leading-4 text-kd-text-subtle">
                    สร้างคลิปจาก Auto Pipeline ก่อน แล้ววิดีโอจะมาอยู่ในคิวนี้
                  </Text>
                </View>
              )}
            </View>

          </View>
        ) : (
          <View className="gap-1.5">
            <SectionHeader icon={Settings} theme={theme} title="Shopee Settings" />
            <SettingsRow label="Target package" value="com.shopee.th" theme={theme} />
            <SettingsRow label="Import source" value="Shopee > ฉัน > สิ่งที่ฉันถูกใจ" theme={theme} />
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
  selected,
  theme,
  video,
  onToggle,
}: {
  selected: boolean;
  theme: KubdeeTheme;
  video: GeneratedMediaAsset;
  onToggle: () => void;
}): React.JSX.Element {
  const hasFile = isLocalPostableVideo(video);
  const hasProductUrl = Boolean(video.productUrl);
  const hasCaption = Boolean(video.caption);
  const hasHashtags = Boolean(video.hashtags);
  const ready = hasFile;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onToggle}
      className={`rounded-kd-md border bg-kd-card p-2.5 active:opacity-80 ${
        selected ? 'border-kd-red' : 'border-kd-border'
      }`}
    >
      <View className="flex-row items-start gap-2.5">
        <View
          className={`h-9 w-9 shrink-0 items-center justify-center rounded-kd-md ${
            ready ? 'bg-kd-red-soft' : 'bg-kd-card-muted'
          }`}
        >
          <Video size={16} color={ready ? theme.red : theme.textSubtle} strokeWidth={2.1} />
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-start gap-2">
            <View className="min-w-0 flex-1">
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
    </Pressable>
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
  icon: typeof ShoppingBag;
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

import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { CheckCircle2, Cloud, Heart, ListChecks, Settings, ShoppingBag, Square } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner-native';

import Text from '@/components/ui/KubdeeText';
import NumberStepper from '@/components/ui/NumberStepper';
import SectionHeader from '@/components/ui/SectionHeader';
import StatusPill from '@/components/ui/StatusPill';
import { useLibrary } from '@/library/LibraryContext';
import {
  getAccessibilityStatus,
  importShopeeLikedProducts,
  openAccessibilitySettings,
  stopShopeeAutomation,
  subscribeShopeeImportLogs,
} from '@/native/AccessibilityBridge';
import type { NativeShopeeImportLog } from '@/native/AccessibilityBridge';
import type { KubdeeTheme } from '@/theme/tokens';

interface ShopeeScreenProps {
  selectedProfileId: string;
  theme: KubdeeTheme;
  selectedCount: number;
}

export default function ShopeeScreen({
  selectedProfileId,
  theme,
  selectedCount,
}: ShopeeScreenProps): React.JSX.Element {
  const [subMode, setSubMode] = useState<'import' | 'settings'>('import');
  const [importLimit, setImportLimit] = useState(50);
  const [isImporting, setIsImporting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [runMessage, setRunMessage] = useState('พร้อมดึงสินค้าจาก Shopee');
  const [logs, setLogs] = useState<NativeShopeeImportLog[]>([]);
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

  const appendLog = useCallback((message: string, ts = Date.now()): void => {
    setLogs((current) => [...current, { message, ts }].slice(-80));
    setRunMessage(message);
  }, []);

  useEffect(() => {
    const subscription = subscribeShopeeImportLogs((entry) => {
      setLogs((current) => [...current, entry].slice(-80));
      setRunMessage(entry.message);
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  const handleImportShopeeProducts = useCallback(async (): Promise<void> => {
    if (!selectedProfileId) {
      toast.error('เลือกโปรไฟล์ก่อนดึงสินค้า');
      return;
    }

    if (isImporting || isSyncing) {
      return;
    }

    setIsImporting(true);
    setIsStopping(false);
    setLogs([]);
    appendLog('เริ่มดึงสินค้า Shopee จากสิ่งที่ถูกใจ');

    try {
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
      const scrapedProducts = await importShopeeLikedProducts(importLimit);
      if (scrapedProducts.length === 0) {
        appendLog('ไม่พบสินค้า Shopee ที่นำเข้าได้');
        toast.warning('ไม่พบสินค้า Shopee ที่นำเข้าได้');
        return;
      }

      appendLog(`ดึงจาก Shopee ได้ ${scrapedProducts.length} รายการ กำลังบันทึกเข้าคลัง`);
      const result = await importShopeeProducts(selectedProfileId, scrapedProducts);

      if (!result) {
        appendLog('คลังสินค้ากำลังซิงก์อยู่ ลองใหม่อีกครั้ง');
        toast.warning('คลังสินค้ากำลังซิงก์อยู่ ลองใหม่อีกครั้ง');
        return;
      }

      if (!result.success) {
        appendLog(result.error || 'นำเข้าสินค้า Shopee ไม่สำเร็จ');
        toast.error(result.error || 'นำเข้าสินค้า Shopee ไม่สำเร็จ');
        return;
      }

      const summary = `นำเข้า Shopee สำเร็จ ${result.imported} รายการ`;
      appendLog(summary);
      toast.success(summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRunMessage(message);
      toast.error(message);
    } finally {
      setIsImporting(false);
      setIsStopping(false);
    }
  }, [appendLog, importLimit, importShopeeProducts, isImporting, isSyncing, selectedProfileId]);

  const handleStopImport = useCallback(async (): Promise<void> => {
    if (!isImporting || isStopping) {
      return;
    }

    setIsStopping(true);
    appendLog('กำลังส่งคำสั่งหยุด Shopee import...');
    const stopped = await stopShopeeAutomation();
    if (!stopped) {
      toast.warning('ยังหยุดไม่ได้ เพราะไม่พบ Accessibility Service ที่กำลังทำงาน');
      setIsStopping(false);
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
              {isImporting ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={isStopping}
                  onPress={handleStopImport}
                  className="h-[38px] flex-1 flex-row items-center justify-center gap-1.5 rounded-kd-md bg-kd-red active:opacity-70 disabled:opacity-70"
                >
                  {isStopping ? (
                    <ActivityIndicator color={theme.white} size="small" />
                  ) : (
                    <Square size={14} color={theme.white} fill={theme.white} strokeWidth={2} />
                  )}
                  <Text className="text-kd-body font-black text-white">
                    {isStopping ? 'กำลังหยุด' : 'หยุดดึงสินค้า'}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  disabled={selectedCount === 0 || isSyncing || !selectedProfileId}
                  onPress={() => {
                    void handleImportShopeeProducts();
                  }}
                  className="h-[38px] flex-1 flex-row items-center justify-center gap-1.5 rounded-kd-md bg-kd-orange active:opacity-70 disabled:opacity-70"
                >
                  <ShoppingBag size={14} color="#ffffff" strokeWidth={2.2} />
                  <Text className="text-kd-body font-black text-white">ดึงสินค้า Shopee</Text>
                </Pressable>
              )}

              <Pressable
                accessibilityRole="button"
                disabled={isSyncing || isImporting}
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

            <View className="gap-1.5">
              <SectionHeader icon={Heart} theme={theme} title="Import Log" />
              <View className="gap-1.5 rounded-kd-md border border-kd-border bg-kd-card p-2.5">
                {logs.length > 0 ? (
                  logs.slice(-10).map((entry, index) => (
                    <View key={`${entry.ts}-${index}`} className="flex-row gap-2">
                      <Text className="w-[48px] shrink-0 text-[10px] text-kd-text-muted">
                        {formatTime(entry.ts)}
                      </Text>
                      <Text className="min-w-0 flex-1 text-[10px] leading-4 text-kd-text-subtle">
                        {entry.message}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text className="text-kd-caption text-kd-text-subtle">ยังไม่มีรายการทำงาน</Text>
                )}
              </View>
            </View>
          </>
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

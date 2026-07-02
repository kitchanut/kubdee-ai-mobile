import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, RefreshControl, TextInput, View } from 'react-native';
import type { ListRenderItem } from 'react-native';
import {
  Cloud,
  Image as ImageIcon,
  Pencil,
  ShoppingBag,
  Trash2,
  Upload,
  X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { toast } from 'sonner-native';

import {
  beginAutomationActivityRun,
  pushAutomationActivityLog,
  setAutomationActivityRunning,
} from '@/activity/automationActivityLogStore';
import { ShopeeLogo, TikTokLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import { useShopeeIncrementalProductSaver } from '@/hooks/useShopeeIncrementalProductSaver';
import { useLibrary } from '@/library/LibraryContext';
import { storePendingTab } from '@/navigation/pendingNavigation';
import type { ProductDeleteResult, ProductImportResult, ProductSyncResult } from '@/library/LibraryContext';
import type { AffiliateProduct } from '@/library/types';
import {
  getAccessibilityStatus,
  importShopeeLikedProducts as runNativeShopeeLikedImport,
  openAccessibilitySettings,
} from '@/native/AccessibilityBridge';
import type { KubdeeTheme } from '@/theme/tokens';

import {
  CardBackdrop,
  DarkActionButton,
  EmptyHint,
  HeaderIconButton,
  LibraryPanelHeader,
  SearchBox,
  SelectCircle,
  SelectionBar,
  SortPill,
  darkButtonContentColor,
  getAccentTone,
  libraryCardStops,
} from './shared';
import {
  ProductCard,
  SHOPEE_IMPORT_AMOUNT_OPTIONS,
  SHOPEE_ORANGE,
  ShopeeImportOptionButton,
  formatShopeeImportResult,
  formatSyncTime,
  getItemCode,
  getProductKey,
  getProductTimestamp,
  getShopeeImportAmountLabel,
  getShopeeImportLimit,
} from './product-panel';
import type { ShopeeImportAmount, ShopeeImportSource, SortKey } from './product-panel';

export default function ProductPanel({
  selectedProfileId,
  theme,
  onSendProductsToAutoPilot,
}: {
  selectedProfileId: string;
  theme: KubdeeTheme;
  onSendProductsToAutoPilot?: (productIds: string[], profileLocalId: string) => void;
}): React.JSX.Element {
  const accent = getAccentTone(theme, theme.emerald);
  const insets = useSafeAreaInsets();
  const {
    products: allProducts,
    isSyncing,
    lastSyncedAt,
    syncError,
    refreshProducts,
    syncProducts,
    importShopeeProducts,
    deleteProducts,
  } = useLibrary();

  // Match desktop: the gallery shows only the active profile's products
  // (getProductsByProfileId), otherwise the same item scraped into several
  // profiles shows up as duplicates.
  const products = useMemo(() => {
    if (!selectedProfileId) {
      return allProducts;
    }

    return allProducts.filter((product) => product.profileLocalId === selectedProfileId);
  }, [allProducts, selectedProfileId]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAscending, setSortAscending] = useState(true);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [isShopeeImporting, setIsShopeeImporting] = useState(false);
  const [shopeeImportModalOpen, setShopeeImportModalOpen] = useState(false);
  const [shopeeImportSource, setShopeeImportSource] = useState<ShopeeImportSource>('liked');
  const [shopeeImportAmount, setShopeeImportAmount] = useState<ShopeeImportAmount>(50);
  const [customShopeeImportAmount, setCustomShopeeImportAmount] = useState('50');

  const appendShopeeLog = useCallback((message: string, ts = Date.now()): void => {
    pushAutomationActivityLog('shopee-import', message, ts);
  }, []);

  const shopeeProductSaver = useShopeeIncrementalProductSaver({
    selectedProfileId,
    importShopeeProducts,
    appendLog: appendShopeeLog,
  });

  const showSyncResult = useCallback((result: ProductSyncResult | null): void => {
    if (!result) {
      return;
    }

    if (result.success) {
      toast.success(`ซิงก์แล้ว ${result.count} รายการ`);
      return;
    }

    toast.error(result.error || 'ซิงก์คลังสินค้าไม่สำเร็จ');
  }, []);

  const showDeleteResult = useCallback((result: ProductDeleteResult | null): void => {
    if (!result) {
      return;
    }

    if (!result.success) {
      toast.error(result.error || 'ลบสินค้าไม่สำเร็จ');
      return;
    }

    if (result.deleted < result.requested) {
      toast.warning(`ลบแล้ว ${result.deleted} จาก ${result.requested} รายการ`);
      return;
    }

    toast.success(`ลบแล้ว ${result.deleted} รายการ`);
  }, []);

  // Shared by the card trash button (single id) and the SelectionBar (selected ids):
  // confirm → optimistic remove + DELETE on the server → re-fetch confirms.
  const confirmDelete = useCallback(
    (localIds: string[]): void => {
      if (localIds.length === 0) {
        return;
      }

      Alert.alert(
        localIds.length === 1 ? 'ลบสินค้านี้?' : `ลบสินค้า ${localIds.length} รายการ?`,
        'สินค้าจะถูกลบออกจากคลังบน Cloud และหายจากแอปอื่นหลังซิงก์',
        [
          { text: 'ยกเลิก', style: 'cancel' },
          {
            text: 'ลบ',
            style: 'destructive',
            onPress: () => {
              void deleteProducts(localIds).then(showDeleteResult);
            },
          },
        ]
      );
    },
    [deleteProducts, showDeleteResult]
  );

  // Drop selections that no longer exist after a re-sync.
  useEffect(() => {
    setSelectedIds((current) => {
      if (current.size === 0) {
        return current;
      }

      const valid = new Set(products.map(getProductKey));
      const next = new Set([...current].filter((id) => valid.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [products]);

  const visibleProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = products.filter((product) => {
      if (!query) return true;
      return [product.name, product.externalProductId ?? '', product.caption ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
    const direction = sortAscending ? 1 : -1;
    filtered.sort((first, second) => {
      if (sortKey === 'name') return direction * first.name.localeCompare(second.name, 'th');
      if (sortKey === 'code') return direction * getItemCode(first).localeCompare(getItemCode(second), 'th');
      return direction * (getProductTimestamp(first) - getProductTimestamp(second));
    });
    return filtered;
  }, [products, searchQuery, sortAscending, sortKey]);

  const allSelected =
    visibleProducts.length > 0 && visibleProducts.every((product) => selectedIds.has(getProductKey(product)));

  const toggleSelect = useCallback((id: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((): void => {
    setSelectedIds(() => {
      if (allSelected) return new Set();
      return new Set(visibleProducts.map((product) => getProductKey(product)));
    });
  }, [allSelected, visibleProducts]);

  const changeSort = useCallback((next: SortKey): void => {
    if (sortKey === next) {
      setSortAscending((current) => !current);
      return;
    }
    setSortKey(next);
    setSortAscending(next !== 'date');
  }, [sortKey]);

  const handleSync = useCallback((): void => {
    if (isSyncing) {
      return;
    }

    void syncProducts().then(showSyncResult);
  }, [isSyncing, showSyncResult, syncProducts]);

  const handleTikTokComingSoon = useCallback((): void => {
    Alert.alert('กำลังพัฒนา', 'ฟีเจอร์ TikTok กำลังพัฒนา');
  }, []);

  const syncShopeeImportQueue = useCallback(async (): Promise<void> => {
    const result = await syncProducts();
    if (!result) {
      appendShopeeLog('บันทึกไว้ในเครื่องแล้ว รอซิงก์ cloud');
      return;
    }

    if (result.success) {
      appendShopeeLog(`ซิงก์ cloud แล้ว ${result.count} รายการ`);
      return;
    }

    appendShopeeLog(result.error || 'ซิงก์ cloud ยังไม่สำเร็จ จะลองใหม่รอบถัดไป');
  }, [appendShopeeLog, syncProducts]);

  const runShopeeImport = useCallback(async (maxItems: number): Promise<void> => {
    if (!selectedProfileId) {
      toast.error('เลือกโปรไฟล์ก่อนนำเข้า Shopee');
      return;
    }

    if (isShopeeImporting || isSyncing) {
      return;
    }

    setIsShopeeImporting(true);
    beginAutomationActivityRun('shopee-import');
    shopeeProductSaver.startSession(selectedProfileId);
    appendShopeeLog(`เริ่มดึงสินค้า Shopee จากสิ่งที่ถูกใจ (${maxItems <= 0 ? 'ทั้งหมด' : `${maxItems} รายการ`})`);

    try {
      await shopeeProductSaver.savePendingProducts();
      const status = await getAccessibilityStatus();
      if (!status.running) {
        appendShopeeLog('หยุดนำเข้า: ยังไม่ได้เปิด Accessibility Service');
        Alert.alert(
          'เปิด Accessibility ก่อน',
          'Kubdee AI ต้องใช้ Accessibility เพื่อเข้า Shopee และอ่านรายการสินค้าถูกใจบนเครื่องนี้',
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

      await storePendingTab('library');
      const scrapedProducts = await runNativeShopeeLikedImport(maxItems, selectedProfileId);
      await shopeeProductSaver.waitForIdle();
      await shopeeProductSaver.savePendingProducts();
      await shopeeProductSaver.waitForIdle();
      await refreshProducts();

      if (scrapedProducts.length === 0 && shopeeProductSaver.getSavedCount() === 0) {
        appendShopeeLog('ไม่พบสินค้า Shopee ที่นำเข้าได้');
        toast.warning('ไม่พบสินค้าใน Shopee ถูกใจ');
        return;
      }

      const result = await shopeeProductSaver.saveRemainingProducts(scrapedProducts);
      if (!result) {
        const savedCount = shopeeProductSaver.getSavedCount();
        const message = `นำเข้า Shopee สำเร็จ ${savedCount} รายการ`;
        appendShopeeLog(message);
        toast.success(message);
        await shopeeProductSaver.clearPendingProducts();
        await syncShopeeImportQueue();
        return;
      }

      if (result.success) {
        const savedCount = shopeeProductSaver.getSavedCount();
        const message = savedCount > 0
          ? formatShopeeImportResult({ ...result, imported: savedCount })
          : formatShopeeImportResult(result);
        appendShopeeLog(message);
        toast.success(message);
        await shopeeProductSaver.clearPendingProducts();
        await syncShopeeImportQueue();
        return;
      }

      const message = result.error || 'นำเข้าสินค้า Shopee ไม่สำเร็จ';
      appendShopeeLog(message);
      toast.error(message);
    } catch (error) {
      await shopeeProductSaver.waitForIdle();
      await shopeeProductSaver.savePendingProducts();
      await refreshProducts();
      const message = error instanceof Error ? error.message : String(error);
      appendShopeeLog(message);
      toast.error(message);
    } finally {
      shopeeProductSaver.stopSession();
      setIsShopeeImporting(false);
      setAutomationActivityRunning('shopee-import', false);
    }
  }, [
    appendShopeeLog,
    isShopeeImporting,
    isSyncing,
    refreshProducts,
    selectedProfileId,
    shopeeProductSaver,
    syncShopeeImportQueue,
  ]);

  const openShopeeImportModal = useCallback((): void => {
    if (!selectedProfileId) {
      toast.error('เลือกโปรไฟล์ก่อนนำเข้า Shopee');
      return;
    }

    if (isShopeeImporting || isSyncing) {
      return;
    }

    setShopeeImportModalOpen(true);
  }, [isShopeeImporting, isSyncing, selectedProfileId]);

  const startShopeeImportFromModal = useCallback((): void => {
    if (shopeeImportSource === 'offers') {
      toast.info('ข้อเสนอกำลังพัฒนา');
      return;
    }

    const limit = getShopeeImportLimit(shopeeImportAmount, customShopeeImportAmount);
    if (limit === null) {
      toast.error('กรุณากรอกจำนวนที่ต้องการดึง');
      return;
    }

    setShopeeImportModalOpen(false);
    void runShopeeImport(limit);
  }, [customShopeeImportAmount, runShopeeImport, shopeeImportAmount, shopeeImportSource]);

  const shopeeImportAmountOptions = useMemo(
    () => SHOPEE_IMPORT_AMOUNT_OPTIONS.filter((option) => shopeeImportSource === 'liked' || option.value !== 'all'),
    [shopeeImportSource]
  );

  useEffect(() => {
    if (shopeeImportSource !== 'liked' && shopeeImportAmount === 'all') {
      setShopeeImportAmount(50);
    }
  }, [shopeeImportAmount, shopeeImportSource]);

  const handlePullRefresh = (): void => {
    if (isSyncing) {
      return;
    }

    setIsPullRefreshing(true);
    void syncProducts()
      .then(showSyncResult)
      .finally(() => {
        setIsPullRefreshing(false);
      });
  };

  const handleDeleteSelected = (): void => {
    confirmDelete(
      products
        .filter((product) => selectedIds.has(getProductKey(product)))
        .map((product) => product.localId)
    );
  };

  const handleSendSelectedToAutoPilot = (): void => {
    if (!selectedProfileId) {
      toast.error('เลือกโปรไฟล์ก่อนส่งเข้า Auto Pilot');
      return;
    }

    const selectedProducts = products.filter((product) => selectedIds.has(getProductKey(product)));
    const productIds = selectedProducts.map((product) => product.localId).filter(Boolean);
    if (productIds.length === 0) {
      toast.error('เลือกสินค้าก่อนส่งเข้า Auto Pilot');
      return;
    }

    onSendProductsToAutoPilot?.(productIds, selectedProfileId);
    setSelectedIds(new Set());
    toast.success(`ส่งสินค้า ${productIds.length} รายการไป Auto Pilot`);
  };

  const renderProductItem = useCallback<ListRenderItem<AffiliateProduct>>(
    ({ item }) => {
      const key = getProductKey(item);

      return (
        <ProductCard
          product={item}
          selected={selectedIds.has(key)}
          theme={theme}
          onPress={() => toggleSelect(key)}
          onDelete={() => confirmDelete([item.localId])}
        />
      );
    },
    [confirmDelete, selectedIds, theme, toggleSelect]
  );

  const productItemSeparator = useCallback(() => <View className="h-2" />, []);

  return (
    <View className="flex-1">
      <FlatList
        data={visibleProducts}
        extraData={selectedIds}
        keyExtractor={getProductKey}
        renderItem={renderProductItem}
        ItemSeparatorComponent={productItemSeparator}
        initialNumToRender={12}
        keyboardShouldPersistTaps="handled"
        maxToRenderPerBatch={10}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        contentContainerClassName="px-3 pb-20 pt-3"
        refreshControl={
          <RefreshControl
            refreshing={isPullRefreshing}
            onRefresh={handlePullRefresh}
            tintColor={theme.textSubtle}
            colors={[theme.emerald]}
          />
        }
        ListHeaderComponent={
          <View className="gap-3 pb-2">
            <LibraryPanelHeader
              theme={theme}
              title="คลังสินค้า"
              count={visibleProducts.length}
              total={products.length}
              suffix={lastSyncedAt ? ` · ซิงก์ล่าสุด ${formatSyncTime(lastSyncedAt)}` : ''}
              icon={ShoppingBag}
              tone={accent}
              actions={
                <>
                  {isSyncing ? (
                    <View className="h-7 w-7 items-center justify-center">
                      <ActivityIndicator color={accent.color} size="small" />
                    </View>
                  ) : (
                    <HeaderIconButton theme={theme} icon={Cloud} label="ซิงก์คลังสินค้า" onPress={handleSync} />
                  )}
                  <HeaderIconButton theme={theme} icon={Upload} label="อัพโหลดสินค้า" />
                  <DarkActionButton
                    theme={theme}
                    small
                    iconOnly
                    label="ShowCase"
                    leading={<TikTokLogo size={12} color={darkButtonContentColor(theme)} />}
                    onPress={handleTikTokComingSoon}
                  />
                  <DarkActionButton
                    theme={theme}
                    small
                    iconOnly
                    label="Shopee"
                    color={SHOPEE_ORANGE}
                    disabled={isShopeeImporting || isSyncing}
                    leading={
                      isShopeeImporting ? (
                        <ActivityIndicator color={theme.white} size="small" />
                      ) : (
                        <ShopeeLogo size={12} color={theme.white} cutoutColor={SHOPEE_ORANGE} />
                      )
                    }
                    onPress={openShopeeImportModal}
                  />
                </>
              }
            />

            {syncError && products.length > 0 ? (
              <View className="rounded-kd-lg border border-kd-red/35 bg-kd-red/5 px-2.5 py-2 dark:bg-kd-red/10">
                <Text className="text-kd-caption font-semibold leading-4 text-kd-red">{syncError}</Text>
              </View>
            ) : null}

            {products.length > 0 ? (
              <View className="gap-2">
                <SearchBox
                  theme={theme}
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="ค้นหาชื่อ/รหัสสินค้า..."
                />

                <View className="flex-row items-center justify-between">
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: allSelected }}
                    onPress={toggleAll}
                    className="min-h-6 flex-row items-center gap-1.5"
                  >
                    <SelectCircle theme={theme} selected={allSelected} accent={theme.emerald} size={15} />
                    <Text className="text-kd-caption text-kd-text-subtle">
                      ทั้งหมด ({visibleProducts.length})
                    </Text>
                  </Pressable>

                  <View className="flex-row items-center gap-1">
                    <SortPill
                      theme={theme}
                      accent={theme.emerald}
                      active={sortKey === 'name'}
                      ascending={sortAscending}
                      label="ชื่อ"
                      onPress={() => changeSort('name')}
                    />
                    <SortPill
                      theme={theme}
                      accent={theme.emerald}
                      active={sortKey === 'code'}
                      ascending={sortAscending}
                      label="รหัส"
                      onPress={() => changeSort('code')}
                    />
                    <SortPill
                      theme={theme}
                      accent={theme.emerald}
                      active={sortKey === 'date'}
                      ascending={sortAscending}
                      label="วันที่"
                      onPress={() => changeSort('date')}
                    />
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          products.length === 0 ? (
            isSyncing ? (
              <View className="items-center gap-2 px-6 py-11">
                <ActivityIndicator color={theme.emerald} size="small" />
                <Text className="text-kd-caption text-kd-text-subtle">กำลังซิงก์คลังสินค้า...</Text>
              </View>
            ) : syncError ? (
              <View className="items-center gap-2 px-6 py-11">
                <View className="h-16 w-16 items-center justify-center rounded-full bg-kd-red/5 dark:bg-kd-red/10">
                  <ShoppingBag size={30} color={theme.red} strokeWidth={1.5} />
                </View>
                <Text className="mt-1.5 max-w-[240px] text-center text-kd-caption leading-4 text-kd-red">
                  {syncError}
                </Text>
                <View className="mt-1">
                  <DarkActionButton theme={theme} label="ลองใหม่" onPress={handleSync} />
                </View>
              </View>
            ) : (
              <View className="items-center gap-2 px-6 py-11">
                <View className="h-16 w-16 items-center justify-center rounded-full bg-kd-panel-muted dark:bg-kd-card-muted">
                  <ShoppingBag size={30} color={theme.textSubtle} strokeWidth={1.5} />
                </View>
                <Text className="mt-1.5 text-[13px] font-semibold text-kd-text-muted">ยังไม่มีสินค้า</Text>
                <Text className="max-w-[220px] text-center text-kd-caption leading-4 text-kd-text-subtle">
                  ดึงจาก Shopee บนมือถือ หรือซิงก์จาก Cloud ได้เลย
                </Text>
                <View className="mt-1">
                  <DarkActionButton
                    theme={theme}
                    label="ซิงก์คลังสินค้า"
                    leading={<Cloud size={12} color={darkButtonContentColor(theme)} strokeWidth={2} />}
                    onPress={handleSync}
                  />
                </View>
              </View>
            )
          ) : (
            <EmptyHint theme={theme} label="ไม่พบสินค้าที่ตรงกับคำค้นหา" />
          )
        }
      />

      <Modal
        animationType="fade"
        transparent
        visible={shopeeImportModalOpen}
        onRequestClose={() => setShopeeImportModalOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/45">
          <Pressable
            accessibilityLabel="ปิดตัวเลือก Shopee"
            accessibilityRole="button"
            className="flex-1"
            onPress={() => setShopeeImportModalOpen(false)}
          />
          <View
            className="rounded-t-[20px] border border-kd-border bg-kd-panel px-4 pt-4"
            style={{ paddingBottom: Math.max(insets.bottom + 12, 20) }}
          >
            <View className="flex-row items-center justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text className="text-kd-title font-semibold text-kd-text">ดึงสินค้า Shopee</Text>
                <Text className="mt-0.5 text-kd-caption text-kd-text-subtle">
                  เลือกแหล่งสินค้าและจำนวนที่จะนำเข้า
                </Text>
              </View>
              <Pressable
                accessibilityLabel="ปิด"
                accessibilityRole="button"
                onPress={() => setShopeeImportModalOpen(false)}
                className="h-8 w-8 items-center justify-center rounded-full bg-kd-card-muted"
              >
                <X size={16} color={theme.textSubtle} strokeWidth={2.4} />
              </Pressable>
            </View>

            <View className="mt-4 gap-2">
              <Text className="text-kd-caption font-semibold text-kd-text-subtle">แหล่งสินค้า</Text>
              <View className="flex-row gap-2">
                <ShopeeImportOptionButton
                  active={shopeeImportSource === 'liked'}
                  label="ถูกใจ"
                  onPress={() => setShopeeImportSource('liked')}
                />
                <ShopeeImportOptionButton
                  active={shopeeImportSource === 'offers'}
                  disabled
                  label="ข้อเสนอ"
                  soon
                  onPress={() => setShopeeImportSource('offers')}
                />
              </View>
            </View>

            <View className="mt-4 gap-2">
              <Text className="text-kd-caption font-semibold text-kd-text-subtle">จำนวนที่จะดึง</Text>
              <View className="flex-row flex-wrap gap-2">
                {shopeeImportAmountOptions.map((option) => (
                  <ShopeeImportOptionButton
                    key={String(option.value)}
                    active={shopeeImportAmount === option.value}
                    compact
                    label={option.label}
                    onPress={() => setShopeeImportAmount(option.value)}
                  />
                ))}
              </View>

              {shopeeImportAmount === 'custom' ? (
                <View className="mt-1 gap-1.5">
                  <TextInput
                    value={customShopeeImportAmount}
                    onChangeText={(value) => setCustomShopeeImportAmount(value.replace(/[^\d]/g, ''))}
                    keyboardType="number-pad"
                    placeholder="จำนวนสินค้า"
                    placeholderTextColor={theme.textMuted}
                    className="h-11 rounded-kd-lg border border-kd-border bg-kd-input px-3 text-kd-body text-kd-text"
                  />
                  <Text className="text-kd-caption text-kd-text-muted">ระบบจะดึงตามจำนวนที่กรอก</Text>
                </View>
              ) : null}
            </View>

            <View className="mt-5 flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                onPress={() => setShopeeImportModalOpen(false)}
                className="h-11 flex-1 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-card"
              >
                <Text className="text-kd-body font-medium text-kd-text-subtle">ยกเลิก</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={startShopeeImportFromModal}
                className="h-11 flex-[1.2] items-center justify-center rounded-kd-lg"
                style={{ backgroundColor: SHOPEE_ORANGE }}
              >
                <Text className="text-kd-body font-semibold text-white">
                  เริ่มดึง {getShopeeImportAmountLabel(shopeeImportAmount, customShopeeImportAmount)}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {selectedIds.size > 0 ? (
        <SelectionBar
          theme={theme}
          accent={theme.emerald}
          count={selectedIds.size}
          showAuto
          onAuto={handleSendSelectedToAutoPilot}
          onClear={() => setSelectedIds(new Set())}
          onDelete={handleDeleteSelected}
        />
      ) : null}
    </View>
  );
}

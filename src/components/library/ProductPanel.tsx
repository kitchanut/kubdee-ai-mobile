import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import {
  Cloud,
  Image as ImageIcon,
  Pencil,
  ShoppingBag,
  Square,
  Trash2,
  Upload,
} from 'lucide-react-native';

import { toast } from 'sonner-native';

import { ShopeeLogo, TikTokLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import { useLibrary } from '@/library/LibraryContext';
import type { ProductDeleteResult, ProductSyncResult } from '@/library/LibraryContext';
import type { AffiliateProduct } from '@/library/types';
import {
  getAccessibilityStatus,
  importShopeeLikedProducts as runNativeShopeeLikedImport,
  openAccessibilitySettings,
  stopShopeeAutomation,
  subscribeShopeeImportLogs,
} from '@/native/AccessibilityBridge';
import type { NativeShopeeImportLog } from '@/native/AccessibilityBridge';
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

type SortKey = 'name' | 'code' | 'date';

/** Shopee brand orange — matches the ShopeeLogo default fill */
const SHOPEE_ORANGE = '#EE4D2D';

function getProductKey(product: AffiliateProduct): string {
  return String(product.id ?? product.localId);
}

function getItemCode(product: AffiliateProduct): string {
  return product.externalProductId || product.localId.slice(0, 8);
}

/** Match extension: "#1729457066223503831" → "#172...831" (only when shortening saves space) */
function shortenItemCode(code: string): string {
  return code.length > 9 ? `${code.slice(0, 3)}...${code.slice(-3)}` : code;
}

/** Decimal string ("229.00") → "฿229.00", null → "-" */
function formatPrice(price: string | null): string {
  if (!price) {
    return '-';
  }

  const numeric = Number(price);
  if (!Number.isFinite(numeric)) {
    return `฿${price}`;
  }

  return `฿${new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric)}`;
}

/** 3336 → "3,336 ชิ้น", null → "-" */
function formatStock(stock: number | null): string {
  if (typeof stock !== 'number' || !Number.isFinite(stock)) {
    return '-';
  }

  return `${new Intl.NumberFormat('th-TH').format(stock)} ชิ้น`;
}

const SOURCE_LABELS: Record<string, string> = {
  desktop: 'Desktop',
  extension: 'Extension',
  mobile: 'Mobile',
  web: 'Web',
};

function getSourceLabel(value: string | null | undefined): string | null {
  const normalized = (value ?? '').trim().toLowerCase();
  if (!normalized || normalized === 'unknown') {
    return null;
  }

  return SOURCE_LABELS[normalized] ?? normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/** App that created the product row, e.g. 'desktop' → "Desktop" */
function getCreatedByLabel(product: AffiliateProduct): string | null {
  return getSourceLabel(product.createdByApp ?? product.originApp);
}

/** App that last updated the row — shown only when it differs from the creator */
function getUpdatedByLabel(product: AffiliateProduct): string | null {
  const updated = getSourceLabel(product.updatedByApp);
  return updated && updated !== getCreatedByLabel(product) ? updated : null;
}

function getPlatformLabel(platform: string | null): string | null {
  const normalized = (platform ?? '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === 'tiktok') {
    return 'TikTok';
  }

  if (normalized === 'shopee') {
    return 'Shopee';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function toMillis(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function getProductTimestamp(product: AffiliateProduct): number {
  return (
    toMillis(product.localCreatedAt) ||
    toMillis(product.scrapedAt) ||
    toMillis(product.createdAt) ||
    toMillis(product.lastSyncedAt)
  );
}

function formatSyncTime(timestamp: number): string {
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export default function ProductPanel({
  selectedProfileId,
  theme,
}: {
  selectedProfileId: string;
  theme: KubdeeTheme;
}): React.JSX.Element {
  const accent = getAccentTone(theme, theme.emerald);
  const {
    products: allProducts,
    isSyncing,
    lastSyncedAt,
    syncError,
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
  const [isStoppingShopee, setIsStoppingShopee] = useState(false);
  const [shopeeLogs, setShopeeLogs] = useState<NativeShopeeImportLog[]>([]);

  const appendShopeeLog = useCallback((message: string, ts = Date.now()): void => {
    setShopeeLogs((current) => [...current, { message, ts }].slice(-80));
  }, []);

  useEffect(() => {
    const subscription = subscribeShopeeImportLogs((entry) => {
      setShopeeLogs((current) => [...current, entry].slice(-80));
    });

    return () => {
      subscription?.remove();
    };
  }, []);

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

  const toggleSelect = (id: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (): void => {
    setSelectedIds(() => {
      if (allSelected) return new Set();
      return new Set(visibleProducts.map((product) => getProductKey(product)));
    });
  };

  const changeSort = (next: SortKey): void => {
    if (sortKey === next) {
      setSortAscending((current) => !current);
      return;
    }
    setSortKey(next);
    setSortAscending(next !== 'date');
  };

  const handleSync = (): void => {
    if (isSyncing) {
      return;
    }

    void syncProducts().then(showSyncResult);
  };

  const handleShopeeImport = useCallback(async (): Promise<void> => {
    if (!selectedProfileId) {
      toast.error('เลือกโปรไฟล์ก่อนนำเข้า Shopee');
      return;
    }

    if (isShopeeImporting || isSyncing) {
      return;
    }

    setIsShopeeImporting(true);
    setIsStoppingShopee(false);
    setShopeeLogs([]);
    appendShopeeLog('เริ่มดึงสินค้า Shopee จากสิ่งที่ถูกใจ');

    try {
      const status = await getAccessibilityStatus();
      if (!status.running) {
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

      const scrapedProducts = await runNativeShopeeLikedImport(50);
      if (scrapedProducts.length === 0) {
        toast.warning('ไม่พบสินค้าใน Shopee ถูกใจ');
        return;
      }

      const result = await importShopeeProducts(selectedProfileId, scrapedProducts);
      if (!result) {
        toast.warning('คลังสินค้ากำลังซิงก์อยู่ ลองใหม่อีกครั้ง');
        return;
      }

      if (result.success) {
        toast.success(`นำเข้า Shopee ${result.imported} รายการ`);
        return;
      }

      toast.error(result.error || 'นำเข้าสินค้า Shopee ไม่สำเร็จ');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsShopeeImporting(false);
      setIsStoppingShopee(false);
    }
  }, [appendShopeeLog, importShopeeProducts, isShopeeImporting, isSyncing, selectedProfileId]);

  const handleStopShopeeImport = useCallback(async (): Promise<void> => {
    if (!isShopeeImporting || isStoppingShopee) {
      return;
    }

    setIsStoppingShopee(true);
    appendShopeeLog('กำลังส่งคำสั่งหยุด Shopee import...');
    const stopped = await stopShopeeAutomation();
    if (!stopped) {
      toast.warning('ยังหยุดไม่ได้ เพราะไม่พบ Accessibility Service ที่กำลังทำงาน');
      setIsStoppingShopee(false);
      return;
    }
    toast.success('ส่งคำสั่งหยุด Shopee import แล้ว');
  }, [appendShopeeLog, isShopeeImporting, isStoppingShopee]);

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

  return (
    <View className="flex-1">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="gap-3 px-3 pb-20 pt-3"
        refreshControl={
          <RefreshControl
            refreshing={isPullRefreshing}
            onRefresh={handlePullRefresh}
            tintColor={theme.textSubtle}
            colors={[theme.emerald]}
          />
        }
      >
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
                onPress={handleShopeeImport}
              />
            </>
          }
        />

        {syncError && products.length > 0 ? (
          <View className="rounded-kd-lg border border-kd-red/35 bg-kd-red/5 px-2.5 py-2 dark:bg-kd-red/10">
            <Text className="text-kd-caption font-semibold leading-4 text-kd-red">{syncError}</Text>
          </View>
        ) : null}

        {isShopeeImporting || shopeeLogs.length > 0 ? (
          <ShopeeImportLogPanel
            theme={theme}
            logs={shopeeLogs}
            isRunning={isShopeeImporting}
            isStopping={isStoppingShopee}
            onStop={() => {
              void handleStopShopeeImport();
            }}
            onClear={() => setShopeeLogs([])}
          />
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

        <View className="gap-2">
          {visibleProducts.map((product) => {
            const key = getProductKey(product);

            return (
              <ProductCard
                key={key}
                product={product}
                selected={selectedIds.has(key)}
                theme={theme}
                onPress={() => toggleSelect(key)}
                onDelete={() => confirmDelete([product.localId])}
              />
            );
          })}
        </View>

        {products.length === 0 ? (
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
        ) : null}

        {products.length > 0 && visibleProducts.length === 0 ? (
          <EmptyHint theme={theme} label="ไม่พบสินค้าที่ตรงกับคำค้นหา" />
        ) : null}
      </ScrollView>

      {selectedIds.size > 0 ? (
        <SelectionBar
          theme={theme}
          accent={theme.emerald}
          count={selectedIds.size}
          showAuto
          onClear={() => setSelectedIds(new Set())}
          onDelete={handleDeleteSelected}
        />
      ) : null}
    </View>
  );
}

function ShopeeImportLogPanel({
  theme,
  logs,
  isRunning,
  isStopping,
  onStop,
  onClear,
}: {
  theme: KubdeeTheme;
  logs: NativeShopeeImportLog[];
  isRunning: boolean;
  isStopping: boolean;
  onStop: () => void;
  onClear: () => void;
}): React.JSX.Element {
  const visibleLogs = logs.slice(-9);

  return (
    <View className="gap-2 rounded-[14px] border border-kd-emerald/25 bg-kd-panel px-3 py-2.5 dark:border-kd-emerald/20 dark:bg-kd-card">
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1">
          <Text className="text-[12px] font-semibold text-kd-text">Activity Log</Text>
          <Text className="mt-0.5 text-kd-caption text-kd-text-subtle">
            {isRunning ? 'กำลังดึงสินค้า Shopee' : `ล่าสุด ${logs.length} รายการ`}
          </Text>
        </View>

        <View className="flex-row items-center gap-1.5">
          {!isRunning && logs.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={onClear}
              className="h-8 justify-center rounded-full border border-gray-200 px-3 dark:border-kd-border"
            >
              <Text className="text-kd-caption font-semibold text-kd-text-subtle">ล้าง</Text>
            </Pressable>
          ) : null}

          {isRunning ? (
            <DarkActionButton
              theme={theme}
              small
              label={isStopping ? 'กำลังหยุด' : 'Stop'}
              color={theme.red}
              disabled={isStopping}
              leading={
                isStopping ? (
                  <ActivityIndicator color={theme.white} size="small" />
                ) : (
                  <Square size={12} color={theme.white} fill={theme.white} strokeWidth={2} />
                )
              }
              onPress={onStop}
            />
          ) : null}
        </View>
      </View>

      <View className="gap-1.5 rounded-[10px] bg-kd-panel-muted px-2.5 py-2 dark:bg-kd-card-muted">
        {visibleLogs.length > 0 ? (
          visibleLogs.map((entry, index) => (
            <View key={`${entry.ts}-${index}`} className="flex-row gap-2">
              <Text className="w-[48px] shrink-0 text-[10px] text-kd-text-muted">
                {formatSyncTime(entry.ts)}
              </Text>
              <Text className="min-w-0 flex-1 text-[10px] leading-4 text-kd-text-subtle">
                {entry.message}
              </Text>
            </View>
          ))
        ) : (
          <Text className="text-kd-caption text-kd-text-subtle">รอข้อความจาก Shopee import...</Text>
        )}
      </View>
    </View>
  );
}

/**
 * Extension ProductCatalogPanel card:
 * rounded-xl border / emerald wash background / 56px thumb / name 11px semibold /
 * #id 9px / platform chip + profile meta / price emerald + stock / edit + delete buttons
 */
function ProductCard({
  product,
  selected,
  theme,
  onPress,
  onDelete,
}: {
  product: AffiliateProduct;
  selected: boolean;
  theme: KubdeeTheme;
  onPress: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const platformLabel = getPlatformLabel(product.platform);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`overflow-hidden rounded-[12px] border bg-kd-panel ${
        selected ? 'border-kd-emerald' : 'border-gray-100 dark:border-kd-border'
      }`}
      style={{
        elevation: 1,
        shadowOffset: { height: 1, width: 0 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      }}
    >
      <CardBackdrop theme={theme} id="products" stops={libraryCardStops.products} />

      <View className="flex-row items-center gap-2.5 p-2">
        <View className="h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border-2 border-white bg-kd-panel-muted dark:border-kd-border-strong dark:bg-kd-card-muted">
          {product.imageUrl ? (
            <Image
              source={{ uri: product.imageUrl }}
              resizeMode="cover"
              accessibilityLabel={product.name}
              className="h-full w-full"
            />
          ) : (
            <ImageIcon size={20} color={theme.textSubtle} strokeWidth={1.5} />
          )}
        </View>

        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1.5">
            <Text numberOfLines={1} className="min-w-0 flex-shrink text-kd-body font-semibold text-kd-text">
              {product.name}
            </Text>
            {platformLabel ? (
              <View className="shrink-0 rounded-full bg-kd-panel-muted px-1.5 py-px dark:bg-kd-card-muted">
                <Text className="text-[8px] font-medium text-kd-text-muted">{platformLabel}</Text>
              </View>
            ) : null}
          </View>
          <Text numberOfLines={1} className="mt-0.5 text-kd-micro text-kd-text-subtle">
            #{shortenItemCode(getItemCode(product))}
            {getCreatedByLabel(product) ? ` · Created by ${getCreatedByLabel(product)}` : ''}
            {getUpdatedByLabel(product) ? ` · Updated by ${getUpdatedByLabel(product)}` : ''}
          </Text>

          <View className="mt-1 flex-row items-center justify-between">
            <View className="flex-row items-center gap-1">
              <Text className="text-kd-caption font-medium text-kd-emerald">{formatPrice(product.price)}</Text>
              <Text className="text-kd-micro text-kd-text-subtle">·</Text>
              <Text className="text-kd-micro text-kd-text-muted">{formatStock(product.stock)}</Text>
            </View>

            <View className="shrink-0 flex-row items-center gap-1">
              <Pressable
                accessibilityLabel="แก้ไข"
                accessibilityRole="button"
                className="h-[22px] w-[22px] items-center justify-center rounded-kd-md bg-white/60 dark:bg-kd-card-muted/60"
              >
                <Pencil size={11} color={theme.textSubtle} strokeWidth={2} />
              </Pressable>
              <Pressable
                accessibilityLabel="ลบ"
                accessibilityRole="button"
                onPress={onDelete}
                className="h-[22px] w-[22px] items-center justify-center rounded-kd-md bg-white/60 dark:bg-kd-card-muted/60"
              >
                <Trash2 size={11} color={theme.textSubtle} strokeWidth={2} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Linking, Modal, PermissionsAndroid, Platform, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import type { ListRenderItem } from 'react-native';
import {
  Cloud,
  Image as ImageIcon,
  Link2,
  Pencil,
  ShoppingBag,
  Upload,
  X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

import { toast } from 'sonner-native';

import {
  beginAutomationActivityRun,
  pushAutomationActivityLog,
  setAutomationActivityRunning,
} from '@/activity/automationActivityLogStore';
import { useAuth } from '@/auth/AuthContext';
import { ShopeeLogo, TikTokLogo } from '@/components/BrandLogos';
import Text from '@/components/ui/KubdeeText';
import { useShopeeIncrementalProductSaver } from '@/hooks/useShopeeIncrementalProductSaver';
import { useLibrary } from '@/library/LibraryContext';
import { storePendingTab } from '@/navigation/pendingNavigation';
import type { ProductDeleteResult, ProductSyncResult } from '@/library/LibraryContext';
import { isDisplayableProductImageUri } from '@/library/productImageCache';
import { isShopeeShortLink } from '@/library/shopeeLinks';
import type { AffiliateProduct } from '@/library/types';
import {
  clearPendingShopeeConvertResults,
  convertShopeeLinks as runNativeShopeeLinkConversion,
  getAccessibilityStatus,
  getPendingShopeeConvertResults,
  importShopeeProducts as runNativeShopeeImport,
  openAccessibilitySettings,
} from '@/native/AccessibilityBridge';
import type { KubdeeTheme } from '@/theme/tokens';

import { LabeledTextInput } from './media-panel/controls';
import {
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
} from './shared';
import {
  ProductCard,
  SHOPEE_IMPORT_AMOUNT_OPTIONS,
  SHOPEE_OFFER_CATEGORY_OPTIONS,
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
import type { ShopeeImportAmount, ShopeeImportSource, ShopeeOfferCategory, SortKey } from './product-panel';

function formatProfileDebugId(profileId: string): string {
  const cleanProfileId = profileId.trim();
  return cleanProfileId ? cleanProfileId.slice(0, 8) : 'ทั้งหมด';
}

function formatUserDebugLabel(user: { id?: string | null; email?: string | null } | null): string {
  const email = user?.email?.trim();
  const userId = user?.id?.trim();
  const shortUserId = userId ? userId.slice(0, 8) : 'no-user';
  return email ? `${email} (${shortUserId})` : shortUserId;
}

function getAndroidApiLevel(): number {
  const version = Platform.Version;
  return typeof version === 'number' ? version : Number.parseInt(String(version), 10) || 0;
}

type ProductEditForm = {
  name: string;
  externalProductId: string;
  productUrl: string;
  price: string;
  stock: string;
  description: string;
  caption: string;
  hashtags: string;
  cta: string;
};

type ProductEditImageOverride = {
  uri: string;
  mimeType: string | null;
  size: number | null;
};

const EMPTY_PRODUCT_EDIT_FORM: ProductEditForm = {
  caption: '',
  cta: '',
  description: '',
  externalProductId: '',
  hashtags: '',
  name: '',
  price: '',
  productUrl: '',
  stock: '',
};

function cleanFormText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function createProductEditForm(product: AffiliateProduct): ProductEditForm {
  return {
    caption: product.caption ?? '',
    cta: product.cta ?? '',
    description: product.description ?? '',
    externalProductId: product.externalProductId ?? '',
    hashtags: product.hashtags ?? '',
    name: product.name ?? '',
    price: product.price ?? '',
    productUrl: product.productUrl ?? '',
    stock: typeof product.stock === 'number' && Number.isFinite(product.stock) ? String(product.stock) : '',
  };
}

function parseProductEditStock(value: string): number | null {
  const cleaned = value.replace(/[^\d]/g, '');
  if (!cleaned) {
    return null;
  }

  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function getProductEditImageUri(product: AffiliateProduct): string | null {
  return Array.from(new Set([product.imagePath, product.imageUrl]))
    .find((uri): uri is string => isDisplayableProductImageUri(uri)) ?? null;
}

// Photo-read permission for the "offers" import. Offer images prefer a permission-free product
// image URL and only use this permission for the MediaStore download fallback (products that
// expose no usable URL). When it is NOT granted we warn before EVERY offer import so the user
// knows some images may be missing, and let them grant, continue anyway, or cancel. Returns false
// (import aborted) when the user cancels or when we send them to Settings to grant a permission the
// system has blocked from re-prompting; otherwise proceeds best-effort (URL-only when denied).
// Not relevant to the "liked" import, which reads image URLs directly and needs no permission.
async function confirmShopeeOfferImagePermission(
  source: ShopeeImportSource,
  appendLog: (message: string, ts?: number) => void
): Promise<boolean> {
  if (source !== 'offers' || Platform.OS !== 'android') {
    return true;
  }

  const apiLevel = getAndroidApiLevel();
  const permission = apiLevel >= 33
    ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
    : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

  if (await PermissionsAndroid.check(permission)) {
    return true;
  }

  const choice = await new Promise<'grant' | 'continue' | 'cancel'>((resolve) => {
    Alert.alert(
      'ยังไม่ได้ให้สิทธิ์รูปภาพ',
      'การนำเข้า "ข้อเสนอ" Shopee ยังทำงานได้ แต่รูปสินค้าบางรายการที่ไม่มีลิงก์รูปโดยตรงอาจไม่แสดง หากต้องการรูปครบที่สุด กด "ให้สิทธิ์รูป" แล้วเลือก "อนุญาตทั้งหมด"',
      [
        { text: 'ยกเลิก', style: 'cancel', onPress: () => resolve('cancel') },
        { text: 'ดึงต่อไปเลย', onPress: () => resolve('continue') },
        { text: 'ให้สิทธิ์รูป', onPress: () => resolve('grant') },
      ],
      { cancelable: false }
    );
  });

  if (choice === 'cancel') {
    appendLog('ยกเลิกการนำเข้า: ยังไม่ได้ให้สิทธิ์รูปภาพ');
    return false;
  }

  if (choice === 'grant') {
    const result = await PermissionsAndroid.request(permission, {
      title: 'อนุญาตอ่านรูปสินค้า',
      message: 'ใช้เพื่ออ่านรูปที่ Shopee ดาวน์โหลดจากแผงแชร์ (เฉพาะข้อเสนอที่ไม่มีลิงก์รูปโดยตรง)',
      buttonPositive: 'อนุญาตทั้งหมด',
      buttonNegative: 'ข้าม',
    });
    // On Android 14+ "Select photos" grants only READ_MEDIA_VISUAL_USER_SELECTED, so a full
    // READ_MEDIA_IMAGES check still returns false here — treat that as the URL-only path too.
    if (result === PermissionsAndroid.RESULTS.GRANTED && await PermissionsAndroid.check(permission)) {
      appendLog('ได้รับสิทธิ์อ่านรูปภาพแล้ว รูปข้อเสนอจะครบที่สุด');
      return true;
    }
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      // The system won't show the dialog anymore — send the user to Settings and stop this run so
      // they can grant there, then re-import and get complete images from the first pass.
      appendLog('ยกเลิกการนำเข้า: เปิดหน้าตั้งค่าให้แล้ว โปรดเปิดสิทธิ์รูปภาพแล้วกดดึงใหม่');
      void Linking.openSettings();
      return false;
    }
    appendLog('ยังไม่ได้สิทธิ์อ่านรูปแบบเต็ม: ดึงต่อโดยใช้ลิงก์รูปแทน');
    return true;
  }

  appendLog('ดึงต่อโดยยังไม่ให้สิทธิ์รูป: รูปข้อเสนอจะใช้ลิงก์รูปแทน (บางรายการที่ไม่มีลิงก์อาจไม่มีรูป)');
  return true;
}

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
  const { user } = useAuth();
  const {
    products: allProducts,
    isSyncing,
    lastSyncedAt,
    syncError,
    refreshProducts,
    syncProducts,
    importShopeeProducts,
    updateProduct,
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
  const [shopeeOfferCategory, setShopeeOfferCategory] = useState<ShopeeOfferCategory>('แนะนำ');
  const [shopeeImportAmount, setShopeeImportAmount] = useState<ShopeeImportAmount>(50);
  const [customShopeeImportAmount, setCustomShopeeImportAmount] = useState('50');
  const [editingProduct, setEditingProduct] = useState<AffiliateProduct | null>(null);
  const [editForm, setEditForm] = useState<ProductEditForm>(EMPTY_PRODUCT_EDIT_FORM);
  const [editImageOverride, setEditImageOverride] = useState<ProductEditImageOverride | null>(null);
  const [isProductEditSaving, setIsProductEditSaving] = useState(false);
  const [isConvertingShopeeLinks, setIsConvertingShopeeLinks] = useState(false);

  // สินค้า Shopee ของโปรไฟล์ที่เลือก ที่ลิงก์ยังเป็นลิงก์เต็ม (ไม่ใช่ s.shopee short link)
  // ช่องค้นหาสินค้าตอนโพสต์ Shopee ใช้ได้เฉพาะ short link เท่านั้น
  const shopeeLinkConvertCandidates = useMemo(
    () =>
      selectedProfileId
        ? products.filter(
            (product) =>
              (product.platform ?? '').toLowerCase().includes('shopee') &&
              !!product.productUrl?.trim() &&
              !isShopeeShortLink(product.productUrl)
          )
        : [],
    [products, selectedProfileId]
  );

  const editingProductImageUri = useMemo(
    () => editImageOverride?.uri ?? (editingProduct ? getProductEditImageUri(editingProduct) : null),
    [editImageOverride, editingProduct]
  );

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

    const profileDebugId = formatProfileDebugId(selectedProfileId);

    if (result.success) {
      const syncedCount = result.profileCount ?? result.count;
      if (syncedCount === 0 && result.remoteCount === 0 && selectedProfileId) {
        toast.warning(`โปรไฟล์นี้ไม่มีสินค้า cloud (${profileDebugId})`);
        return;
      }
      toast.success(`ซิงก์แล้ว ${syncedCount} รายการ (${profileDebugId})`);
      return;
    }

    toast.error(result.error || 'ซิงก์คลังสินค้าไม่สำเร็จ');
  }, [selectedProfileId]);

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

  const setEditField = useCallback((field: keyof ProductEditForm, value: string): void => {
    setEditForm((current) => ({ ...current, [field]: value }));
  }, []);

  const openEditProduct = useCallback((product: AffiliateProduct): void => {
    setEditingProduct(product);
    setEditForm(createProductEditForm(product));
    setEditImageOverride(null);
  }, []);

  const closeEditProduct = useCallback((): void => {
    if (isProductEditSaving) {
      return;
    }

    setEditingProduct(null);
    setEditForm({ ...EMPTY_PRODUCT_EDIT_FORM });
    setEditImageOverride(null);
  }, [isProductEditSaving]);

  const pickEditProductImage = useCallback(async (): Promise<void> => {
    if (isProductEditSaving) {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      toast.warning('กรุณาอนุญาตให้เข้าถึงคลังรูปภาพก่อน');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: false,
      mediaTypes: ['images'],
      quality: 1,
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    if (!asset?.uri) {
      toast.error('อ่านรูปภาพไม่สำเร็จ');
      return;
    }

    setEditImageOverride({
      mimeType: asset.mimeType ?? null,
      size: typeof asset.fileSize === 'number' && Number.isFinite(asset.fileSize) ? asset.fileSize : null,
      uri: asset.uri,
    });
  }, [isProductEditSaving]);

  const saveEditProduct = useCallback(async (): Promise<void> => {
    if (!editingProduct || isProductEditSaving) {
      return;
    }

    const name = editForm.name.trim();
    if (!name) {
      toast.warning('กรุณากรอกชื่อสินค้า');
      return;
    }

    setIsProductEditSaving(true);
    try {
      const result = await updateProduct({
        caption: cleanFormText(editForm.caption),
        cta: cleanFormText(editForm.cta),
        description: cleanFormText(editForm.description),
        externalProductId: cleanFormText(editForm.externalProductId),
        hashtags: cleanFormText(editForm.hashtags),
        localId: editingProduct.localId,
        name,
        price: cleanFormText(editForm.price),
        productUrl: cleanFormText(editForm.productUrl),
        profileLocalId: editingProduct.profileLocalId ?? selectedProfileId,
        stock: parseProductEditStock(editForm.stock),
        ...(editImageOverride ? {
          imageHash: null,
          imageMimeType: editImageOverride.mimeType,
          imagePath: editImageOverride.uri,
          imageR2Key: null,
          imageSize: editImageOverride.size,
          imageUploadedAt: null,
          imageUrl: null,
        } : {}),
      });

      if (!result) {
        toast.warning('กำลังบันทึกสินค้าอยู่');
        return;
      }

      if (!result.success) {
        toast.error(result.error || 'บันทึกสินค้าไม่สำเร็จ');
        return;
      }

      setEditingProduct(null);
      setEditForm({ ...EMPTY_PRODUCT_EDIT_FORM });
      setEditImageOverride(null);
      setSelectedIds((current) => {
        if (!current.has(getProductKey(editingProduct))) {
          return current;
        }
        const next = new Set(current);
        next.delete(getProductKey(editingProduct));
        return next;
      });
      toast.success(result.queued ? 'บันทึกแล้ว รอซิงก์ cloud' : 'บันทึกแล้ว');
    } finally {
      setIsProductEditSaving(false);
    }
  }, [editForm, editImageOverride, editingProduct, isProductEditSaving, selectedProfileId, updateProduct]);

  const handleEditSelected = useCallback((): void => {
    const selectedProducts = products.filter((product) => selectedIds.has(getProductKey(product)));
    if (selectedProducts.length !== 1) {
      toast.warning('เลือกสินค้า 1 รายการเพื่อแก้ไข');
      return;
    }

    openEditProduct(selectedProducts[0]);
  }, [openEditProduct, products, selectedIds]);

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

    const profileDebugId = formatProfileDebugId(selectedProfileId);
    appendShopeeLog(`เริ่มซิงก์สินค้า cloud user=${formatUserDebugLabel(user)} profile=${profileDebugId}`);
    void syncProducts(
      selectedProfileId ? { profileLocalId: selectedProfileId, reconcile: false } : { reconcile: false }
    ).then((result) => {
      if (result) {
        const syncedCount = result.profileCount ?? result.count;
        const remoteCount = typeof result.remoteCount === 'number' ? result.remoteCount : '-';
        const status = result.success ? 'สำเร็จ' : 'ไม่สำเร็จ';
        appendShopeeLog(
          `ผลซิงก์ cloud ${status} user=${formatUserDebugLabel(user)} profile=${profileDebugId} local=${syncedCount} remote=${remoteCount}`
        );
      }
      showSyncResult(result);
    });
  }, [appendShopeeLog, isSyncing, selectedProfileId, showSyncResult, syncProducts, user]);

  const handleTikTokComingSoon = useCallback((): void => {
    Alert.alert('กำลังพัฒนา', 'ฟีเจอร์ TikTok กำลังพัฒนา');
  }, []);

  const syncShopeeImportQueue = useCallback(async (): Promise<void> => {
    const result = await syncProducts(
      selectedProfileId ? { profileLocalId: selectedProfileId, reconcile: false } : { reconcile: false }
    );
    if (!result) {
      appendShopeeLog('บันทึกไว้ในเครื่องแล้ว รอซิงก์ cloud');
      return;
    }

    if (result.success) {
      const profileCount = result.profileCount ?? result.count;
      const remotePart = typeof result.remoteCount === 'number'
        ? ` · cloud ส่งกลับ ${result.remoteCount}`
        : '';
      appendShopeeLog(`ซิงก์ cloud แล้ว user=${formatUserDebugLabel(user)} profile=${formatProfileDebugId(selectedProfileId)} โปรไฟล์นี้ ${profileCount} รายการ${remotePart}`);
      return;
    }

    appendShopeeLog(result.error || 'ซิงก์ cloud ยังไม่สำเร็จ จะลองใหม่รอบถัดไป');
  }, [appendShopeeLog, selectedProfileId, syncProducts, user]);

  const runShopeeImport = useCallback(async (
    source: ShopeeImportSource,
    maxItems: number,
    offerCategory?: ShopeeOfferCategory | null
  ): Promise<void> => {
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
    const normalizedOfferCategory = source === 'offers' ? offerCategory || 'แนะนำ' : null;
    const sourceLabel = source === 'offers'
      ? `ข้อเสนอ Affiliate > ${normalizedOfferCategory}`
      : 'สิ่งที่ถูกใจ';
    appendShopeeLog(`เริ่มดึงสินค้า Shopee จาก${sourceLabel} (${maxItems <= 0 ? 'ทั้งหมด' : `${maxItems} รายการ`})`);

    try {
      await shopeeProductSaver.savePendingProducts();
      const status = await getAccessibilityStatus();
      if (!status.running) {
        appendShopeeLog('หยุดนำเข้า: ยังไม่ได้เปิด Accessibility Service');
        Alert.alert(
          'เปิด Accessibility ก่อน',
          `Kubdee AI ต้องใช้ Accessibility เพื่อเข้า Shopee และอ่านสินค้า${sourceLabel}บนเครื่องนี้`,
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

      if (!await confirmShopeeOfferImagePermission(source, appendShopeeLog)) {
        return;
      }

      await storePendingTab('library');
      const scrapedProducts = await runNativeShopeeImport(source, maxItems, selectedProfileId, normalizedOfferCategory);
      await shopeeProductSaver.waitForIdle();
      await shopeeProductSaver.savePendingProducts();
      await shopeeProductSaver.waitForIdle();
      await refreshProducts();

      if (scrapedProducts.length === 0 && shopeeProductSaver.getSavedCount() === 0) {
        appendShopeeLog('ไม่พบสินค้า Shopee ที่นำเข้าได้');
        toast.warning(`ไม่พบสินค้าใน Shopee ${sourceLabel}`);
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

  // เก็บผลแปลงลิงก์ที่ native เขียนค้างบน disk เข้าคลัง แล้วเคลียร์ไฟล์
  // ใช้ทั้งตอนแปลงจบปกติ และตอนเปิดแอปใหม่หลังแอปหลักโดนฆ่าระหว่าง automation รัน
  const applyPendingShopeeConvertResults = useCallback(async (): Promise<number> => {
    const pending = await getPendingShopeeConvertResults();
    if (pending.length === 0) {
      return 0;
    }

    let applied = 0;
    for (const row of pending) {
      const shortUrl = row.shortUrl.trim();
      if (!isShopeeShortLink(shortUrl)) {
        continue;
      }

      const product = allProducts.find((item) => item.localId === row.localId);
      if (!product) {
        continue;
      }
      if (product.productUrl?.trim() === shortUrl) {
        continue;
      }

      const updateResult = await updateProduct({
        localId: product.localId,
        name: product.name,
        productUrl: shortUrl,
        profileLocalId: product.profileLocalId ?? selectedProfileId,
      });
      if (updateResult?.success) {
        applied += 1;
        pushAutomationActivityLog('shopee-convert', `อัปเดตลิงก์สินค้าแล้ว: ${product.name.slice(0, 34)}`);
      } else {
        pushAutomationActivityLog('shopee-convert', `บันทึกลิงก์ใหม่ไม่สำเร็จ: ${product.name.slice(0, 34)}`);
      }
    }

    await clearPendingShopeeConvertResults();
    if (applied > 0) {
      await refreshProducts();
    }
    return applied;
  }, [allProducts, refreshProducts, selectedProfileId, updateProduct]);

  // ตอนเปิดหน้าคลังครั้งแรก เช็คผลแปลงที่ค้างจากรอบก่อน (กรณีแอปโดนฆ่ากลางคัน)
  const pendingConvertCheckedRef = useRef(false);
  useEffect(() => {
    if (pendingConvertCheckedRef.current || allProducts.length === 0) {
      return;
    }
    pendingConvertCheckedRef.current = true;

    void (async () => {
      try {
        const applied = await applyPendingShopeeConvertResults();
        if (applied > 0) {
          toast.success(`เก็บผลแปลงลิงก์ที่ค้างไว้ ${applied} รายการ`);
        }
      } catch {
        // ไฟล์ผลค้างอ่านไม่ได้ ไม่ต้องรบกวนผู้ใช้ — รอบแปลงถัดไปจะเก็บใหม่เอง
      }
    })();
  }, [allProducts.length, applyPendingShopeeConvertResults]);

  const runShopeeLinkConversion = useCallback(async (): Promise<void> => {
    if (isConvertingShopeeLinks || !selectedProfileId) {
      return;
    }

    const candidates = shopeeLinkConvertCandidates
      .filter((product) => product.localId && product.productUrl?.trim())
      .map((product) => ({ localId: product.localId, url: product.productUrl!.trim() }));
    if (candidates.length === 0) {
      return;
    }

    const appendConvertLog = (message: string): void => {
      pushAutomationActivityLog('shopee-convert', message);
    };

    setIsConvertingShopeeLinks(true);
    beginAutomationActivityRun('shopee-convert');
    appendConvertLog(`เริ่มแปลงลิงก์ Shopee เป็น short link ${candidates.length} รายการ`);

    try {
      const status = await getAccessibilityStatus();
      if (!status.running) {
        appendConvertLog('หยุดแปลงลิงก์: ยังไม่ได้เปิด Accessibility Service');
        Alert.alert(
          'เปิด Accessibility ก่อน',
          'Kubdee AI ต้องใช้ Accessibility เพื่อเปิดหน้า แปลงลิงก์ ใน Shopee และอ่านผลลัพธ์บนเครื่องนี้',
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
      const result = await runNativeShopeeLinkConversion(candidates);

      // ผลจริงอ่านจากไฟล์ผลค้างที่ native เขียนทีละลิงก์ (ทางเดียวกับตอนแอปโดนฆ่า)
      const updatedCount = await applyPendingShopeeConvertResults();

      if (result.stopped) {
        const message = `หยุดแปลงลิงก์แล้ว อัปเดต ${updatedCount}/${candidates.length} รายการ`;
        appendConvertLog(message);
        toast.warning(message);
        return;
      }

      if (updatedCount > 0) {
        const message = `แปลงลิงก์แล้ว ${updatedCount}/${candidates.length} รายการ`;
        appendConvertLog(message);
        toast.success(message);
        return;
      }

      const message = result.error || 'แปลงลิงก์ Shopee ไม่สำเร็จ';
      appendConvertLog(message);
      toast.error(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendConvertLog(message);
      toast.error(message);
    } finally {
      setIsConvertingShopeeLinks(false);
      setAutomationActivityRunning('shopee-convert', false);
    }
  }, [
    applyPendingShopeeConvertResults,
    isConvertingShopeeLinks,
    selectedProfileId,
    shopeeLinkConvertCandidates,
  ]);

  const confirmShopeeLinkConversion = useCallback((): void => {
    const count = shopeeLinkConvertCandidates.length;
    if (isConvertingShopeeLinks || count === 0) {
      return;
    }

    Alert.alert(
      'แปลงลิงก์ Shopee',
      `จะเปิดแอป Shopee เพื่อแปลงลิงก์เป็น short link ${count} รายการ ต้องใช้ Accessibility`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'แปลงลิงก์',
          onPress: () => {
            void runShopeeLinkConversion();
          },
        },
      ]
    );
  }, [isConvertingShopeeLinks, runShopeeLinkConversion, shopeeLinkConvertCandidates.length]);

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
    const limit = getShopeeImportLimit(shopeeImportAmount, customShopeeImportAmount);
    if (limit === null) {
      toast.error('กรุณากรอกจำนวนที่ต้องการดึง');
      return;
    }

    setShopeeImportModalOpen(false);
    void runShopeeImport(
      shopeeImportSource,
      limit,
      shopeeImportSource === 'offers' ? shopeeOfferCategory : null
    );
  }, [customShopeeImportAmount, runShopeeImport, shopeeImportAmount, shopeeImportSource, shopeeOfferCategory]);

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
          onEdit={() => openEditProduct(item)}
          onDelete={() => confirmDelete([item.localId])}
        />
      );
    },
    [confirmDelete, openEditProduct, selectedIds, theme, toggleSelect]
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

            {shopeeLinkConvertCandidates.length > 0 ? (
              <View className="flex-row items-center gap-2.5 rounded-kd-lg border border-kd-amber/40 bg-kd-amber-soft px-2.5 py-2">
                <Link2 size={14} color={theme.amber} strokeWidth={2.2} />
                <View className="min-w-0 flex-1">
                  <Text className="text-kd-caption font-semibold leading-4 text-kd-text">
                    ลิงก์ยังไม่ใช่ short link {shopeeLinkConvertCandidates.length} รายการ
                  </Text>
                  <Text className="text-kd-caption leading-4 text-kd-text-subtle">
                    โพสต์ Shopee อาจค้นหาสินค้าไม่เจอ
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="แปลงลิงก์ Shopee เป็น short link"
                  disabled={isConvertingShopeeLinks}
                  onPress={confirmShopeeLinkConversion}
                  className="h-8 shrink-0 flex-row items-center justify-center gap-1.5 rounded-kd-lg px-3 disabled:opacity-60"
                  style={{ backgroundColor: theme.amber }}
                >
                  {isConvertingShopeeLinks ? (
                    <ActivityIndicator color={theme.white} size="small" />
                  ) : null}
                  <Text className="text-kd-caption font-semibold text-white">
                    {isConvertingShopeeLinks ? 'กำลังแปลง...' : 'แปลงลิงก์'}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {products.length > 0 ? (
              <View className="gap-2">
                <SearchBox
                  theme={theme}
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="ค้นหาชื่อ/รหัสสินค้า..."
                  containerClassName="w-full shrink-0 self-stretch"
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
        visible={!!editingProduct}
        onRequestClose={closeEditProduct}
      >
        <View className="flex-1 justify-end bg-black/45">
          <Pressable
            accessibilityLabel="ปิดฟอร์มแก้ไขสินค้า"
            accessibilityRole="button"
            disabled={isProductEditSaving}
            className="flex-1"
            onPress={closeEditProduct}
          />
          <View
            className="max-h-[88%] rounded-t-[20px] border border-kd-border bg-kd-panel"
            style={{ paddingBottom: Math.max(insets.bottom + 12, 20) }}
          >
            <View className="flex-row items-center justify-between gap-3 px-4 pt-4">
              <View className="min-w-0 flex-1 flex-row items-center gap-2">
                <View className="h-8 w-8 items-center justify-center rounded-kd-lg bg-kd-emerald-soft">
                  <Pencil size={15} color={theme.emerald} strokeWidth={2.3} />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-kd-title font-semibold text-kd-text">แก้ไขสินค้า</Text>
                  <Text numberOfLines={1} className="mt-0.5 text-kd-caption text-kd-text-subtle">
                    {editingProduct?.profileName || 'คลังสินค้า'}
                  </Text>
                </View>
              </View>
              <Pressable
                accessibilityLabel="ปิด"
                accessibilityRole="button"
                disabled={isProductEditSaving}
                onPress={closeEditProduct}
                className="h-8 w-8 items-center justify-center rounded-full bg-kd-card-muted disabled:opacity-50"
              >
                <X size={16} color={theme.textSubtle} strokeWidth={2.4} />
              </Pressable>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerClassName="gap-3 px-4 py-3"
            >
              <Pressable
                accessibilityRole="button"
                disabled={isProductEditSaving}
                onPress={() => void pickEditProductImage()}
                className="flex-row items-center gap-3 rounded-kd-lg border border-kd-border bg-kd-card-muted p-3 disabled:opacity-60"
              >
                <View className="h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-kd-lg bg-kd-panel">
                  {editingProductImageUri ? (
                    <Image source={{ uri: editingProductImageUri }} className="h-full w-full" resizeMode="cover" />
                  ) : (
                    <ImageIcon size={21} color={theme.textSubtle} strokeWidth={1.7} />
                  )}
                </View>
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={2} className="text-kd-body font-semibold leading-5 text-kd-text">
                    {editForm.name || editingProduct?.name || 'สินค้า'}
                  </Text>
                  <Text numberOfLines={1} className="mt-0.5 text-kd-caption text-kd-text-subtle">
                    {editForm.externalProductId ? `#${editForm.externalProductId}` : 'ไม่มี ID สินค้า'}
                  </Text>
                </View>
                <View className="h-8 shrink-0 flex-row items-center justify-center gap-1 rounded-full bg-kd-panel px-2">
                  <Upload size={12} color={theme.textSubtle} strokeWidth={2.2} />
                  <Text className="text-kd-caption font-medium text-kd-text-subtle">รูป</Text>
                </View>
              </Pressable>

              <View className="flex-row gap-2">
                <View className="flex-1">
                  <LabeledTextInput
                    label="ID สินค้า"
                    value={editForm.externalProductId}
                    onChangeText={(value) => setEditField('externalProductId', value)}
                    placeholder="SKU-001"
                    theme={theme}
                  />
                </View>
                <View className="flex-1">
                  <LabeledTextInput
                    label="ราคา"
                    value={editForm.price}
                    onChangeText={(value) => setEditField('price', value)}
                    placeholder="0.00"
                    theme={theme}
                  />
                </View>
              </View>

              <LabeledTextInput
                label="ลิงก์สินค้า"
                value={editForm.productUrl}
                onChangeText={(value) => setEditField('productUrl', value)}
                placeholder="https://..."
                theme={theme}
              />

              <LabeledTextInput
                label="ชื่อสินค้า"
                value={editForm.name}
                onChangeText={(value) => setEditField('name', value)}
                placeholder="ชื่อสินค้า"
                multiline
                theme={theme}
              />

              <LabeledTextInput
                label="Caption"
                value={editForm.caption}
                onChangeText={(value) => setEditField('caption', value)}
                placeholder="คำบรรยายสินค้า"
                multiline
                theme={theme}
              />

              <LabeledTextInput
                label="#แฮชแท็ก"
                value={editForm.hashtags}
                onChangeText={(value) => setEditField('hashtags', value)}
                placeholder="#สินค้าขายดี"
                theme={theme}
              />

              <View className="flex-row gap-2">
                <View className="flex-1">
                  <LabeledTextInput
                    label="CTA"
                    value={editForm.cta}
                    onChangeText={(value) => setEditField('cta', value)}
                    placeholder="สั่งซื้อเลย"
                    theme={theme}
                  />
                </View>
                <View className="flex-1">
                  <LabeledTextInput
                    label="สต็อก"
                    value={editForm.stock}
                    onChangeText={(value) => setEditField('stock', value.replace(/[^\d]/g, ''))}
                    placeholder="0"
                    theme={theme}
                  />
                </View>
              </View>

              {/* ตั้งใจไม่มีช่องแก้ description (นโยบายเดียวกับ desktop: แก้ที่ชื่อสินค้าช่องเดียว)
                  ค่า description เดิมยังถูกส่งกลับใน payload ตอนเซฟ ไม่โดนล้าง */}
            </ScrollView>

            <View className="flex-row gap-2 px-4 pt-1">
              <Pressable
                accessibilityRole="button"
                disabled={isProductEditSaving}
                onPress={closeEditProduct}
                className="h-11 flex-1 items-center justify-center rounded-kd-lg border border-kd-border bg-kd-card disabled:opacity-50"
              >
                <Text className="text-kd-body font-medium text-kd-text-subtle">ยกเลิก</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isProductEditSaving}
                onPress={() => void saveEditProduct()}
                className="h-11 flex-1 items-center justify-center rounded-kd-lg bg-kd-text disabled:opacity-60"
              >
                {isProductEditSaving ? (
                  <ActivityIndicator color={theme.panel} size="small" />
                ) : (
                  <Text className="text-kd-body font-semibold text-kd-panel">บันทึก</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
                  label="ข้อเสนอ"
                  onPress={() => setShopeeImportSource('offers')}
                />
              </View>

              {shopeeImportSource === 'offers' ? (
                <View className="mt-1.5 gap-2">
                  <Text className="text-kd-caption font-semibold text-kd-text-subtle">หมวดข้อเสนอ</Text>
                  <ScrollView
                    horizontal
                    keyboardShouldPersistTaps="handled"
                    showsHorizontalScrollIndicator={false}
                    contentContainerClassName="gap-2 pr-4"
                  >
                    {SHOPEE_OFFER_CATEGORY_OPTIONS.map((option) => (
                      <ShopeeImportOptionButton
                        key={option.value}
                        active={shopeeOfferCategory === option.value}
                        fitContent
                        label={option.label}
                        onPress={() => setShopeeOfferCategory(option.value)}
                      />
                    ))}
                  </ScrollView>
                </View>
              ) : null}
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
          onEdit={handleEditSelected}
        />
      ) : null}
    </View>
  );
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { useCreativeLibrary } from '@/library/CreativeLibraryContext';
import { useLibrary } from '@/library/LibraryContext';
import type { CreativeMediaAsset } from '@/library/CreativeLibraryContext';
import { createGoogleFlowVideoThumbnail, listGoogleFlowAssets } from '@/native/AccessibilityBridge';

export type GeneratedMediaKind = 'images' | 'videos';
export type GeneratedMediaSource =
  | 'auto-pilot-google-flow'
  | 'cloud-transfer'
  | 'mobile-device-import'
  | 'mobile-local-upload';

export interface GeneratedMediaAsset {
  id: string;
  kind: GeneratedMediaKind;
  runId: string;
  profileLocalId: string;
  productId: string;
  productName: string;
  productCode: string;
  productUrl: string | null;
  caption: string | null;
  hashtags: string | null;
  cta: string | null;
  platform: string | null;
  title: string;
  fileUri: string | null;
  fileName: string | null;
  mimeType: string | null;
  thumbnailUri: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  createdAt: number;
  source: GeneratedMediaSource;
}

export interface AddGeneratedMediaAssetInput {
  kind: GeneratedMediaKind;
  runId: string;
  profileLocalId: string;
  productId: string;
  productName: string;
  productCode: string;
  productUrl?: string | null;
  caption?: string | null;
  hashtags?: string | null;
  cta?: string | null;
  platform?: string | null;
  title?: string | null;
  fileUri?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  thumbnailUri?: string | null;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  source?: GeneratedMediaSource | null;
  createdAt?: number;
}

type GeneratedMediaAssetPatch = Partial<
  Pick<
    GeneratedMediaAsset,
    | 'title'
    | 'fileUri'
    | 'fileName'
    | 'mimeType'
    | 'thumbnailUri'
    | 'sizeBytes'
    | 'width'
    | 'height'
    | 'durationMs'
    | 'productId'
    | 'productName'
    | 'productCode'
    | 'productUrl'
    | 'caption'
    | 'hashtags'
    | 'cta'
    | 'platform'
    | 'source'
  >
>;

interface GeneratedMediaContextType {
  assets: GeneratedMediaAsset[];
  addGeneratedMediaAsset: (input: AddGeneratedMediaAssetInput) => Promise<GeneratedMediaAsset>;
  deleteGeneratedMediaAssets: (ids: string[]) => Promise<void>;
  getAssetsByKind: (kind: GeneratedMediaKind, profileLocalId?: string) => GeneratedMediaAsset[];
  importGeneratedMediaAssets: (kind: GeneratedMediaKind, profileLocalId?: string | null) => Promise<number>;
  ensureGeneratedVideoThumbnails: (profileLocalId?: string | null) => Promise<number>;
  refreshGeneratedMediaAssets: () => Promise<void>;
  updateGeneratedMediaAsset: (
    id: string,
    patch: GeneratedMediaAssetPatch
  ) => Promise<GeneratedMediaAsset | null>;
}

const GENERATED_MEDIA_STORE_KEY = 'kubdee_ai_mobile_generated_media_v1';
const LEGACY_GENERATED_MEDIA_STORE_KEY = GENERATED_MEDIA_STORE_KEY;
const MAX_GENERATED_MEDIA_ASSETS = 300;

const GeneratedMediaContext = createContext<GeneratedMediaContextType | undefined>(undefined);

function cleanText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function normalizeSource(value: string | null | undefined): GeneratedMediaSource {
  const cleanValue = cleanText(value);
  if (cleanValue === 'cloud-transfer' || cleanValue === 'mobile-device-import' || cleanValue === 'mobile-local-upload') {
    return cleanValue;
  }
  return 'auto-pilot-google-flow';
}

function createAssetId(input: AddGeneratedMediaAssetInput): string {
  const stablePart = [
    input.kind,
    input.runId,
    input.productId,
    input.fileUri,
    input.fileName,
    input.createdAt ?? Date.now(),
  ]
    .filter(Boolean)
    .join(':');
  return `generated-${stablePart.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 120)}`;
}

function normalizeAsset(input: AddGeneratedMediaAssetInput): GeneratedMediaAsset {
  const createdAt = input.createdAt ?? Date.now();
  const productName = cleanText(input.productName) || 'สินค้า';
  const productCode = cleanText(input.productCode) || cleanText(input.productId) || 'unknown';
  const fileName = cleanText(input.fileName) || null;
  const title = cleanText(input.title) || fileName;
  const stepTitle = input.kind === 'images' ? 'รูปภาพ' : 'วิดีโอ';

  return {
    id: createAssetId({ ...input, createdAt }),
    kind: input.kind,
    runId: input.runId,
    profileLocalId: cleanText(input.profileLocalId),
    productId: cleanText(input.productId) || productCode,
    productName,
    productCode,
    productUrl: cleanText(input.productUrl) || null,
    caption: cleanText(input.caption) || null,
    hashtags: cleanText(input.hashtags) || null,
    cta: cleanText(input.cta) || null,
    platform: cleanText(input.platform) || null,
    title: title || `${stepTitle} Auto Pilot - ${productName}`,
    fileUri: cleanText(input.fileUri) || null,
    fileName,
    mimeType: cleanText(input.mimeType) || null,
    thumbnailUri: cleanText(input.thumbnailUri) || null,
    sizeBytes: typeof input.sizeBytes === 'number' && Number.isFinite(input.sizeBytes) ? input.sizeBytes : null,
    width: typeof input.width === 'number' && Number.isFinite(input.width) && input.width > 0 ? input.width : null,
    height: typeof input.height === 'number' && Number.isFinite(input.height) && input.height > 0 ? input.height : null,
    durationMs: typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) && input.durationMs > 0 ? input.durationMs : null,
    createdAt,
    source: normalizeSource(input.source),
  };
}

function creativeMediaToGeneratedAsset(asset: CreativeMediaAsset): GeneratedMediaAsset {
  return {
    id: asset.id,
    kind: asset.kind,
    runId: asset.runId ?? '',
    profileLocalId: asset.profileLocalId ?? '',
    productId: asset.productId ?? '',
    productName: asset.productName ?? 'สินค้า',
    productCode: asset.productCode ?? asset.productId ?? 'unknown',
    productUrl: asset.productUrl,
    caption: asset.caption,
    hashtags: asset.hashtags,
    cta: asset.cta,
    platform: asset.platform,
    title: asset.title,
    fileUri: asset.fileUri,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    thumbnailUri: asset.thumbnailUri ?? null,
    sizeBytes: asset.sizeBytes,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    createdAt: asset.createdAt,
    source: normalizeSource(asset.source),
  };
}

function dedupeGeneratedAssets(input: GeneratedMediaAsset[]): GeneratedMediaAsset[] {
  const seenKeys = new Set<string>();
  const result: GeneratedMediaAsset[] = [];
  for (const asset of input) {
    const key = asset.fileUri || asset.id;
    if (seenKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    result.push(asset);
  }
  return result;
}

function parseStoredAssets(raw: string | null): GeneratedMediaAsset[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return dedupeGeneratedAssets(parsed
      .filter((item): item is GeneratedMediaAsset => {
        if (!item || typeof item !== 'object') {
          return false;
        }
        const asset = item as Partial<GeneratedMediaAsset>;
        return (
          typeof asset.id === 'string' &&
          (asset.kind === 'images' || asset.kind === 'videos') &&
          typeof asset.productName === 'string' &&
          typeof asset.createdAt === 'number'
        );
      })
      .map((asset) => ({
        ...asset,
        productUrl: cleanText(asset.productUrl) || null,
        caption: cleanText(asset.caption) || null,
        hashtags: cleanText(asset.hashtags) || null,
        cta: cleanText(asset.cta) || null,
        platform: cleanText(asset.platform) || null,
        thumbnailUri: cleanText(asset.thumbnailUri) || null,
        width: typeof asset.width === 'number' && Number.isFinite(asset.width) && asset.width > 0 ? asset.width : null,
        height: typeof asset.height === 'number' && Number.isFinite(asset.height) && asset.height > 0 ? asset.height : null,
        durationMs: typeof asset.durationMs === 'number' && Number.isFinite(asset.durationMs) && asset.durationMs > 0 ? asset.durationMs : null,
        source: normalizeSource(asset.source),
      }))
    ).slice(0, MAX_GENERATED_MEDIA_ASSETS);
  } catch {
    return [];
  }
}

async function persistAssets(assets: GeneratedMediaAsset[]): Promise<void> {
  await AsyncStorage.setItem(
    GENERATED_MEDIA_STORE_KEY,
    JSON.stringify(assets.slice(0, MAX_GENERATED_MEDIA_ASSETS))
  );
}

async function loadStoredAssets(): Promise<GeneratedMediaAsset[]> {
  const stored = await AsyncStorage.getItem(GENERATED_MEDIA_STORE_KEY);
  const assets = parseStoredAssets(stored);
  if (assets.length > 0 || stored !== null) {
    return assets;
  }

  const legacyStored = await SecureStore.getItemAsync(LEGACY_GENERATED_MEDIA_STORE_KEY);
  const legacyAssets = parseStoredAssets(legacyStored);
  if (legacyAssets.length > 0) {
    await persistAssets(legacyAssets);
  }
  return legacyAssets;
}

export function GeneratedMediaProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const {
    addMediaAsset,
    deleteMediaAssets,
    mediaAssets,
    refreshCreativeLibrary,
  } = useCreativeLibrary();
  const [assets, setAssets] = useState<GeneratedMediaAsset[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadStoredAssets().then(async (storedAssets) => {
      if (cancelled) {
        return;
      }

      for (const storedAsset of storedAssets) {
        await addMediaAsset({
          id: storedAsset.id,
          kind: storedAsset.kind,
          runId: storedAsset.runId,
          profileLocalId: storedAsset.profileLocalId,
          productId: storedAsset.productId,
          productName: storedAsset.productName,
          productCode: storedAsset.productCode,
          productUrl: storedAsset.productUrl,
          caption: storedAsset.caption,
          hashtags: storedAsset.hashtags,
          cta: storedAsset.cta,
          platform: storedAsset.platform,
          title: storedAsset.title,
          fileUri: storedAsset.fileUri,
          fileName: storedAsset.fileName,
          mimeType: storedAsset.mimeType,
          thumbnailUri: storedAsset.thumbnailUri,
          sizeBytes: storedAsset.sizeBytes,
          width: storedAsset.width,
          height: storedAsset.height,
          durationMs: storedAsset.durationMs,
          source: storedAsset.source,
          createdAt: storedAsset.createdAt,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [addMediaAsset]);

  useEffect(() => {
    const nextAssets = dedupeGeneratedAssets(
      mediaAssets
        .map(creativeMediaToGeneratedAsset)
        .sort((first, second) => second.createdAt - first.createdAt)
    ).slice(0, MAX_GENERATED_MEDIA_ASSETS);
    setAssets(nextAssets);
    void persistAssets(nextAssets);
  }, [mediaAssets]);

  // ลิงก์/ชื่อสินค้าใน asset ถูกแช่แข็งตอน gen — พอดึงสินค้าชุดใหม่ (ลิงก์ affiliate เปลี่ยน)
  // ให้ sync จากคลังสินค้าปัจจุบันเข้ารูป/วิดีโอที่ productCode ตรงกัน จะได้ไม่พาไปลิงก์เก่าที่ใช้ไม่ได้
  const { products: libraryProducts } = useLibrary();
  const isSyncingProductInfoRef = useRef(false);

  useEffect(() => {
    if (isSyncingProductInfoRef.current) {
      return;
    }

    const infoByKey = new Map<string, { name: string | null; productUrl: string | null }>();
    for (const product of libraryProducts) {
      const externalId = product.externalProductId?.trim();
      if (!externalId) {
        continue;
      }
      infoByKey.set(`${product.profileLocalId ?? ''} ${externalId}`, {
        name: product.name?.trim() || null,
        productUrl: product.productUrl?.trim() || null,
      });
    }
    if (infoByKey.size === 0) {
      return;
    }

    const staleAssets = mediaAssets.filter((asset) => {
      const info = infoByKey.get(`${asset.profileLocalId ?? ''} ${asset.productCode?.trim() ?? ''}`);
      if (!info) {
        return false;
      }
      const urlChanged = Boolean(info.productUrl) && info.productUrl !== asset.productUrl;
      const nameChanged = Boolean(info.name) && info.name !== asset.productName;
      return urlChanged || nameChanged;
    });
    if (staleAssets.length === 0) {
      return;
    }

    isSyncingProductInfoRef.current = true;
    void (async () => {
      try {
        for (const asset of staleAssets) {
          const info = infoByKey.get(`${asset.profileLocalId ?? ''} ${asset.productCode?.trim() ?? ''}`);
          if (!info) {
            continue;
          }
          await addMediaAsset({
            ...asset,
            productName: info.name ?? asset.productName,
            productUrl: info.productUrl ?? asset.productUrl,
          });
        }
      } finally {
        isSyncingProductInfoRef.current = false;
      }
    })();
  }, [addMediaAsset, libraryProducts, mediaAssets]);

  const addGeneratedMediaAsset = useCallback(async (input: AddGeneratedMediaAssetInput): Promise<GeneratedMediaAsset> => {
    const asset = normalizeAsset(input);
    await addMediaAsset({
      id: asset.id,
      kind: asset.kind,
      runId: asset.runId,
      profileLocalId: asset.profileLocalId,
      productId: asset.productId,
      productName: asset.productName,
      productCode: asset.productCode,
      productUrl: asset.productUrl,
      caption: asset.caption,
      hashtags: asset.hashtags,
      cta: asset.cta,
      platform: asset.platform,
      title: asset.title,
      fileUri: asset.fileUri,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      thumbnailUri: asset.thumbnailUri,
      width: asset.width,
      height: asset.height,
      durationMs: asset.durationMs,
      source: asset.source,
      createdAt: asset.createdAt,
    });
    setAssets((current) => {
      const duplicateKey = asset.fileUri || asset.id;
      const next = [
        asset,
        ...current.filter((item) => (item.fileUri || item.id) !== duplicateKey),
      ].slice(0, MAX_GENERATED_MEDIA_ASSETS);
      void persistAssets(next);
      return next;
    });
    return asset;
  }, [addMediaAsset]);

  const updateGeneratedMediaAsset = useCallback(
    async (
      id: string,
      patch: GeneratedMediaAssetPatch
    ): Promise<GeneratedMediaAsset | null> => {
      const cleanId = id.trim();
      const currentAsset = assets.find((asset) => asset.id === cleanId);
      if (!currentAsset) {
        return null;
      }

      const nextAsset: GeneratedMediaAsset = {
        ...currentAsset,
        title: patch.title === undefined ? currentAsset.title : cleanText(patch.title) || currentAsset.title,
        fileUri: patch.fileUri === undefined ? currentAsset.fileUri : cleanText(patch.fileUri) || null,
        fileName: patch.fileName === undefined ? currentAsset.fileName : cleanText(patch.fileName) || null,
        mimeType: patch.mimeType === undefined ? currentAsset.mimeType : cleanText(patch.mimeType) || null,
        thumbnailUri: patch.thumbnailUri === undefined ? currentAsset.thumbnailUri : cleanText(patch.thumbnailUri) || null,
        sizeBytes:
          patch.sizeBytes === undefined
            ? currentAsset.sizeBytes
            : typeof patch.sizeBytes === 'number' && Number.isFinite(patch.sizeBytes) && patch.sizeBytes > 0
              ? patch.sizeBytes
              : null,
        width:
          patch.width === undefined
            ? currentAsset.width
            : typeof patch.width === 'number' && Number.isFinite(patch.width) && patch.width > 0
              ? patch.width
              : null,
        height:
          patch.height === undefined
            ? currentAsset.height
            : typeof patch.height === 'number' && Number.isFinite(patch.height) && patch.height > 0
              ? patch.height
              : null,
        durationMs:
          patch.durationMs === undefined
            ? currentAsset.durationMs
            : typeof patch.durationMs === 'number' && Number.isFinite(patch.durationMs) && patch.durationMs > 0
              ? patch.durationMs
              : null,
        productId: patch.productId === undefined ? currentAsset.productId : cleanText(patch.productId),
        productName: patch.productName === undefined ? currentAsset.productName : cleanText(patch.productName) || 'สินค้า',
        productCode: patch.productCode === undefined ? currentAsset.productCode : cleanText(patch.productCode) || cleanText(patch.productId) || 'unknown',
        productUrl: patch.productUrl === undefined ? currentAsset.productUrl : cleanText(patch.productUrl) || null,
        caption: patch.caption === undefined ? currentAsset.caption : cleanText(patch.caption) || null,
        hashtags: patch.hashtags === undefined ? currentAsset.hashtags : cleanText(patch.hashtags) || null,
        cta: patch.cta === undefined ? currentAsset.cta : cleanText(patch.cta) || null,
        platform: patch.platform === undefined ? currentAsset.platform : cleanText(patch.platform) || null,
        source: patch.source === undefined ? currentAsset.source : normalizeSource(patch.source),
      };

      await addMediaAsset({
        id: nextAsset.id,
        kind: nextAsset.kind,
        runId: nextAsset.runId,
        profileLocalId: nextAsset.profileLocalId,
        productId: nextAsset.productId,
        productName: nextAsset.productName,
        productCode: nextAsset.productCode,
        productUrl: nextAsset.productUrl,
        caption: nextAsset.caption,
        hashtags: nextAsset.hashtags,
        cta: nextAsset.cta,
        platform: nextAsset.platform,
        title: nextAsset.title,
        fileUri: nextAsset.fileUri,
        fileName: nextAsset.fileName,
        mimeType: nextAsset.mimeType,
        thumbnailUri: nextAsset.thumbnailUri,
        sizeBytes: nextAsset.sizeBytes,
        width: nextAsset.width,
        height: nextAsset.height,
        durationMs: nextAsset.durationMs,
        source: nextAsset.source,
        createdAt: nextAsset.createdAt,
      });

      setAssets((current) => {
        const next = current.map((asset) => (asset.id === cleanId ? nextAsset : asset));
        void persistAssets(next);
        return next;
      });

      return nextAsset;
    },
    [addMediaAsset, assets]
  );

  const deleteGeneratedMediaAssets = useCallback(
    async (ids: string[]): Promise<void> => {
      const cleanIds = ids.map((id) => id.trim()).filter(Boolean);
      if (cleanIds.length === 0) {
        return;
      }

      await deleteMediaAssets(cleanIds);
      const idSet = new Set(cleanIds);
      setAssets((current) => {
        const next = current.filter((asset) => !idSet.has(asset.id));
        void persistAssets(next);
        return next;
      });
    },
    [deleteMediaAssets]
  );

  const getAssetsByKind = useCallback(
    (kind: GeneratedMediaKind, profileLocalId?: string): GeneratedMediaAsset[] => {
      const cleanProfileLocalId = profileLocalId?.trim();
      return assets.filter(
        (asset) =>
          asset.kind === kind &&
          (!cleanProfileLocalId || asset.profileLocalId === cleanProfileLocalId)
      );
    },
    [assets]
  );

  const importGeneratedMediaAssets = useCallback(
    async (kind: GeneratedMediaKind, profileLocalId?: string | null): Promise<number> => {
      const step = kind === 'images' ? 'image' : 'video';
      const deviceAssets = await listGoogleFlowAssets(step, MAX_GENERATED_MEDIA_ASSETS);
      if (deviceAssets.length === 0) {
        return 0;
      }

      const existingUris = new Set(assets.map((asset) => asset.fileUri).filter(Boolean));
      let imported = 0;
      for (const deviceAsset of deviceAssets) {
        if (!deviceAsset.uri || existingUris.has(deviceAsset.uri)) {
          continue;
        }
        const thumbnailUri =
          kind === 'videos'
            ? deviceAsset.thumbnailUri ?? await createGoogleFlowVideoThumbnail(deviceAsset.uri).catch(() => null)
            : null;
        await addGeneratedMediaAsset({
          kind,
          runId: 'mobile-device-import',
          profileLocalId: profileLocalId ?? '',
          productId: 'device-import',
          productName: 'ไฟล์นำเข้า',
          productCode: 'device-import',
          productUrl: null,
          caption: null,
          hashtags: null,
          cta: null,
          platform: null,
          fileUri: deviceAsset.uri,
          fileName: deviceAsset.fileName,
          mimeType: deviceAsset.mimeType,
          thumbnailUri,
          sizeBytes: deviceAsset.sizeBytes,
          width: null,
          height: null,
          durationMs: null,
          source: 'mobile-device-import',
          createdAt: deviceAsset.createdAt || Date.now(),
        });
        existingUris.add(deviceAsset.uri);
        imported += 1;
      }
      return imported;
    },
    [addGeneratedMediaAsset, assets]
  );

  const ensureGeneratedVideoThumbnails = useCallback(
    async (profileLocalId?: string | null): Promise<number> => {
      const cleanProfileLocalId = profileLocalId?.trim();
      const candidates = assets.filter(
        (asset) =>
          asset.kind === 'videos' &&
          !!asset.fileUri &&
          !asset.thumbnailUri &&
          (!cleanProfileLocalId || asset.profileLocalId === cleanProfileLocalId)
      );
      let updated = 0;
      for (const asset of candidates) {
        const thumbnailUri = await createGoogleFlowVideoThumbnail(asset.fileUri!).catch(() => null);
        if (!thumbnailUri) {
          continue;
        }
        const nextAsset = { ...asset, thumbnailUri };
        await addMediaAsset({
          id: nextAsset.id,
          kind: nextAsset.kind,
          runId: nextAsset.runId,
          profileLocalId: nextAsset.profileLocalId,
          productId: nextAsset.productId,
          productName: nextAsset.productName,
          productCode: nextAsset.productCode,
          productUrl: nextAsset.productUrl,
          caption: nextAsset.caption,
          hashtags: nextAsset.hashtags,
          cta: nextAsset.cta,
          platform: nextAsset.platform,
          title: nextAsset.title,
          fileUri: nextAsset.fileUri,
          fileName: nextAsset.fileName,
          mimeType: nextAsset.mimeType,
          thumbnailUri: nextAsset.thumbnailUri,
          sizeBytes: nextAsset.sizeBytes,
          width: nextAsset.width,
          height: nextAsset.height,
          durationMs: nextAsset.durationMs,
          source: nextAsset.source,
          createdAt: nextAsset.createdAt,
        });
        setAssets((current) => {
          const next = current.map((item) => (item.id === nextAsset.id ? nextAsset : item));
          void persistAssets(next);
          return next;
        });
        updated += 1;
      }
      return updated;
    },
    [addMediaAsset, assets]
  );

  const refreshGeneratedMediaAssets = useCallback(async (): Promise<void> => {
    await refreshCreativeLibrary();
  }, [refreshCreativeLibrary]);

  const value = useMemo(
    () => ({
      addGeneratedMediaAsset,
      assets,
      deleteGeneratedMediaAssets,
      ensureGeneratedVideoThumbnails,
      getAssetsByKind,
      importGeneratedMediaAssets,
      refreshGeneratedMediaAssets,
      updateGeneratedMediaAsset,
    }),
    [
      addGeneratedMediaAsset,
      assets,
      deleteGeneratedMediaAssets,
      ensureGeneratedVideoThumbnails,
      getAssetsByKind,
      importGeneratedMediaAssets,
      refreshGeneratedMediaAssets,
      updateGeneratedMediaAsset,
    ]
  );

  return <GeneratedMediaContext.Provider value={value}>{children}</GeneratedMediaContext.Provider>;
}

export function useGeneratedMedia(): GeneratedMediaContextType {
  const context = useContext(GeneratedMediaContext);
  if (!context) {
    throw new Error('useGeneratedMedia must be used within GeneratedMediaProvider');
  }
  return context;
}

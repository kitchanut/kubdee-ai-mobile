import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type GeneratedMediaKind = 'images' | 'videos';
export type GeneratedMediaSource = 'auto-pilot-google-flow';

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
  platform: string | null;
  title: string;
  fileUri: string | null;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
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
  platform?: string | null;
  fileUri?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt?: number;
}

interface GeneratedMediaContextType {
  assets: GeneratedMediaAsset[];
  addGeneratedMediaAsset: (input: AddGeneratedMediaAssetInput) => Promise<GeneratedMediaAsset>;
  getAssetsByKind: (kind: GeneratedMediaKind, profileLocalId?: string) => GeneratedMediaAsset[];
}

const GENERATED_MEDIA_STORE_KEY = 'kubdee_ai_mobile_generated_media_v1';
const LEGACY_GENERATED_MEDIA_STORE_KEY = GENERATED_MEDIA_STORE_KEY;
const MAX_GENERATED_MEDIA_ASSETS = 300;

const GeneratedMediaContext = createContext<GeneratedMediaContextType | undefined>(undefined);

function cleanText(value: string | null | undefined): string {
  return value?.trim() ?? '';
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
    platform: cleanText(input.platform) || null,
    title: fileName || `${stepTitle} Auto Pilot - ${productName}`,
    fileUri: cleanText(input.fileUri) || null,
    fileName,
    mimeType: cleanText(input.mimeType) || null,
    sizeBytes: typeof input.sizeBytes === 'number' && Number.isFinite(input.sizeBytes) ? input.sizeBytes : null,
    createdAt,
    source: 'auto-pilot-google-flow',
  };
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

    return parsed
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
        platform: cleanText(asset.platform) || null,
      }))
      .slice(0, MAX_GENERATED_MEDIA_ASSETS);
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
  const [assets, setAssets] = useState<GeneratedMediaAsset[]>([]);

  useEffect(() => {
    let cancelled = false;
    void loadStoredAssets().then((storedAssets) => {
      if (!cancelled) {
        setAssets(storedAssets);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const addGeneratedMediaAsset = useCallback(async (input: AddGeneratedMediaAssetInput): Promise<GeneratedMediaAsset> => {
    const asset = normalizeAsset(input);
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
  }, []);

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

  const value = useMemo(
    () => ({
      addGeneratedMediaAsset,
      assets,
      getAssetsByKind,
    }),
    [addGeneratedMediaAsset, assets, getAssetsByKind]
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

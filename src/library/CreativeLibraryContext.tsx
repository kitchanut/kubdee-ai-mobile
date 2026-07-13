import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { subscribeGoogleFlowRunnerLogs } from '@/autopilot/googleFlowRunnerBridge';
import {
  deleteCreativeLibraryItems,
  deleteCreativeMediaAssets,
  getCreativeLibraryItems,
  getCreativeMediaAssets,
  markCreativeMediaPosted,
  markCreativeMediaPostedByFileUri,
  upsertCreativeLibraryItem,
  upsertCreativeMediaAsset,
} from '@/library/localCreativeLibraryDb';
import type {
  CreativeAssetKind,
  CreativeLibraryItem,
  CreativeMediaAsset,
  CreativeMediaKind,
  UpsertCreativeLibraryItemInput,
  UpsertCreativeMediaAssetInput,
} from '@/library/localCreativeLibraryDb';

interface CreativeLibraryContextType {
  mediaAssets: CreativeMediaAsset[];
  libraryItems: CreativeLibraryItem[];
  isLoading: boolean;
  refreshCreativeLibrary: () => Promise<void>;
  addMediaAsset: (input: UpsertCreativeMediaAssetInput) => Promise<CreativeMediaAsset>;
  markMediaPosted: (id: string, platform: string) => Promise<void>;
  markMediaPostedByFileUri: (fileUri: string, platform: string) => Promise<void>;
  deleteMediaAssets: (ids: string[]) => Promise<void>;
  getMediaAssets: (kind: CreativeMediaKind, profileLocalId?: string | null) => CreativeMediaAsset[];
  saveLibraryItem: (input: UpsertCreativeLibraryItemInput) => Promise<CreativeLibraryItem>;
  deleteLibraryItems: (ids: string[]) => Promise<void>;
  getLibraryItems: (kind: CreativeAssetKind, profileLocalId?: string | null) => CreativeLibraryItem[];
}

const CreativeLibraryContext = createContext<CreativeLibraryContextType | undefined>(undefined);

function matchesProfile(profileLocalId: string | null | undefined, target?: string | null): boolean {
  const cleanTarget = target?.trim();
  return !cleanTarget || profileLocalId === cleanTarget;
}

export function CreativeLibraryProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [mediaAssets, setMediaAssets] = useState<CreativeMediaAsset[]>([]);
  const [libraryItems, setLibraryItems] = useState<CreativeLibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshCreativeLibrary = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const [images, videos, characters, scenes] = await Promise.all([
        getCreativeMediaAssets('images'),
        getCreativeMediaAssets('videos'),
        getCreativeLibraryItems('characters'),
        getCreativeLibraryItems('scenes'),
      ]);
      setMediaAssets([...images, ...videos].sort((first, second) => second.createdAt - first.createdAt));
      setLibraryItems([...characters, ...scenes].sort((first, second) => second.createdAt - first.createdAt));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refreshCreativeLibrary();
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshCreativeLibrary]);

  const addMediaAsset = useCallback(async (input: UpsertCreativeMediaAssetInput): Promise<CreativeMediaAsset> => {
    const asset = await upsertCreativeMediaAsset(input);
    setMediaAssets((current) => {
      const next = [asset, ...current.filter((item) => item.id !== asset.id)];
      return next.sort((first, second) => second.createdAt - first.createdAt);
    });
    return asset;
  }, []);

  const markMediaPosted = useCallback(async (id: string, platform: string): Promise<void> => {
    const merged = await markCreativeMediaPosted(id, platform);
    if (!merged) {
      return;
    }
    setMediaAssets((current) =>
      current.map((asset) => (asset.id === id ? { ...asset, postedPlatforms: merged } : asset))
    );
  }, []);

  const markMediaPostedByFileUri = useCallback(async (fileUri: string, platform: string): Promise<void> => {
    const result = await markCreativeMediaPostedByFileUri(fileUri, platform);
    if (!result) {
      return;
    }
    setMediaAssets((current) =>
      current.map((asset) =>
        asset.id === result.id ? { ...asset, postedPlatforms: result.postedPlatforms } : asset
      )
    );
  }, []);

  const deleteMediaAssets = useCallback(async (ids: string[]): Promise<void> => {
    await deleteCreativeMediaAssets(ids);
    const idSet = new Set(ids);
    setMediaAssets((current) => current.filter((asset) => !idSet.has(asset.id)));
  }, []);

  const getMediaAssets = useCallback(
    (kind: CreativeMediaKind, profileLocalId?: string | null): CreativeMediaAsset[] =>
      mediaAssets.filter((asset) => asset.kind === kind && matchesProfile(asset.profileLocalId, profileLocalId)),
    [mediaAssets]
  );

  const saveLibraryItem = useCallback(
    async (input: UpsertCreativeLibraryItemInput): Promise<CreativeLibraryItem> => {
      const item = await upsertCreativeLibraryItem(input);
      setLibraryItems((current) => {
        const next = [item, ...current.filter((entry) => entry.id !== item.id)];
        return next.sort((first, second) => second.createdAt - first.createdAt);
      });
      return item;
    },
    []
  );

  const deleteLibraryItems = useCallback(async (ids: string[]): Promise<void> => {
    await deleteCreativeLibraryItems(ids);
    const idSet = new Set(ids);
    setLibraryItems((current) => current.filter((item) => !idSet.has(item.id)));
  }, []);

  useEffect(() => {
    const subscription = subscribeGoogleFlowRunnerLogs((entry) => {
      if (
        entry.event !== 'asset' ||
        entry.step !== 'image' ||
        !entry.fileUri ||
        !entry.creativeAssetKind ||
        !entry.creativeItemId
      ) {
        return;
      }

      void saveLibraryItem({
        id: entry.creativeItemId,
        kind: entry.creativeAssetKind,
        profileLocalId: entry.profileLocalId ?? null,
        name: entry.creativeItemName || (entry.creativeAssetKind === 'characters' ? 'ตัวละครใหม่' : 'ฉากใหม่'),
        description: entry.creativeItemDescription ?? null,
        imageUri: entry.fileUri,
        tags: entry.creativeItemTags ?? null,
        source: 'mobile-google-flow',
        createdAt: entry.createdAt ?? Date.now(),
      });
    });

    return () => {
      subscription.remove();
    };
  }, [saveLibraryItem]);

  const getLibraryItems = useCallback(
    (kind: CreativeAssetKind, profileLocalId?: string | null): CreativeLibraryItem[] =>
      libraryItems.filter((item) => item.kind === kind && matchesProfile(item.profileLocalId, profileLocalId)),
    [libraryItems]
  );

  const value = useMemo(
    () => ({
      addMediaAsset,
      deleteLibraryItems,
      deleteMediaAssets,
      getLibraryItems,
      getMediaAssets,
      isLoading,
      libraryItems,
      markMediaPosted,
      markMediaPostedByFileUri,
      mediaAssets,
      refreshCreativeLibrary,
      saveLibraryItem,
    }),
    [
      addMediaAsset,
      deleteLibraryItems,
      deleteMediaAssets,
      getLibraryItems,
      getMediaAssets,
      isLoading,
      libraryItems,
      markMediaPosted,
      markMediaPostedByFileUri,
      mediaAssets,
      refreshCreativeLibrary,
      saveLibraryItem,
    ]
  );

  return <CreativeLibraryContext.Provider value={value}>{children}</CreativeLibraryContext.Provider>;
}

export function useCreativeLibrary(): CreativeLibraryContextType {
  const context = useContext(CreativeLibraryContext);
  if (!context) {
    throw new Error('useCreativeLibrary must be used within CreativeLibraryProvider');
  }
  return context;
}

export type {
  CreativeAssetKind,
  CreativeLibraryItem,
  CreativeMediaAsset,
  CreativeMediaKind,
  UpsertCreativeLibraryItemInput,
  UpsertCreativeMediaAssetInput,
};

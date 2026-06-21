import AsyncStorage from '@react-native-async-storage/async-storage';

import { BACKEND_URL, CLIENT_APP, APP_TYPE } from '@/auth/constants';
import type { PromptCatalog } from '@/autopilot/promptCatalog/types';
import seedCatalog from '@/autopilot/promptCatalog/seed.json';

const PROMPT_CATALOG_CACHE_KEY = 'kubdee_ai_mobile_prompt_catalog_current_v1';

export type PromptCatalogSource = 'remote' | 'cache' | 'seed';

export interface PromptCatalogLoadResult {
  catalog: PromptCatalog | null;
  version: number | null;
  source: PromptCatalogSource;
  error: string | null;
}

interface PromptCatalogResponse {
  version?: unknown;
  catalog?: unknown;
  error?: string;
}

interface CachedPromptCatalog {
  version: number;
  catalog: PromptCatalog;
  cachedAt: number;
}

function isPromptCatalog(value: unknown): value is PromptCatalog {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const catalog = value as Partial<PromptCatalog>;
  return (
    catalog.schemaVersion === 1 &&
    typeof catalog.catalogVersion === 'number' &&
    Array.isArray(catalog.categories) &&
    Array.isArray(catalog.templates) &&
    Array.isArray(catalog.assembly)
  );
}

function isCachedPromptCatalog(value: unknown): value is CachedPromptCatalog {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const cached = value as Partial<CachedPromptCatalog>;
  return typeof cached.version === 'number' && isPromptCatalog(cached.catalog);
}

async function readCachedPromptCatalog(): Promise<CachedPromptCatalog | null> {
  const raw = await AsyncStorage.getItem(PROMPT_CATALOG_CACHE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isCachedPromptCatalog(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCachedPromptCatalog(input: CachedPromptCatalog): Promise<void> {
  await AsyncStorage.setItem(PROMPT_CATALOG_CACHE_KEY, JSON.stringify(input));
}

export async function loadPromptCatalog(): Promise<PromptCatalogLoadResult> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/prompt-catalog`, {
      headers: {
        'X-Client-App': CLIENT_APP,
        'X-App-Type': APP_TYPE,
      },
    });

    if (!response.ok) {
      throw new Error(response.statusText || `HTTP ${response.status}`);
    }

    const data = (await response.json()) as PromptCatalogResponse;
    if (!isPromptCatalog(data.catalog)) {
      throw new Error(data.error || 'Invalid prompt catalog response');
    }

    const version = Number(data.version ?? data.catalog.catalogVersion);
    const cached = {
      catalog: data.catalog,
      version: Number.isFinite(version) ? version : data.catalog.catalogVersion,
      cachedAt: Date.now(),
    };
    try {
      await writeCachedPromptCatalog(cached);
    } catch {
      // Cache is best-effort; a valid remote catalog should still be used for the run.
    }

    return {
      catalog: cached.catalog,
      version: cached.version,
      source: 'remote',
      error: null,
    };
  } catch (error) {
    const cached = await readCachedPromptCatalog();
    if (cached) {
      return {
        catalog: cached.catalog,
        version: cached.version,
        source: 'cache',
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const fallbackCatalog = seedCatalog as PromptCatalog;
    return {
      catalog: fallbackCatalog,
      version: fallbackCatalog.catalogVersion,
      source: 'seed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

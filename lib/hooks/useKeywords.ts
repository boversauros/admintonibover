'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  getAdminKeywords,
  type AdminKeywordsByLanguage,
} from '@/lib/api/adminReads';
import { useAuth } from '@/lib/auth/AuthContext';

const CACHE_KEY_PREFIX = 'admin_keywords:v2';
const CACHE_DURATION = 1000 * 60 * 60;

interface CachedData {
  keywords: AdminKeywordsByLanguage;
  timestamp: number;
}

function readCache(cacheKey: string): CachedData | null {
  try {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;

    const value = JSON.parse(cached) as Partial<CachedData>;
    if (
      typeof value.timestamp === 'number' &&
      value.keywords &&
      Array.isArray(value.keywords.ca) &&
      Array.isArray(value.keywords.en) &&
      Date.now() - value.timestamp < CACHE_DURATION
    ) {
      return value as CachedData;
    }
    localStorage.removeItem(cacheKey);
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
  return null;
}

function writeCache(cacheKey: string, keywords: AdminKeywordsByLanguage) {
  try {
    localStorage.setItem(
      cacheKey,
      JSON.stringify({ keywords, timestamp: Date.now() } satisfies CachedData)
    );
  } catch {
    // Keyword suggestions still work without the optional local cache.
  }
}

export function useKeywords() {
  const { backend } = useAuth();
  const cacheKey = useMemo(() => `${CACHE_KEY_PREFIX}:${backend}`, [backend]);
  const [keywords, setKeywords] = useState<AdminKeywordsByLanguage>({
    ca: [],
    en: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      const cached = readCache(cacheKey);
      if (cached) {
        setKeywords(cached.keywords);
        setIsLoading(false);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const freshKeywords = await getAdminKeywords(
          backend,
          controller.signal
        );
        setKeywords(freshKeywords);
        writeCache(cacheKey, freshKeywords);
      } catch (reason) {
        if (reason instanceof Error && reason.name === 'AbortError') return;
        setError(
          reason instanceof Error
            ? reason
            : new Error('No s’han pogut carregar les paraules clau.')
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    });

    return () => controller.abort();
  }, [backend, cacheKey]);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const freshKeywords = await getAdminKeywords(backend);
      setKeywords(freshKeywords);
      writeCache(cacheKey, freshKeywords);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason
          : new Error('No s’han pogut carregar les paraules clau.')
      );
    } finally {
      setIsLoading(false);
    }
  }, [backend, cacheKey]);

  const clearCache = useCallback(() => {
    try {
      localStorage.removeItem(cacheKey);
    } catch {
      // Clearing an optional cache is best-effort.
    }
  }, [cacheKey]);

  return { keywords, isLoading, error, refetch, clearCache };
}

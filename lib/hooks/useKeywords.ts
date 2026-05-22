import { useState, useEffect } from 'react';
import { getKeywords, KeywordsByLanguage } from '../api/keywords';

const CACHE_KEY = 'keywords_cache';
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour in milliseconds

interface CachedData {
  keywords: KeywordsByLanguage;
  timestamp: number;
}

/**
 * Custom hook to fetch and cache keywords with localStorage
 * Automatically refetches if cache is older than CACHE_DURATION
 */
export function useKeywords() {
  const [keywords, setKeywords] = useState<KeywordsByLanguage>({
    ca: [],
    en: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchKeywords() {
      try {
        // Check localStorage for cached data
        const cached = localStorage.getItem(CACHE_KEY);

        if (cached) {
          try {
            const cachedData = JSON.parse(cached) as Partial<CachedData>;
            const now = Date.now();

            if (
              cachedData &&
              typeof cachedData.timestamp === 'number' &&
              cachedData.keywords &&
              Array.isArray(cachedData.keywords.ca) &&
              Array.isArray(cachedData.keywords.en) &&
              now - cachedData.timestamp < CACHE_DURATION
            ) {
              setKeywords(cachedData.keywords as KeywordsByLanguage);
              setIsLoading(false);
              return;
            }
          } catch {
            localStorage.removeItem(CACHE_KEY);
          }
        }

        // Fetch fresh data from database
        const freshKeywords = await getKeywords();

        // Update state
        setKeywords(freshKeywords);

        // Cache in localStorage
        const cacheData: CachedData = {
          keywords: freshKeywords,
          timestamp: Date.now(),
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

        setIsLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch keywords'));
        setIsLoading(false);
      }
    }

    fetchKeywords();
  }, []);

  /**
   * Force refetch keywords and update cache
   */
  const refetch = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const freshKeywords = await getKeywords();
      setKeywords(freshKeywords);

      const cacheData: CachedData = {
        keywords: freshKeywords,
        timestamp: Date.now(),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch keywords'));
      setIsLoading(false);
    }
  };

  /**
   * Clear the cache
   */
  const clearCache = () => {
    localStorage.removeItem(CACHE_KEY);
  };

  return {
    keywords,
    isLoading,
    error,
    refetch,
    clearCache,
  };
}

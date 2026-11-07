'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  AdminReadError,
  getAdminCategories,
  getAdminImageInventory,
  type AdminCategory,
} from '@/lib/api/adminReads';
import { downloadBackupAsJson } from '@/lib/api/backup';
import type { ImageInventoryCounts } from '@/lib/domain/media/contracts';

/** The category catalog, as labels for cards and options for the filter. */
export function useCategories() {
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [error, setError] = useState<AdminReadError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void getAdminCategories(controller.signal)
      .then(nextCategories => {
        setCategories(nextCategories);
        setError(null);
      })
      .catch(error => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setError(
          error instanceof AdminReadError
            ? error
            : new AdminReadError(
                'No s’han pogut carregar les categories.',
                500,
                'CATEGORIES_FAILED'
              )
        );
      });
    return () => controller.abort();
  }, [attempt]);

  const labels = useMemo(
    () => new Map(categories.map(category => [category.id, category.nameCa])),
    [categories]
  );
  const options = useMemo(
    () =>
      categories.map(category => ({
        value: category.id,
        label: category.nameCa,
      })),
    [categories]
  );

  const retry = () => {
    setError(null);
    setAttempt(current => current + 1);
  };

  return { labels, options, error, retry };
}

/** Image completeness counts across every post, for the summary panel. */
export function useImageInventory() {
  const [counts, setCounts] = useState<ImageInventoryCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void getAdminImageInventory(controller.signal)
      .then(nextCounts => {
        setCounts(nextCounts);
        setError(null);
      })
      .catch(error => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setCounts(null);
        setError(
          error instanceof Error
            ? error.message
            : 'No s’ha pogut calcular l’inventari d’imatges.'
        );
      });
    return () => controller.abort();
  }, [attempt]);

  /** Recounts in the background, keeping the current counts on screen. */
  const refresh = useCallback(() => setAttempt(current => current + 1), []);

  /** Clears a failed count and tries again. */
  const retry = () => {
    setError(null);
    setCounts(null);
    refresh();
  };

  return { counts, error, refresh, retry };
}

/** Downloads the JSON backup and reports the outcome in a browser alert. */
export function useBackup() {
  const [isBackingUp, setIsBackingUp] = useState(false);

  const backup = async () => {
    setIsBackingUp(true);
    try {
      const result = await downloadBackupAsJson();
      alert(
        `Còpia de seguretat descarregada correctament: ${result.filename} (${result.itemCount} registres).`
      );
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : 'No s’ha pogut generar la còpia de seguretat.'
      );
    } finally {
      setIsBackingUp(false);
    }
  };

  return { backup, isBackingUp };
}

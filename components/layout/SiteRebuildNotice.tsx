'use client';

import { useEffect, useState } from 'react';

import { Button, Text } from '@/components/ui';
import { retrySiteRebuild, SITE_REBUILD_EVENT } from '@/lib/api/siteRebuild';
import type { SiteRebuildStatus } from '@/lib/site-rebuild';

/**
 * Stays visible after a failed site rebuild request until a later save or a
 * manual retry succeeds. Every build reads all published content, so one
 * successful request covers every earlier failure.
 */
export function SiteRebuildNotice() {
  const [failed, setFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    function onRebuild(event: Event) {
      const status = (event as CustomEvent<SiteRebuildStatus>).detail;
      if (status === 'failed') setFailed(true);
      if (status === 'requested') setFailed(false);
    }
    window.addEventListener(SITE_REBUILD_EVENT, onRebuild);
    return () => window.removeEventListener(SITE_REBUILD_EVENT, onRebuild);
  }, []);

  if (!failed) return null;

  async function retry() {
    setRetrying(true);
    const status = await retrySiteRebuild();
    setRetrying(false);
    if (status !== 'failed') setFailed(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-warning/30 bg-background">
      <div className="bg-warning/5">
        <div
          className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3"
          role="alert"
        >
          <Text variant="small">
            Els canvis s’han desat, però la web no s’ha pogut actualitzar.
            Torna-ho a provar d’aquí a uns minuts.
          </Text>
          <Button
            type="button"
            variant="secondary"
            loading={retrying}
            onClick={() => void retry()}
          >
            Actualitzar la web
          </Button>
        </div>
      </div>
    </div>
  );
}

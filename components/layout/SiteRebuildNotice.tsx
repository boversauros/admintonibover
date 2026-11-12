'use client';

import { useEffect, useState } from 'react';

import { Button, Text } from '@/components/ui';
import { retrySiteRebuild, SITE_REBUILD_EVENT } from '@/lib/api/siteRebuild';
import type { SiteRebuildStatus } from '@/lib/site-rebuild';

type NoticeState = 'hidden' | 'failed' | 'retryFailed' | 'updating';

const CONFIRMATION_MS = 8_000;

const MESSAGES: Record<Exclude<NoticeState, 'hidden'>, string> = {
  failed:
    'Els canvis s’han desat, però la web no s’ha pogut actualitzar. Torna-ho a provar d’aquí a uns minuts.',
  retryFailed:
    'La web encara no s’ha pogut actualitzar. Els canvis estan desats; torna-ho a provar d’aquí a uns minuts.',
  updating:
    'La web s’està actualitzant. Els canvis hi apareixeran d’aquí a uns minuts.',
};

/**
 * Stays visible after a failed site rebuild request until a later save or a
 * manual retry succeeds. Every build reads all published content, so one
 * successful request covers every earlier failure. A retry always ends in a
 * visible change: a short confirmation or a "still failing" message.
 */
export function SiteRebuildNotice() {
  const [state, setState] = useState<NoticeState>('hidden');
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    function onRebuild(event: Event) {
      const status = (event as CustomEvent<SiteRebuildStatus>).detail;
      if (status === 'failed') setState('failed');
      if (status === 'requested' || status === 'scheduled') setState('hidden');
    }
    window.addEventListener(SITE_REBUILD_EVENT, onRebuild);
    return () => window.removeEventListener(SITE_REBUILD_EVENT, onRebuild);
  }, []);

  useEffect(() => {
    if (state !== 'updating') return;
    const timer = window.setTimeout(() => setState('hidden'), CONFIRMATION_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (state === 'hidden') return null;

  async function retry() {
    setRetrying(true);
    const status = await retrySiteRebuild();
    setRetrying(false);
    setState(status === 'failed' ? 'retryFailed' : 'updating');
  }

  const updating = state === 'updating';

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-30 border-t bg-background ${
        updating ? 'border-success/30' : 'border-warning/30'
      }`}
    >
      <div className={updating ? 'bg-success/5' : 'bg-warning/5'}>
        <div
          className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3"
          role={updating ? 'status' : 'alert'}
        >
          <Text variant="small">{MESSAGES[state]}</Text>
          {!updating && (
            <Button
              type="button"
              variant="secondary"
              loading={retrying}
              onClick={() => void retry()}
            >
              Actualitzar la web
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

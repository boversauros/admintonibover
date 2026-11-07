'use client';

import { useRef, useState } from 'react';

import type { AdminPostSummary } from '@/lib/api/adminReads';
import { countDraftsWithLegacySlugs } from '@/lib/api/legacySlugs';
import {
  AdminMutationError,
  countDraftPosts,
  deleteAdminPost,
  mutationKey,
  publishAllAdminPosts,
} from '@/lib/api/adminMutations';

export type Confirmation =
  | { kind: 'delete'; post: AdminPostSummary; idempotencyKey: string }
  | { kind: 'bulk'; count: number; idempotencyKey: string };

export type ActionMessage = {
  type: 'error' | 'success' | 'warning';
  text: string;
};

type Options = {
  /** Reload the current list page. */
  onPostsChanged: () => void;
  /** Recount images after a post and its images are gone. */
  onImagesChanged: () => void;
  /** Report a fresh draft count; undefined when it could not be read. */
  onDraftCount: (count: number | undefined) => void;
};

function errorText(error: unknown, fallback: string): string {
  const requestId =
    error instanceof AdminMutationError ? error.requestId : undefined;
  const message = error instanceof Error ? error.message : fallback;
  return requestId ? `${message} Correlació: ${requestId}` : message;
}

/**
 * Deleting a post and publishing every draft. Both go through one
 * confirmation dialog and share a lock, so only one runs at a time.
 */
export function usePostActions({
  onPostsChanged,
  onImagesChanged,
  onDraftCount,
}: Options) {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [bulkConfirmationText, setBulkConfirmationText] = useState('');
  const [message, setMessage] = useState<ActionMessage | null>(null);
  const [isCountingDrafts, setIsCountingDrafts] = useState(false);
  const [isPublishingAll, setIsPublishingAll] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const lockRef = useRef(false);

  const isConfirming = deletingPostId !== null || isPublishingAll;

  const requestDelete = (post: AdminPostSummary) => {
    if (deletingPostId) return;
    setMessage(null);
    setConfirmation({
      kind: 'delete',
      post,
      idempotencyKey: mutationKey('post-delete'),
    });
  };

  const requestPublishAll = async () => {
    if (lockRef.current || isCountingDrafts || isPublishingAll) return;
    lockRef.current = true;
    setIsCountingDrafts(true);
    setMessage(null);
    try {
      const count = await countDraftPosts();
      onDraftCount(count);
      if (count === 0) {
        setMessage({
          type: 'success',
          text: 'No hi ha cap esborrany pendent de publicar.',
        });
        return;
      }
      const legacy = await countDraftsWithLegacySlugs(
        undefined,
        (done, total) =>
          setMessage({
            type: 'success',
            text: `Comprovant les adreces dels esborranys: ${done} de ${total}…`,
          })
      );
      if (legacy > 0) {
        setMessage({
          type: 'error',
          text: `${legacy} esborrany(s) encara tenen una adreça web antiga (un número). Desa’ls abans de publicar-los tots, o demana a un superadministrador que faci servir «Adreces antigues».`,
        });
        return;
      }
      setMessage(null);
      setConfirmation({
        kind: 'bulk',
        count,
        idempotencyKey: mutationKey('posts-publish-all'),
      });
      setBulkConfirmationText('');
    } catch (error) {
      setMessage({
        type: 'error',
        text: errorText(error, 'No s’ha pogut comptar els esborranys.'),
      });
    } finally {
      lockRef.current = false;
      setIsCountingDrafts(false);
    }
  };

  const confirmDelete = async (
    value: Extract<Confirmation, { kind: 'delete' }>
  ) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setDeletingPostId(value.post.id);
    setMessage(null);
    try {
      let result = await deleteAdminPost(value.post, value.idempotencyKey);
      if (result.cleanup.retryWithSameIdempotencyKey) {
        result = await deleteAdminPost(value.post, value.idempotencyKey);
      }
      setConfirmation(null);
      setMessage({
        type: result.cleanup.pending ? 'warning' : 'success',
        text: result.cleanup.pending
          ? 'L’article s’ha eliminat, però la neteja d’alguna imatge continua pendent.'
          : 'S’ha eliminat 1 article.',
      });
      onImagesChanged();
      onPostsChanged();
    } catch (error) {
      setConfirmation(null);
      setMessage({
        type: 'error',
        text: errorText(error, 'No s’ha pogut eliminar l’article.'),
      });
      if (error instanceof AdminMutationError && error.status === 409) {
        onPostsChanged();
      }
    } finally {
      lockRef.current = false;
      setDeletingPostId(null);
    }
  };

  const confirmPublishAll = async (
    value: Extract<Confirmation, { kind: 'bulk' }>
  ) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setIsPublishingAll(true);
    setMessage(null);
    try {
      const result = await publishAllAdminPosts(
        value.count,
        value.idempotencyKey
      );
      setConfirmation(null);
      setBulkConfirmationText('');
      try {
        const remainingCount = await countDraftPosts();
        onDraftCount(remainingCount);
        setMessage({
          type: remainingCount === 0 ? 'success' : 'warning',
          text:
            remainingCount === 0
              ? `${result.publishedCount} article(s) publicats i recompte reconciliat: 0 esborranys pendents.`
              : `${result.publishedCount} article(s) publicats. La reconciliació mostra ${remainingCount} esborrany(s) nou(s) o pendents.`,
        });
      } catch {
        onDraftCount(undefined);
        setMessage({
          type: 'warning',
          text: `${result.publishedCount} article(s) publicats, però no s’ha pogut reconciliar el recompte final.`,
        });
      }
      onPostsChanged();
    } catch (error) {
      setConfirmation(null);
      setMessage({
        type: 'error',
        text: errorText(error, 'No s’ha pogut publicar tots els articles.'),
      });
      if (
        error instanceof AdminMutationError &&
        error.code === 'BULK_COUNT_MISMATCH'
      ) {
        try {
          onDraftCount(await countDraftPosts());
        } catch {
          onDraftCount(undefined);
        }
      }
      onPostsChanged();
    } finally {
      lockRef.current = false;
      setIsPublishingAll(false);
    }
  };

  const confirm = () => {
    if (confirmation?.kind === 'delete') void confirmDelete(confirmation);
    else if (confirmation?.kind === 'bulk') {
      void confirmPublishAll(confirmation);
    }
  };

  /** Closes the dialog, unless the confirmed action is still running. */
  const cancel = () => {
    if (isConfirming) return;
    setConfirmation(null);
    setBulkConfirmationText('');
  };

  return {
    confirmation,
    bulkConfirmationText,
    setBulkConfirmationText,
    message,
    isCountingDrafts,
    isPublishingAll,
    isConfirming,
    requestDelete,
    requestPublishAll,
    confirm,
    cancel,
  };
}

export type PostActions = ReturnType<typeof usePostActions>;

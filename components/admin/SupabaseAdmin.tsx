'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { LoginForm } from '@/components/auth/LoginForm';
import { UserMenu } from '@/components/auth/UserMenu';
import {
  Badge,
  Button,
  Icon,
  Input,
  Modal,
  Pagination,
  Heading,
  Text,
} from '@/components/ui';
import {
  PostCard,
  PostsFilters,
  type FilterStatus,
  type FilterCategory,
  type FilterImageStatus,
  type SortDirection,
} from '@/components/posts';
import {
  AdminReadError,
  getAdminCategories,
  getAdminImageInventory,
  getAdminPostsPage,
  type AdminCategory,
  type AdminPostSummary,
} from '@/lib/api/adminReads';
import { downloadBackupAsJson } from '@/lib/api/backup';
import {
  AdminMutationError,
  countDraftPosts,
  deleteAdminPost,
  isExactBulkConfirmation,
  mutationKey,
  publishAllAdminPosts,
} from '@/lib/api/adminMutations';
import { useAuth } from '@/lib/auth/AuthContext';
import type { ImageInventoryCounts } from '@/lib/domain/media/contracts';
import { ImageInventorySummary } from './ImageInventorySummary';

const POSTS_PER_PAGE = 10;

type ConfirmationState =
  | {
      kind: 'delete';
      post: AdminPostSummary;
      idempotencyKey: string;
    }
  | {
      kind: 'bulk';
      count: number;
      idempotencyKey: string;
    };

function PostsContent() {
  const [posts, setPosts] = useState<AdminPostSummary[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [filterImageStatus, setFilterImageStatus] =
    useState<FilterImageStatus>('all');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number>();
  const [unpublishedCount, setUnpublishedCount] = useState<number>();
  const [isLoading, setIsLoading] = useState(true);
  const [readError, setReadError] = useState<AdminReadError | null>(null);
  const [categoriesError, setCategoriesError] = useState<AdminReadError | null>(
    null
  );
  const [readAttempt, setReadAttempt] = useState(0);
  const [categoryAttempt, setCategoryAttempt] = useState(0);
  const [inventoryCounts, setInventoryCounts] =
    useState<ImageInventoryCounts | null>(null);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [inventoryAttempt, setInventoryAttempt] = useState(0);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isPublishingAll, setIsPublishingAll] = useState(false);
  const [isCountingDrafts, setIsCountingDrafts] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(
    null
  );
  const [bulkConfirmationText, setBulkConfirmationText] = useState('');
  const [mutationMessage, setMutationMessage] = useState<{
    type: 'error' | 'success' | 'warning';
    text: string;
  } | null>(null);
  const operationLockRef = useRef(false);

  const router = useRouter();
  const { backend, user, signOut } = useAuth();
  const isAws = backend === 'aws';
  const cursor = pageCursors[currentPage - 1];

  useEffect(() => {
    const nextSearch = searchQuery.trim();
    if (nextSearch === debouncedSearch) return;

    const timeout = window.setTimeout(() => {
      setIsLoading(true);
      setReadError(null);
      setCurrentPage(1);
      setPageCursors([undefined]);
      setNextCursor(null);
      setDebouncedSearch(nextSearch);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [debouncedSearch, searchQuery]);

  const resetPagination = useCallback(() => {
    setCurrentPage(1);
    setPageCursors([undefined]);
    setNextCursor(null);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void getAdminPostsPage(backend, {
      limit: POSTS_PER_PAGE,
      cursor,
      direction: sortDirection === 'desc' ? 'descending' : 'ascending',
      ...(debouncedSearch ? { title: debouncedSearch } : {}),
      ...(filterStatus === 'published'
        ? { published: true }
        : filterStatus === 'draft'
          ? { published: false }
          : {}),
      ...(filterCategory === 'all' ? {} : { categoryId: filterCategory }),
      ...(filterImageStatus === 'all'
        ? {}
        : { imageStatus: filterImageStatus }),
      signal: controller.signal,
    })
      .then(page => {
        setPosts(page.items);
        setNextCursor(page.nextCursor);
        setTotalCount(page.totalCount);
        setUnpublishedCount(page.unpublishedCount);
        setReadError(null);
      })
      .catch(error => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setPosts([]);
        setNextCursor(null);
        setReadError(
          error instanceof AdminReadError
            ? error
            : new AdminReadError(
                'No s’han pogut carregar els articles.',
                500,
                'READ_FAILED'
              )
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [
    backend,
    cursor,
    debouncedSearch,
    filterCategory,
    filterImageStatus,
    filterStatus,
    readAttempt,
    sortDirection,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    void getAdminCategories(backend, controller.signal)
      .then(nextCategories => {
        setCategories(nextCategories);
        setCategoriesError(null);
      })
      .catch(error => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setCategoriesError(
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
  }, [backend, categoryAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    void getAdminImageInventory(backend, controller.signal)
      .then(counts => {
        setInventoryCounts(counts);
        setInventoryError(null);
      })
      .catch(error => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setInventoryCounts(null);
        setInventoryError(
          error instanceof Error
            ? error.message
            : 'No s’ha pogut calcular l’inventari d’imatges.'
        );
      });
    return () => controller.abort();
  }, [backend, inventoryAttempt]);

  const categoryLabels = useMemo(
    () => new Map(categories.map(category => [category.id, category.nameCa])),
    [categories]
  );
  const categoryOptions = useMemo(
    () =>
      categories.map(category => ({
        value: category.id,
        label: category.nameCa,
      })),
    [categories]
  );

  const beginListChange = useCallback(() => {
    setIsLoading(true);
    setReadError(null);
  }, []);

  const refreshPosts = () => {
    beginListChange();
    setReadAttempt(attempt => attempt + 1);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  const handleStatusChange = (value: FilterStatus) => {
    if (value === filterStatus) return;
    beginListChange();
    resetPagination();
    setFilterStatus(value);
  };

  const handleCategoryChange = (value: FilterCategory) => {
    if (value === filterCategory) return;
    beginListChange();
    resetPagination();
    setFilterCategory(value);
  };

  const handleImageStatusChange = (value: FilterImageStatus) => {
    if (value === filterImageStatus) return;
    beginListChange();
    resetPagination();
    setFilterImageStatus(value);
  };

  const handleSortChange = (value: SortDirection) => {
    if (value === sortDirection) return;
    beginListChange();
    resetPagination();
    setSortDirection(value);
  };

  const handleEdit = (postId: string) => {
    router.push(`/reflexions/${postId}/edit`);
  };

  const handleDelete = (post: AdminPostSummary) => {
    if (deletingPostId) return;
    setMutationMessage(null);
    setConfirmation({
      kind: 'delete',
      post,
      idempotencyKey: mutationKey('post-delete'),
    });
  };

  const handleCreate = () => router.push('/reflexions/new');

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const result = await downloadBackupAsJson(backend);
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

  const handleLogout = async () => {
    try {
      await signOut();
      router.push('/');
    } catch {
      // The authenticated UI remains mounted so the administrator can retry.
    }
  };

  const handlePublishAll = async () => {
    if (operationLockRef.current || isCountingDrafts || isPublishingAll) return;
    operationLockRef.current = true;
    setIsCountingDrafts(true);
    setMutationMessage(null);
    try {
      const count = await countDraftPosts(backend);
      setUnpublishedCount(count);
      if (count === 0) {
        setMutationMessage({
          type: 'success',
          text: 'No hi ha cap esborrany pendent de publicar.',
        });
        return;
      }
      setConfirmation({
        kind: 'bulk',
        count,
        idempotencyKey: mutationKey('posts-publish-all'),
      });
      setBulkConfirmationText('');
    } catch (error) {
      const requestId =
        error instanceof AdminMutationError ? error.requestId : undefined;
      const message =
        error instanceof Error
          ? error.message
          : 'No s’ha pogut comptar els esborranys.';
      setMutationMessage({
        type: 'error',
        text: requestId ? `${message} Correlació: ${requestId}` : message,
      });
    } finally {
      operationLockRef.current = false;
      setIsCountingDrafts(false);
    }
  };

  const confirmDelete = async (
    value: Extract<ConfirmationState, { kind: 'delete' }>
  ) => {
    if (operationLockRef.current) return;
    operationLockRef.current = true;
    setDeletingPostId(value.post.id);
    setMutationMessage(null);
    try {
      let result = await deleteAdminPost(
        backend,
        value.post,
        value.idempotencyKey
      );
      if (result.cleanup.retryWithSameIdempotencyKey) {
        result = await deleteAdminPost(
          backend,
          value.post,
          value.idempotencyKey
        );
      }
      setConfirmation(null);
      setMutationMessage({
        type: result.cleanup.pending ? 'warning' : 'success',
        text: result.cleanup.pending
          ? 'L’article s’ha eliminat, però la neteja d’alguna imatge continua pendent.'
          : 'S’ha eliminat 1 article.',
      });
      setInventoryAttempt(attempt => attempt + 1);
      refreshPosts();
    } catch (error) {
      const requestId =
        error instanceof AdminMutationError ? error.requestId : undefined;
      const message =
        error instanceof Error
          ? error.message
          : 'No s’ha pogut eliminar l’article.';
      setConfirmation(null);
      setMutationMessage({
        type: 'error',
        text: requestId ? `${message} Correlació: ${requestId}` : message,
      });
      if (error instanceof AdminMutationError && error.status === 409) {
        refreshPosts();
      }
    } finally {
      operationLockRef.current = false;
      setDeletingPostId(null);
    }
  };

  const confirmPublishAll = async (
    value: Extract<ConfirmationState, { kind: 'bulk' }>
  ) => {
    if (operationLockRef.current) return;
    operationLockRef.current = true;
    setIsPublishingAll(true);
    setMutationMessage(null);
    try {
      const result = await publishAllAdminPosts(
        backend,
        value.count,
        value.idempotencyKey
      );
      setConfirmation(null);
      setBulkConfirmationText('');
      if (isAws) {
        try {
          const remainingCount = await countDraftPosts(backend);
          setUnpublishedCount(remainingCount);
          setMutationMessage({
            type: remainingCount === 0 ? 'success' : 'warning',
            text:
              remainingCount === 0
                ? `${result.publishedCount} article(s) publicats i recompte reconciliat: 0 esborranys pendents.`
                : `${result.publishedCount} article(s) publicats. La reconciliació mostra ${remainingCount} esborrany(s) nou(s) o pendents.`,
          });
        } catch {
          setUnpublishedCount(undefined);
          setMutationMessage({
            type: 'warning',
            text: `${result.publishedCount} article(s) publicats, però no s’ha pogut reconciliar el recompte final.`,
          });
        }
      } else {
        setUnpublishedCount(0);
        setMutationMessage({
          type: 'success',
          text: `${result.publishedCount} article(s) publicats correctament.`,
        });
      }
      refreshPosts();
    } catch (error) {
      const requestId =
        error instanceof AdminMutationError ? error.requestId : undefined;
      const message =
        error instanceof Error
          ? error.message
          : 'No s’ha pogut publicar tots els articles.';
      setConfirmation(null);
      setMutationMessage({
        type: 'error',
        text: requestId ? `${message} Correlació: ${requestId}` : message,
      });
      if (
        isAws &&
        error instanceof AdminMutationError &&
        error.code === 'BULK_COUNT_MISMATCH'
      ) {
        try {
          setUnpublishedCount(await countDraftPosts(backend));
        } catch {
          setUnpublishedCount(undefined);
        }
      }
      refreshPosts();
    } finally {
      operationLockRef.current = false;
      setIsPublishingAll(false);
    }
  };

  const totalPages =
    totalCount === undefined
      ? undefined
      : Math.max(1, Math.ceil(totalCount / POSTS_PER_PAGE));

  const handlePageChange = (page: number) => {
    if (page === currentPage - 1 && currentPage > 1) {
      beginListChange();
      setCurrentPage(page);
      return;
    }
    if (page === currentPage + 1 && nextCursor) {
      beginListChange();
      setPageCursors(previous => {
        const next = previous.slice(0, currentPage);
        next[currentPage] = nextCursor;
        return next;
      });
      setCurrentPage(page);
    }
  };

  return (
    <div className="min-h-screen bg-background text-primary">
      <header className="sticky top-0 z-50 border-b border-default bg-nav backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Heading
                as="h1"
                size="xl"
                className="mb-0 font-serif text-xl text-primary"
              >
                Toni Bover
              </Heading>
              {isAws ? (
                <Badge
                  variant="accent"
                  className="text-2xs uppercase tracking-wider"
                >
                  AWS
                </Badge>
              ) : null}
            </div>
            <Text
              variant="small"
              className="mt-0.5 text-xs uppercase tracking-wider text-muted"
            >
              Administració del blog
            </Text>
          </div>
          {user ? (
            <div className="flex items-center gap-3">
              <Button onClick={handleCreate} variant="primary">
                <Text as="span" className="flex items-center gap-2">
                  <Icon name="plus" size="3" /> Nou article
                </Text>
              </Button>
              <UserMenu
                user={user}
                onBackup={handleBackup}
                onLogout={handleLogout}
                isBackingUp={isBackingUp}
              />
            </div>
          ) : null}
        </div>
      </header>

      {isAws ? (
        <div className="border-b border-slate-500/20 bg-slate-500/5">
          <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-3 sm:px-6">
            <Icon name="check" size="4" className="mt-0.5 text-slate-400" />
            <Text variant="small" className="text-primary-60">
              Mode AWS actiu. Les lectures i les operacions d’articles passen
              exclusivament per l’API autenticada d’AWS.
            </Text>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <ImageInventorySummary
          counts={inventoryCounts}
          error={inventoryError}
          selected={filterImageStatus}
          onSelect={handleImageStatusChange}
          onRetry={() => {
            setInventoryError(null);
            setInventoryCounts(null);
            setInventoryAttempt(attempt => attempt + 1);
          }}
        />
        <div className="flex flex-wrap items-center gap-4">
          <div className="mt-5 min-w-0 flex-1">
            <PostsFilters
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              filterStatus={filterStatus}
              onFilterChange={handleStatusChange}
              filterCategory={filterCategory}
              onCategoryChange={handleCategoryChange}
              filterImageStatus={filterImageStatus}
              onImageStatusChange={handleImageStatusChange}
              sortDirection={sortDirection}
              onSortChange={handleSortChange}
              categories={categoryOptions}
            />
          </div>
          <Button
            className="mt-5"
            onClick={() => void handlePublishAll()}
            variant="secondary"
            loading={isCountingDrafts || isPublishingAll}
            disabled={unpublishedCount === 0}
          >
            <Text as="span" className="flex items-center gap-2">
              <Icon name="check" size="3" /> Publicar tots
            </Text>
          </Button>
        </div>
        {mutationMessage ? (
          <div
            role={mutationMessage.type === 'error' ? 'alert' : 'status'}
            className={`mt-4 border px-4 py-3 ${
              mutationMessage.type === 'error'
                ? 'border-red-500/30 bg-red-500/10'
                : mutationMessage.type === 'warning'
                  ? 'border-amber-500/30 bg-amber-500/10'
                  : 'border-emerald-500/30 bg-emerald-500/10'
            }`}
          >
            <Text variant="small">{mutationMessage.text}</Text>
          </div>
        ) : null}
        {categoriesError ? (
          <div
            role="alert"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-amber-500/20 bg-amber-500/5 px-4 py-3"
          >
            <Text variant="small" className="text-amber-200/80">
              {categoriesError.message}
              {categoriesError.requestId
                ? ` Correlació: ${categoriesError.requestId}`
                : ''}
            </Text>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCategoriesError(null);
                setCategoryAttempt(attempt => attempt + 1);
              }}
            >
              Reintentar categories
            </Button>
          </div>
        ) : null}
      </div>

      <main
        aria-busy={isLoading}
        aria-live="polite"
        className="mx-auto max-w-6xl px-4 pb-12 sm:px-6"
      >
        {isLoading && posts.length === 0 ? (
          <div className="space-y-4" aria-label="Carregant articles">
            {Array.from({ length: 3 }, (_, index) => (
              <div
                key={index}
                className="h-36 animate-pulse border-b border-overlay-10 bg-overlay-2 motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : readError ? (
          <section
            role="alert"
            className="border border-red-500/20 bg-red-500/5 px-6 py-10 sm:px-10"
          >
            <Badge variant="error" className="mb-5">
              Lectura interrompuda
            </Badge>
            <Heading as="h2" size="2xl" className="mb-3">
              No s’han pogut carregar els articles
            </Heading>
            <Text variant="muted" className="mb-2 max-w-2xl">
              {readError.message}
            </Text>
            {readError.requestId ? (
              <Text variant="small" className="mb-6 text-subtle">
                Correlació: {readError.requestId}
              </Text>
            ) : null}
            <Button variant="secondary" onClick={refreshPosts}>
              <Icon name="arrow-right" size="4" /> Tornar-ho a provar
            </Button>
          </section>
        ) : (
          <>
            <div className={`space-y-4 ${isLoading ? 'opacity-50' : ''}`}>
              {posts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  categoryLabel={
                    categoryLabels.get(post.categoryId) ?? post.categorySlug
                  }
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
              {posts.length === 0 ? (
                <div className="py-16 text-center animate-fade-in-up motion-reduce:animate-none">
                  <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-overlay-5">
                    <Icon
                      name="image-placeholder"
                      size="8"
                      className="text-muted"
                    />
                  </div>
                  <Text variant="muted" className="mb-2">
                    No s’han trobat articles
                  </Text>
                  <Text variant="small" className="text-subtle">
                    {searchQuery ||
                    filterStatus !== 'all' ||
                    filterCategory !== 'all' ||
                    filterImageStatus !== 'all'
                      ? 'Prova una altra cerca o elimina algun filtre'
                      : isAws
                        ? 'La font AWS no conté articles per mostrar'
                        : 'Crea el teu primer article per començar'}
                  </Text>
                </div>
              ) : null}
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              hasNextPage={nextCursor !== null}
              onPageChange={handlePageChange}
              className="mt-8"
            />
          </>
        )}
      </main>

      <Modal
        isOpen={confirmation !== null}
        onClose={() => {
          if (!deletingPostId && !isPublishingAll) {
            setConfirmation(null);
            setBulkConfirmationText('');
          }
        }}
        title={
          confirmation?.kind === 'delete'
            ? 'Eliminar article'
            : 'Publicar tots els esborranys'
        }
        closeOnBackdropClick={!deletingPostId && !isPublishingAll}
        showCloseButton={!deletingPostId && !isPublishingAll}
        footer={
          confirmation ? (
            <>
              <Button
                variant="ghost"
                disabled={!!deletingPostId || isPublishingAll}
                onClick={() => {
                  setConfirmation(null);
                  setBulkConfirmationText('');
                }}
              >
                Cancel·lar
              </Button>
              <Button
                variant={
                  confirmation.kind === 'delete' ? 'destructive' : 'primary'
                }
                loading={!!deletingPostId || isPublishingAll}
                disabled={
                  confirmation.kind === 'bulk' &&
                  isAws &&
                  !isExactBulkConfirmation(
                    bulkConfirmationText,
                    confirmation.count
                  )
                }
                onClick={() => {
                  if (confirmation.kind === 'delete') {
                    void confirmDelete(confirmation);
                  } else {
                    void confirmPublishAll(confirmation);
                  }
                }}
              >
                {confirmation.kind === 'delete'
                  ? 'Eliminar 1 article'
                  : `Publicar ${confirmation.count} article(s)`}
              </Button>
            </>
          ) : null
        }
      >
        {confirmation?.kind === 'delete' ? (
          <div className="space-y-3">
            <Text>
              Eliminaràs definitivament 1 article:{' '}
              <strong>
                {confirmation.post.titles.ca || confirmation.post.titles.en}
              </strong>
              .
            </Text>
            <Text variant="small" className="text-subtle">
              Si una imatge no es pot netejar al primer intent, es repetirà
              l’operació amb la mateixa clau segura.
            </Text>
          </div>
        ) : confirmation?.kind === 'bulk' ? (
          <div className="space-y-3">
            <Text>
              Aquesta acció publicarà exactament{' '}
              <strong>{confirmation.count} article(s)</strong> que ara són
              esborranys.
            </Text>
            <Text variant="small" className="text-subtle">
              Els articles importats no canvien d’estat fins que confirmis
              explícitament aquesta operació.
            </Text>
            {isAws ? (
              <div className="border-l-2 border-amber-400/60 bg-amber-400/5 px-4 py-3">
                <Input
                  id="bulk-publication-count"
                  label={`Escriu ${confirmation.count} per confirmar`}
                  value={bulkConfirmationText}
                  onChange={event =>
                    setBulkConfirmationText(event.target.value)
                  }
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  aria-describedby="bulk-publication-help"
                  isInvalid={
                    bulkConfirmationText.length > 0 &&
                    !isExactBulkConfirmation(
                      bulkConfirmationText,
                      confirmation.count
                    )
                  }
                  className="font-mono tabular-nums"
                />
                <div id="bulk-publication-help">
                  <Text variant="small" className="mt-2 text-amber-100/70">
                    El recompte queda vinculat a aquesta operació. Si canvia
                    abans d’executar-la, no es publicarà cap esborrany.
                  </Text>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

export function SupabaseAdmin() {
  return (
    <AuthGuard
      fallback={
        <div className="flex min-h-screen items-center justify-center p-8">
          <LoginForm />
        </div>
      }
    >
      <PostsContent />
    </AuthGuard>
  );
}

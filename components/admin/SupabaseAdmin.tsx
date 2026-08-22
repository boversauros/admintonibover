'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { LoginForm } from '@/components/auth/LoginForm';
import { UserMenu } from '@/components/auth/UserMenu';
import {
  Badge,
  Button,
  Icon,
  Pagination,
  Heading,
  Text,
} from '@/components/ui';
import {
  PostCard,
  PostsFilters,
  type FilterStatus,
  type FilterCategory,
  type SortDirection,
} from '@/components/posts';
import {
  AdminReadError,
  getAdminCategories,
  getAdminPostsPage,
  type AdminCategory,
  type AdminPostSummary,
} from '@/lib/api/adminReads';
import { downloadBackupAsJson } from '@/lib/api/backup';
import { deletePost, publishAllPosts } from '@/lib/api/posts';
import { useAuth } from '@/lib/auth/AuthContext';

const POSTS_PER_PAGE = 10;

function PostsContent() {
  const [posts, setPosts] = useState<AdminPostSummary[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number>();
  const [unpublishedCount, setUnpublishedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [readError, setReadError] = useState<AdminReadError | null>(null);
  const [categoriesError, setCategoriesError] = useState<AdminReadError | null>(
    null
  );
  const [readAttempt, setReadAttempt] = useState(0);
  const [categoryAttempt, setCategoryAttempt] = useState(0);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isPublishingAll, setIsPublishingAll] = useState(false);

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
      signal: controller.signal,
    })
      .then(page => {
        setPosts(page.items);
        setNextCursor(page.nextCursor);
        setTotalCount(page.totalCount);
        setUnpublishedCount(page.unpublishedCount ?? 0);
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

  const handleSortChange = (value: SortDirection) => {
    if (value === sortDirection) return;
    beginListChange();
    resetPagination();
    setSortDirection(value);
  };

  const handleEdit = (postId: string) => {
    router.push(`/reflexions/${postId}/edit`);
  };

  const handleDelete = async (post: AdminPostSummary) => {
    if (isAws) return;
    const title = post.titles.ca || post.titles.en;
    if (!confirm(`Eliminar "${title}"?`)) return;
    try {
      await deletePost(post.id);
      refreshPosts();
    } catch {
      alert('Failed to delete post');
    }
  };

  const handleCreate = () => router.push('/reflexions/new');

  const handleBackup = async () => {
    if (isAws) return;
    setIsBackingUp(true);
    try {
      await downloadBackupAsJson();
      alert('Còpia de seguretat descarregada correctament.');
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
    if (isAws || unpublishedCount === 0) return;
    if (!confirm('Segur que vols publicar tots els articles?')) return;
    setIsPublishingAll(true);
    try {
      const count = await publishAllPosts();
      refreshPosts();
      alert(`${count} article(s) publicats correctament.`);
    } catch {
      alert('No s’ha pogut publicar tots els articles.');
    } finally {
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
                  Lectura AWS
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
              {!isAws ? (
                <Button onClick={handleCreate} variant="primary">
                  <Text as="span" className="flex items-center gap-2">
                    <Icon name="plus" size="3" /> Nou article
                  </Text>
                </Button>
              ) : null}
              <UserMenu
                user={user}
                onBackup={isAws ? undefined : handleBackup}
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
              Mode de verificació de lectura. Crear, desar, eliminar, publicar i
              descarregar còpies continuen desactivats fins a les següents fases
              de la migració.
            </Text>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <PostsFilters
              searchQuery={searchQuery}
              onSearchChange={handleSearchChange}
              filterStatus={filterStatus}
              onFilterChange={handleStatusChange}
              filterCategory={filterCategory}
              onCategoryChange={handleCategoryChange}
              sortDirection={sortDirection}
              onSortChange={handleSortChange}
              categories={categoryOptions}
            />
          </div>
          {!isAws ? (
            <Button
              onClick={handlePublishAll}
              variant="secondary"
              loading={isPublishingAll}
              disabled={unpublishedCount === 0}
            >
              <Text as="span" className="flex items-center gap-2">
                <Icon name="check" size="3" /> Publicar tots
              </Text>
            </Button>
          ) : null}
        </div>
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
                  onDelete={isAws ? undefined : handleDelete}
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
                    filterCategory !== 'all'
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

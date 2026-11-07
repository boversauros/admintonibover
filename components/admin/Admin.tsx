'use client';

import { useRouter } from 'next/navigation';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { LoginForm } from '@/components/auth/LoginForm';
import { UserMenu } from '@/components/auth/UserMenu';
import { AppHeader } from '@/components/layout/AppHeader';
import { PostsFilters } from '@/components/posts';
import { Button, Icon, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthContext';

import { ImageInventorySummary } from './ImageInventorySummary';
import { PostActionsModal } from './PostActionsModal';
import { PostListView } from './PostListView';
import { useBackup, useCategories, useImageInventory } from './useAdminData';
import { usePostActions, type ActionMessage } from './usePostActions';
import { usePostList } from './usePostList';

const MESSAGE_TONES: Record<ActionMessage['type'], string> = {
  error: 'border-danger/30 bg-danger/5',
  warning: 'border-warning/30 bg-warning/5',
  success: 'border-success/30 bg-success/5',
};

function PostsContent() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const list = usePostList();
  const categories = useCategories();
  const inventory = useImageInventory();
  const { backup, isBackingUp } = useBackup();
  const actions = usePostActions({
    onPostsChanged: list.refresh,
    onImagesChanged: inventory.refresh,
    onDraftCount: list.setUnpublishedCount,
  });
  const { filters, setFilter } = list;

  const handleLogout = async () => {
    try {
      await signOut();
    } catch {
      // The authenticated UI remains mounted so the administrator can retry.
    }
  };

  return (
    <div className="min-h-screen bg-background text-primary">
      <AppHeader
        brandAsHeading
        actions={
          user ? (
            <>
              <Button
                onClick={() => router.push('/reflexions/new')}
                variant="primary"
              >
                <Icon name="plus" size="3" /> Nou article
              </Button>
              <UserMenu
                user={user}
                onBackup={backup}
                onLogout={handleLogout}
                isBackingUp={isBackingUp}
              />
            </>
          ) : null
        }
      />

      <div className="border-b border-subtle">
        <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-3 sm:px-6">
          <Icon name="check" size="4" className="mt-0.5 text-muted" />
          <Text variant="small" className="text-primary/60">
            Les lectures i les operacions d’articles passen exclusivament per
            l’API autenticada d’AWS.
          </Text>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <ImageInventorySummary
          counts={inventory.counts}
          error={inventory.error}
          selected={filters.imageStatus}
          onSelect={value => setFilter('imageStatus', value)}
          onRetry={inventory.retry}
        />
        <div className="flex flex-wrap items-center gap-4">
          <div className="mt-5 min-w-0 flex-1">
            <PostsFilters
              searchQuery={list.searchQuery}
              onSearchChange={list.setSearchQuery}
              filterStatus={filters.status}
              onFilterChange={value => setFilter('status', value)}
              filterCategory={filters.category}
              onCategoryChange={value => setFilter('category', value)}
              filterImageStatus={filters.imageStatus}
              onImageStatusChange={value => setFilter('imageStatus', value)}
              sortDirection={filters.sort}
              onSortChange={value => setFilter('sort', value)}
              categories={categories.options}
            />
          </div>
          <Button
            className="mt-5"
            onClick={() => void actions.requestPublishAll()}
            variant="secondary"
            loading={actions.isCountingDrafts || actions.isPublishingAll}
            disabled={list.unpublishedCount === 0}
          >
            <Text as="span" className="flex items-center gap-2">
              <Icon name="check" size="3" /> Publicar tots
            </Text>
          </Button>
        </div>
        {actions.message ? (
          <div
            role={actions.message.type === 'error' ? 'alert' : 'status'}
            className={`mt-4 border px-4 py-3 ${MESSAGE_TONES[actions.message.type]}`}
          >
            <Text variant="small">{actions.message.text}</Text>
          </div>
        ) : null}
        {categories.error ? (
          <div
            role="alert"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-warning/30 bg-warning/5 px-4 py-3"
          >
            <Text variant="small" className="text-body">
              {categories.error.message}
              {categories.error.requestId
                ? ` Correlació: ${categories.error.requestId}`
                : ''}
            </Text>
            <Button variant="ghost" size="sm" onClick={categories.retry}>
              Reintentar categories
            </Button>
          </div>
        ) : null}
      </div>

      <PostListView
        list={list}
        categoryLabels={categories.labels}
        onEdit={postId => router.push(`/reflexions/${postId}/edit`)}
        onDelete={actions.requestDelete}
      />

      <PostActionsModal actions={actions} />
    </div>
  );
}

export function Admin() {
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

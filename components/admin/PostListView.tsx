'use client';

import { PostCard } from '@/components/posts';
import {
  Badge,
  Button,
  Heading,
  Icon,
  Pagination,
  Text,
} from '@/components/ui';
import type { AdminPostSummary } from '@/lib/api/adminReads';

import type { PostList } from './usePostList';

type PostListViewProps = {
  list: PostList;
  categoryLabels: Map<string, string>;
  onEdit: (postId: string) => void;
  onDelete: (post: AdminPostSummary) => void;
};

/** The post cards, or a loading skeleton, read error or empty state. */
export function PostListView({
  list,
  categoryLabels,
  onEdit,
  onDelete,
}: PostListViewProps) {
  const { posts, isLoading, readError } = list;

  return (
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
              className="h-36 animate-pulse border-b border-default bg-overlay-2 motion-reduce:animate-none"
            />
          ))}
        </div>
      ) : readError ? (
        <section
          role="alert"
          className="border border-danger/30 bg-danger/5 px-6 py-10 sm:px-10"
        >
          <Badge tone="danger" className="mb-5">
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
          <Button variant="secondary" onClick={list.refresh}>
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
                onEdit={onEdit}
                onDelete={onDelete}
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
                  {list.hasFilters
                    ? 'Prova una altra cerca o elimina algun filtre'
                    : 'La font AWS no conté articles per mostrar'}
                </Text>
              </div>
            ) : null}
          </div>

          <Pagination
            currentPage={list.currentPage}
            totalPages={list.totalPages}
            hasNextPage={list.hasNextPage}
            onPageChange={list.goToPage}
            className="mt-8"
          />
        </>
      )}
    </main>
  );
}

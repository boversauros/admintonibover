'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { LoginForm } from '@/components/auth/LoginForm';
import { UserMenu } from '@/components/auth/UserMenu';
import { Button, Icon, Pagination, Heading, Text } from '@/components/ui';
import {
  PostCard,
  PostsFilters,
  FilterStatus,
  FilterCategory,
} from '@/components/posts';
import { downloadBackupAsJson } from '@/lib/api/backup';
import { getPosts, deletePost } from '@/lib/api/posts';
import { StoredPost } from '@/lib/types/post';
import { useAuth } from '@/lib/auth/AuthContext';

const categoryLabels: Record<string, string> = {
  '1': 'Vivències',
  '2': 'Influències',
  '3': 'Perspectives',
};

function PostsContent() {
  const [posts, setPosts] = useState<StoredPost[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [isBackingUp, setIsBackingUp] = useState(false);

  const POSTS_PER_PAGE = 10;
  const router = useRouter();
  const { user, signOut } = useAuth();

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const data = await getPosts();
        setPosts(data);
      } catch (error) {
        console.error('Error loading posts:', error);
      }
    };
    fetchPosts();
  }, []);

  const refreshPosts = async () => {
    try {
      const data = await getPosts();
      setPosts(data);
    } catch (error) {
      console.error('Error refreshing posts:', error);
    }
  };

  const handleEdit = (post: StoredPost) => {
    router.push(`/reflexions/${post.id}/edit`);
  };

  const handleDelete = async (post: StoredPost) => {
    if (confirm(`Eliminar "${post.translations.ca.title}"?`)) {
      try {
        await deletePost(post.id);
        await refreshPosts();
      } catch (error) {
        console.error('Error deleting post:', error);
        alert('Failed to delete post');
      }
    }
  };

  const handleCreate = () => {
    router.push('/reflexions/new');
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      await downloadBackupAsJson();
      alert('Còpia de seguretat descarregada correctament.');
    } catch (error) {
      console.error('Error creating backup:', error);
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
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      const matchesSearch =
        post.translations.ca?.title
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        post.translations.en?.title
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase());
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'published' && post.is_published) ||
        (filterStatus === 'draft' && !post.is_published);
      const matchesCategory =
        filterCategory === 'all' || post.category_id === filterCategory;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [posts, searchQuery, filterStatus, filterCategory]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus, filterCategory]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredPosts.length / POSTS_PER_PAGE);
  const paginatedPosts = useMemo(() => {
    const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
    return filteredPosts.slice(startIndex, startIndex + POSTS_PER_PAGE);
  }, [filteredPosts, currentPage]);

  return (
    <div className="min-h-screen bg-background text-primary">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-nav backdrop-blur-sm border-b border-default">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <Heading
              as="h1"
              size="xl"
              className="text-xl font-serif text-primary mb-0"
            >
              Toni Bover
            </Heading>
            <Text
              variant="small"
              className="text-xs text-muted tracking-wider uppercase mt-0.5"
            >
              Administració del blog
            </Text>
          </div>
          {user && (
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
          )}
        </div>
      </header>

      {/* Filters */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        <PostsFilters
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filterStatus={filterStatus}
          onFilterChange={setFilterStatus}
          filterCategory={filterCategory}
          onCategoryChange={setFilterCategory}
        />
      </div>

      {/* Posts Grid */}
      <main className="max-w-6xl mx-auto px-6 pb-12">
        <div className="space-y-4">
          {paginatedPosts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              categoryLabel={
                categoryLabels[post.category_id] || post.category_id
              }
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
          {filteredPosts.length === 0 && (
            <div className="text-center py-16 animate-fade-in-up">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-overlay-5 mb-4">
                <svg
                  className="w-8 h-8 text-muted"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                  />
                </svg>
              </div>
              <Text variant="muted" className="mb-2">
                No s'han trobat articles
              </Text>
              <Text variant="small" className="text-subtle">
                {searchQuery
                  ? 'Prova amb un altre terme de cerca'
                  : 'Crea el teu primer article per començar'}
              </Text>
            </div>
          )}
        </div>

        {/* Pagination */}
        {filteredPosts.length > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            className="mt-8"
          />
        )}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <AuthGuard
      fallback={
        <div className="min-h-screen flex items-center justify-center p-8">
          <LoginForm />
        </div>
      }
    >
      <PostsContent />
    </AuthGuard>
  );
}

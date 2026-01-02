'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { LoginForm } from '@/components/auth/LoginForm';
import { Button, Icon } from '@/components/ui';
import { PostCard, PostsFilters, FilterStatus } from '@/components/posts';
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
      return matchesSearch && matchesStatus;
    });
  }, [posts, searchQuery, filterStatus]);

  // Get display name from various possible fields
  const getUserDisplayName = () => {
    if (!user) return '';
    return user.email;
  };

  return (
    <div className="min-h-screen bg-background text-primary">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-nav backdrop-blur-sm border-b border-default">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-serif text-primary">Toni Bover</h1>
            <p className="text-xs text-muted tracking-wider uppercase mt-0.5">
              Administració del blog
            </p>
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted">
                {getUserDisplayName()}
              </span>
              <Button onClick={handleLogout} variant="secondary">
                <span className="flex items-center gap-2">Tancar sessió</span>
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Filters */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <PostsFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filterStatus={filterStatus}
            onFilterChange={setFilterStatus}
          />
          <Button onClick={handleCreate} variant="primary">
            <span className="flex items-center gap-2">
              <Icon name="plus" size="3" /> Nou article
            </span>
          </Button>
        </div>
      </div>

      {/* Posts Grid */}
      <main className="max-w-6xl mx-auto px-6 pb-12">
        <div className="space-y-4">
          {filteredPosts.map(post => (
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
            <div className="text-center py-16">
              <p className="text-muted">No s'han trobat articles</p>
            </div>
          )}
        </div>
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

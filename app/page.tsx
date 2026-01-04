'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { LoginForm } from '@/components/auth/LoginForm';
import { Button, Icon, Pagination, Heading, Text } from '@/components/ui';
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
  const [currentPage, setCurrentPage] = useState(1);
  const [showAvatarDropdown, setShowAvatarDropdown] = useState(false);

  const POSTS_PER_PAGE = 10;
  const avatarDropdownRef = useRef<HTMLDivElement>(null);
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
      setShowAvatarDropdown(false);
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  // Get user initials from name or email
  const getUserInitials = () => {
    if (!user) return 'U';

    // Try to get initials from user_metadata name first
    const name = user.user_metadata?.name || user.user_metadata?.full_name;
    if (name) {
      const nameParts = name.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        return (nameParts[0][0] + nameParts[1][0]).toUpperCase();
      }
      if (nameParts[0].length >= 2) {
        return nameParts[0].substring(0, 2).toUpperCase();
      }
      return nameParts[0][0].toUpperCase();
    }

    // Fall back to email
    if (user.email) {
      const email = user.email;
      const parts = email.split('@')[0];
      if (parts.length >= 2) {
        return parts.substring(0, 2).toUpperCase();
      }
      return email.charAt(0).toUpperCase();
    }

    return 'U';
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        avatarDropdownRef.current &&
        !avatarDropdownRef.current.contains(event.target as Node)
      ) {
        setShowAvatarDropdown(false);
      }
    };

    if (showAvatarDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAvatarDropdown]);

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

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterStatus]);

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
              <div className="relative" ref={avatarDropdownRef}>
                <Button
                  onClick={() => setShowAvatarDropdown(!showAvatarDropdown)}
                  variant="icon"
                  className="w-10 h-10 rounded-full bg-overlay-10 text-primary font-medium text-sm hover:bg-overlay-20"
                  aria-label="User menu"
                >
                  {getUserInitials()}
                </Button>
                {showAvatarDropdown && (
                  <div className="absolute right-0 mt-2 w-56 bg-surface border border-default shadow-lg animate-fade-in">
                    <div className="py-2">
                      <div className="px-4 py-2 border-b border-subtle">
                        <Text variant="small" className="text-muted">
                          Usuari
                        </Text>
                        <Text variant="small" className="text-primary mt-1">
                          {user.email}
                        </Text>
                      </div>
                      <div className="px-2 py-1">
                        <Button
                          onClick={handleLogout}
                          variant="ghost"
                          size="sm"
                          className="w-full text-left px-3 py-2 text-sm"
                        >
                          Tancar sessió
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
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

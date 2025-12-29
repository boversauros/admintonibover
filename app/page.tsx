'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { LoginForm } from '@/components/auth/LoginForm';
import { Header } from '@/components/layout/Header';
import { Table, Link, Container, Heading } from '@/components/ui';
import { getPosts, deletePost } from '@/lib/api/posts';
import { StoredPost } from '@/lib/types/post';

const categoryLabels: Record<string, string> = {
  '1': 'Vivències',
  '2': 'Influències',
  '3': 'Perspectives',
};

function PostsContent() {
  const [posts, setPosts] = useState<StoredPost[]>([]);
  const router = useRouter();

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

  const columns = [
    {
      key: 'created_at' as keyof StoredPost,
      label: 'Title (CA)',
      render: (_: any, row: StoredPost) => row.translations.ca.title,
    },
    {
      key: 'updated_at' as keyof StoredPost,
      label: 'Title (EN)',
      render: (_: any, row: StoredPost) => row.translations.en.title,
    },
    {
      key: 'category_id' as keyof StoredPost,
      label: 'Category',
      render: (value: any) => categoryLabels[value as string] || value,
    },
  ];

  const actions = [
    {
      label: 'Edit',
      onClick: (post: StoredPost) => {
        router.push(`/reflexions/${post.id}/edit`);
      },
    },
    {
      label: 'Delete',
      onClick: async (post: StoredPost) => {
        if (confirm(`Delete "${post.translations.ca.title}"?`)) {
          try {
            await deletePost(post.id);
            await refreshPosts();
          } catch (error) {
            console.error('Error deleting post:', error);
            alert('Failed to delete post');
          }
        }
      },
    },
  ];

  return (
    <>
      <Header />
      <div className="min-h-screen p-8">
        <Container as="main" size="wide" spacing="none">
          <div className="flex justify-between items-center mb-8">
            <Heading as="h1" size="4xl">
              Reflexions
            </Heading>
            <Link href="/reflexions/new" variant="accent-border">
              + New Reflexion
            </Link>
          </div>

          <section>
            <Table
              data={posts}
              columns={columns}
              actions={actions}
              rowKey={(post) => post.id}
              emptyMessage="No posts yet. Create your first reflexion!"
              striped
              hoverable
            />
          </section>
        </Container>
      </div>
    </>
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

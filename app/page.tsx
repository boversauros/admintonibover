'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Table, Link } from '@/components/ui';
import { getPosts, savePosts } from '@/lib/utils/localStorage';
import { StoredPost } from '@/lib/types/post';

const categoryLabels: Record<string, string> = {
  tech: 'Technology',
  design: 'Design',
  philosophy: 'Philosophy',
  personal: 'Personal',
};

export default function Home() {
  const [posts, setPosts] = useState<StoredPost[]>([]);
  const router = useRouter();

  useEffect(() => {
    setPosts(getPosts());
  }, []);

  const refreshPosts = () => {
    setPosts(getPosts());
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
      onClick: (post: StoredPost) => {
        if (confirm(`Delete "${post.translations.ca.title}"?`)) {
          const updatedPosts = posts.filter(p => p.id !== post.id);
          savePosts(updatedPosts);
          refreshPosts();
        }
      },
    },
  ];

  return (
    <div className="min-h-screen p-8">
      <main className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">Reflexions</h1>
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
      </main>
    </div>
  );
}

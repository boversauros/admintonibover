'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PostForm } from '@/components/forms/PostForm';
import { getPosts } from '@/lib/utils/localStorage';
import { StoredPost } from '@/lib/types/post';

export default function EditReflexionPage() {
  const params = useParams();
  const router = useRouter();
  const [post, setPost] = useState<StoredPost | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const postId = params.id as string;
    const posts = getPosts();
    const foundPost = posts.find(p => p.id === postId);

    if (foundPost) {
      setPost(foundPost);
    } else {
      setNotFound(true);
    }
  }, [params.id]);

  const handleSuccess = () => {
    router.push('/');
  };

  if (notFound) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-4">Post Not Found</h1>
          <p className="text-muted mb-4">The post you're trying to edit doesn't exist.</p>
          <button
            onClick={() => router.push('/')}
            className="text-accent hover:underline"
          >
            ← Back to posts
          </button>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-muted">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => router.push('/')}
            className="text-muted hover:text-primary mb-4 transition-colors-default"
          >
            ← Back to posts
          </button>
          <h1 className="text-4xl font-bold mb-2">Edit Reflexion</h1>
          <p className="text-muted">Update your bilingual post</p>
        </div>

        <PostForm initialData={post} onSuccess={handleSuccess} />
      </div>
    </div>
  );
}

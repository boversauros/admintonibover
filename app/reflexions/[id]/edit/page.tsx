'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { PostForm } from '@/components/forms/PostForm';
import { getPosts } from '@/lib/api/posts';
import { StoredPost } from '@/lib/types/post';
import { Container, Heading, Text, Link } from '@/components/ui';

function EditReflexionContent() {
  const params = useParams();
  const router = useRouter();
  const [post, setPost] = useState<StoredPost | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchPost = async () => {
      try {
        const postId = params.id as string;
        const posts = await getPosts();
        const foundPost = posts.find(p => p.id === postId);

        if (foundPost) {
          setPost(foundPost);
        } else {
          setNotFound(true);
        }
      } catch (error) {
        console.error('Error loading post:', error);
        setNotFound(true);
      }
    };
    fetchPost();
  }, [params.id]);

  const handleSuccess = () => {
    router.push('/');
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-background p-8">
        <Container size="default" spacing="none">
          <Heading as="h1" size="4xl" className="mb-4">
            Article no trobat
          </Heading>
          <Text variant="muted" className="mb-4">
            L'article que busques no existeix.
          </Text>
          <Link href="/" variant="accent-border">
            ← Tornar
          </Link>
        </Container>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Text variant="muted">Carregant...</Text>
      </div>
    );
  }

  return <PostForm initialData={post} onSuccess={handleSuccess} />;
}

export default function EditReflexionPage() {
  return (
    <AuthGuard fallback={null}>
      <EditReflexionContent />
    </AuthGuard>
  );
}

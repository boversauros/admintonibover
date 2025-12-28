'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PostForm } from '@/components/forms/PostForm';
import { getPosts } from '@/lib/api/posts';
import { StoredPost } from '@/lib/types/post';
import { Container, Heading, Text, Link } from '@/components/ui';

export default function EditReflexionPage() {
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
      <div className="min-h-screen p-8">
        <Container size="default" spacing="none">
          <Heading as="h1" size="4xl" className="mb-4">Post Not Found</Heading>
          <Text variant="muted" className="mb-4">The post you're trying to edit doesn't exist.</Text>
          <Link href="/" variant="accent-border">
            ← Back to posts
          </Link>
        </Container>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen p-8">
        <Container size="default" spacing="none">
          <Text variant="muted">Loading...</Text>
        </Container>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <Container size="default" spacing="none">
        <div className="mb-8">
          <Link href="/" variant="muted" className="mb-4 inline-block">
            ← Back to posts
          </Link>
          <Heading as="h1" size="4xl" className="mb-2">Edit Reflexion</Heading>
          <Text variant="muted">Update your bilingual post</Text>
        </div>

        <PostForm initialData={post} onSuccess={handleSuccess} />
      </Container>
    </div>
  );
}

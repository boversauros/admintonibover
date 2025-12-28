'use client';

import { PostForm } from '@/components/forms/PostForm';
import { Container, Heading, Text } from '@/components/ui';

export default function NewReflexionPage() {
  return (
    <div className="min-h-screen p-8">
      <Container size="default" spacing="none">
        <div className="mb-8">
          <Heading as="h1" size="4xl" className="mb-2">New Reflexion</Heading>
          <Text variant="muted">Create a new bilingual post with Catalan and English translations</Text>
        </div>

        <PostForm />
      </Container>
    </div>
  );
}

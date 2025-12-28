"use client";

import { useRouter } from "next/navigation";
import { PostForm } from "@/components/forms/PostForm";
import { Container, Heading, Text, Link } from "@/components/ui";

export default function NewReflexionPage() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push("/");
  };

  return (
    <div className="min-h-screen p-8">
      <Container size="default" spacing="none">
        <div className="mb-8">
          <Link href="/" variant="muted" className="mb-4 inline-block">
            ← Back to posts
          </Link>
          <Heading as="h1" size="4xl" className="mb-2">
            New Reflexion
          </Heading>
          <Text variant="muted">
            Create a new bilingual post with Catalan and English translations
          </Text>
        </div>

        <PostForm onSuccess={handleSuccess} />
      </Container>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Header } from "@/components/layout/Header";
import { PostForm } from "@/components/forms/PostForm";
import { Container, Heading, Text, Link } from "@/components/ui";

function NewReflexionContent() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push("/");
  };

  return (
    <>
      <Header />
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
    </>
  );
}

export default function NewReflexionPage() {
  return (
    <AuthGuard fallback={null}>
      <NewReflexionContent />
    </AuthGuard>
  );
}

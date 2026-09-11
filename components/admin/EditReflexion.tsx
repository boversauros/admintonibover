'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { PostForm } from '@/components/forms/PostForm';
import { Badge, Button, Container, Heading, Text, Link } from '@/components/ui';
import { AdminReadError, getAdminPostById } from '@/lib/api/adminReads';
import type { StoredPost } from '@/lib/types/post';

type EditLoadState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; error: AdminReadError }
  | { status: 'ready'; post: StoredPost };

function EditReflexionContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<EditLoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void getAdminPostById(params.id, controller.signal)
      .then(post => {
        setState(post ? { status: 'ready', post } : { status: 'not-found' });
      })
      .catch(error => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setState({
          status: 'error',
          error:
            error instanceof AdminReadError
              ? error
              : new AdminReadError(
                  'No s’ha pogut carregar l’article.',
                  500,
                  'DETAIL_FAILED'
                ),
        });
      });
    return () => controller.abort();
  }, [attempt, params.id]);

  const handleSuccess = () => router.push('/');

  if (state.status === 'not-found') {
    return (
      <div className="min-h-screen bg-background p-8">
        <Container size="default" spacing="none">
          <Heading as="h1" size="4xl" className="mb-4">
            Article no trobat
          </Heading>
          <Text variant="muted" className="mb-4">
            L’article que busques no existeix.
          </Text>
          <Link href="/" variant="accent-border">
            ← Tornar
          </Link>
        </Container>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="min-h-screen bg-background p-6 sm:p-10">
        <Container size="default" spacing="none">
          <section
            role="alert"
            className="border border-red-500/20 bg-red-500/5 px-6 py-10 sm:px-10"
          >
            <Badge variant="error" className="mb-5">
              Lectura interrompuda
            </Badge>
            <Heading as="h1" size="3xl" className="mb-3">
              No s’ha pogut obrir l’article
            </Heading>
            <Text variant="muted" className="mb-2">
              {state.error.message}
            </Text>
            {state.error.requestId ? (
              <Text variant="small" className="mb-6 text-subtle">
                Correlació: {state.error.requestId}
              </Text>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setState({ status: 'loading' });
                  setAttempt(value => value + 1);
                }}
              >
                Tornar-ho a provar
              </Button>
              <Button variant="ghost" onClick={() => router.push('/')}>
                Tornar al llistat
              </Button>
            </div>
          </section>
        </Container>
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div
        aria-busy="true"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center bg-background"
      >
        <Text variant="muted">Carregant l’article…</Text>
      </div>
    );
  }

  return <PostForm initialData={state.post} onSuccess={handleSuccess} />;
}

export function EditReflexion() {
  return (
    <AuthGuard fallback={null}>
      <EditReflexionContent />
    </AuthGuard>
  );
}

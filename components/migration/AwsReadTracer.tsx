'use client';

import { useEffect, useState } from 'react';

import { Badge, Button, Heading, Text } from '@/components/ui';
import {
  isTracerSuccessResponse,
  TRACER_POST_ID,
  type TracerApiResponse,
  type TracerPost,
} from '@/lib/aws/tracer-contract';
import { useAuth } from '@/lib/auth/AuthContext';
import { AwsMediaRepair } from '@/components/migration/AwsMediaRepair';

type TracerState =
  | { status: 'loading' }
  | { status: 'error'; message: string; requestId?: string }
  | { status: 'ready'; post: TracerPost; requestId: string };

const PATH_STEPS = ['Cognito', 'HTTP API', 'Lambda', 'DynamoDB'] as const;

async function loadTracerPost(signal: AbortSignal): Promise<TracerState> {
  const response = await fetch(
    `/api/aws/posts/${encodeURIComponent(TRACER_POST_ID)}`,
    {
      headers: {
        accept: 'application/json',
        'x-correlation-id': crypto.randomUUID(),
      },
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    }
  );
  const payload = (await response.json()) as TracerApiResponse;

  if (response.ok && isTracerSuccessResponse(payload)) {
    return {
      status: 'ready',
      post: payload.data,
      requestId: payload.requestId,
    };
  }

  return {
    status: 'error',
    message:
      'error' in payload
        ? payload.error.message
        : 'The AWS read could not be verified.',
    requestId: payload.requestId,
  };
}

export function AwsReadTracer() {
  const { signOut, user } = useAuth();
  const [state, setState] = useState<TracerState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void loadTracerPost(controller.signal)
      .then(setState)
      .catch(error => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setState({
          status: 'error',
          message: 'The AWS read could not be verified.',
        });
      });
    return () => controller.abort();
  }, [attempt]);

  return (
    <div className="min-h-screen bg-background text-primary">
      <header className="border-b border-default bg-nav">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <Heading as="h1" size="xl" className="mb-0 font-serif text-xl">
              Toni Bover
            </Heading>
            <Text
              variant="small"
              className="mt-0.5 text-xs uppercase tracking-wider text-muted"
            >
              AWS migration console
            </Text>
          </div>
          <div className="flex items-center gap-4">
            <Text variant="small" className="hidden text-muted sm:block">
              {user?.email}
            </Text>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-16">
        <div className="mb-10 grid gap-8 border-b border-subtle pb-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <Text
              variant="label"
              className="mb-5 block text-2xs uppercase tracking-[0.32em] text-subtle"
            >
              Tracer bullet 09 · read only
            </Text>
            <Heading as="h2" size="4xl" className="max-w-3xl">
              One post, through the whole new boundary.
            </Heading>
          </div>
          <Text variant="muted" className="max-w-xl leading-relaxed lg:pb-1">
            This diagnostic view proves the authenticated AWS path before any
            create, edit, image, or migration operation is enabled.
          </Text>
        </div>

        <ol
          aria-label="Authenticated AWS request path"
          className="mb-8 grid grid-cols-2 border-l border-t border-subtle sm:grid-cols-4"
        >
          {PATH_STEPS.map((step, index) => (
            <li
              key={step}
              className="border-b border-r border-subtle px-4 py-4"
            >
              <Text
                as="span"
                variant="label"
                className="mr-2 text-2xs text-subtle"
              >
                0{index + 1}
              </Text>
              <Text as="span" variant="small" className="text-primary-80">
                {step}
              </Text>
            </li>
          ))}
        </ol>

        <section
          aria-live="polite"
          aria-busy={state.status === 'loading'}
          className="relative overflow-hidden border border-overlay-20 bg-surface"
        >
          <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500" />
          <div className="px-6 py-8 sm:px-10 sm:py-10">
            {state.status === 'loading' ? (
              <div className="animate-pulse">
                <Text variant="label" className="mb-5 block text-subtle">
                  Reading DynamoDB…
                </Text>
                <div className="h-10 max-w-xl bg-overlay-10" />
              </div>
            ) : state.status === 'error' ? (
              <div>
                <Badge variant="error" className="mb-6">
                  Read not verified
                </Badge>
                <Heading as="h3" size="2xl" className="mb-3">
                  {state.message}
                </Heading>
                {state.requestId ? (
                  <Text variant="small" className="mb-6 text-subtle">
                    Correlation: {state.requestId}
                  </Text>
                ) : null}
                <Button
                  variant="secondary"
                  onClick={() => {
                    setState({ status: 'loading' });
                    setAttempt(value => value + 1);
                  }}
                >
                  Retry read
                </Button>
              </div>
            ) : (
              <div>
                <div className="mb-8 flex flex-wrap items-center gap-3">
                  <Badge variant="accent">DynamoDB verified</Badge>
                  <Badge variant="secondary">
                    Migration {state.post.migration.status}
                  </Badge>
                </div>
                <Text
                  variant="label"
                  className="mb-3 block text-2xs uppercase tracking-[0.24em] text-subtle"
                >
                  Fixture title
                </Text>
                <Heading
                  as="h3"
                  size="4xl"
                  className="mb-8 max-w-4xl font-serif"
                >
                  {state.post.title}
                </Heading>
                <dl className="grid gap-px border border-subtle bg-border-subtle sm:grid-cols-3">
                  <div className="bg-background px-4 py-4">
                    <dt className="text-2xs uppercase tracking-wider text-subtle">
                      Post ID
                    </dt>
                    <dd className="mt-2 text-sm text-primary-80">
                      {state.post.id}
                    </dd>
                  </div>
                  <div className="bg-background px-4 py-4">
                    <dt className="text-2xs uppercase tracking-wider text-subtle">
                      Source
                    </dt>
                    <dd className="mt-2 text-sm text-primary-80">
                      {state.post.migration.source}
                    </dd>
                  </div>
                  <div className="bg-background px-4 py-4">
                    <dt className="text-2xs uppercase tracking-wider text-subtle">
                      Correlation
                    </dt>
                    <dd
                      className="mt-2 truncate text-sm text-primary-80"
                      title={state.requestId}
                    >
                      {state.requestId}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </section>
        <AwsMediaRepair />
      </main>
    </div>
  );
}

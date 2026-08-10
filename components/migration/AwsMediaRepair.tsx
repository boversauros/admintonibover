'use client';

import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Heading } from '@/components/ui/Heading';
import { Image } from '@/components/ui/Image';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  type ConfirmedImageUpload,
  type ImagePreview,
  type ImageRole,
  type MediaApiError,
  type MediaApiSuccess,
  type MediaInspection,
  type PresignedImageUpload,
} from '@/lib/domain/media/contracts';
import { validateUploadDescriptor } from '@/lib/domain/media/validation';

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string; requestId?: string }
  | { status: 'ready'; inspection: MediaInspection };

type UploadStage =
  | 'idle'
  | 'hashing'
  | 'signing'
  | 'uploading'
  | 'confirming'
  | 'complete';

const ACCEPTED_IMAGE_TYPES = ALLOWED_IMAGE_MIME_TYPES.join(',');

async function responsePayload<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as MediaApiSuccess<T> | MediaApiError;
  if (!response.ok || !('data' in payload)) {
    throw new Error(
      'error' in payload ? payload.error.message : 'The request failed'
    );
  }
  return payload.data;
}

async function checksumSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    await file.arrayBuffer()
  );
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function stageLabel(stage: UploadStage): string {
  const labels: Record<UploadStage, string> = {
    idle: 'Upload replacement',
    hashing: 'Checking file…',
    signing: 'Creating secure upload…',
    uploading: 'Uploading to private storage…',
    confirming: 'Attaching to post…',
    complete: 'Replacement attached',
  };
  return labels[stage];
}

function RoleUploadCard({
  postId,
  postVersion,
  role,
  current,
  onConfirmed,
}: {
  postId: string;
  postVersion: number;
  role: ImageRole;
  current: ImagePreview | null;
  onConfirmed: (confirmed: ConfirmedImageUpload) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(current?.image.title ?? '');
  const [alt, setAlt] = useState(current?.image.alt ?? '');
  const [stage, setStage] = useState<UploadStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const busy = !['idle', 'complete'].includes(stage);
  const displayName = role === 'main' ? 'Main image' : 'Thumbnail';

  async function upload(): Promise<void> {
    if (!file || busy) return;
    setError(null);
    try {
      setStage('hashing');
      const checksum = await checksumSha256(file);
      const descriptor = validateUploadDescriptor({
        role,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        checksumSha256: checksum,
        expectedVersion: postVersion,
      });

      setStage('signing');
      const presignResponse = await fetch(
        `/api/aws/posts/${encodeURIComponent(postId)}/images/presign`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': crypto.randomUUID(),
            'x-correlation-id': crypto.randomUUID(),
          },
          body: JSON.stringify(descriptor),
        }
      );
      const presigned =
        await responsePayload<PresignedImageUpload>(presignResponse);

      setStage('uploading');
      const uploadResponse = await fetch(presigned.uploadUrl, {
        method: 'PUT',
        credentials: 'omit',
        headers: presigned.headers,
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error(
          `Private storage rejected the upload (${uploadResponse.status})`
        );
      }

      setStage('confirming');
      const confirmResponse = await fetch(
        `/api/aws/posts/${encodeURIComponent(postId)}/images/confirm`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': crypto.randomUUID(),
            'x-correlation-id': crypto.randomUUID(),
          },
          body: JSON.stringify({ uploadId: presigned.uploadId, title, alt }),
        }
      );
      const confirmed =
        await responsePayload<ConfirmedImageUpload>(confirmResponse);
      setFile(null);
      setStage('complete');
      onConfirmed(confirmed);
    } catch (uploadError) {
      setStage('idle');
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : 'The image could not be replaced'
      );
    }
  }

  return (
    <article className="grid overflow-hidden border border-subtle bg-background lg:grid-cols-[0.9fr_1.1fr]">
      <div className="relative min-h-64 border-b border-subtle bg-surface lg:border-b-0 lg:border-r">
        {current?.previewUrl ? (
          <Image
            src={current.previewUrl}
            alt={current.image.alt || `${displayName} preview`}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col justify-between p-6">
            <Text
              variant="label"
              className="text-2xs uppercase tracking-[0.28em] text-subtle"
            >
              No private preview
            </Text>
            <div>
              <div className="mb-4 h-px w-16 bg-amber-400" />
              <Text variant="muted" className="max-w-xs leading-relaxed">
                {current
                  ? 'The stored key predates this owned media path and will not be signed.'
                  : 'This role has no attached image. Uploading will create the first owned object.'}
              </Text>
            </div>
          </div>
        )}
        <div className="absolute right-4 top-4">
          <Badge variant={current ? 'accent' : 'secondary'}>
            {current ? 'Attached' : 'Missing'}
          </Badge>
        </div>
      </div>

      <div className="p-6 sm:p-8">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <Text
              variant="label"
              className="mb-2 block text-2xs uppercase tracking-[0.28em] text-amber-300"
            >
              {role === 'main' ? '01 · main' : '02 · thumb'}
            </Text>
            <Heading as="h4" size="2xl" className="font-serif">
              {displayName}
            </Heading>
          </div>
          <Text variant="small" className="text-right text-subtle">
            JPEG · PNG · WebP · AVIF
            <br />5 MiB maximum
          </Text>
        </div>

        <div className="space-y-5">
          <Input
            id={`${role}-file`}
            label="Replacement file"
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            disabled={busy}
            onChange={event => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              setStage('idle');
              setError(null);
              if (
                selected &&
                (!ALLOWED_IMAGE_MIME_TYPES.includes(selected.type as never) ||
                  selected.size < 1 ||
                  selected.size > MAX_IMAGE_BYTES)
              ) {
                setFile(null);
                setError('Choose an allowed image no larger than 5 MiB');
                event.target.value = '';
              }
            }}
            helperText={
              file
                ? `${file.name} · ${(file.size / 1024).toFixed(0)} KiB`
                : undefined
            }
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <Input
              id={`${role}-title`}
              label="Image title"
              value={title}
              maxLength={250}
              disabled={busy}
              onChange={event => setTitle(event.target.value)}
            />
            <Input
              id={`${role}-alt`}
              label="Alternative text"
              value={alt}
              maxLength={300}
              disabled={busy}
              onChange={event => setAlt(event.target.value)}
              helperText="Describe meaningful visual content; leave empty only if decorative."
            />
          </div>

          {error ? (
            <div
              role="alert"
              className="border-l-2 border-red-400 bg-red-500/5 px-4 py-3"
            >
              <Text variant="small" className="text-red-300">
                {error}
              </Text>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-subtle pt-5">
            <Text variant="small" className="text-subtle" aria-live="polite">
              {stageLabel(stage)}
            </Text>
            <Button
              variant="primary"
              disabled={!file || busy}
              loading={busy}
              onClick={() => void upload()}
            >
              Replace securely
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function AwsMediaRepair() {
  const [postId, setPostId] = useState('');
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  async function loadPost(): Promise<void> {
    const normalized = postId.trim();
    if (!normalized) return;
    setState({ status: 'loading' });
    try {
      const response = await fetch(
        `/api/aws/posts/${encodeURIComponent(normalized)}/images`,
        {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            accept: 'application/json',
            'x-correlation-id': crypto.randomUUID(),
          },
        }
      );
      const inspection = await responsePayload<MediaInspection>(response);
      setState({ status: 'ready', inspection });
    } catch (loadError) {
      setState({
        status: 'error',
        message:
          loadError instanceof Error
            ? loadError.message
            : 'The post images could not be loaded',
      });
    }
  }

  function applyConfirmation(confirmed: ConfirmedImageUpload): void {
    setState(current => {
      if (current.status !== 'ready') return current;
      return {
        status: 'ready',
        inspection: {
          ...current.inspection,
          postVersion: confirmed.postVersion,
          images: {
            ...current.inspection.images,
            [confirmed.role]: confirmed.image,
          },
        },
      };
    });
  }

  return (
    <section className="mt-16 border-t border-overlay-20 pt-12 sm:mt-20 sm:pt-16">
      <div className="mb-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
        <div>
          <Text
            variant="label"
            className="mb-5 block text-2xs uppercase tracking-[0.32em] text-amber-300"
          >
            Media repair 11 · private S3
          </Text>
          <Heading as="h2" size="4xl" className="max-w-3xl">
            Replace only what is missing.
          </Heading>
        </div>
        <Text variant="muted" className="max-w-xl leading-relaxed lg:pb-1">
          Files travel directly to the private bucket through a five-minute
          signed request. The previous owned object is removed only after the
          post version changes successfully.
        </Text>
      </div>

      <form
        className="mb-8 grid gap-4 border border-subtle bg-surface p-5 sm:grid-cols-[1fr_auto] sm:items-end sm:p-6"
        onSubmit={event => {
          event.preventDefault();
          void loadPost();
        }}
      >
        <Input
          id="media-post-id"
          label="Post ID"
          value={postId}
          pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}"
          maxLength={64}
          autoComplete="off"
          disabled={state.status === 'loading'}
          placeholder="Enter the exact migrated post ID"
          onChange={event => setPostId(event.target.value)}
        />
        <Button
          type="submit"
          size="lg"
          loading={state.status === 'loading'}
          disabled={!postId.trim()}
        >
          Inspect images
        </Button>
      </form>

      {state.status === 'error' ? (
        <div role="alert" className="border border-red-500/30 bg-red-500/5 p-6">
          <Badge variant="error" className="mb-4">
            Inspection failed
          </Badge>
          <Text className="text-red-200">{state.message}</Text>
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <div>
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <Heading as="h3" size="2xl" className="font-serif">
                {state.inspection.titles.ca}
              </Heading>
              <Text variant="small" className="mt-1 text-subtle">
                {state.inspection.titles.en}
              </Text>
            </div>
            <Badge variant="secondary">
              Version {state.inspection.postVersion}
            </Badge>
          </div>
          <div className="space-y-6">
            {(['main', 'thumb'] as const).map(role => (
              <RoleUploadCard
                key={`${role}-${state.inspection.postVersion}`}
                postId={state.inspection.postId}
                postVersion={state.inspection.postVersion}
                role={role}
                current={state.inspection.images[role]}
                onConfirmed={applyConfirmation}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

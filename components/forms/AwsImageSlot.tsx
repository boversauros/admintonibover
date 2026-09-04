'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button, Icon, Image, Modal, Text } from '@/components/ui';
import {
  AdminMutationError,
  detachAwsPostImage,
  uploadAwsPostImage,
  type ImageUploadProgress,
} from '@/lib/api/adminMutations';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  type ImagePreview,
  type ImageRole,
} from '@/lib/domain/media/contracts';

type ImageSlotChange = {
  image: ImagePreview | null;
  postVersion: number;
};

interface AwsImageSlotProps {
  activeRole: ImageRole | null;
  alt: string;
  aspectRatio: 'video' | 'thumbnail';
  disabled?: boolean;
  hint: string;
  image: ImagePreview | null;
  label: string;
  onChange: (change: ImageSlotChange) => void;
  onOperationStateChange: (role: ImageRole, active: boolean) => void;
  onRefreshPreview: () => Promise<void>;
  postId: string;
  postVersion: number;
  role: ImageRole;
  title: string;
}

type Confirmation = 'upload' | 'remove' | null;
type Operation = 'idle' | 'uploading' | 'removing';

function validateCandidate(file: File): string | null {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as never)) {
    return 'Format no admès. Fes servir JPG, PNG, WebP o AVIF.';
  }
  if (file.size < 1) return 'El fitxer està buit.';
  if (file.size > MAX_IMAGE_BYTES) {
    return `El fitxer supera el límit de ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`;
  }
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AwsImageSlot({
  activeRole,
  alt,
  aspectRatio,
  disabled = false,
  hint,
  image,
  label,
  onChange,
  onOperationStateChange,
  onRefreshPreview,
  postId,
  postVersion,
  role,
  title,
}: AwsImageSlotProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [candidate, setCandidate] = useState<File | null>(null);
  const [candidateUrl, setCandidateUrl] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [operation, setOperation] = useState<Operation>('idle');
  const [progress, setProgress] = useState<ImageUploadProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryPending, setRetryPending] = useState(false);
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const blocked = disabled || (activeRole !== null && activeRole !== role);
  const isBusy = operation !== 'idle';
  const previewFailed =
    image?.previewUrl !== null && image?.previewUrl === failedPreviewUrl;
  const displayUrl =
    candidateUrl ?? (previewFailed ? null : image?.previewUrl) ?? null;

  useEffect(() => {
    return () => {
      if (candidateUrl) URL.revokeObjectURL(candidateUrl);
      abortRef.current?.abort();
    };
  }, [candidateUrl]);

  function clearCandidate() {
    setCandidate(null);
    setCandidateUrl(null);
    setProgress(null);
    setRetryPending(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    if (!file) return;
    const validationError = validateCandidate(file);
    if (validationError) {
      setError(validationError);
      event.currentTarget.value = '';
      return;
    }
    setError(null);
    setMessage(null);
    setCandidate(file);
    setCandidateUrl(URL.createObjectURL(file));
    setProgress(null);
    setRetryPending(false);
  }

  async function handleUpload() {
    if (!candidate || blocked || isBusy) return;
    setConfirmation(null);
    setOperation('uploading');
    setError(null);
    setRetryPending(false);
    setMessage('Preparant la pujada segura…');
    setProgress({ loaded: 0, total: candidate.size, percent: 0 });
    onOperationStateChange(role, true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const confirmed = await uploadAwsPostImage({
        alt,
        file: candidate,
        onProgress: nextProgress => {
          setProgress(nextProgress);
          setMessage(
            nextProgress.percent === 100
              ? 'Confirmant la imatge…'
              : `Pujant la imatge: ${nextProgress.percent}%`
          );
        },
        postId,
        postVersion,
        role,
        signal: controller.signal,
        title,
      });
      onChange({ image: confirmed.image, postVersion: confirmed.postVersion });
      clearCandidate();
      setMessage(
        confirmed.cleanupPending
          ? 'Imatge desada. La neteja de l’arxiu anterior es completarà automàticament.'
          : 'Imatge desada correctament.'
      );
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') {
        setRetryPending(true);
        setMessage(
          'Pujada cancel·lada. El fitxer continua seleccionat per reintentar-la.'
        );
      } else {
        setRetryPending(true);
        const requestId =
          caught instanceof AdminMutationError ? caught.requestId : undefined;
        const detail =
          caught instanceof Error
            ? caught.message
            : 'No s’ha pogut pujar la imatge.';
        setError(requestId ? `${detail} Correlació: ${requestId}` : detail);
        setMessage(
          'La imatge anterior no ha canviat. Pots reintentar la pujada.'
        );
      }
    } finally {
      abortRef.current = null;
      setOperation('idle');
      onOperationStateChange(role, false);
    }
  }

  async function handleRemove() {
    if (!image || blocked || isBusy) return;
    setConfirmation(null);
    setOperation('removing');
    setError(null);
    setMessage('Traient la imatge de l’article…');
    onOperationStateChange(role, true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const detached = await detachAwsPostImage({
        postId,
        postVersion,
        role,
        signal: controller.signal,
      });
      onChange({ image: null, postVersion: detached.postVersion });
      setMessage(
        detached.cleanup.pending
          ? 'Imatge retirada. La neteja de l’arxiu privat queda pendent i es pot reintentar amb seguretat.'
          : 'Imatge retirada de l’article.'
      );
    } catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') return;
      const requestId =
        caught instanceof AdminMutationError ? caught.requestId : undefined;
      const detail =
        caught instanceof Error
          ? caught.message
          : 'No s’ha pogut retirar la imatge.';
      setError(requestId ? `${detail} Correlació: ${requestId}` : detail);
    } finally {
      abortRef.current = null;
      setOperation('idle');
      onOperationStateChange(role, false);
    }
  }

  return (
    <section
      aria-labelledby={`${inputId}-label`}
      className="space-y-3 border border-default bg-surface/40 p-3"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3
            id={`${inputId}-label`}
            className="block text-sm tracking-wider text-muted"
          >
            {label}
          </h3>
          <Text variant="small" className="mt-1 text-subtle">
            {hint}
          </Text>
        </div>
        <span
          className={`shrink-0 border px-2 py-1 text-[10px] uppercase tracking-wider ${
            image
              ? 'border-emerald-500/30 text-emerald-300'
              : 'border-amber-500/40 text-amber-300'
          }`}
        >
          {image ? 'Disponible' : 'Falta'}
        </span>
      </div>

      <div
        className={`relative overflow-hidden border border-default bg-background [&>div]:h-full ${
          aspectRatio === 'video' ? 'aspect-video' : 'aspect-[4/3]'
        }`}
      >
        {displayUrl ? (
          <Image
            src={displayUrl}
            alt={candidate ? 'Previsualització del fitxer seleccionat' : alt}
            hover="none"
            className="h-full w-full object-cover"
            onError={() => {
              if (!candidate) setFailedPreviewUrl(image?.previewUrl ?? null);
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-muted">
            <Icon name="image-placeholder" size="8" aria-hidden="true" />
            <Text variant="small">
              {image
                ? 'La previsualització privada ha caducat o no està disponible.'
                : role === 'main'
                  ? 'Falta la imatge destacada'
                  : 'Falta la miniatura'}
            </Text>
          </div>
        )}
        {candidate ? (
          <span className="absolute left-2 top-2 border border-sky-400/40 bg-black/80 px-2 py-1 text-[10px] uppercase tracking-wider text-sky-200">
            Pendent de pujar
          </span>
        ) : null}
      </div>

      {candidate ? (
        <div className="border-l-2 border-sky-400/50 pl-3">
          <Text variant="small" className="break-all text-body">
            {candidate.name} · {formatBytes(candidate.size)}
          </Text>
          {image ? (
            <Text variant="small" className="mt-1 text-subtle">
              La imatge actual es mantindrà fins que la substitució quedi
              confirmada.
            </Text>
          ) : null}
        </div>
      ) : null}

      {operation === 'uploading' && progress ? (
        <div className="space-y-1">
          <progress
            className="h-2 w-full accent-sky-400"
            max={100}
            value={progress.percent}
            aria-label={`Progrés de pujada de ${label.toLowerCase()}`}
          />
          <Text variant="small" className="text-subtle">
            {progress.percent}% · {formatBytes(progress.loaded)} de{' '}
            {formatBytes(progress.total)}
          </Text>
        </div>
      ) : null}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ALLOWED_IMAGE_MIME_TYPES.join(',')}
        className="sr-only"
        disabled={blocked || isBusy}
        onChange={handleFileChange}
        aria-labelledby={`${inputId}-label`}
        aria-describedby={`${inputId}-help`}
      />
      <p id={`${inputId}-help`} className="text-sm text-subtle">
        JPG, PNG, WebP o AVIF. Màxim 5 MB.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={blocked || isBusy}
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="upload" size="4" aria-hidden="true" />
          {candidate ? 'Canvia el fitxer' : 'Selecciona un fitxer'}
        </Button>
        {candidate ? (
          <>
            <Button
              variant="primary"
              size="sm"
              disabled={blocked || isBusy}
              onClick={() => setConfirmation('upload')}
            >
              {retryPending
                ? 'Reintenta la pujada'
                : image
                  ? 'Substitueix'
                  : 'Puja la imatge'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={isBusy}
              onClick={() => {
                clearCandidate();
                setError(null);
                setMessage(null);
              }}
            >
              Descarta selecció
            </Button>
          </>
        ) : null}
        {image ? (
          <Button
            variant="destructive"
            size="sm"
            disabled={blocked || isBusy}
            onClick={() => setConfirmation('remove')}
          >
            Retira
          </Button>
        ) : null}
        {image && (!image.previewUrl || previewFailed) ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={blocked || isBusy}
            onClick={() => void onRefreshPreview()}
          >
            Actualitza previsualització
          </Button>
        ) : null}
        {operation === 'uploading' ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => abortRef.current?.abort()}
          >
            Cancel·la la pujada
          </Button>
        ) : null}
      </div>

      <div aria-live="polite" aria-atomic="true">
        {message ? (
          <Text variant="small" className="text-subtle">
            {message}
          </Text>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <Modal
        isOpen={confirmation !== null}
        onClose={() => setConfirmation(null)}
        title={
          confirmation === 'remove'
            ? `Retira ${label.toLowerCase()}`
            : image
              ? `Substitueix ${label.toLowerCase()}`
              : `Puja ${label.toLowerCase()}`
        }
        size="sm"
        closeOnBackdropClick={false}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmation(null)}>
              Cancel·la
            </Button>
            <Button
              variant={confirmation === 'remove' ? 'destructive' : 'primary'}
              onClick={() =>
                confirmation === 'remove'
                  ? void handleRemove()
                  : void handleUpload()
              }
            >
              {confirmation === 'remove'
                ? 'Retira la imatge'
                : image
                  ? 'Confirma la substitució'
                  : 'Confirma la pujada'}
            </Button>
          </>
        }
      >
        <Text>
          {confirmation === 'remove'
            ? 'L’article quedarà sense aquesta imatge. L’altra imatge no es modificarà.'
            : image
              ? 'La imatge actual només es retirarà després que el fitxer nou s’hagi pujat i confirmat correctament.'
              : 'El fitxer seleccionat es pujarà a l’emmagatzematge privat i quedarà vinculat a l’article.'}
        </Text>
      </Modal>
    </section>
  );
}

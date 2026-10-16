'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, Icon, Image, Text } from '@/components/ui';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
} from '@/lib/domain/media/contracts';

function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type as never)) {
    return 'Format no admès. Fes servir JPG, PNG, WebP o AVIF.';
  }
  if (file.size < 1) return 'El fitxer està buit.';
  if (file.size > MAX_IMAGE_BYTES) {
    return `El fitxer supera el límit de ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`;
  }
  return null;
}

interface ImageDropzoneProps {
  label: string;
  hint: string;
  aspectRatio: 'video' | 'thumbnail';
  /** A file staged locally; it is uploaded when the post is saved. */
  file: File | null;
  /** Whether the post currently has a saved image in this slot. */
  hasSavedImage: boolean;
  savedUrl: string | null;
  /** The saved image will be removed when the post is saved. */
  removalPending: boolean;
  disabled?: boolean;
  error?: string;
  onSelect: (file: File) => void;
  onRemove: () => void;
  onUndoRemove: () => void;
  onPreviewError?: () => void;
}

/**
 * Drag-and-drop or click to stage an image. Nothing is uploaded here: the post
 * form uploads staged files, and applies removals, when the post is saved.
 */
export function ImageDropzone({
  label,
  hint,
  aspectRatio,
  file,
  hasSavedImage,
  savedUrl,
  removalPending,
  disabled = false,
  error,
  onSelect,
  onRemove,
  onUndoRemove,
  onPreviewError,
}: ImageDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const fileUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  );
  useEffect(
    () => () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    },
    [fileUrl]
  );

  const showSaved = !file && hasSavedImage && !removalPending;
  const displayUrl =
    fileUrl ?? (showSaved && savedUrl !== failedUrl ? savedUrl : null);
  const hasImage = file !== null || showSaved;

  function accept(candidate: File | undefined) {
    if (!candidate || disabled) return;
    const validationError = validateImageFile(candidate);
    setLocalError(validationError);
    if (!validationError) onSelect(candidate);
  }

  function openPicker() {
    if (!disabled) inputRef.current?.click();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="block text-sm text-muted">
          {label}
        </label>
        <Text as="span" variant="small" className="text-2xs text-subtle">
          {hint}
        </Text>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ALLOWED_IMAGE_MIME_TYPES.join(',')}
        className="sr-only"
        disabled={disabled}
        onChange={event => {
          accept(event.currentTarget.files?.[0]);
          event.currentTarget.value = '';
        }}
      />

      <div
        className={`group relative overflow-hidden border ${
          aspectRatio === 'video' ? 'aspect-video' : 'aspect-[4/3]'
        } ${
          isDragging
            ? 'border-info bg-info/5'
            : hasImage
              ? 'border-default'
              : 'border-dashed border-default'
        }`}
        onDragOver={event => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={event => {
          event.preventDefault();
          setIsDragging(false);
          accept(event.dataTransfer.files?.[0]);
        }}
      >
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={
            hasImage
              ? `Canvia ${label.toLowerCase()}`
              : `Afegeix ${label.toLowerCase()}`
          }
          aria-disabled={disabled}
          onClick={openPicker}
          onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openPicker();
            }
          }}
          className={`absolute inset-0 flex items-center justify-center text-muted transition ${
            disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:text-body'
          }`}
        >
          {displayUrl ? (
            <Image
              src={displayUrl}
              alt=""
              hover="none"
              className="absolute inset-0 h-full w-full object-cover"
              onError={() => {
                if (file || !savedUrl) return;
                setFailedUrl(savedUrl);
                onPreviewError?.();
              }}
            />
          ) : hasImage ? (
            <div className="px-4 text-center">
              <Icon name="image-placeholder" size="6" aria-hidden="true" />
              <Text variant="small" className="mt-2">
                Imatge desada (previsualització no disponible)
              </Text>
            </div>
          ) : (
            <div className="px-4 text-center">
              <Icon name="upload" size="6" aria-hidden="true" />
              <Text as="span" variant="small" className="mt-2 block">
                Arrossega una imatge o clica per triar-ne una
              </Text>
              <Text
                as="span"
                variant="small"
                className="mt-1 block text-2xs text-subtle"
              >
                JPG, PNG, WebP o AVIF · màxim 5 MB
              </Text>
            </div>
          )}
        </div>

        {file ? (
          <span className="pointer-events-none absolute left-2 top-2 border border-info/30 bg-scrim px-2 py-1 text-2xs uppercase tracking-wider text-body">
            Es pujarà en desar
          </span>
        ) : null}

        {hasImage && !disabled ? (
          <Button
            variant="icon"
            aria-label={`Treu ${label.toLowerCase()}`}
            title="Treu la imatge"
            onClick={onRemove}
            className="absolute right-2 top-2 bg-scrim opacity-0 transition-opacity hover:bg-danger/10 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <Icon name="trash" />
          </Button>
        ) : null}
      </div>

      {removalPending && !file ? (
        <div className="flex items-center justify-between gap-2">
          <Text variant="small" className="text-warning">
            La imatge es retirarà en desar.
          </Text>
          <Button variant="ghost" size="sm" onClick={onUndoRemove}>
            Desfés
          </Button>
        </div>
      ) : null}

      {localError || error ? (
        <p className="text-sm text-danger" role="alert">
          {localError || error}
        </p>
      ) : null}
    </div>
  );
}

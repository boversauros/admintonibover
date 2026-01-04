'use client';

import { useState, useRef, useEffect } from 'react';
import { Icon, Button, Text, Image } from '@/components/ui';

interface ImageSelectorProps {
  label: string;
  aspectRatio?: 'video' | 'square' | 'thumbnail';
  hint?: string;
  value: string | null;
  onFileSelect: (file: File | null) => void;
  error?: string;
}

export function ImageSelector({
  label,
  aspectRatio = 'video',
  hint,
  value,
  onFileSelect,
  error,
}: ImageSelectorProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const aspectClasses = {
    video: 'aspect-video',
    square: 'aspect-square',
    thumbnail: 'aspect-[4/3]',
  };

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      const blobUrl = URL.createObjectURL(file);
      setPreviewUrl(blobUrl);
      onFileSelect(file);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewUrl(null);
    onFileSelect(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const displayUrl = previewUrl || value;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Text variant="label" className="block">
          {label}
        </Text>
        {hint && (
          <Text as="span" variant="small" className="text-subtle text-[10px]">
            {hint}
          </Text>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      <div
        onClick={handleClick}
        className={`${aspectClasses[aspectRatio]} border border-dashed border-default flex items-center justify-center text-muted hover:border-subtle hover:text-body transition-all-smooth cursor-pointer group relative overflow-hidden hover:scale-102`}
      >
        {displayUrl ? (
          <>
            <Image
              src={displayUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover transition-transform-smooth group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity-smooth flex items-center justify-center gap-2">
              <Button
                variant="icon"
                className="bg-overlay-10 hover:bg-overlay-20"
                onClick={e => {
                  e.stopPropagation();
                  handleClick();
                }}
              >
                <Icon name="edit" />
              </Button>
              <Button
                variant="icon"
                onClick={handleClear}
                className="bg-overlay-10 hover:bg-red-500/50"
              >
                <Icon name="trash" />
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center transition-transform-smooth group-hover:scale-105">
            <Icon name="image" size="6" />
            <Text as="span" variant="small" className="block mt-2">
              Clica per seleccionar
            </Text>
          </div>
        )}
      </div>

      {error && (
        <Text variant="small" className="text-red-400">
          {error}
        </Text>
      )}
    </div>
  );
}

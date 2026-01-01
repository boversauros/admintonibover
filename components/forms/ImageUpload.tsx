'use client';

import { useState, useRef, useEffect } from 'react';
import { Button, Icon } from '@/components/ui';
import { Image } from '@/components/ui/Image';

interface ImageUploadProps {
  label: string;
  name: string;
  currentImageUrl?: string;
  onFileSelect: (file: File | null) => void;
  error?: string;
  accept?: string;
  maxSizeMB?: number;
  helperText?: string;
}

export function ImageUpload({
  label,
  name,
  currentImageUrl,
  onFileSelect,
  error,
  accept = 'image/*',
  maxSizeMB = 5,
  helperText,
}: ImageUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const validateFile = (file: File): string | null => {
    // Check file type
    const validTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
    ];
    if (!validTypes.includes(file.type)) {
      return 'Only JPG, PNG, WebP, and GIF images are allowed';
    }

    // Check file size
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return `Image must be smaller than ${maxSizeMB}MB`;
    }

    return null;
  };

  const handleFileChange = (file: File | null) => {
    // Clear previous errors
    setValidationError(null);

    if (!file) {
      // Clear selection
      setPreviewUrl(null);
      onFileSelect(null);
      return;
    }

    // Validate file
    const error = validateFile(file);
    if (error) {
      setValidationError(error);
      setPreviewUrl(null);
      onFileSelect(null);
      return;
    }

    // Create preview
    const blobUrl = URL.createObjectURL(file);
    setPreviewUrl(blobUrl);
    onFileSelect(file);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    handleFileChange(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0] || null;
    if (file) {
      handleFileChange(file);
    }
  };

  const handleClear = () => {
    setPreviewUrl(null);
    setValidationError(null);
    onFileSelect(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const displayUrl = previewUrl || currentImageUrl;
  const displayError = error || validationError;

  return (
    <div className="w-full">
      {/* Label */}
      <label
        htmlFor={name}
        className="block text-sm text-muted font-medium tracking-wide mb-2"
      >
        {label}
      </label>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        id={name}
        name={name}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="hidden"
      />

      {/* Drop zone or preview */}
      <div className="space-y-4">
        {displayUrl ? (
          /* Image Preview */
          <div className="border border-default p-4 space-y-3">
            <p className="text-sm text-muted">Preview:</p>
            <div className="relative">
              <Image
                src={displayUrl}
                alt={`${label} preview`}
                aspect="auto"
                hover="none"
                className="max-h-64 w-auto mx-auto"
                onError={(e: any) => {
                  e.currentTarget.src = '';
                  e.currentTarget.style.display = 'none';
                  setValidationError('Failed to load image');
                }}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleButtonClick}
              >
                Replace
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClear}
              >
                Clear
              </Button>
            </div>
          </div>
        ) : (
          /* Drop Zone */
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed p-8
              transition-colors duration-200
              ${
                isDragging
                  ? 'border-focus bg-surface'
                  : 'border-default hover:border-subtle'
              }
            `}
          >
            <div className="flex flex-col items-center justify-center space-y-4">
              {/* Upload Icon */}
              <Icon name="upload" size="12" className="text-muted" />

              <div className="text-center">
                <p className="text-sm text-muted mb-2">
                  Drag and drop an image here, or
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleButtonClick}
                >
                  Choose File
                </Button>
              </div>

              {helperText && (
                <p className="text-xs text-muted text-center">{helperText}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {displayError && (
        <p className="text-sm mt-2 text-red-400">{displayError}</p>
      )}
    </div>
  );
}

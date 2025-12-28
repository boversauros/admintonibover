"use client";

import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Heading } from '@/components/ui';
import { ImageUpload } from './ImageUpload';

export function ImageSection() {
  const { setValue, watch, formState: { errors } } = useFormContext();

  const thumbnailUrl = watch('thumbnail_url');
  const mainImageUrl = watch('main_image_url');

  const handleThumbnailSelect = (file: File | null) => {
    setValue('thumbnail_file', file);
  };

  const handleMainImageSelect = (file: File | null) => {
    setValue('main_image_file', file);
  };

  return (
    <div className="space-y-6">
      <Heading as="h3" size="xl">Images</Heading>

      <ImageUpload
        label="Thumbnail Image"
        name="thumbnail_file"
        currentImageUrl={thumbnailUrl}
        onFileSelect={handleThumbnailSelect}
        error={errors.thumbnail_file?.message as string}
        helperText="Recommended size: 800x600px. Max 5MB. Supported: JPG, PNG, WebP, GIF"
      />

      <ImageUpload
        label="Main/Featured Image"
        name="main_image_file"
        currentImageUrl={mainImageUrl}
        onFileSelect={handleMainImageSelect}
        error={errors.main_image_file?.message as string}
        helperText="Recommended size: 1200x800px. Max 5MB. Supported: JPG, PNG, WebP, GIF"
      />
    </div>
  );
}

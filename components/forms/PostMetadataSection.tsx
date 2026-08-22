'use client';

import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Select, Heading, Text } from '@/components/ui';
import { getAdminCategories, type AdminCategory } from '@/lib/api/adminReads';
import { useAuth } from '@/lib/auth/AuthContext';

export function PostMetadataSection() {
  const { backend } = useAuth();
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function loadCategories() {
      try {
        const fetchedCategories = await getAdminCategories(
          backend,
          controller.signal
        );
        setCategories(fetchedCategories);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        console.error('Failed to load categories:', error);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    loadCategories();
    return () => controller.abort();
  }, [backend]);

  const categoryOptions = categories.map(cat => ({
    value: cat.id,
    label: `${cat.nameCa} / ${cat.nameEn}`,
  }));

  return (
    <div className="space-y-4">
      <Heading as="h3" size="xl">
        Post Metadata
      </Heading>

      <Select
        label="Category"
        {...register('category_id')}
        options={categoryOptions}
        placeholder={
          isLoading ? 'Loading categories...' : 'Select a category...'
        }
        error={errors.category_id?.message as string}
        disabled={isLoading}
      />

      <Text variant="small">
        Date and author will be set automatically when you save the post.
      </Text>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Select, Heading, Text } from '@/components/ui';
import { getCategories, type Category } from '@/lib/api/categories';

export function PostMetadataSection() {
  const { register, formState: { errors } } = useFormContext();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadCategories() {
      try {
        const fetchedCategories = await getCategories();
        setCategories(fetchedCategories);
      } catch (error) {
        console.error('Failed to load categories:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadCategories();
  }, []);

  const categoryOptions = categories.map((cat) => ({
    value: cat.id.toString(),
    label: `${cat.name_ca} / ${cat.name_en}`,
  }));

  return (
    <div className="space-y-4">
      <Heading as="h3" size="xl">Post Metadata</Heading>

      <Select
        label="Category"
        {...register('category_id')}
        options={categoryOptions}
        placeholder={isLoading ? "Loading categories..." : "Select a category..."}
        error={errors.category_id?.message as string}
        disabled={isLoading}
      />

      <Text variant="small">
        Date and author will be set automatically when you save the post.
      </Text>
    </div>
  );
}

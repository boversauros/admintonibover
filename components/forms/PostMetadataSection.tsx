import { useFormContext } from 'react-hook-form';
import { Select } from '@/components/ui';

const categoryOptions = [
  { value: 'tech', label: 'Technology' },
  { value: 'design', label: 'Design' },
  { value: 'philosophy', label: 'Philosophy' },
  { value: 'personal', label: 'Personal' },
];

export function PostMetadataSection() {
  const { register, formState: { errors } } = useFormContext();

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Post Metadata</h3>

      <Select
        label="Category"
        {...register('category_id')}
        options={categoryOptions}
        placeholder="Select a category..."
        error={errors.category_id?.message as string}
      />

      <p className="text-sm text-muted">
        Date and author will be set automatically when you save the post.
      </p>
    </div>
  );
}

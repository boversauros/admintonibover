import { useFormContext } from 'react-hook-form';
import { Select, Heading, Text } from '@/components/ui';

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
      <Heading as="h3" size="xl">Post Metadata</Heading>

      <Select
        label="Category"
        {...register('category_id')}
        options={categoryOptions}
        placeholder="Select a category..."
        error={errors.category_id?.message as string}
      />

      <Text variant="small">
        Date and author will be set automatically when you save the post.
      </Text>
    </div>
  );
}

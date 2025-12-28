import { useFormContext } from 'react-hook-form';
import { Input, Heading, Text, Image } from '@/components/ui';

export function ImageSection() {
  const { register, watch, formState: { errors } } = useFormContext();

  const thumbnailUrl = watch('thumbnail_url');

  return (
    <div className="space-y-4">
      <Heading as="h3" size="xl">Thumbnail Image</Heading>

      <Input
        label="Thumbnail URL"
        {...register('thumbnail_url')}
        placeholder="https://example.com/image.jpg"
        helperText="Enter the URL of the thumbnail image"
        error={errors.thumbnail_url?.message as string}
      />

      {thumbnailUrl && (
        <div className="border border-default rounded p-4">
          <Text variant="small" className="mb-2">Preview:</Text>
          <Image
            src={thumbnailUrl}
            alt="Thumbnail preview"
            width="w-auto"
            height="h-auto"
            aspect="auto"
            hover="none"
            className="max-w-xs rounded"
            onError={(e: any) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      )}
    </div>
  );
}

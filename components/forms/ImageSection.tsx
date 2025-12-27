import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui';

export function ImageSection() {
  const { register, watch, formState: { errors } } = useFormContext();

  const thumbnailUrl = watch('thumbnail_url');

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Thumbnail Image</h3>

      <Input
        label="Thumbnail URL"
        {...register('thumbnail_url')}
        placeholder="https://example.com/image.jpg"
        helperText="Enter the URL of the thumbnail image"
        error={errors.thumbnail_url?.message as string}
      />

      {thumbnailUrl && (
        <div className="border border-default rounded p-4">
          <p className="text-sm text-muted mb-2">Preview:</p>
          <img
            src={thumbnailUrl}
            alt="Thumbnail preview"
            className="max-w-xs rounded"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      )}
    </div>
  );
}

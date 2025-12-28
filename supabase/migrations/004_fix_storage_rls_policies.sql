-- Fix Storage bucket RLS policies
-- These policies allow public access to storage buckets for development

-- Policy for post-thumbnails bucket
CREATE POLICY "Allow public uploads to post-thumbnails"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'post-thumbnails');

CREATE POLICY "Allow public reads from post-thumbnails"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'post-thumbnails');

CREATE POLICY "Allow public deletes from post-thumbnails"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'post-thumbnails');

-- Policy for post-images bucket
CREATE POLICY "Allow public uploads to post-images"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'post-images');

CREATE POLICY "Allow public reads from post-images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'post-images');

CREATE POLICY "Allow public deletes from post-images"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'post-images');

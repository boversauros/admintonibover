-- Migration: Fix Storage RLS Policies for Authenticated Users Only
-- Created: 2025-12-30
-- Description: Restricts storage uploads and deletes to authenticated users while keeping public read access

-- =====================================================
-- DROP PUBLIC WRITE/DELETE POLICIES
-- =====================================================

-- post-thumbnails bucket
DROP POLICY IF EXISTS "Allow public uploads to post-thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes from post-thumbnails" ON storage.objects;

-- post-images bucket
DROP POLICY IF EXISTS "Allow public uploads to post-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes from post-images" ON storage.objects;

-- =====================================================
-- CREATE AUTHENTICATED-ONLY POLICIES FOR UPLOADS/DELETES
-- =====================================================

-- post-thumbnails bucket: authenticated uploads
CREATE POLICY "Authenticated users can upload to post-thumbnails"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'post-thumbnails');

-- post-thumbnails bucket: authenticated deletes
CREATE POLICY "Authenticated users can delete from post-thumbnails"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'post-thumbnails');

-- post-images bucket: authenticated uploads
CREATE POLICY "Authenticated users can upload to post-images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'post-images');

-- post-images bucket: authenticated deletes
CREATE POLICY "Authenticated users can delete from post-images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'post-images');

-- =====================================================
-- KEEP PUBLIC READ ACCESS
-- =====================================================
-- Public read policies from migration 004 are kept intact:
-- - "Allow public reads from post-thumbnails"
-- - "Allow public reads from post-images"
-- This allows images to be displayed publicly on the website

-- =====================================================
-- VERIFICATION
-- =====================================================
-- After running this migration, verify with:
-- SELECT policyname, permissive, roles, cmd
-- FROM pg_policies
-- WHERE tablename = 'objects' AND schemaname = 'storage';

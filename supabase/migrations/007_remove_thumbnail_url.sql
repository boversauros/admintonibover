-- Remove deprecated thumbnail_url column
-- The thumbnail URL is now retrieved via thumbnail_id -> images.url relationship
-- This removes the data duplication and ensures single source of truth

ALTER TABLE posts DROP COLUMN IF EXISTS thumbnail_url;

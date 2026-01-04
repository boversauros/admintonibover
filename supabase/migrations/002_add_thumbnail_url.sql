-- Add thumbnail_url column for backward compatibility
-- This allows posts to work with or without the images table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Add comment
COMMENT ON COLUMN posts.thumbnail_url IS 'Deprecated: Use thumbnail_id with images table instead. Kept for backward compatibility.';

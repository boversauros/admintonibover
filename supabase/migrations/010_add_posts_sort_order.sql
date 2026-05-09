-- Migration: Add sort_order to posts for consumer site ordering
-- Description: INTEGER NOT NULL DEFAULT 0; lower values surface first when ordered ascending

ALTER TABLE posts ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_posts_sort_order ON posts (sort_order);

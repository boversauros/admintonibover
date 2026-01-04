-- Migration: Add UPDATE policy for keywords table
-- Created: 2025-12-30
-- Description: Fixes RLS error when upserting existing keywords

-- The keywords table was missing an UPDATE policy.
-- The upsert() operation requires UPDATE permission even when
-- the keyword already exists and no values are changing.

CREATE POLICY "Authenticated users can update keywords"
  ON keywords FOR UPDATE
  USING (auth.role() = 'authenticated');

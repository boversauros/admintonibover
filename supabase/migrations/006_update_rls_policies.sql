-- Migration: Update RLS Policies for Authenticated Users
-- Created: 2025-12-29
-- Description: Replaces permissive RLS policies with auth-based policies requiring authenticated users

-- =====================================================
-- DROP EXISTING PERMISSIVE POLICIES
-- =====================================================

-- Posts policies
DROP POLICY IF EXISTS "Allow public read access" ON posts;
DROP POLICY IF EXISTS "Allow authenticated insert" ON posts;
DROP POLICY IF EXISTS "Allow authenticated update" ON posts;
DROP POLICY IF EXISTS "Allow authenticated delete" ON posts;

-- Post translations policies
DROP POLICY IF EXISTS "Allow public read access" ON post_translations;
DROP POLICY IF EXISTS "Allow authenticated insert" ON post_translations;
DROP POLICY IF EXISTS "Allow authenticated update" ON post_translations;
DROP POLICY IF EXISTS "Allow authenticated delete" ON post_translations;

-- Post keywords policies
DROP POLICY IF EXISTS "Allow public read access" ON post_keywords;
DROP POLICY IF EXISTS "Allow authenticated insert" ON post_keywords;
DROP POLICY IF EXISTS "Allow authenticated delete" ON post_keywords;

-- Post references policies
DROP POLICY IF EXISTS "Allow public read access" ON post_references;
DROP POLICY IF EXISTS "Allow authenticated insert" ON post_references;
DROP POLICY IF EXISTS "Allow authenticated update" ON post_references;
DROP POLICY IF EXISTS "Allow authenticated delete" ON post_references;

-- Images policies
DROP POLICY IF EXISTS "Allow public read access" ON images;
DROP POLICY IF EXISTS "Allow authenticated insert" ON images;
DROP POLICY IF EXISTS "Allow authenticated update" ON images;
DROP POLICY IF EXISTS "Allow authenticated delete" ON images;

-- Keywords policies
DROP POLICY IF EXISTS "Allow public read access" ON keywords;
DROP POLICY IF EXISTS "Allow authenticated insert" ON keywords;
DROP POLICY IF EXISTS "Allow authenticated delete" ON keywords;

-- =====================================================
-- CREATE AUTHENTICATED-ONLY POLICIES
-- =====================================================

-- ----------------
-- POSTS POLICIES
-- ----------------
CREATE POLICY "Authenticated users can read posts"
  ON posts FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert posts"
  ON posts FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update posts"
  ON posts FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete posts"
  ON posts FOR DELETE
  USING (auth.role() = 'authenticated');

-- ----------------
-- POST TRANSLATIONS POLICIES
-- ----------------
CREATE POLICY "Authenticated users can read post_translations"
  ON post_translations FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert post_translations"
  ON post_translations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update post_translations"
  ON post_translations FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete post_translations"
  ON post_translations FOR DELETE
  USING (auth.role() = 'authenticated');

-- ----------------
-- KEYWORDS POLICIES
-- ----------------
CREATE POLICY "Authenticated users can read keywords"
  ON keywords FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert keywords"
  ON keywords FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete keywords"
  ON keywords FOR DELETE
  USING (auth.role() = 'authenticated');

-- ----------------
-- POST KEYWORDS POLICIES
-- ----------------
CREATE POLICY "Authenticated users can read post_keywords"
  ON post_keywords FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert post_keywords"
  ON post_keywords FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete post_keywords"
  ON post_keywords FOR DELETE
  USING (auth.role() = 'authenticated');

-- ----------------
-- POST REFERENCES POLICIES
-- ----------------
CREATE POLICY "Authenticated users can read post_references"
  ON post_references FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert post_references"
  ON post_references FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update post_references"
  ON post_references FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete post_references"
  ON post_references FOR DELETE
  USING (auth.role() = 'authenticated');

-- ----------------
-- IMAGES POLICIES
-- ----------------
CREATE POLICY "Authenticated users can read images"
  ON images FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert images"
  ON images FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update images"
  ON images FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete images"
  ON images FOR DELETE
  USING (auth.role() = 'authenticated');

-- =====================================================
-- KEEP PUBLIC READ FOR REFERENCE DATA
-- =====================================================
-- Categories and languages are reference data that can be read publicly
-- This allows the frontend to load category options even before auth

DROP POLICY IF EXISTS "Allow public read access" ON categories;
DROP POLICY IF EXISTS "Allow public read access" ON category_translations;
DROP POLICY IF EXISTS "Allow public read access" ON languages;

CREATE POLICY "Allow read access to categories"
  ON categories FOR SELECT
  USING (true);

CREATE POLICY "Allow read access to category_translations"
  ON category_translations FOR SELECT
  USING (true);

CREATE POLICY "Allow read access to languages"
  ON languages FOR SELECT
  USING (true);

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- After running this migration, verify policies with:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;

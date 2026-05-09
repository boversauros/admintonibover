-- Migration: Anon SELECT for public consumer (tonibover) with is_published gating
-- Description: Adds TO anon policies; existing authenticated policies remain.

-- Posts: anon can only see published posts
CREATE POLICY "Anon can read published posts"
  ON posts FOR SELECT TO anon
  USING (is_published = true);

-- Post translations: anon can read translations of published posts
CREATE POLICY "Anon can read post_translations"
  ON post_translations FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM posts
      WHERE posts.id = post_translations.post_id
        AND posts.is_published = true
    )
  );

-- Post keywords: anon can read junction rows for published posts
CREATE POLICY "Anon can read post_keywords"
  ON post_keywords FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM post_translations pt
      JOIN posts p ON p.id = pt.post_id
      WHERE pt.id = post_keywords.post_translation_id
        AND p.is_published = true
    )
  );

-- Keywords: reference data readable by anon
CREATE POLICY "Anon can read keywords"
  ON keywords FOR SELECT TO anon
  USING (true);

-- Post references: anon can read for published posts
CREATE POLICY "Anon can read post_references"
  ON post_references FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM post_translations pt
      JOIN posts p ON p.id = pt.post_id
      WHERE pt.id = post_references.post_translation_id
        AND p.is_published = true
    )
  );

-- Images: anon can read (URLs are public on consumer)
CREATE POLICY "Anon can read images"
  ON images FOR SELECT TO anon
  USING (true);

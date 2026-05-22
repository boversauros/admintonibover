-- Migration 012: Add length CHECK constraints
-- Defense in depth — caps on user-provided text fields, matching client-side
-- limits in lib/validation/postSchema.ts.

ALTER TABLE post_translations
  ADD CONSTRAINT post_translations_title_length
    CHECK (char_length(title) BETWEEN 1 AND 200),
  ADD CONSTRAINT post_translations_content_length
    CHECK (char_length(content) BETWEEN 1 AND 50000),
  ADD CONSTRAINT post_translations_slug_length
    CHECK (char_length(slug) BETWEEN 1 AND 250);

ALTER TABLE keywords
  ADD CONSTRAINT keywords_keyword_length
    CHECK (char_length(keyword) BETWEEN 1 AND 60);

ALTER TABLE post_references
  ADD CONSTRAINT post_references_reference_length
    CHECK (char_length(reference) BETWEEN 1 AND 2048),
  ADD CONSTRAINT post_references_blockquote_length
    CHECK (blockquote IS NULL OR char_length(blockquote) <= 2000);

ALTER TABLE posts
  ADD CONSTRAINT posts_author_length
    CHECK (char_length(author) BETWEEN 1 AND 120);

ALTER TABLE images
  ADD CONSTRAINT images_url_length
    CHECK (char_length(url) BETWEEN 1 AND 2048),
  ADD CONSTRAINT images_title_length
    CHECK (title IS NULL OR char_length(title) <= 200),
  ADD CONSTRAINT images_alt_length
    CHECK (alt IS NULL OR char_length(alt) <= 300);

ALTER TABLE category_translations
  ADD CONSTRAINT category_translations_name_length
    CHECK (char_length(name) BETWEEN 1 AND 120);

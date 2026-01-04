-- Initial Schema for Admin Toni Bover
-- Created: 2025-12-28
-- Description: Creates all tables for posts, translations, categories, keywords, images, and users

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- USERS TABLE
-- =====================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- LANGUAGES TABLE
-- =====================================================
CREATE TABLE languages (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

-- =====================================================
-- CATEGORIES TABLE
-- =====================================================
CREATE TABLE categories (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE
);

-- =====================================================
-- CATEGORY TRANSLATIONS TABLE
-- =====================================================
CREATE TABLE category_translations (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  language_id BIGINT NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE(category_id, language_id)
);

-- =====================================================
-- IMAGES TABLE
-- =====================================================
CREATE TABLE images (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT,
  alt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- POSTS TABLE
-- =====================================================
CREATE TABLE posts (
  id BIGSERIAL PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  image_id BIGINT REFERENCES images(id) ON DELETE SET NULL,
  thumbnail_id BIGINT REFERENCES images(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  author TEXT NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT false,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================
-- POST TRANSLATIONS TABLE
-- =====================================================
CREATE TABLE post_translations (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  language_id BIGINT NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  slug TEXT NOT NULL,
  UNIQUE(post_id, language_id),
  UNIQUE(language_id, slug)
);

-- =====================================================
-- KEYWORDS TABLE
-- =====================================================
CREATE TABLE keywords (
  id BIGSERIAL PRIMARY KEY,
  keyword TEXT NOT NULL,
  language_id BIGINT NOT NULL REFERENCES languages(id) ON DELETE CASCADE,
  UNIQUE(keyword, language_id)
);

-- =====================================================
-- POST KEYWORDS JUNCTION TABLE
-- =====================================================
CREATE TABLE post_keywords (
  post_translation_id BIGINT NOT NULL REFERENCES post_translations(id) ON DELETE CASCADE,
  keyword_id BIGINT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  PRIMARY KEY (post_translation_id, keyword_id)
);

-- =====================================================
-- POST REFERENCES TABLE
-- =====================================================
CREATE TABLE post_references (
  id BIGSERIAL PRIMARY KEY,
  post_translation_id BIGINT NOT NULL REFERENCES post_translations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('image', 'text')),
  reference TEXT NOT NULL,
  blockquote TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_category_id ON posts(category_id);
CREATE INDEX idx_posts_is_published ON posts(is_published);
CREATE INDEX idx_posts_date ON posts(date DESC);
CREATE INDEX idx_post_translations_post_id ON post_translations(post_id);
CREATE INDEX idx_post_translations_slug ON post_translations(slug);
CREATE INDEX idx_post_keywords_keyword_id ON post_keywords(keyword_id);
CREATE INDEX idx_post_references_post_translation_id ON post_references(post_translation_id);
CREATE INDEX idx_category_translations_category_id ON category_translations(category_id);

-- =====================================================
-- UPDATED_AT TRIGGER FUNCTION
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_images_updated_at
  BEFORE UPDATE ON images
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SEED DATA - LANGUAGES
-- =====================================================
INSERT INTO languages (code, name) VALUES
  ('ca', 'Català'),
  ('en', 'English');

-- =====================================================
-- SEED DATA - CATEGORIES
-- =====================================================
INSERT INTO categories (slug) VALUES
  ('vivencies'),
  ('influencies'),
  ('perspectives');

-- =====================================================
-- SEED DATA - CATEGORY TRANSLATIONS
-- =====================================================
-- Get language IDs
DO $$
DECLARE
  lang_ca_id BIGINT;
  lang_en_id BIGINT;
  cat_tech_id BIGINT;
  cat_design_id BIGINT;
  cat_philosophy_id BIGINT;
BEGIN
  -- Get language IDs
  SELECT id INTO lang_ca_id FROM languages WHERE code = 'ca';
  SELECT id INTO lang_en_id FROM languages WHERE code = 'en';

  -- Get category IDs
  SELECT id INTO cat_tech_id FROM categories WHERE slug = 'vivencies';
  SELECT id INTO cat_design_id FROM categories WHERE slug = 'influencies';
  SELECT id INTO cat_philosophy_id FROM categories WHERE slug = 'perspectives';

  -- Insert category translations
  INSERT INTO category_translations (category_id, language_id, name) VALUES
    (cat_tech_id, lang_ca_id, 'Vivències'),
    (cat_tech_id, lang_en_id, 'Experiences'),
    (cat_design_id, lang_ca_id, 'Influències'),
    (cat_design_id, lang_en_id, 'Influences'),
    (cat_philosophy_id, lang_ca_id, 'Perspectives'),
    (cat_philosophy_id, lang_en_id, 'Perspectives');
END $$;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) - Optional for future auth
-- =====================================================
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE languages ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated users (temporary - adjust based on your auth strategy)
CREATE POLICY "Allow public read access" ON posts FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON post_translations FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON post_keywords FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON post_references FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON images FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON keywords FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON categories FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON category_translations FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON languages FOR SELECT USING (true);

-- Allow insert/update/delete for authenticated users (temporary - adjust based on your needs)
CREATE POLICY "Allow authenticated insert" ON posts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON posts FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated delete" ON posts FOR DELETE USING (true);

CREATE POLICY "Allow authenticated insert" ON post_translations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON post_translations FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated delete" ON post_translations FOR DELETE USING (true);

CREATE POLICY "Allow authenticated insert" ON post_keywords FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated delete" ON post_keywords FOR DELETE USING (true);

CREATE POLICY "Allow authenticated insert" ON post_references FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON post_references FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated delete" ON post_references FOR DELETE USING (true);

CREATE POLICY "Allow authenticated insert" ON images FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated update" ON images FOR UPDATE USING (true);
CREATE POLICY "Allow authenticated delete" ON images FOR DELETE USING (true);

CREATE POLICY "Allow authenticated insert" ON keywords FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated delete" ON keywords FOR DELETE USING (true);

-- Migration: Use auth.users instead of public.users
-- Created: 2025-12-29
-- Description: Migrates posts table to reference auth.users directly instead of custom public.users table

-- =====================================================
-- STEP 1: Drop existing foreign key constraint
-- =====================================================
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_user_id_fkey;

-- =====================================================
-- STEP 2: Add foreign key to auth.users
-- =====================================================
-- Note: This creates a cross-schema foreign key reference
-- Posts will now reference Supabase's built-in auth.users table
ALTER TABLE posts
ADD CONSTRAINT posts_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- =====================================================
-- STEP 3: Drop public.users table
-- =====================================================
-- This table is no longer needed since we're using auth.users directly
DROP TABLE IF EXISTS public.users CASCADE;

-- =====================================================
-- NOTES FOR IMPLEMENTATION
-- =====================================================
-- After running this migration:
-- 1. Create users via Supabase Auth dashboard (Authentication → Users)
-- 2. Existing posts with hardcoded user_id may need reassignment:
--    UPDATE posts SET user_id = 'valid-auth-user-uuid' WHERE user_id = '8e5c76dd-24ed-49b3-bf6f-2b835836b83b';
-- 3. Verify foreign key: SELECT conname FROM pg_constraint WHERE conrelid = 'posts'::regclass;

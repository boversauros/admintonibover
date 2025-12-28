-- Drop existing restrictive policy on images table
DROP POLICY IF EXISTS "Allow authenticated insert/update/delete" ON images;

-- Create more permissive policies for development
-- TODO: Tighten these policies once authentication is implemented

-- Allow anyone to insert images (for now)
CREATE POLICY "Allow public insert on images"
ON images FOR INSERT
TO public
WITH CHECK (true);

-- Allow anyone to select images
CREATE POLICY "Allow public read on images"
ON images FOR SELECT
TO public
USING (true);

-- Allow anyone to update images
CREATE POLICY "Allow public update on images"
ON images FOR UPDATE
TO public
USING (true);

-- Allow anyone to delete images
CREATE POLICY "Allow public delete on images"
ON images FOR DELETE
TO public
USING (true);

-- Add comment explaining these are temporary
COMMENT ON TABLE images IS 'RLS policies are permissive for development. Tighten once auth is implemented.';

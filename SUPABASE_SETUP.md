# Supabase Setup Guide

This guide will help you set up Supabase for the Admin Toni Bover project.

## Prerequisites

- A Supabase account (sign up at https://supabase.com)

## Step 1: Create a New Supabase Project

1. Go to https://app.supabase.com
2. Click "New Project"
3. Fill in the project details:
   - **Name**: admin-tonibover (or your preferred name)
   - **Database Password**: Choose a strong password (save it securely)
   - **Region**: Choose the closest region to your users
4. Click "Create new project"
5. Wait for the project to finish setting up (~2 minutes)

## Step 2: Get Your Project Credentials

1. In your Supabase project dashboard, go to **Settings** → **API**
2. You'll find these values:
   - **Project URL**: `https://xxxxxxxxxxxx.supabase.co`
   - **anon/public key**: A long string starting with `eyJ...`

## Step 3: Configure Environment Variables

1. Open `.env.local` in your project root
2. Add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

3. Save the file

## Step 4: Run the Database Migration

1. In your Supabase dashboard, go to **SQL Editor**
2. Click "New Query"
3. Open the migration file: `supabase/migrations/001_initial_schema.sql`
4. Copy the entire contents
5. Paste into the SQL Editor
6. Click "Run" (or press Cmd/Ctrl + Enter)
7. You should see "Success. No rows returned"

## Step 5: Verify the Schema

1. In your Supabase dashboard, go to **Table Editor**
2. You should see all tables created:
   - users
   - languages (with 2 rows: ca, en)
   - categories (with 4 rows: vivencies, influencies, perspectives)
   - category_translations
   - posts
   - post_translations
   - keywords
   - post_keywords
   - post_references
   - images

## Step 6: Create a Test User (Optional)

Since the app requires a user_id for posts, you can create a test user:

1. Go to **SQL Editor** in Supabase
2. Run this query:

```sql
INSERT INTO users (email)
VALUES ('your-email@example.com')
RETURNING *;
```

3. Note the `id` (UUID) returned - you'll use this as the user_id in your app

## Step 7: Generate TypeScript Types

After the schema is applied, generate TypeScript types from your Supabase schema:

```bash
pnpm run types:generate
```

This will automatically fetch your database schema and generate type definitions in `lib/types/database.ts`.

**Note:** After generating types, you should:

1. Uncomment the Database import in `lib/supabase.ts`
2. Add `<Database>` to the createClient call

This enables full type safety for your Supabase queries.

## Step 8: Start the Development Server

```bash
pnpm run dev
```

Your app should now connect to Supabase!

## Testing the Connection

1. Open your browser console (F12)
2. Navigate to your app (http://localhost:3000)
3. Try creating a new post
4. Check the **Table Editor** in Supabase to verify the data was saved

## Troubleshooting

### "Invalid API key" error

- Double-check your `.env.local` file has the correct values
- Make sure you copied the **anon/public** key, not the service_role key
- Restart your dev server after changing env vars

### Migration fails

- Check the SQL Editor for error messages
- Ensure you copied the entire migration file
- Try running it section by section to identify the issue

### Can't insert data

- Check Row Level Security (RLS) policies in **Authentication** → **Policies**
- Verify the policies allow public insert (temporary for development)
- For production, implement proper authentication

## Next Steps

- Implement authentication with Supabase Auth
- Adjust RLS policies for production security
- Set up storage buckets for image uploads
- Configure custom domain (optional)

## Useful Links

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase JS Client Docs](https://supabase.com/docs/reference/javascript)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)

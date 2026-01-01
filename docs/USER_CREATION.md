# Creating Admin Users

Since sign-up functionality is disabled in this admin panel, users must be created manually in the Supabase dashboard.

## Steps to Create a New User

### 1. Navigate to Supabase Dashboard

- Go to https://app.supabase.com
- Select your project: **admintonibover**

### 2. Open Authentication

- Click **"Authentication"** in the left sidebar
- Click **"Users"** tab

### 3. Add New User

- Click the **"Add user"** button (top right)
- Select **"Create new user"**
- Fill in the form:
  - **Email address**: Enter the user's email (e.g., `admin@tonibover.com`)
  - **Password**: Enter a secure password (minimum 6 characters)
  - Leave **"Auto Confirm User"** checked (recommended for admin panel)
- Click **"Create user"**

### 4. Verify User Creation

The user is automatically created in `auth.users` and ready to login immediately.

**Verify in SQL Editor:**

```sql
SELECT id, email, created_at, email_confirmed_at
FROM auth.users
WHERE email = 'admin@tonibover.com';
```

## User Permissions

All authenticated users have the same permissions in this admin panel:

- ✓ Create new posts
- ✓ Edit any post
- ✓ Delete any post
- ✓ Upload images
- ✓ Manage keywords and references

There are no role-based restrictions. Every user who can log in has full admin access.

## Testing Login

1. Navigate to your admin site (e.g., `http://localhost:3000` or your deployed URL)
2. You should see the login page
3. Enter the email and password you just created
4. Click **"Sign In"**
5. You should be redirected to the posts dashboard

## Disable Email Confirmation (Recommended for Admin Panel)

By default, Supabase sends confirmation emails. For an admin panel, you may want to disable this:

1. Go to **Authentication → Settings** in Supabase dashboard
2. Scroll to **"Email Auth"** section
3. Uncheck **"Enable email confirmations"**
4. Click **"Save"**

Now users can login immediately without email verification.

## Password Reset

If a user forgets their password:

**Option 1: Reset via Dashboard**

1. Supabase Dashboard → **Authentication → Users**
2. Find the user by email
3. Click the **"..."** menu → **"Send password recovery"**
4. User receives email with reset link

**Option 2: Manually Set New Password**

1. Supabase Dashboard → **Authentication → Users**
2. Find the user by email
3. Click the **"..."** menu → **"Update user"**
4. Enter new password
5. Click **"Update user"**

## Migrating Existing Posts

If you have posts with the old hardcoded user ID, reassign them to a real user:

1. Create a user in Supabase Auth (see steps above)
2. Get the new user's UUID from auth.users
3. Run this SQL query to reassign posts:

```sql
-- Get the new user's ID
SELECT id FROM auth.users WHERE email = 'admin@tonibover.com';

-- Update posts to new user (replace with actual UUID)
UPDATE posts
SET user_id = 'actual-uuid-from-above-query'
WHERE user_id = '8e5c76dd-24ed-49b3-bf6f-2b835836b83b';
```

## Troubleshooting

### "Invalid login credentials" Error

- ✓ Double-check email and password
- ✓ Ensure user exists in Authentication → Users
- ✓ Check if email confirmation is required (see "Disable Email Confirmation" section)
- ✓ Verify user's `email_confirmed_at` is not null

### User Can't See Posts After Login

- ✓ Check browser console for errors
- ✓ Verify RLS policies are applied (run migration 006)
- ✓ Check if user has `authenticated` role: `SELECT current_setting('request.jwt.claims')::json->>'role';`

### Database Migration Not Applied

If you're getting foreign key errors:

1. Verify migration 005 was run (posts references auth.users)
2. Check constraint exists:

```sql
SELECT conname
FROM pg_constraint
WHERE conrelid = 'posts'::regclass
AND conname = 'posts_user_id_fkey';
```

## Security Best Practices

1. **Use Strong Passwords**: Minimum 12 characters with mix of letters, numbers, and symbols
2. **Limited User Accounts**: Only create accounts for actual admins
3. **Regular Audits**: Periodically review users in Authentication → Users
4. **Enable MFA** (optional): Supabase supports Multi-Factor Authentication for additional security
5. **Monitor Activity**: Check Supabase logs for suspicious login attempts

## Next Steps

After creating your first user:

1. Login to the admin panel
2. Create your first post to verify everything works
3. Test edit and delete functionality
4. Verify images upload correctly
5. Create additional admin users as needed

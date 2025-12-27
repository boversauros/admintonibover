# Implementation Plan: Posts Table on Home Page

## Overview
Add a table to the home page (`app/page.tsx`) that displays all saved posts from localStorage with Edit and Delete actions.

## User Requirements
- **Display**: Both CA and EN titles in separate columns
- **Columns**: Title (CA), Title (EN), Category
- **Actions**: Edit, Delete
- **Navigation**: Link to create new post at /reflexions/new

## Current State
- ✅ Table component exists (`components/ui/Table.tsx`)
- ✅ getPosts() function exists (`lib/utils/localStorage.ts`)
- ✅ Link to /reflexions/new already on home page
- ✅ StoredPost type defined (`lib/types/post.ts`)

## Implementation Steps

### 1. Update Home Page (`app/page.tsx`)

**Add State Management:**
```typescript
'use client';

import { useState, useEffect } from 'react';
import { Table, Button, Link } from '@/components/ui';
import { getPosts, savePosts } from '@/lib/utils/localStorage';
import { StoredPost } from '@/lib/types/post';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [posts, setPosts] = useState<StoredPost[]>([]);
  const router = useRouter();

  useEffect(() => {
    // Load posts from localStorage on mount
    setPosts(getPosts());
  }, []);

  // Refresh posts list
  const refreshPosts = () => {
    setPosts(getPosts());
  };
}
```

**Define Table Columns:**
```typescript
const columns = [
  {
    key: 'translations.ca.title' as keyof StoredPost, // Type workaround
    label: 'Title (CA)',
    render: (_, row: StoredPost) => row.translations.ca.title,
  },
  {
    key: 'translations.en.title' as keyof StoredPost,
    label: 'Title (EN)',
    render: (_, row: StoredPost) => row.translations.en.title,
  },
  {
    key: 'category_id' as keyof StoredPost,
    label: 'Category',
    render: (value) => {
      // Convert category_id to readable label
      const labels = {
        tech: 'Technology',
        design: 'Design',
        philosophy: 'Philosophy',
        personal: 'Personal',
      };
      return labels[value as string] || value;
    },
  },
];
```

**Define Table Actions:**
```typescript
const actions = [
  {
    label: 'Edit',
    onClick: (post: StoredPost) => {
      // Navigate to edit page (to be created later)
      router.push(`/reflexions/${post.id}/edit`);
    },
  },
  {
    label: 'Delete',
    onClick: (post: StoredPost) => {
      if (confirm(`Delete "${post.translations.ca.title}"?`)) {
        const updatedPosts = posts.filter(p => p.id !== post.id);
        savePosts(updatedPosts);
        refreshPosts();
      }
    },
  },
];
```

**Update JSX:**
```typescript
return (
  <div className="min-h-screen p-8">
    <main className="max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Reflexions</h1>
        <Link href="/reflexions/new" variant="accent-border">
          + New Reflexion
        </Link>
      </div>

      <section>
        <Table
          data={posts}
          columns={columns}
          actions={actions}
          rowKey={(post) => post.id}
          emptyMessage="No posts yet. Create your first reflexion!"
          striped
          hoverable
        />
      </section>
    </main>
  </div>
);
```

### 2. Handle TypeScript Issues

The Table component expects `key` to be `keyof T`, but nested properties like `translations.ca.title` won't work directly. Two solutions:

**Option A: Use render function (Recommended)**
```typescript
{
  key: 'id' as keyof StoredPost, // Use any valid key
  label: 'Title (CA)',
  render: (_, row: StoredPost) => row.translations.ca.title,
}
```

**Option B: Create a flattened type**
```typescript
// Not recommended - too complex for this use case
```

### 3. Future Enhancements (Not in this implementation)
- Edit route: `/reflexions/[id]/edit` - Will need to be created
- View route: `/reflexions/[id]` - For viewing full post
- Search/filter functionality
- Pagination for large lists
- Sort by date/category

## Files to Modify

**1. `/Users/oriolbovervila/Dev/projects/admintonibover/app/page.tsx`**
   - Convert to client component ('use client')
   - Add state management for posts
   - Import Table, Button, Link components
   - Import getPosts, savePosts utilities
   - Define columns and actions
   - Render Table with posts data
   - Add "New Reflexion" button in header

## Implementation Details

### Delete Action Flow
1. User clicks "Delete" button
2. Confirmation dialog appears
3. If confirmed:
   - Filter out the post from array
   - Save updated array to localStorage
   - Refresh posts state
   - Table re-renders without deleted post

### Edit Action Flow
1. User clicks "Edit" button
2. Navigate to `/reflexions/[id]/edit`
3. Note: Edit page doesn't exist yet - will show 404 for now
4. This is intentional - can be implemented in next phase

### Empty State
- If no posts exist, show friendly message
- Include call-to-action to create first post
- Message: "No posts yet. Create your first reflexion!"

## Layout Changes

**Before:**
```
┌─────────────────────────────────┐
│ Reflexions MVP                  │
│                                 │
│ ✅ MVP Ready!                   │
│ [Go to /reflexions/new →]       │
│                                 │
│ Implementation Status           │
│ ✅ Phase 1...                   │
└─────────────────────────────────┘
```

**After:**
```
┌─────────────────────────────────┐
│ Reflexions      [+ New Reflexion]│
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Title (CA) │ Title (EN) │...│ │
│ │────────────┼────────────┼───│ │
│ │ Post 1 CA  │ Post 1 EN  │...│ │
│ │ Post 2 CA  │ Post 2 EN  │...│ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

## Edge Cases Handled

1. **No posts**: Show empty state message
2. **Delete confirmation**: Prevent accidental deletion
3. **SSR safety**: useEffect ensures localStorage only accessed client-side
4. **Category labels**: Convert IDs to readable names
5. **Missing edit page**: Will navigate but show 404 (acceptable for MVP)

## Testing Checklist

After implementation, verify:
- [ ] Table displays all posts from localStorage
- [ ] CA titles display correctly
- [ ] EN titles display correctly
- [ ] Categories display as readable labels
- [ ] Delete action removes post
- [ ] Delete requires confirmation
- [ ] Empty state shows when no posts
- [ ] "New Reflexion" button navigates to /reflexions/new
- [ ] Edit button navigates (even if page doesn't exist)
- [ ] Table is responsive

## Time Estimate
- Implementation: ~15 minutes
- Testing: ~5 minutes
- Total: ~20 minutes

---

**Critical File:**
- `/Users/oriolbovervila/Dev/projects/admintonibover/app/page.tsx` - Main implementation

**Dependencies:**
- Table component (already exists)
- getPosts/savePosts utilities (already exist)
- Next.js useRouter for navigation

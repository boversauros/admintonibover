# Implementation Plan: Bilingual Post Creation Form

## Overview
Create a bilingual post creation form at `/reflexions/new` with React Hook Form, localStorage persistence, and auto-slug generation. The form matches the database schema design for future Supabase integration.

## User Preferences (MVP)
- **Storage**: localStorage (JSON)
- **Images**: URL input only
- **Slug**: Auto-generate from title, allow manual editing
- **Forms**: React Hook Form

## Database Schema Reference
```
posts (metadata)
  ├── id, user_id, category_id, image_id, thumbnail_id
  ├── is_published, date, author, created_at, updated_at
  │
post_translations (bilingual content)
  ├── post_id, language [ca|en]
  ├── title, content, slug
  ├── references_images[], references_texts[]
  │
keywords (language-specific)
  ├── id, keyword, language [ca|en]
  │
post_keywords (junction table)
  ├── post_translation_id, keyword_id
```

## File Structure to Create

```
app/reflexions/new/page.tsx              # Main route page (client component)

components/forms/
  ├── PostForm.tsx                       # Main form orchestrator
  ├── LanguageTabs.tsx                   # CA/EN tab switcher
  ├── PostMetadataSection.tsx            # Category, date, author
  ├── TranslationSection.tsx             # Title, slug, content per language
  ├── ImageSection.tsx                   # Thumbnail URL input
  ├── KeywordsInput.tsx                  # Multi-tag input component
  ├── ReferencesInput.tsx                # Dynamic reference list
  └── DatePicker.tsx                     # Date selection wrapper

lib/
  ├── types/post.ts                      # TypeScript interfaces
  ├── utils/slugify.ts                   # Slug generation utilities
  ├── utils/localStorage.ts              # LocalStorage CRUD operations
  └── validation/postSchema.ts           # Form validation rules
```

## Implementation Steps

### Phase 1: Foundation (30 min)

1. **Install Dependencies**
   ```bash
   pnpm add react-hook-form react-datepicker
   pnpm add -D @types/react-datepicker
   ```

2. **Create Type Definitions** (`lib/types/post.ts`)
   ```typescript
   export type Language = 'ca' | 'en';
   export type ReferenceType = 'image' | 'text';

   export interface PostTranslation {
     language: Language;
     title: string;
     content: string;
     slug: string;
     keywords: string[];
     references: Reference[];
   }

   export interface Reference {
     id: string;
     type: ReferenceType;
     reference: string;
     blockquote: string;
     sort_order: number;
   }

   export interface PostFormData {
     category_id: string;
     date: string;
     author: string;
     thumbnail_url: string;
     is_published: boolean;
     translations: {
       ca: PostTranslation;
       en: PostTranslation;
     };
   }

   export interface StoredPost {
     id: string;
     user_id: string;
     category_id: string;
     thumbnail_url: string;
     is_published: boolean;
     date: string;
     author: string;
     created_at: string;
     updated_at: string;
     translations: {
       ca: PostTranslation & { post_id: string };
       en: PostTranslation & { post_id: string };
     };
   }
   ```

3. **Create Slug Utilities** (`lib/utils/slugify.ts`)
   ```typescript
   export function slugify(text: string): string {
     return text
       .toLowerCase()
       .normalize('NFD')
       .replace(/[\u0300-\u036f]/g, '')
       .replace(/[^\w\s-]/g, '')
       .replace(/\s+/g, '-')
       .replace(/-+/g, '-')
       .replace(/^-+|-+$/g, '');
   }

   export function generateUniqueSlug(
     baseSlug: string,
     existingSlugs: string[]
   ): string {
     let slug = baseSlug;
     let counter = 1;
     while (existingSlugs.includes(slug)) {
       slug = `${baseSlug}-${counter}`;
       counter++;
     }
     return slug;
   }
   ```

4. **Create LocalStorage Utilities** (`lib/utils/localStorage.ts`)
   ```typescript
   const POSTS_KEY = 'posts';

   export function getPosts(): StoredPost[] {
     const data = localStorage.getItem(POSTS_KEY);
     return data ? JSON.parse(data) : [];
   }

   export function savePosts(posts: StoredPost[]): void {
     try {
       localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
     } catch (error) {
       if (error.name === 'QuotaExceededError') {
         throw new Error('Storage quota exceeded');
       }
       throw error;
     }
   }

   export function generatePostId(): string {
     return `post-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
   }

   export function getExistingSlugs(language: Language): string[] {
     return getPosts().map(p => p.translations[language].slug);
   }
   ```

5. **Create Validation Schema** (`lib/validation/postSchema.ts`)
   ```typescript
   export const postValidationRules = {
     category_id: { required: 'Category is required' },
     date: { required: 'Date is required' },
     author: {
       required: 'Author is required',
       minLength: { value: 2, message: 'Min 2 characters' }
     },
     'translations.ca.title': { required: 'Catalan title required' },
     'translations.en.title': { required: 'English title required' },
     'translations.ca.content': { required: 'Catalan content required' },
     'translations.en.content': { required: 'English content required' },
   };
   ```

### Phase 2: Base Components (45 min)

6. **DatePicker Component** (`components/forms/DatePicker.tsx`)
   - Wrap react-datepicker with project styling
   - Props: label, value (ISO string), onChange, error, helperText
   - Match Input component styling from `components/ui/Input.tsx`
   - Import CSS: `import 'react-datepicker/dist/react-datepicker.css'`

7. **KeywordsInput Component** (`components/forms/KeywordsInput.tsx`)
   - Props: value (string[]), onChange, label, placeholder
   - Features:
     - Input field to add keywords
     - Press Enter or click Add button
     - Display keywords as Badge components with remove button
     - Prevent duplicates (case-insensitive check)
     - Trim whitespace
   - Use existing Input and Badge components

8. **ReferencesInput Component** (`components/forms/ReferencesInput.tsx`)
   - Props: value (Reference[]), onChange, language
   - Features:
     - Dynamic list of references
     - Each reference: type select (image/text), reference input, blockquote textarea
     - Add/Remove buttons
     - Auto-increment sort_order
     - Generate unique IDs with `ref-${Date.now()}`
   - Use existing Select, Input, Textarea, Button components

9. **LanguageTabs Component** (`components/forms/LanguageTabs.tsx`)
   - Props: active (Language), onChange
   - Simple CA | EN tab switcher
   - Highlight active tab with accent color
   - Use button elements for accessibility

### Phase 3: Form Sections (60 min)

10. **PostMetadataSection** (`components/forms/PostMetadataSection.tsx`)
    - Uses React Hook Form's useFormContext
    - Fields:
      - Category select (hardcoded options for MVP)
      - DatePicker for publish date
      - Input for author name
    - Register fields: category_id, date, author
    - Display validation errors

11. **TranslationSection** (`components/forms/TranslationSection.tsx`)
    - Props: language ('ca' | 'en')
    - Uses useFormContext
    - Fields:
      - Input for title
      - Input for slug (with helper text)
      - Textarea for content (markdown, large)
    - Register fields: translations.{lang}.title, slug, content
    - Display validation errors per field

12. **ImageSection** (`components/forms/ImageSection.tsx`)
    - Uses useFormContext
    - Single URL input for thumbnail
    - Optional preview if URL is valid
    - Helper text: "Enter image URL"

13. **KeywordsSection** (`components/forms/KeywordsSection.tsx`)
    - Props: language ('ca' | 'en')
    - Uses Controller from React Hook Form
    - Wraps KeywordsInput component
    - Label: "Keywords (CA)" or "Keywords (EN)"
    - Helper text: "Press Enter to add keywords"

14. **ReferencesSection** (`components/forms/ReferencesSection.tsx`)
    - Props: language ('ca' | 'en')
    - Uses Controller from React Hook Form
    - Wraps ReferencesInput component
    - Label: "References (CA)" or "References (EN)"
    - Optional section (no validation)

### Phase 4: Main Form (90 min)

15. **PostForm Component** (`components/forms/PostForm.tsx`)
    - Setup React Hook Form with FormProvider
    - Default values:
      ```typescript
      {
        category_id: '',
        date: new Date().toISOString().split('T')[0],
        author: '',
        thumbnail_url: '',
        is_published: false,
        translations: {
          ca: { language: 'ca', title: '', content: '', slug: '', keywords: [], references: [] },
          en: { language: 'en', title: '', content: '', slug: '', keywords: [], references: [] }
        }
      }
      ```
    - State: activeLanguage (CA/EN switcher)
    - Auto-slug generation:
      - Watch title changes for both languages
      - Auto-generate slug when title changes
      - Only update if slug hasn't been manually edited
      - Use slugify utility
    - Form submission:
      - Transform PostFormData → StoredPost
      - Check for unique slugs
      - Generate post ID
      - Add timestamps
      - Save to localStorage
      - Show success toast
      - Reset form or redirect
    - Validation: validate on change for instant feedback
    - Layout:
      ```
      <form>
        <PostMetadataSection />
        <LanguageTabs active={lang} onChange={setLang} />
        <TranslationSection language={lang} />
        <KeywordsSection language={lang} />
        <ReferencesSection language={lang} />
        <ImageSection />
        <Button type="submit">Save Post</Button>
      </form>
      ```

### Phase 5: Page Route (15 min)

16. **Create Route** (`app/reflexions/new/page.tsx`)
    - 'use client' directive
    - Import PostForm
    - Simple page layout:
      ```tsx
      export default function NewReflexionPage() {
        return (
          <div className="min-h-screen p-8">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-4xl font-bold mb-8">New Reflexion</h1>
              <PostForm />
            </div>
          </div>
        );
      }
      ```

### Phase 6: Edge Cases & Polish (30 min)

17. **Handle Edge Cases**
    - Language switching: All data in React Hook Form state (persists across tabs)
    - Unique slugs: Check against existing posts before save
    - Partial translations: Allow saving as draft (is_published: false)
    - Storage quota: Catch QuotaExceededError, show error toast
    - Duplicate keywords: Prevent in KeywordsInput component

18. **Success Feedback**
    - Use Toast component from existing UI library
    - Show success message: "Post saved successfully!"
    - Option to redirect to list view (future)

## Acceptance Criteria Verification

✅ Form renders with all fields
✅ Language tabs switch between CA/EN content
✅ Form validation for required fields
✅ Submit button (saves to localStorage)
✅ Auto-generated slugs (editable)
✅ Keywords multi-select/tags input
✅ References add/remove with type, citation, blockquote
✅ Page route: /reflexions/new

---

**Estimated Total Time**: ~4 hours
**Complexity**: Medium-High
**Dependencies**: react-hook-form, react-datepicker

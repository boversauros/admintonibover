# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build production version
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Architecture Overview

This is a Next.js 15 admin interface for ToniBover, built with TypeScript, React 19, and Tailwind CSS. The application uses a dark theme (gray-950 background) and follows a structured approach with service layers and type definitions.

### Key Architecture Patterns

**Service Layer Pattern**: All data operations go through dedicated service classes:
- `app/_lib/posts-service.ts` - Post CRUD operations with mock data
- `app/_lib/keywords-service.ts` - Keyword management with language support
- Services simulate API calls with delays and return `ApiResponse<T>` wrapper types

**Component Structure**: 
- Main components in `app/posts/_components/`
- Complex forms use tabbed interfaces (ContentTab, MediaTab, MetadataTab, ReferencesTab)
- Custom hooks for state management (`app/_hooks/usePost.ts`)

**Type System**: Centralized in `app/_lib/types.ts` with comprehensive interfaces for:
- `Post` - Main content entity with multilingual support (Catalan/English)
- `Keyword` - SEO keywords with language association
- `ImageData` - Media handling with optional file uploads
- `PostReferences` - Text and image reference tracking

### Data Flow

Posts support bilingual content (Catalan/English) and include:
- Content management with rich metadata
- Keyword system with language-specific associations
- Image handling for main images and thumbnails
- Reference tracking for citations and media
- Publishing workflow with draft/published states

### Database Schema (Supabase)

**Core Tables:**
```sql
-- Users (leverages Supabase Auth)
users (
  id uuid primary key references auth.users,
  email text not null,
  created_at timestamptz default now()
)

-- Categories
categories (
  id serial primary key,
  name text not null,
  created_at timestamptz default now()
)

-- Main posts table (language-agnostic metadata)
posts (
  id serial primary key,
  user_id uuid references users(id),
  category_id int references categories(id),
  image_id int references images(id),
  thumbnail_id int references images(id),
  is_published boolean default false,
  date timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
)

-- Post translations (language-specific content)
post_translations (
  id serial primary key,
  post_id int references posts(id) on delete cascade,
  language text not null check (language in ('ca', 'en')),
  title text not null,
  content text not null,
  slug text not null,
  references_images text[], -- JSON array of image references
  references_texts text[],  -- JSON array of text references
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(post_id, language)
)

-- Images
images (
  id serial primary key,
  url text not null,
  title text not null,
  alt text,
  created_at timestamptz default now()
)

-- Keywords (language-specific)
keywords (
  id serial primary key,
  keyword text not null,
  language text not null check (language in ('ca', 'en')),
  created_at timestamptz default now(),
  unique(keyword, language)
)

-- Post-keyword relationships
post_keywords (
  post_translation_id int references post_translations(id) on delete cascade,
  keyword_id int references keywords(id) on delete cascade,
  primary key (post_translation_id, keyword_id)
)
```

**Key Benefits:**
- Separation of concerns: Metadata in `posts`, content in `post_translations`
- Language flexibility: Easy to add more languages
- SEO friendly: Each translation gets its own slug and keywords
- Efficient queries: Can fetch all translations or filter by language
- Data integrity: Foreign key constraints ensure consistency

### Mock Data

Currently uses in-memory mock services (`DEMO_POSTS`, `DEMO_IMAGES`, `MOCK_KEYWORDS`) that simulate database operations. Services include proper error handling and loading states. Will be replaced with Supabase integration following the schema above.

### Path Aliases

Uses `@/*` alias pointing to project root for clean imports.

### UI Patterns

- Dark theme with gray-950 backgrounds
- Sidebar-based layout with toggle functionality
- Form validation with Catalan error messages
- Tabbed interfaces for complex forms
- Responsive design principles
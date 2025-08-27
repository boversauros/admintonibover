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

### Mock Data

Currently uses in-memory mock services (`DEMO_POSTS`, `DEMO_IMAGES`, `MOCK_KEYWORDS`) that simulate database operations. Services include proper error handling and loading states.

### Path Aliases

Uses `@/*` alias pointing to project root for clean imports.

### UI Patterns

- Dark theme with gray-950 backgrounds
- Sidebar-based layout with toggle functionality
- Form validation with Catalan error messages
- Tabbed interfaces for complex forms
- Responsive design principles
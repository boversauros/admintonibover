# Admin Toni Bover

Personal blog administration system for managing posts, translations, and content.

## Tech Stack

- **Next.js 16** with App Router
- **React 19**
- **TypeScript**
- **Tailwind CSS v4**
- **Supabase** (database & authentication)
- **React Hook Form** for form management

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- pnpm
- A Supabase account and project

### Installation

1. Install dependencies:

```bash
pnpm install
```

2. Set up environment variables:

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

3. Set up the database:

Follow the instructions in `SUPABASE_SETUP.md` to run the migrations and configure your Supabase project.

4. Start the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

- `pnpm dev` - Start development server with Turbopack
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm format` - Format code with Prettier
- `pnpm format:check` - Check code formatting

## Project Structure

- `app/` - Next.js app router pages and routes
- `components/` - React components (auth, forms, posts, UI)
- `lib/` - Utilities, API clients, types, and validation
- `supabase/migrations/` - Database migration files

## Features

- Authentication with Supabase Auth
- Post management with multi-language support (Catalan/English)
- Category organization
- Keyword tagging
- Image upload and management
- Publication status control
- Search and filtering

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

- Node.js 24.18.0 (see `.node-version`)
- pnpm 11.0.9 (pinned in `package.json`)
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

The Supabase adapter remains the default. The issue #9 AWS tracer is an
explicit, server-controlled development mode:

```env
ADMIN_DATA_BACKEND=aws
ADMIN_CSP_MODE=enforce
AWS_ADMIN_API_URL=stack-output-api-url
AWS_COGNITO_CLIENT_ID=stack-output-client-id
AWS_COGNITO_ISSUER=stack-output-user-pool-issuer
AWS_COGNITO_LOGIN_URL=stack-output-login-url
AWS_COGNITO_CALLBACK_URL=http://localhost:3000/auth/callback
AWS_COGNITO_LOGOUT_URL=http://localhost:3000/
AWS_COGNITO_SESSION_SECRET=base64url-encoded-32-byte-random-value
AWS_CONTENT_BUCKET_ORIGIN=https://<BucketName>.s3.eu-west-1.amazonaws.com
```

Use only the non-secret outputs from the named development stack. Never commit
the real values, generated names, presigned URLs, or Cognito tokens. The bucket
origin is a CSP allowlist origin, not a public bucket URL; it must use the exact
regional S3 API origin with no trailing path or wildcard. The deployment,
fixture, and integration procedures are in the runbooks below.
The session secret is the only secret in this block: generate a different value
for each environment, keep it server-only, and never prefix it with
`NEXT_PUBLIC_`. See the Cognito admin-session runbook for generation, callback,
preview, Vercel, and rollback procedures.

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
- `pnpm typecheck` - Validate TypeScript without emitting files
- `pnpm test` - Run cloud-free unit tests
- `pnpm check:secrets` - Reject repository `.env*` files and high-confidence
  AWS, GitHub, and privileged Supabase credentials
- `pnpm check:browser-artifacts` - Reject source maps, server-only environment
  names, refresh-token markers, and configured secret canaries in `.next`
- `pnpm audit:dependencies` - Fail on high-severity production dependency
  advisories
- `pnpm lambda:build` - Bundle the deployable foundation Lambda into the
  generated infrastructure artifact
- `pnpm lambda:validate` - Confirm the committed Lambda bundle is current
- `pnpm backup:validate -- --input <path>` - Validate a Supabase JSON backup
  offline without modifying it or contacting a cloud service
- `pnpm migration:run -- --input <path> --input-sha256 <sha256> --manifest <path>` -
  Dry-run the offline JSON-to-DynamoDB migration
- `pnpm infra:synth` - Generate the reviewable development CloudFormation
  template without contacting AWS
- `pnpm infra:synth -- --environment prod` - Generate the isolated production
  template from the same infrastructure source
- `pnpm infra:validate` - Validate both approved resource inventories and
  confirm both committed CloudFormation syntheses are current
- `pnpm run ci` - Run the complete local validation suite
- `pnpm format` - Format code with Prettier
- `pnpm format:check` - Check code formatting

## Project Structure

- `app/` - Next.js app router pages and routes
- `components/` - React components (auth, forms, posts, UI)
- `lib/` - Utilities, API clients, types, and validation
- `supabase/migrations/` - Database migration files

## Architecture and operations

- [Admin-only AWS data and security contract](docs/adr/0001-admin-only-aws-data-security-contract.md)
- [AWS account guardrails](docs/runbooks/aws-account-guardrails.md)
- [AWS development foundation](docs/runbooks/aws-development-foundation.md)
- [AWS production foundation](docs/runbooks/aws-production-foundation.md)
- [Single Cognito administrator](docs/runbooks/cognito-single-administrator.md)
- [Secure Cognito admin session](docs/runbooks/cognito-admin-session.md)
- [Authenticated DynamoDB read tracer](docs/runbooks/authenticated-read-tracer.md)
- [DynamoDB post repository boundary](docs/runbooks/dynamodb-post-repository.md)
- [Private S3 image repair](docs/runbooks/s3-presigned-image-repair.md)
- [AWS admin post mutations](docs/runbooks/aws-admin-post-mutations.md)
- [AWS admin backup and utility parity](docs/runbooks/aws-admin-backup-and-utilities.md)
- [Admin web security and AWS cutover](docs/runbooks/admin-web-security.md)
- [Migration pull-request workflow](docs/runbooks/migration-pull-request-workflow.md)
- [Offline Supabase backup validation](docs/runbooks/backup-validation.md)
- [Offline JSON-to-DynamoDB migration](docs/runbooks/json-dynamodb-migration.md)
- [Development migration rehearsal](docs/runbooks/development-migration-rehearsal.md)
- [Production content cutover](docs/runbooks/production-content-cutover.md)

## Features

- Authentication with Supabase Auth
- Post management with multi-language support (Catalan/English)
- Category organization
- Keyword tagging
- Image upload and management
- Publication status control
- Search and filtering

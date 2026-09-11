# Admin Toni Bover

Personal blog administration system for managing multilingual content on AWS.

## Tech stack

- Next.js 16 with App Router
- React 19 and TypeScript
- Tailwind CSS v4
- AWS Cognito, API Gateway, Lambda, DynamoDB, and private S3
- React Hook Form

## Getting started

### Prerequisites

- Node.js 24.18.0 (see `.node-version`)
- pnpm 11.0.9 (pinned in `package.json`)
- Access to the development AWS stack outputs

### Installation

1. Install dependencies:

```bash
pnpm install
```

2. Copy `.env.example` to `.env.local` and replace the placeholders with the
   non-secret development stack outputs. Generate a different
   `AWS_COGNITO_SESSION_SECRET` for each environment and keep it server-only.

3. Start the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

The S3 value is a strict CSP allowlist origin, not a public bucket URL. Use the
exact regional S3 origin without a trailing path or wildcard. Never commit real
environment values, generated resource names, presigned URLs, or Cognito
tokens.

## Available scripts

- `pnpm dev` — start the development server with Turbopack
- `pnpm build` — create the production build
- `pnpm start` — run the production server
- `pnpm lint` — run ESLint
- `pnpm typecheck` — validate TypeScript without emitting files
- `pnpm test` — run cloud-free unit tests
- `pnpm check:secrets` — reject repository environment files and supported
  high-confidence credential formats
- `pnpm check:browser-artifacts` — reject source maps, server-only environment
  names, refresh-token markers, and configured secret canaries in `.next`
- `pnpm audit:dependencies` — fail on high-severity production advisories
- `pnpm lambda:build` — build the deployable Lambda bundle
- `pnpm lambda:validate` — confirm the committed Lambda bundle is current
- `pnpm backup:validate -- --input <path>` — validate a legacy JSON content
  backup offline
- `pnpm migration:run -- --input <path> --input-sha256 <sha256> --manifest <path>` —
  dry-run or execute the one-way JSON-to-DynamoDB migration
- `pnpm infra:synth` — generate the development CloudFormation template
- `pnpm infra:synth -- --environment prod` — generate the production template
- `pnpm infra:validate` — validate both infrastructure inventories
- `pnpm run ci` — run the complete local validation suite
- `pnpm format` / `pnpm format:check` — write or check Prettier formatting

## Project structure

- `app/` — Next.js pages and route handlers
- `components/` — React components for auth, forms, posts, and UI
- `lib/` — domain logic, AWS adapters, authentication, and validation
- `infra/` — isolated development and production AWS infrastructure
- `scripts/` — validation, migration, and infrastructure utilities

## Architecture and operations

- [Admin-only AWS data and security contract](docs/adr/0001-admin-only-aws-data-security-contract.md)
- [AWS account guardrails](docs/runbooks/aws-account-guardrails.md)
- [AWS development foundation](docs/runbooks/aws-development-foundation.md)
- [AWS production foundation](docs/runbooks/aws-production-foundation.md)
- [Single Cognito administrator](docs/runbooks/cognito-single-administrator.md)
- [Secure Cognito admin session](docs/runbooks/cognito-admin-session.md)
- [Authenticated DynamoDB reads](docs/runbooks/authenticated-read-tracer.md)
- [DynamoDB post repository](docs/runbooks/dynamodb-post-repository.md)
- [Private S3 image repair](docs/runbooks/s3-presigned-image-repair.md)
- [AWS admin post mutations](docs/runbooks/aws-admin-post-mutations.md)
- [AWS admin backup and utilities](docs/runbooks/aws-admin-backup-and-utilities.md)
- [Admin web security](docs/runbooks/admin-web-security.md)
- [Migration pull-request workflow](docs/runbooks/migration-pull-request-workflow.md)
- [Offline backup validation](docs/runbooks/backup-validation.md)
- [Offline JSON-to-DynamoDB migration](docs/runbooks/json-dynamodb-migration.md)
- [Development migration rehearsal](docs/runbooks/development-migration-rehearsal.md)
- [Production content cutover](docs/runbooks/production-content-cutover.md)

## Features

- Cognito authentication for one private administrator
- Multilingual post management in Catalan and English
- Category organization and keyword tagging
- Private image upload and replacement
- Publication controls, search, and filtering
- Validated backup download and one-way legacy content migration

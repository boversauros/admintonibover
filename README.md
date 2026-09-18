# Admin Toni Bover

Private administration application for Toni Bover's bilingual posts. The
runtime is AWS-only: Next.js holds the administrator session and proxies all
content operations to a Cognito-protected API Gateway/Lambda service backed by
DynamoDB and private S3.

## Prerequisites

- Node.js 24.18.0 (`.node-version`)
- pnpm 11.0.9 (`package.json`)
- Non-secret outputs from the intended `admintonibover-dev` stack
- A unique, server-only 32-byte base64url Cognito session secret

## Local setup

Install the exact dependency graph:

```bash
pnpm install --frozen-lockfile
```

Create an ignored `.env.local` with the development stack outputs:

```env
ADMIN_CSP_MODE=enforce
AWS_ADMIN_API_URL=<ApiUrl>
AWS_COGNITO_CLIENT_ID=<UserPoolClientId>
AWS_COGNITO_ISSUER=<UserPoolIssuer>
AWS_COGNITO_LOGIN_URL=<CognitoLoginUrl>
AWS_COGNITO_CALLBACK_URL=http://localhost:3000/auth/callback
AWS_COGNITO_LOGOUT_URL=http://localhost:3000/
AWS_COGNITO_SESSION_SECRET=<base64url-encoded-32-byte-secret>
AWS_CONTENT_BUCKET_ORIGIN=https://<BucketName>.s3.eu-west-1.amazonaws.com
```

Generate the session secret without committing or logging it:

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'
```

Start the application and open <http://localhost:3000>:

```bash
pnpm dev
```

All application settings are server-only. Do not add a `NEXT_PUBLIC_` prefix,
commit `.env*` files, or record credentials, tokens, presigned URLs, account
identifiers, generated resource names, backups, or private content.

## Validation

```bash
pnpm install --frozen-lockfile
pnpm audit:dependencies
pnpm run ci
pnpm format:check
```

`pnpm run ci` performs the secret scan, infrastructure validation, lint,
typecheck, unit tests, production build, and browser-artifact audit. The build
requires the inert environment values supplied by CI or a valid local
`.env.local`.

Useful focused commands:

- `pnpm infra:synth -- --environment dev|prod` regenerates a deployable
  CloudFormation template and its inline Lambda bundle.
- `pnpm infra:validate` proves both committed templates match their generators
  and the security/resource contract.
- `pnpm backup:restore -- --input <backup> --manifest <report>` validates an AWS
  backup without contacting AWS.
- `pnpm check:secrets` and `pnpm check:browser-artifacts` enforce the repository
  and browser disclosure boundaries.

## Repository map

- `app/` — App Router pages, Cognito endpoints, and same-origin AWS API routes
- `components/` — the administrator UI
- `lib/` — authentication, domain rules, AWS adapters, and recovery logic
- `infra/` — CloudFormation generators, Lambda entry point, and deploy inputs
- `scripts/` — deterministic build, validation, and recovery commands
- `tests/` — cloud-free contract and behavior tests

## Canonical documentation

- [Architecture](docs/architecture.md)
- [Operations](docs/operations.md)
- [Migration history](docs/migration-history.md)
- [DynamoDB backup v2 schema](docs/schemas/dynamodb-backup-v2.schema.json)

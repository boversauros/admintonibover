# Admin web security and AWS cutover

This runbook is the security and rollback contract for issue #18. It covers the
Next.js boundary, exact browser origins, API Gateway and S3 CORS, Cognito
redirects, dependency scanning, and removal of legacy Supabase browser trust.
It does not create or deploy AWS resources. Infrastructure changes must use a
reviewed CloudFormation change set from the committed template.

## Deployment matrix

Every deployment selects exactly one data backend. Production must use the
enforced policy; report-only mode is an optional troubleshooting aid, not a
required soak period.

| Deployment                    | `ADMIN_DATA_BACKEND` | `ADMIN_CSP_MODE` | Browser network origins                           |
| ----------------------------- | -------------------- | ---------------- | ------------------------------------------------- |
| Local legacy rollback         | `supabase`           | `enforce`        | Exact local/Supabase HTTP(S) and Realtime origins |
| Local AWS verification        | `aws`                | `enforce`        | Exact private bucket HTTPS origin only            |
| Production before AWS cutover | `supabase`           | `enforce`        | Exact Supabase HTTPS and Realtime origins         |
| Production AWS                | `aws`                | `enforce`        | Exact private bucket HTTPS origin only            |

`ADMIN_CSP_MODE` defaults to `enforce`. `report-only` changes only the response
header name; it does not relax the generated policy. Use it temporarily if a
blocking violation needs diagnosis, then restore `enforce`. Do not add an origin
merely to silence an unexplained violation.

The AWS policy deliberately excludes the Supabase URL even if the two legacy
`NEXT_PUBLIC_SUPABASE_*` values remain configured for rollback. Switching the
server-only backend flag to `supabase` restores only that exact Supabase origin
and its matching WebSocket origin. Wildcards, paths, credentials, query strings,
fragments, and production HTTP origins are rejected.

The production CSP permits scripts and styles from `self`; inline script/style
support remains because it is required by the current Next.js rendering output
and component style attributes. `unsafe-eval` is added only outside production
for the development runtime. Images may use `self`, `data:`, `blob:`, and the
active backend's exact object origin. Connections may use `self` and only the
active backend. Forms submit only to `self`; frames, framed embedding, objects,
and inline script attributes are denied. Production also sends HSTS, while all
environments send opener, MIME-sniffing, referrer, permissions, and legacy
frame-denial headers.

## Environment boundary

| Setting                                            | Browser-visible                              | Purpose                                      |
| -------------------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                         | Yes, only in legacy mode                     | Exact legacy project origin                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`                    | Yes, only in legacy mode                     | Legacy public client key                     |
| `ADMIN_DATA_BACKEND`, `ADMIN_CSP_MODE`             | No                                           | Server-side cutover and policy controls      |
| `AWS_ADMIN_API_URL`, Cognito URLs/client ID/issuer | No                                           | Server-mediated BFF and login configuration  |
| `AWS_CONTENT_BUCKET_ORIGIN`                        | No environment access; origin appears in CSP | Exact non-secret S3 origin                   |
| `AWS_COGNITO_SESSION_SECRET`                       | Never                                        | Encrypts host-only session cookies           |
| AWS access/secret/session keys                     | Never                                        | Not used by the browser application          |
| `SUPABASE_SERVICE_ROLE_KEY` or secret key          | Never                                        | Server utility only; not required at runtime |

Only variables prefixed with `NEXT_PUBLIC_` may be embedded by Next.js. Never
rename an AWS, session, refresh-token, or privileged Supabase value with that
prefix. Production browser source maps stay disabled. CI places inert secret
canaries in the build environment and fails if their values, sensitive variable
markers, the Cognito refresh-cookie marker, or a browser source map appears in
the browser/runtime artifacts. A privileged Supabase key supplied to the build
is checked by its complete inert canary value; a generic key-format substring
is not evidence of a credential because the public Supabase client contains
format validation code.

## Exact CORS contracts

CloudFormation requires comma-delimited exact origins and exact callback/logout
URLs. There are no defaults, so every deployment must supply and review them.

| Surface           | Origins                        | Methods                                   | Request headers                                                                    | Response headers           | Credentials | Max age |
| ----------------- | ------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------- | ----------- | ------- |
| HTTP API          | Exact `AllowedOrigins` entries | `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS` | `authorization`, `content-type`, `idempotency-key`, `if-match`, `x-correlation-id` | `etag`, `x-correlation-id` | `false`     | 300 s   |
| Private S3 bucket | Exact `AllowedOrigins` entries | `GET`, `HEAD`, `PUT`                      | `content-type`, `x-amz-checksum-sha256`                                            | None                       | N/A         | 300 s   |

API credentials are intentionally disabled: the browser calls the same-origin
Next.js BFF, and the BFF adds the Cognito bearer token on its server-side API
Gateway request. S3 is private and uses short-lived presigned operations. Its
bucket uses bucket-owner-enforced object ownership and all four public-access
blocks; the bucket policy contains no anonymous allow and ACLs are disabled.
CORS never grants object access by itself.

## Cognito and request protection

The only accepted application redirects are an exact origin plus
`/auth/callback` and the same exact origin plus `/`. Application startup rejects
wildcards, credentials, queries, fragments, a wrong path, mismatched origins,
and HTTP/localhost in production. The CloudFormation parameter patterns reject
wildcards and wrong paths before an app-client update.

Cognito state, nonce, PKCE verifier, access token, ID token, and refresh token
remain in encrypted, host-only, HttpOnly, SameSite=Lax, high-priority cookies.
Production cookies are Secure; local HTTP is the only exception. Mutation and
logout routes require the exact configured `Origin`, and mutations require
same-origin fetch metadata plus JSON content type.

The Next.js BFF rejects declared or streamed JSON bodies above 256 KiB. The API
handler independently enforces the same 256 KiB ceiling. Image descriptors and
the browser upload path cap files at 5 MiB and require an allowed MIME type,
matching extension, base64 SHA-256 checksum, and the presigned checksum and
content-type headers. S3 remains encrypted and private.

## Automated verification

Use the pinned runtimes and the lockfile:

```bash
pnpm install --frozen-lockfile
pnpm audit:dependencies
pnpm run ci
cfn-lint infra/generated/dev-foundation.template.json
```

CI also runs GitHub's dependency review on pull requests and rejects newly
introduced high-severity runtime advisories. These checks and the repository's
existing GitHub Actions usage add no paid service or AWS resource.

## Essential manual QA

Use fictional content and redact account IDs, generated resource names, tokens,
cookies, authorization codes, presigned URLs, and private object keys from all
evidence.

1. With `ADMIN_CSP_MODE=enforce`, sign in from the configured admin origin, open
   and save one fictional post, upload one image, and sign out. Confirm the flow
   works and the browser console shows no blocking CSP violation.
2. Confirm one cross-origin mutation is rejected and one unsigned request to a
   private S3 object is denied. Record only the status/outcome in the PR.

The automated suite owns the exhaustive origin, method, header, callback,
framing, cookie, body-size, wildcard, and browser-artifact matrix. A live
report-only soak, every-combination CORS exercise, and rollback rehearsal are
optional for this hobby deployment.

## Cutover and rollback

The source-of-truth checkpoint is the first accepted AWS content mutation.
Before that timestamp, rollback is explicit and reversible: set
`ADMIN_DATA_BACKEND=supabase`, keep `ADMIN_CSP_MODE=enforce`, and redeploy the
reviewed build. The CSP automatically restores the exact legacy origins. Verify
one legacy read and write and confirm no AWS mutation occurred.

Record the checkpoint timestamp and deploy identifier in the private migration
log immediately before and after the first AWS mutation. After that checkpoint,
do not flip the flag back and resume Supabase writes: follow the architecture
ADR and migration recovery procedure so there is one source of truth. A code
rollback may redeploy the previous reviewed artifact, but must preserve the
selected data source.

If a Cognito or CORS update must be reverted, use a CloudFormation change set
with the prior exact parameter values. Stop if the change set replaces the user
pool, client, bucket, API, or administrator. Direct console edits, wildcard
origins, public ACLs/policies, and unreviewed preview callbacks are prohibited.

## Cost impact

This hardening creates no AWS resource. It changes response headers, validation,
the existing development template's CORS properties, CI checks, and dependency
versions. Runtime cost remains the existing request-based API Gateway, Lambda,
DynamoDB, Cognito, and private S3 usage.

# Admin web security

This runbook is the AWS-only browser security and rollback contract for issue
#18. It covers Next.js response headers, exact browser origins, API Gateway and
S3 CORS, Cognito redirects, dependency scanning, and browser-artifact checks.
Infrastructure changes require a reviewed CloudFormation change set.

## Deployment contract

Every deployment uses Cognito, the server-mediated AWS API, DynamoDB, and
private S3. `ADMIN_CSP_MODE` defaults to `enforce`; `report-only` changes only
the response header name and is a temporary diagnosis aid.

| Deployment            | `ADMIN_CSP_MODE` | Browser network origins                |
| --------------------- | ---------------- | -------------------------------------- |
| Local AWS development | `enforce`        | Exact private bucket HTTPS origin only |
| Fixed Preview         | `enforce`        | Exact private bucket HTTPS origin only |
| Production            | `enforce`        | Exact private bucket HTTPS origin only |

The CSP permits scripts and styles from `self`; inline script/style support is
required by the current Next.js output. `unsafe-eval` is development-only.
Images may use `self`, `data:`, `blob:`, and the exact configured private-bucket
origin. Connections may use `self` and that same origin. Forms submit only to
`self`; frames, framed embedding, objects, and inline script attributes are
denied. Production also sends HSTS. Wildcards, URL paths, credentials, query
strings, fragments, and production HTTP origins are rejected.

## Environment boundary

| Setting                        | Browser-visible      | Purpose                                        |
| ------------------------------ | -------------------- | ---------------------------------------------- |
| `ADMIN_CSP_MODE`               | No                   | Selects enforce or report-only response header |
| `AWS_ADMIN_API_URL`            | No                   | Server-mediated admin API origin               |
| Cognito URLs/client ID/issuer  | No                   | Server-mediated login configuration            |
| `AWS_CONTENT_BUCKET_ORIGIN`    | Only as a CSP origin | Exact non-secret S3 origin                     |
| `AWS_COGNITO_SESSION_SECRET`   | Never                | Encrypts host-only session cookies             |
| AWS access/secret/session keys | Never                | Not used by the browser application            |

No application secret may use a `NEXT_PUBLIC_` prefix. The production build
injects inert AWS canaries, then `pnpm check:browser-artifacts` rejects them from
browser/runtime artifacts. It also rejects production browser source maps and
server-only marker names.

## Cognito, API, and S3 origins

- Local callback: exact `http://localhost:3000/auth/callback`; logout:
  `http://localhost:3000/`.
- Preview and production callbacks use exact HTTPS origins and the same paths.
- Preview origins must be fixed and approved; ephemeral deployment URLs are not
  added to Cognito or CORS.
- API Gateway CORS accepts only the exact allowed origins, JSON content, and the
  documented admin methods/headers.
- S3 CORS accepts only exact allowed origins, checksum-bound `PUT`, and the
  required upload headers.
- The bucket remains private with public-access blocking, ownership enforcement,
  TLS-only policy, and server-side encryption.

## CI verification

Run:

```bash
pnpm check:secrets
pnpm infra:validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:browser-artifacts
pnpm audit:dependencies
```

The checks cover exact CSP origins, framing denial, Cognito cookie attributes,
same-origin mutations, body bounds, callback constraints, browser bundle
leakage, dependency advisories, and deterministic infrastructure synthesis.

## Manual QA

Use fictional content and redact account IDs, generated resource names, tokens,
cookies, authorization codes, presigned URLs, and private object keys.

1. Sign in from an allowed origin with CSP enforcement.
2. Open and save one fictional draft, upload one image, and sign out.
3. Confirm the browser console has no unexplained CSP violation.
4. Confirm a cross-origin mutation is rejected.
5. Confirm an unsigned private-S3 request is denied.

## Rollback

The retired service is not a rollback target. To roll back the web application:

1. stop AWS admin mutations and record the read-only start time;
2. export and validate an AWS backup;
3. take the admin offline or keep it read-only;
4. revert or repair the application while preserving the AWS data source; and
5. repeat read-only acceptance before restoring writes.

Revert Cognito, CORS, or infrastructure only through a reviewed CloudFormation
change set. Stop if it would replace or delete the user pool, client, bucket,
API, table, or administrator. Direct console edits, wildcard origins, public
bucket access, and unreviewed preview callbacks remain prohibited.

## Cost impact

This hardening creates no resource. Runtime cost remains request-based API
Gateway, Lambda, DynamoDB, Cognito, CloudWatch, and private S3 usage.

# AWS admin post mutations

This runbook verifies issue #15 after the frontend code is deployed against the
existing authenticated development API. It covers post create, update, delete,
publication, bulk-publication confirmation, and private image replacement.

The change adds no AWS resource, IAM permission, database schema, bucket rule,
or environment variable. The existing `ADMIN_DATA_BACKEND` flag must select
exactly one adapter for every request; the application must never dual-write.

## Automated baseline

Use the pinned Node.js and pnpm versions. The full suite is cloud-free and uses
only inert Supabase placeholders:

```bash
pnpm install --frozen-lockfile
NEXT_PUBLIC_SUPABASE_URL=https://ci.invalid \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder \
  pnpm run ci
```

The issue-specific tests must prove that:

- a canonical AWS post round trip retains translations, slugs, category,
  keywords, references, dates, publication state, image keys, and migration
  metadata;
- a new post is created as a draft with null images before media work starts;
- transient retries reuse one idempotency key;
- stale versions return a typed conflict without retrying the write;
- exact draft counts paginate without credentials in the browser;
- the Supabase rollback flag rejects AWS mutation proxy calls before upstream
  access; and
- image replacement follows presign, private upload, then confirmation, with no
  frontend image deletion.

## Open the AWS admin safely

Use the existing ignored environment configuration documented in the README.
Set `ADMIN_DATA_BACKEND=aws`, restart the application, and sign in through the
existing Cognito flow. Do not paste environment values, tokens, generated
resource names, account details, or presigned URLs into an issue, PR, log, or
screenshot.

Before mutating anything, filter the list to drafts and verify that the 100
imported posts are still drafts. Opening the bulk-publication confirmation may
be used to verify the exact count, but **cancel it**. Never execute bulk
publication against the imported acceptance dataset.

## Manual acceptance

Use only a new fictional post for destructive checks.

1. Create a draft containing distinct Catalan and English titles, content,
   slugs, keywords, references, category, sort order, and one valid selected
   image. After the text save completes, block or interrupt only the S3 upload.
   Verify the URL has changed to the saved article's edit URL, it appears once
   in the list, every text field reopens unchanged, both stored image roles are
   still null, and the article stays a draft. Keep Network details out of
   screenshots because the request contains a presigned URL.
2. Retry the image, then replace it once more. Verify the old preview remains
   attached until backend confirmation succeeds. If private S3 inspection is
   required, keep keys and console evidence private.
3. Open the same fictional post in two tabs. Save a text change in the first,
   then save a different change in the second. Verify the second tab shows the
   conflict dialog, can copy the complete recovery JSON, and can reload the
   winning server version. Confirm neither version was silently overwritten.
4. Double-click save and repeat one request after a simulated transient network
   failure. Verify the list contains only one created post and each destructive
   operation happened once.
5. Toggle the fictional post between draft and published and verify both list
   and edit views refresh. A new post whose publication toggle is selected must
   remain a draft until its text and selected images finish successfully.
6. Choose delete for the fictional post. Verify the dialog says exactly one
   article, cancellation changes nothing, confirmation deletes it once, and any
   image-cleanup warning remains retryable.
7. Choose **Publish all** after deleting the fictional post. Verify
   the confirmation shows exactly 100 affected drafts, then cancel. Automated
   backend and frontend tests provide execution evidence without publishing the
   imported drafts.

## Rollback isolation

Set `ADMIN_DATA_BACKEND=supabase`, restart or redeploy, and repeat one
non-production Supabase create/edit/delete cycle. Verify there are no browser
AWS mutation requests and no corresponding AWS API/Lambda/DynamoDB mutation
events. Switch back to `aws` and verify the same operation does not create or
change a Supabase row.

Rollback requires no data copy or resource deletion. Keep the AWS data in
place, select the Supabase adapter, and deploy the previously reviewed
application version if code rollback is also required.

## Security, cost, and PR evidence

Authentication remains server-mediated through the existing Cognito session.
The proxy retains same-origin mutation checks, JSON and body-size validation,
correlation IDs, conditional versions, and idempotency headers. Browser requests
must never contain AWS credentials or Cognito bearer tokens.

There is no infrastructure cost delta. Runtime cost remains the existing
request-based API Gateway, Lambda, on-demand DynamoDB, and private S3 usage.

Attach the automated command results, the manual checklist, rollback-isolation
result, security and cost statements, and redacted before/after UI screenshots
to the draft PR. Do not attach DevTools Network captures, response bodies,
tokens, post content, private identifiers, or presigned URLs.

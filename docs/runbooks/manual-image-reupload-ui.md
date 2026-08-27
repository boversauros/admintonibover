# Manual image inventory and re-upload workflow

This runbook deploys and verifies
[issue #16](https://github.com/boversauros/admintonibover/issues/16). It adds
an exact global inventory of post image completeness, combined list filters,
and independent repair controls for the main image and thumbnail.

The workflow reuses the private S3 upload contract from issue #11 and the
admin mutation contract from issue #15. It does not make S3 public, introduce
browser AWS credentials, change the public site, transform images, or mix the
AWS and Supabase adapters.

## Fixed behavior

Every post belongs to exactly one image state:

| State               | Main image | Thumbnail |
| ------------------- | ---------- | --------- |
| `complete`          | present    | present   |
| `missing-main`      | missing    | present   |
| `missing-thumbnail` | present    | missing   |
| `missing-both`      | missing    | missing   |

The four inventory counts cover all posts, regardless of the current search,
category, publication, image-status filter, or page. Selecting an inventory
state adds it to the existing filters; it does not replace them.

Main and thumbnail repair are separate operations. A selected browser `File`
is UI-only state and is not part of the article form payload. The stored image
remains attached until the replacement upload is confirmed. A failed or
cancelled upload retains the selected file for a same-tab retry. Browsers do
not permit restoring a selected local file after a page reload, so a reload
requires selecting it again.

Accepted files are JPEG, PNG, WebP, and AVIF from 1 byte through 5 MiB. Upload
progress covers the direct private S3 `PUT`; cancellation aborts the active
request. Removing one role uses the current post version and cannot alter the
other role.

## Automated baseline

Use the pinned Node.js and pnpm versions:

```bash
pnpm install --frozen-lockfile
pnpm lambda:build
pnpm infra:synth
NEXT_PUBLIC_SUPABASE_URL=https://ci.invalid \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder \
  pnpm run ci
shasum -a 256 infra/generated/dev-foundation.template.json
```

The synthesis must contain 36 resources across the existing 16 resource
types. It has 21 `AWS::ApiGatewayV2::Route` resources and still exactly one
Lambda permission, Lambda function, IAM role, DynamoDB table, and S3 bucket.

The issue-specific tests must prove:

- the four image states are mutually exclusive and their counts are exact;
- image filtering composes with list pagination and legacy summaries hydrate
  their missing main-image field from the canonical aggregate;
- detaching one role is version-bound, idempotent, and preserves the other;
- cleanup can be retried with the same idempotency key after the metadata
  transaction succeeds;
- replacement follows presign, upload, and confirmation order, and a cancelled
  or failed upload never confirms or deletes the current image; and
- the browser AWS adapter uses same-origin authenticated routes while the
  Supabase rollback adapter remains isolated.

## Review and deploy the CloudFormation change

Follow the private template staging and account/Region checks in
[Private S3 image repair](s3-presigned-image-repair.md). Stage this template
under a `backups/cloudformation/issue-16/` key, calculate its hash locally and
again in CloudShell, and keep the bucket, key, URL, hash, account details, and
command output private.

Create a change set for the existing `admintonibover-dev` stack named
`issue-16-manual-image-reupload-ui`. Before execution, its direct changes must
be limited to:

- **Add** `PostImageDetachRoute`, an authenticated
  `DELETE /posts/{id}/images/{role}` API Gateway route; and
- **Modify without replacement** `FoundationFunction` to deploy the reviewed
  Lambda bundle.

Dependency-driven stage changes are acceptable. There must be no deletion,
replacement, new IAM action or role, second Lambda permission, public S3
setting, new table, bucket, API, function, VPC, NAT Gateway, KMS key, queue,
schedule, alarm, dashboard, provisioned capacity, or reserved concurrency.

After the stack reaches `UPDATE_COMPLETE`, delete only the exact staged
template object as described in the linked runbook. In API Gateway, verify the
new route uses the existing JWT authorizer, `admintonibover-api/admin` scope,
shared integration, and existing stage throttle. In IAM and S3, verify there
is no policy or configuration change.

## Manual acceptance

Use only a fictional development post and fictional images. Keep DevTools
Network details out of screenshots because signed upload and preview URLs are
temporary credentials.

### Inventory and combined filters

1. Start with `ADMIN_DATA_BACKEND=aws`, sign in, and record the four displayed
   counts. Confirm they sum to the known total number of posts.
2. Select each inventory tile in turn. Confirm every displayed card has the
   matching text status and that no broken image URL is rendered for a missing
   thumbnail.
3. Combine one image state with title search, category, publication state, and
   both sort directions. Confirm all filters apply together, pagination resets
   to the first page, and clearing the image filter leaves the other filters
   intact.
4. Open a matching fictional post, repair one role, and return to the list.
   Confirm it moves to the correct mutually exclusive state and the global
   counts still sum to the total.

### Independent replacement, failure, and removal

1. In the fictional post, select a valid main image. Confirm the candidate is
   labelled as pending and the stored preview remains described as attached
   until confirmation.
2. Start the upload, confirm visible numeric progress, then cancel it. Confirm
   the stored main image is unchanged and the selected file remains available
   for retry in the current tab.
3. Retry and confirm the replacement. Verify its private preview appears and
   the thumbnail is unchanged.
4. Repeat for the thumbnail while leaving the main image unchanged.
5. Simulate an offline or rejected upload. Confirm an actionable error and
   retry control appear, the selected file remains, and the prior stored image
   remains canonical.
6. Confirm removal of one role. Verify the article moves to the corresponding
   missing state, the other role remains visible, and any cleanup-pending
   warning is explicit and safe to retry.
7. Open the post in two tabs. Change an image in the first and attempt a
   different image mutation in the stale second tab. Confirm the second action
   receives the version conflict and does not overwrite the winner.

### Accessibility and responsive checks

1. Complete selection, confirmation, cancellation, retry, and removal with the
   keyboard only. Confirm focus enters each dialog, remains trapped, closes
   with Escape, and returns to the invoking control.
2. With a screen reader, confirm the four filter buttons expose pressed state,
   missing statuses are announced in text rather than color alone, upload
   progress and success/error messages are announced, and both file controls
   have distinct labels and help text.
3. At narrow mobile, tablet, and desktop widths, confirm inventory tiles,
   filters, cards, previews, and actions do not overlap or require horizontal
   page scrolling.

## Rollback isolation, security, and cost

Set `ADMIN_DATA_BACKEND=supabase`, restart, and perform one non-production list
and image-edit cycle. Confirm the inventory derives from Supabase metadata and
there are no AWS admin API, Lambda, DynamoDB, or S3 requests. Switch back to
AWS and confirm the same operation does not change a Supabase row or object.

The browser receives neither AWS credentials nor a Cognito bearer token. It
uses the existing same-origin session proxy; direct S3 access is limited to
the short-lived signed object request. Logs, screenshots, issue comments, and
PR evidence must exclude tokens, signed URLs, response bodies, private keys,
resource identifiers, and post content.

The route and UI add no fixed-cost service or provisioned capacity. Runtime
cost remains request-based API Gateway, Lambda, on-demand DynamoDB, and private
S3 usage. Code rollback can deploy the previous reviewed version. The route
may then be removed through a reviewed CloudFormation change set; do not edit
API Gateway manually and do not delete the shared table, bucket, or repaired
images.

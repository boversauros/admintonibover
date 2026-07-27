# ADR 0001: Admin-only AWS data and security contract

- Status: Accepted
- Date: 2026-07-25
- Decision owner: project owner
- Related issues:
  [#2](https://github.com/boversauros/admintonibover/issues/2),
  [#3](https://github.com/boversauros/admintonibover/issues/3), and
  [#4](https://github.com/boversauros/admintonibover/issues/4)

Acceptance of the pull request containing this ADR changes the status to
Accepted. Changes to an accepted decision require a superseding ADR or a
separately approved amendment.

## Context

The current Next.js administration application stores authentication, posts,
translations, taxonomy, keywords, references, and image metadata in Supabase.
The migration replaces the admin runtime with a small AWS serverless backend
without changing the public site.

The known source backup contains 100 posts, 200 translations, 3 categories, 94
keywords, 1,321 references, and image metadata without image binaries. This is a
small, single-administrator workload. The design optimizes for correctness,
recoverability, security, and a low idle cost rather than for unneeded scale.

## Decision

### Boundary

- Next.js remains the administration UI.
- Astro/public-site integration, public read APIs, and Vercel deploy hooks are
  deferred. This ADR contains no Astro implementation decision.
- The AWS boundary is one isolated stack per AWS environment in `eu-west-1`.
  Each stack has one Cognito User Pool, one API Gateway HTTP API, one standard
  Node.js Lambda, one DynamoDB table, one private S3 bucket, and one CloudWatch
  log group.
- No unauthenticated admin data route exists. API Gateway applies the JWT
  authorizer to every application route. Gateway-managed CORS preflight, if
  enabled, returns no application data.

### Environments, configuration, and infrastructure ownership

There are three runtime environments:

| Environment    | Backend behavior                                                                                                                                             | AWS isolation                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Local          | Uses the Supabase adapter by default until its AWS adapter is explicitly selected for development testing. Tests use fakes and require no cloud credentials. | No local AWS application resources. Explicit opt-in may target only the dev stack. |
| Dev AWS        | Uses the dev Cognito, HTTP API, Lambda, table, bucket, and exact local/dev admin origins.                                                                    | Separate dev resource names and data. Safe teardown is documented.                 |
| Production AWS | Is deployed and verified while the application flag still selects Supabase. It becomes active only at the approved cutover.                                  | Separate production resources, data, origins, and deletion protection.             |

One server-only feature flag, `ADMIN_DATA_BACKEND=supabase|aws`, selects the
complete auth/data/storage adapter. It must not mix writes between backends.
Public code may receive non-secret identifiers such as the API URL, User Pool
ID, and app-client ID, but the backend flag and session configuration remain
server controlled.

Infrastructure as code is the source of truth. The framework selected in issue
#7 must synthesize a reviewable CloudFormation change set. Console-created
application resources and console drift are forbidden; console use is limited
to verification and the explicitly documented creation of the one administrator
through Cognito administrative operations. Passwords, MFA seeds, session
secrets, account identifiers, and credentials never enter IaC, source control,
outputs, or logs.

All supported resources receive the tags from the
[AWS account guardrails](../runbooks/aws-account-guardrails.md):
`Project=admintonibover`, `Environment=dev|prod`, `ManagedBy=iac`, and
`Owner=orio`.

### Authentication and authorization

- Cognito self-service sign-up is disabled (`AllowAdminCreateUserOnly`).
- Exactly one enabled administrator is provisioned by the operator workflow in
  the [issue #8 runbook](../runbooks/cognito-single-administrator.md). Adding
  another administrator requires an access-model review.
- Application MFA is disabled to keep the single administrator's sign-in
  accessible: normal login is email plus password, and the verified email is
  used for invitation and password recovery codes. AWS root and operator IAM
  MFA remain mandatory and are a separate account-level control.
- The browser app uses a public Cognito app client without a client secret and
  Authorization Code with PKCE. Callback and logout URLs are exact per
  environment.
- Tokens are never stored in `localStorage` or `sessionStorage`. Refresh/session
  material is held in a `Secure`, `HttpOnly`, `SameSite` cookie managed by
  Next.js. A short-lived access token may exist only in memory for a direct API
  call.
- The HTTP API JWT authorizer validates the exact issuer and app-client
  audience. Routes require an admin scope. Lambda also rejects a token with the
  wrong issuer, audience/client ID, `token_use`, or administrator claim as
  defense in depth.
- The single administrator is authorization state, not post ownership. The
  legacy Supabase `user_id` is not copied into each aggregate.

### HTTP API and Lambda

API Gateway is an **HTTP API**, not a REST API. Requests and responses use a
versioned JSON contract, bounded bodies, opaque pagination cursors, correlation
IDs, and stable error codes. Mutations accept an `Idempotency-Key`. Stale
versions return `409 Conflict`; validation and size failures return `400` or
`413`; throttling returns `429`.

There is one standard Node.js Lambda per AWS environment. It:

- uses the current IaC-supported Node.js LTS and ARM64 when dependency
  compatibility is verified;
- uses the account's unreserved concurrency, with no reserved or provisioned
  concurrency and no VPC;
- has bounded memory, timeout, and request size;
- receives no secret in an environment variable;
- can access only its exact table, bucket prefixes, and log group; and
- logs identifiers and correlation IDs, never tokens, post bodies, presigned
  URLs, or personal backup content.

API stage throttling targets 2 requests per second with burst 4 unless later
tests justify a separately reviewed change.

The development account starts with AWS's reduced new-account Lambda
concurrency quota. Reserving two executions would reduce its unreserved pool
below the service minimum and make the stack undeployable. The authenticated
API stage throttle is therefore the workload-level concurrency guard until AWS
raises the account quota and a separately reviewed change introduces a
function-level reservation.

### DynamoDB table

The table has string partition and sort keys named `PK` and `SK`, uses the
Standard table class in on-demand capacity mode, and has no GSI or LSI. There is
one table per AWS environment, not one table per entity.

#### Item types

| Item               | Key                                                           | Purpose                                                                                                                                |
| ------------------ | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Post aggregate     | `PK=POST#<id>`, `SK=POST#<id>`                                | Canonical post, category, bilingual translations, keywords, references or segment metadata, image keys, timestamps, and version.       |
| Reference segment  | `PK=POST#<id>`, `SK=REFS#<language>#<zero-padded-sequence>`   | Fallback reference arrays when an inline aggregate would reach the size guard.                                                         |
| Post list summary  | `PK=POSTS`, `SK=ORDER#<sortable-order>#DATE#<date>#POST#<id>` | Bounded fields required for list, title search, status/category filtering, ascending/descending order, counts, and pagination.         |
| Slug lock          | `PK=SLUG#<language>#<normalized-slug>`, `SK=LOCK`             | Maps one language/slug pair to one post ID.                                                                                            |
| Category catalog   | `PK=LOOKUP#CATEGORIES`, `SK=CATALOG`                          | Preserved category IDs, slugs, and translated display names.                                                                           |
| Keyword catalog    | `PK=LOOKUP#KEYWORDS#<language>`, `SK=CATALOG`                 | Preserved keyword IDs and suggestion values. Detaching a keyword does not remove its historical suggestion, matching current behavior. |
| Data revision      | `PK=SYSTEM`, `SK=REVISION`                                    | Monotonic revision incremented by every content mutation so a backup can detect concurrent changes.                                    |
| Idempotency record | `PK=REQUEST#<admin-subject-hash>`, `SK=<idempotency-key>`     | Short-lived mutation result used to make a retry safe. It has a bounded TTL and contains no token or content body.                     |

The post list summary intentionally duplicates only the fields required by the
list screen. It never contains full content or references. A fixed-width,
lexicographically sortable representation of validated `sortOrder` is used in
its sort key. Changing `sortOrder` deletes the old summary and creates the new
one in the same transaction.

A representative aggregate has this logical shape:

```json
{
  "PK": "POST#<legacy-post-id>",
  "SK": "POST#<legacy-post-id>",
  "entityType": "POST",
  "schemaVersion": 1,
  "id": "<legacy-post-id>",
  "category": {
    "id": "<legacy-category-id>",
    "slug": "<category-slug>"
  },
  "sortOrder": 0,
  "published": false,
  "date": "YYYY-MM-DD",
  "author": "<author>",
  "createdAt": "<UTC ISO-8601>",
  "updatedAt": "<UTC ISO-8601>",
  "translations": {
    "ca": {
      "legacyId": "<legacy-translation-id>",
      "title": "<title>",
      "content": "<markdown>",
      "slug": "<normalized-slug>",
      "keywords": [
        {
          "legacyId": "<legacy-keyword-id>",
          "value": "<keyword>"
        }
      ],
      "references": [
        {
          "id": "<legacy-reference-id>",
          "type": "text",
          "reference": "<source>",
          "blockquote": "<optional quote>",
          "sortOrder": 0
        }
      ],
      "translationStatus": "complete"
    },
    "en": {
      "legacyId": "<legacy-translation-id>",
      "title": "<title>",
      "content": "<markdown>",
      "slug": "<normalized-slug>",
      "keywords": [],
      "references": [],
      "translationStatus": "complete"
    }
  },
  "referenceStorage": "inline",
  "mainImage": null,
  "thumbImage": null,
  "version": 1,
  "migration": {
    "source": "supabase-backup",
    "runId": "<migration-run-id>"
  }
}
```

New domain IDs are opaque application-generated IDs. Imported IDs are preserved
as strings without renumbering. The known incomplete English translation for
post 64 is imported with `translationStatus=incomplete`; its empty slug creates
no slug lock. Normal create/update validation requires non-empty slugs for both
languages.

#### Size guard and segmented-reference fallback

DynamoDB rejects items above 400 KiB. Before any write, the validator marshals
the exact item shape and calculates the documented DynamoDB size: UTF-8 bytes
for every attribute name and string value, number/Boolean/null sizes, and
map/list/set overhead. Keys and metadata count. An estimated size at or above
350 KiB (358,400 bytes) fails the inline form before an AWS request.

If only the inline references cause that failure, references move to ordered
segment items under the same `POST#<id>` partition. The aggregate changes to
`referenceStorage=segmented` and records the segment count for each language.
Segments target 100 KiB and each is independently required to remain below the
350 KiB guard. A strong read reassembles them and verifies that every segment
has the aggregate's version.

The aggregate, all new segments, deleted old segments, list summary, slug locks,
catalog changes, data revision, and idempotency record remain one
`TransactWriteItems` operation. If the base aggregate without references still
reaches 350 KiB, or the segmented transaction would exceed DynamoDB's 100-action
or 4 MiB transaction limit, the operation fails without writes and requires a
new ADR. Content is not silently moved to S3.

The migration validator tries the inline and segmented encodings during dry run
and aborts before all writes if either contract cannot represent a post.

#### Slug uniqueness, versioning, and atomicity

The normalized lock key is the authority for slug uniqueness. Client-side slug
generation and availability checks are only convenience.

- Create conditionally puts the aggregate and both non-empty language locks.
- A rename conditionally puts the new lock, deletes the old lock only when it
  maps to the same post, and updates the aggregate in one transaction.
- Delete removes the aggregate, summary, all reference segments, and locks only
  when the locks map to the deleted post.
- Every update checks `version=<expectedVersion>`, increments it by one, and
  updates the list summary and `SYSTEM/REVISION` in the same transaction.
- A mutation retry uses both the idempotency record and DynamoDB's transaction
  client-request token. It cannot create a duplicate post or repeat a bulk
  result.

The server owns `updatedAt`. Imported `createdAt` and `updatedAt` values are
normalized to UTC ISO-8601 and preserved. `date` remains a calendar date in
`YYYY-MM-DD` form because it is not a timestamp.

#### Access patterns and consistency

Normal admin operations use `GetItem` or `Query`; they do not scan the table.
Every query is paginated even for the current small dataset.

| Access pattern          | Keys and operation                                                                                                                                                                       | Consistency and transaction requirement                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| List posts              | Query `PK=POSTS`; order follows the encoded `SK`. Apply bounded title/status/category filters to summary items and return an opaque cursor.                                              | Strongly consistent. No aggregate read is needed.                                                                                   |
| Get one post            | Get the aggregate at `POST#<id>/POST#<id>`; query its partition for `REFS#...` only when segmented.                                                                                      | Strongly consistent. Segment versions must match the aggregate.                                                                     |
| Get/edit by slug        | Get `SLUG#<language>#<normalized-slug>/LOCK`, then get the mapped post.                                                                                                                  | Both reads are strong. A missing lock is `404`.                                                                                     |
| Create                  | Put aggregate, summary, non-empty slug locks, new catalog values, revision, and idempotency record.                                                                                      | One transaction. Aggregate/locks use `attribute_not_exists`; version starts at `1`.                                                 |
| Update or rename slug   | Read current post; conditionally update aggregate; replace the summary if its key changes; acquire new lock before releasing the old lock; update segments/catalog/revision/idempotency. | One transaction with the expected numeric version. A lock or version conflict returns `409`.                                        |
| Delete                  | Read current post, then delete aggregate, summary, segments, and owned locks; update revision/idempotency.                                                                               | One transaction with expected version. Image object deletion occurs only afterward and is retryable.                                |
| Publish/unpublish       | Update `published`, version, timestamp, summary, revision, and idempotency record.                                                                                                       | One transaction with expected version. Bulk publish executes this bounded transaction once per post and records resumable progress. |
| List categories         | Get `LOOKUP#CATEGORIES/CATALOG`.                                                                                                                                                         | Strongly consistent. Category writes are admin API operations and conditionally replace the catalog version.                        |
| List keywords           | Get `LOOKUP#KEYWORDS#<language>/CATALOG`.                                                                                                                                                | Strongly consistent. New values join the post transaction; detach intentionally retains suggestions.                                |
| Generate backup         | Read `SYSTEM/REVISION`, page through catalogs and `PK=POSTS`, strongly read each aggregate/segments, then read the revision again.                                                       | If revisions differ, discard and retry a bounded number of times. The backup is accepted only when both revisions match.            |
| Attach/detach image key | After upload confirmation, conditionally replace the selected image object in the aggregate and update summary/version/revision/idempotency.                                             | One transaction with expected version. S3 cleanup follows successful DynamoDB commit.                                               |

### Current data-field mapping

Every durable current field is either represented or explicitly deferred:

| Current source field                                             | Target or decision                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `posts.id`                                                       | Aggregate `id` and both post keys; the legacy value is preserved as a string.                                                                                                                                                                             |
| `posts.user_id`                                                  | Deferred. Authorization comes from the single Cognito administrator; the source UUID is recorded only in the private migration manifest if reconciliation needs it.                                                                                       |
| `posts.category_id`                                              | `category.id`; the catalog preserves the same legacy category ID.                                                                                                                                                                                         |
| `posts.sort_order`                                               | `sortOrder` and the sortable post-summary key.                                                                                                                                                                                                            |
| `posts.is_published`                                             | `published`.                                                                                                                                                                                                                                              |
| `posts.date`                                                     | `date` as the original `YYYY-MM-DD` calendar date.                                                                                                                                                                                                        |
| `posts.author`                                                   | `author`.                                                                                                                                                                                                                                                 |
| `posts.created_at`, `posts.updated_at`                           | `createdAt`, `updatedAt` as UTC ISO-8601. The server owns later `updatedAt` changes.                                                                                                                                                                      |
| `posts.image_id`, `posts.thumbnail_id`                           | Migration writes `mainImage=null` and `thumbImage=null`. Legacy IDs remain only in the private migration manifest.                                                                                                                                        |
| `post_translations.id`                                           | `translations.<language>.legacyId`.                                                                                                                                                                                                                       |
| `post_translations.post_id`                                      | Represented by nesting under the aggregate; the post ID is not duplicated in each translation.                                                                                                                                                            |
| `post_translations.language_id`                                  | Mapped deterministically to `ca` or `en`; the legacy ID is retained in migration/catalog metadata.                                                                                                                                                        |
| `post_translations.title`, `content`, `slug`                     | `translations.<language>.title`, `content`, and `slug`.                                                                                                                                                                                                   |
| `keywords.id`, `keyword`, `language_id`                          | Translation keyword entries and the language catalog preserve legacy ID, value, and language.                                                                                                                                                             |
| `post_keywords.post_translation_id`, `keyword_id`                | Represented by keyword nesting under its translation.                                                                                                                                                                                                     |
| `post_references.id`                                             | Reference `id`; legacy values are preserved.                                                                                                                                                                                                              |
| `post_references.post_translation_id`                            | Represented by nesting in the language translation or its language segment.                                                                                                                                                                               |
| `post_references.type`, `reference`, `blockquote`, `sort_order`  | Reference `type`, `reference`, `blockquote`, and `sortOrder`.                                                                                                                                                                                             |
| `categories.id`, `slug`                                          | Category catalog `id`, `slug`; the aggregate embeds the selected ID and slug.                                                                                                                                                                             |
| `category_translations.id`, `category_id`, `language_id`, `name` | Category catalog entries preserve translation IDs and bilingual names; parent/language relationships are represented by nesting.                                                                                                                          |
| `languages.id`, `code`, `name`                                   | `ca` and `en` are fixed domain values; source IDs and names are retained in migration/catalog metadata.                                                                                                                                                   |
| `images.id`, `url`, `title`, `alt`, `created_at`, `updated_at`   | No image row or URL is migrated because no binary is available. Useful legacy metadata stays only in the private manifest. A future image stores `key`, `title`, `alt`, `contentType`, `sizeBytes`, and upload timestamps in `mainImage` or `thumbImage`. |
| `StoredPost.thumbnail`, `StoredPost.image`                       | Response-only presentation objects derived from image keys. Signed URLs are never persisted.                                                                                                                                                              |
| `thumbnail_file`, `main_image_file`                              | Browser-only `File` values used by the presigned upload protocol; never stored in DynamoDB or logs.                                                                                                                                                       |
| `thumbnail_alt`, `main_image_alt`                                | `thumbImage.alt` and `mainImage.alt` after a confirmed upload.                                                                                                                                                                                            |
| Translation `language`                                           | The `ca` or `en` map key.                                                                                                                                                                                                                                 |
| Reference form IDs such as `ref-<timestamp>`                     | Replaced with an opaque ID at create time; imported numeric reference IDs remain unchanged.                                                                                                                                                               |

The API/domain adapter may present the current snake-case `StoredPost` shape
while the feature flag is in use. The canonical AWS contract uses the camel-case
fields above; conversion is explicit and tested.

### UI action to authenticated operation mapping

All server-affecting admin actions use an authenticated operation. Purely local
editing actions are explicitly identified:

| Current UI action                                                   | Target operation                                                                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in with email and password                                     | Cognito Authorization Code with PKCE; self-sign-up is unavailable and verified email is used for password recovery.                                        |
| Load, search, filter, sort, or page the post list                   | `GET /posts` with bounded `limit`, cursor, query, status, category, and sort parameters.                                                                   |
| Open the create screen                                              | Local navigation; form metadata comes from authenticated `GET /categories`, `GET /keywords?language=...`, and list metadata for the default order.         |
| Open edit                                                           | Authenticated `GET /posts/{id}`.                                                                                                                           |
| Open/edit by a language slug                                        | Authenticated `GET /posts/by-slug/{language}/{slug}`; the API resolves the strong slug lock before loading the post.                                       |
| Resolve/check a generated slug                                      | Authenticated `POST /slugs/resolve`; advisory only. Create/update lock conditions remain authoritative.                                                    |
| Create post                                                         | Authenticated `POST /posts` with `Idempotency-Key`.                                                                                                        |
| Save edited fields, translations, keywords, or references           | Authenticated `PUT /posts/{id}` with `If-Match: "<version>"` and `Idempotency-Key`.                                                                        |
| Add/remove a reference, keyword, or change language tab before save | Local form state; the next authenticated create/update persists the complete aggregate.                                                                    |
| Publish/unpublish in the editor                                     | Authenticated `PATCH /posts/{id}/publication` with expected version and idempotency key, or the same state in the complete update.                         |
| Publish all drafts                                                  | Authenticated `POST /posts/actions/publish-all` with exact confirmation count and `Idempotency-Key`; the response supports safe resume and reconciliation. |
| Delete post                                                         | Authenticated `DELETE /posts/{id}` with expected version and `Idempotency-Key`.                                                                            |
| Upload or replace main/thumbnail image                              | Authenticated `POST /images/presign-put`, direct presigned S3 PUT, then authenticated `POST /posts/{id}/images/{role}/confirm` with expected version.      |
| Update image alt/title                                              | Authenticated conditional post update; no public image-metadata route.                                                                                     |
| Detach image                                                        | Authenticated `DELETE /posts/{id}/images/{role}` with expected version; old object deletion follows the commit.                                            |
| Preview/download a private image                                    | Authenticated `POST /images/presign-get`; returned URL is short-lived and never stored.                                                                    |
| Download backup                                                     | Authenticated `POST /backups`; after revision/checksum validation it returns a short-lived GET for a versioned JSON backup in the private backup prefix.   |
| Log out                                                             | Cognito logout/revocation plus deletion of local server-managed session cookies.                                                                           |

### S3 image and backup contract

The single environment bucket is private:

- all four S3 Block Public Access settings are on;
- Object Ownership is bucket-owner enforced, so ACLs are disabled;
- default encryption is SSE-S3; no customer-managed KMS key is created;
- the bucket policy denies non-TLS access;
- versioning is disabled initially to avoid hidden retained-object cost;
- incomplete/unconfirmed temporary uploads expire through a lifecycle rule; and
- backup objects use a bounded retention rule documented by the backup issue.

Migration does not contact Supabase Storage and does not download an image.
Every imported post has `mainImage=null` and `thumbImage=null`.

For upload, Lambda validates the post ID, role (`main|thumb`), allowlisted MIME
type (`image/jpeg`, `image/png`, `image/webp`, `image/avif`), normalized
extension, and declared size no greater than 5 MiB. It chooses an opaque
temporary key and returns a presigned PUT valid for no more than five minutes
with the required content type/checksum headers signed. The browser cannot
choose a bucket, ACL, encryption mode, or arbitrary prefix.

Confirmation performs `HeadObject`, verifies actual size/type/checksum and
ownership, and then conditionally stores only the final object key and metadata
in the post. The old owned object is deleted only after that DynamoDB update
succeeds. A failed delete is observable and retryable. A detach follows the same
commit-before-delete order.

Presigned GETs are also valid for no more than five minutes and are restricted
to an owned object key or generated backup key. Object keys are stored
separately from presentation URLs, so a bucket/domain/delivery change never
rewrites post content.

S3 CORS contains only the exact origins supplied to IaC: the local development
origin and the exact dev/production admin HTTPS origins. It allows only the
methods and signed headers used by PUT/HEAD/GET. There is no wildcard production
origin, public ACL, or public bucket policy.

## Migration, cutover, and rollback

1. Validate and hash the source backup without contacting Supabase or AWS.
2. Dry-run the transformation, including every field mapping, slug lock,
   incomplete-translation warning, size estimate, segment, count, and content
   hash.
3. Import idempotently into an empty dev table, reconcile, and exercise the dev
   admin.
4. Deploy the same reviewed IaC to production with
   `ADMIN_DATA_BACKEND=supabase`.
5. Freeze Supabase writes, take/approve the final source backup, import it, and
   reconcile before enabling AWS reads.
6. Before the first AWS mutation, rollback is a feature-flag change to Supabase
   because both sources remain at the same frozen checkpoint.
7. Record the first accepted AWS mutation as the source-of-truth timestamp.
   After it, never restore Supabase writes by flag alone. Make the AWS admin
   read-only, export and verify an AWS backup, repair/restore AWS, or run a
   separately approved AWS-to-Supabase reconciliation before changing the
   backend.
8. Keep Supabase intact for the accepted rollback window. Retirement is a
   separate, explicit destructive action.

No dual write is implemented. A partially completed import is rolled back only
by the migration run ID and exact target confirmation; it never uses a
table-wide or wildcard delete.

## Cost

### Account eligibility versus standard pricing

The public guardrails runbook attests that the account plan and promotional
credit status were reviewed, that the current charge baseline was USD 0, and
that promotional-credit eligibility influenced the accepted account setup.
Exact plan, balance, and expiry remain private. They must be rechecked before
each deployment and are not an architectural dependency.

The standard estimate below deliberately assumes no promotional credit and does
not assume an expiring new-customer request offer:

- API Gateway's advertised one million HTTP API calls per month is available
  only to eligible new customers and is time-limited (advertised for up to 12
  months). Standard HTTP API calls remain pay-as-you-go after eligibility or
  limits end.
- Cognito Lite/Essentials currently advertises an ongoing free allowance of
  10,000 direct/social monthly active users; one administrator is inside it.
  Optional SMS/email delivery and advanced protection can still be billable and
  are excluded.
- Lambda currently advertises an ongoing monthly allowance of one million
  requests and 400,000 GB-seconds. The estimate still prices Lambda at standard
  x86 rates to leave margin.
- DynamoDB's 25 GB storage allowance applies to Standard storage, while the
  advertised request allowance is for provisioned capacity. This ADR selects
  on-demand, so read/write request units, transactional doubling, storage above
  allowances, backups, restores, and exports can be billable.
- S3 storage, PUT/GET/HEAD requests, retained versions, and data transfer can be
  billable. CloudWatch log ingestion/storage can also be billable above its
  allowance.

Current authoritative pricing references:

- [API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/)
- [Lambda pricing](https://aws.amazon.com/lambda/pricing/)
- [DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/)
- [Cognito pricing](https://aws.amazon.com/cognito/pricing/)
- [S3 pricing](https://aws.amazon.com/s3/pricing/)
- [CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/)

### Expected cost

Idle means no API requests or Lambda executions, at most 1 GB of DynamoDB data,
1 GB of S3 objects/backups, and only retained logs. DynamoDB on-demand has no
idle throughput charge. Expected empty-stack idle cost is USD 0; expected idle
with the retained small dataset/backups/logs is **less than USD 0.05/month** at
current public rates/allowances. USD 0 is a target, not a guarantee.

A deliberately conservative low-traffic month assumes:

- 10,000 HTTP API/Lambda requests;
- 512 MiB Lambda memory and a pessimistic one-second average duration;
- 100,000 strongly consistent DynamoDB read units and 50,000 write units after
  rounding up item sizes, retries, list reads, and transactional doubling;
- 1 GB S3 storage, 1,000 PUT-class requests, 10,000 GET-class requests, and up
  to 1 GB internet transfer; and
- 0.25 GB CloudWatch log ingestion with 14-day retention.

At standard public list-rate order of magnitude, before credits and without
relying on the expiring API Gateway offer, the expected total is approximately
**USD 0.50/month** and should remain **below USD 1/month** for that workload.
The account's USD 5 budget remains a warning threshold, not a spending cap.
The estimate must be refreshed with the AWS Pricing Calculator and observed dev
usage before production.

No PITR/on-demand DynamoDB backup, S3 versioning, customer-managed KMS key, NAT
Gateway, VPC endpoint, WAF, API cache, DAX, global table, Streams, EFS,
CloudFront, provisioned capacity/concurrency, paid alarm/dashboard, or paid
security feature is enabled. Any addition needs a separate issue and approved
cost estimate.

## Consequences and verification

Benefits:

- one aggregate read provides a complete post in the normal case;
- slug locks, versions, summaries, and post changes cannot partially commit;
- the private bucket and short-lived presigned operations expose no AWS
  credential or permanent public URL;
- on-demand services and explicit exclusions keep idle cost small; and
- a feature flag plus a source-of-truth checkpoint gives a clear rollback
  boundary.

Trade-offs:

- summary/catalog duplication increases transactional writes;
- strong reads and transactions cost more request units than eventual,
  non-transactional operations;
- the single `POSTS` partition is intentionally sized for this small personal
  dataset and must be reconsidered if traffic or post count changes materially;
- a globally consistent backup may retry if a mutation changes `SYSTEM/REVISION`;
  and
- segmented references add an extra query for unusually large posts.

Implementation issues must prove:

- anonymous/wrong-issuer/wrong-audience/non-admin requests fail;
- duplicate and renamed slugs never leave partial locks;
- stale versions never overwrite newer content;
- every current field round-trips or is reported as deferred;
- inline and segmented posts stay below the 350 KiB guard;
- migrated image keys are null and no migration S3/Supabase download occurs;
- list and backup pagination have no duplicates or omissions;
- presigned upload negative cases and commit-before-delete ordering hold; and
- actual AWS resources and costs match this ADR and the account guardrails.

## AWS technical references

- [DynamoDB item-size calculation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/CapacityUnitCalculations.html)
- [DynamoDB constraints](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html)
- [DynamoDB transactional writes](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactWriteItems.html)
- [Cognito administrator-created users](https://docs.aws.amazon.com/cognito/latest/developerguide/how-to-create-user-accounts.html)
- [Cognito password recovery](https://docs.aws.amazon.com/cognito/latest/developerguide/managing-users-passwords.html)

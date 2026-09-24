# Astro site build reader: proposed v1 contract

Status: proposed for joint admin and Astro owner review under
[admin issue #55](https://github.com/boversauros/admintonibover/issues/55) and
[site tracker #11](https://github.com/boversauros/tonibover/issues/11). This
document specifies the interface for later implementation; it deploys nothing.

The admin `dev` branch was created from reviewed remote `main` commit
`9ee8338b16b92931f28b3ca80712e2b193f078a8` (issue #54). Reader work
targets `dev` through focused pull requests. The Astro repository already has
a `dev` branch; its own base and parity work are tracked separately.

## Boundary and authorization

The Astro build invokes a separate Lambda with AWS SDK `Invoke` using
`RequestResponse`. There is no Function URL or API Gateway route. The existing
admin Lambda and Cognito-protected routes are **not** callable by the build:
their API Gateway JWT authorizer cannot protect direct Lambda invocation.

- The build role has `lambda:InvokeFunction` on only the reader function for
  the selected environment. It has no DynamoDB, S3, Cognito, CloudFormation,
  admin-Lambda, or mutation permission.
- The reader execution role has `dynamodb:GetItem` and `dynamodb:Query` on
  only that environment's content table, `s3:GetObject` on only its
  `images/posts/*` objects, and minimal CloudWatch Logs permissions. It has no
  write, scan, list-bucket, Cognito, or admin-Lambda permission.
- Vercel obtains temporary AWS credentials from its OIDC token. Development
  IAM trust matches the exact site project and `preview` environment, after
  verifying its issuer, audience, and subject. This also permits other Preview
  builds of that same project to invoke the **published-only development**
  reader. The owner accepted the existing Preview staging path on 2026-09-24;
  no admin or direct data permission is granted to those builds. Production
  gets a distinct role and reader function only after approval.
- Local development uses a temporary, invoke-only AWS session for `dev`.
  No admin Cognito session, long-lived AWS key, or private image URL is stored
  in Vercel environment variables, source, logs, or generated pages.

The owner confirmed **Team** OIDC issuer mode for the existing Astro Vercel
project. For the observed `preview` deployment, the development trust uses
only these exact values, substituting the team and project slugs from the
existing Vercel deployment URL (no wildcard):

```text
provider URL: https://oidc.vercel.com/<TEAM_SLUG>
aud:          https://vercel.com/<TEAM_SLUG>
sub:          owner:<TEAM_SLUG>:project:<SITE_PROJECT_NAME>:environment:preview
```

The IAM role trust uses `StringEquals` on the provider's `:aud` and `:sub`
condition keys. A successful real Preview build must prove role assumption
against the development reader in issue #56. This is not a production role.

All invocation fields are untrusted. The reader validates schema and deployed
environment, forces publication filtering, bounds work, and maps failures to
the error codes below. It returns no draft information. Draft and nonexistent
post IDs have the same `NOT_FOUND` result.

## Wire envelope

Each invocation contains exactly one JSON request. Unknown versions,
operations, fields, malformed IDs, cursors, or limits fail closed. Request
payloads are at most 8 KiB. The reader caps its encoded success response at
5 MiB, below Lambda's synchronous response ceiling; an oversized catalog or
single post is an explicit `RESULT_TOO_LARGE` failure, never a truncated page.
Post IDs use the existing domain pattern
`^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`; cursors are limited to 2 KiB.

```ts
type Environment = 'dev' | 'prod';
type Language = 'ca' | 'en';
type ImageRole = 'main' | 'thumb';

type ReaderRequest =
  | { version: 1; environment: Environment; operation: 'revision' }
  | { version: 1; environment: Environment; operation: 'catalog' }
  | {
      version: 1;
      environment: Environment;
      operation: 'posts';
      limit: number; // integer 1..50, required
      cursor?: string; // opaque, returned by the previous page
    }
  | {
      version: 1;
      environment: Environment;
      operation: 'post';
      id: string;
      expectedVersion: number; // positive integer from posts page
    }
  | {
      version: 1;
      environment: Environment;
      operation: 'media';
      postId: string;
      role: ImageRole;
      expectedVersion: number;
    };

type ReaderResponse<T> =
  | { version: 1; environment: Environment; ok: true; data: T }
  | {
      version: 1;
      environment: Environment;
      ok: false;
      error: { code: ReaderErrorCode; retryable: boolean };
    };

type ReaderErrorCode =
  | 'INVALID_REQUEST'
  | 'INVALID_CURSOR'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'MEDIA_NOT_ATTACHED'
  | 'MEDIA_UNAVAILABLE'
  | 'DATA_UNINITIALIZED'
  | 'DATA_INTEGRITY'
  | 'RESULT_TOO_LARGE'
  | 'THROTTLED'
  | 'UNAVAILABLE';
```

AWS IAM denial, `Invoke` transport failure, `FunctionError`, malformed
envelopes, and mismatched environment/version are build failures even if the
Lambda API call itself returns HTTP 200. Error responses contain no post body,
image key, URL, account ID, stack name, or raw exception message. Only
`THROTTLED` and `UNAVAILABLE` permit capped per-call retry. A
`VERSION_CONFLICT` restarts the whole snapshot, not the individual detail
call.

## Operations

### `revision`

Returns `{ revision: number }`, a nonnegative safe integer from a strongly
consistent read of `SYSTEM / REVISION`. A missing or malformed revision is
`DATA_UNINITIALIZED` or `DATA_INTEGRITY`, never silently interpreted as an
empty published site. Post and taxonomy writes already increment this marker.

### `catalog`

Returns the complete catalog in one bounded response, with internal
strongly consistent DynamoDB pagination:

```ts
type Catalog = {
  categories: Array<{
    id: string;
    slug: string;
    names: Record<Language, string>;
  }>;
  keywords: Array<{ id: string; language: Language; value: string }>;
};
```

Include categories even when no published post uses them. Include both
language-specific keyword catalogs. Sort categories by ID and keywords by
language, value, then ID for reproducible output. A response over 5 MiB
returns `RESULT_TOO_LARGE`; that requires an explicit versioned catalog
pagination change before builds can proceed.

### `posts`

Returns `{ items: Array<{ id: string; version: number }>, nextCursor:
string | null }`. The reader calls the existing post repository with
`published: true`, `direction: 'descending'`, and the requested limit/cursor.
There is no caller-controlled publication, search, category, or direction
filter. The cursor is opaque and valid only for this operation/environment;
invalid or repeated cursors fail. `nextCursor: null` is the sole completion
signal. A valid terminal empty page means there are genuinely no published
posts. Each ID is unique across the snapshot and each version is positive.

### `post`

Returns one published `PublishedPost` at the expected version. The reader
uses the existing strongly consistent aggregate lookup, which reconstructs
segmented references. Its projection exposes only fields needed by Astro:

```ts
type PublishedPost = {
  id: string;
  version: number;
  published: true;
  category: { id: string; slug: string };
  sortOrder: number;
  date: string;
  translations: Record<
    Language,
    {
      id: string;
      title: string;
      slug: string;
      content: string;
      translationStatus: 'complete' | 'incomplete';
      keywords: Array<{ id: string; value: string }>;
      references: Array<{
        id: string;
        type: 'text' | 'image';
        reference: string;
        blockquote?: string;
        sortOrder: number;
      }>;
    }
  >;
  mainImage: ImageDescriptor | null;
  thumbImage: ImageDescriptor | null;
};

type ImageDescriptor = {
  title: string;
  alt: string;
  contentType: string;
  sizeBytes: number;
};
```

Do not expose S3 keys, migration run IDs, author, timestamps, or admin-only
fields. Keep incomplete translations in the response; Astro retains its
current title/slug/content usability rule. Keep optional reference blockquote
text and reference order. The current AWS type permits `text` and `image`
references; any legacy `blockquote` type encountered in dev fixtures needs an
explicit compatibility decision before parity acceptance.

### `media`

Returns `{ url, expiresAt, contentType, sizeBytes }` for the requested main
or thumb image. Re-read the published post strongly, require the expected
version, require a non-null image in that role, and verify that its key matches
the post/role-owned `images/posts/<postId>/<role>/` pattern. Check object
existence and metadata before signing a GET valid for at most five minutes.
Never accept an arbitrary key or return the key. Missing bytes for historical
metadata-only image slots return `MEDIA_UNAVAILABLE`; production builds fail
until those published images are restored or deliberately detached.

The signed URL is sensitive transport state only. Astro downloads and checks
the bytes during the build, then emits a stable local asset path; it never
serializes the signed URL into HTML, RSS, sitemap, content collections, logs,
or committed files. A null image slot requires no `media` request and retains
the site's existing hero/thumbnail placeholder behavior. A previously
published static image cannot be revoked from an already deployed artifact;
the owner must approve that publication policy before production cutover.

## Snapshot and build failure policy

The client reads `revision`, the complete catalog, every `posts` page, every
published `post` detail and attached `media` asset, then reads `revision`
again. It validates unique IDs/cursors, forward pagination progress, catalog
links, versions, image metadata, language/slug uniqueness, and envelope
environment. A changed revision discards all staged results and retries the
entire snapshot at most twice. Repeated drift or any missing/inconsistent
piece fails the production build. Per-call retry is bounded to transient
throttling/transport/service errors. Astro development refreshes preserve the
previous content-layer cache after a failure.

The Astro adapter, HTML processing, sorting, fallback behavior, and parity
tests are tracked in [site issue #12](https://github.com/boversauros/tonibover/issues/12),
[image issue #13](https://github.com/boversauros/tonibover/issues/13), and
[test issue #14](https://github.com/boversauros/tonibover/issues/14).
One important adaptation detail: historical numeric keyword IDs determine the
current label for a slug collision. Compare decimal-only IDs numerically and
choose the smallest as today. For a collision containing no numeric ID, use
the smallest ID in ASCII code point order; numeric IDs take precedence over
nonnumeric IDs. This leaves historical pages unchanged and gives future IDs a
deterministic label. The Astro owner should review this proposed extension.

## Staging checks and later deployment impact

Issue #55 makes no AWS resource or content change. A read-only check on
2026-09-24 verified a non-root authenticated identity, the exact development
stack/account/Region, `UPDATE_COMPLETE` status, 42 resources of 18 types,
matching table/bucket/Lambda outputs and physical resources, active table and
Lambda, private bucket, and required tags on those three resources. The
account currently has no Vercel OIDC provider. Identifiers and content were
not recorded in public evidence. Recheck identity and inventory immediately
before any later change set.

GitHub deployment metadata shows the Astro `dev` commit currently deploys as
Vercel **Preview**. Its OIDC subject identifies the project and `preview`
environment, not the Git branch. The owner chose to keep this Preview staging
path without a paid custom environment. The build role therefore permits any
Preview build of the exact site project to invoke only the published-content
development reader. The owner confirmed Team issuer mode; the project and
Preview environment are visible in the existing GitHub deployment metadata.
The expected `aud`/`sub` above follow Vercel's documented claim format.
Validate a real build's role assumption in issue #56. No token is recorded in
the repo.

[Admin issue #56](https://github.com/boversauros/admintonibover/issues/56)
will supply the reviewable development CloudFormation change: separate reader
Lambda, read-only execution role, log group, exact invoke role, and OIDC trust
provider after rechecking that the account still lacks an appropriate one. It
must document the exact resource count/type, IAM diff, request-based Lambda,
DynamoDB/S3/log costs, and rollback. No VPC, NAT, public S3 setting, public
endpoint, provisioned concurrency, or production resource belongs in that
change. Rollback removes only new development reader access/resources after
the site build no longer depends on them. Production deployment is a separate
approval-gated issue.

## External limits and identity references

- [AWS Lambda Invoke](https://docs.aws.amazon.com/lambda/latest/api/API_Invoke.html)
  documents synchronous invocation and its 6 MiB payload ceiling.
- [Vercel OIDC reference](https://vercel.com/docs/oidc/reference) documents
  build tokens and the issuer, audience, subject, and custom environment
  claims. Verify the actual claims before writing trust conditions.
- [Vercel environments](https://vercel.com/docs/deployments/environments)
  documents branch-tracked custom staging environments and preview branches.

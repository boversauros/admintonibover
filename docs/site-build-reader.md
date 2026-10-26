# Site build reader

The public Astro site (`tonibover`) builds from published admin content through
a separate, read-only reader Lambda. This document is the canonical reference
for its current deployment, the v1 wire contract, and how to deploy or roll it
back. The decisions that led here are in
[migration-history.md](migration-history.md#site-build-reader).

## Current deployment

| Reader             | Where                                                          | Data       | Invoked by                                                |
| ------------------ | -------------------------------------------------------------- | ---------- | --------------------------------------------------------- |
| Development reader | Inside the `admintonibover-dev` foundation stack (5 resources) | dev table  | Local development; site Preview moved to the prod reader  |
| Production reader  | Separate stack `admintonibover-prod-site-reader` (4 resources) | prod table | `tonibover` Vercel **Preview** builds, including `dev`    |
| Public-site reader | Not yet configured                                             | prod table | Public-site Production identity, added in [site #16][s16] |

The `tonibover/dev` Preview reads published production content through the
production reader. The public site stays on its existing release until the
owner accepts that Preview and site #16 cuts it over. The development
foundation template has 41 resources; the production foundation stays at 36
and contains no reader, role, or OIDC provider.

The development foundation adds the reader Lambda, its execution role, a
14-day log group, the Vercel Team OIDC provider, and a Preview invoke role.
The production reader stack adds a reader Lambda, execution role, 14-day log
group, and Preview invoke role. It references the **existing** OIDC provider
by its exact same-account ARN: [AWS permits one registration per issuer
URL/account](https://docs.aws.amazon.com/IAM/latest/APIReference/API_CreateOpenIDConnectProvider.html).
The development foundation owns that provider; keep it in place while either
reader depends on it. Retiring the development foundation requires a reviewed
retain/import ownership migration first; deleting the provider would break both
readers. This is an operational dependency, not a CloudFormation export lock.

Both reader Lambdas are arm64 Node.js, 256 MiB, 30-second timeout, shared
regional concurrency, no Function URL and no API route. The production reader
stack does not manage the production foundation's admin Lambda, API, Cognito,
table, bucket, or their policies.

## Boundary and authorization

The Astro build invokes the reader with AWS SDK `Invoke` using
`RequestResponse`. The admin Lambda and Cognito-protected routes are **not**
callable by the build: their API Gateway JWT authorizer cannot protect direct
Lambda invocation.

- The build role has `lambda:InvokeFunction` on only the reader for its
  environment. It has no DynamoDB, S3, Cognito, CloudFormation, admin-Lambda,
  or mutation permission.
- The reader execution role has `dynamodb:GetItem` and `dynamodb:Query` on
  only that environment's content table, `s3:GetObject` on only its
  `images/posts/*` objects, and minimal CloudWatch Logs permissions. It has no
  write, scan, list-bucket, Cognito, or admin-Lambda permission, and cannot
  read `deployment/` code objects.
- Vercel obtains temporary AWS credentials from its OIDC token, in **Team**
  issuer mode. Trust uses `StringEquals` on the provider's `:aud` and `:sub`
  condition keys with these exact values (no wildcard):

  ```text
  provider URL: https://oidc.vercel.com/<TEAM_SLUG>
  aud:          https://vercel.com/<TEAM_SLUG>
  sub:          owner:<TEAM_SLUG>:project:<SITE_PROJECT_NAME>:environment:preview
  ```

- [Vercel Preview claims](https://vercel.com/docs/oidc/reference) identify the
  project and `preview` environment, not the Git branch. Every Preview build of
  the site project can therefore invoke the production reader. This was
  accepted: it grants published content only, with no draft, admin, or write
  permission. The four `AWS_READER_*` site variables stay scoped to Preview/dev.
- Local development uses a temporary, invoke-only AWS session for `dev`. No
  admin Cognito session, long-lived AWS key, or private image URL is stored in
  Vercel environment variables, source, logs, or generated pages.

All invocation fields are untrusted. The reader validates schema and deployed
environment, forces publication filtering, bounds work, and maps failures to
the error codes below. It returns no draft information: draft and nonexistent
post IDs have the same `NOT_FOUND` result.

## Wire envelope (v1)

Each invocation contains exactly one JSON request. Unknown versions,
operations, fields, malformed IDs, cursors, or limits fail closed. Request
payloads are at most 8 KiB. The reader caps its encoded success response at
5 MiB, below Lambda's synchronous response ceiling; an oversized catalog or
single post is an explicit `RESULT_TOO_LARGE` failure, never a truncated page.
Post IDs use the domain pattern `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`; cursors are
limited to 2 KiB.

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
empty published site. Post and taxonomy writes increment this marker.

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

Categories are included even when no published post uses them, and both
language-specific keyword catalogs are included. Categories sort by ID and
keywords by language, value, then ID for reproducible output. A response over
5 MiB returns `RESULT_TOO_LARGE`; that requires an explicit versioned catalog
pagination change before builds can proceed.

### `posts`

Returns `{ items: Array<{ id: string; version: number }>, nextCursor:
string | null }`. The reader calls the post repository with `published: true`,
`direction: 'descending'`, and the requested limit/cursor. There is no
caller-controlled publication, search, category, or direction filter. The
cursor is opaque and valid only for this operation/environment; invalid or
repeated cursors fail. `nextCursor: null` is the sole completion signal. A
valid terminal empty page means there are genuinely no published posts. Each
ID is unique across the snapshot and each version is positive.

### `post`

Returns one published `PublishedPost` at the expected version, from the
strongly consistent aggregate lookup (which reconstructs segmented references).
Its projection exposes only fields needed by Astro:

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

S3 keys, migration run IDs, author, timestamps, and admin-only fields are not
exposed. Incomplete translations stay in the response; Astro keeps its
title/slug/content usability rule. Optional reference blockquote text and
reference order are preserved. References are `text` or `image`; a legacy
`blockquote` type needs an explicit compatibility decision.

### `media`

Returns `{ url, expiresAt, contentType, sizeBytes }` for the requested main or
thumb image. The reader re-reads the published post strongly, requires the
expected version and a non-null image in that role, and verifies that its key
matches the post/role-owned `images/posts/<postId>/<role>/` pattern. It checks
object existence and metadata before signing a GET valid for at most five
minutes. It never accepts an arbitrary key or returns the key. Missing bytes
for a metadata-only image slot return `MEDIA_UNAVAILABLE`; production builds
fail until that image is restored or deliberately detached.

The signed URL is sensitive transport state only. Astro downloads and checks
the bytes during the build, then emits a stable local asset path; it never
serializes the signed URL into HTML, RSS, sitemap, content collections, logs,
or committed files. A null image slot needs no `media` request and keeps the
site's hero/thumbnail placeholder behavior.

Hashed published image files are public static assets on the site origin. A
previously published image cannot be revoked from an already deployed artifact:
older deployments, CDN caches, and downloaded copies can outlive an unpublish.

## Snapshot and build failure policy

The client reads `revision`, the complete catalog, every `posts` page, every
published `post` detail and attached `media` asset, then reads `revision`
again. It validates unique IDs/cursors, forward pagination progress, catalog
links, versions, image metadata, language/slug uniqueness, and envelope
environment. A changed revision discards all staged results and retries the
entire snapshot at most twice. Repeated drift or any missing/inconsistent
piece fails the production build. Per-call retry is bounded to transient
throttling/transport/service errors. Astro development refreshes keep the
previous content-layer cache after a failure.

The Astro side lives in the `tonibover` repository
([site #12](https://github.com/boversauros/tonibover/issues/12) adapter,
[site #13](https://github.com/boversauros/tonibover/issues/13) images,
[site #14](https://github.com/boversauros/tonibover/issues/14) parity tests).
For a keyword slug collision, historical numeric keyword IDs pick the label:
decimal-only IDs compare numerically and the smallest wins. A collision with no
numeric ID uses the smallest ID in ASCII code point order; numeric IDs take
precedence over nonnumeric IDs.

## Reader code artifact

Reader code is packaged as a separate zip, so the templates stay below
CloudFormation's 1 MB limit. CloudFormation reads it from the **existing**
private content bucket of the target environment, under a content-addressed
`deployment/build-reader/<sha256>.zip` key. Buckets have versioning disabled,
so never overwrite a key: changing the bytes requires a new key and an updated
`ReaderCodeObjectKey` parameter, because changing an object in place does not
make [CloudFormation update the function](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-lambda-function-code.html).
Keep previous code objects through the rollback window; the bucket's only
expiration rule applies to `temporary/`, not `deployment/`.

Lambda uses its [default `COPY` storage mode](https://docs.aws.amazon.com/lambda/latest/dg/configuration-self-managed-storage.html):
it keeps its own copy of the deployed zip, so a running function does not need
the S3 object. The object is still required for creation, code updates, and
some rollback paths.

Stage the zip from a verified deployment session in `eu-west-1`, after
confirming the stack and bucket. Use `admintonibover-dev` for the development
reader and `admintonibover-prod` for the production reader. Both readers use
the same zip:

```bash
set -euo pipefail
pnpm reader:build
pnpm reader:validate
READER_ZIP=infra/generated/build-reader-lambda.zip
READER_HASH=$(openssl dgst -sha256 "$READER_ZIP" | awk '{print $NF}')
READER_KEY="deployment/build-reader/${READER_HASH}.zip"
READER_CHECKSUM=$(openssl dgst -sha256 -binary "$READER_ZIP" | openssl base64 -A)
READER_BUCKET=$(aws cloudformation describe-stacks \
  --region eu-west-1 --stack-name admintonibover-dev \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue | [0]" \
  --output text)
test -n "$READER_BUCKET" && test "$READER_BUCKET" != None
aws s3api put-object --region eu-west-1 \
  --bucket "$READER_BUCKET" --key "$READER_KEY" --body "$READER_ZIP" \
  --if-none-match '*' --checksum-sha256 "$READER_CHECKSUM"
UPLOADED_CHECKSUM=$(aws s3api head-object --region eu-west-1 \
  --bucket "$READER_BUCKET" --key "$READER_KEY" --checksum-mode ENABLED \
  --query ChecksumSHA256 --output text)
test "$UPLOADED_CHECKSUM" = "$READER_CHECKSUM"
```

The [conditional upload](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html)
fails if the key already exists. Then skip the upload and verify its stored
SHA-256 checksum against the local zip; stop if it is missing or differs. Set
`ReaderCodeObjectKey` to `READER_KEY` in the private parameter file. Do not
delete the code object along with the temporary CloudFormation template object.

The development template cannot create a brand-new development stack in one
operation: the artifact bucket is created by that same stack. Recreating
development from zero needs a staged foundation deployment first, then the
upload and the reader update, or a separately provisioned artifact bucket.

## Deploying or updating a reader

**Development reader.** It is part of the development foundation; follow the
normal [infrastructure change set](operations.md#infrastructure-change-set)
after staging the code zip. Its parameters `VercelTeamSlug`,
`VercelSiteProjectName`, and `ReaderCodeObjectKey` are required and have no
defaults.

**Production reader.** It is created and updated from
`infra/generated/production-site-reader.template.json`:

1. Refresh the AWS deployment session. Privately verify a non-root caller, the
   intended account, `eu-west-1`, the production foundation's terminal status
   and exact `TableName`/`BucketName` outputs. Verify the bucket's Block Public
   Access/encryption and the existing OIDC provider's URL/client IDs against the
   observed Vercel Team claims. Check the regional Lambda concurrency quota and
   usage; the reader uses shared concurrency.
2. Run `pnpm reader:prod:synth`, `pnpm reader:prod:validate`, the focused reader
   tests, and `cfn-lint infra/generated/production-site-reader.template.json`.
   Save the zip hash/key in the private deployment report.
3. Fill the six template parameters in a private file from the verified
   production outputs and actual Vercel claims. Nothing is guessed or committed.
4. Stage the zip in the production bucket as described above. Set
   `ReaderCodeObjectKey` to its hash key.
5. Create a change set in `eu-west-1` with `CAPABILITY_IAM`. A first creation
   must be exactly four additions; a code update must modify only the reader
   function. Stop on any other modification, replacement, or deletion. Review
   the IAM statements and private identity baseline before executing it.
6. Wait for a terminal success status. Privately verify the reader's
   environment, exact table/bucket variables, roles and trust, shared
   concurrency, 14-day logs and absence of a public Function URL.
7. For `tonibover` **Preview/dev**, set `AWS_READER_ENVIRONMENT=prod`,
   `AWS_READER_REGION` to `ReaderRegion`, `AWS_READER_FUNCTION_ARN` to
   `ReaderFunctionArn` and `AWS_READER_ROLE_ARN` to
   `ReaderPreviewInvokeRoleArn`, with Vercel OIDC enabled. Redeploy site `dev`
   and confirm reader invocations without errors or throttles.

Do not publish or alter production posts to manufacture evidence. Controlled
tests cover absent edge and failure cases. Reports and logs must exclude
credentials, full identifiers, private content, S3 keys, and signed grants.

## Cost and rollback

There is no VPC, NAT, new table/bucket, public endpoint, provisioned
concurrency, or reserved concurrency: the `eu-west-1` account concurrency limit
was 10 at the 2026-09-29 review, which cannot support a reservation under
[AWS's unreserved-capacity rule](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html).
Charges come from reader invocations and duration (one request per page, post
detail, revision, catalog, and image grant), strongly consistent DynamoDB reads,
S3 `HeadObject` and image GET requests plus egress to the build host, 14-day
log ingestion/storage, and the small code objects. IAM roles and the OIDC
provider have no direct hourly charge. Monitor invocations, errors, throttles
and duration during builds.

- **Preview integration:** restore the previous four `AWS_READER_*` Preview
  values and redeploy the prior successful Preview.
- **Reader code:** update only `ReaderCodeObjectKey` to a retained good zip and
  review that change set.
- **Production reader stack:** first remove its Preview dependency, then review
  deletion of only its four resources. Production content and the shared OIDC
  provider are not owned by it.
- **Development reader:** after nothing depends on it, remove its five resources
  and three parameters from the development template and apply a reviewed
  change set. Table, bucket, admin Lambda, Cognito users and content remain.

Delete unused content-addressed zips as a separate, reviewed cleanup only when
no active deployment or rollback path needs them.

## References

- [AWS Lambda Invoke](https://docs.aws.amazon.com/lambda/latest/api/API_Invoke.html)
  documents synchronous invocation and its 6 MiB payload ceiling.
- [Vercel OIDC reference](https://vercel.com/docs/oidc/reference) documents
  build tokens and the issuer, audience, subject, and environment claims.
  Verify the actual claims before writing trust conditions.

[s16]: https://github.com/boversauros/tonibover/issues/16

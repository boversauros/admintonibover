# Private S3 image repair

This runbook deploys and verifies
[issue #11](https://github.com/boversauros/admintonibover/issues/11): an
administrator-only replacement flow for missing main images and thumbnails.
The browser uploads directly to the existing private S3 bucket through a
five-minute SigV4 URL, while Lambda validates and attaches the object to the
post with an optimistic DynamoDB transaction.

It does not make the bucket public, introduce browser AWS credentials, migrate
all media, transform images, scan files, or change the public site.

## Fixed design

| Control          | Required behavior                                                    |
| ---------------- | -------------------------------------------------------------------- |
| Region and stack | `eu-west-1`, `admintonibover-dev`                                    |
| Roles            | `main` and `thumb` only                                              |
| Types            | JPEG, PNG, WebP, or AVIF with a matching filename extension          |
| Size             | 1 byte through 5 MiB                                                 |
| Integrity        | browser SHA-256, signed upload checksum, then S3 `HEAD` verification |
| Upload key       | opaque `temporary/<sha256>.<normalized-extension>`                   |
| Attached key     | `images/posts/<post-id>/<role>/<sha256>.<normalized-extension>`      |
| URL lifetime     | at most 300 seconds, also enforced by bucket policy                  |
| Authorization    | existing Cognito JWT plus `admintonibover-api/admin` scope           |
| Concurrency      | expected post version and one atomic DynamoDB transaction            |
| Cleanup order    | attach first; only then delete temporary and prior owned objects     |
| Abandoned data   | `temporary/` objects expire after one day                            |

The API never accepts a client-selected S3 key. A preview is signed only when
the stored key matches the post and image role. Presigned URLs, tokens, post
content, and request bodies must never appear in logs or pull-request evidence.

## What code owns

The reviewed CloudFormation template owns all AWS changes:

- three JWT-protected media routes and three exact Lambda invoke permissions;
- the bundled media handler and 256 MiB/10-second Lambda configuration;
- the existing exact-table `GetItem`, `PutItem`, `UpdateItem`, and `DeleteItem`
  permissions that govern the corresponding transactional item actions;
- object access limited to the existing `temporary/`, `images/`, and
  `backups/` prefixes;
- exact-origin S3 CORS for `GET`, `HEAD`, and `PUT`, with only the content type
  and SHA-256 checksum request headers;
- the one-day `temporary/` lifecycle rule;
- a bucket-policy denial for signatures older than 300,000 milliseconds; and
- DynamoDB TTL on the existing `expiresAt` attribute.

Do not reproduce any of these settings manually in S3, IAM, API Gateway,
Lambda, or DynamoDB. The console steps below review and execute one
CloudFormation change set.

## Before opening AWS

Use the pinned Node.js and pnpm versions. The suite is credential-free:

```bash
pnpm install --frozen-lockfile
pnpm infra:synth
NEXT_PUBLIC_SUPABASE_URL=https://ci.invalid \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder \
  pnpm run ci
shasum -a 256 infra/generated/dev-foundation.template.json
shasum -a 256 infra/fixtures/issue-11-media-post.json
```

The synthesis must contain 24 resources across the same 16 resource types as
the current stack. The deployable template is roughly 798 KB. CloudFormation
accepts only 51,200 bytes when a template body is sent directly, but accepts a
template up to 1 MB from S3. **Do not use the old `--template-body` commands.**
Do not select the console's **Upload a template file** option either: it can
create a CloudFormation-managed artifact bucket outside the stack. The steps
below stage one generated object in the existing private content bucket and use
its S3 URL, which CloudFormation supports up to 1 MB. See the official
[CloudFormation quotas](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cloudformation-limits.html)
and [S3 template behavior](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-console-create-stack.html).

The fictional fixture hash after formatting is recorded later in this
runbook. Keep the locally calculated template hash as private deployment
evidence because it changes with the reviewed commit.

## Create the change set in the AWS Console

1. Sign in with the approved daily-use AWS identity and MFA. Do not use root.
2. Privately confirm the account from issue #3, then select **Europe (Ireland)
   eu-west-1**.
3. Recheck Billing home, Budgets, Cost Anomaly Detection, Bills, and Cost
   Explorer as described in the
   [account guardrails](aws-account-guardrails.md). Stop on any unexplained
   service, Region, or charge.
4. Open **CloudFormation → Stacks → admintonibover-dev**. Its status must be
   `UPDATE_COMPLETE` or `CREATE_COMPLETE` and deletion protection for the
   content table must already be enabled.

Before creating the change set, stage the reviewed template without creating a
new bucket:

1. From the same console session, open CloudShell in `eu-west-1` and upload
   `infra/generated/dev-foundation.template.json` through **Actions → Upload
   file**.
2. Compare its SHA-256 with the locally recorded value, then run:

   ```bash
   ADMINTONIBOVER_TEMPLATE_SHA256="$(sha256sum dev-foundation.template.json | awk '{print $1}')"
   ADMINTONIBOVER_BUCKET_NAME="$(aws cloudformation describe-stacks \
     --region eu-west-1 \
     --stack-name admintonibover-dev \
     --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue | [0]" \
     --output text)"
   ADMINTONIBOVER_TEMPLATE_KEY="backups/cloudformation/issue-11/${ADMINTONIBOVER_TEMPLATE_SHA256}.json"

   aws s3api put-object \
     --region eu-west-1 \
     --bucket "$ADMINTONIBOVER_BUCKET_NAME" \
     --key "$ADMINTONIBOVER_TEMPLATE_KEY" \
     --body dev-foundation.template.json \
     --server-side-encryption AES256 \
     --checksum-algorithm SHA256

   ADMINTONIBOVER_TEMPLATE_URL="https://${ADMINTONIBOVER_BUCKET_NAME}.s3.eu-west-1.amazonaws.com/${ADMINTONIBOVER_TEMPLATE_KEY}"
   printf '%s\n' "$ADMINTONIBOVER_TEMPLATE_URL"
   ```

3. Keep the resolved bucket, key, URL, hash, and command output private. Stop if
   the bucket name is empty, the object key is outside
   `backups/cloudformation/issue-11/`, or the hash differs.

Return to the stack:

5. Choose **Stack actions → Create change set for current stack**.
6. Under **Prepare template**, select **Replace current template**, then
   **Amazon S3 URL**. Paste the private URL from CloudShell and choose **Next**.
7. Keep every current parameter unchanged. Explicitly verify:
   - `Environment` is `dev`;
   - `GuardrailsEvidenceConfirmed` is `CONFIRMED` only after step 3;
   - `EnableTableDeletionProtection` is `true`;
   - `AllowedOrigins`, callback URLs, and logout URLs contain only the exact
     approved localhost and HTTPS admin origins; and
   - the Cognito domain prefix is the existing value.
8. Name the change set `issue-11-private-image-repair`. Add the description
   `Add authenticated private S3 image repair`.
9. On **Configure stack options**, do not add a new service role, notification,
   stack policy, rollback configuration, or termination setting. Preserve the
   existing tags and options.
10. On **Review**, acknowledge that CloudFormation may create IAM resources,
    then choose **Create change set**. This creates review data; it does not
    execute the update.

If the console reports a template larger than 1 MB, stop. Do not create an
artifact bucket or split resources ad hoc; return to code and reduce or package
the bundle through reviewed IaC.

## Review before execution

Open the new change set's **Changes** tab. The only `Add` actions are:

- `PostImagesReadRoute` and `PostImagesReadInvokePermission`;
- `PostImagePresignRoute` and `PostImagePresignInvokePermission`; and
- `PostImageConfirmRoute` and `PostImageConfirmInvokePermission`.

The expected direct `Modify` actions, all without replacement, are:

- `FoundationFunction`: bundled code, description, 256 MiB, 10 seconds;
- `FoundationIntegration`: description and 10-second timeout;
- `HttpApi`: allow authenticated `POST` requests;
- `ContentBucketPolicy`: deny `GET`/`PUT` signatures older than five minutes.

CloudFormation may report dependency-driven modifications for the API stage or
integration. There must be no deletion, replacement, new resource type, table
or bucket replacement, wildcard IAM action/resource, public bucket setting,
new VPC, NAT Gateway, endpoint, ECR repository, CloudFront distribution, WAF,
KMS key, DAX, Stream, provisioned capacity, reserved concurrency, alarm, or
dashboard.

Choose **View processed template** and spot-check these exact values:

- bucket CORS origins reference `AllowedOrigins`, methods are `GET`, `HEAD`,
  `PUT`, allowed headers are `content-type` and `x-amz-checksum-sha256`;
- lifecycle ID is `ExpireAbandonedTemporaryUploads`, prefix `temporary/`, one
  day;
- bucket-policy condition is `s3:signatureAge = 300000`;
- table TTL is enabled on `expiresAt`;
- all three routes use the existing JWT authorizer and admin scope; and
- the Lambda has no VPC, reserved concurrency, or provisioned concurrency.

Stop instead of executing if any line differs.

## Execute and verify configuration

Choose **Execute change set**, confirm, and wait for `UPDATE_COMPLETE`. If the
stack rolls back, retain only the event logical IDs and redacted error text;
do not edit a failed resource by hand.

After `UPDATE_COMPLETE`, remove only the generated deployment object whose
exact bucket and key are still in the same CloudShell session:

```bash
aws s3api delete-object \
  --region eu-west-1 \
  --bucket "$ADMINTONIBOVER_BUCKET_NAME" \
  --key "$ADMINTONIBOVER_TEMPLATE_KEY"
```

The object is reproducible from Git and bucket versioning is off. Stop instead
of deleting if either variable is empty or the key does not start with the
exact issue #11 deployment prefix. This cleanup does not delete the content
bucket or any application image.

After success, verify read-only in the console:

1. **S3 → content bucket → Permissions**: all four public-access blocks are on,
   Object Ownership is bucket-owner enforced, and CORS/policy match the
   processed template.
2. **S3 → Management**: the temporary-upload lifecycle rule is enabled.
3. **DynamoDB → Tables → content table → Additional settings**: TTL uses
   `expiresAt`; deletion protection remains enabled; billing is on-demand;
   PITR and Streams remain off.
4. **Lambda → foundation function**: Node.js 24, arm64, 256 MiB, 10 seconds,
   no VPC, no reserved/provisioned concurrency.
5. **API Gateway → existing HTTP API → Routes**: the three new routes use the
   existing JWT authorizer and admin scope; stage throttling remains 2 requests
   per second with burst 4.
6. **IAM → foundation role → Permissions**: use the policy simulator or JSON
   view only. Confirm the existing underlying item actions remain scoped to the
   exact table and S3 object actions to the approved bucket prefixes. There is
   no `dynamodb:TransactWriteItems` IAM action; AWS governs transactional
   item operations through `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, and
   (only when used) `ConditionCheckItem`. Do not edit the policy. See AWS's
   [transaction IAM guide](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html).

S3 CORS controls browser permission; it does not grant S3 access. The bucket
policy and signed request still apply. AWS documents this distinction in
[S3 CORS evaluation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html).

## Seed the fictional post

The fixture contains no personal or production content:
[`infra/fixtures/issue-11-media-post.json`](../../infra/fixtures/issue-11-media-post.json).
Its reviewed SHA-256 is:

`90e1254c4e4f25923440c885262b593ef5acfda559fb5f9c98ec1802ab736b43`

Use the console CloudShell from the same daily-use session in `eu-west-1`.
Upload only the fixture, compare its hash, resolve the table name privately,
and conditionally create it:

```bash
sha256sum issue-11-media-post.json

ADMINTONIBOVER_TABLE_NAME="$(aws cloudformation describe-stacks \
  --region eu-west-1 \
  --stack-name admintonibover-dev \
  --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue | [0]" \
  --output text)"

aws dynamodb put-item \
  --region eu-west-1 \
  --table-name "$ADMINTONIBOVER_TABLE_NAME" \
  --item file://issue-11-media-post.json \
  --condition-expression 'attribute_not_exists(PK) AND attribute_not_exists(SK)' \
  --return-consumed-capacity TOTAL
```

The condition must fail rather than overwrite an existing item. Never paste
the resolved table name, output, account, ARN, or CloudShell screenshot into a
public issue or PR.

## Configure and open the admin

Keep the existing AWS/Cognito values in the ignored `.env.local`. Add the exact
regional S3 API origin derived from the stack's private `BucketName` output:

```env
ADMIN_DATA_BACKEND=aws
AWS_CONTENT_BUCKET_ORIGIN=https://<BucketName>.s3.eu-west-1.amazonaws.com
```

This value is a CSP allowlist origin, not a public URL or credential. Do not
add a trailing path, slash, query, or wildcard. Restart `pnpm dev`, sign in
through the existing Cognito flow, and remain on the AWS migration console.
The image repair panel is below the read tracer.

Enter `issue-11-media-fixture` and choose **Inspect images**. Both roles should
be missing and the post version should be 1.

## Acceptance checks

Use fictional test images only. Keep DevTools Network closed in screenshots
because it exposes presigned query credentials.

### Successful replacement and cleanup ordering

1. Choose an allowed image smaller than 5 MiB for `main`, add fictional title
   and alt text, then choose **Replace securely**.
2. Confirm the UI finishes at version 2 and renders a signed private preview.
3. Replace `main` again with a different fictional image. Confirm version 3.
4. In S3, inspect only `images/posts/issue-11-media-fixture/main/`: exactly the
   newly attached owned object should remain after cleanup settles. The first
   attached object must not be deleted until the second DynamoDB transaction
   succeeds.
5. Repeat once for `thumb`; confirm its distinct prefix and version increment.

The client sends only the signed `content-type` and checksum headers and uses
`credentials: omit` for S3. Presigned URLs provide temporary object-specific
access without browser AWS credentials, as described in AWS's
[presigned URL guide](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html).

### Required negative paths

Verify the following without changing AWS configuration:

- `.gif`, mismatched extension/MIME, zero-byte, and over-5-MiB files are
  rejected before a successful attachment;
- a malformed post ID or unknown post returns a stable 400/404 response;
- signing out and calling any same-origin media route returns 401, while a
  direct API Gateway request without a token is rejected before Lambda;
- an unsigned direct `GET` or `PUT` to either prefix is denied;
- changing a signed upload header, checksum, body, key, or method is denied or
  fails confirmation integrity checks;
- an unused upload/preview URL fails after five minutes; do not record the URL;
- two tabs inspecting the same version can presign, but after one confirms the
  other receives a 409 and the winning image remains attached;
- replaying one successful confirmation does not copy or increment again; and
- a deliberately abandoned `temporary/` test object becomes lifecycle-eligible
  after one day. S3 evaluates lifecycle asynchronously and may remove it later
  than the nominal date; AWS documents the timing in
  [Lifecycle troubleshooting](https://docs.aws.amazon.com/AmazonS3/latest/userguide/troubleshoot-lifecycle.html).

For CORS, use the configured localhost origin and one unlisted local origin.
The configured origin must complete the browser PUT; the unlisted origin must
fail browser CORS. Do not add a wildcard to make a test pass.

## Logs and billing evidence

Open the existing 14-day Lambda log group. Successful entries may include only
the event name, post ID, role, opaque upload ID/key, and correlation ID. A
failed entry may add a safe error class. Search privately for `X-Amz-`,
`Signature`, `Bearer`, `authorization`, and the fictional image title; the
result must be empty. API access logging remains disabled.

This issue creates no bucket, table, function, API, log group, queue, CDN,
scanner, or transformer. Incremental cost is request-based: API Gateway,
Lambda duration at 256 MiB, DynamoDB reads/transactions, S3 PUT/HEAD/COPY/GET/
DELETE, retained image bytes, and data transfer. At this manual volume it is
expected to stay within the foundation's previously reviewed sub-USD-1 monthly
workload, but that is an estimate, not a cap.

Check Bills and Cost Explorer immediately after the test and again after data
is available. Stop on a new service, Region, recurring resource, or unexpected
charge. Record only the date, rounded workload, rounded estimate, and pass/fail
result in the PR.

## Failure cleanup and rollback

Do not bulk-delete `images/`. To investigate a cleanup warning:

1. read the post and identify its currently referenced key;
2. compare one exact candidate key under that post/role prefix;
3. delete it only when it is confirmed unreferenced and the key is not the
   current image; and
4. leave `temporary/` recovery to the lifecycle rule unless an exact fictional
   test object has been independently verified.

For application rollback, first set `ADMIN_DATA_BACKEND=supabase` and restart
or redeploy Next.js. Create a new CloudFormation change set from the previously
reviewed template, verify it removes only the six issue #11 route/permission
resources and reverses the listed modifications without replacing the table or
bucket, then execute it.

Do not delete a newly attached image merely because application code was
rolled back. Bucket versioning is intentionally off, so an old object already
deleted after a successful replacement is not recoverable from S3. The
DynamoDB post revision is the audit record; restore content only through a
separately reviewed recovery procedure.

After acceptance, the fictional fixture may remain for later dev tests. If its
removal is required, condition the DynamoDB delete on the known key and version
and remove only its two exact owned prefixes after confirming nothing else
references them. Never delete the development table or bucket for fixture
cleanup.

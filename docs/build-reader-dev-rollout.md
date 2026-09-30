# Development build reader review and rollout

Issue [#56](https://github.com/boversauros/admintonibover/issues/56) implements the
[v1 build reader contract](site-build-reader-contract.md) on `dev`. The generated
development template adds five resources to the existing foundation stack:

| Resource                   | Access and purpose                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Reader Lambda              | IAM-only synchronous `Invoke`; no Function URL or API route. Its code comes from a content-addressed zip in the private development bucket. |
| Reader execution role      | `GetItem`/`Query` on the exact content table, `GetObject` under `images/posts/*`, and writes to its own log group.                          |
| Reader log group           | Standard class, 14-day retention.                                                                                                           |
| Vercel Team OIDC provider  | Exact verified Team issuer URL and audience.                                                                                                |
| Vercel Preview invoke role | Exact project and `preview` subject; `InvokeFunction` on the reader only.                                                                   |

The development template grows from 42 to 47 resources. The production template
stays at 42 resources and adds no reader, role, or provider. The generated
reader bundle is packaged separately so the template stays below CloudFormation's
1 MB limit. Cloud-free tests and the
offline infrastructure validator inspect the trust and IAM policies. The
existing admin Lambda, Cognito routes, and their permissions stay intact.

The new deployment parameters `VercelTeamSlug`,
`VercelSiteProjectName`, and `ReaderCodeObjectKey` are required and have no defaults.
Fill the Vercel parameters from the actual site Preview deployment, verify its
OIDC issuer, `aud`, and `sub`, and
review the resulting change set before a development deployment. Team Preview
identity includes other Preview branches of the same project, as accepted in
[#55](https://github.com/boversauros/admintonibover/issues/55). A live Preview
build still needs to prove role assumption and a reader invocation. Do not put
the token or private identifiers in public issue or PR evidence.

## Reader code artifact

CloudFormation reads the zip from the **existing** private development content
bucket when it creates or updates the reader Lambda. This is a content-addressed
key, not S3 bucket versioning: the development bucket has versioning disabled.
Never overwrite a key. Changing the bytes requires a new SHA-256 key and an
updated `ReaderCodeObjectKey` parameter; changing an S3 object in place does not
make [CloudFormation update the function](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-properties-lambda-function-code.html).
Keep previous code objects through the
rollback window so a failed update or deliberate rollback can use them. The
bucket's only expiration rule applies to `temporary/`, not `deployment/`.

Before creating the development change set, generate and check the artifact,
then stage it in the same Region as the function (`eu-west-1`). The code object
stays outside the reader execution role's S3 permissions. The deployment
identity needs permission to upload and read it. Run the following from a
verified deployment session, after confirming the stack and bucket values:

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
fails if that key already exists. In that case, skip
the upload and verify its stored SHA-256 checksum against the local zip; stop if
the checksum is missing or differs. Set `ReaderCodeObjectKey` to `READER_KEY` in
the private development parameter file. Check that the change set has the
expected five new resources before executing it. Do not delete the code object
alongside the temporary CloudFormation template object.

The reader uses [Lambda's default `COPY` storage mode](https://docs.aws.amazon.com/lambda/latest/dg/configuration-self-managed-storage.html): Lambda keeps its own
copy of the deployed zip, so an existing function can run without fetching this
S3 object. The object is still required for creation, code updates, and some
rollback paths. `REFERENCE` mode would instead require S3 versioning and
ongoing object access; this template does not opt into it.

This template cannot create a brand-new development stack in one operation:
the artifact bucket is itself created by that stack, so the zip cannot be
uploaded beforehand. The current `admintonibover-dev` stack already has the
bucket, and updating it is supported. Recreating development from zero needs
a staged foundation deployment first, followed by the upload and this reader
update, or a separately provisioned artifact bucket and a template change.

Read-only AWS inventory was rechecked on 2026-09-24: non-root caller, correct
account and `eu-west-1` stack, `UPDATE_COMPLETE`, 42 resources, matching table,
bucket, and admin Lambda outputs, active table and Lambda, full S3 Block Public
Access, and no Vercel OIDC provider. No AWS resource or content was changed.

## Cost and rollback

The new Lambda adds request and duration charges per build read, including one
request per page, post detail, revision, catalog, and image grant. Strongly
consistent DynamoDB `GetItem`/`Query` reads add read request charges and can
read multiple internal pages. S3 `HeadObject` and signed GET downloads add
request charges and image egress to the build host. The dedicated CloudWatch
log group adds ingestion and retained storage for 14 days. IAM roles and the
OIDC provider have no direct hourly charge. There is no VPC, NAT, provisioned
concurrency, public bucket setting, or new table. Exact currency spend depends
on published content size, build frequency, and image bytes. The private
deployment zip adds one small S3 object plus one PUT and a code read during
deployment. Retaining old code keys adds storage until cleanup.

To roll back after the site no longer depends on the reader, remove the five
development resources and three parameters from the template and apply a reviewed
development change set. Existing table, bucket, admin Lambda, Cognito users,
and content remain. Delete unused content-addressed zips as a separate,
reviewed cleanup only when no active release or rollback path needs them. An
entire development stack deletion already requires emptying its content bucket;
the code object is one more object to account for. Production deployment and
static image publication remain separate approval-gated work.

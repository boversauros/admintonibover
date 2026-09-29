# Production reader for the dev Preview

The owner's 2026-09-29 acceptance gate is a deployed `tonibover/dev` Preview
using `admintonibover` production's published content and attached images,
verified before any site merge into `main`. This supersedes the earlier
requirement to finish a separate dev-admin/fixture rehearsal first. See
[site #11](https://github.com/boversauros/tonibover/issues/11) and
[admin #59](https://github.com/boversauros/admintonibover/issues/59).

## Reviewed deployment scope

`infra/generated/production-site-reader.template.json` is a **separate** stack,
proposed name `admintonibover-prod-site-reader`. It creates four resources:
one ARM64 Node.js reader Lambda, its execution role, a 14-day log group and an
invoke-only Preview role. It does not manage the production foundation's admin
Lambda, API, Cognito, table, bucket or their policies. Both existing foundation
templates remain unchanged. Reader code is uploaded under a content-addressed
`deployment/build-reader/<sha256>.zip` key in the existing private production
bucket; its execution role cannot read deployment objects.

The function is explicitly configured for the `prod` data environment. It
uses the existing published-only v1 handler; production content mutations are
not needed. Missing/draft posts, mismatched versions and arbitrary image keys
remain denied. Preview gets only `lambda:InvokeFunction` on this function.

The stack references the **existing** Team OIDC provider by its exact
same-account ARN. It does not create a second provider:
[AWS permits one registration per issuer URL/account](https://docs.aws.amazon.com/IAM/latest/APIReference/API_CreateOpenIDConnectProvider.html).
Record which stack owns that provider (currently the development foundation)
and keep it in place while either reader depends on it. Retiring that owner
requires a separate reviewed retain/import ownership migration; deleting it
would break both readers. This is an operational dependency, not a
CloudFormation cross-stack export lock.

Trust uses exact Team issuer/audience and site project with
`environment:preview`. [Vercel Preview claims](https://vercel.com/docs/oidc/reference)
are shared by the project's Preview builds; they do not identify the `dev`
branch. The four site reader configuration variables remain scoped to
Preview/dev. Reviewed Preview code may therefore access published production
content; no draft/admin/write permission is granted. Public-site Production
gets a separate invoke identity during site #16.

## Preparation and deployment

1. Refresh the AWS deployment session. Privately verify a non-root caller,
   the intended account, `eu-west-1`, the production foundation's terminal
   status and exact `TableName`/`BucketName` outputs. Verify table/region,
   bucket Block Public Access/encryption and the existing OIDC provider's
   URL/client IDs against the observed Vercel Team claims. Check the regional
   Lambda concurrency quota and usage; the reader uses shared concurrency.
2. Run `pnpm reader:prod:synth`, `pnpm reader:prod:validate`, the focused reader
   tests, and `cfn-lint infra/generated/production-site-reader.template.json`.
   Save the generated reader zip hash/key in the private deployment report.
3. Copy the six template parameter names into a private file. Values must
   come from the verified production outputs and actual Vercel claims;
   no identity or table/bucket value is guessed or committed.
4. Stage the zip in the verified production bucket using the conditional
   upload/checksum procedure in `build-reader-dev-rollout.md`, substituting
   the verified **production** bucket. Never overwrite a hash key. Set
   `ReaderCodeObjectKey` to that zip's hash key. Preserve prior code objects
   through the rollback window.
5. Create a `CREATE` change set for the separate reader stack in `eu-west-1`
   with `CAPABILITY_IAM`, the generated template and private parameters.
   The resource changes must be exactly four additions, with no existing
   resource modification, replacement or deletion. Review the narrow IAM
   statements and private identity baseline before executing the change set.
6. Wait for `CREATE_COMPLETE`. Privately verify the reader's environment,
   exact table/bucket variables, roles and trust, shared concurrency,
   14-day logs and absence of a public Function URL. Read the stack outputs.
7. For `tonibover` **Preview/dev**, set `AWS_READER_ENVIRONMENT=prod`,
   `AWS_READER_REGION` to `ReaderRegion`, `AWS_READER_FUNCTION_ARN` to
   `ReaderFunctionArn` and `AWS_READER_ROLE_ARN` to
   `ReaderPreviewInvokeRoleArn`. Vercel OIDC must remain enabled.
8. Redeploy the current site `dev` commit in Vercel. Verify the build reads a
   stable published production snapshot, materializes attached images and
   emits static local paths. Complete site #13/#14/#15 before the owner's
   site-main acceptance. A manual rebuild is sufficient until admin #58.

An empty published set or no attached images does not prove nonempty/image
compatibility. Record the gap; do not publish or alter production posts to
manufacture evidence. Controlled tests cover absent edge/failure cases;
normal owner-initiated content changes can provide additional live evidence.
Reports/logs must exclude credentials, full identifiers, private content,
S3 keys and signed grants.

## Cost and rollback

There is no VPC, NAT, new table/bucket, public endpoint, provisioned concurrency
or new OIDC provider. Lambda uses 256 MiB, a 30-second timeout and shared
regional concurrency. At the 2026-09-29 review, the `eu-west-1` account limit
was 10, which cannot support reserved concurrency under
[AWS's unreserved-capacity rule](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html).
Monitor invocations, errors, throttles and request duration during Preview
builds. Charges come from reader invocations/duration, DynamoDB reads, S3 image
requests/egress, the code object and 14-day logs.
IAM roles have no direct hourly charge. Review the actual account baseline
and expected content/build volume before execution; this preparation does
not claim a live currency estimate or deployed production acceptance.

To roll back Preview integration, restore its previous four dev reader values
and redeploy the prior successful Preview. For a reader code rollback, update
only `ReaderCodeObjectKey` to a retained good zip and review that change set.
To retire the new stack, first remove its Preview dependency, then review
deletion of only its four resources. The external production content and
shared OIDC provider are not owned/deleted by it. The staged code object is
separate cleanup after confirming no active deployment or rollback uses it.

Hashed published image files are public static assets on the Preview origin;
older deployments/CDN caches and previously downloaded images can outlive an
unpublish. The owner reviews these publication consequences before site-main
release.

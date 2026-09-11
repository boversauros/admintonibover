# Production content cutover

Issue: [#22](https://github.com/boversauros/admintonibover/issues/22)

This runbook imports one approved, immutable legacy JSON backup into the
existing `admintonibover-prod` AWS stack, proves the administration interface
in read-only mode, and records the first accepted AWS mutation as the
source-of-truth checkpoint. The application has one runtime data path: Cognito,
the authenticated AWS API, DynamoDB, and private S3.

Use this with the [offline validator](backup-validation.md),
[migration runner](json-dynamodb-migration.md),
[production foundation](aws-production-foundation.md),
[admin security](admin-web-security.md),
[post mutation](aws-admin-post-mutations.md),
[image repair](manual-image-reupload-ui.md), and
[backup](aws-admin-backup-and-utilities.md) runbooks.

Account identifiers, generated resource names, source paths, complete hashes,
content, credentials, tokens, cookies, signed URLs, Vercel values, private
screenshots, backups, and manifests stay outside Git. The evidence ledger may
contain only redacted counts, truncated hashes, timestamps, and pass/fail
statements.

## Stop conditions

Stop before the next stage if any of these is true:

- issue #21 readiness, administrator login, authenticated health, Vercel AWS
  configuration, cost observation, or recovery acceptance is unresolved;
- the operator has not approved one fixed HTTPS Preview origin, or its exact
  callback/logout URLs are absent from the production stack configuration;
- the final backup and complete SHA-256 are not approved privately;
- a newer source or unexplained post-backup edit may exist;
- the source differs from rehearsal without an approved reconciliation;
- AWS identity, Region, stack, table ARN, or typed target differs from the
  private approval, or the production table contains any item;
- validation, dry-run, execute, idempotent replay, or reconciliation reports an
  error, conflict, missing fingerprint, mismatched fingerprint, or extra item;
- an unexpected publication, non-null image role, authorization/CORS failure,
  continuing cost, or application error appears; or
- the evidence boundary would be violated.

No discrepancy is accepted as close enough. Record a linked blocking issue and
keep the AWS admin read-only or offline until it is resolved.

## 1. Resolve inherited production readiness

1. Complete the single Cognito administrator login and recovery checks. Require
   exactly one enabled, verified-email administrator and confirm self-sign-up
   remains disabled.
2. Correct every required server-only Vercel AWS value. Replace the write-only
   session secret rather than guessing its prior value.
3. Prove authenticated `GET /health`, then repeat missing, malformed, modified,
   wrong-audience, and expired-token failures.
4. Approve issue #21's delayed billing observation and recovery path.
5. Approve a stable Preview origin and add it only through a reviewed production
   CloudFormation change set. Wildcard or ephemeral origins are prohibited.

## 2. Approve the final source

The June 18 backup may be used only after the owner confirms that no newer
content source or later edit exists. Store two unchanged copies in approved
private locations, record their size and SHA-256 privately, and prove they are
identical.

```bash
ADMINTONIBOVER_CUTOVER_SOURCE=/absolute/path/to/approved-backup.json
ADMINTONIBOVER_CUTOVER_SOURCE_SHA256="$(shasum -a 256 "$ADMINTONIBOVER_CUTOVER_SOURCE" | awk '{print $1}')"

pnpm backup:validate -- \
  --input "$ADMINTONIBOVER_CUTOVER_SOURCE" \
  --report .artifacts/issue-22-validation-private.json \
  --expect-known-baseline

pnpm migration:run -- \
  --input "$ADMINTONIBOVER_CUTOVER_SOURCE" \
  --input-sha256 "$ADMINTONIBOVER_CUTOVER_SOURCE_SHA256" \
  --manifest .artifacts/issue-22-migration-dry-run-private.json \
  --expect-known-baseline
```

Omit `--expect-known-baseline` only for a separately reviewed newer export.
Never rename another file to make the known-baseline check pass.

## 3. Bind the empty production target

Use a fresh short-lived operator session and keep resolved identifiers in the
private terminal:

```bash
ADMINTONIBOVER_CUTOVER_REGION=eu-west-1
ADMINTONIBOVER_CUTOVER_STACK=admintonibover-prod

aws sts get-caller-identity

ADMINTONIBOVER_CUTOVER_TABLE="$(aws cloudformation describe-stacks \
  --region "$ADMINTONIBOVER_CUTOVER_REGION" \
  --stack-name "$ADMINTONIBOVER_CUTOVER_STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue | [0]" \
  --output text)"

aws dynamodb describe-table \
  --region "$ADMINTONIBOVER_CUTOVER_REGION" \
  --table-name "$ADMINTONIBOVER_CUTOVER_TABLE" \
  --query 'Table.{Arn:TableArn,Status:TableStatus,BillingMode:BillingModeSummary.BillingMode,DeletionProtection:DeletionProtectionEnabled,KeySchema:KeySchema,AttributeDefinitions:AttributeDefinitions}'

aws dynamodb scan \
  --region "$ADMINTONIBOVER_CUTOVER_REGION" \
  --table-name "$ADMINTONIBOVER_CUTOVER_TABLE" \
  --consistent-read \
  --select COUNT
```

Require an active stack, `PAY_PER_REQUEST`, deletion protection, string
`PK`/`SK` keys, matching account/Region ARN fields, and a strongly consistent
count of zero. Re-resolve all values immediately before execute.

## 4. Execute once and reconcile

Review the final private dry-run manifest. Type both production confirmations
with the exact resolved values and execute with concurrency two:

```bash
pnpm migration:run -- \
  --execute \
  --allow-production \
  --input "$ADMINTONIBOVER_CUTOVER_SOURCE" \
  --input-sha256 "$ADMINTONIBOVER_CUTOVER_SOURCE_SHA256" \
  --manifest .artifacts/issue-22-migration-execute-private.json \
  --environment prod \
  --account-id <12-digit-account-id> \
  --region "$ADMINTONIBOVER_CUTOVER_REGION" \
  --table "$ADMINTONIBOVER_CUTOVER_TABLE" \
  --confirmation "MIGRATE prod <account-id>/eu-west-1/<table-name> <sha256>" \
  --production-confirmation "ALLOW PRODUCTION <account-id>/eu-west-1/<table-name> <sha256>" \
  --concurrency 2 \
  --expect-known-baseline
```

Require completed verification with no missing, mismatched, or extra content
fingerprints. Compare IDs, hashes, entity counts, timestamps,
draft/publication state, and null image roles. The known June result is 100
drafts, zero published posts, 100 null main images, and 100 null thumbnails.

Repeat the exact execute command. It must write zero items and classify every
planned item as unchanged.

## 5. Read-only Preview acceptance

Deploy the reviewed commit to the approved fixed Preview origin with
`ADMIN_CSP_MODE=enforce`. Do not use create, edit, delete, publish, image, or
bulk actions.

- complete Cognito sign-in and authenticated health;
- exercise every list page, filter, ordering, pagination, and reset control;
- open representative short and long posts in both languages;
- verify keywords, references, dates, taxonomy, and the known incomplete legacy
  translation;
- verify AWS backup download and expected missing-image counts;
- confirm anonymous, cross-origin, conflict, malformed-body, oversize,
  expired-session, and upstream-error paths fail safely; and
- log out and prove authenticated data is no longer accessible.

## 6. Source-of-truth checkpoint

Recheck the accepted commit, Vercel scope, stack/table identity, source hash,
reconciled counts, application backup, and cost baseline. Promote the accepted
build.

Choose one draft and make the smallest reversible text-only edit. Do not publish
or upload an image in the same action. Verify its version, persistence after a
refresh, and an immediately downloaded AWS version 2 backup.

That accepted mutation timestamp is the **AWS becomes source of truth**
checkpoint. Record it before any further change. Then test one private image
upload on one missing slot and verify ownership, attachment, and unchanged post
text.

## 7. Restore acceptance and rollback

Restore the post-edit AWS backup only into a new empty disposable development
table. Bind the target, recompute the digest, write bounded batches, then compare
the strongly scanned digest, entity counts, revision, and one repository read.
Delete only that disposable stack after the evidence is accepted.

Before the first accepted mutation, rollback means taking the admin offline,
preserving the imported table, and reverting or repairing the application. The
migration runner's run-scoped rollback is allowed only while every imported item
is unchanged and the exact source/target confirmations are re-approved.

After the checkpoint:

1. stop all admin mutations and record the read-only start time;
2. export and validate an AWS backup;
3. keep AWS read-only or take the admin offline;
4. revert or repair application code/config;
5. repair or restore AWS through a separately reviewed recovery procedure; and
6. repeat read-only acceptance before restoring writes.

The retired service is not a rollback target.

## 8. Cost observations and completion

Check CloudWatch errors/throttles and AWS Bills immediately, after 24 hours, and
after 7 days. Record observation times and redacted results. Unexpected cost or
service usage blocks completion and gets a linked issue.

Complete the evidence ledger only after every automated and manual check,
security impact, cost impact, rollback path, final source approval, and
source-of-truth timestamp is recorded.

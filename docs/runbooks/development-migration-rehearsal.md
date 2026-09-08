# Development migration rehearsal

This runbook is the operator contract for issue #20. It proves the June 18
Supabase backup in the existing `admintonibover-dev` AWS stack, rolls back only
the imported records, and repeats the import with identical deterministic
content hashes. It does not authorize a production operation or a cutover.

Use it with the
[offline backup validator](backup-validation.md), the
[JSON-to-DynamoDB migration runner](json-dynamodb-migration.md), the
[AWS admin mutation checks](aws-admin-post-mutations.md), and the
[AWS backup and utility checks](aws-admin-backup-and-utilities.md). Record the
results in the issue-specific evidence ledger. Keep all private inputs and
unredacted reports under `.artifacts/` or outside the repository.

## Non-negotiable boundaries

Stop before the next step if any boundary is not true:

- AWS identity is the approved development account, Region is `eu-west-1`, and
  the target table is the `TableName` output of the exact
  `admintonibover-dev` CloudFormation stack.
- The stack is `CREATE_COMPLETE` or `UPDATE_COMPLETE`; the table is `ACTIVE`,
  on-demand, deletion-protected, and has string `PK` and `SK` keys.
- The source file is the explicitly approved June 18 rehearsal source and its
  independently calculated SHA-256 remains unchanged.
- Validator version 1, migration tool version 1, and schema version 1 are the
  reviewed versions.
- The four data decisions below have explicit operator sign-off.
- The current Bills baseline has no unexplained service.

This rehearsal must not read or change a production stack, write to Supabase,
upload an S3 object, or publish a post. `ADMIN_DATA_BACKEND` selects exactly one
backend. Keep browser network details, response bodies, credentials, tokens,
resource identifiers, private content, and presigned URLs out of evidence.

## Required data sign-off

The operator must affirm all four decisions in the issue or pull request before
the first AWS write:

- The June 18 backup is approved only as this rehearsal's source; it is not
  automatically the production cutover source.
- Post 64's English title and slug remain empty and its translation remains
  flagged incomplete; no replacement content is invented.
- The 229 image rows are metadata, not binaries; both live image roles are
  imported as null and no image is claimed as migrated.
- All 100 posts remain drafts throughout the rehearsal.

## Evidence boundary

The private validation report and migration manifests contain legacy owner and
image metadata. Never commit or attach them. Review them locally, then record
only:

- truncated source hash, tool versions, counts, warning codes, and numeric IDs;
- target checks with account ID and generated resource names redacted;
- post IDs and deterministic post hashes, or a digest over that sorted list;
- missing, mismatched, and extra fingerprint counts;
- write, unchanged, rollback, and restore counts;
- UI pass/fail observations with content and identifiers redacted; and
- metric totals and cost observations without resource names.

Run `pnpm check:secrets` before every commit containing evidence. If a private
value reaches Git history, rotate it where applicable and remove it from the
entire branch; a later deletion is insufficient.

## 1. Pin the source and tool versions

Use the repository-pinned Node.js and pnpm versions. Set shell variables only
in the operator's current private terminal:

```bash
ADMINTONIBOVER_SOURCE=/absolute/path/to/tonibover-backup-2026-06-18T08-46-31.json
ADMINTONIBOVER_SOURCE_SHA256="$(shasum -a 256 "$ADMINTONIBOVER_SOURCE" | awk '{print $1}')"
ADMINTONIBOVER_REGION=eu-west-1
ADMINTONIBOVER_STACK=admintonibover-dev
```

Record the source modification time, size, SHA-256, current Git commit,
validator version, migration tool version, and schema version privately. Do not
paste the absolute source path into public evidence.

## 2. Bind identity to the exact development target

Use short-lived credentials in the normal AWS provider chain:

```bash
aws sts get-caller-identity

ADMINTONIBOVER_TABLE="$(aws cloudformation describe-stacks \
  --region "$ADMINTONIBOVER_REGION" \
  --stack-name "$ADMINTONIBOVER_STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue | [0]" \
  --output text)"

aws cloudformation describe-stacks \
  --region "$ADMINTONIBOVER_REGION" \
  --stack-name "$ADMINTONIBOVER_STACK" \
  --query 'Stacks[0].{Status:StackStatus,Id:StackId}'

aws dynamodb describe-table \
  --region "$ADMINTONIBOVER_REGION" \
  --table-name "$ADMINTONIBOVER_TABLE" \
  --query 'Table.{Arn:TableArn,Status:TableStatus,BillingMode:BillingModeSummary.BillingMode,DeletionProtection:DeletionProtectionEnabled,KeySchema:KeySchema}'
```

Compare the STS account to both the stack ID and table ARN account fields and
compare the table ARN Region to `eu-west-1`. Stop on an empty output, a mismatch,
or any production-looking value. Redact the account, ARN, and table name in the
evidence ledger.

Record the pre-count with a consistent scan and record the current Bills
baseline before validation:

```bash
aws dynamodb scan \
  --region "$ADMINTONIBOVER_REGION" \
  --table-name "$ADMINTONIBOVER_TABLE" \
  --consistent-read \
  --select COUNT
```

Do not assume CloudFormation's approximate `ItemCount` is the pre-count.

## 3. Validate and dry-run offline

These commands make no network request:

```bash
pnpm backup:validate -- \
  --input "$ADMINTONIBOVER_SOURCE" \
  --report .artifacts/issue-20-validation-private.json \
  --expect-known-baseline

pnpm migration:run -- \
  --input "$ADMINTONIBOVER_SOURCE" \
  --input-sha256 "$ADMINTONIBOVER_SOURCE_SHA256" \
  --manifest .artifacts/issue-20-migration-dry-run-private.json \
  --expect-known-baseline
```

Review every warning. The accepted baseline has 100 posts, 200 translations,
3 categories, 94 keywords, 1,321 references, 229 image metadata rows, 100
drafts, zero published posts, 100 projected null main images, 100 projected
null thumbnails, and only post 64's English title/slug incompleteness. Slug
normalization warnings must not synthesize post 64's missing slug.

## 4. Execute against development

Re-resolve the identity and table immediately before execution. Do not reuse a
table name copied from a log or earlier shell session. Use the exact private
account, table, and source hash in the typed confirmation:

```bash
ADMINTONIBOVER_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ADMINTONIBOVER_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

pnpm migration:run -- \
  --execute \
  --input "$ADMINTONIBOVER_SOURCE" \
  --input-sha256 "$ADMINTONIBOVER_SOURCE_SHA256" \
  --manifest .artifacts/issue-20-migration-execute-private.json \
  --expect-known-baseline \
  --environment dev \
  --account-id "$ADMINTONIBOVER_ACCOUNT_ID" \
  --region "$ADMINTONIBOVER_REGION" \
  --table "$ADMINTONIBOVER_TABLE" \
  --confirmation "MIGRATE dev $ADMINTONIBOVER_ACCOUNT_ID/$ADMINTONIBOVER_REGION/$ADMINTONIBOVER_TABLE $ADMINTONIBOVER_SOURCE_SHA256"
```

The runner must report `completed`; its verification must be valid with no
missing, mismatched, or extra fingerprints. A conflict or unexpected existing
post/taxonomy item is a blocker, not permission to overwrite it.

## 5. Reconcile data and admin behavior

Inspect the private manifest and prove:

- exactly 100 source and target post IDs match;
- all 100 deterministic source/target post hash pairs match;
- target entity counts match the plan;
- all 100 posts are drafts and zero are published;
- all 100 main image roles and 100 thumbnail roles are null; and
- the only incomplete translation is post 64 English.

With `ADMIN_DATA_BACKEND=aws`, use the authenticated development admin to:

1. Confirm list pagination, title search, category, draft state, missing-image
   filters, and both sort directions all return consistent counts.
2. Open post 64 and at least one reference-heavy post. Confirm both languages,
   categories, keywords, references, dates, ordering, and incomplete status
   match the private source without capturing content in evidence.
3. Create one fictional draft with null images after import. Edit and revert
   its text, category, keywords, and references. Never publish or upload an
   image. This is the unrelated rollback-isolation fixture.
4. Download an AWS backup and verify its environment, schema, count, digest,
   unique keys, and page count privately.
5. Confirm inventory displays exactly `missing-main: 100` and
   `missing-thumbnail: 100` for the imported posts. Record the unrelated
   fixture separately so it cannot disguise the baseline counts.

Cancel the publish-all dialog after confirming it displays exactly 101 drafts
while the fictional fixture exists, and exactly 100 after cleanup. Never submit
the publication action.

## 6. Roll back only the imported run

Copy the deterministic run ID from the private execute manifest. Re-resolve and
recheck identity and target before rollback:

```bash
ADMINTONIBOVER_RUN_ID=<exact-private-run-id>

pnpm migration:run -- \
  --rollback-run-id "$ADMINTONIBOVER_RUN_ID" \
  --input "$ADMINTONIBOVER_SOURCE" \
  --input-sha256 "$ADMINTONIBOVER_SOURCE_SHA256" \
  --manifest .artifacts/issue-20-migration-rollback-private.json \
  --expect-known-baseline \
  --environment dev \
  --account-id "$ADMINTONIBOVER_ACCOUNT_ID" \
  --region "$ADMINTONIBOVER_REGION" \
  --table "$ADMINTONIBOVER_TABLE" \
  --confirmation "ROLLBACK $ADMINTONIBOVER_RUN_ID $ADMINTONIBOVER_ACCOUNT_ID/$ADMINTONIBOVER_REGION/$ADMINTONIBOVER_TABLE"
```

Confirm the imported items disappeared, the fictional draft still exists, and
zero remaining items carry this run ID. Do not use a table-wide scan-and-delete,
CloudFormation deletion, or a wildcard key operation. Delete the fictional
draft through the authenticated admin only after rollback isolation is proved.

## 7. Re-import and compare hashes

Repeat step 4 with a new private manifest path. The target, source hash, and
deterministic run ID must be identical. Compare sorted post/hash pairs from the
first and second execute manifests locally:

```bash
jq -S '.postHashes | sort_by(.postId)' \
  .artifacts/issue-20-migration-execute-private.json \
  > .artifacts/issue-20-first-post-hashes-private.json

jq -S '.postHashes | sort_by(.postId)' \
  .artifacts/issue-20-migration-reimport-private.json \
  > .artifacts/issue-20-second-post-hashes-private.json

shasum -a 256 \
  .artifacts/issue-20-first-post-hashes-private.json \
  .artifacts/issue-20-second-post-hashes-private.json

cmp \
  .artifacts/issue-20-first-post-hashes-private.json \
  .artifacts/issue-20-second-post-hashes-private.json
```

Run the exact re-import command once more. It must write zero items, classify
every planned item as unchanged, and produce a valid verification report.

## 8. Metrics and cost

Record the rehearsal end time after the idempotency check. Query DynamoDB
`ConsumedReadCapacityUnits`, `ConsumedWriteCapacityUnits`,
`TransactionConflict`, `ConditionalCheckFailedRequests`, `ReadThrottleEvents`,
`WriteThrottleEvents`, and `SystemErrors` for the exact table and time window.
Also inspect API Gateway request/error/latency, Lambda invocation/error/throttle/
duration, S3 request/storage, and Cognito sign-in metrics used by the admin
exercise. Explain every non-zero error or unexpected service.

Review Bills immediately and again after at least 24 hours. Billing data is
delayed and budgets do not cap spend. Record only service names, usage totals,
rounded cost, observation timestamps, and pass/fail conclusions. Do not call
the Cost Explorer API solely for evidence because it has a per-request charge.

## 9. Discrepancies and completion

Any count, ID, hash, content, UI, resource, log, or billing discrepancy blocks
acceptance. Open a dedicated blocking issue, link it from the evidence ledger,
and leave the affected check incomplete. Do not classify a discrepancy as
close enough.

The rehearsal is complete only when validation, dry-run, execute,
reconciliation, rollback isolation, re-import, idempotency, UI checks, immediate
metrics/Bills, and the settled 24-hour Bills check all pass with redacted
evidence.

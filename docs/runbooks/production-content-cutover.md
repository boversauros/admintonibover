# Production content cutover

Issue: [#22](https://github.com/boversauros/admintonibover/issues/22)

This runbook moves the one approved, frozen Supabase source into the existing
`admintonibover-prod` AWS stack, proves the shared administration interface in
read-only mode, and records the first accepted AWS mutation as the irreversible
source-of-truth checkpoint. Use it with the
[offline validator](backup-validation.md),
[migration runner](json-dynamodb-migration.md),
[production foundation](aws-production-foundation.md),
[admin security](admin-web-security.md),
[post mutation](aws-admin-post-mutations.md),
[image repair](manual-image-reupload-ui.md), and
[backup](aws-admin-backup-and-utilities.md) runbooks.

All account identifiers, generated resource names, source paths, full hashes,
content, credentials, tokens, cookies, signed URLs, Vercel values, private
screenshots, backups, and manifests stay outside Git. The issue evidence ledger
contains only redacted counts, truncated hashes, timestamps, and pass/fail
statements.

## Stop conditions

Stop before the next stage if any of these is true:

- issue #21 is not merged or its administrator login, authenticated health,
  Vercel AWS configuration, cost observation, or recovery acceptance is still
  unresolved;
- the operator has not named and approved one fixed HTTPS Vercel Preview origin,
  or that exact origin is absent from API/S3 CORS and Cognito callback/logout
  configuration;
- Supabase writes are not frozen, the freeze time is missing, or any write-capable
  browser, script, integration, webhook, or second operator remains active;
- the final source and its complete SHA-256 are not approved privately;
- the final source differs from rehearsal without an explained and approved
  reconciliation;
- AWS identity, Region, stack, table ARN, or typed target differs from the private
  approval, or the production table has any item;
- validation, dry-run, execute, idempotent replay, or reconciliation reports an
  error, conflict, missing fingerprint, mismatched fingerprint, or extra content
  item;
- an unexpected publication, non-null image role, authorization/CORS failure,
  continuing cost, or application error appears; or
- the evidence boundary would be violated.

No discrepancy is accepted as close enough. Record a linked blocking issue and
keep both application backends read-only until it is resolved.

## 1. Resolve inherited production readiness

Before touching content:

1. Complete the production Cognito administrator's first-password change and
   recovery checks. Require exactly one enabled, verified-email administrator
   and confirm self-sign-up still fails.
2. Correct every required server-only Vercel AWS value and scope. Replace the
   write-only session secret rather than guessing its prior value.
3. Prove authenticated `GET /health` from an allowed deployment, then repeat
   missing, malformed, modified, wrong-audience, and expired-token failures.
4. Approve issue #21's delayed billing observation and recovery path.
5. Approve a stable Preview origin. Add it only through a reviewed production
   CloudFormation change set, use the exact `/auth/callback` and `/` logout URLs,
   and reject wildcard or ephemeral Vercel origins.

Do not use the Production hostname as a substitute for the required Preview
acceptance deployment. Do not add AWS credentials to Vercel.

## 2. Freeze and approve the final source

The single administrator announces a write freeze and records its UTC start
time privately and in redacted form in the evidence ledger. From that instant,
do not create, edit, delete, publish, upload, detach, seed, restore, or run a
service-role mutation against Supabase. Record every known write-capable path
and confirm it is inactive. Merely avoiding the normal UI while another writer
remains possible is not a freeze.

If the Supabase project is reachable after the freeze:

1. Export a fresh version 1 JSON backup through the authenticated Supabase admin.
2. Store two unchanged copies in approved private locations outside the
   repository. Record their size and SHA-256 and prove the copies are identical.
3. Run the validator without `--expect-known-baseline` when the filename is not
   the known June filename.
4. Dry-run the migration against that exact file and hash.
5. Compare every count, warning code, numeric anomaly ID, projected item count,
   post ID, deterministic post hash, draft state, and null-image count with the
   issue #20 rehearsal. Explain and approve every difference before proceeding.

If the Supabase project is unreachable, the June 18 backup may become the final
source only after the owner confirms there were no later edits in any browser,
export, local copy, seed, integration, or other store. Record the reachability
failure, that approval, and the full June SHA-256 privately. Revalidate the file
with the known baseline:

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

Omit `--expect-known-baseline` for a fresh export. Never rename a fresh export
to the known June filename to make the baseline pass.

## 3. Bind the empty production target

Use a fresh short-lived operator session and keep the resolved identifiers in
the private terminal only:

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

Require `CREATE_COMPLETE` or `UPDATE_COMPLETE`, `ACTIVE`, `PAY_PER_REQUEST`,
deletion protection, string `PK`/`SK` keys, matching account/Region ARN fields,
and a strongly consistent count of zero. Re-resolve all values immediately
before execute; do not reuse an approximate CloudFormation item count.

## 4. Execute once and reconcile

Review the final private dry-run manifest. Type both production confirmations
with the exact resolved values:

```text
MIGRATE prod <account-id>/eu-west-1/<table-name> <64-character-sha256>
ALLOW PRODUCTION <account-id>/eu-west-1/<table-name> <64-character-sha256>
```

Execute with concurrency two:

```bash
ADMINTONIBOVER_CUTOVER_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

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
  --concurrency 2
```

Add `--expect-known-baseline` only when the approved source is the June file.
Require completed verification with no missing, mismatched, or extra content
fingerprints. Compare source and target post IDs and deterministic hashes;
counts for posts, summaries, categories, keywords, slug locks, translations,
references, and reference segments; timestamps; draft/publication state; and
both null image roles. The known June outcome is 100 drafts, zero published
posts, and 100 null main plus 100 null thumbnail roles.

Repeat the exact execute command. It must write zero items and classify every
planned item as unchanged. Keep `ADMIN_DATA_BACKEND=supabase` and preserve the
write freeze throughout import and reconciliation.

## 5. Read-only Preview acceptance

Deploy the reviewed commit to the approved fixed Vercel Preview origin with
`ADMIN_DATA_BACKEND=aws` and `ADMIN_CSP_MODE=enforce`. Before opening the UI,
record the **pre-write rollback checkpoint**: the Supabase source is frozen,
the AWS import is reconciled, and no AWS content mutation has occurred. At this
point only, rollback may set the Preview/Production backend flag to `supabase`
because both stores still represent the same approved source.

Without using any create, edit, delete, publish, image mutation, or bulk action:

- complete Cognito sign-in and authenticated health;
- list all pages and exercise title, status, category, image-state, ordering,
  pagination, and reset filters;
- open representative short and long posts, both languages, post 64's known
  incomplete English translation, keywords, references, dates, and taxonomy;
- verify the backup download contract and exactly 100 missing main plus 100
  missing thumbnail roles for the June source;
- confirm anonymous, cross-origin, wrong-origin, conflict, malformed-body,
  oversize, expired-session, and upstream-error paths fail safely; and
- log out and prove the authenticated data is no longer accessible.

Any test requiring a mutation waits for the next stage. Remove the Preview AWS
flag after acceptance if Production is not promoted immediately.

## 6. Production switch and source-of-truth checkpoint

Recheck the freeze, accepted commit, Vercel scopes, stack/table identity, source
hash, reconciled counts, application backup, and current cost baseline. Set the
Production backend to `aws`, keep CSP enforcement on, and deploy once.

Choose one draft and make the smallest reversible text-only edit. Do not publish
it and do not upload an image in the same action. Verify the returned version,
refresh the page, reopen the post, and prove the edit persists. Download and
validate an AWS version 2 backup immediately.

The accepted mutation timestamp is the **AWS becomes source of truth**
checkpoint. Record it before any further change. After this timestamp, never set
Production writes back to Supabase without first freezing AWS and completing an
approved AWS-to-Supabase reconciliation.

Next, upload one allowed image to one missing slot on that test post. Verify the
owned private S3 object and post attachment, confirm the text and other image
slot are unchanged, then remove or replace it only through the documented admin
workflow if the acceptance plan requires reversal.

## 7. Backup restore acceptance

Preserve the post-edit AWS backup unchanged outside the repository. Restore it
only into a new empty disposable development table using a reviewed recovery
tool and the procedure in `aws-admin-backup-and-utilities.md`. Bind the account,
Region, table ARN, key schema, and zero pre-count; recompute the item digest;
write bounded batches; then strongly scan, sort, and compare the digest, entity
counts, revision, and one repository read. Never merge it into an active table.

Delete only the disposable infrastructure through its reviewed stack after the
evidence is accepted. A successful disposable restore does not authorize a
production restore.

## 8. Rollback after the checkpoint

Before the first AWS mutation, rollback is: set the affected Vercel deployment
back to `ADMIN_DATA_BACKEND=supabase`, redeploy the reviewed build, verify one
read, keep the AWS table intact, and investigate. The migration runner's
run-scoped rollback is allowed only while every imported item is unchanged and
the exact source/target confirmations are re-approved.

After the first accepted AWS mutation, normal rollback is:

1. stop all AWS admin mutations and record the read-only start time;
2. export and validate an AWS backup;
3. keep Production pointed at AWS read-only or take the admin offline;
4. revert or repair application code/config without enabling Supabase writes;
5. repair or restore AWS through a separately reviewed recovery procedure; and
6. repeat read-only acceptance before restoring AWS writes.

Returning writes to Supabase now requires a separate approved AWS-to-Supabase
reconciliation. A feature-flag toggle alone would lose post-checkpoint changes.
Never delete the Supabase project, database, image metadata, or old storage as
part of this issue. Keep them intact for at least the approved rollback window;
14 days is the recommended minimum. Do not change Astro or deployment webhooks.

## 9. Cost observations and completion

Check CloudWatch errors/throttles and AWS Bills immediately, after 24 hours, and
after 7 days. Billing data is delayed; record observation times and redacted
results, not account or resource identifiers. Unexpected continuing cost or
service usage blocks completion and gets a linked issue.

Complete the evidence ledger only after every automated and manual check,
security impact, cost impact, pre-write rollback, post-write rollback, final
source approval, and source-of-truth timestamp is recorded.

# Offline JSON-to-DynamoDB migration runner

This runbook covers the operator-safe migration command introduced by issue
#19. The command reads one validated Supabase JSON backup from a user-supplied
local path and creates the current DynamoDB post, taxonomy, summary, reference,
and slug-lock item shapes. It never calls Supabase, S3, an image URL, Lambda, or
the public admin API.

The real backup and every generated migration manifest are private operational
artifacts. Keep the backup outside the repository; do not copy it into
`.artifacts/`. Store manifests outside the repository or under the ignored
`.artifacts/` directory and never attach an unredacted manifest to a pull
request.

## Safety model

- Dry run is the default. It does not create an AWS client or make an AWS
  request.
- The expected SHA-256 is checked before JSON parsing or transformation. The
  source hash and modification time are checked again after validation.
- An invalid relationship, source anomaly classified as an error, item at or
  above 350 KiB, duplicate target key, or oversized transaction stops the run
  before an AWS write.
- A write requires an explicit environment, 12-digit AWS account ID, Region,
  table name, and an exact typed confirmation.
- A production environment or table name containing `prod` requires the
  separate `--allow-production` switch and a second exact confirmation.
- `DescribeTable` binds the confirmed table to its ARN, AWS account, Region,
  `ACTIVE` status, and the `PK`/`SK` key schema before migration access begins.
- Existing migration items are skipped only when their complete deterministic
  item hash matches. A conflicting item or an unexpected post/taxonomy item
  aborts preflight rather than being overwritten.
- Writes use bounded conditional transactions. The default concurrency is two
  and the supported range is one through eight.
- Rollback deletes only unchanged items containing the exact migration source
  and run ID. It refuses migration-owned items changed after import and never
  performs a table-wide or wildcard delete.

The migration run ID is deterministic for the exact source hash and AWS target.
Repeating an interrupted or completed command with those inputs therefore
resumes or verifies the same run rather than creating a second import.

## Prepare private inputs

Use the repository-pinned Node.js and pnpm versions. Create the ignored local
artifact directory if it does not already exist:

```bash
mkdir -p .artifacts
```

Calculate the backup hash independently and retain the full 64-character
hexadecimal value:

```bash
shasum -a 256 /absolute/path/to/tonibover-backup-2026-06-18T08-46-31.json
```

Do not put AWS credentials, the backup, or a manifest in a command example,
shell script, issue, commit, CI variable, or pull-request artifact. Use only the
operator's temporary deployment credentials in the normal AWS credential
provider chain.

## Dry run

The dry run validates the known source counts, builds every target item and
content hash, records the post 64 warning, applies the size guards, and writes a
private manifest. It performs zero AWS requests:

```bash
pnpm migration:run -- \
  --input /absolute/path/to/tonibover-backup-2026-06-18T08-46-31.json \
  --input-sha256 <64-character-sha256> \
  --manifest .artifacts/migration-run-manifest-dry-run.json \
  --expect-known-baseline
```

For the approved backup, confirm the manifest reports 100 posts, 200
translations, 3 categories, 94 keywords, 1,321 references, 229 legacy image
metadata rows, 100 drafts, zero published posts, 100 null main images, 100 null
thumbnail images, and only the documented incomplete English translation for
post 64. The exact reference-segment count comes from the dry run.

The private manifest contains no post titles, bodies, slugs, keywords, or
references. It does retain legacy owner and image inventory metadata for local
reconciliation, including source image URLs, and must therefore remain private.

## Execute in disposable development

Create an empty disposable development table with the reviewed
[`migration-disposable-table.template.json`](../../infra/migration-disposable-table.template.json).
The template creates exactly one generated-name, on-demand Standard DynamoDB
table. It does not create S3, Cognito, Lambda, API Gateway, IAM, networking, or
logging resources. Do not use the AWS Console to create the table and do not
target the production or active development content table for the acceptance
exercise.

Use short-lived development credentials in the normal AWS credential provider
chain. Confirm the identity locally and keep the full account ID private:

```bash
aws sts get-caller-identity
```

Validate the template, create a change set without executing it, and inspect
the proposed resource before continuing:

```bash
aws cloudformation validate-template \
  --region eu-west-1 \
  --template-body file://infra/migration-disposable-table.template.json

aws cloudformation create-change-set \
  --region eu-west-1 \
  --stack-name admintonibover-issue-19-disposable-dev \
  --change-set-name issue-19-create-disposable-table \
  --change-set-type CREATE \
  --template-body file://infra/migration-disposable-table.template.json \
  --parameters ParameterKey=PurposeConfirmation,ParameterValue=ISSUE-19-DISPOSABLE-DEV \
  --description "Issue 19 disposable migration acceptance table"

aws cloudformation wait change-set-create-complete \
  --region eu-west-1 \
  --stack-name admintonibover-issue-19-disposable-dev \
  --change-set-name issue-19-create-disposable-table

aws cloudformation describe-change-set \
  --region eu-west-1 \
  --stack-name admintonibover-issue-19-disposable-dev \
  --change-set-name issue-19-create-disposable-table \
  --query 'Changes[].ResourceChange.{Action:Action,LogicalId:LogicalResourceId,Type:ResourceType,Replacement:Replacement}' \
  --output table
```

The change set must contain exactly one `Add` action for
`MigrationAcceptanceTable` of type `AWS::DynamoDB::Table`, with no replacement.
Stop if it contains any other action or resource. Execute only that reviewed
change set:

```bash
aws cloudformation execute-change-set \
  --region eu-west-1 \
  --stack-name admintonibover-issue-19-disposable-dev \
  --change-set-name issue-19-create-disposable-table

aws cloudformation wait stack-create-complete \
  --region eu-west-1 \
  --stack-name admintonibover-issue-19-disposable-dev
```

Read the generated table name from the stack and verify that it is empty and
matches the runner's target contract:

```bash
ADMINTONIBOVER_MIGRATION_TABLE="$(aws cloudformation describe-stacks \
  --region eu-west-1 \
  --stack-name admintonibover-issue-19-disposable-dev \
  --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue | [0]" \
  --output text)"

aws dynamodb describe-table \
  --region eu-west-1 \
  --table-name "$ADMINTONIBOVER_MIGRATION_TABLE" \
  --query 'Table.{Status:TableStatus,BillingMode:BillingModeSummary.BillingMode,DeletionProtection:DeletionProtectionEnabled,KeySchema:KeySchema,ItemCount:ItemCount}' \
  --output json

aws dynamodb scan \
  --region eu-west-1 \
  --table-name "$ADMINTONIBOVER_MIGRATION_TABLE" \
  --consistent-read \
  --select COUNT
```

Require `ACTIVE`, `PAY_PER_REQUEST`, deletion protection `false`, `PK`/`SK`
string keys, and a scan count of zero. Use the generated table name in the
execute and rollback commands below.

The normal execute confirmation has this exact form:

```text
MIGRATE <environment> <account-id>/<region>/<table-name> <64-character-sha256>
```

Run the import with the exact values substituted:

```bash
pnpm migration:run -- \
  --execute \
  --input /absolute/path/to/tonibover-backup-2026-06-18T08-46-31.json \
  --input-sha256 <64-character-sha256> \
  --manifest .artifacts/migration-run-manifest-dev.json \
  --expect-known-baseline \
  --environment dev \
  --account-id <12-digit-account-id> \
  --region eu-west-1 \
  --table <exact-disposable-table-name> \
  --confirmation "MIGRATE dev <account-id>/eu-west-1/<table-name> <sha256>"
```

Review the manifest's verification section. It must have `valid=true`, no
missing, mismatched, or extra record fingerprints, identical source/target post
hashes, 100 drafts, zero published posts, and 100 null values for each image
role. Run the exact command a second time; it must report zero written items and
all planned items unchanged.

If a run stops midway, rerun the exact command. Do not change the input path
contents, expected hash, target, or tool version. Complete transactions are
verified and skipped; missing transactions are resumed.

## Run-scoped rollback

Rollback requires the same input, hash, and target so the runner can reconstruct
the exact expected keys and content. Copy the run ID from the private manifest.
The confirmation has this exact form:

```text
ROLLBACK <run-id> <account-id>/<region>/<table-name>
```

```bash
pnpm migration:run -- \
  --rollback-run-id <exact-run-id> \
  --input /absolute/path/to/tonibover-backup-2026-06-18T08-46-31.json \
  --input-sha256 <64-character-sha256> \
  --manifest .artifacts/migration-run-manifest-rollback.json \
  --expect-known-baseline \
  --environment dev \
  --account-id <12-digit-account-id> \
  --region eu-west-1 \
  --table <exact-disposable-table-name> \
  --confirmation "ROLLBACK <run-id> <account-id>/eu-west-1/<table-name>"
```

Confirm that unrelated items remain. Rerun execute and verify that the same
items and hashes are restored.

After the acceptance exercise and evidence capture are complete, roll back the
migration data first. The `SYSTEM`/`REVISION` audit item intentionally remains,
so verify that zero items still carry migration ownership metadata:

```bash
aws dynamodb scan \
  --region eu-west-1 \
  --table-name "$ADMINTONIBOVER_MIGRATION_TABLE" \
  --consistent-read \
  --filter-expression 'attribute_exists(#migration)' \
  --expression-attribute-names '{"#migration":"migration"}' \
  --select COUNT
```

Then delete only the named disposable stack:

```bash
aws cloudformation delete-stack \
  --region eu-west-1 \
  --stack-name admintonibover-issue-19-disposable-dev

aws cloudformation wait stack-delete-complete \
  --region eu-west-1 \
  --stack-name admintonibover-issue-19-disposable-dev
```

Confirm that `describe-stacks` returns a not-found error for that exact stack.
Do not delete the active development or production stack.

Rollback is not the cutover recovery mechanism after the first accepted AWS
admin mutation. Once migrated content changes, the runner refuses deletion of
the changed item. Follow the source-of-truth and reconciliation procedure in
ADR 0001 instead.

## Production guard

Production is not part of the issue #19 disposable-table acceptance test. When
an approved cutover later invokes the same reviewed tool, both the normal
confirmation and this second exact confirmation are required:

```text
ALLOW PRODUCTION <account-id>/<region>/<table-name> <64-character-sha256>
```

Supply it with both `--allow-production` and `--production-confirmation`. Keep
`ADMIN_DATA_BACKEND=supabase` until import reconciliation is accepted. Freeze
Supabase writes before taking the final backup, and never restore Supabase
writes by a feature-flag change after the first accepted AWS mutation.

## Evidence for review

Attach only redacted evidence:

- complete local and CI command results;
- source and transformed counts;
- warning codes and numeric record IDs;
- item-type counts, post IDs, and deterministic hashes;
- missing/mismatched/extra fingerprint counts;
- first-run and retry write counts;
- rollback and restore counts;
- AWS target checks with the account ID redacted; and
- cost and security impact statements.

Never attach the backup, manifest, content, slugs, image URLs, user UUIDs,
credentials, tokens, or full AWS account ID.

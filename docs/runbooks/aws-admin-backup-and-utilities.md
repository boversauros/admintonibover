# AWS admin backup and utility parity

Issue: [#17](https://github.com/boversauros/admintonibover/issues/17)

This runbook covers the authenticated AWS backup download and the guarded
publish-all action. Production restore execution is intentionally out of scope;
it belongs to the cutover/recovery work. The procedure below is a development
rehearsal and the compatibility contract carried by every backup.

## Backup contract

The admin menu calls the same-origin
`GET /api/aws/backup` route. The server-held Cognito session calls the protected
API Gateway `GET /backup` route; the browser receives no AWS credentials or
Cognito access token.

The response must match
[`dynamodb-backup-v2.schema.json`](../schemas/dynamodb-backup-v2.schema.json)
and uses this filename:

```text
admintonibover-aws-backup-<dev|prod>-<YYYY-MM-DDTHH-MM-SSZ>.json
```

The document contains:

- schema version, normalized UTC export time, and source environment;
- exact total, per-entity, excluded-item, and scan-page counts;
- the data revision and a SHA-256 digest of the ordered `items` array;
- post aggregates, post summaries, reference segments, slug locks, categories,
  keywords, and the data-revision record; and
- key/table schema and an explicit empty-table restore requirement.

The archive excludes transient `IDEMPOTENCY` and `MEDIA_UPLOAD` records. Both
server and browser validation reject unsupported entity types, duplicate keys,
count or revision mismatches, malformed timestamps, incompatible metadata,
credentials, token/secret fields, account identifiers, and AWS signed URLs.
The browser recomputes the SHA-256 digest and checks the exact environment-based
filename before creating a local file. A truncated, partial, incorrectly named,
or invalid response therefore never reaches the download callback.

## Development restore rehearsal

Do not write this archive over an active table and do not use this procedure to
restore production. A real restore requires a separately reviewed recovery
change, an approved maintenance window, a rollback decision, and explicit
account/table verification.

Use an empty, isolated development table with string partition key `PK` and
string sort key `SK`:

1. Preserve the downloaded file unchanged. Verify its name matches its
   `environment` and `exportedAt` fields.
2. Validate the document against the v2 JSON schema. Reject unknown fields or a
   newer schema/table version rather than attempting a partial restore.
3. Recompute `SHA-256(JSON.stringify(items))`; compare it with
   `manifest.sha256`. Confirm `items.length`, each entity count, the revision,
   and unique `PK`/`SK` pairs match the manifest.
4. Confirm the destination table exists in the intended development account,
   has only the `PK`/`SK` string key schema, and returns zero items from a
   strongly consistent scan. Stop if it is not empty.
5. Use `pnpm backup:restore` to marshal each JSON item with the AWS SDK document
   client and write bounded batches of at most 25 items. The command retries
   only `UnprocessedItems` with bounded backoff. Never delete, replace, or merge
   destination records to make the import succeed.
6. Strongly scan every destination page. Sort by `PK` then `SK`, recompute the
   digest and counts, and compare all manifest values. Read one post aggregate
   and its summary through the repository boundary before considering the
   rehearsal successful.
7. Delete the isolated rehearsal table only through its reviewed infrastructure
   change. Keep the original archive according to the recovery retention policy.

The legacy `pnpm migration:run` command consumes the retired relational backup
format and must not be used with a v2 AWS backup.

### Recovery command

First validate and hash the archive without AWS access. Keep both output files
private; `.artifacts/` and downloaded backup filenames are ignored by Git.

```bash
pnpm backup:restore -- \
  --input /absolute/private/path/admintonibover-aws-backup-prod-<timestamp>.json \
  --manifest .artifacts/issue-23-backup-validation-private.json
```

Create one stack from
`infra/backup-recovery-disposable-table.template.json`. Its run ID must match
`^issue-23-[a-z0-9-]{8,40}$`; use the same value for the stack parameter, stack
tag, table tag, restore command, evidence, and cleanup. Before restore, require
that the stack has exactly one `AWS::DynamoDB::Table` resource and that its
status is `CREATE_COMPLETE`.

```bash
aws cloudformation create-stack \
  --region eu-west-1 \
  --stack-name <unique-disposable-stack-name> \
  --template-body file://infra/backup-recovery-disposable-table.template.json \
  --parameters \
    ParameterKey=PurposeConfirmation,ParameterValue=ISSUE-23-BACKUP-RESTORE \
    ParameterKey=RecoveryRunId,ParameterValue=<issue-23-run-id> \
  --tags \
    Key=Project,Value=admintonibover \
    Key=Environment,Value=dev \
    Key=Purpose,Value=ISSUE-23-BACKUP-RESTORE \
    Key=RecoveryRunId,Value=<issue-23-run-id> \
  --on-failure DELETE

aws cloudformation wait stack-create-complete \
  --region eu-west-1 \
  --stack-name <unique-disposable-stack-name>
```

Resolve the generated table name and current 12-digit account ID privately.
The restore command independently checks the table ARN, account, Region,
`ACTIVE` status, string `PK`/`SK` schema, on-demand billing, disabled deletion
protection, project/development/purpose tags, exact run tag, and an empty
strongly consistent scan. It hard-refuses production-looking table names.

```bash
pnpm backup:restore -- \
  --execute \
  --input /absolute/private/path/admintonibover-aws-backup-prod-<timestamp>.json \
  --manifest .artifacts/issue-23-recovery-private.json \
  --run-id <issue-23-run-id> \
  --account-id <12-digit-account-id> \
  --region eu-west-1 \
  --table <generated-disposable-table-name> \
  --confirmation "RESTORE <issue-23-run-id> <account-id>/eu-west-1/<table-name> <manifest-items-sha256>"
```

Require `status: completed`, exact item and per-entity counts, equal revisions,
equal canonical source/target digests, zero missing/mismatched/extra items, and
successful representative aggregate and list reads. If any check fails, do not
retry against another table or edit the archive; retain the failed private
manifest and delete only the same run-bound disposable stack.

After evidence is accepted, re-read the stack parameters, tags, and sole table
resource. Delete the exact stack, wait for `stack-delete-complete`, and confirm
both stack and table return not-found. Never issue item-level deletes against a
shared table as rehearsal cleanup.

The archive excludes transient idempotency and upload-intent records by design,
so a successful readback equals `manifest.itemCount`, not the raw source-table
scan count. Private S3 objects are not embedded in the JSON archive; image keys
remain references to separately protected object storage.

## Publish-all safety contract

The AWS UI first counts every draft through the paginated admin read API. The
dialog shows that exact number and its confirm button remains disabled until the
administrator types the same number. The mutation sends `published: true`,
`confirmation: "PUBLISH_ALL"`, and `expectedCount` with an idempotency key.

Before any write, Lambda recounts drafts and returns `BULK_COUNT_MISMATCH` if
the count changed. It then stores the exact `{id, version}` target set in the
pending idempotency record. If a request stops after a partial write, retrying
the same key resumes that target set, skips targets already published, and does
not absorb drafts created later. A completed retry replays the stored result.
The browser finally recounts drafts and reports zero, remaining/new drafts, or a
reconciliation warning instead of assuming success.

Bulk publication remains capped at 100 posts. Manual acceptance must use
fictional development data; do not publish the imported acceptance dataset.

## Automated evidence

Run with the pinned Node.js and pnpm versions:

```bash
pnpm run ci
pnpm format:check
```

The issue-specific tests cover multi-page uniqueness, schema/digest checks,
transient-record exclusion, secret/signed-URL rejection, truncated download
rejection, filename/environment binding, exact typed confirmation, stale-count
rejection before writes, partial-failure retry, completed replay, reconciliation
reads, run-bound recovery target checks, empty-table enforcement, unprocessed
item retry, exact restore reconciliation, and generated infrastructure
configuration.

## Manual acceptance

Use only redacted, fictional data in the development environment:

1. With the AWS flag enabled, download a multi-page backup. Confirm the browser
   reports the environment and item count and the filename matches the manifest.
2. Run the isolated restore rehearsal above and record only counts, digest
   match, and pass/fail status. Do not attach the archive or its post content.
3. Open publish-all and confirm a wrong number keeps the action disabled. Type
   the displayed exact count, then cancel unless the dataset was created solely
   for this destructive test.
4. On a disposable dataset, interrupt one bulk request after at least one write
   and retry with the same key. Confirm original targets publish once, a draft
   created between attempts remains a draft, and the final displayed count is
   reconciled.
5. Download a second AWS backup and confirm it validates independently with the
   expected environment, item count, and digest.

## Security, cost, and rollback

Security remains inside the existing authenticated admin boundary. The AWS API
and Lambda repeat authorization checks, responses are `no-store`, browser
requests are same-origin, validation fails closed, and structured logs contain
counts and correlation IDs rather than archive content, tokens, signed URLs, or
personal data. A downloaded archive contains application content and must be
stored as sensitive recovery material.

There are no new persistent AWS resources or IAM permissions. Incremental cost
is the existing API Gateway/Lambda request plus strongly consistent DynamoDB
scan/read/write usage during downloads, reconciliation, and an explicitly
approved rehearsal. No scheduled backup, S3 archive, queue, or production
restore is added.

For application rollback, stop mutations, download and validate an AWS backup,
then take the admin read-only or offline before deploying the previously
reviewed application. Code rollback does not invalidate already
downloaded v2 archives; restore tooling must continue to select behavior from
the archive schema and compatibility metadata.

# AWS admin backup and utility parity

Issue: [#17](https://github.com/boversauros/admintonibover/issues/17)

This runbook covers the authenticated AWS backup download and the guarded
publish-all action. Production restore execution is intentionally out of scope;
it belongs to the cutover/recovery work. The procedure below is a development
rehearsal and the compatibility contract carried by every backup.

## Backup contract

With `ADMIN_DATA_BACKEND=aws`, the admin menu calls the same-origin
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

With `ADMIN_DATA_BACKEND=supabase`, the menu continues to run the existing
Supabase JSON export. The AWS route rejects the request before any upstream
call, so the rollback flag cannot accidentally read AWS data.

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
5. Using a reviewed one-off recovery tool, marshal each JSON item with the AWS
   SDK document client and write bounded batches of at most 25 items. Retry only
   `UnprocessedItems` with backoff. Never delete, replace, or merge destination
   records to make the import succeed.
6. Strongly scan every destination page. Sort by `PK` then `SK`, recompute the
   digest and counts, and compare all manifest values. Read one post aggregate
   and its summary through the repository boundary before considering the
   rehearsal successful.
7. Delete the isolated rehearsal table only through its reviewed infrastructure
   change. Keep the original archive according to the recovery retention policy.

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
reads, and generated infrastructure configuration.

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
5. Switch the flag to Supabase, restart, and download the legacy backup. Confirm
   no `/api/aws/backup` or AWS bulk request occurs.

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

For application rollback, set `ADMIN_DATA_BACKEND=supabase` and redeploy the
previously reviewed application. This restores the legacy utility path without
deleting AWS data or resources. Code rollback does not invalidate already
downloaded v2 archives; restore tooling must continue to select behavior from
the archive schema and compatibility metadata.

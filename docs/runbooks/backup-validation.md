# Offline Supabase backup validation

This runbook validates a user-supplied version 1 JSON backup before any
Supabase-to-AWS migration. The command is local, offline, and read-only. It does
not import data, contact Supabase or AWS, make S3 requests, probe image URLs, or
download image binaries.

The validator implements the aggregate and size contract in
[ADR 0001](../adr/0001-admin-only-aws-data-security-contract.md).

## Private input boundary

Keep the full backup outside the repository and pass its absolute path at run
time. Files matching `tonibover-backup-*.json` and local validation reports are
ignored as defense in depth, but ignore rules do not replace review.

The committed fixture at
`tests/fixtures/backup-validator/sanitized-backup.json` is fictional. Never
replace it with a subset copied from the personal backup.

The report contains counts, numeric legacy IDs, hashes, size estimates, issue
codes, and source-integrity results. It never contains post titles, bodies,
slugs, keywords, references, image URLs, user UUIDs, or the Supabase project
URL. Duplicate slugs are represented by a one-way fingerprint.

## Run the validator

Use the pinned Node.js and pnpm versions, then run:

```bash
pnpm install --frozen-lockfile
pnpm backup:validate -- \
  --input /absolute/path/to/tonibover-backup-2026-06-18T08-46-31.json \
  --report /tmp/backup-validation-report.json \
  --expect-known-baseline
```

The known June filename enables the baseline automatically. The explicit flag
is retained in operator commands so a renamed copy cannot silently skip that
check.

Exit codes:

- `0`: structurally valid, relationships valid, and every post is representable;
- `1`: a machine-readable report was produced with validation errors; and
- `2`: invalid arguments, unreadable input, invalid JSON, or report-write
  failure.

The report path must differ from the input path. Omitting `--report` writes only
the JSON report to standard output.

## What is validated

- required tables and manifest counts;
- required and nullable fields, types, lengths, IDs, dates, and timestamps;
- primary/composite uniqueness and all representable foreign keys;
- bilingual post/category relationships and keyword-language consistency;
- normalized per-language slug locks, with empty incomplete slugs skipped;
- embedded Supabase URLs in content and references;
- draft/published state, incomplete translations, image-link inventory, and
  null migration image fields;
- the documented June 2026 counts and post 64 anomaly;
- exact ADR-shaped post aggregates and deterministic reference ordering; and
- DynamoDB item and transaction representability before any AWS request.

Image table rows and source image foreign keys are counted only as legacy
inventory. Every projected post has `mainImage=null` and `thumbImage=null`.

## Size and segmentation contract

The estimator counts UTF-8 attribute names and string values, approximate
number bytes, Boolean/null bytes, and List/Map element overhead using the AWS
documented rules. An item at or above 358,400 bytes fails the 350 KiB guard.

References remain inline when the aggregate is below the guard. Otherwise:

- the aggregate sets `referenceStorage=segmented`;
- `referenceSegmentCounts` records the Catalan and English segment counts;
- the translation maps omit their inline `references`;
- segment keys use
  `PK=POST#<id>` and `SK=REFS#<language>#<six-digit-sequence>`;
- each segment stores `postId`, `language`, `sequence`, `version`, and ordered
  `references`; and
- segments target 100 KiB and must independently remain below 350 KiB.

Transaction checks conservatively reserve seven non-segment actions for the
aggregate, list summary, catalogs, revision, and idempotency record, then add
the actual slug locks and reference segments. They also reserve 64 KiB for
non-aggregate item bytes. The estimate fails above 100 actions or 4 MiB. It
performs no DynamoDB marshalling or request.

## Determinism and source-integrity evidence

The report contains no current-generation timestamp. Its migration validation
run ID derives from the source SHA-256. The input basename, SHA-256, byte length,
and nanosecond modification time are stable inputs to the report.

The command reads the source before and after validation and fails if either
the SHA-256 or modification time changes. To prove byte equivalence manually:

```bash
pnpm backup:validate -- --input /absolute/path/to/backup.json \
  --report /tmp/backup-report-a.json
pnpm backup:validate -- --input /absolute/path/to/backup.json \
  --report /tmp/backup-report-b.json
cmp /tmp/backup-report-a.json /tmp/backup-report-b.json
```

Review only redacted counts, issue codes, size summaries, and integrity booleans
in pull-request evidence. Do not attach the private input or full local report.

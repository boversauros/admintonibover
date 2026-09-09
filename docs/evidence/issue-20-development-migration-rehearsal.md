# Issue 20 development migration rehearsal evidence

This ledger contains only redacted, review-safe evidence. The source backup,
absolute path, unredacted SHA-256, AWS account and resource identifiers, post
content, owner IDs, image metadata, downloaded AWS backup, and full validator
and migration manifests remain private and ignored by Git.

## Status

| Gate                                 | Result      | Evidence                                                                               |
| ------------------------------------ | ----------- | -------------------------------------------------------------------------------------- |
| Latest `main`                        | Pass        | Branch created from `80cd8c5`                                                          |
| Dependencies #19, #15, #16, #17, #18 | Pass        | All dependency work is present in `main`                                               |
| Source located                       | Pass        | Expected June 18 filename; private absolute path                                       |
| Offline validation                   | Pass        | Validator v1; zero errors; known baseline matched                                      |
| Offline dry-run                      | Pass        | Migration tool/schema v1; no AWS client created                                        |
| AWS identity/target preflight        | Pass        | Account/Region/stack/table binding and table configuration match; identifiers redacted |
| Data decision sign-off               | Pending     | All four decisions require explicit operator approval                                  |
| Dev content baseline                 | Blocked     | Pre-count is 8, including 7 pre-existing content entities; see #44                     |
| Execute and reconcile                | Not started | Blocked by #44, Bills baseline, and data sign-off gates                                |
| Rollback and re-import               | Not started | Depends on accepted execute/reconciliation                                             |
| Admin UI                             | Not started | Depends on accepted import into development                                            |
| Immediate and 24-hour cost checks    | Not started | Depends on the bounded rehearsal window                                                |

No AWS write, production access, Supabase write, S3 upload, or publication was
performed while preparing this ledger.

## Required sign-off

- [ ] The June 18 backup is approved as a rehearsal source only, not as the
      automatic production source.
- [ ] Post 64's incomplete English title and slug remain flagged and are not
      invented.
- [ ] The 229 image rows are metadata only; no image binary is claimed as
      migrated.
- [ ] All 100 posts remain drafts.

## Recorded inputs and versions

| Field                                  | Redacted value                                     |
| -------------------------------------- | -------------------------------------------------- |
| Source filename                        | `tonibover-backup-2026-06-18T08-46-31.json`        |
| Source SHA-256                         | `875442fc…`                                        |
| Source size                            | 1,089,785 bytes                                    |
| Validator/report version               | 1 / 1                                              |
| Migration tool/schema/manifest version | 1 / 1 / 1                                          |
| Dry-run ID                             | `migration-01accd6bff4a447d8a049b75`               |
| AWS Region                             | `eu-west-1`                                        |
| AWS account/table                      | Resolved from STS and exact stack output; redacted |
| Dev table pre-count                    | 8                                                  |
| Bills baseline                         | Pending manual review                              |

## Validation and dry-run

Commands completed successfully from `80cd8c5`:

```text
pnpm backup:validate -- --input <private-path> --report <private-path> --expect-known-baseline
pnpm migration:run -- --input <private-path> --input-sha256 <private-sha256> --manifest <private-path> --expect-known-baseline
```

| Check                                      |                         Result |
| ------------------------------------------ | -----------------------------: |
| Validation errors                          |                              0 |
| Validation warnings                        |                             72 |
| `INCOMPLETE_TRANSLATION` warnings          | 1 (post 64 English title/slug) |
| `SLUG_REQUIRES_NORMALIZATION` warnings     |                             71 |
| Known baseline                             |                          Match |
| Languages                                  |                              2 |
| Categories / translations                  |                          3 / 6 |
| Image metadata rows                        |                            229 |
| Posts / translations                       |                      100 / 200 |
| Keywords / post-keyword links              |                       94 / 598 |
| References                                 |                          1,321 |
| Draft / published posts                    |                        100 / 0 |
| Projected null main / thumbnail roles      |                      100 / 100 |
| Projected inline / segmented posts         |                        100 / 0 |
| Largest projected item                     |                   16,693 bytes |
| Projected post / summary / slug-lock items |                100 / 100 / 199 |

The source hash and modification time matched across the validator's two reads.
The dry-run created no AWS client and made no network request.

## Development target and billing baseline

- [x] STS identity account matches the approved private development account.
- [x] `admintonibover-dev` is the exact stack and is `UPDATE_COMPLETE`.
- [x] Table name comes directly from the stack `TableName` output.
- [x] Table ARN account and Region match STS and `eu-west-1`.
- [x] Table is active, on-demand, deletion-protected, and uses string `PK`/`SK`.
- [x] Consistent dev table pre-count is recorded privately and redacted here.
- [ ] Bills baseline contains no unexplained service.

The first read-only STS attempt on 2026-09-08 stopped on an expired authorization
grant. After reauthentication on 2026-09-09, the complete read-only target
preflight passed. The table contained eight records: one `DATA_REVISION`, three
`POST`, two `POST_SUMMARY`, and two `SLUG_LOCK` records. None is migration-owned.
The seven content records would make the migrator fail closed and would prevent
the required exact 100-post result. They resolve to the committed issue-9 tracer
fixture, the committed issue-11 media fixture, and one later admin-created
development fixture whose generated ID remains private. The latter two are
published and have both image roles attached, so cleanup also requires an exact
S3 disposition. [Issue #44](https://github.com/boversauros/admintonibover/issues/44)
blocks execution until the remaining provenance and safe disposition are
approved. No record or object was changed during the inspection.

## Execute and reconciliation

- [ ] Exact development target re-resolved immediately before execution.
- [ ] Execute completed; written/unchanged/transaction counts recorded.
- [ ] Verification valid; missing/mismatched/extra fingerprints all zero.
- [ ] Source and target contain the same 100 post IDs.
- [ ] All 100 source/target deterministic post hashes match.
- [ ] Entity counts match the dry-run plan.
- [ ] Draft/published counts are exactly 100/0.
- [ ] Null main/thumbnail counts are exactly 100/100.
- [ ] Post 64 English remains the sole incomplete translation.
- [ ] Idempotent replay writes zero items and reports all planned items unchanged.

## Admin UI

- [ ] AWS-backed list, pagination, search, category, draft, image-state, and sort filters pass.
- [ ] Post 64 and a reference-heavy post retain both languages and all modeled fields.
- [ ] A fictional null-image draft can be created, edited, and reverted without publication or upload.
- [ ] Categories and keywords display and save correctly on the fictional draft.
- [ ] AWS backup download passes private schema/count/digest/key/page checks.
- [ ] Imported inventory is exactly 100 missing-main and 100 missing-thumbnail slots.
- [ ] Publish-all shows 101 with the isolation fixture and 100 after cleanup; both dialogs are cancelled.

## Rollback and re-import

- [ ] Run-scoped rollback completes with its counts recorded.
- [ ] Only imported records disappear; the unrelated fictional draft remains.
- [ ] No remaining record carries the imported run ID.
- [ ] Fictional draft is removed through the authenticated admin after isolation proof.
- [ ] Re-import completes with the same deterministic run ID.
- [ ] Sorted post/hash evidence is byte-identical across imports.
- [ ] Final idempotent replay writes zero items and verifies all items unchanged.

## Metrics, security, and cost

- [ ] DynamoDB capacity/conflict/conditional/throttle/system-error metrics reviewed.
- [ ] API Gateway request/error/latency metrics reviewed.
- [ ] Lambda invocation/error/throttle/duration metrics reviewed.
- [ ] S3 shows no object upload caused by the rehearsal.
- [ ] Cognito activity is limited to the intended administrator session.
- [ ] Immediate Bills review contains no unexplained service.
- [ ] Bills reviewed again after at least 24 hours with no unexplained service.

Security impact: this documentation adds no permission, credential, public
endpoint, resource, or data path. The eventual rehearsal uses the existing
server-mediated Cognito admin boundary and direct, confirmed DynamoDB migration
tool. Supabase remains unmodified and the browser receives no AWS credential or
Cognito bearer token.

Expected monthly cost impact: USD 0 fixed monthly delta. The bounded rehearsal
will add request-based API Gateway, Lambda, DynamoDB, Cognito, and backup-read
usage in the existing development stack; exact observed usage and rounded cost
remain pending. No S3 object upload, scheduled job, provisioned capacity, PITR,
or new resource is authorized.

Rollback: before an accepted AWS admin mutation, use the migration runner's
exact run-scoped rollback. It deletes only unchanged records owned by the run
and leaves unrelated records intact. It never deletes the shared table or
stack. After the final accepted re-import, application rollback remains
`ADMIN_DATA_BACKEND=supabase`; do not run the migration rollback after imported
content has been changed through the AWS admin.

## Discrepancies

- [Issue #44: reconcile pre-existing dev content before rehearsal](https://github.com/boversauros/admintonibover/issues/44) — open and blocking.

Every future discrepancy requires a linked blocking issue; it must not be
waived as close enough.

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
| Data decision sign-off               | Pass        | Operator confirmed all four decisions on 2026-09-09                                    |
| Bills baseline                       | Pass        | Operator confirmed no unexplained service on 2026-09-09                                |
| Dev content baseline                 | Pass        | Private backup validated; 7 fixture records and 4 owned images removed; #44 closed     |
| Execute and reconcile                | In progress | Data reconciliation and idempotency pass; admin UI pending                             |
| Rollback and re-import               | Pass        | Run-scoped isolation, deterministic re-import, and final idempotency verified          |
| Admin UI                             | In progress | List/edit and exact missing-image inventory pass; remaining matrix checks pending      |
| Immediate and 24-hour cost checks    | Not started | Depends on the bounded rehearsal window                                                |

No production access, Supabase write, S3 upload, or publication has occurred.
The only pre-import writes were the approved exact fixture cleanup and revision
increment in the development stack.

## Required sign-off

- [x] The June 18 backup is approved as a rehearsal source only, not as the
      automatic production source.
- [x] Post 64's incomplete English title and slug remain flagged and are not
      invented.
- [x] The 229 image rows are metadata only; no image binary is claimed as
      migrated.
- [x] All 100 posts remain drafts.

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
| Dev table pre-count                    | 8 before cleanup; 1 revision item after cleanup    |
| Bills baseline                         | Pass; operator confirmed no unexplained service    |

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
- [x] Bills baseline contains no unexplained service.

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

On 2026-09-09 the operator approved a private backup followed by exact removal
of the three development fixtures and their owned image objects. An initial
attempt stopped before creating an artifact because the AWS authorization grant
had expired. After a fresh login, backup schema v2 validated all eight table
items with zero exclusions. Four image objects totaling 8,418,905 bytes were
downloaded privately and every local digest matched its S3 checksum. Cleanup
and restoration dry-runs each bound exactly seven records and four images to
the same private backup while preserving the revision item.

The confirmed cleanup transaction then removed exactly seven fixture records,
incremented the revision, and deleted only the four checksum-matched image
objects. A final consistent scan found one `DATA_REVISION` and zero content
entities. [Issue #44](https://github.com/boversauros/admintonibover/issues/44)
was closed with redacted evidence. The validated backup and exact restoration
metadata remain private under `.artifacts/`.

## Execute and reconciliation

- [x] Exact development target re-resolved immediately before execution.
- [x] Execute completed: 496 writes in 102 transactions, zero unchanged.
- [x] Verification valid; missing/mismatched/extra fingerprints all zero.
- [x] Source and target contain the same 100 post IDs.
- [x] All 100 source/target deterministic post hashes match; sorted evidence
      digest begins `a587c574…`.
- [x] Entity counts match the dry-run plan: 100 posts, 100 summaries, 199 slug
      locks, 3 categories, 94 keywords, and zero reference segments.
- [x] Draft/published counts are exactly 100/0.
- [x] Null main/thumbnail counts are exactly 100/100.
- [x] Post 64 English remains the sole incomplete translation.
- [x] Idempotent replay writes zero items and reports all 496 planned items unchanged.

## Admin UI

- [ ] AWS-backed list, pagination, search, category, draft, image-state, and sort filters pass.
- [ ] Post 64 and a reference-heavy post retain both languages and all modeled fields.
- [ ] A fictional null-image draft can be created, edited, and reverted without publication or upload.
- [ ] Categories and keywords display and save correctly on the fictional draft.
- [ ] AWS backup download passes private schema/count/digest/key/page checks.
- [x] Imported inventory is exactly 100 missing-main and 100 missing-thumbnail slots.
- [ ] Publish-all shows 101 with the isolation fixture and 100 after cleanup; both dialogs are cancelled.

The operator confirmed that an imported post could be opened, edited, and
saved as expected. The authenticated AWS admin also created the fictional
draft used for rollback isolation, displayed it as the 101st draft with null
images, retained it as the sole post through rollback, deleted it after the
isolation check, and displayed the restored 100-post missing-image inventory
after re-import. No screenshot or recording is required by the operator.

## Rollback and re-import

- [x] Run-scoped rollback completes with its counts recorded.
- [x] Only imported records disappear; the unrelated fictional draft remains.
- [x] No remaining record carries the imported run ID.
- [x] Fictional draft is removed through the authenticated admin after isolation proof.
- [x] Re-import completes with the same deterministic run ID.
- [x] Sorted post/hash evidence is byte-identical across imports.
- [x] Final idempotent replay writes zero items and verifies all items unchanged.

The exact development identity, CloudFormation table output, active table
status, Region, account, source file, and source hash were re-resolved before
each write operation. The rollback deleted all 496 migration-owned items in
102 transactions with zero protected items. A consistent post-rollback scan
found zero items carrying the run ID and exactly one unrelated post: the
fictional isolation draft. After the draft was deleted through the admin, the
re-import restored 496 items in 102 transactions with the same deterministic
run ID. Verification found 100 drafts, zero published posts, 100 null main
images, 100 null thumbnails, and zero missing, mismatched, or extra migration
records. The first and second sorted 100-post hash files are byte-identical.
The final replay wrote zero items, classified all 496 items as unchanged, and
completed valid verification with zero discrepancies.

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

- [Issue #44: reconcile pre-existing dev content before rehearsal](https://github.com/boversauros/admintonibover/issues/44) — resolved and closed after validated backup and exact cleanup.

Every future discrepancy requires a linked blocking issue; it must not be
waived as close enough.

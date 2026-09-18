# Migration history

This is the durable, redacted record of the completed move to AWS. It is not an
operational runbook; current procedures are in [operations.md](operations.md).

## Decisions

- The administration runtime uses only Cognito, API Gateway/Lambda, DynamoDB,
  and private S3. The former integration, feature flag, client/auth/storage
  adapters, dependencies, configuration, schemas, and rollback path were
  permanently removed in PR #46.
- No dual write was introduced. AWS is the only production source of truth and
  the former system is not an incident rollback target.
- The approved source was the immutable 2026-06-18 private JSON export. Its
  complete hash, source path, content, and manifests remain private.
- Imported IDs and timestamps were preserved. The DynamoDB model added list
  summaries, bilingual slug locks, taxonomy items, and a data-revision record.
- Source image rows were metadata only; no image binary was available or
  claimed as migrated. Imported main and thumbnail slots therefore started
  empty and are repaired through the private S3 workflow.

## Rehearsal and cutover

The development rehearsal validated the source with zero errors and 72 known
warnings, imported and reconciled it, proved a run-scoped rollback left an
unrelated post untouched, re-imported byte-equivalent content, and completed a
zero-write idempotency replay.

The owner approved the same source for production on 2026-09-12. The production
target was empty, active, on-demand, deletion-protected, and bound to the exact
account and `eu-west-1` Region. The guarded import wrote 496 content/index items
in 102 transactions. The table then contained 497 items because it also stores
one `DATA_REVISION` record. Reconciliation found no missing, mismatched, or
extra records, and the repeated import wrote zero items.

The imported result contained:

| Data                                     |           Count |
| ---------------------------------------- | --------------: |
| Posts / translations                     |       100 / 200 |
| Categories / category translations       |           3 / 6 |
| Keywords / post-keyword relationships    |        94 / 598 |
| References                               |           1,321 |
| Draft / published posts                  |         100 / 0 |
| Post aggregates / summaries / slug locks | 100 / 100 / 199 |

Production application acceptance confirmed that the migrated content and
admin workflows worked as expected. Subsequent AWS backup recovery on
2026-09-15 downloaded 497 restorable records at revision 102, restored them in
20 bounded batches to a new run-tagged development table, matched counts and
canonical digests exactly, parsed representative aggregates and summaries
through the production repository code, and deleted the disposable stack.

## Known source limitations

- Post 64 has the sole incomplete English title/slug. No translation was
  invented; its incomplete state remains explicit and its empty slug has no
  lock.
- All imported posts were drafts at cutover.
- The 229 historical image records did not include recoverable binaries. S3
  object recovery is separate from the DynamoDB JSON archive.
- AWS backup v2 excludes transient idempotency and upload-intent records by
  design and is point-in-time only at download. There is no scheduled backup,
  continuous cross-Region copy, or DynamoDB PITR in the current cost posture.

## Repository cleanup audit

Issue #47 reviewed every tracked top-level area before deletion:

| Area                                                    | Classification               | Decision                                                                                            |
| ------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `app/`, live `components/`, `lib/`                      | Runtime                      | Keep the reachable AWS admin, auth, domain, proxy, and recovery graph                               |
| `infra/`                                                | Infrastructure/deploy inputs | Keep sources, parameter examples, recovery template, and reproducible generated upload artifacts    |
| `tests/`                                                | Validation                   | Keep production/recovery behavior; remove only tests for deleted tracer and one-time importer paths |
| `docs/`                                                 | Operations/history/schema    | Merge durable facts into the four canonical documents and retain backup schema v2                   |
| `scripts/`                                              | Operator/build tooling       | Keep secret/artifact checks, infrastructure/Lambda synthesis, and AWS backup recovery               |
| `plans/`, issue evidence/runbooks                       | Historical                   | Delete after consolidation here                                                                     |
| migration/tracer UI, fixtures, starter assets           | Completed/dead               | Delete after reference and framework-convention review                                              |
| `.agents/`, `skills-lock.json`, local instruction files | Agent support/user-owned     | Leave unchanged                                                                                     |

The removed test mapping is one-to-one: tracer client/infrastructure projection
tests covered a UI and contract superseded by the admin read client/API tests;
legacy validator/importer and disposable-migration-table tests covered a
completed one-way operation superseded operationally by AWS backup-v2 recovery
tests. No production, recovery, CI, or deployment behavior depended on those
files.

The cleanup deleted 74 tracked files, added the three canonical documents, and
renamed two files to retain the shared DynamoDB hashing helper and identify the
formatter configuration as ESM. The tracked repository size fell from 414 to
343 files, a 17% reduction. The review removes 14,211 lines and adds 710. It
also removes one direct runtime dependency (`react-datepicker`) and two one-time
package commands. The focused suite now has 122 tests instead of 156; the 34
removed tests belonged only to the deleted tracer/importer/legacy backup paths.

This is a repository-only change: the generated environment templates retain
36 resources and the same service, capacity, retention, and authorization
posture, so there is no new AWS cost or data-plane migration. The smaller code
and dependency surface reduces maintenance and supply-chain exposure without
relaxing the secret, browser-artifact, IAM, origin, or recovery controls.
Rollback is a Git revert of this cleanup; content rollback still uses a
validated AWS backup and a new reviewed target, never the former content
system. No live AWS resource or production record is changed by the cleanup.

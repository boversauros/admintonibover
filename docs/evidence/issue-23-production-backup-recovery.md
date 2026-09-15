# Issue 23 production backup recovery evidence

Issue: [#23](https://github.com/boversauros/admintonibover/issues/23)

Run date: 2026-09-15 (UTC)

Scope: one production AWS backup download, validation, restore into a new empty
disposable development table, exact reconciliation, application-layer reads,
and run-bound cleanup. The archive, full hashes, account ID, generated resource
names, content, and private run manifests remain outside Git.

## Result

The recovery rehearsal passed. The temporary CloudFormation stack and its only
DynamoDB table were deleted after acceptance, and independent AWS lookups
returned stack-not-found and table-not-found.

| Check                 | Accepted result                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Admin backup download | `prod`, 497 restorable records                                                                                                                                     |
| Backup contract       | v2 schema, manifest, filename, and embedded digest valid                                                                                                           |
| Source revision       | 102                                                                                                                                                                |
| File SHA-256          | `e1d2aa5b358…` (complete value private)                                                                                                                            |
| Manifest item SHA-256 | `a18b20399979…` (complete value private)                                                                                                                           |
| Recovery target       | New run-tagged development stack with exactly one table                                                                                                            |
| Preflight             | Correct ARN/account/Region, `ACTIVE`, string `PK`/`SK`, on-demand billing, deletion protection off, exact project/purpose/run tags, strongly consistent count zero |
| Restore               | 497 writes in 20 batches; zero unprocessed-item retries                                                                                                            |
| Reconciliation        | 497 expected and 497 read back; equal canonical digest; revision 102; zero missing, mismatched, or extra records                                                   |
| Application reads     | Three representative aggregates and three list summaries parsed through `DynamoDbPostRepository`                                                                   |
| Cleanup               | Exact run-bound stack deleted; stack and table independently confirmed absent                                                                                      |

## Entity reconciliation

| Entity              |  Backup | Restored |
| ------------------- | ------: | -------: |
| `DATA_REVISION`     |       1 |        1 |
| `POST`              |     100 |      100 |
| `POST_SUMMARY`      |     100 |      100 |
| `REFERENCE_SEGMENT` |       0 |        0 |
| `SLUG_LOCK`         |     199 |      199 |
| `CATEGORY`          |       3 |        3 |
| `KEYWORD`           |      94 |       94 |
| **Total**           | **497** |  **497** |

The canonical source and target digests were identical (`2d176d2171cb…`, full
value private). The restored target was never connected to the shared
development or production admin API. Instead, representative reads used the
same DynamoDB repository and domain parsers as the admin API, avoiding a risky
temporary repoint of shared infrastructure. The authenticated production admin
also rendered the source records and reported the same 100-record inventory;
exact target reconciliation proves the disposable copy contained identical
application data.

## Safety and cost

- The production table was read only by the authenticated backup endpoint.
- The restore command hard-refused production-looking targets and required an
  exact confirmation bound to source digest, run ID, account, Region, and table.
- The target had to carry exact development, purpose, project, and run tags and
  be empty before the first write.
- Cleanup deleted the CloudFormation stack, not records in any shared table.
- Incremental cost was limited to one backup read, 497 on-demand writes,
  strongly consistent verification reads, and a short-lived empty-schema
  DynamoDB table. No persistent resource or scheduled observation was added.
- The owner explicitly waived the seven-day observation for this issue.

## Repeatability

The reviewed procedure is now implemented by `pnpm backup:restore`, backed by
the run-scoped disposable table template and focused automated tests. The
legacy relational migration command is explicitly excluded from AWS backup-v2
recovery.

# Issue 22 production content cutover evidence

This ledger contains only redacted, review-safe evidence. Full AWS account and
resource identifiers, Vercel values, source paths and hashes, credentials,
tokens, cookies, content, backups, manifests, logs, and private screenshots stay
outside Git or under the ignored `.artifacts/` directory.

## Status

| Gate                                 | Result  | Evidence                                                                                                                                    |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Latest `main`                        | Pass    | Branch created from current `origin/main` at `eafd3dd` on 2026-09-11                                                                        |
| Dependency #21                       | Pass    | Merged to `main` as PR #45                                                                                                                  |
| AWS-only runtime cleanup             | Pass    | Legacy client/auth/storage/API branches, feature flag, dependencies, schema migrations, seeder, environment examples, and UI naming removed |
| Local automated verification         | Pass    | Secret scan, dev/prod infrastructure validation, lint, typecheck, 151 tests, webpack production build, and browser-artifact audit           |
| Production stack/table preflight     | Pass    | Stack created; table active, on-demand, deletion-protected, string `PK`/`SK`, account/Region binding matched                                |
| Production table empty               | Pass    | Fresh strongly consistent scan returned zero items on 2026-09-11                                                                            |
| June source candidate                | Pass    | Private file outside repository; 1,089,785 bytes; SHA-256 prefix `875442fca1f6`                                                             |
| June source integrity                | Pass    | Fresh validation reports unchanged hash and modification time; hash matches issue #20 rehearsal                                             |
| June baseline and dry-run            | Pass    | Validator/tool/schema v1; zero errors; 100 projected posts and 496 planned items                                                            |
| Final source approval                | Pending | Owner must confirm no newer edits or exports exist and approve the full hash privately                                                      |
| Production Cognito administrator     | Pass    | Exactly one enabled, confirmed, verified-email user observed read-only                                                                      |
| Production application               | Partial | Public root is HTTP 200, login redirects, and CSP is AWS-only; authenticated health remains unverified                                      |
| Fixed Preview origin                 | Blocked | No fixed Preview origin is currently approved; ephemeral origins are prohibited                                                             |
| Production migration/reconciliation  | Pending | No production content write has occurred                                                                                                    |
| AWS source-of-truth checkpoint       | Pending | Requires the first accepted reversible production mutation                                                                                  |
| Image upload and backup restore      | Pending | Waits for post-checkpoint acceptance                                                                                                        |
| Immediate/24-hour/7-day observations | Pending | No cutover usage window has started                                                                                                         |

No AWS content write, S3 upload, Vercel change, Cognito change, publication,
Astro change, webhook change, or destructive cloud operation was made during the
initial evidence pass or AWS-only code cleanup.

## Automated verification

The AWS-only cleanup passed the repository secret scan, current dev and
production infrastructure validation, typecheck, all 151 tests, a webpack
production build, and the browser-artifact audit across 1,950 generated files.
Lint completed with zero errors and seven existing warnings in unrelated UI
utilities. The default local Turbopack build reached its CSS worker but could
not bind a sandboxed local port; the equivalent webpack production build
passed, and the GitHub validation workflow remains the authoritative
Turbopack result for the pushed commit.

## Offline source evidence

The June 18 candidate is byte-identical to the issue #20 rehearsal source. Fresh
validation on 2026-09-11 reports:

- 100 posts and 200 translations;
- 3 categories and 6 category translations;
- 94 keywords and 598 post-keyword relationships;
- 1,321 references and 229 legacy image metadata rows;
- 100 drafts and zero published posts;
- the sole known incomplete English translation for post 64;
- no embedded legacy-service URLs;
- 100 projected null main images and 100 projected null thumbnails;
- zero segmented-reference posts and a largest projected item of 16,693 bytes;
  and
- 72 reviewed warnings and zero validation errors.

The dry-run reports tool/schema version 1 and 496 planned items: 100 post
aggregates, 100 summaries, 199 slug locks, 3 categories, 94 keywords, and zero
reference segments. It made no AWS request.

The retired service endpoint did not resolve, so it could not provide a current
count or export. This establishes unreachability only; it does not prove that
the June backup is the latest source. The owner subsequently directed that the
integration be removed permanently. The June backup still needs explicit final
source approval before production import.

## AWS preflight

A fresh read-only preflight on 2026-09-11 used explicit Region `eu-west-1` and
resolved the table from the `admintonibover-prod` CloudFormation output. The
stack is created; the table is active, on-demand, deletion-protected, and has
string `PK` hash plus `SK` range keys. Table ARN account and Region fields match
the current operator identity and explicit Region. A strongly consistent scan
returned zero items. Identifiers remain private.

## Production application observation

A fresh unauthenticated check on 2026-09-11 returned HTTP 200 for the production
root, a redirect from `/auth/login`, and an enforced AWS-only CSP. The empty
table means the site is not yet an accepted content cutover. Keep the admin
mutation-free or offline until source approval and import are complete.

A read-only Cognito query found exactly one enabled, confirmed, verified-email
administrator. This does not by itself prove browser login, recovery, token
claims, or authenticated health.

The PR #46 deployment is ready, but its generated branch URL is ephemeral and
returned a deployment-protection redirect. It proves the build deployed, not
the fixed-origin authenticated acceptance required by this issue.

## Required owner approvals

- [ ] Confirm there were no content, taxonomy, keyword, reference, image
      metadata, or publication edits after the June 18 export in any browser,
      export, local file, integration, script, or other store; or provide the
      newer source.
- [ ] Approve the exact final source and complete SHA-256 privately.
- [ ] Approve one fixed HTTPS Vercel Preview origin and its exact callback and
      logout URLs.
- [ ] Complete Cognito browser login/recovery, token-claim, and authenticated
      health acceptance inherited from issue #21.
- [ ] Approve the AWS-only pre-write and post-write rollback procedures.

## Acceptance checklist

- [ ] Final source hash, validation, dry-run, migration manifest,
      reconciliation, and approvals are recorded and redacted.
- [ ] Exactly the approved source posts exist with no duplicates and all
      expected IDs, relationships, hashes, timestamps, and counts.
- [ ] Imported publication state matches the source; the June source would be
      exactly 100 drafts and zero published posts.
- [ ] Read-only fixed Preview acceptance passes sign-in, list/detail/filter,
      representative long posts, backup, missing-image counts, authorization,
      error handling, and logout without a mutation.
- [ ] One reversible production edit persists and its acceptance timestamp is
      recorded as **AWS becomes source of truth**.
- [ ] One missing image is uploaded without changing post text or the other
      image slot.
- [ ] A post-edit AWS backup validates and restores into an empty disposable
      development table with matching digest, counts, and revision.
- [ ] Unauthorized, origin, conflict, validation, payload-size, session, and
      upstream-error tests pass in production.
- [ ] Immediate, 24-hour, and 7-day observations show no unexplained error,
      throttle, service usage, or cost.

## Security, cost, and rollback impact

The runtime now has one AWS path. Removing the legacy integration eliminates
its browser client, public build-time variables, dormant auth listener, direct
database/storage mutations, service-specific dependencies, and feature-flag
rollback path. The offline validator and deterministic one-way importer remain
because the approved legacy JSON backup is still the only migration source.

The production table remains empty. Expected fixed monthly cost from the code
cleanup is USD 0. Future migration and acceptance use the existing request-based
stack; redacted observations will replace estimates here.

Rollback now makes AWS read-only or takes the admin offline, exports an AWS
backup, repairs or restores AWS, and repeats read-only acceptance. The retired
service is not a write or rollback target.

## Open discrepancies

- **Final-source provenance:** the June source validates and matches rehearsal
  but lacks owner confirmation that no later edit or export exists.
- **Production posture:** Cognito has one confirmed administrator and the public
  AWS login route is configured, but authenticated health is not proven while
  the production table is empty.
- **Preview origin:** approve one exact HTTPS origin and update production
  CORS/Cognito configuration through a reviewed change set before acceptance.

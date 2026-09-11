# Issue 22 production content cutover evidence

This ledger contains only redacted, review-safe evidence. Full AWS account and
resource identifiers, Supabase and Vercel values, source paths and hashes,
credentials, tokens, cookies, content, backups, manifests, logs, and private
screenshots remain outside Git or under the ignored `.artifacts/` directory.

## Status

| Gate                                 | Result  | Evidence                                                                                                            |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------- |
| Latest `main`                        | Pass    | Branch created from current `origin/main` at `eafd3dd` on 2026-09-11                                                |
| Dependency #21                       | Pass    | Merged to `main` as PR #45                                                                                          |
| Production stack/table preflight     | Pass    | `CREATE_COMPLETE`; table active, on-demand, deletion-protected, string `PK`/`SK`, account/Region binding matched    |
| Production table empty               | Pass    | Fresh strongly consistent scan returned zero items on 2026-09-11                                                    |
| June source candidate located        | Pass    | Private path outside repository; 1,089,785 bytes; SHA-256 prefix `875442fca1f6`                                     |
| June source integrity                | Pass    | Fresh validation reports unchanged hash and modification time; SHA-256 matches issue #20 rehearsal                  |
| June baseline and dry-run            | Pass    | Validator/tool/schema v1; zero errors; known baseline matched; 100 projected posts and 496 total planned items      |
| Supabase reachability                | Blocked | Configured project hostname returned DNS `ENOTFOUND` on IPv4 and IPv6 on 2026-09-11                                 |
| Final source approval                | Pending | June candidate cannot be final until the owner confirms no later edits or exports exist elsewhere                   |
| Supabase write freeze                | Pending | Freeze start and all inactive write-capable paths must be recorded before final export/approval                     |
| Production Cognito administrator     | Pass    | Fresh read-only check finds exactly one enabled, confirmed, verified-email user                                     |
| Production Vercel/backend guard      | Partial | Public root is HTTP 200, login redirects, and CSP is AWS-only; authenticated health is unverified                   |
| Fixed Preview origin                 | Blocked | No fixed Preview origin is currently approved; ephemeral Preview origins are prohibited                             |
| Local automated gate                 | Pass    | Secrets, dual infrastructure validation, lint, typecheck, 157 tests, webpack build, and browser artifact audit pass |
| GitHub/Vercel checks                 | Pass    | PR #46 Validate, dependency review, Vercel deployment, and Preview Comments checks pass                             |
| Production migration/reconciliation  | Pending | No production content write has occurred                                                                            |
| Pre-write rollback checkpoint        | Pending | Requires reconciled import and accepted read-only Preview                                                           |
| AWS source-of-truth checkpoint       | Pending | Requires first accepted reversible Production AWS mutation                                                          |
| Image upload and AWS backup restore  | Pending | Waits until the post-checkpoint acceptance stage                                                                    |
| Immediate/24-hour/7-day observations | Pending | No cutover usage window has started                                                                                 |

No Supabase write, AWS content write, S3 upload, Vercel change, Cognito change,
publication, Astro change, webhook change, or destructive operation was made by
this branch during the initial evidence pass.

## Initial offline source evidence

The locally held June 18 candidate is byte-identical to the issue #20 rehearsal
source. Fresh validation on 2026-09-11 reports:

- 100 posts and 200 translations;
- 3 categories and 6 category translations;
- 94 keywords and 598 post-keyword relationships;
- 1,321 references and 229 legacy image metadata rows;
- 100 drafts and zero published posts;
- the sole known incomplete English translation for post 64;
- zero embedded Supabase URLs;
- 100 projected null main images and 100 projected null thumbnails;
- zero segmented-reference posts and a largest projected item of 16,693 bytes;
  and
- 72 reviewed warnings and zero validation errors.

The fresh dry-run reports tool/schema version 1 and 496 planned items: 100 post
aggregates, 100 summaries, 199 slug locks, 3 categories, 94 keywords, and zero
reference segments. It made no AWS request.

The configured Supabase endpoint could not be used for a current count/export
comparison because its hostname does not resolve. This establishes current
unreachability only; it does not prove that the June backup is the latest source.

## Initial AWS preflight

A fresh read-only preflight on 2026-09-11 used explicit Region `eu-west-1` and
resolved the table from the `admintonibover-prod` CloudFormation output. The
stack is `CREATE_COMPLETE`; the table is `ACTIVE`, `PAY_PER_REQUEST`, deletion
protected, and has string `PK` hash plus `SK` range keys. Table ARN account and
Region fields match the current operator identity and explicit Region. A
strongly consistent scan returned zero items. Identifiers remain private.

## Production application observation

A fresh unauthenticated public check on 2026-09-11 returned HTTP 200 for the
Production root, a redirect from `/auth/login`, and an enforced AWS-only CSP.
The Production application therefore appears to have been switched to the AWS
backend outside this branch after issue #21's recorded rollback. The empty table
means this is not yet an accepted content cutover. Keep the admin mutation-free
and restore the required pre-cutover posture, or explicitly approve an amended
maintenance posture, before the final source and import stages proceed.

A read-only Cognito query found exactly one enabled, `CONFIRMED`, verified-email
administrator. This resolves the prior forced-password-change state, but it does
not by itself prove browser login, recovery, token claims, or authenticated
health.

The PR #46 Vercel deployment is ready, but its generated branch URL is ephemeral
and returned a deployment-protection redirect. It is evidence that the build
deployed, not the fixed-origin, authenticated, read-only acceptance required by
this issue.

## Automated verification

The local secret check, dual infrastructure synthesis/validation, lint,
typecheck, all 157 tests, an explicit Next.js 16 webpack production build, and
the browser artifact audit pass. Lint retains the existing 31 warnings and no
errors. The default Turbopack build cannot create its local CSS worker in this
execution environment because binding a local port is prohibited; the same
commit's GitHub `Validate` job passes with the default build. GitHub dependency
review and both Vercel status checks also pass.

## Required owner approvals

- [ ] Confirm there were no Supabase content, taxonomy, keyword, reference,
      image metadata, or publication edits after the June 18 export in any
      browser, export, local file, integration, script, or other store; or
      provide the later source.
- [ ] Approve the exact final source and full SHA-256 privately.
- [ ] Start the Supabase write freeze and record its UTC timestamp.
- [ ] Approve one fixed HTTPS Vercel Preview origin and its exact callback and
      logout URLs.
- [ ] Complete Cognito browser login/recovery, token-claim, and authenticated
      health acceptance inherited from issue #21.
- [ ] Approve the pre-write and post-write rollback procedures in the cutover
      runbook.

## Acceptance checklist

- [ ] Final source hash, freeze time, validation, dry-run, migration manifest,
      reconciliation, and approvals are recorded/redacted.
- [ ] Exactly the approved source posts exist with no duplicates and all
      expected IDs, relationships, hashes, timestamps, and counts.
- [ ] Imported publication state matches the source; the June source would be
      exactly 100 drafts and zero published posts.
- [ ] Read-only fixed Preview acceptance passes sign-in, list/detail/filter,
      representative long posts, backup, missing-image counts, authorization,
      error handling, and logout without a mutation.
- [ ] The pre-write rollback checkpoint is recorded and understood.
- [ ] One reversible Production edit persists and its acceptance timestamp is
      recorded as **AWS becomes source of truth**.
- [ ] One missing image is uploaded without changing post text or the other
      image slot.
- [ ] A post-edit AWS backup validates and restores into an empty disposable
      development table with matching digest, counts, and revision.
- [ ] Unauthorized, origin, conflict, validation, payload-size, session, and
      upstream-error tests pass in Production.
- [ ] Immediate, 24-hour, and 7-day metrics/Bills observations show no
      unexplained continuing service, error, throttle, or cost.
- [ ] Supabase data/storage remain intact for the approved rollback window and
      no Astro or deploy-webhook change occurs.

## Security, cost, and rollback impact

The initial work adds documentation and performs only local/offline validation
plus read-only AWS/Supabase transport checks. It adds no permission, endpoint,
resource, secret, browser trust, or data copy. The production table remains
empty. The live application currently selects AWS because of a configuration
change outside this branch.

Expected fixed monthly cost delta from this documentation is USD 0. Future
cutover activity uses the existing request-based production stack. Migration,
acceptance, backup, restore rehearsal, and monitoring add bounded DynamoDB,
Lambda, API Gateway, S3, Cognito, CloudWatch, and Vercel usage; actual redacted
observations will replace estimates in this ledger.

Before the first accepted AWS mutation, rollback may restore the Supabase
feature flag because the frozen source and reconciled AWS import are equivalent.
After that mutation, Supabase is not a valid write target without an approved
AWS-to-Supabase reconciliation. Normal rollback makes AWS read-only, exports an
AWS backup, repairs/restores AWS, and repeats read-only acceptance.

## Open discrepancies

- **Final-source provenance:** Supabase DNS currently fails. The June source is
  valid and matches rehearsal but lacks the required owner confirmation that no
  later edit or export exists.
- **Production application posture:** Cognito's administrator is now confirmed
  and the public AWS login route is configured, but authenticated health is not
  proven and Production already selects AWS while its table is empty. Resolve
  the pre-cutover posture before content migration.
- **Preview origin:** the production stack intentionally has no approved fixed
  Preview origin, while issue #22 requires Preview acceptance. Approve one exact
  HTTPS origin and update the production CORS/Cognito configuration through a
  reviewed change set before using it.

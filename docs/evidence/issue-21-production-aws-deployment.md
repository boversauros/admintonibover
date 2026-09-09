# Issue 21 production AWS deployment evidence

This ledger contains only redacted, review-safe evidence. Account identifiers,
ARNs, private resource names, billing details, emails,
credentials, tokens, passwords, authorization codes, Vercel secrets, private
screenshots, parameter files, and full AWS command output remain private and
ignored by Git.

## Status

| Gate                                              | Result      | Evidence                                                                                                                     |
| ------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Latest `main`                                     | Pass        | Branch created from the current `origin/main` after fetch                                                                    |
| Dependency #20                                    | Pass        | Closed and merged as PR #43                                                                                                  |
| AWS CLI                                           | Pass        | Version 2.36.40 installed locally                                                                                            |
| Operator session                                  | Pass        | Login-backed credentials resolve a 12-digit account; identifier redacted                                                     |
| Region                                            | Pass        | Every remote preflight command explicitly used `eu-west-1`; local default is intentionally not trusted                       |
| Development stack                                 | Pass        | `UPDATE_COMPLETE`                                                                                                            |
| Production stack baseline                         | Pass        | Named production stack does not exist                                                                                        |
| Lambda regional quota                             | Blocked     | Total and unreserved concurrency are both 10; reserved concurrency 2 cannot leave AWS's required 100 unreserved executions   |
| Issue/ADR concurrency agreement                   | Blocked     | Issue #21 says reserved concurrency 2; accepted ADR and current validator require no reservation plus API throttle 2/burst 4 |
| Production IaC synthesis                          | Pass        | Separate prod artifact from shared source; 36 approved resources                                                             |
| Production retention                              | Pass        | Protected table/User Pool use `Retain`; bucket uses `RetainExceptOnCreate`; all replacements retain                          |
| Production deletion protection                    | Pass        | DynamoDB and Cognito protection are hard-coded on in the prod artifact                                                       |
| Production origin contract                        | Pass        | Template accepts exact HTTPS origins only; no localhost or wildcard                                                          |
| Production Vercel origin                          | Pass        | Existing repository contract is `https://admin.tonibover.cat`; the public endpoint returned HTTP 200 on 2026-09-09           |
| Fixed Preview origin                              | None        | No fixed Preview origin is approved; ephemeral deployment URLs remain prohibited                                             |
| Pricing, account plan, credits, and spend ceiling | Pending     | Operator review required immediately before change-set creation                                                              |
| Local automated gate                              | Pass        | Secrets, dual synthesis/schema lint, lint, typecheck, 157 tests, webpack production build, browser artifacts, and audit pass |
| Default Turbopack build                           | PR pending  | Desktop sandbox denies Turbopack's local worker port; webpack build passes and GitHub CI must confirm the default build      |
| Change set                                        | Not started | No production CloudFormation write has occurred                                                                              |
| Production deployment                             | Not started | No production resource exists                                                                                                |
| Cognito administrator                             | Not started | Created only after terminal stack success                                                                                    |
| Vercel configuration                              | Not started | Backend remains Supabase                                                                                                     |
| Immediate/24-hour billing checks                  | Not started | Required after deployment                                                                                                    |

## Preflight observations

Read-only AWS preflight was performed on 2026-09-09 with the active daily-use
CLI login. The command output exposed no account identifier in the committed
record. The expected development stack is healthy, and the production stack
name is currently unused.

The regional Lambda account limit is 10 total executions with 10 currently
unreserved. AWS requires 100 executions to remain unreserved when function
concurrency is reserved. The issue's `reserved concurrency = 2` requirement is
therefore impossible in this account today. The production artifact retains
the accepted ADR behavior: no reserved or provisioned concurrency, with the
HTTP API stage limited to two requests per second and burst four. No change set
may be created until the issue contract is reconciled.

## Repository preparation

- [x] Production and development artifacts synthesize deterministically from
      `infra/dev-foundation.ts`.
- [x] The production artifact is locked to `Environment=prod`.
- [x] Production IaC hard-codes DynamoDB deletion protection on.
- [x] Production Cognito deletion protection is active.
- [x] Table, bucket, and User Pool are retained on routine deletion and
      replacement; an empty bucket can be cleaned up during initial-create
      rollback while the already-protected table/User Pool remain retained.
- [x] Production URL parameter patterns reject HTTP, localhost, wildcards, and
      incorrect callback/logout paths.
- [x] The safe parameter example records the established live Production origin
      `https://admin.tonibover.cat`, its `/auth/callback`, and root logout URL.
- [x] Development behavior and its deletion rehearsal remain unchanged.
- [x] CI is configured to schema-lint both generated artifacts.
- [x] A production deployment, verification, rollback, recovery, and deliberate
      teardown runbook is committed.
- [x] The unpublished `cfn-lint` 1.53.1 pin is corrected to the current
      published 1.46.0 release; both artifacts pass it without findings.

## Required private sign-off before a change set

- [ ] Issue #21's concurrency acceptance text matches the approved ADR and the
      observed account quota, or a separate ADR/quota change is approved.
- [x] Exact Vercel Production origin/callback/logout are recorded; no fixed
      Preview origin is included.
- [ ] Account plan, credits, expiry, root/operator MFA, and Region are rechecked.
- [ ] Current official service pricing and observed development usage are
      rechecked.
- [ ] Conservative monthly estimate and maximum accepted monthly spend are
      approved.
- [ ] Exact resource names, tags, retention policies, recovery ownership, and
      deliberate teardown path are approved.
- [ ] The local artifact SHA-256 and commit match the reviewed PR head.

## Acceptance evidence

- [ ] Change set contains exactly 36 adds using only the approved resource
      types; no modify, remove, replacement, or unexpected type exists.
- [ ] Stack reaches terminal `CREATE_COMPLETE` from the reviewed commit.
- [ ] Exactly one confirmed, enabled, verified-email administrator signs in
      with email/password without application MFA; verified-email recovery
      succeeds and self-sign-up fails.
- [ ] AWS root and operator MFA remain assigned and unchanged.
- [ ] Valid access reaches read-only health; missing/wrong/modified tokens and
      anonymous S3 requests fail; exact-origin CORS succeeds.
- [ ] DynamoDB is empty, on-demand, Standard, and deletion-protected; paid
      options and Streams/indexes are absent.
- [ ] S3 is empty and private with approved encryption, ownership, CORS,
      lifecycle, and bucket policy.
- [ ] Lambda has no VPC or reserved/provisioned concurrency; the API stage is
      throttled at 2 requests/second with burst 4; logs retain 14 days.
- [ ] IAM is limited to the exact log group, table, and approved bucket
      prefixes.
- [ ] Production finishes with `ADMIN_DATA_BACKEND=supabase`; Supabase remains
      untouched and no content/image migration or publication occurs.
- [ ] Staged deployment object and any health fixture are removed exactly.
- [ ] Immediate and 24-hour cost observations are approved with no unexplained
      continuing service or cost.
- [ ] Full recovery and deliberate teardown paths are approved.

## Security, cost, and rollback impact

Repository preparation adds no permission, credential, public endpoint, cloud
resource, or data path. Production validation now fails closed on a destructive
data-resource policy, disabled deletion protection, dev/localhost origin, or
environment mismatch. Existing application configuration remains server-only,
consistent with the installed Next.js 16 environment-variable guidance.

Current AWS cost impact is USD 0: only read-only control-plane requests were
made. No change set, S3 staging object, production stack, Cognito user, Vercel
change, Supabase write, or application-data write has occurred.

Before CloudFormation execution, rollback is removal of the branch changes and,
if later staged, deletion of only the exact issue #21 template object. After a
successful stack create, application rollback remains Supabase because the
feature flag never moves. Infrastructure teardown follows the separate,
deliberate protected-resource procedure in the production runbook.

## Discrepancies

- **Concurrency contract:** issue #21 requires reserved concurrency 2, while
  the accepted ADR prohibits it and the observed regional account quota makes
  it impossible. This blocks change-set creation until reconciled; it must not
  be waived as close enough.

# Issue 21 production AWS deployment evidence

This ledger contains only redacted, review-safe evidence. Account identifiers,
ARNs, private resource names, billing details, emails,
credentials, tokens, passwords, authorization codes, Vercel secrets, private
screenshots, parameter files, and full AWS command output remain private and
ignored by Git.

## Status

| Gate                               | Result      | Evidence                                                                                                                     |
| ---------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Latest `main`                      | Pass        | Branch created from the current `origin/main` after fetch                                                                    |
| Dependency #20                     | Pass        | Closed and merged as PR #43                                                                                                  |
| AWS CLI                            | Pass        | Version 2.36.40 installed locally                                                                                            |
| Operator session                   | Pass        | Login renewed 2026-09-10; credentials resolve a 12-digit account and identifiers remain redacted                             |
| Root-account MFA                   | Pass        | IAM account summary reports account MFA enabled; application Cognito settings do not alter it                                |
| Region                             | Pass        | Every remote preflight command explicitly used `eu-west-1`; local default is intentionally not trusted                       |
| Development stack                  | Pass        | `UPDATE_COMPLETE`                                                                                                            |
| Development stack drift            | Pass        | Fresh 2026-09-10 CloudFormation scan completed `IN_SYNC` with zero drifted resources                                         |
| Production stack baseline          | Pass        | Named production stack does not exist                                                                                        |
| Lambda regional quota              | Pass        | Total/unreserved concurrency are both 10; the approved design uses no reserved/provisioned concurrency                       |
| Issue/ADR concurrency agreement    | Pass        | Issue #21 was aligned on 2026-09-10: no reservation or VPC, plus HTTP API throttle 2 requests/second with burst 4            |
| Production IaC synthesis           | Pass        | Separate prod artifact from shared source; 36 approved resources                                                             |
| Production retention               | Pass        | Protected table/User Pool use `Retain`; bucket uses `RetainExceptOnCreate`; all replacements retain                          |
| Production deletion protection     | Pass        | DynamoDB and Cognito protection are hard-coded on in the prod artifact                                                       |
| Production origin contract         | Pass        | Template accepts exact HTTPS origins only; no localhost or wildcard                                                          |
| Production Vercel origin           | Pass        | Existing repository contract is `https://admin.tonibover.cat`; the public endpoint returned HTTP 200 on 2026-09-10           |
| Fixed Preview origin               | None        | No fixed Preview origin is approved; ephemeral deployment URLs remain prohibited                                             |
| Cognito domain prefix              | Pass        | `admintonibover-prod` was unused in `eu-west-1` when checked on 2026-09-10; availability is rechecked before deployment      |
| Development observed usage         | Pass        | Previous 31 days: 459 Lambda invocations, zero errors, and zero throttles                                                    |
| Official service pricing           | Pass        | Current AWS Lambda, HTTP API, DynamoDB, S3, Cognito, and CloudWatch pricing pages rechecked on 2026-09-10                    |
| Current AWS cost baseline          | Pass        | September month-to-date estimated unblended cost rounds to USD 0.00                                                          |
| Account plan, credits, and expiry  | Pending     | A credit offsets current usage; plan, remaining balance, and expiry need console/operator confirmation before a change set   |
| Monthly estimate and spend ceiling | Pass        | Expected cost is below USD 1/month; maximum accepted monthly spend of USD 1 approved on 2026-09-10                           |
| Local automated gate               | Pass        | Secrets, dual synthesis/schema lint, lint, typecheck, 157 tests, webpack production build, browser artifacts, and audit pass |
| Default Turbopack build            | Pass        | GitHub CI `Validate` passed on PR #45                                                                                        |
| Change set                         | Not started | No production CloudFormation write has occurred                                                                              |
| Production deployment              | Not started | No production resource exists                                                                                                |
| Cognito administrator              | Not started | Created only after terminal stack success                                                                                    |
| Vercel/backend guard               | Pass        | Live CSP remains Supabase-only and `/auth/login` returns 404, confirming the AWS backend is off                              |
| Immediate/24-hour billing checks   | Not started | Required after deployment                                                                                                    |

## Preflight observations

Read-only AWS preflight was performed on 2026-09-09 with the active daily-use
CLI login. The command output exposed no account identifier in the committed
record. The expected development stack is healthy, and the production stack
name is currently unused.

The operator renewed the AWS login on 2026-09-10. A fresh CloudFormation drift
scan found the development stack in sync with zero drifted resources. The
proposed `admintonibover-prod` Cognito domain prefix was unused in `eu-west-1`,
the production stack remained absent, and the account-level MFA summary
remained enabled. Domain availability is inherently point-in-time and is
rechecked immediately before change-set creation.

The regional Lambda account limit is 10 total executions with 10 currently
unreserved. AWS requires 100 executions to remain unreserved when function
concurrency is reserved, so reserving two was impossible in this account. On
2026-09-10, issue #21 was updated to match the accepted ADR: no reserved or
provisioned concurrency or VPC, with the HTTP API stage limited to two requests
per second and burst four.

For the 31 days ending 2026-09-10, the development Lambda recorded 459
invocations, zero errors, and zero throttles. The September month-to-date AWS
estimated unblended cost rounds to USD 0.00. The live admin origin returned an
enforced Supabase-only CSP and its Cognito login route returned 404, so the
production AWS backend remains off.

Cost Explorer shows a credit currently offsets the month-to-date usage. The
available CLI APIs do not expose the account plan, remaining credit balance, or
expiry, so those values remain a manual billing-console sign-off before the
change set.

## Pricing recheck

The following current official pages were reviewed on 2026-09-10:

- [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/): request and
  duration billing; monthly free tier includes one million requests and 400,000
  GB-seconds.
- [Amazon API Gateway pricing](https://aws.amazon.com/api-gateway/pricing/):
  HTTP APIs have no minimum fee and are billed by calls and data transfer.
- [Amazon DynamoDB pricing](https://aws.amazon.com/dynamodb/pricing/): on-demand
  Standard tables bill consumed reads/writes and storage, without provisioned
  capacity.
- [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/): storage, requests,
  and data transfer are usage-based with no minimum charge.
- [Amazon Cognito pricing](https://aws.amazon.com/cognito/pricing/): direct
  user-pool sign-in has a 10,000-MAU monthly free tier for Lite/Essentials; this
  stack permits exactly one administrator and excludes paid advanced security.
- [Amazon CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/): the
  Logs free tier includes 5 GB across ingestion, archive storage, and Insights
  scanning.

At the observed hobby usage, an empty production table/bucket, one Cognito user,
14-day logs, and no excluded paid features, the conservative expected total is
below USD 1 per month. The maximum accepted monthly spend of USD 1 was approved
on 2026-09-10. This is an estimate and approval threshold rather than a spending
cap; the operator must still confirm plan/credit eligibility before a change
set is created.

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
- [x] The safe parameter example records the point-in-time available production
      Cognito domain prefix `admintonibover-prod`.
- [x] Development behavior and its deletion rehearsal remain unchanged.
- [x] CI is configured to schema-lint both generated artifacts.
- [x] A production deployment, verification, rollback, recovery, and deliberate
      teardown runbook is committed.
- [x] The unpublished `cfn-lint` 1.53.1 pin is corrected to the current
      published 1.46.0 release; both artifacts pass it without findings.

## Required private sign-off before a change set

- [x] Issue #21's concurrency acceptance text matches the approved ADR and the
      observed account quota.
- [x] Exact Vercel Production origin/callback/logout are recorded; no fixed
      Preview origin is included.
- [ ] Account plan, credits, expiry, root/operator MFA, and Region are rechecked.
- [x] Current official service pricing and observed development usage are
      rechecked.
- [x] Conservative monthly estimate and USD 1 maximum accepted monthly spend
      are approved.
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

## Resolved discrepancies

- **Concurrency contract:** resolved on 2026-09-10 by aligning issue #21 with
  the accepted ADR and observed quota: no reserved/provisioned concurrency or
  VPC, with HTTP API throttling at 2 requests/second and burst 4.

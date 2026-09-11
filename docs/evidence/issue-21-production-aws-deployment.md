# Issue 21 production AWS deployment evidence

This ledger contains only redacted, review-safe evidence. Account identifiers,
ARNs, private resource names, billing details, emails,
credentials, tokens, passwords, authorization codes, Vercel secrets, private
screenshots, parameter files, and full AWS command output remain private and
ignored by Git.

## Status

| Gate                               | Result  | Evidence                                                                                                                     |
| ---------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Latest `main`                      | Pass    | Branch created from the current `origin/main` after fetch                                                                    |
| Dependency #20                     | Pass    | Closed and merged as PR #43                                                                                                  |
| AWS CLI                            | Pass    | Version 2.36.40 installed locally                                                                                            |
| Operator session                   | Pass    | Login renewed 2026-09-11; credentials resolve a 12-digit account and identifiers remain redacted                             |
| Operator MFA                       | Pass    | Current daily-use operator has one assigned MFA device; identifier remains private                                           |
| Root-account MFA                   | Pass    | IAM account summary reports account MFA enabled; application Cognito settings do not alter it                                |
| Region                             | Pass    | Every remote preflight command explicitly used `eu-west-1`; local default is intentionally not trusted                       |
| Development stack                  | Pass    | `UPDATE_COMPLETE`                                                                                                            |
| Development stack drift            | Pass    | Fresh 2026-09-10 CloudFormation scan completed `IN_SYNC` with zero drifted resources                                         |
| Production stack                   | Pass    | Reviewed stack reached terminal `CREATE_COMPLETE` on 2026-09-11 with all 36 resources complete                               |
| Lambda regional quota              | Pass    | Total/unreserved concurrency are both 10; the approved design uses no reserved/provisioned concurrency                       |
| Issue/ADR concurrency agreement    | Pass    | Issue #21 was aligned on 2026-09-10: no reservation or VPC, plus HTTP API throttle 2 requests/second with burst 4            |
| Production IaC synthesis           | Pass    | Separate prod artifact from shared source; 36 approved resources                                                             |
| Production retention               | Pass    | Protected table/User Pool use `Retain`; bucket uses `RetainExceptOnCreate`; all replacements retain                          |
| Production deletion protection     | Pass    | DynamoDB and Cognito protection are hard-coded on in the prod artifact                                                       |
| Production origin contract         | Pass    | Template accepts exact HTTPS origins only; no localhost or wildcard                                                          |
| Production Vercel origin           | Pass    | Existing repository contract is `https://admin.tonibover.cat`; the public endpoint returned HTTP 200 on 2026-09-10           |
| Fixed Preview origin               | None    | No fixed Preview origin is approved; ephemeral deployment URLs remain prohibited                                             |
| Cognito domain prefix              | Pass    | `admintonibover-prod` was rechecked immediately before deployment and claimed by the reviewed stack                          |
| Development observed usage         | Pass    | Previous 31 days: 459 Lambda invocations, zero errors, and zero throttles                                                    |
| Official service pricing           | Pass    | Current AWS Lambda, HTTP API, DynamoDB, S3, Cognito, and CloudWatch pricing pages rechecked on 2026-09-10                    |
| Current AWS cost baseline          | Pass    | September month-to-date estimated unblended cost rounds to USD 0.00                                                          |
| Account plan, credits, and expiry  | Pass    | Active plan, sufficient remaining credit, and future expiry confirmed privately; exact billing details are not committed     |
| Monthly estimate and spend ceiling | Pass    | Expected cost is below USD 1/month; maximum accepted monthly spend of USD 1 approved on 2026-09-10                           |
| Local automated gate               | Pass    | Secrets, dual synthesis/schema lint, lint, typecheck, 157 tests, webpack production build, browser artifacts, and audit pass |
| Default Turbopack build            | Pass    | GitHub CI `Validate` passed on PR #45                                                                                        |
| Change set                         | Pass    | Exactly 36 adds, no modify/remove/replacement, and only the approved resource types                                          |
| Production deployment              | Pass    | Single execution completed from the reviewed commit; staged template object was removed afterward                            |
| Cognito administrator              | Partial | Exactly one enabled, verified-email administrator awaits the required first-login password change; self-sign-up is blocked   |
| Vercel/backend guard               | Partial | Live application remains Supabase-only; approved server-only configuration is a manual operator handoff                      |
| Immediate/24-hour billing checks   | Partial | Immediate estimated unblended cost is USD 0.00; delayed 24-hour observation remains pending                                  |

## Preflight observations

Read-only AWS preflight was performed on 2026-09-09 with the active daily-use
CLI login. The command output exposed no account identifier in the committed
record. The expected development stack is healthy, and the production stack
name is currently unused.

The operator renewed the AWS login during preflight on 2026-09-10 and again for
deployment on 2026-09-11. A fresh CloudFormation drift scan found the
development stack in sync with zero drifted resources. The proposed
`admintonibover-prod` Cognito domain prefix was unused in `eu-west-1`, the
production stack remained absent, and the account-level MFA summary remained
enabled. Domain availability was rechecked immediately before change-set
creation.

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
operator supplied private Billing evidence for the remaining credit and expiry,
and the Free Tier account-plan API confirmed the plan is active. The balance,
date, and account identifiers are intentionally not committed.

The reviewed production change set was executed once on 2026-09-11. The stack
reached terminal `CREATE_COMPLETE`; all 36 resources completed successfully,
and the exact encrypted staging object was deleted and verified absent. No
content, image, or health fixture was written.

Post-deployment inspection confirmed an empty, on-demand Standard DynamoDB
table with deletion protection and TTL enabled on `expiresAt`; an empty private
S3 bucket with SSE-S3, bucket-owner enforcement, lifecycle cleanup, and all
public-access blocks; and a Node.js 24 ARM64 Lambda with no VPC, reserved, or
provisioned concurrency. The HTTP API uses JWT authorization on all 21 routes,
the approved two-request/second throttle with burst four, and the exact origin.
The IAM role has no managed policies and its inline policy is restricted to the
reviewed log group, table, and bucket prefixes. Logs retain 14 days.

Anonymous and malformed-token API requests returned 401, and anonymous S3
access returned 403. Exact-origin API and S3 preflight checks returned the
approved origin and methods; an unrelated origin received no allow headers.
The root-account and daily-use operator MFA counts remained unchanged.

Public Cognito self-sign-up was rejected without creating a probe account.
Exactly one enabled administrator was then created with verified email, no MFA
factor, and the required first-login password-change state. Confirmation,
recovery, and authenticated health checks remain pending until the operator
completes that first login. The immediate Cost Explorer result was an estimated
USD 0.00; AWS billing data is delayed, so the 24-hour check remains open.

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
- [x] Account plan, credits, expiry, root/operator MFA, and Region are rechecked.
- [x] Current official service pricing and observed development usage are
      rechecked.
- [x] Conservative monthly estimate and USD 1 maximum accepted monthly spend
      are approved.
- [x] Exact resource names, tags, retention policies, recovery ownership, and
      deliberate teardown path are approved.
- [x] The local artifact SHA-256 and commit match the reviewed PR head.

## Acceptance evidence

- [x] Change set contains exactly 36 adds using only the approved resource
      types; no modify, remove, replacement, or unexpected type exists.
- [x] Stack reaches terminal `CREATE_COMPLETE` from the reviewed commit.
- [ ] Exactly one confirmed, enabled, verified-email administrator signs in
      with email/password without application MFA; verified-email recovery
      succeeds and self-sign-up fails.
- [x] AWS root and operator MFA remain assigned and unchanged.
- [ ] Valid access reaches read-only health; missing/wrong/modified tokens and
      anonymous S3 requests fail; exact-origin CORS succeeds.
- [x] DynamoDB is empty, on-demand, Standard, and deletion-protected; paid
      options and Streams/indexes are absent.
- [x] S3 is empty and private with approved encryption, ownership, CORS,
      lifecycle, and bucket policy.
- [x] Lambda has no VPC or reserved/provisioned concurrency; the API stage is
      throttled at 2 requests/second with burst 4; logs retain 14 days.
- [x] IAM is limited to the exact log group, table, and approved bucket
      prefixes.
- [ ] Production finishes with `ADMIN_DATA_BACKEND=supabase`; Supabase remains
      untouched and no content/image migration or publication occurs.
- [x] Staged deployment object and any health fixture are removed exactly.
- [ ] Immediate and 24-hour cost observations are approved with no unexplained
      continuing service or cost.
- [ ] Full recovery and deliberate teardown paths are approved.

## Security, cost, and rollback impact

The production foundation now exists as the reviewed 36-resource
CloudFormation stack. It adds a private, empty data path and one prepared
administrator but no application content, public S3 access, VPC, fixed
concurrency, provisioned capacity, or excluded paid service. Existing
application configuration remains server-only and the live application still
uses Supabase.

The immediate post-deployment estimated unblended cost is USD 0.00. This is a
delayed estimate rather than a guarantee; the approved maximum remains USD 1
per month and the required 24-hour observation is still pending. No Vercel or
Supabase write has occurred.

Application rollback remains Supabase because the feature flag never moved.
Infrastructure teardown follows the separate, deliberate protected-resource
procedure in the production runbook; routine stack deletion is not an accepted
rollback for retained data-bearing resources.

## Resolved discrepancies

- **Concurrency contract:** resolved on 2026-09-10 by aligning issue #21 with
  the accepted ADR and observed quota: no reserved/provisioned concurrency or
  VPC, with HTTP API throttling at 2 requests/second and burst 4.

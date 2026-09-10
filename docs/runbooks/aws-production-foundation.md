# AWS production foundation

This runbook deploys issue
[#21](https://github.com/boversauros/admintonibover/issues/21) from the same
reviewed infrastructure source used by development. It creates an isolated
`admintonibover-prod` stack while the administration application continues to
use Supabase. It does not import content, upload application images, publish a
post, or enable the AWS backend in Production.

The operator must use the approved daily-use AWS identity with MFA. Never use
root, create an access key, or repair an application resource directly in an
AWS service console. CloudFormation owns every application resource.

## Fixed production contract

| Setting                    | Required value                                                            |
| -------------------------- | ------------------------------------------------------------------------- |
| Region                     | `eu-west-1`                                                               |
| Stack                      | `admintonibover-prod`                                                     |
| Environment                | `prod`                                                                    |
| Source                     | `infra/dev-foundation.ts`                                                 |
| Artifact                   | `infra/generated/prod-foundation.template.json`                           |
| Parameter example          | `infra/parameters/prod.example.json`                                      |
| Production origin          | `https://admin.tonibover.cat`                                             |
| Cognito domain prefix      | `admintonibover-prod`                                                     |
| Maximum accepted spend     | USD 1/month                                                               |
| Data backend at completion | `ADMIN_DATA_BACKEND=supabase`                                             |
| CSP                        | `ADMIN_CSP_MODE=enforce`                                                  |
| DynamoDB                   | Standard, on-demand, deletion protection on, no PITR or Streams           |
| S3                         | Private, SSE-S3, bucket-owner enforced, versioning off                    |
| Lambda                     | Node.js 24, ARM64, 256 MiB, 30 seconds, no VPC or provisioned concurrency |
| API throttle               | 2 requests/second, burst 4                                                |
| Logs                       | Standard log group, 14-day retention                                      |

The production template locks `Environment` to `prod` and permits HTTPS origins
only. The deletion-protected table and User Pool use `DeletionPolicy: Retain`;
the bucket uses `RetainExceptOnCreate`; all three use
`UpdateReplacePolicy: Retain`. A later routine deletion or replacement retains
every data-bearing resource. DynamoDB and Cognito deletion protection add a
second deliberate step before full teardown.

The template intentionally follows the accepted ADR by using the account's
unreserved Lambda pool. Issue #21's older `reserved concurrency = 2` wording
must be corrected before execution unless a separate ADR and quota change are
approved. AWS requires at least 100 executions to remain unreserved, so a
regional account quota below 102 cannot reserve two for this function. API
Gateway throttling remains the workload-level limit.

## Stop conditions

Do not create or execute a production change set if any of these is true:

- issue #20 is not merged or any rehearsal discrepancy is unexplained;
- the AWS account, operator identity, MFA, or `eu-west-1` Region differs from
  the approved private evidence;
- the account plan, credits or expiry, current official prices, Bills, Cost
  Explorer, or development usage has not been rechecked;
- the maximum accepted monthly estimate has not been recorded and approved;
- the exact Production and any fixed Preview origins are not approved;
- a wildcard, non-HTTPS production URL, ephemeral Preview URL, or unexpected
  callback/logout path is present;
- the local commit differs from the commit reviewed by the draft pull request;
- `admintonibover-prod` already exists unexpectedly;
- synthesis, schema validation, CI, secret scanning, or dependency audit fails;
- a change set contains `Modify`, `Remove`, replacement, an unexpected
  resource type, or a resource outside the new production stack;
- DynamoDB/S3 retention, table/User Pool deletion protection, IAM scope, CORS,
  authorizer, or public-access settings differ from this runbook;
- a VPC, NAT Gateway, endpoint, ECR repository, CloudFront distribution, WAF,
  KMS key, DAX, Stream, global table, provisioned capacity/concurrency, EFS,
  custom metric, alarm, dashboard, or other excluded paid feature appears.

Document the redacted outcome in the issue #21 evidence ledger and resolve the
gate. Do not work around it with console edits or repeated deployment attempts.

## Pre-deployment record

Record the following privately before creating the change set:

- date/time, reviewed Git commit, pull-request head commit, AWS CLI version;
- verified operator, account, Region, and current dev/prod stack statuses;
- exact stack name, Cognito domain prefix, and generated resource identifiers;
- exact Vercel Production origin and each separately approved fixed Preview
  origin, with corresponding `/auth/callback` and `/` logout URLs;
- current account plan, credits and expiry, Bills baseline, Cost Explorer
  baseline, development observed usage, and current official pricing sources;
- conservative monthly workload inputs, calculated estimate, and maximum
  acceptable monthly spend;
- production removal policies, recovery plan, and deliberate teardown owner.

Account IDs, ARNs, resource names, billing details, emails, tokens, passwords,
authorization codes, session secrets, and private screenshots remain in
ignored `.artifacts/` files or the approved private record. The committed
ledger contains only redacted outcomes.

## Build and validate the exact artifact

From a clean issue branch based on the latest `main`:

```bash
pnpm install --frozen-lockfile
pnpm infra:synth -- --environment prod
pnpm infra:validate
pnpm audit:dependencies
pnpm run ci
```

Install the pinned CloudFormation linter in the ignored artifact directory and
validate both environments:

```bash
python3 -m venv .artifacts/cfn-lint
.artifacts/cfn-lint/bin/python -m pip install --requirement infra/requirements.txt
.artifacts/cfn-lint/bin/cfn-lint \
  infra/generated/dev-foundation.template.json \
  infra/generated/prod-foundation.template.json
```

Record the commit and SHA-256 privately. Synthesis must not change the working
tree after the commit is reviewed.

```bash
git rev-parse HEAD
shasum -a 256 infra/generated/prod-foundation.template.json
git status --short
```

Create an ignored parameter file from `infra/parameters/prod.example.json`.
Replace every placeholder with the exact approved value and change
`GuardrailsEvidenceConfirmed` to `CONFIRMED` only after every gate above passes.
The final file must contain `Environment=prod`. Production DynamoDB deletion
protection is hard-coded on rather than exposed as a parameter that could be
weakened during deployment.

## Stage the reviewed template

The generated template is larger than CloudFormation's direct request-body
limit. Do not use `--template-body` and do not create an artifact bucket. Stage
one encrypted object under the existing private development bucket, use its S3
URL for the change set, and remove only that exact object after deployment.

Resolve the bucket from the known development stack rather than typing it:

```bash
ADMINTONIBOVER_TEMPLATE_SHA256="$(shasum -a 256 infra/generated/prod-foundation.template.json | awk '{print $1}')"
ADMINTONIBOVER_STAGING_BUCKET="$(aws cloudformation describe-stacks \
  --region eu-west-1 \
  --stack-name admintonibover-dev \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue | [0]" \
  --output text)"
ADMINTONIBOVER_TEMPLATE_KEY="backups/cloudformation/issue-21/${ADMINTONIBOVER_TEMPLATE_SHA256}.json"

aws s3api put-object \
  --region eu-west-1 \
  --bucket "$ADMINTONIBOVER_STAGING_BUCKET" \
  --key "$ADMINTONIBOVER_TEMPLATE_KEY" \
  --body infra/generated/prod-foundation.template.json \
  --server-side-encryption AES256 \
  --checksum-algorithm SHA256

ADMINTONIBOVER_TEMPLATE_URL="https://${ADMINTONIBOVER_STAGING_BUCKET}.s3.eu-west-1.amazonaws.com/${ADMINTONIBOVER_TEMPLATE_KEY}"
```

Stop if the resolved bucket is empty, does not match the dev stack output, the
key is outside the exact issue #21 prefix, or the local digest differs from the
reviewed digest. Keep the resolved values private.

## Create and review the change set

Creating a change set does not execute it:

```bash
aws cloudformation create-change-set \
  --region eu-west-1 \
  --stack-name admintonibover-prod \
  --change-set-name issue-21-production-foundation \
  --change-set-type CREATE \
  --description "Create the isolated issue 21 production foundation" \
  --template-url "$ADMINTONIBOVER_TEMPLATE_URL" \
  --parameters file://.artifacts/prod.parameters.json \
  --capabilities CAPABILITY_IAM

aws cloudformation wait change-set-create-complete \
  --region eu-west-1 \
  --stack-name admintonibover-prod \
  --change-set-name issue-21-production-foundation
```

Review the change set in CloudFormation and save a redacted inventory. It must
contain exactly 36 `Add` actions and only these approved type counts:

- one each of HTTP API, authorizer, integration, stage, Cognito User Pool,
  public app client, domain, resource server, DynamoDB table, IAM role, Lambda
  function, Lambda permission, log group, S3 bucket, and S3 bucket policy;
- 21 API Gateway v2 routes.

There must be no `Modify`, `Remove`, replacement, import, nested stack, or
resource outside `admintonibover-prod`. Inspect the processed template and
parameter diff, including retention policies, deletion protection, exact
origins, MFA off, self-sign-up off, on-demand billing, private S3, 14-day logs,
API throttling, no VPC, and no excluded feature.

## Execute once

Only after another review of the recorded change set and the approved cost:

```bash
aws cloudformation execute-change-set \
  --region eu-west-1 \
  --stack-name admintonibover-prod \
  --change-set-name issue-21-production-foundation

aws cloudformation wait stack-create-complete \
  --region eu-west-1 \
  --stack-name admintonibover-prod
```

If either command fails, stop. Inspect stack events once, preserve redacted
logical IDs and errors, and resolve the cause before a new reviewed change set.
Do not repeatedly execute or create resources manually.

After terminal success, delete only the staged template object after validating
the non-empty bucket and exact key prefix:

```bash
aws s3api delete-object \
  --region eu-west-1 \
  --bucket "$ADMINTONIBOVER_STAGING_BUCKET" \
  --key "$ADMINTONIBOVER_TEMPLATE_KEY"
```

## Administrator and Vercel configuration

Follow `docs/runbooks/cognito-single-administrator.md` against the production
User Pool. Create exactly one confirmed, enabled administrator with a verified
email. Normal sign-in is email and password, application MFA is off, recovery
uses verified email, and self-sign-up fails. AWS root and operator MFA are
separate and must remain unchanged.

Configure only these server-side production-stack values in the approved
Vercel Preview/Production scopes:

- `AWS_ADMIN_API_URL`
- `AWS_COGNITO_CLIENT_ID`
- `AWS_COGNITO_ISSUER`
- `AWS_COGNITO_LOGIN_URL`
- `AWS_COGNITO_CALLBACK_URL`
- `AWS_COGNITO_LOGOUT_URL`
- `AWS_CONTENT_BUCKET_ORIGIN`
- a new environment-specific `AWS_COGNITO_SESSION_SECRET`
- `ADMIN_CSP_MODE=enforce`

No AWS credential belongs in Vercel and none of these names may gain a
`NEXT_PUBLIC_` prefix. Production must finish with
`ADMIN_DATA_BACKEND=supabase`. If an approved fixed Preview temporarily selects
`aws` for read-only authentication/health verification, it must use only its
exact allowlisted origin, perform no content mutation, and return to `supabase`
before acceptance.

## Acceptance verification

Use non-sensitive data and record only redacted status/outcome evidence:

1. Verify the stack is `CREATE_COMPLETE` and its post-deploy inventory matches
   the 36 reviewed resources.
2. Verify exactly one confirmed, enabled, verified-email Cognito user; MFA is
   `OFF`, no MFA factor is attached, recovery succeeds, and self-sign-up fails.
3. Verify an authenticated access token reaches `GET /health`, while a missing,
   wrong-type, or modified token is rejected. Never print or retain tokens.
4. Verify unsigned S3 `GET` and `PUT` fail and only the exact Vercel origin gets
   the expected CORS response.
5. Verify DynamoDB is active, empty, on-demand, deletion-protected, Standard,
   and has TTL on `expiresAt`; PITR, Streams, GSIs, and LSIs are absent.
6. Verify S3 is empty and private with all public-access blocks on,
   bucket-owner enforcement, SSE-S3, versioning off, and only the approved
   lifecycle/CORS/policy.
7. Verify Lambda uses Node.js 24, ARM64, 256 MiB, 30 seconds, no VPC, and no
   reserved/provisioned concurrency; logs retain 14 days.
8. Verify API Gateway uses the Cognito JWT authorizer, exact scope and CORS, and
   throttles at 2 requests/second with burst 4.
9. Verify the Lambda IAM role is limited to the exact log group, table, and the
   `temporary/`, `images/`, and `backups/` bucket prefixes.
10. Verify Production still selects Supabase, no Supabase write occurred, no
    production content or image was migrated, and any health fixture is gone.
11. Check Bills/Cost Explorer immediately and after 24 hours. Stop and open a
    blocking discrepancy for any unexplained continuing service or cost.

## Rollback, recovery, and deliberate teardown

Before execution, rollback means deleting the unexecuted change set and the
exact staged template object. After a failed initial creation, inspect rollback
events. The empty bucket can be removed under `RetainExceptOnCreate`, while a
table or User Pool that was created is retained because its service deletion
protection is already active. Do not retry into orphaned resources; use a
separately reviewed recovery, import, or teardown decision.

After successful creation, the application remains on Supabase, so application
rollback requires no backend change. Do not delete the production stack as a
routine rollback. Its table, bucket, and User Pool are retained and protected,
but the API and Lambda would be removed.

A full teardown requires a separate approved issue and change set. It must:

1. freeze access and record exact retained resource identifiers;
2. create and validate a private backup plus a tested recovery path;
3. prove the target table/bucket are empty or explicitly approve destruction;
4. change DynamoDB and Cognito deletion protection through reviewed IaC;
5. change retention policies through reviewed IaC if deletion is intended;
6. empty only the exact bucket, including versions if versioning was later
   enabled, then delete the stack and any deliberately retained resources;
7. verify the complete all-Region inventory and Bills afterward.

Never treat a stack deletion as a complete teardown while retained resources
continue to exist and incur possible charges.

## Pull-request evidence

The draft PR must contain `Closes #21`, dependency `#20`, automated test and
schema-lint results, security/cost/rollback impact, the redacted change-set and
post-deploy inventories, authentication/access outcomes, table/bucket emptiness,
the immediate and 24-hour cost outcomes, and any linked blocking discrepancy.
Keep the PR draft until every acceptance item passes.

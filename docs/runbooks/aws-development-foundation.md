# AWS development foundation

This runbook deploys and verifies the development infrastructure defined by
[issue #7](https://github.com/boversauros/admintonibover/issues/7) and
[ADR 0001](../adr/0001-admin-only-aws-data-security-contract.md).

It is deliberately written for a single non-expert operator. Application
resources are created, updated, and deleted only through the synthesized
CloudFormation template. The AWS console is used to verify identity, Region,
billing controls, the proposed change set, and the resulting configuration.
Do not use an individual service's **Create**, **Edit**, or **Delete** buttons.

## Fixed scope

| Setting         | Required value                                 |
| --------------- | ---------------------------------------------- |
| AWS account     | The account verified in issue #3               |
| Region          | `eu-west-1`                                    |
| Environment     | `dev`                                          |
| Stack name      | `admintonibover-dev`                           |
| IaC source      | `infra/dev-foundation.ts`                      |
| Deployable file | `infra/generated/dev-foundation.template.json` |

Native CloudFormation is used instead of CDK or packaged SAM. This avoids a
bootstrap stack, deployment-artifact bucket, ECR repository, or additional IAM
roles outside `admintonibover-dev`. The TypeScript source deterministically
synthesizes a standard JSON template and validates the approved inventory
offline.

This stack is only the protected development shell. It does not create the
administrator, migrate content, connect the Next.js UI, upload images, or
modify Supabase.

## Stop conditions

Stop without executing the change set and retain redacted evidence if any of
these conditions is true:

- the account identity or `eu-west-1` Region differs from issue #3;
- a budget, anomaly subscription, or root/daily-use identity control is not in
  the verified state recorded by the
  [account guardrails](aws-account-guardrails.md);
- Bills or the all-Region resource review contains an unexplained service;
- the credential path would create a long-lived access key;
- a URL contains a wildcard, an unexpected domain, or an HTTP origin other
  than localhost;
- CloudFormation proposes an unlisted resource type, a deletion, a replacement,
  or a change outside `admintonibover-dev`;
- the Pricing Calculator estimate for the documented workload is USD 1/month
  or more, excluding tax, or contains an unapproved service;
- AWS displays a materially different setting, warning, price, or terminal
  status than this runbook.

Do not work around a stop condition by creating or editing a resource manually.
Document it in the draft pull request and resolve it before continuing.

## Cost quote

The estimate was reviewed on 2026-07-27 for EU (Ireland), before promotional
credits and without relying on API Gateway's expiring new-customer request
offer:

| Monthly input                | Conservative assumption                                                  |
| ---------------------------- | ------------------------------------------------------------------------ |
| HTTP API and Lambda requests | 10,000                                                                   |
| Lambda duration and memory   | 1 second at 512 MiB per call                                             |
| DynamoDB request units       | 100,000 strong reads; 50,000 writes                                      |
| DynamoDB Standard storage    | At most 1 GB                                                             |
| S3 Standard                  | 1 GB, 1,000 PUT-class requests, 10,000 GET-class requests, 1 GB transfer |
| Cognito                      | One direct monthly active user                                           |
| CloudWatch Logs              | 0.25 GB ingested, retained 14 days                                       |

The accepted planning quote is less than USD 0.05/month while idle with the
small retained dataset and approximately USD 0.50/month for the conservative
low-traffic workload, with a required expectation below USD 1/month. This is
an estimate, not a cap or guarantee. The USD 5 budget only sends alerts.

Before creating the change set, reproduce the estimate in the
[AWS Pricing Calculator](https://calculator.aws/#/) and record the dated
estimate or exported PDF privately. The PR may contain the public workload
assumptions and rounded total, but not account plan, credit, billing, or tax
details.

Authoritative pricing pages:

- [API Gateway](https://aws.amazon.com/api-gateway/pricing/)
- [Lambda](https://aws.amazon.com/lambda/pricing/)
- [DynamoDB](https://aws.amazon.com/dynamodb/pricing/)
- [Cognito](https://aws.amazon.com/cognito/pricing/)
- [S3](https://aws.amazon.com/s3/pricing/)
- [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/)

## Prerequisites

1. Issues #3, #4, and #5 are merged.
2. The repository is on the reviewed issue branch, rebased onto the latest
   `origin/main`, with a clean working tree.
3. Local Node.js and pnpm match `.node-version` and `package.json`.
4. Python 3.10 through 3.14 is available for the pinned CloudFormation schema
   linter. CI installs its own pinned Python runtime.
5. The exact development values are known:
   - local origin, callback, and logout URLs;
   - exact HTTPS development-admin origin, callback, and logout URLs;
   - a globally unique lowercase Cognito domain prefix.
6. The operator can open AWS CloudShell from the verified daily-use console
   session in `eu-west-1`. CloudShell supplies temporary credentials and the
   AWS CLI; it must not be opened from the root session.
7. No real token, password, account ID, ARN, email address, presigned URL, or
   private console screenshot will be saved in the repository.

AWS CLI 2.32 or newer can alternatively use `aws login` with an already
approved console identity. Do not attach a new policy or create an access key
just to use the local CLI. CloudShell is the default procedure below.

## Prepare the reviewed files locally

Install and run the full credential-free suite:

```bash
pnpm install --frozen-lockfile
mkdir -p .artifacts
python3 -m venv .artifacts/cfn-lint
.artifacts/cfn-lint/bin/python -m pip install \
  --requirement infra/requirements.txt
.artifacts/cfn-lint/bin/cfn-lint \
  infra/generated/dev-foundation.template.json
NEXT_PUBLIC_SUPABASE_URL=https://ci.invalid \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder \
  pnpm run ci
```

Regenerate the deployable template and confirm it is current:

```bash
pnpm infra:synth
pnpm infra:validate
git diff --exit-code -- infra/generated/dev-foundation.template.json
shasum -a 256 infra/generated/dev-foundation.template.json
```

Create a private, ignored parameter file:

```bash
mkdir -p .artifacts
cp infra/parameters/dev.example.json .artifacts/dev.parameters.json
```

Edit `.artifacts/dev.parameters.json` and replace every placeholder:

- set `GuardrailsEvidenceConfirmed` to `CONFIRMED` only after completing the
  next section;
- use `Environment=dev`;
- list exact origins only, without trailing paths;
- use exact callback and logout URLs, including their paths;
- choose a globally unique Cognito domain prefix;
- keep `EnableTableDeletionProtection=false` for the first deployment.

The parameter file contains no secret, but it remains uncommitted because it is
environment-specific. Run `pnpm check:secrets` again before committing.

## Recheck the hard account gate

While signed in with the daily-use administrator:

1. Confirm the private account identifier matches issue #3.
2. Select **Europe (Ireland) — eu-west-1**.
3. Open **Billing and Cost Management**:
   - **Home**, **Free Tier**, and **Credits**: privately confirm current plan,
     balance, and expiry;
   - **Budgets**: confirm the zero-spend and
     `admintonibover-monthly-5-usd` budgets are active;
   - **Cost Anomaly Detection**: confirm the all-services monitor and daily
     USD 1 subscription are active;
   - **Bills** and **Cost Explorer**: investigate every current service and
     Region.
4. Search all Regions for unexplained application resources.
5. Confirm root MFA remains assigned, root has no access keys, and root is
   signed out.
6. Only now change `GuardrailsEvidenceConfirmed` in the private parameter file
   to `CONFIRMED`.

The CloudFormation parameter has no default and accepts no other value, so a
change set cannot be created from the example file without this explicit
acknowledgement.

## Open CloudShell and validate identity

In the console, keep `eu-west-1` selected and open CloudShell. Upload these two
files with **Actions → Upload file**:

- `infra/generated/dev-foundation.template.json`
- `.artifacts/dev.parameters.json`

Compare the uploaded template hash with the local hash, then verify the
temporary identity and Region:

```bash
sha256sum dev-foundation.template.json
aws sts get-caller-identity
aws configure get region
```

The account identifier is private evidence. If the Region output is empty,
continue only because every command below passes `--region eu-west-1`
explicitly. Stop if the account differs.

Validate the CloudFormation service accepts the template without deploying:

```bash
aws cloudformation validate-template \
  --region eu-west-1 \
  --template-body file://dev-foundation.template.json
```

## Create and review the first change set

Create the review-only change set:

```bash
aws cloudformation create-change-set \
  --region eu-west-1 \
  --stack-name admintonibover-dev \
  --change-set-name issue-7-dev-foundation-create \
  --change-set-type CREATE \
  --template-body file://dev-foundation.template.json \
  --parameters file://dev.parameters.json \
  --capabilities CAPABILITY_IAM \
  --description "Issue 7 reviewed development foundation"

aws cloudformation wait change-set-create-complete \
  --region eu-west-1 \
  --stack-name admintonibover-dev \
  --change-set-name issue-7-dev-foundation-create

aws cloudformation describe-change-set \
  --region eu-west-1 \
  --stack-name admintonibover-dev \
  --change-set-name issue-7-dev-foundation-create \
  --query 'Changes[].ResourceChange.{Action:Action,LogicalId:LogicalResourceId,Type:ResourceType,Replacement:Replacement}' \
  --output table
```

Creating a change set does not create the application resources. In
**CloudFormation → Stacks → admintonibover-dev → Change sets**, open
`issue-7-dev-foundation-create`. Confirm all 16 actions are `Add`, replacement
is absent, and the parameters are exact.

### Expected first change set

| Logical ID              | CloudFormation type                    | Purpose                        |
| ----------------------- | -------------------------------------- | ------------------------------ |
| `ContentTable`          | `AWS::DynamoDB::Table`                 | On-demand content table        |
| `ContentBucket`         | `AWS::S3::Bucket`                      | Private content bucket         |
| `ContentBucketPolicy`   | `AWS::S3::BucketPolicy`                | TLS-only access                |
| `UserPool`              | `AWS::Cognito::UserPool`               | Single-admin identity boundary |
| `AdminResourceServer`   | `AWS::Cognito::UserPoolResourceServer` | Admin OAuth scope              |
| `UserPoolClient`        | `AWS::Cognito::UserPoolClient`         | Public PKCE client             |
| `UserPoolDomain`        | `AWS::Cognito::UserPoolDomain`         | Managed-login endpoint         |
| `LambdaLogGroup`        | `AWS::Logs::LogGroup`                  | 14-day function logs           |
| `LambdaExecutionRole`   | `AWS::IAM::Role`                       | Exact runtime permissions      |
| `FoundationFunction`    | `AWS::Lambda::Function`                | Protected foundation handler   |
| `HttpApi`               | `AWS::ApiGatewayV2::Api`               | HTTP API                       |
| `JwtAuthorizer`         | `AWS::ApiGatewayV2::Authorizer`        | Cognito JWT verification       |
| `FoundationIntegration` | `AWS::ApiGatewayV2::Integration`       | Lambda proxy                   |
| `FoundationRoute`       | `AWS::ApiGatewayV2::Route`             | Protected `GET /health`        |
| `ApiStage`              | `AWS::ApiGatewayV2::Stage`             | Auto-deployed throttled stage  |
| `ApiInvokePermission`   | `AWS::Lambda::Permission`              | Exact API route invocation     |

No other type is approved. In particular, stop on any VPC, subnet, endpoint,
NAT Gateway, ECR repository, bootstrap/artifact bucket, REST API, cache, WAF,
DAX, Stream, global table, EFS, CloudFront, provisioned capacity/concurrency,
customer-managed KMS key, custom metric, alarm, dashboard, or unrelated IAM
resource.

## Execute the reviewed change set

Return to CloudShell and execute the exact reviewed change set:

```bash
aws cloudformation execute-change-set \
  --region eu-west-1 \
  --stack-name admintonibover-dev \
  --change-set-name issue-7-dev-foundation-create

aws cloudformation wait stack-create-complete \
  --region eu-west-1 \
  --stack-name admintonibover-dev

aws cloudformation describe-stacks \
  --region eu-west-1 \
  --stack-name admintonibover-dev \
  --query 'Stacks[0].{Status:StackStatus,Outputs:Outputs}' \
  --output json
```

Expected terminal status is `CREATE_COMPLETE`. Do not copy the output JSON into
the public PR because generated names can contain account-specific identifiers.

If the wait command fails, inspect
**CloudFormation → admintonibover-dev → Events**, retain redacted evidence, and
stop. Do not repeatedly redeploy. CloudFormation's rollback events must be
understood before creating another change set.

## Verify every resource

Use stack outputs rather than typing resource names:

```bash
ADMINTONIBOVER_TABLE_NAME="$(aws cloudformation describe-stacks --region eu-west-1 --stack-name admintonibover-dev --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue | [0]" --output text)"
ADMINTONIBOVER_BUCKET_NAME="$(aws cloudformation describe-stacks --region eu-west-1 --stack-name admintonibover-dev --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue | [0]" --output text)"
ADMINTONIBOVER_FUNCTION_NAME="$(aws cloudformation describe-stacks --region eu-west-1 --stack-name admintonibover-dev --query "Stacks[0].Outputs[?OutputKey=='LambdaFunctionName'].OutputValue | [0]" --output text)"
ADMINTONIBOVER_USER_POOL_ID="$(aws cloudformation describe-stacks --region eu-west-1 --stack-name admintonibover-dev --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue | [0]" --output text)"
ADMINTONIBOVER_CLIENT_ID="$(aws cloudformation describe-stacks --region eu-west-1 --stack-name admintonibover-dev --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue | [0]" --output text)"
ADMINTONIBOVER_API_URL="$(aws cloudformation describe-stacks --region eu-west-1 --stack-name admintonibover-dev --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue | [0]" --output text)"
ADMINTONIBOVER_API_ID="$(aws cloudformation describe-stack-resource --region eu-west-1 --stack-name admintonibover-dev --logical-resource-id HttpApi --query 'StackResourceDetail.PhysicalResourceId' --output text)"
```

Keep these shell values and their output private.

### DynamoDB

In **DynamoDB → Tables → the `TableName` output**, verify:

- `PK` is the partition key and `SK` is the sort key;
- capacity is on-demand and class is Standard;
- there are no global or local indexes and no Stream;
- PITR is off and TTL uses `expiresAt`;
- deletion protection is initially off.

```bash
aws dynamodb describe-table \
  --region eu-west-1 \
  --table-name "$ADMINTONIBOVER_TABLE_NAME" \
  --query 'Table.{BillingMode:BillingModeSummary.BillingMode,DeletionProtection:DeletionProtectionEnabled,KeySchema:KeySchema,GlobalIndexes:GlobalSecondaryIndexes,Stream:StreamSpecification}' \
  --output json

aws dynamodb describe-continuous-backups \
  --region eu-west-1 \
  --table-name "$ADMINTONIBOVER_TABLE_NAME"

aws dynamodb describe-time-to-live \
  --region eu-west-1 \
  --table-name "$ADMINTONIBOVER_TABLE_NAME"
```

### S3

In **S3 → Buckets → the `BucketName` output**:

- **Permissions**: all four Block Public Access settings are on, Object
  Ownership is bucket-owner enforced, and the only bucket-policy statement
  denies non-TLS traffic;
- **Properties**: default encryption is SSE-S3 and versioning says Disabled;
- **Management**: `ExpireAbandonedTemporaryUploads` expires `temporary/`
  objects and incomplete multipart uploads after one day;
- **Permissions → CORS**: origins, methods, and headers exactly match the
  reviewed parameters.

```bash
aws s3api get-public-access-block --region eu-west-1 --bucket "$ADMINTONIBOVER_BUCKET_NAME"
aws s3api get-bucket-ownership-controls --region eu-west-1 --bucket "$ADMINTONIBOVER_BUCKET_NAME"
aws s3api get-bucket-encryption --region eu-west-1 --bucket "$ADMINTONIBOVER_BUCKET_NAME"
aws s3api get-bucket-versioning --region eu-west-1 --bucket "$ADMINTONIBOVER_BUCKET_NAME"
aws s3api get-bucket-policy-status --region eu-west-1 --bucket "$ADMINTONIBOVER_BUCKET_NAME"
aws s3api get-bucket-cors --region eu-west-1 --bucket "$ADMINTONIBOVER_BUCKET_NAME"
aws s3api get-bucket-lifecycle-configuration --region eu-west-1 --bucket "$ADMINTONIBOVER_BUCKET_NAME"
```

`get-bucket-versioning` is expected to return an empty object because versioning
has never been enabled.

### Cognito

In **Cognito → User pools → the `UserPoolId` output**, verify:

- Lite tier, self-sign-up disabled, and zero users;
- application MFA is off; normal sign-in is email plus password, while AWS
  account users retain their separate mandatory MFA;
- recovery is verified email only;
- the public client has no secret and uses only Authorization Code;
- token validity is 15 minutes for access/ID and one day for refresh;
- callback/logout URLs and the managed-login domain are exact;
- there is one custom scope, `admintonibover-api/admin`;
- threat protection and paid advanced features are absent.

The administrator is deliberately created later with the
[single-administrator runbook](cognito-single-administrator.md) for issue #8.

```bash
aws cognito-idp describe-user-pool --region eu-west-1 --user-pool-id "$ADMINTONIBOVER_USER_POOL_ID"
aws cognito-idp describe-user-pool-client --region eu-west-1 --user-pool-id "$ADMINTONIBOVER_USER_POOL_ID" --client-id "$ADMINTONIBOVER_CLIENT_ID"
aws cognito-idp list-users --region eu-west-1 --user-pool-id "$ADMINTONIBOVER_USER_POOL_ID" --limit 1
```

### API Gateway

In **API Gateway → APIs → the development HTTP API**, verify:

- protocol is HTTP, not REST;
- `GET /health` has the Cognito JWT authorizer and exact admin scope;
- issuer and audience match the stack's User Pool/client;
- CORS contains only reviewed origins, methods, and headers;
- the `$default` stage rate is 2 requests/second with burst 4;
- no cache, custom domain, WAF, or unauthenticated application route exists.

```bash
aws apigatewayv2 get-api --region eu-west-1 --api-id "$ADMINTONIBOVER_API_ID"
aws apigatewayv2 get-authorizers --region eu-west-1 --api-id "$ADMINTONIBOVER_API_ID"
aws apigatewayv2 get-routes --region eu-west-1 --api-id "$ADMINTONIBOVER_API_ID"
aws apigatewayv2 get-stage --region eu-west-1 --api-id "$ADMINTONIBOVER_API_ID" --stage-name '$default'
```

### Lambda, IAM, and logs

In **Lambda → Functions → the `LambdaFunctionName` output**, verify:

- Node.js 24, ARM64, 128 MiB, and five-second timeout;
- no reserved or provisioned concurrency while the account has AWS's reduced
  new-account Lambda quota;
- VPC says none and there is no layer, EFS, X-Ray, or secret variable;
- the execution role is scoped only to the exact log group, table, and
  `temporary/`, `images/`, and `backups/` bucket prefixes.

In **CloudWatch → Logs → Log groups**, verify
`/aws/lambda/admintonibover-dev-foundation` was created by the stack and retains
logs for 14 days.

```bash
aws lambda get-function-configuration --region eu-west-1 --function-name "$ADMINTONIBOVER_FUNCTION_NAME"
aws lambda get-function-concurrency --region eu-west-1 --function-name "$ADMINTONIBOVER_FUNCTION_NAME"
aws lambda list-provisioned-concurrency-configs --region eu-west-1 --function-name "$ADMINTONIBOVER_FUNCTION_NAME"
aws lambda get-account-settings --region eu-west-1
aws logs describe-log-groups --region eu-west-1 --log-group-name-prefix /aws/lambda/admintonibover-dev-foundation
```

The function-concurrency object and provisioned-concurrency list must both be
empty. The API stage throttle remains 2 requests/second with burst 4.

## Negative access tests

No Cognito administrator exists yet, so issue #7 proves denial rather than a
successful authenticated call.

An API request without a bearer token must return `401` and must not invoke
Lambda:

```bash
curl --fail-with-body --silent --show-error \
  "$ADMINTONIBOVER_API_URL/health"
```

`curl` exits non-zero because the expected response is not successful. Inspect
the status without printing any token:

```bash
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  "$ADMINTONIBOVER_API_URL/health"
```

Expected output is `401`.

Anonymous S3 GET and PUT must return `403`. The failed PUT must not create an
object:

```bash
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  "https://${ADMINTONIBOVER_BUCKET_NAME}.s3.eu-west-1.amazonaws.com/temporary/anonymous-test"

curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  --request PUT \
  --data-binary 'issue-7-anonymous-test' \
  "https://${ADMINTONIBOVER_BUCKET_NAME}.s3.eu-west-1.amazonaws.com/temporary/anonymous-test"

aws s3api head-object \
  --region eu-west-1 \
  --bucket "$ADMINTONIBOVER_BUCKET_NAME" \
  --key temporary/anonymous-test
```

Both `curl` commands must print `403`; `head-object` must report that the object
does not exist.

## Enable DynamoDB deletion protection

After every first-deployment check passes, change only
`EnableTableDeletionProtection` in `dev.parameters.json` from `false` to
`true`. Create an update change set:

```bash
aws cloudformation create-change-set \
  --region eu-west-1 \
  --stack-name admintonibover-dev \
  --change-set-name issue-7-enable-table-protection \
  --change-set-type UPDATE \
  --template-body file://dev-foundation.template.json \
  --parameters file://dev.parameters.json \
  --capabilities CAPABILITY_IAM \
  --description "Enable verified dev table deletion protection"

aws cloudformation wait change-set-create-complete \
  --region eu-west-1 \
  --stack-name admintonibover-dev \
  --change-set-name issue-7-enable-table-protection

aws cloudformation describe-change-set \
  --region eu-west-1 \
  --stack-name admintonibover-dev \
  --change-set-name issue-7-enable-table-protection \
  --query 'Changes[].ResourceChange.{Action:Action,LogicalId:LogicalResourceId,Type:ResourceType,Replacement:Replacement}' \
  --output table
```

The only resource change must be `ContentTable`, action `Modify`, replacement
`False`. Execute and verify:

```bash
aws cloudformation execute-change-set \
  --region eu-west-1 \
  --stack-name admintonibover-dev \
  --change-set-name issue-7-enable-table-protection

aws cloudformation wait stack-update-complete \
  --region eu-west-1 \
  --stack-name admintonibover-dev

aws dynamodb describe-table \
  --region eu-west-1 \
  --table-name "$ADMINTONIBOVER_TABLE_NAME" \
  --query 'Table.DeletionProtectionEnabled'
```

Expected output is `true`. Never toggle this directly in DynamoDB.

## Controlled deletion and redeployment rehearsal

Perform this rehearsal before issue #8 creates the administrator and before any
content or object exists.

1. Change only `EnableTableDeletionProtection` back to `false`.
2. Create, review, and execute an `UPDATE` change set exactly as above. Confirm
   only `ContentTable` is modified without replacement.
3. Confirm deletion protection is false.
4. Confirm the table has no application data, Cognito has zero users, and the
   bucket is empty:

   ```bash
   aws s3api list-objects-v2 \
     --region eu-west-1 \
     --bucket "$ADMINTONIBOVER_BUCKET_NAME" \
     --query '{Count:KeyCount,Keys:Contents[].Key}'
   ```

5. If any object appears, stop and explain it. Do not use a wildcard deletion.
   If the object is verified as an issue #7 disposable test object, remove only
   its exact key with `aws s3api delete-object`.
6. Delete only the named dev stack:

   ```bash
   aws cloudformation delete-stack \
     --region eu-west-1 \
     --stack-name admintonibover-dev

   aws cloudformation wait stack-delete-complete \
     --region eu-west-1 \
     --stack-name admintonibover-dev
   ```

7. Confirm `admintonibover-dev` is absent, the production resource inventory is
   unchanged, and the issue #3 budgets/anomaly controls still exist.
8. Recreate the stack from the same template hash and reviewed parameters,
   repeat all verification, then enable table deletion protection through the
   reviewed update change set again.

This is the complete dev-stack deletion path. A normal stack deletion is
expected to fail safely while DynamoDB deletion protection is enabled or while
S3 contains objects.

## Billing evidence

Immediately after deployment and again after at least 24 hours:

1. Open **Billing and Cost Management → Bills** and expand every service.
2. Open **Cost Explorer**, filter the account, and group by service and Region.
3. Confirm no excluded service appears.
4. Record the date, rounded cost delta, pricing estimate, and conclusion
   privately.
5. Add only a redacted attestation and rounded expected monthly impact to the
   PR.

Any unexpected service or charge blocks acceptance until documented and
resolved. Remember that billing data is delayed and budgets do not cap spend.

## Pull-request evidence

The draft PR must contain:

- `Closes #7` and merged dependencies #3, #4, and #5;
- the template hash and exact source commit, without account identifiers;
- local `pnpm install --frozen-lockfile`, `pnpm run ci`, and synthesis results;
- the reviewed change-set inventory and terminal stack statuses;
- redacted resource verification and negative-test results;
- the deletion/redeployment rehearsal result;
- security impact, environment-variable names only, expected monthly cost, and
  rollback;
- immediate and 24-hour billing attestations.

Never attach tokens, passwords, email addresses, account IDs, sign-in URLs,
ARNs, generated resource names, invoices, presigned URLs, or unredacted console
screenshots.

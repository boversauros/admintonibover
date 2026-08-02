# Authenticated DynamoDB read tracer

This runbook deploys and verifies
[issue #9](https://github.com/boversauros/admintonibover/issues/9), the smallest
production-shaped read through the AWS administration boundary:

`Next.js → Cognito → HTTP API/JWT authorizer → Lambda → DynamoDB → rendered fixture`

The tracer is read-only. It does not migrate a backup, enable an AWS write
operation, change the public site, or cut over from Supabase.

## Fixed scope

| Setting               | Required value                                  |
| --------------------- | ----------------------------------------------- |
| Region                | `eu-west-1`                                     |
| Stack                 | `admintonibover-dev`                            |
| Feature flag          | `ADMIN_DATA_BACKEND=supabase` or `aws`          |
| Fixture ID            | `issue-9-fixture`                               |
| DynamoDB key          | `POST#issue-9-fixture` / `POST#issue-9-fixture` |
| Application route     | `GET /posts/{id}`                               |
| API type              | HTTP API                                        |
| API throttle          | 2 requests/second, burst 4                      |
| Lambda concurrency    | No reserved or provisioned concurrency          |
| Cognito flow          | Authorization Code with PKCE, public client     |
| Application MFA       | Off                                             |
| Access-token lifetime | 15 minutes                                      |
| Refresh lifetime      | One day                                         |

The issue originally said that Lambda concurrency must remain `2`. The product
owner approved the accepted ADR wording instead: the development account uses
the unreserved Lambda pool because its reduced new-account quota cannot support
a reservation, while the HTTP API stage remains throttled at 2 requests/second
with burst 4.

## What is automated and what is manual

Repository code owns:

- the Lambda repository operation and typed API contract;
- the protected HTTP API route and exact invoke permission;
- the Cognito PKCE/session implementation;
- the server-only backend flag and Supabase isolation;
- the fictional fixture;
- cloud-free unit and contract tests; and
- this repeatable verification procedure.

The operator owns:

- reviewing and executing the CloudFormation change set;
- putting the committed fixture into the named development table;
- storing real environment values outside Git;
- completing the real email/password sign-in;
- checking CloudWatch and billing evidence; and
- reporting only redacted outcomes in the pull request.

Never paste an email, password, code, token, account ID, ARN, generated resource
name, private URL, invoice, or unredacted screenshot into GitHub.

## Prerequisites

1. Issues #5, #6, #7, and #8 are merged.
2. The branch is based on the latest `main` and the working tree is clean.
3. The private issue #3 account, identity, billing, and Region evidence has just
   been rechecked.
4. The `admintonibover-dev` stack is `CREATE_COMPLETE` or `UPDATE_COMPLETE`.
5. The single Cognito administrator is confirmed, enabled, verified-email, and
   has no MFA preference.
6. DynamoDB deletion protection remains enabled.
7. The operator is using the daily-use AWS console session with its existing
   account MFA, not root and not a long-lived access key.

Stop on an unexpected identity, Region, service, resource type, replacement,
deletion, wildcard origin, price, warning, or stack state.

## Local validation

Use the pinned Node and pnpm versions. No real AWS or Cognito value is required:

```bash
pnpm install --frozen-lockfile
NEXT_PUBLIC_SUPABASE_URL=https://ci.invalid \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder \
  pnpm run ci
```

Expected infrastructure summary: 18 resources with the same 16
CloudFormation resource types already approved by issue #7. Issue #9 adds only:

- `PostReadRoute`, another `AWS::ApiGatewayV2::Route`; and
- `PostReadInvokePermission`, another `AWS::Lambda::Permission`.

The Lambda function, generated template, output list, and documentation are
modified in place. No new service or resource type is introduced.

## Prepare the change set

Follow the identity, pricing, parameter, upload, and template-hash controls in
the [AWS development foundation](aws-development-foundation.md). Use the
current committed synthesis and the already-reviewed private development
parameters.

The exact callback and logout values must remain the approved application root
for each environment. The Next.js proxy internally routes Cognito's root
callback to the server-only callback handler. Before creating the change set,
confirm that both `CallbackUrls` and `LogoutUrls` in the private
`dev.parameters.json` contain those same exact roots; update both together if
either still contains `/auth/callback` or `/login`.

Create an update change set without executing it:

```bash
aws cloudformation create-change-set \
  --region eu-west-1 \
  --stack-name admintonibover-dev \
  --change-set-name issue-9-authenticated-read-tracer \
  --change-set-type UPDATE \
  --template-body file://dev-foundation.template.json \
  --parameters file://dev.parameters.json \
  --capabilities CAPABILITY_IAM \
  --description "Add the authenticated single-post read tracer"

aws cloudformation wait change-set-create-complete \
  --region eu-west-1 \
  --stack-name admintonibover-dev \
  --change-set-name issue-9-authenticated-read-tracer

aws cloudformation describe-change-set \
  --region eu-west-1 \
  --stack-name admintonibover-dev \
  --change-set-name issue-9-authenticated-read-tracer \
  --query 'Changes[].ResourceChange.{Action:Action,LogicalId:LogicalResourceId,Type:ResourceType,Replacement:Replacement}' \
  --output table
```

Expected application changes:

- add `PostReadRoute`;
- add `PostReadInvokePermission`;
- modify `FoundationFunction` code/description without replacement;
- modify `UserPoolClient` without replacement only when normalizing its
  callback/logout roots; and
- no other resource addition, deletion, replacement, or IAM widening.

CloudFormation can report associated API deployment updates. Stop if it
proposes a different service, a table replacement, a Cognito replacement, or a
change outside `admintonibover-dev`.

Execute only after review:

```bash
aws cloudformation execute-change-set \
  --region eu-west-1 \
  --stack-name admintonibover-dev \
  --change-set-name issue-9-authenticated-read-tracer

aws cloudformation wait stack-update-complete \
  --region eu-west-1 \
  --stack-name admintonibover-dev
```

Resolve the outputs privately in CloudShell:

```bash
ADMINTONIBOVER_TABLE_NAME="$(aws cloudformation describe-stacks --region eu-west-1 --stack-name admintonibover-dev --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue | [0]" --output text)"
ADMINTONIBOVER_API_URL="$(aws cloudformation describe-stacks --region eu-west-1 --stack-name admintonibover-dev --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue | [0]" --output text)"
ADMINTONIBOVER_CLIENT_ID="$(aws cloudformation describe-stacks --region eu-west-1 --stack-name admintonibover-dev --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue | [0]" --output text)"
ADMINTONIBOVER_ISSUER="$(aws cloudformation describe-stacks --region eu-west-1 --stack-name admintonibover-dev --query "Stacks[0].Outputs[?OutputKey=='UserPoolIssuer'].OutputValue | [0]" --output text)"
ADMINTONIBOVER_LOGIN_URL="$(aws cloudformation describe-stacks --region eu-west-1 --stack-name admintonibover-dev --query "Stacks[0].Outputs[?OutputKey=='CognitoLoginUrl'].OutputValue | [0]" --output text)"
```

Stop if a value is empty or is not from the named stack in `eu-west-1`.

## Seed the fictional fixture

The committed fixture contains no personal or production content:
[`infra/fixtures/issue-9-tracer-post.json`](../../infra/fixtures/issue-9-tracer-post.json).
Its SHA-256 is:

`01fcc60178a94c784507559a98a76cdb4d27d681eafdbf57efc18604d97695c1`

Upload only that file to CloudShell and verify the hash before use:

```bash
sha256sum issue-9-tracer-post.json
```

Create the item exactly once with the daily-use session's temporary
credentials:

```bash
aws dynamodb put-item \
  --region eu-west-1 \
  --table-name "$ADMINTONIBOVER_TABLE_NAME" \
  --item file://issue-9-tracer-post.json \
  --condition-expression 'attribute_not_exists(PK) AND attribute_not_exists(SK)' \
  --return-consumed-capacity TOTAL
```

The conditional write must fail rather than overwrite an existing item. Verify
only the safe projection:

```bash
aws dynamodb get-item \
  --region eu-west-1 \
  --table-name "$ADMINTONIBOVER_TABLE_NAME" \
  --key '{"PK":{"S":"POST#issue-9-fixture"},"SK":{"S":"POST#issue-9-fixture"}}' \
  --consistent-read \
  --projection-expression 'id, migration' \
  --return-consumed-capacity TOTAL
```

Do not seed through the application: create/update/delete are explicit
non-goals.

## Configure the Next.js development environment

Set these values only in a gitignored `.env.local` or the deployment platform's
encrypted environment settings:

```env
ADMIN_DATA_BACKEND=aws
AWS_ADMIN_API_URL=<ApiUrl output>
AWS_COGNITO_CLIENT_ID=<UserPoolClientId output>
AWS_COGNITO_ISSUER=<UserPoolIssuer output>
AWS_COGNITO_LOGIN_URL=<CognitoLoginUrl output>
AWS_COGNITO_CALLBACK_URL=<exact registered application root>
AWS_COGNITO_LOGOUT_URL=<exact registered application root>
```

There is no Cognito client secret. Do not add AWS credentials to Next.js.

With `ADMIN_DATA_BACKEND=supabase`, the existing Supabase application remains
unchanged and the AWS session/data routes return no application data. With
`ADMIN_DATA_BACKEND=aws`, the UI exposes only the Cognito login and tracer read;
direct create/edit navigation redirects to the tracer.

## Integration verification

### 1. Signed-out denial

Call the API route without a token:

```bash
curl --silent --show-error \
  --output /dev/null \
  --write-out '%{http_code}\n' \
  "$ADMINTONIBOVER_API_URL/posts/issue-9-fixture"
```

Expected status: `401`. API Gateway must reject the request before Lambda, so
no DynamoDB read occurs. Confirm that the Lambda log group has no correlation
entry for this call and that its invocation count does not increase once
metrics settle.

### 2. Real application sign-in and successful read

1. Start or deploy Next.js with the AWS flag and exact non-secret outputs.
2. Open the application root and choose **Continue to secure sign-in**.
3. Sign in with the existing administrator's email and password.
4. Confirm there is no application MFA enrollment or challenge.
5. Confirm the tracer renders:
   - title `Una primera lectura a DynamoDB`;
   - migration status `ready`;
   - source `issue-9-fixture`; and
   - a correlation ID.
6. Sign out, then confirm the protected UI is no longer visible.

Never copy a browser cookie, callback code, or token into evidence.

### 3. Stable client errors

While signed in, use the browser console only for same-origin requests; no token
is needed or exposed:

```javascript
await fetch('/api/aws/posts/unknown-post').then(async response => ({
  status: response.status,
  body: await response.json(),
}));

await fetch('/api/aws/posts/contains%20spaces').then(async response => ({
  status: response.status,
  body: await response.json(),
}));
```

Expected results:

- unknown post: `404` with `error.code=NOT_FOUND`;
- malformed ID: `400` with `error.code=BAD_REQUEST`.

The fake-backed contract tests provide the deterministic `403` and `500`
evidence without weakening a real token or forcing a cloud failure.

### 4. Infrastructure and logs

Verify:

- API protocol is HTTP;
- both routes use the same JWT authorizer and exact admin scope;
- stage throttle is 2 requests/second with burst 4;
- Lambda has no reserved or provisioned concurrency;
- the new invoke permission is restricted to `GET /posts/*`;
- DynamoDB remains Standard/on-demand with deletion protection;
- logs retain 14 days; and
- no new CloudFormation resource type exists.

In CloudWatch Logs Insights, inspect the test window. Expected application
events are `post_read_succeeded`, `post_not_found`, or `post_read_failed` with
request ID, route key, and post ID. No log may contain a JWT, email, title,
content body, callback code, refresh token, account ID, ARN, or credential.

## Cost evidence

Immediately after deployment and after billing data has settled:

1. Open Bills and expand each service.
2. Open Cost Explorer grouped by service and Region.
3. Confirm only the already-approved low-volume services appear.
4. Record the date and rounded impact privately.
5. Add only a redacted attestation to the pull request.

The tracer introduces no new service or provisioned capacity. Its incremental
work is a small number of HTTP API requests, short Lambda invocations, log
events, and strongly consistent on-demand DynamoDB reads. The accepted
development expectation remains below USD 1/month, but that estimate is not a
cap or guarantee.

## Pull-request evidence

The draft pull request must include:

- `Closes #9` and merged dependencies #5, #6, #7, and #8;
- the approved concurrency clarification;
- local CI and deterministic 18-resource synthesis results;
- reviewed change-set actions and terminal stack status;
- redacted `401`, `400`, `404`, and successful UI outcomes;
- the no-MFA application sign-in outcome;
- log-redaction and feature-flag-off outcomes;
- security and rollback impact; and
- immediate and settled billing attestations.

If verification fails, switch `ADMIN_DATA_BACKEND` back to `supabase` first.
Restart or redeploy the Next.js process so it receives the changed runtime
environment; the request-time backend boundary does not require a new build.
Do not enable an AWS write path. Preserve the fixture and stack for diagnosis
unless an exact, reviewed rollback is approved.

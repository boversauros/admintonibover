# Operations

Owner: the single account/application administrator. Run a procedure only when
its trigger applies, using the daily-use identity with MFA, temporary
credentials, and explicit Region `eu-west-1`. Never use root for application
work or create a long-lived access key.

Private evidence includes account IDs, ARNs, generated resource names, email,
credentials, tokens, cookies, presigned URLs, backups, manifests, parameter
files, content, logs, and screenshots that expose any of them. Keep it outside
Git or under ignored `.artifacts/`; record only redacted results.

## Stop conditions

Stop before a write when the identity, account, Region, stack, exact origin,
resource inventory, cost, template hash, change set, backup digest, or target
does not match the intended operation. Also stop on any replacement/deletion of
a protected resource, wildcard permission/origin, unexpected AWS service,
public S3 setting, unknown content difference, or non-terminal stack state.
Do not repair a stop condition with a direct service-console edit.

## Login and administrator recovery

Trigger: normal sign-in, forgotten password, suspected session compromise, or
a disabled account.

1. Open the application and continue to Cognito managed login. The callback
   must be exactly `/auth/callback`; no MFA enrollment should appear for the
   application user.
2. Use **Forgot password?** and the verified-email code to reset the same user.
   Never create a second administrator as recovery.
3. For a suspected session leak, rotate `AWS_COGNITO_SESSION_SECRET` in the
   deployment platform and redeploy. This invalidates every Next.js session.
4. Revoke all Cognito refresh sessions with a private email variable:

   ```bash
   aws cognito-idp admin-user-global-sign-out \
     --region eu-west-1 \
     --user-pool-id "$ADMINTONIBOVER_USER_POOL_ID" \
     --username "$ADMINTONIBOVER_ADMIN_EMAIL"
   ```

5. Disable or re-enable the existing user when incident containment requires
   it:

   ```bash
   aws cognito-idp admin-disable-user \
     --region eu-west-1 \
     --user-pool-id "$ADMINTONIBOVER_USER_POOL_ID" \
     --username "$ADMINTONIBOVER_ADMIN_EMAIL"

   aws cognito-idp admin-enable-user \
     --region eu-west-1 \
     --user-pool-id "$ADMINTONIBOVER_USER_POOL_ID" \
     --username "$ADMINTONIBOVER_ADMIN_EMAIL"
   ```

6. Confirm exactly one enabled, confirmed, verified-email user, self-sign-up
   disabled, no client secret, authorization-code flow only, and the exact
   callback/logout URLs. Clear private shell variables afterward.

Successful logout must revoke the refresh token, clear the local encrypted
cookies, clear Cognito managed login, and make a restored pre-logout cookie set
return `401`.

## Deploy and verify application or infrastructure

Trigger: an approved application release, Lambda/IAM/CORS change, dependency
update, or recovery repair.

### Before review

```bash
git fetch origin
pnpm install --frozen-lockfile
pnpm infra:synth -- --environment dev
pnpm infra:synth -- --environment prod
pnpm run ci
pnpm format:check
git diff --exit-code -- infra/generated
shasum -a 256 infra/generated/prod-foundation.template.json
```

Run `pnpm audit:dependencies` and the cfn-lint command from CI. Review the diff,
generated template, Lambda permissions, resource count/types, exact origins,
retention policies, and the impact on security, cost, recovery, and rollback.

### Infrastructure change set

Copy the appropriate example parameters to an ignored private file and fill it
from the exact stack/deployment origins. `GuardrailsEvidenceConfirmed` becomes
`CONFIRMED` only after checking root/operator MFA, no root keys, budgets,
anomaly alerts, current Bills/Cost Explorer, all Regions, and the intended
temporary deployment identity.

The inline Lambda makes the template too large for a direct change-set request.
From a verified CloudShell session, stage the generated template temporarily in
the exact environment content bucket under `backups/cloudformation/`, compare
its SHA-256 with the local value, and create a CloudFormation change set using
that private S3 object. Creating the change set must not execute it.

Review every action. Expected application updates normally modify the Lambda
and may update the API stage/integration; route work adds only the reviewed
route. Stop on a replacement/deletion, new service/resource type, public
bucket, wildcard IAM, VPC/NAT, endpoint, WAF, CDN, KMS key, queue, stream,
schedule, alarm, dashboard, provisioned capacity, or concurrency reservation.
Execute only the exact reviewed change set. Wait for `UPDATE_COMPLETE`, then
delete only the exact staged template object after verifying the bucket/key
variables are non-empty and use the deployment prefix.

### Post-deployment verification

1. Verify stack status, drift, outputs, tags, protected-resource retention, and
   the 36-resource/16-type contract.
2. Verify DynamoDB is active, on-demand, deletion-protected in production,
   string `PK`/`SK`, with no unexpected indexes, streams, or paid features.
3. Verify S3 Block Public Access, owner enforcement, exact CORS, TLS policy,
   encryption, and temporary-upload lifecycle.
4. Verify Lambda Node.js 24/arm64, 256 MiB, 30-second timeout, 14-day logs, no
   VPC/reserved/provisioned concurrency, and exact table/bucket IAM scope.
5. Verify every API route has the Cognito JWT authorizer/admin scope, exact
   CORS, and stage throttle 2 requests/second with burst 4.
6. Verify the single Cognito user and exact allow-listed origins.
7. In a clean private browser, test login/logout, list/detail/filter/pagination,
   create/edit/delete on fictional data, publication confirmation, image
   upload, backup download, and controlled 401/403/409/413/429/5xx paths.
8. Inspect CSP violations and logs without recording sensitive data. Search
   logs privately for bearer tokens, signed URL markers, content, email, or
   credentials; the result must be empty.

## Download and retain a backup

Trigger: before a release or incident repair, after a meaningful content
change, and before restoring writes following an outage.

1. Sign in and use the admin backup action. Preserve the downloaded file
   unchanged in approved private storage.
2. Require a filename of
   `admintonibover-aws-backup-<dev|prod>-<timestamp>.json` and validate it
   offline without AWS access:

   ```bash
   pnpm backup:restore -- \
     --input /absolute/private/path/admintonibover-aws-backup-prod-<timestamp>.json \
     --manifest .artifacts/backup-validation-private.json
   ```

3. Require schema v2, normalized UTC export time, environment/filename match,
   unique keys, exact item/entity/page/exclusion counts, revision, and embedded
   item digest. Store the archive hash privately.
4. Remember that JSON excludes transient idempotency/upload-intent items and
   contains S3 keys but no image objects. Protect the S3 objects separately.

## Restore rehearsal

Trigger: periodic recovery verification or an explicitly approved incident
recovery rehearsal. This procedure never targets the active production or
development table.

Choose a unique `recovery-...` run ID and create exactly one disposable stack:

```bash
aws cloudformation create-stack \
  --region eu-west-1 \
  --stack-name <unique-disposable-stack-name> \
  --template-body file://infra/backup-recovery-disposable-table.template.json \
  --parameters \
    ParameterKey=PurposeConfirmation,ParameterValue=AWS-BACKUP-RESTORE \
    ParameterKey=RecoveryRunId,ParameterValue=<recovery-run-id> \
  --tags \
    Key=Project,Value=admintonibover \
    Key=Environment,Value=dev \
    Key=Purpose,Value=AWS-BACKUP-RESTORE \
    Key=RecoveryRunId,Value=<recovery-run-id> \
  --on-failure DELETE

aws cloudformation wait stack-create-complete \
  --region eu-west-1 \
  --stack-name <unique-disposable-stack-name>
```

Verify that the stack is `CREATE_COMPLETE` with only one table. Resolve the
current 12-digit account ID and generated table name privately. The table must
be active, empty under a strongly consistent scan, on-demand, unprotected,
string `PK`/`SK`, and carry the exact project/environment/purpose/run tags.

```bash
pnpm backup:restore -- \
  --execute \
  --input /absolute/private/path/admintonibover-aws-backup-prod-<timestamp>.json \
  --manifest .artifacts/recovery-private.json \
  --run-id <recovery-run-id> \
  --account-id <12-digit-account-id> \
  --region eu-west-1 \
  --table <generated-disposable-table-name> \
  --confirmation "RESTORE <recovery-run-id> <account-id>/eu-west-1/<table-name> <manifest-items-sha256>"
```

Require `completed`, exact counts and revisions, equal canonical digests, zero
missing/mismatched/extra records, and successful representative aggregate/list
reads. If verification fails, retain the private manifest and do not edit the
archive or try a shared table.

After acceptance, re-read stack parameters, tags, and its sole table resource;
delete that exact stack, wait for deletion, and independently confirm the stack
and table are absent. Cleanup is stack deletion, never item-level deletes.

## Image repair

Trigger: the inventory reports a missing main/thumbnail, or an attached image
must be replaced or detached.

1. Use JPEG, PNG, WebP, or AVIF fictional/approved content from 1 byte through
   5 MiB. Main and thumbnail are independent.
2. Open the post, choose the target role, select the file, enter title/alt text,
   and confirm the secure upload. The old image remains canonical until upload
   confirmation and the post-version transaction succeed.
3. On cancellation/failure, retry in the same tab; a reload requires selecting
   the local file again. A `409` means reload the winner before retrying.
4. After success, verify only the intended role/version changed and the private
   preview loads. Do not expose DevTools network details containing signed URLs.
5. For cleanup warnings, compare one exact candidate key to the post's current
   key. Delete only a proven unreferenced object under that post/role prefix;
   never bulk-delete `images/`. Leave abandoned temporary uploads to lifecycle.

## Monitoring and cost response

Trigger: after deployment/recovery, on a budget/anomaly email, or on an
application incident.

Review CloudWatch Lambda/API errors, throttles, latency, duration, and the
14-day logs. Review DynamoDB read/write capacity, transaction conflicts,
conditional failures, throttles, storage, and system errors; S3 storage and
requests; Cognito users/sign-ins; and Bills/Cost Explorer by service and Region.
Avoid paid Cost Explorer API calls solely for evidence.

An alert is not a hard cap. Identify the service and Region, stop or delete only
an unintended resource through its owning stack or exact reviewed procedure,
and recheck after billing data refreshes. Any unexplained recurring service,
resource, error, throttle, or cost blocks further writes and gets a dedicated
incident record.

## Incident rollback

Trigger: a release, infrastructure change, or data operation fails acceptance.

1. Stop admin mutations and record the read-only start time; take the admin
   offline if read-only behavior cannot be guaranteed.
2. Download and validate a current AWS backup when the data path is healthy.
3. Preserve the production table, bucket, Cognito pool/user, backup, and audit
   evidence. Never use the former content system as a rollback target.
4. Revert the smallest responsible application commit or deploy the prior
   reviewed build. For infrastructure, use a separately reviewed CloudFormation
   change set and reject protected-resource replacement/deletion.
5. Repair or restore data only into a new verified target under an approved
   incident plan. The rehearsal command deliberately refuses production.
6. Repeat read-only login, content, image, backup, authorization, logs, and cost
   acceptance before restoring writes.

Bucket versioning is off, so an image deleted after a successful replacement
is not recoverable from S3. The DynamoDB post revision and private backups are
the content audit/recovery record.

# Operations

Owner: the account operator and application super-admin. Run a procedure only
when its trigger applies, using the daily-use identity with MFA, temporary
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

1. Open the application and sign in with the invited email and password. A
   temporary invitation password prompts for a permanent password inside the
   app; no MFA enrollment should appear for the application user.
2. Use **Forgot password?** and the verified-email code inside the app to reset
   the same user. Never create a second administrator as recovery.
   For any newly invited editor, provide the required email attribute and
   ensure `email_verified=true` when provisioning them; session validation and
   verified-email recovery require it. Cognito's invitation password expires
   after three days in this pool.
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

6. Confirm every intended user is enabled, confirmed, verified-email, and in
   exactly the intended group. Confirm self-sign-up is disabled and the client
   has no secret and no OAuth flows. Clear private shell variables afterward.

Successful logout must revoke the refresh token and clear the local encrypted
cookies without visiting a Cognito domain. A restored pre-logout cookie set
must return `401`.

## Invite and manage editors

Trigger: the super-administrator needs to give an editor access or manage an
existing account after the user-management API and exact-pool IAM policy are
deployed.

1. Open **Usuaris** from the avatar menu. Check that the list shows the
   expected users, roles, enabled state, and invitation status. Never copy the
   list into public logs or issue comments.
2. Invite the intended editor's exact email address. The application creates
   the account with delivery suppressed, assigns `editors`, then asks Cognito
   to email the temporary password. If group assignment fails, the account
   remains without an invitation; stop and inspect it privately before retrying.
3. Ask the editor to complete first sign-in and choose a permanent password
   within three days. If the invitation expires, use **Reenviar invitació** on
   the pending account. Confirm the role before any resend.
4. For an existing verified account, **Restablir contrasenya** sends a recovery
   code and puts the account in `RESET_REQUIRED`; the recipient completes the
   app's forgotten-password flow. Disabling an account also calls global
   sign-out. Never disable your own super-admin account.
5. Verify with an editor session that content access still works, **Usuaris**
   is absent, and direct `GET /api/aws/users` plus both mutation routes return
   `403`. Verify signed-out access returns `401`. Do not test by inviting an
   unapproved real person.

Cognito's built-in email sender is currently `COGNITO_DEFAULT`. Its invitation
and recovery email text is managed by Cognito and cannot be customized to
Catalan with this sender; doing so would require a separately approved SES
sender change. The application screen and controls are in Catalan.

## Bootstrap Cognito groups

Trigger: deploy the `super-admins` and `editors` groups and enable group-based
API authorization in an environment.

1. Read the exact private Cognito `Username` for the one existing confirmed,
   enabled administrator. Do not substitute an email alias unless it is the
   returned `Username`:

   ```bash
   aws cognito-idp list-users \
     --region eu-west-1 \
     --user-pool-id "$ADMINTONIBOVER_USER_POOL_ID" \
     --query 'Users[].{Username:Username,Status:UserStatus,Enabled:Enabled}'
   ```

2. Put that value in the ignored deployment parameter file as
   `ExistingSuperAdminUsername`. Review the change set: it must create exactly
   two groups and one membership attachment, modify the public client, Lambda,
   and protected routes in place, and contain no replacement or deletion.
3. Confirm the Lambda and every protected route depend on
   `InitialSuperAdminMembership`, then execute the one reviewed change set and
   wait for `UPDATE_COMPLETE`.
4. Verify the membership without recording the username or response as public
   evidence:

   ```bash
   aws cognito-idp admin-list-groups-for-user \
     --region eu-west-1 \
     --user-pool-id "$ADMINTONIBOVER_USER_POOL_ID" \
     --username "$ADMINTONIBOVER_ADMIN_USERNAME"
   ```

5. Sign out and back in so Cognito issues fresh tokens with the group claim.
   Verify content operations succeed. A valid ungrouped development token must
   receive `403`; missing, modified, ID, or wrong-client tokens must receive
   `401`.
6. In a clean private browser, test an invited editor's first password change,
   a confirmed user's sign-in and refresh, recovery by email code, logout, and
   restored-cookie rejection. Clear private variables.

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

For a development change set containing the build reader, first stage and
verify its separate, content-addressed code zip using
[the reader code artifact procedure](site-build-reader.md#reader-code-artifact).
Keep that code object when removing the temporary CloudFormation template; it
may be needed for a code update or rollback.

Review every action. Expected application updates normally modify the Lambda
and may update the API stage/integration; route work adds only the reviewed
route. Stop on a replacement/deletion, unapproved service/resource type, public
bucket, wildcard IAM, VPC/NAT, endpoint, WAF, CDN, KMS key, queue, stream,
schedule, alarm, dashboard, provisioned capacity, or concurrency reservation.
Execute only the exact reviewed change set. Wait for `UPDATE_COMPLETE`, then
delete only the exact staged template object after verifying the bucket/key
variables are non-empty and use the deployment prefix.

### Post-deployment verification

1. Verify stack status, drift, outputs, tags, protected-resource retention, and
   the 34-resource production contract or 39-resource development contract
   after the reader rollout.
2. Verify DynamoDB is active, on-demand, deletion-protected in production,
   PITR-enabled, string `PK`/`SK`, with no unexpected indexes, streams, or paid
   features.
3. Verify S3 Block Public Access, owner enforcement, exact CORS, TLS policy,
   encryption, versioning `Enabled`, and the temporary-upload and
   previous-version lifecycle rules.
4. Verify Lambda Node.js 24/arm64, 256 MiB, 30-second timeout, 14-day logs, no
   VPC/reserved/provisioned concurrency, and exact table/bucket IAM scope.
5. Verify every API route has the Cognito JWT authorizer without a route scope,
   Lambda requires `super-admins` or `editors`, CORS is exact, and the stage
   throttle remains 2 requests/second with burst 4.
6. Verify both Cognito groups, `ALLOW_USER_PASSWORD_AUTH`, refresh-token auth,
   no client secret, disabled self-registration, and exact allow-listed origins.
7. In a clean private browser, test login/logout, list/detail/filter/pagination,
   create/edit/delete on fictional data, publication confirmation, image
   upload, backup download, and controlled 401/403/409/413/429/5xx paths.
8. Inspect CSP violations and logs without recording sensitive data. Search
   logs privately for bearer tokens, signed URL markers, content, email, or
   credentials; the result must be empty.

## Download and retain a backup

Trigger: before a release or incident repair, after a meaningful content
change, and before restoring writes following an outage.

DynamoDB point-in-time recovery (PITR) is the primary recovery path; see
[Restore rehearsal](#restore-rehearsal). The JSON download is a portable,
operator-owned copy for anything older than the 35-day PITR window.

1. Sign in and use the admin backup action. Preserve the downloaded file
   unchanged in approved private storage.
2. Require a filename of
   `admintonibover-aws-backup-<dev|prod>-<timestamp>.json`. The browser already
   refuses a download whose schema v2 shape, counts, revision, or embedded item
   digest do not validate. Store the archive hash privately.
3. Remember that JSON excludes transient idempotency/upload-intent items and
   contains S3 keys but no image objects. Images rely on S3 versioning; see
   [Restore a deleted or replaced image](#restore-a-deleted-or-replaced-image).
   There is no automated restore from the JSON archive.

## Restore rehearsal

Trigger: acceptance of a PITR change, periodic recovery verification, or an
explicitly approved incident recovery. A point-in-time restore always creates
a new table; it never writes to the active production or development table.

Confirm the restorable window, then restore into a new, uniquely named table:

```bash
aws dynamodb describe-continuous-backups \
  --region eu-west-1 \
  --table-name <content-table-name>

aws dynamodb restore-table-to-point-in-time \
  --region eu-west-1 \
  --source-table-name <content-table-name> \
  --target-table-name <unique-recovery-table-name> \
  --restore-date-time <utc-time-inside-the-window> \
  --billing-mode-override PAY_PER_REQUEST

aws dynamodb wait table-exists \
  --region eu-west-1 \
  --table-name <unique-recovery-table-name>
```

Require `PointInTimeRecoveryStatus` `ENABLED` and a restore time between
`EarliestRestorableDateTime` and `LatestRestorableDateTime`; nothing before
PITR was enabled can be restored. Use `--use-latest-restorable-time` instead of
`--restore-date-time` for a rehearsal.

The waiter gives up after about eight minutes; if it times out, run it again
before treating the restore as failed.

Rehearse while nobody is editing. Edits and TTL expiry change transient
`IDEMPOTENCY`/`MEDIA_UPLOAD` items, so compare durable items only, running the
same count on the restored and source tables:

```bash
aws dynamodb scan \
  --region eu-west-1 \
  --table-name <table-name> \
  --select COUNT \
  --consistent-read \
  --filter-expression "NOT entityType IN (:idempotency, :upload)" \
  --expression-attribute-values '{":idempotency":{"S":"IDEMPOTENCY"},":upload":{"S":"MEDIA_UPLOAD"}}'
```

Require equal counts and the same `revision` on the `SYSTEM`/`REVISION` item
(`get-item` on both), and spot-check a representative post.

The restored table is outside CloudFormation and has no tags, TTL, or PITR. For
an incident, repair only the affected items from it under the approved incident
plan; never point a stack or the app at it. Afterwards, re-check the exact
restored table name and delete it with `aws dynamodb delete-table`, then
confirm it is absent.

## Refresh dev from prod

Trigger: before local testing that needs realistic content. Production is the
only source of truth and is edited only on the production site; dev is a
disposable copy that localhost reads and writes.

Deploy the current `main` to dev first, so dev's Lambda understands the shape
of production data. Then, with operator credentials for the account:

```bash
pnpm dev:refresh
pnpm dev:refresh -- --execute --confirm <code>
```

The first command is a dry run. It resolves both tables and buckets from the
`admintonibover-prod` and `admintonibover-dev` stack outputs, refuses any
target that is not `Environment=dev`, looks like production, or shares a
resource with the source, then reads prod and dev and prints the plan and a
confirmation code. The prod read follows the backup rule: the data revision
must not move during the scan.

The second command applies exactly that plan; if prod or dev changed since the
dry run, the code no longer matches and nothing is written. It copies changed
images under `images/`, writes changed items (revision last), deletes dev items
and images that prod does not have, then re-reads dev and fails unless it
matches the prod snapshot. A verified run then stores both data revisions in
the dev bucket at `refresh/last-refresh.json` (cleared before any write, so a
failed run never looks current). The next run reads only the two revisions and
that marker; when neither moved it reports dev as up to date and stops. Every
prod and dev save, image uploads included, moves its revision, so only a manual
S3 change is missed; `pnpm dev:refresh -- --full` always compares everything.
`IDEMPOTENCY` and `MEDIA_UPLOAD` records are never
copied and are cleared from dev. Prod is opened read-only, and dev Cognito
users, `backups/`, and `temporary/` are untouched. Direct table writes do not
trigger site rebuilds. Anything edited only in dev is lost by design.

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

### Restore a deleted or replaced image

Trigger: an image object was deleted or overwritten by mistake, or a replaced
image is wanted back, within 35 days. Bucket versioning keeps each previous
object version for 35 days (temporary uploads for one day). Nothing older, and
nothing deleted or overwritten before versioning was enabled, can be recovered
from S3.

List the versions under the exact post/role prefix and pick the wanted
`VersionId` (a deleted object shows a newer `DeleteMarker`):

```bash
aws s3api list-object-versions \
  --region eu-west-1 \
  --bucket <content-bucket-name> \
  --prefix images/posts/<post-id>/<role>/
```

- **The post still references the key** (the object alone is gone or wrong):
  copy that version back over the same key, then confirm the private preview
  loads.

  ```bash
  aws s3api copy-object \
    --region eu-west-1 \
    --bucket <content-bucket-name> \
    --key <exact-key> \
    --copy-source "<content-bucket-name>/<exact-key>?versionId=<version-id>" \
    --checksum-algorithm SHA256 \
    --metadata-directive COPY
  ```

  Then require `head-object --checksum-mode ENABLED` to return the post's
  stored SHA-256; a display alone is not proof.

- **The post now references a different image** (a replacement to undo):
  download that version with `aws s3api get-object --version-id`, then upload
  it again through the admin as in [Image repair](#image-repair). Never edit
  the post's image key in DynamoDB by hand.

## Site rebuilds after content changes

Trigger: enabling, rotating or disabling the site rebuild hook, a
`site_rebuild_failed` log event, a failed site deployment notification, or an
editor reporting the rebuild warning.

The public site is a static build. After an AWS write commits, the admin
server posts to one branch-bound Vercel Deploy Hook held in
`SITE_REBUILD_HOOK_URL` ([admin #58](https://github.com/boversauros/admintonibover/issues/58)).
The URL is a bearer secret: anyone holding it can start site builds. It is a
server-only variable (never `NEXT_PUBLIC_`), is never logged or returned to
the browser, and CI checks the repository and browser output for it.

Which committed mutations request a build:

| Mutation                            | Build requested                 |
| ----------------------------------- | ------------------------------- |
| Publish or unpublish one post       | Always                          |
| Bulk publication                    | When it published any post      |
| Create or update a post             | Only when the post is published |
| Delete a post                       | Always                          |
| Attach or detach a main/thumb image | Always                          |
| Reads, users, backups               | Never                           |

Each proxied mutation response carries `x-site-rebuild`: `requested` (Vercel
queued a build; it has not finished), `failed`, `disabled` (no hook
configured) or `skipped` (the site cannot have changed). The mutation's own
status and body never depend on the hook. A failure shows a persistent notice
with **Actualitzar la web**, which calls the same-origin, signed-in
`POST /api/site/rebuild`. The next successful save also clears it, because
every build reads the complete published snapshot.

Delay, bursts and limits: the hook call waits at most 5 seconds; the site is
current once the queued Vercel build completes (normally a few minutes). If a
hook is triggered again for the same commit, Vercel cancels the earlier build,
so a burst of saves coalesces into the latest build without admin-side state.
Vercel allows 60 Deploy Hook triggers per hour per project. A long image
re-upload session can reach it: the request then fails with `429`, the notice
appears, and a later retry or save covers the earlier changes.

Unpublish urgency: an unpublished or deleted post stays on the site until a
later build succeeds. A failed hook or failed build after an unpublish is
therefore the urgent case; retry immediately or redeploy manually. Previously
built image files and old deployment URLs can outlive the unpublish
(see [site-build-reader.md](site-build-reader.md#media)).

Alerting: Vercel keeps the last successful deployment on the branch alias, so
a failed build is never promoted. Enable Vercel deployment-failure
notifications for the operator on the `tonibover` project, and review the
admin's runtime logs for `site_rebuild_failed` and
`site_rebuild_misconfigured` (fixed event names with a failure class and HTTP
status only). A misconfigured value never fails a mutation; it reports
`failed`.

### Enable, rotate or disable

1. In the `tonibover` Vercel project, create one Deploy Hook for branch `dev`
   only, named for the admin. During Preview acceptance it must not target
   `main`. The public-site hook is created only as part of the accepted
   cutover ([site #16](https://github.com/boversauros/tonibover/issues/16)).
2. Set `SITE_REBUILD_HOOK_URL` as a sensitive variable in the admin Vercel
   project's **Production** environment only. Do not set it in admin
   Preview/Development or `.env.local`: admin-dev writes do not feed the site
   Preview and would spend the hourly hook budget.
3. The change takes effect on the next admin Production deployment that
   contains this feature. Admin Production deploys from its production branch,
   so a `dev`-only merge does not enable it.
4. Verify with the owner's normal production edits, not agent-created
   content: one save of a published post shows a new `dev` Preview build from
   the hook and the change on the Preview after it completes. Record only
   redacted evidence (times, statuses, build outcome).
5. To rotate, create the new hook, replace the variable, redeploy the admin,
   then revoke the old hook in Vercel. To disable, remove the variable and
   redeploy; mutations then report `disabled` and a manual Vercel redeploy of
   the site branch remains the fallback.

Cost: Deploy Hooks are free; each triggered build uses the site project's
Vercel build minutes and one production-reader invocation set.

## Replace legacy numeric post slugs

The import normalized 71 Supabase placeholder slugs (`-N`) to plain numbers
(`N`). On the public site `/<lang>/reflexions/<N>/` is also listing page N, so
these posts would be hidden once enough posts are published; the site build
fails instead (tonibover #14). The admin form has no slug field, so the fix is
a one-time super-admin tool (admin #68).

Release order:

1. Merge admin `dev` into `main` when the owner starts using the site.
2. A super-admin opens **Adreces antigues** (`/adreces`, user menu), runs
   **Analitzar articles**, reviews the preview, and confirms. Each post is
   re-read and saved once through the normal update route; only its slugs and
   `updatedAt` change. Published posts trigger a site rebuild.
3. Before re-running the analysis, copy the redirect list from the page into
   the site cutover (tonibover #16); a new analysis no longer shows fixed posts.
4. Run the analysis again; it must report no remaining posts. Rows flagged as
   clashing need a title change by the owner, then another run.
5. Only then start publishing the migrated posts.

Safety nets for later edits (browser-side; the site build guard is the hard
backstop): saving a post replaces a legacy numeric slug with its title slug,
publishing from the form always saves first, **Publicar tots** refuses while a
draft still has one, and the form rejects titles whose slug is `index` or a
category slug. Domain validation is unchanged because it also runs on reads.

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
   incident plan; see [Restore rehearsal](#restore-rehearsal).
6. Repeat read-only login, content, image, backup, authorization, logs, and cost
   acceptance before restoring writes.

S3 versioning keeps previous image versions for 35 days; see
[Restore a deleted or replaced image](#restore-a-deleted-or-replaced-image).
DynamoDB PITR, the post revision, and private backups are the content
audit/recovery record.

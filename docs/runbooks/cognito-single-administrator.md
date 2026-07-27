# Single Cognito administrator

This runbook creates and verifies the one development content administrator
required by
[issue #8](https://github.com/boversauros/admintonibover/issues/8). It assumes
the `admintonibover-dev` CloudFormation stack from issue #7 is already
`CREATE_COMPLETE` or `UPDATE_COMPLETE`.

The administrator is an application user in Amazon Cognito. It is not an AWS
root or IAM user and receives no AWS credentials.

## Approved sign-in decision

The original issue required TOTP MFA. On 2026-07-27 the product owner replaced
that requirement with a password-only application login for accessibility and
ease of use:

- normal application login is email plus password;
- the verified email receives the invitation and password-recovery codes;
- application MFA is off;
- AWS root and daily-use IAM MFA remain mandatory and separate;
- self-registration remains disabled; and
- exactly one enabled Cognito administrator remains the authorization model.

The issue acceptance text records this decision.

## Fixed scope

| Setting            | Required value                                      |
| ------------------ | --------------------------------------------------- |
| Region             | `eu-west-1`                                         |
| Stack              | `admintonibover-dev`                                |
| User pool          | The stack's `UserPoolId` output                     |
| App client         | The stack's `UserPoolClientId` output               |
| Callback/logout    | `https://admin.tonibover.cat/`                      |
| User-pool tier     | `LITE`                                              |
| Administrators     | Exactly one confirmed, enabled, verified-email user |
| Application MFA    | `OFF`, with no user MFA preference                  |
| Recovery           | Verified email only                                 |
| OAuth flow         | Authorization Code with PKCE, public client         |
| Access/ID lifetime | 15 minutes                                          |
| Refresh lifetime   | One day                                             |

Never record the administrator email, password, recovery code, authorization
code, token, account ID, ARN, or private console screenshot in GitHub, logs, or
repository files.

## Resolve the stack outputs

Open CloudShell from the verified daily-use AWS console session. Keep every
command explicitly in `eu-west-1`.

```bash
export ADMINTONIBOVER_USER_POOL_ID="$(
  aws cloudformation describe-stacks \
    --region eu-west-1 \
    --stack-name admintonibover-dev \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue|[0]' \
    --output text
)"

export ADMINTONIBOVER_CLIENT_ID="$(
  aws cloudformation describe-stacks \
    --region eu-west-1 \
    --stack-name admintonibover-dev \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolClientId`].OutputValue|[0]' \
    --output text
)"

export ADMINTONIBOVER_LOGIN_URL="$(
  aws cloudformation describe-stacks \
    --region eu-west-1 \
    --stack-name admintonibover-dev \
    --query 'Stacks[0].Outputs[?OutputKey==`CognitoLoginUrl`].OutputValue|[0]' \
    --output text
)"

export ADMINTONIBOVER_API_URL="$(
  aws cloudformation describe-stacks \
    --region eu-west-1 \
    --stack-name admintonibover-dev \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue|[0]' \
    --output text
)"
```

Stop if any value is empty or comes from a different stack or Region.

## Verify the pool before creating a user

```bash
aws cognito-idp describe-user-pool \
  --region eu-west-1 \
  --user-pool-id "$ADMINTONIBOVER_USER_POOL_ID" \
  --query 'UserPool.{
    EstimatedUsers:EstimatedNumberOfUsers,
    MFA:MfaConfiguration,
    AdminCreateOnly:AdminCreateUserConfig.AllowAdminCreateUserOnly,
    Recovery:AccountRecoverySetting.RecoveryMechanisms,
    PasswordPolicy:Policies.PasswordPolicy,
    Tier:UserPoolTier
  }' \
  --output json

aws cognito-idp describe-user-pool-client \
  --region eu-west-1 \
  --user-pool-id "$ADMINTONIBOVER_USER_POOL_ID" \
  --client-id "$ADMINTONIBOVER_CLIENT_ID" \
  --query 'UserPoolClient.{
    HasSecret:ClientSecret,
    OAuthFlows:AllowedOAuthFlows,
    OAuthScopes:AllowedOAuthScopes,
    CallbackURLs:CallbackURLs,
    LogoutURLs:LogoutURLs,
    AccessTokenValidity:AccessTokenValidity,
    IdTokenValidity:IdTokenValidity,
    RefreshTokenValidity:RefreshTokenValidity,
    TokenUnits:TokenValidityUnits
  }' \
  --output json
```

Required results:

- zero users before the first run;
- `MFA=OFF`;
- administrator-created users only;
- verified email is the only recovery mechanism;
- Lite tier and the reviewed password policy;
- no `ClientSecret`;
- only the `code` OAuth flow;
- the exact callback/logout URLs and admin scope; and
- 15-minute access/ID tokens plus a one-day refresh token.

Prove self-registration is blocked with a fake reserved-domain address:

```bash
aws cognito-idp sign-up \
  --region eu-west-1 \
  --client-id "$ADMINTONIBOVER_CLIENT_ID" \
  --username self-signup-probe@example.invalid \
  --password 'NotARealPassword!123'
```

The request must fail with `NotAuthorizedException: SignUp is not permitted for
this user pool`. Stop if it creates a user.

## Create exactly one user

Read the real email privately into the CloudShell session:

```bash
read -r -p "Administrator email: " ADMINTONIBOVER_ADMIN_EMAIL
```

Confirm ownership of the mailbox before marking it verified. Then let Cognito
generate and email the temporary password:

```bash
aws cognito-idp admin-create-user \
  --region eu-west-1 \
  --user-pool-id "$ADMINTONIBOVER_USER_POOL_ID" \
  --username "$ADMINTONIBOVER_ADMIN_EMAIL" \
  --user-attributes \
    Name=email,Value="$ADMINTONIBOVER_ADMIN_EMAIL" \
    Name=email_verified,Value=true \
  --desired-delivery-mediums EMAIL \
  --query 'User.{Status:UserStatus,Enabled:Enabled}' \
  --output json
```

The initial state must be `FORCE_CHANGE_PASSWORD` and enabled. Confirm there is
exactly one user:

```bash
aws cognito-idp list-users \
  --region eu-west-1 \
  --user-pool-id "$ADMINTONIBOVER_USER_POOL_ID" \
  --query '{Count:length(Users),Users:Users[].{Status:UserStatus,Enabled:Enabled}}' \
  --output json
```

Never create a second user to recover the first. Use password recovery or the
documented enable/reset operations below.

## Complete first sign-in

Until the application callback is implemented, use a private one-time PKCE
verification session. Generate a verifier, state, and nonce in CloudShell:

```bash
export ADMINTONIBOVER_CODE_VERIFIER="$(
  openssl rand -base64 96 |
  tr -d '\n' |
  tr '+/' '-_' |
  tr -d '='
)"

export ADMINTONIBOVER_CODE_CHALLENGE="$(
  printf '%s' "$ADMINTONIBOVER_CODE_VERIFIER" |
  openssl dgst -binary -sha256 |
  openssl base64 -A |
  tr '+/' '-_' |
  tr -d '='
)"

export ADMINTONIBOVER_OAUTH_STATE="$(openssl rand -hex 16)"
export ADMINTONIBOVER_OAUTH_NONCE="$(openssl rand -hex 16)"

printf '%s\n' \
"${ADMINTONIBOVER_LOGIN_URL}/oauth2/authorize?response_type=code&client_id=${ADMINTONIBOVER_CLIENT_ID}&redirect_uri=https%3A%2F%2Fadmin.tonibover.cat%2F&scope=openid+email+profile+admintonibover-api%2Fadmin&code_challenge=${ADMINTONIBOVER_CODE_CHALLENGE}&code_challenge_method=S256&state=${ADMINTONIBOVER_OAUTH_STATE}&nonce=${ADMINTONIBOVER_OAUTH_NONCE}"
```

Open only the newly printed URL. Use the emailed temporary password, choose and
save a permanent password, and confirm that no MFA enrollment appears. Cognito
redirects to the exact callback with one-time `code` and `state` parameters.

Run the input command separately so it waits for the operator instead of
consuming a later pasted shell command:

```bash
read -r -p "Paste complete redirect URL: " ADMINTONIBOVER_REDIRECT_URL
```

Extract and validate the response without printing its secrets:

```bash
ADMINTONIBOVER_AUTH_CODE="$(
  printf '%s' "$ADMINTONIBOVER_REDIRECT_URL" |
  sed -n 's/.*[?&]code=\([^&]*\).*/\1/p'
)"

ADMINTONIBOVER_RETURNED_STATE="$(
  printf '%s' "$ADMINTONIBOVER_REDIRECT_URL" |
  sed -n 's/.*[?&]state=\([^&]*\).*/\1/p'
)"

test -n "$ADMINTONIBOVER_AUTH_CODE"
test "$ADMINTONIBOVER_RETURNED_STATE" = "$ADMINTONIBOVER_OAUTH_STATE"
```

Stop and start a fresh authorization request if either test fails. Exchange a
matching code immediately:

```bash
umask 077

ADMINTONIBOVER_TOKEN_HTTP_STATUS="$(
  curl -sS \
    -o /tmp/admintonibover-tokens.json \
    -w '%{http_code}' \
    -X POST \
    "${ADMINTONIBOVER_LOGIN_URL}/oauth2/token" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode 'grant_type=authorization_code' \
    --data-urlencode "client_id=$ADMINTONIBOVER_CLIENT_ID" \
    --data-urlencode "code=$ADMINTONIBOVER_AUTH_CODE" \
    --data-urlencode 'redirect_uri=https://admin.tonibover.cat/' \
    --data-urlencode "code_verifier=$ADMINTONIBOVER_CODE_VERIFIER"
)"

test "$ADMINTONIBOVER_TOKEN_HTTP_STATUS" = "200"
```

The token response must contain bearer access, ID, and refresh tokens. Decode
only selected claims; never print or retain the raw tokens. Verify:

- issuer is the exact pool issuer;
- access-token `client_id` and ID-token `aud` equal the public client;
- token uses are `access` and `id`;
- `sub` exists and email is verified;
- access-token scope contains `admintonibover-api/admin`;
- the ID-token nonce matches the generated nonce; and
- access and ID expiration are approximately 15 minutes after issuance.

Call the protected health route with the access token. It must return `200`.
The same call without a token must return `401`, with the ID token must return
`401` or `403`, and with a modified access-token signature must return `401`.

## Recovery and disable-user rehearsal

The managed login **Forgot password?** flow must deliver an email code and
allow a new compliant password. Cognito passwords cannot be recovered or
displayed.

Revoke every refresh session during an incident:

```bash
aws cognito-idp admin-user-global-sign-out \
  --region eu-west-1 \
  --user-pool-id "$ADMINTONIBOVER_USER_POOL_ID" \
  --username "$ADMINTONIBOVER_ADMIN_EMAIL"
```

A refresh-token grant using the prior token must then fail with HTTP `400`
`invalid_grant`.

Disable access:

```bash
aws cognito-idp admin-disable-user \
  --region eu-west-1 \
  --user-pool-id "$ADMINTONIBOVER_USER_POOL_ID" \
  --username "$ADMINTONIBOVER_ADMIN_EMAIL"
```

Restore the same user without creating another:

```bash
aws cognito-idp admin-enable-user \
  --region eu-west-1 \
  --user-pool-id "$ADMINTONIBOVER_USER_POOL_ID" \
  --username "$ADMINTONIBOVER_ADMIN_EMAIL"
```

The API Gateway HTTP API authorizer verifies self-contained JWT signatures and
expiration. Cognito token revocation prevents refresh and Cognito API use, but
a third-party JWT verifier can still accept a revoked access token until its
15-minute expiry. The short access-token lifetime bounds this residual window.
Changing this to immediate revocation requires a separately reviewed,
revocation-aware authorizer.

## Final state and cleanup

The final query must report exactly one confirmed and enabled user, with
verified email and no MFA preference:

```bash
aws cognito-idp list-users \
  --region eu-west-1 \
  --user-pool-id "$ADMINTONIBOVER_USER_POOL_ID" \
  --query '{
    Count:length(Users),
    Users:Users[].{
      Status:UserStatus,
      Enabled:Enabled,
      EmailVerified:Attributes[?Name==`email_verified`].Value|[0]
    }
  }' \
  --output json

aws cognito-idp admin-get-user \
  --region eu-west-1 \
  --user-pool-id "$ADMINTONIBOVER_USER_POOL_ID" \
  --username "$ADMINTONIBOVER_ADMIN_EMAIL" \
  --query '{
    PreferredMFA:PreferredMfaSetting,
    MFASettings:UserMFASettingList
  }' \
  --output json
```

Delete temporary token files and clear sensitive session variables:

```bash
rm -- \
  /tmp/admintonibover-tokens.json \
  /tmp/admintonibover-auth-health.json \
  /tmp/admintonibover-refresh-after-signout.json

unset ADMINTONIBOVER_ADMIN_EMAIL
unset ADMINTONIBOVER_AUTH_CODE
unset ADMINTONIBOVER_REDIRECT_URL
unset ADMINTONIBOVER_RETURNED_STATE
unset ADMINTONIBOVER_CODE_VERIFIER
unset ADMINTONIBOVER_CODE_CHALLENGE
unset ADMINTONIBOVER_OAUTH_STATE
unset ADMINTONIBOVER_OAUTH_NONCE
```

## Redacted acceptance evidence

The 2026-07-27 rehearsal produced the following private-source, redacted
evidence:

- the pool was resolved from the expected `admintonibover-dev` stack;
- exactly one confirmed, enabled, verified-email administrator existed;
- application MFA was off and the user had no MFA preference;
- self-sign-up failed with `NotAuthorizedException`;
- normal password login and verified-email password recovery succeeded;
- token issuer, client/audience, use, nonce, scope, and expiry matched;
- the valid access token returned `200`;
- no token returned `401`, an ID token returned `403`, and a modified token
  returned `401`;
- global sign-out made refresh fail with `400 invalid_grant`;
- disable reported `False`, re-enable reported `True`; and
- temporary token files were deleted.

No raw identifier, email, password, code, token, or screenshot is accepted as
repository evidence.

## Cost impact

The pool remains on the Cognito Lite tier with one direct monthly active user,
no email/SMS MFA, no advanced security add-on, and no machine-to-machine app
client. The official pricing page reviewed on 2026-07-27 publishes a shared
free allowance of 10,000 direct/social MAUs per month for Lite and Essentials.
One administrator is therefore within the current allowance, but pricing is
not permanent and must be rechecked before production.

- [Amazon Cognito pricing](https://aws.amazon.com/cognito/pricing/)
- [Cognito feature plans](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-sign-in-feature-plans.html)
- [Password recovery](https://docs.aws.amazon.com/cognito/latest/developerguide/managing-users-passwords.html)
- [Token revocation](https://docs.aws.amazon.com/cognito/latest/developerguide/token-revocation.html)
- [API Gateway JWT authorizers](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html)

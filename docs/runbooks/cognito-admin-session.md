# Secure Cognito admin session

This runbook configures and verifies the Next.js session/BFF flow implemented
for issue #13. The existing Cognito User Pool, public app client, managed-login
domain, and single administrator remain owned by the development foundation
stack and the [single-administrator runbook](cognito-single-administrator.md).
No AWS access key or Cognito client secret belongs in Next.js or Vercel.

## Security boundary

- Cognito collects the email and password through managed login. Next.js never
  receives the password.
- Authorization Code with PKCE binds the callback to the browser that started
  sign-in. State, nonce, verifier, access token, ID token, and refresh token are
  stored only in encrypted, authenticated, host-only, HttpOnly, SameSite=Lax
  cookies.
- Production cookies are Secure. Local HTTP is the documented development-only
  exception.
- The browser receives only the administrator subject, verified email, and
  access expiry from `/auth/session`. Browser API calls never receive an AWS
  access key or Cognito bearer token.
- Every BFF request decrypts the session, verifies JWT signature and claims,
  and calls Cognito `userInfo`. The latter rejects a revoked access token, so a
  successfully logged-out session cannot be replayed during the access token's
  remaining lifetime.
- State-changing BFF and logout requests require the exact application Origin.
  JSON BFF mutations also require `Content-Type: application/json`.

Rotating the session secret immediately invalidates every local session. It
does not modify the Cognito administrator or password.

## Exact URL policy

| Environment    | Callback                                    | Logout                         | Policy                                                                        |
| -------------- | ------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------- |
| Local          | `http://localhost:3000/auth/callback`       | `http://localhost:3000/`       | May target only the dev AWS stack.                                            |
| Production     | `https://admin.tonibover.cat/auth/callback` | `https://admin.tonibover.cat/` | Register before production verification; keep the AWS flag off until cutover. |
| Vercel preview | None by default                             | None by default                | Arbitrary deployment URLs are intentionally unsupported.                      |

Cognito does not accept arbitrary callback wildcards. If an AWS-authenticated
preview becomes necessary, assign it a stable HTTPS domain, review that domain
as an environment boundary, and add its exact origin, callback, and logout URL
through the CloudFormation parameters. Remove the entry after the preview is
retired. Unapproved Vercel previews remain deployment-protected and do not
receive the AWS Cognito configuration.

## Update the development stack

Do not edit the Cognito app client directly in the AWS Console. Use the current
committed CloudFormation template and a private copy of
`infra/parameters/dev.example.json` as described in
[AWS development foundation](aws-development-foundation.md).

The reviewed development parameter values must include:

```json
{
  "AllowedOrigins": "http://localhost:3000,https://admin.tonibover.cat",
  "CallbackUrls": "http://localhost:3000/auth/callback,https://admin.tonibover.cat/auth/callback",
  "LogoutUrls": "http://localhost:3000/,https://admin.tonibover.cat/"
}
```

The private parameter file retains the complete array shape expected by
CloudFormation; the object above shows only the three relevant values. Create
and review an update change set. The expected Cognito change is an in-place
update to `UserPoolClient`; stop if the change set replaces the user pool,
client, domain, or administrator.

After execution, use stack outputs rather than copied resource names and verify
the app client:

```bash
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
    TokenRevocation:EnableTokenRevocation
  }' \
  --output json
```

Required result: no client secret, only the `code` flow, the exact URLs above,
the `admintonibover-api/admin` scope, and token revocation enabled.

## Local and Vercel configuration

Resolve all non-secret values from the named stack outputs. For local testing,
store them only in the ignored `.env.local`:

```env
AWS_ADMIN_API_URL=<ApiUrl output>
AWS_COGNITO_CLIENT_ID=<UserPoolClientId output>
AWS_COGNITO_ISSUER=<UserPoolIssuer output>
AWS_COGNITO_LOGIN_URL=<CognitoLoginUrl output>
AWS_COGNITO_CALLBACK_URL=http://localhost:3000/auth/callback
AWS_COGNITO_LOGOUT_URL=http://localhost:3000/
AWS_COGNITO_SESSION_SECRET=<base64url-encoded 32-byte random value>
AWS_CONTENT_BUCKET_ORIGIN=https://<BucketName>.s3.eu-west-1.amazonaws.com
```

Generate the local session secret without printing it into repository logs:

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'
```

Copy the output directly into `.env.local`. Use a separately generated value
for Vercel Production. In Vercel, all variables in the block are server-only;
none may use a `NEXT_PUBLIC_` prefix. Scope the production callback/logout and
session secret to Production. Do not give unapproved Preview deployments these
values. Changing `AWS_COGNITO_SESSION_SECRET` logs out all local sessions.

## Automated verification

Run the credential-free suite before live testing:

```bash
pnpm run ci
```

The tests cover PKCE, exact state/nonce binding, required refresh tokens,
issuer/audience/scope/use/subject claims, encrypted cookie tampering and expiry,
safe return paths, logout URL construction, CSRF origin checks, JSON mutation
requirements, infrastructure URLs, feature-flag isolation, and secret scans.

## Manual acceptance

Use the existing single administrator and fictional fixture content only.
Never attach tokens, cookies, authorization codes, account identifiers, email
addresses, or private screenshots to the PR.

1. Start the app and choose **Continue to secure sign-in**. Sign in with email
   and password. No MFA enrollment or
   challenge may appear.
2. Confirm the callback is exactly `/auth/callback`, returns to `/`, and never
   loops back through login while the session is valid.
3. In browser storage, confirm the Cognito cookies are HttpOnly and their values
   are encrypted JWE strings, not recognizable JWTs or refresh tokens. In
   production they must also be Secure. Local storage and session storage must
   contain no Cognito or AWS value.
4. Inspect HTML, request URLs, Console, and error telemetry. An authorization
   code and state may appear only on the one-time callback URL. No access token,
   refresh token, presigned URL, password, or AWS credential may appear.
5. Alter one encrypted session cookie and reload. The BFF must return `401`,
   clear the cookies, and return the UI to login. Repeat after access expiry to
   verify refresh and cookie rotation.
6. Submit a mutation with a cross-origin `Origin` or non-JSON content type. The
   BFF must reject it before an AWS request. A normal same-origin mutation must
   retain its idempotency key and succeed.
7. Sign out. Confirm local cookies are cleared, the refresh token is revoked,
   Cognito managed login is cleared, and restoring a pre-logout encrypted
   cookie set produces `401` through the revocation-aware `userInfo` check.
8. Use **Forgot password?** on managed login. The verified-email recovery code
   must reset the same administrator account and return it to normal login.

## Rollback

Before the first accepted AWS content mutation, stop mutations and take the
admin offline or keep it read-only. Keep the Cognito stack and administrator
intact for investigation.

If callback configuration itself must be rolled back, use a reviewed
CloudFormation change set with the prior exact parameter values. Never repair
it with a direct Console edit. Rotate the Vercel session secret if encrypted
cookie material might have escaped; this invalidates every local session.

After the first accepted AWS mutation, follow the source-of-truth checkpoint in
the architecture ADR and preserve AWS as the only data source.

## Cost impact

This change creates no AWS resource. It uses the existing Cognito token,
revocation, JWKS, managed-login, and `userInfo` endpoints for one administrator.
Recheck the existing account budgets and current Cognito pricing before the
production change set; do not treat a historical free allowance as permanent.

- [Cognito token revocation](https://docs.aws.amazon.com/cognito/latest/developerguide/token-revocation.html)
- [Cognito userInfo endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/userinfo-endpoint.html)

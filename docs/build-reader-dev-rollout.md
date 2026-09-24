# Development build reader review and rollout

Issue [#56](https://github.com/boversauros/admintonibover/issues/56) implements the
[v1 build reader contract](site-build-reader-contract.md) on `dev`. The generated
development template adds five resources to the existing foundation stack:

| Resource                   | Access and purpose                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Reader Lambda              | IAM-only synchronous `Invoke`; no Function URL or API route. Its code comes from a content-addressed zip in the private development bucket. |
| Reader execution role      | `GetItem`/`Query` on the exact content table, `GetObject` under `images/posts/*`, and writes to its own log group.                          |
| Reader log group           | Standard class, 14-day retention.                                                                                                           |
| Vercel Team OIDC provider  | Exact verified Team issuer URL and audience.                                                                                                |
| Vercel Preview invoke role | Exact project and `preview` subject; `InvokeFunction` on the reader only.                                                                   |

The development template grows from 42 to 47 resources. The production template
stays at 42 resources and adds no reader, role, or provider. The generated
reader bundle is packaged separately so the template stays below CloudFormation's
1 MB limit. Cloud-free tests and the
offline infrastructure validator inspect the trust and IAM policies. The
existing admin Lambda, Cognito routes, and their permissions stay intact.

The new deployment parameters `VercelTeamSlug`,
`VercelSiteProjectName`, and `ReaderCodeObjectKey` are required and have no defaults.
Run `pnpm reader:build`, upload `infra/generated/build-reader-lambda.zip` to
the printed key in the existing private development content bucket, and set
`ReaderCodeObjectKey` to that exact key. The key includes the zip SHA-256, so a
new build needs a new key. The code object stays outside the reader's own S3
permissions. Fill the Vercel parameters from the
actual site Preview deployment, verify its OIDC issuer, `aud`, and `sub`, and
review the resulting change set before a development deployment. Team Preview
identity includes other Preview branches of the same project, as accepted in
[#55](https://github.com/boversauros/admintonibover/issues/55). A live Preview
build still needs to prove role assumption and a reader invocation. Do not put
the token or private identifiers in public issue or PR evidence.

Read-only AWS inventory was rechecked on 2026-09-24: non-root caller, correct
account and `eu-west-1` stack, `UPDATE_COMPLETE`, 42 resources, matching table,
bucket, and admin Lambda outputs, active table and Lambda, full S3 Block Public
Access, and no Vercel OIDC provider. No AWS resource or content was changed.

## Cost and rollback

The new Lambda adds request and duration charges per build read, including one
request per page, post detail, revision, catalog, and image grant. Strongly
consistent DynamoDB `GetItem`/`Query` reads add read request charges and can
read multiple internal pages. S3 `HeadObject` and signed GET downloads add
request charges and image egress to the build host. The dedicated CloudWatch
log group adds ingestion and retained storage for 14 days. IAM roles and the
OIDC provider have no direct hourly charge. There is no VPC, NAT, provisioned
concurrency, public bucket setting, or new table. Exact currency spend depends
on published content size, build frequency, and image bytes. The private
deployment zip adds one small S3 object plus one PUT and one deployment GET.

To roll back after the site no longer depends on the reader, remove the five
development resources and three parameters from the template and apply a reviewed
development change set. Existing table, bucket, admin Lambda, Cognito users,
and content remain. Delete the unused content-addressed zip as a separate,
reviewed cleanup after rollback. Production deployment and static image publication remain
separate approval-gated work.

# Authenticated admin API parity

Issue: [#12](https://github.com/boversauros/admintonibover/issues/12)

This runbook covers the development Lambda and HTTP API admin surface. The
routes reuse the issue #10 post repository and issue #11 media service; they do
not trigger a Vercel/Astro deployment.

## Route contract

Every route is attached to the API Gateway Cognito JWT authorizer with the
`admintonibover-api/admin` scope. Lambda repeats the issuer, app-client,
access-token, subject, and admin-scope checks. API Gateway rejects missing,
expired, invalid-signature, wrong-issuer, and wrong-audience JWTs before Lambda
when possible. A valid token without the admin scope receives `403` from the
defense-in-depth check.

| Method         | Path                         | Contract                                                                                             |
| -------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET`          | `/health`                    | Protected runtime health                                                                             |
| `GET`          | `/posts`                     | Cursor page, limit 1-50, title/publication/category filters and ascending/descending order           |
| `POST`         | `/posts`                     | Create a complete post aggregate; requires `Idempotency-Key`                                         |
| `GET`          | `/posts/{id}`                | Get one aggregate and its `ETag` version                                                             |
| `PUT`          | `/posts/{id}`                | Conditional full update; requires `If-Match` and `Idempotency-Key`                                   |
| `DELETE`       | `/posts/{id}`                | Atomic aggregate/slug deletion plus observable S3 cleanup; requires `If-Match` and `Idempotency-Key` |
| `PUT`          | `/posts/{id}/publication`    | Publish/unpublish with `PUBLISH`/`UNPUBLISH` confirmation, `If-Match`, and `Idempotency-Key`         |
| `POST`         | `/posts/publication/bulk`    | Publish an exact draft set with typed count, `confirmation: "PUBLISH_ALL"`, and `Idempotency-Key`    |
| `GET`/`POST`   | `/categories`                | List/create bilingual category records                                                               |
| `PUT`/`DELETE` | `/categories/{id}`           | Versioned category management; referenced categories cannot be deleted                               |
| `GET`/`POST`   | `/keywords`                  | List/create language-specific keyword records                                                        |
| `PUT`/`DELETE` | `/keywords/{id}`             | Versioned keyword management                                                                         |
| `GET`          | `/backup`                    | Download a paginated full-table DynamoDB JSON backup                                                 |
| `GET`          | `/posts/{id}/images`         | Inspect private image state                                                                          |
| `POST`         | `/posts/{id}/images/presign` | Create a checksum-bound upload intent                                                                |
| `POST`         | `/posts/{id}/images/confirm` | Confirm and attach an uploaded image                                                                 |

Successful post and taxonomy reads/writes return an `ETag` containing the
numeric version. A stale `If-Match` receives `409` and cannot overwrite newer
data. Retryable mutations require a safe 8-200 character idempotency key; the
record is scoped to the route and authenticated subject and expires after 24
hours.

Errors use this stable shape and never expose exception messages:

```json
{
  "version": 1,
  "error": { "code": "VALIDATION_FAILED", "message": "Safe message" },
  "requestId": "correlation-id"
}
```

The API distinguishes validation (`400`), unauthenticated (`401`), forbidden
(`403`), not found (`404`), conflict (`409`), throttled (`429`), oversized
payload/backup (`413`), and internal (`500`) failures. JSON mutations are
capped at 256 KiB; list responses are capped at 50 posts; bulk publication is
capped at 100 posts; the synchronous backup is capped below Lambda's response
limit.

## Backup and restoration check

`GET /backup` performs consistent DynamoDB scan pages of at most 100 items. The
download validates before it leaves Lambda against
[`dynamodb-backup-v2.schema.json`](../schemas/dynamodb-backup-v2.schema.json).
The manifest records source environment, restorable/excluded/per-entity/page
counts, current data revision, the `PK`/`SK` key schema, and the SHA-256 of the
ordered `items` array. The protected browser path validates the document,
digest, and filename again before offering the download.

Before restoration, validate the JSON schema, recompute the item-array digest,
reject duplicate `PK`/`SK` pairs, and compare the manifest count. Restore into
an empty isolated table with the same string partition/sort keys by using
bounded `BatchWriteItem` requests. Do not restore over the active table. Read
back every page, compare the count/digest, then switch configuration only
through a separately reviewed change set. See the
[AWS admin backup and utility parity runbook](aws-admin-backup-and-utilities.md)
for the exact exclusion, rehearsal, and bulk-publication contracts.

## Automated and manual evidence

Run:

```bash
pnpm infra:validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Manual development checks use only fictional data:

1. Confirm API Gateway rejects no-token, expired-token, wrong-audience, and
   wrong-issuer requests without a Lambda application log.
2. Confirm a valid token missing the admin scope returns `403`.
3. Replay a successful create with the same idempotency key and confirm only
   one aggregate/summary/slug-lock set exists.
4. Send two updates from version 1 and confirm the second returns `409` while
   version 2 remains unchanged.
5. Force one S3 delete failure, confirm the post and slug locks are already
   atomically absent, then replay the same delete key and confirm cleanup
   settles.
6. Download a backup large enough for several scan pages and validate its
   count, digest, unique keys, and schema in an isolated restoration rehearsal.
7. Search Lambda logs for `Bearer`, `authorization`, `eyJ`, `X-Amz-`, full
   fictional content, signed URLs, titles, email addresses, and user names;
   the result must be empty.

## Security, cost, and rollback

Security impact is limited to the existing private admin stack: every new
route uses the JWT authorizer and scope, Lambda repeats claim checks, request
bodies are bounded, conditional writes prevent lost updates, and structured
logs contain route/event identifiers rather than tokens, content, signed URLs,
or personal data. DynamoDB `Scan` is granted only on the exact content table
and used only by the protected backup route.

Incremental cost is request-based API Gateway, 256 MiB Lambda duration,
on-demand DynamoDB strongly consistent reads/scans/transactions, and S3 delete
operations. No queue, stream, new table, new bucket, provisioned concurrency,
or recurring resource is added. The existing stage throttle remains two
requests/second with a burst of four.

For application rollback, stop admin mutations, export an AWS backup, and take
the admin read-only or offline before reverting code. Inspect any infrastructure
change set: it must reverse only the intended Lambda/IAM/CORS change without
replacing or deleting the table or bucket. Do not roll back by deleting data.
Taxonomy/idempotency items are schema-versioned and may safely remain; expired
idempotency items are removed by the existing TTL configuration.

# DynamoDB post repository implementation and operator boundary

This runbook records the code-versus-operator boundary for issue #10. The issue
adds a cloud-independent post domain, a DynamoDB repository, an AWS SDK adapter,
and offline transaction tests. It does not deploy or expose new application
behavior.

## Implemented in code

The repository code owns all of the following:

- validation of posts, bilingual translations, categories, keywords,
  references, timestamps, optional image-key metadata, migration metadata, and
  numeric versions;
- exact aggregate, summary, reference-segment, and language slug-lock item
  shapes;
- strongly consistent exact-key and query reads;
- paginated post-summary and reference-segment queries;
- atomic create, update/rename, and delete transaction plans;
- optimistic concurrency through an expected aggregate version;
- the 350 KiB item guard plus the ordered reference-segment fallback;
- preflight checks for DynamoDB's 100-action and 4 MiB transaction limits;
- typed validation, slug conflict, version conflict, not-found, size, and data
  integrity errors; and
- in-memory tests that require no credentials, network, table, or AWS account.

The AWS SDK is isolated behind `DynamoDbPort`. The production adapter maps that
port to strongly consistent `Get`, paginated `Query`, and `TransactWrite`
commands. Unit tests use `InMemoryDynamoDbPort` instead.

## Manual AWS Console work for issue #10

**None. Do not change the development table, Lambda, API routes, IAM role, or
fixture in the AWS Console for this issue.**

The architecture decision makes CloudFormation the source of truth and forbids
console-created application configuration. The repository is not wired into
the deployed Lambda yet, so granting write permissions now would be unused
privilege. No real DynamoDB write is necessary to accept this PR.

This means issue #10 has:

- no CloudFormation deployment;
- no DynamoDB data migration;
- no change to the current read-tracer fixture;
- no new environment variable or credential;
- no new AWS resource or expected idle cost; and
- no AWS rollback step beyond leaving the deployed stack unchanged.

## Local acceptance

Use the repository-pinned Node.js and pnpm versions, then run:

```bash
pnpm install --frozen-lockfile
pnpm check:secrets
pnpm infra:validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The tests exercise SDK command construction with a fake document client and all
repository behavior with an in-memory DynamoDB port. Any request for AWS
credentials during these tests is a failure.

## Manual AWS work deferred to issue #12

Issue #12 will package this repository into the authenticated Lambda and add the
admin API routes. That issue must update IaC before deployment, including the
least-privilege `dynamodb:TransactWriteItems` permission that the current tracer
role intentionally does not have.

At that later deployment checkpoint, the operator will:

1. Sign in with the approved daily-use AWS operator and MFA; verify the exact
   account and Region before continuing.
2. Generate a CloudFormation change set from the reviewed issue #12 commit.
3. Confirm that the change set updates only the approved Lambda/API/IAM
   resources and does not replace or delete the DynamoDB table or S3 bucket.
4. Confirm the table remains on-demand with the existing `PK`/`SK` schema and no
   unapproved index, Stream, backup, DAX, global-table, or provisioned-capacity
   feature.
5. Confirm the Lambda role receives only the exact table transaction permission
   needed by the integrated routes. Never edit the role manually in IAM.
6. Deploy the reviewed change set, run authenticated CRUD/conflict tests with
   non-sensitive development data, and inspect redacted Lambda logs.
7. Review Bills/Cost Explorer after the test and stop if any unexpected resource
   or charge appears.

If that future change set differs from the reviewed template, stop without
deploying and capture the diff. Do not repair drift through the console.

## Security, cost, and rollback evidence

- **Security:** no tokens, post bodies, slugs, image URLs, credentials, account
  IDs, or table contents are logged by this layer. Conditional transactions
  prevent lost updates and partial slug-lock changes.
- **Cost:** this issue deploys nothing, so it has no direct AWS cost impact. The
  future transactional requests are billable usage and are reviewed with issue
  #12 deployment evidence.
- **Rollback:** before integration, revert this code and lockfile change. The
  currently deployed stack and DynamoDB data are untouched.

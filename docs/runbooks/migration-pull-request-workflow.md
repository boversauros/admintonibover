# Migration pull-request workflow

This runbook defines the validation and branch discipline for the
Supabase-to-AWS migration. It supplements the security and rollback boundaries
in [ADR 0001](../adr/0001-admin-only-aws-data-security-contract.md) and the
[AWS account guardrails](aws-account-guardrails.md).

## Local and CI baseline

Use the runtime and package-manager versions committed to `.node-version` and
`package.json`. A clean checkout must pass without real Supabase or AWS
credentials. To reproduce the GitHub Actions build locally without a
`.env.local`, use the same inert placeholders:

```bash
pnpm install --frozen-lockfile
NEXT_PUBLIC_SUPABASE_URL=https://ci.invalid \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder \
  pnpm run ci
```

`pnpm run ci` checks repository files for `.env*` files, private keys, and
high-confidence AWS, GitHub, and privileged Supabase credential formats. It
then runs ESLint, validates TypeScript, runs cloud-free unit tests, and creates
the production build. GitHub Actions runs the same sequence for every pull
request and every push to `main`. It receives read-only repository permission,
persists no checkout credential, uploads no artifacts, and defines no cloud
credential or application secret. Only the production-build step receives the
non-secret `https://ci.invalid` and `ci-placeholder` values; the reserved
`.invalid` domain cannot resolve to a live Supabase service, and no build
artifact is published.

The automated secret check is deliberately high confidence. Reviewers must also
inspect every added or changed configuration, fixture, screenshot, log excerpt,
and artifact for credentials, tokens, account identifiers, personal data,
presigned URLs, and unredacted console evidence. Never print a suspected secret
to a CI log. If a real secret is committed, rotate it and remove it from Git
history; deleting it in a later commit is not sufficient.

## Branches and dependencies

Create one branch per issue from the latest `origin/main` using the branch name
specified by that issue. Record every upstream issue and pull request in the PR
template.

Before opening a PR, and again immediately before review or merge:

```bash
git fetch origin
git rebase origin/main
pnpm install --frozen-lockfile
pnpm run ci
git push --force-with-lease
```

Use `--force-with-lease` only after a rebase and only for your own feature
branch. Never force-push `main`.

Parallel branches are independent. Each branch rebases onto the latest `main`
and reruns the complete suite after another migration PR merges. A previous
green run does not apply to a rewritten or newly rebased commit.

A branch may be stacked on an unmerged dependency only when both issues permit
it. While stacked:

1. Base the child PR on the parent branch so reviewers see only child changes.
2. Keep the dependency PR and issue linked in the child PR.
3. After the parent merges, replay only the child commits onto `origin/main`:

   ```bash
   git fetch origin
   git rebase --onto origin/main origin/<parent-branch> <child-branch>
   pnpm install --frozen-lockfile
   pnpm run ci
   git push --force-with-lease
   ```

4. Retarget the child PR to `main` and wait for the new CI run. Do not merge it
   using checks from the old stack.

If conflicts change behavior, validation, data mapping, permissions,
configuration, cost, or rollback assumptions, update the PR evidence before
requesting another review.

## Pull-request evidence

Open the PR as a draft and complete every template section. The PR must link its
single issue and dependencies; record automated and manual tests, security and
cost impacts, environment-variable names without values, rollback steps, and
redacted UI screenshots when the UI changes.

When an issue requires proof that a guard fails, push a safe intentional failure
to the draft PR, link the failing Actions run, then revert the failure in the
same PR and link the passing run. Never use a real secret or cloud resource for
negative testing.

## Admin UI continuity evidence

The backend migration must satisfy the
[admin UI continuity contract](../adr/0001-admin-only-aws-data-security-contract.md#admin-ui-continuity-contract).
Changing the backend flag must select an adapter, not a separate administration
interface.

For every migration PR that changes an admin read, mutation, authentication, or
storage workflow:

1. Exercise the affected workflow with `ADMIN_DATA_BACKEND=supabase` and again
   with `ADMIN_DATA_BACKEND=aws` using equivalent non-sensitive test data.
2. Confirm that both modes use the same route and shared UI component.
3. Compare the visible layout, labels, controls, validation placement, and
   success path. Record any unavoidable platform-specific state separately.
4. Attach redacted screenshots for both modes when visible UI changed or a new
   backend-specific state was introduced.
5. Treat an unexplained visual or workflow difference as a regression that
   blocks acceptance.
6. Mark migration-only badges, banners, read-only notices, and diagnostic views
   for removal or relocation before final cutover acceptance.

Authentication-provider screens themselves do not need pixel parity, but after
successful authentication the administrator must return to the same shared
application workflow. A future redesign must be tracked outside the migration
and must not be bundled into backend parity work.

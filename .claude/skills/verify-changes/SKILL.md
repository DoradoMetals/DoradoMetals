---
name: verify-changes
description: Run the full verification suite for this repo — static database-call checks, typechecks, unit and database tests, contract validators, and schema-source diffs. Use before committing API or contract changes, when asked to verify or check the work, or to confirm nothing regressed. Explains what each check catches and which need a database.
---

# Verifying changes

This repo has no staging environment and deploys `master` to production automatically. These checks are what stands between a change and customers.

## The suite that runs in CI

```bash
pnpm check
```

Runs, in order: contracts build → API database-call lint → API typecheck → API tests → frontend typecheck. Needs no database, so it also runs in GitHub Actions on every push and PR (`.github/workflows/check.yml`).

All five must be clean before committing.

### What each one catches

**`pnpm --filter @dorado/api lint:db`** — the two defect shapes that have actually reached production:

- an executor passed in the params slot: `query(sql, client)` instead of `query(sql, [], client)`, which pg rejects with *"Query values must be an array"*
- a `query()` whose result is never awaited, so `.rows` is `undefined` and the next line throws reading `'0'`

Both shipped and broke checkout. If you write a repo call, this is the check that matters.

**`pnpm --filter @dorado/api typecheck`** — `tsc --noEmit`. `checkJs` is off, so JavaScript is parsed but not checked; `.ts` files are checked strictly. Node strips types at runtime and does not check them, so this is the only thing that does.

**`pnpm --filter @dorado/api test`** — `node --test`. 35 tests over the pure pricing functions, plus database-backed repo tests. The pricing ones need nothing; the repo ones need `DATABASE_URL`.

## Checks that need a database

Not in CI, because CI has no database. Run them locally before committing anything touching repos, queries or contracts.

```bash
pnpm --filter @dorado/contracts validate    # generated schemas vs real rows
pnpm --filter @dorado/api validate:wire     # wire contracts vs real API responses
pnpm --filter @dorado/api diff              # exchange vs core implementations
```

**`contracts validate`** parses real rows through the generated table schemas. Generated schemas are true by construction, so this is really checking that declared types match actual contents. It caught `NUMERIC` arriving as strings and `BIGINT` never being parsed.

**`validate:wire`** parses real API responses through the hand-composed wire contracts. The generated leaves are true by construction; the wire schemas are a *claim* about what an endpoint returns, and this is what makes the claim worth something.

**`diff`** runs both schema implementations of a migrated feature over real rows and requires identical responses. The gate for flipping a `*_SOURCE` switch.

`DATABASE_URL` in `api/.env` points at **dev**. `PROD_READONLY_DATABASE_URL` is read-only production — use it for audits, never for migrations.

## After changing the database

Regenerate contracts, or every type is stale:

```bash
CONTRACT_SCHEMAS=exchange,core pnpm --filter @dorado/contracts generate
pnpm --filter @dorado/contracts build
```

## When verifying a refactor

Prefer comparing against the previous implementation over asserting expected values by hand. The techniques that have worked here:

- **byte-comparison of query output** — check out the old repo into a worktree, run both, `JSON.stringify` and compare. Used to prove the order-query dedup was a no-op across 31 orders.
- **inflated PDF content streams** — PDFs embed a creation timestamp so raw bytes never match; inflate the FlateDecode streams and compare those instead.
- **transaction round-trip** — write with a client, read on the pool, assert invisible, roll back, assert restored.

## Known gaps

Be honest about these rather than implying coverage:

- **No frontend tests at all.** 42k lines, zero.
- Repo tests exist only for migrated features. The other ~150 repo functions are untested.
- Nothing tests routes, middleware or auth end to end.
- Docker images are unverified — no daemon is available in the dev environment, so `docker build` has never been run against the current Dockerfiles.

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

Runs, in order: contracts build → API database-call lint → API migration lint →
API typecheck → API tests → frontend typecheck → frontend tests. Needs no
database, so it also runs in GitHub Actions on every push and PR
(`.github/workflows/check.yml`).

All seven must be clean before committing.

It now takes about two and a half minutes, mostly the API's database-backed
tests. Start it in the background and poll rather than letting a two-minute tool
timeout kill it partway.

### What each one catches

**`pnpm --filter @dorado/api lint:db`** — the two defect shapes that have actually reached production:

- an executor passed in the params slot: `query(sql, client)` instead of `query(sql, [], client)`, which pg rejects with *"Query values must be an array"*
- a `query()` whose result is never awaited, so `.rows` is `undefined` and the next line throws reading `'0'`

Both shipped and broke checkout. If you write a repo call, this is the check that matters.

**`pnpm --filter @dorado/api typecheck`** — `tsc --noEmit`. `checkJs` is off, so JavaScript is parsed but not checked; `.ts` files are checked strictly. Node strips types at runtime and does not check them, so this is the only thing that does.

**`pnpm --filter @dorado/api lint:migrations`** — refuses any migration that
would `DROP`, `DELETE`, `TRUNCATE` or `UPDATE` its way through the `exchange`
schema. That schema holds every row the business has; a genuinely intended
destructive change needs an explicit `-- allow-destructive:` marker saying why
it is safe and what backup exists.

**`pnpm --filter @dorado/api test`** — `TZ=UTC` vitest, against a local
Postgres the preflight provisions. Pure functions and contract shapes
(`test:unit`), repo and service tests (`test:db`) and supertest routes
(`test:http`). The pure ones need nothing; the rest need the test database. **`TZ=UTC` is not
optional** — the API reads naive timestamps as UTC, and outside UTC the repo
tests disagree with the database by the local offset.

**`pnpm --filter @dorado/frontend test`** — `TZ=UTC vitest run`. Unit tests over
pure functions and the shapes the API contract depends on. No DOM or browser
harness, deliberately: rendering a component needs a DOM implementation and a
testing library, which is a decision rather than a config change.

## Checks that need a database

Not in CI, because CI has no database. Run them locally before committing anything touching repos, queries or contracts.

```bash
pnpm --filter @dorado/api audit:coverage    # exchange columns with nowhere to go
pnpm --filter @dorado/api verify:genesis    # can the schema be built from nothing
pnpm --filter @dorado/api verify:backfill   # can the data be, and is it identical
pnpm --filter @dorado/contracts validate    # generated schemas vs real rows
pnpm --filter @dorado/api validate:wire     # wire contracts vs real API responses
```

**`contracts validate`** parses real rows through the generated table schemas. Generated schemas are true by construction, so this is really checking that declared types match actual contents. It caught `NUMERIC` arriving as strings and `BIGINT` never being parsed.

**`validate:wire`** parses real API responses through the hand-composed wire contracts. The generated leaves are true by construction; the wire schemas are a *claim* about what an endpoint returns, and this is what makes the claim worth something.

**`audit:coverage`** is the one to run *first*, before writing any migration
code. It reports every column in `exchange` that holds a value and has nowhere
to go in the schema it maps onto. Orders had matching row counts on every table
and was missing 21 columns of live data — row counts are not evidence a target
is complete. Note that a reported gap is often a rename or a relocation rather
than a loss: seven of shipping's thirteen were, and three of addresses'. Check
the data, then declare the mapping in `scripts/audit-coverage.mjs`.

**`verify:genesis`** regenerates the schema DDL with every schema renamed,
builds the whole thing inside a transaction where those schemas do not exist,
compares it against dev column by column, runs it twice to prove the guards
hold, and rolls back. It is the only thing proving the migration chain works
anywhere but this machine.

**`verify:backfill`** does the same for the data: builds an empty schema, runs
every backfill and seed into it, compares the rows against dev, re-runs to prove
idempotency, and checks the guard refuses once the new schema holds rows
`exchange` does not. Against dev the backfills are all no-ops, so this is the
only check that exercises them at all.

`verify:parity` and `diff` are gone with the migration that needed them: one
implementation per feature now, and both sides of every old table pair are
frozen.

`DATABASE_URL` in `api/.env` points at **dev**. `PROD_READONLY_DATABASE_URL` is read-only production — use it for audits, never for migrations.

## After changing the database

Regenerate contracts, or every type is stale:

```bash
pnpm --filter @dorado/contracts generate
pnpm --filter @dorado/contracts build
```

`CONTRACT_SCHEMAS` overrides which schemas are generated; the default list is in
`packages/contracts/scripts/generate-tables.mjs` and already covers every
domain schema. (`core` was dissolved by migration 013 — if you see it named
anywhere, that reference is stale.)

If you changed the new schema's **DDL**, also regenerate the genesis migration
and bump its baseline:

```bash
pnpm --filter @dorado/api dump:schema   # rewrites 000_genesis_schema.sql
```

then set `BASELINE` in `scripts/dump-schema.mjs` to the highest migration on
disk. Adding an ordinary migration does **not** require this: a fresh database
builds the baseline shape and runs everything after it normally.

## When verifying a refactor

Prefer comparing against the previous implementation over asserting expected values by hand. The techniques that have worked here:

- **byte-comparison of query output** — check out the old repo into a worktree, run both, `JSON.stringify` and compare. Used to prove the order-query dedup was a no-op across 31 orders.
- **inflated PDF content streams** — PDFs embed a creation timestamp so raw bytes never match; inflate the FlateDecode streams and compare those instead.
- **transaction round-trip** — write with a client, read from a *second
  connection*, assert invisible, roll back, assert restored. Not `pool.query`:
  `lint:db` rejects it, and a second connection is what a concurrent request
  actually is. Use a sentinel value, too — an isolation test that writes a value
  the row already held passes without proving anything, which has happened twice
  here.

## Known gaps

Be honest about these rather than implying coverage:

- **The frontend has 75 tests against 42k lines.** Pure helpers only — pricing,
  weight conversion, formatting, and the checkout address contract. Nothing that
  renders.
- Repo tests exist only for migrated features. The other ~150 repo functions are untested.
- Nothing tests routes, middleware or auth end to end.
- Docker images are unverified — no daemon is available in the dev environment, so `docker build` has never been run against the current Dockerfiles.

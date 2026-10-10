@AGENTS.md

- **Output Verbosity**: Minimize bash command output. Do not print boilerplate installation logs, standard build outputs, or multi-line terminal outputs unless they contain a failing error.
- **Command execution**: Run commands silently using flags like `-q` or redirection (`> /dev/null`) where appropriate.
- **Explanations**: Give 1-2 sentence summaries of actions instead of lengthy step-by-step guides.

# Dorado Exchange

A precious-metals exchange. Customers sell scrap and bullion to the business —
a **purchase order** — and buy bullion from it — a **sales order**. The API
prices the metal, takes the payment, buys the FedEx label, sends the documents
and pays the customer out. Real money, real bank details, real parcels.

pnpm workspace, Node 24, Postgres. Deployed on Railway from `master`, which
auto-deploys. There is no staging.

## The one rule: do not lose data

A bug is recoverable — deploy a fix. Lost customer data is not. There is no
undo, and no amount of correct code afterwards brings back an order, a payout
record or a lead.

- **`exchange` is frozen, and it is never dropped.** It is the flat schema that
  served every request before this refactor, and it still holds the only copy of
  rows nothing else has. No application statement reads or writes it — `grep`
  finds no `exchange` table anywhere under `api/src` — and no trigger writes it
  either. Migrations may read from it. Nothing may overwrite, truncate or delete
  it. `lint:migrations` refuses a destructive statement without an explicit
  `-- allow-destructive:` marker saying why it is safe and what backup exists.
- **Production has never had a migration run against it, and will not until
  Jacob runs one.** `DATABASE_URL` in `api/.env` is dev.
  `PROD_READONLY_DATABASE_URL` is read-only production, for audits only. Do not
  treat production state as a blocker on branch work; see **Production day**.
- **Never `DROP` or `DELETE` without explicit confirmation**, and verify nothing
  references the target first.
- **Not every table is irreplaceable.** `checkout.*` is device sync — a cart
  exists so a customer sees the same basket on their phone as on their laptop.
  Empty is fine. Orders, order items, scrap declarations, payouts and the
  payment ledger cannot be recreated; that is what the rule protects. Ask which
  kind of table it is before invoking it.
- **When unsure, stop and ask.** A blocked migration costs an evening. A lost
  table costs the business.

## Layout

```
api/                  @dorado/api          Express 5, ESM, TypeScript (Node runs .ts natively)
  src/                  ALL application code
    db/<schema>/          repos + sql/, laid out BY POSTGRES SCHEMA
    domains/<domain>/     service, rules, routes, controller, tests, together
    shared/ providers/ types/
    app.ts server.ts env.ts pool.ts
  scripts/              lints, audits, verifiers, migrate
  migrations/           000_genesis_schema.sql .. 140_*.sql
  tests/                cassettes and the external suite
frontend/             @dorado/frontend     Next.js app router - NUKED to auth + a placeholder home; surfaces regrow one at a time (ruling 99, docs/waves/frontend-nuke.md)
  app/<route>/_src_/    a route's own code
  shared/<kind>/        ui hooks utils providers tests (store and types went with the surfaces)
packages/contracts/   @dorado/contracts    generated zod row schemas and wire shapes
packages/client/      @dorado/client       the typed API client; the frontend's ONLY way to reach the API
packages/components/  @dorado/components   the component library
packages/icons/ packages/theme/            icons; CSS tokens
```

The eleven domains are `accounts`, `catalog`, `checkout`, `crm`, `documents`,
`inventory`, `logistics`, `orders`, `pricing`, `refining`, `transactions`.
`inventory` owns the lot and the pool — `inventory.lots`, `inventory.lot_sources`
and `inventory.pool` (rulings 113, 120); `refining` owns the refiner order, the
batch and the settlement. Under `db/` there are 24 folders, one per table group,
named for the schema they query — a few read a schema of another name
(`db/sales-tax` queries `tax`, `db/mints` queries `products.mints`). Genesis
creates 20 schemas: `auth`, `checkout`, `crm`, `fulfillments`, `inventory`,
`leads`, `media`, `metals`, `orders`, `organizations`, `payments`, `places`,
`products`, `rates`, `refiners`, `refining`, `reviews`, `shipping`, `spots`,
`tax`. `exchange` is the twenty-first and is frozen. There is no `core`, no
`auctions` and no `lots`. Database by schema, code by domain.

**The lot model** (rulings 120 and 121). One lots table: `inventory.lots` holds
every lot, ours and the refiner's copy of ours and the one we mint to sell. One
lineage table: `inventory.lot_sources (lot_id, source_lot_id, kind)` with kind in
`split` · `combine` · `batch` · `sale`, where `lot_id` is always the minted lot.
`premium` lives on the lot; **price is never stored** — it is derived from the
order's locked spot, the lot's content and its premium. `orders.lots` and
`refining.lots` are pure links. There is no kind column: a lot on `refining.lots`
is a refiner lot, and inventory never counts one. `docs/waves/lot-model.md` walks
it.

There is no `features/` folder on either side, no `api/legacy/`, and no
`shared/wire/`.

`api` uses subpath imports declared in `api/package.json` — `#db/*`,
`#shared/*`, `#providers/*`, `#domains`, `#pool`, `#app`, `#env`, and one per
domain (`#orders/*`, `#pricing/*`, `#logistics/*` …), every target under
`./src/`. `scripts/lib/layout.ts` derives the domain list from that map, so
every lint, `vitest.config.ts` and its coverage keys follow one declaration.
Never write a relative path that crosses between two of those roots.

The frontend imports `@dorado/contracts` as its only source of table-derived
shapes — the runtime zod objects, not just the types — and reaches the API only
through `@dorado/client`.

## How a request flows

```
routes.ts             the URL, and the guard (requireUser / requireAdmin / requireOwn*)
controller.ts         strictBody(Contract, req.body) and uuidParam - 400 on anything else
service.ts            the use case: load at the top, one call per row, then decide
rules.ts              the decisions, and the only place a domain error is raised
db/<schema>/repo.ts   five verbs over one table, each a query() against sql/<name>.sql
sql/<name>.sql        the statement. A view builds its JSON here, not in TypeScript.
```

The transport parses. A body is parsed once, strictly, against a contract, and
the service takes typed values and never re-checks them. A repo returns rows
typed from `@dorado/contracts`; where the statement builds a view, the repo
parses that view through its contract before returning it. Errors are raised by
`rules.ts`, never caught in a service, and rendered once by the error handler.

`routes.ts` declares the URL the caller holds; the handler lives with the
feature that owns the table. Factoring a file is never a reason to move a URL.

## Conventions, and the lint that enforces each

Run any of these as `pnpm --filter @dorado/api <name>`. Each has a `:self-test`
that proves the detector still fires.

| lint | what it refuses |
|---|---|
| `lint:db` | `pool.query` in place of the shared `query(sql, params, executor)` — the third argument is how a repo joins its caller's transaction |
| `lint:imports` | a relative specifier pointing at nothing, and a `#subpath` with no `package.json` entry |
| `lint:namespace-calls` | a call into a namespace import that the target module does not export |
| `lint:migrations` | a destructive write to `exchange` without an `-- allow-destructive:` marker |
| `lint:domain-boundaries` | a domain reaching into another domain's internals instead of its service |
| `lint:pricing-owner` | money arithmetic outside the pricing domain, and any reach past its public entry |
| `lint:one-catch` | a `try`/`catch` or a logger call in a domain or transport file; `withTransaction` rolls back and rethrows, and the error handler logs once |
| `lint:no-throw-in-services` | a throw outside `rules.ts` |
| `lint:domain-errors` | an ad-hoc error where a named domain error belongs |
| `lint:no-minted-ids` | a uuid minted in TypeScript. The database creates ids. |
| `lint:no-dictionaries` | result dictionaries and maps stitched in TypeScript where SQL should return the shape |
| `lint:no-literal-views` | a wire-to-column re-spelling in TypeScript; a view belongs in SQL |
| `lint:no-column-arrays` | a hand-written list of column names in TypeScript |
| `lint:input-shapes` | a write shape spelled out in a domain file instead of taken from `@dorado/contracts` |
| `lint:contracts-derived` | a contract field declared by hand rather than composed from a generated row schema |
| `lint:type-homes` | a shape spelled out at a call boundary; a signature names contract types, ids, primitives or an `Executor` |
| `lint:row-vs-list` | a list-returning repo call read as if it were one row |
| `lint:client-boundary` | the frontend calling an endpoint directly; the endpoint belongs in `@dorado/client` |
| `lint:test-locks` | a test that writes a lock-requiring table without taking the lock |
| `lint:test-actor` | a test that writes an audited table with no actor set |
| `lint:script-guards` | a script under `api/scripts` or `frontend/scripts` with neither a self-test nor a recorded excuse |

Three rules the lints do not cover:

- **Nothing irreversible goes inside a transaction.** A transaction rolls back;
  an email, a Stripe charge and a FedEx label do not. Do the database work,
  commit, then act on the outside world.
  `shared/db/tests/transaction-side-effects.test.ts` fails the build if one
  comes back.
- **The database stamps audit columns; code never writes them.**
  `withTransaction` sets `app.actor_id` after `BEGIN` and the `audit_stamp`
  trigger fills created/updated at/by. Repos are `create(row, tx?)` /
  `update(id, patch, tx?)` with no actor argument, and `shared/db/patch.ts`
  `buildUpdate` is the one patch builder — keys present are set, an explicit
  null clears, an unknown or audit key throws.
- **`NUMERIC` and `BIGINT` parsers are registered in `api/src/pool.ts`**, next
  to the pool. They must stay there: anything importing the pool without booting
  the server otherwise gets strings, and `price + fee` concatenates.

## The gate

`pnpm check` before committing. `scripts/check.mjs` builds `@dorado/contracts`
first — everything imports its dist — then runs five groups concurrently. 45
members in all.

| group | steps | needs the dev database |
|---|---|---|
| `api-lint` | the 21 lints above, plus `audit:silent-mutations` | no |
| `api-test` | `typecheck`, then `test:coverage` | no (local Postgres) |
| `design` | `figma:tokens`, `figma:inventory`, `figma:hygiene` | no |
| `components` | `icons` / `components` / `client` typecheck and test, serial | no |
| `dev-db` | `verify:fresh`, `validate`, `verify:genesis`, `verify:replay`, `verify:backfill`, `validate:wire`, `audit:coverage`, `audit:indexes`, `audit:query-paths`, `audit:constraints`, `audit:non-finite`, `audit:nullability` — one at a time | **yes** |

`components` and `dev-db` are serial inside themselves on purpose: the first
oversubscribed the cores badly enough to fail a component test on a timeout that
is not a real bug, and the second livelocked on concurrent dev queries.

`pnpm check:fast` runs the contracts build plus `api-lint`, `api-test` and
`design` — 28 members, about 21 seconds. It omits the `components` and `dev-db`
groups, which is everything that touches the dev database. `pnpm check:serial`
still exists as a literal chain, but it has fallen behind `check.mjs` and no
longer runs the same members. `pnpm check` is what gates a commit.

The gate does not run the frontend's own typecheck, test or build. Run
`pnpm --filter @dorado/frontend typecheck` and `test` yourself when a pass
touches the frontend.

The verifiers that have actually caught things:

- `verify:genesis` — builds the whole schema into renamed schemas inside a
  rolled-back transaction and compares it against dev column by column, checks
  the committed `000_genesis_schema.sql` still matches what dev is, and asserts
  its `-- baseline:` marker names dev's newest migration. It does NOT replay.
- `verify:replay` — the replay `verify:genesis` cannot do: a scratch `uat_replay`
  database on the local cluster, `exchange` copied into it, the real `migrate`
  run over genesis and every migration after the baseline, the result compared
  with dev and a second run proved to apply nothing. The marker being one lane
  stale aborted the October production rehearsal at 169 with "cannot drop
  columns from view" while the gate was green; this is the member that would
  have said so.
- `verify:backfill` — runs every backfill and seed into those empty tables,
  compares the rows against dev, re-runs to prove idempotency, then checks the
  guard refuses once the new schema holds rows `exchange` does not.
- `audit:coverage` — every populated column in `exchange` with nowhere to go.
  Row counts are not evidence: orders matched on counts and was missing 21
  columns of live data.
- `audit:indexes` and `audit:query-paths` — the two directions of the index
  question. The first asks whether an access path `exchange` indexed survived;
  the second starts from the queries, because a `WHERE` written fresh in a
  native repo has no source index to be compared against.
- `audit:test-leaks` — fingerprints every table, runs the suite, compares. A
  test that calls a service does not contain it: the service commits on its own
  connection while the test's transaction rolls back.
- `compare:databases` — two databases, table by table, row counts and content
  hashes, plus every sequence. Refuses when both URLs resolve to the same
  database.

Four audits exit non-zero while their subject is outstanding, so they are **not**
gate members: `audit:payments`, `audit:enum-domains`, `audit:plaintext-secrets`
and `audit:precision --prod`. Each goes green on the day a production fix runs,
which is Jacob's.

A reported gap is often a rename rather than a loss. Declare the mapping in
`scripts/lib/feature-map.ts` so the report stays honest.

## Tests

`pnpm seed` from the repo root seeds the e2e users (admin phone from
`SEED_ADMIN_PHONE`) and a disposable order; `pnpm dev` starts both apps.

`pnpm dev` builds `@dorado/contracts` once, then runs the API and frontend dev
servers together via `concurrently` (one log prefix each, on their own ports).
Each workspace's own `predev`/`prestart`/`prebuild` hook rebuilds contracts too
— `tsc -b`, incremental, well under 3s warm — so `pnpm --filter @dorado/api dev`
alone stays safe after a pull that changed `packages/contracts`.

`pnpm --filter @dorado/api test` — vitest 4, real Postgres, every test inside a
transaction that is rolled back, `TZ=UTC`. The suite is split by what a file
imports, not by directory (`scripts/lib/test-layers.ts`): `test:unit` (no
database), `test:db` (repo and service), `test:http` (supertest). Tests live
with their subject under `<dir>/tests/`, and a test whose subject moves moves
with it in the same pass.

A **local** Postgres is the default. `api/scripts/preflight-test-db.ts` runs
first and refuses anything that is not loopback, and refuses a loopback database
whose name does not start with `test`. A missing `test*` database is created
from `test` as a template, so a lane can hold its own copy — point
`TEST_DATABASE_URL` at it in `api/.env` and a migration written in one worktree
cannot change the schema under another lane's gate. Pending migrations
auto-apply only on the database `TEST_DATABASE` names (default `test`).
`test:on-dev` skips the preflight and runs against the remote dev database. See
`docs/waves/local-postgres.md` and `docs/waves/test-suite-redesign.md`.

If the local cluster is down:

```
~/pgroot/usr/lib/postgresql/16/bin/pg_ctl -D ~/pgdata16 \
  -o "-p 5544 -c max_connections=200 -c unix_socket_directories=$HOME/pgsock" \
  -l ~/pgdata16/server.log start
```

The frontend runs vitest in two lanes — `*.test.ts` in node for pure functions
and contract shapes, `*.test.tsx` under jsdom with testing-library. Playwright
drives a real browser against a live API: `pnpm --filter @dorado/frontend e2e`.
Its 19 specs are `*.e2e.ts`, co-located with the route or the shared code they
exercise. The Google Places specs are `@maps`-tagged and excluded from the
default run because every keystroke is billed; `pnpm e2e:maps` runs them
deliberately. E2e never runs under `pnpm check`.

## Production day

**The runbook is `docs/waves/production-chain.md`.** It is rehearsed end to end
on a production-shaped copy, and it is Jacob's to run, not an agent's.

The sequence is **`pg_dump` -> reset -> migrate -> verify -> seal -> merge**, and
it is not a checklist to work through in a convenient order — it is the only
order in which nothing is lost. Production still holds the abandoned January
refactor and does not have every schema the code targets, so a write there today
raises 42P01, and no `exchange` fallback exists anywhere any more. Merging
before the chain runs loses the order rather than misplacing it.

`pnpm --filter @dorado/api migrate:reset-january` is the reset step: it drops
the January schemas after the dump so genesis and the backfills rebuild them the
way dev was built. `exchange` is filtered out of its drop list, asserted out
again after the list is built, and checked a third time immediately before each
`DROP SCHEMA`. It refuses without `--database`, `--url` and a non-empty `--dump`
file, and it is dry until `--commit`.

Migrations are `api/migrations/*.sql`, applied by
`pnpm --filter @dorado/api migrate`. Genesis carries `-- baseline: 002-134` and
the runner stamps pure DDL only, so every backfill runs inside `migrate` in its
own place in the order. Never apply a migration to production.

## The standing decisions

**`docs/rulings.md` is the law.** Every ruling Jacob has made is there,
numbered, grouped by theme, with superseded ones marked. Read it before
designing anything. In summary:

- **Data.** `exchange` is frozen and never dropped. The database creates ids.
  Defaults live in the database. Not all data is irreplaceable, and the
  difference is worth checking before a wave stops on a cart table.
- **API shape.** One endpoint per resource, owned by the feature that owns the
  table. A read returns the bare row; nothing nests. Ids in, data out — the
  client sends ids plus genuine user input and never round-trips a composed
  object. A URL does not move because a file did.
- **Domain boundaries.** Code by domain, database by schema. A repo is five
  generic verbs over one table, never one function per column. A cross-domain
  write goes through the owning domain's service. Pricing is one domain and only
  it prices.
- **Types and contracts.** Table-derived shapes live once in `@dorado/contracts`
  and are imported as values by both sides. A signature names contract types,
  ids or primitives — never a shape spelled out at the call boundary.
- **Errors and transactions.** One catch. Throws live in `rules.ts`.
  `withTransaction` is unconditional, rolls back and rethrows; the error handler
  logs once; after-commit work runs in `attempt`.
- **Frontend.** It informs no API decision, and breaking it is fine — the gate
  runs no frontend member. It computes no money: every customer-visible number
  comes from a pricing endpoint. Layout at the call site, appearance in the
  component. No new component ships without a Figma design Jacob approved.
- **Process.** Delete, do not neuter. Coupled features convert in the same pass.
  Tests move with their subject. Verify the data before deleting the code that
  wrote it — "the tests pass" is not evidence that data migrated.
- **Auth, money and comms.** Credit is not a choice: a sale applies the balance
  whenever one exists, reserved at placement and released on cancel or expiry.
  Bank numbers are sealed at rest, never logged and never returned; one
  admin-only endpoint opens them. Email is manual.

## Standing constraints

- **Never log or return bank details.** Order responses carry last-4 only.
  Structured logging (`shared/logging/`, pino) redacts `routing_number` and
  `account_number`, and no request body reaches a log.
- **Never add `NOT NULL` from dev row counts.** Dev holds tens of rows. Use
  `audit:nullability`, which reads production.
- **Verify before dropping a column.** `order_metals.percent_change` and
  `scrap.gem_id` are 100% NULL and still read and written by live code.

## Where things stand (2026-09-07)

The `exchange` migration is finished in code: no application statement and no
trigger touches it, and every domain reads and writes its own schema. The legacy
machinery — dual writes, `*_SOURCE` switches, `api/legacy/`, `shared/wire/` — is
deleted. The API is TypeScript end to end under eleven domains in
`api/src/domains/`, with its tables under `api/src/db/<schema>/`. The frontend
has no `features/` folder: a route's code is `app/<route>/_src_/`, and what
crosses routes is `shared/`. A four-reviewer API audit produced 63 findings and
all four fix lanes are merged; what it left is in `FOLLOWUPS.md`. The production
chain has been rehearsed on a production-shaped copy with zero aborts, and
running it against production is the one large thing still ahead.
`docs/model/lots.md` proposes a lots model for refining; it is a write-up with
twelve open questions and no code, and it starts only if Jacob says so.

## Session mechanics that matter

- **Never operate on `/home/jtj60/dorado-exchange`.** That is Jacob's checkout.
  Lanes are worktrees under `/home/jtj60/dorado-lanes/<lane>`, branched from
  `dev`; merge from `main`; merge `done/*` first.
- **One full gate per merge batch**, not per lane. Lanes parallelize; the gate
  does not.
- **Subagents write the code.** They never touch `api/.env` and never commit.
- **Launch `pnpm check` as a fresh compound from the repo root**
  (`pnpm check > FILE 2>&1; echo "CHECK_EXIT=$?" >> FILE`) and read the exit
  code from the file. Chaining it after a `cd` into a subdirectory fails.
- **Redirect command output to a file and grep the file.** A pipe loses output
  to SIGPIPE, and a captured run can be read twice.
- Wakeup timers die when WSL idles. Keep a background task alive and let its
  completion notification re-invoke you.

## Open threads

`FOLLOWUPS.md` holds what is still open — the review findings left unfixed, the
production-day steps, the decisions waiting on Jacob and the environment keys he
owes. `docs/history/` holds what is finished, including the full 16,356-line
record this project ran on until 2026-09-07.

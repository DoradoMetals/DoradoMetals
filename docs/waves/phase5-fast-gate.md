# Phase 5 (APPROVED) — the verification loop gets fast

Approved by Jacob 2026-08-29. Owner: unassigned.

```
1. A local PostgreSQL 16 for the test suite   ████████████████████  100%  (2026-09-03)
2. Shorten the serialized chain               ████████████████████  100%  (2026-09-03)
3. Parallelise the independent gate members   ████████████░░░░░░   60%  (2026-09-02)
```

**Task 1, DONE 2026-09-03**: `pnpm --filter @dorado/api test` runs the local
Postgres by default now — no more `test:on-test-db` alias, no more opting in.
`scripts/preflight-test-db.ts` also keeps it migrated automatically: it
compares `exchange.schema_migrations` against `api/migrations/*.sql` and
applies anything pending, but ONLY when the target is loopback and named
`test` — anywhere else it reports what's pending and refuses, exactly like a
stopped local cluster does. `test:on-dev` is the escape hatch to the old
behaviour. 896/896 pass in ~20-40s.

**Task 2, DONE 2026-09-03**: root `pnpm check:fast` is the shortened chain —
contracts + the API's static lints/typecheck/test, nothing that touches the
DEV database and nothing frontend. `pnpm check` is unchanged and is still what
gates a commit.

## The measurement, corrected

**The gate is 10-13 minutes, not 90.** The earlier figure was inherited from an
estimate and never measured; four complete runs give 10, 13 and 10. Wall clock
varies with CONTENTION (concurrent gates, an orphaned `next dev` server), not
with network latency, because the suite parallelises across ~26 processes.

**The stable measurement is the SUM: ~128 minutes of test time across 947
tests, with 153 over ten seconds each.** That is what this phase is actually
about — and it is about ITERATION cost, not gate cost. The slowest single test
is 180 seconds, so anyone working on orders or checkout pays that per attempt.

This phase is therefore **less urgent than proposed and still worth doing**. It
should not outrank phases 6 and 7 on the strength of the number I gave.

The ten slowest, each 85–179 s:

```
179.1s  both paths record the same line, at the same weights
169.7s  createNewItem derives content from weight and purity
168.0s  a scrap line carries its values inline and has no bullion
167.0s  getCart returns the wire shape the frontend reads
165.4s  replacing a cart empties both schemas first
158.6s  POST :id/items adds a scrap line and its scrap row
149.7s  both paths record the same order, for the same customer
```

**None of these does 170 seconds of work.** Every database is on Railway's
public proxy at **160–200 ms per statement**, and these tests hold or wait on the
`ORDERS` advisory lock. A test that opens a transaction, writes four rows and
rolls back pays six seconds for microseconds of work; one that queues behind five
others pays their time too.

## Task 1 is the only one that removes the constant

A local **PostgreSQL 16** used by the test suite alone. Not 14 — a server binary
of that version is already installed and **it must not be used**: dev and
production run 16.15, and `MERGE`, `security_invoker` views and several planner
behaviours differ. A fast suite that tests the wrong engine is worse than a slow
one that tests the right engine, because its green is what you would act on.

**Only `@dorado/api test` moves.** `verify:genesis`, `verify:parity`,
`audit:coverage`, `audit:indexes`, `audit:query-paths`, `audit:nullability` and
`compare:databases` compare against dev's *actual content* and must keep pointing
at the real database. The suite is the one member that needs no shared state at
all — every test already rolls itself back.

**Needs Jacob**: installing a database server is a change to his machine, and
ruling 39's grant covers the codebase. Either `apt install postgresql-16` from
PGDG, or starting the Docker daemon (installed, not running) for `postgres:16`.

## Task 2 is worth doing even if task 1 lands

`shared/testing/locks.ts` already records the previous attempt and its result:
partitioning one global lock into four moved the suite 123s → 118s, because
*"its wall clock is set by features/orders/create.test.js and parity.test.js,
which place whole orders, hold both groups, and legitimately serialise"*. Its own
conclusion: **"making the suite meaningfully faster means making those two files
place fewer orders, not adjusting locks."** That is still true and is task 2 —
share one placed order across assertions within a file rather than placing one
per test. Coverage must not shrink: the point is fewer *placements*, not fewer
assertions.

## Task 3 is small and should be done last

Members 4–9 (six static lints) and 15–22 (eight read-only audits) are mutually
independent; the chain runs them serially. Parallelising each group saves single
-digit minutes — worth having, worth nothing next to task 1, and it makes a
failure harder to attribute, so it should land only once the suite is fast enough
that a re-run is cheap.

---

# TASK 1 IS ONE `apt install` AWAY, AND I CANNOT RUN IT (2026-08-29)

D198 measured why this phase matters: **dev is 116 ms away** (median of eight
`SELECT 1` round trips, one outlier at 968 ms), because `DATABASE_URL` points at
`switchback.proxy.rlwy.net` over the public internet. The gate's duration is not
a property of this codebase. On a bad evening it is uncompletable — three log
lines in thirty minutes, on an idle machine (load 0.50, 6.8 GiB free).

## Everything needed already exists except the server binary

**The harness is built.** `api/env.ts` already composes `TEST_DATABASE_URL`,
already lets an explicit URL win over composition, and already has the switch:

```
USE_TEST_DB=1 pnpm --filter @dorado/api test
pnpm --filter @dorado/api test:on-test-db
```

It refuses unless the URL's database is actually named `test`, so it cannot
become a way to run a writing suite against dev or prod by accident. **Nothing
in that needs changing.**

**The version matches.** Dev is `16.15 (Debian 16.15-1.pgdg13+2)`, and
`postgresql-client-16` (16.15) is installed here.

**What is missing is only the SERVER.** `/usr/lib/postgresql/16/bin/` holds
`psql`, `pg_dump`, `pg_restore` and friends — and **no `initdb`, no `postgres`**.
`dpkg` confirms: `postgresql-client-16` is installed, `postgresql-16` is not.

There is a PostgreSQL **14** cluster online on port **5433**, but it is the
wrong major version for a `verify:genesis` that compares against a 16.15 dev,
and it wants a password this session does not have.

## What Jacob needs to run (one command)

```bash
sudo apt install -y postgresql-16
```

`sudo -n` fails here — a password is required — so this is his and not an
agent's. Everything after it can be done unattended.

## The sequence once the server exists

1. `initdb` a cluster owned by the normal user, on a port that does not collide
   with 5432/5433 — no root needed past the install.
2. `createdb test` on it.
3. `pg_dump` **dev** and restore into it. Dev, not production: it is the
   database the suite's fixtures already assume, and the dump is a read-only
   operation against dev. This is what makes it usable, and it is the answer to
   the objection recorded in `env.ts` — that comment says the switch is "NOT
   USABLE YET" because `test` is rebuilt from a *production* backup, and
   production lacks eight schemas so every `repo.next` test reads zero rows.
   **A copy of DEV has no such gap.**
4. Put the local URL in `TEST_DATABASE_URL` (explicit beats composed).
5. `pnpm --filter @dorado/api test:on-test-db`.

## The prize, stated honestly

116 ms → roughly 0.1 ms on the term that dominates everything. Every `BEGIN`,
advisory lock, query and `ROLLBACK` in a ~940-test suite currently pays a
round trip to another city. This does not make the tests better; it makes the
gate finish, reliably, which is the thing that failed tonight.

**It also removes a real hazard**: the suite currently writes to the same remote
dev database the application uses, which is how `tracking.test.js` once deleted
the real FedEx history of five dev shipments (`audit:test-leaks` exists because
of it). A local copy makes that class of accident cost nothing.

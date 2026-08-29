# Phase 5 (APPROVED) — the verification loop gets fast

Approved by Jacob 2026-08-29. Owner: unassigned.

```
1. A local PostgreSQL 16 for the test suite   ░░░░░░░░░░░░░░░░░░    0%
2. Shorten the serialized chain               ░░░░░░░░░░░░░░░░░░    0%
3. Parallelise the independent gate members   ░░░░░░░░░░░░░░░░░░    0%
```

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

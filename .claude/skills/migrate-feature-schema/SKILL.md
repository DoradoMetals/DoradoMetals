---
name: migrate-feature-schema
description: Move one API feature from the legacy `exchange` Postgres schema to the domain-namespaced schemas (core, orders, payments, shipping, tax, places), behind a runtime switch. Use when asked to migrate a feature's schema, move a feature to core, continue the schema migration, or convert a repo to the new tables. Also covers converting that feature to TypeScript and adding its database tests, because those happen in the same pass.
---

# Migrating a feature to the new schema

## Before anything else: do not lose data

This outranks every other consideration in this skill. A bug is recoverable by
deploying a fix. Lost customer data is not.

Every step below is arranged so the old schema stays authoritative and complete
until someone deliberately decides otherwise. Do not shortcut that ordering to
save time.

The check that enforces it:

```bash
pnpm --filter @dorado/api verify:parity            # all known pairs
pnpm --filter @dorado/api verify:parity exchange.leads core.leads
```

Run it **before and after every migration**, and again before promoting a
switch. It compares every shared column across every row and reports three
things: rows missing from the target, values that differ, and rows the target
holds that the source does not. It exits non-zero on any of them.

That third one is the subtle one. Once a feature is promoted past `dual`, the
new schema starts receiving writes the old one never sees — so **re-running a
backfill at that point overwrites live rows with stale values**. `verify:parity`
refuses in that state, and it is the only thing standing between a routine
re-run and real loss.

## Background you need

This database holds **two schema designs at once**:

- `exchange` — one flat schema holding everything. What the API serves from today.
- `core`, `orders`, `payments`, `fulfillments`, `shipping`, `refiners`, `tax`, `places`, `auth` — domain-namespaced, built in a January 2026 refactor that was abandoned at 3 of 24 features. The tables exist and are populated, but the data drifted after the copy.

The abandoned attempt is on the `api_overhaul` branch. **Do not resume that branch** — it is a long-lived rewrite that already failed once. Its value is the 50 MikroORM entity definitions as documentation of the intended model. The migration happens on master, one feature at a time, using the process below.

`orders.orders` unifies purchase and sales orders behind a `direction` discriminator (`purchase` / `sale`). That is the change that eventually collapses the duplicated tables and the composed queries built on them. Do it last.

## The process

Two features are already done and are the reference: `leads` and `rates`. Read `api/features/leads/` before starting a new one.

### 1. Assess the gap

```bash
cd api && node scripts/compare-tables.mjs exchange.<table> <schema>.<table>
```

Reports columns only in one side, type and nullability differences, **column defaults**, and row drift. Defaults matter as much as columns — the leads migration diverged purely on a default, and nothing else would have caught it.

Run with no arguments to see the whole known mapping and its effort tiers.

### 2. Write migrations for the schema gap

Plain SQL in `api/migrations/NNN_name.sql`, applied in filename order.

- Add missing columns, **carrying their defaults across** — an `ALTER TABLE ... ADD COLUMN` does not bring the default with it.
- Match defaults with `ALTER COLUMN ... SET DEFAULT`.
- Preserve existing behaviour even where it looks wrong. `exchange.leads.contact` defaults to the literal `'Jacob Johnson'`; migration 004 reproduces that deliberately. A migration whose job is to change nothing must change nothing. Raise the oddity separately.

### 3. Write the data backfill

An **upsert keyed on id**, so it is idempotent and converges when re-run:

```sql
INSERT INTO <schema>.<table> (...)
SELECT ... FROM exchange.<table>
ON CONFLICT (id) DO UPDATE SET ...;
```

It must only ever write to the new schema. `exchange` stays the source of truth until the switch is flipped — that is what makes this reversible.

```bash
pnpm --filter @dorado/api migrate:status
pnpm --filter @dorado/api migrate
```

Migrations apply to whatever `DATABASE_URL` points at, which is **dev**. Never apply to production; leave that to the user.

### 4. Split the repo and add the switch

```
repo.exchange.js   the original, untouched  (git mv repo.js repo.exchange.js)
repo.core.ts       the new one, TypeScript
repo.js            selects between them from an env var
```

The selector defaults to `exchange` and falls back to it on any unrecognised value:

```js
const SOURCE = process.env.<FEATURE>_SOURCE === "core" ? "core" : "exchange";
```

Service, controller and routes stay untouched. Re-export every function the old repo exported — missing one is a silent `undefined`. Add the variable to `api/.env.example`, defaulted to `exchange`.

### 5. Write the new repo in TypeScript

Node 24 strips types, so there is **no build step** — `.ts` runs as-is. Imports of `.ts` files use the explicit `.ts` extension.

Row types come from the generated contracts, never hand-written:

```ts
import type { core } from "@dorado/contracts";
type LeadRow = core.LeadsRow;

const result = await query<LeadRow>(sql, [id], executor);
```

After any migration, regenerate or the types are stale:

```bash
CONTRACT_SCHEMAS=exchange,core pnpm --filter @dorado/contracts generate
pnpm --filter @dorado/contracts build
```

Take an optional trailing `executor` on every function so callers can pull it into their transaction.

### 6. Prove the two are interchangeable

Add the feature to `FEATURES` in `api/scripts/diff-source.mjs`, then:

```bash
pnpm --filter @dorado/api diff <feature>
```

It runs both implementations over real rows and requires **identical** responses. Do not sort rows before comparing — both carry the same `ORDER BY`, and sorting would hide a regression in it.

This is the gate. Do not flip the switch until it is clean.

### 7. Add database tests

`repo.core.test.ts` alongside the repo. Real Postgres, not mocks — every defect that has reached customers was in a repo, and a mock reproduces none of them. Wrap each test in a transaction that is rolled back.

Cover at minimum: the defaults an insert relies on, read-back after write, update stamping, delete, declared ordering, and that a write made with a client is invisible to a read on the pool.

### 8. Stop

**Do not flip the switch.** Leave `<FEATURE>_SOURCE` unset so `exchange` keeps serving, and tell the user it is ready. Flipping is theirs.

## Do not

- Apply migrations to production.
- Drop a table or column without explicit confirmation, and verify nothing references it first — `order_metals.percent_change` and `scrap.gem_id` are 100% NULL but still selected and inserted by live code.
- Change the wire shape. If a response changes, the frontend breaks; that is a separate, deliberate piece of work.
- Add `NOT NULL` based on dev row counts. Dev holds tens of rows. That needs the production audit.

# Production-day fixes (2026-09-06)

Four things the UAT rehearsal found that would have gone wrong on the day, fixed
in the migrations and their verifier. Worktree `/home/jtj60/dorado-lanes/prodday`,
branch `prodday-lane`. Production was never connected to; every number below was
measured on a local copy of `uat_pristine` (the production-shaped restore) or on
dev. No customer row appears here — counts only.

The proof database was built the way production day builds one: a fresh
`createdb -T uat_pristine`, 071's four pre-flight DELETEs, `DROP SCHEMA core`,
then the whole migration chain, then the nine backfills the `002-049` baseline
stamps. That harness lives in the session scratchpad, not in the repo; the
runbook in `uat-rehearsal.md` is the version that is meant to be kept.

---

## 1. `047_seed_reference_data.sql` seeded a second set of the business's own facts

**Cause.** Every insert ended `ON CONFLICT (id) DO NOTHING`, and the id is the
one thing production does not share. Its January reference data is a separate
creation with its own ids, so the conflict never fired: the rehearsal watched
`places.locations` go **3 → 6**, and `shipping.services` collided on
`services_carrier_name_key`, which is `(carrier_id, name)` — a natural key —
and aborted the file. The same blindness ran through the references: a
location's `address_id`, an hour's `location_id` were literal ids that resolve
in dev and dangle on production.

**Fix.** `api/scripts/dump-seed.mjs` — the generator, because 047 is generated —
now emits every insert as

```sql
INSERT INTO <t> (...) SELECT v.… FROM (VALUES …) AS v (…)
WHERE NOT EXISTS (SELECT 1 FROM <t> t WHERE t.<key> IS NOT DISTINCT FROM v.<key> …)
ON CONFLICT (id) DO NOTHING;
```

keyed on the fact that identifies the row: `(type, name)` for organizations and
locations, the address lines for an address, `(location_id, weekday)` for an
hour, `(carrier_id, name)` for a service, `(carrier_id, label)` for a package,
`(direction, type, label)` and `(direction, type, provider_value)` for the two
method tables, `user_id` for an employee. A table with no entry in the
generator's `NATURAL` map throws rather than emitting an insert that cannot be
idempotent. References are resolved by the same natural key, with
`ORDER BY … LIMIT 1` — production's `places.addresses` holds every customer
address as well as the business's own, and the first attempt died on
`more than one row returned by a subquery`.

The dump is also scoped to `carrier_id IS NOT NULL` for services and packages:
the carrier-less "offered" rows are created by 110 and 112, and dumping them
here would seed them three migrations early.

**Proof**, on the production-shaped copy after the full chain — 047 exits clean
and the counts are the intended seed counts, unchanged over three consecutive
runs of the file:

| table | before the day | after 047 | intended |
|---|---|---|---|
| `places.locations` | 3 | **3** (was 6) | 3 |
| `places.location_hours` | 18 | **18** | 18 |
| `shipping.services` | 8 | **11** = 8 + 110's 3 carrier-less | 11 |
| `shipping.packages` | 9 | **12** = 9 + 112's 3 carrier-less | 12 |
| `fulfillments.methods` | 11 | **11** | 11 |
| `payments.methods` | 10 | **10** (was 12) | 10 |
| `auth.employees` | 2 | **2** | 2 |
| `organizations.organizations` | (no schema) | **15** | 15 |
| `places.addresses` | 118 | **134** | 133 backfilled + 1 business address production lacked |

## 2. `049_backfill_shipping.sql` wrote zero of 71 shipments

**Cause.** Every row 049 writes carries at most ONE of its two addresses — the
customer side comes from the order and the business side has no source in
`exchange` at all. `048_shipments_addresses_optional.sql` is what makes that
legal, and 048 sits inside genesis's `-- baseline: 002-049`, so on a database
that already holds tables it is STAMPED and never runs. Production's January
`shipping.shipments` still carries `shipments_addresses_required`, so the upsert
failed for every row and the rehearsal measured **41 against `exchange`'s 71**:
thirty shipments silently not migrated.

**Fix.** 049 asserts its own precondition instead of inheriting it — 048's
`ALTER TABLE shipping.shipments DROP CONSTRAINT IF EXISTS
shipments_addresses_required`, verbatim, at the top of the file. Idempotent, a
no-op where 048 really ran, and it names no exchange object.

**Proof.** On the production-shaped copy: `shipping.shipments` **71**, against
`exchange.shipments` **71**. `shipping.tracking` 531. Unchanged over three
consecutive runs. `verify:backfill` on dev stays at **0 undeclared differences**.

## 3. Migration 094 aborted while `exchange.carrier_pickups` held rows

**Cause.** 094 carried three refusals; the second counted
`exchange.carrier_pickups` and raised unconditionally while any row existed,
because `shipping.pickups` keys on a SHIPMENT and an `exchange.carrier_pickups`
row keys on the ORDER, so no backfill bridges them. It was written when "both
databases hold zero today" was true. Dev then accumulated six dual-era rows, so
a from-nothing migration of dev aborts at 094 — and production's own count was
unknown from the branch.

**Ruling** (Jacob, 2026-09-06): production has none of these, dev's six are
sandbox test rows, and they are NOT carried.

**Fix.** The refusal is removed — 094 now has two, and its header records what
the third was and why it went. `shipping.pickups` is declared in
`verify-backfill.mjs`'s `NOT_REBUILT` with that reason, and the pinned count of
6 is gone with it: the decision is not about how many there are. Nothing
deletes or writes an `exchange` row.

**Proof.** `uat_pristine` (production, untouched) holds **0**
`exchange.carrier_pickups`; dev holds **6**. Run read-only against dev inside a
rolled-back transaction: the old guard raises
`exchange.carrier_pickups holds 6 row(s)…`, the new 094 guard block **passes**.
`verify:backfill` reports 0 undeclared differences.

## 4. The two `auth -> exchange` mirror triggers are retired — migration 133

**Ruling** (Jacob): "Yes migrate and retire."

**The precondition, proved first.** Grepped `api/` for `exchange.users`,
`exchange.session` and `exchange."session"`, excluding migrations, tests,
`scripts/lib/feature-map.ts` and the test-db preflight: **zero hits in
application code** — nothing in `db/`, `domain/`, `transport/` or any feature
root. The only live hits were tooling, and they are repointed at `auth.users`,
the owner since the 107 cutover: `scripts/seed-e2e-users.mjs`,
`scripts/seed-e2e-order.mjs`, `scripts/audit-payments.mjs`.

**`133_the_mirrors_are_retired.sql`** drops
`mirror_identity_to_exchange_insert` / `_update` on `auth.users` (and 107's
pre-118 single-trigger name, for a database that never ran 118),
`mirror_sessions_to_exchange` on `auth.sessions`, and the two functions
`auth.mirror_identity_to_exchange()` / `auth.mirror_session_to_exchange()`. It
ends with a guard that re-reads `pg_trigger` and raises if any of the four
names survives. It touches no exchange table, column, row or constraint;
`exchange.mirror_funds_to_auth()` is deliberately left where 118 left it. The
header carries the full rollback, and points at 122 rather than 107/108 for the
function bodies, because 122 is the version that guards anonymous visitors.

**Everything downstream.** `000_genesis_schema.sql` regenerated from dev — 62
lines lighter, exactly the two functions — and `verify:genesis` passes
("identical to dev, and the committed genesis matches").
`shared/testing/builders/tests/builders.test.ts` asserted the mirror fired; its
subject is retired, so it moved with it and now asserts a built user lands in
`auth.users` and NOTHING lands in `exchange.users`.

## The consequence that had to be fixed with them: 073's method lookup

`073_backfill_payments_details.sql` resolved a payout's method by joining
`payments.methods` on the January spelling (`DORADO_ACCOUNT` → `'DORADO
CREDIT'`), because that is what 047 seeded. 109 renames that row, and 047 —
regenerated from dev by item 1 — now seeds the post-109 name. Which spelling is
present depends on the ORDER: production reaches 073 before 109; a from-nothing
build has 047 in front. The join became a `LEFT JOIN LATERAL` accepting both,
exact match first. A null `method_id` here is a payout account with no method,
which no constraint catches.

Measured on the production-shaped copy: **62 of 62** `exchange.payouts`-derived
`payments.details` rows resolve a method.

## What this pass did NOT fix, and the runbook now says so

Replaying the chain on a production-shaped copy with today's migrations surfaced
a NEW crop of the same one bug the rehearsal called F6 — genesis is the shape
after the newest migration, and production's tables are January's, so genesis's
`IF NOT EXISTS` DDL cannot repair them. Since 132 made `metals.metals.id` text,
genesis can no longer add the metal foreign keys to January's `uuid` columns
(`checkout.items`, `orders.items`, `orders.spots`, `refiners.items`), and
064, 066, 070, 083, 088, 120 and 132 itself all fail in the chain, with 031 and
036 following them with `uuid = text`. Ten genesis statements fail in total.
None of it is new in kind and none of it is this pass's four items; it is
recorded here and in the runbook so the day is not surprised by it.

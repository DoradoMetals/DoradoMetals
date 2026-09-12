# Pool spot and order numbering

Executed on `poolspot-lane`, 2026-09-12. Nothing committed. Ruling 123
(2026-09-13, quoted in full in the task) governs the formulas; the order
numbering section is a ruling added mid-wave.

## 1. Formulas

**A lot's settlement spot** (`inventory.lots.settled_spot`, unchanged column,
changed stamping): `settle.sql` now stamps it the same way for both
settlement types - the line's own spot if the settlement call named one, else
`COALESCE(li.settled_spot, live bid, live ask)`. Before this wave a `pooled`
order forced it to `NULL`; the refiner's price on a `paid` order and the
market's price on a `pooled` one are the same read now, so the special case
was the whole diff. `GET /api/refining/orders/:id/spots` drops its matching
`pooled -> NULL` branch for the same reason.

**A pool credit's spot** (`inventory.pool.spot`, new column, `entry='credit'`
only): the fine-ounce-weighted average of the settled lots' own
`settled_spot` that fed the credit -

```
spot = sum(content * premium * quantity * settled_spot) / sum(content * premium * quantity)
```

summed over the same lots `credit.sql` already sums to get `troy_oz`, so the
two numbers are computed from the same rows by construction. A lot with no
`settled_spot` drops out of both the numerator and the denominator rather
than pricing at zero.

**A lock's basis** (`inventory.pool.basis_spot`, new column, `entry='lock'`
only): the pool's own weighted-average CREDIT spot for that refiner and metal
at the instant the lock is written -

```
basis_spot = sum(credit.troy_oz * credit.spot) / sum(credit.troy_oz)
             over every prior credit for this refiner + metal with a spot
```

snapshotted once at INSERT time (a scalar subquery in `lock.sql`) so a later
credit never moves what an old withdrawal's gain was measured against.
Withdrawing does not change the weighted-average cost of what is left in the
pool, so `basis_spot` only ever needs the CREDITS before it, never the locks.

**A lock's gain** (`inventory.pool` read only, not stored):
`abs(troy_oz) * (lock_price - basis_spot)`. `troy_oz` is stored negative on a
lock; the gain is measured on the ounces themselves, not on the sign that
says which way they moved.

**The pool balance's `basis`**: the same weighted-average-credit-spot formula
as a lock's basis, but computed fresh over every credit to date rather than
snapshotted - it moves forward as new credits arrive. **`realised_gain`**
sums every lock's own snapshotted `gain`. **`unrealised_gain`** is
`available * (live spot - basis)`, `NULL` wherever `basis` is (nothing
priced yet to compare against).

**The order profit identity** (ruling 123, proven in
`pool-spot.test.ts`): for a lot priced at the order's own locked spot and
valued again at its `settled_spot`,

```
order_profit = content * premium * (settled_spot - order_locked_spot)
```

summed per order. On a scenario where the pool is drawn down to exactly
zero, `sum(order_profit) + sum(lock.gain) = cash_in - cash_out` where
`cash_in` is `sum(troy_oz * lock_price)` over the withdrawals and `cash_out`
is what the orders paid their sellers - proven algebraically and in the test
by substituting `order_profit`'s expansion and cancelling the shared
`settled_spot` term. A pool left with a balance does not reconcile this way
on purpose: the unrealised remainder is real value that has not become cash
yet, which is exactly what `unrealised_gain` reports instead.

## 2. `profit_breakdown.sql`

`refiner_spot`'s `COALESCE(a.settled_spot, p.lock_price, s.bid)` needed no
change - `a.settled_spot` is now populated for a pooled order's lots too, so
the `p.lock_price` fallback simply fires less often than it used to. The read
gains three top-level fields: `basis: 'realized' | 'estimated'`,
`settled_lots`, `total_lots`, from a new `lot_status` CTE that counts the
`assay` CTE's rows (every order lot with a batch edge to a refiner lot) and
how many carry a `settled_spot`. `estimated` means at least one of those
lots is still priced off the live feed; an order with no refiner-assayed
lots at all (a pure bullion sale) is `realized` trivially, since nothing is
outstanding.

## 3. The migrations

Both run against dev only, in this repo numbered from 227.

| migration | what it does |
|---|---|
| `227_a_pool_entry_carries_its_spot.sql` | adds `spot` and `basis_spot` to `inventory.pool`, two directional CHECK constraints (`entry = 'credit' OR spot IS NULL`, `entry = 'lock' OR basis_spot IS NULL`), and backfills both from the same formulas above, restricted to lots and credits that already carry a `settled_spot`. |
| `228_one_sequence_for_every_order.sql` | `orders.number_seq`, seeded above the max of `orders.orders.number`, `refining.orders.number` and the three old sequences' `last_value`; retargets `refining.orders.number`'s DEFAULT at it; scans `refining.orders` for a number that already names a customer order and draws a fresh one from the shared sequence for each collision found. |

### Backfill counts, on dev

| | credits | locks |
|---|---|---|
| total rows | 1 | 1 |
| backfilled | 0 | 0 |

Both existing rows are not derivable: the one credit's refiner lots never
carry a `settled_spot` (they predate this wave, and the order that produced
them was never run through `POST .../settle`), so the credit's `spot` stays
`NULL`, and the one lock's `basis_spot` stays `NULL` in turn - there is no
priced credit before it to average. Both are noted here rather than guessed.

### Order numbering, on dev and on a production-shaped rehearsal

37 refiner orders existed on dev; **0 collided** with an existing customer
number (`refining.orders.number`'s own sequence tops out at 1068,
`orders.orders`'s combined purchase+sale numbers run past 16000, and the two
ranges never happened to overlap). `orders.number_seq` seeded to **16298**.
No refiner order was renumbered on dev - the collision path is written and
tested against a manufactured collision
(`db/refining/orders/tests/numbering.test.ts`), not exercised by dev's real
data.

Rehearsed for real before touching dev: `CREATE DATABASE chain6_poolspot
TEMPLATE chain6_round2` on the local cluster at 127.0.0.1:5544 (the
production-shaped copy `lot-model.md`'s wave left at migration 193), brought
forward through 197-217 and then through both of this wave's migrations via
`MIGRATE_ALLOW_DB=chain6_poolspot pnpm --filter @dorado/api migrate` - the
runner's own escape hatch for a target that is not `dev`, exercised rather
than bypassed. Counts only, no customer row read:

| | `chain6_poolspot` | dev |
|---|---|---|
| pool credits backfilled | 0 of 0 (no pool activity at all on this copy) | 0 of 1 |
| pool locks backfilled | 0 of 0 | 0 of 1 |
| `orders.number_seq` seeded to | 1010 | 16298 |
| refiner orders present / renumbered | 9 / **0** | 37 / **0** |

Both copies agree: nothing collided, so 228's fix-up path is proven only by
`numbering.test.ts`'s manufactured case, not by real data on either database.
`chain6_poolspot` is left in place alongside `chain6_round2` as the rehearsal
record, the same way that lane's own clone was kept.

Going forward `PO-`, `SO-`, `RP-` (refiner purchase, we buy) and `RS-`
(refiner sale, we sell) all draw from `orders.number_seq`:
`create_from_checkout.sql` calls it directly for a customer order, and
`refining.orders.number`'s column DEFAULT now points at it. The two old
customer sequences and the old `refining.order_number_seq` are left in place,
unused, rather than dropped - nothing reads them going forward, and dropping
a sequence is not a data-loss question worth taking on in this wave.

## 4. Shape changes

| shape | change |
|---|---|
| `PoolEntry` | gains `spot` (credit only), `basis_spot` (lock only) - both nullable, both generated from the new columns |
| `PoolEntryView` (new) | `PoolEntry` plus `gain` - `abs(troy_oz) * (lock_price - basis_spot)` on a lock, `null` on a credit. `GET /api/refining/pool/entries` now answers this instead of a bare `PoolEntry` |
| `PoolBalance` | gains `basis`, `realised_gain`, `unrealised_gain` |
| `ProfitBreakdown` | gains `basis: ProfitBasis`, `settled_lots`, `total_lots`; `ProfitBasis` (new) is `'realized' \| 'estimated'` |
| `RefiningOrderView.number` | was the bare `number`; is now the prefixed reference string (`"RP-1042"`, `"RS-1042"`) - the one field on this view that does NOT match its base `RefiningOrder.number: number`. Every other reader of a raw `RefiningOrder` (rules.ts's messages, the repo layer) is unaffected |
| `refiningReferenceFor` (`transactions/rails/rules.ts`) | was `(number) => \`RO-${number}\``; is now `(direction, number) => `${direction === 'buy' ? 'RP' : 'RS'}-${number}`` |

Read-only reference strings that already existed just changed their letters,
with no shape change: `inventory.lots` list/view's `refining_order_reference`,
and `refining.orders` view's per-lot batch-seat `reference` and its
`linked_orders`-adjacent uses, all go from a flat `RO-` to `RP-`/`RS-` by
`ro.direction`. A refiner-order payout or charge opened through
`POST /api/payments/payouts|charges` now takes its `reference` directly from
the (already-formatted) `RefiningOrderView.number` rather than calling
`refiningReferenceFor` a second time on the raw column.

## 5. Tests

- `api/src/domains/refining/tests/worked-examples.test.ts` - the pooled
  settlement test is rewritten: it now asserts the live bid IS stamped
  (rather than asserting it is never stamped), and that a settlement line
  still cannot name its own spot on a pooled order.
- `api/src/domains/refining/tests/pool-spot.test.ts` (new) - a credit's
  weighted spot and a lock's snapshotted basis and gain, read back through
  `refining.entries` / `refining.balances`; and the reconciliation identity
  on two orders settled into one pooled refiner order, drawn down to zero by
  three withdrawals at three different spots.
- `api/src/domains/pricing/tests/profit.test.ts` - `basis` / `settled_lots` /
  `total_lots` added to the three existing scenarios (two `estimated`, one
  trivially `realized` with no refiner lots), plus a new test that runs a
  lot through the real `create -> assign -> send -> settle` flow on a pooled
  order and confirms the breakdown prices the refiner share off the pooled
  lot's own `settled_spot`.
- `api/src/domains/transactions/rails/tests/rules.test.ts` (new) - both
  reference formatters, direction by direction.
- `api/src/db/refining/orders/tests/numbering.test.ts` (new) - a fresh
  refiner order and a fresh customer order never collide; a manufactured
  collision is fixed by re-running migration 228's own SQL text against a
  crafted fixture, the untouched control order is left alone, and a second
  run is a no-op.
- `api/src/domains/orders/tests/place.test.ts` and
  `.../orders/tests/lot-edits.test.ts` - two pre-existing tests updated for
  the sequence rename and the new `number` format respectively.

`pnpm check:fast`: **CHECK_EXIT=0** (`api-lint`, `api-test`, `design`).
`pnpm check`'s `dev-db` group (`verify:genesis` and friends) was not run this
lane - it was not asked for, and every change here is additive columns plus
read-time SQL, not a shape genesis would need reconciling.

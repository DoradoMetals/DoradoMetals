# 161 on production data: which content is the truth

Branch `lot161-lane`, worktree `/home/jtj60/dorado-lanes/lot161`. Rehearsed on
`lot161_rehearsal`, a `createdb -T chain6` copy of the rebuilt
production-shaped database on the local cluster (127.0.0.1:5544). Production
was never connected to. Ids, columns and counts only.

## The abort

`161_backfill_lots_from_order_items.sql` asserted the WHOLE population of lots
against `metals.fine_content` and refused above 1e-3 t oz:

```
161_backfill_lots_from_order_items.sql rolled back:
  a lot content moved by 0.002010 t oz, which is a price change and not a rounding residue
```

It passes on dev and stops the chain dead on production data — and under
ruling 82 production is rebuilt by replaying every migration, so a migration
that cannot run on production's rows is a production-day blocker.

## The one row, and the 81 that are not it

**82 scrap lines. 81 satisfy `stored = round(derived, 3)` EXACTLY.**
`exchange.scrap.content` is `numeric(20,3)`, so a stored content is the
derivation rounded at write time and nothing else. Worst residue **5.00e-4
t oz**, on `1167f22b-8ae3-4f95-beeb-ab4e1b06dd45` (order 315) and
`d5bd93df-02bb-412b-a366-856e6e649a3e` (order 261), both `-0.0005000`.

**One does not**, and it is the whole abort:

| | |
|---|---|
| line | `2f531d4a-b9f0-40d1-b536-21322d2e5544` |
| order | `40492be1-a958-4663-b190-71971aaffcd9`, purchase **270**, Completed |
| metal | Silver, unit `t oz`, quantity 1 |
| weights | pre-melt 4.425, post-melt 4.390 |
| purity | 0.059 |
| stored content | **0.257** |
| derived content | **0.259010** |
| delta | **2.010e-3 t oz** |

### The cause: a purity ROUNDED, not a purity applied twice

Not the `post_melt x purity` double-application review finding 4 fixed — that
signature is a 0.1%-8.3% understatement and this is an overstatement of 0.78%.
The arithmetic is exact:

- `exchange.scrap.purity` is **`numeric(4,3)`**. `0.0585::numeric(4,3)` is
  `0.059` — Postgres rounds half AWAY from zero.
- `round(4.390 * 0.0585, 3)` is **`0.257`**, the stored content, to the digit.
- `round(4.390 * 0.059, 3)` is `0.259`, which is what the column's rounded
  purity now derives.

So the assay was 5.85% silver, the content was computed from it, and the
purity column then rounded UP to 5.9% while the content stayed where it was.
This is the `numeric(4,3)` scrap-purity defect CLAUDE.md's `audit:precision`
entry names, biting an assay fraction rather than a bullion fineness. It is
invisible to `audit:precision` by construction: that audit casts a SOURCE value
into its TARGET's type, and the loss already happened at the source.

The other three lines of the same parcel (the same 4.425/4.390 weights, split
across metals by assay) are all exactly `round(post_melt x purity, 3)`: Gold
0.618 → 2.713, Palladium 0.116 → 0.509, Platinum 0.011 → 0.048. Only silver's
purity had a fourth decimal to lose.

### The money, and why the row is not rewritten

`price / content` on that line is **38.130000** exactly — the line was priced
and PAID on 0.257 t oz. Re-deriving it to 0.259010 re-prices a settled order by
$0.0766. The row is **recorded here and NOT rewritten**: an order already paid
is a fact, and no migration on this branch re-prices one.

## The rule 161 now encodes

**A lot on a SETTLED order carries the content it was paid on, as a snapshot.
A lot on an OPEN order generates its content from its own weights.**

"Settled" is read off facts and never off a status (ruling 2) — it is exactly
`rules.isFinalized`: `orders.orders.spots_locked` AND the order's
`orders.transactions` row carries a `total`. The same predicate, written in
SQL, decides whether `lots.items.content_snapshot` is filled.

That makes the gate mean something it did not mean before. It used to assert
history, where a disagreement is a rounding artefact of a retired schema and
the only available response is to abort the rebuild. It now asserts the lots
that can still be re-weighed, re-assayed and re-priced, where a derivation
disagreeing with its stored value IS a live defect. The settled side is
reported, with every offending id, as a `RAISE NOTICE` the runner prints.

`a_snapshot_belongs_to_a_product` — `CHECK (content_snapshot IS NULL OR
bullion_id IS NOT NULL)` — had to go with it: a CHECK cannot see whether a
lot's order is finalized. 160 no longer adds it and **173 drops it**. The half
that is still true is that no LIVE path writes a scrap lot's snapshot, and that
now lives where it can be read: `create.sql` never sets it, `split.sql`
inherits it only for a product lot, `LotPatch` does not carry it, and
`db/lots/items/tests/repo.test.ts` — "no live path can snapshot a scrap lot" —
pins all three.

## The counts

### On the production-shaped copy, before the change

| bucket | lines | content differs from the derivation | worst | beyond 1e-3 |
|---|---|---|---|---|
| catalogue, open | 14 | 0 | 0 | 0 |
| catalogue, settled | 7 | 0 | 0 | 0 |
| scrap, open | 7 | 4 | 3.774e-4 | 0 |
| scrap, settled | 75 | 70 | **2.010e-3** | **1** |

The abort was entirely in the bottom row, and every catalogue line reproduces
its content exactly because it already snapshots (ruling 51).

### After the change, the same copy

```
applying 161_backfill_lots_from_order_items.sql ... ok
    lots: 4 open lot(s) regenerated their content, worst drift 0.00037737172842362112009 t oz
    lots: 75 settled scrap lot(s) keep what was paid; the derivation would have moved 70,
          worst 0.002010 t oz, 1 beyond 1e-3: 2f531d4a-b9f0-40d1-b536-21322d2e5544 (0.00201 t oz)
```

103 lots, 82 scrap, 96 snapshotted (21 catalogue + 75 settled scrap). Every
snapshotted lot's `content` equals its order line's stored content exactly:
`content IS DISTINCT FROM orders.items.content` returns **0 rows**.

### The chain

`createdb -T chain6 lot161_rehearsal`, then one `migrate` run:
**134 → 173, 28 migrations, ZERO aborts.** 172's phone backfill and 173 both
report their counts through the runner's notice printer.

### On dev

`173` applied to dev: **9 settled scrap lot(s) keep what was paid; 0 beyond
1e-3.** Dev's scrap sits mostly on open orders, which is why the old 161
committed there and why dev could never have found this.

## What this does NOT do

- **It does not fix order 270.** The silver line keeps 0.257, which is what the
  customer was paid. Correcting the assay purity from 0.059 back to 0.0585
  would be an `UPDATE` against `exchange` — destructive, Jacob's, and pointless
  unless the money moves with it.
- **It does not widen `exchange.scrap.purity`.** The two non-destructive
  widening `ALTER`s CLAUDE.md's `audit:precision` entry describes (D61, D200)
  are still ready and unapplied; this row is a second reason to run them, and a
  reason to run them BEFORE any further scrap is declared, not after.
- **It does not change how a live lot is priced.** `metals.fine_content` stays
  the one definition (review finding 4). Only lots whose order is already
  settled stop deriving, and they stopped being re-priceable before this
  migration existed.

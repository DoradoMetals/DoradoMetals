# Wave 5C — the scrap/bullion covenant, and the instrument that had never looked

Dispatched because of D124: wave 5's task 2 lives in `features/scrap` and
`features/checkout`, which belonged to no lane. 5b declined it correctly.

Scope, both halves: `api/features/scrap/**`, `api/features/checkout/**`,
`frontend/features/{scrap,cart}/**` and the checkout components consuming them.
NOT mine: shipping/fulfillments (5b), orders/pricing/legacy (5a).

```
1. The covenant: scrap+bullion data migration  ██████████████████  100%
2. Delete legacy scrap/bullion API layers      ░░░░░░░░░░░░░░░░░░    0%
3. Make the covenant answerable (parity pairs) ██████████████████  100%
```

Started from `a2599311`, working tree shared with 5a and 5b.
**Nothing was deleted. One file changed: `api/scripts/verify-parity.mjs`.**

---

## Task 1 — the covenant: MEASURED, AND IT REFUTES THE CLAIM

The claim under test: *scrap and bullion lines are `checkout.items` now.*

**They are not. `checkout.checkouts` and `checkout.items` are EMPTY — zero rows
— in dev AND in production.** Nothing has moved. There is no backfill migration
for checkout: 068 and 069 are additive DDL only, and `features/checkout/repo.js`
says why in its header — *"Existing cart rows are deliberately not backfilled.
Jacob: 'It's not data that we NEED to keep'"*.

### The rows, both databases

| table | dev | prod |
|---|---:|---:|
| `exchange.carts` | 10 | 17 |
| `exchange.cart_items` | 4 | 3 |
| `exchange.sell_carts` | 10 | 66 |
| `exchange.sell_cart_items` | 2 | 26 |
| `exchange.scrap` | 20 | 105 |
| **`checkout.checkouts`** | **0** | **0** |
| **`checkout.items`** | **0** | **0** |

Exchange-only rows — the number the checklist says matters: **every one of
them.** Target-only rows: zero, because the target is empty.

### Where each `exchange.scrap` row lives

| | dev | prod |
|---|---:|---:|
| referenced by a purchase order line | 18 | 82 |
| referenced by a sell-cart line only | 2 | **23** |
| orphaned (neither) | 0 | 0 |

**23 production scrap rows, across 12 sell carts and 12 distinct customers,
exist in `exchange` and nowhere else** — 459.374 g of 0.900, 272.228 t oz of
sterling, 13.419 g of 0.203, and so on. These are also exactly the rows
`deleteOrphanScrap` would take if both its reference sets were ever empty
(FOLLOWUPS records the blast radius; unchanged, and I did not touch it).

### The order half — clean on dev, one divergence in production

`exchange.purchase_order_items` JOIN `exchange.scrap` against `orders.items`,
matched by id, compared column by column:

| | dev | prod |
|---|---:|---:|
| pairs compared | 20 | 57 |
| `pre_melt` differs | 0 | **1** |
| `post_melt` differs | 0 | **1** |
| `purity` differs | 0 | **1** |
| `content` differs | 0 | **1** |
| `unit` differs | 0 | 0 |
| `metal_id` differs | 0 | — |
| `premium` vs `purchase_order_items.premium` | 0 | 1 |

The assay lands on `refiners.items` exactly as 065 says: 20 pairs, **0**
differences on `purity_actual`→`purity`, `post_melt_actual`→`post_melt`,
`content_actual`→`content`.

**Production's one disagreeing line — REPORTED, NOT MINE** (`orders.items` is
lane 5a's table):

```
order item d16b7c32-9623-47d6-a888-c6e15a99d8a4
order      117265cc-beca-494d-a126-a1be9b09fbeb
             exchange.scrap    orders.items
pre_melt     18.662            20.000
post_melt    18.662            NULL
purity       0.570             0.563
content      0.342             0.362
```

Two copies of one production purchase-order line disagreeing on the weight and
the purity — what the customer is paid on. Consistent with the January-refactor
drift the DEPLOY ORDER block describes. Also **27 of production's 89
`purchase_order_items` have no `orders.items` row at all**, expected because the
production backfills have never been run.

### `exchange.scrap.bid_premium` — the one column with no home

`audit:coverage` reports exactly one unhomed populated column and it is this
one: **105 of 105 production rows populated.** It is not the order line's
premium: `orders.items.premium` comes from `purchase_order_items.premium`
(0 differences on dev, 34 of 57 differences against `scrap.bid_premium`). The
dual writer *does* carry it — `replaceSellItems` writes `d.bid_premium` into
`checkout.items.premium` — but `scripts/lib/feature-map.mjs` FLOWS declares
`085/086: no premium is copied`. **The map and the code disagree**; reported,
not changed, because that map drives `audit:precision` for other lanes.

### The switch is `dual` on dev, and the target is still empty

`CHECKOUT_SOURCE=dual` in the dev environment. `audit:switches` reports **2
`*_SOURCE` switches remaining, not the twenty-one CLAUDE.md still claims** —
only `CHECKOUT_SOURCE` and `PAYMENTS_SOURCE` survive.

The dual write itself works: `features/checkout/repo.dual.test.js` passes all
three cases (buy cart lands in both, sell cart lands under `purchase`, scrap
line inline with no bullion). Dev's rows simply predate the switch.

**But it cannot work in production.** `repo.next.ts` reads `products.bullion`
and `metals.metals`, and **neither schema exists in production** — production
holds only `auctions, auth, checkout, core, exchange, fulfillments, orders,
payments, places, refiners, shipping, tax`. Promoting `CHECKOUT_SOURCE` to
`dual` against production today raises 42P01 on every sell-cart sync. Same
exposure on the quote path: `features/quotes/service.ts:416` calls
`checkoutRepo.findProductIdByName`, which is `SELECT id FROM products.bullion`
with **no switch in front of it**, on the endpoint that prices every
customer-visible number. Covered by the DEPLOY ORDER block only if steps 2 and 3
actually run first.

### Against the CLAUDE.md pre-deletion checklist

| step | checkout | scrap |
|---|---|---|
| 1. `verify:parity` exchange-only = 0 | **was not measurable** — no pair existed; now measured, and it is 10/10/4/2 on dev and 17/66/3/26 in production | scrap is a merge, not a pair — see below |
| 2. `audit:coverage` | passes on schema; says nothing about rows, and flags `scrap.bid_premium` | same |
| 3. decomposition gate | **none exists** for checkout | none |
| 4. reads pivoted | **no** — `dual` reads exchange by design | `repo.ts` is exchange-only and live |

Four of four unmet. **Task 2 does not happen** (endorsed by the coordinator as
D130).

---

## Task 3 — making the covenant answerable

`verify-parity.mjs` held **eleven** pairs and not one was a cart, a cart item or
scrap. Four are now added. `verify:parity` is **not** a `pnpm check` member, so
this cannot redden the gate for another lane.

```
exchange.carts            -> checkout.checkouts   1 of 2 cols   10 src, 0 tgt   10 missing
exchange.sell_carts       -> checkout.checkouts   1 of 2 cols   10 src, 0 tgt   10 missing
exchange.cart_items       -> checkout.items       1 of 4 cols    4 src, 0 tgt    4 missing
exchange.sell_cart_items  -> checkout.items       1 of 6 cols    2 src, 0 tgt    2 missing
```

All four print `>> NOT SAFE`. The renames are declared, as the neighbouring
entries do: `cart_id`→`checkout_id`, `product_id`→`bullion_id`,
`gross_unit`→`unit`, and `scrap_id` with no successor because the values sit on
the item.

### What these entries CANNOT tell you, stated so nobody reads them wrong

**The comparison joins on `id`, and a checkout row does not keep the exchange
row's id.** `repo.next.ts` inserts without an id, so every row gets a fresh
`gen_random_uuid()`; `repo.dual.js` says so in its own header. Nothing in the
`checkout` schema points back at its source — I checked for `source_*`,
`legacy_*` and `exchange_*` columns and there are **zero**.

While the target is empty these entries are exact. The moment anything lands in
it they can never go green: `missing_from_target` will still count every source
row, and `differing values: 0` will still mean *no rows joined*, never *the
values agree*. That is written into the file above the entries.

**Making it permanently answerable is a schema change, not a script change.**
The project already has the shape — `orders.addresses.source_address_id` exists
for exactly this reason. `checkout.checkouts` and `checkout.items` want the
same, plus a backfill. That is a migration and Jacob's call; I wrote none.

### `exchange.scrap` is deliberately NOT a pair

It fans out three ways — `orders.items` for an ordered line, `refiners.items`
for the assay, `checkout.items` for a sell-cart line — so no single target holds
it. Run ad hoc against `orders.items` it reports *"20 missing from target, 57
only in target, DO NOT BACKFILL"*, and all three numbers are artefacts of
comparing a merge to a pair. Same reason CLAUDE.md gives for parity never having
looked at orders.

### Pre-existing failure, not mine

`exchange.metals -> metals.exchange_compat` reports **4 differing values of 4
rows** and did so before this change: gold ask 4461.43 vs 4612.06, silver 68.45
vs 71.41, and so on. Dev's spot poller updates one side and not the other, so
that pair drifts by construction. Named here because `verify:parity` now exits
non-zero for two unrelated reasons and a reader should not conflate them.

---

## Zero-importer census — findings only, deleted nothing

- **`api/features/scrap/service.ts` has zero importers.** Nothing anywhere
  imports `#features/scrap/service.ts`; its two functions are pass-throughs to
  `scrapRepo`, and the three live callers (`orders/service.ts`,
  `refiners/items/service.ts`, `media/pdfs/render/sections.ts`) all import the
  repo or the util directly. Dead by ruling 29's test, and it is the one thing
  in my tree that could be deleted without any data argument at all. Left in
  place because task 1 did not clear.
- `api/features/scrap/repo.ts` is **live**, not legacy: three feature services
  call it and it writes `exchange.scrap` on the order path.
- `api/features/checkout/repo.exchange.js` is **live** — it is what
  `CHECKOUT_SOURCE` selects, exactly as CLAUDE.md says.
- **The scrap declaration forms are untouched**, as instructed.

## Seams reported, not crossed

1. `orders.items` production divergence (above) — 5a's table.
2. `api/features/quotes/` belongs to no lane, and it holds an unswitched
   new-schema read on the money path. Another D124 instance.
3. `api/features/scrap/utils/assignScrapNames.ts` was edited by 5a in my tree
   (import repointed to `#features/orders/compose.ts`). Correct, and noted only
   so the ownership record stays honest.
4. `addItems` (sale) writes no premium; `replaceSellItems` (purchase, product
   branch) writes `b.bid_premium` as premium. The two directions disagree.

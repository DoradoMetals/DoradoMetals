# profitBreakdown is SQL (ruling 78)

Jacob: *"that calculateSalesOrder dictionary thing is tragic to look at. We
shouldn't be doing anything like that ever… The only thing we care about from
legacy code is the logic. The code itself? Fully comfortable throwing away."*

`api/pricing/profit.ts` was the last survivor of the pricing merge - the one
function `docs/waves/pricing.md` says was left in TypeScript on purpose
("porting it is its own lane"). This is that lane. The code is gone; the
arithmetic is not.

## 1. The logic, written down before anything was deleted

Verified against the pre-existing `api/pricing/tests/profit.test.ts` and the
`/api/quotes/profit_breakdown` case in `api/pricing/tests/replay.test.ts`, then
against the deleted implementation line by line.

**What the report is.** A purchase order's metal is bought from the customer,
sent to a refiner, and settled. Three parties end up owning fractions of the
same fine ounces, and this answers: who owns how much, what is it worth to
them, and what does each walk away with once carriage and fees are counted.
It is an ADMIN report and nothing else reads it.

**Where each number comes from.**

1. **A line's declared content** is `orders.items.content` for scrap, and
   `content x quantity` for a product line (a scrap lot is weighed once; a
   product's content is per unit). A line whose declared content is zero takes
   no part in the report at all.
2. **A line takes part only if its metal is a metal** - `orders.items.metal_id`
   must resolve in `metals.metals`. The old code hardcoded
   `["Gold","Silver","Platinum","Palladium"]`; ruling 79 made
   `metals.metals.id` the metal's own name, so the list is now the table.
3. **Dorado's premium** on a line is `orders.items.premium` when the line
   carries one. When it does not and the line is SCRAP, it is the rate band's
   `rates.rates.scrap_pct` for that metal. A product line with no premium has
   no Dorado premium - the band is never consulted for bullion.
4. **The band is earned by the whole order**, not the line: the total scrap
   ounces of that metal across every scrap line on the order pick the band.
   Of the bands that CONTAIN the total, the one with the lowest floor wins - so
   a total sitting exactly on a boundary takes the lower band. Below every
   band takes the lowest, above every band takes the highest.
5. **The refiner's premium** on a line is `refiners.items.premium` for that
   order item, when an assay row exists.
6. **Either premium standing alone fills in for the other**, and neither means
   both are 1 (the customer takes it all). Both are then clamped into [0,1].
7. **The three shares** of a line, from those two premiums `d` (Dorado's) and
   `r` (the refiner's): `customer = d`, `dorado = max(r - d, 0)`,
   `refiner = 1 - max(d, r)`. They sum to exactly 1.
   *(The deleted code computed `customer = d`, `dorado = max(r-d,0)`,
   `refiner = 1-r`, then renormalised when the three missed 1 by more than
   1e-9. The renormalisation only ever fired for `r < d`, and its result is
   always `refiner = 1 - d`. The closed form above is the same three numbers
   with no threshold in it. The `1e-9` was the only threshold in the file and
   it does not survive - it was never a business rule.)*
8. **The customer's ounces come off the DECLARED weight**; Dorado's and the
   refiner's come off the ASSAY (`refiners.items.content`, or
   `post_melt x purity` when content is absent) where there is one, because
   that is the metal that actually arrived. With no assay the declared weight
   is used for all three. This is scrap only - a product line has no assay
   weight. So per line:
   `customer = declared x customer_share`,
   `refiner = basis x refiner_share`,
   `dorado = basis - customer - refiner`.
9. **The customer is valued at the order's own frozen bid** (`orders.spots.bid`
   for the line's metal); **Dorado and the refiner at the refiner's**
   (`refiners.spots.bid`). A metal with no spot row is valued at zero.
10. **The split is reported three ways**: `scrap` (scrap lines only), `bullion`
    (product lines only) and `total` (both). The shares themselves do not
    depend on which - the deleted code passed the category into the share
    calculation and its one category-dependent branch produced the identical
    answer to the fall-through.
11. **A metal's percentage** within a category is that party's ounces over the
    three parties' ounces together, times 100; zero when the three sum to zero.
12. **Carriage.** The customer paid the inbound parcel: the first
    non-`Return` shipment on the order, by `created_at` then `id`, and its
    `shipping.shipments.cost`. Dorado paid `orders.transactions
    .shipping_fee_actual`. The refiner pays no carriage. `shipping_net` is the
    difference, signed from each party's side: customer
    `dorado_shipping - customer_shipping`, Dorado the negation, refiner 0.
13. **Fees.** Dorado's `refiner_fee_net` is `-abs(orders.transactions
    .refiner_fee)`. The customer's is `-abs(payout fee)`, where the payout fee
    is `orders.transactions.payout_fee` unless `waive_payout_fee` is true, and
    is zero unless `payout_details_id` resolves to a `payments.details` row.
    The refiner's is 0.
14. **Dorado's spot_net** is the gap between the two feeds over every ounce the
    customer was paid for, in the `total` category:
    `sum(customer_content x (refiner_bid - order_bid))` over the metals where
    BOTH feeds are priced. A metal missing either feed contributes nothing
    rather than being valued at zero. The customer's and the refiner's
    `spot_net` are 0.
15. **total_profit** is `metals_profit + spot_net - shipping_charged
    - fee`, per party: the refiner's is its metal alone; Dorado's is its metal
    plus the spot gap, less `(dorado_shipping - customer_shipping)` and the
    refiner fee; the customer's is its metal less the parcel it paid for and
    the payout fee.
16. **An order that does not exist is refused** (`NotFound`, "nothing to
    price"), not answered with zeros. That is the file's only refusal and it
    was already `rules.assertPriced` - see below.

**A sale runs through the same read and it is not wrong.** An ask premium is
above spot, clamps to 1, and the customer ends up owning 100% with Dorado and
the refiner at zero - which is what the deleted code did too. Only the carriage
line moves. `sale-settlement`-style numbers are the quote's job, not this one's.

## 2. What replaced it

| | before | after |
|---|---|---|
| `api/pricing/profit.ts` | 377 | **deleted** |
| `api/db/pricing/sql/profit_breakdown.sql` | - | 227 (86 of them comment or blank) |
| `api/pricing/service.ts` | +0 | +12 (the read and the parse) |
| `api/db/pricing/repo.ts` | +0 | +9 |
| `packages/contracts/src/pricing/profit.ts` | 42 | 65 |
| `api/pricing/tests/profit.test.ts` | 38 | 225 |
| **TypeScript that computes money** | **377** | **0** |

`profitBreakdown` did not need a file. It is now four statements in
`api/pricing/service.ts`, beside `priceOrder` and the other three, and
`api/pricing/index.ts` exports all five from one place.

**`api/pricing/rules.ts` is unchanged, on purpose.** The only decision in the
whole 377 lines that is a rule is the refusal of an order that is not there,
and that was already `rules.assertPriced` - the same throw `priceOrder` and
`priceProduct` use. The `1e-9` renormalisation trigger looked like a threshold
and was not: fact 7 shows it is algebra, and algebra belongs in the SQL.
Adding it to `rules.ts` would have been inventing a rule to have one.

**The `lint:no-literal-views` allowance for `pricing/profit.ts` (7 entries) is
deleted, not moved.** So is the `COMPUTED` reason string it was the last user
of. The `lint:contracts-derived` entry stays - the shape still derives from no
table - with its wording corrected to say it is rows now.

## 3. The shape

`ProfitBreakdown` is ROWS. The old shape was a dictionary of dictionaries:
three parties x three categories x a fixed `{gold, silver, platinum,
palladium}` object, twelve metal objects per answer, four metals always
present and usually zero.

```
{ order_id, spots_at,
  shares:  [ { party, category, metal_id, content, percentage, profit } ],
  parties: [ { party, metals_profit, shipping_net, refiner_fee_net,
               spot_net, total_profit } ] }
```

- `party` is `customer | dorado | refiner`; `category` is
  `scrap | bullion | total`. Both are closed business sets, not tables.
- `metal_id` is `Metal.shape.id` - derived from the entity, and a metal appears
  **only when the order has a line in it**. An order of gold no longer carries
  three zeroed metals.
- `order_id` is `Order.shape.id`, as before.
- `metals_profit` is new: it is the fifth component of `total_profit`, so the
  party row reconciles on its own without re-summing `shares`.
- `spots_at` is unchanged (`to_char(now() AT TIME ZONE 'UTC', …)` now, rather
  than `new Date().toISOString()`).

`ProfitMetal`, `ProfitMetalsDict` and `ProfitCategoriesDict` are deleted.
Nothing in `api/` or `packages/` imported them but `profit.ts` itself.

**Arithmetic note.** Every number is now Postgres `numeric` (exact decimal)
rather than float64, reaching the wire as a JSON number. The tests compare at
1e-9, the same tolerance the rest of the pricing suite uses.

## 4. What the tests pin

`api/pricing/tests/profit.test.ts` - four cases, every expected value
hand-computed from the fixture and written out long:

1. **A purchase, end to end.** One scrap line (10 oz declared at premium 0.9,
   assayed at 10.5, refiner premium 0.94) and one product line (2 oz x 3 at
   0.95, refiner premium 0.98); order bid 100, refiner bid 120; carriage
   charged 10 and paid 24.5; refiner fee 7; payout fee 20 through a real
   `payments.details` row. Pins all 9 share rows (content, profit, percentage),
   that the three percentages of each category sum to 100, and all four
   components of all three party rows -
   customer `-14.5 / -20 / 0 / 1425.50`, dorado `126 / 14.5 / -7 / 294 /
   427.50`, refiner `0 / 0 / 0 / 90`.
2. **The rate band.** A scrap line with NO premium of its own, 10 oz of gold,
   against the band the test resolves itself from `rates.rates` with the rule
   stated independently ("of the bands containing the total, the lowest floor
   wins"). Pins that the band becomes BOTH premiums, that Dorado therefore
   takes nothing, and that a category with no lines emits no rows.
3. **A sale.** An ask premium above spot clamps to 1: the customer owns all of
   it, the refiner nothing, and Dorado keeps the carriage difference.
   Pins `customer 200 / -7 / 188` and `dorado 0 / 7 / 0 / 7`.
4. **The refusal.** An unknown order id rejects with "nothing to price"
   rather than answering zeros.

Deleted with the old shape: the single previous case, which pinned
`customer.shipping_net === -24.5` and then only that twelve fields were finite.
Its one real number (the inbound parcel's cost showing up as the customer's
net) survives inside case 1 as `-14.5` with a charged fee on the other side.

`api/pricing/tests/replay.test.ts` keeps its authorization case unchanged -
anonymous and customer refused, admin answered - with its finiteness sweep
moved onto the `parties` rows and one added assertion that all three parties
reach the wire.

## 5. Frontend breakages (out of scope for this lane, ruling 44)

`pnpm check` does not build or typecheck the `frontend` workspace, so none of
this fails the gate. `@dorado/client` is unaffected: `useProfitBreakdown` only
passes `ProfitBreakdown` through as a type parameter.

One file reads the old shape and must be rewritten in the frontend pass:

**`frontend/features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/
adminPurchaseOrderDrawerContents/viewProfitBreakdown.tsx`** (259 lines).

- `totals[party][bucket]` indexing is gone - it is
  `shares.filter(s => s.party === party && s.category === bucket)`.
- `m.gold / m.silver / m.platinum / m.palladium` are gone, and so is its own
  `METALS: MetalLabel[] = ['Gold','Silver','Platinum','Palladium']` list and
  the four-way `if (label === 'Gold') …` dispatch. It should render the rows it
  is given: a metal is present when the order has one.
- `totals[party].shipping_net / refiner_fee_net / spot_net / total_profit` are
  on the party row - `parties.find(p => p.party === party)`.
- Its `bucketTotal` for a non-total bucket sums four metal `profit`s by hand;
  the sum of that bucket's rows for that party replaces it. For the `total`
  bucket it already reads `total_profit`, which is unchanged.
- Nothing else in the frontend touches the breakdown:
  `frontend/features/quotes/queries.ts` re-exports the hook,
  `frontend/features/orders/purchaseOrders/types.ts` mentions it only in a
  comment, and `frontend/app/admin/page.tsx`'s "Profit and Loss" tab is a
  literal `TODO`.

## 6. Gate ratchets that moved, and why

Deleting one file from a domain directory moves six lint floors and one
coverage threshold. Each was set to the MEASURED value afterwards.

| gate | before | after |
|---|---|---|
| `lint:no-literal-views` floor | 269 | 268 |
| `lint:type-homes` floor | 139 | 138 |
| `lint:no-throw-in-services` floor | 73 | 72 |
| `lint:domain-errors` floor | 92 | 91 |
| `lint:one-catch` floor | 169 | 168 |
| `lint:no-column-arrays` floor | 139 | 138 |
| coverage, domains `functions` | 90 | 89 |

`lint:pricing-owner` does not move: it scans the files OUTSIDE `pricing/`, and
302 of them are still there.

**The coverage drop is arithmetic, not a regression, and it was measured both
ways rather than assumed.** `pricing/profit.ts` carried 34 functions at
**34/34 covered**. Deleting a block that far above the population's own average
drags the average down: the nine domain folders were **812/901 = 90.12%**
before and are **778/868 = 89.63%** after. No function that exists in both
trees lost a caller. Statements (86.15), branches (73.73) and lines (88.35) all
still clear their unchanged floors.

## 7. The gate

`pnpm check`: every member green except two, neither of them this lane's.

- **`figma:inventory`** - 12 findings, Jacob's, pre-existing and ignored.
- **`api:verify:genesis`** - `000_genesis_schema.sql` does not match dev's
  `auth.mirror_identity_to_exchange`. This lane changed no migration
  (`git diff HEAD -- api/migrations` is empty) and `verify-genesis.mjs` reads
  only `#env`, `#pool`, `scripts/lib/schemas.ts` and that one file, so its
  answer here is bit-for-bit what it is at the branch tip. Its own prescribed
  fix (`pnpm --filter @dorado/api dump:schema`) rewrites a migration, which is
  out of scope here.

`api:verify:genesis` is the third step of the serial `dev-db` group, so the
eight members after it never ran inside `check`. They were run individually and
**all eight pass**: `verify:backfill`, `validate:wire`, `audit:coverage`,
`audit:indexes`, `audit:query-paths`, `audit:constraints`, `audit:non-finite`,
`audit:nullability`. `validate:wire` is the one that matters most here - it
runs the new read against the DEV database and parses the answer through
`ProfitBreakdown`, refusing any field no contract declares.

`lint:pricing-owner --self-test`, `lint:no-literal-views --self-test` and
`lint:type-homes --self-test` all pass. The API suite is **234 files, 1334
tests, 1 skipped, green** (1331 before).

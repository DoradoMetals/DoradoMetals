# Ruling 78 is a lint now, and the sweep it demanded is done (2026-09-06)

Jacob, 2026-09-05: *"that calculateSalesOrder dictionary thing is tragic to look
at. We shouldn't be doing anything like that ever. The only thing we care about
from legacy code is the logic. The code itself? Fully comfortable throwing
away."*

Ruling 78 as recorded: **no result dictionaries, no maps stitched in TS, no
return-shape or param spreading; a view is one SQL read parsed by its contract
(rulings 71/73); rewrite from the inputs inward.** `docs/waves/pricing.md` and
`docs/waves/profit-sql.md` are the two rewrites that did it by hand. This is the
lint that keeps it done, and the sweep of everything the lint found.

## 1. The lint

`api/scripts/lint-no-dictionaries.ts`, wired as `lint:no-dictionaries` and into
`scripts/check.mjs`'s `api-lint` group, following its siblings exactly: the walk
comes from `scripts/lib/layout.ts` (`domainDirs()` + `isTransportFile()`), a
FLOOR asserts the walk saw the real tree, an `ACCEPTED` table pins every
exception both ways with a one-line reason, `--self-test` proves each pattern is
caught AND that a clean file passes, and failures print `file:line` and nothing
else. `--report` prints the census and exits 0; it is what took the numbers
below.

**Population**: every non-test `.ts` file under the nine domain dirs that is not
a transport file (`routes.ts`, `*.routes.ts`, `controller.ts`) and not
`rules.ts`. `rules.ts` is out because a lookup that IS a business rule - a
status ladder, a carrier code map - is exactly what is allowed to be written
down there.

**What it refuses**

| pattern | why |
|---|---|
| `new Map(` / `new WeakMap(` | a dictionary stitched from rows |
| `Map<` / `ReadonlyMap<` in a signature | pass the rows; read one with `.find` |
| `Object.fromEntries(` | rebuilds an object |
| `Object.entries(`/`.keys(` chained into `.map`/`.reduce`/`.flatMap` | rebuilds an object. `Object.keys(x).length` and `.join(", ")` are counting and printing, not rebuilding, and are NOT findings |
| `.reduce(` onto an object or map accumulator | same, spelled differently. `.reduce((a, r) => a + r.n, 0)` is arithmetic and passes |
| `Record<` and `{ [k: string]: … }` | a declared result is a named contract type. `extends Record<…>` is a generic BOUND, not a result shape, and is skipped |
| `{ ...row, … }` in a return or an argument | return-shape and param spreading |
| `f({ a, b }: { a: X; b: Y })` | a parameter object destructured from an inline type (ruling 73) |

18 self-test cases, including four that must PASS: a service passing a contract
type through, `rules.ts` holding the lookup that is the rule, a transport file,
and a dictionary inside a comment. Plus the two guards every sibling carries -
a walk that finds nothing reports `SCAN IS BROKEN` rather than "clean", and the
`--report` mode is proved not to fail.

## 2. The census, before anything was changed

`node scripts/lint-no-dictionaries.ts --report`, 2026-09-06, over **73 files**:
**48 findings in 14 files** (46 unaccepted + 2 accepted).

| file | findings | what they were |
|---|---:|---|
| `media/pdfs/render/sections.ts` | 10 | `DocumentLabels`' two id-to-name Maps, the `priceOf` Map in four row builders, the scrap-name Map |
| `media/pdfs/service.ts` | 7 | five `priceOf` Maps, the `bids`/`asks` Map fields of `PurchaseDocument`/`SalesDocument` |
| `media/pdfs/order-inputs.ts` | 5 | `documentLabels()`, `metalBidsFor()`, the asks Map |
| `logistics/shipping/services/service.ts` | 5 | the insurance-ceiling Map, three Map signatures, `{ ...entry, carrier_id }` |
| `logistics/shipping/shipments/service.ts` | 5 | `getByOrders`' four Maps and its Map return type |
| `logistics/shipping/pickups/service.ts` | 4 | `getByOrders`' three Maps and its Map return type |
| `logistics/fulfillments/shipments/service.ts` | 2 | `{ fulfillment_id, ...columns }` twice |
| `media/emails/utils/renderEmail.ts` | 2 | the asks Map field, the `priceOf` Map |
| `orders/service.ts` | 2 | `{ content: …, ...changes }`, the live-spot Map |
| `identity/auth/anonymous.ts` | 2 | better-auth's plugin contract — **ACCEPTED** |
| `checkout/service.ts` | 1 | `CLEARED = Object.fromEntries(PATCHABLE.map(…))` |
| `orders/spots/service.ts` | 1 | the live-spot Map |
| `payments/details/constants.ts` | 1 | `PAYOUT_METHOD_FEES: Record<string, number>` |
| `payments/details/service.ts` | 1 | `{ ...base, …encrypted }` |

## 3. The sweep, file by file

### The documents are two SQL reads and nothing else

`media/pdfs/*` and `media/emails/*` carried a third bag beside the order view and
the quote: `DocumentLabels` (an ordered metal list plus a service-id Map plus a
package-id Map), a bids Map, an asks Map, and a `priceOf` Map rebuilt in five
places. All of it is gone. **A document is now the order view plus what pricing
answered for it - two SQL reads, each parsed through its own contract.**

- **`db/orders/sql/view.sql` gained three columns** (ruling 80's `product_name`
  is the precedent):
  - `items[].item_name` — what a scrap lot is CALLED, `metal_id || ' Item ' ||
    row_number() OVER (PARTITION BY (bullion_id IS NULL), metal_id ORDER BY id)`.
    That is `scrapItemNames()`'s numbering, exactly, as a window function. A
    product line has `NULL` and is named by `product_name`.
  - `shipments[].service_name` — `shipping.services.name`, one scalar subselect.
  - `shipments[].package_label` — `shipping.packages.label`, one scalar subselect.
  `OrderViewShipmentDetail` is a new contract in `orders/orders.ts`;
  `OrderViewShipment` itself is untouched, so the flat shipment reads that
  return it are unaffected.
- **`db/pricing/sql/order_pricing.sql` gained a `metal_spots` CTE** and
  `OrderPricing.spots` — `{ metal_id, bid, ask }` per metal the order has a line
  in, resolved by the SAME rule the `lines` CTE already used for a line's bid
  (the frozen `orders.spots` row when the order is locked, the live feed when it
  is not), ordered by the metal ladder `db/spots/sql/get_all.sql` already spells.
  `metalBidsFor()` and the frozen-asks read are deleted.
- **Deleted**: `DocumentLabels`, `documentLabels()`, `metalBidsFor()`,
  `scrapItemNames()`, `METAL_ORDER`/`rank()`, the `serviceOf`/`packageOf` Map
  lookups (now `shipment?.service_name || "-"`), and the `bids`/`asks`/`labels`
  fields of `PurchaseDocument`, `SalesDocument` and `RefinerEmailInput`.
- **The per-line price** is read out of the rows pricing answered with:
  `prices.find((p) => p.id === line.id)`, one helper in `sections.ts`. That is
  what `docs/waves/profit-sql.md` §5 settled on when the profit dictionary
  became rows; a handful of lines is not an index.
- **Behaviour that changed, deliberately**: the sales-order invoice and the
  supplier email used to print a row for EVERY metal in `metals.metals`, three
  of them usually `&mdash;`. They now print the order's own metals, which is
  ruling 79/80's line ("a metal appears only when the order has a line in it").
  The sale-side ask also follows the frozen-or-live rule now instead of reading
  frozen rows unconditionally; for a locked sale order that is the same number.

### `logistics/shipping/{shipments,pickups}` — two dead readers, deleted

`shipments.getByOrders` (four Maps) and `pickups.getByOrders` (three) were a
batch order-to-shipment index. `pickups.getByOrders` had **no caller anywhere**,
and `shipments.getByOrders` had exactly one: `pickups.getByOrders`. Both are
deleted, and with them `db/fulfillments/repo.ts` `getByOrders` +
`sql/get_by_orders.sql` and `db/fulfillments/shipments/repo.ts` `getMany` +
`sql/get_many.sql`, whose only callers they were. No test covered any of them.

### `logistics/shipping/services` — the ceiling is a decision, so it lives in rules.ts

`ceilingsByName()` built `Map<name, {id, ceiling}>` and two helpers indexed it.
The rows are the carrier's own `shipping.services`; the DECISION is "a service's
own finite ceiling wins, otherwise the carrier's lowest". That decision is now
`rules.ceilingFor(rows, name)` and `rules.lowestCeiling(rows)` in
`logistics/shipping/rules.ts`, reading the rows with `.find`.
`labelServiceFor`'s `{ ...entry, carrier_id }` is `withDecisions(entry, {
carrier_id })` — `shared/views.ts`' typed `Object.assign`, the one sanctioned
way to add a decision to a parsed view (ruling 71).

### `logistics/fulfillments/shipments` — the link is one upsert

`link()` read the existing row, branched, and spread `...columns` into both
halves. `fulfillments.shipments` already carries
`fulfillment_shipments_one_per_shipment UNIQUE (shipment_id)`, so
`db/fulfillments/shipments/sql/upsert.sql` is `INSERT … ON CONFLICT
(shipment_id) DO UPDATE`. The read, the branch and both spreads are gone, and
the write can no longer race.

### `checkout` — clearing the basket is one statement

`CLEARED = Object.fromEntries(checkouts.PATCHABLE.map((c) => [c, null]))` was an
all-null patch assembled from a column list. `clear_for.sql` names the four
columns where columns belong and keys on `(user_id, direction)`, so
`resetAfterOrder` is one call and the `findFor` read before it is gone.

### `orders/spots` and `orders/service.ts` — locking spots is one statement

Both built `Map<metal_id, bid>` from the live feed and looped an UPDATE per
metal. `db/orders/spots/sql/set_bids_from_feed.sql` does it in one:
`SET bid = CASE WHEN $2 THEN (SELECT s.bid FROM spots.spots s WHERE s.metal_id =
os.metal_id) ELSE NULL END`. The feed is `spots.spots`, the same table
`getSpotPrices` reads, so nothing external moved.

`editLine`'s `{ content: fineContent(…), ...changes }` is two named patches now:
`changes` as the caller sent it, then `{ content }` derived from the row that
resulted. `fineContent` stays in `shared/utils/convertWeights.ts` — the pricing
lane put it there on purpose because it is a weight fact, not a price.

### `payments/details` — one dead file, one two-step write

`constants.ts` (`PAYOUT_METHOD_FEES`, `isPayoutMethod`, `payoutFee`) had **no
importer at all**: `docs/waves/pricing.md` replaced it with
`payments.methods.flat_fee` and left the file behind. Deleted.

`saveCheckoutPayout`'s `{ ...base, …encrypted }` was one write spreading
another's shape. The envelope's AAD is the row's own id, so the row must exist
before the numbers can be sealed: it is `create`-or-`update` with `base`, then
one `update` naming only the two encrypted columns. `buildUpdate` leaves out
what a patch does not carry, so nothing else is touched.

## 4. ACCEPTED — one file, two findings

| file | count | reason |
|---|---:|---|
| `identity/auth/anonymous.ts` | 2 | better-auth's own plugin contract - the `{ data: user }` hook shape and the plugin object are the library's, not ours |

`fillMissingRole` must answer better-auth's `databaseHooks.user.create.before`
in the shape better-auth defined, and `withoutAnonymousCustomers` must hand
better-auth back a plugin object. Neither shape is ours to name in SQL. Its
`<T extends Record<string, unknown>>` is a generic BOUND and the lint does not
count it.

## 5. Census after

**72 files, 0 unaccepted findings, 2 accepted in 1 file.** The population lost
one file (`payments/details/constants.ts`).

## 6. Ratchets, re-measured — never lowered to pass

Deleting one domain file moves five floors by exactly one. Each is set to the
MEASURED population afterwards, and each was confirmed by watching the lint's
own "SCAN IS BROKEN"/"fewer files" message name the new number first.

| gate | before | after |
|---|---:|---:|
| `lint:type-homes` file floor | 138 | 137 |
| `lint:domain-errors` floor | 91 | 90 |
| `lint:one-catch` floor | 168 | 167 |
| `lint:no-column-arrays` floor | 138 | 137 |
| `lint:no-literal-views` floor | 268 | 267 |
| `lint:no-dictionaries` floor | — | 72 (new) |

Three ACCEPTED counts SHRANK, which is the only direction they may move:

| lint | entry | before | after |
|---|---|---:|---:|
| `lint:type-homes` | `media/pdfs/render/sections.ts` | 2 | 1 |
| `lint:no-literal-views` | `media/pdfs/order-inputs.ts` | 6 | 5 |
| `lint:no-literal-views` | `logistics/shipping/services/service.ts` | 3 | 2 |

`lint:pricing-owner`, `lint:db`, `lint:input-shapes`, `lint:row-vs-list`,
`lint:test-locks` and `lint:test-actor` did not move. Every `--self-test` of
every lint touched still passes and still proves what it proved
(no-dictionaries 18, type-homes 14, no-literal-views 7, no-column-arrays 11,
one-catch 13, domain-errors 8, no-throw-in-services 7).

## 7. Tests

**1347 tests across 237 files, green** (1344 before). Three tests were added and
one was rewritten; none of the deleted code had a test of its own.

- `db/orders/tests/view.test.ts` — a scrap line is named by the SQL read and
  numbered per metal (`Gold Item 1`, `Gold Item 2`, `Silver Item 1`) while a
  product line is not; a shipment's `service_name` and `package_label` are the
  `shipping.services` / `shipping.packages` rows' own values, read back from the
  database in the same transaction.
- `pricing/tests/order-pricing.test.ts` — the quote carries the order's own
  metals and no others, takes the live feed's bid while unlocked, and its own
  frozen bid AND ask once locked.
- `media/pdfs/tests/service.test.ts` — the sales-order invoice test used to pin
  an `asks` Map with a hand-picked metal. It now pins the NUMBERS through
  `pricing.spots`: every ask null renders `&mdash;` and no `NaN`, one ask at
  4000 renders `$4,000.00`.
- `media/emails/tests/renderEmail.test.ts` and
  `media/pdfs/tests/documents-agree.test.ts` follow the same shape change; the
  latter keeps its real assertion (the packing list and the invoice quote the
  same premiums for every scrap order in dev) unchanged.
- `logistics/fulfillments/tests/unit.test.ts` swaps `shipments/get_many` for
  `shipments/upsert` in its statement inventory; the count it floors on is
  unchanged.

## 8. Coverage

**No coverage threshold moved.** `pnpm check` runs `test:coverage`, and the
domains key (`{catalog,checkout,crm,identity,logistics,media,orders,payments,
pricing}/**` at 86 / 73 / 89 / 88) still passes untouched, as do `db/**` and
`shared/**`. The one deleted domain file, `payments/details/constants.ts`, had
**no importer at all**, so it contributed zero covered functions to the average
- removing it can only raise the domain numbers, never lower them, which is why
nothing needed re-flooring. All files: 86.16 / 74.05 / 89.93 / 88.55.

## 9. The gate

`pnpm check` from the worktree root, 2026-09-06: **every member green except
two, neither of them this lane's.**

- **`figma:inventory`** - 12 findings in `packages/components`, Jacob's,
  pre-existing and ignored.
- **`api:verify:genesis`** - `000_genesis_schema.sql` does not match dev's
  `auth.mirror_identity_to_exchange`, which is DEV BEING BEHIND ITS OWN CHAIN
  (migration 122 creates it) and is already recorded that way in FOLLOWUPS'
  "Orders pass 2" entry. This lane changed no migration -
  `git diff HEAD -- api/migrations` is empty - and the script reads only
  `#env`, `#pool`, `scripts/lib/schemas.ts` and that one file, so its answer
  here is what it is at the branch tip.

`api:verify:genesis` is the third step of the serial `dev-db` group, so the
eight members after it never ran inside `check`. **They were run individually
and all eight pass**: `verify:backfill`, `validate:wire`, `audit:coverage`,
`audit:indexes`, `audit:query-paths`, `audit:constraints`, `audit:non-finite`,
`audit:nullability`. `validate:wire` is the one that matters most here - it
parses real dev responses through the contracts and refuses any field no
contract declares, which is what proves `item_name`, `service_name`,
`package_label` and `OrderPricing.spots` reach the wire correctly.

Two gates caught real regressions of this lane's own making, both fixed:

- **`lint:namespace-calls`** read `catalogue.services.find(...)` as a call on
  the `services` repo namespace. The local is `offeredServices` again, as it
  was before.
- **`audit:silent-mutations`** went 14 -> 16, because two writes that used to
  run through `buildUpdate` (which the audit cannot resolve to a SQL file) now
  run through named `.sql` files it CAN. Neither statement is newly silent -
  they were always silent and newly visible. `setBidsFromFeed` is observed:
  a zero-row reprice now calls `reportError`, the D202 pattern. `clearFor` has
  an ACCEPTED entry, because a user with no basket in that direction has
  nothing to clear and the early return it replaced said exactly that. Back to
  **14, the unchanged ceiling**, with 2 accepted.

## 10. Frontend (out of scope, ruling 44)

`pnpm check` does not typecheck or build `frontend`, so none of this fails the
gate. Shapes that moved and will need the one frontend pass:

- `OrderView.items[]` gains `item_name`; `OrderView.shipments[]` gain
  `service_name` and `package_label`. Both are ADDITIONS - nothing was removed,
  so no existing reader breaks.
- `OrderPricing` gains `spots: [{ metal_id, bid, ask }]`. An addition as well.
- No route, no URL and no request body changed.

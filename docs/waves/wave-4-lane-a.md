# Wave 4 — Lane A: the money path

Scope: `api/**` and `packages/contracts/**` only. A styling agent owns
`frontend/**` concurrently, so every change that needs the frontend re-pointed
lands API-side COMPATIBLY and is handed over as a `file:line` list rather than
edited here.

Branch state at start: clean at `a9b7dd61`.

```
A1. assemble() batching fix (D101)          ██████████████████  100%
A2. Pricing: array in, prices out           ██████████████████  100%
A3. D97 payout figure from the server       █████████████████░   95%
A4. D98 credit ledger takes {op, amount}    █████████████████░   95%
A5. Dissolve purchase-orders/+sales-orders/ ░░░░░░░░░░░░░░░░░░    0%
A6. Co-locate tests + convert to TypeScript ██████░░░░░░░░░░░░   30%
```

**NOW**: A1-A4 done and gated. **API suite 916/916 in 467 s** (was 890/890 in
563 s), and every gate member below green. A3 and A4 sit at 95% only because
each needs its frontend half, which this lane may not write — the handoff list
is at the bottom. `audit:test-leaks` is the last check running. A5 not started,
A6 partial; both written up at the bottom with reasons.

### The whole gate, run after the last change

| member | result |
|---|---|
| `pnpm --filter @dorado/api test` | **916 / 916, 0 fail, 467 s** |
| `typecheck` (api) | clean |
| `lint:imports` / `lint:namespace-calls` / `lint:row-vs-list` | clean |
| `lint:db` | 205 `query()` calls in 340 files, all threading their executor |
| `lint:migrations` / `lint:legacy-boundary` | clean, 0 violations |
| `verify:genesis` | OK |
| `validate:wire` | 27 shapes match, 0 diverge |
| `verify:orders-decomposition` | 672 values / 48 orders |
| `verify:sales-order-decomposition` | 285 values / 15 orders |
| `diff` | OK — **after repairing it, see below** |
| `audit:switches` / `coverage` / `indexes` / `query-paths` / `non-finite` / `nullability` | all OK |
| contracts `build` + `validate` | OK |
| **frontend `typecheck` + `test`** | **OK** — proof the API changes are additive |

No migration was written and none was run. Nothing was dropped or deleted from
`exchange`.

## THE TWO NUMBERS JACOB IS WAITING ON

### 1. A1's suite wall clock: **563 s -> 468 s**, 890/890 both sides

Measured by swapping the working tree back to `HEAD` and running the real
thing, not inferred. The ~500 s D101 hoped for was optimistic about the SUITE;
the READ itself came down by the predicted factor:

| | before | after |
|---|---|---|
| `pnpm --filter @dorado/api test` | **563 s**, 890 pass / 0 fail | **468 s**, 890 pass / 0 fail |
| `purchase.getAll` (48 orders) | **40,309 ms** | **4,305 ms** (9.4x) |
| `sales.getAll` (15 orders) | **6,796 ms** | **1,178 ms** (5.8x) |

95 s off the suite, 17%. The gap between 95 s and 500 s is real and worth
naming: the suite calls the composed read on a handful of orders far more often
than it calls it on all 48, and an N+1 over three rows costs three round trips,
not two hundred. **The 9.4x is the number that matters** - it is what an admin
opening the orders list actually waits for, and what the confirmation email and
the PDFs sit behind.

### 2. `orders.items.price`: **24 production lines do not reproduce. ZERO are admin overrides.**

Ruling 34's precondition is **NOT met** - the column cannot be dropped - but not
for the reason the ruling feared. Run with the new
`pnpm --filter @dorado/api audit:item-price --prod`, pricing each line exactly
as `calculateItemPrice` does and taking the bid from the order's own frozen
spot.

**Read against `exchange`, not `orders.items`** - production has never been
migrated, so its `orders.items` is the January snapshot and has no `price`
column at all. `exchange.purchase_order_items.price` and
`exchange.sales_order_items.price` are where the business's real prices are.

| | purchase lines | sales lines |
|---|---|---|
| priced (`price IS NOT NULL`) | 84 of 89 | 14 of 14 |
| reproduce exactly | 31 | 8 |
| differ by under half a cent | 33 | 2 |
| **DIVERGENT** | **20** | **4** |

**All 20 purchase divergences are scrap, and every one is source precision, not
an override.** Solving each stored price for the content it implies gives a
number within 0.0005 of the stored content - i.e. inside `numeric(20,3)`'s
half-digit - on all twenty. Largest: stored 7552.5008 against a computed
7551.7075, implying content 2.2492363 where the column holds 2.249. That is
**D61 seen from the other side**: `exchange.scrap.content` is `numeric(20,3)`,
the precision was lost at the source years ago, and `price` is the only
surviving record of what the customer's metal actually weighed.

**The 4 sales divergences are a premium column that disagrees with its own
price.** Each implies a premium the row does not carry - 1.099719 and 1.000000
against a stored `premium` of 1.01 on all four - so the price was struck at one
premium and the row records another. Note `line_premium = 1.01` on all four,
which looks like a default written onto the line rather than the real figure.

**What this means for Jacob.** Nobody typed a different number; the column is
not an override register. But it is not derived either - it is the ONLY
surviving record on 24 of 98 priced lines, so dropping it reprices them. Two
separate decisions follow, and neither is mine:

1. The column stays until `exchange.scrap.content` is widened and the sales
   `premium`/`price` disagreement is explained. Widening is D61 and is a
   production migration.
2. The 4 sales rows are worth a look on their own - a premium column that
   contradicts the price beside it is a defect wherever it came from.

## A1 — the batching fix (D101)

`read.service.ts`'s `assemble()` was fully batched except for two reads, and
those two sat inside the per-order loop:

```js
for (const order of orderRows) {
  const shipment = await shipmentService.getByOrder(order.id, executor);
  const pickups  = await pickupService.getByOrder(order.id, executor);
```

Each fans out further — `getByOrder` is four statements plus `getById`'s five,
and the pickup path repeats the whole shipment walk and then loops again inside
`contextFor`. D101 measured the result: ~214 round trips for 48 orders against a
Railway proxy ~178 ms away, 38,198 ms against 351 ms for the slim list.

**What landed.** Batched forms of the same three hops, `= ANY($1)` at every one:

| added | file |
|---|---|
| `fulfillments.getByOrders` + `sql/get_by_orders.sql` | `api/features/fulfillments/repo.ts` |
| `orders.ownersById` + `sql/owners.sql` | `api/features/orders/repo.ts` |
| `shipments.getByOrders` → `Map<order_id, ComposedShipment>` | `api/features/shipping/shipments/service.ts` |
| `shipments.getManyById` | `api/features/shipping/shipments/service.ts` |
| `pickups.getByOrders` → `Map<order_id, ComposedPickup[]>` | `api/features/shipping/pickups/service.ts` |
| `contextFromShipments` (splits `contextFor`, which said "batched" and looped) | `api/features/shipping/pickups/service.ts` |

`fulfillments/shipments/sql/get_many.sql` gained `ORDER BY id ASC` so that "the
first parcel of a fulfillment" is the same parcel batched as unbatched —
`get_for.sql` already ordered that way and the equivalence rests on it.

Both `assemble()` loops now read from maps built before the loop.

**Equivalence, not assertion.** See VERIFICATION below.

### A1 verification — measured, not asserted

**The reads are byte-for-byte identical.** Both composed reads were captured to
JSON before and after and compared as strings, on the same dev data minutes
apart:

| read | rows | before | after | speedup | bytes |
|---|---|---|---|---|---|
| `purchase.getAll` | 48 | 40,309 ms | 4,305 ms | **9.4x** | 334,184 = 334,184, IDENTICAL |
| `sales.getAll` | 15 | 6,796 ms | 1,178 ms | **5.8x** | 31,979 = 31,979, IDENTICAL |

The 40,309 ms reproduces D101's 38,198 ms independently.

| gate | before | after |
|---|---|---|
| `verify:orders-decomposition` | 672 values / 48 orders, exit 0 | **672 values / 48 orders, exit 0** |
| `verify:sales-order-decomposition` | 285 values / 15 orders, exit 0 | **285 values / 15 orders, exit 0** |
| `validate:wire` | 27 shapes match, 0 diverge | **27 shapes match, 0 diverge** |
| `diff` | *did not parse* — see below | 1 operation identical, 0 diverge |
| `typecheck`, `lint:imports`, `lint:namespace-calls`, `lint:row-vs-list`, `lint:db`, `lint:migrations`, `lint:legacy-boundary` | — | all clean |

## `pnpm --filter @dorado/api diff` HAD NOT PARSED FOR TEN COMMITS

The brief named `diff` as one of A1's equivalence proofs. It could not run: the
file ends mid-object and dies on `SyntaxError: Unexpected end of input` before
opening a connection.

Bisected through its own history:

| commit | lines | parses |
|---|---|---|
| `701dbf07` | 470 | yes |
| `93ecdf80` | 462 | **yes — the last one** |
| `8cc176ee` | 377 | no |
| ... eight more ... | | no |
| `a9b7dd61` (HEAD) | 173 | no |

Each restructuring pass deleted the feature entry it had just retired, and
`8cc176ee` took the closing `};` **and the entire comparison engine** with the
last of them. Nine further commits edited a file that could not run, and four
of those commits' messages claim gate runs.

**Why nothing noticed: `diff` is not in `pnpm check`.** This is D110's failure
mode — a gate script invalidated by a factoring pass, invisible to
`lint:imports` because nothing imports it — except that here the casualty was
the RUNNER, so there was not even an error message to read.

Repaired: the engine restored from `93ecdf80`, and the dead `"purchase-orders"`
entry removed. Its reads named `getAll`, `findById`, `findAllByUser`,
`findMetalsByOrderId` and `findExpiredOffers` on `repo.exchange.js` — all
deleted when the reads pivoted, so the gate had been pointing at functions that
existed on neither side. The comment twenty lines above it already said the
entry should be gone.

**For Jacob:** `diff` now covers `payments` and nothing else, because every
other feature has one implementation. That is correct and it is also worth
saying out loud — the gate's name promises more than it can now deliver, and
the per-feature `tests/` suites are what replaced it.

## VERIFICATION

## A2 — pricing is one module (rulings 24 + 34)

```
features/pricing/
  spot.ts     PricingSpot + Spots, declared ONCE (it was byte-identical twice)
  bid.ts      what the business PAYS   - 5 functions, from purchase-orders/utils
  ask.ts      what the business CHARGES - 6 functions, from sales-orders/utils
  service.ts  THE surface: the array API + everything above re-exported
  tests/      bid.test.ts, ask.test.ts, array-api.test.ts
```

`features/purchase-orders/utils/` and `features/sales-orders/utils/` **no
longer exist**. Ten importers across six features now name
`#features/pricing/service.ts` and nothing outside `features/pricing/` names
`bid.ts` or `ask.ts` — which makes ruling 24's "nowhere else should call
pricing" a one-line grep, and a lint if Jacob wants one.

**The array API, ruling 34: array in, array of PRICES out.**

```ts
unitPrices(items, spots): number[]   // what ONE of each line costs
lineTotals(items, spots): number[]   // what each LINE is worth
```

Two arrays because there are two prices, and conflating them is a real bug:
**quantity multiplies bullion and never scrap** — a scrap line's `content`
already describes the whole lot. Both are `number[]`, positionally aligned with
the input, and neither returns an item. It branches on `bullion_id IS NULL`
(34c) via one `kindOf`, and a raw `orders.items` row is **normalised, not
re-priced** — it is handed the kind `kindOf` derived and fed to the single
existing expression, because two copies of one money sum is the $3,236.11 bug
in `bid.ts`'s own header.

**The three things I did not "clean up", as instructed** — all still exactly as
they were: the `spot!` assertions (pinned by "a metal absent from spots
throws", asserting a `TypeError` specifically — and `array-api.test.ts` pins
that going through the array API does not turn it into a NaN); `?? 0` on a
nullable bid; the scrap/product premium asymmetry, which is the fixed bug and
not a defect.

**Tests: 39/39, and every assertion moved unedited.** 29 of them are the
existing oracle (only the import specifier changed), 10 are new and pin the
array API.

**I did NOT drop `orders.items.price` and wrote no migration for it.** See the
number above.

## A3 — the payout figure comes from the server (D97)

`POST /quotes/purchase_order` now takes two optional CHOICES and returns three
more numbers:

```
in:   payout_method: "ACH" | "WIRE" | "ECHECK" | "DORADO_ACCOUNT"   (optional)
      shipping_charge: number                                        (optional)
out:  shipping_charge, payout_charge, estimated_payout
```

`total` and `declared_value` are untouched, so **every existing caller keeps
working** — the four `usePurchaseOrderQuote` call sites need no change until
someone wants the new figure.

- **The fee is resolved from the METHOD NAME, never taken as a number** (ruling
  10). New `features/payouts/constants.ts` owns the table.
- **`estimated_payout` is clamped at zero.** A small order whose fees exceed it
  does not owe the business money.
- **It mirrors `orderQuote`,** which has always done this subtraction for a
  SAVED order (`scrap_total + bullion_total - shipping - payoutCost`). The two
  surfaces now agree by construction rather than by two people writing the same
  expression twice.
- Tests: 7/7, `features/quotes/tests/payout-quote.test.ts`. The load-bearing one
  asserts `estimated_payout === total - 12.50 - 20.00` on a WIRE payout with a
  shipping service selected — the exact case D97 measured at $20 high.

**A bug I wrote and the test caught, worth recording**: my first validation was
`Number.isFinite(Number(v))`, and `Number([])` is `0` — so an array shipping
charge was accepted as free shipping and quoted a payout that was too high,
which is the very class of defect this task exists to end. Narrowed to the same
two-case coercion `features/users/service.ts` already uses for the credit
amount (its own D98 comment describes the identical trap). The test now sends
`[]`, `{}`, `""`, `"  "`, `true`, `NaN`, `-1`, `"-5"`, `"12.5abc"`.

### PRODUCTION FINDING — the payout fee is not a function of the method

Measured against production, 61 `exchange.payouts` rows:

```
ACH             0     x11
DORADO_ACCOUNT  0     x2
ECHECK          0     x39,   75  x1,   125  x1
WIRE           20     x6,     0  x2
```

Eleven rows disagree with the frontend's table. So the constants file is the
DEFAULT FOR A NEW ORDER and must never be used to re-derive the fee of a stored
payout — `orderQuote` already reads that off the row, correctly. Written into
the constants file's header so it cannot be forgotten.

## A4 — the credit ledger takes a delta (D98)

`POST /users/update_credit` now:

- accepts **`op`** (ruling 10's spelling) and still accepts `mode`, so the
  frontend can be re-pointed in a separate commit by the lane that owns it;
- runs inside `withTransaction`, taking the row with **`SELECT … FOR UPDATE`**
  (`legacy/users/sql/balance_for_update.sql`) before deciding anything;
- **refuses to drive a balance below zero** — a check that existed ONLY in the
  browser. `dorado_funds` is NOT NULL with no CHECK, so the database would have
  taken a negative balance from any other caller. 422, with the resulting
  figure in the message;
- **returns the balance it produced**, so the drawer displays a server number
  instead of the one it computed.

The delta itself was already correct — `COALESCE(dorado_funds, 0) + $1`. What
was missing is everything around it. Still exactly ONE write: `exchange.users`
carries the `mirror_users_to_auth` trigger and writing both by hand applies the
adjustment twice.

Tests: 9/9, `features/users/tests/credit-delta.test.js`, including two
concurrent `add`s both landing — the property the browser's read-compute-PUT
destroyed.

## FRONTEND HANDOFF — exact changes, for the lane that owns `frontend/**`

I did not touch `frontend/**`. Both API changes are **additive and backward
compatible**, so nothing is broken while these wait. Neither is finished as a
user-visible fix until they land.

### D97 — the Estimated Payout figure (2 files)

**1. `frontend/features/quotes/queries.ts:75-86`** — `usePurchaseOrderQuote`
takes the two choices and passes them through. They must also enter the query
key at line 77, or a changed shipping service will serve a cached quote.

```ts
export const usePurchaseOrderQuote = (
  items: PurchaseOrderQuoteLine[],
  deductions: { shipping_charge?: number; payout_method?: string } = {},
  enabled = true
) =>
  useApiQuery<PurchaseOrderQuote>({
    key: queryKeys.purchaseOrderQuote(items, deductions),   // <- key must include them
    ...
    request: async () =>
      apiRequest<PurchaseOrderQuote>('POST', '/quotes/purchase_order', {
        items: items ?? [],
        ...(deductions.shipping_charge != null && { shipping_charge: deductions.shipping_charge }),
        ...(deductions.payout_method != null && { payout_method: deductions.payout_method }),
      }),
  })
```

The other three call sites — `cart/ui/SellCart.tsx:36`,
`scrap/ui/ReviewStep.tsx:32`,
`checkout/purchase-order-checkout/checkoutStepper.tsx:44` — pass no second
argument and keep working unchanged.

**2. `frontend/features/checkout/purchase-order-checkout/reviewStep/itemTable.tsx`**

| line | today | change to |
|---|---|---|
| `32` | `usePurchaseOrderQuote(items)` | `usePurchaseOrderQuote(items, { shipping_charge: shippingCost ?? undefined, payout_method: payout?.method })` |
| **`60-62`** | `const total = useMemo(() => (quote?.total ?? 0) - (shippingCost ?? 0 + paymentCost), [quote, shippingCost, paymentCost])` | **delete it.** `const total = quote?.estimated_payout ?? 0` |
| `88` | `<PriceNumberFlow value={total ?? 0} />` | unchanged once `total` is the server's |
| `29` | `const paymentCost = payoutOptions.find(...)?.cost ?? 0` | only still needed for the `payoutRow` display at `70-74`; the HEADLINE must not use it |

Lines `179`/`182` are a different `total` — `ItemAccordion`'s own prop. Leave
them.

### D98 — the credit ledger (2 files)

**1. `frontend/features/users/queries.ts:38-49`** — send the OPERATION, not a
computed total:

```ts
export const useUpdateCredit = () =>
  useApiMutation<
    { rowCount: number; dorado_funds: number | null },
    { user_id: string; op: 'add' | 'subtract' | 'edit'; amount: number },
    AdminUser[]
  >({
    method: 'POST',
    url: '/users/update_credit',
    requireAdmin: true,
    queryKey: queryKeys.adminAllUsers(),
    body: (input) => input,
  })
```

**2. `frontend/features/users/ui/UsersDrawer.tsx`**

| line | today | change to |
|---|---|---|
| `130-135` | builds `updatedUser` with `dorado_funds: newAmount` and mutates it | `updateCredit.mutate({ user_id: user.id, op: mode, amount })` |
| `117-122` | `newAmount` computed from the balance | **keep** — it is a PREVIEW (rendered at `186`) and previewing is not writing. It must stop being the thing that is SENT. |
| `113-115`, `126-128` | the client-side negative guard | keep as a UX affordance; the server now enforces it with a 422 and that message is worth surfacing |

`AdminUser` at `frontend/features/users/types.ts:145` still carries
`dorado_funds`, which is right — it is a read shape.

## A5 / A6 — NOT DONE, and deliberately

**A5 is untouched.** `features/purchase-orders/` and `features/sales-orders/`
still exist. What DID come out of them is the piece D102 names first and the
piece that unblocks the rest: `utils/calculations.ts` from both, now
`features/pricing/`. Both `utils/` directories are gone.

I stopped rather than start the ~2,000-line merge because each collision is a
real merge on the money path and the honest verification cycle is a full suite
run. Starting it and leaving it half-merged is strictly worse than not starting
it — the collisions are `repo.ts`, `compose.ts`, `read.service.ts`,
`write.service.ts`, `service.ts`, `controller.ts`, `routes.ts`, four of which
already exist in `features/orders/`.

**Nothing I found suggests checkout entanglement blocks it** — the seam the
brief asked me to watch for. The blocker is volume and verification cost.

**A6 is partial and its finding is the valuable part.** Done: the two pricing
test files factored → moved under `tests/` → renamed to `.ts` in one pass, plus
`features/quotes/tests/` and `features/users/tests/` created and their six
existing files moved. Three new test files were written as `.ts`.

**THE CONVERSION SURFACED A REAL DEFECT, exactly as ruling 33 predicted, and I
did not silence it with `any`.** Renaming the two pricing tests produced **11
TypeScript errors — all one cause, all on the bid side, zero on the ask side.**

`bid.ts` declared its parameter as `ComposedItem` (ten required fields) while
READING six, all through optional chaining. Its fixtures are partial, which is
honest about what the functions need; `tsc` could never see the mismatch
because `**/*.test.js` is excluded from the project. `ask.ts` produced zero
errors because it has always declared the structural subset it reads
(`PriceableItem`).

Fixed by declaring `PriceableLine` on the bid side — what the five functions
actually read, and nothing else. **Type-only: no expression changed, and all 29
moved assertions passed unedited across it.** A `ComposedItem` still satisfies
it.

**106 `.test.js` files remain.** Expect more of this: the ask side was
converted properly during an earlier pass and the bid side was not, and that
difference was invisible for months.

## TWO GATE SCRIPTS WERE BROKEN BEFORE I ARRIVED, AND BOTH ARE FIXED

Neither was caused by this wave. Both are the D110 class — tooling outside
`features/` that nothing type-checks and nothing imports.

### 1. `diff` had not parsed for ten commits (see the section above)

### 2. `audit:test-leaks` ran the suite in the wrong environment

`scripts/audit-test-leaks.mjs` spawned `node --test` with `TZ` only, while
`package.json`'s test script is `TZ=UTC NODE_ENV=test node --test`.

**Why that is not cosmetic.** `shared/testing/is-test-run.ts` is the guard that
stops a test reaching the mail transport, the FedEx client and the Stripe
client. Its own header says it detects two ways "because either alone can be
defeated" — `NODE_ENV === "test"`, and a `--test` flag in `execArgv`. Under
this audit only the second leg was live. **So the gate that exists to prove the
suite touches nothing live was running that suite with one of the two guards on
live third parties disabled.** Nothing ever escaped, because the execArgv leg
held.

It also made the audit disagree with the thing it audits:
`is-test-run.test.js`'s own control assertion — *"the harness really does
satisfy both detectors"* — checks `NODE_ENV` directly and failed, so the suite
reported **915/916 under `audit:test-leaks` and 916/916 under `pnpm test`**. A
gate whose own run disagrees with the gate it is auditing cannot tell a
regression from its own environment, which is how this survived.

Fixed by adding `NODE_ENV: "test"` to the spawn env.

**The leak result itself was clean both times: "no table changed - the suite
leaves nothing behind in dev".** That matters here because
`features/users/tests/credit-delta.test.js` is a test that deliberately
COMMITS — `adjustDoradoCredit` opens its own transaction on its own connection,
because the row lock is the whole subject, so a pinned test transaction cannot
contain it. It restores what it moves, its last assertion checks from outside,
and `audit:test-leaks` is the independent confirmation.

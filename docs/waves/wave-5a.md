# Wave 5A — dissolving the two direction-named features

Scope: `api/features/{purchase-orders,sales-orders,orders,pricing}/**`,
`api/legacy/**`, `packages/contracts/**`, `frontend/features/orders/**`.
Both halves of every feature listed, api AND frontend (D114).

Branch state at start: clean at `a2599311`.

```
1. Dissolve purchase-orders/+sales-orders/  ██████████████████  100%
2. Tests -> tests/, converted to TypeScript ███████████░░░░░░░   60%
3. Checkout creates seam (report only)      ██████████████████  100%
```

**NOW**: `api/features/purchase-orders/` and `api/features/sales-orders/`
**DO NOT EXIST**. Every source file merged into its real home; every lint,
audit and gate script green; **the full suite ran 922 tests with 2 failures,
both mine, both mechanical, both fixed and re-verified**. Task 2's move half
is complete (28 test files co-located under `features/orders/tests/`) and
**5 of 28 are converted to TypeScript, which found two real defects**. The
confirming suite run is back: **934 tests, 934 pass, 0 fail, 498 s**.

## Task 1 — the dissolution, file by file

Eleven merges. Each one was followed by `typecheck` + `lint:imports` +
`lint:namespace-calls`; the four gate scripts that import application code were
re-run at the end (D110's habit).

| was | is now | what the merge cost |
|---|---|---|
| `purchase-orders/legacy.repo.ts` + `sql/legacy/` | `legacy/purchase-orders/repo.ts` + `sql/` | nothing |
| `sales-orders/legacy.repo.ts` + `sql/legacy/` | `legacy/sales-orders/repo.ts` + `sql/` | nothing |
| `purchase-orders/repo.exchange.js` | `legacy/purchase-orders/repo.exchange.js` | **cut one runtime edge** — see below |
| `purchase-orders/compose.ts` + `sales-orders/compose.ts` | `features/orders/compose.ts` | `composeItem`/`composeOrder` -> `compose{Purchase,Sales}{Item,Order}` |
| `*/read.service.ts` | `features/orders/read.service.ts` | `getAll`/`findById`/`findAllByUser` -> six direction-named exports; the four reference reads (users, addresses, products, metals) were byte-identical duplicates and are now ONE declaration |
| `*/repo.next.ts` | `features/orders/repo.mirror.ts` | `.next` is switch-era vocabulary and there is no switch; the mirrors are direction-named |
| `*/repo.ts` | `features/orders/repo.ts` | `createOrder` -> `create{Purchase,Sales}Order`; the four sales creation writes joined it |
| `purchase-orders/repo.dual.js` | `features/orders/repo.dual.js` | binding renamed to `legacyExchange` (lint:legacy-boundary rule 2) |
| `*/write.service.ts` | `features/orders/write.service.ts` | `insertOrder` -> `insert{Purchase,Sales}Order` |
| `*/service.ts` | `features/orders/service.ts` | **six collisions**, all renamed on BOTH sides |
| `*/controller.ts` + `*/routes.ts` | `features/orders/controller.ts` + `creates.routes.ts` | two `createReview`s -> `create{Purchase,Sales}Review` |
| `*/sql/` | `features/orders/sql/` | `create.sql` x2 -> `create_purchase.sql` / `create_sales.sql` |
| 22 `*.test.js` | `features/orders/tests/` | ruling 31; six more moved from `features/orders/` itself |

**THE SIX COLLIDING SERVICE FUNCTIONS WERE RENAMED ON BOTH SIDES, not just the
sales one.** `getById`, `getAll`, `listOrdersForUser`, `getMetalsForOrder`,
`updateStatus` and `createReview` existed in both directions. Keeping the
purchase names bare would have been half the edits and a trap: in a merged file
the unprefixed name silently meaning "purchase" is exactly the kind of thing
that reads correct and is wrong. They are now
`get{Purchase,Sale}ById`, `getAll{Purchases,Sales}`,
`list{Purchases,Sales}ForUser`, `get{Purchase,Sales}MetalsForOrder`,
`update{Purchase,Sales}Status`, `create{Purchase,Sales}Review`.

**THE PATHS DID NOT CHANGE** (ruling 13). `/api/purchase_orders/*` and
`/api/sales_orders/*` are declared in `features/orders/creates.routes.ts`,
which exports two routers, and `app.js` mounts each where it always did.
`purge_cancelled` moved and was not modified.

## What the moves found

### 1. `legacy/` was about to import `#features/pricing` at runtime

`repo.exchange.js`'s `updateOrderItemPrices` called `calculateItemPrice`
itself. Moving the file into `legacy/` would have made the directory
un-deletable in one `rm -rf`, which is the single thing
`lint:legacy-boundary` exists to refuse. The exchange half now TAKES prices;
`features/orders/repo.dual.js` computes them with the same function, on the
same items, in the same order, and hands them over. Nothing about what lands
in the column changed.

### 2. The route census silently dropped six routes — and its exit code stayed 0

`scripts/route-guards.mjs` is the security census: every route and the
middleware in front of it. Three things in it were hardcoded to a shape that
was merely true rather than required:

- `walk()` matched the exact filename `routes.ts`, so `creates.routes.ts` was
  never opened;
- the import parser matched DEFAULT imports only, so a named-export router
  resolved to nothing;
- the route regex matched a variable literally named `router`, so a file
  declaring two routers contributed none of them.

Any one of those made six routes — including
`DELETE /api/purchase_orders/purge_cancelled` and both
`create_review` paths — vanish from an authorization audit **with exit code
0**. Fixed all three, and added the guard that was missing: an `app.use`
whose identifier cannot be resolved is now a **failure**, not a skip. Census
back to 131 routes from 125, with every guard unchanged.

This is the fourth gate script found broken by a factoring pass (`diff`,
`validate:wire`'s caller, `audit:test-leaks`, now this) and the same lesson:
tooling under `scripts/` that nothing typechecks, nothing imports and no test
covers rots silently while the things it audits stay green.

### 3. The sale half of the mirror has no product-code caller

`mirrorSalesOrder`, `mirrorSalesItems`, `mirrorSalesSpots` and
`mirrorSalesAddress` are exercised only by their tests. A sales order is
dual-written DIRECTLY by `write.service.ts`, which writes both schemas from the
same values instead of re-deriving from exchange; only the purchase direction
still goes through `repo.dual.js`'s mirror. **Not deleted** — deleting a mirror
is a data decision (D105) and Jacob's, and the tests that drive them are a real
column-by-column proof that `exchange` and `orders.*` agree. Recorded in the
file's own header so it is not rediscovered.

### 4. `audit:table-owners` needed its ACCEPTED list re-pinned

The audit keys on feature-directory names, and nine entries named
`purchase-orders`/`sales-orders`. Renamed to `orders`. **The stale
`orders.offers` entry was removed** — 086 dropped that table and nothing has
written it since, which the audit had been reporting as STALE before this
wave. Findings: **4 at `a2599311` -> 3 now**, and the three that remain
(`payments.details`, `payments.intents`, `refiners.orders`) are pre-existing
and untouched.

## The two suite failures, and what each one was

Both were mine, both mechanical, both fixed and individually re-verified.

1. **`refiner-edits` read a migration by relative path.** It does
   `new URL("../../migrations/093_….sql", import.meta.url)`, which was right
   from `features/purchase-orders/` and points at `features/migrations/` from
   `features/orders/tests/`. One `../`.

2. **`endpoints.test.js` reported six live handlers as unrouted** — the SAME
   hardcoded filename as `route-guards.mjs`, in a second place in the tree:
   `e.name === "routes.js" || e.name === "routes.ts"`. Both walks are fixed to
   `/(^|\.)routes\.(js|ts)$/`. Worth noting that this one FAILED LOUDLY while
   the census silently exited 0 — the difference between an assertion and a
   report, on the same defect.

## Task 2 — the TypeScript conversion, and what it found

**5 of 28 converted so far** (`label-buffer`, `order-metals-invariant`,
`repo`, `refiner-spots`, `update-tracking`); 15/15 assertions pass across
them, unedited except where noted. Two real defects, neither silenced with
`any`:

### `types/supertest.d.ts` had no `patch`

The shim declares only the surface the tests use — deliberately, so that
reaching for anything else fails rather than becoming `any`. It declares
`get`, `post`, `put`, `delete`. **It has never declared `patch`, and PATCH is
now the entire order mutation surface** — `PATCH /api/orders/:id`,
`/api/orders/items/:id`, `/api/shipments/:id`, `/api/refiners/orders/:id`,
the routes D87 consolidated out of the ~25-route RPC zoo. Every test that
exercises them is JavaScript, so `tsc` never saw the call. The narrow
declaration did exactly what its header says it is for; it just had nobody
asking until a PATCH test became `.ts`. Added.

### Three of `refiner-spots`' four tests had no fixture guard

The first test does `assert.ok(order, "dev has no refiner metals on a
migrated order")`. The other three take the same fixture and go straight to
`order.id`. `tsc` reported `'order' is possibly 'undefined'` seventeen times
and it was right: on a dev database without that fixture those three fail
with a TypeError rather than saying what is missing — and the assertions
below them would never run. Guard added to all three, which makes them
stronger rather than quieter.

**23 files remain.** They are the large ones (`parity` 402,
`patch` 391, `sales-service` 392, `create` 356, `refiner-edits` 333) and each
carries `let admin;`-style fixtures that need a declared structural subset,
which is exactly the work wave 4 did on `bid.ts` and exactly where the next
defects of this class will be.

## Task 3 — the checkout creates seam, reported not unified

`write.service.ts`'s creates are now settled in `features/orders/`. The seam:

**`insertPurchaseOrder` HAS NO PRODUCT-CODE CALLER.** The live purchase-order
create goes through `repo.dual.insertOrder` — exchange first, then
`mirrorPurchaseOrder` + `mirrorPurchaseAddress`. `insertPurchaseOrder` writes
both schemas directly and is exercised only by `tests/write.service.test.js`.
So there are TWO create implementations for the purchase direction and the
live one is the re-deriving mirror.

The sale direction is the opposite: `insertSalesOrder` IS live
(`createSalesOrder` and `adminCreateSalesOrder` both call it) and the sales
mirror is what nothing calls.

So the two directions have already chosen opposite create strategies, and
unifying them is choosing one. That choice is the write-path rewrite D105
scopes as its own wave, with the covenant ledger run BEFORE the switch — not
this one. `features/orders/create.ts` is the third implementation, written for
checkout and still called by nothing.

## Verification

| check | result |
|---|---|
| `typecheck` (api) | clean |
| `lint:imports` | 1309 internal imports, 0 unresolved |
| `lint:namespace-calls` | 1269 calls, 0 unresolved |
| `lint:db` | 203 `query()` calls in 338 files, all threading their executor |
| `lint:row-vs-list` | 0 list-returning calls read as a row |
| `lint:migrations` | 102 files, no destructive writes to exchange |
| `lint:legacy-boundary` | legacy writes exchange, says so at every call site, imports no feature at runtime |
| `validate:wire` | **27 shapes match, 0 diverge** (= wave 4) |
| `verify:orders-decomposition` | **672 values / 48 orders** (= wave 4) |
| `verify:sales-order-decomposition` | **285 values / 15 orders** (= wave 4) |
| `diff` | 1 operation identical, 0 diverge |
| `audit:routes` | **131 routes, exit 0** (125 before the fix) |
| `audit:switches` | 2 `*_SOURCE`, 0 `*_WIRE` |
| `audit:table-owners` | 3 findings, all pre-existing (4 before) |
| full API suite | **934 / 934, 0 fail, 498 s** |
| `verify:genesis` | built 49 tables + 4 views from empty; identical to dev, committed genesis matches |
| `audit:coverage` | 1 populated column with no home (pre-existing) |
| `audit:indexes` / `audit:query-paths` / `audit:non-finite` / `audit:nullability` | all OK |
| contracts `build` + `verify:fresh` + `validate` | 36/36 tables validate cleanly |
| frontend `typecheck` + `test` | clean, **163/163** — proof the dissolution is wire-invisible |

### The suite went 916 -> 934 and nothing was deleted

Wave 4 measured 916 tests. This wave adds none and removes none; the delta is
the three `refiner-spots` fixture guards (+3) and node counting the same
assertions under new file names. **Ruling 32 was applied per file and TWO
FILES WERE RENAMED RATHER THAN DELETED**, as D106 already established and two
agents already checked: `accept-offer-pricing.test.js` ->
`finalize-pricing.test.ts` (it pins `finalize_pricing` on
`PATCH /api/orders/:id` - the $26.81 class of bug) and
`offer-and-items.test.js` -> `item-writes.test.js` (item writes on the
current endpoints). Only the names were offer-era.

No migration was written and none was run. Nothing was dropped or deleted from
`exchange`. `api/.env` untouched; no git commit, add, checkout, stash or reset.

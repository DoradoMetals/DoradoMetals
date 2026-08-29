# Wave 3.5 — factoring, legacy grouping, and the orders write path

Branch state at start: clean at `2208932e`. API baseline **890/890, exit 0,
618 s** (measured, not assumed).

```
1. Factor resources into their own domains   ██████████████░░░░   75%
2. Remove the proven legacy paths            █████████░░░░░░░░░   45%
3. Delete the code with no paths             ██████████████░░░░   75%
4. Orders read from shared contracts         ██████████████████  100%
5. Co-locate tests under tests/              ██░░░░░░░░░░░░░░░░   10%
6. Tests become TypeScript                   ░░░░░░░░░░░░░░░░░░    0%
7. Write the process down                    ██████████████████  100%
```

## DONE

**Task 1 — the factoring.** Ten resources given their own stack; every URL
unchanged (ruling 13); parent routers now MOUNT rather than declare.

| resource | got | paths (unchanged) |
|---|---|---|
| `fulfillments/methods` | routes + controller + service | `GET /fulfillments/methods`, `/methods/all`, `POST /methods/update` |
| `fulfillments/pickups` | routes + controller + service | `POST /fulfillments/schedule_pickup`, `GET /orders/:orderId/pickups` |
| `fulfillments/directs` | routes + controller + service | `POST /fulfillments/schedule_direct`, `GET /orders/:orderId/directs` |
| `fulfillments/shipments` | service (no HTTP surface, documented) | — |
| `orders/items` | routes + controller (service extended) | `GET/POST /orders/:id/items`, `PATCH/DELETE /orders/items/:id` |
| `orders/spots` | routes + controller + service | `GET/PUT /orders/:id/spots` |
| `orders/addresses` | routes + controller + service | `GET /orders/:id/address` |
| `orders/transactions` | service (no HTTP surface, documented) | — |
| `refiners/spots` | controller + service | `GET /orders/:orderId/refiners/spots` |
| `refiners/items` | controller handler + service read | `GET /orders/:orderId/refiners/items` |

`features/fulfillments/service.ts` is now the thin remainder: `getForOrder`,
`getById`, `getSchedule`, `choose`/`chooseById`/`chooseDefault`, `setMethod`,
`setStatus`, `cancelSchedule`, `assertCategory`. `features/orders/controller.ts`
is `listOrders` + `patchOrder` and nothing else.

Consumers repointed to the child, which is the whole point of ruling 26b:
`features/orders/create.ts` → `fulfillments/pickups` + `fulfillments/directs`
directly; `features/shipping/shipments/service.ts` →
`fulfillments/shipments/service.ts` directly.

**`api/legacy/`, with `#legacy/*`.** 15 `legacy.repo.ts` files and their
`sql/legacy/*.sql` moved to `legacy/<feature>/repo.ts` + `legacy/<feature>/sql/`,
mirroring the feature names. `legacy/README.md` states entry and exit criteria.
`lint:imports` 1306/0, `lint:namespace-calls` 1232/0.

**`audit:routes` fixed, and it was about to lie.** It resolves a mount by
reading `app.use(…)` out of `app.js`, so the moment a parent's `routes.ts`
started MOUNTING children the child routers resolved to `mount: null, url: null`
— the guards were still counted, so the totals stayed right and the URLs quietly
went missing. That is the second time this exact silent-null has happened in this
file (its own comment records the `.js` → `.ts` one), so nested mounts are now
resolved transitively to a fixpoint. All 122 guarded routes report a full URL
again, including `PATCH /api/orders/items/:id` and `GET /api/fulfillments/methods`.

**New guard: `lint:legacy-boundary`** — written for the hazard the coordinator
named (two files called `repo.ts`, one per schema; a wrong prefix resolves fine
and writes the wrong schema). It asserts (a) every statement under `legacy/`
names `exchange` and never one of the eighteen, (b) every `#legacy/*` import is
bound to a namespace called `legacy…` so the call site shows which schema it
writes, (c) nothing under `legacy/` imports a feature at runtime — two accepted
edges pinned with reasons, and an entry that stops being true fails.
`--self-test` proves both detectors fire.

**`shared/http/refuse.ts`** — the same three-line `refuse` helper existed in
three services and the factoring would have made it five.

**Task 4 — orders read from shared contracts: DONE.** Every orders-related
shape the frontend uses already came from `@dorado/contracts`; what wave 3 left
behind was the old PAIR still declared twice. `frontend/features/orders/types.ts`
now holds the shared half once — `Order`, `orderReturnShipmentSchema`,
`StatusConfigEntry`, `StatusConfig`, and the five drawer/prop interfaces — and
the two direction files re-export it under their local names, so no consumer
import moved. Deleted as duplicates: `salesOrderReturnShipmentSchema` (was
byte-identical to the purchase one), two `StatusConfigEntry` + two `StatusConfig`
declarations, and eight drawer prop interfaces that differed only in a type name
that is now one type. **Frontend 122/122, typecheck clean.**

NOT merged, deliberately: the third `StatusConfigEntry` in
`features/orders/ui/OrderStatusShared.tsx`. It is structurally LOOSER on purpose
(`React.ComponentType` plus an index signature) so it accepts both the lucide
icons the purchase tree uses and the phosphor icons the sales tree uses.
Tightening it to `LucideIcon` would break the sales side. It is a different
type, not a duplicate.

## IN PROGRESS / HIT AND LEFT

**Task 2 — the orders WRITE path is a rewrite, not a deletion.** Legacy READS
are gone (see DECISIONS). The dual-write mirrors are not, and the reason is
structural: `features/purchase-orders/repo.dual.js` mirrors by RE-DERIVING the
order from `exchange` (`INSERT … SELECT FROM exchange.*`), so deleting the
exchange half deletes the only source the new-schema rows are built from. All 29
writes need a native statement and a service-layer conversion from
exchange-shaped arguments (metal NAME, `purchase_order_id`) to new-schema ones
(`metal_id`, `order_id`). The native repos exist for 24 of the 29 — the map is
in the report — so the work is bounded, but it is a money-path rewrite that
`verify:parity` cannot re-check afterwards (parity refuses once a feature is past
`dual`). It needs its own wave with the parity ledger run BEFORE.

**`features/purchase-orders/` and `features/sales-orders/` still exist.**
Destination for every file, so wave 4 does not re-derive it:

| file (both features unless noted) | destination |
|---|---|
| `utils/calculations.ts` + `.test.js` | `features/pricing/` — bid side from purchase, ask side from sales; `PricingSpot` is BYTE-IDENTICAL in both and becomes one declaration |
| `repo.exchange.js` (purchase only) | `legacy/purchase-orders/repo.ts` |
| `legacy.repo.ts` | `legacy/<feature>/repo.ts` + `sql/legacy/*` → `legacy/<feature>/sql/` |
| `repo.dual.js` (purchase only) | STAYS in `features/` — it is the DUAL writer, half of it new-schema; it imports the exchange half from `#legacy/*`, which is the correct direction |
| `read.service.ts`, `compose.ts` | `features/orders/` — the API's internal composed order (pricing, email, PDFs) |
| `write.service.ts`, `service.ts`, `repo.ts`, `repo.next.ts`, `controller.ts`, `routes.ts`, `sql/` | `features/orders/` |
| `*.test.js` | `features/orders/tests/` or the sub-resource's `tests/` |

`repo.next.ts` is migration-era vocabulary — there is no switch any more, so it
is just the repo, and it should lose the `.next` when it moves.

What blocks a same-session move is name COLLISION, not ambiguity — both features have `repo.ts`,
`compose.ts`, `read.service.ts`, `write.service.ts`, `service.ts`, `controller.ts`
and `routes.ts`, and `features/orders/` already has `repo.ts`, `controller.ts`,
`routes.ts` and `sql/`. Merging them is a ~2,000-line move with a real merge at
every collision, on the money path, and each verification cycle on this remote
dev database costs ten minutes of a machine that is currently suspending between
commands.

**Two tests the deletion list named, which must NOT be deleted — ruling 32
applied per file rather than by grep:**

- `purchase-orders/accept-offer-pricing.test.js` pins LIVE behaviour. Its
  subject is `finalize_pricing: true` on `PATCH /api/orders/:id`, and it asserts
  the two properties that matter today: a poisoned document is refused and the
  order's money does not move, and a clean finalize records a total derived from
  the database's own rows. Only the NAME is offer-era; the file is the pin on the
  `$26.81` class of bug.
- `purchase-orders/offer-and-items.test.js` likewise — its header records that
  the offer state machine left with 086; what remains are item writes driven
  through `PATCH /api/orders/items/:id` and `POST /api/orders/:id/items`.

Both want a RENAME, which belongs in task 5's one-pass factor → move → rename.

## VERIFICATION — what was actually run

Run and green, by me, after the changes:

| check | result |
|---|---|
| `pnpm --filter @dorado/api typecheck` | clean |
| `lint:imports` | 1306 internal imports, 0 unresolved |
| `lint:namespace-calls` | 1232 calls, 0 unresolved |
| `lint:row-vs-list` | 0 list-returning calls read as a row |
| `lint:db` | 206 `query()` calls in 334 files, all threading their executor |
| `lint:legacy-boundary` (new) | 37 legacy statements, 381 modules, 0 violations; `--self-test` both detectors fire |
| API tests — `features/orders/**` + `features/fulfillments/**` | **116/116** |
| API tests — every feature's `tests/unit.test.ts` | **71/71** |
| `pnpm --filter @dorado/frontend typecheck` | clean |
| `pnpm --filter @dorado/frontend test` | **122/122**, unchanged from baseline |
| `audit:routes --list` | every route resolves to a full `/api/…` URL, every one guarded, exit 0 |

**The monolith `pnpm check` ran and reported `890 tests / 888 pass / 2 fail`.**
Both failures are understood, both are now green on re-run, and both are worth
recording because one of them is a guard doing its job:

1. `features/authorization/admin-routes.test.js` — *"8 routes no longer carry
   requireAdmin"*, naming exactly the eight paths this wave moved into child
   routers. **The guard was right and the audit was wrong**: the census resolves
   a URL through `route-guards.mjs`, which only read `app.use(…)` from `app.js`,
   so a child router mounted by its PARENT resolved to `url: null` and looked
   unguarded. The gate ran this before the transitive-mount fix landed. **Green
   on re-run: 4/4.**
2. `features/sales-orders/repo.next.test.js` → *"reads do not write"*, `55 !== 56`.
   A **pre-existing flake this wave did not cause and has now fixed**: the test
   counts `orders.transactions` across a read while declaring NO lock, so the
   order-placing files commit a row on their own connections mid-count. A row
   appearing during a read of an unrelated feature is not that read writing. Now
   taken under `LOCKS.ORDERS`, which is what `shared/testing/locks.ts` is for.
   **Green on re-run: 8/8.**

Also green after those two fixes: `typecheck`, `lint:imports` 1308/0,
`lint:namespace-calls` 1232/0, `lint:db` 206/334, `lint:legacy-boundary` 0
violations. The full monolith has not been re-run end to end since — this
machine suspends between commands and a single run took over an hour of wall
clock — so the coordinator's own run is the authority on the 890/890 total.

## DECISIONS, and the evidence behind each

**Legacy WRITERS removed: none. Not for any feature.** The one-way door was not
opened in this wave.

**Legacy READS removed, for ORDERS only.** Orders is the one feature whose data
migration is verified — the D87 parity ledger cleared exchange-only rows at ZERO
everywhere, reads pivoted in `a12b76ed`, decomposition gates byte-identical.
Three reads went:

1. `patch.service.directionOf` was a three-table UNION across
   `exchange.purchase_orders`, `exchange.sales_orders` and `orders.orders`. Now
   `orders.orders` alone (`features/orders/sql/direction_of.sql`).
2. + 3. Two live spot feeds read `exchange.metals` via
   `repo.dual.getCurrentSpotPrices` — the `finalize_pricing` path and the spots
   `lock` path. Both now read `features/spots/service.getSpotPrices()`, the feed
   every other pricing caller has used since D84.

**That third one found a live defect and is the judgement call to review.**
Measured on dev: `exchange.metals` says Gold bid 4449.43; `spots.spots` says
4600.06. The order spot LOCK — the number a customer is paid on — was pinning
the stale table. On production the cron writes both in one transaction so they
should agree, but production has no `spots.spots` at all yet, which is the
deploy-order problem CLAUDE.md already records rather than a new one.

**Three exports deleted, each with zero references proven by a whole-tree
sweep** (`features/`, `legacy/`, `shared/`, `scripts/`, `providers/`):
`shipping/tracking/service.replaceEvents` (superseded by the GUARDED
remove+insert pair in `operations/service.ts`; keeping an unguarded second
implementation of the write that once emptied five shipments' FedEx history is a
loaded gun in a drawer), `purchase-orders/compose.newestFirst`,
`purchase-orders/write.service.ITEM_DEFAULTS`.

**Eight unreferenced exports KEPT and listed** rather than deleted, because
their features are not complete: four `checkout/repo.next.ts` reads awaiting the
checkout pivot, `payments/service.capturePaymentIntent`,
`orders/items/repo.updateScrap` (the native destination the write rewrite needs),
`media/images/service.listForUser`, `renderEmail.renderSalesOrderPlacedEmail`.

## WHAT A LATER WAVE INHERITS AS AN ASSUMPTION

- The order spot lock and `finalize_pricing` now price from `spots.spots`, not
  `exchange.metals`. If that is wrong, it is one line in each of
  `features/orders/spots/service.ts` and `features/orders/patch.service.ts`.
- `features/orders/repo.directionOf` answers from `orders.orders` only. Anything
  relying on an exchange-only order being found by direction will now get null.
- `orders/items/service.findLine` still reads `exchange.purchase_order_items`,
  and CANNOT move: it needs `scrap_id`, and `orders.items` has no such column —
  `exchange.scrap` is unmigrated.
- `audit:table-owners` was widened to scan `legacy/`. Its 4 findings are
  pre-existing and unchanged by this wave; it is not in `pnpm check`.
- `shared/testing/sql.ts` (`sqlWithLegacy`) is test-only and exists so the seven
  unit tests that pin BOTH halves of a dual write against each other stayed one
  file. Splitting them would destroy the comparison that is the point of the pin.

# Write fold: executing `write-census.md`'s fold list and reverse findings

This wave executes `docs/waves/write-census.md` §2 (the fold list) and acts on §3 (the
reverse findings). Ruling 114: PATCH for edits, actions only for side effects or
multi-row writes. Ruling 13: a route that folds into a PATCH is deleted, not moved.

## 1. The eight folds

| Route | Outcome |
|---|---|
| `POST /orders/:id/reopen` | Deleted. `cancelled_at` joined `OrderPatch`; clearing it (`{cancelled_at: null}`) via `PATCH /orders/:id` is the new reopen. `rules.assertReopenable` (unchanged) and a new `rules.assertClearsCancellation` (refuses a non-null value — cancelling still needs `POST /orders/:id/cancel`, which buys a label and creates a return shipment) both run inside `orders/service.ts:patch()`. |
| `POST /orders/:id/review` | Deleted. `review_created` joined `OrderPatch`. The write moved out of the controller (a standing convention violation) into the generic `patch()` path. **Guard change:** the route was `requireUser + requireOwnOrderParam` (a customer could flag their own order); `PATCH /orders/:id` is `requireAdmin` only (ruling 3). Setting `review_created` is now admin-only. No client hook existed for this route, so nothing in `@dorado/client` changed. |
| `POST /fulfillments/schedule_dropoff` | Deleted outright, no replacement route. It duplicated the dropoff branch of the existing `PATCH /fulfillments/:id` byte for byte (`FulfillmentDropoffChoices` already covers `refiner_id`/`location_id`/`driver_employee_id`/`start_time`/`end_time`, and `patchChoices`'s dropoff branch already does the same insert-or-update via `assertChoicesMatchCategory`). The PATCH is `requireUser + requireFulfillmentOwner`, which passes through unconditionally for an admin — so admins lose no capability; they use the same PATCH a customer would use for their own draft. |
| `POST /fulfillments/methods/update` | Deleted outright, no replacement route. Confirmed dead: no client wrapper, no UI caller, no HTTP-level test beyond the ones deleted here. The db-layer `methods.update()` five-verb stays (still exercised by `db/fulfillments/methods/tests/repo.test.ts`); only the HTTP surface and the now-unused `methodService.update()` / `FulfillmentMethodUpdateBody` are gone. |
| `POST /carrier_services/update` | Folded into a new `PATCH /carrier_services/:id`. Confirmed dead at the HTTP layer (no client wrapper), **but** `logistics/shipping/services/tests/service.test.ts` exercises `service.updateService()` directly with real assertions (renamed-column mapping, audit-stamp preservation, no-op on an unknown id) — this is tested, working code, not dead code, so it earned the PATCH rather than a bare deletion. `updateService()`'s signature is unchanged; the new controller merges the URL `:id` with a body typed `CarrierServicePatch.omit({id: true})`. |
| `POST /payments/charges/:id/fail` | Folded into a new `PATCH /payments/charges/:id`, body `ChargePatch = { failure_reason }`. `charges.failCharge()` is unchanged; only the transport moved. The state-forward guard (`movesForward`, in `transactions/rails/rules.ts`) already lived in rules.ts and needed no change — failing an already-settled charge still silently no-ops, exactly as before. |
| `POST /payments/payouts/:id/mark_sent` | Folded, together with `fail` below, into one new `PATCH /payments/payouts/:id`. Body is `PayoutPatch = { reference?, failure_reason? }`, dispatched by which field is present — the same accepted shape as `PATCH /fulfillments/:id`'s union-by-key branches, not the shipments anti-pattern (§3), because both branches write the exact same single table/single row (`payments.transfers`). A new `payouts/rules.ts` (`assertNamesExactlyOneField`) refuses zero or two fields at once — you can't mark a payout Sent and Failed in the same call. `payouts.markSent()`/`payouts.failPayout()` are unchanged; `payouts.patchPayout()` is the new one-line dispatcher. |
| `POST /payments/payouts/:id/fail` | Same new `PATCH /payments/payouts/:id`, `failure_reason` branch. |

Each folded route's file is deleted (not just its export): `dropoffs/routes.ts` is gone
entirely since it held nothing else; `charges/routes.ts`, `payouts/routes.ts`,
`fulfillments/methods/routes.ts`, `carrier_services` routes/controller kept their other
routes and lost only the folded handler.

## 2. The reverse finding: `PATCH /shipments/:id` split

The four-way dispatcher (branch chosen by which key is present in the body) is split by
what each branch actually does:

| Field | Verdict | Where it went |
|---|---|---|
| `carrier_service_id` | Genuinely one row of one table, no side effect | Stays: `PATCH /shipments/:id`, now the only field `ShipmentPatch` carries |
| `shipping_charge` | Multi-row `UPDATE` (`set_charge_for_order.sql` touches every shipment leg on the order — outbound and return both, when both exist) | `POST /shipments/:id/charge`, body `ShipmentChargeBody` |
| `shipping_actual` | Writes `orders.transactions`, not `shipping.shipments` — a second table | `POST /shipments/:id/actual_cost`, body `ShipmentActualCostBody` |
| `tracking_number` | Calls `orders.updateTracking`, which writes both `shipping.shipments.tracking_number` **and** `orders.orders.tracking_updated` — two tables | `POST /shipments/:id/tracking`, body `ShipmentTrackingBody` |

The three actions live in a new `shipments/actions.service.ts`; `patch.service.ts` keeps
only the `carrier_service_id` branch. All three new bodies compose their one field from a
real row (`Shipment.shape.cost`, `OrderTotals.shape.shipping_fee_actual`,
`Shipment.shape.tracking_number`) under the wire's existing name, so `lint:contracts-derived`
treats them as derived, not hand-written. Every rule these branches already called
(`assertChargeableOrder`, `assertPurchaseOrder`, `assertSalesOrder`, `assertAwaitingTracking`)
is unchanged — only the transport moved. All three new actions stayed `requireAdmin`,
matching the PATCH they came from.

**Client:** `usePatchShipment` keeps its shape (now effectively one field). Three new
hooks — `useChargeShipment`, `useRecordShipmentActualCost`, `useRecordShipmentTracking` —
were added to `packages/client/src/shipping/queries.ts`. `frontend/app/admin/orders/[id]/_src_/AdminOrderScreen.tsx`
calls `usePatchShipment` and will need to move its `shipping_charge`/`shipping_actual`/
`tracking_number` call sites to the three new hooks; per ruling 44/55 the frontend informs
nothing and is not fixed in this pass.

## 3. Reverse findings left as-is

Per the brief, `addresses/:id`, `orders/lots/:id` and `payments/details/:id` are left
exactly as `write-census.md` §3/§4b found them — deliberate, documented two-table shapes,
not oversights:

- **`PATCH /api/addresses/:id`** — updates `places.addresses` and `places.user_addresses`
  together (an address and its per-user default flag are two tables by the schema's own
  design), and conditionally cascades a two-statement default-flip across sibling rows
  when the caller sets a new default. Splitting the default-flip into its own action would
  only move the multi-row write, not remove it.
- **`PATCH /api/orders/lots/:id`** — splits its body into money fields (`orders.lots`) and
  physical fields (`lots.items`), and a physical-fields edit cascades `retierPremiums`
  across every other lot on the order. `orders/service.ts:94-95` documents why: the retier
  is the accepted cost of letting weight/purity edits reprice the order inline, and no
  narrower shape was asked for.
- **`PATCH /api/payments/details/:id`** — updates `payments.details.method_id` and
  `orders.transactions` (`payout_fee`/`waive_payout_fee`) together; confirmed it never
  touches the sealed bank-number columns. The two tables are the payout method and the
  order's own fee snapshot of that method — splitting them would require the caller to
  sequence two calls to change one decision (which payout method, at what fee).

This lane does not touch `api/src/domains/{inventory,refining}` or `db/{lots,refining,inventory}`
(reserved for the lots/refining/inventory lane); `PATCH /api/orders/lots/:id` writes
`lots.items` but the route, controller and service all live under `orders/`, so it was
read for context and left untouched, not skipped.

## 4. `@dorado/client` shape changes

| Hook | Change |
|---|---|
| `useReopenOrder` | Deleted. Use `usePatchOrder(id)` with `{ cancelled_at: null }`. |
| (no hook existed for review) | `usePatchOrder(id)` with `{ review_created: true }` now needs `requireAdmin` — a customer can no longer set this from their own session. |
| `useScheduleDropoff` | Deleted. Use `usePatchFulfillment(id)` with `{ choices: { dropoff: {...} } }`. |
| `useMarkPayoutSent` | Kept, same call shape (`{ transfer_id, reference }`); now sends `PATCH /payments/payouts/:id` instead of `POST .../mark_sent`. |
| `useFailPayout` | Kept; the field renamed `reason` → `failure_reason` to match the column name, and it now sends `PATCH /payments/payouts/:id`. |
| `useFailCharge` | Never existed; still doesn't. `PATCH /payments/charges/:id` with `{ failure_reason }` is available if a caller needs it. |
| `usePatchShipment` | Kept; its type shrank to `{ carrier_service_id }` only. |
| `useChargeShipment`, `useRecordShipmentActualCost`, `useRecordShipmentTracking` | New, replacing the `shipping_charge`/`shipping_actual`/`tracking_number` fields `usePatchShipment` used to carry. |

No hook was ever added for `fulfillments/methods/update` or `carrier_services/update`
(the latter's HTTP route also never had one); the new `PATCH /carrier_services/:id` is
reachable by hand or by a future admin screen, but nothing in `@dorado/client` calls it yet.

## 5. Verification

`pnpm check:fast` (fresh compound): **CHECK_EXIT=0**. All three groups (`api-lint`,
`api-test`, `design`) passed. `lint:contracts-derived` initially refused `shipping_charge`/
`shipping_actual` as hand-written fields; both now compose from `Shipment.shape.cost` and
`OrderTotals.shape.shipping_fee_actual`.

`src/shared/http/tests/endpoints.test.ts` (the route census test) asserts a floor
(`endpoints.length > 100`), not an exact count — it needed no numeric edit and passed
unchanged. `admin-routes.json` (the reviewed admin-route set `admin-routes.test.ts` diffs
against) was updated: seven admin routes removed (`carrier_services/update`,
`fulfillments/methods/update`, `fulfillments/schedule_dropoff`, `orders/:id/reopen`,
`payments/charges/:id/fail`, `payments/payouts/:id/fail`, `payments/payouts/:id/mark_sent`),
six added (`PATCH /carrier_services/:id`, `PATCH /payments/charges/:id`,
`PATCH /payments/payouts/:id`, `POST /shipments/:id/charge`, `POST /shipments/:id/actual_cost`,
`POST /shipments/:id/tracking`). `docs/waves/write-census.md`'s §1 table is updated with a
post-fold column; see there for the count-by-count reconciliation (123 → 121).

Every test file that drove a deleted route over HTTP moved with it: `orders/tests/review.test.ts`
is gone (folded into new cases in `orders/tests/patch.test.ts`); the `methods/update` and
`carrier_services/update` HTTP body-validation tests are gone (one replaced by a
`PATCH /carrier_services/:id` case); `fulfillments/tests/dropoff.test.ts`,
`fulfillments/tests/schedule.test.ts`, `fulfillments/tests/replay.test.ts`,
`orders/tests/update-tracking.test.ts`, `orders/tests/money-edits.test.ts` and
`transactions/tests/http-rails.test.ts` were updated in place to call the new routes.

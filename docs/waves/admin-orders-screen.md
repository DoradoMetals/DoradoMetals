# The admin order screens (ruling 100)

Jacob: *"lets try our hand at building the admin orders screen with all it's
states and such."*

Two routes, six Figma frames, fourteen cards. `app/admin/orders/[id]` is the
customer order — a purchase order (we buy scrap) or a sales order (we sell
bullion). `app/admin/refining/[id]` is the refiner order — a refiner sales
order (we sell lots), a refiner purchase order (we buy bullion), and both of
their drafts. The spec text is `docs/design/orders-notes-2026-09-05.md`
sections 3 and 4 plus every component description in the Figma file
`ymmNlCDLVIfanpRQ7QHMIs`, page `0:1`.

**The API did not change in the first lane (ruling 44):** where a card needed a
fact the API did not give, it rendered what the API could feed and the gap went
in a table. The API lane closed twenty-eight of the twenty-nine, and the second
pass — this document — wired every one of them. The API did not change in that
pass either; where a route still does not serve a state it is recorded below
rather than worked around.

## Step 0 is CLOSED — every gap is wired

The inventory that used to live here is `docs/waves/admin-orders-screen-gaps.md`
and what the API lane did about it is `docs/waves/admin-orders-api.md`. This is
the second pass: each gap's waiting state replaced by the real one, with the
hook that feeds it and the test that pins it.

**Twenty-eight of twenty-nine are WIRED. GAP 23 is the one left**, and it is not
a screen state: six document kinds have no renderer because the Figma "Media"
file has no Documents page (ruling 95). It never carried a test marker and does
not need one — the card already tells the truth about it, because a kind with no
renderer is `available: false` until a file is imported.

| GAP | State | Hook | Test |
|---|---|---|---|
| 1 | `OrderView.reference` in the header | `useOrder` (field) | `cards.test.tsx` "GAP 1 and 2" |
| 2 | `N orders to date`, customer and refiner | `useOrder` / `useRefiningOrder` (`user.orders_to_date`, `orders_to_date`) | same |
| 3 | Cancel Order, live and bodyless | `useCancelOrder` (`{}`) | `cards.test.tsx` "GAP 3" |
| 4 | The refiner header's Office select | `useLocations`, `usePatchRefiningOrder` | `cards.test.tsx` "GAP 4 and 5" |
| 5 | Cancel a refiner order | `useCancelRefiningOrder` | same |
| 6 | Lock / Unlock off `actions.lock_spots` / `unlock_spots` | `useOrder`, `usePutOrderSpots` | `cards.test.tsx` "GAP 6" |
| 7 | A refiner order's own frozen prices | `useRefiningSpots` | `cards.test.tsx` "GAP 7" |
| 8 | Batch: create and assign in one call | `useCreateRefiningOrder` (`lot_ids`) | `cards.test.tsx` "GAP 8"; `adminOrder.e2e.ts` "Batch creates the refiner order" |
| 9 | Create Sale on a finalized purchase order | `useCreateRefiningSale` | `cards.test.tsx` "GAP 9" |
| 10 | The Adding Lot Autocomplete | `useLotSearch` | `cards.test.tsx` "GAP 10" |
| 11 | Refiner Charges and Totals | `useRefiningOrder` (`totals`) | `cards.test.tsx` "GAP 11" |
| 12 | A refiner order's Payment card | `useRefiningPayment`, `useOpenPayout` / `useOpenCharge` (`refining_order_id`) | `cards.test.tsx` "GAP 12" |
| 13 | Expected settlement as money | `useRefiningOrder` (`expected_settlement`) | `cards.test.tsx` "GAP 13" |
| 14 | Create fulfillment for an order | `useCreateFulfillment` | `cards.test.tsx` "GAP 14"; `adminRefiningActions.e2e.ts` |
| 15 | Coverage and Additional coverage | `usePatchFulfillment` (`shipment.insured`, `.additional_coverage`) | `cards.test.tsx` "GAP 15 and 16" |
| 16 | Bill the return to the customer | `usePatchFulfillment` (`shipment.bill_return_to_customer`) | same |
| 17 | Pickup / Appointment Office | `useLocations` | `cards.test.tsx` "GAP 17 and 18" |
| 18 | Driver and With, by name | `useEmployees` | same |
| 19 | Button labels from `actions.transitions` | `useSetFulfillmentStatus` | `cards.test.tsx` "GAP 19" |
| 20 | Drop-off end to end | `useCreateFulfillment`, `useScheduleDropoff`, `useSetFulfillmentStatus`, `useCancelSchedule` | `cards.test.tsx` "GAP 20" ×2; `adminRefiningActions.e2e.ts` "Schedule books it" |
| 21 | The Awaiting Tracking carrier select | `usePatchShipment` (`carrier_service_id`) | `cards.test.tsx` "GAP 21" |
| 22 | Linked Fulfillment from `linked_order` | `useCreateFulfillment` / `useOrderFulfillment` (`linked_order`) | `cards.test.tsx` "GAP 22" |
| 23 | Six document renderers | — | **WAITING.** The Media file has no Documents page. |
| 24 | Send a document | `useSendOrderDocument` | `cards.test.tsx` "GAPs 24 and 25"; `adminOrder.e2e.ts` "an available document offers Send" |
| 25 | Import a document (multipart) | `useImportOrderDocument`, `useImportRefiningDocument` | same; `adminRefiningActions.e2e.ts` "imported as multipart" |
| 26 | A refiner order's documents | `useRefiningDocuments` | `cards.test.tsx` "GAP 26" |
| 27 | Send a message | `useSendSms` | `cards.test.tsx` "GAPs 27 and 28"; `adminOrder.e2e.ts` "the composer sends a message" |
| 28 | MMS on the same send | `useSendSms` (`media`) | same |
| 29 | Call kinds from `CustomerTimeline.call_kind` | `useCustomerTimeline` | `cards.test.tsx` "GAP 29" |

### Hooks added in this pass

Three new modules — `lots`, `places`, `employees` — and eleven hooks on the
existing ones. `keys` grew `orders.dropoffs`, `refining.spots/documents/payment`,
`lots.search`, `places.locations` and `employees.list`.

| Module | Added |
|---|---|
| `lots` | `useLotSearch` |
| `places` | `useLocations` |
| `employees` | `useEmployees` |
| `orders` | `useOrderDropoffs`, `useSendOrderDocument`, `useImportOrderDocument`, `useCreateRefiningSale` |
| `refining` | `useRefiningSpots`, `useRefiningPayment`, `useRefiningDocuments`, `useCancelRefiningOrder`, `useImportRefiningDocument` |
| `fulfillments` | `useCreateFulfillment`, `useScheduleDropoff` |
| `crm` | `useSendSms` |

`fetch.ts` gained `apiRequestForm` — a document import is multipart, so the
browser must set its own boundary and `Content-Type` must not be named.

### Three things the API does not serve, recorded rather than worked around

1. **A refiner order's fulfillment has no read.** `GET /orders/:orderId/fulfillments`
   is keyed on `orders.orders`; there is no `GET /api/refining/orders/:id/fulfillments`.
   `POST /api/fulfillments { refining_order_id }` answers `200` with the existing
   view when one is there, so the refining screen holds the newest view any of its
   writes answered. A reload loses it until that read exists.
2. **`PATCH /api/fulfillments/:id { dropoff: … }` answers `200` and writes
   nothing** when the order has no `fulfillments.dropoffs` row yet — which is
   every order until `schedule_dropoff` runs, because create does not make one.
   Measured 2026-09-06: request `PATCH /api/fulfillments/<id>` body
   `{"dropoff":{"refiner_id":"<uuid>"}}`, response `200` with the view unchanged
   and `missing` still `["refiner_id","start_time"]`. `db/fulfillments/dropoffs`
   `update` is a `buildUpdate` keyed `WHERE fulfillment_id`, so a missing row is a
   zero-row UPDATE — exactly what `audit:silent-mutations` is about. The card
   therefore holds the drop-off choices locally and sends them whole to
   `schedule_dropoff`, which is also what the Figma card says: *"nothing is saved
   until Create"*.
3. **`FulfillmentViewFacts.linked_order` resolves for a refiner SELL order too.**
   `POST /api/fulfillments { refining_order_id: <a sell order> }` answered
   `linked_order: { reference: "PO-16286", direction: "purchase" }` — the join runs
   through the lot to whatever customer order it came off, and for a sell order
   that is the purchase order we bought the scrap on, not a drop ship. The screen
   draws Linked Fulfillment on the refiner PURCHASE order only, which is what
   section 4 of the notes says.

### Findings closed (fixe lane)

All three are closed, each with a test that failed before the fix and passes
after it (`logistics/fulfillments/tests/dropoff.test.ts`).

1. **`GET /api/refining/orders/:id/fulfillment`** answers the same
   `FulfillmentView` `POST /api/fulfillments` does — one SQL read, handled in
   `logistics/fulfillments/controller.ts` and mounted from
   `domains/refining/routes.ts` (ruling 13: the refiner order's id is the URL,
   fulfillments owns the handler), the same shape `GET .../payment` already
   uses. Listed in `admin-routes.json`.
2. **The `dropoff` arm of `patchChoices` is create-or-update now**, and asserts
   the write applied (`rules.assertApplied`, the `crm/sms`/`accounts/auth`
   pattern) rather than trusting a bare `buildUpdate` call. `cancel_schedule`
   deletes the detail row for all three categories, so a PATCH landing after a
   cancel was the reachable zero-row case, not the original creation path
   (which `ensureDetail` already covers) — the closing test reproduces it via
   schedule → cancel → patch.
3. **`linked_order` now requires `refining.orders.direction = 'buy'`** in
   `db/fulfillments/sql/view.sql`. A sell order's lot still joins to the
   customer purchase that fed it, but that is the source, not a drop ship, so
   it reads `null` there — matching what the card already only draws for a
   refiner purchase order.

### One deviation from Figma, on purpose

**The Lots title row gains a refiner Select.** Figma's `Selection=Some` variant
draws three icon buttons and no picker, and `Lots/Bullion/Finalized/True` draws
Create Sale alone — but `POST /refining/orders` and `POST /orders/:id/refining-sale`
both require a `refiner_id`, and no other control on the screen holds one. The
Select is the same library component the Order Header already uses for a refiner,
placed in the slot the buttons sit in. Jacob's to accept or replace.

## What was built

Two routes, one shared card folder, fifteen cards.

```
frontend/app/admin/
  layout.tsx  error.tsx  loading.tsx        the admin gate and its boundaries
  _src_/orders/                             the cards both routes compose
    OrderCard.tsx        the chassis: card chrome, a title row whose left half
                         is the collapse trigger and whose right half holds the
                         badge and the actions, a body that unmounts when closed
    OrderHeaderCard  SpotsCard  LotsCard  RefiningItemsCard  ChargesCard
    PaymentCard  TotalsCard  ProfitBreakdownCard  SettlementCard
    FulfillmentCard  ShipmentCard  ScheduleCards (Pickup/Appointment/Drop-off)
    LinkedFulfillmentCard  DocumentsCard  ChatCard  format.ts
  orders/[id]/     page + error + loading + _src_/AdminOrderScreen.tsx
  refining/[id]/   page + error + loading + _src_/AdminRefiningScreen.tsx
```

**The layout is the frames'**: a 1440 shell at 32 padding, Main flexible and
Aside 400, 24 between every card. A card is `bg-card`, a hairline border, an
8px radius and 16px of padding, which is what every instance in the file
measures.

**The card chassis is page-local on purpose.** Figma's own note says it: *"the
Accordion header has no slot for an instance, so it sits beside it in a Title
row"*. The library `Accordion` draws its own chrome and puts its content inside
its own header column, and the order cards need the badge and the buttons
OUTSIDE the trigger - a button inside a button is not a thing. So `OrderCard`
composes `Button` + `ChevronDown` from the library and supplies the collapse,
the name and the right slot itself, exactly as the Figma component does.

**No library component was added.** Every primitive the six frames use already
exists in `@dorado/components` after the library refresh, and three of them -
`Documents`, `Chat` and `Tracker` - are close enough to the drawing that the
card around them is a dozen lines. `Documents` already ships the ten canonical
names and the Send/Import row actions; `Chat` already ships the
Messages/Calls toggle, the composer and the Call button; `Tracker` already
reads "Pending" for an unscanned stage.

## Card → view mapping

| Card | Reads | Writes |
|---|---|---|
| Order Header | `useOrder` → `OrderView.reference/.order/.user/.address/.actions`; `useAdmins`, `useLocations` | `usePatchOrder`, `useFinalizeOrder`, `useReopenOrder`, `useCancelOrder`, `useCancelRefiningOrder` |
| Spots | `useOrderSpots`, `useRefiningSpots`, `useLiveSpots`, `actions.lock_spots/.unlock_spots` | `usePutOrderSpots` (`{ lock }` and `{ set }`) |
| Lots | `OrderView.lots` → `OrderLotView[]`; `useRefiners` | `useCreateOrderLot`, `usePatchOrderLot`, `useDeleteOrderLot`, `useCreateRefiningOrder`, `useCreateRefiningSale` |
| Refiner items | `RefiningOrderView.lots` → `RefiningLotView[]`; `useLotSearch` | `usePatchRefiningLot`, `useDeleteRefiningLot`, `useAssignRefiningLots` |
| Charges | `OrderView.totals`; `RefiningOrderView.totals/.pool_oz` | — |
| Payment | `usePaymentView`, `useRefiningPayment`, `OrderView.payout`, `usePayTo`, `useMatchCandidates` | `useOpenPayout`, `useSendPayout`, `useOpenCharge`, `useConfirmMatch` |
| Totals | `OrderView.totals`; `RefiningOrderView.totals` | — |
| Profit Breakdown | `useProfitBreakdown` → `ProfitBreakdown` | — |
| Settlement | `RefiningOrderView` (state, contents, variance, assay lab, `expected_settlement`) | `useSettleRefiningOrder` |
| Fulfillment | `useOrderFulfillment` → `FulfillmentView`; `useFulfillmentMethods`, `useCarrierServices`, `usePackages`, `useHandoffs`, `useLocations`, `useEmployees`, `useRefiners` | `useCreateFulfillment`, `useSetFulfillmentMethod`, `usePatchFulfillment`, `useSchedulePickup`, `useScheduleDirect`, `useScheduleDropoff` |
| Shipment / Return | `useOrderShipments` → `ShipmentView[]` (`timeline`, `actions`) | `usePatchShipment`, `useCancelLabel` |
| Pickup / Appointment / Drop-off | `FulfillmentView.pickup/.direct/.dropoff/.fulfillment.status/.actions.transitions`; `useLocations`, `useEmployees`, `useRefiners` | `useSetFulfillmentStatus`, `useCancelSchedule` |
| Linked Fulfillment | `FulfillmentView.linked_order` → `LinkedOrder` | — |
| Documents | `useOrderDocuments`, `useRefiningDocuments` → `OrderDocument[]` | `useSendOrderDocument`, `useImportOrderDocument`, `useImportRefiningDocument` |
| Chat | `useCustomerTimeline` (`call_kind`), `useConversation`, `useAdminUser` | `useSendSms` (body plus optional `media`) |

**Nothing on these screens computes a number, a state or a label.** A badge is
a `TransferState` or a `RefiningOrderView.state`; a disabled button is an
`actions.*` boolean; which documents exist is `documentsFor`'s answer; whether
Schedule may be pressed is `FulfillmentView.missing` being empty. What the
browser does is format - money, ounces, a purity as a percentage, a timestamp -
and that lives in one file, `format.ts`.

## Hooks added to `@dorado/client`

Eight resource modules came back in the first pass and three more in the second
— `lots`, `places`, `employees` — one per surface the screens read, each typed
only from `@dorado/contracts` and each naming a route that exists today. The
`keys` table grew the matching namespaces. The second pass's additions are
listed in the Step 0 section above; below is the first pass's set.

| Module | Hooks |
|---|---|
| `orders` | `useOrder`, `useOrderSpots`, `useOrderDocuments`, `useOrderShipments`, `useProfitBreakdown`, `usePatchOrder`, `useFinalizeOrder`, `useReopenOrder`, `useCancelOrder`, `useSupplyOrder`, `useAddFunds`, `usePutOrderSpots`, `useCreateOrderLot`, `usePatchOrderLot`, `useDeleteOrderLot`, `useSplitOrderLot` |
| `refining` | `useRefiningOrder`, `useRefiningLots`, `useRefiners`, `useCreateRefiningOrder`, `usePatchRefiningOrder`, `useSendRefiningOrder`, `useSettleRefiningOrder`, `useAssignRefiningLots`, `usePatchRefiningLot`, `useDeleteRefiningLot` |
| `payments` | `usePaymentView`, `usePayTo`, `usePaymentMethods`, `useMatchCandidates`, `useOpenPayout`, `useSendPayout`, `useMarkPayoutSent`, `useFailPayout`, `useOpenCharge`, `useRequestCharge`, `useRecordWire`, `useConfirmMatch` |
| `fulfillments` | `useOrderFulfillment`, `useFulfillmentMethods`, `useSetFulfillmentMethod`, `useSetFulfillmentStatus`, `useCancelSchedule`, `useSchedulePickup`, `useScheduleDirect`, `usePatchFulfillment` |
| `shipping` | `useCarrierServices`, `usePackages`, `useHandoffs`, `useTracking`, `usePatchShipment`, `useBuyLabel`, `useCancelLabel` |
| `spots` | `useLiveSpots` |
| `users` | `useAdmins`, `useAdminUser` |
| `crm` | `useCustomerTimeline`, `useConversation` |

**Invalidation, and optimistic nothing.** Each module has one private
`use<Resource>Write` wrapper; every mutation goes through it and settles by
invalidating the order's namespace plus whichever sibling read the write moves
(a spot moves every price, a lot moves the totals, a payment moves the order
view). No mutation writes the cache directly, so nothing on screen can claim a
state the API has not confirmed.

**`api/src/shared/http/tests/frontend-routes.test.ts` passes**, which is the
proof that matters here: it walks every route the API declares and every URL
`@dorado/client` names, and reports a call the API cannot answer. Zero — 38
literal calls against 196 routes after the wiring pass.

## Guards moved

| Guard | Was | Is | Why |
|---|---|---|---|
| `lint:client-boundary` frontend floor | 55 | 100 | 111 frontend files, from 75 |
| `lint:client-boundary` client floor | 4 | 25 | 29 client files, from 7 |
| `frontend-routes.test.ts` call floor | 9 | 35 | 38 literal calls, from 10 |
| `browser-triggered-effects.test.ts` floor | 9 | 30 | 82 calls scanned, 0 after a success |
| `playwright.config.ts` `admin` project | deleted | restored | the first authed specs since the nuke; `public` now ignores `app/admin/` |

`shared/tests/roles.ts` is new and is not ceremony: Playwright refuses to let
one test file import another, so `ROLES` and `statePath` could not stay in
`auth.setup.ts` once a second spec needed them.

## Tests

- **147 vitest tests, 7 files.** `_src_/orders/tests/cards.test.tsx` renders
  every card in every state the notes name, from fixtures typed by the
  contracts - a fixture that does not typecheck describes a shape the API
  cannot send. `orders/[id]/_src_/tests/orderScreen.test.tsx` and
  `refining/[id]/_src_/tests/refiningScreen.test.tsx` pin the composition:
  which cards a purchase order draws, which a sales order draws, which swap
  when the fulfillment is booked or the order cancelled, and that a refiner
  order has no Finalize and no Chat.
- **The twelve GAP markers are gone.** Each became a real assertion under
  `describe('the states the API lane unblocked')`, named for its gap number, so
  the row in the table above and the test that proves it read the same. Zero
  markers remain; GAP 23 never had one, because it is a rendering gap rather
  than a screen state.
- **17 Playwright tests against a local API from this worktree**, 15 passing
  and 3 skipping for reasons they state: a reused refiner draft that now
  carries lots, an order whose every document is available so nothing offers
  Import, and every refiner already holding an open sell order so a batch would
  409. All five wired actions are proven - create fulfillment, schedule
  drop-off, batch selected lots into a refiner order, send a document, import
  one as multipart, and send an SMS through the fake provider.

**What the browser run caught that jsdom could not, again.** Three real defects,
all client-side: Batch handed over `orders.lots.id` where the route wants
`lots.items.id` (the link row, not the lot - Delete keys on the first and was
right, so one selection served two different ids); the refining screen showed a
Linked Fulfillment card on a SELL order because `linked_order` resolves through
the lot whatever direction the order has; and the drop-off's per-field PATCH
answered 200 while writing nothing, which no jsdom test could see because the
card's own state moved either way.

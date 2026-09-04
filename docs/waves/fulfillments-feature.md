# fulfillments + shipping — the feature end to end

Jacob's brief, the same one orders and checkout ran under: *"Start rolling
through features on the API, get rid of any types that are present. Figure out
how to get rid of any prop spreading. Resources come from the server (unless
they really can't). … Look at the frontend counterparts at the same time. Is
there business logic on the frontend? Remove it to the API."*

Two features, one lane, because they are one question asked twice: **how does
this order get from one party to the other, and where is it now.**
`fulfillments` owns the decision (a pickup, a visit, a parcel) and `shipping`
owns the parcel once the decision is a parcel.

The lane also executes two rulings that landed while it ran: **ruling 64** (no
hand-listed column arrays) and **ruling 65** (no `throw` in a service file).

---

## 1. What moved server-side

Every one of these was a decision about the business, taken in a browser.

| the rule | where it was | where it is |
|---|---|---|
| which child table a fulfillment's booking lives in | a `switch (category)` in a drawer, picking the read to make | `rules.requiresSchedule` + `FulfillmentView`'s three slots |
| when a booking has actually been made, and when | `pickup?.start_time ?? direct?.start_time`, recomputed per screen | `rules.scheduledAt` → `view.is_scheduled` / `view.scheduled_at` |
| whether "Cancel booking" is earned | a component's own `&&` chain | `rules.actionsFor` → `view.actions.cancel_schedule` |
| which methods an order may be MOVED to | not asked at all — the call was made and the API refused | `rules.categoriesFor` → `view.actions.categories` |
| what a carrier's scans MEAN | `TrackingEvents.tsx`: the four stages as a literal, "Label Created" dropped, dedupe by status+location, which stages are still ahead, then a sort — ~40 lines, no test | `rules.trackingTimeline` → `view.timeline` |
| the one word for where a parcel is | `shipping_status ?? last scan ?? 'Unknown'`, spelled per screen | `rules.trackingStatus` → `view.tracking_status` |
| a parcel's carrier | `useShipmentDisplay` holding the services list and `find`-ing it — a client-side join | `view.carrier_id` |
| the box a parcel went in | the dropoff instructions held the packages list and `find`-ed it, falling back to the first offered one | `view.package` |
| the carrier's booking against a parcel | `useShipmentPickups(id)` read only for `[0]` | `view.carrier_pickup`, the most recent — which is what `[0]` always meant |
| which rate options to show, and at what price | the stepper's `ServiceSelector` joined the carrier's `serviceType` answers to the catalogue rows | `rules.offeredRates` → `GET /checkout/rates` |
| a parcel's weight and declared value | patched from the client (ruling 58) | `rules.parcelWeightLb` / `rules.declaredValue` |

`api/domain/fulfillments/rules.ts` and `api/domain/shipping/rules.ts` hold all
of it, pure over rows already loaded, tested without Postgres.

## 2. The two views

```
FulfillmentView = { fulfillment, method, pickup, direct, shipments[],
                    requires_schedule, is_scheduled, scheduled_at, actions }

ShipmentView    = { shipment, service, carrier_id, package, carrier_pickup,
                    handoff_at, tracking_status, timeline[], actions }
```

Both live in `packages/contracts/src/computed/` — declared in
`lint:contracts-derived`'s COMPUTED map, because no table backs a decision.

**ROWS, NOT PROJECTIONS.** `method` is the reference row itself, `pickup` and
`direct` the child rows verbatim, `service` and `package` the rows the shipment
names by id. **Absent is `null`**, never an object whose every key is null.

**Every action mirrors the refusal its use case makes**, so a button that is
offered is a call that is accepted. That symmetry is what makes ruling 65's
`rules.ts` the right home for both halves: `actionsFor` and the assert it
mirrors are now a few lines apart in one file instead of two files apart.

## 3. Wire changes (ruling 44 — the frontend informs nothing)

| endpoint | change |
|---|---|
| `GET /orders/:orderId/fulfillments` | answers `FulfillmentView`, was the bare row. Now **owner-or-admin** (`requireOwnOrderParam`), was admin-only |
| `GET /fulfillments/get_for_order?order_id=` | **GONE** — the same question about the same table from a second URL |
| `POST /fulfillments/schedule_pickup` | body is `{ fulfillment_id, pickup }` — the id named ONCE, at the top level (ruling 43). It used to be nested inside the patch, where it read as a column being written and had to be hand-checked |
| `POST /fulfillments/schedule_direct` | same shape, same reason |
| `POST /fulfillments/methods/update` | body is `{ id, method }` — was `{ method: { …patch, id } }` |
| `GET /shipments/:id` | **NEW** — one parcel, whole. Owner-or-admin |
| `GET /orders/:orderId/shipments` | answers `ShipmentView[]` |
| `GET /shipments/:id/pickups` | **GONE** — the booking is `view.carrier_pickup`, the only thing any caller read of it |
| `POST /shipping/get_tracking` | answers the refreshed `ShipmentView`, was a bag of scan rows |

`requireOwnShipment` gained the path segment: the id arrives in a body
(`get_tracking`), in a query string, or as `GET /api/shipments/:id`.

## 4. The client package

`packages/client/src/fulfillments/` (10 hooks) and `src/shipping/` (21, plus
`outboundOf` / `returnOf`) —
every fulfillment and shipping endpoint, keyed through `src/keys.ts`.
`frontend/features/fulfillments/queries.ts` is deleted;
`frontend/features/shipping/queries.ts` is now a **re-export and nothing
else**, kept only because files other lanes own import those names and
rewriting somebody else's file is how two lanes collide. It calls no API, which
is what takes the surface off `lint:client-boundary`'s PENDING list.

`outboundOf` / `returnOf` replace the old `shipment` / `return_shipment` slots:
the table never had them, and the row's own `direction` is the filter.

## 5. Ruling 64 — no hand-listed column arrays

Seven `PATCHABLE` lists in this lane's `db/` folders were a second spelling of
a contract that already existed. Each now derives:

```ts
export const PATCHABLE = Object.keys(FulfillmentPatch.shape) as …
```

Three contracts were added to make that possible — `FulfillmentPatch`,
`FulfillmentShipmentPatch`, `ShipmentPatchColumns` — each a `.pick()`/`.omit()`
of its generated entity, so a column added to the table becomes writable by
naming it in the contract and nowhere else.

- `pickups` and `directs` derive from their existing patch **minus
  `fulfillment_id`**, which is the UPDATE's WHERE key — exactly what the
  schedule bodies omit it for.
- `shipping/services` is the one case with a mapping, and it is a REAL
  divergence rather than a shortcut: the wire keeps three legacy spellings
  (`supports_pickup` for `supports_pickups`, and two more) which
  `sql/get_all.sql` already aliases on the way out. `COLUMN_OF` is the one map
  of them, next to the `RETURNING` that undoes it.
- `ShipmentPatchColumns` is deliberately **not** `ShipmentPatch`: that name was
  already taken by the `PATCH /shipments/:id` BODY, two of whose three fields
  live on other tables entirely.

## 6. Ruling 65 — no `throw` in a service

Jacob's rule: refusals live only in `rules.ts`, as one-line asserts the use
case calls. **42 throws** across seven service files moved:

| file | throws moved |
|---|---|
| `domain/fulfillments/service.ts` | 11 → 0 |
| `domain/fulfillments/methods/service.ts` | 2 → 0 |
| `domain/shipping/operations/service.ts` | 12 → 0 |
| `domain/shipping/operations/resolver.ts` | 5 → 0 |
| `domain/shipping/shipments/patch.service.ts` | 6 → 0 |
| `domain/shipping/services/service.ts` | 4 → 0 |
| `domain/shipping/shipments/service.ts` | 2 → 0 |

Most became a named assert (`rules.assertShipment`, `rules.assertMovable`,
`rules.assertRatableCart`). Three did not, and are worth naming:

- **`fulfillments.update`'s "vanished mid-write" throws are DELETED, not
  moved.** `setMethod` re-read the row moments after its own existence check
  and threw a 500 if it had gone; the read-back it now does answers the same
  question and the refusal was never reachable.
- **`quoteRate`'s `switch` default is gone.** `rules.assertShippingType`
  narrows `unknown` to `ShipmentDirection` first, after which the only
  distinction the call needs is `Inbound` vs the two that leave from us — three
  lines instead of a switch with an error arm.
- **`labelBufferOrVoid` keeps its order.** The label is cancelled first and the
  refusal is raised second, because a label FedEx billed for must be voided
  whether or not anyone hears about it.

**The gate: `api/scripts/lint-no-throw-in-services.ts`**
(`lint:no-throw-in-services`, wired into `scripts/check.mjs`'s `api-lint`
group beside `lint:one-catch`). Seven self-test cases through the shared
harness; fails any `throw` under `api/domain/**` outside `rules.ts` and outside
`tests/`. Comments are stripped first — this file's own header would otherwise
report itself.

Its `ACCEPTED` map holds **106 throws across 24 files in other lanes'
territory**, pinned from BOTH sides: a new throw in an accepted file fails, and
fixing one fails until the count comes down with it. Nothing outside this
lane's two features was edited to satisfy a lint this lane introduced.

## 7. Two defects found on the way

- **`api/domain/shipping/operations/tests/get-tracking-http.test.ts` was
  asserting something the new rule makes impossible.** It required at least one
  REACHED timeline rung, but the cassette's single scan is FedEx's `OC`, which
  the provider maps to "Label Created" — our own act, which `trackingTimeline`
  drops on purpose. It now asserts the whole four-stage ladder is drawn with
  none reached, and proves the scan landed on the ROWS instead, which is the
  stronger claim anyway.
- **`audit:silent-mutations` went from 16 to 15**, by deletion rather than
  observation: `shipping/pickups/service.ts`'s `remove` helper discarded
  `pickups.remove()`'s result and returned a hard-coded `true`, so its caller
  could not have told the difference either way. It had no production caller
  and its own header said so. `CEILING` is lowered to match.

## 8. Verification

| gate | result |
|---|---|
| `pnpm check:fast` | PASS but for `figma:inventory` (Jacob's map, not this lane's) |
| `pnpm --filter @dorado/api test` | 217 files, 1284 passed, 1 skipped |
| `pnpm --filter @dorado/client typecheck` + `test` | 0, 17 passed |
| `pnpm --filter @dorado/frontend typecheck` + `test` | 0, 39 files / 211 passed |
| `pnpm --filter @dorado/api validate:wire` | 27 shapes match, 0 diverge, 3 skipped for want of a fixture |

## 9. Files outside this lane that had to move with it

Nothing here is a rework — each is a call site of a type or a hook this lane
owns, changed in the same diff because leaving it broken is not an option.

- **`api/domain/orders/*` (7 files) and `api/domain/checkout/service.ts`** —
  `ComposedFulfillment` became `FulfillmentView`, so `draft.order_id` is
  `draft.fulfillment.order_id`. Two-line changes each.
- **Eight admin frontend files** (frozen — Jacob's agents are reworking the
  tables): the five purchase-order drawer contents/footer, two sales-order
  contents, and `AdminPreparing.test.tsx`. They follow `Shipment` →
  `ShipmentView` (`shipment.tracking_number` is `shipment.shipment.
  tracking_number`) and swap `useShipmentDisplay`/`useShipmentPickups`/
  `useTracking` for members of the view. `admin-routes.json` loses the two
  routes that stopped being admin-only or stopped existing.
- **`frontend/features/stripe/queries.test.tsx`** (payments lane, test only) —
  `useSaleShippingServices` moved to `@dorado/client`, which talks to `fetch`
  rather than the axios wrapper that file stubs, so the hook is mocked with the
  row the stub used to answer with. No assertion changed.

## 10. Left for someone else

- **`frontend/features/carriers` is untouched.** It is admin UI, and admin
  frontend is frozen while Jacob's own agents rework the tables. Its hooks
  exist in `@dorado/client` already (`useCarriers`, `useCarrierServices`,
  `useCreateCarrier`, …) — the surface is one import swap away whenever that
  freeze lifts, and `frontend/features/shipping/queries.ts` shrinks to nothing
  with it.
- **`AdminInTransit.tsx`'s cancel button disables on
  `shipment.actions.edit_tracking`**, which is `!label_type` and therefore
  right by accident. `actions.cancel_label` is the purpose-built answer and also
  covers a delivered parcel. One line, in a frozen file.
- **`db/orders/tests/repo.test.ts`'s "a status change with no actor keeps the
  previous author and still moves `updated_at`" is FLAKY** — roughly one run in
  three, on a clock-resolution race between two writes in one transaction. It
  is the orders lane's file and predates this work; reproduced by running that
  file alone three times.
- **A pickup or direct has no `remove` use case of its own**, only
  `cancelSchedule`, which clears both tables because the caller does not say
  which kind of booking exists. That is deliberate and stated in
  `fulfillments/service.ts`; a per-child cancel would need the caller to know
  something the view already tells it.

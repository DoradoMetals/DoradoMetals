# The admin order PATCH surface

Owner: patch-surface lane (dispatched 2026-08-29).
One writer per file. The A3 bar in `docs/waves/phase3-api.md` moves with this.

```
J1. six PATCH bodies -> one contract, adopted   ██████████████████  100%
J2. the payout fee waiver (flag + checkbox)     ██████████████████  100%
```

D87 consolidated ~25 RPC routes into six PATCH endpoints. They are the newest
code on the project and they were the only endpoints no contract described:
each request body was declared twice, once in `api/features` and once in
`frontend/features`, with nothing between them. Four of the six had drifted.

## The null decision, per field

Two of the drifts were defects rather than untidiness. The API accepted `null`
to CLEAR five values and the frontend's own type made sending that null a
compile error — so either the clear was unreachable from the only client that
exists, or the API was accepting a null it should refuse. **Four refuse it, one
keeps it**, and the split is the point: a rule about nulls applied five times
would have been wrong on at least one of them.

| field | verdict | why |
|---|---|---|
| `ShipmentPatch.shipping_charge` | **null REFUSED** | `editShippingCharge` takes `shipping_charge: number` and the patch service reached it through `as number` — the null was a cast, not a capability. Every reader is `?? 0`, so a cleared charge and a zero one price identically. There is no third state to express, and a stored fee is a record (D117): "free" is `0`. |
| `RefinerOrderPatch.pool_oz_deducted` | **null REFUSED** | Its exchange shadow `updatePoolOzDeducted` takes `number`; same cast, same `?? 0` readers. |
| `RefinerOrderPatch.pool_remediation` | **null REFUSED** | Same. |
| `RefinerOrderPatch.fee` | **null REFUSED** | Same, and it is a fee, so D117 applies to it as it does to the shipping charge. |
| `RefinerOrderPatch.refiner_id` | **null KEPT** | A nullable FOREIGN KEY, not a fee. `ensureForOrder` inserts `(order_id)` alone, so every engagement STARTS null — null is the column's own "no refinery yet", not the erasure of a record. Detaching an engagement is a real operation (the metal went to the wrong refinery), `setEngagementValue` already admits null, and there is no exchange shadow to disagree: exchange never recorded which refinery had the metal. **Here the frontend was the side that was wrong**, and it widened to `string \| null`. |

The control that keeps the four honest is `RefinerItemPatch`: all five of its
fields are nullable and **stay** nullable, because the assay drawer really
sends those nulls and the service really merges them as "not measured". The
four above were decided on their own facts, not by a preference.

## What moved into the contracts, and what adopted it

`packages/contracts/src/wire/patches.ts` — nine exports, every one imported by
both sides in the same diff (D176; an unadopted contract has the authority of a
comment while looking like a guarantee).

| contract | API adopts | frontend adopts |
|---|---|---|
| `OrderPatch` | `features/orders/patch.service.ts` | `features/orders/patch.ts` |
| `OrderItemPatch` + `OrderItemScrapPatch` + `OrderItemBullionPatch` | `features/orders/items/service.ts` | `features/orders/items.ts` |
| `ShipmentPatch` | `features/shipping/shipments/patch.service.ts` | `features/shipping/queries.ts` |
| `RefinerOrderPatch` + `RefinerSpotWrite` | `features/refiners/orders/service.ts` | `features/refiners/queries.ts` |
| `RefinerItemPatch` | `features/refiners/items/service.ts` | `features/refiners/queries.ts` |
| `PayoutPatch` | `features/payouts/service.ts` | `features/payouts/queries.ts` |

**Adoption is runtime, not just types.** Each service's `FIELDS` list is now
`Object.keys(<Contract>.shape)`, so a field added to the contract and not to
the service is not expressible, and each `refusedField` ends by parsing the
document through the contract. `shared/http/patch-body.ts` holds the two
halves.

**THE ORDER OF THE TWO CHECKS IS LOAD-BEARING.** zod STRIPS unknown keys
rather than rejecting them, so a document parsed first would turn a typo'd
field into a silent 200 that wrote nothing — which is the admin-mutation-urls
bug the whole consolidation exists to end. Unknown fields are refused BY NAME
first; nothing unknown survives to reach the schema.

**And nothing reads `parsed.data`.** Every dispatch still runs off the original
body, because a patch document distinguishes absent from null from a value and
handing the dispatch a rebuilt object is how that distinction gets lost (D182).
`ServiceInput`'s discipline, kept.

## Defects found on the way, not untidiness

1. **A partial bullion edit NULLED the column it did not name.**
   `updateBullion`'s statement is `SET quantity = $1, premium = $2`,
   unconditionally, and the API typed the body `{ quantity?, premium? }`. A
   document naming only `premium` sent `undefined` for quantity and pg wrote
   NULL — a bullion line silently losing how many coins the customer sent. The
   frontend's type had both REQUIRED and said why; the API's did not. The
   contract requires what the statement writes, and the endpoint now refuses a
   partial by name. The same argument applies to `scrap`, whose service
   re-writes the line's premium in the same transaction.

2. **`confirmed: false` answered 200 having written nothing.** The dispatch is
   `body.confirmed === true || body.reset === true`, so `false` passed the field
   check, matched no branch, and reported success. `reset: true` is how a line is
   unconfirmed. Both are `true`-only now, and `false` is a named 400.

3. **`updateRefinerPremium` was typed `refiner_premium: number` and it is
   nullable.** Both sides of the wire say `premium: number | null`, the drawer
   really sends the null to clear an entry made by mistake, and the statement
   under it is a plain `SET refiner_premium = $1` that has always written it.
   The call site was reaching it through `as number`. Widened.

4. **`finalize_pricing` and `supplier.send` were typed `boolean` on the API
   while `refusedField` had always refused anything but `true`.** The type
   described an endpoint that does not exist. `add_funds` was the same and had
   no refusal at all — `add_funds: false` was a silent no-op; it is a named 400
   now.

## The payout fee waiver

Jacob, 2026-08-29, on the four production payouts whose stored `cost`
disagrees with `features/payouts/constants.ts`: *"Yes those are cases we have
waived it. Would actually be somewhat nice to have a checkbox for waiving fee
or something."*

**Verified read-only against production first, and the nuance holds: only TWO
of the four are waivers.**

```
ACH             0     x11
DORADO_ACCOUNT  0     x2
ECHECK          0     x39,   75  x1,  125  x1     <- ABOVE the 0 default
WIRE           20     x6,     0  x2               <- BELOW the 20 default
```

`waive_payout_fee` is `false` on all 62 production purchase orders, and so is
`waive_shipping_fee`. So the two ECHECK rows are **charges**, and a boolean
cannot express a charge. **The design admits both**: `cost` stays the per-order
fee (it already was, and `PATCH /payouts/:id { cost }` already wrote it), and
`waive_payout_fee` is a separate field beside it. Nothing was backfilled onto
historical rows — which of them were waived is Jacob's knowledge, not a
derivation.

### How it reads at the API

`orders.transactions.waive_payout_fee` already existed, was read, composed and
mirrored, and had **no writer and no UI** — verified before building. So this
is a PATCH field and a checkbox, not new plumbing.

- **Write**: `PATCH /api/payouts/:id { waive_payout_fee: boolean }` →
  `setWaivePayoutFee` → `exchange.purchase_orders.waive_payout_fee`, and the
  MIRROR re-derives `orders.transactions.waive_payout_fee` from it.
  **The exchange write is mandatory, not a dual-write habit**:
  `mirrorPurchaseOrder` rebuilds `orders.transactions` from
  `exchange.purchase_orders` on every subsequent order write, so a native-only
  write here would be silently reverted by the next status change. (This is the
  mirror image of `payout_fee`, which is *not* a column of that table, which is
  why `editPayoutCharge` has to write the new schema itself.)
- **Refusal**: a payout whose order is a SALE has nowhere to record the flag,
  so the write returns "no row matched" and the endpoint answers 422 rather
  than a 200 that wrote nothing.
- **Effect**: `pricing/bid.ts` gains `effectivePayoutFee(order)`, and the three
  surfaces that price a payout fee — the stored total
  (`calculateTotalPrice` → `finalizePricing`), the drawer estimate
  (`quotes.orderQuote`) and the customer's line in the profit breakdown — all
  go through it. One expression, so a waived order cannot show a deduction on
  the drawer and none on the invoice.

One small behaviour change rides along and is deliberate: `orderQuote` and the
profit breakdown read the fee through `fee()` now rather than `Number(x ?? 0)`,
so a value that is present and not a number THROWS instead of turning the
drawer's total into a silent NaN. It cannot fire from the real read — `cost` is
NUMERIC with a parser registered in `api/db.ts` — and it is the stance
`calculateTotalPrice` already took two lines away.

**THE STORED FEE IS NOT OVERWRITTEN.** D117: a stored fee is a record and must
never be re-derived. Waiving sets the flag and the effective fee becomes 0;
`exchange.payouts.cost` and `orders.transactions.payout_fee` keep what they
would have been, so un-waiving restores that number rather than guessing one
out of a defaults table four production rows already disagree with. Pinned by
`features/payouts/tests/patch.test.ts`, which asserts the record survives a
round trip, and by an HTTP test that a waive raises `/quotes/order`'s total by
exactly the stored fee.

### How it reads in the UI

A `Checkbox` labelled "Waive Payout Fee", in `AdminReceived.tsx`, directly
under the Shipping Charge / Payout Charge inputs it prices — the surrounding
pattern, not a new one, because the order drawers are interim UI. It reads its
state from `order.totals?.waive_payout_fee` (the flag's column is on
`orders.transactions`, which the order wire serves as `totals`) and writes
keyed by the payout id, like the two controls above it. Nothing is optimistic:
the waive is a price flip, and priced fields refetch (D83).

## Left standing, deliberately

- **`waive_shipping_fee` is the same shape and was NOT built.** It is a column
  of `orders.transactions` and `exchange.purchase_orders`, `false` on all 62
  production rows, read and composed and mirrored, with no writer, no UI and no
  effect on any price. Jacob asked for the payout one. Building the shipping one
  unasked would be inventing policy about who pays for a parcel.
- **`ReturnShipmentOnPatch` stayed in the frontend.** The wire admits any object
  under `cancel.return_shipment` because the API does — `patchOrder` hands it
  straight to the cancel pipeline without reading a field of it — and the
  frontend's narrowing is assembled from this app's own package / pickup /
  service / insurance FORM schemas, which are UI policy, not table-derived.
  Naming it in the contracts would drag four form schemas into a package the API
  imports.
- **No `*_SOURCE` switch was touched, no migration was written, and production
  was read only.** `waive_payout_fee` needed no schema change: the column has
  existed since 033.

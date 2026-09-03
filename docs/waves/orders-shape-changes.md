# Orders: every request and response shape that changed

The streamlining pass on `orders` (D214 items 11 and 12) rewrote each use case
from its INPUTS inward, so the wire moved wherever the inputs moved. Ruling 44,
reaffirmed 2026-09-03: *"I imagine this will cause the frontend to break and
THATS OK."* This file is the list the frontend pass (D214 item 8) works from.

Nothing here is a rename for tidiness. Every change is one of four kinds:

- **an action stopped being a flag in a PATCH body** and became its own POST;
- **a document the browser composed became an id** the server resolves;
- **a display NAME became the ID** it was always a lookup for;
- **the composed order died** and one `OrderView` of generated row schemas
  replaced two hand-written projections.

---

## 1. Creating an order — one route shape, both directions

| | before | after |
|---|---|---|
| `POST /api/purchase_orders/create_from_checkout` | no body | `{ checkout_id }` |
| `POST /api/sales_orders/create_sales_order` | `{ sales_order: {address, items[], using_funds, service, payment_method}, payment_intent_id, user?, spot_prices? }` | `{ checkout_id }` |
| `POST /api/sales_orders/admin_create_sales_order` | the same document plus `user` | `{ checkout_id }` |

The URLs are unchanged (the REST pass is separate work). All three reach one
handler and one use case, `place(checkout_id)`.

**Every field that left the sale body is a column the server already holds:**

- `address` → `checkout.checkouts.recipient_address_id`
- `items[]` → `checkout.items`
- `service.value` / `service.label` → `checkout.checkouts.carrier_service_id`
  (the row's `code` prices the delivery, its `name` is stored as
  `shipping_service`)
- `payment_method` → `checkout.checkouts.payment_method_id` (the row's `type`
  decides the card surcharge)
- `user` → the checkout row's own `user_id`. An admin places a customer's order
  by naming that customer's CHECKOUT.
- `spot_prices` → never read; the server prices from its own feed.
- `payment_intent_id` → resolved server-side. The customer's own open intent is
  selected by `user_id`; an id in the body could name somebody else's.
- **`using_funds` → GONE, and this one is a BEHAVIOUR CHANGE, not a move.**
  Credit is applied whenever the customer has a balance. The pricing already
  caps what is applied at the order's own total and holds back a sliver below
  Stripe's minimum, so nothing over-applies — but a customer who unticked the
  box previously kept their credit and now spends it. **Flagged for Jacob.**

**Response**: all three return `OrderView` (see §5), where they returned the
composed purchase or sale order.

**New refusals**: `422 the checkout is not complete - missing <fields>`,
`422 this order has a card charge and the customer has no open payment intent`,
`403 checkout <id> is not yours`.

Frontend: `features/checkout/queries.ts`,
`features/checkout/sales-order-checkout/salesOrderCheckout.tsx`,
`features/orders/salesOrders/admin/createSalesOrder/createSalesOrderDrawer.tsx`,
`features/orders/salesOrders/admin/queries.ts`,
`features/orders/salesOrders/users/queries.ts`.

---

## 2. `PATCH /api/orders/:id` — four actions became four routes

`OrderPatch` is now `OrdersRow.pick({ status, notes }).partial().strict()`.
Anything else is a `400` naming the field.

| was | is |
|---|---|
| `{ add_funds: true }` | `POST /api/orders/:id/add_funds`, no body |
| `{ finalize_pricing: true }` | `POST /api/orders/:id/finalize_pricing`, no body |
| `{ cancel: { return_shipment: {...} } }` | `POST /api/orders/:id/cancel` (§3) |
| `{ supplier: { supplier_id, send: true } }` | `POST /api/orders/:id/send_to_refiner` `{ refiner_id }` |
| `{ status }` | unchanged |
| — | `{ notes }` is new; an explicit `null` clears it |

Every one of the four is `requireAdmin` and answers `OrderView`.

**Status codes moved.** A wrong-direction action was a `400` from the body's
field table; it is a `422` from the use case now, with the same message shape
(`"finalize_pricing is a purchase-direction operation and this is a sale
order"`). A body a schema cannot parse is still `400`.

Frontend: `features/orders/patch.ts`, `features/orders/invalidation.ts`,
`features/orders/purchaseOrders/admin/queries.ts`,
`.../adminPurchaseOrderActionButtons.tsx`, `.../adminPurchaseOrderDrawerFooter.tsx`,
`.../adminPurchaseOrderDrawerHeader.tsx`,
`features/orders/salesOrders/admin/adminSalesOrderDrawer/**`,
`features/orders/salesOrders/admin/queries.ts`,
`features/orders/purchaseOrders/users/purchaseOrderDrawer/**`.

---

## 3. `POST /api/orders/:id/cancel`

```
{ carrier_service_id, package_id, declared_value, weight }
```

It took the admin drawer's whole return-shipment form
(`{address, service, pickup, package, insurance}`) typed `Record<string, any>`.
Now:

- the address is the ORDER's own snapshot (`orders.addresses` → `places.addresses`);
- the sender is the business's configured contact (`providers/shipments/constants.ts`);
- the carrier is resolved from `carrier_service_id`, so no FedEx id is spelled
  in orders any more;
- `declared_value` is clamped against the service's insurance ceiling;
- `weight` is the one genuine MEASUREMENT — nothing stores what the parcel
  going back weighs.

**New refusal**: `422 order <n> has no address snapshot, so its metal cannot be
returned`.

Frontend: `features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/**`
(the return-shipment form).

---

## 4. Order lines

### `POST /api/orders/:id/items`

| was | is |
|---|---|
| `{ item: { id } }` | `{ bullion_id }` |
| `{ item: { metal: "Gold", pre_melt, purity, gross_unit, content, bid_premium } }` | `{ metal_id, pre_melt, purity, unit }` |

A union of two strict members. No metal NAME crosses the wire; `content` is
derived by a rule; the premium is the rate band's, written by the re-tier.
The response is the created row (it was `{ updated: <row> }`).

### `PATCH /api/orders/items/:id`

`OrderItemPatch` is ONE FLAT patch derived from `orders.items`:

```
{ pre_melt?, post_melt?, purity?, premium?, quantity?, confirmed?, unit? }
```

| was | is |
|---|---|
| `{ scrap: { premium, scrap: {...} } }` | the columns, at the top level |
| `{ bullion: { quantity, premium } }` (both REQUIRED) | either, alone |
| `{ confirmed: true }` / `{ reset: true }` | `{ confirmed: true }` / `{ confirmed: false }` |
| `scrap.purity_actual`, `scrap.post_melt_actual` | `PATCH /api/refiners/items/by-order-item/:id` |
| `content` | derived; refused as a field |

A key present is written, an explicit `null` clears, an absent key is left
alone — so a partial edit no longer nulls its neighbour. The response is the
updated row (it was `{ success: true }`).

Frontend: `features/orders/items.ts`, `.../AdminReceived.tsx`,
`.../editActualValues.tsx`, `.../editRefinerValues.tsx`.

---

## 5. `OrderView` — the composed order is gone

`compose.ts` (608 lines) and `read.service.ts` (470) are deleted. Anything that
needs a whole order gets `OrderView`, declared in `@dorado/contracts` from
generated row schemas:

```
{ order, totals, items[] (each + product|null), address, shipments[], pickup, payout, user }
```

Rules it obeys, each of which the composer broke:

| composed | OrderView |
|---|---|
| order columns at the top level | `order` — the `orders.orders` row |
| `totals` (ten hand-picked keys) | `totals` — the `orders.transactions` row, or `null` |
| `order_items[]` with `item_type`, `scrap{}`, `product{}` | `items[]` — `orders.items` rows; kind is `bullion_id === null`; `product` is the catalogue row or `null` |
| `scrap.metal`, `product.metal_type` | `metal_id` (the client maps names from `/spots`) |
| `scrap.purity_actual` etc. | `GET /orders/:id/refiners/items` |
| `address` (the BOOK row, from `exchange.addresses`, with `recipient_name`) | `address` — the `places.addresses` SNAPSHOT, or `null`. **There is no `recipient_name`**: the recipient is `user.name`. |
| `shipment` + `return_shipment` (all-null when absent) | `shipments[]` — rows with their own `direction` |
| `shipment.shipping_charge` / `.shipping_service` / `.package` | `cost` / `carrier_service_id` / `package_id` |
| `shipment.shipping_label` (base64, wrapped at 76 chars) | still `label`; the document endpoints serve the bytes |
| `carrier_pickup` | `pickup` — the `shipping.pickups` row or `null` |
| `payout` (all-null when absent) | `payout` — last-4 only, or `null`. `created_at` dropped. |
| `user.user_id / user_name / user_email` | `user.id / name / email` (from `auth.users`), or `null` |

**GET /api/orders and the order-scoped reads are unchanged** — the slim list is
still the row plus `totals`, and `validate:wire` passes on all 28 shapes.

---

## 6. `PUT /api/orders/:id/spots`

`set` names the metal by ID, not by display name.

| was | is |
|---|---|
| `{ lock?, set?: [{ name, bid }] }` | `{ lock?, set?: [{ metal_id, bid }] }` |

The read (`GET /orders/:id/spots`) already served `metal_id`, so the client has
the value. A body naming neither field is `422`.

Frontend: `features/orders/purchaseOrders/admin/queries.ts` (the spot editor).

---

## 7. Documents and mail — the body is one id

| route | was | is |
|---|---|---|
| `POST /api/emails/purchase_order_priced` | `{ order: {...}, order_spots, spot_prices, email? }` | `{ order_id }` |
| `POST /api/emails/purchase_order_created` | (already removed, D91) | still 404 |

The PDF routes already took `{ order_id }`; what changed is what they load.

Frontend: `features/pdfs/queries.ts`,
`features/orders/purchaseOrders/admin/queries.ts` (the priced-mail button).

---

## 8. Error statuses, across the whole API

`api/shared/errors.ts` gives the domain four refusals and the middleware maps
them. Seventeen domain files stopped naming HTTP codes.

| kind | status |
|---|---|
| `NotFound` | 404 |
| `Forbidden` | 403 |
| `Conflict` | 409 |
| `Invalid` | 422 |

**A domain refusal that used to be `400` is now `422`.** The ones a client can
see today:

- checkout: a bad `direction`, an address not in the caller's book, a reference
  id that matches no row, a malformed `appointment_time`, a product that is not
  available;
- payouts: the payout PATCH's field check, and every payout-form rule
  (`ACH needs a bank name...`, `the routing number must be 9 digits`,
  `no such payout method`);
- payments: an admin intent that names no customer;
- fulfillments, refiners, shipping: the same class.

`400` still means what it always meant: a body or a path id the transport could
not parse. Frontend code that branches on `res.status === 400` for a *rule*
refusal must branch on `422`.

---

## 9. Behaviour changes worth a second look

1. **Sale credit is automatic** (§1) — the only change here that alters money.
2. **A refiner's assay report no longer writes the customer's declared weight.**
   `PATCH /api/refiners/items/by-order-item/:id` used to go through the order's
   line edit, so `pre_melt` landed on `orders.items`. It writes `refiners.items`
   only now.
3. **A metal with no live quote refuses a placement** rather than freezing a
   null spot (which priced that metal at zero).
4. **A line edit re-tiers the order** when it changes a weight, a purity, a unit
   or a quantity — and does NOT when the document also names a premium, which is
   an admin's deliberate override.
5. **`calculateReturnDeclaredValue` honours a stored price.** It used to ignore
   `item.price` and reprice off spot; there is one price expression now. Every
   line an order in flight holds is unpriced, so the number moves only for an
   order that was already finalised.

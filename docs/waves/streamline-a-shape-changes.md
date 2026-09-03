# streamline-a: every request and response shape that changed

The streamlining pass (D214 item 11) over **payments, users, payouts, refiners,
quotes and sales-tax**, rewritten from each use case's INPUTS inward. Ruling 44,
reaffirmed 2026-09-03: *"I imagine this will cause the frontend to break and
THATS OK."* This file is the list the frontend pass (D214 item 8) works from.

Every change is one of four kinds:

- **a composed document became ids** the server resolves;
- **a price-shaped field that was accepted-and-ignored is now REFUSED**, because
  a field a strict schema has no place for cannot be read by accident later;
- **a display NAME became the ID** it was always a lookup for;
- **a hand-rolled `Refusal` validator became a strict contract parse**, which
  moves a shape complaint from 422 to 400.

URLs are unchanged throughout — the REST pass is separate work.

---

## 1. `POST /api/stripe/update_payment_intent` — the cart, priced

| | before | after |
|---|---|---|
| body | `{ items[], using_funds, spots?, user{id,dorado_funds}, shipping_service, payment_method, type, address_id }` | `{ items:[{id,quantity}], address_id?, carrier_service_id?, payment_method_id?, user_id?, type? }` |

- `user` → **`user_id`**. It carried `dorado_funds`, so **a request declared the
  credit balance it was priced against**. The balance is read from the
  customer's own `auth.users` row now.
- `spots` → **gone**. Declared-and-ignored kept a deployed client from a 400; on
  this branch a body carrying it is refused.
- `shipping_service` → **`carrier_service_id`** (the row's `code` prices
  delivery); `payment_method` → **`payment_method_id`** (the row's `type`
  decides the card surcharge). Resolved exactly as `orders/place.ts` resolves
  them from the checkout.
- `items[]` is strict `{id: uuid, quantity: number}` — no longer a loose
  catalogue product.
- **`using_funds` → GONE, and this is a BEHAVIOUR CHANGE.** Credit applies
  whenever the customer has a balance, which is what placement already does
  (the orders pass flagged the same change for `OrderCreate`). Keeping the flag
  here would price the intent differently from the order the intent pays for.
  **Flagged for Jacob**, same decision as the orders doc's §1.
- New refusals: `404 no user <id> to price this intent for`; `403` for a
  non-admin sending `type: "admin"` (previously only `retrieve` checked).

Frontend: `features/stripe/queries.ts`,
`features/checkout/sales-order-checkout/**`,
`features/orders/salesOrders/admin/adminSalesOrderDrawer/**`,
`features/orders/tests/authed/admin-sales-order-work.e2e.ts`.

## 2. `POST /api/quotes/*` — every body is now a contract

| route | before | after |
|---|---|---|
| `/catalog` | `{ side, items:[{id,quantity?}] }`, loose | `CatalogQuoteBody`, strict |
| `/sales_order` | `{ items[], using_funds, shipping_service, payment_method, address_id, user_id }` | `{ items:[{id,quantity?}], address_id?, carrier_service_id?, payment_method_id?, user_id? }` |
| `/purchase_order` | `{ items:[{type,data:{...},product_name?}], payout_method, shipping_charge }` | `{ items: PurchaseQuoteItem[], payout_method_id?, shipping_charge? }` |
| `/order` | `{ order_id, ...anything }` | `{ order_id }`, strict |
| `/profit_breakdown` | `{ order_id, ...anything }` | `{ order_id }`, strict |

`PurchaseQuoteItem` is a discriminated union:
`{ type:"product", bullion_id, quantity? }` or
`{ type:"scrap", metal_id, pre_melt, purity, unit? }`.

- **A scrap line can no longer declare its own `content`** — that is the
  quantity of fine metal the customer is paid for. The server derives it from
  the declared weight, purity and unit (`convertTroyOz(pre_melt, unit) *
  purity`), which is the same formula the old code used only when `content` was
  absent.
- **The product NAME lookup is gone** (with it, D73's two spellings
  `data.name` / `data.product_name` and the `SELECT id FROM products.bullion
  WHERE name = ...` behind them). A product line names its catalogue id.
- **A scrap line names its metal by id**, not `"Gold"`. A metal with no live
  spot is refused (`422 that metal has no spot price today`) rather than priced
  at nothing.
- `payout_method` (a name) → `payout_method_id`. The fee rule is unchanged: the
  method row's `type` is looked up in `payouts/constants.ts`.
- `using_funds` removed from the sales-order quote for the same reason as §1.
- Responses are **unchanged** — the five quote shapes in
  `contracts/wire/quotes.ts` are the permanent contract and none moved.
- Statuses: the liveness refusal ("That product is not available") and the
  band/method/spot refusals are **422** now, not 400 — they are domain rules.
  A malformed or poisoned body is **400** from the strict parse.

Frontend: `features/quotes/queries.ts`, `features/quotes/catalogPrices.ts`,
`features/products/ui/{ProductCard,BullionCard,BullionTab,ProductCards}.tsx`,
`features/scrap/ui/ScrapTab.tsx`, `app/buy/page.tsx`, `app/page.tsx`,
`features/checkout/purchase-order-checkout/**`,
`features/orders/purchaseOrders/**` (drawers, footers, `viewProfitBreakdown`).

## 3. `POST /api/tax/get_sales_tax` — ids in

| | before | after |
|---|---|---|
| body | `{ address:{state}, items: [whole product documents], spots? }` | `{ address_id?, items:[{id,quantity}] }` |

The body **used to be the items**: a caller sent a product's purity, weight,
tender flags and price, which are exactly the facts a tax rule matches on — so
a caller could choose the rate they were charged. Both the address and the
products are rows the server reads now.

- `422/400` for a body carrying `spots`, `address`, or inline item facts.
- `404 no address <id>` for an address id that names nothing — previously an
  unknown address silently taxed at zero, indistinguishable from a state that
  does not collect.
- `address_id: null` (no address chosen yet) still answers `0`, which is
  correct and now distinguishable from the refusals above.
- The legacy `product_type` spelling is retired; `products.bullion.type` is the
  one spelling.

Frontend: **no caller** — this endpoint has no frontend consumer today.

## 4. `PATCH /api/payouts/:id`

Body unchanged (`{cost?, method?, waive_payout_fee?}`), but `PayoutPatch` is
`.strict()` and parsed at transport. **An unknown field or a wrong-typed value
moves 422 → 400**; the domain refusals (`no such payout method`, `not on a
purchase order`, `names no field to write`) stay 422/404.

Frontend: `features/payouts/queries.ts`,
`features/orders/purchaseOrders/admin/**`.

## 5. `PATCH /api/refiners/orders/:id`

| | before | after |
|---|---|---|
| `spots[]` | `{ name: "Gold", bid }` | `{ metal_id, bid }` |

`RefinerSpotWrite` takes the metal's **id**. `refiners.spots` is keyed on
`(order_id, metal_id)`, the client already holds the id, and the old name
lookup **silently skipped** a bid whose spelling did not resolve (`if (!metal_id)
continue;`). `RefinerOrderPatch` is `.strict()`; the response is the written
engagement row (it was `unknown`).

Frontend: `features/refiners/queries.ts`.

## 6. `PATCH /api/refiners/items/by-order-item/:orderItemId`

Response `{success: true}` → **the written `refiners.items` row**.
`RefinerItemPatch` is `.strict()`, so `content` (derived) is refused by the
contract rather than by a bespoke message — still a 400, the wording changed
from *"content is derived from post_melt and purity"* to the schema's own
"unrecognized key".

Frontend: `features/refiners/queries.ts`.

## 7. `POST /api/users/update_credit`

Body and response unchanged. The service no longer validates `op`/`amount`
itself (`UpdateCreditBody` is already strict-parsed at transport), so an
unknown op is **400 from transport** rather than 400 from the service, and the
negative-balance refusal is a domain `Invalid` (**422**, as before) and the
unknown-user refusal a `NotFound` (**404**, as before) — they carry `kind`
rather than `statusCode`.

Frontend: `features/users/queries.ts`.

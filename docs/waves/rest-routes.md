# REST routes — inventory and proposed map

FOLLOWUPS D214 item 4. Jacob: *"I would love to have 'proper' rest API
transport. instead of: `/api/orders/create_purchase_order` it could be
`/api/orders/create/:direction/:checkout_id` (or something)."* The
orchestrator's ruling, which this document treats as the design rule: **the
verb is the METHOD, not the path.** `POST /api/orders` with body
`{ direction, checkout_id }` -> 201; `GET|PATCH|DELETE /api/orders/:id`;
sub-resources as nouns (`GET /api/orders/:id/items`); `POST
/api/orders/:id/cancel` only for a real action that is not a field change.
This retires ruling 13 (URLs frozen for the schema migration, CLAUDE.md);
the frontend adapts after, per ruling 44. Nothing in this document has been
implemented — it is read-only research and a plan.

**Today: 132 itemized routes** (counted from every `router.<method>` call
across `api/app.ts` and every `api/transport/**/routes.ts`), plus one
catch-all — `app.all("/api/auth/*splat", toNodeHandler(auth))` — that
delegates an unspecified number of sub-paths (sign-in, sign-up, session,
etc.) to better-auth's own router and is out of scope here; and the raw
Stripe webhook receiver mounted directly in `app.ts`.

## Conventions (the rule, restated per surface)

- **Resource nouns, plural, at the mount.** `/api/orders`, `/api/leads`,
  `/api/products`. No verb segment (`get_`, `create_`, `update_`, `delete_`,
  `sync_`) survives — the verb is `GET`/`POST`/`PATCH`/`DELETE`.
- **An id is a path segment, never a query param or a body field**, once the
  resource has one. `?lead_id=` and `{ lead_id }` both become `/leads/:id`.
- **Status codes**: `201` + the row on create, `200` + the row on read/patch,
  `204` on delete, `404`/`409`/`422` as `shared/http/refuse.ts` already
  raises them.
- **List responses are bare arrays** (ruling 12) — no envelope object, ever.
- **Query filters replace path/body verb variants on lists**: `?direction=`,
  `?status=`, `?user_id=` (admin-only — the session supplies the caller's
  own).
- **An action endpoint is earned, not defaulted to.** `POST
  /resource/:id/<verb>` only where the operation is not a stored field: it
  calls an external system, it is non-idempotent business logic, or (as
  `PATCH /api/orders/:id` proves below) it is currently one operation among
  several multiplexed through a single body flag.
- **Direction (`purchase`/`sale`) is a body field or query filter, never a
  path segment or a route namespace.** It already works this way for
  `orders.orders`; this document extends the same rule to `checkout.carts`
  and `payments` methods, which still duplicate by direction today.

## Route map: current -> proposed

One row per current operation. `Rule` legend: **REST** = already
resource/noun/method-shaped, unchanged. **VERB** = verb segment retired into
the HTTP method. **ID** = an id moves from query/body into the path.
**QUERY** = a `get_X_all`/`get_X_public` variant folds into the base list
via a query filter. **COLLAPSE** = a direction-duplicated (or otherwise
duplicate) pair of routes merges into one endpoint. **ACTION** = kept/placed
as a genuine `POST .../:id/<verb>`. **RELOCATE** = moves to the
resource/mount that actually owns the data. **MOUNT** = infrastructure,
unchanged, not a resource.

| Resource | Current | Proposed | Rule | Handler | Auth | Body |
|---|---|---|---|---|---|---|
| orders | POST /api/purchase_orders/create_from_checkout | POST /api/orders `{direction:"purchase"}` -> 201 | COLLAPSE | orders/controller.ts#createPurchaseOrderFromCheckout | requireUser | none (D210 zero-body) |
| orders | POST /api/sales_orders/create_sales_order | POST /api/orders `{direction:"sale",...}` -> 201 | COLLAPSE | orders/controller.ts#createSalesOrder | requireAdmin (buy-side gate, temp) | contract (SalesOrderCreate) |
| orders | POST /api/sales_orders/admin_create_sales_order | POST /api/orders `{direction:"sale", user, ...}` -> 201 | COLLAPSE | orders/controller.ts#adminCreateSalesOrder | requireAdmin | contract (SalesOrderCreate + user) |
| orders | POST /api/purchase_orders/create_review | POST /api/orders/:id/review | COLLAPSE+ACTION | orders/controller.ts#createOrderReview | requireUser+own | contract (OrderReviewCreate) |
| orders | POST /api/sales_orders/create_review | POST /api/orders/:id/review (same as above) | COLLAPSE+ACTION | orders/controller.ts#createOrderReview | requireUser+own | contract |
| orders | GET /api/orders | GET /api/orders (?direction, admin ?user_id) | REST | orders/controller.ts#listOrders | requireUser | none |
| orders | PATCH /api/orders/:id `{status}` | PATCH /api/orders/:id `{status}` | REST | orders/patch.ts#patchOrder | requireAdmin | contract (status only) |
| orders | PATCH /api/orders/:id `{add_funds:true}` | POST /api/orders/:id/add_funds | ACTION | domain/orders/add-funds.ts | requireAdmin | none |
| orders | PATCH /api/orders/:id `{finalize_pricing:true}` | POST /api/orders/:id/finalize_pricing | ACTION | domain/orders/finalize-pricing.ts | requireAdmin | none |
| orders | PATCH /api/orders/:id `{cancel:{return_shipment}}` | POST /api/orders/:id/cancel | ACTION | domain/orders/cancel.ts | requireAdmin | `{return_shipment}` |
| orders | PATCH /api/orders/:id `{supplier:{send:true,supplier_id}}` | POST /api/orders/:id/send_to_refiner | ACTION | domain/orders/send-to-refiner.ts | requireAdmin | `{supplier_id}` |
| orders | GET /api/orders/:id/items | GET /api/orders/:id/items | REST | orders/items/controller.ts#getOrderItems | requireUser+own | none |
| orders | POST /api/orders/:id/items | POST /api/orders/:id/items -> 201 | REST | orders/items/controller.ts#createOrderItem | requireAdmin | contract (OrderItemCreate) |
| orders | PATCH /api/orders/items/:id | PATCH /api/orders/items/:id | REST (own-id write, ruling 26c) | orders/items/controller.ts#patchOrderItem | requireAdmin | untyped |
| orders | DELETE /api/orders/items/:id | DELETE /api/orders/items/:id -> 204 | REST | orders/items/controller.ts#deleteOrderItem | requireAdmin | none |
| orders | GET /api/orders/:id/spots | GET /api/orders/:id/spots | REST | orders/spots/controller.ts#getOrderSpots | requireUser+own | none |
| orders | PUT /api/orders/:id/spots | PUT /api/orders/:id/spots | REST | orders/spots/controller.ts#putOrderSpots | requireAdmin | untyped |
| orders | GET /api/orders/:id/address | GET /api/orders/:id/address | REST | orders/addresses/controller.ts#getOrderAddress | requireUser+own | none |
| orders | GET /api/orders/:orderId/fulfillments | GET /api/orders/:orderId/fulfillments | REST | fulfillments/controller.ts#getFulfillmentByOrder | requireAdmin | none |
| orders | GET /api/orders/:orderId/shipments | GET /api/orders/:orderId/shipments | REST | shipping/shipments/controller.ts#getShipmentsByOrder | requireUser+own | none |
| orders | GET /api/orders/:orderId/pickups | GET /api/orders/:orderId/pickups | REST | fulfillments/pickups/controller.ts#getPickupsByOrder | requireAdmin | none |
| orders | GET /api/orders/:orderId/directs | GET /api/orders/:orderId/directs | REST | fulfillments/directs/controller.ts#getDirectsByOrder | requireAdmin | none |
| orders | GET /api/orders/:orderId/payouts | GET /api/orders/:orderId/payouts | REST | payouts/controller.ts#getPayoutsByOrder | requireUser+own | none |
| orders | GET /api/orders/:orderId/refiners | GET /api/orders/:orderId/refiners | REST | refiners/orders/controller.ts#getRefinerOrderByOrder | requireAdmin | none |
| orders | GET /api/orders/:orderId/refiners/spots | GET /api/orders/:orderId/refiners/spots | REST | refiners/spots/controller.ts#getRefinerSpotsByOrder | requireAdmin | none |
| orders | GET /api/orders/:orderId/refiners/items | GET /api/orders/:orderId/refiners/items | REST | refiners/items/controller.ts#getRefinerItemsByOrder | requireAdmin | none |
| orders | POST /api/quotes/order `{order_id}` | POST /api/orders/:id/quote | RELOCATE+ACTION | quotes/controller.ts#orderQuote | requireUser+own | untyped |
| orders | POST /api/media/pdf/generate_packing_list `{order_id}` | POST /api/orders/:id/documents/packing_list | RELOCATE+ACTION | media/pdfs/controller.ts#generatePackingList | requireUser | untyped |
| orders | POST /api/pdf/generate_return_packing_list `{order_id}` | POST /api/orders/:id/documents/return_packing_list | RELOCATE+ACTION | media/pdfs/controller.ts#generateReturnPackingList | requireUser | untyped |
| orders | POST /api/pdf/generate_invoice `{order_id}` | POST /api/orders/:id/documents/invoice | RELOCATE+COLLAPSE+ACTION | media/pdfs/controller.ts#generateInvoice | requireUser | untyped |
| orders | POST /api/pdf/generate_sales_order_invoice `{order_id}` | POST /api/orders/:id/documents/invoice (same as above; direction reads off the order) | RELOCATE+COLLAPSE+ACTION | media/pdfs/controller.ts#generateSalesOrderInvoice | requireUser | untyped |
| orders | POST /api/emails/purchase_order_priced | POST /api/orders/:id/emails/priced | RELOCATE+ACTION | media/emails/controller.ts#sendPricedEmail | requireUser | untyped |
| checkout | GET /api/checkout | GET /api/checkout | REST (singleton, D208) | checkout/controller.ts#getCheckout | requireUser | none |
| checkout | PATCH /api/checkout | PATCH /api/checkout | REST | checkout/controller.ts#patchCheckout | requireUser | contract (CheckoutPatchBody) |
| checkout | POST /api/checkout/fulfillment | POST /api/checkout/fulfillment | ACTION (already noun-shaped; sets a category and clears the sibling detail row) | checkout/controller.ts#setCheckoutFulfillment | requireUser | contract |
| checkout | POST /api/checkout/payout | POST /api/checkout/payout | ACTION (seals a payout account, D210) | checkout/controller.ts#saveCheckoutPayout | requireUser | contract |
| checkout | GET /api/cart/get_cart | GET /api/cart?direction=purchase | COLLAPSE+VERB | checkout/controller.ts#getCart | requireUser | none |
| checkout | POST /api/cart/sync_cart | PUT /api/cart?direction=purchase | COLLAPSE+VERB | checkout/controller.ts#syncCart | requireUser | untyped |
| checkout | GET /api/cart/get_sell_cart | GET /api/cart?direction=sale | COLLAPSE+VERB | checkout/controller.ts#getSellCart | requireUser | none |
| checkout | POST /api/cart/sync_sell_cart | PUT /api/cart?direction=sale | COLLAPSE+VERB | checkout/controller.ts#syncSellCart | requireUser | untyped |
| payments | GET /api/stripe/retrieve_payment_intent | GET /api/payments/intent (?user_id= admin-only) | VERB+RELOCATE | payments/controller.ts#retrievePaymentIntent | requireUser (admin escalation via `?type=admin`, checked in-handler) | none |
| payments | POST /api/stripe/update_payment_intent | PATCH /api/payments/intent | VERB+RELOCATE | payments/controller.ts#updatePaymentIntent | requireUser | contract (UpdatePaymentIntentBody) |
| payments | GET /api/stripe/get_sales_order_payment_intent `?sales_order_id=` | GET /api/orders/:id/payment_intent | RELOCATE+ID | payments/controller.ts#getPaymentIntentFromSalesOrderId | requireAdmin | none |
| payments | POST /api/stripe/cancel_payment_intent | POST /api/payments/intents/:id/cancel | VERB+ID+ACTION | payments/controller.ts#cancelPaymentIntent | requireAdmin | contract (CancelPaymentIntentBody, minus id) |
| payments | GET /api/payments/methods | GET /api/payments/methods (?direction=) | REST | payments/methods/controller.ts#getMethods | none (public) | none |
| payments | POST /api/auth/stripe/webhook | POST /api/auth/stripe/webhook | MOUNT | payments/controller.ts#handleStripeWebhook | none (Stripe signature) | raw bytes |
| payouts | PATCH /api/payouts/:id | PATCH /api/payouts/:id | REST | payouts/controller.ts#patchPayout | requireAdmin | untyped |
| payouts | GET /api/payouts/:id/details | GET /api/payouts/:id/details | REST | payouts/controller.ts#getPayoutDetails | requireAdmin | none |
| products | GET /api/products/get_all_products | GET /api/products | COLLAPSE+VERB | products/controller.ts#getAllProducts | none (public) | none |
| products | GET /api/products/get_sell_products | GET /api/products?side=sell | COLLAPSE+VERB | products/controller.ts#getSellProducts | none (public) | none |
| products | GET /api/products/get_homepage_products | GET /api/products?homepage=true | COLLAPSE+VERB | products/controller.ts#getHomepageProducts | none (public) | none |
| products | GET /api/products/get_products | GET /api/products?... (named filters) | COLLAPSE+VERB | products/controller.ts#getFilteredProducts | none (public) | none |
| products | GET /api/products/get_product_from_slug | GET /api/products/:slug | VERB+ID | products/controller.ts#getProductFromSlug | none (public) | none |
| products | GET /api/products/get_admin_products | GET /api/products (admin auth expands the row set) or a separate admin path — see open questions | VERB (collapse tentative) | products/controller.ts#getAllAdminProducts | requireAdmin | none |
| products | POST /api/products/save_product | PATCH /api/products/:id | VERB | products/controller.ts#saveProduct | requireAdmin | untyped |
| products | POST /api/products/create_product | POST /api/products -> 201 | VERB | products/controller.ts#createProduct | requireAdmin | untyped |
| products | GET /api/products/get_product_types | GET /api/products/types | VERB | products/controller.ts#getAllTypes | requireAdmin | none |
| metals | GET /api/products/get_metals | GET /api/metals | VERB+RELOCATE (owned by spots feature) | spots/controller.ts#getAllMetals | requireAdmin | none |
| mints | GET /api/products/get_mints | GET /api/mints | VERB+RELOCATE (owned by mints feature) | mints/controller.ts#getAllMints | requireAdmin | none |
| quotes | POST /api/quotes/catalog | POST /api/quotes/catalog | ACTION (pure computation, no stored resource) | quotes/controller.ts#catalogQuote | none (public) | untyped |
| quotes | POST /api/quotes/sales_order | POST /api/quotes/sales_order | ACTION | quotes/controller.ts#salesOrderQuote | requireUser | untyped |
| quotes | POST /api/quotes/purchase_order | POST /api/quotes/purchase_order | ACTION | quotes/controller.ts#purchaseOrderQuote | none (public) | untyped |
| quotes | POST /api/quotes/profit_breakdown | POST /api/quotes/profit_breakdown | ACTION | quotes/controller.ts#profitBreakdown | requireAdmin | untyped |
| fulfillments | GET /api/fulfillments/methods | GET /api/fulfillments/methods | REST | fulfillments/methods/controller.ts#getMethods | requireUser | none |
| fulfillments | GET /api/fulfillments/methods/all | GET /api/fulfillments/methods?all=true | QUERY | fulfillments/methods/controller.ts#getAllMethods | requireAdmin | none |
| fulfillments | POST /api/fulfillments/methods/update | PATCH /api/fulfillments/methods/:id | VERB+ID | fulfillments/methods/controller.ts#updateMethod | requireAdmin | untyped |
| fulfillments | POST /api/fulfillments/schedule_pickup | POST /api/orders/:orderId/pickups -> 201 | RELOCATE (symmetric with the sibling GET) | fulfillments/pickups/controller.ts#schedulePickup | requireAdmin | untyped |
| fulfillments | POST /api/fulfillments/schedule_direct | POST /api/orders/:orderId/directs -> 201 | RELOCATE | fulfillments/directs/controller.ts#scheduleDirect | requireAdmin | untyped |
| fulfillments | GET /api/fulfillments/get_for_order | GET /api/orders/:orderId/fulfillment_schedule | VERB+RELOCATE | fulfillments/controller.ts#getForOrder | requireUser | none |
| fulfillments | GET /api/fulfillments/schedule | GET /api/fulfillments/schedule | REST (ops calendar, not order-scoped) | fulfillments/controller.ts#getSchedule | requireAdmin | none |
| fulfillments | POST /api/fulfillments/cancel_schedule | POST /api/fulfillments/:id/cancel | VERB+ID+ACTION | fulfillments/controller.ts#cancelSchedule | requireAdmin | untyped, minus id |
| fulfillments | POST /api/fulfillments/set_method | POST /api/fulfillments/:id/set_method | ID+ACTION (deletes the sibling detail row — a real action) | fulfillments/controller.ts#setMethod | requireAdmin | `{method_id}` |
| fulfillments | POST /api/fulfillments/set_status | PATCH /api/fulfillments/:id `{status}` | VERB+ID (pure label, like orders' status) | fulfillments/controller.ts#setStatus | requireAdmin | `{status}` |
| shipping | GET /api/shipping/handoffs | GET /api/shipping/handoffs | REST | shipping/handoffs/controller.ts#getAll | requireUser | none |
| shipping | GET /api/shipping/packages | GET /api/shipping/packages | REST | shipping/packages/controller.ts#getOffered | requireUser | none |
| shipping | POST /api/shipping/validate_address | POST /api/shipping/validate_address | ACTION (computation) | shipping/operations/controller.ts#validateAddress | requireUser | untyped |
| shipping | POST /api/shipping/get_rates | POST /api/shipping/rates | VERB (ACTION, computed quote) | shipping/operations/controller.ts#getRates | requireUser | untyped |
| shipping | POST /api/shipping/get_locations | POST /api/shipping/locations | VERB (ACTION) | shipping/operations/controller.ts#getLocations | requireUser | untyped |
| shipping | POST /api/shipping/check_pickup | POST /api/shipping/pickup_availability | VERB (ACTION) | shipping/operations/controller.ts#checkPickup | requireUser | untyped |
| shipping | POST /api/shipping/get_tracking `{shipment_id}` | GET /api/shipments/:id/tracking | RELOCATE+ID | shipping/operations/controller.ts#getTracking | requireUser+own shipment | none |
| shipping | POST /api/shipping/cancel_label `{shipment_id}` | POST /api/shipments/:id/cancel_label | RELOCATE+ID+ACTION | shipping/operations/controller.ts#cancelLabel | requireAdmin | untyped, minus id |
| shipping | POST /api/shipping/cancel_pickup `{pickup_id}` | POST /api/shipments/:shipmentId/pickups/:pickupId/cancel | RELOCATE+ID+ACTION | shipping/operations/controller.ts#cancelPickup | requireAdmin | untyped, minus id |
| shipments | PATCH /api/shipments/:id | PATCH /api/shipments/:id | REST | shipping/shipments/controller.ts#patchShipment | requireAdmin | untyped |
| shipments | GET /api/shipments/:id/pickups | GET /api/shipments/:id/pickups | REST | shipping/shipments/controller.ts#getPickupsByShipment | requireAdmin | none |
| carriers | GET /api/carriers/get | GET /api/carriers | VERB | shipping/carriers/controller.ts#getAll | requireUser | none |
| carriers | GET /api/carriers/get_one `?id=` | GET /api/carriers/:id | VERB+ID | shipping/carriers/controller.ts#getOne | requireAdmin | none |
| carriers | POST /api/carriers/create | POST /api/carriers -> 201 | VERB | shipping/carriers/controller.ts#create | requireAdmin | untyped |
| carriers | POST /api/carriers/update | PATCH /api/carriers/:id | VERB+ID | shipping/carriers/controller.ts#update | requireAdmin | untyped |
| carriers | DELETE /api/carriers/delete `{carrier_id}` | DELETE /api/carriers/:id -> 204 | VERB+ID | shipping/carriers/controller.ts#remove | requireAdmin | none |
| carrier_services | GET /api/carrier_services/sale_options | GET /api/carrier_services/sale_options | REST (public, different scope than the authed list — kept distinct) | shipping/services/controller.ts#getSaleOptions | none (public) | none |
| carrier_services | GET /api/carrier_services/get | GET /api/carrier_services | VERB | shipping/services/controller.ts#getAll | requireUser | none |
| carrier_services | GET /api/carrier_services/get_by_carrier `?carrier_id=` | GET /api/carriers/:id/services | RELOCATE+ID | shipping/services/controller.ts#getByCarrier | requireUser | none |
| carrier_services | GET /api/carrier_services/offered | GET /api/carrier_services?offered=true | QUERY | shipping/services/controller.ts#getOffered | requireUser | none |
| carrier_services | GET /api/carrier_services/get_one `?id=` | GET /api/carrier_services/:id | VERB+ID | shipping/services/controller.ts#getOne | requireAdmin | none |
| carrier_services | POST /api/carrier_services/create | POST /api/carrier_services -> 201 | VERB | shipping/services/controller.ts#create | requireAdmin | untyped |
| carrier_services | POST /api/carrier_services/update | PATCH /api/carrier_services/:id | VERB+ID | shipping/services/controller.ts#update | requireAdmin | untyped |
| carrier_services | DELETE /api/carrier_services/delete `{id}` | DELETE /api/carrier_services/:id -> 204 | VERB+ID | shipping/services/controller.ts#remove | requireAdmin | none |
| refiners | GET /api/suppliers/get_all | GET /api/refiners | VERB+RELOCATE (retires the "suppliers" alias) | refiners/controller.ts#getAllRefiners | requireAdmin | none |
| refiners | PATCH /api/refiners/items/by-order-item/:orderItemId | PATCH /api/refiners/items/by-order-item/:orderItemId | REST (already the only honest key) | refiners/items/controller.ts#patchRefinerItem | requireAdmin | untyped |
| refiners | PATCH /api/refiners/orders/:id | PATCH /api/refiners/orders/:id | REST | refiners/orders/controller.ts#patchRefinerOrder | requireAdmin | untyped |
| reviews | GET /api/reviews/get_one `?review_id=` | GET /api/reviews/:id | VERB+ID | reviews/controller.ts#getOne | requireAdmin | none |
| reviews | GET /api/reviews/get_all | GET /api/reviews (admin sees all) | COLLAPSE+VERB | reviews/controller.ts#getAll | requireAdmin | none |
| reviews | GET /api/reviews/get_public | GET /api/reviews (unauthed/non-admin sees public only — same collapse) | COLLAPSE+VERB | reviews/controller.ts#getPublic | none (public) | none |
| reviews | POST /api/reviews/create | POST /api/reviews -> 201 | VERB | reviews/controller.ts#create | requireAdmin | contract |
| reviews | POST /api/reviews/update | PATCH /api/reviews/:id | VERB+ID | reviews/controller.ts#update | requireAdmin | contract |
| reviews | DELETE /api/reviews/delete `{review_id}` | DELETE /api/reviews/:id -> 204 | VERB+ID | reviews/controller.ts#remove | requireAdmin | contract, minus id |
| leads | GET /api/leads/get_one `?lead_id=` | GET /api/leads/:id | VERB+ID | leads/controller.ts#getOne | requireAdmin | none |
| leads | GET /api/leads/get_all | GET /api/leads | VERB | leads/controller.ts#getAll | requireAdmin | none |
| leads | POST /api/leads/create | POST /api/leads -> 201 | VERB | leads/controller.ts#create | requireAdmin | contract |
| leads | POST /api/leads/update | PATCH /api/leads/:id | VERB+ID | leads/controller.ts#update | requireAdmin | contract |
| leads | DELETE /api/leads/delete `{lead_id}` | DELETE /api/leads/:id -> 204 | VERB+ID | leads/controller.ts#remove | requireAdmin | contract, minus id |
| rates | GET /api/rates/get_one `?rate_id=` | GET /api/rates/:id | VERB+ID | rates/controller.ts#getOne | requireAdmin | none |
| rates | GET /api/rates/get_all | GET /api/rates (public sees active only) | COLLAPSE+VERB | rates/controller.ts#getAll | none (public) | none |
| rates | GET /api/rates/get_admin | GET /api/rates (admin sees all — same collapse) | COLLAPSE+VERB | rates/controller.ts#getAdmin | requireAdmin | none |
| rates | POST /api/rates/create | POST /api/rates -> 201 | VERB | rates/controller.ts#createRate | requireAdmin | contract |
| rates | POST /api/rates/update | PATCH /api/rates/:id | VERB+ID | rates/controller.ts#updateRate | requireAdmin | contract |
| rates | DELETE /api/rates/delete `{rate_id}` | DELETE /api/rates/:id -> 204 | VERB+ID | rates/controller.ts#deleteRate | requireAdmin | contract, minus id |
| images | POST /api/images/upload | POST /api/images -> 201 | VERB | media/images/controller.ts#uploadImage | requireUser | untyped |
| images | GET /api/images/get_test_image | GET /api/images | VERB (drops the "_test" spelling; still admin-only, unscoped by design) | media/images/controller.ts#getTestImages | requireAdmin | none |
| images | GET /api/images/get_url `?id=` | GET /api/images/:id | VERB+ID | media/images/controller.ts#getUrl | requireUser | none |
| images | DELETE /api/images/delete `{id}` | DELETE /api/images/:id -> 204 | VERB+ID | media/images/controller.ts#deleteImage | requireUser | none |
| addresses | GET /api/addresses/get | GET /api/addresses (own by default, admin ?user_id=) | COLLAPSE+VERB | places/addresses/controller.ts#getAll | requireUser | none |
| addresses | GET /api/addresses/get_user_addresses | GET /api/addresses?user_id= (same collapse) | COLLAPSE+VERB | places/addresses/controller.ts#getUserAddresses | requireUser | none |
| addresses | POST /api/addresses/create | POST /api/addresses -> 201 | VERB | places/addresses/controller.ts#create | requireUser | untyped |
| addresses | POST /api/addresses/update `{address_id}` | PATCH /api/addresses/:id | VERB+ID | places/addresses/controller.ts#update | requireUser | untyped |
| addresses | DELETE /api/addresses/delete `{address_id}` | DELETE /api/addresses/:id -> 204 | VERB+ID | places/addresses/controller.ts#remove | requireUser | untyped |
| addresses | POST /api/addresses/set_default `{address_id}` | POST /api/addresses/:id/set_default | ID+ACTION (un-defaults the sibling row — an atomic swap) | places/addresses/controller.ts#setDefault | requireUser | none |
| users | GET /api/users/get_user `?id=` | GET /api/users/:id | VERB+ID | users/controller.ts#getUser | requireAdmin | none |
| users | GET /api/users/get_all_users | GET /api/users | COLLAPSE+VERB | users/controller.ts#getAll | requireAdmin | none |
| users | GET /api/users/get_admin_users | GET /api/users?role=admin (same collapse) | COLLAPSE+VERB | users/controller.ts#getAdmins | requireAdmin | none |
| users | POST /api/users/update_credit | POST /api/users/:id/credit_adjustments | ID+ACTION (audited balance adjustment, not a field set) | users/controller.ts#updateCredit | requireAdmin | untyped, minus id |
| account | POST /api/account/set_password | POST /api/account/set_password | ACTION (already noun-shaped; write-only, security-sensitive) | auth/controller.ts#setPassword | requireAuth | untyped |
| auth | ALL /api/auth/*splat | ALL /api/auth/*splat | MOUNT (better-auth's own router; not itemized) | better-auth toNodeHandler | better-auth's own | n/a |
| spots | GET /api/spots/spot_prices | GET /api/spots | VERB (drops the redundant segment; mount is already the noun) | spots/controller.ts#getSpotPrices | none (public) | none |
| transactions | GET /api/transactions/get_transactions | GET /api/transactions (session-scoped) | VERB | transactions/controller.ts#getTransactionHistory | requireUser | none |
| tax | POST /api/tax/get_sales_tax | POST /api/tax/calculate | VERB (computation, not a stored resource) | sales-tax/controller.ts#getSalesTax | requireUser | untyped |

## Where the RPC-disguised-as-PATCH lives

`PATCH /api/orders/:id` is one route today but five operations, dispatched
by which body key is present (`domain/orders/patch.ts`): `status` is a real
field (Jacob: statuses drive no logic — it is flair). `add_funds`,
`finalize_pricing`, `cancel`, and `supplier` (renamed `send_to_refiner`
above) are not — each calls a use case with side effects (a credit write, a
FedEx label, an email to a refiner) and each currently smuggles a boolean or
sub-object through a field named after the operation, with hand-written
messages telling the caller "this is the operation's name: send true or
omit it." That message is the tell: these are actions wearing a PATCH. The
task's own examples (`finalize_pricing`, `cancel`, `send_to_refiner`) are
exactly this dispatcher's four non-status branches — split into their own
`POST /api/orders/:id/<action>` endpoints above, `PATCH /api/orders/:id`
goes back to being a real field patch of one column.

## Migration plan

One feature per pass. Order the passes by frontend blast radius (see below),
smallest first — `spots`, `transactions`, `tax` (near-zero
frontend surface) before `orders` (largest, and the one this document's own
example comes from) — not by the order resources appear in the table above.

For each pass: add the new route(s) beside the old one, point the frontend
at the new route in the same pass (per ruling 44, this is a deliberate
follow-up per feature, not a blanket rewrite), then retire the old path.

**Recommend a redirect table in `app.ts` over a blanket 410**, because this
codebase already has one precedent for centralizing "the old name" (the
`suppliers`/`refiners` split, the `stripe`/`payments` split) and a redirect
preserves any client that has not adapted yet without every controller
needing dual routes:

```ts
// Old path -> 308 Permanent Redirect to the new one, preserving method and
// body. One release; delete both the entry and the old route together.
const REDIRECTS: [string, string][] = [
  ["/api/purchase_orders/create_from_checkout", "/api/orders"],
  // ...
];
```

A `308` (not `301`) is required — it is the only redirect status that
preserves the request method and body on a POST/PATCH, which most of these
are. `GET`-only routes could use `301`; using `308` everywhere is simpler
and correct for both. Reserve a `410 Gone` (body: `{ moved_to: "<new
path>" }`) for routes with zero frontend callers today: a route with no
caller can skip the redirect and go straight to `410` for one release as a
canary that the scan was complete.

## Frontend impact (files calling the old paths — not edited)

Grepped `frontend/` for literal path strings in `useApiQuery`/`useApiMutation`
`url:` fields and direct `apiRequest(...)` calls. Per resource, the files
that will need their `url` (and, where the method changes, their verb)
updated when that pass lands:

- **orders** (creates, patch, list): `features/orders/purchaseOrders/users/queries.ts`,
  `features/orders/salesOrders/users/queries.ts`,
  `features/orders/salesOrders/admin/queries.ts`,
  `features/orders/purchaseOrders/admin/queries.ts`, `features/orders/patch.ts`
- **orders/items, /spots, /address**: `features/orders/items.ts`,
  `features/orders/spots.ts`, `features/orders/reads.ts`
- **orders-scoped fulfillments/pickups/directs**: `features/fulfillments/queries.ts`
- **orders-scoped payouts**: `features/payouts/queries.ts` (also owns
  `PATCH /payouts/:id`, `GET /payouts/:id/details`)
- **orders-scoped refiners**: `features/refiners/queries.ts`
- **orders-scoped shipments, cancel_label/cancel_pickup, tracking**:
  `features/shipping/queries.ts`
- **quotes**: `features/quotes/queries.ts`
- **checkout row + cart sync**: `features/checkout/queries.ts`,
  `features/cart/queries.ts`, `features/auth/queries.ts` (`/cart/get_cart` on
  session bootstrap)
- **payments/stripe**: `features/stripe/queries.ts`, `features/payments/queries.ts`
- **products/metals/mints**: `features/products/queries.ts`,
  `app/sitemap.ts` (`get_all_products`)
- **carriers/carrier_services**: `features/carriers/queries.ts`
- **refiners (suppliers alias)**: `features/products/queries.ts`
  (`/suppliers/get_all`)
- **reviews**: `features/reviews/queries.ts`
- **leads**: `features/leads/queries.ts`
- **rates**: `features/rates/queries.ts`
- **images/media**: `features/media/queries.ts`
- **addresses**: `features/addresses/queries.ts`
- **users**: `features/users/queries.ts`
- **account**: `features/auth/queries.ts` (`/account/set_password`)
- **spots**: `features/spots/queries.ts`

No file was edited during this research — every path above is confirmed by
grep, not inferred.

## Open questions for Jacob

- **`direction` as query filter vs body field, per resource.** This document
  puts it in the body on create (`POST /api/orders`) and in the query on
  list/read (`?direction=`) — matching what `orders.orders` already does.
  Cart and payment methods follow the same split here; confirm that split is
  the rule rather than a per-resource choice.
- **Admin list scoping: same path with role-widened results, or a separate
  admin path?** `get_admin_products`, `get_admin_users`/`get_all_users`,
  `rates/get_admin`/`get_all`, `reviews/get_all`/`get_public` are proposed
  above as one collapsed `GET` per resource with the caller's role deciding
  scope. That is a behavior change in kind (today they are separate routes
  with separate auth), not just a path rename — needs a yes before it moves.
- **`checkout` vs `cart`.** The row (`/api/checkout`, D208: fulfillment and
  payout choices) and the item list (`/api/cart`, proposed collapsed by
  `?direction=`) are two different resources today under two different
  nouns. Worth asking whether the eventual checkout overhaul (CLAUDE.md:
  "Checkout is not 'done' and will be overhauled") wants them unified under
  one noun before this migration touches either.
- **Quotes for an uncreated order (`sales_order`/`purchase_order`) differ in
  auth** (one requires a session, one is public) **so they were not
  collapsed by direction** the way orders and cart were. Confirm that is
  right, or that the auth gap is itself a bug worth fixing first.
- **`cancel_pickup`'s new home.** Proposed as
  `POST /api/shipments/:shipmentId/pickups/:pickupId/cancel`, nested under
  the shipment for symmetry with the existing `GET .../pickups` list — but
  the current call site only carries `pickup_id`, so this needs either a
  server-side lookup of the owning shipment or a body/path change on the
  caller. A flatter `POST /api/pickups/:id/cancel` (no shipment in the path)
  avoids that and is a fair alternative.

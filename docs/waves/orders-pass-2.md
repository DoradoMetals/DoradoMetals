# Orders, second pass

Three things the first orders pass left, plus one move ruling 77 named.
Paths are the post-restructure ones (`api/orders/`, `api/orders/refiners/`,
`api/payments/`, `api/identity/users/`, `api/checkout/`, `api/logistics/`).

## 1. One create endpoint, orchestrated on the server

Today an order is placed by `POST /purchase_orders/create_from_checkout`,
`POST /sales_orders/create_sales_order` and
`POST /sales_orders/admin_create_sales_order`, all three the same handler
(`createOrderFromCheckout` -> `place.place(checkout_id)`), and the admin one
still expects the admin UI to have walked a checkout through every step first.
docs/waves/rest-routes.md rows 60-62 already say what replaces them.

- `POST /api/orders` `{ checkout_id }` -> 201 `OrderView`. Direction comes from
  the checkout row (migration 130), never from the body. `requireUser`; a
  customer may place only their own checkout, an admin any.
- `POST /api/orders/admin` `AdminOrderCreate` -> 201 `OrderView`.
  `requireAdmin`. The server builds the checkout for the customer through the
  checkout domain's own service, sets the fulfillment through logistics, the
  payment through payments, then places through the same `place()` every
  customer order uses. One transaction for the rows; side effects (label,
  email) after commit, as `place()` already does.
- The body is exactly what a checkout needs to be placeable and nothing more.
  Derive it from the code, not from the admin drawer: `checkout/rules.ts`
  `assertPlaceable` plus `logistics/fulfillments` `missing()` say which facts
  are required. Expected shape, to be confirmed against those rules:
  `{ user_id, direction, items: OrderLineInput[], fulfillment: { method_id,
  address_id?, carrier_service_id?, package_id? }, payment_method_id }`.
  `AdminOrderCreate` lives in `packages/contracts` next to `Order`, hand-written
  below the generated region, built from the entity schemas with `pick`, never
  a free-standing object.
- An admin-created SALE is paid by a non-card method (credit, wire, ACH,
  whatever `payments.methods` holds); card intents stay the customer's path.
  If no such method exists in the seeds, stop and record it as a finding
  rather than inventing one.
- The three old routes and the `purchase_orders`/`sales_orders` mounts in
  `app.ts` go. `create_review` becomes `POST /api/orders/:id/review` (rows
  63-64). `@dorado/client` gets `useCreateOrder`, `useAdminCreateOrder`,
  `useCreateOrderReview` and loses the old three; the frontend is NOT updated
  (it is nuked anyway) but its call sites are listed in the doc.

## 2. Refiners on the views (rulings 71, 73)

`orders/refiners/service.ts` still hand-composes `ComposedRefiner` (a type in
a service file, carried by a `lint:type-homes` allowance) from several reads.
The engagement reads (`orders/refiners/orders`, `items`, `spots`) return bare
rows the admin then stitches.

- `RefinerView` and `RefinerOrderView` are contracts; each is ONE SQL read
  under `api/db/refiners/.../sql/view*.sql` (`json_agg` / `row_to_json`,
  timestamps `to_char(... AT TIME ZONE 'UTC')`), parsed by the contract at the
  boundary. `RefinerOrderView` carries the refiner, its items and its spots for
  an order. Delete `ComposedRefiner` and the two `lint:type-homes` allowances.
- `mirrorLinesForOrder` / `mirrorForOrder` (the engagement copies) keep their
  logic but are rewritten from the inputs inward (ruling 78): no spreading, no
  dictionaries, required `tx`.

## 3. Users: the narrowest contract, and credit leaves

- Every read answers with the narrowest contract: `UserSummary` inside order
  views, `User` for the caller's own account, `AdminUser` only behind
  `requireAdmin`. Verify each route; fix what is wider.
- `adjustDoradoCredit`, `addFunds`, `removeFunds`, `getBalance` move from
  `identity/users/service.ts` to `payments/credit/service.ts` with their
  routes (`/api/users/:id/credit` stays where it is mounted, ruling 13; the
  handler lives with payments) and their tests. Orders' `addFunds(order_id)`
  calls payments, not users.

## Rules that apply

Rulings 47-78 (FOLLOWUPS.md, both "Jacob's rulings" sections): no throws
outside `rules.ts`; no try/catch or logger in domain or transport (`attempt`);
writers take a required `tx`; no hand-listed column arrays; views are one SQL
read; named contract types as params; the database mints ids; no result
dictionaries, no return-shape or param spreading; rewrite from the logic, never
preserve old shapes. No comments unless crucial and very short. Every lint
self-test green; `pnpm check:fast` green except `figma:inventory`.

## Out of scope

Frontend. The lots model. Migration chain work. Prettier.

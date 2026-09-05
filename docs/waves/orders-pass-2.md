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

## Result

Executed 2026-09-06 on `orders2-lane`. Nothing committed.

### 1. One create endpoint

| before | after |
|---|---|
| `POST /api/purchase_orders/create_from_checkout` `requireUser` -> 200 | `POST /api/orders` `requireUser` -> **201** `OrderView` |
| `POST /api/sales_orders/create_sales_order` `requireUser` -> 200 | (same route) |
| `POST /api/sales_orders/admin_create_sales_order` `requireAdmin` -> 200 | `POST /api/orders/admin` `requireAdmin` -> **201** `OrderView` |
| `POST /api/purchase_orders/create_review` `requireUser`+`requireOwnOrder` -> `{success:true}` | `POST /api/orders/:id/review` `requireUser`+`requireOwnOrderParam` -> 200 `OrderView` |
| `POST /api/sales_orders/create_review` (same handler) | (same route) |
| `app.use("/api/purchase_orders", …)`, `app.use("/api/sales_orders", …)` | both mounts deleted; `orders/creates.routes.ts` deleted |

No other URL moved (ruling 13). `route-guards`: **136 routes -> 134**, 70
`requireAdmin`, 55 -> 53 `requireUser`, 10 unguarded; `KNOWN_ROUTES` now pins
`POST /api/orders`, `POST /api/orders/admin` and `POST /api/orders/:id/review`
in place of the two `create_review` entries, and
`identity/authorization/admin-routes.json` swaps
`POST /api/sales_orders/admin_create_sales_order` for `POST /api/orders/admin`.

`create_review` **takes no body at all now.** The old `OrderReviewBody`
(`{ order: { id }, user_id? }`) is deleted: the id is the path, and `user_id`
was never read. The handler answers the `OrderView` rather than `{success:true}`,
like every other order action.

### The `AdminOrderCreate` shape, and where each field is demanded from

Derived from `checkout/rules.ts` `checkoutState` + `logistics/fulfillments/rules.ts`
`missingFor`, not from the admin drawer. It is a discriminated union on
`direction`, because the two directions demand different settlement facts.

```ts
AdminOrderFulfillment = { method_id, choices: FulfillmentPatchBody }

AdminPurchaseCreate = {
  direction: Direction.extract(["purchase"]),
  user_id, items: CheckoutItemPatch[],
  fulfillment: AdminOrderFulfillment,
  payout: CheckoutPayoutForm,
}
AdminSaleCreate = {
  direction: Direction.extract(["sale"]),
  user_id, items: CheckoutItemPatch[],
  fulfillment: AdminOrderFulfillment,
  payment_method_id, recipient_address_id,
}
AdminOrderCreate = discriminatedUnion("direction", [purchase, sale])
```

| field | demanded by |
|---|---|
| `user_id` | `checkout.checkouts.user_id` is `NOT NULL` - the row is the customer's |
| `direction` | `checkout.checkouts.direction`; `place()` branches on it (migration 130) |
| `items` | `checkoutState`: `if (view.items.length === 0) missing.push("items")` |
| `fulfillment.method_id` | `checkoutState`: `if (!view.fulfillment_id) missing.push("fulfillment_id")` |
| `fulfillment.choices` | `missingFor`: SHIPMENT wants `shipper_address_id`/`package_id`/`carrier_service_id` (+ the courier slot); PICKUP wants `pickup_address_id`/`start_time`; DIRECT wants `location_id`/`start_time`. The union is exactly `FulfillmentPatchBody`, so the body names no column of another schema and `lint:domain-boundaries` stays quiet in `orders/` |
| `payout` (purchase) | `checkoutState`: `if (!view.payment_details_id) missing.push("payment_details_id")`. `CheckoutPayoutForm` is what CREATES that row (`payments/details` `saveCheckoutPayout`), and it carries `method`, which is also what `rules.payoutFeeOf` needs off `payments.methods` |
| `payment_method_id` (sale) | not in `missing`, but `db/pricing/sql/sale_quote.sql` reads `payments.methods.surcharge_percent` through it - it is the SETTLEMENT choice |
| `recipient_address_id` (sale) | `checkoutState`: the sale branch's own `missing.push("recipient_address_id")` |

Every field derives from an entity schema with `pick`/`shape`/`extract`;
`lint:contracts-derived` is green (no `z.string()` leaf below the generated
region).

**The server-side orchestration** is `orders/place.ts` `placeForAdmin`. It opens
ONE transaction and, inside it, calls the same use cases a customer's own steps
call - `checkout/service.ts` `getRowFor` + `replaceItems`,
`logistics/fulfillments/drafts.ts` `createForCheckout` + `patchChoices`, and
either `saveCheckoutPayout` (purchase) or `patchCheckout` (sale) - then commits
and hands the `checkout_id` to the same `place()` every customer order uses, so
the label and the confirmation email still happen after ITS commit.

Threading that transaction meant four ruling-56 tightenings, each a service
writer that used to open its own: `checkout.replaceItems`,
`checkout.patchCheckout`, `checkout.saveCheckoutPayout` and
`fulfillments/drafts.createForCheckout` now take a required `tx`, and their one
HTTP caller each opens `withTransaction`.

**FINDING - the non-card sale method exists, and what it costs.** `payments.methods`
holds exactly one enabled non-card `sale` method: **`CREDIT`** (provider
`internal`, `provider_value` `dorado_account`, `surcharge_percent` 0). The other
sale rows are Stripe (`CARD`, `ACH`, `APPLE PAY`, `GOOGLE PAY`) except `WIRE`,
which is `enabled = false`. So an admin sale settles from the customer's Dorado
credit - and that is a real constraint, not a formality: `placeSale` computes
`post_charges_amount` from the quote, and any remainder above Stripe's $0.50
minimum still demands an open payment intent (`assertOpenIntent`), which is the
customer's own card path. **An admin-created sale must be covered by the
customer's balance.** Nothing was invented; the seed's own row is used.

### 2. Refiners on the views

- **`RefinerView`** (was `RefinerRead`, renamed to say what it is) and
  **`RefinerOrderView`** are contracts. `RefinerOrderView` is `RefinerOrder`
  extended with `refiner: RefinerView | null`, `items: RefinerItem[]`,
  `spots: RefinerSpot[]`.
- Three SQL reads, one each: `db/refiners/sql/view_all.sql`,
  `db/refiners/sql/view_one.sql`, `db/refiners/orders/sql/view_for_order.sql`
  (`jsonb_build_object` / `jsonb_agg`, every timestamp
  `to_char(... AT TIME ZONE 'UTC', ...)`), each parsed by its contract at the
  repo boundary. The `ORDER BY o.name ASC, r.id ASC` in the view IS the
  `localeCompare` comparator the service used to run in TypeScript.
- **`ComposedRefiner` is gone**, with `composed()`, the
  `organizations.byId()` map it stitched against, and BOTH `lint:type-homes`
  allowances (`orders/refiners/service.ts`, `orders/refiners/spots/service.ts`).
  `db/refiners/spots/repo.ts`'s allowance drops 5 -> 4: `EngagementSpotRow` died
  when `getForEngagement` started answering `RefinerSpot[]`.
  `db/refiners/{sql/get_all,sql/get_one}.sql` and the bare `list`/`getOne` they
  served are deleted.
- **`mirrorLinesForOrder` / `mirrorForOrder` were rewritten from the inputs
  inward.** The read-diff-write (two reads, two `Set`s in
  `orders/refiners/rules.ts`, `createMany`) is ONE `INSERT ... SELECT ... WHERE
  NOT EXISTS` per table - `db/refiners/items/sql/mirror_for_order.sql` and
  `db/refiners/spots/sql/mirror_for_order.sql`. Both take a required `tx`.
  `orders/refiners/rules.ts` had nothing else in it and is deleted, as are both
  `createMany`s.
- `GET /api/orders/:orderId/refiners` answers `RefinerOrderView` now (so does
  `PATCH /api/refiners/orders/:id`); the `/items` and `/spots` routes keep their
  own reads and their own shapes (ruling 26b - each is its own resource), and no
  URL moved. `validate:wire` pins `RefinerOrderView` on the engagement read and
  gains `GET /suppliers/get_all` -> `RefinerView`, which had no wire check at all.

### 3. Users: the narrowest contract, and credit leaves

Every route that answers user-shaped data, verified one at a time:

| route | guard | answers | verdict |
|---|---|---|---|
| `GET /api/users` | `requireAdmin` | `AdminUser[]` | correct |
| `GET /api/users/admins` | `requireAdmin` | `AdminUser[]` | correct |
| `GET /api/users/:id` | `requireAdmin` | `AdminUser` | correct |
| `POST /api/users/:id/credit` | `requireAdmin` | `UserCredit` (id + balance) | narrowest already |
| `GET /api/orders`, `GET /api/orders/:id` | `requireUser`+own | `OrderView.user` = `UserSummary` | correct |
| `/api/auth/*splat` | better-auth's own | the session's `User` | not ours |

**One read WAS wider than its question** and is fixed: `checkout/service.ts`
`resolveSubject` fetched a whole `AdminUser` (role, balance, phone number,
anonymity) to learn whether a named user exists. It now asks
`users.exists(id)` - `db/users/sql/exists.sql`, a `SELECT 1` - and
`checkout/rules.ts` `assertSubject` takes the boolean. No route answers `User`
for the caller's own account, and none needs to: better-auth's session already
does. The two other internal `auth.users` reads
(`db/payments/customers/sql/get_one.sql`, `EmailRecipient`) are already narrow
and never reach the wire.

**Credit moved to `api/payments/credit/`**: `adjustDoradoCredit`, `addFunds`,
`removeFunds`, `getBalance` in `service.ts`; `identity/users/rules.ts` moved
whole as `payments/credit/rules.ts`; the handler is
`payments/credit/controller.ts` `updateCredit`. **The URL did not move**
(ruling 13): `identity/users/routes.ts` still declares
`POST /api/users/:id/credit` and imports the handler from payments.
`identity/users/service.ts` is three reads and `exists`.
Callers rewired: `orders/service.ts` `addFunds`, `orders/place.ts`
`removeFunds`, `payments/sweeps.ts` `addFunds`, `payments/service.ts`
`getBalance`. `#domains` gains `credit`.
Tests moved with their subject - `credit-delta`, `credit-ledger`,
`credit-target`, `funds`, `body-validation` are under
`payments/credit/tests/`; `identity/users/tests/replay.test.ts` stayed, because
its subject is the `/api/users` surface, which did not move.

### Tests added

- `orders/tests/admin-create.test.ts` (3) - a full server-side SALE placement
  through `CREDIT` (201, `Preparing`, credit applied, **no payment intent
  opened**) and a full PURCHASE placement through the `PICKUP` method with the
  payout form (201, `In Transit`, `account_last4`, and the plaintext columns
  still NULL while the envelope is sealed); plus the refusals - a missing
  `start_time` is a 422 naming it, an unknown field is a 400 naming it.
  Real HTTP through the app, no live key: the PICKUP method has no parcel, so
  no label is bought, and the sale's card path is never reached.
- `orders/tests/review.test.ts` (2) - the action stamps the order in the path
  and answers its view; a stranger is 403 and an unknown id is 404, with
  nothing written either way.
- `orders/refiners/tests/views.test.ts` (4) - the list parses as `RefinerView`
  and is ordered by organization name; a refiner reads by id and an unknown id
  answers null; the engagement view carries refiner + items + spots in one read
  with a UTC timestamp string; the mirror is idempotent.
- `db/refiners/tests/repo.test.ts` rewritten onto `viewAll`/`viewOne`.

### Floors and pins moved

| gate | before -> after | why |
|---|---|---|
| `lint:domain-boundaries` file floor | 52 -> 50 | `orders/creates.routes.ts` and `orders/refiners/rules.ts` are gone |
| `lint:type-homes` `db/refiners/spots/repo.ts` | 5 -> 4 | `EngagementSpotRow` died |
| `lint:type-homes` `orders/refiners/service.ts`, `orders/refiners/spots/service.ts` | entries deleted | `ComposedRefiner` and the type re-export died |
| `route-guards` `KNOWN_ROUTES` | 2 `create_review` -> the 3 new order routes | rows 60-64 |
| `admin-routes.json` | `admin_create_sales_order` -> `POST /api/orders/admin` | same |
| `payments/tests/intent-lifecycle.test.ts` | gained `LOCKS.USERS` | `payments/service.ts` now imports `#payments/credit/service.ts` directly, so `lint:test-locks` can SEE the `auth.users` read it always did through the `#domains` barrel |

### Frontend call sites to update (NOT touched - ruling 44)

Nine files, plus the e2e spec:

| file | what changed under it |
|---|---|
| `features/orders/salesOrders/admin/queries.ts` | `useAdminPlaceSalesOrder` is gone. `useAdminCreateOrder` takes ONE `AdminOrderCreate` body - the whole four-call orchestration (sync items, patch checkout, create fulfillment, patch fulfillment, place) is the server's now and this hook collapses to one call |
| `features/checkout/queries.ts`, `.../reviewStep/reviewStep.tsx`, `.../salesOrderCheckout.tsx` | `usePlaceOrderFromCheckout` still exists and still works - it posts to `/orders` now, and the answer is 201 rather than 200 |
| `features/orders/ui/OrderCompletedReview.tsx` | `useCreateOrderReview` takes `{ id }` only (no `direction`) and answers an `OrderView`, not `{success:true}` |
| `features/products/types.ts` | `RefinerRead` is `RefinerView`. `export type Supplier = RefinerRead` no longer compiles |
| `features/refiners/queries.ts`, `.../AdminPreparing.tsx`, `.../editActualValues.tsx`, `.../editRefinerValues.tsx` | `useRefinerOrder` answers `RefinerOrderView` - the engagement now CARRIES `refiner`, `items` and `spots`, so `useRefinerItems` / `useRefinerMetals` beside it are a second and third request for data already in hand |
| `features/orders/tests/authed/admin-sales-order-work.e2e.ts` | posts to `${API}/sales_orders/admin_create_sales_order` with `{ checkout_id }`; that route is gone and the body is now `AdminOrderCreate` |

`@dorado/client` itself IS updated: `useCreateOrder` and `useAdminCreateOrder`
replace `usePlaceOrder` / `useAdminPlaceSalesOrder`, `useCreateOrderReview`
posts to `/orders/:id/review`, `usePlaceOrderFromCheckout` posts to `/orders`,
and the refiner hooks carry the two new contract names. No query key changed -
the routes that moved had none.

### Not done, named rather than hidden

- `GET /api/orders/:orderId/refiners/items` and `/spots` still read their own
  tables. They are their own resources (ruling 26b) and ruling 13 forbids
  moving them; the engagement view makes them redundant for a caller that
  already has it, which is a frontend decision, not an API one.
- `POST /api/orders/admin` builds the checkout in one transaction and then
  places in `place()`'s own. Making it literally one transaction would mean
  `place()` accepting an executor, which would put the FedEx label and the
  confirmation email inside it - the one thing the transaction rule forbids.

### Gate

`pnpm check` (full, from the repo root): every member green except two, and
neither is this lane's.

- **`figma:inventory`** - 12 findings in `packages/components`, Jacob's,
  untouched here and failing before this lane started.
- **`api:verify:genesis`** - `000_genesis_schema.sql` does not match DEV. The
  script reads exactly four things: `api/.env`, the dev database,
  `scripts/lib/schemas.ts` and `migrations/000_genesis_schema.sql`, and
  `git status` shows **none of them modified by this lane** (zero changes under
  `api/migrations/`, no DDL anywhere in the diff). Measured read-only: dev has
  **no `auth.mirror_identity_to_exchange` function at all**, while migration 122
  creates it and genesis carries it - so DEV IS BEHIND ITS OWN MIGRATION CHAIN.
  That is a `pnpm --filter @dorado/api migrate` against dev, which this lane is
  not allowed to run.
- Because `dev-db` is a serial group, verify:genesis aborted the six members
  behind it, so they were run **individually** afterwards and all pass:
  `verify:backfill`, `validate:wire` (**34 shapes match, 0 diverge** - 33 before,
  the extra being the new `GET /suppliers/get_all` case, and the engagement read
  now parsing live dev rows through `RefinerOrderView`), `audit:coverage`,
  `audit:indexes`, `audit:query-paths`, `audit:constraints`, `audit:non-finite`,
  `audit:nullability`.

API suite: **237 files, 1340 passed, 1 skipped, 0 failed** (1331 before).
Self-tests re-run on every lint touched, all still passing and still proving
what they proved: `lint-type-homes` 14, `lint-domain-boundaries` 14,
`route-guards` 7, `lint-test-locks` 2, `lint-test-actor` 2,
`lint-no-literal-views` 7, `lint-contracts-derived` 6, `lint-no-column-arrays`
11, `lint-one-catch` 13.

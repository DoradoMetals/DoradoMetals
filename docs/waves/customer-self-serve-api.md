# Customer self-serve API (selfserve lane, 2026-09-12)

`docs/design/customer-screens.md` (drawn on `designs2-lane`, not yet merged into
this branch) lists what the customer portal needs from the API. This lane
closes the gaps it found under `accounts`, `checkout` and `orders`, without
touching `inventory`, `refining` or the lots model.

## Account profile (`accounts/auth`)

`/api/users/*` stays `requireAdmin` end to end - a customer never had a way to
read or edit their own record. Three new routes on the existing
`/api/account` router (`accounts/auth`, same file that already owns
`send_code`/`change_email`/`session`):

- **`GET /api/account/me`** (`requireUser`) - the caller's own `name`, `email`,
  `phone_number`, `phone_number_verified`, `email_verified` and `dorado_funds`
  (credit balance), plus `deletion_requested_at`.
- **`PATCH /api/account/me`** (`requireUser`) - `{ name }` only, `.strict()`.
  Email and phone stay on the existing code-verified `change_email` /
  `change_phone` / `confirm_change` flow; the patch 400s on any other field.
- **`DELETE /api/account`** (`requireUser`) - a deletion REQUEST, not a
  delete: it stamps `auth.users.deletion_requested_at` and returns the
  profile with the fact set. Refused (403) for an anonymous visitor
  (`rules.assertNotAnonymous`). Idempotent - calling it again just restamps
  the same fact.

**Migration `217_a_customer_may_request_their_own_deletion.sql`** adds the one
column this needed, additive, applied to dev. `packages/contracts/src/auth/users.ts`
was regenerated **scoped to `auth` only**
(`CONTRACT_SCHEMAS=auth pnpm --filter @dorado/contracts generate`) - a plain
full regenerate fails today on `rates.rate_history`, an entity another
in-flight lane created directly on the shared dev database with no migration
and no ENTITY name in the generator. That failure, and the `assigned_to_id`
/ `notes` columns the same drift adds to `auth.users`, are not this lane's;
the scoped regenerate avoided pulling either into this branch's contracts.

New computed contracts in `packages/contracts/src/computed/auth.ts`:
`AccountProfile` (`User.pick(...).extend({ email_verified })`) and
`AccountProfilePatch` (`User.pick({ name: true }).partial().strict()`). DB
layer: `db/auth/users/sql/get_profile.sql` (one SQL read, parsed through
`AccountProfile`), and `update.sql` / `repo.ts`'s `update()` gained
`deletion_requested_at` alongside the existing coalesce-patch columns.

Tests: `domains/accounts/auth/tests/account-profile.test.ts` - profile read
(verified flags, credit, deletion fact), a signed-out 401, PATCH accepting
only `name` and 400ing on `email`, DELETE stamping the fact and reading it
back, and an anonymous visitor refused.

## Orders (`orders`, customer-scoped reads only)

- **`GET /api/orders`** (list) and **`GET /api/orders/:id`** already scope to
  the caller for a non-admin (`callerId`) and already carry the derived
  `state` label (facts-and-positions lane, already merged). No new
  `/api/account/orders` route was added - ruling 1 (one endpoint per
  resource) and the existing scoping already answer "my own orders."
  `requireOwnOrderParam` already guarded the single-order read.
- **Admin-only fields no longer leak to the order's own customer.**
  `Order.notes` and `Order.assigned_to_id` were on the wire to anyone who
  could read the order, including its own customer, on both
  `GET /api/orders` and `GET /api/orders/:id`. `orders/rules.ts` gained
  `orderViewForCustomer` / `orderListForCustomer` (both null the two fields);
  `orders/controller.ts`'s `getOrder` / `listOrders` apply them when
  `req.user?.role !== 'admin'`. Profit was already safe -
  `POST /api/quotes/profit_breakdown` is `requireAdmin` and orders never
  embeds it.
- **`GET /api/orders/:id/documents` is now `requireUser` +
  `requireOwnOrderParam`**, was `requireAdmin`. The document kinds
  `documentsFor` computes (invoice, packing list, shipping instructions,
  assay results, ...) are all customer-appropriate; only the guard was wrong.
  `admin-routes.json` updated to drop this route from the pinned admin list.
- Tests added to `orders/tests/ownership.test.ts`: a stranger 403s on
  `GET /api/orders/:id` and on its `/documents`; the owner reads both; an
  admin-only-field leak test asserting `notes`/`assigned_to_id` are `null` for
  the owning customer on both the view and the list, and intact for an admin.

## Spot lock at placement (`orders/place.ts`)

Ruling: spots move, and the quote a customer sees at Review locks the moment
they place the order - it must not drift by the time an admin gets to
finalize. `PUT /api/orders/:id/spots` stays `requireAdmin`; the customer never
calls a lock endpoint. Instead, `placePurchase()` calls the existing
`orders/spots/service.ts` `applyLock(order_id, true, tx)` right after the
order and its totals are written, inside the same placement transaction that
already freezes `orders.spots` (`freeze.sql`).

This composes cleanly with the existing admin workflow because
`orders/service.ts`'s `finalize()` already reads `if (!order.spots_locked)`
before re-copying the feed - so a placed order's frozen price survives to
finalize untouched, and an admin who genuinely needs to correct a lot before
finalizing still has `unlock_spots` / `edit_lots` (ruling 112: made hard, not
impossible). `admin`-placed purchase orders share the same `placePurchase()`
path and get the same lock; that is consistent, not a side effect - a walk-in
quote should not drift either.

Test: `orders/tests/place.test.ts` - "placing a purchase order locks its
spots as the price the customer was shown" (`spots_locked` true after
`place.place()`, both on the row and on the returned view). Full `orders` and
`checkout` suites re-run clean (199 and existing checkout tests unchanged).

## Payout accounts, addresses, public reads - confirmed, no changes

- **Payout accounts**: `GET /api/payments/banks` (`requireUser`,
  `banks.listLinks(callerId(req))`) already answers exactly what the design's
  Payout Accounts screen needs - last-four, bank name, status, scoped to the
  caller; the four `POST` link/verify routes are the same shape.
  `payments/details` (which the task description named) is admin-only end to
  end and is not the customer-facing read; the actual existing self-serve
  read is `GET /api/orders/:orderId/payment-details`
  (`requireUser` + `requireOwnOrderParam`, already wired). No
  `/api/account/payout_accounts` route was added - `GET /api/payments/banks`
  already is that resource's one endpoint. Bank numbers are never returned by
  either route; only `GET /api/payments/details/:id/bank` opens them, and it
  stays `requireAdmin`. Added
  `domains/transactions/banks/tests/ownership.test.ts` (no test existed for
  this domain before): a customer's list carries only their own links, a
  stranger 404s on `POST /:id/verify`, and no response carries a bank/routing
  number.
- **Addresses**: `accounts/places/addresses` already guards every verb
  through `entry()` (a join on both `address_id` AND `user_id`, 404 for a
  stranger) and already has `default_shipping` / `setDefault`. Already
  tested: `journeys/address-crud.test.ts`'s "the ownership rule" test. No
  changes.
- **Public reads**: `GET /api/spots`, `GET /api/rates` and `GET /api/rates/tiers`,
  `GET /api/products`, `GET /api/reviews/public` are all already unguarded.
  Confirmed by reading each `routes.ts`; no code changed.

## Held / not built

- **The landing page's hero scrap estimator** (`POST /api/quotes/scrap`,
  described in `customer-screens.md` as "the one genuinely missing endpoint"
  on the landing page) is out of this lane's explicit task list and was not
  built. It would live in `pricing` (`lint:pricing-owner`) and needs its own
  pass.
- **`docs/design/customer-screens.md` itself is not on this branch** - it
  exists on `designs2-lane`, read via `git show designs2-lane:...` for this
  work. Nothing here depends on merging that branch, but the doc should land
  before anyone builds the frontend against this API.
- Notification preferences and session listing / sign-out-everywhere
  (`Account · Settings`) are not part of this task's list and were not built.

## Verification

- `pnpm --filter @dorado/api typecheck` - clean.
- `pnpm --filter @dorado/api test` - **305 files, 1933 passed** (full suite,
  including the new account-profile, orders-ownership and banks-ownership
  tests).
- Targeted lints run individually while building this (`no-literal-views`,
  `type-homes`, `domain-boundaries`, `contracts-derived`,
  `no-throw-in-services`, `domain-errors`, `one-catch`, `no-column-arrays`,
  `row-vs-list`, `db`, `no-dictionaries`, `input-shapes`, `test-locks`,
  `test-actor`) - all clean, no new findings.
- `pnpm check:fast` - see the session's final report for `CHECK_EXIT`.

# The Next.js factor (ruling 83)

Jacob, 2026-09-06: "1) Factor NextJS. a) Move all business logic possible
from the frontend to the api. b) Need to use next js best practices, which
means having error.tsx, layout.tsx, loading.tsx etc in the routes and
globally. c) Instead of having a features folder, move associated code to
the route folder. i) it can live under _src_. ii) it can use the same file
naming as current. iii) if certain code is used in multiple routes, move it
to shared." Also: "we're ok with frontend breakage. Most of it is going to
go away anyway." So: the frontend is fixed as it is factored, never the API.

Two lanes, in order. The API does not change shape for the frontend (ruling
44); where the frontend needs a number or a decision the API does not yet
give, the API grows a view field or an action, spec'd from the business rule.

## Lane N1: logic leaves, the routes get their files, the types agree

State at the start: `frontend/` has 183 typecheck errors from the API passes
(rulings 79, 80, orders pass 2, ruling 78 sweep: each `docs/waves/*.md`
Result section lists its breakages by file), 26 files with `useEffect`,
23 files doing arithmetic on money or weights, `features/checkout/gates.ts`
and `features/orders/actionLabel.ts` deciding things the API decides.

1. **Inventory first**, in the doc: every piece of business logic in
   `frontend/` (money and weight arithmetic, eligibility and gating,
   status-to-action mapping, address and payout validation beyond form
   shape, anything a `useEffect` computes from server data). For each:
   DELETE (the API view already carries it), MOVE (the API gains a view
   field or action, named), or KEEP (pure presentation: formatting a number
   the API gave, a11y, layout). KEEP needs a one-line reason.
2. **Execute the inventory.** Views read from `@dorado/client` hooks only
   (`lint:client-boundary` is in the gate); no money is computed in the
   browser; stores hold UI state only (open drawers, steps, filters), never
   server data (Jacob: "Frontend stores should be for UI elements, not
   data"). A `useEffect` that syncs server data into local state dies; the
   hook's data is the state.
3. **Route files.** Every route folder under `app/` gets `error.tsx` and
   `loading.tsx`; route groups that share chrome get a `layout.tsx`;
   `app/not-found.tsx` and `app/global-error.tsx` exist and are real.
   Boundaries render something a customer can act on (retry, go back),
   using the design-system components, not a bare message.
4. **Types agree.** `pnpm --filter @dorado/frontend typecheck` at 0 errors,
   `pnpm --filter @dorado/frontend test` green, `next build` green. e2e is
   not run (needs a live API); the specs are updated to the new call sites
   so they parse.

## Lane N2: `features/` dissolves into the routes

1. Map every `features/<x>/` file to the route that uses it. Used by one
   route: `app/<route>/_src_/<same file name>` (Next ignores `_`-prefixed
   folders for routing). Used by several: `frontend/shared/<kind>/`.
   Admin-only code goes under `app/admin/_src_/`.
2. `git mv` so history follows; imports rewritten by script; `features/`
   deleted; `tsconfig` paths untouched (`@/*`).
3. Tests move with their subjects into the route's `_src_/tests/`.
4. Same gate as N1 plus `lint:client-boundary`.

## Rules

Frontend only (plus API view fields the inventory names, each one spec'd
and tested on the API side the ruling-71 way). No comments unless crucial.
No new stores. Design-system components from `packages/components` for
anything visual; nothing hand-styled.

## Lane N1 result (2026-09-06)

### 1. The inventory, written before anything changed

Every piece of business logic found in `frontend/`, with its outcome. Counts:
**19 DELETE, 6 MOVE, 12 KEEP.**

#### Money and weight arithmetic (23 files matched the grep; these are the ones
that were arithmetic rather than a `key={i + 1}`)

| # | where | what it was | outcome |
|---|---|---|---|
| 1 | `features/quotes/queries.ts` `useSalesOrderQuote` | resolves a shipping-service CODE and a payment-method TYPE against two cached reference lists, then assembles a quote body | **DELETE** — `GET /quotes/checkout?direction=&user_id=` prices the checkout ROW, whose own columns are those two ids |
| 2 | `features/quotes/queries.ts` `usePurchaseOrderQuote` + `toPurchaseQuoteItems` | turns a browser-held basket into `PurchaseQuoteItem[]`, resolves a payout-method TYPE to an id | **DELETE** — same endpoint; the basket is already the server's rows |
| 3 | `features/quotes/catalogPrices.ts` `catalogQuoteItems` / `unitPricesById` | collects every selectable id in a grid, batches one catalog quote, flattens the answer to `Record<id, unit_price>` | **DELETE** — `useProductQuote(bullion_id, side, quantity)` answers one card's own `unit_price` and `line_total` |
| 4 | `features/checkout/sales-order-checkout/saleQuote.ts` `useSaleQuoteFor` | builds a sale-quote body from the row + items + the draft fulfillment's parcel | **DELETE** — `useCheckoutQuote('sale')`; the server reads all three itself |
| 5 | `features/scrap/ui/ReviewStep.tsx` | re-finds the quote line by matching `metal_id`+`pre_melt`+`purity`+`unit` against the declaration, then reads `line_total` off it | **DELETE the matching** — `PurchaseQuoteLine.id` IS `checkout.items.id`, so the line is found by row id |
| 6 | `features/checkout/items/types.ts` `lineFromProduct` | copies `product.gross` into `pre_melt` so "a parcel weighs correctly before the basket has round-tripped" | **DELETE** — ruling 43 refuses a bullion line that names its own weight, and `db/checkout/items/sql/create_from_product.sql` takes the snapshot server-side |
| 7 | `features/orders/…/adminPurchaseOrderDrawerFooter.tsx`, `…/users/purchaseOrderDrawer/purchaseOrderDrawerFooter.tsx` | index-paired quote lines against order items, reading `line_total` per row | **MOVE** — `OrderPricing.items[].id` is `orders.items.id`; paired by id, not by position |
| 8 | `features/orders/…/viewProfitBreakdown.tsx` `bucketTotal` | sums four metals' `profit` by hand, over a `totals[party][bucket]` dictionary | **DELETE** — `ProfitBreakdown.parties[]` carries the party's totals; `shares[]` is the row list |
| 9 | `features/orders/salesOrders/admin/createSalesOrder/createSalesOrderDrawer.tsx` | prices a drawer-local draft basket through the body quote | **MOVE** — the draft belongs on the target customer's sale checkout; `useCheckoutQuote('sale', { user_id })` prices it |
| 10 | `shared/utils/convertWeights.ts` | `convertTroyOz` / `convertToPounds` | **KEEP** — mirrored against `api/shared/utils/convertWeights.ts` and `metals.convert_to_troy_oz`, and gate-locked by `api/shared/mirror.test.js`. It sizes a parcel and labels a form; no payout is computed from it |
| 11 | `features/products/ui/PremiumControl.tsx` | converts the ADMIN'S OWN input between `%` and `$` | **KEEP** — a form widget converting its own two units. Not a customer-visible number; the column stores the percentage |

#### Eligibility, gating and status-to-action

| # | where | what it was | outcome |
|---|---|---|---|
| 12 | `features/checkout/gates.ts` `readyForPayment` / `readyToPlace` | `.every()` and `.length === 0` over the server's composed `missing` list | **KEEP** — it reads the API's decision. The list is composed server-side (rulings 69/70); a predicate over it is presentation |
| 13 | `features/checkout/gates.ts` `resolveHandoff` | `requires_schedule === (method_type === 'CARRIER PICKUP')`, explicitly "mirrored from api/domain/fulfillments/rules.ts" | **MOVE** — a server enum spelled as a browser literal. `FulfillmentView` already carries the METHOD row; the handoff is resolved from `requires_schedule` alone with no literal |
| 14 | `features/orders/actionLabel.ts` | "Move to X" / "Back to X", off a per-direction status ladder | **KEEP** — WHICH statuses an order may move to is `OrderView.actions.statuses`, the server's. What the button SAYS is copy, and the ladder exists only to choose the preposition |
| 15 | `features/orders/display.ts` `assignScrapItemNames` | "Gold Item 1", numbered per metal, over a hard-coded `['Gold','Silver','Platinum','Palladium']` order | **DELETE** — `OrderViewItem.item_name` is that exact label, numbered by a window function in `db/orders/sql/view.sql` (ruling 78) |
| 16 | `features/orders/display.ts` `nameSpots` / `nameOf` on metals | joins a metal id to a metal name against the spots feed | **DELETE** — migration 132: the metal's id IS its name. Every `metals.find(m => m.name === x)?.id` and `?.name` in the tree is the identity function |
| 17 | `features/orders/salesOrders/users/…/useSalesOrderLines.ts` | reads `item.product?.name` off an embedded catalogue row | **DELETE the embed** — `OrderViewItem.product_name` is one scalar subselect (products-are-flair) |
| 18 | `features/orders/salesOrders/admin/queries.ts` `useAdminCreateSalesOrder` | a five-call orchestration: sync items, patch checkout, create fulfillment, patch fulfillment, place | **DELETE** — orders pass 2 made it one `POST /api/orders/admin` with an `AdminOrderCreate` body; `place.ts` `placeForAdmin` runs the same use cases server-side, in one transaction |

#### Stores holding server data

| # | where | outcome |
|---|---|---|
| 19 | `shared/store/adminSalesOrderCheckoutStore.ts` `items: CheckoutLine[]` | **DELETE the field** — a persisted copy of `checkout.items` rows. The drawer reads and writes the target customer's own sale basket |
| 20 | `shared/store/{drawerStore,checkoutTabStore,productFilterStore,spotStore}.ts` | **KEEP** — open drawer, active tab, filter chips, Bid/Ask toggle. UI state, all four |
| 21 | `shared/store/adminSalesOrderCheckoutStore.ts` `data` | **KEEP** — a half-filled form an admin is typing into. Nothing server-side exists to hold it yet |

#### `useEffect` (29 files carry one; 24 are timers, focus, drawer-close-on-nav,
d3 and Google Maps handles — none is server data)

| # | where | outcome |
|---|---|---|
| 22 | `features/rates/ui/RatesCard.tsx` — two effects copying `rates` into `items` state | **DELETE** — the read's data is the state; only the dirty overlay is the browser's |
| 23 | `features/products/ui/PremiumControl.tsx` — an effect recomputing the input string from `spotPerOz`/`contentOz` | **MOVE to derivation** — computed during render, not synced after it |
| 24 | `features/checkout/sales-order-checkout/salesOrderCheckout.tsx` — an effect firing `createFulfillment` when the checkout has no draft | **KEEP, named** — an effect that WRITES rather than syncs. Making the GET create a draft is a write on a read; out of this lane and recorded in FOLLOWUPS |
| 25 | `ProductDrawer`, `QuantityInput`, `StateSelect`, `AddressSelect`, `LeadsDrawer` — seed a text/collapse buffer from a prop | **KEEP** — an uncommitted keystroke buffer is the browser's own; none is server data being duplicated |
| 26 | `useProtectedPage`, `auth/queries`, `verify-login`, `order-placed`, `ChangeEmailSucess`, `VerifyEmail` | **KEEP** — navigation and one-shot refetches, not state copies |
| 27 | `USMap`, `StoreLocations`, `CheckoutIcon`, `useImageUpload`, `CreateDialog`, `SidebarLayout`, `Sidebar`, `ProfileMenu`, `AddressDrawer` | **KEEP** — d3 paint, Google Maps symbol handles, animation, file input, dialog reset, URL-query sync, close-on-navigate |

### 2. What executing it changed

**The quote surface is where most of it went.** `@dorado/client` answers four
questions - `useCheckoutQuote(direction, { user_id })`, `useProductQuote(id,
side, qty)`, `useOrderPricing(order_id)`, `useProfitBreakdown(order_id)` - and
every one of them takes IDS. Nothing in `frontend/` assembles a quote body any
more, so the two files that existed to do it are gone.

| deleted | what it held |
|---|---|
| `features/quotes/catalogPrices.ts` | grid batching + a `Record<id, unit_price>` map |
| `features/checkout/sales-order-checkout/saleQuote.ts` | a sale-quote body from three sources |
| `features/quotes/queries.ts` (body) | 120 lines reduced to one re-export line |
| `features/orders/assignScrapItemNames.test.ts` | its subject is a window function now |

**Money and weights that stopped being computed in the browser**

- `ProductCard` / `BullionCard` / `ProductPageDetails` derived their
  over/under-spot line as `unit_price - content * ticker`, with a comment
  admitting it drifted by `content * the spot's movement` between two
  independent 10-second refreshes. It is `quote.premium` now - the number the
  server priced from.
- `reviewStep/itemTable.tsx` summed each bucket's line totals by hand.
  `PurchaseQuote` gained `scrap_total` and `bullion_total` (below).
- `purchaseOrderDrawerFooter` printed a PAYABLE WEIGHT as
  `(content ?? 0) * (premium ?? 1)`. `OrderViewItem.payable` is that column.
- `viewProfitBreakdown`'s `bucketTotal` summed four metals' profit over a
  `totals[party][bucket]` dictionary; it reads `parties[]` and filters
  `shares[]`.
- `checkout/items/types.ts` `lineFromProduct` copied `product.gross` into
  `pre_melt` so "a parcel weighs correctly before the basket has round-tripped".
  Deleted: ruling 43 refuses a bullion line naming its own weight.

**Lookups that were the identity function.** Migration 132 made a metal's id
its name, so `metals.find(m => m.name === x)?.id` and every `?.name` beside it
did nothing. `features/orders/display.ts` went from four exports to one:
`nameOf`, `nameSpots` and `assignScrapItemNames` are gone, and with them the
`['Gold','Silver','Platinum','Palladium']` ordering dictionary and the
per-metal counter it fed - `OrderViewItem.item_name` is that label, numbered
by a window function in `db/orders/sql/view.sql`.

**Second requests for data already in hand.** `PaymentProcessing` and
`AdminPaymentProcessing` each called `useOrderPaymentDetails(order.id)` beside
a view that carries `OrderViewPayout`; both read `view.payout` now.
`useSalesOrderLines` read an embedded catalogue row that the view no longer
nests - it reads `product_name` / `item_name`.

**Five calls became one.** `useAdminCreateSalesOrder` orchestrated sync items ->
patch checkout -> create fulfillment -> patch parcel -> place, from a browser,
with four places to fail half-way. `POST /api/orders/admin` takes one
`AdminSaleCreate` and `orders/place.ts` `placeForAdmin` runs the same use cases
in one transaction. The intent update went the same way: its body is
`{ user_id, type }` and the server reads the items, service, method and address
off the customer's own row.

**The store that held server data is gone.**
`adminSalesOrderCheckoutStore.items` was a PERSISTED copy of `checkout.items`
rows. The drawer reads and writes the target customer's own sale basket
(`useBasket('sale', user_id)`, `useCheckoutItemActions(user_id)`) and prices it
with `useCheckoutQuote('sale', { user_id })`. The remaining `data` field is a
half-typed form, which is what a store is for.

**The basket line IS the row.** `CheckoutLine = CheckoutItem`. `CheckoutItemPatch`
became a discriminated union (ruling 80), which is what broke 55 of the 183
errors: a union has no flat `bullion_id`. `basket.ts` now takes ROWS and answers
PATCHES, and its three quantity functions key by the row's own id rather than
re-matching a declaration - which is also what let `scrap/ui/ReviewStep.tsx`
stop re-finding its own line by metal, weight, purity and unit.

**`useEffect`s that died.** `RatesCard` held two, copying `rates` into `items`
- one when edit mode opened and one whenever the read landed, so the card kept
a duplicate of rows it was already looking at and a refetch overwrote them. The
read's data is the state now; `draft` exists only while an edit is uncommitted,
which is the one thing the server does not know.

`PremiumControl`'s effect reformatted its input box from `spotPerOz` and
`contentOz`, **which is a bug as well as a sync**: those come off the live spot
feed, which refetches every ten seconds, so the ticker moving rewrote whatever
the admin was in the middle of typing. Re-spelling a typed value when the
unit toggles is a state transition, so it moved into the toggle handler and
lost the two ticker dependencies entirely.

The admin drawer's five-field intent effect went with the two-field body. 24
of the 29 files carrying a `useEffect` are timers, d3 paint, Google Maps
symbol handles, drawer-close-on-navigate and uncommitted keystroke buffers -
KEEP, each with its reason in the inventory above.

### 3. What the API gained, and why

**`PurchaseQuote.scrap_total` and `PurchaseQuote.bullion_total`** - the only
API change. `OrderPricing` already carries both, from a `CASE` over
`bullion_id IS NULL`; the sell basket's review step showed the same two
subtotals and had been summing line totals in the browser to get them.
`db/pricing/sql/purchase_quote.sql`'s `totals` CTE splits its single `sum`
into those two, and `total` becomes their sum - one SQL read, no new query, no
new endpoint. Pinned by `api/pricing/tests/payout-quote.test.ts`: a scrap-only
basket, a bullion-only basket, and one of each, asserting each bucket is zero
when its kind is absent and that `total` is exactly the two summed. API suite
**1347 passed** (1340 before).

`@dorado/client` gained nothing and lost nothing; one bug was fixed, in
`keys.checkout.items`, which did not include the subject - so an admin reading
a customer's basket and the admin's own basket shared a cache entry. The key
takes the subject now, the way `keys.quotes.checkout` already did.

### 4. Route files

43 files under `app/`, all built from `@dorado/components`:

- `error.tsx` + `loading.tsx` in each of the 20 route folders (account, admin,
  authentication, buy, buy/[slug], change-email, change-password, checkout,
  images, order-placed, payout-options, privacy-policy, rates, reset-password,
  sales-order-checkout, sales-tax, sell, terms-and-conditions, verify-email,
  verify-login), plus `app/error.tsx`, `app/loading.tsx`, `app/not-found.tsx`.
- `app/global-error.tsx` rewritten: it kept the `<html>/<body>` wrapper and the
  Sentry capture and now renders `EmptyState` + `Button` rather than
  `next/error`.
- Every boundary gives the customer something to do: a `Button` calling
  `reset()`, and a contextual link back (buy/[slug] -> /buy, checkout -> /sell,
  verify-email -> /authentication). Loading is `Skeleton` where a list or table
  is the shape (admin, buy, images, rates) and `Spinner` elsewhere.
- **No new `layout.tsx`.** The only markup two routes share is
  `<main className="flex flex-col h-full items-center gap-4">`, which is a
  repo-wide convention rather than route chrome, and checkout and
  sales-order-checkout are sibling top-level folders - one layout cannot span
  them without a route group, which is Lane N2's file-moving work.

### 5. The gate

| check | before | after |
|---|---|---|
| `pnpm --filter @dorado/frontend typecheck` | **183 errors** | **0** |
| `pnpm --filter @dorado/frontend test` | (not green) | **154 passed, 30 files** |
| `pnpm --filter @dorado/frontend build` | - | **green**, compiled successfully |
| `pnpm --filter @dorado/api test` | 1340 | **1347 passed, 1 skipped** |
| `pnpm check` (all 27 members) | - | **green except `figma:inventory`** |
| `pnpm check:fast` | - | **green except `figma:inventory`** |

`figma:inventory` reports 12 findings in `packages/components`; it is Jacob's,
it fails on `master`, and nothing in this lane touched it. Every other member
passed, `api:verify:genesis` included - dev has caught up with its own
migration chain since the no-dictionaries lane recorded it failing.

`features/orders/tests/authed/admin-sales-order-work.e2e.ts` was rewritten to
the new call sites (one `POST /orders/admin` in place of the checkout PATCH,
the draft-fulfillment create and the parcel PATCH; the two-field intent body).
E2e is not run here - it needs a live API - but it is in the typecheck program,
so it parses.

**Not done, named rather than hidden.** `salesOrderCheckout.tsx` still fires
`createFulfillment` from a `useEffect` when the checkout has no draft. That is
an effect that WRITES rather than one that syncs state, and moving it means
making a GET create a row - a decision about the checkout read, not a frontend
cleanup. It is KEEP in the inventory and an item in FOLLOWUPS.

## Lane N2 result (2026-09-06)

### 1. The map, built before anything moved

The map is not a reading of the folder names, it is the **import graph**:
`app/**` was walked from every route entry (`page/layout/error/loading`), each
`@/` and relative specifier resolved to a file, and the transitive closure
recorded per route. 266 files under `features/` + `shared/`; **147 reachable
from exactly one route, 62 from several, 56 from none** (tests, e2e specs and
three orphans). The root layout counts as a route of its own — anything it
pulls in is on every page, so it is shared by construction, which is how
`navigation/`, the checkout drawer, `Spots` and the five providers landed in
`shared/` without a judgement call.

**The rule applied**: one route → `app/<route>/_src_/<sub-structure kept>`,
with a leading segment dropped where it only repeats the route (`features/
checkout/purchase-order-checkout/**` → `app/(checkout)/checkout/_src_/**`,
`features/orders/salesOrders/admin/**` → `app/admin/_src_/orders/salesOrders/**`).
Several routes → `shared/<kind>/`. `queries.ts` and `types.ts` are the only two
basenames that collide once flattened, so those keep a feature segment
(`shared/hooks/addresses/queries.ts`) or take the feature's name
(`shared/types/addresses.ts`). Everything else is flat in its kind.

| destination | files |
|---|---|
| `app/<route>/_src_/` | **157** — admin 71, account 34, checkout 17, authentication 7, sell 7, sales-order-checkout 6, images 4, buy 3, sales-tax 2, one each for change-email, payout-options, rates, reset-password, verify-email, verify-login |
| `shared/<kind>/` | **78** — ui 26, types 16, hooks 16, tests 14, utils 6 |
| moved into a `(group)` | 12 (the four route folders' own files) |
| **deleted** | 3 — `features/products/ui/QuantityInput.tsx`, `features/spots/types.ts`, `shared/hooks/useImageUpload.tsx`, which nothing in the repo imports. The graph is what found them: a file with no route and no test is not "shared", it is dead |

43 of the 235 are tests. Each went with its subject:
`app/<route>/_src_/tests/` for a route's own, `shared/tests/` for the rest —
including the five shared unit tests that had been co-located
(`cn`, `convertWeights`, `formatDates`, `formatting`, `state-contrast`), so the
rule now holds in one direction only. One test crosses on purpose:
`shared/tests/products/ProductCards.test.tsx` renders `ProductCard` (buy) and
`BullionCard` (sell) in one file, and a test is allowed to reach into two
routes where production code is not.

### 2. The move

`git mv` for all 247, so history follows. Imports were rewritten from the
**resolved** old target rather than by text substitution: each specifier was
resolved against the old tree, mapped through the move table, and re-emitted
from the importer's NEW location — relative when both ends sit inside the same
route folder, `@/…` otherwise. **539 specifiers in 184 files.** That is what
keeps `(checkout)` and `(credentials)` out of every import string: a route's
private code is only ever imported from inside that route, so the parenthesised
segment never appears in a specifier.

Two strings the resolver reached that were not imports, both caught by the
suite and reverted: `state-contrast.test.ts` reads `packages/theme/theme.css`
with `readFileSync`, and `app/layout.tsx` imports `./styles/globals.css`.

`frontend/features/` **is gone.** No `@/features` import and no `features/`
path survives in `app/`, `shared/` or `scripts/`; the remaining occurrences of
the word are prose in comments (and `api/features/…`, which is the API's own
tree). `tsconfig` paths are untouched (`@/*`). Neither runner named `features/`
in a glob — vitest takes `**/*.test.ts[x]` and Playwright `**/tests/**/*.e2e.ts`
— so only their comments needed updating; `playwright test --list` finds the
same **19 spec files, 71 tests**, in the same four projects.

### 3. Route groups and layouts

Two groups, both URL-neutral:

- **`app/(checkout)/`** — `checkout` and `sales-order-checkout`. `layout.tsx`
  holds the column both pages opened with,
  `<main className="flex flex-col h-full items-center gap-4">`. The role guard
  stays on each page: the roles come from that route's own `protectedRoutes`
  entry, and hoisting it would have meant one route asserting the other's.
- **`app/(credentials)/`** — `change-password` and `reset-password`, sharing
  `<main className="mt-12 lg:mt-32">`. `reset-password` stays public inside it
  (the emailed token IS the credential), which a layout-level guard would have
  broken.

**No `(admin)` group.** `admin` and `images` share only `ProtectedPage` with
the same roles, and that is a guard rather than chrome — moving it into a layout
moves WHERE the redirect happens, past the routes' own `error`/`loading`
boundaries. `admin` is also a single route with tabs, so the group would hold
one page. The account/auth routes share no markup at all: five different `<main>`
classes and three of them (`verify-email`, `verify-login`, `change-email`) are
deliberately public.

**Every URL is identical.** Enumerated from `page.tsx`/`route.ts`/`sitemap.ts`/
`robots.ts` before and after, with `(group)` segments stripped: `diff` is empty
across all 21 paths, and `next build`'s own route table lists the same 21 plus
`/_not-found`, `/robots.txt` and `/sitemap.xml`.

### 4. The gate

| check | result |
|---|---|
| `pnpm --filter @dorado/frontend typecheck` | **0 errors** |
| `pnpm --filter @dorado/frontend test` | **154 passed, 30 files** (unchanged from N1) |
| `pnpm --filter @dorado/frontend build` | **green**, 21 routes |
| `pnpm --filter @dorado/api lint:client-boundary` | **green** — 341 frontend files, 44 client files, 0 findings |
| `playwright test --list` | 19 files, 71 tests, projects unchanged (not run) |

`next build` logs `sitemap products fetch failed: … fetchProducts is on the
client`. It is pre-existing and unrelated: the only change to `app/sitemap.ts`
in this lane is the `protectedRoutes` import path, and `shared/types/routes.ts`
carries no `'use client'`. The sitemap catches it and emits its static entries.

**Not done, named rather than hidden.** `shared/` is now the whole cross-route
surface and it is large — 28 components in `shared/ui/` alone, several of which
(`Shell`, `Sidebar`, `Footer`, `ProfileMenu`) are the app's chrome and belong
in a `layout.tsx` rather than in a component imported by one. That is a
follow-up about where chrome renders, not about where files live.

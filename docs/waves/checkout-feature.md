# The checkout feature — server-owned rules, one client package, no effects

Jacob's program, verbatim: *"Start rolling through features on the API, get rid
of any types that are present. Figure out how to get rid of any prop spreading.
Resources come from the server (unless they really can't). Fix it up. Look at
the frontend counterparts at the same time. Is there business logic on the
frontend? Remove it to the API. Don't be afraid to change frontend code
entirely. A lot of it is VERY BAD. Start with checkouts. All those useEffects?
Terrible. Has to be a better way to make that shit function."*

Ruling 44 governs: **no request or response shape here is preserved for the
frontend's sake.** Everything below is a break, on purpose.

---

## 1. `#db` is a barrel now, and the pool moved to `#pool`

`api/db/index.ts` exports one flat module per table, named the way the
contracts name the entity — `checkouts`, `checkoutItems`, `orders`,
`orderItems`, `fulfillmentMethods`, `paymentMethods`, `addresses`,
`carrierServices`, … 45 in all. A service writes:

```ts
import { checkouts, checkoutItems, metals, packages } from "#db";
```

**`#db` used to be the pg pool** (`api/db.ts`), imported by 148 files as a
default export. Pointing `#db` at the barrel and leaving the pool there would
have been a cycle — `shared/db/query.ts` imports the pool, every repo imports
`query.ts` — so the pool took a new specifier, `#pool`, and the 149 `import
pool from "#db"` lines were rewritten mechanically. `api/vitest.config.ts`'s
alias table carries the same split (`#db` → `db/index.ts`, `#pool` → `db.ts`,
`#db/*` → the directory, as before).

`api/domain/index.ts` is the same idea one layer up — one flat module per
WORKFLOW, so `domain/checkout/service.ts`'s nine sibling-service imports became
one `import { addresses, fulfillments, products, rates, spots, users, … } from
"#domain"`. `#domain/*` still resolves the directory; only the bare `#domain`
specifier is new. A service that needs ONE sibling still imports it by path —
the barrel earns its keep where a use case reaches for several.

Only `domain/checkout/service.ts` consumes either barrel today; the other lanes
swap their own imports when they touch them.

**`audit:silent-mutations` was taught the `#db` barrel, and this is the part
that mattered.** It resolves a call's namespace through the calling file's own
import, so `import { checkouts } from "#db"` looked like a bare package and
every call through it stopped being audited — the count fell from 16 to 15 and
the script cheerfully asked for the ceiling to be *lowered*. It reads
`db/index.ts` now, and a fourth self-test case plants a violation behind the
barrel so the path cannot go blind again. (`lint:namespace-calls` is unaffected
by design: it only follows `import * as`, because a named import that does not
exist is already a load-time error.)

## 2. The checkout row answers every question the browser used to answer

`GET /api/checkout`, `PATCH /api/checkout`, `POST /api/checkout/fulfillment`
and `POST /api/checkout/payout` all answer **`CheckoutView`** — the
`checkout.checkouts` row plus eight computed fields:

| field | what it is |
|---|---|
| `fulfillment_method_type` | the draft fulfillment's method type (`CARRIER DROPOFF`, …) |
| `handoff_code` | that method resolved BACK into the handoff the stepper offered |
| `requires_schedule` | whether that handoff needs a date and a time |
| `item_count` | how many basket lines the session holds |
| `missing` | the outstanding steps, **in the order the stepper walks them** |
| `ready_for_rates` | items + a package + an address — the three refusals `getCheckoutRates` raises |
| `ready_for_payment` | everything before the money step is chosen |
| `ready_to_place` | `missing` is empty |

`missing` is a `CheckoutStep` enum in the contracts: `items`,
`shipper_address`, `recipient_address`, `package`, `carrier_service`,
`handoff`, `pickup_schedule`, `payout_account`, `payment_method`.

**The nested `fulfillment` object left the wire.** It carried a whole composed
fulfillment — method, pickup, direct, shipment — for the sake of one field the
frontend never read. The three fields above replace it.

All of it is computed by `domain/checkout/rules.ts` `checkoutState()`, which is
pure and tested without Postgres (`domain/checkout/tests/rules.test.ts`, 9
cases). `methodTypeFor` / `handoffFor` are the one place the carrier-handoff
and fulfillment-method vocabularies meet, and they are read in **both**
directions so the choice and its read-back cannot drift.

## 3. Business logic that moved out of the browser

| was | now |
|---|---|
| the stepper's default-address `useEffect` (ran once, per device, on first render) | `ensure()` sets the customer's default *valid* shipping address on a row whose address column is null — so a second device opens on the same address, and a post-order reset re-defaults |
| `isShippingStepComplete`, a boolean over five store fields | `row.ready_for_payment` |
| "is this placeable" (implicit — the Confirm button was never disabled) | `row.ready_to_place` |
| the rates gate (`!!address_id && !!package_id` in a hook's arguments) | `row.ready_for_rates` |
| `handoff.requires_schedule` looked up client-side from a reference list | `row.requires_schedule` |
| the pickup-scheduler effect that PATCHed `pickup_date` to the first available day on render | nothing writes: the calendar SHOWS the first available day and writes only on a click, so an unscheduled pickup honestly blocks the step |
| the rate ⇄ service-catalogue join, by `code`, in two components | `GET /checkout/rates` answers it joined |
| the sale checkout's `payment_method` CARD/CREDIT effect | one expression, `beginning_funds < base_total`, where the decision is used |
| the sale service selector's "heal the store's seed" effect | there is no seed: the row holds an id or null |
| the sale quote body's two reference-list lookups (service CODE → id, method TYPE → id) | the row already holds both ids |

## 4. `GET /api/checkout/rates` answers a joined list

It returned `CarrierRateQuote[]` — the carrier's raw per-service quote, with no
`shipping.services` id and no display order — and the browser held the offered
catalogue alongside it and paired the two by `code`.

It now answers **`CheckoutRate[]`** (`contracts/src/computed/providers.ts`):
every `CarrierRateQuote` field plus `carrier_service_id`, `name`,
`carrier_code`, `display_order`, `max_insured_value` and `selected`. One entry
per **offered** service, in the catalogue's display order; a service the
carrier did not price comes back with `netCharge: null`, which is what renders
its option disabled. The join is `domain/shipping/rules.ts` `offeredRates()`,
pure.

## 5. `packages/client` — `@dorado/client`

New workspace package. Ships **source** (like `@dorado/components`); the
frontend transpiles it (`next.config.ts` `transpilePackages`) and typechecks it
inside its own program, so there is no dist to drift.

```
packages/client/src/
  fetch.ts       apiRequest + ApiError            (the orders lane's file, verbatim)
  keys.ts        every query key                  (theirs, plus checkout/quotes)
  env.d.ts       one /// <reference types="node" />
  checkout/      one hook per endpoint
  tests/         7 cases
```

**The skeleton is the orders lane's** (dev `03547616`), on purpose, so the merge
is trivial: `src/fetch.ts` and `tsconfig.json` are byte-identical to
`/home/jtj60/dorado-lanes/main/packages/client/`, `keys.ts` is their file plus a
`checkout` and a `quotes` block, and `package.json` is theirs plus the
`./checkout` export subpath, a `test` script and the two devDependencies that
needs. `src/index.ts` is three lines and will want `export * from "./orders";`
adding back on merge. **`src/env.d.ts` is new and is a real fix, not
scaffolding**: the shared `fetch.ts` reads `process.env.NEXT_PUBLIC_API_URL`,
the shared `tsconfig.json` sets no `types` field, and TypeScript 7 under
`moduleResolution: bundler` no longer auto-includes `@types/*` — so
`pnpm --filter @dorado/client typecheck` fails on `Cannot find name 'process'`
without it. The reference leaves `tsconfig.json` untouched.

- **fetch, not axios.** The package may import nothing but `@dorado/contracts`,
  `react` and `@tanstack/react-query`, so a host bundling it drags in no HTTP
  library.
- **Hooks** (`src/checkout/queries.ts`): `useCheckout`, `usePatchCheckout`, `useSetCheckoutFulfillment`,
  `useSaveCheckoutPayout`, `useCheckoutItems`, `fetchCheckoutItems`,
  `useReplaceCheckoutItems`, `useClearCheckoutItems`, `useCheckoutRates`,
  `usePackages`, `usePlaceOrderFromCheckout`, `usePurchaseQuote`,
  `useSalesQuote`. Every mutation that answers the row writes it straight into
  the cache; the item mutations invalidate the row, because `item_count` and
  `missing` are answers about the basket.
- Wired into `scripts/check.mjs`'s components group (`client:typecheck`,
  `client:test`).

**`lint:client-boundary`** (`api/scripts/lint-client-boundary.ts`, self-tested,
8 cases, in check.mjs's api-lint group) refuses a `fetch`/`apiRequest`/
`pdfRequest`/axios call anywhere under `frontend/`, and any import into
`packages/client` outside the three allowed packages. Type imports from
`@dorado/contracts` in `frontend/` are fine and always were — what is refused
is the CALL. Two floors guard the walk. `ACCEPTED` holds one file
(`shared/queries/axios.ts`, the legacy transport); `PENDING` holds twelve
directory prefixes for surfaces whose own lanes have not converted — both are
pinned from **both** sides, so an entry whose file stopped calling is reported
and the list can only shrink. **`frontend/features/checkout` is deliberately
absent from both.**

## 6. The frontend, before and after

**Deleted**: `shared/store/purchaseOrderCheckoutStore.ts`,
`shared/store/salesOrderCheckoutStore.ts`,
`purchase-order-checkout/shippingStep/insuranceSelector.tsx` (it wrote a store
field nothing ever sent — the create body has been `{ checkout_id }` since
D210).

**New**: `purchase-order-checkout/payoutStep/payoutDraft.ts` (the half-typed
bank form, the one thing no row can hold — the server seals the numbers and
never returns them), `sales-order-checkout/saleQuote.ts`.

**Kept as thin adapters, not query files**: `features/checkout/queries.ts` and
`features/checkout/items/queries.ts`. Every request moved into
`@dorado/client`; what is left is the two things that package deliberately does
not know — who is signed in, and the ANONYMOUS basket (`/checkout/items` is
`requireUser`, so a signed-out visitor has no server row). `useBasket(direction)`
answers the server's rows when signed in and the local zustand basket when not.
Their module paths did not move, so no other lane's imports changed.

**Effects removed: 8.** The stepper's default-address init and its rate
refresh; the payout step's validity sync and its `trigger()`; the pickup
scheduler's default-date PATCH; the sale service selector's seed heal; the
payment select's CARD/CREDIT flip; the sale checkout's payment-intent update.
The store-locations map keeps one effect that builds google-maps marker
symbols — a browser-API subscription, not state derivation — and lost the one
that selected the first store (a value the same render already had).

**`checkoutItemsStore` survives as the anonymous basket only**, with a header
saying so; it is still the add/remove entry point other lanes' product and
scrap surfaces call, so nothing outside `features/checkout/**` changed.

## 7. Shape changes, for the frontend follow-up

- `GET|PATCH /api/checkout`, `POST /api/checkout/fulfillment`,
  `POST /api/checkout/payout`: **`fulfillment` (nested object) removed**;
  `fulfillment_method_type`, `handoff_code`, `requires_schedule`,
  `item_count`, `missing`, `ready_for_rates`, `ready_for_payment`,
  `ready_to_place` added.
- `GET /api/checkout/rates`: `CarrierRateQuote[]` → `CheckoutRate[]` (six new
  fields; one entry per offered service rather than per carrier answer).
- No route moved, no body changed, no migration was needed.

## 8. Left, deliberately

- **`POST /quotes/purchase_order` and `/quotes/sales_order` still take bodies.**
  `docs/waves/checkout-items-shape-changes.md` §6 records why: making the
  purchase quote session-scoped ends anonymous sell-cart pricing, which is
  Jacob's call, and the sales quote must move together with `payments`' intent
  pricing or a quote and the charge for it read different rows. The client
  package's `usePurchaseQuote`/`useSalesQuote` take the contract bodies, so
  the move is a body change in one file.
- **The sale create is still `requireAdmin`** (`creates.routes.ts`, Jacob's
  26 August call). The customer buy checkout is wired end to end and will 403
  until that word changes.
- **`checkout.checkouts.direction` is still `text`**, so `CheckoutView`'s
  `direction` is `z.string()` and the service casts it once. Ruling 48 already
  names the one-line `ALTER`.
- The twelve `PENDING` prefixes in `lint:client-boundary` are the other lanes'
  surfaces; each entry dies when its lane converts.

# API journeys - replacing the Playwright e2e specs (ruling 55)

Seven journey suites, all green, all HTTP-first with one documented domain
seam for order placement (no HTTP entry point injects a stub `World`).

## Mapping

| e2e spec | journey test | outcomes asserted |
|---|---|---|
| `customer-checkout-purchase.e2e.ts` (extended past its stop point) | `api/domain/checkout/tests/journeys/sell-journey.test.ts` | basket (scrap+bullion) -> row -> fulfillment -> payout (HTTP) -> place (domain seam) -> bullion line takes the rate band, not the cart premium -> payout read is last-four only -> finalize_pricing/add_funds/ledger agree -> status labels |
| `customer-checkout-sales.e2e.ts` (extended past its stop point) | `api/domain/checkout/tests/journeys/buy-journey.test.ts` | basket -> row -> a REAL Stripe intent via `stripe/create-payment-intent.json` cassette -> place (domain seam) finds that exact intent through `findOpenForUser` -> status labels Preparing/Shipped/Cancelled |
| `admin-purchase-order-work.e2e.ts` (seed replaced by builders per the brief) | `api/domain/orders/tests/journeys/purchase-order-lifecycle.test.ts` | finalize_pricing total == ledger credit == balance delta; status round-trip In Transit<->Received; Cancelled; sale-direction refusal (422) on both purchase-only actions |
| `admin-sales-order-work.e2e.ts` (lifecycle half; Stripe-priming setup replaced by builder) | `api/domain/orders/tests/journeys/sales-order-lifecycle.test.ts` | born Pending -> Preparing -> Shipped -> Cancelled; intent amount untouched by a status write; `/cancel` is purchase-only (422 on a sale) |
| `customer-address-crud.e2e.ts` + `customer-addresses.e2e.ts` | `api/domain/places/addresses/tests/journeys/address-crud.test.ts` | create -> book -> edit -> delete; ownership: a stranger's edit 404s, a stranger's delete is a same-user no-op (see finding below), an admin naming the owner's id reaches it |
| `admin-creates.e2e.ts` (lead half) | `api/domain/leads/tests/journeys/admin-creates-lead.test.ts` | create -> appears in admin list -> delete -> re-delete 404s; admin-only (403 for a customer) |
| `admin-creates.e2e.ts` (carrier half) | `api/domain/shipping/carriers/tests/journeys/admin-creates-carrier.test.ts` | create -> appears in list -> delete; create/delete admin-only, read is not |

## Skipped, with reasons (no new scope taken beyond this)

- **`admin-purchase-orders.e2e.ts` / `admin-sales-orders.e2e.ts`** (read-only
  table/filter specs) - the underlying list/read endpoints are already
  exercised incidentally by the lifecycle tests above; a dedicated
  filter-by-filter journey was not built.
- **`admin-access.e2e.ts`, `admin-drawers.e2e.ts`, `admin-impersonation.e2e.ts`,
  `admin-sections.e2e.ts`, `admin-users-table.e2e.ts`** - primarily UI
  navigation/rendering assertions with no distinct API journey underneath
  the existing users repo/service/HTTP suites.
- **`catalogue.e2e.ts`, `rates.e2e.ts`** - read-only rendering specs over
  endpoints already covered by existing HTTP suites.
- **`degradation.e2e.ts`, `public-pages.e2e.ts`** - pure frontend
  error-boundary/page-render assertions; no server counterpart.
- **`customer-address-maps.e2e.ts`** - `@maps`-tagged (billed Google Places
  calls), excluded from the default e2e run itself; not ported.
- **The real `POST /orders/:id/cancel` (return label) and
  `POST /orders/:id/send_to_refiner`** were not driven through their live
  endpoints - see Cassette/provider gaps below. The purchase lifecycle test
  reaches "Cancelled" via the plain status PATCH instead (statuses are
  labels, ruling 2), matching what the real e2e specs' own cleanup hooks do.

## Cassette / provider gaps

1. **No FedEx cassette matches a purpose-built order's return-label request.**
   `fedex/create-and-void-label.json` is recorded against fixed constants
   (`CUSTOMER_ADDRESS`/`STORE_ADDRESS`/`FEDEX_GROUND`/
   `DROPOFF_AT_FEDEX_LOCATION`) that a fixture would have to reproduce
   exactly for nock to match; not attempted this pass. `cancel-with-a-return-
   label` is therefore untested through the real endpoint.
2. **No Stripe cassette prices a real cart.** `stripe/create-payment-intent.json`
   only answers the `items: []` / $10-placeholder cold-start path
   (`domain/payments/tests/update-intent.test.ts`'s own scenario) - Stripe's
   `amount` field is never normalised, so any other total fails to match.
   `buy-journey.test.ts` uses that placeholder path and documents it inline.
3. **`sendToRefiner` has no test-friendly HTTP entry.** The controller calls
   `orders.sendToRefiner(id, refiner_id)` with no `transport` argument, so a
   real HTTP call reaches `sharedTransport()`, which throws by design during
   a test run ("refusing to build the real mail transport"). Not driven
   through HTTP this pass.

## Finding for the coordinator

`domain/orders/service.ts`'s `sendToRefiner` asserts
`direction === "sale"`, not `"purchase"` - the brief listed "send to refiner"
under the SELL/purchase journey. Confirmed by reading the four
`assertDirection` call sites (`finalize_pricing`/`add_funds`/`cancel` are
purchase-only; `send_to_refiner` is sale-only). Worth a second look before
assuming the brief's grouping is current.

## Routes from the other lane (payments/shipments/transactions), called as-is

- `POST /api/stripe/update_payment_intent` (`transport/payments/controller.ts`,
  `domain/payments/service.ts`) - called read-only in `buy-journey.test.ts`
  against the existing cassette. Not modified.
- Order placement and cancel transitively call `domain/shipping/shipments`
  and `domain/payments` services; nothing under those paths was edited.

## Verification

- `pnpm --filter @dorado/api lint:test-locks` - 0 unaccepted findings.
- `pnpm --filter @dorado/api lint:test-actor` - 0 unaccepted findings.
- `--project http` (68 files): 358/358 passed.
- `pnpm check:fast`: PASS, 37.46s.
- `pnpm --filter @dorado/api test:coverage`: 1178/1178 passed; thresholds
  intact (81.32% stmts / 68.23% branches / 86.09% funcs / 84.32% lines
  overall - all per-path floors in `vitest.config.ts` held).
- `pnpm --filter @dorado/api audit:test-leaks`: **the leak check itself is
  green** - "no table changed - the suite leaves nothing behind in
  test_api_journeys". Its internal full-suite re-run hit 2 unrelated timeouts
  (`domain/media/pdfs/tests/service.test.ts`, `domain/payments/tests/
  sweeps.test.ts`, `domain/quotes/tests/payout-quote.test.ts`, all at exactly
  20000ms) under the machine load from three stacked full-suite runs this
  session; re-run alone, all three pass in 2.05s. Not a regression from the
  journeys - none of the three touches checkout, orders/journeys, addresses,
  leads or carriers.

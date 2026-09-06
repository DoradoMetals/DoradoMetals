# The frontend follows the API (ruling 44), 2026-09-08

Three API lanes landed overnight - lots (`docs/waves/lots-build.md`), payment
rails (`docs/waves/payment-rails.md`) and the passwordless auth screens
(`docs/waves/frontend-auth.md`). Each moved wire shapes and none touched the
frontend, on purpose. This is the pass that catches it up.

Jacob's standing words for it: *"You can try to fix, but we're ok with frontend
breakage. Most of it is going to go away anyway."* So the bar here is **every
route renders on the new data and every gate is green**, not a rebuilt surface.
Where a whole concept died and the design notes say its screen is being redrawn
from Figma, the minimum was done and nothing new was drawn - ruling 96 (no
component that is not in Figma).

Nothing in `api/` changed. The API did not move for the frontend once.

## The blocker: every route 500'd, and no auth file was in it

`docs/waves/frontend-auth.md` measured it: `next dev` answered **500 on every
route in the app**, printing exactly three errors and nothing else -

```
Export useCheckoutItems doesn't exist in target module
Export useClearCheckoutItems doesn't exist in target module
Export useReplaceCheckoutItems doesn't exist in target module
```

`shared/hooks/checkout/items/queries.ts` imported those three from
`@dorado/client`, which renamed them to `…Lots` in the lots lane, and that file
sits in `shared/ui/Shell.tsx` - the site nav, which `LayoutProvider` renders on
**every page**. One unresolved import in one module, and the whole app fails to
compile.

It was not a rename, which is why the auth lane refused to bodge it: the PUT
body key went from `{ items }` to `{ lots }` and the row type from
`CheckoutItem` to `Lot`, so repairing it meant converting the basket's line
arithmetic and every card, stepper and drawer that reads a basket line.

**Fixed first, in three files**, and every route rendered again before anything
else was touched:

| file | what it is now |
|---|---|
| `frontend/shared/types/checkoutItems.ts` → `checkoutLots.ts` | `CheckoutLine = Lot`; `toNewCheckoutItem` → `toNewCheckoutLot` returning `CheckoutLotPatch` |
| `frontend/shared/utils/basket.ts` | the four line functions over `Lot[]` → `CheckoutLotPatch[]` |
| `frontend/shared/hooks/checkout/items/` → `checkout/lots/` | `useCheckoutLots` / `useReplaceCheckoutLots` / `useClearCheckoutLots`, body key `lots`; `useCheckoutItemActions` → `useCheckoutLotActions` |

`Lot` is a stricter row than `CheckoutItem` was - `metal_id`, `unit` and
`quantity` are NOT NULL - so several `?? ''` / `?? 't oz'` fallbacks in the
mapping simply went away. **The basket carries no premium any more**
(`lots-build.md`, question 11): nothing read it, and at checkout the premium is
a live quote.

## The 21 routes, before and after

`node api/src/server.ts` on 5000 (DATABASE_URL = dev) and `next dev` on 3000,
both backgrounded, walked with curl. **Before** is the auth lane's measurement,
which is the state this lane inherited; **after** is measured here, and the dev
server's log carries zero compile errors across the whole walk.

| route | before | after |
|---|---|---|
| `/` | 500 | 200 |
| `/account` | 500 | 200 |
| `/admin` | 500 | 200 |
| `/auth/sign-in` | 500 | 200 |
| `/auth/sign-in/email` | 500 | 200 |
| `/auth/sign-up` | 500 | 200 |
| `/auth/verify` | 500 | 200 |
| `/auth/verify/step-up` | 500 | 200 |
| `/auth/locked` | 500 | 200 |
| `/auth/session-expired` | 500 | 200 |
| `/buy` | 500 | 200 |
| `/buy/[slug]` (`100oz-silver-bar`) | 500 | 200 |
| `/checkout` | 500 | 200 |
| `/images` | 500 | 200 |
| `/order-placed` | 500 | 200 |
| `/payout-options` | 500 | 200 |
| `/privacy-policy` | 500 | 200 |
| `/rates` | 500 | 200 |
| `/sales-order-checkout` | 500 | 200 |
| `/sales-tax` | 500 | 200 |
| `/sell` | 500 | 200 |
| `/settings/email` | 500 | 200 |
| `/settings/email/confirmed` | 500 | 200 |
| `/settings/phone` | 500 | 200 |
| `/settings/phone/confirmed` | 500 | 200 |
| `/terms-and-conditions` | 500 | 200 |

Twenty-six, not twenty-one - the auth lane added five since that count was
taken. Every one answers 200.

## Typecheck: 54 → 0

`pnpm --filter @dorado/frontend typecheck`, with `@dorado/contracts` built
first. The 54 are the auth lane's table, file by file, with what each became:

| file | errors | what it was |
|---|---|---|
| `admin/.../adminPurchaseOrderDrawerFooter.tsx` | 7 | `view.items` → `view.lots`; the physical facts moved under `row.lot` |
| `admin/.../editRefinerValues.tsx` | 7 | **deleted** - see "surfaces left minimal" |
| `account/.../purchaseOrderDrawerFooter.tsx` | 7 | same as the admin footer |
| `admin/.../AdminReceived.tsx` | 6 | `useCreate/Patch/DeleteOrderItem` → `…OrderLot`; `OrderViewItem`→`OrderLotView`, `OrderItemPatch`→`OrderLotPatch` |
| `shared/hooks/refiners/queries.ts` | 5 | five engagement hooks had no successor - trimmed to `useAdminSuppliers` |
| `admin/.../editActualValues.tsx` | 4 | assay actuals write the LOT now; the Pool panel went |
| `shared/hooks/checkout/items/queries.ts` | 3 | the Shell blocker, above |
| `admin/.../AdminPreparing.tsx` | 3 | `useSendToRefiner` → `useSupplyOrder`; `actions.send_to_refiner` → `actions.supply`; `carrier_id` left `ShipmentPatch` |
| `shared/hooks/useSalesOrderLines.ts` | 2 | `view.items` → `view.lots`, names off `row.lot` |
| `admin/.../salesOrders/queries.ts` | 2 | `AdminSaleCreate.items` → `.lots` |
| `admin/.../adminPurchaseOrderActionButtons.tsx` | 2 | `useFinalizePricing` → `useFinalizeOrder`; `actions.finalize_pricing` → `actions.finalize` |
| `account/.../salesOrderCard.tsx` | 2 | `useOrderItems` → `useOrderLots` |
| `account/.../drawerContents/Received.tsx` | 2 | same |
| `admin/_src_/tests/orders/actionButtons.test.tsx` | 1 | the actions fixture |
| `account/.../purchaseOrderCard.tsx` | 1 | same |

Converting them surfaced twelve more in `shared/tests/checkout/basket.test.ts`
(its row factory built a `checkout.items` row) - **66 at the peak, 0 at the
end**.

## The shape rules applied at every call site

- **`OrderView.items` → `OrderView.lots`.** A row is `OrderLotView`: the LINK
  carries this stage's money (`premium`, `price`, `sales_tax_charged`,
  `confirmed`, `payable`, `line_total`, `refining_order_number`) and `row.lot`
  carries the physical thing (`bullion_id`, `metal_id`, `unit`, `quantity`,
  `pre_melt`, `post_melt`, `purity`, `content`, plus the view's derived
  `product_name`, `form`, `reference`).
- **`item.item_name` has no successor and needed none.** A scrap lot is named by
  its metal, and `metals.metals.id` IS the metal's name (ruling 79) - so
  `row.lot.metal_id` renders "Gold" where the view used to compose "Gold Item 1".
- **Quote lines still pair BY ID.** `order_pricing.sql` returns `orders.lots.id`
  and the checkout quotes return `lots.items.id`, which are exactly the ids the
  two surfaces hold. No pairing changed.
- **`CheckoutView.items` → `.lots`, and the `CheckoutStep` `'items'` →
  `'lots'`.**
- **`OrderActions`**: `finalize_pricing`→`finalize`, `send_to_refiner`→`supply`,
  `edit_lines`→`edit_lots`, plus `reopen`, `assign_lots` and
  `finalize_blocked_by`.

## Hooks added and removed in `@dorado/client`

**Added** - `packages/client/src/payments/rails.ts`, one hook per rails route,
mirroring `docs/waves/payment-rails.md`:

`usePaymentView` (the Payment card's one read), `useOpenPayout`, `usePayout`,
`usePayTo`, `useSendPayout`, `useMarkPayoutSent`, `useFailPayout`,
`useOpenCharge`, `useCharge`, `useRequestCharge`, `useFailCharge`,
`useUnmatchedInbound`, `useMatchCandidates`, `useRecordWire`, `useSyncInbound`,
`useConfirmMatch`, `useUnmatchInbound`, `useBankLinks`, `useBankLinkToken`,
`useExchangeBankLink`, `useLinkMicroDeposits`, `useVerifyMicroDeposits`,
`useRecordVaultedLink`. Six query keys added under `keys.payments`.

There is deliberately no `usePatchTransfer`: a payout and a charge are rows
whose state only an endpoint moves (`send` / `mark_sent` / `request` / `fail`).
**Nothing renders these yet** - the Payment card is a Figma frame and ruling 96
says an unbuilt frame is not invented here - so the module is the API's typed
surface waiting for the admin order page's rebuild.

**Removed** - `frontend/shared/hooks/refiners/queries.ts` lost `useRefinerOrder`,
`useRefinerMetals`, `useRefinerItems`, `usePatchRefinerItem` and
`usePatchRefinerOrder`. They are not renamed anywhere: they addressed
`refiners.orders` / `refiners.items` / `refiners.spots` **by customer order
id**, and no key joins a refining order to a customer order any more (ruling
42). `useAdminSuppliers` is all that is left.

**Verified mechanically**: `api`'s `frontend-routes.test.ts` walks every literal
`apiRequest` in `frontend/` and `packages/client/src` and asserts each names a
route the API actually has. It passes.

## Specs updated, and the ruling for each

| spec | change | why |
|---|---|---|
| `shared/tests/anonymous-basket.e2e.ts` | `/checkout/items` → `/checkout/lots` | ruling 98 (lots): the endpoint moved |
| `app/admin/_src_/tests/authed/admin-sales-order-work.e2e.ts` | `PUT /checkout/lots` with body `{ lots }`; `POST /orders/admin` body `lots:` | ruling 98 |
| `shared/tests/authed/customer-checkout-sales.e2e.ts` | cleanup DELETE → `/checkout/lots` | ruling 98 |
| `shared/tests/authed/customer-checkout-purchase.e2e.ts` | same | ruling 98 |
| `app/admin/_src_/tests/orders/AdminPreparing.test.tsx` | POST `/orders/:id/supply`, actions fixture, engagement stub deleted | ruling 98 + ruling 42 |
| `app/admin/_src_/tests/orders/actionButtons.test.tsx` | `finalize_pricing` → `finalize` | ruling 98 |
| `app/account/_src_/tests/orders/purchaseOrderDrawerFooter.test.tsx` | the fixture is `lots`, each with its `lot` | ruling 98 |
| `app/(checkout)/checkout/_src_/tests/checkoutContract.test.ts` | `items: []` → `lots: []`; step `'items'` → `'lots'` | ruling 98 |
| `shared/tests/checkoutServer.ts` | the in-memory basket answers `/checkout/lots`, body key `lots` | ruling 98 |
| `shared/tests/checkout/basket.test.ts` | the row factory builds a `Lot` | ruling 98 |
| `packages/client/src/tests/refiners.test.ts` → `refining.test.ts` | pins `PATCH /refining/orders/:id` and `/refining/lots/:id` instead of the two dead engagement URLs | ruling 98 + ruling 42 |

One spec change is **not** this lane's three: `shared/tests/convertWeights.test.ts`
had been red on the branch before this pass started. `convertWeights.ts` uses
the exact constants (31.1034768 g/t oz, 453.59237 g/lb) and the test still
asserted the rounded 31.1035 / 453.592 / 14.5833105 to ten and six decimal
places, which is arithmetically impossible. The constants in the test are now
the util's own. Recorded here because it is a real pre-existing failure this
lane found, not one it caused.

## API bugs found

**One, and it is a guard doing its job rather than a defect to fix.**

`admin-sales-order-work.e2e.ts` failed its first attempt of run 2 with a 500
from `orders/rules.ts:461`:

```
order f754b9f2…: 1 basket line(s) to copy, 3 written - this transaction must not commit
```

`place()` reads the cart once (`checkoutService.lotsFor`) and then prices the
checkout; `assertEveryLineCopied` compares what the INSERT wrote against what
the cart held, and refuses the transaction when they differ. Three parallel
Playwright workers share ONE e2e customer's sale basket, so another worker's
`PUT /checkout/lots` landed between the two reads. The guard caught it, the
transaction rolled back, no order was written, and the retry passed.

That is the correct behaviour and the entry exists to say so - **but the shared
basket is a harness fragility worth fixing**: `anonymous-basket.e2e.ts`,
`customer-checkout-sales.e2e.ts` and `admin-sales-order-work.e2e.ts` all drive
the same customer's `sale` checkout. Giving the admin spec its own user would
remove the race. Not done here: it is a harness change, not a frontend one.

**Two API gaps listed rather than bent (ruling 44):**

1. **`ShipmentPatch` no longer accepts `carrier_id`.** The contract is strict and
   carries `tracking_number`, `shipping_charge` and `shipping_actual` only, so
   `AdminPreparing`'s carrier radio group can no longer re-point a shipment's
   carrier; it now PATCHes the tracking number alone. The picker still renders
   and still gates the input. If re-pointing a carrier is meant to be possible,
   the column belongs on `ShipmentPatch`.
2. **A refining order cannot be reached from a customer order.** By design
   (ruling 42) - but it means the admin sales drawer has nothing to pre-select
   the supplier from after a supply, and the purchase drawer cannot show the
   refiner's assay at all. `OrderLotView.refining_order_number` is the one
   thread across, and the screen that follows it is the Figma rebuild.

## Surfaces left minimal, pending the Figma rebuild

`docs/design/orders-notes-2026-09-05.md` is rebuilding the admin order page from
Figma - Order Header, Order Spots, Items, Charges, Payment, Totals, Documents,
Chat. These three were converted only far enough to render on the new data.

- **`editRefinerValues.tsx` is DELETED**, with its mount in
  `AdminPaymentProcessing.tsx`. It edited the per-order refiner engagement -
  `refiners.orders` spots, `refiners.items` premiums and the engagement's fee -
  and all three tables' code is gone. There is no successor addressed by a
  customer order's id, and drawing a replacement would be a component that is
  not in Figma (ruling 96). Git has it.
- **`editActualValues.tsx` kept its Scrap Actuals and its Shipping Actual, and
  lost its Pool panel.** The actuals write `PATCH /orders/lots/:id` now, one
  field per blur - the old code read the refiner row and re-sent both columns,
  which is exactly what loses an edit made in between. The Pool figures were
  engagement columns; `refining.pool` is an append-only ledger per refiner per
  metal, keyed by a refining order this drawer does not hold, and its only write
  is `POST /refining/pool/locks`.
- **`AdminReceived.tsx`'s line editing was converted, not rebuilt.** Add,
  patch, delete, confirm and reset all map 1:1 onto the order-lot endpoints, so
  the surface behaves as it did against `orders.lots` + `lots.items`. Splitting
  a lot (`POST /orders/lots/:id/split`), assigning one, and the Add-Lot search
  are Figma work and are not built.
- **`AdminPreparing.tsx` lost its pre-selected supplier.** With the engagement
  read gone there is nothing to read the order's current refiner back from; the
  admin's own pick is the selection, and supplying twice is the API's 409 to
  refuse.

The auth lane's own deletions (password screens, `useSetPassword` and friends)
were already done there; nothing was left for this pass.

## Gates

| gate | before | after |
|---|---|---|
| `next dev`, 26 routes | 500 × 26 | **200 × 26** |
| `pnpm --filter @dorado/frontend typecheck` | 54 errors | **0** |
| `pnpm --filter @dorado/frontend test` | 11 failed / 201 passed (34 files) | **212 passed** |
| `pnpm --filter @dorado/frontend build` | — | **green**, 52s |
| `pnpm --filter @dorado/client typecheck` / `test` | — | **0 errors / 26 tests** |
| `pnpm --filter @dorado/api lint:client-boundary` | — | **green**, 0 findings |
| `api` `frontend-routes.test.ts` | — | **green** |
| `pnpm --filter @dorado/frontend e2e` (`@maps` excluded) | 75 passed / **2 failed** | **76 passed, 0 failed** (two consecutive runs, 1 flaky each) |

The e2e "before" is this lane's own first run, after the render fix - the suite
could not be run at all while every route 500'd. Both failures were the same
cause, `PUT /checkout/items` answering 404, and both are in the spec table
above. Run against `next build` + `next start` on 3000 and
`node api/src/server.ts` on 5000, sessions minted through the OTP fake, after
`seed:e2e` and `seed:e2e:order`.

Two consecutive green runs, each with ONE flaky test that passed on its first
retry and a DIFFERENT spec each time - run 2 the sales-order-work race recorded
above, run 3 `admin-purchase-order-work` failing on
`Command failed: pnpm --filter @dorado/api seed:e2e:order`, its own in-spec
seed call. Both are contention between parallel workers over one dev API and
one Postgres, which is exactly the shape `docs/waves/e2e-2026-09-07.md` recorded
and declined to paper over. Neither is assertion-shaped.

# Customer-facing screens

The customer portal, drawn 2026-09-12. `orders-notes-2026-09-05.md` §4 removed the
customer-facing frames from the Orders admin screens and said the portal would be designed
separately; this is that pass.

Figma: the **Orders** file, key `ymmNlCDLVIfanpRQ7QHMIs`, on five new pages placed after
`Customers` — `Customer · Landing`, `Customer · Shop`, `Customer · Sell`, `Customer · Account`,
`Customer · Orders`. Jacob moves them to a customer file by hand later. Three draft local
components sit in the `Draft · Customer · 2026-09-12` section on the `Components` page.

Every frame is built from the **Themes and Components** library (`8A73quhBLBqotJlX95jN9j`) and
its tokens. No hand-picked colour, no hand-typed font size. Jacob's components are instantiated,
never edited and never detached. Desktop frames are 1440 wide with 64px gutters (1312 content),
matching the admin screens (`168:2022`); every screen has a mobile twin at 390 with 358 content.

Badges follow `statuses.md` §3: Warning → Info → Success as pre → mid → post, Danger for
problems, Neutral Outline for "not set / draft". Coloured figures carry no + / − sign.

Shell on every screen is the library `Header` (`Signed In` False on the landing, True elsewhere)
and `Footer`, which is what `frontend/shared/ui/AppShell.tsx` mirrors (`docs/waves/app-shell.md`).
Typography is the `Text` component — the sixteen-variant ramp that `packages/components/src/text/Text.tsx`
draws from.

## Endpoint column

Route paths are the mounted paths in `api/src/app.ts`. "new" means no endpoint serves it today.

## `Customer · Landing`

| screen | frame id | states | what the API must provide |
|---|---|---|---|
| Landing (Desktop) | `689:35644` | signed-out; live spots up / down; quick estimate filled (14K, 42.6 g) | `GET /api/spots` (pricing/spots) · `GET /api/rates`, `GET /api/rates/tiers` (pricing/rates) · `GET /api/products` (catalog/products) · `POST /api/quotes/catalog` (pricing) for the per-product price and premium · `GET /api/reviews/public` (crm/reviews) · **new**: a public scrap quote (metal + purity + weight → payout) for the hero estimator |
| Landing (Mobile) | `693:43121` | same, 390 viewport; spots 2-up; products 2-up | same |

The hero estimator is the one genuinely missing endpoint on this page.
`POST /api/quotes/catalog` is public but prices a catalog product; `POST /api/quotes/order`
prices scrap but sits behind `requireUser` **and** `requireOwnOrder`, so it cannot serve a
signed-out visitor and it needs an order to exist first. The landing needs a stateless,
unauthenticated `POST /api/quotes/scrap` taking `{metal, purity, weight, unit}` and returning
the payout estimate — the same arithmetic, no order and no session. Pricing owns it
(`lint:pricing-owner`), and it must carry the "estimate only, the quote locks at placement"
caveat in the response so the copy on the screen and the copy in the API cannot drift.

The rates teaser reads the same tier table the admin rate sheet does; `GET /api/rates/sheet.pdf`
backs the "See the full rate sheet" button.

## `Customer · Account`

The account shell is a 240px left rail on desktop (Profile · Addresses · Payout accounts ·
Credit · Orders · Settings) and a wrapped `Chip` row on mobile.

| screen | frame id | states | what the API must provide |
|---|---|---|---|
| Account · Profile (Desktop) | `694:45441` | signed in; email and phone `ReadOnly` with Change beside them; phone Change disabled + `Coming soon` | `GET /api/account/session` (accounts/auth) · **new**: a self-serve read and write of the caller's own profile — every `/api/users/*` route is `requireAdmin`, so a customer cannot read or change their own name today |
| Account · Profile (Mobile) | `694:56232` | same, stacked | same |
| Account · Addresses (Desktop) | `694:53370` | three saved, one default and selected; add/edit form open with the Places suggestion menu | `GET /api/addresses`, `POST /api/addresses`, `PATCH /api/addresses/:id`, `DELETE /api/addresses/:id`, `POST /api/addresses/:id/default` · `GET /api/addresses/suggestions` and `GET /api/addresses/suggestions/:place_id` (accounts/places/addresses) · `POST /api/shipping/validate_address` (logistics/shipping/operations) before a label is bought |
| Account · Addresses (Mobile) | `694:56485` | same, stacked | same |
| Account · Payout accounts (Desktop) | `694:45708` | verified + default; awaiting micro-deposits; paper check; add form with the four methods | `GET /api/payments/banks` · `POST /api/payments/banks/link_token`, `/link`, `/micro_deposits`, `/:id/verify` (transactions/banks) · `GET /api/payments/methods` (transactions/methods) |
| Account · Payout accounts (Mobile) | `694:56841` | same, stacked | same |
| Account · Credit (Desktop) | `694:53750` | balance $120.00; four-row ledger | `GET /api/transactions` (transactions/ledger, `requireUser`) for the ledger · **new**: a read of the caller's own credit balance — `POST /api/users/:id/credit` is `requireAdmin` and only writes |
| Account · Credit (Mobile) | `694:60022` | same, rows folded two-line | same |
| Account · Settings (Desktop) | `694:53973` | sign-in; change-email code sent (OTP); three notification switches; two sessions; delete-account danger card | `POST /api/account/change_email`, `/change_phone`, `/confirm_change`, `/send_code`, `/verify_code`, `GET /api/account/session` (accounts/auth) · **new**: notification preferences, session listing / sign-out-everywhere, and the account-deletion request |
| Account · Settings (Mobile) | `694:60213` | same, stacked; OTP cells shrink to the 358 column | same |

Three account gaps, all of the same shape: **the customer has no self-serve endpoint for their
own record.** `/api/users/*` is `requireAdmin` end to end, so name, credit balance,
notification preferences, session list and deletion request each need an `/api/account/*`
route owned by `accounts`. Bank numbers stay sealed — every payout card on these screens shows
last-four only, which is what `GET /api/payments/banks` already returns.

## `Customer · Orders`

The customer view, not the admin one: no assign-to, no finalize, no spot lock, no profit
breakdown. State, items, totals, fulfillment, documents, messages, and a cancel request where
one is allowed.

| screen | frame id | states | what the API must provide |
|---|---|---|---|
| Orders · My orders (Desktop) | `694:36077` | six orders across the badge ladder — `Preparing` Warning, `Awaiting Receipt` Warning, `At Refiner` Info, two `Completed` Success, `Cancelled` Danger; All / Buying / Selling filter | `GET /api/orders` (orders) · **new**: the derived display state — `statuses.md` §3 narrows `orders.orders.status` to `draft`/`open`/`cancelled` and derives the ladder in SQL, and nothing serves that field today |
| Orders · My orders (Mobile) | `694:41046` | same, rows stacked | same |
| Orders · Sale — SO-1112 (Desktop) | `694:51854` | `Preparing`; shipment `Label Created`; payment `Received`; cancel allowed | `GET /api/orders/:id`, `GET /api/orders/:orderId/fulfillments`, `/shipments`, `GET /api/orders/:orderId/payment-details`, `GET /api/orders/:id/documents`, `POST /api/orders/:id/cancel` (orders) · `GET /api/shipments/:id`, `POST /api/shipping/get_tracking` (logistics) · `GET /api/payments/view/:orderId` (transactions/rails) · `GET /api/sms`, `POST /api/sms` (crm/sms) |
| Orders · Sale — SO-1112 (Mobile) | `695:49740` | same; `Tracker` switches to `Orientation=Vertical` | same |
| Orders · Purchase — PO-2481 (Desktop) | `694:60510` | `Awaiting Receipt`; shipment `Label Created`; payout `Not sent`; Invoice row `Unavailable`; cancel allowed | as above, plus `GET /api/orders/:id/spots` (orders/spots) for the locked spot stamp, `POST /api/pdf/generate_shipping_instructions` and `generate_packing_list` (documents/pdfs), and `POST /api/orders/:id/documents/:kind/send` |
| Orders · Purchase — PO-2481 (Mobile) | `695:51559` | same; `Tracker` vertical | same |

**The one endpoint the whole page waits on is the derived display state.** Every badge on these
six frames is a ladder position that `statuses.md` §3 says should be computed in SQL from
payment state + fulfillment state + lot positions, on the model of `refining.orders.state`.
Until that view field exists the frontend would have to re-derive it in TypeScript, which is
the re-spelling `lint:no-literal-views` refuses. It is one view, and it unblocks the orders list,
both order pages, and the tracker on the sell and shop "placed" screens.

A purchase order also needs a **received** signal before `Received` and `Awaiting Payout` can
ever light up; `statuses.md` §4 recommends putting it on the inbound fulfillment rather than on
the order or the lot. Nothing marks arrival today.

## `Customer · Sell`

Four steps and a confirmation. The `Stepper` runs Items → Delivery → Payout → Review; the 400px
aside is the `Order Summary · customer` shape. Numbers reconcile across every frame:
$2,489.16 + $1,370.67 + $258.89 = $4,118.72.

| screen | frame id | states | what the API must provide |
|---|---|---|---|
| Sell · What are you selling (Desktop) | `694:37663` | step 1 Current; Scrap selected vs Bullion; two scrap rows (metal `Select`, eight purity chips with 14K / 18K selected, weight `Input` with a g / dwt / ozt toggle, `Textarea`, per-row `Stat`); one bullion row with a `Quantity Stepper`; running total | `GET /api/metals` (pricing/metals) · `GET /api/rates` (pricing/rates) · `GET /api/products` (catalog/products) for the bullion row · `GET /api/checkout`, `PUT /api/checkout/lots`, `DELETE /api/checkout/lots`, `PATCH /api/checkout` (checkout — the device-sync draft) · `GET /api/quotes/checkout` (pricing) for the live per-row and total estimate |
| Sell · What are you selling (Mobile) | `694:70040` | same, one column | same |
| Sell · How it gets to us (Desktop) | `694:42299` | four fulfillment `Radio Card`s, Ship selected; `Address Card` + package `Select` + Info `Alert`; a second labelled band carries the appointment state with a Slim `Datepicker` | `GET /api/fulfillments/methods`, `GET /api/fulfillments/schedule`, `POST /api/fulfillments`, `GET /api/fulfillments/:id/rates`, `POST /api/fulfillments/schedule_pickup` / `schedule_direct` / `schedule_dropoff` (logistics/fulfillments) · `GET /api/addresses` (accounts/places/addresses) · `GET /api/locations` (accounts/places/locations) for the appointment office · `POST /api/shipping/check_pickup`, `POST /api/shipping/get_locations`, `POST /api/shipping/validate_address` (logistics/shipping/operations) |
| Sell · How it gets to us (Mobile) | `694:78570` | same, one column | same |
| Sell · How we pay you (Desktop) | `694:51352` | four payout `Radio Card`s, ACH selected; entry state with routing and account `Input`s in Placeholder (no digits drawn); saved state "Truist Bank · Checking · ••••4417" + `Verified` | `GET /api/payments/methods` (transactions/methods) · `GET /api/payments/banks`, `POST /api/payments/banks/link_token` / `/link` / `/micro_deposits` / `/:id/verify` (transactions/banks) · `POST /api/checkout/payout` (checkout) · `GET /api/payments/payouts/pay_to` (transactions/payouts) |
| Sell · How we pay you (Mobile) | `695:49212` | same, one column | same |
| Sell · Review (Desktop) | `694:52510` | Warning `Alert` 15-minute spot lock; read-only `Table`; fulfillment, payout and charges cards; terms `Checkbox` + Link; LG "Place order · $4,118.72" | `GET /api/quotes/checkout` (pricing) · `POST /api/orders` (orders, `requireUser`) · **new**: the customer-side spot lock — `PUT /api/orders/:id/spots` is `requireAdmin`, so nothing lets a customer's own placement freeze the quote it was shown |
| Sell · Review (Mobile) | `695:53524` | same; the four-column `Table` becomes stacked label-value rows (it does not fit 326px) | same |
| Sell · Placed (Desktop) | `694:55434` | `Order placed` Success Solid + `Awaiting Receipt` Warning Soft; horizontal `Tracker` Awaiting Receipt Current → Received → At Refiner → Paid; numbered next steps; `Documents` Filled | `GET /api/orders/:id`, `GET /api/orders/:id/documents` (orders) · `POST /api/pdf/generate_shipping_instructions`, `generate_packing_list` (documents/pdfs) · `POST /api/orders/:id/documents/:kind/send` |
| Sell · Placed (Mobile) | `696:20458` | same; `Tracker` vertical | same |

**The sell flow's one missing endpoint is the quote lock.** Ruling: spots move, and the quote is
locked at placement. `GET /api/orders/:id/spots` is `requireUser` + `requireOwnOrderParam` so a
customer can read the frozen figure, but the only writer is `PUT /api/orders/:id/spots` behind
`requireAdmin`. Either `POST /api/orders` freezes the spot inside the same transaction as
placement — which is the safer shape, since it cannot drift between two calls — or a
customer-scoped lock endpoint has to exist. Pricing owns the arithmetic either way.

## `Customer · Shop`

| screen | frame id | states | what the API must provide |
|---|---|---|---|
| Shop · Catalog (Desktop) | `694:36468` | Gold chip selected; type / mint / weight `Select`s; in-stock `Switch`; active filters as dismissible `Chip`s; eight product cards; `Pagination` | `GET /api/products`, `GET /api/products/types` (catalog/products) · `GET /api/mints` (catalog/mints) · `GET /api/metals` (pricing/metals) · `POST /api/quotes/catalog` (pricing) for every card's price and premium · `GET /api/spots` (pricing/spots) for the ticker |
| Shop · Catalog (Mobile) | `694:41533` | same; filters as a wrapped chip row; 2-up grid | same |
| Shop · Product (Desktop) | `694:52884` | in stock; qty 1; price breakdown spot + premium; specs `Accordion` open, shipping `Accordion` closed | `GET /api/products/:slug` (catalog/products) · `POST /api/quotes/catalog` (pricing) for the breakdown |
| Shop · Product (Mobile) | `694:54860` | same, one column | same |
| Shop · Cart (Desktop) | `694:59529` | three line items with `Quantity Stepper`s; Warning `Alert` on price movement; summary with credit applied | `GET /api/checkout`, `PUT /api/checkout/lots`, `DELETE /api/checkout/lots`, `PATCH /api/checkout` (checkout) · `GET /api/quotes/checkout` (pricing) |
| Shop · Cart (Mobile) | `694:64782` | same; summary below the items | same |
| Shop · Checkout (Desktop) | `694:77467` | `Stepper` Address → Shipping → Payment → Review; two `Address Card`s + add form with the Places suggestion menu; three shipping `Radio Card`s with rates; three payment `Radio Card`s; review + LG place | `GET /api/addresses`, `POST /api/addresses`, `GET /api/addresses/suggestions`, `GET /api/addresses/suggestions/:place_id` · `GET /api/carrier_services/sale_options`, `GET /api/carrier_services/offered` (logistics/shipping/services) · `GET /api/fulfillments/:id/rates` · `GET /api/payments/methods`, `GET /api/payments/banks` · `GET /api/stripe/get_sales_order_payment_intent`, `POST /api/stripe/update_payment_intent`, `GET /api/stripe/retrieve_payment_intent` (transactions) · `POST /api/orders` (orders) |
| Shop · Checkout (Mobile) | `695:50855` | same, one column | same |
| Shop · Placed (Desktop) | `696:56499` | `Order placed` Success Solid; horizontal `Tracker` Awaiting Payment Complete → Preparing Current → In Transit → Out for Delivery → Delivered Upcoming (five stages, because the component cannot be cut to four); items recap; totals with credit; `Documents` Filled; numbered next steps | `GET /api/orders/:id`, `GET /api/orders/:id/documents` (orders) · `POST /api/pdf/generate_sales_order_invoice`, `generate_packing_list` (documents/pdfs) |
| Shop · Placed (Mobile) | `696:53890` | same; `Tracker` vertical | same |

Credit is drawn as applied, never as a box to tick — the summary on the cart, the checkout and
the placed screen all show "Account credit −$156.70" as a line the customer reads rather than
chooses, which is the standing ruling. Nothing on these screens computes money: every figure is
a pricing-endpoint response.

## Draft components on `Components`

Section `Draft · Customer · 2026-09-12` (`688:34720`), placed 200px below `Draft · Pool ·
2026-09-11` and clear of everything else. Three patterns that repeat across the customer
surfaces and are worth promoting if Jacob approves them. **Draft — not approved, and no new
component ships without a Figma design Jacob approved.**

| component | id | what it is |
|---|---|---|
| `Product Card · customer` | `694:35764` | the bullion tile on the catalog and the featured strip. Price is the API figure; the Badge carries the premium as a percentage over spot, never a signed money figure. The image well is a `surface/muted` frame holding a `Thumbnail` until real product photography exists |
| `Spot Card · customer` | `694:35775` | one live metal on the landing strip. Wraps `Stat` Size=Small so the delta drops under the figure in a narrow mobile column |
| `Order Summary · customer` | `694:35833` | the 400px aside on the cart, the checkout steps and the sell review. Credit shown as applied; the price-lock line is required copy on any pre-placement surface |

## What could not be drawn with the library

Twelve findings, all recorded rather than worked around. Nothing was faked: no hand-picked hex,
no hand-typed font size, no detached instance, and no edit to a master. The audit over all 38
frames returns zero unbound fills and zero horizontal overflow.

1. **`Header` has no `Layout=Mobile, Signed In=True` variant.** Five variants exist —
   Desktop+SignedOut, Desktop+SignedIn, Desktop+DrawerOpen, Mobile+SignedOut,
   Mobile+DrawerOpen. Every one of the 19 mobile frames therefore shows the signed-out mobile
   header, including the account and order pages where the customer is definitionally signed in.
   This is the one gap that shows on a screen rather than in the file.
2. **`Tracker` is fixed at five stages and stages cannot be deleted inside an instance.** Every
   four-step ladder here hides the fifth stage and the fourth stage's right connector. A step
   count property would remove the hack.
3. **`Tracker` horizontal is 760 wide and does not survive a 390 frame.** Mobile uses
   `Orientation=Vertical`, which is what the component's own description recommends, so this is
   a correct choice rather than a workaround — but it means the two orientations are not
   interchangeable and a screen must decide per breakpoint.
4. **`Tracker` horizontal is not built from `Tracker Node` instances.** Its stages are plain
   frames under a frame named `Stages`, each wrapping an inner instance named `Node` that
   carries the `State` variant. Setting `State` on the stage frame silently does nothing.
5. **`Stepper` is a fixed five-marker component with no labels.** A four-step flow has to add
   the step names as separate `Text` instances under the markers. Worse, the two agents who
   drew one disagree on whether the fifth marker can be removed at all — one hid it with
   `visible=false`, the other reports that `visible=false` does not stick on an instance child
   and labelled the fifth step "Confirm" instead. Whichever is true, a step-count property
   would end the argument.
6. **`Accordion` `Open=True` ships a built-in body of sample gold-spot rows.** Using it as a
   section header means hiding every child after index 0. A header-only variant, or an
   Accordion that accepts slotted content, would fix it.
7. **`Documents` is fixed at four rows, and its variants disagree about which four.**
   `State=Filled, Open=True` exposes only Invoice and Packing List, while the default variant
   exposes four including Shipping Instructions — so the PO page depends on the default variant
   rather than explicit props, which is fragile. A sales order, which needs neither a Return
   Packing List nor Shipping Instructions, has to relabel rows 3 and 4 rather than drop them.
8. **`Checkbox` has no label slot**, so every checkbox line is a Checkbox instance plus a
   separate Text instance in a wrapper frame.
9. **`Table Row` cell text nodes carry fixed widths** and wrap mid-number ("$2,489 / .16")
   until each cell text is set to FILL. At 326px the four columns do not fit at all, so mobile
   review and mobile order items use stacked label-value rows instead of the Table.
10. **No monospaced `Text` tag exists.** Order numbers (`PO-2481`, `SO-1112`) use `Tag=Eyebrow`
    rather than a true monospaced treatment, even though `Geist Mono` is in the file.
11. **`textAlignHorizontal` cannot be set on an instance**, so every right-aligned money figure
    is a Text instance inside a one-child HORIZONTAL frame with `primaryAxisAlignItems:'MAX'`.
    Worth a right-aligned `Amount` variant if money tables become common.

12. **`Marquee` is 716px wide by design and cannot fit a 390 frame.** The landing and catalog
    spot strips use wrapped `Stat` cards and `Text` rows on mobile instead. A mobile Marquee
    variant, or a fill-width one, would let the ticker be the same component at both widths.

Two library behaviours worth recording for whoever draws next: changing a nested instance's
variant **replaces the node**, so any reference captured beforehand goes dead and text
overrides revert to the master default — which is why `Paperwork Row` `State=Unavailable`
silently resets its name. And `Stat` has a fixed-width inner `Figure` frame that overflows any
card under about 200px unless it is set to wrap.

## What could not be found

**The "PO Checkout" Figma file.** `orders-notes-2026-09-05.md` §1 lists it as the customer
checkout flow, referenced for the shipping fields. It has no file key anywhere in the repo, and
`docs/history/waves/phase10-design-system.md` records why: the three links Jacob supplied in
that session had PO Checkout's URL **byte-identical to the Layout file's**
(`FHzPuSgcoYI6fYITiE9ncM`, `node-id=0-1`), so either PO Checkout is a frame inside Layout or the
paste slipped. That wave treated it as "inside Layout" and moved on.

It is not inside Layout. Reading `FHzPuSgcoYI6fYITiE9ncM` directly returns one page, `Layouts`,
holding exactly two components — `Layout / Desktop` (1440x1024) and `Layout / Mobile`
(390x892) — and nothing else. There is no checkout flow and no shipping form in that file.

So the shipping fields on `Shop · Checkout` and `Sell · How it gets to us` were drawn from the
API's own shape (`accounts/places/addresses` and `logistics/shipping`) rather than from Jacob's
existing checkout drawing. **They should be checked against PO Checkout before anyone builds
them.** One question for Jacob: the file key, or confirmation that the file is gone.

## Standing constraints these screens honour

- **No bank number is drawn anywhere, in any state.** Every payout account, payment card and
  order page shows last-four only (`••••4417`, `••••4242`). Routing and account number inputs
  appear only as empty Placeholder fields in an entry form.
- **The frontend computes no money.** Every figure on every frame is attributed above to a
  pricing or order endpoint, including the per-row sell estimates and the catalog premiums.
- **Credit is not a choice.** It is drawn as an applied line on the summary, reserved at
  placement, with an Info Alert saying so on the account page.
- **Badge colour follows `statuses.md` §3** — Warning → Info → Success as pre → mid → post,
  Danger for problems, Neutral Outline for "not set / draft", and no + / − sign on a coloured
  figure.
- **Auth screens were not redrawn.** Sign-in is passwordless and the eleven auth routes already
  have their own Figma screens; the only auth surface here is the change-email OTP on
  `Account · Settings`, which is a settings state rather than a sign-in screen.

# Carts are checkout items — shape changes

Rulings 50 and 51 (Jacob, 2026-09-03 evening), executed on branch
`checkout-items`. FOLLOWUPS.md carries the rulings verbatim; this is what
changed on the wire, in the pricing, and in the browser.

Ruling 44 governs: **no request or response shape on `api-hardening` is
preserved for the frontend's sake.** Everything below is a break, on purpose.

## 1. Routes

| Before | After |
|---|---|
| `GET  /api/cart/get_cart` | `GET /api/checkout/items?direction=sale` |
| `GET  /api/cart/get_sell_cart` | `GET /api/checkout/items?direction=purchase` |
| `POST /api/cart/sync_cart` | `PUT /api/checkout/items?direction=sale` |
| `POST /api/cart/sync_sell_cart` | `PUT /api/checkout/items?direction=purchase` |
| — | `DELETE /api/checkout/items?direction=` |

`/api/cart` is unmounted and `transport/checkout/routes.ts` is deleted. The
three new routes are declared by `transport/checkout/checkout.routes.ts`, the
router that already owns `/api/checkout`.

- `direction` is a required query param, parsed once at the transport with
  `parseStrict(Direction, …)` — anything but the two labels is a **400 naming
  the parameter** (ruling 48), never a 422.
- `user_id` is a query param on all three and is **admin-only** for anybody
  else's id (`cartService.resolveSubject`); naming yourself is a no-op. The
  admin sales-order create flow needs it.
- **Behaviour change on the read**: the old GETs ignored a foreign `user_id`
  and silently answered your own basket. They **refuse with 403** now, which
  is what `GET /api/checkout` has always done with the same parameter.

## 2. Bodies and responses

**Gone from `@dorado/contracts`**: `CartLineBody`, `SyncCartBody`,
`SellCartLineBody`, `SyncSellCartBody`.

**New**:

```ts
// a pick of the generated checkout.ItemsRow; the six value columns are
// optional as well as nullable, `quantity` is required
NewCheckoutItem = { bullion_id?, metal_id?, pre_melt?, post_melt?, purity?,
                    unit?, quantity }
CheckoutItemsBody = { items: NewCheckoutItem[] }   // .strict()
```

A **coin** is `{ bullion_id, quantity }` and nothing else — a body that also
names `metal_id`, `pre_melt`, `post_melt`, `purity` or `unit` on a bullion
line is **refused (422)**, because those come from the product (rulings 43 +
51). A **declared lot** must carry `metal_id`, `pre_melt`, `purity` and `unit`
— an absent one is refused, since a lot priced without a weight prices at
nothing. `post_melt` is accepted and optional: it is the assayed weight, which
nobody knows at declaration time, and `orders.items` treats it the same way.

Neither kind may send `content` or `premium`. Content is derived; the premium
is the rates band or the product's ask.

**Responses**:

| Endpoint | Before | After |
|---|---|---|
| GET (sale) | `SaleBullionLine[]` — a 20-column product join | `checkout.ItemsRow[]` |
| GET (purchase) | `({type:'scrap'\|'product', data})[]` | `checkout.ItemsRow[]` |
| PUT | `{ message: "Cart synced successfully" }` | `checkout.ItemsRow[]` (what is now in the basket) |
| DELETE | — | `{ removed: number }` |

Rows on the wire (ruling 12). No name, description, type, image, mint or
tender flag: the frontend maps `bullion_id` against the catalogue it already
caches. `DELETE` answers a count rather than 204 so a caller can tell
"emptied a full basket" from "matched nothing" — Postgres raises on neither
(`audit:silent-mutations`).

## 3. Ruling 51 — every pricing path, before and after

"After" is what the code does now. A path with **no ITEM row** may price the
product, and the table says so rather than leaving it implied.

| Function | Reads TODAY (before) | Reads AFTER |
|---|---|---|
| `pricing/ask.ts` `calculateItemAsk` | `metal_type`, `content`, `ask_premium` off whatever it is handed | unchanged — it is handed item-derived lines now (see `saleLines`) |
| `pricing/ask.ts` `calculateItemTotals` | sums `calculateItemAsk × quantity` over catalogue rows | same sum over one entry **per cart line** |
| `pricing/ask.ts` `calculateSalesTax` | product `content`/`ask_premium` × rate | item content/quantity × product ask × rate |
| `pricing/ask.ts` `calculateSalesOrderTotal` | catalogue rows (deduped by product id) | `saleLines` output — item values + product flair |
| `sales-tax` `attachSalesTaxToItems` / `factsFrom` | product `metal_type`, `type`, `purity`, `gross`, tender flags | **item** `purity` and `gross` (= `pre_melt`), **item** metal name; product `type` and tender flags — those are facts about the product, not the metal |
| `products` `getItemsFromServer` | catalogue rows with a request quantity overlaid | unchanged, but its **quantity is no longer used** on the sale path: `catalogueWanted` asks for each id once at quantity 0 and the LINE carries the count |
| `orders/rules.ts` `saleLines` | *(did not exist)* | **new**: item metal/weights/purity/content + product `ask_premium`, `type`, tender flags |
| `orders/rules.ts` `linesSold` | product `gross`/`content`/`purity`/`ask_premium`, `calculateItemAsk(product)` | item `pre_melt`/`post_melt`/`purity`/`content`; premium = product `ask_premium` (ruling 51); price = `calculateItemAsk` over the item's own content |
| `orders/rules.ts` `linesBought` | the cart line's own columns | unchanged — it was already right |
| `orders/service.ts` `retierPremiums` | rates band at the order's metal totals | unchanged — this IS the purchase premium rule |
| `orders/rules.ts` `lineFromProduct` | product `gross`/`content`/`purity`/`metal_id` | unchanged — **no item exists yet**; this is the snapshot-on-create ruling 51 asks for |
| `pricing/bid.ts` `unitContent` | scrap: `line.content`; bullion: `line.product.content` | `line.content`, falling back to the product (see the note below) |
| `pricing/bid.ts` `unitPrice` / `linePrice` / `itemsTotal` / `calculateTotalPrice` | via `unitContent` | via `unitContent`, so item-driven |
| `quotes` `orderQuote` (bullion estimate) | `item.product.content` | `item.content`, same fallback |
| `quotes` `profit.ts` `getItemContent` | `item.product.content × quantity` | `recordedContent(item) × quantity` |
| PDF invoice / packing list bullion rows | `line.product.content` | `recordedContent(line)` |
| `checkout/rules.ts` `basketRows` | *(did not exist)* | product `gross`/`content`/`purity`/`metal_id` — **this is the snapshot**, the one place a product's numbers are read |
| `POST /quotes/catalog` | product row | **unchanged, correctly**: "what does ONE cost" has no item |
| `POST /quotes/purchase_order` | product row for a `type:"product"` line | **unchanged**: the body carries lines, not a session — see §6 |
| `POST /quotes/sales_order` | `getItemsFromServer(body.items)` | **unchanged** — see §6 |
| `payments` intent pricing | `getItemsFromServer(body.items)` | **unchanged** — see §6 |

**The catalogue fallback in `recordedContent`, and why it stays.** Measured
read-only 2026-09-03: **24 of dev's 68 bullion `orders.items` rows hold NULL
content** (production's 19 hold none), because the old sell-cart sync wrote a
bullion line as `bullion_id, metal_id, quantity, premium` and nothing else,
and placement copied that null onto the order. Dropping the fallback prices
every one of those at zero on a document a customer is paid against. It goes
when those rows are backfilled — which is a data change, not a code change,
and is not this lane's to make.

**The one measurement that decided the snapshot.** `gross * purity` equals
`content` for exactly **1 of dev's 62 products**; the other 61 differ, some
enormously (a 1000 oz COMEX bar is 1000 gross at 0.999 purity and holds 1000
fine ounces, not 999). So a coin's content is COPIED from the product's own
`content` column — the `FLOWS` mapping — and only a declared lot's content is
derived from its weight and purity.

## 4. What else changed in the API

- **`domain/checkout/rules.ts`** is new and pure: liveness, the snapshot, the
  refusals, and the premium resolution. Tested without Postgres through the
  HTTP suite; the service does LOAD → ASSERT → WRITE and nothing else.
- **`domain/pricing/content.ts`** is new: `fineContent(weight, unit, purity)`,
  the ONE definition. `orders/rules.ts` `scrapContent` and `quotes/rules.ts`
  `declaredContent` were two spellings of it and both now call it; the test
  moved to `domain/pricing/tests/content.test.ts`.
- **`db/checkout/items/repo.ts`** gained `createMany` and lost
  `listBullionFor`, `listScrapFor`, the three joined SQL files and the three
  wire-shaped row types.
- **`findProductIdByName` is deleted** from `domain/products/service.ts`,
  `db/products/repo.ts` and `sql/find_id_by_name.sql` — the sell-cart sync was
  its only caller. Note for the eventual production deploy: CLAUDE.md cites
  this read as the surviving example of the 42P01 hazard. **The example is
  gone; the hazard is not** — `products.bullion` is read all over the pricing
  path and production still has no `products` schema.
- **`scripts/seed-e2e-order.mjs`** names the product by id and calls
  `replaceItems`.

## 5. Frontend

**Not part of this lane's contract.** The frontend was moved onto the new
route and the flat line before Jacob ruled it is about to be deleted
("frontend tests can fail and it doesn't matter"); the diff carries that work
because it was already done and green, not because anything here depends on
it. Nothing in the API was shaped to keep it alive. If it is deleted, delete
those changes with it.

## 6. NOT DONE — the quote endpoints, with the exact remaining diff

The lane's step 5 asked for `POST /quotes/purchase_order` to price the
caller's own `purchase` checkout items instead of the body's lines, and the
same for `POST /quotes/sales_order`. **Neither was changed**, deliberately,
and this is the reason rather than the effort.

**`/quotes/purchase_order` cannot become session-scoped without a product
decision.** It is UNGUARDED today, and its route comment says why: *"Public
like the catalogue's bid side — prices goods for a visitor, reads nothing
about a user."* The sell cart is usable signed-out — a visitor declares a ring
and is shown what the business would pay, which is the whole top of the sell
funnel. Pricing the session's checkout items requires a session, so the change
**silently ends anonymous sell-cart pricing**. That is Jacob's call, not a
refactor.

The exact remaining diff, for the day it is made:

1. `packages/contracts/src/wire/quotes.ts`: delete `PurchaseQuoteProduct`,
   `PurchaseQuoteScrap`, `PurchaseQuoteItem`; `PurchaseOrderQuoteBody` becomes
   `{ payout_method_id?, shipping_charge?, user_id? }`.
2. `transport/quotes/routes.ts`: `router.post("/purchase_order", requireUser,
   purchaseOrderQuote)` and a `subjectOf` for the admin `user_id`.
3. `domain/quotes/service.ts` `purchaseOrderQuote`: take `subject_user_id`,
   load `checkoutService.listItems(subject, "purchase")`, and build its
   `PricedPurchaseLine[]` from those rows — `kind` from `bullion_id`, `metal`
   from `metal_id` via the spot feed, `content` from the row's own `content`
   (no `declaredContent` call and no catalogue read at all, which is the
   ruling-51 win). `PurchaseOrderQuoteLine.index` should become the item's
   `id`, since a stored row has one.
4. Any client of the endpoint must PUT the basket before the quote can
   reprice, where today it quotes the lines it holds.

**`/quotes/sales_order` is the same shape of change without the anonymity
problem** (it is already `requireUser`), and it was left with it because
`payments`' intent pricing takes the same `items: [{id, quantity}]` body:
moving one and not the other would let a quote and the intent that charges
for it read different rows. They should move together, in a lane that owns
the payments surface too.

**Nothing is inconsistent while they stay.** The premium a quote resolves and
the premium the order pays come from the same two rules (rates band for a
purchase, `ask_premium` for a sale), and `checkout.items.premium` is written
with those same rules at replace time — so the basket, the quote and the order
already agree on the number that matters.

## 7. Other decisions this lane made

- **A GET naming somebody else is now 403** rather than a silent substitution
  (§1). Both are safe; the refusal is what the rest of the surface does.
- **`DELETE` answers `{ removed }`** rather than 204, to keep the delete
  observable (§2).
- **A sale line with no `content` refuses placement.** See ruling 51's entry
  in FOLLOWUPS.md — a stale basket costs the customer a re-sync; the
  alternative sells metal for zero.
- **No migration was needed.** `checkout.items` already carries `content` and
  `unit` (069). A backfill of `orders.items`' 24 null-content bullion rows is
  the outstanding data work, and it is the user's.

## 8. Error handling (Jacob, 2026-09-03)

> The error logs spammed through all the code is making this impossible to
> read. We need to remove all of those, and have a single function for doing
> try/catch and passing the error along.

Applied to everything this lane wrote or rewrote:

- `patchCheckout`'s `try/catch` mapping a 23503 into `Invalid` is **gone**.
  `package_id`, `carrier_service_id` and `payment_method_id` are now ASSERTED
  against their own repos before the write, which is the same refusal reached
  the LOAD → ASSERT → WRITE way. `appointment_location_id` is left to its
  foreign key: `places.locations` has no repo (D214 item 7), so asserting it
  needs that repo first.
- `place.ts`'s `.catch(() => {})` around the post-commit basket clear is
  `attempt("clear the purchase basket", …)` from the new `#shared/attempt.ts`
  (created here with the agreed signature; the parallel lane's copy supersedes
  it on merge).
- Nothing this lane wrote contains a `try`, a `catch` or a logger call.

**Three `try/catch` blocks were LEFT, deliberately, and they need Jacob's
call.** `place.ts` `placePurchase` and `buyPostage`, and `orders/service.ts`'s
return-label write, catch to **void a FedEx label or a courier booking that
the failed transaction was going to record**, and then rethrow the original
error unchanged. They log nothing and map nothing. Deleting them leaves a
billed label alive with no order, which is money rather than noise, so they
were not touched by a lane that does not own the shipping surface. If they
should go, the compensation needs a home — an `onRollback` on
`withTransaction` is the obvious one.

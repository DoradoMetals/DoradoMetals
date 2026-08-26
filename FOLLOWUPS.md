# Follow-ups

Things found and deliberately deferred, with enough context to pick up cold.
Ordered roughly by how much they'd cost if left.

## Production: the schema and eleven features' data can now get there

`000_genesis_schema.sql` creates all 16 schemas, 45 tables, 4 views, 4 enum
types and 1 function from nothing. `029_genesis_backfill.sql` fills the tables
belonging to the eleven migrated features from exchange.

Both are verified by building into renamed schemas inside a rolled-back
transaction: `verify:genesis` compares the structure against dev column by
column, `verify:backfill` runs the backfill into empty tables and compares the
rows, re-runs it to prove idempotency, and checks that it refuses once the new
schema holds a row exchange does not.

Genesis is generated - `pnpm --filter @dorado/api dump:schema`. Edit the
generator, never the SQL.

### What is still not populated

**The other features' tables.** orders, payments, fulfillments,
shipping.shipments/tracking/pickups, places, and the refiners item/spot tables.
Their features still read exchange so empty costs nothing, but each needs
transformation work checked against a read-for-read diff first. They should be
backfilled as each feature is migrated, not in a batch.

**The seed data, which has no source in exchange at all.** These are new facts
about the business rather than a reshaping of old ones, so they cannot be
derived and must be written as literals:

- the DORADO organization (the business itself) and `places.locations` /
  `places.location_hours`, which reference it
- `fulfillments.methods` (11 rows), `payments.methods` (10)
- `shipping.services` (8) and `shipping.packages` (9) - also blocked on the
  product decision below
- `auth.employees` (2)

Worth doing as one seed migration, taking the values from dev. Until then a
production database would have the tables and none of these rows.

### orders.items was rounding .9999 fine gold to 1.000 — fixed, and the class of bug now has a check

Jacob noticed `orders.items` had far too many columns. Chasing that found a live
data-corruption bug underneath it, which is worth recording separately from the
column question because they are different problems.

`exchange.products` declares `content`, `gross`, `purity`, `premium` and
`quantity` as unconstrained `numeric`. `orders.items` declared `purity
numeric(4,3)` and the weights `numeric(20,3)`. The backfill feeds it from
whichever of scrap or the product a line points at — `coalesce(s.purity,
pr.purity)` in 031 — so everything arriving from the product side was rounded as
it was stored. A .9999 fine gold coin was recorded at a purity of 1.000, which
does not exist. **Three order lines in dev were already wrong; eighteen products
in production would do the same on their next order**, plus seven `gross` and
four `content`.

Three checks looked straight at this and none could see it:

- `verify:parity` does not cover orders at all. `orders.items` is a merge of two
  exchange tables, not a one-to-one pair, so there is no pair to compare.
- `audit:coverage` found a target column of the right name and passed. It asks
  whether a column has somewhere to go, never whether what it lands in can hold
  the value.
- the scrap side agrees exactly — `exchange.scrap` declares the same narrow
  types — so the one pair anyone had reason to compare was already fine. The
  product side is a *value flow* rather than an ownership mapping, so it
  appeared in no map at all.

`audit:precision` now casts every source value into the type of the column it
lands in and counts what changes. It shares `audit:coverage`'s map, extracted to
`scripts/lib/feature-map.mjs`, and adds a `FLOWS` map for values that land in a
table which does not own them. Proved it fails on the known case before trusting
it. 058 widens the columns; 059 re-stores every row so dev carries the same
scale a fresh build produces.

`checkout.items` had the identical declaration and is still empty; widened too,
so the same bug is not waiting there.

### verify:genesis never read the file it verifies

Separate defect, found because the fix above did not reach the committed
genesis. `verify-genesis.mjs` built its comparison schema from
`dump-schema.mjs --stdout` — a live regeneration from dev — so it proved the
*generator* reproduces dev and never once read `000_genesis_schema.sql`. After
058, dev was correct, the generator emitted the correct types, the check said
"identical to dev", and the committed file still declared `numeric(4,3)`.

**Production is built from the committed file.** None of the widening would have
reached it. The check now compares the committed file too, and that was proved
to fail before being trusted.

### The invoice valued an ounce of gold at zero

The PDF service had no tests at all — 746 lines generating the documents a
customer actually receives. Writing them found two bugs and one duplicate.

**The scrap premium fallback was missing from every scrap branch.** Every
product branch reads `item.premium ?? item?.product?.bid_premium ?? 0`. No scrap
branch did — `calculateTotalPrice`, `calculateReturnDeclaredValue`,
`calculateItemPrice` and `getScrapTotal` all read `item.premium` alone, so a
scrap line with a null premium was worth nothing.

Found by comparing the two PDFs for the same order. Dev purchase order 239 holds
one troy ounce of gold with a null premium and a scrap `bid_premium` of 0.75:

| | |
|---|---|
| invoice (`calculateTotalPrice`) | **$4,744.11** |
| packing list (its own copy of the sum) | **$7,980.22** |
| the gold | $3,236.11 |

`calculateReturnDeclaredValue` is the worse one — that is the declared value on a
return shipment, so the same ounce would have gone back in the post uninsured.

**No production order changes.** Of 81 production scrap lines, zero have a null
premium; of 88 purchase-order items, all 88 have one. This can only ever have
understated, never overstated, and it has never fired on real data. It was one
null away.

**The packing list crashed for any order with no address.** Every address field
was dereferenced unguarded — `purchaseOrder.address.name` and thirteen more, plus
five on the sales order invoice. Five of dev's sixteen purchase orders have no
`address_id` (Completed, Accepted, Payment Processing — not junk), and
**production has one**. Asking for that document returned a 500. Now the fields
render blank; a blank line is recoverable, a 500 gives nobody a hint.

Guarding them the obvious way put the literal string `undefined` on the page in
five places, which the test caught immediately. They default to blank.

**The packing list had its own copy of the total.** `generateInvoice` used the
shared `calculateTotalPrice`; `generatePackingList` reduced the items inline
with different premium handling. That is the whole reason the two documents
disagreed. The duplicate is gone.

### Products and orders were the two features nothing validated

Both now have contracts, and `validate:wire` went from **23 shapes to 36**, all
checked against both implementations.

Products is the one the frontend leans on hardest — every price on the site
derives from those numbers — and it had nothing. The contract is deliberately
not the `products.bullion` row: the read joins the mint and the metal and
projects a flat shape, so `mint_name` and `metal_type` are joined in and
`metal_id`, `mint_id`, `supplier_id`, `stock`, `quantity`, `display` and the
audit columns are not returned at all. Three columns are renamed by the new
schema and `repo.next` aliases them back, which is precisely why checking both
implementations matters: dropping that alias fails `[next]` on both product
shapes while `[exchange]` still passes.

`getAllProducts` and `getSellProducts` are both registered rather than assuming
one covers the other — a sell-only product has no slug, so the sell read returns
rows the catalogue read does not.

### Orders had no wire contract, and were the only feature checked one way

`validate:wire` covered 23 shapes. Orders was not one of them: three nested
pieces of an order were checked — payout, shipment, user — and the order around
them was not, nor were its items. It was also the only feature registered with
`add` rather than `bothWays`, so `repo.next` was never validated at all.

That is the wrong way round. Orders is the largest surface here and the feature
whose promotion carries the most risk, and `diff` cannot cover the gap: it
proves the two implementations agree **with each other**, so if both drift from
what the frontend expects it stays green. A contract is the independent
statement of what the shape has to be.

`wire/orders.ts` now declares `PurchaseOrderWire`, `SalesOrderWire`, both item
shapes, the scrap and product summaries carried on an item, and the address as
it appears on an order. Registered with `bothWays`, plus the items flattened out
so a bad line is reported as a bad line rather than as one failing order among
sixteen. **32 shapes match, 0 diverge**, up from 23.

Three things writing it established:

- **Timestamps are strings on the wire, not Dates.** `validate-wire` compares
  `JSON.parse(JSON.stringify(row))` because that is what the frontend actually
  receives, and serialisation turns every Date into an ISO string. The first
  draft declared `z.date()` and failed on all 16 orders.
- **An order with no shipment carries an empty shipment object, not `null`.**
  The repo builds one with every field null, so "no shipment" on the wire is
  `{ id: null, … }`. That is why every existing check filters on `s?.id` before
  validating one. `ShipmentSlotOnOrder` and `PayoutSlotOnOrder` relax only the
  id; everything else was already nullable.
- **Nullability had to come from production, not dev.** Almost everything on
  `exchange.purchase_orders` is nullable — including `created_at`, `updated_at`
  and `user_id` — and only `pool_remediation` and `pool_oz_deducted` are not. A
  contract written from dev's values would have passed here and failed on the
  first real order.

Proved before being trusted, and in the direction that matters: renaming
`total_price` in `repo.next.js` alone gives `31 match, 1 diverge`, failing
`[next]` while `[exchange]` still passes.

### The refiner was emailed before the order was recorded

`sendOrderToSupplier` sent the refiner their copy of the order — with the
invoice PDF attached — as the **first** statement inside a `withTransaction`
block, followed by three writes: attaching the supplier, creating the outbound
shipment, and marking the order sent.

If any of those three failed, the transaction rolled back and the email had
already gone. For a sales order that means the refiner ships metal to the
customer, against an order with no supplier attached, no outbound shipment, and
no record of ever having been sent.

Both orderings can fail and they are not equally bad. The record now commits
first and the email goes second, so the worst case is an order marked sent whose
email did not arrive — nobody acts on that, and an admin can resend. The other
way round, metal leaves the building against a record that was rolled back.

This is a behaviour change worth knowing about: a failed send no longer rolls
back the order. That is the point.

### features/emails now has a seam, and tests

`sendEmail` built its transport at module load from the environment, so calling
it sent real mail and importing it opened an SMTP connection — in tests and
one-off scripts too. It is now built lazily on first use, the same way
`render/browser.js` launches Chromium, and takes an optional `transport` the way
a repo call takes an `executor`.

`transport` is a separate positional parameter rather than a field on the input
object, deliberately: the controllers hand `req.body` straight to the service, so
a field would be reachable from the request.

Five tests, all proved to fail first — misrouting the refiner's copy to the
customer fails one, swallowing a transport error fails another. They assert the
things that would be invisible otherwise: that the attachment is named for the
order it belongs to, that it really is PDF bytes, that a send failure propagates
rather than being reported as success, and that nothing goes out when the
document cannot be built.

Also fixed: `sendCreatedEmail` passed `payoutDetails` on to
`generatePackingList`, which does not accept it — the packing list reads the fee
off `purchaseOrder.payout.cost`. It is still accepted as an input because the
frontend sends it, and dropping a field from a request body is a wire change.

### Building the PDF and printing it are now separate

Each generator ended in `return renderPdf(htmlContent)`, so the only way to
exercise the layout was to start Chromium and get bytes back — which proves a
document came out and nothing about what is in it.

`buildPackingListHtml`, `buildInvoiceHtml`, `buildReturnPackingListHtml` and
`buildSalesOrderInvoiceHtml` now return the HTML; the four `generate*` functions
are one line each and keep their names and signatures, so nothing that calls
them changed.

Sweeping every order in dev went from **65 seconds to 14 milliseconds**, and the
address bug was in the building, not the printing. Three tests still go through
real Chromium so the rendering itself stays covered.

**Still untested: `features/emails/service.js`.** It is 119 lines of
orchestration around `sendEmail`, which sends real mail, and `sendEmail` is a
plain function export rather than a method on an object — so there is no seam to
stub it the way `auth.api.getSession` allowed for the endpoint tests. Worth a
small refactor to make it injectable. One thing already visible without tests:
`sendCreatedEmail` passes `payoutDetails` to `generatePackingList`, which does
not accept it — a dead argument.

### The HTTP layer now has tests, and the guard inventory is clean

Nothing tested the routes or the controllers until now, which is where this
session's bugs actually lived — `servicesRepo.remove(req.body)` passing a whole
body where an id was wanted, and the transactions controller reading
`req.body.user_id` on a GET. Neither is visible from a repo test, because
neither is in a repo.

`server.js` built the app, started the cron scheduler and bound the port all at
module load, and never exported the app, so nothing *could* test it. The app is
now `api/app.js` and `server.js` is twelve lines that start things. Behaviour is
unchanged; the scheduler and `listen` still happen in exactly one place.

The inventory it produced, which is worth having written down:

| | |
|---|---|
| endpoints | **124** |
| guarded | 111 |
| deliberately public | 13 |
| unaccounted for | **0** |

By guard: 73 `requireAdmin`, 35 `requireUser`, 1 `requireAuth`, plus better-auth's
own mount and the Stripe webhook, which authenticate by their own means.

The 13 public ones are the catalogue, spot prices, rates, public reviews,
recaptcha, and the cart — a cart belongs to a browser rather than an account, so
a signed-out visitor has one.

Two properties are asserted, and both were proved to fail before being trusted:

- **every endpoint is guarded or on an explicit public list.** Removing
  `requireUser` from one route fails it, naming the route.
- **no guarded endpoint answers an anonymous request.** This is the one that
  matters: a route can *look* guarded — middleware present, handler count above
  one — and still serve anybody. Replacing a guard with a pass-through
  middleware fails it with `GET /api/transactions/get_transactions -> 200`.

All 111 anonymous requests run in about 150ms, because better-auth short-circuits
without a cookie, so this is cheap enough to keep in the normal suite.

**What is not covered yet:** the 111 guarded endpoints are only tested to the
point of refusing anonymous requests. What they *return* to a real session is
untested, and that is the more interesting half — it is where the wire shapes of
the migrated features would be proved end to end rather than at the repo
boundary. The seam for it is mocking `#features/auth/client.js`'s
`auth.api.getSession`, which needs `--experimental-test-module-mocks` on the test
command. Deliberately left as a separate step.

Also removed: `app.use("/api/shipping", shippingRoutes)` was registered twice,
identically. Express never reached the second one.

### The credit ledger is migrated, and its one endpoint is broken three ways

`exchange.account_transactions` now has a target — `payments.ledger`, migration
060, behind `TRANSACTIONS_SOURCE`. Backfilled, parity clean, six-way diff clean,
six new tests.

Separately, `GET /api/transactions/get_transactions` is broken and nothing has
noticed because **the frontend never calls it**:

1. the controller reads `req.body.user_id` on a **GET**, so `user_id` is
   `undefined` and the query matches nothing;
2. `getTransactionHistory` returns `result.rows[0]` — one row — despite being
   named history and being the only way to read the ledger;
3. it had no `ORDER BY`, so *which* row that was came back in physical order.

Only (3) was fixed, in both implementations, because without a deterministic
order the diff between them means nothing. (1) and (2) are left alone
deliberately: fixing them changes the response shape, and a schema migration is
the wrong place to do that. They are trivial to fix as a separate change — the
question is only what the endpoint should return, which nobody has needed to
answer yet.

**One thing to get right when (1) is fixed, added later.** The obvious repair is
to move `user_id` from the body to the query string. Do not: that is the same
shape as the ownership hole found in the order routes — a user id taken from the
request rather than from the session, on an endpoint guarded only by
`requireUser`. It would let any signed-in customer read any other customer's
credit ledger, which is the $66,999.32 one. Take the id from `req.user.id` as
`getSalesOrders` does, or guard it the way `shared/middleware/ownership.js`
guards an order. The endpoint currently returns nothing at all, so there is no
hurry and no exposure today.

Worth noting `addFunds` and `removeFunds` were already correct and already
transactional; the existing tests cover the property that matters, which is that
a balance movement and its ledger entry commit together.

### RESOLVED: every page was blank until an auth request completed

**Fixed.** `LayoutProvider` no longer returns its skeleton *instead of*
`children`. The skeleton now stands in for the **nav**, which is the thing that
actually needs a session, and everything below it renders immediately.

Measured before and after with the frontend up and the API stopped:

| | before | after |
|---|---|---|
| ~2s | empty | heading and prose rendered |
| ~10s | empty | heading and prose rendered |
| ~40s | empty | heading and prose rendered |
| 77s | empty | — |

The data-driven rate cards are correctly absent in both cases; it is the page's
own copy that now survives an outage. Three permanent tests in
`frontend/e2e/degrades.spec.ts` hold it there.

**The first version of those tests failed for a reason worth recording.** They
intercepted `**/api/**`, which is far too broad — it also matched Google Maps'
script URL and Sentry's ingest endpoint, and blocking the Maps script takes
`GoogleMapsProvider` down and the whole React tree with it. Every test failed,
and the failure looked exactly like the bug they were written to prove was
fixed. Scoped to the API's own origin now, taken from the same environment
variable the app uses.



**Not fixed — it is a visible product decision, not a patch.** Found by the
negative control for the first Playwright test, which is the only reason it
surfaced at all.

`shared/providers/LayoutProvider.tsx` gates the entire app on the session query:

```jsx
if (!session && isPending === true) {
  return (<>{/* a pulsing skeleton */}</>)   // note: NOT {children}
}
```

It returns the skeleton *instead of* `children`, so nothing below it renders
while `useGetSession()` is pending. That includes pages that need no session at
all.

**Measured, with the frontend up and the API stopped** — `/rates`, sampled by a
real browser:

| elapsed | heading | skeleton | body text |
|---|---|---|---|
| ~2s | 0 | 1 | *(empty)* |
| ~10s | 0 | 1 | *(empty)* |
| ~40s | 0 | 1 | *(empty)* |
| 77s | 0 | 1 | *(empty)* |

It never recovers. I expected React Query's default three retries to exhaust and
let `isPending` fall to false — that reasoning was wrong, and the measurement is
what settled it. The mechanism underneath is not yet identified; the observable
behaviour is not in doubt.

**Why this matters beyond an outage.** Ten routes declare `seoIndex: true`,
including `/buy`, `/sell`, `/rates`, `/about-us`, `/terms-and-conditions` and
`/privacy-policy`. All of them are public — `roles: []` — and all of them render
**no content whatsoever** until an authentication round-trip finishes. So:

- during any API blip the marketing site is a blank page, not a degraded one;
- on every cold load, a first-time visitor waits on an auth request before
  seeing a word of copy;
- a crawler that does not wait, or that hits a slow moment, indexes nothing.

The page even has the right instinct already — `/rates` has a
`"Loading current rates…"` state for exactly the case where data has not
arrived. It never gets to show it.

**The shape of the fix**, for when you want it: render `children`
unconditionally and let the parts that actually need a session handle their own
pending state. The skeleton is the right idea in the wrong place — it belongs
around the nav and account controls, not around the document. That changes what
every page looks like while loading, which is why it is written down here rather
than done.

### CHECKED AND FINE: the four features with no `dual` repo, and why each is right

An inventory of every feature turned up four that look unfinished — no
`repo.next`, no `repo.dual`, or no `*_SOURCE`. All four are deliberate. Written
down because the file listing suggests otherwise, and the next person to audit
this will ask the same question.

**`mints` and `refiners` are two-state, not three.** Both are read-only through
the API — no route writes to them — so there is nothing to dual-write and
nothing to keep in sync. `exchange.mints` and `exchange.suppliers` cannot drift
from the new tables through anything this code does. Both repos say so at the
top. If a write path is ever added, both need the three-phase treatment.

**`fulfillments` has no source to read from.** It records capability `exchange`
never had, so a switch would have exactly one state.

**`scrap` writes `exchange.scrap` directly and needs no switch of its own** —
this is the one that took checking rather than reading. Its data does migrate:
the map sends `exchange.scrap` to `orders.items` and `refiners.items`. So how
does a scrap edit reach the new schema with no dual repo?

Through the orders dual repo, and the ordering is what makes it work. All three
callers write scrap **first**, then make an orders write that syncs:

| service call | writes scrap | then | which syncs |
|---|---|---|---|
| `updateScrapItem` | `scrapRepo.updateScrapItem` | `updatePremium` | `["items"]` |
| `deleteOrderItems` | `scrapRepo.deleteItems` | `deleteOrderItems` | `["items"]` |
| `createOrderItem` | `scrapRepo.createNewItem` | `createOrderItem` | `["items"]` |

`sync(..., ["items"])` calls `next.mirrorItems(orderId)`, which **re-derives**
`orders.items` from `exchange` rather than replaying the write — so it reads the
scrap row that was just updated, in the same transaction. A scrap edit lands in
the new schema without scrap knowing the new schema exists.

That is a real dependency and not an obvious one: it holds only because scrap is
never the last write in its transaction. **If a path is ever added that edits
scrap without a following orders write, it will silently stop mirroring** — the
kind of failure that shows up as a stale weight on an order months later. Worth
a test if scrap gains a route of its own.

### RESOLVED: every invoice fetched a font from Google before it rendered

**Fixed.** Poppins is self-hosted now — three woff2 files in
`api/shared/assets/fonts/`, inlined as data URIs by `assets.ts` exactly the way
the logo and contact icons already were, and four `@font-face` blocks in
`layout.ts` in place of the `@import`.

**Three weights, not four.** The `@import` asked for 400/500/600/700, but the
templates only ever use `normal`, `600` and `bold` — checked across `layout.ts`,
`sections.js` and `service.js`. 500 was never rendered, so it is not carried.
About 24KB total.

Verified rather than assumed, and the control is the part that matters: with the
network blocked entirely, the PDF still embeds Poppins. Before the change, with
googleapis and gstatic blocked, it embedded it **zero** times — the silent
substitution reproduced. External requests during a render went from 4 to
**0**.

Self-hosted locally rather than served from S3. S3 would work, but the whole
reason the logo and icons are inlined is that a rendered PDF should depend on
nothing external; putting the font back on a network hop, even ours,
reintroduces exactly the failure mode being removed.



Found while converting the PDF renderer, not caused by it.

`features/pdf/render/layout.js` opens its stylesheet with:

```css
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
```

So **every packing list and every invoice makes an outbound request to Google at
render time** — a stylesheet and then the font file itself. Everything else in
these documents is inlined: `assets.js` reads the logo and the four contact
icons off disk and base64s them into data URIs precisely so the PDF does not
depend on anything external. The font is the one exception, and it is the one
thing on the page that appears on every line.

**What happens if Google is slow or unreachable.** The render does not fail; it
falls back to the next font in the stack. A customer's invoice silently comes
out in a different typeface, and nothing logs it. This is also a third party
learning the timing of every order document the business produces.

**Not fixed**, because the fix is to self-host the font — download the Poppins
woff2 files, put them in `shared/assets/`, and inline them the way the logo
already is. That is a handful of binary files in the repo and a decision about
which weights are actually used, so it is yours rather than mine.

While in there, the wait was made explicit and got faster. `renderPdf` used
`waitUntil: "networkidle0"`, which puppeteer's own types now **exclude** for
`setContent` — still honoured at runtime, but on the way out, so an upgrade
would have silently changed when the PDF is captured. It now waits on
`document.fonts.ready`, which is what the wait was always for. Measured on the
real template: **~1960ms before, ~390ms after**, because network-idle waits out
a fixed quiet period after the last response while this resolves the moment the
fonts are in. Verified by searching the output bytes for the embedded font name
rather than by trusting that it looked right.

### RESOLVED: every populated column in production now has somewhere to go

`audit:coverage --prod` is clean. That is the answer to "is all the data
accounted for", and it is worth stating plainly because it has never been true
before: **no populated column in production's `exchange` schema lacks a
destination in the new one.**

The five tables no feature claims are all explained rather than outstanding —
`account`, `session` and `verification` belong to better-auth and go with auth's
atomic cutover; `auctions` and `auction_items` are retired by 067;
`schema_migrations` is the ledger and stays in `exchange` by design.

**Getting there was a fix to the audit, not to the data.** It had been reporting
three columns as homeless:

```
exchange.addresses.user_id      73 of 73 rows populated
exchange.addresses.name         73 of 73 rows populated
exchange.addresses.is_default   73 of 73 rows populated
```

They were reported under `orders`, and under `orders` that is **true and
intentional** — an order snapshots an address without copying whose it was,
which is exactly why `places.addresses` and `places.user_addresses` are separate
tables. But the `addresses` feature maps to `places.user_addresses`, which holds
all three (`name` → `label`, `is_default` → `default_shipping`). Nothing was
homeless.

The bug was that the loop is per feature and built its list of available columns
only from *that* feature's targets, so a column another feature already carried
still counted as a gap. The grouping by feature stays — it is useful context —
but the gap test is now global.

Two smaller things fixed alongside, both about the number being believable:

- The count was of **sightings, not columns**. Two features map
  `exchange.addresses`, so three missing columns were reported as "6". It counts
  distinct `source.column` pairs now.
- Proven both ways rather than assumed. Removing `places.user_addresses` from
  the map brings the three back and reports "3"; restoring it clears them. A
  change that makes a check *less* likely to fire has to be shown still able to.

This matters more than a cosmetic report. `audit:coverage` is the thing that
catches a feature being split while columns of live data have nowhere to land —
orders had matching row counts and was missing 21 columns. A report that cries
wolf is one people stop reading, and this one needs to be believed on the day it
finds something real.

### RESOLVED: the customer set the spot price they were charged at

**Fixed.** `spots` no longer comes from the request. `features/spots/service.js`
gains `getPricingSpots()`, and all three call sites use it — `get_sales_tax`,
`createSalesOrder` (and the admin variant), and `updatePaymentIntent`, where the
result becomes the amount Stripe is told to charge. The parameter is *removed*
from each signature rather than accepted-and-overwritten, so nothing can read it
by accident.

Fetched fresh on every call, no caching: `exchange.metals` is already refreshed
by `updateSpotPrices` on a cron, so an intent revised mid-checkout carries the
current price rather than one from whenever the session started.

**Jacob decided against a quote lock**, and the reasoning is better than the one
I offered. I proposed holding a quoted price for ten minutes as "best practice".
It is not, for a dealer: a held price is a **free option** for the customer — if
spot moves in their favour they take it, if it moves against them they walk.
The business can only lose on it. Server-authoritative pricing at the moment of
confirm is the correct end state, not a stepping stone to one.

The consequence to be aware of: if spot moves between the customer loading the
page and confirming, the charge is the newer price. That is the intended
behaviour now rather than a defect.

**The test took three attempts and each failure was mine**, which is worth
recording because the same trap will catch the next person:

1. The first fixture picked `AK` — the first `state_code` in the table, which
   taxes nothing. Both halves returned 0, they compared equal, and **the test
   passed against the reverted code**.
2. The second picked a state that does charge, but the item was missing
   `purity`, `gross` and `domestic_tender`. `getSalesTax` filters on all three,
   so it matched no rule and was taxed at zero — which looks exactly like a
   state that does not collect.
3. The third asserts the honest request is taxed **more than zero** before
   comparing anything, so a vacuous fixture now fails loudly instead of passing
   quietly. Verified by reverting the service and confirming the test fails.



**Not fixed. It needs a decision that is yours, and the fix runs through a wire
shape that is mid-migration.** This is live in production today.

> **THE BUY SIDE IS THE SAME SHAPE AND POINTS THE OTHER WAY, found 26 August.**
> The list below is the sell side. `POST /api/purchase_orders/accept_offer` is
> not on it, and there a manipulated number does not make the customer pay less
> — it makes **the business pay more**.
>
> `acceptOffer` takes the whole order out of `req.body`. `calculateTotalPrice`
> reads ``item.price ?? (content * bid_spot * premium)``, so a price in the body
> is used **verbatim** and no spot lookup even happens; `shipping_charge` and
> `payout.cost` are **subtracted**, so sending zero for both maximises the
> result. `calculateItemPrice` does the same, and `updateOrderItemPrices` writes
> it into `exchange.purchase_order_items.price`. The total lands in
> `purchase_orders.total_price` via `moveOrderToAccepted`.
>
> The route is `requireUser` + `requireOwnOrder`, so this is a customer
> accepting **their own** offer — which is exactly who benefits.
>
> **Measured, not argued.** `features/purchase-orders/accept-offer-pricing.test.js`
> sends two requests differing only in the prices in the body and reads the row
> back: the recorded total follows the body both times, and the item rows carry
> the body's number too. Safe to run — `accept_offer` is pure database work, and
> the pinned transaction rolls it back.
>
> **Not fixed, for the same reason as the sell side**: the fix is server-side
> pricing, which changes a wire shape mid-migration, and CLAUDE.md rules that
> out. It is **D26** in the decision log. The test asserts the behaviour as it
> is, so changing it is deliberate and visible.
>
> One correction to the note above while I am here: it says `accept_offer` "was
> not exercised directly because accepting an offer moves money". It is
> exercised now. Accepting an offer turns out to be pure database work — the
> money moves later, when an admin pays out — so it can be driven inside a
> transaction that is rolled back.

`spots` arrives in the **request body** and is what every money figure is
computed from. `calculateItemAsk` is:

```js
content * (spot.ask_spot * ask_premium)
```

The item's own `price` field is not used. The number that prices an ounce of
gold is the one in the request. It reaches three places, all from `req.body`:

- `POST /api/tax/get_sales_tax` → `getSalesTax({ address, items, spots })`
- `createSalesOrder({ sales_order, payment_intent_id, spot_prices })`
- `updatePaymentIntent({ items, using_funds, spots, ... })` → and there
  `rawAmount = Math.round(orderPrices.post_charges_amount * 100)` becomes the
  **Stripe charge amount**, floored at `Math.max(rawAmount, 1000)`.

Measured against `calculateSalesOrderTotal`, one Coin, `content: 1`,
`ask_premium: 1.05`, STANDARD shipping, CARD — identical in every respect except
the `spots` array in the body:

| client's `ask_spot` | order total | Stripe is told |
|---|---|---|
| 3400 (honest) | $3,673.53 | 367353 |
| 100 | $133.77 | 13377 |
| 1 | $26.81 | 2681 |
| 0 | $25.73 | 2573 |

So an ounce of gold can be bought for **$26.81**, and the floor means nothing
goes below $10.00. The recorded order total and the charge agree with each
other, so nothing downstream flags it — both were computed from the same
supplied number.

**What is already safe.** Items are re-fetched server-side with
`productService.getItemsFromServer(sales_order.items)`, so the product, its
`content` and its premium cannot be faked. The address is loaded by id. It is
only the metal price that is taken on trust.

**Why I did not just fix it.** The obvious fix — have the server fetch its own
spots — is not a one-line change, for two reasons worth knowing before you make
it:

1. **The calculation reads the legacy WIRE shape, not the internal one.**
   `calculateItemAsk` matches `s.type` and reads `s.ask_spot`. The repo returns
   `{ id, name, ask, bid }` and `shared/wire` converts to
   `{ type, ask_spot, bid_spot }` at the edge. So server-sourced spots have to
   be converted *back* into the wire shape to feed the calculation — and
   `SPOTS_WIRE` is one of the seven switches still on `legacy`. Whatever is
   written now has to keep working when it flips.
2. **It is partly a pricing-policy question.** Sending spots from the client is
   a crude price lock: the customer is charged the price they were quoted rather
   than one that moved while they were checking out. Making the server
   authoritative removes that lock. The proper answer is a server-side quote —
   store the spot at quote time, charge against the stored one, expire it — and
   that is a design decision rather than a patch.

My recommendation is the server-side quote, with the stored spot referenced by
id from the intent. A one-line "use server spots" change would close the hole
and silently change what a customer pays relative to what they were shown.

`features/sales-tax/replay.test.js` pins the current behaviour, including the
zero-tax-when-no-spots case, so that changing it is deliberate and visible.

### Sales orders have been taxed in no state at all since 6 January 2026

**Fixed, and it is not the same thing as money having been lost.** Read the
second half before deciding how alarming this is.

`createSalesOrder` and `adminCreateSalesOrder` both did:

```js
const address = await addressRepo.getFromId(sales_order.address.id);
...
taxService.attachSalesTaxToItems(address.state, ...)   // what the customer pays
taxRepo.updateStateSalesTax(orderPrices.sales_tax, address.state, ...)  // what we owe
```

`addressRepo.getFromId` returns `rows` — a **list**. `address.state` on a list
is `undefined`. `getSalesTax` passes it as `$1`, no rule matches a NULL
`state_code`, and the query `COALESCE`s to a rate of **0**. The liability update
is `WHERE state = $2`, which matches nothing — though that one is moot in
effect, since the amount it would have added is itself 0.

**Where it came from.** `cf724c4e`, "fix sales order bug", 6 January 2026,
replaced `addressService.getAddressFromId` — which returns `rows[0]` — with the
repo call. That service function had been **deleted in `be03eed3`**, the
December feature-slicing: the same deletion that left
`POST /api/stripe/update_payment_intent` answering 500 for eight months. One
call site was left broken and one was "fixed" into something quieter.

**Why I am not claiming money was lost.** No production state has
`reached_nexus = true` — the table is empty of them — so if
`COLLECTING_NEXUS_TAXES` is on in production, `getSalesTax` returns 0 before the
rules are ever consulted and this defect changes nothing today. Exactly **one**
sales order was placed after `cf724c4e`: a Texas order, and Texas exempts
bullion. There is no order whose tax can be shown to be wrong. The one
production order that *did* carry tax — $18.67, Maryland, 27 June 2025 —
predates the regression, which is consistent with the engine working before it.
Consistent with, not proof of.

**So the exposure is forward, and it is real**: the moment a state is marked as
having reached nexus, or that flag is turned off, orders are taxed against
`undefined` and quietly come back zero. That is a tax-collection failure that
looks exactly like a customer who owes no tax.

**What to check when you are up**: whether `COLLECTING_NEXUS_TAXES` is `true` in
Railway, and whether it should be. If it is `false` there, orders since January
were taxed by the rules with a NULL state — still zero, but for a different
reason, and the Texas order would have been zero anyway.

**Fixed two ways.** The call sites now use `addressService.getAddressFromId`,
and `features/addresses/repo.d.ts` types the facade so `getFromId(...).state` is
a **compile error** rather than a silent zero — *for TypeScript callers*.

**Correction to the first version of this note**, which said "for every caller,
permanently". That is wrong. `checkJs` is `false`, so a `.js` caller is never
type-checked and the declaration does nothing for it — and
`features/sales-orders/service.js`, the file that had the bug, is JavaScript. I
proved the declaration worked by probing with a `.ts` file, which is exactly the
probe that could not tell the difference. A `.js` probe with the same bug
compiles clean.

What guards that call site today is the narrow fix plus `lint:row-vs-list`,
which is syntactic and does read `.js`. The declaration becomes the guard when
the caller is converted — which is now a reason to convert it.
The repo facade resolves its implementation with `SOURCES[SOURCE]`, and a
dynamic index erases the type to `any`, which is why nothing caught this.
`features/sales-orders/address-state.test.js` proves both halves; the rule and
the item it tests with are derived from the same database row, so the fixture
cannot drift from the data.

### FOR JACOB: an eighth — the email endpoints were an open relay on your domain

**Fixed.** This is the one you were worried about when you said we cannot be
emailing Elemetal fake orders.

Both email routes are `requireUser` and both took the RECIPIENT from the
request body:

```js
sendCreatedEmail   ->  to: purchaseOrder.user.user_email   // from req.body
sendAcceptedEmail  ->  to: email                            // from req.body
```

So any signed-in account could send mail **from the business's own domain, to
any address it named**, with the subject "Your Order Has Been Placed!" and a PDF
attachment whose contents it also supplied. That is an open relay and a
ready-made phishing template — a message that passes SPF and DKIM because it
genuinely is from you. It also spends the sending domain's reputation, and
unlike a bug, reputation is not recovered by deploying a fix.

**The fix.** The recipient is resolved by the controller from the **stored**
order and handed to the service as its own parameter — the same seam shape as
`transport`, and for the same reason: the input object *is* `req.body`, so
anything read off it can be chosen by the caller. The caller must also be
entitled to the order: an admin may send on a customer's behalf, anyone else
only about their own. Without that, naming somebody else's order id would be a
way to mail that customer at will from a domain they trust.

`sendSalesOrderToSupplier` — the one that actually emails the refiner — was
already correct: it is not a route, and it already took the address as an
explicit parameter. It is unchanged, and the existing test that says so caught
me when a too-broad edit briefly rewrote its recipient.

**Two things about the tests are worth knowing.**

The suite proves the fix through the cases that *require* the lookup to have
happened — an unknown order id answering 404, a stranger answering 403. The
more obvious test, "an address in the body cannot redirect the mail", **does not
discriminate**: with the fix the controller resolves the real address and
proceeds to send, without it the body's address is used and it also proceeds to
send, and both then hit the test-mode transport guard and fail identically. It
passed against the reverted code. That is recorded in the file rather than left
looking stronger than it is.

And no mail can leave the suite structurally, not by convention: `sendEmail`
refuses to construct the real SMTP transport when `NODE_ENV=test`, and the last
test asserts that refusal rather than assuming it.

### FOR JACOB: a seventh — the credit ledger could be read by naming its owner

`GET /api/transactions/get_transactions` is `requireUser` and did
`const { user_id } = req.body`. The repo scopes `WHERE user_id = $1` on
whatever it is handed, so a signed-in customer sending

```
GET /api/transactions/get_transactions
Content-Type: application/json

{"user_id": "<somebody else>"}
```

received that person's `account_transactions` row — 200, carrying their
`user_id`, `transaction_type` and `purchase_order_id`. **Confirmed against dev
before fixing rather than inferred**: one customer read another's ledger entry.

This is the customer credit ledger. Production holds 17 rows across 8
customers, **$66,999.32**.

**Why it survived.** A GET normally carries no body, so every ordinary call
passed `user_id` as `undefined` and got an empty response back — and the
frontend does not call this endpoint at all. It was already written up here as
"reads req.body.user_id and always returns nothing", and that description was
accurate for every caller who did not think to send a body. *Returns nothing*
and *returns anyone's ledger* were the same endpoint, separated only by a
request header. It was filed as broken, and being broken is what kept it from
being read as dangerous.

Fixed the same way as the other six: `user_id` comes from the session. The
replay suite sends the exploit exactly as it was confirmed, and reverting the
controller fails it.

**Not fixed, deliberately**: the repo returns `rows[0]`, so a customer with 11
ledger rows receives one, despite the endpoint being called *history*. That is a
response shape, and shapes do not move during a schema migration. The suite
asserts the current shape so the change is deliberate when it comes.

### FOR JACOB: a sixth unguarded endpoint, and a protection that does not survive promotion

Two found while writing HTTP replay suites for reviews, users, media and
payments. Both are fixed; neither needed a deploy to be true, so both were
already true in production.

**`GET /api/images/get_test_image` listed every image in the system.** It was
`requireUser`, its repo call is `SELECT ... FROM exchange.images` with no user
scoping at all, and the service attaches a presigned GET URL to every row — a
working download link for the file. So any of the 75 signed-in accounts could
enumerate and download every image any customer had ever uploaded. Production
holds 3 images belonging to 1 customer.

The frontend already treated it as admin-only: `/images` declares
`roles: ['admin']` and is titled "Image Test". **The guard was in the UI**,
which is not a place a guard does anything — the endpoint answers a request
whether a page asked for it or not. The route is `requireAdmin` now, which
matches the frontend's own declaration, so nothing a real user can do changes.

Left unscoped rather than filtered to the caller on purpose: showing an admin
every image is what that page is for. Scoping would have been right had it been
a customer's own gallery.

**The credit balance is protected by a constraint that the new schema does not
have.** `adjustUserCredit` builds the new balance with a `CASE` that has no
`ELSE`, and `mode` came from `req.body` unvalidated:

```sql
SET dorado_funds = CASE WHEN $2 = 'add' ... WHEN $2 = 'subtract' ...
                        WHEN $2 = 'edit' ... END
```

A `CASE` matching nothing yields NULL, so any unrecognised mode — a typo, a
renamed frontend constant, a stale client — assigned NULL to a customer's store
credit.

It never lost anyone's money, and the reason is the whole point: **the database
stopped it, not the code.** `exchange.users.dorado_funds` is `NOT NULL DEFAULT
0`, so the write was refused and the caller got a 500. Verified in a rolled-back
transaction rather than assumed — the UPDATE raises 23502.

`auth.users.dorado_funds` was **nullable with no default**. So the protection
was a property of the schema being left behind, and the moment that write moves
there, the same request sets the balance to NULL and returns 200. `repo.dual.js`
still routes this write to `exchange`, so nothing is live yet — this is a
promotion landmine, not a current bug.

Both halves fixed. Migration `080` gives `auth.users` the same `NOT NULL DEFAULT
0`, checked against production rather than dev row counts:

| | rows | null | total |
|---|---|---|---|
| prod `exchange.users` | 75 | 0 | 10.251268973986002615 |
| prod `auth.users` | 60 | 0 | 10.251268973986002615 |
| dev `exchange.users` | 10 | 0 | |
| dev `auth.users` | 11 | **2** | |

Production needs no repair. Dev's two nulls are seeded employees `exchange.users`
has no row for, so there was no value to preserve. And the service now takes an
allowlist of modes — that is the half that does not depend on a constraint
existing, because a validation can be bypassed by a new caller and a constraint
only turns silent loss into a loud failure. Neither alone is the answer.

The amount is validated too, and the first attempt at that check *was* the bug it
was written to prevent: `Number(null)`, `Number("")` and `Number([])` are all 0,
and 0 is finite, so an empty amount field passed validation and became a zero
adjustment — under `edit`, a zeroed balance, returned as 200. The suite sends
each of them.

### verify:genesis named one of two drifted columns

Worth recording separately because it is a check on the file **production is
built from**.

The drift report compared the committed genesis and a fresh dump as unordered
sets of **bare lines**: a line counted as drift only if its exact text appeared
nowhere in the other file. Column declarations are not unique across a 47-table
schema, so a real change was invisible whenever an identical declaration existed
under some other table.

It happened. `077a` relaxed `payments.details.method_id` and the report said
nothing about it, because `fulfillments.fulfillments` also declares

```
  method_id uuid NOT NULL,
```

so the removed line still "existed" and was filtered out. Lines like
`id uuid DEFAULT gen_random_uuid() NOT NULL,` and `user_id uuid NOT NULL,`
appear in dozens of tables, so most of the schema was maskable this way.

**The check itself was never wrong** — `committed !== regenerated` is a
whole-string comparison and it fired. But it named one of the two drifted
columns, and someone acting on that report would have fixed one and been
baffled when the next run fired again. Each line is now qualified by the table
it sits in. Proven by restoring the stale file and confirming both are named.

Two things this also established: `verify:genesis` is **not** part of
`pnpm check` — the check script is contracts build, `lint:db`,
`lint:migrations`, `typecheck` and the two test suites — so genesis had simply
been stale since `077a` and nothing re-ran it.

### FOR JACOB: seven populated exchange tables that no feature claims

`audit:coverage` walked the feature map, so it could only ever report on tables
somebody had already thought about. A table missing from the map was invisible.
It now reports them, and there are seven:

| table | dev | production |
|---|---|---|
| `account_transactions` | 19 | **17** |
| `carts` / `cart_items` | 8 / 4 | 16 / 3 |
| `sell_carts` / `sell_cart_items` | 8 / 2 | **65 / 27** |
| `auctions` / `auction_items` | 1 / 10 | 1 / 2 |

`exchange.account_transactions` is the one that matters: **17 rows, 8 customers,
$66,999.32, dated June 2025 to January 2026, tied to purchase and sales orders.**
A customer credit ledger. It has no destination in any of the eighteen new
schemas, and `features/users`'s `adjustUserCredit` is presumably what writes it.
If `exchange` were ever retired it would go with it.

The carts and auctions have targets — `checkout.carts` / `checkout.items` and
`auctions.items` exist and are empty — they were simply never migrated and never
counted among the seventeen features. `sell_carts` at 65 production rows is not
negligible.

Also: **there are eighteen new schemas, not the sixteen CLAUDE.md lists.**
`auctions` and `checkout` are absent from that list.

`exchange.carrier_services` was an eighth. It turned out to be fully covered by
`shipping.services`, which was migrated this session and never declared in the
map — so neither audit had been checking a feature that was already built. Now
declared; it added zero coverage gaps and two more type comparisons.

### The wire adapter: two axes, and which way it points

Jacob, 2026-08-23: "We will need to support the current frontend... we're gonna
need some data transforms coming in and out on switches that we can toggle as we
update the frontend."

Two switches per feature now, deliberately not conflated:

| switch | question |
|---|---|
| `*_SOURCE` | which schema the data is read from |
| `*_WIRE` | which shape it leaves the API in |

A feature can be on `dual` and `legacy`, or `exchange` and `next` — they answer
different questions and get flipped for different reasons, the first when the
data is ready and the second when the frontend is.

**The direction is the part that matters.** Both repos return the NEW shape and
the adapter converts DOWN to legacy on the way out. Doing it the other way —
repos returning legacy, something converting up — makes the legacy shape the
internal truth and leaves nothing to delete at the end. This way the adapter is a
shim with an expiry date, exactly like `repo.exchange`.

Proved on products first, because its aliasing already *was* a legacy adapter
written in SQL. `constants.js` now aliases exchange's `product_name` UP to
`name`; `constants.bullion.js` stops aliasing down; `wire.js` renames on the way
out and back on the way in.

Three things it turned up:

- **The input side was already inconsistent.** `repo.next.updateProduct` read
  `product.name` but `product.product_description`, and `repo.exchange` read all
  three legacy names. Both take the new shape now, with `fromProductWire` applied
  at the controller.
- **`ProductWire` is derived from `BullionWire` rather than restated**, so the
  two cannot drift — a column added to the catalogue appears in both and the only
  difference stays the three renames.
- **The adapter's output is checked against the legacy contract**, not just the
  repos' output against the new one. That is what proves the frontend still gets
  exactly what it got before, and it keeps working as a regression test right up
  until the adapter is deleted. `validate:wire` is 38 shapes, up from 36.

### RESOLVED: refiner items are one row per line, filled in later

Not a data question after all. Jacob, 2026-08-23: "They're going to be built from
order items at the same time as order items are created, so they'll have those
defaults (which are ultimately coming from checkout_items) and then we're going
to allow updating the refiner items in an admin screen later."

So the derivation 064/066 already produce is right: a row per purchase-order
line, carrying what was sent, with the assay columns null until a refiner
reports. The 18 of 25 rows holding only a `pre_melt` are lines awaiting assay,
not gaps. Bullion lines keep an empty row because they are lines like any other.
What remains is API work — the admin screen that fills them in.

### FOR JACOB: `exchange.scrap` rounds to three decimals, at the source

Found by placing the same order through both creation paths and comparing what
each left behind.

`exchange.scrap` constrains `pre_melt`, `post_melt`, `content` and `purity` to
`numeric(_,3)`. Migration 058 widened `orders.items` after `audit:precision`
caught `.9999` fine gold being stored as `1.000` — but that was the
**destination**. The source still rounds, so a scrap line entered today loses
its fourth decimal before anything migrates it.

**Production holds two scrap rows at purity exactly `1.000`**, which is a purity
no metal has. They were almost certainly entered as `.9999` and rounded up.
Content is `pre_melt x purity`, so those lines are overstated by about 0.01% —
in the customer's favour, so it costs the business rather than them. Four more
rows sit at `0.999`.

**Not fixed, deliberately.** Widening it is `ALTER COLUMN ... TYPE` against
`exchange`, which `lint:migrations` classifies as destructive and which needs an
explicit marker saying what backup exists. No `pg_dump` of production has been
taken. It is also worth deciding at the same time whether the two existing rows
get corrected, because widening the column does not bring the lost digit back.

The difference is asserted as a test rather than filtered out of the comparison
— `features/orders/parity.test.js`, "exchange rounds a scrap line to three
decimals and the new schema does not" — and it checks the column scales, so it
will tell you to delete it if the column is ever widened.

### FOR JACOB: two more of the same, found by sweeping instead of stumbling

After three holes of the same shape, the whole API was swept mechanically -
every route, what its handler reads from the request, and whether anything
compares it to `req.user`. Two more, both live.

**Addresses: any signed-in customer could read and write anybody's address
book.** All five routes took `user_id` from the request behind `requireUser` and
nothing asked whose it was:

- `GET /api/addresses/get?user_id=…` — that customer's addresses
- `create` / `update` / `delete` / `set_default` with `user_id` — writes into
  their book

Addresses are names, street addresses and phone numbers, so this is the widest
PII of the five findings. An admin naming a user IS legitimate — the customer
drawer does it via `useUserAddress(userId)` — so the rule is "your own, unless
you are an admin", the same shape `shared/middleware/ownership.js` uses.

**Payments: `type=admin` was a parameter, not a privilege.** The repos read
`type === "admin" ? user_id : session.user.id`, and
`GET /api/stripe/retrieve_payment_intent` is `requireUser`. A signed-in customer
passing `type=admin` with somebody else's `user_id` got their payment intent —
and the response is the Stripe object's **`client_secret`**, which is what
confirms a payment from a browser. The type still selects the flow, because an
admin placing an order for a customer is real; it just cannot be claimed by
asking for it.

**A gap in my own testing, worth recording.** `features/addresses/replay.test.js`
already existed and passed. Every test in it sent `user_id: customer.id` — the
same id as the session — so none could tell whether the endpoint used the session
or obeyed the request. It obeyed the request. A replay test that only ever plays
back the happy path proves the endpoint works, not that it is safe. The file now
has a stranger and an admin, and restoring the old behaviour fails the stranger
test alone.

**What the sweep cleared.** Every `requireAdmin` route reading an id is fine —
admins are trusted with all of it. The shipping reads (`get_tracking`,
`check_pickup`, `get_locations`, `validate_address`) take carrier and shipment
ids rather than user ids and expose carrier reference data or a tracking status;
noted, not changed. `create_purchase_order` takes `user_id` from the body and is
worth a look when the orders collapse reaches its write path — it is not fixed
here because that path is mid-rebuild and changing it twice would be worse.

> **Both of those have moved on, 26 August.**
>
> **`create_purchase_order` is fixed.** The write path this deferred to has
> landed, so the controller now takes the owner from the session and the body's
> `user_id` is simply no longer believed. It is not a wire change. There is no
> admin escape hatch, unlike the address book: the one frontend caller sends its
> own session id, and an admin ordering for a customer has a separate route on
> the sales side (`admin_create_sales_order`, `requireAdmin`) rather than
> borrowing this one. Worth restating what it was: a signed-in customer could
> place a purchase order attributed to somebody else, and that path **buys a
> real FedEx label and can book a courier**, so it spent money doing it.
>
> It is held by a static check rather than a request, in
> `features/authorization/admin-routes.test.js` — "no requireUser handler takes
> a user_id from the request without an admin check". Static **because** of the
> label: the request that demonstrated the bug would be the one that spent the
> money. Proved discriminating by restoring the old line and watching it name
> the route.
>
> **`get_tracking` is described above as a read, and it is not.**
> `operationsService.getTracking` deletes and reinserts the shipment's tracking
> events and updates its status, estimate and `delivered_at` — the same function
> whose unconditional `removeEvents` is documented elsewhere in this file as
> having already emptied seven production shipments' histories. So an
> unauthorised caller with a shipment id does not merely see a tracking status;
> they can **mutate another customer's shipment record and spend a FedEx call
> doing it**.
>
> **Fixed the same morning.** `requireOwnShipment` in
> `shared/middleware/ownership.js`, mounted on `get_tracking`. `requireOwnOrder`
> could not be reused: it looks for an order id under four spellings and refuses
> when it finds none, and this route names a `shipment_id`.
>
> `requireAdmin` was not the answer either — `useTracking` is called from the
> **customer** purchase-order and sales-order drawers as well as the admin ones,
> checked in the frontend before choosing the harder fix over the simpler one.
>
> It asks both schemas, for the same reason `requireOwnOrder` asks all three
> order tables: it must answer identically whichever `SHIPMENTS_SOURCE` is
> serving. `exchange.shipments` carries the order id inline; the new schema
> reaches it through `fulfillments.shipments → fulfillments.fulfillments →
> orders.orders`.
>
> **The last axis, and it is clean.** The guards say who may call; they do not
> say whose rows come back. Checked the three list endpoints at the repo rather
> than the controller, because a controller that passes `req.user.id` into a
> query that ignores it would look right and leak everything:
> `purchase_orders.findAllByUser` is `WHERE po.user_id = $1`,
> `sales_orders.findAllByUser` is `WHERE so.user_id = $1`, and
> `transactions.getTransactionHistory` is `WHERE user_id = $1`. All three
> filter. `findById` has no user clause, but no customer-facing route reaches it
> without `requireOwnOrder` in front. Nothing to change; recorded so the
> question is not re-opened.
>
> > `features/shipping/operations/shipment-ownership.test.js` drives the refusals
> only. The allowed path calls FedEx and rewrites rows, so it is covered against
> the middleware directly rather than over HTTP — including the owner and admin
> branches, without which the suite would pass against a guard that refuses
> everybody and takes the customer drawers down with it.

### FOR JACOB: any signed-in user could destroy any image file in storage

**Live in the deployed API.** The third of three, and the only destructive one.

`features/media/service.js` `deleteImage` read the image by id **with no
ownership check**, removed the object from MinIO **unconditionally**, and only
then ran a `DELETE` that *is* scoped to the user:

```
const img = await mediaRepo.getImageById(id);                    // unscoped
await minio.removeObject(img?.bucket, img?.path + img?.filename); // irreversible
await mediaRepo.deleteImage(user_id, id);                        // scoped, matches nothing
return { success: true };
```

So a signed-in caller posting somebody else's image id destroyed the real file,
left the database row behind pointing at nothing, and got `{ success: true }`.
Two faults at once: **the ownership check was in the step that ran last**, and
**the irreversible step ran first**, before anything had been authorised.

`getUrl` had the read half of the same problem — an `image_id` from the query
string behind `requireUser`, returning a **presigned download URL** for it. A
presigned GET is the file.

**Blast radius today is small**: 3 images in production, one owner. The shape is
what matters, and it is the same shape as the order and cart holes — an id taken
from the request with nothing asking whose it is.

**A passing test made it look covered.** `features/media/repo.next.test.js` has
"deleteImage will not delete another user's image", and it passes: it exercises
the **repo**, whose `DELETE` is correctly scoped. The bug was one layer up in the
service. *A test can prove the right property about the wrong layer and read as
coverage.*

**Fixed**: ownership is established first, the database work happens next, and
the object is removed last — which is the order CLAUDE.md gives and the reason it
gives it. If the removal now fails, the row is gone and the file is orphaned,
which a sweep can find; the old order left a live row pointing at a deleted file.
`user_id` comes from the session rather than the body. A missing image and
somebody else's image return the same 404.

`features/media/ownership.test.js` holds it, deliberately below HTTP and without
touching storage: it gives the service a stranger's id and asserts it returns
null having done nothing. Removing the guard fails all four.

### FOR JACOB: anyone could read and overwrite any customer's cart, with no account at all

**Live in the deployed API, and unauthenticated — no session, no cookie,
nothing.** The most exposed thing found in this migration.

All four cart endpoints took the user id out of the request — `req.query.user_id`
on the reads, `req.body.user_id` on the writes — and none of them had a guard:

| Endpoint | As a complete stranger |
|---|---|
| `GET /api/cart/get_sell_cart?user_id=…` | **200**, that customer's sell-cart items |
| `POST /api/cart/sync_sell_cart` | replaces that customer's sell cart |
| `POST /api/cart/sync_cart` | replaces their buy cart |
| `GET /api/cart/get_cart?user_id=…` | 200 (returns only `{success:true}`) |

Demonstrated rather than deduced: a request with no session returned another
customer's cart, 200, two items. `exchange.sell_carts` holds **65 rows in
production**.

A sell cart is what somebody has assembled to sell — scrap with weights, purity
and premiums. Reading it says what they are about to sell and roughly what it is
worth. Overwriting it is vandalism rather than theft: the customer sees the cart
on screen before submitting, and the order is built from the block they submit
rather than from the cart.

**They were declared PUBLIC deliberately, and the reason was wrong.** The list in
`shared/http/endpoints.test.js` said "a cart belongs to a browser, not an
account — a signed-out visitor has one". That is true of the browser-local store
— zustand plus localStorage — and not of these endpoints:
`frontend/features/cart/queries.ts` throws `Missing user` before calling either
sync, and `hydrateCarts` only runs with a session's user id. **Nothing has ever
called them anonymously.** The declaration described the feature and not the
endpoint, which is exactly how a deliberate exception outlives its reason.

**Fixed**: all four now require a session and take the id from `req.user.id`,
ignoring the request's. Transparent to the frontend, which was already sending
its own id while signed in. `features/checkout/replay.test.js` holds it shut in
both directions — anonymous is refused, a signed-in caller naming somebody else
gets their own cart, and the owner can still read and sync theirs.

**Worth your attention because it is deployed**, and unlike the order-ownership
hole this one needed no account at all. Nothing suggests it was exploited — it
still needs a customer's uuid — but it is the widest thing found.

### FOR JACOB: any signed-in customer could act on any other customer's order

**This is in the live API, not in the migration.** Found by writing an HTTP
replay test that asked the obvious question and getting the wrong answer four
times.

Every customer-facing purchase-order route takes its order out of the request
**body** - `const { order } = req.body` - and none of them consulted
`req.user`. `requireUser` asks whether somebody is signed in; it never asks who.
Demonstrated with real requests before anything was changed:

| Endpoint | As a stranger |
|---|---|
| `get_purchase_order_metals` | **200** - another customer's frozen spot prices |
| `reject_offer` | **200** - another customer's offer rejected |
| `update_offer_notes` | **200** - notes written on another customer's order |
| `cancel_order` | reached the code that **buys a FedEx return label** |

`accept_offer` is the same shape and was covered by the same fix; it was not
exercised directly because accepting an offer moves money.

The `cancel_order` call returned 500 only because the test sent an empty
`return_shipment`. It passed every guard and reached the label-purchasing path.
With a valid body it would have cancelled a stranger's order, bought a return
label at the business's expense, and put their metal in the post.

Order ids are uuids rather than sequential, so nobody stumbles into this. It is
still the difference between "you cannot" and "you probably will not guess".

**Fixed** by `shared/middleware/ownership.js` - `requireOwnOrder`, mounted next
to `requireUser` on the six purchase-order routes and the two sales-order routes
that take an order from the body. Admins pass through. A missing order is a 403
rather than a 404, because "does not exist" and "is not yours" should be the
same answer to somebody who should not know the difference. It queries
`exchange.purchase_orders`, `exchange.sales_orders` and `orders.orders`, so it
answers the same way whichever `ORDERS_SOURCE` is serving.

`features/purchase-orders/ownership.test.js` demonstrated the hole and now
demonstrates the fix, including that the owner and an admin are still allowed -
otherwise it would have been secured by being broken.

**Worth your attention because it is deployed.** Nothing here suggests it has
been exploited - it would need somebody to have another customer's order id -
but it is the one finding in this whole migration that is live rather than
latent.

### RESOLVED: a new address came back to the browser with no name

Found by `features/addresses/replay.test.js` on its first run, which is what an
HTTP-level test is for: no repo test could see it, because the repo returned the
right row and the damage happened in middleware afterwards.

`create`, `update` and `setDefault` ended in `RETURNING *` - `exchange`'s flat
row - while every read returned the nested shape. So the wire adapter, whose job
is flattening the nested shape down for the frontend, ran `flatten()` on
something already flat, found no `user_address` to lift from, and set `name` and
`is_default` to NULL.

The address went into the database correctly. It came back nameless. And the
frontend inserts the create response at the top of its list optimistically
(`listInsertPosition: 'start'`), so a customer saw their new address appear
blank and then fix itself on the next refetch.

Every function in `repo.exchange.js` now returns the same shape, reads and
writes alike. That is not tidiness - the adapter's contract is "I convert the
internal shape down", and a function returning something else silently breaks
it.

**The other three reshaping adapters were checked and are clean.** `carriers`
already returns `RETURNING ${FIELDS}` - the same nested projection its reads
use. `refiners` is read-only. `payments` has no write that returns a row over
the wire. The renaming adapters - products, media, spots - cannot hit this at
all, because a rename passes unmatched keys through rather than nulling them.

So the bug was unique to addresses, but the *class* is not, and it is the thing
to look for first whenever a feature gains a reshaping adapter: does every
function in the repo return the shape the adapter expects, writes included.

### IN PROGRESS: the orders collapse

The last and biggest piece. `features/orders` now exists with the half that
could be pinned down exactly, and nothing calls it yet - the legacy path in
`features/purchase-orders/service.js` is untouched and still serves traffic.

**What is done.** `features/orders/intake.js` takes the block the frontend posts
and turns it into a description of what the customer asked for, in the new
schema's vocabulary. It is pure: it resolves nothing, reads nothing and writes
nothing, so all fifteen tests run without a database and every mapping that
would fail quietly is pinned. Four of them were proved by breaking the code -
swapping shipper and recipient, `||` instead of `??` on the premium, allowing an
unknown handoff through, dropping the carrier pickup's date - each failing
exactly one test.

The mappings that matter, and why they are where they are:

- The handoff names map to the same fulfillment methods
  `052_backfill_fulfillments.sql` used, which were verified against all 70
  production shipments. If the two drift, an order placed today and an order
  migrated from January stop being comparable.
- The customer is the **shipper** on a purchase and the **recipient** on a sale.
  Getting this backwards prints a label sending the parcel to the person who
  already has the metal.
- A default premium of `0.75`, because that is what `insertItems` has always
  written for a line without one. It is not a placeholder - changing it reprices
  every order placed through the new path.
- An unrecognised handoff is **refused**, not defaulted. Filing an option the
  frontend grew as a dropoff records a choice the customer never made.
- The payout is carried through untouched rather than reshaped, because it holds
  a routing number and an account number and where those live is still open (see
  the bank details entry below). Moving them inside a refactor would bury that
  decision.

**Also done: resolving and recording.** `features/orders/intake.repo.js` turns
the names into ids and writes them onto the checkout. Thirteen more tests, four
guards proved by breaking them.

Two facts about the reference data that this had to be built around, both
checked rather than assumed:

- **`shipping.packages` has three labels that exist twice** - Small, Medium and
  Large Box, once for FedEx and once for UPS. Resolving on the label alone
  returns whichever row Postgres hands back first, which is a coin toss that
  looks like it worked. The carrier is part of the lookup.
- **No schema records which carrier service enum was used.**
  `shipping.services.code` and `.provider_code` are NULL on every row in dev and
  in production, and so are `exchange.carrier_services`'. The frontend names a
  service three ways - `serviceType` (`FEDEX_EXPRESS_SAVER`),
  `serviceDescription` (`Express Saver`) and `code` (`FDXE`) - and only the
  description matches anything stored. So resolution depends on a display string
  matching exactly, and **renaming a service in the admin table silently stops
  new orders resolving it.** Storing the provider code would fix it; that is a
  schema change rather than a migration one, and it is yours to call.

**The checkout is the cart**, which turned out to be the useful realisation.
`checkout.checkouts` is UNIQUE on (user_id, direction) and `features/checkout`
already writes one per user per direction as the cart syncs. Placing an order
does not create a checkout - it completes the one that is already there, filling
in the columns the cart never touches. Those columns have been empty since
January; this is the first code that writes any of them.

The submitted items replace whatever the cart held, deliberately: a second tab,
a stale page or a failed sync would otherwise place an order for a different set
of lines than the one on screen.

**Also done: the order itself.** `features/orders/create.js` turns a completed
checkout into an order, its items, its address snapshot, its frozen spots and
its fulfillment - one transaction, everything threading an executor. Ten more
tests, three guards proved by breaking them. The whole chain now runs end to
end: block -> decomposed -> resolved -> recorded -> order.

Three things worth knowing about it:

- **The order number comes from `exchange`'s sequence, and has to.**
  `orders.orders.number` has a `UNIQUE (direction, number)` and **no default** -
  the sequences live in `exchange` and the new schema was never given its own.
  While `exchange` is authoritative the two share one numbering space, so
  drawing from its sequence is what keeps them in step; an independent counter
  would hand out numbers `exchange` then hands out again. `nextval` advances a
  sequence and writes no row, so this is not a destructive write.
  **At promotion this has to change**: the new schema needs its own sequence,
  seeded from `max(number) + 1` per direction. That is a migration to write when
  `ORDERS_SOURCE` moves - seeding it now would fix a starting point that keeps
  moving. Noted in PROMOTION.md.
- **The address is copied, not referenced.** `orders.addresses` holds a snapshot
  plus a pointer back to the book row, the same shape
  `031_backfill_orders.sql` produced - so editing an address afterwards cannot
  rewrite where a parcel was sent, and a migrated order and a new one are
  indistinguishable. Asserted by editing the book row and checking the order's
  copy did not move.
- **An item whose metal will not resolve fails the order.** `orders.items
  .metal_id` is NOT NULL, and an order silently missing a line is worse than an
  order that failed to be placed: the customer's metal arrives and nothing
  recorded that it was coming.

Spots are frozen per metal the order actually contains, which is a deliberate
difference from `exchange`: `order_metals` writes a row for all four metals
whether or not the order has any, and a spot for a metal nobody sold means
nothing.

**What is left**, roughly in order:

1. Comparing the two paths on the same input - the same gate `diff` gives every
   other feature. This is where the payout goes too: the new path does not write
   one yet, because where a routing number lives is still open.
2. Collapsing the two read features into one `features/orders`, which is 4,600
   lines and wants doing after the write path is proven, not before.

**A constraint worth knowing before touching this.** Order creation now calls
FedEx *before* the transaction (see the entry below), so any test that exercises
the real creation path creates a real, billable label. Whatever proves the two
paths agree has to stub the provider.

### FOR JACOB: a FedEx label could be created for an order that then vanished

Found while starting the orders collapse, by reading `createPurchaseOrder`
rather than by a check firing - and the check that exists to catch exactly this
was reporting the codebase clean.

`shippingOps.createLabel` was called **inside** the transaction that creates a
purchase order, at two sites, and `shippingOps.createPickup` at a third. Any
failure after them rolled the order back while FedEx kept the label and the
courier booking. Two more sites did the same for cancelling.

The pickup path made it concrete rather than theoretical. `pickupRepo.create`
named a `shipment_id` column `exchange.carrier_pickups` has never had, so it
threw on **every** call until it was fixed in August 2026 - which means choosing
"Carrier Pickup" on a purchase order reliably produced: a label generated, and
then no order at all. `exchange.carrier_pickups` holds zero rows in production,
which is the evidence.

**Correcting something written earlier in this migration.** The comment at the
top of `features/shipping/pickups/repo.exchange.js` said the rollback left "a
pickup scheduled that nothing recorded". That overstates it: `createPickup` in
the handler called `provider.schedulePickup`, which `fedex.js` has never
exported, so it threw before any request reached FedEx. No courier was ever
orphaned. **The label was**, and that is the part that was real.

**Why the guard missed it.** `transaction-side-effects.test.js` matched
`provider.x(` and `fedex*.x(` by name. The calls are spelled
`shippingOps.createLabel(` - the same FedEx request through an intermediate
module - so the check passed. It now resolves *modules*: any namespace imported
from `#providers/*`, the shipping operations handler, or the email service is
external whatever the local binding is called. Proved by restoring the buggy
file: the new check reports 5 sites, the old one reports 0.

Read-only operations are exempted by name (`getTracking`, `getRates`,
`validateAddress`, ...), because rolling back after asking FedEx a question
leaves nothing behind. Holding a transaction open across a network call is still
not free - the row locks are held for as long as the carrier takes - but that is
a performance question and folding it into this rule would make the list a place
to argue rather than a place to check.

**How it is fixed, and what stayed the same.** Cancels are idempotent, so they
simply moved outside the transaction: a retry cancels an already-cancelled
label. Creates are not, so `createPurchaseOrder` and `cancelOrder` now create
the label (and the courier) **before** the transaction and undo it if the
transaction fails - the saga shape, with cancelling as the compensating action.

That ordering was chosen deliberately over the other one. "Commit the order,
then create the label" would mean a label failure leaves an order the customer
was told had failed, and their retry makes a second one. This way a label
failure is still "nothing happened", which is exactly what happens today.

If the compensating cancel itself fails there is genuinely an orphaned label,
and it is logged as `ORPHANED SHIPPING LABEL <tracking>` rather than thrown -
the original error is the one that explains what went wrong. **Worth grepping
the Railway logs for that string after this deploys.**

### FOR JACOB: production has no record of $126.48 it was paid

One finding with two faces, both from splitting payments rather than from
looking for it. **Nothing is lost and nobody was double-charged** - Stripe has
the money and Stripe's records are correct. What is wrong is that production's
own records do not say so.

`exchange.payment_intents` is updated by the Stripe webhook, and the webhook is
not reliably landing. Three intents show it:

| intent | Stripe | `exchange.payment_status` | `exchange.amount_received` |
|---|---|---|---|
| `pi_3RvkIT…` | Paid $51.78 | `requires_payment_method` | `0` |
| `pi_3RcYBY…` | Paid $64.70 | `requires_payment_method` | `null` |
| `pi_3TuK5t…` | Paid $10.00 | `requires_payment_method` | `null` |

$126.48 across 3 of the 8 settled charges. A fourth, `pi_3SfQTS…` at $255.17,
is recorded correctly - so the webhook works sometimes, which points at delivery
or at a handler failing quietly rather than at the code never having worked.

**The consequence a customer sees.** `retrievePaymentIntent` decides an intent
is reusable from `payment_status`, so all three are offered back to resume a
checkout. Stripe refuses to confirm an intent that has already succeeded, so the
customer gets a checkout that fails at the last step for no visible reason.
Annoying, not expensive - worth knowing which before anyone panics.

Two more charges - $114.80 and $0.50 - have **no row in
`exchange.payment_intents` at all**, so they were never recorded rather than
recorded wrongly.

**The new schema does not have this problem.** 074 derives status and
settlements from the Stripe export rather than from whatever the webhook last
managed to write, so all three are excluded from reuse and all three have a
settlement. Both differences are asserted as tests - "a paid intent is never
offered for reuse" and "the new schema knows about money exchange has no record
of" - rather than hidden in a `diff` ignore, because they are the migration
being right and not the two implementations disagreeing by accident.

**What to check when you are up**: the Stripe dashboard's webhook delivery log.
Either the deliveries are failing, or they are arriving and the handler is
throwing after the response. `pnpm --filter @dorado/api audit:payments` now
prints this list, so it is checkable rather than remembered.

**Correction, 26 August: there is a third possibility, and the delivery log
cannot show it.** The handler can run, write nothing, and answer 200.
`repo.exchange.updatePaymentIntent` is an `UPDATE ... WHERE payment_intent_id =
$6` with no upsert and, until now, no `rowCount` check, and every branch of
`features/payments/controller.js` ends at `res.json({received:true})` whether a
row matched or not. From Stripe's side that is a delivery that succeeded. So the
question above cannot be settled from the dashboard alone - if this is the
cause, the log shows green.

That is not a guess about the three missing intents; it is now measured.
`features/payments/webhook-updates.test.js` asserts the no-op, and
`repo.exchange.js` logs when an update matches nothing, which is what makes it
visible from our side. `audit:payments` counts **twenty** intents in the Stripe
export with no row in `exchange` at all - exactly the population this happens to.

**And the five `charge.*` handlers had never updated anything.**
`charge.failed`, `charge.updated`, `charge.captured`, `charge.pending` and
`charge.succeeded` each passed `event.data.object` - a **charge** - to a
statement keyed on `payment_intent_id`. A charge's id is `ch_...`, so it matched
no row, for every charge event the application has ever received. Three of them
also lacked a `break`, so `charge.pending` ran the same no-op twice.

They are now an explicit, commented no-op rather than an accidental one, because
**the obvious repair is wrong**: keying on `charge.payment_intent` would run a
statement that reads `amount_received` and `amount_capturable` off an object
that has neither, writing NULL over a settled amount. Recording a charge needs a
statement written for a charge - which is what `payments.settlements` is for,
and a schema question rather than a one-line fix.

**Two decisions this raises are Jacob's, not mine** (D24, D25 in the decision
log): whether a webhook that matches no row should answer 500 so Stripe retries,
and whether the statement should upsert so an intent opened outside
`createPaymentIntent` gets a row at all. Both change how a money path behaves
under failure. Neither was made here.

### RESOLVED: three production intents can be handed back for reuse after being paid

Superseded by the entry above, which is the same finding with the money side
measured. Kept only so the trail is legible.

Found by splitting payments, not by looking for it.

`retrievePaymentIntent` hands back an unresolved Stripe intent so a customer can
resume a checkout. It decides "unresolved" from `exchange.payment_intents
.payment_status`, which is only as fresh as the last webhook that was processed —
and that column is demonstrably stale: `exchange` records **1 of 25** production
intents as succeeded while Stripe shows **8** that took money.

Three of them are reusable by that filter *and already paid*:

| intent | `exchange` says | Stripe says | amount |
|---|---|---|---|
| `pi_3RvkIT…` | `requires_payment_method` | Paid | $51.78 |
| `pi_3RcYBY…` | `requires_payment_method` | Paid | $64.70 |
| `pi_3TuK5t…` | `requires_payment_method` | Paid | $10.00 |

**The customer is not double-charged** — Stripe rejects confirming an intent that
has already succeeded — so the symptom is a checkout that fails at the last step
for no visible reason, not lost money. Worth knowing which it is before anyone
panics.

The new schema does not have this problem: 074 derives status from Stripe, so
those three are excluded from reuse. That difference is asserted as a test rather
than hidden in a `diff` ignore — "a paid intent is never offered for reuse" —
because it is the migration doing something better, not the two implementations
disagreeing by accident.

Fixing it on `exchange` is a separate question and yours: either the webhook
that sets `payment_status` is not firing, or it is firing and failing quietly.
Worth checking the Stripe dashboard's webhook delivery log before assuming the
code is wrong.

### RESOLVED: refiner spots are migrated

`exchange.refiner_metals` (276 production rows) was the last thing on a purchase
order for which `exchange` was the only copy, and it was never blocked — it was
simply undone. 070 derives `refiners.spots` from it by the same transformation
that turned `order_metals` into `orders.spots`:

| `exchange.refiner_metals` | `refiners.spots` |
|---|---|
| `purchase_order_id` / `sales_order_id` | `order_id` |
| `type` | `metal_id` |
| `ask_spot` / `bid_spot` | `ask` / `bid` |
| `percent_change`, `dollar_change` | dropped — null on every row, nothing writes them |

Two columns have no source in `exchange` and stay null: `refiner_id`, which was
never recorded (same fact already settled for `orders.orders.refinery_id`), and
`pool_oz_deducted`, which lives on the order. Both are excluded from the backfill
comparison for that reason, and `refiner_id` had to have its `NOT NULL` relaxed
first — the same step 064 took for `refiners.items`.

Production's 232 `refiners.spots` rows share **zero** ids with
`exchange.refiner_metals`: January residue, removed by rule 062 before the
derivation runs.

All four writes are mirrored now rather than passing through to `exchange` —
`updateRefinerMetals`, `updateRefinerSpot`, `insertRefinerMetals` — and
`findRefinerMetalsByOrderId` reads the new schema like every other read on
`dual`. The mirror keys on the source id rather than on `(order, metal)`,
because `refiners.spots` keeps it where `orders.spots` generates its own.

`diff` is 56 operations, up from 55, with the refiner read compared including
its id. Four tests, both failure modes proved: dropping the mirror from the
write fails one, and having the mirror null a `refiner_id` it cannot derive
fails another.

### READY TO EXECUTE, AFTER PROMOTION: drop orders.items.price

Jacob wants this column gone, and it can go — the algebra works. It is deferred
only on ordering, not on doubt, and the proof is already done.

**The recovery.** `exchange.scrap.content` is `numeric(20,3)` and a line's price
was computed from the content *before* it was rounded, so the price still
carries the precision the content lost:

```
content = price / (bid_spot × premium)
```

Verified against production: of **74** scrap lines with both a price and a
locked spot, **all 74** recover a content that rounds back to exactly what
`exchange` stored, and **all 74** reproduce the price to the cent from the
recovered value. Nothing was ever repriced after the fact. The migration guards
on that round-trip, so a line only takes the recovered value if it reproduces
what `exchange` holds.

**Why it waits.** Recovering the content makes `repo.next` return a more precise
value than `repo.exchange` — which turns `diff` red on `purchase-orders.getAll`
and `findAllByUser`. Confirmed by applying it: 55 operations identical became 53.
Dropping `price` adds a second divergence, on the lines where `exchange` has
deliberately cleared it.

So doing this now means **weakening the check that gates promotion, on money
fields, immediately before promotion.** After promotion there is only one
implementation, `diff` has nothing to compare, and the same change costs nothing
and breaks nothing. Same destination, better order.

**What to do, when the time comes:**

1. `UPDATE orders.items SET content = poi.price / (sp.bid * i.premium)` guarded
   on `round(recovered, 3) = round(content, 3)`, spot from `orders.spots`
   (the *locked* spot — `exchange.order_metals` — not a live quote).
2. `ALTER TABLE orders.items DROP COLUMN price`.
3. `repo.next` derives it: `i.content * sp.bid * i.premium`, joining
   `orders.spots` on `(order_id, metal_id)`.

**One thing that genuinely goes.** `price` is null on 12 dev lines and 6
production lines, and null means "this quote has been invalidated" —
`clearItemPrices` sets it in `reissueOffer`.

> **And `reissueOffer` never asks what state the order is in — 26 August.**
> `send_offer` NULLs every item price and the order total before writing the new
> offer window. That is deliberate for a re-offer, and the code says so. What it
> does not do is check whether the offer has already been **accepted**.
>
> So `POST /api/purchase_orders/send_offer` on an accepted order erases the
> agreed figures — `purchase_order_items.price` and `purchase_orders.total_price`
> both become NULL, with no way back to them. On a Completed order it erases the
> record of what was paid. It is `requireAdmin`, so this is an admin on the
> wrong drawer rather than anything a customer can reach.
>
> **Measured** in `features/purchase-orders/send-offer-state.test.js`, which
> drives it on an accepted order and reads the rows back, and drives the normal
> transition too so the route's actual purpose stays asserted.
>
> **It has not happened in production.** All six production orders with no
> total are Cancelled (four) or In Transit (two), every one with
> `offer_status = 'Pending'` — orders that never had an offer accepted, which is
> exactly what a null total should mean. Checked read-only before writing this
> up, because "could erase" and "has erased" are different claims and only one
> of them is true here.
>
> Whether it should refuse on an accepted or completed order is **D27**. Deriving cannot reproduce that,
because the locked spot deliberately stays frozen (Jacob: unfreezing is an admin
action, never automatic). Two production lines would show a withdrawn quote.
Jacob has decided that does not matter, twice, and it is his call — recorded
here so the behaviour change is not a surprise later.

The offer workflow itself is a separate question. Jacob is happy to drop it
entirely; the scope is 5 endpoints, 7 service functions, the `expireStaleOffers`
cron job, 18 frontend files, and 61 of 61 production purchase orders carrying an
offer status with 5 currently Pending. Worth doing as its own piece of work, not
folded into a schema migration.

### RESOLVED: auctions is retired; carts become checkout

Jacob, 2026-08-23: "Carts is fine to remove as well, simply because we don't
care enough about it. It's not data that we NEED to keep. Auctions are going
away, fine to just delete the table/feature in this migration." Then, correcting
my reading: "Carts are going to become checkout in the migration."

**Auctions: done.** 067 drops the `auctions` schema. Both its tables were empty
in dev and production, nothing referenced them from outside the schema, and
there is no auctions feature in the API at all — no routes, no service, no repo.
The only mention anywhere in the codebase was a generated column type in
contracts, which regenerates.

**`exchange.auctions` and `exchange.auction_items` are deliberately left
alone** — one draft auction and two items in production. Dropping tables from
`exchange` is the one irreversible step in this project, the `pg_dump` is the
sole copy, and three rows cost nothing to keep. Removing them from `exchange` is
a separate dated decision, best taken after promotion alongside the plaintext
bank columns. They are declared in `audit-coverage`'s `NOT_A_FEATURE` so the
report stays honest rather than silent.

**Carts: not removed — migrated, and now split.** The tables and the feature
stay, because `features/carts` was live: the frontend syncs the cart on sign-in
(`frontend/features/auth/queries.ts:43`). "Not data we NEED to keep" applies to
the *rows*, which are transient and deliberately not backfilled.

It is `features/checkout` now, behind `CHECKOUT_SOURCE`. The route stays
`/api/cart` — the frontend calls it, and renaming a module is not a reason to
change the API.

Two shape differences drove the design:

- **The two directions become one table.** `exchange` has `carts` and
  `sell_carts`, each `UNIQUE (user_id)`; `checkout.checkouts` has one row per
  `(user_id, direction)`, taking the same values `orders.orders` uses. 068 adds
  that index, or `ensureCart`'s upsert has no arbiter.
- **Scrap and bullion are one table.** `exchange` puts a piece of scrap in
  `exchange.scrap` and points a `sell_cart_item` at it; `checkout.items` carries
  the values inline and `bullion_id IS NULL` is what makes a line scrap — the
  same shape `orders.items` and `refiners.items` use. 069 adds the `content` and
  `unit` columns January left off, both populated on every production scrap row
  a sell cart references.

That second difference is why the repo interface had to change. `exchange` hands
out a scrap *id*; a dual write needs the *values*. So the boundary is
`replaceCart` / `replaceSellCart` — "make this cart equal this list" — and each
implementation does it in its own idiom. There is no shared id to mirror on, and
none is needed: nothing outside the feature refers to a cart by id.

`deleteOrphanScrap`, `scrapExists` and `insertScrapFromCartItem` have no
new-schema equivalent by design, and stay in `repo.exchange`.

**No diff entry.** The new schema is deliberately empty until `dual` writes
populate it, so comparing reads would compare four rows against none. The dual
tests cover equivalence instead, and both failure modes were proved: writing the
sell cart under the wrong direction fails two, and skipping the clear before a
replace fails one.

**A deadlock, found and fixed.** `repo.dual.test.js` and
`repo.exchange.test.js` took locks on `exchange.sell_cart_items` and
`exchange.scrap` in opposite orders — the exchange test deletes both wholesale
to prove the orphan sweep, the dual test inserts into them through the real sync
path — and `node --test` runs files in parallel. It passed in isolation and
deadlocked in the full run. Both now take a transaction-scoped advisory lock
before touching the sweep, released by the rollback. Confirmed with two
consecutive full runs.

### RESOLVED: the orders.items columns, and what happened to each

Jacob's call, 2026-08-23: rebuild. Done — `orders.items` is 15 columns, down
from 19.

Four moved to the refiner's line, which is what `refiners.items.order_item_id`
is for:

| was on `orders.items` | now |
|---|---|
| `refiner_premium` | `refiners.items.premium` |
| `purity_actual` | `refiners.items.purity` |
| `post_melt_actual` | `refiners.items.post_melt` |
| `content_actual` | `refiners.items.content` |

What was missing all along is that **no migration had ever written
`refiners.items`** — its rows were January's, and what they held was a copy of
the *quoted* values rather than what the refiner reported. So the four columns
genuinely had nowhere to go, which is exactly what `audit:coverage` kept saying.
064 rebuilds it from `exchange` as one row per purchase-order line holding the
assay; 066 states the same derivation as a backfill so a database built from
nothing gets it too; 065 drops the columns and adds the unique index on
`order_item_id` that the one-to-one join and the mirror's `ON CONFLICT` both
need — there was only a plain index, which would have thrown at runtime.

`refiner_id` is the one column `exchange` has never held. Preserved where a row
already carries one, null for anything derived, excluded from the backfill
comparison — the same decision already recorded for `orders.orders.refinery_id`.

Two of the six stay:

- **`price`** cannot be re-derived. Of 82 priced purchase lines in production, 62
  reproduce from `content × bid_spot × premium` and 20 do not — all 20 scrap,
  because `exchange.scrap.content` is `numeric(20,3)` *at source*. The precision
  was lost in `exchange` years ago and `price` is the only record of it.
- **`bid_premium`** stays because dropping it changes what the API returns. It is
  0.75 on 17 of 20 populated rows — the hardcoded default in
  `features/scrap/repo.js` — and on all four rows where it disagrees with
  `premium`. It does look vestigial, but the app maintains it on its own write
  path and collapsing it into `premium` changes four returned values. **Still
  open, and a product decision rather than a schema one.**

The wire shape is unchanged: `repo.next.js` projects all four back off the joined
refiner line, `diff` reports 55 operations identical, and `validate:wire` checks
both implementations against `PurchaseOrderWire`.

### RESOLVED: the test for the tracking bug committed the tracking bug

Recorded because the mistake is more instructive than the fix, and because dev
still carries the damage by Jacob's decision.

The first version of `features/shipping/operations/tracking.test.js` opened its
own `withTransaction` and asserted through that client. The service under test
opens its own transaction too, on its own connection from the pool — so its
writes went to a **different** transaction and committed, while mine rolled
back. It deleted the real FedEx history of five dev shipments (17, 14, 13, 12
and 12 events) and replaced each with the two fabricated events the test
supplies.

That is exactly the bug the file exists to prevent, committed by the test for
it, in the same session. It passed on the first run and failed on the second,
with `actual` and `expected` identical — the fixture had by then been overwritten
with the values the test writes, so `notDeepEqual(after, before)` had nothing
left to distinguish.

**`shared/testing/pinned-pool.js` is what this needed and it already existed.**
It replaces `pool.connect` and `pool.query` for the duration, so the service's
own `withTransaction` gets the same client and its BEGIN/COMMIT become
savepoints inside one outer transaction that is discarded. The file now uses it,
and carries a fourth test — "nothing this file did survived the transaction" —
which is the only one that notices if the pin ever stops working, because every
other assertion reads its own writes and passes either way.

Two assertions were also rewritten from coincidences into properties: the events
are compared **by identity** rather than by count, with the two fabricated
events given different locations so ordering is actually checked; and the
shipment is compared field by field rather than by `notDeepEqual` against a
fixture that could already hold those values.

**Production was never touched** — the test runs against `DATABASE_URL`, which
is dev, and a read confirmed zero contaminated rows in production. All 67 events
are still there.

**Not repaired, by Jacob's decision.** Production is intact and authoritative;
dev is not. Repairing would mean a `DELETE` against `exchange.tracking_events`
to remove the fabricated rows, which is not worth doing for a database whose
only role is fixtures. So five dev shipments carry two events each where they
used to carry twelve to seventeen, and any test needing a rich tracking fixture
should know that.

The escape check is measured against a baseline taken before the tests run
rather than against zero, for that reason. It is not a weakening — "this file
added nothing" is the property, and the absolute form only worked while the
table happened to be clean.

**And the class is now checked mechanically.** `pnpm --filter @dorado/api
audit:test-leaks` fingerprints every `exchange` table, runs the suite, and
compares. Nothing else could have caught this: every assertion in the offending
file passed, because a test reads its own writes whether or not they are
contained, and the only way to know is to look at the database from outside
afterwards.

It hashes **contents**, not row counts. A count would have caught the deleted
events — 17 became 2 — and would have missed the other half of the same bug,
which overwrote `shipping_status` and `estimated_delivery` in place. Each table
is reduced to an md5 over its rows ordered by their own text, so physical order
does not matter and any column of any row does.

**The guard on it was a denylist, and that was wrong.** The first version
refused when `DATABASE_URL` matched production and allowed everything else — so
the moment the databases are renamed to `prod` / `dev` / `test`, which is the
plan, it would have stopped recognising production and silently permitted a full
test run against it. It is an allowlist now: it names the databases it is safe
to run against and refuses anything else, including a name nobody has taught it
yet. Renaming a database now makes it fail loudly rather than quietly stop
protecting.

`--self-test` proves the detector can see a change without leaving one behind:
it updates a single row inside a transaction, checks the fingerprint moves,
rolls back, and checks it moves back. An UPDATE rather than an INSERT
deliberately, since the row count does not change and only the content hash can
notice. It also refuses to run at all if `DATABASE_URL` points at production —
it runs the test suite, and the two databases differ by one word in a URL.

The full suite currently leaves **nothing** behind: 39 tables, no change. So the
tracking test was the only leak.

### RESOLVED: a tracking refresh that recognised nothing deleted the shipment's history

The worst thing found so far, and it has already happened seven times in
production.

`getTracking` removed every tracking event for a shipment and re-inserted what
FedEx had just returned:

```js
await trackingRepo.removeEvents(shipment_id, client);   // unconditional DELETE
await trackingRepo.insertEvents(trackingInfo, shipment_id, client);
```

`insertEvents` returns 0 without inserting when there is nothing to insert. So a
response whose scan events are all of types `FEDEX_TRACKING_STATUS_MAP` does not
name — or which carries none at all — **deleted the shipment's whole tracking
history and put nothing back.** The update that follows then wrote
`parseTracking`'s own placeholders over the row: `"Status Unknown"` as the
status, which the `?? shipment.shipping_status` never caught because it is a
string rather than null; `null` for the estimate, via the `"TBD"` placeholder;
and `null` for `delivered_at`.

**Production, read-only:**

| status | shipments | with zero tracking events |
|---|---|---|
| Delivered | 42 | **3** |
| Label Created | 16 | 7 |
| Cancelled | 8 | 1 |
| **Status Unknown** | **4** | **4** |

`"Delivered"` and `"Status Unknown"` can only ever come from this function —
every other writer of `shipping_status` sets `"Label Created"` or `"Cancelled"`,
and `"Delivered"` is derived from a scan event. So the three delivered shipments
with zero events **had** events at the moment they were marked delivered, and
have none now. The four at `"Status Unknown"` are the downgrade itself.

FedEx still holds all of it, so nothing is unrecoverable — but this is a
`DELETE` against live rows firing on a routine refresh, which is the shape the
first rule in CLAUDE.md is about.

**A trap worth recording.** `parseTracking` reads
`data?.output?.completeTrackResults?.[0]?.trackResults?.[0]` with optional
chaining and then dereferences `trackingOutput.estimatedDeliveryTimeWindow`
**unguarded**, so an empty or error response throws. That looks like the obvious
next bug to fix, and fixing it first would have made this one worse: the throw
happens *before* `removeEvents`, inside the transaction, so it was the only
thing preventing the delete. Adding `?.` there without fixing the service would
have converted a loud, harmless 500 into a silent deletion. It is left throwing
deliberately, and now says so — a FedEx outage should be loud.

**Fixed** by returning early when the parse recognised nothing, before any
write. Two tests, and the first was checked against the real bug: removing the
guard made it fail on "an empty tracking response deleted the shipment's
history".

- a refresh that recognises nothing leaves the events, the status, the estimate
  and the delivery date exactly as they were;
- a refresh that *does* recognise something still replaces all of it — because a
  guard that refused every write would pass the first test, and because it is
  what proves the first test's assertions can see a change at all.

`getTracking` gained an optional `fetchTracking` seam, the same shape as
`sendEmail`'s transport and a repo's executor: a separate parameter, not a field
on an input object, because the controller passes data out of `req.body`.
Nothing in production passes one. It is what lets this be tested without calling
FedEx — `FEDEX_ENV=sandbox` is for a human smoke test, never a test dependency.

### RESOLVED: three throws in the refiner's copy of a sales order, all after the point of no return

Found by typing `features/emails/utils/renderEmail.js`, then by removing the fix
to check its test could fail.

`sendOrderToSupplier` attaches the supplier, creates the outbound shipment and
sets `order_sent` in one transaction, and sends the refiner their copy only
afterwards. That ordering is deliberate and already documented in the service:
the email used to be the first statement inside the transaction, so a later
failure rolled back the record and left a refiner shipping metal against an
order nothing recorded. The accepted worst case of the current ordering is *an
order marked sent whose email did not arrive.*

That is only acceptable while it is visible. Three separate TypeErrors made it
invisible — the order says it went, the refiner was never told, and the admin
sees a 500 with no indication that the record was already written.

**1. `addr.line_1` on an order with no address.** `SalesOrderWire` declares
`address: AddressOnOrder.nullable()` and production means it: **sales order 55
has `address_id` NULL, a supplier attached and `order_sent` true.** The invoice
PDF for that order does not read the address at all, so the document builds and
the render is what falls over.

**2. `s.ask_spot.toFixed(2)` on a spot with no ask.** Nullable on the wire.
Production's four metals all have one, and the spots come from the request body
rather than the database, so nothing guarantees it.

**3. `spots.find((s) => s.type === "Gold").ask_spot` in the sales order
invoice**, and the same for silver, platinum and palladium. The four metals are
named in the template; `spots` arrives in the request body; an omitted or
partial set throws. This one was found by deleting the fix for (1) to confirm
its test went red — it went red on this instead.

**Fixed three ways.**

- The service refuses an order with no address **before** the transaction, so
  the whole call is a no-op: no supplier attached, no shipment created,
  `order_sent` untouched, and an error naming the order and the reason.
- The renderer and the invoice render a dash for any value the wire calls
  nullable, rather than throwing or inventing one. `$0.00` against a line of
  gold is worse than a dash, because a refiner would believe it.
- `sendOrderToSupplier` now takes an optional `transport`, threaded to
  `sendSalesOrderToSupplier`, the same seam `sendEmail` already has. A separate
  parameter rather than a field on the input object, because the controller
  hands `req.body` straight in. Nothing in production passes one; it is what
  lets the guard be tested without mail leaving the building.

Every fix was checked against the real bug by restoring it and watching the test
fail with the exact TypeError, then pass again. The guard test also proves its
own assertions are not blind: a second test performs the three writes the
transaction would have performed and asserts the same helper reports all three,
so "nothing was written" cannot pass by being unable to see a write.

Left alone, deliberately: `item.quantity * item.price` on a supplier line still
multiplies two nullable numbers, showing $0.00 rather than crashing. Production
has no null price or quantity across its 14 sales order items, and changing what
it prints is a display decision rather than a fix for a throw.

### RESOLVED: the packing list drew a box with NaN for every coordinate

Found by giving `generateBoxSVG` parameter types, which is the whole argument
for converting these files.

`features/pdf/service.js` falls back to `{ length: "-", width: "-", height: "-" }`
when a request arrives without `packageDetails`. As printed text that is
correct — "Length: - in" is how you say you do not know. As arithmetic it is
not: every coordinate in the SVG is `dimension * scale`, so the whole drawing
came out `NaN`. The document carried `width="NaN"`, `height="NaN"`,
`viewBox="NaN NaN NaN NaN"` and 68 NaNs in total, on the packing list a customer
receives with their order.

Nothing threw, so nothing noticed — including four tests in
`features/pdf/service.test.js` that had been building packing lists without
`packageDetails` since the file was written.

**How reachable.** `packageDetails` comes from the request body of
`/emails/purchase_order_created`. The frontend always sends one — it falls back
to `packageOptions[0]` — so a normal order is fine. Anything that posts without
it is not.

**Fixed** by not drawing a box when there are no dimensions. The coercion is
`.map(Number)` and `.every(Number.isFinite)` rather than a `typeof` check, so
nothing that previously drew a box stops: `null` and `""` both multiplied to 0
before and still do. Only the NaN case changes, and it changes to no box.

Two tests, and the first was checked against the real bug — restoring the old
call made it fail on "the packing list contains NaN" and pass again when
reverted:

- a packing list with no package details draws no box, and one with dimensions
  still does, so the assertion cannot pass by never drawing a box at all;
- the sweep over every dev order now asserts no document contains `NaN`, across
  the packing list, the invoice and the return packing list — arithmetic on a
  missing field is not specific to the box. All 16 orders x 3 documents are
  clean.

### The comparison tooling fails loudly when its subject goes, and that is now tested

Asked because deleting `repo.exchange.js` is the end state of this migration,
and four checks exist only to compare it against `repo.next.js`. A check that
silently passes once it can no longer find what it compares is worse than no
check — the same failure I shipped in `audit:test-leaks`' first guard.

**Checked by removing the subject, not by reading.** `features/reviews/repo.exchange.js`
was moved aside and `pnpm --filter @dorado/api diff reviews` run:

```
ERR_MODULE_NOT_FOUND
url: 'file:///…/api/features/reviews/repo.exchange.js'
EXIT=1
```

Non-zero, and it names the exact file. `scripts/diff-source.mjs` resolves each
feature with a bare `await feature.exchange()` and has **no try/catch around the
dynamic import** — which is the right shape, and worth stating because the
instinct to wrap it would silently convert this into a pass. The file was
restored and the repo verified to load.

The other three fail loudly by construction, for a different reason: they read
`exchange` **tables** through SQL rather than importing repos, so they fail on a
missing relation. `validate:wire` was already fixed to fail on a feature
directory holding neither implementation.

So nothing here needs changing before the repos are deleted. What it needs is
deleting deliberately at that point, rather than being left to fail — a check
that fails for the right reason is still a broken build.

### PLANNED, NOT WRITTEN: drop the tables nothing will use, auctions included

Jacob's instruction, 2026-08-25: a later migration should remove unused tables,
and auctions belongs in that set. Recorded rather than written, because dropping
a table is the one change on this project that cannot be undone by deploying a
fix.

**What auctions actually is**, checked against production rather than assumed:

| table | rows |
|---|---|
| `exchange.auctions` | 1 |
| `exchange.auction_items` | 2 |
| `auctions.auctions` | 0 |
| `auctions.items` | 0 |

No live code references auctions anywhere — not a route, not a repo, not a
service. The new schema's copies are empty. This is consistent with the earlier
decision recorded here that auctions is retired and carts become checkout.

**Three rows is still three rows.** "Unused" is an argument for dropping it, not
evidence that nothing is lost. The dump is what makes it recoverable, and the
dump has to be taken *after* the last write anyone cares about.

**Preconditions, all of which must hold before this migration is written:**

1. Every feature promoted past `dual`, so nothing reads `exchange` any more. A
   table is only droppable once something has read the code that reads it, and
   while a `*_SOURCE` sits at `exchange` or `dual` that code is live.
2. A `pg_dump` taken after promotion — not the 2026-08-25 one, which predates
   all of it.
3. `lint:migrations` will refuse it without an explicit `-- allow-destructive:`
   marker saying why it is safe and which backup covers it. That is the
   mechanism; do not weaken it to let this through.
4. Each table checked for what references it, the same way `061b` enumerated
   foreign keys rather than discovering them one rollback at a time.

**Candidates beyond auctions** should be derived from `audit:coverage`, which
already reports every populated `exchange` table no feature claims, rather than
from memory. Two known traps: `order_metals.percent_change` and `scrap.gem_id`
are 100% NULL and still read and written by live code, so "empty" is not the
test — "unreferenced" is.

### FOR JACOB: the rehearsal says the migrations apply to production and leave it empty

The test database was restored from the production dump and all 85 migrations
run against it. **They apply. Exit 0, nothing pending — and nine of eleven table
pairs end up with zero rows.** The run reports success. Only `verify:parity`
notices, and on dev it is clean, so nothing would have flagged this before
production.

**The mechanism.** `000_genesis_schema.sql` declares `-- baseline: 002-049`,
which *records* those migrations as applied without running them. That is honest
for dev, which really did run them. It is false for production twice over:

- Production's domain schemas were built in the abandoned January 2026 refactor,
  so anything a baselined migration *changed* never happened there. That is what
  broke 058: migration 039 relaxes `orders.items.quantity`, the baseline skips
  it, and production's column is still `NOT NULL` against 13 null rows.
- Worse, anything a baselined migration *populated* never happened either.
  **`013_split_core_into_feature_schemas` is inside the range.** Production has
  `core` with 9 tables and no `leads`, `rates`, `reviews`, `media`, `products`,
  `metals`, `spots` or `organizations` schema at all. Genesis creates those
  empty; 013 would fill them from `core`; the baseline skips it; they stay
  empty.

| target | source rows | after migrating |
|---|---|---|
| `leads.leads` | 233 | **0** |
| `products.bullion` | 95 | **0** |
| `rates.rates` | 16 | **0** |
| `products.mints_exchange_compat` | 10 | **0** |
| `reviews.reviews` | 6 | **0** |
| `metals`, `media`, `refiners`, `carriers` compat | 21 | **0** |
| `payments.ledger` | 17 | 17 |
| `tax.sales_tax_rules` | 88 | 88 |

The two that survive are backfilled by migrations **past** the baseline. Every
empty one is backfilled by a migration inside it.

**What this means for promotion.** Applying these migrations to production as
they stand would produce a database whose per-feature schemas exist, contain
nothing, and are wired to `*_SOURCE` switches that cannot be promoted. Nothing
would error at any point.

**Not fixed here, because it is a decision about the chain rather than a bug in
a file.** Three shapes it could take:

1. **Narrow the baseline** to the schema-only migrations and let every backfill
   run. Correct in principle; needs each of 002–049 classified, and the ones
   that ALTER without `IF NOT EXISTS` will fail against genesis's finished
   schema, exactly as 060 did.
2. **Regenerate genesis against production's actual January state** and derive
   forward from there, so the baseline describes something true of both
   databases.
3. **Run the backfills separately** after migrating, which is what
   `verify:backfill` already does and what CLAUDE.md describes as the model —
   genesis for schema, backfills for data. The migrate runner is the piece that
   does not know this.

(3) is closest to how the project already thinks and probably the smallest
change: teach the runner that a baseline covers schema migrations only, or mark
the backfills so the baseline never records them.

**Five blockers were found and fixed on the way**, each of which would have
stopped a production migration partway with 50-odd already applied:

| migration | failure | fix |
|---|---|---|
| 058 | `quantity` NOT NULL, baseline skipped 039 | `057a` relax |
| 060 | genesis already created `ledger_amount_check` | `059a` conditional drop |
| 062 | January payment intents referenced deleted orders | `061a` |
| 062 | two more FKs 062 never knew about | `061b` |
| 078 | two intents with a method id and no type | `077a` relax |

`061b` came from enumerating every foreign key to `orders.orders` and counting
residue in each, rather than discovering them one rollback at a time. Two were
outstanding: `refiners.spots` (which the run hit) and
`fulfillments.fulfillments` with its three children (which would have been next).

**Also proven, and worth knowing before production night:** the runner refuses a
database it does not recognise until named explicitly; a failing migration rolls
back cleanly and leaves nothing half-built; and every fix has to sort *before*
the migration it unblocks, because the runner stops at the first failure.

### FOR JACOB: every database has a collation version mismatch, and production has 41 text indexes

Found when `CREATE DATABASE test` refused during the restore runbook. The error
names `template1`, which is a nuisance. What it points at is not.

```
recorded  actual  mismatched
prod             2.36    2.41    yes
dev              2.36    2.41    yes
postgres         2.36    2.41    yes
template1        2.36    2.41    yes
```

Railway patched the container's glibc from 2.36 to 2.41 underneath the running
databases. Collation defines string sort order, so **every index built under
2.36 is physically ordered by rules 2.41 no longer agrees with**. Production has
**41 indexes on text or varchar columns**.

The failure mode is not a crash. An index scan can silently miss rows that
exist, and a UNIQUE index can stop enforcing uniqueness — which on this schema
means a duplicate could already have been accepted where the constraint was
supposed to refuse it.

**The dump is not affected**, which is the important reassurance: `pg_dump`
reads table data with a sequential scan rather than through indexes, so it is
complete whatever state the indexes are in. And `pg_restore` builds every index
from scratch under the current glibc, so **`test` will have correct indexes even
if `prod` does not** — which is worth knowing, because it means a query that
behaves differently on the two is not necessarily a migration bug.

**The remedy, at 19 MB, is seconds:**

```sql
REINDEX DATABASE prod;
ALTER DATABASE prod REFRESH COLLATION VERSION;
```

Not run — it is a write to production. Worth doing after the dump is verified,
and worth doing before trusting any UNIQUE constraint the migration relies on.

`ALTER DATABASE template1 REFRESH COLLATION VERSION` is the one-line unblock for
`CREATE DATABASE`; template1 is empty so there is nothing to rebuild there.

**How long this has been true is unknown.** Nothing records when the image was
patched, and nothing would have reported it — the mismatch only surfaces when
something asks, which is why it took a `CREATE DATABASE` to find it.

### FOR JACOB: the card surcharge is set by a number the browser sends

Found while converting `features/sales-orders/utils/calculations.js` to
TypeScript — reading the callers to work out what an "item" actually is, which
meant reading the frontend's own copy of the same sum.

The server charges the surcharge from the `payment_method` string in the request
body. `calculateCardCharge` is the whole rule:

```js
if (payment_method === "ACH") return order_total * 0.005;
else                          return order_total * 0.029;
```

Two things follow from that, neither caused by the migration.

**1. CREDIT and WIRE are surcharged 2.9%, and the checkout calls them "No
Fee".** `paymentOptions` in `frontend/features/orders/salesOrders/types.ts` gives
CREDIT and WIRE `surcharge: 0` and the label "No Fee"; the server's `else`
branch charges them like a card. The only thing preventing it is client-side:
`paymentSelect.tsx` flips the method back to `CARD` when
`beginningFunds < baseTotal`, so a CREDIT order always covers itself and
`subject_to_charges_amount` lands on 0, where no surcharge is taken.

Production has never reached it. All 8 sales orders that applied funds were
covered in full — every one has `subject_to_charges_amount = 0` and
`charges_amount = 0`. A partially-funded CREDIT order would be the first, and
would be recorded with a fee the customer was shown as free.

**2. Nothing reconciles the declared method against the one actually used.** The
intent is created with `automatic_payment_methods: { enabled: true }`
(`providers/stripe/stripe.js`), so Stripe accepts whatever the customer picks in
the element. Declaring `ACH` and paying by card is surcharged at 0.5% and costs
Stripe's card rate — the business absorbs the 2.4%. Production has exactly one
collected sales order and it is a card paying the card rate, so this has not
happened, but nothing stops it.

**Not fixed, deliberately.** Both change what the server computes for money, and
this was a type conversion. Deciding them needs an answer from you: whether
CREDIT and WIRE should be free (the UI's claim), and whether the surcharge
should be derived from the confirmed Stripe payment method rather than the
request. The file now carries both, at the function they concern, so whoever
touches this sum next reads them first.

**Also observed, and not actionable.** Sales order 62 — production's only
collected sale — stores `charges_amount = 0` while its `order_total` of $255.17
includes $7.19 of surcharge, which Stripe did collect (intent `succeeded`,
25517 cents). Its total is also rounded to the cent where every other order
carries full float precision, so it was written by an older version of this code
in December 2025; only one insert path into `exchange.sales_orders` exists now
and it stores `orderPrices.charges_amount`. The money was collected correctly.
The business's own record of the fee it charged is what is wrong, on one order.

### Payments: half unblocked, and the ledger is wrong independent of any migration

The Stripe export landed 2026-08-22 and settled the question of where the truth
lives. It is not `exchange.payment_intents`.

`pnpm --filter @dorado/api audit:payments` compares production's intents against
Stripe. **Seven of the eight settled payments are not recorded as succeeded:**

| intent | Stripe | database |
|---|---|---|
| pi_3SfQTS… | Paid $255.17 | `succeeded` |
| pi_3TuK5t… | Paid $10.00 | `requires_payment_method` |
| pi_3RvkIT… | Paid $51.78 | `requires_payment_method` |
| pi_3RcYBY… | Paid $64.70 | `requires_payment_method` |
| pi_3RgCh9… | Refunded $1248.37 | no row |
| pi_3RcYBR… | Refunded $434.00 | no row |
| pi_3RcVdp… | Paid $114.80 | no row |
| pi_3RcV9l… | Paid $0.50 | no row |

$2,179.32 charged and $1,682.37 refunded across those eight. The export holds 45
intents; 20 of them have no row in `exchange` at all. Only 2 of production's 25
intents link to an order, and none to a purchase order.

**This is the current system being wrong, not the migration.** It went unnoticed
because the order lifecycle never consults this table — orders complete
regardless — but it means the application cannot answer "was this order paid
for" from its own data. Worth fixing on its own merits.

**What was built.** `payments.stripe_charges` (migration 054), seeded by 055
from the export via `scripts/dump-stripe-reconciliation.mjs`. The reconciliation
arrives as its own table rather than as a correction applied to `exchange`,
because correcting `exchange` would mean an `UPDATE` against the one schema that
must stay untouched, and because a visible disagreement can be audited where a
silent fix cannot. Reversible: `DROP TABLE payments.stripe_charges` loses
nothing that is not in the Stripe dashboard.

It deliberately holds no personal data — no cardholder name, billing address or
card last4 — so the reconciliation is reproducible from the repo without the
export's personal data entering git. The CSVs themselves are gitignored.

Timestamps are emitted as `::timestamp AT TIME ZONE 'UTC'` rather than cast
straight to `timestamptz`, which would have read them in whatever timezone the
person applying the migration happened to have. Verified by reading the same row
from three session timezones.

**Who the seven belong to.** `audit:payments` now walks each settled charge back
to a user through `exchange.users.stripeCustomerId`, and from there to their
sales orders. Six of the eight resolve to a user; three tie to a specific order:

| charge | amount | user | order |
|---|---|---|---|
| pi_3SfQTS… | $255.17 | `0c1dbd9f…` | #62 — exact |
| pi_3RcYBY… | $64.70 | `3a4fffbb…` | #55 — exact |
| pi_3RgCh9… | $1248.37 refunded | `148b2cc0…` | #58 ($1248.58) — within 1%, wants confirming |
| pi_3RvkIT… | $51.78 | `289f6d31…` | their only order is #61 at $3534.53 — not a match |
| pi_3TuK5t… | $10.00 | `422b1c08…` | no sales orders at all |
| pi_3RcYBR… | $434.00 refunded | `3ad23094…` | no sales orders at all |
| pi_3RcVdp… | $114.80 | — | no exchange user carries `cus_SXaL4qR7SGg8OD` |
| pi_3RcV9l… | $0.50 | — | no exchange user carries `cus_SXaKVDtOlduH4J` |

The last two are the two earliest charges on the account, both 21 June 2025, and
per the export they belong to the same person as the `jaketjohnson97` customer —
i.e. Jacob's own, almost certainly setting the integration up. They are the
least interesting of the eight.

The one worth a look is **pi_3RvkIT… at $51.78**, an ACH payment whose user's
only order is $3534.53. Either a partial payment, or a charge against something
the orders table does not describe.

Amount matching is tiered deliberately: within a cent is a match, within one
percent is reported as likely and flagged for a human, and anything beyond that
is not claimed. A flat one-cent tolerance would have missed order #58, and a
loose one would have claimed #61.

**What is still not done.** Deriving `payments.intents` / `.attempts` /
`.settlements` from `exchange` joined to this table. That means designing the
transformation and replacing the 70 placeholder rows production already holds,
which is a decision about money rather than a mechanical step. `payments.details`
stays untouched until the encryption question is answered — see below.

### BLOCKED: payments is a different model, not a reshaped one

Audited. The new payments schema is not a copy of exchange with the columns
rearranged - it is a different design, populated in January with data that does
not correspond to what exchange holds.

- **No id is shared.** None of payments.details, .methods, .intents, .attempts
  or .settlements shares a single id with exchange.payouts or
  exchange.payment_intents.
- **The granularity differs.** exchange.payment_intents holds 21 rows across 8
  distinct orders - several Stripe attempts per order. payments.intents holds
  28, roughly one per order, with attempts and settlements hanging off them
  one to one. Only 2 of the 28 attempts carry a provider_ref matching a real
  Stripe payment_intent_id.
- So the 28 rows are not a reference to copy from. Migrating means designing
  the transformation from scratch - 21 Stripe intents across 8 orders becoming
  intents, attempts and settlements - and then *replacing* what is there, which
  means deleting rows in the new schema. That is a decision, not a mechanical
  step.

The model itself looks better than exchange's: separating what was intended,
what was attempted and what settled is the right shape for payment data. But
the mapping is a design question about money, and the existing rows would have
to go.

payments.methods (10 rows) is seed data with no exchange source, and belongs
with the seed migration below.

### 35 populated columns still have no home, and they are now known in advance

`pnpm --filter @dorado/api audit:coverage` reports, for every source table,
which populated columns have no destination in the schema it maps onto. It was
written because orders turned out to be missing twenty-one columns of live data,
found one repo function at a time, after the row counts had matched and the
shapes looked plausible.

The eleven migrated features are clean. What remains, to be fixed *before* each
feature's repo is split rather than during it:

- **shipping — 13 columns.** `exchange.shipments` has essentially nothing mapped:
  shipping_status, service_type, type, carrier_id, package, pickup_type,
  net_charge, shipping_label, estimated_delivery, created_at and both order id
  columns, all populated. Plus `tracking_events.scan_time`, 72 of 72. The
  shipping tables are the emptiest sketch of the lot.
- **payments — 18 columns.** `payment_intents` is almost entirely unmapped
  (payment_intent_id, payment_status, type, user_id, amounts, and the card and
  bank descriptors), and `payouts` is missing order_id, method,
  account_holder_name and cost.
- **refiners — 4 columns**, the same four added to orders.spots by 035:
  scrap_percentage, bullion_percentage, created_at, updated_at. Migration 035
  already added them to `refiners.spots`; they are listed here because the
  refiners feature has not been backfilled yet, so its table is still empty.

The audit only proves a mapping *exists*, not that it is right. It is a floor.

### When addresses is promoted, orders should return the snapshot id

The order reads return `orders.addresses.source_address_id` - the address-book
row an order was placed against - rather than the snapshot's id, because the
frontend posts it back at checkout and `getAddressFromId` resolved it against
`exchange.addresses`. Tests in both order features pin that.

Under `ADDRESSES_SOURCE=dual` that still works, and not by luck: the address
book kept its exchange ids, so the same id resolves in `places.addresses`. But
once addresses is promoted, the better answer is for the order to return the
*snapshot* id. The snapshot is the address that order was actually sent to,
frozen at the time; the address-book row is whatever the customer has edited it
into since.

Deliberately not done in the same change as the addresses split - it alters
what two order reads return, and those have their own tests. Do it as its own
commit, with the order diffs re-run.

### The order address id is the address-book id, not the snapshot's

`orders.addresses` points at a snapshot in `places.addresses` and also records
`source_address_id`, the address-book row it was copied from. The order read
returns the source id, because the frontend posts `address.id` back at checkout
and the API resolves it with `addressService.getAddressFromId`, which reads
`exchange.addresses`. A snapshot id does not resolve there.

That is right for now and wrong eventually. Once the addresses feature moves and
`getAddressFromId` reads `places.addresses`, the snapshot id should become the
one returned - it is the address the order was actually placed against, frozen.
Revisit when places is migrated; there is a test pinning the current behaviour.

### shipping_service now exists twice, and may want to exist once

`orders.transactions.shipping_service` was added by 041 because the sales order
read returns it and the wire shape may not change. It sits beside the shipping
cost, which is where exchange kept it.

`shipping.shipments.service_type` holds what looks like the same thing. Whether
they are one field is still open and still tangled up with the
`shipping.services` question below - `exchange.shipments.service_type` contains
values `carrier_services` does not.

If the shipping migration concludes they are the same, this is the column to
drop. That was the deliberate choice: dropping a duplicate later is a much
easier conversation than recovering a column that was never carried across.

### BLOCKED: fulfillments is blocked behind shipping, exactly

A fulfillment is derived from a shipment, and the dependency is one-to-one:

- all 17 orders that have a fulfillment have a shipment in `exchange`
- the 6 orders that have a shipment but *no* fulfillment are precisely the 6
  whose shipments were never copied into `shipping.shipments`
- all 16 `fulfillments.shipments` links resolve, because they can only point at
  shipments that were copied

So the missing fulfillments are not a separate gap; they are the shipping gap
seen from the other side, and they close when shipping does.

The method mapping is clean and worth recording: `exchange.shipments.pickup_type`
'Store Dropoff' becomes CARRIER DROPOFF, 'DropShip' becomes DROPSHIP.

One row needs its own look: there are 17 fulfillments and 16 shipment links, and
the odd one has method APPOINTMENT — but `fulfillments.directs` and
`fulfillments.pickups` are both empty, so nothing backs it.

### BLOCKED: auth cannot be dual-written, because better-auth owns the writes

`features/auth/client.js` configures better-auth with
`modelName: 'exchange.users'`, `'exchange.session'`, `'exchange.account'` and
`'exchange.verification'`, and better-auth writes those tables through its own
pool - not through `#db`, not through the shared executor, not through any repo.

So there is no dual-write to build. Migrating auth means changing those four
`modelName` values, which is an atomic cutover of live authentication with no
reversible middle state. Everything else in this migration goes through `dual`
precisely to avoid that shape of change; auth cannot.

Worth noting separately: better-auth's pool bypasses the NUMERIC and INT8 type
parsers registered in `api/db.js`, so anything it reads comes back with
different types than the rest of the codebase would give.

`auth.users` is already backfilled by 029 and `auth.employees` by the seed, so
the data is there whenever the cutover happens. The 2 sessions and 2 accounts
the new schema has that exchange does not belong to test users created directly
in January.

### BLOCKED: refiners needs the same answer as a purchase order's refiner

`refiners.spots` (124 rows) and `refiners.items` (40) both carry a NOT NULL
`refiner_id`, and every row in both points at Elemetal.
`exchange.refiner_metals` and `exchange.purchase_order_items` have no refiner
column at all, so there is nothing to derive it from - it is the same fact
someone knew in January that `orders.orders.refinery_id` needs, and the same
decision answers both.

Unlike the orders case, null is not an option here: the column is NOT NULL, so
a backfill must assert *some* refiner for every row.

The columns are otherwise fine - `audit:coverage refiners` is clean, since
migration 035 added the four it was missing. It is only the identity that is
unknown.

Moving refiners also means giving it its own feature folder: its five repo
functions currently live in `features/purchase-orders/`, which is exactly the
mixing that should not happen.

### A purchase order's refiner is not recorded in exchange

`orders.orders.refinery_id` is set on all sixteen purchase orders in dev, all to
Elemetal. `exchange.purchase_orders` has no supplier column, and
`exchange.refiner_metals` has none either, so there is nothing to derive it
from - it is a fact someone knew in January and wrote down.

The backfill leaves it null for purchases rather than asserting Elemetal of
every purchase order on production because it happened to be true of sixteen in
dev. Sales orders are fine: they carry `supplier_id` and it maps straight
across.

Needs a decision. If every purchase order really does go to one refiner, say so
and the backfill can set it; if not, it is only recoverable from whatever
records exist outside the database.

### reviews.user_id cannot be reconstructed

`exchange.reviews` records a name and no user reference. dev's `reviews.user_id`
was filled in January by matching that name, but exchange.users now holds two
accounts named Jacob Johnson and every review in dev is under that name, so the
match is ambiguous and the backfill leaves it null rather than guessing. If the
link matters, it needs a deliberate decision about which account is the
reviewer - it is not recoverable from the data.

### CRITICAL: genesis cannot build production, because production is half-built

`000_genesis_schema.sql` creates every table with `CREATE TABLE IF NOT EXISTS`
— 331 of them — and declares `-- baseline: 002-049`, which tells the runner to
stamp migrations 002 through 049 as applied rather than replay them.

That is correct for an empty database and correct for dev. It is wrong for
production, which is neither.

Production already holds nine of the sixteen schemas, built directly in January
and never migrated since: `auth, checkout, fulfillments, orders, payments,
places, refiners, shipping, tax`. Their tables are in January's shape. Measured
against dev, within those nine schemas alone:

- **50 columns absent**, all added by migrations 002–049
- **2 tables absent** — `refiners.exchange_compat`,
  `shipping.carriers_exchange_compat`

```
orders.transactions   13  waive_payout_fee, pool_remediation, used_funds,
                          pool_oz_deducted, shipping_service, updated_by_id, …
orders.items           6  price, content_actual, post_melt_actual,
                          purity_actual, bid_premium, refiner_premium
orders.orders          4  order_sent, tracking_updated, created_by_id, updated_by_id
orders.spots           4  bullion_percentage, scrap_percentage, created_at, updated_at
refiners.spots         4  bullion_percentage, scrap_percentage, created_at, updated_at
shipping.shipments     3  shipping_status, pickup_type, created_at
orders.offers          3  offer_sent_at, created_by_id, updated_by_id
shipping.services      2  created_by_id, updated_by_id
fulfillments.methods   2  created_by_id, updated_by_id
fulfillments.fulfillments 2  created_by_id, updated_by_id
payments.methods       2  created_by_id, updated_by_id
payments.details       2  created_by_id, updated_by_id
payments.intents       2  created_by_id, updated_by_id
orders.addresses       1  source_address_id
```

Run against production today, the sequence would be:

1. 000 creates the seven missing schemas and their tables correctly.
2. 000 **skips all 38 tables production already has** — `IF NOT EXISTS`.
3. The baseline marker stamps 002–049 as applied. They never run.
4. Those 50 columns are never added, and the 2 tables never created.
5. 050 onward run against tables missing the columns they write to.

So the backfills would write into a shape that cannot hold what they carry.
`034` — the migration that exists specifically to backfill the 21 order columns
`033` added — would be marked done without ever having run.

**Why nothing caught it.** `verify:genesis` builds into *renamed empty* schemas
and compares against dev. Building from nothing is exactly the case where
`IF NOT EXISTS` is invisible. Production is the one starting state that has
never been tested: partially built, older, and non-empty.

**FIXED 2026-08-22, for the schema half.** `dump-schema.mjs` now emits an
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for every column alongside the
`CREATE TABLE IF NOT EXISTS`, so genesis reconciles an existing table instead of
skipping it. `NOT NULL` is deliberately left off those: adding it to a table
that already holds rows fails if any are null, and nullability is decided from
the production audit, not from dev.

`pnpm --filter @dorado/api verify:genesis:production` is the check. It reads
production's real shape read-only, builds genesis into scratch schemas in dev,
winds them back to production's shape, runs genesis again, and compares against
dev — all inside a rolled-back transaction. It failed before the change and
passes after.

Worth recording what the failure actually was, because it was better than
feared: genesis did not silently skip the columns, it **aborted** on the first
`ADD CONSTRAINT` naming a column production's older table lacks. Postgres has no
`IF NOT EXISTS` for `ADD CONSTRAINT`, and the runner wraps each migration in a
transaction — so production would have rolled back untouched rather than ending
up half-built. The migration could not run, rather than running wrongly.

**Still needed before any production migration:**

- A verification that starts from production's real shape rather than from
  empty. The shape can be read read-only and reproduced in dev inside a
  rolled-back transaction.
- Genesis reconciling existing tables instead of skipping them — an
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for every column, generated by
  `dump-schema.mjs` alongside the `CREATE TABLE`. Additive, so it cannot drop
  anything that is already there.
- The `pg_dump` first, in any case.

Found 2026-08-22, once `claude_ro` was granted `USAGE` on the new schemas.
Until that grant, production's new schemas were unreadable and this was
invisible.

### RETRACTED: the three new-schema-only orders are cancelled orders, not unpaid ones

An earlier version of this file said purchase order 299 was a customer owed for
100 troy ounces delivered on 2026-01-02 and never paid. **That was wrong.** It is
recorded here rather than deleted, because it was stated forcefully and acted on.

What was right: the tracking is real. A package was dropped at FedEx in
Crossville TN on 2025-12-30, moved Cookeville → Memphis → Dallas → Irving, and
was delivered to Irving TX on 2026-01-02. Fifteen scans. That is a real
shipment and it really arrived.

What was wrong: concluding from `exchange` not having the order that `exchange`
had *never* had it. Orders 298 and 299 carry exactly the profile of order 297,
which is still in `exchange` — one address snapshot, one item, four spots, one
offer. Those snapshots are created by the migration **reading `exchange`**, so
all three orders were in `exchange` when it ran and were deleted from it
afterwards. Their shipments and tracking rows went with them, which is why
`shipping.shipments` holds three rows `exchange.shipments` does not.

Jacob's account, which fits every field better than mine did: the business
occasionally receives fake metal, and those orders are cancelled and deleted.

| field | read as "unpaid customer" | read as "rejected as fake" |
|---|---|---|
| `purity 0.000`, `content 0.000` | never assayed | assayed, worth nothing |
| `confirmed: true` | — | someone did check it |
| `status: Received` | arrived, unprocessed | arrived, processed, rejected |
| no payout, no transaction | customer unpaid | nothing to pay for |
| absent from `exchange` | never written there | cancelled and deleted |

**The general rule this violated.** A row missing from `exchange` has two
explanations — it was never there, or it was deleted — and only one of them was
considered. The same mistake as the "orphan duplicate" addresses earlier the
same evening: reading one table and inferring history from its current contents.
`exchange` is authoritative for what exists *now*; it is not a log of what
existed.

**What this means for the backfill guards.** Nothing changes. `audit:guards`
still reports that two would refuse, and they still should: re-deriving
`orders.orders` from `exchange` would delete rows that record cancelled
business. Whether those rows are kept or dropped before promotion is a decision,
but it is a bookkeeping decision rather than an urgent one.

**Worth one check on Jacob's side, and only one.** The retraction rests on the
orders having been deleted from `exchange` deliberately. If any of 298, 299 or
303 was *not* a deliberate cancellation, the original reading would apply to it.
That is a memory question, not a data one.

### FOR JACOB: three production purchase orders exist only in the new schema

Not a code question. Three purchase orders live in `orders.orders` on production
and in neither `exchange.purchase_orders` nor `exchange.sales_orders`, which
means **the live application cannot see them** — it reads `exchange`.

| number | created | status | pre-melt | purity | content |
|---|---|---|---|---|---|
| 298 | 2025-12-24 | In Transit | 141.096 | 0.925 | 130.514 |
| 299 | 2025-12-30 | Received | 100.000 | 0.000 | 0.000 |
| 303 | 2026-01-12 | In Transit | 130.000 | 0.925 | 120.250 |

ids `5f211253-…`, `a678721b-…`, `e91da7f0-…`.

What is known:

- All three users **exist in `exchange.users`** and each has an address there.
- None of the three users has **any** purchase order in `exchange` — these are
  their only ones.
- Each order has one scrap item, one fulfillment, and one `payments.intents` row.
- Order 303 has a shipment with a tracking number and a tracking event.
- No `exchange.payouts` row for any of the three users.
- All three were created between 2025-12-24 and 2026-01-12 — the window the
  January refactor was being worked on.
- `exchange`'s purchase order numbering has 87 gaps between 192 and 339, so a
  gap on its own proves nothing. 298, 299 and 303 sit in those gaps.

Two readings, and the data does not settle it:

- **Real.** Three customers submitted scrap, two consignments are marked in
  transit and one received, and nobody has been paid because the orders
  disappeared from the live system when the January work was abandoned. 141 and
  130 troy ounces of sterling are not trivial amounts.
- **Test.** They were created during development against real accounts. Order
  299 having purity 0.000 and content 0.000 fits an incomplete test entry, and
  none of the three users has any other order.

**Someone who was there has to say which.** If they are real, three customers
are owed an answer and possibly money, and that is independent of any migration.
If they are test rows, they should be deleted from the new schema before
promotion — deliberately, with the reason recorded.

Until that is answered, `pnpm --filter @dorado/api audit:guards` reports that
two backfill guards would refuse on production, which is the guard working
correctly: re-deriving those tables from `exchange` would overwrite these rows.

### Production's new schemas already hold rows exchange has never seen

The backfill guard refuses when the target holds rows the source does not.
That has been theoretical, checked only against dev. It is production's actual
state:

| source | rows | target | rows | orphans in target |
|---|---|---|---|---|
| exchange.addresses | 72 | places.addresses | 118 | 60 |
| exchange.payment_intents | 25 | payments.intents | 70 | 45 |
| exchange.shipments | 70 | shipping.shipments | 44 | 3 |
| exchange.users | 74 | auth.users | 60 | 0 |
| exchange.tracking_events | 525 | shipping.tracking | 427 | — |

Divergence runs both ways: exchange also holds rows the new schema lacks —
14 addresses, 29 shipments, 14 users, 116 tracking events — which is what the
backfills are for.

**CORRECTION — the 60 orphan addresses are not duplicates and must not be
deleted.** An earlier version of this note called them "re-keyed duplicates" and
"junk to clean up after promotion", on the evidence that 59 of the 60 match an
`exchange.addresses` row on `(line_1, city, zip)`. That evidence was real and
the conclusion drawn from it was wrong.

They are **order address snapshots**. `orders.addresses` holds exactly 59 rows,
and all 59 point at one of these — none points at an `exchange.addresses` row.
A snapshot is *supposed* to carry the same values under a fresh id: that is what
makes it a record of where an order was actually sent, rather than a pointer to
an address book entry the customer may since have edited or deleted. The value
match that looked like duplication is the snapshot doing its job.

The 60th, `1d37f973…`, is not a customer address at all — it is a
`places.locations` row, one of the business's own addresses, and it is on a
shipment.

So **zero of the 60 are safe to delete**, and a cleanup migration would have
destroyed the delivery address of every order in the new schema. 050's guard
already said as much in a comment — *"Snapshots are excluded from that check,
they are created by the orders backfill and have no counterpart by design"* —
which was there to be read before the count was interpreted.

What made this look like a duplicate was reading `places.addresses` alone.
Nothing about a row is legible without asking what points at it.

**The 3 orphan shipments are not artifacts.** All three carry a tracking
number, a fulfillment link and tracking events. They do not overlap dev's
(dev now has none), so they are production rows that `exchange` never recorded.
Someone should establish what they are before promotion — they are the only
rows found so far that exist solely in the new schema and look real.

### Carrier pickup has never worked, at any point in the chain

Six defects, found over two sessions, all in the path that books a FedEx pickup
for a purchase order. Listed in the order they fire:

1. `handler.createPickup` called `provider.schedulePickup(...)`. `fedex.js`
   exports `createPickup` and has never exported `schedulePickup`, so this threw
   `provider.schedulePickup is not a function` **before any FedEx request was
   built or sent**. Eight of the nine dispatch lines named their export
   correctly; the ninth did not.
2. `payloads.js` called `normalizeTime`, `formatFedexFullDateTime` and
   `addHours` without importing any of them. All three exist in
   `providers/fedex/utils/formatting.js`; only `formatFedexTime` was imported.
   `ReferenceError` on the first line that used one.
3. `cancelPickupInput` read `confirmation_number` and `pickup_requested_at`
   while its only caller passes `confirmationCode` and `pickupDate`. Both
   arrived `undefined`, so FedEx was asked to cancel a pickup without being told
   which one. This is the only one of the six that did not throw.
4. `pickups/repo.js` inserted a `shipment_id` column `exchange.carrier_pickups`
   does not have — `42703` on every write, which is why the table is empty in
   dev and production.
5. `cancelPickup` set `status`, and the repo reads `pickup_status`, so
   cancelling wrote the row's existing status straight back.
6. It set `"cancelled"`, and a CHECK constraint allows only
   `pending / scheduled / completed / canceled`. One `l`.

**A correction to what was written earlier.** The first version of this note said
the throw happened *after* `shippingOps.createPickup` had booked a real pickup
with FedEx, leaving orphaned bookings nobody had a record of. That was wrong.
Defect 1 fires first, before the payload is built and before any request is
sent, so **no FedEx pickup was ever booked through this path**. There is nothing
orphaned at FedEx to reconcile.

All six are fixed. `features/shipping/operations/adapters/fedex.test.js` and
`resolver.test.js` cover the chain, including a test that reads the dispatch
lines back out of `handler.js` and asserts every method exists on every
registered provider — which is what defect 1 was, and what TypeScript cannot
catch because `provider` is a namespace import resolved at runtime.

### Two more ReferenceErrors, found by turning on checkJs

`pnpm --filter @dorado/api typecheck:sweep` runs `tsc` with `--checkJs` and
`--noImplicitAny false`. The first flag checks the JavaScript; the second
suppresses 1,631 "parameter implicitly has an any type" complaints that are
noise rather than signal. What was left was 107 errors, of which five were
`TS2304` — an identifier that does not exist, which is a guaranteed
`ReferenceError`:

- `features/scrap/service.js` — `deleteItems({ ids })` called
  `scrapRepo.deleteItems(orderId)`. `orderId` was never defined.
- `features/suppliers/service.js` — `getSupplierFromId(ids)` called
  `supplierRepo.getSupplierFromId(id)`. `id` was never defined.
- the three missing imports in `providers/fedex/payloads.js` above.

All fixed; `TS2304` is now zero. The remaining ~55 are known-benign categories
and are listed here so a future sweep can tell new signal from old noise:

| code | count | what it is |
|---|---|---|
| TS2345 | 16 | argument shapes inferred from the widest call site — e.g. `renderTemplate` defaults `offerExpiration`, so callers omitting it are fine |
| TS2339 | 13 | `err.status` / `err.statusCode` on `Error`, the usual JS idiom for attaching an HTTP status |
| TS2307 | 8 | `better-auth` ships no type declarations |
| TS18046 | 6 | `err` is `unknown` in a `catch` |
| others | 12 | inference noise on destructured defaults |

`checkJs` is deliberately **not** enabled in `tsconfig.json`. Turning it on would
fail `pnpm check` on those 55, and annotating them away is churn with no
behaviour change. The sweep is a tool to run deliberately, not a gate.

## Security

### The audit trail is forgeable — and the fix is server-only

The frontend sends `user_name: user?.name` in the request body, and the API
writes it to `created_by` / `updated_by` verbatim. Any authenticated admin can
attribute an action to anyone by editing one field.

`req.user.id` and `req.user.name` are already available from `requireAuth` and
are used for audit in **zero** places.

**No frontend change is needed.** The server keeps accepting the field and
simply stops trusting it — read the actor from the session instead. The
frontend can go on sending `user_name`; it just gets ignored. 53 call sites
across 23 API files pass `user_name` today.

Until this is done, the new `created_by_id` columns are a trustworthy column
filled from an untrusted source.

### FOR JACOB: error responses were returning Postgres errors and server paths

Found by pointing the new endpoint tests at a guarded GET as an admin.
`GET /api/stripe/retrieve_payment_intent` answered, verbatim:

```json
{"success": false,
 "error": {"message": "invalid input syntax for type uuid: \"not-a-uuid\"",
           "where": "/home/jtj60/dorado-exchange/api/features/stripe/repo.js:23"}}
```

Two separate disclosures. `message` is `err.message` for *any* unexpected error,
and a Postgres error carries the column, the type, the constraint name and — on
a unique violation — the value that collided, which is customer data. `where` is
the absolute path of the source file on the server.

**`where` is gated on `NODE_ENV !== "production"`. `message` was gated on
nothing**, so production returned it regardless.

Fixed: an error raised deliberately keeps its message, because it was written to
be read and its status says so — `features/addresses`, `features/carts` and
`features/purchase-orders` are the four places that do this. Everything else
gets `"Server error"`. The real message is still printed in full to the log,
unchanged. Six tests, all proved to fail against the old behaviour first.

The frontend was never reading it: `AddressForm.tsx:102` looks at
`error.response.data.message`, and the API returns `data.error.message`, so it
has always fallen through to axios's own text. Nothing user-visible changes.

**One thing only you can check.** `NODE_ENV` is read in exactly two places, both
in `errorHandler.js`, and is set **nowhere in this repo** — not in `.env`, not in
a Railway config, not in a Dockerfile, and there is no Dockerfile. If it is not
set to `production` in Railway's own variables, then production has been
returning `where` too, and every error response has carried the absolute path of
a source file on the server. Worth checking in the Railway dashboard, and worth
setting explicitly either way rather than relying on it being absent.

### Bank details are unencrypted at rest, and production has real ones

**Confirmed against production, 2026-08-22.** Dev suggested these columns were
vestigial. They are not.

```
ECHECK            41 payouts,  0 routing,  0 account
ACH               10 payouts,  7 routing,  7 account
WIRE               8 payouts,  7 routing,  7 account
DORADO_ACCOUNT     2 payouts,  0 routing,  0 account
                  61 total
```

Fourteen payouts carry a real routing and account number in plaintext `text`,
written straight from `req.body` by `insertPayout`. Dev has sixty-one fewer
payouts and zero bank details, which is why the earlier note here suggested
dropping the columns rather than encrypting them. That was wrong, and it is
exactly the trap CLAUDE.md warns about: dev row counts prove nothing.

So encryption at rest is real work, not a delete:

- **The migration must not copy them.** `payments.details` has
  `routing_number` and `account_number` columns and holds nothing in either.
  Backfilling them would put the same fourteen secrets in a second table and
  double the exposure. Whatever the payments migration does, it should encrypt
  on the way across or leave them where they are.
- Order responses already carry last-4 only, with full values behind an
  admin-only endpoint. That part is sound and there is a test asserting it.
- `pgcrypto` is the obvious mechanism, but key management is the actual
  decision: a key in the same environment as the database buys very little.

## Schema

### The API doesn't populate the new audit id columns

`created_by_id` / `updated_by_id` exist on 14 new-schema tables and are
backfilled, but dual-write only mirrors the text columns, so new rows get null.
Ties into the session-actor fix above — do them together.

### Production is now readable, and it moved two conclusions

`claude_ro` works. `PROD_READONLY_DATABASE_URL` connects, read-only, for audits.
Two things followed immediately, both recorded in their own entries: production
holds fourteen plaintext bank details where dev holds none, and
`audit:nullability` had been reading dev all along.

`audit:coverage --prod` now counts population against production while taking
the schema shape from dev, because the new schema exists nowhere else. That
closed a real hole: the audit skips any column that is null on every row, and
run against dev it was excusing every column dev happens not to use.

Checked, and it had not bitten — **no column is populated on production that dev
missed**. Two go the other way: `payment_intents.bank_account_type` and
`.routing` are dev-only test data. Production reports 22 gaps against dev's 24.

Also re-verified against production, since both govern live decisions:

- `order_metals.percent_change` and `.dollar_change` are null on all 284 rows,
  so the orders read projecting NULL for them is correct rather than lucky
- `scrap.gem_id` is null on all 105
- `exchange.metals.scrap_percentage` and `.bullion_percentage` **are** populated
  on production, so the `DELIBERATE` waiver in audit-coverage rests on nothing
  reading them rather than on their being empty — which is still true: the only
  reference in the codebase is a comment in `spots/repo.exchange.js` saying so

### deleteOrphanScrap runs on every cart sync and is not scoped to the customer

`syncSellCart` ends with `cartRepo.deleteOrphanScrap(client)`, and that function
deletes **every** row in `exchange.scrap` not referenced by a `sell_cart_items`
or a `purchase_order_items` row — across the whole table, not the syncing
customer's. It runs each time anyone changes their sell cart.

That is its intended job, and in practice it is safe today: every path that
creates a scrap row attaches it to a cart item or an order item inside the same
transaction, so another customer's scrap is never visibly unreferenced.

What is worth knowing is the blast radius. `NOT IN` over two subqueries that
return nothing is true for every row, so if `sell_cart_items` and
`purchase_order_items` were ever both empty — a bad migration, a failed restore,
a truncate someone meant to scope — **the next cart sync would empty the scrap
table**. On production that is 105 rows carrying `purity_actual`,
`post_melt_actual` and `content_actual`: the record of what a customer's parcel
actually turned out to weigh once melted, which exists nowhere else. There is a
test asserting the current behaviour, so a guard added later will fail it
loudly rather than silently.

`lint:migrations` protects `exchange` from destructive *migrations*. Nothing
protects it from application code doing an unbounded `DELETE`, and this is the
only one that does.

Two cheap options if it is worth hardening: refuse when both reference sets are
empty, or scope the delete to the scrap ids the sync itself orphaned. Both change
checkout behaviour, so neither was done on a hunch.

### The sales tax enums live in `public`, not `exchange`

`exchange.sales_tax_rules.metal_category` and `.product_type` are typed by enums
in the **public** schema, not in `exchange`. The January refactor created
same-named enums in `tax`, which is why the genesis backfill casts through text
to move values between them.

Nothing is wrong with it, but three same-named types across three schemas is a
trap for anyone writing a cast — an `exchange.`-qualified one simply fails, and
a `tax.`-qualified one fails in the other direction. The repo tests state which
is which.

### content_actual is written as zero when there is no assay

`updateScrapItem` computes `content_actual` as

```js
convertTroyOz(post_melt_actual ?? pre_melt, gross_unit) * purity_actual ?? content
```

which parses as `(convert(...) * purity_actual) ?? content`, because `*` binds
tighter than `??`. The intended fallback to `content` can therefore never fire:
`??` catches only null and undefined, and a multiplication returns neither.

Multiplying by a null `purity_actual` gives **0**, so an admin editing a scrap
row that has no assay yet lands `purity_actual = purity` (correct, that fallback
is a plain `??`) alongside `content_actual = 0`, which disagrees with it. 49 of
production's 105 scrap rows have a null `purity_actual`, so they are all in that
state waiting for an edit.

The same expression yields **NaN** if a figure is `undefined` rather than null,
and Postgres stores NaN in a `numeric` column without complaint. Production has
none today.

Not fixed, because the fix depends on what the row should claim: `content_actual`
falling back to `content` asserts an assay that never happened, and leaving it
null says the parcel has not been melted yet. That is a question about the
business, not about JavaScript. A test pins the current behaviour either way.

### createPaymentIntent writes twice around a network call

`stripe/service.js::createPaymentIntent` creates a Stripe customer, writes
`stripeCustomerId` to the user, then creates a payment intent and writes that —
three steps, two of them database writes, with a network call between them.

It is not wrapped in a transaction and mostly cannot be: a Stripe customer
cannot be rolled back, so holding a database transaction open across the call
would only widen the window in which it is held. The failure mode is a Stripe
customer created without `stripeCustomerId` being saved, which the next call
recovers from by creating a second customer — untidy rather than harmful.

Left alone deliberately, unlike the two purchase-order services that were
wrapped, because those are pure database work and this is not.

### Deleting scrap silently orphans an order line

`purchase_order_items.scrap_id` is `ON DELETE SET NULL`, so `scrapRepo.deleteItems`
succeeds on scrap belonging to an order. The line survives with neither a
`scrap_id` nor a `product_id` — which the composed order query reports as
`item_type: 'unknown'` — and the weights, purity and assay figures are gone.
That is the record of what a customer sent and what was recovered from it, and
it exists nowhere else.

Production has no such line today: 81 scrap-backed and 7 product-backed of 88.
Latent rather than live, and pinned by a test. A guard would change what an
admin delete does, which is why one was not added.

### The customer balance can go negative

`removeFunds` does not check the balance before subtracting, so a checkout that
spends more than a customer holds leaves them negative rather than failing.
Whether the guard belongs in the repo, the service or a database constraint is a
real decision; it is pinned as current behaviour by a test rather than changed.

### Writes that accept an executor and never use it

Found by auditing every write in every repo rather than by a failure. One was
live and is fixed; the rest are latent and will bite whoever migrates those
features.

**Fixed:** `deleteRate` in both `features/rates/repo.exchange.js` and
`repo.next.js` declared an `executor` parameter and never passed it to
`query()`. The dual layer threaded it correctly, so under
`RATES_SOURCE=dual` a delete would have run on the pool on *both* sides —
committing immediately, outside the caller's transaction, leaving a rate deleted
from both schemas even when the surrounding operation rolled back. There is now
a test.

**Now done.** All ten remaining writes take an executor as their last parameter
and thread it into `query()`: `changePayoutMethod`, `purgeCancelled` and
`updateRefinerSpot` in purchase-orders; `updateScrapItem` and `deleteItems` in
scrap; `createPaymentIntent`, `updatePaymentIntent`, `updateMethod` and
`attachCustomerToUser` in stripe; `adjustUserCredit` in users. Call sites are
unchanged — the parameter is optional and `undefined` still means "use the
pool", which is the behaviour they had.

Every write in every repo now accepts an executor and passes it on.

Checked and *fine*: `features/transactions/repo.js` `addFunds` and `removeFunds`
both take a client, so the checkout path that moves a customer's balance is
already transaction-safe.

### Two behaviours the frontend tests pin rather than fix

Both are recorded because they are defensible as they stand, and both would be
easy to change by accident.

**A missing premium means opposite things for scrap and for a product.** In
`getReturnDeclaredValue`, a scrap line with no premium anywhere falls back to
`1` and is declared at full spot; a product line falls back to `0` and is
declared at nothing. Neither is obviously wrong - scrap is bought at a discount
that defaults to none, and a product without a premium has no price - but they
are different rules and the difference is invisible at the call site.

**An unknown weight unit is worth zero, in both JS copies.** `convertTroyOz`
returns 0 for a unit it does not recognise; the SQL function returns NULL. Zero
is the more dangerous answer, because a scrap line in an unanticipated unit is
silently worth nothing and nothing about the result says it failed. Nothing
calls the SQL function today, so this is latent rather than live.

**`formatPhoneNumber` and `normalizePhone` disagree on a leading 1.**
`normalizePhone` strips it only when there are eleven digits — a country code.
`formatPhoneNumber` strips it whenever the string starts with 1, so ten digits
beginning with 1 lose their first digit and render as nine: `1234567890` becomes
`(234) 567-890`. No real US number hits this, because NANP area codes cannot
begin with 0 or 1. Both functions are applied to the same values and only one is
right about the rule, so it is pinned rather than left to be discovered.

**`getProductPrice` throws on a missing product where its three siblings return
zero.** `getProductBidPrice`, `getProductBidOverUnderSpot` and
`getProductAskOverUnderSpot` all guard both arguments; `getProductPrice` guards
only the spot and its signature says the product is required. The inconsistency
invites the assumption that all four are safe to call with partial data.

**Dates rendered in the browser can disagree with dates rendered by the API.**
The API pins `TZ=UTC`; the browser formats in the customer's zone. An instant
just before midnight UTC is the previous day for anyone in the Americas. This is
normally what you want from a UI, but it means two dates on the same screen can
differ by a day depending on which side rendered them.

### Latent defects in `exchange`, not worth fixing there

Recorded because the same mistakes should not be carried into the new schema:

- `exchange.addresses.state` defaults to `'United States'`; `country` has no
  default. The pair is transposed. No rows affected — the app always supplies
  both — and `places.addresses` already has it the right way round.
- `exchange.leads.contact` defaults to the literal `'Jacob Johnson'`.
- `order_metals.percent_change` and `dollar_change` are 100% NULL but still
  selected by `findMetalsByOrderId`. `scrap.gem_id` is 100% NULL but still
  inserted by `insertScrapFromCartItem`. Do not drop without changing the code
  first.
- Naive timestamps throughout. Correct only because the container runs UTC,
  which is now pinned explicitly in both Dockerfiles rather than assumed.

### `NOT NULL` constraints are unassessed

Dev holds tens of rows, so dev null counts prove nothing. Needs
`pnpm --filter @dorado/api audit:nullability` against production. Blocked on the
`claude_ro` role, which fails authentication on every database on that instance
— `ALTER ROLE claude_ro PASSWORD '<the one in api/.env>';`

### Dead schema, unconfirmed

`auctions` and `auction_items` tables remain after the auction code was removed
in `19c7a532`. They hold data (1 and 10 rows in dev) and nothing references
them. Needs a yes/no before dropping, and a `pg_dump` first.

### The January copy dropped rows, and the count is not zero

Two gaps found while auditing orders, both closed by migration 028:

- one `purchase_order_item` (order 239, Received) never reached `orders.items`
- two purchase orders (241 and 242, both In Transit) carried an `address_id`
  that never became an `orders.addresses` row

Neither was visible from the schema - only from counting rows against the
source. Nothing was lost from `exchange`; the target was short. The lesson for
the remaining features is that shape parity is not row parity, and the copy
should be assumed incomplete until counted. The genesis backfill above makes
this moot for production, which will be populated from exchange directly rather
than inheriting January's copy.

### products.bullion.quantity left nullable

exchange.products declares `quantity` NOT NULL; `products.bullion` leaves it
nullable and migration 024 did not tighten it, unlike supplier_id, image_front,
image_back and stock which it did.

The others are restorations — nothing treats them as optional and a product
without a front image cannot render. `quantity` is a judgement: a
not-yet-stocked product could reasonably lack one, and exchange's NOT NULL may
be incidental rather than intended. Worth a decision rather than a default.

### Empty-string emails on carrier organizations

Two CARRIER rows in `organizations.organizations` hold `''` rather than NULL for
email. Postgres treats every NULL as distinct for uniqueness but two empty
strings as equal, so the placeholder actively defeats a constraint that would
otherwise be free. Found while scoping the refiner uniqueness in migration 020;
left alone because those rows belong to the shipping migration.

### BLOCKED: shipping.shipments is blocked behind services, and its copy is short

Audited in full. The structure is right and the copy is not.

**Which table is authoritative.** `shipping.shipments` and
`fulfillments.shipments` both exist and both hold rows, which looks like two
rival copies and is not. `shipping.shipments` keeps exchange's ids - all 17 of
them - and is the shipment. `fulfillments.shipments` shares no ids with
exchange at all; it is a link table joining a fulfillment to a shipment, with
the pickup and delivery locations. A shipment no longer points at its order
either: `fulfillments.fulfillments` does, one row per order.

**Seven of the thirteen reported gaps were renames** nobody had recorded -
est_delivery, label, cost, direction, tracking's `time`, and the two order id
columns being relocated rather than lost. All are now declared in
`scripts/audit-coverage.mjs`, verified against the data.

**Three real gaps are closed** by migration 046: shipping_status, pickup_type
and created_at, all populated on 23 of 23 rows.

**Three are blocked**, and they are what stops the feature:
`service_type`, `package` and `carrier_id` all route through
`shipping.services` and `shipping.packages`, which need the two decisions
below. `audit:coverage shipping` now prints them as BLOCKED rather than as
plain gaps.

**The copy is also incomplete, independently of the decisions:**

- 6 of exchange's 23 shipments were never copied (5 Inbound, 1 Outbound)
- the 6 tracking events missing from `shipping.tracking` all belong to those
  same 6 shipments, so it is one gap rather than two
- `shipping.tracking` holds **9 rows that do not exist in exchange at all** and
  are not duplicates of anything there. Where they came from is unknown. They
  must be understood before any backfill, because the guard that protects every
  other backfill reads exactly this condition as "exchange is no longer
  authoritative"
- 3 shipments have `cost = 0` where exchange has `net_charge = NULL` - the same
  null-defaulted-to-zero mistake found on orders.items.quantity

None of that is destructive - exchange holds all 23 - but the target cannot be
switched to until it is repaired, and repairing it is only worth doing once the
service and package questions are answered, since those change what a shipment
row is.

### Every other migrated feature was checked, and only addresses was missing

After 050 fixed it, all thirteen migrated features were audited for the same
gap. Every table their `repo.next` reads is registered in `verify-backfill`'s
TABLES list, so addresses was the only one.

The audit is now permanent rather than a one-off. `verify:backfill` asserts that
**every populated table in the new schema is either registered in TABLES or
declared in NOT_REBUILT with a reason** — seed data, a table compared through a
compat view, or a feature that is not migrated. A table that is neither is the
addresses bug again: migrated in code, never copied, and nothing checking.

Proved it can fail before trusting it: unregistering `leads.leads` produces
`leads.leads holds 39 rows, is not registered in TABLES, and is not declared in
NOT_REBUILT`. A check that has never been seen to fail is not evidence of
anything.

### addresses was migrated and never backfilled — fixed by 050

The addresses feature had a repo split, a dual-write, tests and a verified read
diff, and nothing ever copied the data. On a database built from `exchange`,
`places.addresses` would have held only per-order snapshots and the three shop
addresses, so every customer's saved address list would have come back empty.

Found by the shipping backfill, which references `places.addresses` for the
customer side of a shipment and had nothing to point at. Against dev nothing
looked wrong, because the rows were already there from January — the from-empty
check is the only thing that could have caught it, and did.

Worth taking as a general lesson: a feature is not migrated when its repo is
split. It is migrated when its data can be rebuilt from exchange and that has
been verified. Both order features, products, mints and the rest were caught by
`verify:backfill` registrations; addresses slipped through because nothing
registered it.

### fulfillments had to come before the shipping repo split

Worth recording as an ordering constraint rather than a surprise. All three
shipment reads are `SELECT *` from `exchange.shipments`, so the wire shape
includes `purchase_order_id` and `sales_order_id` — and `shipping.shipments` has
neither. `fulfillments.fulfillments.order_id` carries the order link, one row
per order, so a `repo.next` for shipments cannot return the shape it must until
fulfillments holds data. `getByOrder` in particular could not work at all.

052 backfills it: 23 fulfillments and 23 links, up from 17 and 16. Every order
with a shipment now has one, which closes the 6 that were missing — they were
the 6 whose shipments 049 had just restored, exactly as expected.

The mapping is derived rather than decided. Production holds two `pickup_type`
values and each corresponds exactly to a direction: 'Store Dropoff' on all 61
inbound, 'DropShip' on all 9 outbound. Status follows `shipping_status` —
Delivered becomes COMPLETED, anything else PENDING — which is what January's
sixteen rows already said.

Locations resolve by **type** rather than name: an inbound parcel is received at
the FEDEX_OFFICE location, an outbound one ships from the REFINER_OFFICE.
Renaming a location therefore cannot break the mapping.

One dev row contradicts itself and is excluded from the comparison: order
`1f3e9efe` is marked APPOINTMENT/SCHEDULED while having a DropShip shipment, and
only one fulfillment per order is allowed. A rebuild derives DROPSHIP from the
shipment, which is what the shipment says happened.

### A shipment's business location is not recorded in exchange

`shipping.shipments` requires a shipper and a recipient address, and
`exchange.shipments` has no address column at all. One side is derivable — the
customer's address, through the order — and 050 fills it.

The other is a business location — and it turns out the new schema records that
somewhere else. `fulfillments.shipments` carries `recipient_location_id` and
`shipper_location_id`, and 052 fills them: FEDEX_OFFICE for an inbound parcel,
REFINER_OFFICE for an outbound one.

So the shipment's own business-side address staying null is arguably correct
rather than merely cautious: the location that handled it is a fact about the
fulfillment, not about the label. 048 relaxing the constraint looks like the
right call for a better reason than the one it was made for.

Re-adding the constraint would now mean copying the location's address onto the
shipment, which duplicates what the fulfillment already says. Probably leave it.

### shipping.services and shipping.packages are seeded, not derived

Decided rather than asked, under Jacob's standing delegation, and reversible:
both are now in `047_seed_reference_data.sql` as literals.

They *could* be derived from `exchange.carrier_services`, which on production
holds the same eight (carrier, name) pairs. They are not, for two reasons. No id
is shared between the two tables, so deriving would re-key every service and
orphan anything already pointing at one. And dev's `carrier_services` holds two
of the eight, so the same migration would produce different results depending on
which database it ran against — which is exactly the class of mistake that put
the wrong conclusion in this file twice.

Seeding gives every database the eight services and six package sizes the
application expects. `shipping.carriers` keeps its exchange ids and those ids
are identical in dev and production, so the carrier references in the seed are
stable.

The shipments backfill therefore resolves `service_type` to a service by
(carrier, name) and `package` to a package by (carrier, label), rather than by
id. Every production value has a match: Express Saver, Priority Overnight,
Standard, Free and Overnight for services; Small Box, Medium Box and Large Box
for packages.

### shipping.services is NOT blocked — that entry was wrong

Recorded here for a while as needing two product decisions. Both were
artifacts of reasoning from dev, and production answers them.

Dev's `exchange.carrier_services` holds 2 rows. **Production holds 8**, and they
are the same eight as `shipping.services` — identical as sets on
(carrier, service name):

```
FedEx / Express Saver      UPS / Free
FedEx / Free               UPS / Overnight
FedEx / Overnight          UPS / Standard
FedEx / Priority Overnight
FedEx / Standard
```

So:

- **"Should `GET /carrier_services` start returning 8 instead of 2?"** It already
  returns 8 in production. Nothing changes.
- **"Is `2fb26257…` called Overnight or Priority Overnight?"** Production has
  *both*, as separate FedEx services. There is no rename and no conflict.

The one real difference is that the ids do not match — no id is shared between
the two tables. So the migration maps by `(carrier, name)` rather than by id,
which is exactly what the organizations backfill already does for suppliers,
carriers and mints.

Every `service_type` value used on production shipments — Express Saver (54),
Priority Overnight (7), Standard (7), Free (1), Overnight (1) — exists in
`carrier_services`. The earlier note claiming two of them did not was also
reading dev.

**Consequence: shipping.shipments is unblocked too**, since `service_type`,
`package` and `carrier_id` were only blocked behind this. What remains for
shipments is repair work, not decisions: 6 of production's shipments were never
copied, 3 have `cost = 0` where exchange has `NULL`, and `shipping.tracking`
holds 9 rows with no counterpart in exchange that still need explaining. And
fulfillments is blocked only behind shipments.

This is the second conclusion in this file that dev data got wrong, after the
bank details. Anything reasoned from dev row counts should be re-checked against
production before being believed — `audit:coverage:prod` and
`PROD_READONLY_DATABASE_URL` make that cheap now.

### `GET /get_transactions` returns ONE ledger entry, not a history

`getTransactionHistory(user_id)` ends in `result.rows[0]` in **both**
implementations, under a query that orders by `occurred_at` ascending. So the
route hands back the customer's OLDEST credit movement and nothing else — a
customer with five entries sees the first one. The two implementations agree
with each other, so `diff` is silent, and the shape matches
`AccountTransactionWire`, so the wire check is silent too. Both are right: this
is not a migration defect, it is what the endpoint has always done.

Nothing calls it. Grepped the whole frontend for `get_transactions`, for the
query key, and for any transactions fetch — there is no consumer, so no customer
is currently seeing a truncated history.

**Why it is not fixed here.** Changing `rows[0]` to `rows` turns an object into
an array, and that is a wire-shape change during a schema migration, which
CLAUDE.md rules out. It also needs a product answer first: whether the account
page should show a ledger at all, and if so whether it pages. Left for Jacob —
see the decision log.

The credit ledger is the feature holding $66,999.32 across 17 production rows
and 8 customers, so the route being wrong AND unused at the same time is worth
recording rather than quietly correcting.

### `MINIO_BUCKET` is not validated at boot, and is the only unchecked one used

`env.js` checks `DATABASE_URL` and, under `USE_TEST_DB=1`, `TEST_DATABASE_URL`.
Nothing else. `MINIO_BUCKET` has exactly two uses in the repo, both in
`features/media/service.ts`: the bucket written onto the `media.images` row, and
the bucket the presigned PUT is issued against.

Unset, an upload writes a null bucket and hands `undefined` to the presigner —
so it fails at request time, confusingly, rather than at startup, clearly. It is
evidently set in production, because uploads work; this is about the failure
mode if it ever is not.

Not fixed here because adding a boot check changes deploy-time behaviour: a
missing variable would stop the server rather than one endpoint, which is the
right call but is a decision about deploys rather than about types. Noted while
converting the service, where the compiler made the `string | undefined`
visible.

The same question is worth asking of the other provider variables — the FedEx
and Stripe credentials, and `SPOT_API_URL`, which `spots.updateSpotPrices` also
reads without a check.

### The credit ledger has never been reconcilable, and nine entries disagree with their order

Two separate things, found while covering
`POST /api/purchase_orders/add_funds_to_account` — one of the routes no test had
ever driven.

**One: the entry and the movement were computed differently.** `addFundsToAccount`
credited `order.total_price` and logged `calculateTotalPrice(order, spots)`, with
`spots` arriving in the request body. Two numbers, two methods. Fixed — the
ledger now records what was credited, and `spots` is removed from the signature
rather than ignored, the same treatment `get_sales_tax` and `createSalesOrder`
got.

It shows in production. **All nine `Credit` entries differ from the
`total_price` of the order they name**, three materially:

| ledger amount | order total | difference |
|---|---|---|
| 13,619.75 | 13,839.35 | −219.60 |
| 13,619.75 | 13,839.35 | −219.60 |
| 405.17 | 422.86 | −17.69 |

**Two: two orders carry more than one `Credit` entry.** Order
`6d9b867d-…` has **three**, totalling **$41,078.85 against an order worth
$13,839.35** — one correct entry in June 2025 and two identical ones on
2025-10-03. Order `7975c2b5-…` has two, totalling $828.03 against $422.86.

**What I could NOT determine, and did not assume.** Whether any customer was
actually over-credited. The balances do not reconcile against the ledger — one
customer's entries net to $40,859.25 while their `dorado_funds` is **$10.23** —
but that is explained without any over-crediting: `adjustUserCredit`, the admin
credit adjustment, moves `dorado_funds` and **writes no ledger row at all**. So
the ledger has never been a complete account of the balance, and the gap is not
evidence of harm.

**What is yours.** Whether the three divergent historical rows should be
corrected, whether the duplicate entries represent duplicate payouts or only
duplicate logging, and whether `adjustUserCredit` should start writing a ledger
row so the two can be reconciled at all. Each is a decision about financial
records, not a typing change. Nothing historical was rewritten.

Covered now by `features/purchase-orders/add-funds.test.js`, which asserts the
property rather than a number: the balance moves by exactly what the ledger
records.

## Operations

### No production backup has been taken, and now there is more to back up

The agreed plan is a manual `pg_dump` before the **first** production migration
run. That has not happened, and nothing has been applied to production.

It matters more than it did. The chain is now 48 migrations that create sixteen
schemas, fill them from `exchange` and seed what `exchange` never held. All of
it is additive and `lint:migrations` proves no migration writes destructively to
`exchange` — but the dump is what makes that provable rather than argued, and it
is a one-liner.

### Docker images have never been built

No Docker daemon in the dev environment. Both Dockerfiles have been rewritten
for the workspace and moved to Node 24 without a single `docker build`. Worth
running once locally before the next deploy:

```
docker build -f api/Dockerfile .
docker build -f frontend/Dockerfile .
```

### Railway settings

Root Directory `/` on both services, `RAILWAY_DOCKERFILE_PATH` of
`api/Dockerfile` and `frontend/Dockerfile`, Watch Paths per service. Confirmed
done. "Wait for CI" should be enabled once the workflow has run on master.

Worth revisiting now that `pnpm check` takes about two and a half minutes and
runs frontend tests as well: whatever timeout "Wait for CI" uses needs to allow
for that.

### 46 mounted routes have still never been driven over HTTP

An inventory taken after the two December-2025 500s were found:
`132 routes mounted, 75 driven by some test, 57 never driven`. Eleven of those
57 were reads and are now covered by `shared/http/reads-answer.test.js`,
leaving **46**.

That gap is exactly where both 500s hid. Neither was visible to a repo test —
the repos were correct — nor to a typecheck, because the files were JavaScript
and `import * as` of a missing export is `undefined` rather than an error.

**Why the rest are not covered by a blanket smoke test, deliberately.** Among the
46 are routes that email a refiner their copy of an order, buy a FedEx label,
and talk to Stripe. Driving all of them would do those things. The reads suite
covers every route that writes nothing; the writes need either a sandbox or a
seam per route, which is per-feature work rather than one file.

The worst-covered by count is `features/purchase-orders`, with 25 — and they are
the money operations: `edit_payout_charge`, `add_funds_to_account`,
`update_refiner_fee`, `update_pool_remediation`, `update_shipping_actual`. A
structural break in any of those looks exactly like the two that were found.

`scripts/lint-namespace-calls.mjs` now catches the specific defect statically,
across all 132 routes, so the urgent part of this gap is closed. What remains is
everything only running the code can show.

**THE ROUTE-COVERAGE NUMBERS IN THIS SECTION ARE APPROXIMATE, AND THEY
UNDERCOUNT.** `scratchpad/routecov.mjs` finds a route as "driven" by matching a
literal path in a test — `request(app).post("/api/x/y")`. Several suites drive
routes from a data table instead, through a loop variable or a template, and no
regex here can resolve those:

- `shared/http/reads-answer.test.js` drives eleven routes from a `READS` array
- `features/purchase-orders/money-edits.test.js` drives four from `ORDER_EDITS`
- `features/pdf/replay.test.js` and `features/emails/replay.test.js` build paths
  with `${route}`

The three template call sites are now resolved by hand in the script. The
loop-variable ones are not, so the reported "never driven" figure is an **upper
bound on the gap** rather than a count. Real coverage is higher than any number
quoted in the commits from this session.

Measuring it properly means instrumenting the router at runtime and recording
what the suite actually hits, rather than reading the tests. That is the right
answer and is not done.

The script is worth keeping with that caveat attached to it.

**One route is deliberately left undriven, and will stay that way until you say
otherwise.** `DELETE /api/purchase_orders/purge_cancelled` is
`DELETE FROM exchange.purchase_orders WHERE purchase_order_status = 'Cancelled'`
— a bulk delete of the live table. A pinned transaction would roll it back, and
the pin is proven by its own tests, but CLAUDE.md's rule about deleting is
categorical rather than conditional, and covering a cleanup endpoint is not
worth being wrong about the harness. It is the only route excluded for that
reason rather than for a side effect.

**`POST /get_payout_details` is now covered, carefully.** It is the one endpoint
allowed to return full bank details — `exchange.payouts` holds routing and
account numbers in plaintext, and order responses carry only last-4. The test
asserts on KEYS and status and never prints or interpolates the body, including
on failure: a test that dumps the response on a bad day would put a customer's
bank account into a CI log.

## Testing

**The money paths are covered.** Every repo function that moves money, prices
something, or deletes a row now has tests against real Postgres, each inside a
rolled-back transaction: rates, transactions (the checkout balance), carts,
sales tax, scrap, spots, products, orders, and the admin balance edit. What
remains untested is mostly read-only or belongs to a blocked feature —
`features/stripe/repo.js` (which should be tested for shape only, never by
calling Stripe) and `features/reviews/repo.exchange.js`.

**No swallowed errors remain.** A sweep of every `catch` in `features/` and
`shared/` found none that is empty or that neither rethrows, logs, nor responds.
The one that hid the August checkout outage for months was the last of them.

- The frontend now has vitest and 53 tests, covering rate resolution (mirrored
  1:1 from the API and previously tested on only one side), weight conversion
  (mirrored *three* ways), the scrap price, the declared value on a shipping
  label, the client-side scrap naming, date formatting, and the address id
  checkout posts back. That is a start on 42k lines, not coverage.
- No browser or e2e harness, deliberately. Anything that renders a component
  needs a DOM implementation and a testing library, which is a decision rather
  than a config change.
- API repo tests now cover leads, suppliers, products, mints, purchase-orders,
  sales-orders and addresses. Most other repo functions are still untested.
- Nothing tests routes, middleware or auth end to end.
- `api/features/rates/utils/resolveRate.js` still points at
  `apps/frontend/features/rates/utils/resolveRate.ts` in its header comment —
  a path that stopped existing when the workspace was flattened to `frontend/`.

## The database connection accepts any certificate

`api/db.ts` sets `ssl: { rejectUnauthorized: false }`, which accepts whatever
certificate the server presents without verifying it. That is the common
setting for managed Postgres, which frequently serves a self-signed
certificate — turning verification on without knowing what production actually
serves would refuse every connection, so it is recorded here rather than
changed.

It belongs next to the credential rotation, not separate from it: the database
password is already on the list to rotate, and a connection nobody
authenticates is the thing that would make an intercepted one useful.

Deciding it needs one fact I cannot read from here — what certificate Railway's
Postgres presents. If it is a real one, `rejectUnauthorized: true` costs
nothing. If it is self-signed, the answer is `ca:` with the certificate pinned
rather than verification off.

## An unset DATABASE_URL used to connect somewhere else

Closed in the same commit, and written down because the reasoning has an
exception in it. pg falls back to `PGHOST`/`PGUSER`/`PGDATABASE` when no
connection string is given, and `#env` sets `PGHOST`. Measured: with the parts
blanked so composition fails, a pg Client resolved `localhost` / `jtj60` /
`jtj60` and would have opened a working connection to it.

`api/db.ts` now refuses — **except when `NODE_ENV === "production"`**. That
asymmetry is deliberate. Whatever production resolves today is what it has
always resolved, so a refusal there could only take a working site down over a
variable that cannot be read from here. `db.test.js` pins both halves so the
exception is not later "fixed" into consistency.

## Promotion would drop 27 NOT NULL constraints

`pnpm --filter @dorado/api audit:constraints` compares every mapped column pair
and asks one question: is the source `NOT NULL` while the target is not. 137
NOT NULL columns in `exchange`, 163 pairs with a counterpart, **27 where the
guard does not exist on the other side**.

This came out of the credit-ledger work. `features/users/repo.js` updates
`dorado_funds` with a `CASE` that has no `ELSE`, so an unrecognised mode
evaluates to NULL — on a credit ledger, a wiped balance. It has never happened,
and the reason is not the code: `exchange.users.dorado_funds` is NOT NULL, so
Postgres raises 23502 and writes nothing. **When a constraint is the only thing
stopping a bug, nobody knows, because nothing ever fails.** That one is safe
through promotion — `auth.users.dorado_funds` is NOT NULL too, checked — but it
is the reason to ask the question of everything else.

**The nine that are money.** Every total on a sales order loses its constraint:
`order_total`, `item_total`, `base_total`, `charges_amount`, `sales_tax`,
`post_charges_amount`, `subject_to_charges_amount` and `funds`/`used_funds` all
land in `orders.transactions` as nullable columns. A sales order with a NULL
total is exactly the state D27 describes as unrecoverable, and after promotion
the database would accept it.

Three more worth naming: `exchange.payouts.method` and `.account_holder_name`
become nullable in `payments.details`; and
`exchange.account_transactions.occurred_at` becomes nullable in
`payments.ledger` — a ledger entry with no time on it.

**None of this is automatically wrong.** Some columns are deliberately optional
in the new model, and a default on the target (`leads.priority` defaults to
'Medium', `rates.created_by` to 'Dorado Admin') covers an INSERT that omits the
column — though not an explicit NULL. The point is that each should be a
decision rather than something discovered afterwards.

Run it per feature (`audit:constraints orders`) when working on one. The floor
that refuses a run comparing fewer than 50 pairs applies only to a full run.

### And 8 unique indexes without an exact counterpart

The same audit now reads `pg_index` as well. 15 unique indexes in `exchange`
outside primary keys; **8 have no exact counterpart**, and they are not all the
same kind of thing:

- **`exchange.state_sales_tax(state)` → `tax.sales_tax` has nothing.** This is
  the one to look at. Today a state appears once. After promotion two rows for
  the same state are accepted, and which rate a sale is charged becomes whichever
  the query returns first. It is money, and it is silent.
- **`exchange.cart_items(cart_id, product_id)` → `checkout.items` has nothing.**
  The same product can appear twice in one cart.
- **`exchange.purchase_orders(order_number)` → `orders.orders(direction, number)`.**
  Strictly weaker — a composite does not make either column unique alone — but
  correct for a table that merged both directions, and *stricter* than today for
  sales orders, which have no unique on their number at all.
- **`exchange.rates(metal_id, unit, min_qty, max_qty)` → an expression index on
  `(metal_id, unit, min_qty, COALESCE(max_qty, -1))`.** An improvement: NULLs do
  not compare equal in a unique index, so the original never deduplicated an
  open-ended tier.

### And 3 CHECK constraints with nothing standing in for them

The audit now covers CHECKs too, and the interesting part is what it does *not*
report. A CHECK is often replaced by something stronger: `exchange` guards a
metal type with `type = ANY (ARRAY['Gold', ...])`, and the new schema makes it a
uuid referencing `metals.metals`. `payouts.method` becomes a foreign key into
`payments.methods`. So a source CHECK is only reported when the column it
protects has **no check, no enum type and no foreign key** — a sound test of
"nothing replaces this" rather than a guess. Ten CHECKs, three reported.

- **`exchange.scrap(purity)` and `(purity_actual)`, both `>= 0 AND <= 1`, land
  in `orders.items(purity)` and `refiners.items(purity)` with nothing.** This is
  the one to care about, and it is the second time this column has come up: the
  precision audit already found `orders.items` declared `purity numeric(4,3)`
  against an unconstrained source, so `.9999` fine gold was stored as `1.000`.
  The type has been fixed; the *range* is still unguarded. Purity multiplies
  into content and content into price, so a value entered as `99.99` rather than
  `0.9999` is a hundredfold error that `exchange` refuses today and the new
  schema would accept. Dev holds 20 scrap rows with a purity, all between 0.011
  and 1 — so the constraint is meaningful and currently holds.
- **`exchange.carrier_pickups(pickup_status)`** — an allowlist of pending /
  scheduled / completed / canceled — lands in `shipping.pickups(status)`, which
  is plain `text`. Checked rather than assumed: it is not an enum type, and it
  has no foreign key.

The mints allowlist is NOT in that list, and the first version of the check
wrongly said it was: `exchange.mints` maps to both `products.mints`, which
carries the allowlist exactly, and `organizations.organizations`, whose `type`
is a different concept that merely shares a column name. One verdict per
constraint, not one per target.

### And 2 foreign keys carried over without the key

The fourth kind, and the one that most needed narrowing. A naive comparison —
"the source has an FK on these columns, does the target" — reports **four**
losses, and **two of them are wrong**, because a relationship legitimately moves
table:

- `exchange.addresses(user_id)` → `places.user_addresses(user_id)`, a join table
  that keeps the FK.
- `exchange.carrier_pickups(user_id)` → reachable through
  `fulfillments.pickups(fulfillment_id)` → fulfillment → order → user.

Both of those targets have no `user_id` column at all, which is the tell. So the
check only judges a target that **has** the mapped column and has no foreign key
on it — the case where the column was carried over and the guard was not. That
was verified by hand against all four before the rule was narrowed, rather than
tuning until the output looked tidy. 35 carried-over keys, two reported:

- **`exchange.account_transactions(user_id)` → `payments.ledger(user_id)` has
  the column and no foreign key.** This is the credit ledger — 17 rows, 8
  customers, $66,999.32. Today a ledger entry cannot name a user who does not
  exist. Afterwards it can, and an orphaned ledger row is money attributed to
  nobody.
- **`exchange.payment_intents(session_id)` → `payments.intents(session_id)`**,
  same shape. Arguably deliberate: sessions expire, and a foreign key to a row
  that gets cleaned up is its own problem. Worth a decision rather than a fix.

Read `pg_index`, not `pg_constraint`, if you extend this. A bare `CREATE UNIQUE
INDEX` is not a constraint row, and my first two attempts queried `pg_constraint`
and both reported zero single-column uniques outside primary keys — for a schema
with a `users.email`. Two wrong answers that agreed with each other.

## The admin pool-remediation edit posted to the wrong route

`useUpdatePoolRemediation` posted to `/purchase_orders/update_pool_oz_deducted`
with a body of `{ purchase_order_id, pool_remediation }`. That route's service
destructures `pool_oz_deducted`, which the body does not contain — so it arrived
`undefined`, pg wrote NULL, and the remediation was never saved. Two money
fields wrong in one click: the one being edited discarded, a different one
erased. `/update_pool_remediation` had **zero** callers.

**A test already drove all four of those routes and could not see this.**
`money-edits.test.js` posts to each one from an `ORDER_EDITS` table with the
correct body key and reads the row back — so it passes, and would have passed
before this fix. It tests whether the route writes the column. Nothing tested
whether the *frontend* calls the route that reads what it sends.
`admin-mutation-urls.test.js` now does, checking each mutation against the keys
the API service actually destructures. It fails against the old URL.

Route name does not equal field name, which is why a simpler check would not
have worked: `/update_shipping_actual` reads `shipping_fee_actual`, and
`/update_refiner_premium` takes an `item_id` too. The service is the authority.

**And in production both pool routes answer 500 anyway.**
`exchange.purchase_orders` there has neither `pool_oz_deducted` nor
`pool_remediation` — migration 033 adds them and no migration has been applied
to production, so both fail with `42703, column does not exist`. The admin UI's
pool fields have never worked there. That also means the wipe is *armed by a
migration* rather than happening now: applying 033 without this fix would turn a
loud 500 into a silent erasure.

Worth keeping in view generally: **the suite runs against dev, which is ahead of
production, so no test in it can see a column production lacks.**

### Two corrections to this file

- The route-coverage warning above is right and I ignored it. I measured
  "27 routes no test drives" by matching literal paths, which this file already
  records as undercounting, and four of my examples were driven by
  `ORDER_EDITS` all along.
- The nullability note in the contracts section says `pool_remediation` and
  `pool_oz_deducted` are the only non-nullable columns on
  `exchange.purchase_orders`. Measured now, dev has exactly two NOT NULL
  columns on that table and they are `id` and `order_number`; production does
  not have the pool columns at all. I have not rewritten that note because I
  cannot tell what it was measuring, but it does not match either database
  today.

## Both customer order emails are sent by the browser, not the server

Measured after fixing the offer-accepted URL, because that bug's real question
is not "why was the path wrong" but "why did nobody notice for so long".

Of 20 `apiRequest` calls in the frontend, **18 are inside a `mutationFn` and
exactly 2 are not** — and the two are the order emails:

- `POST /emails/purchase_order_created`, in a mutation's `onSuccess`
- `POST /emails/purchase_order_offer_accepted`, in a mutation's `onSuccess`

Nothing server-side sends either. `sendCreatedEmail` and `sendAcceptedEmail`
are reachable only through their HTTP routes, and only those two calls reach
them. So a customer's order confirmation depends on their browser making a
second request *after* the order has already been placed.

**A call in a `mutationFn` is the mutation** — if it fails, the mutation fails
and the user is told. **A call in `onSuccess` is a follow-up** — the operation
already succeeded, the UI already said so, and `apiRequest`'s throw becomes an
unhandled rejection. Nothing retries. That is precisely why a wrong path
survived: every customer accepted their offer successfully and simply never got
an email.

The same fragility remains for the created email even with correct paths: a
closed tab, a dropped connection or a 500 from the mail provider all produce a
placed order and no confirmation, silently.

`shared/http/browser-triggered-effects.test.js` pins the two against a committed
allowlist, so a third such call — or either of these moving — fails rather than
passing quietly. It does not object to the design; that is **D31**, and it is
Jacob's call.

## Two *_WIRE switches would break the frontend if flipped today

CLAUDE.md sets the rule: "`*_SOURCE` moves when the data is ready; `*_WIRE`
moves when the frontend is." The first half has `verify:parity`,
`audit:coverage`, `audit:precision` and now `audit:constraints`. The second
half had nothing. `pnpm --filter @dorado/api audit:wire-readiness` measures it.

A wire adapter renames fields on the way out: while `PRODUCTS_WIRE` is
`legacy`, `products.name` leaves the API as `product_name`. Flip it and the old
name stops arriving. So "is the frontend ready" is a question with an answer —
does the frontend still read the legacy names?

Three of the seven adapters are simple renames and can be counted:

| switch | verdict | legacy names the frontend still reads |
| --- | --- | --- |
| `MEDIA_WIRE` | **clear** | `checksum_sha256` → `checksum`: 0 |
| `PRODUCTS_WIRE` | **would break** | `product_name` 98, `product_type` 19, `product_description` 7 — **124** across 24 files |
| `SPOTS_WIRE` | **would break** | `bid_spot` 66, `ask_spot` 17 — **83** across 27 files |

Counts are occurrences, not lines — a direct `grep -c` reports fewer because it
counts lines that match. Do not report the two numbers as a disagreement.

**What this cannot answer, stated rather than counted as clean.** The other
four adapters — `ADDRESSES_WIRE`, `CARRIERS_WIRE`, `PAYMENTS_WIRE`,
`REFINERS_WIRE` — are structural `lift.ts` adapters that flatten or nest rather
than rename, so there is no name to look for. And `SPOTS_WIRE` also renames
legacy `type` to `name`; "type" is too common a word in TypeScript to
attribute, so it is reported as unmeasurable. Those five report `?`, never
`yes`. Read the adapter and the components by hand before moving any of them.

`type` is narrowed rather than shrugged at: the script scopes the count to
files that import `features/spots/types` and reports **31 `.type` accesses
across 12 files**. Reading those by hand is what found the following, and it is
the most serious consequence of any switch on this list.

**The `type` rename is the dangerous one, and it fails silently to $0.** The
frontend matches a metal's spot price by `spotPrices.find((s) => s.type ===
item.scrap.metal)` — 43 sites, including every purchase-order total. Flip
`SPOTS_WIRE` and `s.type` is `undefined` on every row, so every one of those
finds returns `undefined`. `getPurchaseOrderScrapPrice` then does:

```ts
const bid_spot = orderSpot?.bid_spot ?? globalSpot?.bid_spot ?? 0
const price = item.price ?? (item.scrap.content ?? 0) * (bid_spot * premium)
```

The `?? 0` is a deliberate fallback and it swallows exactly this case: the
price becomes `item.price ?? 0`. Where no explicit price is set, a customer's
scrap is valued at **zero** — on a purchase order, which is money the business
pays them — with no error, no empty state and no failed request. `ask_spot` and
`bid_spot` at least disappear loudly; `type` disappears quietly and takes the
prices with it.

**Why nothing caught this earlier, and why nothing else will.** The frontend
does not import `@dorado/contracts` — not once, and it is not a dependency of
`frontend/package.json`; only `api/package.json` declares it. CLAUDE.md's
layout section calls contracts "zod schemas shared by both", and that is not
what the repo does: every type the frontend holds for API data is hand-written
and checked against nothing. A wire rename is therefore invisible to `tsc` on
both sides — the API is self-consistent, and the frontend agrees with itself
about a shape the API would no longer send. `validate:wire` proves the
contracts match the API's own output in both directions; it has no view of the
consumer at all.

**The floor is the point of the script.** Its first version walked zero files —
it was run from `api/` and looked for `api/frontend` — and reported every
switch clear, which is the answer that would have got a switch flipped. It now
resolves the frontend from its own location (verified identical from `api/`,
the repo root and `/tmp`) and refuses below 100 files, because a scan that
reads nothing agrees with whatever you hoped.

### The frontend has its own zod schemas, and they are stricter than the contract

The frontend does not import `@dorado/contracts`, but it is not untyped — it
keeps **15 of its own `z.object` schema files** describing the same wire
shapes. Two independent zod definitions of one wire, and nothing compares them.

Most are used only for type inference, where a mismatch is silent. Five are
used to `.parse()` for real, and all five parse **outgoing** checkout payloads
rather than API responses — which is what makes one of them interesting:

```ts
// features/orders/salesOrders/types.ts
export const adminSalesOrderCheckoutSchema = z.object({
  ...
  order_metals: z.array(spotPriceSchema),   // required
})
```

`createSalesOrderDrawer.tsx` fills `order_metals` straight from the API's spot
prices (`setData({ order_metals: spotPrices })`) and then calls
`adminSalesOrderCheckoutSchema.parse(checkoutPayload)`. So an API response is
parsed by a frontend schema after all, one hop removed. `.parse()` takes
`unknown` and the store is a `Partial<>`, so `tsc` cannot see any of this.

The two schemas disagree about null:

| field | contract (`SpotPriceWire`) | frontend (`spotPriceSchema`) | prod column |
| --- | --- | --- | --- |
| `ask_spot` | `z.number().nullable()` | `z.number()` | `NOT NULL` |
| `bid_spot` | `z.number().nullable()` | `z.number()` | **nullable** |
| `percent_change` | `z.number().nullable()` | `z.number()` | **nullable** |
| `dollar_change` | `z.number().nullable()` | `z.number()` | **nullable** |

**Not live — verified.** Production has 4 metals rows and zero nulls in all
four columns, so the parse succeeds today. But three of the columns permit
null, and the contract says so; a single null in any of them — one partial spot
update from the provider — makes `.parse()` throw a `ZodError` and blocks
**admin sales-order creation**, with no server-side fault to find.

`spotPriceSchema` also declares `created_at`/`updated_at` as `z.date()`, which
would reject the strings JSON carries. That one is inert because `MetalsRow`
has no timestamp columns, so the fields are absent and both are `.optional()`.
It is worth knowing they are one schema change away from mattering.

Both of these exist because the consumer's schema was written by hand against
an assumption rather than derived from the contract. Making the frontend depend
on `@dorado/contracts` would collapse this whole class, and is the obvious fix
— but it changes a build boundary, so it is Jacob's call, not a night edit.

### Every field the frontend requires that the database allows to be absent

`pnpm --filter @dorado/api audit:frontend-nullability` (`--prod` for the
authoritative answer) finishes the class D33 opened. It compares each frontend
zod schema against the `exchange` columns it describes and reports every field
the schema **requires** whose column **permits NULL** — reading
`information_schema` only, so it never selects a value and stays clear of
`exchange.payouts`.

Against production: **77 fields compared, 31 stricter than the database, 17 of
them in schemas that are actually parsed at runtime.**

| schema | table | required-but-nullable |
| --- | --- | --- |
| `addressSchema` | `addresses` | `user_id`, `line_1`, `city`, `state`, `country`, `country_code`, `zip`, `name`, `phone_number`, `is_valid`, `is_residential` |
| `productSchema` | `products` | `sell_display`, `is_generic` |
| `spotPriceSchema` | `metals` | `bid_spot`, `percent_change`, `dollar_change` |
| `userSchema` | `users` | `name` |

**None is live. Measured: 247 production rows across those four tables, and not
one null in any of the seventeen.** Each is a single row away from throwing a
`ZodError` in the browser, with no server-side fault to find, because these
schemas sit in the checkout `.parse()` path.

**A mismatch is not automatically a defect, and the report says so.** A form
schema *should* be stricter than its column — the user must supply what the
database allows to be absent. `wireSchema` requiring `routing_number` is
correct. What narrows the list is whether the schema is reached from a real
`.parse()` call, computed transitively from the five call sites; the other 14
can disagree with the database forever in silence.

**Two guards, both of which caught something immediately.**

- *Suspect mappings.* The report prints how many of a schema's fields are
  actually columns of the table it is mapped to. `pickupSchema` matched **0 of
  6** and had been reporting a clean "yes" — a check that proved nothing.
- *Shared words.* `serviceSchema` was mapped to `carrier_services` and reported
  that it requires `code` while `code` is NULL in **all 8** production rows —
  which looks like a live broken checkout. It is not: `serviceSchema` is a
  FedEx rate quote (`serviceType`, `netCharge`, `transitTime`, a Lucide
  `icon`), and `code` is the only word it shares with that table. The mapping
  was removed. This is the third time a shared column name has produced a
  false finding on this project.

`--self-test` requires the detector to still report `spotPriceSchema.bid_spot`,
a case known to be true; if that stops appearing, every other "yes" is
worthless.

**A side effect worth keeping:** dev reports 30 and production 31. The extra is
`products.sell_display` — `NOT NULL` in dev, nullable in production, because
the migration that tightened it has not been applied there. Running the two and
diffing is a cheap way to see that drift.

## The purchase-order pricing functions disagree about what a line is worth

Eight functions in `frontend/features/orders/purchaseOrders/utils/` compute
what the business **pays** a customer for the metal they sent in.
`purchaseOrderTotal` alone is imported by 10 files. **None of them had a
test** — checked by symbol rather than by filename, because path-matching has
undercounted here before.

`purchaseOrderPricing.test.ts` now covers six of them, 16 tests. Writing it
surfaced two disagreements about the same question: what premium applies when
a line carries no price and no premium of its own.

**Scrap: the line and the total use different premiums.**

```ts
// getPurchaseOrderScrapPrice  - what one line displays
item.price ?? (scrap.content ?? 0) * (bid_spot * (item.premium ?? scrap.bid_premium ?? 1))

// purchaseOrderScrapTotal / purchaseOrderTotal  - what the order sums to
item.price ?? (scrap.content ?? 0) * (bid_spot * (item.premium ?? 1))
```

The per-line function consults the scrap record's own `bid_premium`; both
functions that total the same items skip it. A scrap row with
`bid_premium = 0.9` at gold 3000 **displays 2700 and sums to 3000** — the total
is not the sum of the lines shown above it, and it is the total that is larger.

**Bullion: the default premium is 0 in one place and 1 in another.**
`purchaseOrderBullionTotal`, `purchaseOrderTotal` and
`getPurchaseOrderBullionPrice` resolve a missing premium to `0`, which prices
the line at **nothing**. `getPurchaseOrderItemPrice` resolves it to `1`, which
prices the same line at **full spot**.

**One function fails loudly where the rest fail silently.**
`getPurchaseOrderItemPrice` does `spots.find(...)!` and throws a `TypeError`
when no spot matches the metal. Every other function absorbs that into `?? 0`.
That is the same silent-zero path D32 is about.

**None of this is live. Measured against production:** 89 purchase-order items,
7 with no price, and **not one with neither a price nor a premium**. Every item
either carries an agreed price or its own premium, so no fallback in any of
these functions is currently reached.

**Which premium is correct is a business question, so it is not fixed here —
it is D34.** The tests state the behaviour as it stands and were mutation-checked:
making `purchaseOrderScrapTotal` consult `scrap.bid_premium` fails exactly the
two tests that assert the divergence and no others.

### What a customer pays was untested too

The same by-symbol scan that found the purchase-order gap, run across every
`utils/` file in the frontend: **25 files with exports, 6 with no symbol
referenced by any test.** The valuable one was
`features/orders/salesOrders/utils/calculateSalesOrderPrices.ts` — the sell
side, deciding the item total, whether shipping is free, how much account
credit is consumed, the card surcharge, and the number the customer is charged.
`calculateSalesOrderPrices.test.ts` covers it in 20 tests.

What the tests pin, none of it changed:

- **An unrecognised payment method is billed 2.9%.** `calculateCardCharge`
  takes a plain `string` and resolves an unknown method to `?? 0.029` — the
  card rate, the most expensive of the six. Not free, not an error. The enum
  keeps TypeScript callers honest; the function itself does not.
- **Free shipping is strictly above 1000.** An order of exactly 1000 pays.
- **The surcharge applies after account funds**, so paying part of an order
  with credit reduces the surcharge as well, and an order fully covered by
  funds carries none even by card.
- **The surcharge applies to sales tax too** — 1000 of metal with 80 of tax is
  charged 31.32, not 29.
- **Two ways an item is given away for nothing.** `calculateItemTotals` uses
  `item.ask_premium ?? 0` and `spot?.ask_spot ?? 0`, so a product with no
  premium, or one whose metal has no spot price, contributes **zero** to the
  order rather than raising anything. Same silent-zero shape as D32 and D34.

**Not live, measured:** of 95 production products, **25 have `ask_premium = 0`**
— but none of those 25 is `sell_display`, and all 21 products actually offered
for sale carry a real premium. Flipping one of those 25 to visible would sell
it for nothing, silently.

Mutation-checked twice: moving the free-shipping boundary to `>=` fails exactly
1 test, and charging the surcharge on `baseTotal` instead of the post-funds
amount fails exactly 2.

**Still untested**, and the next one worth doing: `calculatePurchaseOrderTotals.ts`
— 304 lines splitting an order three ways between the customer, the business
and the refiner. It deserves its own pass rather than a hurried one. The other
four uncovered files are form/address helpers and `cn`.

## The rate resolution exists twice, and nothing checked the copies agree

`frontend/features/rates/utils/resolveRate.ts` carries its own instruction:
*"this file is mirrored 1:1 in the API … keep the two in sync."* Nothing
checked it, and the path it named — `features/rates/utils/resolveRate.js` —
**does not exist**; the API's copy became `.ts` in the TypeScript conversion, so
the one pointer a reader had was stale.

This matters because of what the function does. `getRatePct` resolves the
payout premium for a metal, tiered by the total quantity of that metal in the
order. **The frontend copy quotes the customer a rate and the API copy pays
it.** If they drift, each side is self-consistent and neither test suite
notices — the frontend tests its copy, the API tests its own, and both pass
while a customer is shown one number and paid another.

**Checked: they agree today.** `getRateBand`, `getRatePct` and
`sumContentByMetal` are statement-for-statement identical once formatting is
set aside.

`api/shared/mirror.test.js` now holds them there. It compares the
extracted function bodies rather than behaviour, because the frontend copy
imports a type through the `@/` alias that the API's runner cannot resolve.

**One difference is real and is allowed by name, not by a loose comparison.**
The API tolerates a null list — `(rates ?? [])`, `items ?? []` — where the
frontend does not, which is correct: the API's input arrives off the wire and
the frontend's is typed. That is normalised away explicitly, and a further test
asserts **the API still has both guards**, so removing its null tolerance fails
rather than quietly making the two files "agree". `formatRate` is frontend-only
and is display rather than arithmetic, so it is deliberately not required.

Mutation-checked: making the frontend read the bullion band for scrap fails
exactly one test — `getRatePct` — and nothing else.

**Still untested**, and the reason this was found: `calculatePurchaseOrderTotals.ts`,
304 lines splitting an order three ways between customer, business and refiner.
Reading it is what led to the mirror comment. Two things in it to write down
before they are forgotten: `dorContent` is computed as a **remainder**
(`basis - customer - refiner`) and goes **negative** when a scrap lot assays
lower than the estimate the customer was quoted on, so the business absorbs the
shortfall; and the per-metal percentages are shares of that same total, so they
can exceed 100% when one party's content is negative.

### How an order is split three ways, now stated

`calculatePurchaseOrderTotals.ts` divides one purchase order between the
customer, the business and the refiner — 304 lines, and the last of the money
utilities with no test. `calculatePurchaseOrderTotals.test.ts` covers it in 28
tests. Nothing changed.

**The two premiums are positions on a line, not slices.** The dorado premium is
the fraction of spot the customer receives; the refiner premium is the fraction
the refiner returns. The business keeps the gap between them and the refiner
keeps what is above. Give only one and the other mirrors it, so the business
keeps nothing. Give neither and the customer takes the whole lot.

**The customer is valued at the order's spot; the other two at the refiner's.**
That difference on the customer's metal is `getSpotNet`, and it is credited to
the business alone. A metal is **skipped** when either spot is missing, rather
than treated as a zero spot — which would book the whole lot as a loss.

**A lot that assays below its estimate makes the business's content negative,
and that is the intended direction.** The customer's share is computed on the
**estimate they were quoted**; the refiner's and the business's are computed on
**what actually came back**. The business is the remainder, so it absorbs the
shortfall: an estimate of 1 oz that assays 0.8 credits the customer 1 and the
business −0.2. The per-metal percentages divide by that same total, so the
customer reads **125%** and the business **−25%**. A percentage over 100 on
this screen is this case, not an arithmetic fault.

**When the business premium is set above the refiner's**, the shares no longer
sum to one and the remainder is rescaled — out of the refiner's share, never
the customer's. The customer still receives exactly what was promised. Premiums
above 1 are clamped, so no line pays out more than the metal is worth.

Mutation-checked twice: ignoring the actual assay and using the estimate for
everyone fails exactly 3 tests, all of them the shortfall cases; valuing the
customer at the refiner's spot fails exactly 1.

**That empties the money side of the untested list.** What remains has no
pricing in it: `addresses/utils/form.ts`, `addresses/utils/places.ts`,
`shipping/utils/getRatesInput.ts` (a hook), and `shared/utils/cn.ts`.

## Weight conversion exists three times, and nothing compared them

The same by-symbol scan, pointed at `api/shared/`: **17 files with exports, 8
with not one symbol referenced by any test.** The interesting one was
`shared/utils/convertWeights.ts`.

Weight conversion exists in **three** places — this file, the frontend's copy,
and the SQL function `metals.convert_to_troy_oz`. The frontend's copy has had a
test for a while, and that test's own comment records all three and the way
they differ. But **the API's copy — the one the business actually pays people
with — had no test at all**, and nothing had ever compared any copy against the
database function.

Every price in the system is per troy ounce, and a scrap line's content times
spot times premium is what a customer is paid. So this is the boundary where a
customer's grams become the unit the business trades in, and three copies
disagreeing is a pricing bug rather than untidiness.

`api/shared/utils/convertWeights.test.js` now checks the API copy against the
SQL function directly, across `t oz`, `g`, `dwt` and `lb`, at five magnitudes
each, and case-insensitively. **They agree everywhere.**

**The one documented divergence is pinned rather than fixed.** An unrecognised
unit returns `0` in both JavaScript copies and `NULL` from the SQL function.
Zero is the more dangerous answer — a scrap line in a unit nobody anticipated
is silently worth nothing and nothing about the result says it failed, where
NULL at least propagates. Nothing calls the SQL function today, so it is
latent; it is now asserted from both sides so changing either is deliberate.

**The mirror guard is now general and has moved.** `api/shared/mirror.test.js`
(was `features/rates/utils/mirror.test.js`, which was the wrong home once it
covered more than rates) is table-driven over both mirrored pairs — the rate
resolution and weight conversion — and asserts it extracted all four function
bodies rather than comparing empty strings.

**Weight conversion was the worse of the two, because it said nothing.** The
rate resolution at least carried a "mirrored 1:1, keep in sync" comment, which
is what made anyone look. `convertWeights` carried no comment in either copy;
it was only found by scanning for untested exports. Both files now name their
counterparts and the test that holds them together.

Mutation-checked: nudging the API's grams-per-troy-ounce constant fails 1 test
in the mirror guard and 3 in the three-way comparison.

**Still untested in `api/shared/`**, and worth a look in that order:
`middleware/authMiddleware.ts`'s `requireVerifiedUser` (a security gate),
`wire/rename.ts`'s `makeWireAdapter` and `wire/middleware.ts`'s `wireShape`
(the machinery behind every `*_WIRE` switch and D32), `http/caller.ts`'s
`callerId` and `requiredParam`, then `env/required.ts`, `http/query.ts`,
`testing/is-test-run.ts` and `utils/formatPhoneNumber.ts`.

## The middle rung of the role ladder is unoccupied, and the guard for it is a trap

`api/shared/middleware/authMiddleware.ts` exports three guards from one ladder:
`requireUser` (1), `requireVerifiedUser` (2), `requireAdmin` (3). The scan for
untested exports flagged `requireVerifiedUser`; looking at why produced
something better than a missing test.

**It is mounted on nothing.** Across every `routes.*` file: `requireAdmin`
appears in 93 places, `requireUser` in 62, `requireVerifiedUser` in **zero**.

That would be unremarkable if it were merely unused. It is worse than unused:

- **It checks a role nobody holds.** Production carries **73 `user` and 2
  `admin`**; dev carries 9 and 3. **Not one row in either database has the role
  `verified_user`.**
- **It never reads `emailVerified`,** which is a separate column — and **53 of
  75 production users are not verified**.

So mounting it on a route, which its name invites, would **refuse every
customer and admit every admin**, and the name would make that look like the
intent rather than an accident. Nothing is broken today; it is armed for the
next person who wants "verified users only" and reaches for the obvious import.

`features/authorization/role-ladder.test.js` pins it unmounted, so using it
becomes a deliberate act taken after reading the note rather than a
reasonable-looking import. It also pins the three rungs and their order, that
the guard does not consult `emailVerified`, and that an unrecognised role
resolves to level 0 and is refused rather than trusted — the safe direction,
and not the obvious one to write. The scan asserts it reached the route files
and that the other two guards are found, so it cannot pass by reading nothing.

Mutation-checked twice: mounting `requireVerifiedUser` on a route fails exactly
1 test, and adding a rung to the ladder fails exactly 1.

**The question underneath is D36**, and it is not mine: **53 of 75 production
customers have never verified their email, and no route requires it.** Whether
that should be true of placing an order, or of requesting a payout, is a
business call. If the answer is yes, the fix is not this guard — it would need
to read `emailVerified` rather than a role rung that will stay empty.

## The machinery behind every `*_WIRE` switch had no test

`shared/wire/rename.ts` (`makeWireAdapter`) and `shared/wire/middleware.ts`
(`wireShape`) decide what shape leaves the API — the axis D32 is about — and
neither had a test. `shared/wire/adapter.test.js` covers both in 15 tests.
Nothing changed.

**The safe direction is the point.** An unset switch, or one holding a typo,
`"NEXT"`, `"true"` or a trailing space, resolves to **legacy** — never to the
shape the frontend has never seen. That is pinned across seven bad values.
`fromWire` converts in *both* switch positions, which is right and looks wrong
until you see why: a request already in the new shape has no legacy names left
to rename, so converting it is a no-op.

**Two sharp edges, both stated.** `rename()` writes into a fresh object, so a
row that *already* holds the key a rename is about to write loses one of the
two values silently — the row's own value wins and nothing says a field went
missing. And the double-apply guarantee only holds while no legacy name is also
a new name. Neither can happen today, and a structural test over the real
adapters is what keeps that true: no map may send two fields to one legacy
name, and no legacy name may also be a new name. Measured across all three
rename maps (`MEDIA`, `PRODUCTS`, `SPOTS`) — clean, and the test refuses if it
finds fewer than three maps.

**One test I wrote was worthless and mutation testing caught it.** The
"applies once per response" test used a rename adapter — and a rename applied
twice renames nothing the second time, exactly as the source comment says. So
deleting the guard entirely left all 15 tests passing. Rewritten with a
counting adapter that is *not* idempotent, which is the case the guard actually
exists for: `flatten()` on an already-flat object nulls every field it meant to
lift. **A test of an idempotency guard must use something non-idempotent.**

Mutation-checked three ways: making the fallback select `next` fails 1 test,
deleting the applied-once guard fails 1 (after the rewrite — 0 before it), and
pointing two fields of a real map at one legacy name fails 1.

## `validate:wire` could not see a field that should not be there

The untested-exports scan over `api/features/` came back nearly clean — **155
files with exports, 7 with no symbol in any test** — and the interesting ones
were the product field lists. Following them produced a gap in a gate rather
than a bug in the lists.

**zod strips unknown keys; it does not reject them.** `validate:wire` calls
`schema.safeParse(row)` and no contract uses `.strict()`, so a response
carrying a column nobody declared parsed clean. The check could see a missing
field and a mistyped one, and was blind to an extra one — which is precisely
the hazard `features/products/constants.bullion.ts` names in its own comment:
*"a projection that silently grew is how columns start leaking onto the wire."*

Undeclared keys are recoverable by diffing what went in against what
`safeParse` handed back. Measured first: **zero undeclared fields across all 61
endpoint shapes.** So refusing costs nothing, and `validate:wire` now fails on
one. Mutation-checked: adding one column to `PRODUCT_FIELDS` fails the gate
(exit 1) and names the three endpoints it reached.

**The field lists themselves are also now pinned.** There are eight across two
files — `exchange.products` and the new `products.bullion`, each with a public
and an admin list, each of those with a `WITH_ALIAS` twin for joined queries.
Four pairs that must agree, and no test. `constants.test.js` holds:

- each list and its alias twin project the same fields **in the same order**;
- **everything public is also admin**, with exactly nine admin-only fields
  (`created_at`, `created_by`, `display`, `filter_category`,
  `homepage_display`, `quantity`, `stock`, `updated_at`, `updated_by`) — the
  disclosure boundary;
- the exchange and bullion lists deliver **the same shape from differently
  named columns**, asserted alongside a check that they really are different
  underneath, or that comparison would be trivially true.

Mutation-checked: putting `stock` in the public list fails 3 tests; drifting an
alias twin fails 1.

**Worth knowing:** three of the eight constants had **no importer at all** —
`ADMIN_PRODUCT_FIELDS`, `BULLION_PRODUCT_FIELDS_WITH_ALIAS` and
`BULLION_ADMIN_PRODUCT_FIELDS`. They are symmetric completions of the set
rather than mistakes, and they are left in place. Note that the new test now
references them, so a future dead-export scan will no longer report them —
this paragraph is the record that they had no production consumer as of today.

Also checked and clean, so it is not re-investigated: `shared/http/caller.ts`.
`callerId` throws 401 and `requiredParam` throws 400, and the error handler
reads `raised.statusCode || raised.status`, so both refusals reach the client
as intended rather than becoming 500s. The nine direct `req.user` reads outside
it are all guarded routes or explicit admin checks, and `emails/controller.ts`
resolves its recipient through an ownership-or-admin check that refuses 403.

## The map two audits believe was never checked against the database

`audit:coverage` asks whether a column has anywhere to go; `audit:precision`
asks whether what it lands in can hold the value. Both read
`scripts/lib/feature-map.mjs`, and **nothing validated the map itself**. A table
or column named there that does not exist makes a mapping quietly inert: the
audit walks past the column and reports nothing wrong.

That failure mode is already recorded twice in the map's own comments —
`exchange.carrier_services` was migrated and never declared, so "neither audit
had been looking at it", and `exchange.account_transactions` went unnoticed the
same way, seventeen production rows of customer credit. **A misspelling fails
identically to an omission and is harder to see.**

`scripts/lib/feature-map.test.js` now checks every name in the map against
`information_schema`:

- every table `FEATURES` names, source and target;
- every column a rename comes **from**, on its source table;
- every column a rename goes **to**, on one of that table's declared targets —
  the one that matters, because a target that does not exist means coverage
  believes a column landed somewhere it did not and reports the feature clean;
- every column `DELIBERATE` excuses, so a stale excuse cannot hide a live gap;
- every table and column in a value `FLOW`, on both sides.

**The map is sound — all six pass.** It also asserts it read a real schema
(>50 tables, `exchange.products` present, ≥15 features declared) so it cannot
pass against an empty map, and that it checked at least 40 rename targets and
5 flow columns.

**One thing I got wrong, and it is the useful part.** The flow check failed
first run on `orders.items.post_melt,content`. That is not a broken map: a
source column may flow into **more than one** target, so
`exchange.products.content` is declared as `["post_melt", "content"]` and my
check treated the array as a single column name. The map was right and the test
was wrong. Fixed the test.

Mutation-checked three ways, each failing exactly one test and exiting 1:
misspelling a target table, pointing a rename at a column that does not exist,
and naming a missing column in a value flow.

**Also checked, and left alone:** `features/orders/fragments.ts`. Its stated
disciplines — `userJson` returning exactly three fields, `to_jsonb(addr)` being
an unbounded whole-row projection — are now covered by the undeclared-field
refusal added to `validate:wire`, since `order.user` and `order.address` are
both among its 61 shapes. A widened projection there fails that gate.

## A second copy of every secret, and the sibling script that still reads it

`packages/contracts/scripts/generate-tables.mjs` carries a long comment about a
bug it already fixed: the package had **its own `.env`**, holding a second copy
of the database password and a connection string naming `dorado_db_dev` — the
name the databases had before they were renamed to `prod`/`dev`/`test`. The
generator was repointed at `api/.env`, and the comment closes with "one source
of truth, and one fewer copy of the credentials on disk."

**The file was never deleted, and its sibling still reads it.**

`packages/contracts/scripts/validate-against-db.mjs` still did
`import "dotenv/config"`, which resolves relative to the **current working
directory** — so it picked up the stale copy and died on
`database "dorado_db_dev" does not exist`. It had been failing for anybody who
ran it, and nobody had: **it is in no gate.** Repointed at `api/.env`, the same
fix the generator carries. It now runs and passes — **36 of 36 tables with data
validate cleanly.**

**`packages/contracts/.env` is still on disk and holds 50 variables** — among
them `BETTER_AUTH_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the
FedEx client secrets, `GOOGLE_CLIENT_SECRET`, `MINIO_SECRET_KEY`,
`RECAPTCHA_SECRET_KEY`, `SPOT_API_KEY`, `EMAIL_PASSWORD`, and both database
URLs. It is gitignored and **not tracked**, so it is not in the repository's
history — this is a duplicate on the machine, not a leak into git.

**Compared safely — variable names and value hashes, never values:** it holds
**nothing `api/.env` lacks**. All 50 of its variables are also in `api/.env`;
only `DATABASE_URL` and `PROD_READONLY_DATABASE_URL` differ, and both of its
versions are the stale ones. `api/.env` has four more it does not.

**So deleting it loses nothing — but it is an untracked credentials file, so it
is not mine to delete. That is D37**, and it matters for a job already on the
list: rotating the leaked FedEx credentials and the database password means
updating *both* copies, or the stale one keeps the old values sitting around.

### The committed contracts are now checked for freshness

CLAUDE.md says types come from generated contracts and "after any schema
change, regenerate" — an instruction with **no enforcement**. `pnpm check` ran
`contracts build`, which compiles whatever is committed and says nothing about
whether it still matches the schema.

`verify:fresh` regenerates into a temporary directory and compares, so it never
writes to `src/generated` and a failure leaves the tree untouched. **All 18
files match the database today.** It refuses below 10 generated files, so a
generator that half-ran cannot pass.

Both this and the existing `validate` now run in `pnpm check`. The stale-`.env`
bug is exactly why an unrun gate is worth little: `validate` had been broken
long enough for the databases to be renamed underneath it.

Mutation-checked: editing a committed contract fails with `leads.ts: differs
from what the database produces`; removing one fails with `rates.ts: generated
but not committed`. Both exit 1.

## Where every gate stands, measured tonight

`pnpm check` is green, but it runs only some of the verifiers. This is the
current state of the ones it does not, run end to end. **Nothing here is a
regression from tonight's work** — no commit tonight touched a repo, a service
or a migration.

**Clean, exit 0:** `audit:routes` (132), `audit:switches` (no switch set to a
value it does not have), `audit:constraints`, `audit:nullability` (161 columns
could take NOT NULL as-is, 110 need a decision), `audit:wire-readiness` and
`audit:frontend-nullability` including both `--self-test`s,
`audit:coverage --prod` (every populated column has somewhere to go), and
**`audit:precision --prod` — 0 columns whose value the target type would
change**, across 57 type differences examined.

**`audit:test-leaks`: no table changed.** Run deliberately, because roughly 90
tests were added tonight and this is the check that work could break. The suite
leaves nothing behind in dev.

**`audit:payments --prod` exits 1, and the numbers are unchanged.** I first read
"7 settled payments the database does not record as succeeded" as growth from
the five on record. It is not: 7 is the count of Stripe intents whose row
*differs*, and two of those are **refunds**. The paid-but-unrecorded set is
still **3 intents, $126.48**, plus two paid charges with no row at all —
exactly what was already written down.

### The one parity failure is expected, and it is worth writing down why

`verify:parity` reports a single **NOT SAFE**:
`exchange.metals -> metals.exchange_compat`, 4 rows, **4 differing values**.

It is **staleness, not corruption**. All four metals differ on all four price
columns by plausible market moves — gold `4599.06` against `4326.81`, about 6%.
`exchange.metals` is rewritten by the spots cron every few minutes; the new
schema holds a point-in-time backfill.

**Dual-write already exists.** `features/spots/repo.dual.js` `updateQuotes`
writes `exchange` *and* `next`. The drift exists only because `SPOTS_SOURCE` is
unset, so `repo.js` selects `repo.exchange` and only one side is written. **The
moment the switch goes to `dual`, the next cron tick converges them** — no
backfill needed, and re-running one is not the answer.

Written down because someone running `verify:parity` before promoting spots
will see NOT SAFE on a money table and may reasonably panic, or re-run a
backfill that is not required. It is the *only* pair that drifts, because it is
the only table a cron rewrites continuously.

### Still to triage, and not from tonight

- **`diff`: 52 operations identical, 5 diverge.** Two are `spots.getAll` and
  `spots.getAllMetals` — the same staleness as above, same explanation. The
  other three are `shipping-shipments.getAll`,
  `shipping-tracking.getEvents(first)` and `sales-orders.getAll`. The tracking
  one shows `exchange` holding *less* than the new schema: `"Dropped Off"` with
  a 2026 estimated delivery and no `delivered_at`, against `"Delivered"` with
  the real dates. That is the shape of dev's tracking history having been
  damaged — which is recorded: `tracking.test.js` deleted the real FedEx
  history of five dev shipments. **Consistent with it, not proof of it.**
- **`verify:backfill`: 29 differences.** Most are `shipping.tracking` rows the
  backfill produces that are not in the current copy, same neighbourhood as
  above. One is sharper and worth a look on its own: a single `orders.orders`
  row differing in exactly **one boolean** — `f,f,f` against `f,t,f`, every
  other column identical.

None of these blocks anything today: no switch is promoted, so `exchange` is
authoritative everywhere and these compare a live schema against a shadow.

## `updated_at` cannot tell you whether a backfill needs re-running

Triaging the one sharp item from `verify:backfill` — a single `orders.orders`
row differing in exactly one boolean — produced a rule that applies to every
feature's promotion.

**The row.** Sales order number 57: `exchange.sales_orders.order_sent` is
**true**, `orders.orders.order_sent` is **false**. The fresh backfill produces
exchange's value, so the copy is stale and the backfill is right.

**Why it drifted invisibly.** `updateOrderSent` is:

```sql
UPDATE exchange.sales_orders SET order_sent = true WHERE id = $1
```

It does not touch `updated_at`. Both rows carry the same `updated_at` to the
millisecond, and the boolean differs anyway. **A comparison of `updated_at`
would call this pair identical.**

**It is not one function.** Of **52 UPDATE statements against `exchange`
tables, 42 do not set `updated_at`** — including `editPayoutCharge`,
`changePayoutMethod`, `updatePremium`, `updateRefinerPremium`,
`updatePoolRemediation`, `updateOrderItemPrices`, `addFunds`, `removeFunds` and
`adjustUserCredit`. Money paths, most of them.

**The consequence for promotion, which is the point.** CLAUDE.md already says
migration 057 must be re-run immediately before the auth cutover because
production drifted from 74 users to 75. **That is not special to auth.** Any
feature whose exchange rows changed since its backfill has a stale copy, and
**`updated_at` cannot be used to find out** — only a value-by-value comparison
can, which is what `verify:parity` and `verify:backfill` do. So:

- re-run a feature's backfill immediately before promoting it, or
- run `verify:parity` for the pair and accept only "ok: identical".

Do **not** reason from timestamps.

**Note the difference from the spots drift.** Spots converge by themselves —
dual-write already writes both, and the next cron tick fixes it. This one does
not: `SALES_ORDERS_SOURCE` going to `dual` makes *future* writes land in both,
but this already-drifted row stays wrong until the backfill is re-run.

**Whether those 42 writes should maintain `updated_at` is D38.** It is not a
tidy-up: `updated_at` is returned on the wire for several shapes and is what an
admin screen would show as "last updated", so changing it changes what a column
means. Measured, not decided.

**A correction worth keeping.** I first read the two `updated_at` values as five
hours apart and nearly reported the row as "changed after the backfill". They
are the same instant: I queried without `TZ=UTC`, and the driver rendered a
`timestamp` and a `timestamptz` differently. The SQL comparison said zero rows
where exchange was newer, which is what caught it. **The repo sets `TZ=UTC` for
tests for exactly this reason; ad-hoc queries need it too.**

## Every open divergence is now explained

The five `diff` divergences and the 29 `verify:backfill` differences were left
untriaged. All of them now have a cause. **None is a defect in the new schema's
code**, and two point the opposite way from what you would assume.

**1. `spots.getAll` and `spots.getAllMetals` — cron staleness, self-healing.**
Gold reads `4599.42` in `exchange` and `4326.81` in the new schema. The spots
cron rewrites `exchange.metals` every few minutes and only `exchange`, because
`SPOTS_SOURCE` is unset. Dual-write already exists, so `dual` converges them on
the next tick. Same cause as the single `verify:parity` NOT SAFE.

**2. `sales-orders.getAll` — one order, and it names the wrong refiner.**
Compared all 15 sales orders on 10 fields: **exactly one row differs, on
exactly two fields.** Sales order 57 (`f437ce8a…`):

| | `exchange` | new schema |
| --- | --- | --- |
| supplier / refinery | `18b3ccd9…` — **Dillion Gage** | `d7414aa4…` — **Elemetal** |
| `order_sent` | **true** | false |

**These are not a remap.** `refiners.refiners` preserves both ids, so the new
schema is not translating — it names a **different company**. `exchange` is
authoritative, so Dillion Gage is right and the new schema is wrong for that
order. Both fields are written together by `sendOrderToSupplier`
(`attachSupplierToOrder` + `updateOrderSent`), and **neither sets
`updated_at`** — so this is D38, with a sharper consequence than a stray
boolean: promoting sales-orders without re-running the backfill would record a
customer's metal as sent to the wrong refinery.

**3. `shipping-shipments.getAll`, `shipping-tracking.getEvents`, and the
`shipping.tracking` extras — `exchange` is the damaged side, not the new
schema.** Measured:

- **5 shipments** differ on `shipping_status`, `estimated_delivery` and
  `delivered_at`;
- **8 shipments** differ on tracking-event count, and **`exchange` has fewer in
  all 8**;
- totals: **16 rows in `exchange.tracking_events` against 81 in
  `shipping.tracking`**.

That is the incident already on record — `tracking.test.js` deleting the real
FedEx history of dev shipments. The backfilled copy predates the damage and
still holds it. (CLAUDE.md says five shipments; five is the shipment-status
count, eight is the event-count count. Both are right, and they measure
different things.)

### The caveat this creates for the D38 rule

D38 says: re-run a feature's backfill immediately before promoting it. **For
shipping in dev, that would do damage** — the backfill derives from `exchange`,
and `exchange` is the side that lost 65 tracking events. Re-running it would
copy the damaged data over the good copy.

Production is unaffected: the test ran against dev. So the rule stands for
production, and **dev shipping is the one place where `exchange` is not the
better copy.** Anyone rehearsing the promotion on dev should know that before
running a backfill and concluding the tracking data was always thin.

## The indexes nobody was comparing

`audit:constraints` compares four kinds of guard between `exchange` and the
schema replacing it: NOT NULL, CHECK, foreign keys, and unique indexes. It reads
`pg_index` rather than `pg_constraint` — deliberately, because a bare
`CREATE UNIQUE INDEX` is not a constraint row and `exchange` has plenty. But it
filters on `i.indisunique`. **The plain indexes had never been looked at at all.**

That the gap survived this long is a consequence of what a plain index is. A
uniqueness guard is a correctness guard: drop it and something eventually raises
23505. A plain index guarantees nothing, so dropping it raises nothing. The query
returns the same rows, in the same order, and takes a sequential scan to do it.

Nothing downstream closes it either. `diff` compares the two implementations'
output, not their plans. `verify:parity` compares rows. `validate:wire` compares
shapes. Every one of them passes against a table with no indexes whatsoever. The
only symptom is latency — and dev holds tens of rows, where a sequential scan is
genuinely the faster plan, so **dev cannot produce the symptom.** The first
appearance would be production row counts arriving at a schema nobody had
measured, on the day a `*_SOURCE` switch moved.

### The question it asks

Not "did uniqueness survive" — that one is `audit:constraints`', and it already
reports eight source uniques with no exact counterpart while exiting 0, because a
source unique on `(number)` against a target unique on `(direction, number)` is
the *correct* meaning for a table that merged purchase and sales orders.

The question here is whether the **access path** survived. btree is only
enterable on a leading prefix, so the line between a mild degradation and a
sequential scan is whether any target index — unique, primary or plain — *leads*
with the column the source index leads with. A source index on `(a, b)` is served
by a target index on `(a, b, c)`. It is not served by one on `(b, a)`.

Note that "the foreign key is there" is not an answer: Postgres does not index a
foreign key automatically, so `audit:constraints` passing on FKs says nothing
about whether the column is indexed.

### What it found, and what was fixed

48 indexes checked across 18 features. Five access paths had no index in the new
schema. Each was then checked against the queries that actually run, which is the
half a static audit cannot do — and it split them three to two.

**Fixed in `081_the_new_schema_indexes_what_exchange_indexed.sql`:**

- **`media.images (user_id, created_at)`.** `getUserImages` is
  `WHERE user_id = $1 ORDER BY created_at DESC, id DESC`, and `media.images`' only
  non-primary index is `UNIQUE (path, filename, user_id)`, which leads with `path`
  and cannot serve it. `exchange` has a purpose-built `(user_id, created_at)` —
  the misspelling in `imges_user_created_idx` is a fair sign it was added the day
  somebody noticed. This is the sharp one: **`MEDIA_WIRE` is the single switch
  `audit:wire-readiness` reports as clear to move**, which makes media the
  likeliest feature to be promoted first.
- **`tax.sales_tax (state)`, UNIQUE.** Both live queries in
  `features/sales-tax/repo.next.ts` key on it — `isNexus(state)` decides whether a
  checkout is charged sales tax at all, and `updateStateSalesTax(amount, state)`
  is an `UPDATE ... WHERE state = $2`. UNIQUE rather than plain because
  `exchange.state_sales_tax` has `state_sales_tax_state_key` and that UPDATE's
  correctness depends on it: without one-row-per-state it silently increments
  every duplicate. Checked first — 51 rows, 51 non-null states, 0 duplicates — so
  the unique index could only succeed or refuse, never lose a row. This also
  closes one of the eight gaps `audit:constraints` reports.

**Not fixed, named in `ACCEPTED` with the reason:** `products.bullion.supplier_id`
is only ever joined *from* bullion *to* refiners' primary key, never used to look
a bullion row up; nothing looks an order up by `number` alone; `provider_ref` is
always paired with the indexed `intent_id`. An index nothing reads still costs
every write, so speculation is the wrong default in both directions. The list is
pinned from both sides — a gap not named fails the audit, and a name that no
longer reports a gap fails it too, so it cannot rot into a blanket suppression of
something since fixed or since changed in meaning.

Three more are reported as narrower or reordered rather than absent (`rates`,
`carrier_services`, `cart_items`); in each the leading column is still indexed, so
the path is entered and only the most selective lookup loses.

### Two things this cost me

The first version used leading-prefix matching for everything and reported eight
gaps, six of them UNIQUE — which looked like `audit:constraints` had missed them.
It had not: **`audit:constraints` reports those eight itself and exits 0 by
design**, because it judges uniqueness semantics rather than access paths. Reading
its output, not just its query, is what separated the two audits' questions.

The second: `payments` looked like the best finding of the set — a missing index
on `provider_ref`, on the webhook path that is already the subject of an open
thread about $126.48. It is not a finding. Every query pairs `provider_ref` with
`intent_id`, and `payments.attempts` is indexed on `intent_id`. **A missing index
only matters if something queries it that way**, and the audit cannot see that;
only reading the queries can.

## The index the webhook needed, and the reasoning that talked me out of it

`audit:indexes`, added the same night, compares `exchange`'s indexes against the
schema replacing it. It reported five access paths with no counterpart, I read
the queries behind each, and I declined three. **One of those three was a real
defect and my reason for declining it was wrong.**

The pair was `exchange.payment_intents UNIQUE (provider_ref)` against
`payments.attempts`. I wrote it off because `provider_ref` is always accompanied
by `intent_id`, and `payments.attempts` is indexed on `intent_id`. Both halves of
that sentence are true. The conclusion does not follow.

The live query is:

```sql
UPDATE payments.intents i
   SET status = $1, amount_expected = $2, updated_at = now()
  FROM payments.attempts a
 WHERE a.intent_id = i.id AND a.provider_ref = $3
```

`a.intent_id = i.id` is a **join condition**. It says how two tables line up; it
does not say which row to find. Nothing else constrains either side, so the only
thing that identifies a row is `a.provider_ref = $3` — and the only index
covering that column is `attempts_provider_idx (provider, provider_ref)`, which
leads with `provider`. Postgres has no skip scan, so it cannot seek.

Confirmed with the planner rather than argued: it chose a hash join over two
sequential scans, and with `enable_seqscan` off it fell back to scanning the
whole of `attempts_provider_idx` (cost 12.30, against a 2.26 heap scan of 21
rows) instead of seeking. After migration 082 the same query plans as an
`Index Scan using attempts_provider_ref_idx` with `Index Cond: (provider_ref =
...)` at cost 8.15.

**This is a change of complexity class, not a constant factor.** `exchange`
seeks in O(log n) through `UNIQUE(provider_ref)`; the new schema scanned every
attempt ever made. `payments.attempts` grows with every payment attempt and is
read on every webhook delivery — and that path already has an open production
thread against it, where three captured Stripe intents never landed in
`exchange` at all.

Plain rather than unique. Whether one `provider_ref` may appear on two attempts
is a question about the new model's semantics, not its access paths; it is
already reported by `audit:constraints`, and asserting it here could refuse a row
the model intends to allow.

### Why the second audit was needed to see it

`audit:indexes` is **source-driven**. It walks `exchange`'s indexes and asks
whether each survived, which means it can only ever ask about lookups `exchange`
already had. A `WHERE` clause written fresh in a `repo.next.ts` has no source
index to be compared against, so no comparison happens and nothing is reported.
That is a whole half of the question, and `audit:query-paths` is it: start from
the queries, not the schema.

It found 46 distinct query filters across 165 SQL literals. All but three have an
index to enter by; two of those are four-row and three-row reference tables where
a sequential scan is the correct plan, named in `ACCEPTED` with that reason. The
third was `provider_ref`.

### Three things it cost to get the scan honest

**A `SET` clause is not a filter.** The first version matched `col = $n`
anywhere, so every `UPDATE ... SET` assignment read as an unindexed lookup — 24
of them on `products.bullion` alone.

**A subquery is its own scope.** Restricting to text after `WHERE` was not
enough: `SET supplier_id = (SELECT id FROM refiners.exchange_compat WHERE name =
$2), description = $3, ...` contains a `WHERE`, and the region ran straight past
the closing paren through the rest of the `SET` list. It also attributed that
`name` to `products.bullion` rather than to the subquery's own table. Fixed by
splitting each statement into paren-depth scopes and resolving aliases per scope.

**The unit is the query, not the column.** A `WHERE` filtering
`user_id = $1 AND direction = $2` is fully served by an index leading with
`user_id` — btree is entered once and the rest is a predicate on very few rows.
Asking the question per column called that query unindexed twice over, and turned
four findings into eight, which buried the one that mattered.

A floor on the number of SQL literals turned out to be too weak a guard on its
own: dropping three of the eighteen schemas still left 113 literals and the run
reported clean. It now also requires a known-present control — the `getUserImages`
filter that migration 081 was written for — so partial breakage fails instead of
passing quietly.

## D39 — two products carry a type the sales-tax query cannot parse

`exchange.products.product_type` is a **text** column. So is its successor,
`products.bullion.type`. But the sales-tax rule match compares that value against
`sales_tax_rules.product_type`, which is an **enum**:

```sql
AND r.product_type IN ($3, 'All')        -- $3 = item.product_type
```

Postgres has to coerce `$3` to the enum to run that comparison. A value that is
not one of its labels does not quietly fail to match — it raises
**`22P02 invalid input value for enum`**, and the tax calculation throws.

Two production products carry

```
product_type = E'\n\tBar'
```

a newline and a tab in front of `Bar` — five characters where `Bar` is three.
`1g Gold Bar` and `Silver Bar (10 oz)`.

**`btrim()` does not find them.** Its default character set is spaces only, so
the obvious data-quality check (`WHERE product_type <> btrim(product_type)`)
reports every row clean. That is very likely why they have survived.

### How bad it is, precisely

**Not reachable today.** Both rows are `display = false` with `stock = 0`, and no
production sales-order line references either — so the enum error has never
fired. Same category as D35's zero-premium products: real, and currently inert.

**It is one flag away from firing.** Set `display = true` on either — an ordinary
merchandising action, taken from the admin screen with no warning attached — and
adding it to a cart makes the sales-tax query raise 22P02. Checkout fails at the
last step.

**Both implementations behave identically**, so this is not a promotion risk and
promotion does not fix it: `exchange.sales_tax_rules.product_type` and
`tax.sales_tax_rules.product_type` are both the enum, and both raise 22P02.

**The corrupt value is offered back to admins.** `GET /get_product_types` is
`SELECT DISTINCT product_type FROM exchange.products` with no filter and no
`ORDER BY`, and the frontend renders it as the product-type dropdown. So the
admin editing a product sees **four** options, two of which read as "Bar". That
is the most plausible way two rows acquired the value, and the way more would.

### Why nothing caught it

It is not a foreign key and not a constraint. It is two columns in different
tables that must agree **by value**, with the type declared on only one of them.

- `audit:constraints` compares constraints between schemas. There is no
  constraint here to compare.
- `audit:precision` casts each source value into the type of the column it lands
  in. `product_type` lands in `products.bullion.type`, which is text, so the cast
  is clean. **The value only becomes invalid somewhere else entirely** — in a
  table the feature map does not couple it to, because it is not a mapping.
- `validate:wire` parses the response shape. `"\n\tBar"` is a perfectly good
  string.

`audit:enum-domains` is the check for that class. It exits non-zero by design
while the data is outstanding, in the way `audit:payments` does, and is
deliberately **not** in `pnpm check` — fixing it means an `UPDATE` against
production, which is not this repo's to run.

### For Jacob

Three things, none of which I did:

1. **`UPDATE exchange.products SET product_type = 'Bar'` for the two rows.** A
   two-row data fix against production. Trivial, and still yours.
2. **Should `product_type` be the enum rather than text?** The value is already
   constrained *de facto* by the query that consumes it; declaring it would move
   the failure from checkout to the write that introduces it. That is a schema
   decision with a migration attached.
3. **Should `get_product_types` return only valid labels** (or the enum's labels
   directly) rather than whatever distinct strings happen to be in the table? As
   written, one corrupt row becomes a permanent menu option.

### Also checked, and clean

The sibling coupling — `metal_type` against `sales_tax_metal_category` — is
clean on both sides: all four metals (`Gold`, `Palladium`, `Platinum`, `Silver`)
are valid labels. The audit checks it too, and reports it separately, so the two
are not confused.

One trap in building it: **three schemas define an enum named
`sales_tax_product_type`**, so matching on `typname` alone returns every label
three times. Qualified by schema — the same shared-name mistake that has produced
false findings on this project before.

## Row order between the two implementations, checked

`diff` compares `JSON.stringify(v)` without sorting, deliberately — its comment
says sorting "would hide an ordering regression". But the same comment asserts
that "both implementations carry the same [ORDER BY]", and nothing verified it.

Checked all 14 list-returning reads that exist on both sides:

- **Zero are ordered on one side and not the other.**
- **Nine have a textually different `ORDER BY`**, and all nine are declared
  renames that produce the identical sequence — verified against the data rather
  than assumed. `type` → `m.name` gives `Gold, Palladium, Platinum, Silver` from
  both. `is_default` → `ua.default_shipping` gives the same nine address ids in
  the same order.
- **Four have no `ORDER BY` on either side**, so both return physical order.
  Two are order-independent by construction: `findOrderScrapItems` feeds a
  commutative sum and then updates by id, and `findExpiredOffers` is a scheduler
  loop. `spots.getAll` and `products.getAllTypes` reach the wire — and
  `getAllTypes` is `SELECT DISTINCT`, whose order comes from a hash aggregate
  rather than even from physical order, so it is unstable in principle. Both
  agree in dev today.

Two false alarms worth recording. `purchase-orders` and `sales-orders` looked
like they had **lost** the main list ordering; the `ORDER BY` lives in a shared
constant, `features/orders/fragments.ts`'s `newestFirst`, so a per-file grep
undercounted. And `transactions` looked like it differed because a *comment*
mentioning `ORDER BY` was counted as one.

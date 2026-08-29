# Overnight — Lane A

Scope, by feature (D119): `api/features/**` (source), `api/legacy/**`,
`packages/contracts/**`, and in the frontend only
`frontend/features/checkout/purchase-order-checkout/checkoutStepper.tsx` and
`.../shippingStep/**`. No test files (lane B), no `scripts/` (lane D), no other
frontend (lane C). Started from `002c0f0f`.

```
1. Max insured value becomes data      ██████████████████  100%
2. Verify, then remove legacy code     ████████████████░░   90%
3. Frontend and API share contracts    ███████████████░░░   85%
4. Close D142's bypass                 ██████████████████  100%
5. The invoice NaN (handed over)       ██████████████████  100%
```

Tasks 2 and 3 are short of 100% for the same reason and it is not effort: what
remains in each is **Jacob's decision, not an agent's**. Both are named below
with the evidence that would let him take them in minutes.

---

## 1. What a parcel is insured for is a column now (D132)

`checkoutStepper.tsx:67` was `Math.min(quote.declared_value, 50000)`. Two
defects in one expression — a carrier's ceiling compiled into React, and the
browser computing what the label's insurance is bought with (D82).

**Migration `097_a_service_says_what_it_will_insure.sql`** adds
`shipping.services.max_insured_value numeric NOT NULL DEFAULT 10000`. The
DEFAULT seeds all eight existing rows in the ALTER itself, which is the whole of
Jacob's "make it 10,000 for all of them at the moment". Verified: all eight rows
read 10000.

**Why not `max_declared_value`, which already exists.** Two reasons, both
recorded in the migration's header. It is the CARRIER's ceiling (FedEx allows
$50,000; Jacob's number is 10,000, a Dorado policy and a different fact), and it
is **dual-written** — one of the 23 values `shipping/services/service.ts` feeds
to both `shipping.services` and `exchange.carrier_services` from a single array.
Seeding it would have meant either lying about what the column means or writing
`exchange` from a migration. The new column exists only on the new schema and
has no exchange counterpart to diverge from.

**The clamp is server-side, in two places, and they answer different questions.**

| where | ceiling used | why |
|---|---|---|
| `POST /quotes/purchase_order` | lowest among offered services | a quote is priced **before** a service is chosen; it may not promise cover the cheapest option would not carry |
| `createPurchaseOrder` (label + `shipments.declared_value`) | the chosen service's own | this is the request that BUYS the cover, and a request body is not a quote |

`features/shipping/services/service.ts` owns both (`insuranceCeiling`,
`insuranceCeilingFor`, `clampInsuredValue`) so the two call sites cannot
disagree. Neither returns `Infinity` on a miss — an unknown service falls back
to the lowest ceiling known, because "we do not know what this is covered for"
has only one safe reading.

**Exposed on the wire** as `CarrierServiceOption.max_insured_value`
(`GET /api/carrier_services/offered`), joined onto the carrier adapter's
catalogue by `(carrier_id, name)`. Not by `code` — that column is NULL on all
eight rows in both databases (D125), which is the same reason the catalogue is
adapter-sourced at all. When Jacob populates `code`, the join changes and
nothing above it does. The adapter's own type became
`CarrierServiceVocabulary = Omit<CarrierServiceOption, "max_insured_value">`:
FedEx states its vocabulary, Dorado states its policy, and a carrier adapter
that could state the ceiling would be this file's own defect in reverse.

It is **deliberately not** projected on the admin carrier-services wire. That
shape is validated against `exchange.carrier_services`
(`CarrierService = CarrierServicesRow`), which has no such column, so adding it
there would be a wire change during a schema migration for no consumer's
benefit. `ServiceRow` omits it explicitly and says so.

**The browser now reads `quote.declared_value` and applies nothing.** The
contract carries a note forbidding a client-side clamp, because a second clamp
in the browser is the defect and not a safety net.

**Reachability, measured rather than assumed:** the replay fixture's quote is
$15,916.21 against the $10,000 ceiling, so the clamp fires. It was not a
vacuous change.

Ritual followed in order: `lint:migrations` → `migrate` → `dump:schema` →
`verify:genesis` → regenerate contracts → `validate:wire`.

**FOR JACOB — one thing to look at.** `app/terms-and-conditions/page.tsx:177`
says *"You may request additional insurance for your Products up to $50,000."*
That is legal copy and it now disagrees with the data. Not touched — lane C's
tree and your call either way.

---

## 2. Verify, then remove legacy code

### Deleted

**`api/features/scrap/service.ts`** — gone. What proved it: a full-corpus grep
for `features/scrap/service` returns **zero importers** (source, tests, scripts,
`app.js`). Its two exports were one-line delegations to `scrap/repo.ts`
functions that the two live callers (`features/orders/service.ts`,
`features/refiners/items/service.ts`) already import directly. No data argument
was needed and none was used: ruling 29's own test, "legacy code that protects
nothing is dead code". D141 recorded 5C correctly leaving it while its gate was
unanswered; the gate is answered.

**`findProductIdByName` un-exported** from both `features/checkout/repo.next.ts`
and `repo.exchange.js`. Both use it internally only, and it was the handle
D142's bypass grabbed. Removing the handle is what stops the reach recurring.

### Verified and NOT deleted, with the evidence

A dead-module sweep of `features/`, `shared/`, `providers/`, `legacy/`
(1 file → every importer in the whole corpus) returns **only `.d.ts` ambient
declarations**. After the scrap deletion there is no other unimported module in
the API.

An unused-export sweep of `api/legacy/**` returns **0 exports with no caller
outside their own file**. Every one of the **13** feature directories in there is
a live dual-write mirror, imported by its feature's service. So `api/legacy/` is
exactly what its README claims: necessary legacy, all of it load-bearing.

**Deleting any of it is the one-way door, and CLAUDE.md says whose it is.**
"The WRITE half is a separate, later decision, and it is Jacob's… `exchange`
stops receiving that feature's writes and flipping back loses everything written
in between."

**A gap worth knowing about before that decision, and it applies to all
thirteen.** `legacy/README.md`'s exit criteria step 3 is *"its `*_SOURCE` switch
is promoted past `dual`"*. **Not one of the thirteen has a switch.** Only two
survive anywhere — `PAYMENTS_SOURCE` and `CHECKOUT_SOURCE` — and neither payments
nor checkout is in `legacy/` at all; the rest were deleted along with the
`repo.js` that read them as each feature's reads pivoted. So the gate the README
names **cannot be met as written, for any entry in the directory it governs.**

The real remaining question is therefore simpler than the README makes it look:
*"may `exchange` stop receiving these writes?"* — one question, asked once, for
all thirteen. Answering it is the whole of what stands between here and
`rm -rf api/legacy/`.

Data evidence gathered tonight, so the answer can be given rather than
researched:

| gate | result |
|---|---|
| `verify:parity` | **10 of 15 pairs byte-identical.** leads 39, ledger 19, rates 16, reviews 14, sales-tax 88, suppliers 2, carriers 3, mints 10, images 1, products 62 — zero missing, zero differing, zero exchange-only |
| `audit:coverage` | 1 populated column with no home (`exchange.scrap.bid_premium`, 20/20 rows — D140's premium); 5 unclaimed tables, each already explained |
| `verify:orders-decomposition` | 672 values across 48 purchase orders — the read serves exactly what the raw tables hold |
| `verify:sales-order-decomposition` | 285 values across 15 sales orders — same |
| `diff` | 1 operation left to compare (payments), identical. Every other dual read is gone |
| `lint:legacy-boundary` | green, and its `--self-test` green. `legacy/` writes only `exchange`, says so at every call site, imports no feature at runtime beyond the 2 accepted helper edges |

The five pairs that are **not** identical, and what each is:

- **`exchange.metals -> metals.exchange_compat`, 4 rows differing.** This is the
  live spot feed, not customer data. `spots.spots` was last written 2026-08-27
  22:21; the dual write in `features/spots/service.ts` writes both schemas in
  one transaction and closes the gap on the next cron tick. Self-healing, and
  documented in that file already. **Not a loss and not a blocker.**
- **The four cart pairs**, 26 exchange rows against 0 in `checkout.*`. Correct,
  and per Jacob's 2026-08-29 ruling **not a finding**: `checkout.*` is
  device-sync, empty is fine, losing it is fine. D138's caveat still holds — the
  comparison joins on `id` and a checkout row does not keep its exchange row's
  id, so these entries are exact only while the target is empty.

### Does the new checkout path WORK? Yes — measured, not asserted

Jacob's bar for `checkout.*` is function, not preservation, and **nothing in the
gate exercises it**: `diff` has no checkout entry, and `verify:parity` can only
say the target is empty. So it was exercised directly, inside one transaction
that was rolled back, against dev:

```
ok  replaceItems creates a sale checkout
ok  the sale line is stored with its bullion, metal and quantity
ok  a second sync replaces rather than appends            (n=1, not 2)
ok  replaceSellItems creates a SEPARATE purchase checkout
ok  both a product line and a scrap line land             (n=2)
ok  the product line resolved the catalogue by NAME       (D73)
ok  the scrap line keeps its own values and resolved its metal
ok  the three reads the service calls all exist
8 passed, 0 failed
```

**So `CHECKOUT_SOURCE` can be moved.** It is still not moved here: promotion is
stated twice in CLAUDE.md as the user's call, and an agent that promotes a switch
because the evidence looks good teaches everyone the gate is advisory (D141).
The evidence is above; the flip is one environment variable.

`features/orders/create.ts` was checked and left: it is called by tests only, but
its own header says *"nothing calls this yet… this exists so the two can be
compared before either is switched"*. That is D105's write-path rewrite waiting
for its turn — future code, not legacy.

---

## 3. Frontend and API pull from shared contracts

### `fulfillments.methods.category` — the open instance, closed

**Migration `098_a_fulfillment_category_is_an_enum.sql`** creates
`fulfillments.category AS ENUM ('SHIPMENT','PICKUP','DIRECT')`, **drops the
`DEFAULT 'OTHER'`**, and converts the column.

Measured on **both** databases before writing it: eleven rows, SHIPMENT 6 /
DIRECT 4 / PICKUP 1, identical in dev and production. Nothing has ever held
`'OTHER'` — but the column admitted it, three hand-written types did not, and
the wire contract's enum would have rejected it at parse time. D103's second
kind exactly: a constraint the database did not have.

The `USING` cast raises 22P02 on a value that is not a label, so if production
ever does hold one the migration stops rather than silently rewriting it.

**The six hand-written copies are gone**, each replaced by a derivation from the
generated row:

| file | was | is |
|---|---|---|
| `features/fulfillments/service.ts` | `Direction`, `Category` unions | `fulfillmentTables.MethodsRow[...]` |
| `features/fulfillments/methods/service.ts` | `Direction`, `Category` unions | same |
| `features/orders/intake.ts` | `Category` union | `fulfillments.MethodsRow["category"]` |
| `features/orders/patch.service.ts` | `Direction` union | `orders.OrdersRow["direction"]` |

`sql/get_default.sql` now casts `$2::fulfillments.category` explicitly. A text
parameter compared against an enum column is coerced by Postgres, and a
non-label does not fail to match — it raises 22P02 and the whole call throws.
That is `audit:enum-domains`' subject (D39); the cast makes the coupling visible
to a reader instead of implicit in the planner. `audit:enum-domains` is green on
dev: 4 couplings checked, every value a label.

### Two more found by sweeping rather than stumbling

- **`features/shipping/operations/service.ts`** — `ShippingType =
  "Inbound" | "Outbound" | "Return"` was an exact duplicate of the
  `shipping.direction` enum, which is what `shipping.shipments.direction` is
  declared as and where every one of those values lands. Now
  `shipping.ShipmentsRow["direction"]`. Worth naming: this is **not**
  `orders.direction` (purchase/sale). Two different enums, both called
  "direction" — precisely why neither should be spelled by hand.
- **`features/spots/repo.ts`** — `SpotRow`'s six fields were five hand-written
  copies of `spots.spots` columns. Now `Omit<spots.SpotsRow, "id"|"updated_at">`
  plus `updated_at: Date`, with both differences stated: `id` is not projected,
  and the contracts describe the WIRE (a timestamp is text there) while a repo
  hands back what node-postgres gives it.

### Assessed and deliberately left

- **`features/quotes/service.ts` `MetalName`/`MetalKey`.** They look like
  `tax.SalesTaxMetalCategory` minus `"All"`. They are not: `metals.metals.name`
  is `text`, and the profit-breakdown dict is a fixed WIRE shape with four keys,
  not a claim about a column. Coupling it to a sales-tax enum would be the
  fourth shared-name false finding on this project.
- **`features/users/repo.ts` `CreditMode`** — an API operation vocabulary
  (`add`/`subtract`/`edit`), no column behind it.
- **`features/users/repo.ts` `UserRow`** — a genuine candidate: it is
  `auth.users` with every column aliased to snake_case. Re-pointing it needs the
  Omit+rename shape `shipping/services/repo.ts` uses AND a decision about
  `Date` vs the contract's `z.string()`. Left as a named seam rather than done
  at 3am on the auth feature, which is the one feature with no reversible middle
  state.

### FOR LANE C — the frontend half, measured

The rule is "every table-derived shape comes from `@dorado/contracts`". Six
`frontend/features/*/types.ts` still hand-write one, and **the contract already
exists for every one of them** — this is re-pointing, not authoring:

| file | hand-written | contract that exists |
|---|---|---|
| `features/leads/types.ts` | `Lead`, `NewLead`, `LeadPriority` | `wire/leads.ts` |
| `features/reviews/types.ts` | `Review`, `NewReview` | `wire/reviews.ts` |
| `features/rates/types.ts` | `Rate`, `Metal` | `Rate` (already imported by the API) |
| `features/carriers/types.ts` | `CarrierService`, `NewCarrierService` | `CarrierService` = `CarrierServicesRow` |
| `features/users/types.ts` | `userSchema` / `User` | `auth` generated rows |
| `features/payouts/types.ts` | `Payout`, `PayoutMethodType` | `wire/payouts.ts` |

`features/carriers/types.ts` is the one that touches task 1: its
`CarrierService` is why adding `max_insured_value` to the admin projection would
have been invisible to `tsc` from the consuming side.

---

## 4. D142's bypass is closed by removal, not by routing

`features/quotes/service.ts` imported `#features/checkout/repo.next.ts`
**directly**, around the `repo.js` that `CHECKOUT_SOURCE` selects, and called
`findProductIdByName` — `SELECT id FROM products.bullion`.

Routing it through `features/checkout/repo.js` was the obvious fix and is the
wrong one: on `exchange` that returns an `exchange.products` id, and the two
lines below it (`refuseProductsThatAreNotLive`, `getItemsFromServer`) both key on
`products.bullion`. It only ever worked because the backfill preserved ids.

So the read moved to **`features/products`, the feature that owns the table** —
new `sql/find_id_by_name.sql`, `repo.findIdByName`, `service.findProductIdByName`.
Same statement, asked of its owner. There is no second implementation left to
reach around, which is why the bypass is gone rather than redirected.

**The audit change was already lane D's, in the working tree**, complete with a
`KNOWN_BYPASSES` pin for this exact case, pinned from both sides so a fixed
bypass fails the audit. It fired: `STALE … DELETE the entry`. Done, on the file's
own instruction — see crossings below. `audit:switches` is green and its
`--self-test` still passes all 8 planted cases.

**What this does NOT fix, stated so nobody reads more into it.** The statement
still reads `products.bullion`, and production has no `products` schema. That
was never a switch problem — production lacks eight of the eighteen schemas and
*every* products read is 42P01 there. The bypass mattered because it let the
audit tell the truth about a switch while the feature ignored it. That is what
closed.

---

## 5. The invoice could silently become NaN — handed over by lane B

`features/pricing/bid.ts` ended the order total with

```js
const shipping = order.shipment?.shipping_charge ?? 0;
return baseTotal - shipping - order.payout.cost;
```

One subtrahend defended, the next one not, on consecutive lines. The compiler
could not see it because **`OrderLike` in `orders/service.ts:62` asserted
`payout: { cost: number }`** about an object whose own header says it is
"whatever the caller had… several callers are controllers handing over
`req.body`". A type stating a guarantee nothing checks — D103's family exactly.

### What I measured before choosing

Three inputs, **three different answers to the same question**, and only one of
them deliberate:

| `payout` | result | pinned? |
|---|---|---|
| `null` | TypeError — loud | yes, by a test whose comment called it "fragility rather than desired behaviour" |
| `{ cost: null }` | `0`, because JS reads `x - null` as `x - 0` | no |
| `{ }` / `cost` absent | **NaN, silently, all the way to the invoice** | **no test could exist — the type said it was impossible** |

`getPurchaseById` on dev's purchase orders with no payout row — **32 of 48** —
returns `{ …, cost: null }`, never `undefined`, so **the NaN is not reachable through
the API's own reads today**. It is reachable through every hand-assembled order
— `media/pdfs/service.ts` casts one with `as unknown as`, twice — and it is one
key away at any time, because nothing owns the invariant that `EMPTY_PAYOUT`
lists `cost`. `compose.ts`'s own header said *"`order.payout.cost`
therefore gives `undefined` today"*, which is **false for `cost`** and true for
anything not in that list. An invariant nobody owns is not an invariant; that
comment is corrected in place (see the end of this section).

### The decision, and why it is neither of the two offered

**Split by MEANING, not by nullishness.** A fee that is ABSENT is zero; a fee
that is PRESENT and unusable throws.

- **Absent → 0.** An order with no payout has no payout fee. That is what the
  data means, it is what the app already does for `null`, and it is what the
  invoice template itself does *one line below the call*
  (`purchaseOrder.payout?.cost ?? 0`). It is **not** "waiving the fee" — D117's
  concern — because a payout row carrying a real cost still subtracts it. A row
  that says 50 says 50.
- **Present but not a number → throw.** A value arrived and could not be used.
  That is the `spot!` case, and the reason its TypeError is deliberate.

A blanket `?? 0` was rejected: it would have flipped `payout: null` from a loud
throw to a silent 0 **by accident**, deleting a guard without noticing it. A
blanket throw was rejected too, and this is the part worth keeping: **`spot!` is
different in kind.** An item with no spot price cannot be valued at all, so the
total is meaningless. A missing payout leaves the total perfectly meaningful and
short one subtrahend — and throwing would refuse to invoice every order placed
before a customer picks a payout method. **Thirty-two of dev's forty-eight
purchase orders are in exactly that state** and the app already invoices them.

*(Number corrected before publishing, per D131: my first pass said "five",
which was the `LIMIT 5` on the query I looked at rather than the count. The
conclusion survives; the argument gets stronger.)*

`payout: null` therefore **changes from TypeError to 0, deliberately**, which is
precisely what the old test's comment asked for: *"a deliberate change with a
failing assertion, not a silent one."*

**Both subtrahends now go through one `fee()`**, because the asymmetry between
those two lines is how this got in — so `shipping_charge: "free"` throws now
too, same class, same line. And both public totals end in `finite()`: **the
invoice is a number or an exception, never NaN.** That last gate is not
hypothetical — migration 087 had to clean up two rows whose stored `content` was
literally `'NaN'` and which reached the wire as the *string* `"NaN"`.

### Pinned, and swept

Nine tests added to `features/pricing/tests/bid.test.ts`, one per arm, so reversing
the decision fails a named assertion rather than quietly changing an invoice —
including one for the defect itself (`payout: {}` → 7200, not NaN) and one
asserting a numeric string still prices, so the guard cannot creep into a
regression. 24/24 green.

Then swept against the database rather than trusted: **all 48 dev purchase
orders through `calculateTotalPrice` and `calculateReturnDeclaredValue` — 48
priced, 0 threw, 0 NaN.**

`OrderLike` and `PricedOrder` both narrowed to `payout?: { cost?: number | null }
| null`, with a comment saying it is an assertion about `req.body` rather than a
guarantee. `- order.payout.cost` no longer compiles, so it cannot come back.

And `compose.ts`'s claim that *"`order.payout.cost` therefore gives `undefined`
today"* is corrected in place, because it is false for `cost` and true for
anything not in `EMPTY_PAYOUT`'s key list — and that list turning out to be
load-bearing, with nothing saying so, is the whole shape of this defect. The
note now says which hazard survives: **a member missing from one of those arrays
is `undefined` where every reader expects `null`, and `undefined` is the value
that poisons arithmetic instead of behaving as zero.**

---

## Crossings, disclosed (D119: cross when you must, write down every one)

**Four** files outside lane A's partition were edited. Each was required to keep
the gate green after a change lane A was instructed to make, or was explicitly
asked for.

1. **`frontend/features/checkout/purchase-order-checkout/shippingStep/carrierSelectors.test.tsx`**
   (lane B) — two fixture lines. `CarrierServiceOption` gained a required field;
   the object literals stopped compiling. Given two DIFFERENT values (7500 and
   10000) on purpose: nothing in those components may read the field, so a
   component that started clamping with it would have to pick one and the
   difference would show.
2. **`api/features/quotes/tests/replay.test.js`** (lane B) — one assertion.
   `declared_value is specified as the total` is false by design now. Replaced
   with `Math.min(total, cap)` where `cap` is read **from the table**, plus a
   guard that fails if no ceiling is configured, so seeding a different number
   cannot make it pass for the wrong reason.
3. **`api/features/pricing/tests/bid.test.ts`** (lane B) — nine tests pinning
   the payout/NaN decision. Explicitly requested by the coordinator when it
   handed the defect over ("pin whichever you choose with a test"). One
   pre-existing assertion changed rather than added: `a missing payout throws`
   became `a missing payout is no payout fee`, which is the reversal argued
   above and the one its own comment asked to be made deliberately.
4. **`api/scripts/audit-switches.mjs`** (lane D) — deleted the now-stale
   `KNOWN_BYPASSES` entry (the audit prints that instruction itself and exits 1
   until it is done), and corrected the header's present tense to past for the
   case that is fixed. No logic touched; `--self-test` re-run, 8/8.

## Verification run

**`pnpm check` stops at `@dorado/api typecheck`, and it is not lane A's.** 444
errors, **0 of them outside a `tests/` directory** — lane B's in-flight JS→TS
conversion bringing 114 previously-excluded files into `tsc` for the first time
(ruling 33). Verified by filtering the output; zero errors in any source file,
lane A's or anyone else's. Every member BEFORE typecheck passed in the compound:
contracts `build` / `verify:fresh` / `validate`, `lint:imports`,
`lint:namespace-calls`, `lint:row-vs-list`, `lint:db`, `lint:migrations`,
`lint:script-guards`.

**Every member AFTER typecheck was therefore run individually against the final
tree** — the compound never reaches them, and four gate scripts have been found
broken by a factoring pass while reporting success, so re-running the ones that
IMPORT application code is not optional:

```
verify:genesis                      0     validate:wire                  0  (27 shapes, 0 diverge)
audit:switches                      0     audit:coverage                 0
audit:indexes                       0     audit:query-paths              0
audit:non-finite                    0     audit:nullability              0
verify:orders-decomposition         0     verify:sales-order-decomp.     0
lint:legacy-boundary                0     frontend typecheck             0
frontend lint:carrier-vocabulary    0
```

Plus, as the work landed: `lint:migrations`, `migrate`, `dump:schema`,
`verify:genesis` after **each** migration, contracts `generate`,
`audit:enum-domains`, `verify:parity`, `diff`, `--self-test` on both
`audit:switches` and `lint:legacy-boundary`, and the affected test files
(pricing 24/24, fulfillments + intake 71/71, quotes + services 41/41, products +
quotes 67/67, pricing-dependent suites 50/50).

**One thing the gate caught that no typechecker would**, worth recording:
`lint:namespace-calls` flagged `catalogue.services.find(...)` in the new ceiling
code as a call to `services.find()` — `services` is also the name that file
binds the repo namespace to at the top. It compiles, it runs, and it reads as
the wrong thing. Bound to a local now, with the reason stated inline.

## What is left, in the order I would take it

1. **The T&C insurance figure** ($50,000 in legal copy against a $10,000
   column). Jacob's, and quick.
2. **One question unlocks `rm -rf api/legacy/`**: may `exchange` stop receiving
   the thirteen features' writes? All the data evidence is in section 2.
3. **`CHECKOUT_SOURCE`** — the new path is measured working; the flip is one
   environment variable and one decision.
4. **Lane C's six `types.ts` files** — the contracts already exist; it is
   re-pointing, not authoring.
5. **`features/users/repo.ts` `UserRow`** — the last hand-written row type worth
   deriving, left because it sits on the one feature with no reversible middle
   state.

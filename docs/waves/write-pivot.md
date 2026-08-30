# Write pivot — `exchange` stops receiving writes

Ruling 36 (Jacob, 2026-08-29): *"Yes exchange can stop receiving those
writes."* This is the one-way door. Scope: `api/features/**`,
`api/legacy/**`, `packages/contracts/**`, and any frontend re-pointing these
changes force. Branch state at start: clean at `af8bc790`.

```
1. The covenant ledger, run BEFORE the switch  ██████████████████  100%
2. The five missing native statements          ██████████████████  100%
3. Switch the writes to native, feature by feature  ░░░░░░░░░░░░░░░░░░    0%
4. Delete api/legacy/ and the dual machinery   ░░░░░░░░░░░░░░░░░░    0%
```

> **NOTE FOR THE COORDINATOR**: these four task names have no line in
> `WAVES.md` yet, so `node scripts/waves.mjs` will list them under its
> "matched no line in the index" warning until a block is added. That
> warning is the script working, not a defect.

---

# TASK 1 — THE COVENANT LEDGER

**This is the deliverable, and it is worth more than the diff.**
`verify:parity` compares a source table against its target. The moment
`exchange` stops being written, the source stops moving and **the
comparison stops meaning anything** — a green afterwards would say "two
frozen tables agree", not "the migration is whole". D105 and ruling 36 both
say the same thing in different words: **the ledger runs before the switch,
never after.** What follows is that record, captured at `af8bc790` on dev,
2026-08-29.

## 1a. `verify:parity` — 15 pairs, 10 byte-identical, 5 explained

Command: `pnpm --filter @dorado/api verify:parity` · exit **1** (by design —
it exits non-zero while any pair is `NOT SAFE`, and four of the five have
been `NOT SAFE` by design since wave 5C added them).

| pair | cols | rows src → tgt | missing | differing | verdict |
|---|---|---|---|---|---|
| `exchange.leads` → `leads.leads` | 15/15 | 39 → 39 | 0 | 0 | **identical** |
| `exchange.account_transactions` → `payments.ledger` | 6/9 | 19 → 19 | 0 | 0 | **identical** |
| `exchange.rates` → `rates.rates` | 11/11 | 16 → 16 | 0 | 0 | **identical** |
| `exchange.reviews` → `reviews.reviews` | 9/9 | 14 → 14 | 0 | 0 | **identical** |
| `exchange.sales_tax_rules` → `tax.sales_tax_rules` | 17/17 | 88 → 88 | 0 | 0 | **identical** |
| `exchange.suppliers` → `refiners.exchange_compat` | 8/8 | 2 → 2 | 0 | 0 | **identical** |
| `exchange.carriers` → `shipping.carriers_exchange_compat` | 8/8 | 3 → 3 | 0 | 0 | **identical** |
| `exchange.mints` → `products.mints_exchange_compat` | 8/8 | 10 → 10 | 0 | 0 | **identical** |
| `exchange.images` → `media.images` | 11/12 | 1 → 1 | 0 | 0 | **identical** |
| `exchange.products` → `products.bullion` | 28/31 | 62 → 62 | 0 | 0 | **identical** |
| `exchange.metals` → `metals.exchange_compat` | 6/8 | 4 → 4 | 0 | **4** | NOT SAFE — see 1b |
| `exchange.carts` → `checkout.checkouts` | 1/2 | 10 → 0 | 10 | 0 | NOT SAFE — see 1c |
| `exchange.sell_carts` → `checkout.checkouts` | 1/2 | 10 → 0 | 10 | 0 | NOT SAFE — see 1c |
| `exchange.cart_items` → `checkout.items` | 1/4 | 4 → 0 | 4 | 0 | NOT SAFE — see 1c |
| `exchange.sell_cart_items` → `checkout.items` | 1/6 | 2 → 0 | 2 | 0 | NOT SAFE — see 1c |

**`only in target` is 0 on every one of the fifteen.** That is the number
that would have blocked this wave: a row the new schema holds and `exchange`
does not is a row a backfill would overwrite, and there are none.

Columns declared dropped on purpose, and why (from `verify-parity.mjs`'s own
entries, reproduced here because after the switch the script's output stops
being re-derivable): `transaction_type/purchase_order_id/sales_order_id` →
renamed `type`/`order_id`; `checksum_sha256` → `checksum`;
`product_name/product_description/product_type` → `name`/`description`/`type`;
`scrap_percentage`/`bullion_percentage` dead, tiering moved to `rates.rates`;
the checkout `id`s are not carried (a checkout row takes a fresh uuid).

## 1b. The one pair with differing VALUES, measured rather than cited

D146 calls this "the metals spot drift" and leaves it there. Measured, the
drift is **exactly the four quote columns and nothing else**:

| metal | column | `exchange.metals` | `spots.spots` |
|---|---|---|---|
| Platinum | ask/bid | 1840.5 / 1810.5 | 1868.2 / 1838.2 |
| Platinum | pct/dollar change | −1.31 / −24.25 | 0.98 / 17.98 |
| Silver | ask/bid | 68.45 / 64.3 | 71.41 / 67.26 |
| Silver | pct/dollar change | −4.15 / −2.87 | 0.13 / 0.09 |
| Palladium | ask/bid | 1454.46 / 1394.46 | 1383.8 / 1323.8 |
| Palladium | pct/dollar change | 5.31 / 71.81 | 1.98 / 26.3 |
| Gold | ask/bid | 4461.43 / 4449.43 | 4612.06 / 4600.06 |
| Gold | pct/dollar change | −3.17 / −145.67 | 0.11 / 4.96 |

**Identity is intact — only the quote drifts.** `id`, `type`,
`scrap_percentage` and `bullion_percentage` agree on all four rows. What
differs is `ask_spot`, `bid_spot`, `percent_change`, `dollar_change`, and all
four of those are **re-derived wholesale from an external feed on every cron
tick** by `updateSpotPrices`. They are not preserved data; they are a cache
of what a vendor said a moment ago.

**And the drift points the safe way.** `spots.spots` carries
`updated_at = 2026-08-27T22:21:25.748Z` on all four rows; `exchange.metals`
has no timestamp at all. Every read is already served from `spots.spots`
(`features/spots/service.ts` → `spots.getAll()`), so the new schema is the
one being read and the one being kept fresh. Stopping the `exchange` write
loses a stale copy that nothing reads.

`features/spots/service.ts` already writes BOTH in one transaction
(`legacy.upsert(name, quote, c)` then `spots.upsert(id, quote, c)`), so the
drift is historical — it predates that fix, and the next tick closes it.
**Which makes this pair evidence FOR the pivot rather than against it**: the
one table where `exchange` stopped being a level shadow is the one whose
`exchange` copy nothing depends on.

## 1c. The four checkout pairs, and the limitation that outlives them

All four report every source row as missing from the target because
**`checkout.checkouts` and `checkout.items` hold ZERO rows** — in dev and
in production (D137). There is no backfill for checkout; 068/069 are
additive DDL only.

**This is not a gap, and it is the reason checkout goes last rather than
never.** Jacob's bar for `checkout.*` is FUNCTION, not preservation — the
data is device-sync, and CLAUDE.md's data-criticality section says losing
it is acceptable where losing an order is not. Lane A exercised the new
path directly in a rolled-back transaction: **8 passed, 0 failed** (D151).

**READ D138 BEFORE EVER TRUSTING THESE FOUR AGAIN.** The comparison joins on
`id`, and a checkout row does not keep its exchange row's id — there is no
`source_*` column anywhere in the `checkout` schema. So these entries are
exact **only while the target is empty**, which is the only state in which
every row is trivially exchange-only. The moment anything lands in
`checkout.items`, `differing values: 0` will mean *nothing joined*, not
*the values agree*. Making it permanently answerable is a migration
(`orders.addresses.source_address_id` is the shape), and migrations are
Jacob's.

Production row counts for the same tables, from D137, recorded here because
they are what is actually at stake: **17 carts, 3 cart_items, 66 sell_carts,
26 sell_cart_items, and 23 `exchange.scrap` rows across 12 sell carts and 12
distinct customers that exist in `exchange` and nowhere else** — real
declared parcels, 459.374 g of 0.900, 272.228 t oz of sterling.

## 1d. `audit:coverage` — 1 unhomed column, 5 unclaimed tables

Command: `pnpm --filter @dorado/api audit:coverage` · exit **0**.

```
=== orders ===
   exchange.scrap.bid_premium                       20 of 20 rows populated

=== tables no feature claims ===
   exchange.account             12 rows   (better-auth's; auth owns its own cutover)
   exchange.auction_items       10 rows   (same)
   exchange.auctions             1 rows   (retired, not migrated; 067 removed the new tables)
   exchange.schema_migrations  104 rows   (the migration ledger; stays in exchange by design)
   exchange.verification         4 rows   (same)
```

`exchange.scrap.bid_premium` is the **one populated column in the entire
database with nowhere to go**, and D140 says it is written inconsistently by
the two cart directions (`addItems` writes no premium, `replaceSellItems`
writes `b.bid_premium`). It is also the only premium recorded for the 23
production sell-cart scrap rows above. **It is not resolved by this wave and
this wave must not pretend otherwise** — but note what stopping the exchange
write does to it: after the pivot, no new `exchange.scrap` row is written at
all, so the column stops accumulating rows with no destination. The 20 that
exist stay exactly where they are, because ruling 36 authorised stopping
WRITES and not dropping TABLES.

Counted against **dev**. Re-run with `--prod` before deploying; dev's nulls
prove nothing.

## 1e. The two decomposition gates — green

| gate | orders | values compared | verdict |
|---|---|---|---|
| `verify:orders-decomposition` | 48 purchase orders | 672 | the read serves exactly what the raw tables hold |
| `verify:sales-order-decomposition` | 15 sales orders | 285 | the read serves exactly what the raw tables hold |

Both exit 0. **957 values across 63 orders**, every one of them served from
the new schema and checked against the raw rows behind it.

## 1f. `diff` — and the honest reading of its green

Command: `pnpm --filter @dorado/api diff` · exit 0:

```
  ok    payments.getPaymentIntentFromSalesOrderId(first)  (1)
  1 operation(s) identical, 0 diverge
```

**ONE operation. Do not read this as a strong green.** `diff` compares a
migrated read's old implementation against its new one, and it can only
compare a read that still has two implementations. As each feature's reads
pivoted, its `repo.js` facade was deleted and its comparison went with it —
the same drift D142 found in the switch count (CLAUDE.md claimed 21
`*_SOURCE` switches; `audit:switches` reports **2**, `PAYMENTS_SOURCE` and
`CHECKOUT_SOURCE`, and that is confirmed again below). So `diff` is down to
the last switched read in the tree.

`audit:switches` at the same commit, exit 0:

```
2 switch(es) found - 2 *_SOURCE, 0 *_WIRE
bypass scan: 2 switched facade(s), 2 direct import(s) examined
  no import reaches around a switch
```

D142's bypass stays closed (D147 bricked the door rather than routing it).

## 1g. THE LEDGER'S VERDICT

**Every pair is explained, so task 1 clears and the wave may proceed.**

- **10 of 15 pairs byte-identical**, `only_in_target = 0` on all fifteen.
- **1 pair differs, in re-derived cache columns only**, on the side that is
  already stale and already unread.
- **4 pairs have empty targets by design**, on the one feature whose bar is
  function rather than preservation, with the new path proven 8/8.
- **1 populated column has no home**, known, named, and not made worse by
  the pivot.
- **957 order values decompose exactly.**

**What is being given up, stated plainly**: after task 3, `verify:parity`
can never again answer the question it answers above. The source stops
moving. This table IS the answer, and it is the last time it can be taken.

---

# TASK 2 — THE MISSING NATIVE STATEMENTS

`repo.dual.js` does not write the mirror independently; it **re-derives** it
with `INSERT ... SELECT FROM exchange.*`. Deleting the exchange half therefore
strands the new rows with no source, so every write needs a native statement
first. D105 counted 24 natives of 29 writes and named three gaps —
`spots_locked`, `order_total`, `purgeCancelled`.

**Re-derived rather than carried forward (D160).** `legacy/purchase-orders/
repo.exchange.js` exports **31** functions. One (`getCurrentSpotPrices`) is a
READ, leaving **30 writes**. Of those, **26 already had a native**, **3 are
closed below**, and **2 are seams that are Jacob's** — one of them named by
D105 and one that nothing had noticed.

## 2a. What was written

| # | closes | new code | verified |
|---|---|---|---|
| 1 | `toggleSpots` → `spots_locked` | `features/orders/repo.ts` `setSpotsLocked` + `sql/set_spots_locked.sql` | 5 assertions |
| 2 | `resetOrderTotal` + the total half of `recordOrderPricing` → `order_total` | `features/orders/transactions/repo.ts` `setTotal` + `sql/set_total.sql` | 4 assertions |
| 3 | the argument conversion (metal NAME → `metal_id`) | `features/metals/repo.ts` `idsByName` | 4 assertions |

**Why `setSpotsLocked` is not `setFlag`.** `sql/set_flag.sql` writes `true` and
only `true`, because its three columns (`order_sent`, `tracking_updated`,
`review_created`) are one-way latches. `spots_locked` is not a latch — the
pricing path locks it and the cancel path unlocks it — so the value has to be a
parameter. Reusing `setFlag` would have produced a lock that could never be
released, on the flag that pins what a customer is paid at.

**Why `setTotal` is not a sixth entry in `AMOUNTS`.** `setAmount` serves a
closed set of five ADJUSTABLE FEES. `total` is the number those fees add up
into — on a purchase order, what the customer is paid. Folding it in would make
`setAmount(id, "total", x)` read like a fee edit at every call site. It is also
**meaningfully nullable**: `resetOrderTotal` wrote `total_price = NULL` to mean
"no longer priced", so `$1` is passed straight through and never coalesced.

**Why `idsByName` returns `undefined` for an unknown metal rather than
throwing.** The legacy statements keyed on the name (`WHERE type = $1`) and a
name matching no row wrote nothing. A caller that skips an unknown name
preserves that exactly; one that prefers to fail loudly still can. What no
caller may do is invent an id.

## 2b. Verification — 16 assertions, in a rolled-back transaction

Run against real dev rows through the actual repos (not the SQL directly), with
an explicit `ROLLBACK` and a re-read afterwards proving the order is as it was:

```
subject: 2b320228-53a3-4d43-a3f0-f0c85ced40d3  spots_locked=false  total=null
  ok  setSpotsLocked(true) returns the row / locked it / the column really moved
  ok  setSpotsLocked(false) UNLOCKS - the latch setFlag cannot open
  ok  setSpotsLocked on an unknown id returns undefined
  ok  setTotal writes a value; setTotal(null) clears it
  ok  a null `by` leaves the previous author alone
  ok  setTotal on an order with no transactions row is a no-op, reported
  ok  idsByName returns four metals / inverts namesById / refuses Unobtanium
  ok  setBid keyed by the RESOLVED id writes the row
  ok  ROLLED BACK - the order and the total are as they were
16 passed, 0 failed
```

The first run **skipped** the `setBid` arm because the order it picked had no
Gold spot row; the subject query was narrowed to require one and it was re-run.
A skipped assertion reported as a pass is how a green means nothing.

## 2c. Gate members re-run after the change (D110's habit)

| member | result |
|---|---|
| `lint:db` | PASS |
| `lint:namespace-calls` | PASS |
| `lint:row-vs-list` | PASS |
| `lint:legacy-boundary` | PASS |
| `validate:wire` | PASS — 27 shapes match, 0 diverge |
| `verify:genesis` | PASS — 49 tables, 4 views, identical to dev, committed genesis matches |
| `verify:orders-decomposition` | PASS — 672 values, 48 orders |
| `verify:sales-order-decomposition` | PASS — 285 values, 15 orders |
| `typecheck` | **0 errors in `features/`**; 28 in `scripts/`, all the other lane's |
| `lint:imports` | **FAIL, not mine** — see below |

`lint:imports` reports two unresolved imports, both
`-> ../../scripts/route-guards.mjs (file does not exist)`, from
`features/authorization/admin-routes.test.js` and
`shared/http/frontend-routes.test.js`. The other lane renamed
`scripts/route-guards.mjs` to `.ts` and the two `.test.js` callers still name
the old extension. **Both files are that lane's** (`*.test.js` and
`api/scripts/**`), so it is flagged rather than fixed — but it is a real red and
it must be closed before the gate can be green.

---

# THE SEAMS — STOP AND ASK, WITH THE RECIPE WRITTEN DOWN

Three findings below. Ruling 36 authorised `exchange` to stop receiving **the
dual writes**. Each of these is a write to `exchange` that **is not a dual
write** — there is no mirror, because there is no destination — so ruling 36
does not reach it and neither do I.

## SEAM 1 — `exchange.payouts` HAS NO SUCCESSOR, AND THE GAP IS NOT ONLY THE BANK DETAILS

`insertPayout` and `changePayoutMethod` are **pass-throughs** in
`repo.dual.js`, listed under "features that have not moved... there is nothing
to mirror them into yet". So they are already exempt from the mirror. What is
new is *why* the successor cannot simply be called.

**The bank details.** `payments/details/sql/create.sql` says in its own header:
*"ROUTING AND ACCOUNT NUMBERS ARE DELIBERATELY NOT WRITTEN... they stay in
exchange.payouts until [encryption at rest] lands."* CLAUDE.md's standing
constraint says the same from the other side. Production holds **fourteen** of
these — 10 ACH and 8 WIRE of 61 payouts. So pivoting `insertPayout` writes the
account holder, the bank name and the last four, and **drops the two numbers
the business actually pays with**.

**And the link is shaped for the wrong direction of money.** Both `linkToOrder`
and `setMethodForOrder` reach the account by walking **order → payments.intents
→ payments.details**. Measured on dev:

```
payments.intents by order direction:   sale 8,  purchase 0
orders.orders direction='purchase':    48
```

**Zero.** A payment intent is a Stripe object for money coming IN; a payout is
money going OUT, and a purchase order has never had one. So for the only
direction that HAS a payout, both statements match no rows and write nothing —
silently, since neither raises on an empty update. The successor is not merely
missing a column; **its join does not exist for the row it is meant to serve.**

**RECIPE, and every step of it is Jacob's:** (1) decide encryption at rest, or
decide that `payments.details` may hold plaintext and accept a second copy;
(2) give a payout account an order link that does not route through a Stripe
intent — a nullable `order_id` on `payments.details`, or a `payments.payouts`
join table; (3) migration + backfill of 61 rows; (4) add the pair to
`verify:parity`, which does not cover `exchange.payouts` today; (5) only then
pivot. **Until then `exchange.payouts` keeps receiving writes and
`legacy/purchase-orders/repo.exchange.js` cannot be deleted.**

## SEAM 2 — `exchange.users` IS THE SOURCE OF A TRIGGER, NOT THE SHADOW OF ONE

`legacy/users/repo.ts` is filed under `api/legacy/`. **It is not a dual write
and it is not legacy.** `features/users/service.ts` says so itself: *"users is
the one place a dual write is WRONG, because the database already does it."*

Verified on dev:

```
trigger  mirror_users_to_auth  ON exchange.users  ->  mirror_user_from_exchange()
exchange.users:  12 rows, 4 funded, $8,815.04
auth.users:      13 rows,           $8,815.04    (identical)
```

**The direction is inverted from every other feature.** Everywhere else
`exchange` is the shadow and the new schema is fed beside it. Here `exchange`
is the SOURCE and `auth.users` is the mirror, maintained by Postgres. And it is
the *legacy* statement that is live: `features/users/repo.ts` `adjustCredit`
writes `auth.users` and is **called by nothing but tests** — calling it would
apply the adjustment twice, which `replay.test.js` caught when a $25 credit
moved a balance $50.

**So stopping the write to `exchange.users` freezes every customer's credit
balance** — production's ledger is $66,999.32 across 8 customers. Reversing it
is a migration that flips the trigger's direction, and migrations are Jacob's.

**This also refutes `legacy/README.md`'s own premise.** That file's promise is
that *"promotion deletes one directory"* — a single `rm -rf`. Two of its
residents (`users/`, and the payout half of `purchase-orders/repo.exchange.js`)
are **sole implementations of live writes**, which its own "What is NOT in
here" section says disqualifies them: *"A module that is still the only
implementation of a read or a write is not legacy yet, whatever it is named."*
They were filed by feature name rather than by that test. The directory cannot
go in one move until they leave it.

## SEAM 3 — `purgeCancelled` DELETES ORDERS, AND TODAY IT DELETES THE BACKUP

`DELETE FROM exchange.purchase_orders WHERE purchase_order_status = 'Cancelled'`,
behind a live admin button (`AdminPurchaseOrders.tsx` → `DELETE
/purchase_orders/purge_cancelled`, `requireAdmin`).

**It is already pointing at the wrong copy.** Reads pivoted at `a12b76ed`, so
the admin table renders `orders.orders`. The purge deletes from `exchange` —
the recovery copy — and leaves the rows the admin is looking at. Measured on
dev: **3 Cancelled in `exchange.purchase_orders`, 3 Cancelled in
`orders.orders`, all three the same ids, all three purchase.** Pressing the
button destroys the backup and changes nothing on screen.

**A naive native port is worse, in three distinct ways:**

1. **It would fail.** `orders.orders` has ten inbound foreign keys and **nine
   are `NO ACTION`** (`orders.items`, `orders.spots`, `refiners.orders`,
   `refiners.spots`, `payments.intents`, `media.emails`, `media.pdfs`,
   `reviews.reviews`; `payments.ledger` is `SET NULL`, only
   `fulfillments.fulfillments` cascades). Each of the three cancelled orders
   carries 1 item, 4 spots and an engagement, so the DELETE raises 23503.
2. **Getting it to succeed means writing a six-table cascade delete of real
   purchase orders** — by hand, on a button, against the schema that is now
   authoritative.
3. **`orders.orders` is ONE table for BOTH directions.** The exchange statement
   could only ever hit purchase orders because it named
   `exchange.purchase_orders`. A native `WHERE status = 'Cancelled'` with no
   `AND direction = 'purchase'` **silently extends the blast radius to
   cancelled SALES orders**, which nothing has ever deleted. Dev has none
   today, which is exactly the condition under which such a bug ships green.

**NOT WRITTEN, DELIBERATELY.** CLAUDE.md: *"Never `DROP` or `DELETE` without
explicit confirmation, and verify nothing references the target first."* This is
a DELETE, against live orders, that nothing references *safely*. The prior
question is also Jacob's and is not a code question: **should this button exist
at all?** A purge that destroys cancelled orders is not a migration concern —
it is a decision about whether the business keeps its cancelled orders. If the
answer is that it should exist, the native version needs the direction
predicate, an explicit child-row order, and its own test.

---

# WHERE THIS STOPPED, AND WHY

**Tasks 1 and 2 are done; tasks 3 and 4 are not started.** That is the stop
point the brief named, and it is a stop rather than a shortfall: the two
remaining native statements are blocked on decisions that are Jacob's, and
switching a feature's writes before those are answered would strand
`exchange.payouts` and `exchange.users` — the bank details and the credit
ledger — with nowhere to land.

**The 85% on task 2 is 3 of 5 gaps closed.** The other two are the seams above.
They are not work waiting for an agent with more time; they are a migration and
a product decision each.

## Full-suite state, with the denominator stated (D165)

```
938 tests, 936 pass, 2 fail, 445 s
```

**Neither failure is this lane's, and both are the same defect.**
`features/authorization/admin-routes.test.js` and
`shared/http/frontend-routes.test.js` both die with
`ERR_MODULE_NOT_FOUND: .../api/scripts/route-guards.mjs`. The concurrent
scripts-to-TypeScript lane renamed that file to `.ts` and these two callers
still name the old extension — the same two files `lint:imports` reports. Both
are in that lane's partition (`*.test.js`, `api/scripts/**`), so they are
reported rather than fixed. **It is a real red and the gate cannot be green
until it is closed.**

`typecheck` tells the same story from the other side: **28 errors, all 28 under
`scripts/`, zero under `features/`.**

## What the next session should do first

1. **Get the two `route-guards` callers fixed** (other lane) so the gate can go
   green and the natives above land on a clean baseline.
2. **Take Jacob's answers on the three seams.** Nothing in task 3 can start for
   payouts or users until then; the other eleven features can.
3. **Do not re-run `verify:parity` expecting the ledger back.** Task 1 above is
   the record. After the switch the comparison is between two frozen tables and
   its green means nothing — that is the whole reason it ran first.
4. **Checkout stays last** (unchanged): `CHECKOUT_SOURCE` still defaults to
   `exchange`, its targets are empty by design, and its bar is function rather
   than preservation. Do the irreplaceable features first and arrive at the
   risky one with practice.

## Files this lane changed

| file | change |
|---|---|
| `api/features/orders/sql/set_spots_locked.sql` | new |
| `api/features/orders/repo.ts` | `setSpotsLocked` |
| `api/features/orders/transactions/sql/set_total.sql` | new |
| `api/features/orders/transactions/repo.ts` | `setTotal` |
| `api/features/metals/repo.ts` | `idsByName` |
| `CLAUDE.md` | ruling 36's consequence; two stale bypass claims corrected |
| `docs/waves/write-pivot.md` | this file |

**Nothing was deleted, no migration was written, no `exchange` table or column
was touched, and no write was switched.** Every addition is new code that
nothing calls yet, so the running application is byte-for-byte unchanged in
behaviour — which is what makes the natives safe to land ahead of the decisions.


---

**Bar corrected by the coordinator 2026-08-29.** Task 2 read 85%. The seams lane
closed the native gaps — it re-derived the count from all 30 `exchange` writes
rather than inheriting the "five", and found one nobody had listed
(`editPayoutCharge` wrote only `exchange.payouts.cost` while
`orders.transactions.payout_fee` had existed since 072/073, the two agreeing only
because no admin had edited a charge since the backfill). The work landed in
commit 98a034b4; this bar was never moved to match.

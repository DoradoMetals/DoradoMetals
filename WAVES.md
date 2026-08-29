# Waves

Where the rewrite is. Bars first, descriptions below. Every sha in the table was
checked against `git log`; every status word was checked against the lane files
and the working tree, not against what this page said an hour ago.

> **GATING NOW.** Both lanes have stopped, the frontend handoff is CLOSED, and a
> full 21-member `pnpm check` is in flight on the settled tree. Wave 4 commits
> when it lands. Nothing since `a9b7dd61` is committed yet: 154 changed paths,
> 16 untracked, one `git checkout` from gone.
>
> **D97 and D98 are now fixed end to end** — the API halves landed with lane A,
> the frontend halves were written by the coordinator once lane B freed
> `frontend/**`. Verified in the tree, not taken on trust:
> `reviewStep/itemTable.tsx:77` now reads `quote?.estimated_payout ?? 0` and the
> `(quote?.total ?? 0) - (shippingCost ?? 0 + paymentCost)` expression is deleted;
> `UsersDrawer.tsx:133` sends `{ user_id, op: mode, amount }` and `newAmount`
> survives only as the on-screen preview. Frontend typecheck clean, 155/155.

```
OVERALL   ██████████████████████████████░░░░░░   ~83%
```

| | wave | | |
|---|---|---|---|
| ✅ | **D77–D86** conversions, wire axis retired | `██████████████████` | 100% · landed |
| ✅ | **D87/D88** unified orders surface | `██████████████████` | 100% · `0a201bc0` |
| ✅ | **wave 2** orders read pivot | `██████████████████` | 100% · `a12b76ed` |
| ✅ | **styling** dark-only, components own appearance | `██████████████████` | 100% · `9de7d283` |
| ✅ | **wave 3** the order wire slims | `██████████████████` | 100% · `2208932e` |
| 🟡 | **wave 3.5** factor, delete legacy, co-locate | `██████████░░░░░░░░` | COMMITTED `a9b7dd61` · 58% of its scope |
| 🔄 | **wave 4** batching, pricing, styling lane B | `███████████████░░░` | ~83% · GATING NOW, commits on green |
| ⬜ | **wave 5** checkout proper | `░░░░░░░░░░░░░░░░░░` | ~0% · queued |

All five green shas exist in the log, in that order, `a9b7dd61` at HEAD.
**Nothing since `a9b7dd61` has been committed** — wave 4's ~64% lives entirely
in the working tree, 110 changed paths across both lanes. Until it is committed
as a series it is one `git checkout` from gone.

## Wave 3.5 — LANDED PARTIAL at `a9b7dd61`, and deliberately so

Detail and decisions: `docs/waves/wave-3.5.md`.

```
1. Factor resources into their own domains  ██████████████░░░░   75%
2. Remove the proven legacy paths           ████████░░░░░░░░░░   45%
3. Delete the code with no paths            ██████████████░░░░   75%
4. Orders read from shared contracts        ██████████████████  100%
5. Co-locate tests under tests/             ██░░░░░░░░░░░░░░░░   10%
6. Tests become TypeScript                  ░░░░░░░░░░░░░░░░░░    0%
7. Write the process down                   ██████████████████  100%
```

**It stopped at seams rather than half-rewriting the money path, which is the
right call.** Three things are unfinished and each has a reason:

- **`purchase-orders/` and `sales-orders/` still exist.** Not ambiguity — NAME
  COLLISION. Both hold `repo.ts`, `compose.ts`, `read.service.ts`,
  `write.service.ts`, `service.ts`, `controller.ts`, `routes.ts`, and
  `features/orders/` already has four of those. ~2,000 lines with a real merge
  at every collision, on the money path, at ten minutes per verification cycle.
- **No legacy WRITER was removed, for any feature** (D105). The one-way door
  stayed shut. `repo.dual.js` mirrors by re-deriving from exchange
  (`INSERT … SELECT FROM exchange.*`), so deleting the exchange half leaves the
  new rows with no source. All 29 writes need native statements; native repos
  exist for 24 of 29 (`spots_locked`, `order_total` and `purgeCancelled` are
  missing). It cannot be re-checked by `verify:parity` afterwards, so the
  ledger has to run BEFORE, not after. Legacy READS were removed, orders only.
  **This is now sized as a wave of its own, not a task inside one.**
- **Tests are not co-located or converted** (tasks 5 and 6), because they ride
  with the factoring and the factoring is not finished. Moving them now would
  move every file twice.

Carried into wave 4 below as A5 and A6. The missing 42% is DEFERRED, not
stalled — the wave chose its stopping line and wrote down where each remaining
file goes.

**What it added on the way:** ten resources given their own stack with every URL
unchanged, `api/legacy/` behind `#legacy/*` as one door for promotion day, a new
guard `lint:legacy-boundary` (D107), and a fix to `audit:routes`, which had
silently started resolving child routers to `url: null` the moment parents began
mounting rather than declaring — the second silent-null in that same file.

**Four gate runs to land it, and three of the four reds were real.** A
detector fingerprinting only `exchange` while the authoritative rows had moved
to the new schemas (D108); an assertion that counted a whole table across a
window in which other files legitimately commit (D109); and a file `locks.ts`
listed among those "given their locks" that had only ever been given the import
— latent for months, surfaced when wave 3 made the suite faster and moved the
interleaving. The fourth red (D110) was a caller in `scripts/` that a factoring
pass invalidated, which `lint:imports` cannot catch because the specifier still
resolves.

## Wave 4 — IN FLIGHT, both lanes (lane A: `api/**`, lane B: `frontend/**`)

Lane A detail: `docs/waves/wave-4-lane-a.md` · Lane B:
`docs/waves/wave-4-lane-b.md`. Both agents are running and both reported at
22:03. Nothing is committed — wave 4 lives entirely in the working tree.

- **Lane A has gated A1–A4.** API suite **916/916 in 467 s**, against a 890/890
  in 563 s baseline — 26 new tests AND 96 seconds faster. Every gate member
  green: typecheck, all six lints, `verify:genesis`, `validate:wire` 27 shapes /
  0 diverge, both decomposition gates, `diff` (after repairing it), all six
  audits, contracts build + validate, **and the frontend's own typecheck and
  tests — which is the proof that the API changes are additive.** A3 and A4 sit
  at 95% only because each needs its frontend half. `audit:test-leaks` is now clean —
  "no table changed, the suite leaves nothing behind in dev" — which matters
  because `credit-delta.test.js` deliberately COMMITS: the row lock is its whole
  subject, so a pinned test transaction cannot contain it. It restores what it
  moves and the audit is the independent confirmation. **No migration was written and none was run; nothing
  was dropped or deleted from `exchange`.** **A2 landed**: `features/pricing/` holds `spot.ts` (the `PricingSpot` that
  was byte-identical twice, declared once), `bid.ts`, `ask.ts` and `service.ts`,
  both `utils/` directories are gone, ten importers across six features name the
  one surface, and the array API is `unitPrices()` / `lineTotals()` — two arrays
  because there are two prices, and **quantity multiplies bullion and never
  scrap**. 39/39 tests, 29 assertions moved unedited. **A3 and A4 are API-DONE
  but not user-visible yet** — see the handoff note below. **Lane A also answered
  the `orders.items.price` question Jacob was waiting on** (below), with a new
  audit, `audit:item-price --prod`, which reads production read-only.
- **Lane B is effectively DONE — B1, B2, B3 and B4 all at 100%, B5 at 90% by
  choice.** Both target meters reached **zero**: type-utility scatter 306 across
  62 files → **0 across 0**, and call-site styling 122 → **0** (19 of which were
  contradicted declarations). `audit:state-collapse`, a tool that did not exist
  this morning, went 22 findings → **0**. Twenty retired class names across ~300
  sites are gone, `app/styles/glass.css` is **deleted outright** and
  `components.css` is down to two rules. Frontend tests 122 → **155**, typecheck
  clean, and `next build` clean. The remaining 10% of B5 is a documented refusal,
  not a gap: 44 further label/value rows match `DetailRow`'s shape but are
  already semantic, and adopting it there would drop `<small>` labels from 13px
  to 15px and flatten a deliberate indent hierarchy for no movement in any
  metric.

**A3 and A4 are complete on both sides.** Lane A landed the API halves additive
and backward compatible and wrote a `file:line` handoff rather than crossing into
`frontend/**`; the coordinator wrote the frontend halves once lane B finished and
the directory was free. Five files: `shared/queries/keys.ts`,
`features/quotes/queries.ts` and `reviewStep/itemTable.tsx` for D97,
`features/users/queries.ts` and `UsersDrawer.tsx` for D98. The API halves were
confirmed to accept exactly what is now sent — `CREDIT_MODES` with `op` winning
over the legacy `mode`, and `estimated_payout` in the quote contract. **Their
bars read 95% because that is what lane A last wrote about itself; the remaining
5% is the frontend work it could not do and did not claim.**

**Nothing lane B did has been seen rendered.** There are no Playwright browsers
cached in this environment, so every B4 fix is a colour judgement made from token
arithmetic against `theme.css` — and D99 is precisely the class of defect where
the numbers were always fine. The tests, the typecheck and `next build` are green;
that is not the same as having looked at it. Three things additionally cannot be
seen by any test: the two Stripe wrappers and `StoreLocations.tsx` read CSS
variables through `getComputedStyle` and hand them to an iframe and to Google
Maps. They remain outstanding in `MANUAL-VERIFICATION.md`.

**A5 is the one bar that has not moved** — dissolving `purchase-orders/` and
`sales-orders/` is the ~2,000-line money-path merge wave 3.5 deliberately left,
and it is still where it was. Everything else in wave 4 is 70% or better. Lane A
checked the seam the brief asked about and reports **nothing suggests checkout
entanglement blocks A5** — the blocker is volume and verification cost, nothing
structural.

```
A1. assemble() batching fix (D101)          ██████████████████  100%
A2. Pricing: array in, prices out           ██████████████████  100%
A3. D97 payout figure from the server       █████████████████░   95%
A4. D98 credit ledger takes {op, amount}    █████████████████░   95%
A5. Dissolve purchase-orders/+sales-orders/  ░░░░░░░░░░░░░░░░░░    0%
A6. Co-locate tests + convert to TypeScript  █████░░░░░░░░░░░░░   30%
B1. Shadows deleted, not tokenised          ██████████████████  100%
B2. One radio group, two components deleted  ██████████████████  100%
B3. Orders tree typography (263 utilities)  ██████████████████  100%
B4. The D99 state-collapse audit            ██████████████████  100%
B5. Extract shared components; adopt existing  ████████████████░░   90%
```

A5 and A6 are wave 3.5's deferred tasks 1/3 and 5/6, inherited whole. All eleven
bars are now regenerated from the lane files — the script bug that had been
hiding four of them is fixed; see How this file is maintained.

**A1 is measured, not asserted.** The composed reads were captured to JSON
before and after and compared as strings on the same dev data: `purchase.getAll`
48 rows, 40,309 ms → 4,305 ms, **9.4x**, 334,184 bytes identical;
`sales.getAll` 15 rows, 6,796 ms → 1,178 ms, **5.8x**, 31,979 bytes identical.
Both decomposition gates and `validate:wire` unchanged either side. The 40,309 ms
independently reproduces D101's 38,198 ms.

**The suite went 563 s → 468 s, 890/890 both sides** — 95 s, 17%, measured by
swapping the tree back to HEAD and running the real thing. Not the ~500 s D101
hoped for, and the gap is worth naming: the suite calls the composed read on a
handful of orders far more often than on all 48, and an N+1 over three rows
costs three round trips, not two hundred. **The 9.4x is the number that
matters** — it is what an admin opening the orders list waits for, and what the
confirmation email and the PDFs sit behind.

**Lane A also found a gate that had not run for ten commits** — see Found.

## Wave 5 — queued (not started)

```
1. Checkout creates unify                    ░░░░░░░░░░░░░░░░░░    0%
2. Scrap + bullion legacy layers deleted     ░░░░░░░░░░░░░░░░░░    0%
3. Shipping: carrier vocabulary off the UI   ░░░░░░░░░░░░░░░░░░    0%
```

Jacob sized this as "a big lift just like orders". It is queued rather than
started, and the legacy WRITE rewrite (D105) is a fourth candidate for it — or
for a wave of its own, which is what D105 argues.

---

# What has been FOUND, not built

The waves keep producing findings that outlive them. These are the live ones,
newest first; each is in `FOLLOWUPS.md` under its number, or in the lane file
named beside it.

- **`audit:test-leaks` was running the suite with one of the two guards against
  live third parties DISABLED.** `scripts/audit-test-leaks.mjs` spawned
  `node --test` with `TZ` only, while the real test script is
  `TZ=UTC NODE_ENV=test node --test`. `shared/testing/is-test-run.ts` is what
  stops a test reaching the mail transport, the FedEx client and the Stripe
  client, and its own header says it detects two ways "because either alone can
  be defeated" — `NODE_ENV === "test"` and a `--test` flag in `execArgv`. Under
  this audit only the second leg was live. **So the gate that exists to prove the
  suite touches nothing live was running that suite with half that protection
  off.** Nothing ever escaped, because the execArgv leg held. It also made the
  audit disagree with the thing it audits — 915/916 under `audit:test-leaks`
  against 916/916 under `pnpm test` — and a gate whose own run disagrees with the
  gate it audits cannot tell a regression from its own environment, which is how
  it survived. Fixed by adding `NODE_ENV: "test"` to the spawn env. **Second gate
  script found broken before this wave arrived, after `diff`; both are the D110
  class — tooling outside `features/` that nothing type-checks and nothing
  imports.**
- **`next build` caught a defect neither typecheck nor the suite could see, and
  it is now the 21st member of `pnpm check`.** A bulk import insertion left a
  `'use client'` directive on line 3 of `AdminPaymentProcessing.tsx`, below two
  imports. **`tsc --noEmit` was clean and all 155 frontend tests passed with it
  broken** — the file simply would not compile in Next, and `app/admin` with it.
  It had been outside the gate entirely; it is now member 21 of 21, placed last
  on purpose because it is the most expensive and the cheap members should fail
  first. Re-read and confirmed against the root `check` script.
- **Ruling 27's open judgement call is decided: `--shadow-overlay` goes too.**
  Its only user was the drawer. A drop shadow works by darkening the ground
  beneath it, and this ground is `#09090c` — black on black is not an elevation
  cue, it is an unrendered declaration. The old `drawer.css` comment had already
  admitted as much, saying Tailwind's own `shadow-2xl` "registers as nothing at
  all" here. The drawer separates by a hairline instead.
- **A cache trap inside the D97 fix, caught in lane A's handoff note before it
  shipped.** Passing the customer's shipping and payout choices into the quote
  request is not enough — they must also enter the REACT QUERY KEY
  (`shared/queries/keys.ts`, `purchaseOrderQuote(items, deductions)`). Without
  that, a customer changing their shipping service is served the CACHED quote,
  which is the same stale-number defect one layer up from the one being fixed.
  The key now includes the deductions, and the two new inputs are optional so the
  three goods-quote call sites are untouched.
- **The payout fee is not a function of the payout method, and production
  proves it.** Lane A measured all 61 `exchange.payouts` rows while moving the
  Estimated Payout figure server-side: ECHECK is 0 on 39 rows but **75 on one and
  125 on another**; WIRE is 20 on six rows and **0 on two**. Eleven rows disagree
  with the table the frontend has been using. So the fee constants are the
  DEFAULT FOR A NEW ORDER and must never be used to re-derive the fee of a
  stored payout — `orderQuote` already reads it off the row, correctly. Written
  into the constants file's header. `docs/waves/wave-4-lane-a.md`.
- **The credit ledger's non-negative check existed only in the browser.**
  `exchange.users.dorado_funds` is NOT NULL with no CHECK constraint, so any
  caller that was not the drawer could have driven a customer's balance below
  zero. A4 moves the guard to the server (422), takes the row `FOR UPDATE` inside
  a transaction, and returns the balance it produced — which also closes D98's
  lost-update race between two admins.
- **Ruling 33 paid off on its first use: converting two test files to TypeScript
  surfaced a defect that had been invisible for months.** 11 `tsc` errors, all
  one cause, all on the bid side, zero on the ask side — `bid.ts` declared its
  parameter as `ComposedItem` (ten required fields) while reading six through
  optional chaining, and `**/*.test.js` is excluded from the project so `tsc`
  could never see it. Fixed by declaring the structural subset the functions
  actually read, type-only, all 29 moved assertions passing unedited. **106
  `.test.js` files remain**, and the ask side had been converted properly in an
  earlier pass while the bid side had not — expect more.
- **A near-miss worth recording because the task exists to prevent exactly it:**
  lane A's first validation of the new quote input was
  `Number.isFinite(Number(v))`, and `Number([])` is `0` — an array shipping
  charge would have been accepted as free shipping and quoted a payout that read
  HIGH, which is D97's own defect class. Caught by its own test, narrowed to the
  coercion `users/service.ts` already used.
- **`orders.items.price` is answered, and the answer is not the one ruling 34
  feared.** Lane A priced all 98 priced production lines exactly as
  `calculateItemPrice` does, against `exchange` (production's `orders.items` is
  the January snapshot and has no `price` column at all). **24 lines do not
  reproduce, and ZERO of them are admin overrides.** All 20 purchase
  divergences are scrap and every one is source precision: solving each stored
  price for the content it implies lands within 0.0005 of the stored value —
  `exchange.scrap.content` is `numeric(20,3)`, so **`price` is the only
  surviving record of what the customer's metal actually weighed.** That is D61
  seen from the other side. The 4 sales divergences are different: each implies
  a premium the row does not carry, against a stored `premium` of exactly 1.01
  on all four, which looks like a default written onto the line. The column
  cannot be dropped. `docs/waves/wave-4-lane-a.md`.
- **Ten D99 state collapses, found by a tool that did not exist this morning**
  (`audit:state-collapse`), several of them live: the status filter dropdown
  went **white on white in the selected row** on both order lists, so choosing a
  status made the row you had just chosen unreadable; `viewProfitBreakdown`'s
  tabs rendered identically in all three states because `.primary-on-glass` is
  unlayered and unlayered rules beat every cascade layer; `PayoutLandingSection`
  was white-on-white **with a comment above it saying it had been fixed** — the
  container was repainted and the repaint could not reach children that
  `typography.css` colours in `@layer base`. That last one is a fourth failure
  mode, not D95's. `docs/waves/wave-4-lane-b.md`.
- **D104 — the order spot lock was pinning a stale table, and the drift runs
  BOTH WAYS.** Two live spot feeds read `exchange.metals` while the rest of
  pricing had moved to `spots.spots`. One of them is the order spot LOCK, the
  number a customer is paid on. On dev, per ounce: gold **−$150.63**, silver
  −$2.96, platinum −$27.70, palladium **+$70.66**. On a purchase order the
  business buys at the bid, so the stale table UNDERPAYS on three metals and
  OVERPAYS on the fourth — no reconciliation shortcut exists, because an affected
  order is wrong by whatever the two tables disagreed by at the moment it locked.
  Re-pointed by wave 3.5; the drift itself is the known spots-staleness thread.
- **`pnpm --filter @dorado/api diff` had not parsed for ten commits.** Bisected
  by lane A: `8cc176ee` deleted a retired feature entry and took the closing
  `};` and the entire comparison engine with it, and nine further commits edited
  a file that died on `SyntaxError` before opening a connection — four of those
  commits' messages claim gate runs. It is not in `pnpm check`, so nothing
  noticed. Repaired from `93ecdf80`. Worth saying out loud: `diff` now covers
  `payments` and nothing else, because every other feature has one
  implementation.
- **D97 — the Estimated Payout figure reads $20 high**, directly above the
  Confirm and Place Order button, and contradicts the rows beneath it.
  `(quote?.total ?? 0) - (shippingCost ?? 0 + paymentCost)` — `+` binds tighter
  than `??`, so the two deductions can never both apply. Wave 4 A3.
- **D98 — the customer credit ledger is computed in the browser** and PUT as an
  absolute total, over `$66,999.32` across 8 customers, with a lost-update race
  between two admins. Wave 4 A4.
- **D99 — a third invisible-UI class no contrast metric can catch**: a state
  token and a rest token collapsed onto each other, where both states are
  individually legible. The audit has still not been run — wave 4 B4.
- **D106 — two tests named for deletion pin live behaviour.**
  `accept-offer-pricing.test.js` is the `$26.81` pin on `finalize_pricing`;
  only its name is offer-era. Ruling 32 (judge per file, not by grep) earned its
  keep.

# Blocked on Jacob, not on a wave

Verified against `FOLLOWUPS.md` and the tree this pass. Nothing here has been
resolved.

- **The production deploy order.** No migration has run against prod and no
  `pg_dump` exists. The orders read pivot has landed, so merging to `master`
  before prod is migrated *and backfilled* serves customers a January snapshot
  (`orders.orders` in prod: 60 rows, newest 2026-01-12; `exchange`: 72 orders
  through 2026-08-24). `master` auto-deploys and there is no staging. The
  sequence is written out in CLAUDE.md; the dump comes first.
- **Promotion of the two remaining `*_SOURCE` switches.** Confirmed by reading
  the code, not the docs: exactly two survive — `PAYMENTS_SOURCE`
  (`features/payments/repo.js`) and `CHECKOUT_SOURCE`
  (`features/checkout/repo.js`), both defaulting to `exchange`. Every other
  switch is gone with its feature's pivot. One-way door. (CLAUDE.md still says
  twenty-one; that file is the coordinator's to correct.)
- **The T&C legal copy** edited by the offers purge — unreviewed, and it ships
  the moment master deploys.
- **D39** — two production products carrying `E'\n\tBar'`, a newline and a tab
  in front of "Bar", against a sales-tax rule that compares text to an enum and
  raises 22P02. Not reachable today, but `get_product_types` is an unfiltered
  `SELECT DISTINCT`, so the admin dropdown offers the corrupt value beside the
  real one. The fix is an UPDATE against production.
- **`orders.items.price` — COUNTED, and it forces two decisions.** Ruling 34's
  precondition is not met: 24 of 98 priced production lines do not reproduce, so
  the column stays. Nobody typed a different number, but on those 24 rows
  `price` is the only surviving record. (1) Widening `exchange.scrap.content`
  from `numeric(20,3)` is D61 and is a production migration. (2) The four sales
  rows whose `premium` contradicts their own `price` are a defect in their own
  right and want a look. Neither is the agent's call.
- **`Spots.tsx`'s full-bleed `bg-brand` bar still collides with ruling 19.**
  Flagged twice now and untouched both times; lane B preserved it exactly rather
  than decide it.
- **`CartTabs`' two tabs use different active treatments** — `underline` on Sell,
  `underlineSubtle` on Buy. Preserved exactly because it looks accidental rather
  than intended, which is a question only Jacob can answer.
- **Bank details are unencrypted at rest**, and production holds fourteen —
  10 ACH and 8 WIRE rows of `exchange.payouts` carrying real routing and account
  numbers in plaintext. The payments migration must not copy them into
  `payments.details`.
- **$126.48 production was paid has no record.** Three Stripe intents captured
  with `amount_received` null or 0; two further charges with no row at all. The
  money is safe — Stripe is right — but the webhook is not reliably landing, and
  the visible symptom is a checkout that fails at the last step.

---

# What each wave is

**Wave 3.5 — factor, delete legacy, co-locate.** Every resource gets its own
full stack: `routes.ts`, `controller.ts`, `service.ts`, `repo.ts`. The parent
mounts routes rather than declaring them, so checkout can depend on
`fulfillments/methods` without dragging in pickups, directs and the schedule.
Paths do not change — the URL and the file answer different questions. Legacy
code that has been *proven* (data migration verified, reads pivoted) is deleted
or moved to `api/legacy/`, one top-level directory so that promotion day is a
single deletion. Tests move under `tests/` and become TypeScript in the same
pass, because doing those separately moves every file three times. The goal is
that `purchase-orders/` and `sales-orders/` cease to exist: direction is a
column, not a feature.

**Wave 4 — the money and the last of the styling.** Lane A is API logic. The
batching fix comes first because it pays for everything after it: the composed
read queried the shipment and pickup inside a per-order loop, ~214 round trips
against a database 178 ms away versus 2 for the slim list. Then pricing becomes
one module with an array API that returns *prices*, not items — thirty items is
one call, and the caller already has the items it sent. Then the two live money
defects, D97 and D98. Lane B finishes the styling: the shadows are deleted
rather than tokenised, the three radio components coalesce into one group, the
orders tree's 263 remaining type utilities go, and someone finally runs the D99
audit — selected-versus-unselected across order rows, drawer tabs and status
chips, which no contrast metric can answer because both states are individually
legible.

**Wave 5 — checkout proper.** Sized as orders-scale rather than a tidy-up. The
creates unify off the legacy routes, the scrap and bullion legacy API layers
delete after covenant verification, and the shipping mess gets addressed: the
frontend currently matches FedEx service types directly, which is the same
defect class as the wire work — the frontend should not know carrier vocabulary
at all.

# How this file is maintained

**Regenerate the bars with `node scripts/waves.mjs`** (`--check` to preview).
It reads every task line out of `docs/waves/*.md` and rolls them up into this
index, so the numbers here are whatever the agents last wrote about themselves
rather than whatever someone last remembered to type. A tracker that is only
accurate when someone remembers is worse than none.

**The script was silently dropping any task whose name was 43 characters or
longer — FIXED, and it had been hiding four of wave 4's eleven.** Its task regex
demanded TWO OR MORE spaces between the name and the bar. Both lane agents align
their bars to a fixed column, so a long name left exactly one space and the line
did not match: no warning, no count, the bar simply never moved. B2 had been
reported COMPLETE at 100% and B5 at 70%, and this page went on showing both at
0%. `scripts/waves.mjs` now accepts one space and, better, **warns when a task a
lane reported matches no line in the index** — the missing half of the original
design, since a silent skip in a script whose whole job is reporting progress
accurately is the same shape as D95, D99 and D108: a detector that recognises one
spelling reports clean on the others.

That warning immediately earned itself. It showed that four of wave 3.5's seven
task names in this index did not match the names in `docs/waves/wave-3.5.md` —
they had been hand-typed and were tracking nothing. Their values happened to be
right; they are now spelled identically and actually regenerate. **The lane file
is the source; names here are aligned to it rather than to what reads nicely.**

**A second bug of the same species, in the same file, also fixed.** The rewrite
normalised names into a flat 44-column field, so a name of 44+ characters came
back out with NO space before its bar and could not be matched on the following
run — the first bug required two spaces and got one, the second produced one
space and then none. It now pads to `max(44, name.length + 2)`; verified across
two consecutive regenerations. **Both failed silently, and that is the lesson
three other findings landed on tonight** (D95, D99, D108): a detector's blind
spot reports as clean. A progress tracker that silently drops a task is the same
defect wearing a different hat, and in both cases the fix was to make the MISS
LOUD rather than to make the matcher cleverer.

The tracker owns this file and the published artifact. Each agent owns exactly
one file under `docs/waves/` and updates only that one — never this index, never
another agent's. Two agents editing one shared file is how two rulings were lost
on 2026-08-28; the split is the fix, not bureaucracy. `FOLLOWUPS.md` is the
coordinator's alone and remains the authority for rulings and findings.

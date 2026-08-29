# Waves

Where the rewrite is. Bars first, descriptions below. Every sha in the table was
checked against `git log`; every status word was checked against the lane files
and the working tree, not against what this page said an hour ago.

> ## STOP — THE SCRAP/BULLION COVENANT IS REFUTED. NOTHING GETS DELETED.
>
> Lane 5c measured the claim that scrap and bullion lines "are `checkout.items`
> now". **They are not. `checkout.checkouts` and `checkout.items` hold ZERO rows,
> in dev AND in production.** Nothing has ever moved: there is no backfill for
> checkout (068/069 are additive DDL only) and `CHECKOUT_SOURCE` still defaults
> to `exchange`, so the reads have not pivoted either.
>
> **23 production scrap rows, across 12 sell carts and 12 distinct customers,
> exist in `exchange` and nowhere else** — real declared parcels, 459.374 g of
> 0.900, 272.228 t oz of sterling, 13.419 g of 0.203 — and `checkout.items` has
> no row for any of them. Exchange-only rows on the cart tables: **every single
> one** (3 + 26 in production).
>
> **All four steps of the pre-deletion checklist are unmet.** The first could not
> even be attempted: `verify:parity` held **11** pairs and not one was a cart, a
> cart item or scrap, so the tool the covenant names had **never looked at this
> feature**. 5c has since fixed the instrument — **15 pairs now**, four of them
> cart tables, verified by the tracker against the array — **and all four print
> `>> NOT SAFE`.** No decomposition gate exists for checkout either.
>
> **One caveat that must not be lost, because it makes the new pairs a trap
> later:** the comparison joins on `id`, and a checkout row does not keep its
> exchange row's id — `repo.next.ts` inserts without one, so every row gets a
> fresh `gen_random_uuid()`, and there is **no `source_*`, `legacy_*` or
> `exchange_*` column anywhere in the `checkout` schema**. While the target is
> empty these entries are exact. The moment anything lands in it they can never
> go green: `missing_from_target` will still count every source row, and
> `differing values: 0` will mean *nothing joined*, never *the values agree*.
> **Making it permanently answerable is a schema change, not a script change** —
> `orders.addresses.source_address_id` is the shape that already exists for this,
> and `checkout.checkouts`/`checkout.items` want the same plus a backfill. That
> is a migration and Jacob's call; 5c wrote none.
>
> **Wave 5's task 2 is therefore not merely unstarted — it must not start.** 5c
> stopped, which is the whole reason the covenant is run first. Deleting those
> layers would have destroyed the only copy of 23 customers' declared metal.

> **WAVE 4 IS COMMITTED: `a2599311`** — 167 files, +5563/-2509, on a green
> 21-member gate (`CHECK_EXIT=0`, zero failures, and the newly added `next build`
> member ran through to Next's route table). Verified against `git log`.
>
> **D97 and D98 are fixed end to end** — lane A landed the API halves, the
> coordinator wrote the frontend halves once lane B freed `frontend/**`. Checked
> in the tree before this was written: `reviewStep/itemTable.tsx:77` reads
> `quote?.estimated_payout ?? 0` and the `(quote?.total ?? 0) - (shippingCost ??
> 0 + paymentCost)` expression is gone; `UsersDrawer.tsx:133` sends
> `{ user_id, op: mode, amount }` with `newAmount` surviving only as the
> on-screen preview.
>
> **It is committed, not finished.** A5 — dissolving `purchase-orders/` and
> `sales-orders/` — is untouched at 0%, and A6 is partial at 30%. Both were
> deliberate stops, both carry into wave 5, and neither is hidden by the bar.

```
OVERALL   █████████████████████████████████░░░   ~93%
```

| | wave | | |
|---|---|---|---|
| ✅ | **D77–D86** conversions, wire axis retired | `██████████████████` | 100% · landed |
| ✅ | **D87/D88** unified orders surface | `██████████████████` | 100% · `0a201bc0` |
| ✅ | **wave 2** orders read pivot | `██████████████████` | 100% · `a12b76ed` |
| ✅ | **styling** dark-only, components own appearance | `██████████████████` | 100% · `9de7d283` |
| ✅ | **wave 3** the order wire slims | `██████████████████` | 100% · `2208932e` |
| 🟡 | **wave 3.5** factor, delete legacy, co-locate | `██████████░░░░░░░░` | COMMITTED `a9b7dd61` · 58% of its scope |
| 🟡 | **wave 4** batching, pricing, styling lane B | `███████████████░░░` | ~83% · COMMITTED `a2599311` · A5 untouched, A6 partial |
| 🔄 | **wave 5** orders, carriers, scrap covenant | `█████████████░░░░░` | ~70% · IN FLIGHT · COVENANT REFUTED, deletion cancelled |

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

## Wave 4 — COMMITTED at `a2599311`, with A5 and A6 carried forward

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
A6. Co-locate tests + convert to TypeScript  ██████░░░░░░░░░░░░   35%
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

## Wave 5 — IN FLIGHT, three lanes (5c's covenant stopped task 2)

All three lane files are live and every bar below is a lane's own number, in its
own words. **5b was not stalled after all** — it reported at 23:07 with task 1 at
90%, having been deep in the work rather than stuck; the quiet stretch was a
task-boundary rule not honoured, not a dead lane. **5c was dispatched mid-wave**
off D124, because task 2 turned out to sit in features no lane owned.

**`api/features/purchase-orders/` and `api/features/sales-orders/` DO NOT
EXIST.** Verified in the tree, not just reported: both directories are gone, all
eleven merges are done, every lint is green, and the four gate scripts that
import application code report wave 4's numbers. **Task 1 is now 100%, confirmed by the full suite: 934 tests, 934 pass, 0 fail,
498 s.** Task 2's move half is complete — 28 test files co-located under
`features/orders/tests/` — and 5 of 28 are converted to TypeScript so far. **This
is the ~2,000-line money-path merge that wave 3.5 deliberately refused and wave 4
left at 0%**, and it went in behind a file-by-file plan with `typecheck` +
`lint:imports` + `lint:namespace-calls` after every single step.

**The suite went 916 → 934 and nothing was deleted**: no test was added or
removed, the delta is three `refiner-spots` fixture guards plus node counting the
same assertions under new file names. Ruling 32 was applied per file, and **two
files were RENAMED rather than deleted** — `accept-offer-pricing.test.js` →
`finalize-pricing.test.ts` (the `$26.81` pin) and `offer-and-items.test.js` →
`item-writes.test.js`. Only their names were offer-era, which is what D106
established and what two agents have now checked independently.

Two suite failures on the way, both mechanical and both fixed: a migration read
by a relative path that needed one more `../` after the move, and — see the
finding below — a second copy of the route-census filename bug.

The collisions resolved by direction-naming on BOTH sides rather than by picking
a winner: `composeItem`/`composeOrder` → `compose{Purchase,Sales}{Item,Order}`,
`createOrder` → `create{Purchase,Sales}Order`, `insertOrder` →
`insert{Purchase,Sales}Order`, six more at `service.ts`. Four reference reads
(users, addresses, products, metals) turned out to be byte-identical duplicates
and are now one declaration.

**5b finished task 1 — the carrier's vocabulary is out of the browser.**
Gone from the frontend: `pickupOptions` keyed by `DROPOFF_AT_FEDEX_LOCATION` and
`CONTACT_FEDEX_TO_SCHEDULE`, `serviceOptions` keyed by `FEDEX_EXPRESS_SAVER` and
`PRIORITY_OVERNIGHT` carrying FedEx's `FDXE` code, and five branches on
`pickup.label === 'CONTACT_FEDEX_TO_SCHEDULE'` — the browser deciding what to
render next from a carrier's enum. It also found a fourth of the same family on
the way: **FedEx's production uuid `30179428-…` was a literal at three checkout
call sites**, one of them with a TODO beside it.

It gated itself properly: shipping + fulfillments suites **162/162** (re-run
after its last change), handoffs 18/18, frontend 163/163 with 8 new render tests,
`frontend build` compiled successfully, `validate:wire` 27 shapes / 0 diverge,
`verify:genesis` OK with no schema changed and nothing migrated, and
`audit:routes` showing both new routes guarded with **every existing shipping URL
byte-identical**. It also wrote a new guard, `lint:carrier-vocabulary` — with a
`--self-test`, per D123 — which reports **0 occurrences in product code** across
376 files. The 6 unresolved calls `lint:namespace-calls` reports are 5a's
in-flight dissolution, not 5b's change.

**5c reported, and its numbers stopped the wave's second task dead.** Its task 1 is the covenant: the evidence that scrap and bullion data is
genuinely migrated. **Nothing gets deleted from `features/scrap` or
`features/checkout` until that evidence clears** — exchange-only rows, value
agreement, per-direction counts. 5b gathered none of it (D128), so 5c starts from
zero, and its file currently says so honestly rather than implying otherwise.
That is exactly what happened: **the evidence does not clear, so task 2 stays at
0% and the legacy layers stay.** 5c's own file ends "Task 2 — NOT STARTED, AND
NOT STARTING". Its task 1 sits at 80% because the measuring is nearly done, not
because the answer is in doubt — the answer is settled and it is *no*.

**5b named the four files it touched outside its own partition, rather than
burying them** — which is what makes a three-lane shared tree workable. One
import specifier in `api/app.js` (no mount path changed), an append-only edit to
the shipping contracts, two reference query keys, and `package.json` for the new
lint. It also removed `PickupType` and `ShippingService`, the two interfaces that
described the deleted constants and that nothing referenced, per ruling 32. **The
gate is now 22 members**: 5b placed `lint:carrier-vocabulary` at position 11,
just before the frontend typecheck, on the reasoning that a guard nothing runs is
a guard that rots — the lesson D115 paid for. Verified against the root `check`
script, not taken on the lane's word.

**D127 — one deliberate behaviour change on the checkout path, stated rather
than discovered.** `useGetRatesInput` used to refuse to build an input until `carrier_id`
existed — which was always, because it was a literal. It now refuses until the
HANDOFF is known, because `pickupType` changes what the carrier quotes and its
default used to be a FedEx enum spelled in `checkoutStepper` and present on first
render. Coming from a reference read, there is one tick with no handoff, and
`pickupType: ''` would ask the carrier to rate a handover it does not recognise.
**The rate quote now arrives one tick later instead of being wrong.**

**D126 — 5b pinned the money-path invariants rather than assuming them:** the order
create body is unchanged, `pickup.label`/`pickup.name`/`service.serviceType`/
`service.code` still travel with the same values (received from the server now
rather than declared in the browser, and handed back uninterpreted), nothing was
reordered around the Stripe confirm (D49), no arithmetic on a price moved (D82),
and **no migration was written, nothing dropped, `exchange` untouched**. The
sharpest of those: `pickup.name` is what lands in `shipments.pickup_type`,
production holds 62 rows reading exactly `Store Dropoff`, and
`features/media/pdfs` compares against that string twice — now pinned by a test
that says so.

**The survey it did first is the interesting part.** The merge is planned file by
file in dependency order, with `typecheck` + `lint:imports` +
`lint:legacy-boundary` after each step and the suite at milestones, and the plan
names the collision at every one — `composeItem`/`composeOrder`,
`getAll`/`findById`/`findAllByUser`, `createOrder`/`Executor`,
`insertOrder`/`NewOrder`, six functions at `service.ts` — which is the survey
wave 3.5 said the merge needed before anyone touched it.

One shape change worth noting: `repo.next.ts` lands as
`features/orders/repo.mirror.ts`. The `.next` was migration-era vocabulary for a
switch that no longer exists.

**5b has named its defect precisely, and it is worse than "the frontend knows
FedEx".** `frontend/features/handoff/types.ts` hand-rolls the two FedEx
pickup-type enum values **as object keys**; `frontend/features/service/types.ts`
hand-rolls the FedEx service types and the `FDXE` carrier code; and three
checkout components branch on `pickup.label === 'CONTACT_FEDEX_TO_SCHEDULE'` — a
carrier's string literal steering customer-facing control flow.

- **Lane 5a — the orders dissolution.** Wave 4's A5 and A6, inherited whole:
  dissolve `purchase-orders/` and `sales-orders/`, then co-locate the tests and
  convert them to TypeScript. Owns `api/features/{purchase-orders,sales-orders,
  orders,pricing}`, `api/legacy`, the contracts, **and** `frontend/features/
  orders`.
- **Lane 5c — the scrap/bullion covenant, and only then the knife.** Dispatched
  mid-wave because of D124: task 2 lived in features no lane owned. Owns
  `api/features/{scrap,checkout}` **and** `frontend/features/{scrap,cart}` plus
  the checkout components consuming them. Its own framing is the right one — the
  covenant evidence is task 1 and the deletion is task 2, in that order.
- **Lane 5b — carrier vocabulary and the legacy layers.** Get the FedEx service
  types and pickup strings off the frontend, and delete the scrap and bullion
  legacy API layers **if the covenant evidence supports it** — its file says
  "if", and the covenant check is the deliverable either way. Owns
  `api/features/{shipping,fulfillments}` **and** `frontend/features/{shipping,
  checkout,handoff,insurance}`.

```
1. Dissolve purchase-orders/+sales-orders/  ██████████████████  100%
2. Tests -> tests/, converted to TypeScript  ███████████░░░░░░░   60%
3. Checkout creates seam (report only)      ██████████████████  100%
1. Carrier vocabulary off the frontend      ██████████████████  100%
2. Scrap + bullion legacy layers - REASSIGNED TO 5C  ░░░░░░░░░░░░░░░░░░    0%
1. The covenant: scrap+bullion data migration  ██████████████████  100%
2. Delete legacy scrap/bullion API layers   ░░░░░░░░░░░░░░░░░░    0%
3. Make the covenant answerable (parity pairs)  ██████████████████  100%
```

Three lanes: the first three tasks are 5a's, the next two 5b's, the last three
5c's. Each lane numbers from 1, which is why the block restarts twice. 5c's third
task did not exist when the wave was dispatched — it added it after finding the
instrument could not answer the question.

**The partition changed shape, and that is the point** — see D119 below. Each
lane owns BOTH halves of its features rather than one side of the tree.

Jacob sized this as "a big lift just like orders". What 5a inherits is not small:
A5 is a ~2,000-line merge with a real collision at `repo.ts`, `compose.ts`,
`read.service.ts`, `write.service.ts`, `service.ts`, `controller.ts` and
`routes.ts`, four of which already exist in `features/orders/`, on the money path
— where lane A reported **nothing structural blocking it, only volume and
verification cost**. A6 has **106 `.test.js` files remaining**, and the first two
converted produced eleven real errors.

The legacy WRITE rewrite (D105) is a further candidate — or a wave of its own,
which is what D105 argues, since `verify:parity` cannot re-check it afterwards
and the ledger has to run BEFORE.

---

# What has been FOUND, not built

The waves keep producing findings that outlive them. These are the live ones,
newest first; each is in `FOLLOWUPS.md` under its number, or in the lane file
named beside it.

- **5c fixed the instrument rather than only reporting it could not answer** —
  and then wrote down what the fix still cannot tell you. `verify:parity` went
  from 11 pairs to 15, the four cart pairs all print `>> NOT SAFE`, and it is
  deliberately **not** a `pnpm check` member, so it cannot redden another lane's
  gate. Two honest limits stated in the same breath: the pairs are exact only
  while the target is empty (the id-join trap in the banner), and **`exchange.scrap`
  is deliberately NOT a pair** because it fans out three ways — `orders.items`
  for an ordered line, `refiners.items` for the assay, `checkout.items` for a
  sell-cart line — so no single target holds it. Run against `orders.items`
  anyway it says "20 missing, 57 only in target, DO NOT BACKFILL", and all three
  numbers are artefacts of comparing a merge to a pair. That is the same reason
  CLAUDE.md gives for parity never having looked at orders.
- **`verify:parity` now exits non-zero for two unrelated reasons, and a reader
  must not conflate them.** Besides the four new NOT SAFE cart pairs, the
  pre-existing `exchange.metals → metals.exchange_compat` reports **4 differing
  values of 4 rows** and did so before this change: gold ask 4461.43 against
  4612.06, silver 68.45 against 71.41. Dev's spot poller updates one side and not
  the other, so that pair drifts by construction. Same family as D104, and named
  by 5c precisely so it is not read as new breakage.
- **A SECOND D124 instance, and this one is on the money path.**
  `api/features/quotes/` belongs to no lane in wave 5, and it holds an unswitched
  new-schema read — quotes being the endpoints that price every customer-visible
  number since D81–D84. Found by 5c while walking its own boundaries. The
  partition question is not answered once at dispatch: **every wave needs the
  task list walked against the ownership map, and this one has a gap nobody
  noticed until an agent looked sideways.**
- **The two order directions disagree about the premium on a cart line.**
  `addItems` (sale) writes no premium at all; `replaceSellItems` (purchase,
  product branch) writes `b.bid_premium` as the premium. Reported by 5c, not
  touched. It sits directly beside the `bid_premium` finding above — the column
  with no home, which for 23 production rows is the only premium recorded
  anywhere.
- **One thing in 5c's tree could be deleted on evidence alone, and it was left
  alone anyway.** `api/features/scrap/service.ts` has **zero importers** — its
  two functions are pass-throughs and all three live callers import the repo or
  the util directly, so it is dead by ruling 29's test with no data argument
  needed. 5c left it because task 1 did not clear. That is the covenant being
  treated as a gate rather than a formality: *nothing* goes, not just the risky
  things. It also confirmed what is NOT dead — `scrap/repo.ts` is live on the
  order path, and `checkout/repo.exchange.js` is what `CHECKOUT_SOURCE` selects.
- **THE COVENANT IS REFUTED — nothing was ever migrated, and the deletion is
  cancelled.** Full figures in the banner at the top and in
  `docs/waves/wave-5c.md`. The short version: `checkout.checkouts` and
  `checkout.items` are EMPTY in both databases, every cart row is exchange-only,
  and 23 production scrap rows across 12 customers exist nowhere else. **This is
  the covenant doing exactly the job it exists to do** — the deletion looked
  routine, was scheduled as a task, and would have destroyed the only copy of
  those parcels. Worth noting how close it came: task 2 was originally handed to
  a lane whose partition did not contain it (D124), and if 5b had simply *tried*
  rather than declining, the evidence would never have been gathered.
- **A production purchase-order line disagrees with itself on the weight and the
  purity a customer is paid on.** Found by 5c while comparing
  `exchange.purchase_order_items` JOIN `exchange.scrap` against `orders.items`,
  column by column: 57 pairs on production, one differing — order item
  `d16b7c32`, order `117265cc` — `pre_melt` 18.662 against 20.000, `post_melt`
  18.662 against NULL, `purity` 0.570 against 0.563, `content` 0.342 against
  0.362. Dev is clean at 20 pairs / 0 differences, so this is the January-refactor
  drift CLAUDE.md's deploy-order block warns about, now with a specific row on
  it. **Reported and deliberately not touched** — `orders.items` is lane 5a's
  table. Also: 27 of production's 89 `purchase_order_items` have no
  `orders.items` row at all, which is expected, because the production backfills
  have never been run.
- **`exchange.scrap.bid_premium` is the single unhomed populated column
  `audit:coverage` reports, and on 23 rows it is the only premium recorded
  anywhere.** 105 of 105 production rows populated. It is NOT the source of
  `orders.items.premium` — that comes from `purchase_order_items.premium`,
  verified at 0 differences on dev against the order line and 34 of 57 against
  `bid_premium`. So it is a separate quoted figure, and for the cart-only scrap
  rows nothing else records it.
- **The TypeScript conversion keeps paying out, twice more in 5a.** (1) The
  `supertest` shim declares only the verbs the tests use, deliberately, so
  reaching for anything else fails rather than silently becoming `any` — and **it
  had never declared `patch`, while PATCH is now the entire order mutation
  surface** (`/orders/:id`, `/orders/items/:id`, `/shipments/:id`,
  `/refiners/orders/:id`, the routes D87 consolidated out of the RPC zoo). Every
  test exercising them is JavaScript, so `tsc` never saw the call. The narrow
  declaration did its job; nobody had asked it a question until a PATCH test
  became `.ts`. (2) Three of `refiner-spots`' four tests took a fixture the first
  test guards and went straight to `order.id` — `tsc` flagged
  `'order' is possibly 'undefined'` seventeen times and was right: without that
  fixture they fail with a TypeError instead of saying what is missing, and the
  assertions below never run. **23 test files remain**, and they are the large
  ones (`parity` 402 lines, `sales-service` 392, `patch` 391, `create` 356),
  each carrying `let admin;`-style fixtures that need a declared structural
  subset — which is exactly the `bid.ts` work from wave 4 and exactly where the
  next defects of this class will be.
- **D129 — a string that reads like a UI label is the only thing coupling three
  modules, and renaming it would have refused every order placed through it.**
  The most dangerous thing found in wave 5. `pickup.name` looks like display
  text. It is not: **nothing between these three is a foreign key, and nothing is
  a constraint** — they must simply agree by value.
  1. `features/orders/intake.ts` indexes the handoff methods **by this string**
     and **THROWS** on a value it does not know. A bad name does not degrade —
     **it refuses the order**, at CHECKOUT, not in review.
  2. `features/orders/service.ts:501` **books a real courier** when it equals
     `"Carrier Pickup"`. The string decides whether FedEx is dispatched to a
     customer's door.
  3. It is written verbatim to `shipments.pickup_type`, and
     `features/media/pdfs` compares against `"Store Dropoff"` twice to decide
     what a packing list says.

  Two things earn it the top slot. **It was sitting inside the file 5b was sent
  to rewrite** — a wave aimed squarely at carrier vocabulary walked straight into
  it, and the safest-looking edit in that file was the fatal one. And it is
  **D39's shape one layer up**: D39 was text-against-enum inside SQL, this is
  text-against-text across three modules and a database column, and the
  consequence is a courier at a customer's door rather than a query error. Now
  pinned by `handoffs/tests/unit.test.ts`, which asserts every offered handoff is
  a name intake can file, and that the one which books a courier is the one that
  collects a date and a time.

  **The rule, now that there are three instances (D39, D103, D129): if two places
  must agree BY VALUE and nothing enforces it, that is a defect waiting for its
  first rename.** It is invisible to the type system, to `verify:parity`, to
  `validate:wire` and to every audit that compares rows or shapes — because
  nothing is wrong until someone edits a string that looks safe to edit.

- **D124 — a task spanning features nobody owns never gets done. RESOLVED
  mid-wave.** 5b was
  given "scrap + bullion legacy API layers" but those live in
  `api/features/scrap` and `api/features/checkout`, and 5b's partition is
  `shipping` + `fulfillments`. So the task is outside the scope of the only lane
  assigned to it — 5b's own file says "not mine to start", correctly. This is the
  flip side of D119: partitioning by feature guarantees nobody reaches across a
  boundary, which also means **a task spanning features nobody owns simply does
  not get done, quietly**. It needs either a scope extension for 5b or its own
  lane. **Resolved within the hour by dispatching lane 5c**, which owns scrap and
  checkout outright. The two failure modes are symmetric and a partition must be
  checked against both: D114 asks *does every SEAM have an owner*, D124 asks *does
  every TASK fall inside somebody's boundary*. Neither is visible from the lane
  briefs alone — both are the coordinator's to walk at dispatch.
- **D128 — a promised-but-absent evidence section is worse than a missing one.**
  5b's file said the checkout covenant evidence "is recorded below rather than
  assumed" — **and the file ended there.** No evidence followed. That is a false
  assurance with a longer half-life than silence: a later reader sees a claim
  that verification happened and stops looking. It is the same shape as the four
  broken gate scripts this session — a green exit, a passing self-test, a comment
  saying a lock was taken — each asserting a check that was not actually
  happening. **The rule: never write that evidence exists until it is written
  down. "Verified" with nothing after it is a claim, not a record.** **Corrected at source within
  minutes**: 5b replaced the sentence with "Nothing was measured for it here…
  It does not exist. 5C starts from zero", which is the honest form. 5c's file
  opens the same way: "Status: started. Numbers land here as they are
  measured."
- **D125 — no production purchase order has ever used a carrier pickup.** Measured by
  5b against production: `exchange.shipments.pickup_type` is `Store Dropoff` 62
  and `DropShip` 9, and **`Carrier Pickup` never**. The entire scheduler path —
  `check_pickup`, the calendar, the slot list — is unexercised by real traffic,
  which is worth knowing before anyone spends a wave on it.
- **`code` and `provider_code` are NULL on every `carrier_services` row, in
  production and in dev.** All eight rows, both databases. That is *why* the
  offered-service catalogue is served from the adapter rather than the table: no
  row can say which FedEx service it means. Populating them is an UPDATE against
  production, so it is Jacob's and not a migration. The endpoint already sits
  where the table-backed version will serve, so the eventual swap is a change of
  source, not of surface. (Also noted: dev's `exchange.carrier_services` holds 2
  rows against production's 8.)
- **A named seam 5b deliberately did not cross: package types.**
  `frontend/features/packaging/types.ts` hand-rolls six boxes, three of them
  literally `FedEx Small`/`Medium`/`Large`, and `shipping.packages` already holds
  exactly those nine rows with `is_carrier_packaging` as the same flag. Two
  sufficient reasons to stop: **`shipping.packages` has no weight column**, and
  the browser's per-box weight is a FLOOR on billable weight
  (`Math.max(cartWeight, box.weight)`) that PRICES THE LABEL — so replacing the
  constant needs `ADD COLUMN weight_lb` plus a seed, a migration and a genesis
  regeneration, while another agent is mid-series in the same tree. And
  `packageOptions` has three consumers inside `frontend/features/orders/**`,
  which is 5a's partition. **The partition worked exactly as D119 intended: the
  agent stopped at the boundary and wrote down the crossing rather than reaching
  through it.**
- **D120 — the route census, the security audit that lists every route and the
  middleware in front of it, silently dropped six routes and EXITED 0.** Found by lane 5a when `creates.routes.ts` appeared.
  `scripts/route-guards.mjs` had three assumptions hardcoded to a shape that was
  merely true rather than required: `walk()` matched the exact filename
  `routes.ts`, so a differently-named router file was never opened; the import
  parser matched DEFAULT imports only, so a named-export router resolved to
  nothing; and the route regex matched a variable literally named `router`, so a
  file declaring two routers contributed neither. Any one of them made six routes
  — including `DELETE /api/purchase_orders/purge_cancelled` and both
  `create_review` paths — **vanish from an authorization audit while it reported
  success**. Census restored to **131 routes from 125**, every guard unchanged,
  and an `app.use` whose identifier cannot be resolved is now a FAILURE rather
  than a skip. **The same defect existed in a SECOND place, and the contrast is the
  lesson.** `endpoints.test.js` hardcoded the identical filename check
  (`e.name === "routes.js" || e.name === "routes.ts"`) and reported six live
  handlers as unrouted — but it **FAILED LOUDLY**, because it is an assertion,
  while the census **silently exited 0**, because it is a report. Same bug, same
  tree, same night; one stopped the suite and one stopped nothing. Both walks now
  use a regex. **If a check can be wrong, make it assert rather than print.**
  **This is the fourth gate script found broken by a factoring pass
  this session** — after `diff`, `validate:wire`'s caller and `audit:test-leaks`
  — and the pattern is now unmistakable: tooling under `scripts/` that nothing
  typechecks, nothing imports and no test covers rots silently while everything
  it audits stays green. **But this one failed differently, and worse.** The other
  three were invisible because they are not gate members, or because a moved
  function still resolves. This one **was run, and reported success** — it simply
  answered about a subset and called it the whole. A gate that does not run is a
  gap someone can notice; a gate that passes on a fraction is a false assurance,
  and on an authorization census that is the difference between "we did not
  check" and "we checked and it is fine".
- **D123 — the guard recommendation, measured and partly REFUTED.** The proposed rule is that every `api/scripts/*.mjs` should
  either carry a `--self-test` or be exercised by something, and that any script
  which COUNTS things should assert a FLOOR. Coverage today: **45 scripts, 14
  with a self-test or a floor, 31 with neither.** The rule holds up against the
  evidence but not perfectly, and the exception is the instructive part — of the
  four that rotted, `diff`, `validate:wire`'s caller and `route-guards` had no
  guard at all, but **`audit:test-leaks` DID have a `--self-test` and rotted
  anyway**, because its failure was environmental (a missing `NODE_ENV` in the
  spawn) rather than a miscount, and a self-test that proves the detector can see
  a change says nothing about the environment the subject runs in. So the rule
  would have caught three of four. Worth adopting on those terms, not as a
  guarantee — and the fourth case needs a **second, different rule: a script that
  runs the suite must run it the way `pnpm test` does, rather than assembling its
  own invocation.** Two rules, not one.
- **D121 — `legacy/` was one merge away from importing `#features/pricing` at
  runtime**,
  which would have made the directory un-deletable in a single `rm -rf` — the one
  thing `lint:legacy-boundary` exists to refuse, caught by the guard wave 3.5
  wrote for exactly this. `repo.exchange.js`'s `updateOrderItemPrices` was
  calling `calculateItemPrice` itself; the exchange half now TAKES prices and
  `repo.dual.js` computes them with the same function on the same items in the
  same order. Nothing about what lands in the column changed. **This is the
  counter-example to the other four**: a guard written speculatively during wave
  3.5, for a hazard nobody had hit yet, was the one that held — and it paid off
  inside a single wave.
- **D122 — each order direction has already chosen the OPPOSITE create strategy,
  and nobody decided that.** For purchases, the live path is
  `repo.dual.insertOrder` — exchange first, then re-derive the mirror — and
  `insertPurchaseOrder`, which writes both schemas directly, has **no
  product-code caller**. For sales it is exactly inverted: `insertSalesOrder` is
  live and the sales mirror is what nothing calls. `features/orders/create.ts` is
  a **third** implementation, written for checkout and called by nothing.
  Unifying them is choosing one, which is the write-path rewrite D105 scopes as
  its own wave with the covenant ledger run BEFORE the switch — so 5a reported
  the seam and did not touch it, which is the right call on the money path.
- **D119 — wave 5 is partitioned by FEATURE, not by tree, and that is D114's
  structural consequence.** Wave 4 split api-lane / frontend-lane, which was
  right for throughput and wrong at exactly one seam: D97 and D98 each needed
  both halves, so both fixes sat fully built and fully inert with green gates on
  either side saying so. Wave 5 gives each agent **both halves of the features it
  touches** — 5a owns `api/features/{purchase-orders,sales-orders,orders,pricing}`
  and `api/legacy` **and** `frontend/features/orders`; 5b owns
  `api/features/{shipping,fulfillments}` **and**
  `frontend/features/{shipping,checkout,handoff,insurance}`. It trades a little
  parallelism for the guarantee that whoever owns a feature owns its whole
  change, so nothing can fall into the gap between two lanes. **If it holds, this
  is the shape future waves should use** — which is why it is recorded here as a
  finding rather than a scheduling note. `docs/waves/wave-5a.md` cites D114 in
  its own scope line.
- **D115 — `audit:test-leaks` was running the suite with one of the two guards
  against live third parties DISABLED.** `scripts/audit-test-leaks.mjs` spawned
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
- **D113 — `next build` caught a defect neither typecheck nor the suite could
  see, and it is now the 21st member of `pnpm check`.** A bulk import insertion left a
  `'use client'` directive on line 3 of `AdminPaymentProcessing.tsx`, below two
  imports. **`tsc --noEmit` was clean and all 155 frontend tests passed with it
  broken** — the file simply would not compile in Next, and `app/admin` with it.
  It had been outside the gate entirely; it is now the LAST member, placed there
  on purpose because it is the most expensive and the cheap members should fail
  first. **The gate has since grown to 22** — 5b added
  `lint:carrier-vocabulary` as member 11, just before the frontend typecheck so a
  cheap member fails early. Both counts re-read from the root `check` script
  rather than taken from a lane's word.
- **D112 — a fourth invisible-UI failure mode, and it means several earlier
  fixes never applied.** The pattern three agents used and the coordinator
  endorsed was: when a container is painted light-on-light, drop its paint, set
  `text-primary-foreground` on the CONTAINER, and let the children inherit. **It
  does not work.** `PayoutLandingSection.tsx` carried that fix, had a comment
  above it saying it was fixed, and was still white-on-white and still live —
  because `typography.css` colours `h3` and `p` in `@layer base`, and **a
  declared rule beats an inherited value**. Inheritance only reaches a child that
  declares nothing, so the moment the type scale started colouring semantic tags
  — ruling 17, our own work — every "let the children inherit" fix silently
  stopped reaching `<h3>`, `<p>` and `<small>`. The four modes are now:
  same-element pair (grep-able), cross-element container/child (grep-able with
  effort), state/rest collapse (not grep-able), and **inherited fix blocked by a
  declared base rule, which LOOKS fixed in the source and is not**. Each was
  invisible to the detector built for the one before it. Fourteen real defects
  found, pinned by `state-contrast.test.ts` (26 assertions).
- **D114 — the lane partition nearly shipped both money fixes half-done.**
  Splitting wave 4 into an API lane and a frontend lane was right for throughput
  and wrong at exactly one seam: D97 and D98 each needed both halves, lane A
  correctly refused to cross into `frontend/**`, and lane B finished and stopped
  before the handoff note existed. For a period both fixes were **fully built and
  fully inert** — the API accepted the new shapes and nothing sent them, with
  green gates on both sides saying so. Caught by reading the tree rather than the
  bars; closed by the coordinator. The lesson is that a task spanning a partition
  boundary needs an owner for the SEAM, not just for each side.
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
- **D117 — the payout fee is not a function of the payout method, and production
  proves it.** Lane A measured all 61 `exchange.payouts` rows while moving the
  Estimated Payout figure server-side: ECHECK is 0 on 39 rows but **75 on one and
  125 on another**; WIRE is 20 on six rows and **0 on two**. Eleven rows disagree
  with the table the frontend has been using. So the fee constants are the
  DEFAULT FOR A NEW ORDER and must never be used to re-derive the fee of a
  stored payout — `orderQuote` already reads it off the row, correctly. Written
  into the constants file's header. **Open for Jacob: were the zero-fee WIREs
  waived deliberately? If so a fee is per-order data, not reference data**, and
  the constants file is modelling the wrong thing. `docs/waves/wave-4-lane-a.md`.
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
- **D101's headline estimate was wrong, and the measurement is smaller.** The
  batching fix was briefed as worth "~500 seconds per gate run"; measured, it is
  **95** — the API suite went 563 s → 468 s, 890/890 before and 916/916 after.
  The READ itself is genuinely 9.4x with byte-identical output, and that is the
  number that matters, because it is what an admin opening the orders list waits
  for and what the confirmation email and the PDFs sit behind. The estimate
  assumed the suite exercises the composed read the way a page does; it does not,
  and an N+1 over three rows costs three round trips rather than two hundred.
  **Corrected by the coordinator against its own earlier claim** — a tracker that
  carries an optimistic estimate is worse than one that carries a measurement.
- **D116 — `orders.items.price` CANNOT be dropped, and not for the reason
  ruling 34 feared.** Lane A priced all 98 priced production lines exactly as
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
- **D118 — `pnpm --filter @dorado/api diff` had not parsed for ten commits.** Bisected
  by lane A: `8cc176ee` deleted a retired feature entry and took the closing
  `};` and the entire comparison engine with it, and nine further commits edited
  a file that died on `SyntaxError` before opening a connection — four of those
  commits' messages claim gate runs. It is not in `pnpm check`, so nothing
  noticed. Repaired from `93ecdf80`. Worth saying out loud: `diff` now covers
  `payments` and nothing else, because every other feature has one
  implementation. **Third broken gate script this session, and two of the three
  were invisible precisely because they are NOT gate members.**
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
- **`carrier_services.code` and `provider_code` are NULL on all eight production
  rows.** Populating them is an UPDATE against production, which makes it Jacob's
  call rather than a migration — and it is what stands between the offered-service
  catalogue and being served from its own table instead of an adapter.
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

**Numbers on this page are checked, not relayed.** Where a lane states something
this index can verify cheaply, the tracker verifies it. That has caught two
things so far: the wave-4 handoff that both lanes believed was someone else's
(D114), and 5c's "`verify:parity` covers 12 table pairs" — evaluating the `PAIRS`
array showed **11**. That error was harmless, because the load-bearing half of
the claim (no cart, cart item or scrap table among them) was true and is what the
STOP banner rests on; it was corrected anyway, since a page right about the
conclusion and wrong about the count teaches a reader to trust neither. The array
now holds **15**, re-verified the same way after 5c added the four cart pairs.

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

**D-numbers come from `FOLLOWUPS.md`, and this page does not mint them.** The
findings section below carries D-numbers, but `FOLLOWUPS.md` is the authority for
what each one means — and the tracker collided with it once already, publishing a
"D116" for the feature-partition finding while D116 was being written in
`FOLLOWUPS.md` for the `orders.items.price` verdict. Renumbered to **D119**. It is
the same drift the one-writer-per-file rule prevents everywhere else, in the one
place that rule did not reach: two writers, one numbering space, no lock. The
procedure now is to take the next number after the highest in `FOLLOWUPS.md` at
that moment AND say so, or to describe the finding without a number and let the
coordinator assign one. Describing without a number is the safer of the two.

The tracker owns this file and the published artifact. Each agent owns exactly
one file under `docs/waves/` and updates only that one — never this index, never
another agent's. Two agents editing one shared file is how two rulings were lost
on 2026-08-28; the split is the fix, not bureaucracy. `FOLLOWUPS.md` is the
coordinator's alone and remains the authority for rulings and findings.

# Waves

Where the rewrite is. Bars first, descriptions below. Every sha in the table was
checked against `git log`; every status word was checked against the lane files
and the working tree, not against what this page said an hour ago.

**Wave 6 is running right now, in four lanes.** Waves 4 and 5 are committed and
closed — `a2599311` and `cae90da7`, with the docs correction `002c0f0f` on top
of them at HEAD. What follows the bars is the record of those closed waves; the
live section is directly below.

## Read this first

**WHAT SHIPPED.** Four commits since wave 3.5, all verified in `git log` this
pass: `a2599311` (wave 4 — batching, one pricing module, D97/D98),
`cae90da7` (wave 5 — direction stops being a feature, the browser stops knowing
FedEx), `002c0f0f` (the switch-count correction). **Nothing from wave 6 is
committed** — 215 uncommitted paths in the working tree at 01:57, across all four
lanes, plus the coordinator's in-flight `CLAUDE.md` edits. Until wave 6 is
committed as a series it is one `git checkout` from gone, which is the same note
this page carried through waves 4 and 5.

**WHAT IS RUNNING.** Wave 6, four lanes — A legacy removal and contracts
alignment, B 117 api `.test.js` files to TypeScript, C components hoisted to
`shared/ui` and adopted at call sites, D hardening the 45 scripts.

**All four have now reported real numbers** — D at 01:07, B at 01:08, C at 01:09,
A at 01:11. For the first fifteen minutes every bar but one read 0% while the
tree showed work in three lanes; this page called those zeros stale rather than
publishing them as progress, and **all four lanes then confirmed it** by jumping
on their next write. Highlights as of **01:24**: lane A's tasks 1 and 4
**done** with legacy removal at 90% and contracts at 85%; lane B **47 of 117**
tests converted, `features/orders/tests` entirely TypeScript and green in
isolation (184 tests), and **eight defects filed — the conversion is yielding
exactly as intended**; lane C **four of five tasks done**, two shared components
deleted, call sites down 405 → 377, and **a live hover bug fixed on the admin
drawer**; lane D **six scripts hardened, two shared libraries built, D4
complete**. Nothing has stopped and nothing is blocked. **This page is live** — the timestamps are real, and a
figure with a time on it was true at that time.

**WHAT IS BLOCKED ON JACOB.** Three things need a decision only he can make, and
they are at the top of the blocked list: **D117**, the payout fee that is not a
function of the payout method (and whose row count the tracker corrected tonight
from eleven to **four**); **the production order line whose two copies
disagree on the weight and purity a customer is paid on**; and **the T&C legal
copy** the offers purge edited — which the tracker read tonight and which deletes
four clauses outright, including both deemed-acceptance terms and the only stated
route a customer had to decline a price. Everything else in that section is
recorded, not pending.

**PRODUCTION IS NOT A BLOCKER.** Corrected in CLAUDE.md tonight (Jacob,
2026-08-29): production is not being touched and will not be until the refactor
is proven. This page previously led its blocked list with the deploy sequence,
which is exactly the misreading that correction names. Production facts are now
recorded below for an eventual day; none of them is waiting on him this week.

**WHAT WAS FOUND, so far tonight.**

**The parity test that was supposed to prove `PAYMENTS_SOURCE` can be promoted
was comparing nothing** — `undefined` to `undefined`, and `NaN` to `NaN`, which
passes because `node:assert/strict` uses `Object.is`. The tracker confirmed both
halves directly. Two green assertions, neither comparing anything, on the feature
holding fourteen sets of unencrypted bank details. It is a real test now, but its
evidence is hours old rather than months.

**The largest change of the night did not break the instruments — verified.**
Renaming 89 test files could have silently disabled any auditor matching only
`.test.js`, including `audit:test-leaks`, the script that exists because a test
once deleted real FedEx history. Every remaining `.test.js` literal in those
scripts is inside a comment; no matcher is extension-locked. A clean negative
result, and the one worth having.

**One thing to know before anyone picks up tomorrow's work list:** lane B's
handoff table of source fixes has seven rows and **three are already done or rest
on a wrong premise** — two were fixed by lane A hours after being written, and
one is the finding below. Four rows are live. The page says which is which, so
nobody redoes completed work at 7am.

**A separate finding flagged for you on the money path is WRONG, and this page
checked it rather than passing it on.** Lane B reported that promoting `PAYMENTS_SOURCE`
would stop recording `amount_received`, tying it to the $126.48 open thread.
**It would not.** That field maps to `payments.settlements.settled_amount`, the
mapping is declared in `feature-map.mjs`, `updatePaymentIntent` writes it, and
`repo.next.ts:96` reads it back. Lane B searched for `amount*` column names and
missed a rename onto a different table — the exact trap CLAUDE.md warns about.
**Do not act on L-B9 as written.** The `amount_capturable` half of it does stand.

**And a defect in the honesty machinery itself**, found while checking that:
`feature-map.mjs` declares `bank_account_type` **twice** in one object literal,
so JavaScript's last-wins silently discards the real mapping and tells
`audit:coverage` the column was deliberately dropped. That file exists to keep
the reports honest.

**Lane B has filed THIRTEEN defects, and is now 89 of 117 files in, and the
conversion is clearly the point rather than the file count.** The sharpest is a
test that was **green while asserting nothing** — *"setting a default clears the
others"*, on the address default-shipping path, passing because the address had
never been the default. TypeScript named it on the first compile. Eighth
vacuous-test instance on this project, first one caught by a compiler rather than
a person. Also from lane B: **a money-path gap where a missing payout `cost`
makes the whole invoice total `NaN`** rather than throwing.

**The other headline is a live visual defect on the admin purchase-order drawer:
hovering a menu row made its label disappear.** Six hand-rolled menus — five in a
single file — spelled `text-primary` on `hover:bg-primary`. **The tracker
verified the token itself rather than taking the claim**: `theme.css:331` is
`--primary: hsl(0, 0%, 98%);` — `#fafafa`. So `text-primary` and `bg-primary`
resolve to the same near-white value. White on white, confirmed at the source. Lane C found it by chasing
why `shared/ui/SelectMenu.tsx` had **zero importers**: the component built to
prevent exactly this had been hoisted in the D87/D88 series and adopted nowhere,
while the copies that stayed behind kept the bug. Verified by the tracker at both
ends — 0 real importers before, **2 after**, and the other three components
lifted alongside it were in use 6, 11 and 4 times, so this was one component
falling through, not a broken practice. And lane B found **two dead `.d.ts` files that disagree with their
implementations**, one of which declares an "assert" helper as returning `void`
when it really returns a count the caller must check — the vacuous-test shape
this project has now hit seven times.

**Partition discipline is now the strongest thing about this wave.** There have
been **four** documented crossings and **three** handoff tables, and the latest
crossing was written down by **both** lanes independently — the one that crossed
and the one crossed into. A boundary that is visible from both sides does not
need anyone to remember.

**And a pattern rather than a defect: THREE CROSS-LANE SEAMS, ALL THREE NOW
CLOSED.**
This is the night's real structural finding, and lane A has since demonstrated
the answer to it — **cross deliberately and write the crossing down**. It closed
seam 1 by editing lane D's file itself, disclosed as one of three crossings, and
pre-empted a fourth by handing lane C a six-row table of work it could see but
did not own.

1. **Resolved.** Flagged 01:08 — lane A was about to close a bypass that would
   turn lane D's brand-new guard red, and neither lane's file mentioned the
   other. **Both halves landed by 01:11**: the bypass is gone and the guard's
   now-stale exclusion was deleted with it. That bypass was also the one live
   code path that would have raised 42P01 on the pricing path against production.
2. **Closed.** Lane C found that `lint:typography-scatter` could not see
   typography inside `cn()` — three files passed it while carrying exactly what it
   exists to find — and the linter lives in `frontend/scripts/`, **lane D's**
   scope. Lane D rewrote both modes onto one matcher and **pinned the blind spot
   with test cases** so it cannot reopen.
3. **Orphaned, then closed within minutes.** Lane B found two dead `.d.ts` files
   whose declared signatures contradict their implementations, and **no lane's
   scope covered the directory they sit in**. Both are now deleted and the
   deletion verified clean. It closed because it was surfaced, not because the
   partition accounted for it.

Detail on all three in the wave 6 section.

The older theme has not changed and is worth one line: almost every defect this
project has produced lately was *a check that reported success while looking at
the wrong thing*. Full list under "What has been FOUND".

> ## THE SCRAP/BULLION COVENANT WAS TESTED AND IT FAILED. NOTHING WAS DELETED.
>
> **This is a RESULT, not a gap, and it is CLOSED — not a standing blocker.**
> Wave 5 shipped with its second task refused on evidence, which is the outcome
> the covenant rule exists to produce. The bar reads 0% because nothing was
> deleted, and nothing was deleted because the evidence said not to.
>
> **JACOB'S RULING SINCE, and it re-grades one half of this banner (2026-08-29,
> now in CLAUDE.md):** `checkout.*` is **device-sync data, not a ledger**. A cart
> exists so a customer sees the same basket on their phone as on their laptop —
> *"we'd store checkout fully locally otherwise"*. **Empty is fine and losing it
> is fine; it only has to work.** So `checkout.checkouts` and `checkout.items`
> holding zero rows **is not a finding**, and the covenant should never have been
> invoked on those two tables at all.
>
> **The refusal was still right, for the other half.** What 5c actually protected
> was `exchange.scrap` — 23 production rows across 12 customers, irreplaceable,
> with no second copy anywhere. That is precisely what the covenant is for. Read
> this banner as: right call, right table, one leg of the evidence since ruled a
> non-finding. Nothing here is waiting on Jacob.
>
> Lane 5c measured the claim that scrap and bullion lines "are `checkout.items`
> now". **They are not.** `checkout.checkouts` and `checkout.items` hold zero rows
> in dev AND in production. Nothing has ever moved: there is no backfill for
> checkout (068/069 are additive DDL only) and `CHECKOUT_SOURCE` still defaults
> to `exchange`, so the reads have not pivoted either. (Under the ruling above
> that emptiness is expected, not alarming — what it disproves is only the
> *claim that the rows had migrated*, which is what the deletion rested on.)
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
> later — though the device-sync ruling lowers what it costs:** the comparison joins on `id`, and a checkout row does not keep its
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
> **Task 2 did not merely go unstarted — it must not start.** Deleting those
> layers would have destroyed the only copy of 23 customers' declared metal. 5c
> also left a file it had *proven* dead (`scrap/service.ts`, zero importers)
> untouched, because the covenant had not cleared: the gate applies to everything
> or it is a formality.

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
> **It was committed, not finished** — A5 untouched at 0%, A6 partial at 30%,
> both deliberate stops. **Wave 5 finished A5**: `purchase-orders/` and
> `sales-orders/` no longer exist. A6 carries on as 5a's task 2, still partial.

```
OVERALL   █████████████████████████████████░░░   ~93%   (closed waves only)
```

**That ~93% covers the CLOSED waves and still excludes wave 6**, which is in
flight and moving every few minutes — folding a live wave into the headline would
make it drift under a reader rather than mean anything.

**Wave 6 now carries its own number because it finally earned one.** It was shown
with no percentage while its bars were the zeros the lanes wrote at dispatch; all
four have since reported measured figures, so **~83%** is the unweighted mean of
the **twenty-two** lane-reported task bars (A 95.0, B 82.2, **C 100.0**, D 60.8)
— **lane C has finished all five of its tasks.** It
is an average of self-reports, not an independent measurement — the lanes own
those bars and this page regenerates them rather than grading them.

**The denominator grows, so read the percentage carefully.** Lanes A and D have
each *added* a task since dispatch — A's task 5 to take lane B's NaN handover,
D's D6 to write every scanner's blind spot into its header. Both landed at 100%,
so the number rose; but a wave that discovers work can just as easily see it
fall while genuinely progressing.

| | wave | | |
|---|---|---|---|
| ✅ | **D77–D86** conversions, wire axis retired | `██████████████████` | 100% · landed |
| ✅ | **D87/D88** unified orders surface | `██████████████████` | 100% · `0a201bc0` |
| ✅ | **wave 2** orders read pivot | `██████████████████` | 100% · `a12b76ed` |
| ✅ | **styling** dark-only, components own appearance | `██████████████████` | 100% · `9de7d283` |
| ✅ | **wave 3** the order wire slims | `██████████████████` | 100% · `2208932e` |
| 🟡 | **wave 3.5** factor, delete legacy, co-locate | `██████████░░░░░░░░` | COMMITTED `a9b7dd61` · 58% of its scope |
| 🟡 | **wave 4** batching, pricing, styling lane B | `███████████████░░░` | ~83% · COMMITTED `a2599311` · A5/A6 finished in wave 5 |
| 🟡 | **wave 5** orders, carriers, scrap covenant | `█████████████░░░░░` | ~70% · COMMITTED `cae90da7` · DELETION REFUSED ON EVIDENCE |
| 🔵 | **wave 6** legacy, tests→TS, shared UI, script hardening | `█████████████░░░░░` | **IN FLIGHT** · ~74% · A 94 · B 74 · C 80 · D 53 |

All the shas above exist in the log, in that order. **HEAD is `002c0f0f`**, not
`a9b7dd61` — this paragraph said "`a9b7dd61` at HEAD, nothing since committed"
until 00:57 tonight, which had been false since wave 4 landed and contradicted
the table three lines above it. Both waves are committed; nothing of theirs is
sitting uncommitted in the tree.

## Wave 6 — RUNNING NOW. Lane C is COMPLETE; A, B and D still going.

Lane files appeared between **00:57 and 01:01**, and all four had posted real
numbers by **01:11**. Bars below are each lane's own, regenerated by
`node scripts/waves.mjs`.

```
LANE A  legacy, contracts, insured value     <- UPDATED 01:30, task 5 added and DONE
1. Max insured value becomes data           ██████████████████  100%
2. Verify, then remove legacy code          ████████████████░░   90%
3. Frontend and API share contracts         ███████████████░░░   85%
4. Close D142's bypass                      ██████████████████  100%
5. The invoice NaN (handed over)            ██████████████████  100%

LANE B  117 api tests become TypeScript      <- UPDATED 01:55, 89/117, B4 done
B1. supertest.d.ts completes the surface    ██████████████████  100%
B2. Order mutation surface (PATCH) tests    ██████████████████  100%
B3. features/orders/tests, all of it        ██████████████████  100%
B4. The rest of features/**/tests           ██████████████████  100%
B5. Loose tests: relocate AND convert       █████████████████░   93%
B6. shared/ providers/ scripts/ db          ░░░░░░░░░░░░░░░░░░    0%

LANE C  hoist to shared/ui, ADOPT at call sites  <- COMPLETE 01:35, all five tasks done
C1. Field - the labelled-control pattern    ██████████████████  100%
C2. One segmented control, two die          ██████████████████  100%
C3. SelectMenu adopted (it had 0 importers)  ██████████████████  100%
C4. Legacy Button variant names retired     ██████████████████  100%
C5. DetailRow, EmptyState, OrderDrawerHeader  ██████████████████  100%

LANE D  the tooling nobody typechecks        <- UPDATED 01:30, D6 added and DONE
D1. Floors on counting scripts              ████████████████░░   90%
D2. Self-tests, proved by attack            ████████████████░░   90%
D3. The environmental rule                  ██████████████████  100%
D4. audit:switches sees a bypass            ██████████████████  100%
D5. The meta-guard                          ██████████████████  100%
D6. Blind spots written down                ██████████████████  100%
```

**Lane B's conversion counts re-verified at 01:48 and they are exact.** It
reports 89 / 117 with `.test.js` going 117 → 28 and `.test.ts` going 21 → 110.
Measured: api holds **28** `.test.js` and **110** `.test.ts` right now — both
match. And the useful integrity check, which lane B did not claim and the tracker
adds: **28 + 110 = 138, and the baseline was 117 + 21 = 138.** The total is
conserved, so files are being *converted* rather than lost or duplicated along
the way — which is the thing a bulk `git mv` gets wrong quietly.

**Lane B's baseline was checked and is CORRECT — the tracker's first count was
the wrong comparison.** Lane B states 117 `.test.js` and 21 `.test.ts`. A
whole-repo count gave 108 and 41, which looked like a flat contradiction and was
not: **lane B's figures are api-scoped**, and the repo also has frontend tests
(11 `.test.ts`, 12 `.test.tsx`) that are outside its stated scope. Reconciled at
the moment of checking — api held 108 `.test.js` + 30 `.test.ts` with nine
conversions staged, and 108 + 9 = **117**, 21 + 9 = **30**, both exact. Recorded
because the discrepancy looked real for a minute and the resolution is the useful
part: **check what a number is scoped to before calling it wrong.**

**Lane D's baseline was checked and is CORRECT.** 45 scripts in `api/scripts`
(all `.mjs`, zero `.js`), 4 in `frontend/scripts`, 2 libs under `scripts/lib`
(`baseline.mjs` and `feature-map.mjs` — the other three files there are their two
tests plus lane D's own new `self-test.mjs`). 45 + 4 + 2 = the 51 it says parse
clean, and they do.

| lane | scope | last wrote | tree says, 01:06 |
|---|---|---|---|
| **A** | legacy removal, contracts alignment, max-insured-value becomes data | **01:30** | tasks 1, 4 **and new task 5** done; **took lane B's NaN handover and fixed it** |
| **B** | 117 api `.test.js` → TypeScript | **01:47** | **89 / 117** — verified 28 `.js` / 110 `.ts`; **THIRTEEN defects filed** |
| **C** | hoist to `shared/ui`, adopt at call sites | **01:35** | **ALL FIVE TASKS DONE**; 2 components deleted, a live hover bug fixed |
| **D** | harden the 45 scripts | **01:30** | D4 + **new D6** done; **a fifth and sixth rotted script found** |

**All four lanes are working hard and the tree is well ahead of the bars again.**
**205 changed paths at 01:29**, against 17 when the first lane file was written
and 63 at 01:06. Lane B's last report said 47/117 with `features/orders/tests`
done; the tree now shows converted tests appearing under **users, payments,
shipping/operations, products, media/pdfs and media/emails** as well — so 47 is a
floor, not a current figure. Lane D has 14 changed paths in `api/scripts`, lane C
seven in `shared/ui/table` plus six in `products/ui`. **As before, the bars are
left at each lane's own number and this note is the override.**

**What each lane is really being measured on**, so the first real report can be
read against it rather than taken at face value:

- **A** — **the only lane touching the database.**

  > **A tracker note corrected within two minutes of being written.** At 01:24
  > this page observed that lane A had legacy *deletions* at 90% and a 16-line
  > file reading "Work in progress" — the lane doing the most consequential work
  > with the least written record. **At 01:26 it wrote 341 lines**, with the
  > evidence for every deletion, a dead-module sweep, a six-row handoff table for
  > lane C, and three disclosed partition crossings. The observation was fair when
  > made and is no longer true; it is kept because "thin record on a deletion
  > lane" is the right thing to watch for, not because it stuck. Its migration is therefore the thing on this page most
  worth checking, so the tracker read all of it rather than the header:

  > `api/migrations/097_a_service_says_what_it_will_insure.sql` is
  > **`ALTER TABLE shipping.services ADD COLUMN IF NOT EXISTS max_insured_value
  > numeric NOT NULL DEFAULT 10000`**, plus a `COMMENT ON COLUMN`. That is the
  > whole of it. **Additive, idempotent, on the new schema only.** Grepped for
  > `DROP`, `DELETE`, `TRUNCATE` and any write to `exchange`: **none.** The
  > `NOT NULL DEFAULT` seeds all eight existing rows inside the `ALTER` itself, so
  > there is no separate backfill and no window where the column is null. It
  > satisfies the covenant, and it runs against **dev** — no migration has ever
  > run against production and this one will not either.

  It also resolves a D82-class defect: `Math.min(quote.declared_value, 50000)` was
  hard-coded in `checkoutStepper.tsx`, which is both the browser computing money
  and a limit that is not ours spelled as a literal. The migration header is
  careful about **why this is not `max_declared_value`**, which already exists —
  that column is the *carrier's* stated ceiling and is dual-written to both
  schemas, so reusing it would either put 10,000 into a column meaning "what FedEx
  allows" (it is 50,000) or force an UPDATE against `exchange`, which migrations
  do not do. Two columns, two facts. The 10,000 is a Jacob ruling quoted in the
  header, deliberately well under FedEx's own 50,000.
- **B** — **the conversion is the point, not the file count.** A files-converted
  percentage understates this lane; the defects are the yield, and two are filed
  below. **Converted: 23 / 117** as of 01:08, on a confirmed baseline of 934
  tests passing and `typecheck` clean.

  > **CORRECTION, and the tracker was the one relaying a stale claim.** This page
  > said B1 fixed `supertest.d.ts` tonight and that the type checker "had never
  > seen" a call to the order mutation surface until lane B got there. **Lane B
  > checked and it was already done.** The tracker then verified independently:
  > `git log -S "patch(url: string)"` on `api/types/supertest.d.ts` returns
  > **`cae90da7`** — wave 5, committed, D136. B1 was a no-op and lane B has
  > marked it 100% on that basis, which is the correct call.
  >
  > **What survives is the part that matters**: the whole PATCH surface —
  > `PATCH /purchase_orders/:id` and `PATCH /sales_orders/:id`, the pair D87 built
  > to replace the ~25-route RPC zoo — **is being typechecked for the first time**
  > as those tests convert. That was true; the date and the author were not.
- **C** — **Jacob's stated priority, and it IS being measured at the call sites.**
  Lane C leads its report with a call-site table rather than a component count,
  which is the right instinct and the thing this page was watching for:

  | | before | after |
  |---|---:|---:|
  | shared/ui call sites carrying a `className` | 405 | **377** |
  | lines in the four admin drawers | 2,015 | **1,760** |
  | shared components implementing "one of N" | 3 | **1** |
  | appearance-as-props on shared components | 16 | **0** |

  **Two shared components were DELETED, not added** — `DisplayToggle` (94 lines)
  and `DotSelect` (99) turned out to be the same control with a different cell
  count, replaced by one `SegmentedField` that has no appearance of its own.
  **The tracker verified the deletions are clean**: both files are gone,
  `SegmentedField.tsx` exists, and every remaining mention of either name in the
  repo is **a comment** — the headers of `Field.tsx` and `SegmentedField.tsx`
  explaining what they replaced, plus one test comment. **Zero live importers left
  behind.** That is the shape a deletion should have.
  `Label` is now imported by **no feature file at all**; every label goes through
  `Field`, `ValidatedField` or `FloatingLabel`. The hand-rolled
  label-above-a-control pattern it replaced appeared **36 times**, and three
  private copies spelled the label `<small>` where the drawers spelled it
  `<Label>` — so a single drawer column was showing two different label sizes.
- **D** — four gate scripts rotted across two waves (D110, D115, D118, D120 —
  all four checked against `FOLLOWUPS.md` this pass and all four are real and say
  what the lane says they say), every one of them tooling that nothing
  typechecks, nothing imports and no test covers. The bar is **a guard proven by planting a violation**, not a guard that
  runs clean once. Lane D's own framing is the right one: the things that kept
  working are assertions, the things that rotted are reports.

> ### CROSS-LANE SEAM — FLAGGED AT 01:08, AND IT RESOLVED CLEANLY BY 01:11
>
> **Recorded in full because the resolution is the useful part, not the alarm.**
>
> **What was flagged.** Lane D finished D4: `audit:switches` now detects a
> *bypass* — a direct import of a switched implementation that goes around the
> switch — and pins the one known case **in both directions**, so an unlisted
> bypass fails the gate *and* a listed one that stops reporting **also** fails.
> The one known case was `features/quotes/service.ts:27`. Closing it was **lane
> A's task 4**. So the moment lane A landed, `audit:switches` would go red unless
> the `KNOWN_BYPASSES` entry were deleted in the same breath — an entry living in
> `api/scripts/`, **lane D's** exclusive scope, triggered by **lane A's** work.
> Lane D had written the consequence down; lane A's file had not mentioned it.
> Neither lane owned the seam.
>
> **What actually happened — verified in the tree at 01:11, both halves:**
>
> - `features/quotes/service.ts` **no longer imports
>   `#features/checkout/repo.next.ts` at all.** A repo-wide grep for a direct
>   `repo.next` import across every feature service returns **nothing**. What
>   remains at lines 417-419 is a *comment* explaining the bypass that used to be
>   there.
> - `api/scripts/audit-switches.mjs:350` now reads **`const REAL_KNOWN_BYPASSES =
>   {};`** — the entry was deleted, exactly as the pin's failure message demanded.
>
> **AND NOW WE KNOW WHO CLOSED IT.** Lane A's 01:26 record discloses the crossing
> explicitly, which is the D119 behaviour asked for at dispatch: it edited
> `api/scripts/audit-switches.mjs` — **lane D's file** — to delete the stale
> `KNOWN_BYPASSES` entry, corrected the header's tense, touched no logic, and
> re-ran `--self-test` 8/8. It is listed as crossing #3 of three, each with its
> reason. So the seam was closed by the lane that *caused* it, crossing
> deliberately and writing the crossing down, rather than by either lane waiting
> for the other. **That is the answer to "who owns the seam": whoever trips it,
> provided they disclose it.**
>
> Lane A also chose the stronger fix: it closed the bypass **by removal, not by
> routing** — `findProductIdByName` is now un-exported from both
> `features/checkout/repo.next.ts` and `repo.exchange.js`, so the handle D142's
> bypass grabbed no longer exists to grab.
>
> **Both sides landed, in the right order, with no red gate in between.** The pin
> worked as designed: it made the stale exclusion impossible to leave behind. This
> is the D114 shape catching itself instead of biting, which is what D119's
> seam-owner rule was written to produce.
>
> **Re-verified at 01:22, and it is now self-documenting.**
> `audit-switches.mjs:345-350` carries a comment explaining the deletion in its
> own terms — *"the quote surface now resolves a product name through
> `features/products/service.ts`, the feature that owns `products.bullion`, so
> there is no second implementation to reach around. Deleted the same pass the fix
> landed, on this file's own instruction."* `features/quotes/service.ts` has **no
> checkout import at all**; its single remaining `repo.next` mention is line 418,
> a comment.
>
> **One lag worth naming, because this page exists to catch exactly this.** Lane
> D rewrote its own file at 01:22 and its D4 section **still reads as though the
> consequence is pending** — *"when lane A fixes `features/quotes/service.ts`,
> `audit:switches` will go red"*. Lane A fixed it eleven minutes earlier and lane
> D's own script already records the deletion. The lane file lags its own code.
> Harmless here, and stated so nobody reads that paragraph tomorrow as an
> outstanding warning.
>
> **A consequence worth carrying downstream:** this bypass was also the live
> `SELECT id FROM products.bullion` on the pricing path — the one path that would
> have raised **42P01 on first request** against a production that has no
> `products` schema. **It is now closed in the working tree.** See the recorded
> production list below, where that entry has been updated rather than deleted.

> ### A HANDOFF DONE RIGHT — LANE A → LANE C, WRITTEN DOWN BEFORE IT WAS NEEDED
>
> Worth recording beside the seams, because it is the same situation handled
> well. Lane A's task 3 (contracts alignment) hit six frontend files it does not
> own — `frontend/features/*/types.ts` for **leads, reviews, rates, carriers,
> users and payouts** — each still hand-writing a table-derived shape. Rather than
> cross, or silently skip, lane A wrote **a six-row table naming each file, the
> shape it hand-writes, and the contract that already exists for it**, under a
> heading addressed to lane C.
>
> **The contract exists for all six**, so this is re-pointing rather than
> authoring. One of them connects back to lane A's own task 1:
> `features/carriers/types.ts` hand-writes `CarrierService`, which is **why adding
> `max_insured_value` to the admin projection would have been invisible to `tsc`
> from the consuming side** — the exact blindness the contracts rule exists to
> remove.
>
> This is what the three seams above were missing: not a rule, just somebody
> writing the crossing down while they could still see it.

> ### SECOND CROSS-LANE ITEM — CLOSED. Lane C found it, lane D fixed and PINNED it.
>
> **`lint:typography-scatter` cannot see typography inside `cn()`, and the
> tracker confirmed it is narrower than lane C even claimed.** Lane C hit this
> honestly: `DisplayToggle` and `DotSelect` both carried `text-sm font-medium`
> inside a `cn()` call, and **both reported clean at zero scatter.**
>
> Verified in `frontend/scripts/lint-call-site-styling.mjs`, and the sharp part is
> that **the same file gets it right in one mode and wrong in the other**:
>
> - line 129, the call-site-styling scan, matches
>   `className="…"`, `` className={`…`} `` **and** `className={cn(…)}`.
> - line 191, the `--scatter` scan, matches only `className="…"` and
>   `` className={`…`} ``. **No `cn()` branch.**
>
> So a type size written inside `cn()` is invisible to the scatter count while
> being visible to its sibling twenty lines up. Lane C's baseline records
> "scatter 0" — that zero is measured with this blind spot in place.
>
> **A SECOND instance landed at 01:15, which settles that this is a class and not
> one file.** `EmptyState` carried `text-lg md:text-xl font-medium
> text-neutral-900` and `text-xs text-neutral-600 leading-relaxed` — **seven type
> utilities** — inside `cn()` calls, and **reported ZERO**. Three files now known
> to have passed this linter while carrying exactly what it exists to find.
>
> **A related one from the same lane, different linter:** the mobile status pills
> in `OrderStatusShared` declared a retired `ghost` variant and then painted
> themselves with **eight appearance classes** including their own fill, border,
> radius and both hover colours — ruling 20's "contradicted" shape — and were
> **invisible to `lint:call-site-styling`** too.
>
> **`frontend/scripts/**` is lane D's scope**, and lane D's whole mandate is
> turning reports into assertions. When this was flagged, neither lane's file
> mentioned the other.
>
> **RESOLVED, and better than asked.** The tracker verified the fix in the
> script: `--scatter` no longer runs its own narrow regex — both modes now go
> through one `classNameExpressions()` helper that finds `className=` and pulls
> **every string literal** out of it, which covers `cn()`, `clsx()` and nesting
> alike. The file's own comment records the cause — *"the machinery was in this
> very file"*, i.e. the working matcher already existed twenty lines up.
> **It is pinned so it cannot reopen**, with cases including
> `cn("flex", active && "text-2xl font-bold")` and `cn(clsx("gap-2", "text-sm"))`.
> `lint:typography-scatter` now reports **28** and exits non-zero by design.
>
> **All three of tonight's seams are now closed.** Each closed within minutes of
> being written down, and none by the partition anticipating it.

> ### THIRD SEAM — A FOUND DEFECT NO LANE OWNED (flagged 01:21, CLOSED 01:24)
>
> **Lane B found it, correctly declined to fix it, and there is no lane it
> belongs to.** The tracker checked all four scope statements against the file
> path, which is the check that turns "someone else's" into "nobody's":
>
> The files are **`api/shared/testing/pinned-pool.d.ts`** and
> **`api/shared/testing/session.d.ts`** (finding L-B0 below).
>
> - **Lane A** owns `api/features/**`, `api/legacy/**`, `packages/contracts/**`
>   and two named frontend files. **Not `api/shared`.**
> - **Lane B** owns test files plus **`api/types/*.d.ts`** — and `api/types/`
>   contains exactly one file, `supertest.d.ts`. These two are in
>   `api/shared/testing/`, a different directory, and they are not test files.
>   Lane B said so and stopped, which is right.
> - **Lane C** is frontend only. **Lane D** is `api/scripts/**` and
>   `frontend/scripts/**`.
> - **No lane's scope statement mentions `api/shared` at all.**
>
> **RESOLVED at 01:24, about two minutes after this page flagged it.** Both files
> are now deleted in the working tree — `git status` shows
> ` D api/shared/testing/pinned-pool.d.ts` and ` D api/shared/testing/session.d.ts`
> — and the tracker verified the deletion is clean: the `.ts` implementations
> (`pinned-pool.ts`, `session.ts`) are both still present, nothing references
> either `.d.ts`, and `pinned-pool.ts:3` now carries a comment recording that the
> file beside it is gone. Exactly the fix lane B recommended.
>
> **The finding stands as a record even though it closed fast.** It was genuinely
> unowned when written: no lane's scope statement covers `api/shared`, lane B
> correctly declined it as source rather than test, and it was picked up because
> it was surfaced — not because the partition accounted for it. The lesson is
> D119's and it is unchanged: *a task that spans a partition boundary needs an
> owner for the seam.* Two of tonight's three seams have now closed; the linter
> blind spot is the one still open.

> ### THE API TYPECHECK IS RED RIGHT NOW, AND IT IS NOT BREAKAGE
>
> **Read this before reading a gate result tonight or tomorrow morning.** Lane A
> left a note addressed to the tracker saying `pnpm --filter @dorado/api
> typecheck` reports "~338 errors, every one in a `tests/` directory". **The
> tracker ran it rather than relaying it.** The load-bearing half is confirmed;
> the number is not, and both facts matter.
>
> Measured at 01:27, exit status 2:
>
> - **92 `error TS` lines**, not ~338.
> - **Errors outside `tests/`: ZERO.** Confirmed two ways — filtering the error
>   lines, and listing the distinct erroring files.
> - They are in **exactly three files**: `features/places/addresses/tests/replay.test.ts`,
>   `features/places/addresses/tests/service.test.ts`, and
>   `features/users/tests/replay.test.ts`.
>
> **So lane A's claim is right about the thing that matters — no source file has a
> type error — and its count was true at a different moment.** This is a *moving*
> number, not a wrong one: lane B is converting 114 previously-excluded test files
> into `tsc`'s view for the first time (ruling 33) and fixing them as it goes, so
> the figure falls as B4 advances. It was 338; it is 92 in three files.
>
> **Do not treat a red API typecheck as a regression while lane B is mid-flight,
> and do not quote 338 as current.** The check to run is not "is it green" but
> "is any erroring file outside `tests/`" — and right now none is.
### Found by wave 6 so far

- **Lane C — an accessibility defect and a latent `htmlFor` bug, both in the
  segmented controls it deleted.** `DisplayToggle` put `role="radio"` on a plain
  `<button>` **with no keyboard handling at all**; `DotSelect` hand-rolled an
  arrow-key handler. Radix already does this correctly inside `RadioGroup`, which
  is what replaced both. Separately, a bug caught *on the way in* rather than
  shipped: `RadioOption` defaults its `id` to the option's **value**, so keying
  the new `SegmentedField` by index would have emitted `id="0"`/`id="1"` for every
  segmented field on the page — **three sit side by side in the leads drawer and
  three in the product drawer** — and every `<label htmlFor>` would have resolved
  to the first field. Keys are `useId()`-prefixed instead.
- **Lane D — three direct imports of a switched implementation, and only ONE is
  a bypass.** The new `audit:switches` bypass scan found three; two
  (`features/checkout/service.ts:12`, `features/payments/service.ts:15`) are
  `import type` and **compile away, reaching no schema**. Only
  `features/quotes/service.ts:27` — an `import * as checkoutRepo` that calls
  `findProductIdByName` — is real. Lane D's reasoning for not reporting all three
  is worth keeping: *"Reporting all three would be three findings where there is
  one, which is how a guard gets ignored."* The guard was then attacked on the
  real corpus both ways — a planted `import * as` was caught and named, the same
  file rewritten as `import type` was correctly not reported.
- **`features/scrap/service.ts` is finally deleted — the file wave 5c PROVED dead
  and refused to remove.** This closes a loop the page has carried since wave 5.
  5c had shown it had zero importers and left it anyway, on the reasoning that
  the covenant *"applies to everything or it is a formality"* — the deletion gate
  had not cleared for the scrap/bullion layers, so nothing went, including the
  file already known to be safe. **That was the right call at the time.** Lane A's
  task 2 has now removed it, and the tracker confirmed the precondition still
  holds: a repo-wide grep for `scrap/service` across `api` returns **zero**
  importers. Nothing about the 23 irreplaceable `exchange.scrap` production rows
  is touched by this — the deleted file is an unused API layer, not data.
> ### IF YOU WORK LANE B's HANDOFF TABLE, SKIP THREE OF ITS SEVEN ROWS
>
> **Not a criticism of lane B — a consequence of four lanes working at once, and
> exactly what a tracker is for.** Lane B appends to its record as it finds
> things; other lanes fix things concurrently; nobody re-reads anyone else's file.
> By 01:50 its "for the lanes that own source" table had grown to seven rows, and
> **three are already resolved or rest on a premise this page has overridden.**
> Checked in the tree just now:
>
> - **`shared/testing/pinned-pool.d.ts`, `session.d.ts` — "delete".** *Already
>   deleted.* `ls api/shared/testing/*.d.ts` returns nothing. Done at ~01:24.
> - **`compose.ts` / `pricing/bid.ts` — "give `payout` its `cost`, or make
>   `calculateTotalPrice` refuse a payout it cannot read".** *Already done, and
>   more thoroughly than the row asks.* `bid.ts` now has `fee()` at line 184 and
>   `finite()` at 198, and **both** public totals end in `finite(...)` (lines 238
>   and 270). This is lane A's task 5 — the handover this page flagged.
> - **`payments/repo.next.ts` + a migration — "`amount_capturable` /
>   `amount_received`, see L-B9".** *Half wrong.* `amount_received` already has a
>   home (`payments.settlements.settled_amount`), is written, and is read back —
>   see the override below. Only the `amount_capturable` half is real.
>
> **The four rows that ARE live and worth doing**: `orders/intake.ts` (`block`
> should accept `null | undefined`), `sales-tax/service.ts` (`state` should accept
> `undefined` — the value the pinned defect actually passed),
> `orders/service.ts` (`updateScrapItem`'s `item` requires `metal` and `content`
> and reads neither), and `orders/read.service.ts` (return the composed type
> rather than `Record<string, unknown>[]` — **five test files had to re-declare
> the order shape because the service discards it**, which is the one with real
> leverage).

- **A FOURTH CROSSING, AND THE FIRST DISCLOSED FROM BOTH SIDES.** Lane A fixed
  the invoice `NaN` in `pricing/bid.ts` and pinned it in
  `features/pricing/tests/bid.test.ts` — **a test file, which is lane B's
  partition.** What is new is that *both* lanes wrote it down independently: lane
  A's crossings list grew from three to **four** and names the file with its
  reason; lane B noticed the suite count move, traced it, and flagged it *"only so
  the coordinator knows the boundary was crossed and the result is good."*
  Neither was told the other had. **Disclosure is bidirectional now**, which is
  materially stronger than one lane confessing — a crossing is visible even if the
  crosser forgets.

  Both agree the crossing was correct: **a fix and its pin belong in one commit.**
  The tracker's view is the same — splitting them would have put a money-path fix
  in one commit and its only proof in another.

  > **A 9-versus-8 that is not a disagreement**, reconciled because it looked like
  > one. Lane A says it wrote **nine** tests; lane B measured the suite moving
  > **934 → 942, +8**. Counted directly: `bid.test.ts` holds **24** tests, and
  > exactly **eight** of them are the new payout/shipping arms lane B lists. The
  > ninth was a *rewrite*, not an addition — the old test pinning `payout: null` →
  > TypeError became "a null payout cost is no payout fee", since lane A changed
  > that arm deliberately. **Nine authored, eight net new.** Same shape as lane B's
  > 117-versus-108 baseline earlier: two correct numbers, different denominators.

  Verified in the source: `bid.ts:129` now declares
  `payout?: { cost?: number | null } | null`, and the comment at line 115 records
  what the old signature was — *"`payout: { cost: number }` until 2026-08-29, and
  that was **a LIE THE TYPE told**"*. That is L-B2 in three words, written by the
  lane that fixed it rather than the lane that found it.

- **THE CONVERSION DID NOT BLIND ANY TEST-SCANNING SCRIPT — checked, and this
  was the real risk of the night's biggest change.** Renaming 89 files from
  `.test.js` to `.test.ts` would silently disable any auditor matching only the
  old extension, and the one that matters most is `audit:test-leaks` — the script
  that exists because a test deleted the real FedEx history of five dev
  shipments. Lane B audited this itself; the tracker re-checked every script that
  touches test files.

  Three scripts still contain the literal `.test.js` — `audit-test-leaks`,
  `audit-switches` and `audit-vacuous-tests` — and **every occurrence is inside a
  comment**: `audit-test-leaks.mjs:3` is the "WHY THIS EXISTS" prose naming
  `tracking.test.js`; `audit-switches.mjs:20` and `:262` are commentary;
  `audit-vacuous-tests.mjs:3` and `:109` likewise. **No load-bearing matcher is
  extension-locked.** `audit:vacuous-tests` and `lint:row-vs-list` use
  `/\.test\.(js|ts)$/`, `audit:switches` and `audit:table-owners` filter on
  `.includes(".test.")`, and `audit:slow-tests` / `audit:test-leaks` delegate
  discovery to `node --test`. **A clean negative result, and worth as much as a
  finding.**

  > **One correction inside it.** Lane B compares its post-conversion
  > `audit:vacuous-tests` run (**24 LOOP / 8 SKIP**) against *"CLAUDE.md's
  > '13 LOOP / 9 SKIP'"*. **CLAUDE.md does not mention `audit:vacuous-tests`,
  > LOOP or SKIP anywhere**, and the real baseline — `FOLLOWUPS.md`, which is the
  > authority — is **21 LOOP, 10 SKIP across 764 tests in 114 files.** So the
  > actual movement is LOOP **21 → 24** and SKIP **10 → 8**, not the larger jump
  > "13 → 24" implies, and SKIP went *down*.
  >
  > **Lane B's reasoning is nonetheless sound and the tracker verified its
  > load-bearing half**: `git status` and `git diff HEAD` both report
  > `audit-vacuous-tests.mjs` **unmodified on this branch**, so the detector has
  > not changed and the delta really is the suite rather than the tool. Right
  > conclusion, wrong baseline — which is the third time tonight a figure has been
  > carried rather than re-derived.

- **WHY THE GATE SCRIPTS ROT, IN ONE LINE OF CONFIG — and the tracker verified
  it.** Six scripts have now been found rotted (D110, D115, D118, D120, plus the
  fifth and sixth tonight). Lane B, explaining why it is leaving
  `scripts/lib/*.test.js` as JavaScript, names the cause in passing:
  **`api/tsconfig.json` excludes `scripts` outright.** Checked —
  `"exclude": ["node_modules", "migrations", "**/*.test.js", "scripts"]`.

  So the 45 scripts lane D is hardening get **zero type coverage**, by
  configuration, which is exactly the condition lane D named at dispatch: *"the
  tooling nobody typechecks."* Nothing imports them, no test covers them, and
  `tsc` is told not to look. **That is the whole mechanism behind six rotted gate
  scripts** — not carelessness, one word in a config. Worth knowing before anyone
  proposes "just convert the scripts too": converting them buys nothing while
  that exclusion stands.
- **A RELOCATION THAT WOULD HAVE FAILED LOUDLY — D135's lesson, demonstrated
  rather than argued (lane B, L-B11).** Moving tests under `tests/` broke two
  files that compute paths from their own location:
  `features/authorization/tests/role-ladder.ts` resolved `../..` to `features/`
  instead of `api/`, and `shipping/operations/tests/resolver.ts` reads
  `handler.ts` *beside* the test, which the test no longer is.

  **The part worth keeping is how they would have failed.** Both carry floors — a
  `routeFiles.length >= 20` and an explicit throw naming the missing handler — so
  both would have failed **loudly and by name**. Lane B's own note: *"a report
  would have printed a smaller number and exited 0."* Same pair of behaviours,
  same night, one visible and one silent. Fixed; 14 tests, 14 pass.
- **A test that quietly stopped exercising what it names (lane B, L-B12).**
  `sales-tax/tests/server-spots.ts` built its request body with
  `metal_type: serverSpots[0].type` — but the spots wire renamed that field to
  `name` in D70, so `SpotWire` has no `.type` and the body sent
  `metal_type: undefined` to the tax endpoint. Lane B is careful about the
  severity, and correctly so: the surviving assertion is only
  `Number.isFinite(tax)`, which holds either way, **so this is not a false green
  — it is a test not testing its own subject.** Corrected to `.name`; 3 tests, 3
  pass.
- **Lane B wrote a handoff table instead of crossing, again.** Three one-line
  changes in files it does not own, each found only because the type checker
  looked: `features/orders/intake.ts` (`block` should be
  `Block | null | undefined` — the guard on its own first line handles a value the
  type forbids), `features/sales-tax/service.ts` (`state` should accept
  `undefined`, which **the very defect this project pinned** passed), and
  `features/orders/service.ts` (`updateScrapItem`'s `item` requires `metal` and
  `content` and reads neither). This is the third handoff table of the night and
  the practice is now the norm rather than the exception.
- **THE `PAYMENTS_SOURCE` PARITY TEST COMPARED `undefined` TO `undefined`, AND
  `NaN` TO `NaN` (lane B, L-B10). CONFIRMED by the tracker — this one is right.**
  The test whose entire job is to be the evidence that `PAYMENTS_SOURCE` can move
  was asserting nothing at all.

  ```js
  assert.equal(b.payment_intent_id, a.payment_intent_id, "they resumed different intents");
  assert.equal(Number(b.amount),    Number(a.amount),    "they disagree about the amount");
  ```

  **Verified two ways rather than relayed**, because the previous finding from
  this lane did not survive checking:

  1. **The fields do not exist on either side.** `repo.exchange.js:45` projects
     `(amount::numeric / 100) AS amount_expected` — not `amount` — and line 52
     puts the intent id inside `jsonb_build_object('provider_ref',
     payment_intent_id)`, so it surfaces as `attempt.provider_ref`, not
     top-level `payment_intent_id`. Both reads were converted to the wire shape;
     the test was not. So `.payment_intent_id` and `.amount` are `undefined` on
     **both** implementations.
  2. **`NaN` really does pass.** Run directly: under `node:assert/strict`,
     `assert.equal(NaN, NaN)` **passes** — strict equality uses `Object.is`, and
     `Number(undefined)` is `NaN`. So the second assertion compared `NaN` to
     `NaN` and went green.

  **Two green assertions, neither comparing anything, on the parity evidence for
  the feature that holds fourteen sets of unencrypted bank details.** Rewritten
  against the fields that exist, with a floor so an absent `provider_ref` fails
  loudly rather than passing quietly.

  **This qualifies a decision on your list.** `PAYMENTS_SOURCE` is one of the two
  surviving switches, and the test standing as its parity evidence was vacuous
  until tonight. It is now a real comparison — but the evidence is hours old, not
  months. **Ninth vacuous-test instance on this project, second tonight, and the
  second one found by the compiler rather than a person.**
- **TRACKER OVERRIDE — lane B's L-B9 is HALF WRONG, and it is the half that was
  flagged for Jacob on the money path.** Lane B reported that `amount_received`
  and `amount_capturable` *"have no destination in `payments.*`"*, so promoting
  `PAYMENTS_SOURCE` *"stops recording both fields"* — tying it to CLAUDE.md's
  $126.48 open thread. **The tracker checked it and `amount_received` has a home,
  is written, and is read back.**

  - **`payments.settlements.settled_amount` is the destination**
    (`000_genesis_schema.sql:832`), and `feature-map.mjs:156` declares the
    mapping `amount_received: "settled_amount"` explicitly.
  - **It is written.** `repo.next.ts`'s `updatePaymentIntent` does
    `INSERT INTO payments.settlements (… settled_amount …)` guarded by
    `if ((payment_intent.amount_received ?? 0) > 0)`, with a comment stating the
    model change in as many words: *"exchange keeps `amount_received` on the
    intent; here it is a settlement, and only exists once money has moved."*
  - **It is read back.** `repo.next.ts:96` projects
    `st.settled_amount AS amount_received`.

  **Why lane B missed it, and it is an instructive miss**: it searched for
  `amount*` **column names** and concluded there was no home. The destination is a
  *rename onto a different table*, which is precisely the trap CLAUDE.md names —
  *"a reported gap is often a rename or a relocation rather than a loss."* Its
  claim that `updatePaymentIntent` "writes `status` and `amount_expected` and
  nothing else" is false: the settlement insert is ~30 lines further down the
  same function.

  **What DOES survive, and is worth keeping:** `amount_capturable` really has no
  home — `feature-map.mjs:181` declares it dropped as `"-"`, so `audit:coverage`
  is *told* to stay silent rather than being blind to it. Whether that
  declaration is right is a fair question, and it is `0` on all 18 dev rows.
  **And a subtler one the tracker would keep:** the settlement row is only written
  when `amount_received > 0`, so an intent that received nothing records **no
  settlement at all** — meaning "zero received" and "never recorded" are
  indistinguishable in the new schema. Given the open thread is about intents
  reading `null` or `0`, that is the question actually worth asking, and it is not
  the one L-B9 asked.

  **Bottom line for the morning: promoting `PAYMENTS_SOURCE` does not silently
  drop `amount_received`.** Do not act on L-B9 as written.
- **A DEFECT IN `feature-map.mjs` ITSELF — a duplicate key silently overriding a
  real mapping.** Found by the tracker while checking the above.
  `exchange.payment_intents` declares **`bank_account_type` twice** in one object
  literal: line 166 maps it to `account_type`, line 180 declares it dropped with
  `"-"`. JavaScript takes the last, so **the real mapping at 166 is silently
  discarded** and `audit:coverage` believes the column deliberately has no home.
  One of the two lines is wrong and the file gives no way to tell which, because
  only one is in effect and nothing warns. This matters more than a typo:
  CLAUDE.md says this map *"drives `audit:precision`"* and exists so *"the report
  stays honest"* — a duplicate key makes it quietly dishonest, and it is the same
  species as everything else tonight, a detector confidently reporting on the
  wrong input. *(Described without a number; the coordinator assigns.)*
- **A FIFTH AND A SIXTH ROTTED GATE SCRIPT — the count this lane was created to
  stop rising, still rising (lane D).** Wave 6 began with four known
  (D110, D115, D118, D120). It now has six.

  **Fifth: `audit:frontend-nullability`'s `--self-test` had been FAILING, and
  nothing runs it, so nobody knew.** Its single known-present control was
  `spotPriceSchema` requiring `bid_spot` — and **the 2026-08-28 contracts
  conversion deleted that schema.** The finding was not missed; *the subject was
  retired*. Lane D's reading is the useful one: that is the **right** failure — an
  assertion that cannot see its subject should fail — and it is exactly why a
  self-test needs **more than one control**, because a single control makes a
  guard only as durable as the most deletable thing it points at. Repointed to
  two that survive, with failure text telling the next reader to repoint rather
  than delete.

  **Sixth: `audit-state-collapse.mjs` only worked from one directory.** It
  computed its root as `cwd.endsWith("/frontend") ? cwd : join(cwd, "frontend")`
  — true of the two places it happened to be invoked from, false everywhere else.
  Run from `frontend/scripts` it resolved
  `frontend/scripts/frontend/app/styles/theme.css` and died on ENOENT. Same shape
  as D120: correct about the invocation the code happened to have. Anchored to
  `import.meta.dirname` and verified from `/tmp`.

  **Also from D6, and it qualifies a claim on this page**: `audit:switches`'
  bypass scan **cannot see raw SQL** — a feature writing `SELECT … FROM
  products.bullion` inline reaches a new schema with no import to find. The
  tracker checked what that means for the D142 closure below: `quotes/service.ts`
  holds exactly **one** inline statement, `SELECT dorado_funds FROM
  exchange.users`, which reads the **old** schema that production does have. So
  the closure stands — but the general gap is real, and `audit:query-paths` is
  what walks those statements, not the switch audit.
- **A GREEN TEST THAT ASSERTED NOTHING, ON THE ADDRESS DEFAULT-SHIPPING PATH —
  and the compiler found it in one line (lane B, L-B8).** The clearest
  vindication of "the conversion is the point" that wave 6 has produced.

  `addresses/tests/service.test.js` had a test named *"setting a default clears
  the others, in both schemas"*. `draft()` returns a wrapper
  `{ address, user_address }`, and ten of the file's thirteen `service.create`
  call sites **spread** it. Three wrapped it a second time —
  `service.create({ address: draft(), … })` instead of
  `service.create({ ...draft(), … })` — so the service received an `address`
  containing **no address columns at all**, and `default_shipping` fell to its
  default of `false`. The `true` the test needed had been passed into `draft()`'s
  *first* argument, the address overrides, so it never reached the service
  either. **Two independent mistakes in one call, compounding.**

  **The consequence is the part worth reading twice.** The closing assertion was
  *"the address that used to be the default is still one"* — and it passed
  **because that address had never been the default**. The test cleared nothing
  and confirmed that nothing had been cleared. Green, permanently, on a live
  customer-data path.

  **TypeScript named it on the first compile**: *`AddressInput` has no properties
  in common with `{ address: …, user_address: … }`* — not a nullability nag, but
  the compiler saying the two shapes are unrelated. Fixed to the spread form the
  other ten sites use; **13 tests, 13 pass**. The product behaviour was correct
  all along — only the test was not testing it. **That is the eighth time this
  project has hit the vacuous-test shape**, and the first time a type checker
  caught one rather than a person.
- **A MONEY-PATH GAP: an order with no payout `cost` makes the invoice total
  `NaN` rather than throwing (lane B, L-B2).** The tracker verified this one in
  the source because it is the kind this project cares about most.
  `features/pricing/bid.ts:148` ends `calculateTotalPrice` with:

  ```
  const shipping = order.shipment?.shipping_charge ?? 0;
  return baseTotal - shipping - order.payout.cost;
  ```

  **Note the asymmetry, which lane B did not call out and which makes it plainer:
  the line immediately above defends `shipping` with `?? 0`, and the return line
  does not defend `payout.cost` at all.** `PricedOrder` declares
  `payout: { cost: number }` (bid.ts:115), but the composed read that feeds it
  promises no such thing — and the live caller does not close the gap, it
  **asserts it away**: `features/orders/service.ts:62` declares
  `type OrderLike = PurchaseOrderRow & Record<string, any> & { … payout: { cost:
  number } }`, an intersection onto a row that never promised the key. A missing
  `cost` yields `number - undefined` = **`NaN` for the whole invoice**, silently;
  a missing `payout` throws inside the pricing module rather than naming the
  failed read.

  **Lane B guarded the test and correctly left the source alone** — `api/features/**`
  is lane A's scope, not its own.

  > **HANDED OVER AND FIXED, within minutes of this page saying it needed handing
  > over.** Lane A took it as a new task 5, *"The invoice NaN (handed over)"*, and
  > the reasoning is worth keeping. It measured first and found **three inputs
  > giving three different answers**, only one deliberate: `payout: null` →
  > TypeError (pinned by a test whose own comment called it *"fragility rather
  > than desired behaviour"*); `{ cost: null }` → `0`, because JS reads `x - null`
  > as `x - 0`; `{}` → **NaN, silently, all the way to the invoice** — and **no
  > test could ever have existed for that arm, because the type said it was
  > impossible.**
  >
  > **The fix splits by MEANING rather than by nullishness**: a fee that is
  > *absent* is zero (an order with no payout has no payout fee — which is what
  > the invoice template already does one line below the call, and is **not**
  > waiving a fee, so D117's concern is untouched); a fee that is *present and
  > unusable* throws. A blanket `?? 0` was rejected because it would have silently
  > converted the `null` TypeError into a 0, deleting a guard by accident.
  >
  > **Both subtrahends now go through one `fee()`** — the asymmetry between those
  > two consecutive lines is how this got in — so `shipping_charge: "free"` throws
  > too. **Both public totals end in `finite()`: the invoice is a number or an
  > exception, never NaN.** That gate is not hypothetical: migration 087 had to
  > clean up two rows whose stored `content` was literally `'NaN'` and reached the
  > wire as the string `"NaN"`.
  >
  > Pinned with nine tests, one per arm, and then **swept against the database
  > rather than trusted: all 48 dev purchase orders priced, 0 threw, 0 NaN.**
- **A LIVE VISUAL DEFECT ON THE ADMIN PURCHASE-ORDER DRAWER — hovering a menu row
  made its label vanish.** The sharpest thing wave 6 has produced. Chasing
  `SelectMenu`'s zero importers, lane C found **six hand-rolled Popover+Command
  menus** that had stayed in the tree — **five of them in one file** — and every
  one carried the exact D95 defect `SelectMenu`'s own header warns about: rows
  spelled `text-primary` sitting on `hover:bg-primary`, and **both tokens are
  near-white** — verified by the tracker at `theme.css:331`,
  `--primary: hsl(0, 0%, 98%)`, i.e. `#fafafa`, so `text-primary` and
  `bg-primary` resolve to the same colour. White text on a white fill on hover.
  Two of the five also said `group-hover:text-white` over that same white fill.
  (For contrast, `--accent` at `theme.css:350` is `#23252a` — dark, and already
  the hover fill for quiet chrome, which is why the replacement uses `--primary`
  for the *chosen* row instead of collapsing chosen and hover into one look.)
  **This was live**, not theoretical, and it is fixed by the adoption rather than
  by a patch. Note what the shape has in common with everything else tonight: a
  component was built with the correct behaviour, the copies that stayed behind
  kept the bug, and nothing compared them.
- **`shared/ui/SelectMenu.tsx` had ZERO importers — RESOLVED at 01:15, and it was
  the ONLY one of the four that had none.** Lane C reported the zero; the tracker verified it and then
  checked the other three, which is the part that makes it useful. A repo-wide
  grep for `SelectMenu` returns **two** files: the component itself, and
  `shared/ui/base/drawer.tsx` line 48 — where the match is **a comment**, not an
  import. Real importer count: 0. The other three lifted in the same D87/D88
  series are genuinely in use — **AccordionSection 6** call sites,
  **StatusChip 11**, **UpdatedByline 4**.

  So the honest reading is *not* "hoisting doesn't stick" — three of four stuck.
  It is that **one component was lifted and then adopted nowhere, and nothing
  noticed for a wave**, because the metric everyone had was "components created",
  by which SelectMenu scored the same as StatusChip.

  **Lane C's C3 closed it at 01:15, and the tracker re-checked**: `SelectMenu` is
  now imported by `adminPurchaseOrderDrawerContents/AdminReceived.tsx` and
  `features/orders/ui/OrderStatusShared.tsx` — **0 real importers → 2** — with the
  two files down 940 → 810 lines (−14%) and 199 → 153 (−23%). The third match in
  the tree is a comment recording that this component had once had none.
- **Lane B — two dead `.d.ts` files that disagree with the implementations they
  describe, and one of them is an assertion that does not assert.**
  `shared/testing/pinned-pool.d.ts` and `session.d.ts` sit beside helpers that
  are `.ts` now, so **tsc ignores them** — lane B proved it by attack, D134-style,
  rather than by reading. They disagree in three places. The one that matters:
  `assertNothingEscaped` is declared `Promise<void>` and actually returns
  `Promise<number>` — **its name says assert, but it returns a count the caller
  must check.** Had the `.d.ts` been in force, `await assertNothingEscaped(t, p)`
  standing alone would typecheck as a completed assertion while asserting
  nothing: the **vacuous-test shape this project has now hit seven times.** It is
  latent rather than live, because the `.d.ts` is not in force. Lane B has not
  touched them — they are source, not test, and therefore another lane's — and
  recommends deletion, since the implementations are already typed.
  *(Described without a number. The coordinator assigns; lane B is calling it
  L-B0 locally.)*

## Wave 6 — the record of a call this page made and got right

*Kept at the end of the section because it is history now, not news.*

> ### THE DISPATCH-TIME ZEROS WERE STALE, THIS PAGE SAID SO, AND ALL FOUR LANES PROVED IT
>
> **Kept as the record of a call that proved right — the bars above are now
> current.** Between 00:57 and 01:07 every wave-6 bar but one read 0% while the
> working tree showed real work in three of the four lanes. This page refused to
> publish those zeros as progress and said which ones the tree contradicted:
>
> - **Lane A** — task 1 called substantially built while reported 0%, on the
>   evidence of migration 097 existing and genesis being modified.
>   **RESOLVED 01:11**: tasks 1 and 4 both went straight to **100%**. The largest
>   gap of the four.
> - **Lane B** — B2 called underway while reported 0%, on the evidence of nine
>   staged `.test.js` → `.test.ts` renames matching B2's exact file set.
>   **RESOLVED 01:08**: B2 is **100%** and the count is **23 / 117**.
> - **Lane C** — called "now editing" while its file said no edits yet, on the
>   evidence of four changed files in `shared/ui` plus four feature UI
>   directories. **RESOLVED 01:09**: C1 and C2 both **100%**, with a call-site
>   table rather than a component count.
> - **Lane D** — D2 called underway while reported 0%, on the evidence of
>   `self-test.mjs` being new. **RESOLVED 01:07**, first to update: five zeros
>   became **40 / 35 / 90 / 100 / 0**.
>
> **Not one lane was idle; all four were writing code before writing about
> themselves.** The tracker never raised another agent's number on its behalf —
> the bars stayed at each lane's own figure and this box carried the override,
> which is the rule this page runs on. Expect the same pattern for the rest of
> the night: a bar that disagrees with the tree is usually lag, and it is worth
> saying which rather than picking one.


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

## Wave 5 — COMMITTED at `cae90da7`, with one task refused on evidence

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

**5c's numbers stopped the wave's second task dead, and that is how it shipped.** Its task 1 is the covenant: the evidence that scrap and bullion data is
genuinely migrated. **Nothing gets deleted from `features/scrap` or
`features/checkout` until that evidence clears** — exchange-only rows, value
agreement, per-direction counts. 5b gathered none of it (D128), so 5c starts from
zero, and its file currently says so honestly rather than implying otherwise.
That is exactly what happened: **the evidence did not clear, so task 2 stays at
0% and the legacy layers stay.** 5c's own file ends "Task 2 — NOT STARTED, AND
NOT STARTING". Read the bar as a decision, not a shortfall.

**5a's task 2 is genuinely partial**, by contrast: 5 of 28 test files converted
to TypeScript, 23 remaining — and those are the large ones (`parity` 402 lines,
`sales-service` 392, `patch` 391, `create` 356), each carrying `let admin;`-style
fixtures needing a declared structural subset. That is where the next defects of
this class will be, on the evidence of the four already found this way.

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

## What tonight actually found

**Almost every defect was a check that reported success while looking at the
wrong thing.** Not broken code — broken instruments. The list reads the same way
end to end: a leak detector fingerprinting the wrong half of the database; a
contrast scan that knew one spelling of a class pair; a route census answering
about a subset of routes and exiting 0; a suite spawned without half of the guard
that keeps tests off live Stripe, FedEx and mail; a parity tool that had never
covered the feature whose deletion it was supposed to authorise; a comparison
that joins on an id the target does not keep. Each was green. Each was green
about the wrong question.

**D135 is the sharpest single expression of it**: the identical filename bug in
two files on the same night — silent in the report, loud in the assertion. One
stopped the suite; one stopped nothing. If a check can be wrong, make it assert
rather than print.

The corollary is the reason this page exists. **A number is not evidence of the
thing it appears to measure**, and the ones that mattered tonight only became
true when someone re-derived them: the wave-4 seam where both money fixes were
fully built and fully inert with green gates on either side saying so; two counts
that were repeated rather than checked; two bars that would have read 0% for a
task already finished. The finding sections below are what a reader cannot
reconstruct from the code — the code will still be there next month, but nobody
will rebuild *why* a fix that looked right had never applied.

- **D138 — 5c fixed the instrument rather than only reporting it could not
  answer** —
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
- **D139 — a SECOND D124 instance, and this one is on the money path.**
  `api/features/quotes/` belongs to no lane in wave 5, and it holds an unswitched
  new-schema read — quotes being the endpoints that price every customer-visible
  number since D81–D84. Found by 5c while walking its own boundaries. The
  partition question is not answered once at dispatch: **every wave needs the
  task list walked against the ownership map, and this one has a gap nobody
  noticed until an agent looked sideways.**
- **D140 — the two order directions disagree about the premium on a cart line.**
  `addItems` (sale) writes no premium at all; `replaceSellItems` (purchase,
  product branch) writes `b.bid_premium` as the premium. Reported by 5c, not
  touched. It sits directly beside the `bid_premium` finding above — the column
  with no home, which for 23 production rows is the only premium recorded
  anywhere.
- **D141 — one thing in 5c's tree could be deleted on evidence alone, and it was
  left alone anyway.** `api/features/scrap/service.ts` has **zero importers** — its
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
  those parcels.
  **RE-GRADED by Jacob's device-sync ruling (see the banner at the top):** the
  `exchange.scrap` half of this is exactly right and is what the covenant is for.
  The *empty `checkout.*` tables* half is **not a finding** — a cart is
  device-sync data, empty is fine and losing it is fine. What their emptiness
  disproves is only the claim that the rows had already migrated, which is what
  the deletion rested on. Worth noting how close it came: task 2 was originally handed to
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

# Blocked on Jacob

**Three items. That is the whole list.** This section led with the deploy
sequence until 00:57 tonight, and that was wrong in a way CLAUDE.md now names
explicitly: *"do not treat production state as a blocker on this branch's work,
do not plan around a deploy date, and do not report production facts as though
something is on fire"* (Jacob, 2026-08-29). Production is not being touched and
will not be until the refactor is proven. Everything that used to head this list
has moved below it, under **Recorded for an eventual day** — verified, written
down, and waiting on nothing.

What genuinely needs a decision only Jacob can make:

- **D117 — the payout fee is not a function of the payout method, and that
  qualifies a fix that already shipped.** **FOUR** production `exchange.payouts`
  rows disagree with the fee table, not eleven — see the correction below, which
  does not weaken the finding and slightly sharpens the question. The four:
  **ECHECK at 75 on one row and 125 on another** (the table says ECHECK is free,
  and 39 other rows are), and **WIRE at 0 on two rows** (the table says 20, and
  six other rows are). So a fee cannot be re-derived from a method name for an
  existing order — the stored value is the truth, and
  `api/features/payouts/constants.ts` is a default for a NEW order only, which
  that file's own header already says in capitals.
  **The question for you:** were the two zero-fee WIREs waived deliberately, and
  what are the 75 and 125 ECHECKs? If they are deliberate exceptions, **a fee is
  per-order data, not reference data**, and the constants file models the wrong
  thing. If they are not, four payout records are wrong. Nobody but you can tell
  which — and at four rows this is now a small enough set to just look at.

  > **TRACKER CORRECTION, and it needs the coordinator's eye because the number
  > is wrong in `FOLLOWUPS.md` and in the source comment too.** Both say *"eleven
  > of those rows disagree"*. Recomputed from the very breakdown they print,
  > against `PAYOUT_METHOD_FEES` in `api/features/payouts/constants.ts`
  > (`ACH: 0, WIRE: 20, ECHECK: 0, DORADO_ACCOUNT: 0`):
  > ACH `0 x11` **agrees**, DORADO_ACCOUNT `0 x2` **agrees**, ECHECK `0 x39`
  > **agrees**. Only `ECHECK 75 x1`, `ECHECK 125 x1` and `WIRE 0 x2` differ —
  > **four rows.** The eleven appears to be the `x11` off the ACH line, which is
  > the one method-value pair that matches perfectly.
  > **Second, separate arithmetic problem in the same comment:** the breakdown
  > sums to **62** (11+2+39+1+1+6+2) while the text beside it says *"measured, 61
  > rows"*, and CLAUDE.md also says 61 payouts. One of the seven counts is off by
  > one, or the total is; the tracker cannot tell which from here and has not
  > guessed. **Neither error touches the conclusion** — a stored fee must never
  > be re-derived from a method name, which is true at four rows as at eleven.
  > `FOLLOWUPS.md` is the coordinator's file and the tracker has not edited it.
- **A production order line's two copies disagree on the weight and purity a
  customer is PAID on.** Order item `d16b7c32`, order `117265cc`: `pre_melt`
  18.662 against 20.000, `post_melt` 18.662 against NULL, `purity` 0.570 against
  0.563, `content` 0.342 against 0.362. Dev is clean — 20 pairs, 0 differences —
  so this is January-refactor drift landing on one specific row. **The question
  for you: which copy is right?** No audit can answer it; the two numbers are
  both plausible and only one of them is what the customer was actually paid on.
  (This is a production *fact*, but unlike the ones below it is a live question
  about money owed, not a step in a deploy nobody is running.)
  **Provenance, stated so it is not mistaken for a fresh read:** these figures
  come from an earlier pass's verified read-only query against production and
  were **not** re-queried tonight. The tracker deliberately did not re-run it —
  the finding needs your judgement about which copy is true, not another
  recount, and the cheapest way to get production wrong is to keep touching it
  for numbers already recorded.
- **The T&C legal copy edited by the offers purge is unreviewed, and the tracker
  read the diff tonight — it removes more than vocabulary.** It ships the moment
  `master` deploys. `frontend/app/terms-and-conditions/page.tsx`, changed in
  `0a201bc0`, **14 insertions against 36 deletions.** The commit message flags it
  for you itself ("the legal diff is flagged for Jacob's review"); this is what it
  contains. Four clauses are **gone**, not reworded:

  1. *"Offers are valid for 24 hours; failure to accept may result in
     re-evaluation based on market changes."*
  2. The whole **"Accepting Our Offer"** section, including the deemed-acceptance
     term — *"You must accept our offer within 24 hours or, for your convenience,
     we will deem the offer accepted and issue payment to you via company
     check."*
  3. The whole **"Rejecting Our Offer"** section — the phone number, the dashboard
     route and the support address that told a customer **how** to decline.
  4. From Unclaimed Items: *"If a customer fails to accept or reject an offer
     within 7 business days, the transaction is deemed accepted and payment is
     issued."*

  **The part worth a careful look:** the Return Policy survived, but its trigger
  did not. It used to open *"If you reject our offer"*; it now opens *"If your
  Products are to be returned"* — which does not say who decides, or how a
  customer asks. So as the document currently stands, **it describes no mechanism
  by which a customer declines a price and gets their metal back.**

  That is *consistent with the product* — your own ruling is that customers have
  zero post-placement order options, and the code now matches. Which is exactly
  why this is a lawyer's question and not an engineer's: the contract and the
  product agree, and the question is whether the contract may say that. **No
  agent has assessed this as legal text and none should.**

## Also yours, but neither urgent nor blocking

- **The two surviving `*_SOURCE` switches.** Re-verified in the tree at 01:15,
  after tonight's changes: exactly two are live — **`PAYMENTS_SOURCE`**
  (`features/payments/repo.js:26`) and **`CHECKOUT_SOURCE`**
  (`features/checkout/repo.js:23`), each reading `process.env` and each still
  defaulting to `exchange`. Promotion is a one-way door and is your call, but
  nothing is waiting on it.

  > **A trap for whoever checks this next, worth writing down.** A plain grep for
  > `_SOURCE` across `api/features` returns **five** names — the two above plus
  > `ORDERS_SOURCE`, `PURCHASE_ORDERS_SOURCE` and `SHIPMENTS_SOURCE`. **Those
  > three are comments**, every one of them: `orders/create.ts:49`,
  > `orders/service.ts:199` and `orders/service.ts:1430` refer to switches that no
  > longer exist, in prose explaining history. Grep says five; the answer is two.
  > CLAUDE.md said twenty-one until `002c0f0f` corrected it, and the retired ones
  > were never promoted — they stopped existing as each feature's reads pivoted.

  **A CAVEAT ON `PAYMENTS_SOURCE`, new at 01:39.** Its parity test — the evidence
  that the switch can move — **was comparing `undefined` to `undefined` and `NaN`
  to `NaN`**, both passing, until lane B's conversion caught it tonight (L-B10,
  confirmed independently by the tracker). It is a real comparison now. But if you
  were treating "payments parity is green" as a settled fact, it was not one until
  a few minutes ago, and it is the feature carrying **fourteen sets of unencrypted
  bank details**. Worth letting the corrected test run a while before leaning on
  it.

  **NEW at 01:33 — `CHECKOUT_SOURCE` now has its evidence, and the flip is one
  environment variable.** Your bar for `checkout.*` is **function, not
  preservation** — *"empty is fine, losing it is fine, it only has to work"* — and
  lane A points out that **nothing in the gate exercises that**: `diff` has no
  checkout entry, and `verify:parity` can only report that the target is empty. So
  it exercised the path directly against dev, inside a single transaction that was
  rolled back: **8 passed, 0 failed** — a sale checkout created, the line stored
  with its bullion/metal/quantity, a second sync **replacing rather than
  appending** (n=1, not 2), a separate purchase checkout for sell items, product
  and scrap lines both landing, the catalogue resolved **by name** (D73), scrap
  keeping its own values, and all three reads the service calls existing.

  **Lane A did not promote it, deliberately, and said why**: promotion is stated
  twice in CLAUDE.md as your call, and *"an agent that promotes a switch because
  the evidence looks good teaches everyone the gate is advisory"* (D141). The
  evidence is gathered; the decision is still yours.
- **NEW, from lane A: `legacy/README.md`'s exit criteria cannot be met as
  written, and what replaces it is one question you can answer once.** Step 3 of
  the stated gate for retiring a legacy directory is *"its `*_SOURCE` switch is
  promoted past `dual`"*. **For eleven of the fourteen directories there is no
  switch any more** — it was deleted along with the `repo.js` that read it when
  that feature's reads pivoted. So the written gate is unsatisfiable for eleven
  of fourteen, not because anything is wrong but because the world moved past the
  wording.

  **The real remaining question is simply: may `exchange` stop receiving these
  writes?** One question, asked once, covering all eleven. It is the one-way door
  and CLAUDE.md already says it is yours.

  **Lane A gathered the evidence tonight so it can be answered rather than
  researched**: `verify:parity` shows **10 of 15 pairs byte-identical** — leads
  39, ledger 19, rates 16, reviews 14, sales-tax 88, suppliers 2, carriers 3,
  mints 10, images 1, products 62 — with zero missing, zero differing, zero
  exchange-only. Of the five that are not identical, four are the cart pairs
  (device-sync, **not a finding** per your own ruling) and one is
  `exchange.metals → metals.exchange_compat`, the live spot feed, which
  self-heals on the next cron tick. An unused-export sweep of `api/legacy/**`
  returns **0 exports with no caller**, so every one of the fourteen directories
  is load-bearing today.
- **`Spots.tsx`'s full-bleed `bg-brand` bar still collides with ruling 19.**
  Flagged twice, untouched both times; lane B preserved it exactly rather than
  decide it.
- **`CartTabs`' two tabs use different active treatments** — `underline` on Sell,
  `underlineSubtle` on Buy. Preserved exactly because it looks accidental rather
  than intended, which is a question only you can answer.

# Recorded for an eventual day — NOT blockers

Verified, written down, and deliberately not framed as pending. Every item here
is true; none of it is a decision waiting on anyone this week. When the day comes
the sequence is `pg_dump` first, then migrations, then backfills, then
`verify:parity` and `compare:databases`, then merge — and not by an agent.

- **Production is missing eight of the eighteen schemas outright** — products,
  organizations, metals, spots, media, leads, rates, reviews — verified read-only.
  This is not missing *data*; most of `000_genesis_schema.sql` has never run
  there. It matters *on deploy day*, which is not scheduled.

  **UPDATED 01:11 — the one live code path that assumed otherwise is now
  closed.** `features/quotes/service.ts:27` used to import
  `#features/checkout/repo.next.ts` directly, **around** the `repo.js` that
  `CHECKOUT_SOURCE` selects, reaching a `SELECT id FROM products.bullion` — a
  42P01 on the pricing path on first request against a production with no
  `products` schema. **Lane A removed it tonight (task 4) and the tracker
  confirmed in the tree**: no feature service imports a `repo.next` directly any
  more, and lane D's `audit:switches` now guards the class rather than the single
  case. The schemas are still missing; the code no longer walks into them.
- **23 production `exchange.scrap` rows, across 12 sell carts and 12 distinct
  customers, exist nowhere else.** Real declared parcels — 459.374 g of 0.900,
  272.228 t oz of sterling, 13.419 g of 0.203. This is why wave 5's deletion was
  refused, and the refusal already happened; the rows are intact and nothing is
  pending on them. Also 27 of production's 89 `purchase_order_items` have no
  `orders.items` row at all — expected, since the backfills have never run there.
- **D39 — two production products carry `E'\n\tBar'`**, a newline and a tab in
  front of "Bar", against a sales-tax rule that compares text to an enum and
  raises 22P02. Not reachable today (both `display = false`, stock 0, no order
  line references), but `get_product_types` is an unfiltered `SELECT DISTINCT`,
  so the admin dropdown offers the corrupt value beside the real one. The fix is
  an UPDATE against production.
- **`orders.items.price` stays, and it was counted rather than assumed.**
  Ruling 34's precondition is not met: 24 of 98 priced production lines do not
  reproduce, so the column stays. Nobody typed a different number, but on those
  24 rows `price` is the only surviving record. Two tails: widening
  `exchange.scrap.content` from `numeric(20,3)` is D61 and a production
  migration, and **the four sales rows whose `premium` contradicts their own
  `price`** are a defect in their own right (and belong with D117 when you look
  at that one).
- **`carrier_services.code` and `provider_code` are NULL on all eight production
  rows.** Populating them is an UPDATE against production. It is what stands
  between the offered-service catalogue and being served from its own table
  instead of an adapter.
- **Bank details are unencrypted at rest**, and production holds fourteen —
  10 ACH and 8 WIRE rows of `exchange.payouts` carrying real routing and account
  numbers in plaintext. The payments migration must not copy them into
  `payments.details`, which would double the exposure.
- **$126.48 production was paid has no record.** Three Stripe intents captured
  with `amount_received` null or 0; two further charges with no row at all. The
  money is safe — Stripe has it and Stripe is right — but the webhook is not
  reliably landing, and the visible symptom is a checkout that fails at the last
  step. `audit:payments` prints the list.
- **D138 — checkout parity needs a source-id column to ever answer again.**
  DOWNGRADED tonight by the device-sync ruling. The four new cart pairs are exact
  only while the target is empty, because the comparison joins on `id` and a
  checkout row gets a fresh `gen_random_uuid()`;
  `orders.addresses.source_address_id` is the shape that already exists for this.
  It was listed as blocked-on-Jacob until 00:57. Under *"empty is fine, losing it
  is fine, it only has to work"* a permanently-answerable parity check on
  device-sync data is **nice to have, not owed** — the migration is still yours
  to write if you want it, but nothing is held up waiting.

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

**The tracker published a number it had not measured, once, and corrected it
within a minute (01:37).** The working-tree count was written as **224** when it
was **214** — typed from memory of the previous reading instead of re-run. It is
recorded here because this page spent the night insisting that lanes check
figures rather than repeat them, and a tracker that quietly fixes its own slips
while publishing other agents' is running two standards. The count is now taken
from `git status --porcelain | wc -l` at the moment of writing, every time.

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

**The closed waves on this page are final as of `cae90da7`, with `002c0f0f` the
docs correction on top.** All six existing lane files under `docs/waves/` are
closed records. **Wave 6 is live and has produced no lane file yet**, so its bars
do not exist rather than reading zero — see the wave 6 section. The moment
`overnight-lane-{a,b,c,d}.md` appears, `node scripts/waves.mjs` will pick it up.

**Timestamps on this page are real.** Where it says "no update since 00:57" that
is a checked fact about the filesystem, not a placeholder.

The tracker owns this file and the published artifact. Each agent owns exactly
one file under `docs/waves/` and updates only that one — never this index, never
another agent's. Two agents editing one shared file is how two rulings were lost
on 2026-08-28; the split is the fix, not bureaucracy. `FOLLOWUPS.md` is the
coordinator's alone and remains the authority for rulings and findings.

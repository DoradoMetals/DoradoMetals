# Inventory file — comment log (not committed)

File **Inventory** `ZgJF9JWNY6BwxmWABRZ6I7`. Pages: `Lots` 0:1, `Pool` 1:2488,
`On Hand (?)` 1:2489.

| when | comment id | pin | what Jacob said | what I did |
|---|---|---|---|---|
| 2026-10-09 00:40 | — | — | (no comments on the file yet) | first poll returned 0 comments |

## Work log

### 2026-10-09 — comment posted for Jacob
- `1959453780` pinned on `Admin / Lots — Gold, unassigned` 1:2747. Plain-English plan
  (three chips, what each page holds, the two detail screens) plus the four §4 open
  questions with the defaults I am building. Links in sentences, ids read back out of
  Figma first.

### 2026-10-09 — library hand-offs pinned (Themes and Components 8A73quhBLBqotJlX95jN9j)
- `1959453938` on `Admin Header` 730:8 — remove the `Pool` tab from 730:8 and
  734:269. Marked **pending Jacob's confirmation of Q3**. Cannot be done in the
  consuming file: no per-tab Show property, and a tab instance cannot be deleted
  on an instance.
- `1959453942` on `Header` 51:58 — no `Layout=Mobile, Drawer Open=False, Signed In=True`
  variant, so every mobile admin screen wears a signed-out marketing header. Same gap
  recorded for the Orders file on 2026-09-11.

### 2026-10-09 — orphan rebuild (step 2)
Pre-swap snapshot: `scratchpad/inventory/orphan-snapshot-2026-10-09.json`. All reads
non-empty, so nothing was aborted.

All five orphaned mains were still reachable by node id and cloneable, so each rebuild
is a **clone of the orphaned main**, not a hand-rebuild — structure byte-identical,
nothing to re-apply.

| orphan | rebuilt as | instances swapped | result |
|---|---|---|---|
| `Totals` 1:2620 (set, Open=True\|False) | local `Totals` **17:10601** in `Components · Lots` | 25 | 25/25 identical text, row set and size |
| `Selection actions · Inventory` 1:2658 | local `Selection actions · Lots` **17:10623** | 2 swap slots (bars 1:2962, 1:4695) | text and height identical |
| `Selection actions · note` 1:2665 | local `Selection actions · note` **17:10628** | 1 swap slot (bar 1:3015) | text and height identical |
| `Lock ounces` 1:2667 (set) | no rebuild — swapped onto the existing local set **1:807** | 2 (1:3156 desktop, 1:3212 mobile) | identical, 1:807 now carries 4 instances |
| `Filter Bar (proposal A)` 1:2642 | not rebuilt, per coordinator answer 11 | 3 | host frames parked |

The `Totals` orphan carried a trap worth recording: its main has four body rows
(`Scrap · Bullion · Shipping · Payout fee`) and the three-row instances had the
fourth row **deleted inside the instance**, not hidden. Cloning the main preserved
that override on every swap, so no row had to be re-hidden.

New sections:
- `Components · Lots` **17:12922** at (-24129, -4040), above every screen on the page.
- `Components · Pool` **17:12923** at (0, -1500); `Lock ounces` 1:807 moved in from
  `Draft · Pool · 2026-09-11` because the Lots page now instances it too.
- `Parked · superseded 2026-10-09` **17:12924** at (-40000, 10000), off-canvas, with a
  one-line note and the three superseded frames plus their labels:
  `Admin / Inventory — 3 lots selected` 1:2910, `— mixed selection` 1:2963,
  `— empty` 1:3016. Nothing deleted.

Verification: eight frames rendered before and after. Six byte-identical
(`lot-onhand`, `lot-pooled`, `lot-refiner`, `lot-pooled-mob`, `titleproof`, `lockopen`).
The two parked Inventory frames differ by **one pixel each**, at (46,39) in both — a
single anti-aliasing step inside the site-header logo mark, nothing to do with the
swap.

Remaining orphan: `Filter Bar (proposal A)` 1:2642, 3 instances, all inside the
parked section.

### Decisions recorded for the Lots build (coordinator answers, 2026-10-09)
- Form stays as the existing `All · Scrap · Bullion` Radio Chips to the right of the
  Position row. No Form select. Toolbar carries Metal and Sort by only; Assigned to off.
- The lots card title row keeps the count badge and **loses the `Batch` and `Combine`
  icon buttons**: both act on a selection, and the Selection Bar owns those actions,
  so a title-row button with nothing selected has no meaning.
- Default count line: `23 lots · all positions · 162.1 oz fine on hand`.

### 2026-10-09 — 2.1 Inventory › Lots built (step 3)

Also parked, on the coordinator's word: `Admin / Inventory (Mobile)` 1:3048 and its
label 1:3228 joined the three already in `Parked · superseded 2026-10-09` 17:12924.

Built beside 1:4644, never in place. New section **`Inventory · Lots (2026-10-09)`
28:12468** on the Lots page at (-20000, -3952), 6810 x 1783, with five labelled frames.

| state | frame |
|---|---|
| default | `Admin / Inventory — Lots` **22:10623** |
| 3 selected | `Admin / Inventory — Lots, 3 selected` **27:11402** |
| mixed selection | `Admin / Inventory — Lots, mixed selection` **27:11884** |
| empty | `Admin / Inventory — Lots, empty` **27:12411** |
| mobile | `Admin / Inventory — Lots (Mobile)` **28:11883** |

Two new components in `Components · Lots` 17:12922:
- **`Lots Row` 20:10607** (`State = Default | Selected`), cloned from Jacob's
  `Lot Row` 1:4469 so the cell styling is his. Columns re-cut to the ruling:
  Select 16 · Lot 362 · Metal 90 · Form 100 · Content 120 · Position 120 ·
  Order 180 · Refiner order 150 · Updated 110, gap 16, total 1376. Dropped
  Post melt, Purity and Value; added Metal, Refiner order and Updated; Source
  became Order. Text properties renamed to match (`Metal`, `Position`, `Content`,
  `Updated`); the `Show source` boolean was deleted and the Order cell is always on.
- **`Lots Card / Mobile` 27:12893** (`Position` x5), cloned from `Lot Card / Mobile`
  1:3551; line 3 re-cut from `Form · post melt / fine oz / $value` to
  `Metal · Form / Content / Updated`.

Changes against the pasted proposal frame:
- Header chips are three now — `Lots` (active) · `On hand` · `Pool` — `Show chip 3` on.
- Description `23 lots · 9 on hand · 4 incoming · 5 at refiner · 3 pooled · 2 sold`;
  count line `23 lots · all positions · 162.1 oz fine on hand`; breadcrumb
  `Admin › Inventory › Lots`; page action off.
- Toolbar: Metal (`All metals`) and Sort by (`Newest first`) only; `Assigned to`
  switched off; Reset kept.
- The four metal cards were **removed** from Lots; they belong to On hand.
- Position chips keep all seven with counts; Form stays as `All · Scrap · Bullion`
  Radio Chips beside them, per the coordinator.
- Card title `Gold` -> `Lots`, count badge `23 lots`; **the `Batch` and `Combine` icon
  buttons were removed from the title row** - both act on a selection and the
  Selection Bar owns them, so a title-row button with nothing selected has no meaning.
- Every Position **badge** in the table body became plain text (8 per frame).
- Pagination was showing page 2 of 8; it now reads page 1 of 3, which is what 23 lots
  at 8 a page actually is.
- Mobile: the hand-built Page header, Breadcrumb and Search were replaced by the
  library `Admin Header / Mobile`; its tab row had shipped with `Orders` active and
  was set to `Inventory`; a seventh position chip `Consumed 0` was added.

**Sample-data changes** (coordinator answer 6): the eighth row is now
`Lot 2470-D · Silver Bar 10 oz · Silver · Bullion · 30.000 oz`, where the proposal had
a gold scrap lot, so the flat table shows more than one metal. Every other row keeps
its identity, content and order from the proposal frame.

**Section 3 reconciliation**
- Description: 9 on hand + 4 incoming + 5 at refiner + 3 pooled + 2 sold + 0 consumed
  = **23**, which is the stated lot total, the chip total, the card badge and the
  foot's denominator.
- Position chips carry the same six counts and the same 23.
- Count line's 162.1 oz is the On hand page total, which 2.2 will show as
  Gold 10.02 + Silver 150.07 + Platinum 2.01 + Palladium 0.00 = **162.10**.
- 3 selected: 2.505 + 1.430 + 2.262 = **6.197 oz**; at the file's standing gold spot
  $2,411.20 that is $14,942.19, shown as `$14,942 est.`. The basis is the one the
  `Worth` card already uses - est. value = content x spot (2.505 x 2,411.20 = $6,040.06,
  and the card reads $6,040.10).
- Mixed: 2.505 + 1.239 + 1.063 = **4.807 oz**; x $2,411.20 = $11,590.64, shown as
  `$11,591 est.`; the bar carries the note instead of the batch action because the
  three lots are On hand, Incoming and Pooled.
- Empty: 0 lots, every chip 0, badge 0, count line 0.00 oz. Consistent.

Still outstanding on this screen: the tab row shows five tabs including `Pool` until
the library drops it (pinned, awaiting Jacob's Q3), and the mobile frame wears a
signed-out site header because the library has no mobile signed-in variant (pinned).

**Four standing checks after 2.1** (adopted from the Pricing worker, counts only):
- Collapsed text overrides (two distinct main TEXT nodes resolving to one instance
  node — the `.clone()` trap): **0**, over every top-level instance in the five frames.
- Stacked variants in the sets touched (`Totals` 17:10601, `Lots Row` 20:10607,
  `Lots Card / Mobile` 27:12893): **0** overlapping pairs.
- Clipped text on the five frames: **0** of 506 visible TEXT nodes (ink bounds past
  the layout box, or `textTruncation = ENDING`).
- Children outside their section bounds, whole file, all 10 sections: **0**. The
  `Parked` section's tightest margin was 4px, so it was re-wrapped to a 60px margin.

The parked-note text is wider than the frames it describes, so it is now the tightest
child in that section at 60px — still contained.

### 2026-10-09 — 2.1 tweaks and the swap
1. **Content and Position read as one value.** `Position` is now a 144px frame with a
   24px left inset holding the text, and the 24px came out of `Lot` (362 -> 338), so
   the row still totals 1376. Applied to both `Lots Row` variants and to the head row
   on all four desktop frames.
2. **Dash rule.** `Refiner order` is blank where one could still arrive (Incoming,
   On hand, At refiner pending) and carries an em dash only where one never will
   (Sold, Consumed). Across the three populated desktop frames: 15 cells blanked,
   3 dashed, 6 left as links (RS-1184, RS-1179). On mobile the refiner order is part
   of line 2, so blank means omitted and the Sold card now reads
   `Lot 2492-E · PO-2492 · —`.

**Swap.** `Admin / Lots — Gold, unassigned` 1:2747 and his note 1:2778 moved into
`Parked · superseded 2026-10-09` 17:12924 at (-34570, 10220) with a one-line note
saying what replaced it and that his "flat table, not grouped by order" note is
answered by the new table. Nothing deleted. The new section was renamed
**`Inventory · Lots`** 28:12468 and moved to (-24009, 8700), where his screen stood;
223px of clearance to `Draft · for review · 2026-09-11`, and no section on the page
overlaps another.

Checks after the tweaks and swap: collapsed text overrides **0**, stacked variants
**0**, clipped text **0** of 491 visible TEXT nodes (down from 506 because 15 dashes
are now hidden), children outside their section **0**, section overlaps on the Lots
page **0**.

### 2026-10-09 — 2.2 Inventory › On hand built (step 4)

Page `On Hand (?)` 1:2489 was empty; it now carries two sections.

**`Components · On hand` 34:13721** at (0, 0):
- **`On Hand Metal Card` 34:13638** (`Metal = Gold | Silver | Platinum | Palladium`),
  cloned from Jacob's `Inventory (proposal)` 1:4571. The four `Selected=true` variants
  were dropped (clicking a card opens the metal detail, so there is no selected state)
  and `Metal=All` was renamed `Metal=Palladium`, per Q4. The headline moved from the
  lot count to the fine ounces, and a fourth line `Value#34:0` was added for the bid
  value. Reads: Label · `On hand` · **oz fine** · lots and scrap/bullion split ·
  value at bid.
- **`Movement Row` 34:13711**, cloned from `Pool Ledger Row` 1:749 (a per-page copy,
  per the house rule). Columns Date 120 · Movement 140 · Lot 130 · Order 140 ·
  Metal 90 · ± oz fine 120 (right) · Running on hand 150 (right) · By fill = 1376.
- **`Movement Card / Mobile` 37:12899**, from the mobile lot card chrome with the
  checkbox and photo removed: Movement + ± oz fine, then `Lot · Order`, then
  date · by · running total.

**`Inventory · On hand` 39:12757** at (0, 948), three labelled frames:

| state | frame |
|---|---|
| default | `Admin / Inventory — On hand` **35:12140** |
| empty | `Admin / Inventory — On hand, empty` **37:12452** |
| mobile | `Admin / Inventory — On hand (Mobile)` **37:12914** |

Per the coordinator: `Show toolbar = false`, the search stays in the header, the metal
cards are the metal switch, and the Movements card carries its own `Metal` and
`Date range` Selects in its title row. The position and form chip rows were removed —
they belong to Lots.

**Section 3 reconciliation**
- Metal cards: 10.02 + 150.07 + 2.01 + 0.00 = **162.10 oz**, which is the header's
  `162.1 oz fine on hand`, and the same figure the Lots count line quotes.
- Lot counts: 4 + 4 + 1 + 0 = **9 lots**, matching the header and the Lots
  description's `9 on hand`.
- Each card's scrap/bullion split sums to its own lot count (4+0, 1+3, 1+0, 0+0) and
  to 6 scrap + 3 bullion = 9 overall.
- Movements, filtered to Gold, run bottom to top: 6.249 −1.063 → 5.186, ±0.000 →
  5.186, −0.778 → 4.408, +2.262 → 6.670, −0.585 → 6.085, +2.505 → 8.590, +1.430 →
  **10.020 oz**, which is exactly the Gold card. The identity holds on every row.
- Value at bid is a pricing read, never screen arithmetic: 10.02 x $2,411.20 =
  $24,160; 150.07 x $27.88 = $4,184; 2.01 x $978.00 = $1,966; Palladium $0. The gold
  spot is the file's standing $2,411.20 (the one the `Worth` cards and the Lots
  selection bar use); silver and platinum are the rates already implied by the Pool
  screen. No total is shown, so nothing cross-checks it.
- Empty: 0 lots, 0.00 oz and $0 on every card, and the Movements card is an Empty State.

**Sample-data note.** Silver on hand is **150.07 oz**, not the proposal's 150.1, so the
four cards total exactly the 162.1 the ruling quotes.

**One judgement call to flag.** A `Settled, pooled` movement is drawn with a **0.000 oz**
delta, because a lot leaves on-hand when it is *batched*, not when the refiner order
settles. The settlement row is in the ledger because the ruling names it as a movement
value, but it moves no ounces. The full value list the component supports is Arrived ·
Batched · Settled, paid · Settled, pooled · Sold · Split · Combined; the sample shows
Arrived, Batched, Sold and Settled, pooled.

**Four standing checks after 2.2**: collapsed text overrides **0**, stacked variants
**0** (`On Hand Metal Card`), clipped text **0** of 250 visible TEXT nodes, children
outside their section **0** file-wide, section overlaps on the On Hand page **0**.

### 2026-10-09 — 2.2 follow-up and 2.3 Inventory › Pool (step 5)

**Settlement rows removed from Movements**, per the coordinator: on-hand ounces move on
arrival, batch, sale, split and combine; a settlement belongs to the Pool ledger. One
row went from the desktop card (now 7) and one from mobile (now 5); counts read
`7 of 21 movements` and `5 of 21 movements`. The running chain was re-verified off the
canvas after the deletion: 6.249 −1.063 → 5.186 −0.778 → 4.408 +2.262 → 6.670
−0.585 → 6.085 +2.505 → 8.590 +1.430 → **10.020 oz**, still exactly the Gold card.

**`Components · Pool` 17:12923** gained two components:
- **`Pool Refiner Card` 41:13638**, cloned from 1:769. `Est. value` is gone; `Basis`
  and `Unrealised gain` are in. Columns Metal 364 · Balance 180 · Locked 160 ·
  Available 180 · Basis 180 · Unrealised gain 220 = 1344. The four `* value`
  properties were renamed `* gain` and four `* basis` properties added, so all 20
  figures are typed properties. The Total row carries oz totals and the gain total;
  its basis is an em dash, because a weighted average across three metals is not a
  number.
- **`Pool Ledger Row` 41:13676**, a per-page copy of 1:749 re-cut to Date 110 ·
  Entry 90 · Refiner 110 · Metal 90 · Oz 110 (right) · Spot/lock 120 (right) ·
  Purpose 180 · Order 130 · By fill = 1376. `Entry` stays plain text, never a badge.

**`Inventory · Pool` 47:15003** at (7000, 368), three labelled frames:

| state | frame |
|---|---|
| default | `Admin / Inventory — Pool` **42:13648** |
| empty | `Admin / Inventory — Pool, empty` **47:14667** |
| mobile | `Admin / Inventory — Pool (Mobile)` **47:14026** |

Changes against the pasted Pool screen:
- Title `Pool` -> `Inventory`; the metal chips became the three page chips with Pool
  active; description is the ruling's `193.0 oz pooled across 2 refiners`; breadcrumb
  `Admin › Inventory › Pool`.
- **`Record entry` removed** (`Show action` false) — a ledger row comes from a
  settlement or a lock, never from a typed form.
- `Show toolbar = false`, matching On hand. The Ledger card carries its own
  `Refiner` · `Metal` · `Entry` Selects in its title row, so the header filter row
  would have been a second, redundant one. **Flagging this**: the ruling does not
  say either way.
- The refiner cards lost `Est. value` and gained `Basis` and `Unrealised gain`.
- A **Ledger** card was added below both refiner cards, all refiners, with every
  entry shown and `13 of 13 entries` in the foot (pagination hidden).
- The active tab was `Pool` on the pasted screen and is now `Inventory`, on both
  desktop and mobile.

**Refiner-order references** were `RO-1184` style on the pasted screen; they are now
`RS-` (refiner sale — we sell the scrap to the refiner) to match the Lots table and
ruling 125's numbering. Recorded as a sample-data change, not a design one.

**Credits − locks = available, read back off the canvas after drawing**

| refiner · metal | credits | locks | = | card available |
|---|---|---|---|---|
| Elemetal · Gold | 98.000 | 8.000 | 90.000 | 90.0 oz |
| Elemetal · Silver | 10.400 | 0.000 | 10.400 | 10.4 oz |
| Elemetal · Platinum | 4.000 | 0.000 | 4.000 | 4.0 oz |
| Metalor · Gold | 69.000 | 4.000 | 65.000 | 65.0 oz |
| Metalor · Silver | 8.600 | 0.000 | 8.600 | 8.6 oz |
| Metalor · Platinum | 3.000 | 0.000 | 3.000 | 3.0 oz |

Balances: Elemetal 98.0 + 10.4 + 4.0 = **112.4 oz**, locked 8.0, available 104.4;
Metalor 69.0 + 8.6 + 3.0 = **80.6 oz**, locked 4.0, available 76.6; both totals are on
the cards. Across both refiners 112.4 + 80.6 = **193.0 oz**, which is the header.
Locked 8.0 + 4.0 = 12.0 and available 104.4 + 76.6 = 181.0.

**Basis and gains, derived** (coordinator answer 12). Basis is the weighted average
credit spot:
- Elemetal gold: (18.220x2,380.00 + 12.480x2,411.20 + 34.600x2,344.00 +
  32.700x2,302.00) / 98.000 = 229,833.18 / 98.000 = **$2,345.24**.
  Unrealised = available x (live − basis) = 90.0 x (2,411.20 − 2,345.24) = **+$5,936**.
- Elemetal silver basis $27.10, 10.4 x (27.88 − 27.10) = **+$8**;
  platinum basis $952.00, 4.0 x (978.00 − 952.00) = **+$104**. Card total **+$6,049**.
- Metalor gold: (41.500x2,318.00 + 27.500x2,392.00) / 69.000 = 161,977.00 / 69.000 =
  **$2,347.49**; 65.0 x (2,411.20 − 2,347.49) = **+$4,141**.
- Metalor silver basis $26.80, 8.6 x 1.08 = **+$9**; platinum basis $965.00,
  3.0 x 13.00 = **+$39**. Card total **+$4,189**.
- Realised gain is not on the list screen (the ruling puts it on the refiner detail,
  2.5). For the record: Elemetal 4.000x(2,398.60−2,335.61) + 4.000x(2,411.20−2,345.24)
  = $251.96 + $263.84 = **$515.80**; Metalor 4.000x(2,405.00−2,347.49) = **$230.04**.

**Four standing checks after 2.3**: collapsed text overrides **0**, stacked variants
**0** (both new Pool components are plain components, no variant sets touched),
clipped text **0** of 414 visible TEXT nodes, children outside their section **0**
file-wide, section overlaps on the Pool page **0**.

### 2026-10-09 — count-badge tweak, 2.4 and 2.5 (steps 6-7)

**Count badges.** `Ledger` and `Movements` lost the accordion `Amount` slot; the count
is now a `Badge` named `Count` as the first child of the title row's `Right` block, so
it sits beside the title with the selects still right of it: `13 entries` on the Pool
ledger, `21 movements` on On hand. The two cards now match the Lots card. Mobile keeps
the accordion `Amount` slot, because a mobile title row has no room for a badge and a
control.

**2.4 Inventory › On hand › Gold** — `Admin / Inventory — On hand › Gold`
**49:14849** and `… (Mobile)` **52:12938**, in `Inventory · On hand` 39:12757.
Site Header + Breadcrumb + the published **`Entity Header`** (eyebrow `ON HAND`, no
badge, title `Gold`, reference `10.02 oz fine · 4 lots`, meta
`$24,160 at bid · updated 2m ago`, no assigned-to, no buttons). Four accordions in the
ruling's order: Composition, In motion, Movements, Pool.

**2.5 Inventory › Pool › Elemetal** — `Admin / Inventory — Pool › Elemetal`
**54:14240**, `… Lock ounces open` **56:14460**, `… (Mobile)` **57:14712**,
`… Lock ounces open (Mobile)` **57:15463**, in `Inventory · Pool` 47:15003.
Entity Header carries eyebrow `POOL`, title `Elemetal`, reference
`112.4 oz across 3 metals`, meta `last credit Sep 3 · last lock Sep 3` and one
**primary** `Lock ounces` button. Accordions: Balances, Ledger, Open locks.

New local component: **`Lock Row` 53:14271** in `Components · Pool`, `State = Open |
Confirming | Settled`, columns Date · Metal · Oz · Lock price · Sale order · State ·
Gain · By. **This is my reading, not a copy** — the Pricing file's own Lock Row was
not available to me, so the shape is built from the library and the ruling's wording.
A library promotion request names both files. Also **`Detail Row / Mobile` 52:15230**
in `Components · On hand`, a generic three-line block the mobile Composition, In
motion and Pool cards all use.

**Two fixes applied while building:**
- The `Lock ounces` purpose chips were drawing **radio icons**, against the standing
  rule. `Show radio` is off on all four chips at source (1:807), which corrects the
  two lot-screen dialogs as well as both new ones.
- The `Lock ounces` button was the library's default Secondary; it is the only action
  on the screen, so it is Primary.

**Section 3 reconciliation**

*2.4 Composition equals the header:* 2.505 + 1.430 + 2.262 + 3.823 = **10.020 oz**
across **4 lots**, which is the Composition footer, the card badge, the Entity Header
reference `10.02 oz fine · 4 lots` and the Gold metal card on 2.2.
*In motion:* 1.239 + 0.842 + 0.585 + 1.104 = **3.770 oz** over 4 lots, 2 Incoming and
2 At refiner, within the Lots page's 4 incoming and 5 at refiner across all metals.
*Movements:* the same 7 gold rows as 2.2, running total ending at **10.020 oz**.
*Pool:* Elemetal 98.0 + Metalor 69.0 = **167.0 oz** gold balance, locked 8.0 + 4.0 =
**12.0**, available 90.0 + 65.0 = **155.0**, and those two refiner rows are exactly
the gold rows of the two cards on 2.3.

*2.5 Balances equal the card:* Gold 98.0 / 8.0 / 90.0, Silver 10.4 / 0.0 / 10.4,
Platinum 4.0 / 0.0 / 4.0, Total **112.4 / 8.0 / 104.4** — identical to Elemetal's card
on 2.3 and to the Entity Header's `112.4 oz across 3 metals`.
*Ledger:* 8 of 8 entries, this refiner only. Credits 12.480 + 18.220 + 34.600 +
32.700 = 98.000 gold, less locks 4.000 + 4.000 = 8.000, gives **90.000** available —
the Balances row. Silver 10.400 and platinum 4.000 have no locks and match theirs.
*Open locks:* 4.000 + 4.000 = **8.000 oz**, exactly the Balances `Locked` total, and
the card badge says so. Gains +$264 and +$252 sum to $516, the `Realised gain` total.

**Four standing checks after 2.4 and 2.5**
- Collapsed text overrides, by **sentinel probe**: 13 local components (every variant),
  **220 text slots** written with a unique value and read back off-canvas, probes
  deleted in the same run — **0** slots failed to hold their own value.
- Stacked variants across every set touched this session: **0**.
- Clipped text on the six new frames: **0** of 892 visible TEXT nodes.
- Children outside their section: **0** file-wide. Section overlaps: one was found —
  `Components · Pool` had grown into `Draft · for review · 2026-09-11` — and was fixed
  by moving it to y -2520; **0** overlaps now, on all three pages.

**Known gaps still showing on these screens**: the `Breadcrumb` tops out at three
crumbs, so both detail screens read `Inventory › Pool › Elemetal` rather than leading
with `Admin` (library request pinned 1959479555); the mobile frames wear a signed-out
site header (pinned 1959453942); and the modal scrim is still a background-coloured
rectangle at 70%, because there is no `overlay/*` token — the same gap recorded in
`inventory-pool-screens.md` section 5.3.

### 2026-10-09 — Lock Row corrected, hand-off comment, standing loop

**Lock Row fixed to the real model** (coordinator): a pool lock is **Open** or
**Finalized** only — Finalized once the sale it sources completes. `Confirming` was
never a state; it is the Unlock button's in-place confirm escalation. `Lock Row`
53:14271 is now `State = Open | Finalized` x `Action = Rest | Confirming`, with the
Action axis only on Open (three variants: Open/Rest, Open/Confirming,
Finalized/Rest). A new `Action` cell holds the button: **Secondary `Unlock`** at rest,
**Primary + Danger `Confirm`** on the escalation, and the status text is unchanged at
`Open` in both. The Finalized variant hides the button — a finalized lock cannot be
unlocked. Applied on desktop (an `Action` column was added to the Open locks head) and
on mobile, where the button joins line 3 right of the By text.

The Open locks card now shows both rows as `Open`, one at rest and one escalated, so
the pattern is visible; a Finalized lock leaves the card, so that variant is drawn on
the component only. The card still reads `8.000 oz locked`, matching the Balances
`Locked` total, and the two gains +$264 and +$252 still sum to the $516 realised gain.

**Comment for Jacob**: `1959487605`, pinned on the new Lots default frame. Plain
English — the five screens and where each lives, what moved or was parked, the three
library items waiting on a publish, and the four section 4 questions with the defaults
I built. Links in sentences, one per sentence, every id read back out of Figma first.

**Full detector pass over all 17 built frames**: clipped text **0** of 2,045 visible
TEXT nodes; children outside their section **0**; section overlaps **0**; orphans
remaining **1** (`Filter Bar (proposal A)`, 3 instances, all inside the parked
section).

**Standing watch started**: polls the file's comments every 60 seconds and, as the
gate for folding `Lot Header` onto the library `Entity Header`, watches the published
Entity Header's `updated_at` over REST. Baseline **2026-10-08T01:25:05.577Z**. When it
moves: re-import by key, snapshot all 24 Lot Header instances (desktop and mobile) to
disk, migrate one set at a time with a pixel diff, report counts.

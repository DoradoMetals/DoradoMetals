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

### 2026-10-09 — quiet cycle 1 (55 minutes)
No comments on the file; published `Entity Header` still 2026-10-08T01:25:05.577Z, so
the Lot Header fold stays parked.

Detectors over all 17 built frames: clipped text **0** of 2,045 visible TEXT nodes,
children outside their section **0**, section overlaps **0**, orphans **1**
(`Filter Bar (proposal A)`, 3 instances, all parked).

Render review found one thing and it is fixed: the **mobile** Elemetal ledger and
lock-open screens were still prefixing every entry with `Elemetal · `, which is
redundant on the refiner's own page — the desktop ledger already hides its Refiner
column there. 16 lines across the two frames now read `Gold · 12.480 oz · $2,411.20`
and so on. Both frames re-rendered.

Noted, not changed: the count badge sits at the left edge of the title row's right
block, so with selects beside it it reads nearer the middle than the title. That is
the only arrangement that satisfies both halves of the instruction (badge in the right
block as on the Lots card, selects right-aligned) without making the accordion hug.

### 2026-10-09 — Entity Header published; Lot Header fold proved, not yet migrated

The watch fired on the gate: published `Entity Header` moved
**2026-10-08T01:25:05.577Z -> 2026-10-09T03:25:34.339Z**. Re-imported by key and it
now carries all 18 properties, including the three slots the fold needs —
`Identity#893:0`, `Reference#899:0`, `Actions#899:6` — plus `Show title` and
`Show buttons`. Comments polled first: none from Jacob, only my own two.

**Snapshot taken before anything was touched**:
`scratchpad/inventory/lot-header-snapshot-2026-10-09.json`. All **24** instances
(12 desktop off `Lot Header` 1:3612, 12 mobile off `Lot Header / Mobile` 1:3746) with
their variant, host frame, parent, index, sizing, every text and every action state.
**Zero empty reads**, so nothing was aborted.

**Two slot components built** in `Components · Lots`, cut straight from the Lot
Header's own frames so the content is his: **`Lot Reference` 70:12208** (the composed
line `Lot 2481-A · PO-2481 · Marguerite Whitfield` with the inline Link) and
**`Lot Actions` 70:12217** (the five icon buttons).

**One proof migration, built beside and nothing live touched**, in a new section
`Proof · Entity Header fold 2026-10-09` **72:12485**: today's screen on the left,
the same screen with the header folded onto Entity Header on the right
(`PROOF · Lot 2481-A — On hand (Entity Header fold)` 70:12228).

Measured delta, header against header:

| | Lot Header today | folded Entity Header |
|---|---|---|
| size | 1376 x 125 | 1376 x **127** |
| padding | 16 all round | 16 all round |
| fill / stroke / radius | 1 / 1 / 8 | 1 / 1 / 8 |
| eyebrow row | 16,16 | 17,17 |
| badge | 93,16 | 94,17 |
| title | 16,46 (hugs, 171 wide) | 17,47 (fills, 1134 wide) |
| actions | 1152,16 208x40 | 1151,17 208x40 |

Pixel diff: the **body below the header is pixel-identical** — 2 differing pixels in a
2880x1200 region once the 2px offset is removed. The change is confined to the header
and amounts to **+2px of height and a 1px content inset**; the eyebrow, badge, title,
reference line with its inline Link, and all five icon buttons land where they do
today. The reference slot renders the composed line exactly.

**Held for a ruling.** 24 instances across 13 lot screens all move 2px, and the ruling
for 2.6 says the lot screen needs no layout change. The remaining 23 are not migrated
until the coordinator says the 2px is accepted.

### 2026-10-09 — Lot Header fold completed (24/24), two library items applied

**Desktop set, 12 instances.** Each Lot Header replaced in place by the published
`Entity Header` (Layout=Desktop) with `Show reference slot` + `Reference` = local
`Lot Reference` 70:12208, `Show actions slot` + `Actions` = local `Lot Actions`
70:12217, plain reference and buttons off, meta and assigned-to off. Eyebrow, title
and the position badge (label, intent, variant) set per instance; `Split` and
`Batch into` kept Disabled on Pooled / Sold / Consumed, `Delete` Disabled on the
refiner lot; the refiner lot's reference line overridden to
`Lot 2493-A · SO-2493 · Elemetal · Dallas`.
Header 125 -> **127** on all twelve. Pixel diff below the header, at a 2px offset:
**12/12 clean, 3 differing pixels in total** across all twelve screens.

The five dialog screens needed one extra move: their dialogs are absolutely
positioned, so they did not follow the 2px shift and the diff flagged the dialog
band (x 480-960, exactly the centred dialog's width). Each dialog was nudged
y 220 -> 222, after which those five came back clean.

**Mobile set, 12 instances.** Same recipe on Layout=Mobile. Header 206 -> **200**,
so these screens get 6px *shorter* — the Entity Header's mobile rhythm is tighter
than Jacob's was. Content is unchanged: eyebrow, badge, title, the reference line
with its inline Link and all five icon buttons read as before. The five mobile
dialogs were nudged y 120 -> 114. Pixel diff below the header at a -6px offset:
**11/12 at zero, one at 3px, 5 differing pixels in total**.

Counts after: **0** Lot Header instances left in use (the one remaining is the
deliberate `BEFORE ·` reference copy inside the parked section), **31** Entity Header
instances file-wide (24 folded + 2 on the metal detail + 4 on the refiner detail +
1 proof), 25 `Lot Reference` and 25 `Lot Actions` instances. The local `Lot Header`
and `Lot Header / Mobile` sets are now unused; they stay in
`Draft · Inventory · 2026-09-11` — not deleted, that is Jacob's call.

**Proof parked**, not deleted: the before/after pair and its note moved into
`Parked · superseded 2026-10-09` 17:12924, which is now 10190 wide with 15 children.

**Two published library items applied** (snapshot first:
`scratchpad/inventory/library-apply-snapshot-2026-10-09.json`, 54 breadcrumbs and 22
mobile headers read, zero empty reads):
- **Fourth breadcrumb.** `Show crumb 3#923:0` shipped default false, so nothing
  existing moved. Turned on for the four detail screens and their lock-open twins —
  6 instances now read `Admin › Inventory › On hand › Gold` and
  `Admin › Inventory › Pool › Elemetal`. The 24 lot screens keep three crumbs,
  which is right: a lot has no fourth level.
- **Mobile signed-in Header.** `Layout=Mobile, Signed In=True` now exists, so **18**
  mobile screens were switched to it — the 12 mobile lot screens and my six mobile
  screens. They show the avatar beside the menu instead of a signed-out marketing bar.
  Jacob's own superseded Pool mobile drafts and the parked mobile frame were left
  alone.

**Poll filter corrected**, per the near miss on the library: the watch now wakes on
any thread whose newest message is from a person, resolved or not, instead of
treating a resolved thread as handled.

**Q3 confirmed by Jacob**: four tabs, Orders · Inventory · People · Pricing. The Pool
tab leaves the Admin Header on his next publish, after which the Pool chip is the
only way in — which is what these screens already draw.

**Detectors after everything**, 41 frames: clipped text **0** of 3,848 visible TEXT
nodes, children outside their section **0**, section overlaps **0**, orphans **1**
(`Filter Bar (proposal A)`, 3 instances, all parked).

### 2026-10-09 — Jacob: "I'm confused on what's new and what's old"

| comment | pin | words | action |
|---|---|---|---|
| `1959549754` | page `Lots` 0:1 @ -18559,4008 | "Ok we have a lot of screens here and I'm confused on what's new and what's old. Can we organize better please?" | replied `1959552726` |
| `1959550253` | page `Pool` 1:2488 @ 7153,8771 | "Same thing here… Remove all the extra screens or ones that we no longer need etc" | replied `1959552733` |

Both pins hit-tested: each lands on **empty canvas** near my new work, not on a node,
so the words govern and they are page-level complaints about organisation.

**Every section on all three pages renamed to a band prefix and restacked top to
bottom at x 0**, so each page reads in one pass:

*Lots*: READ ME (-516) · CURRENT · Inventory › Lots (0) · CURRENT · Lot screens (2200)
· COMPONENTS · Lots (13400) · COMPONENTS · Lot screens (15400) ·
PARKED · superseded 2026-10-09 (22400) · PARKED · source proposal (25000) ·
PARKED · Jacob's old lots components (28600).

*Pool*: READ ME (-475) · CURRENT · Inventory › Pool (0) · COMPONENTS · Pool (6800) ·
PARKED · old Pool screens (9500) · PARKED · old Pool components (14800). His loose
`Pool · note` frame, which still read "Not designed yet", moved into the parked band.

*On hand*: READ ME (-475) · CURRENT · Inventory › On hand (0) ·
COMPONENTS · On hand (5100). Nothing parked — the page is entirely new.

A **READ ME** section now sits above each page, in plain English, saying what each
band is and that nothing in a PARKED band is live or needs his attention.

Nothing was parked while still in use: every local component was instance-counted
first. `Draft · Inventory · 2026-09-11` turned out to be a components section whose
pieces are still on all 24 live lot screens, so it was **renamed, not parked**.
The Pool components that moved are used only by the Pool drafts that moved with them.

**Nothing deleted.** He asked to "remove all the extra screens"; deleting is the one
irreversible act, so both replies park them, explain where they went, and ask him to
reply "delete the parked bands" if he wants them gone for real. Three pages, zero
section overlaps, zero stray top-level nodes.

### 2026-10-09 — Jacob escalated: "delete everything but the base screen"

Four new comments, all polled before any action and all hit-tested.

| comment | pin | words | hit-test |
|---|---|---|---|
| `1959556448` | reply on the Lots thread | "Honestly it's too much to ingest at once. Please build the components in their own frame, and a single screen. We can build out the additional screens later on when we get the base done." | thread reply, no pin |
| `1959556499` | reply on the Lots thread | "Remove anything that's not the base screen." | thread reply, no pin |
| `1959557087` | reply on the Pool thread | "No, delete everything but the base screen. It's impossible to go through all of this, it's too much. We can keep components in a separate frame, but just one screen for now. We can add more screens once we're headed towards finalization." | thread reply, no pin |
| `1959575948` | node `1:15315` @182,194 | "THis won't ever be there. Elemetal would be on it's own entity page." | lands on the **Admin Header title row** `I1:15318;730:82` of his **old, already-parked** `Admin / Pool — Elemetal` 1:15315, inside `PARKED · old Pool screens` 1:15303. A ruling, and it agrees with what was built: the refiner detail is its own entity screen. |
| `1959576478` | page `Pool` 1:2488 @8414,5810 | "This whole thing needs to be rethought tbh. It's just too much information thrown at you. Break it up. High level, then individual breakdowns can happen on the metal/refiner entity pages" | **empty canvas**, right of `CURRENT · Inventory › Pool` at its vertical middle, so the words govern: it is a ruling on the new Pool screen. Reported to main, not acted on. |

He answered my parking proposal with "**No,**". So the five PARKED sections go, and so does
every screen that is not the one base screen on its page. The three COMPONENTS bands and
`COMPONENTS · Lot screens` stay, because he said "we can keep components in a separate frame".

**Version checkpoints are not available through the API** (`POST /v1/files/:key/versions`
is not a route), so this enumeration is the durable record. Everything below is also
rendered to PNG in `scratchpad/inventory/parked-archive/` (9 files), and all of it is in
Figma's own version history for 2026-10-09.

#### Deletion set — 6 sections, 13,896 nodes, 33 component mains

**`CURRENT · Lot screens` 1:2779** (Lots, @0,2200, 11520x10865, 48 children) — Jacob's own
single-lot screens from 2026-09-11, whose headers were folded onto the library Entity
Header earlier today. 24 frames + 24 labels:
`1:2780` Incoming 1440x967 · `1:2792` On hand 1440x967 · `1:2804` At refiner 1440x1094 ·
`1:2817` Pooled 1440x1128 · `1:2830` Sold 1440x967 · `1:2842` Consumed 1440x967 ·
`1:2854` Incoming (Mobile) 390x1477 · `1:2863` On hand (Mobile) 390x1605 ·
`1:2872` At refiner (Mobile) 390x2110 · `1:2882` Pooled (Mobile) 390x2210 ·
`1:2892` Sold (Mobile) 390x1671 · `1:2901` Consumed (Mobile) 390x1737 ·
`1:3086` Split lot open · `1:3100` Combine lots open · `1:3114` Assign to sale open ·
`1:3128` Batch into open · `1:3142` Lock ounces open (all 1440x967, Lock 1440x1094) ·
`1:3157` `1:3168` `1:3179` `1:3190` the four mobile dialogs 390x1605 ·
`1:3201` Lock ounces open (Mobile) 390x2210 · `1:3239` Lot 2493-A Refiner lot 1440x811 ·
`1:3250` Refiner lot (Mobile) 390x1120. Labels `1:3213`-`1:3224`, `1:3229`-`1:3238`,
`1:3258`, `1:3259`.

**`PARKED · superseded 2026-10-09` 17:12924** (Lots, @0,22400, 10190x2176, 15 children) —
`1:2910` Inventory 3 lots selected 1440x1616 · `1:2963` mixed selection 1440x1592 ·
`1:3016` empty 1440x982 · `1:3048` Inventory (Mobile) 390x1836 ·
`1:2747` Jacob's `Admin / Lots — Gold, unassigned` 1440x1152 with his note `1:2778` ·
`72:12472` BEFORE Lot 2481-A On hand (today, Lot Header) 1440x965 ·
`70:12228` PROOF Lot 2481-A On hand (Entity Header fold) 1440x967 ·
notes `17:12925`, `33:12140`, `72:12484`; labels `1:3225`-`1:3228`.
These four Inventory drafts were the last three instances of the orphaned
`Filter Bar (proposal A)` **1:2642**, so that orphan goes with them — the file now has none.

**`PARKED · source proposal` 1:4570** (Lots, @0,25000, 4720x3171, 4 children) —
`1:4571` COMPONENT_SET `Inventory (proposal)` 1240x348 · `1:4644` FRAME
`Admin / Inventory — proposal` 1440x1494 · `1:4696` TEXT caption ·
`1:4697` COMPONENT_SET `Lot Row (proposal)` 1424x388.

**`PARKED · Jacob's old lots components (unused)` 1:4455** (Lots, @0,28600, 4076x492,
4 children) — `1:4456` SET `Lot Tile` 360x136 · `1:4467` COMPONENT `More Tile` 78x36 ·
`1:4469` SET `Lot Row` 1424x252 · `1:4521` SET `Unassigned Card` 1140x10.

**`PARKED · old Pool screens` 1:15303** (Pool, @-750,9280, 6560x4931, 9 children) —
`1:15304` Admin / Pool 1440x956 · `1:15310` Pool empty 1440x606 ·
`1:15315` Pool — Elemetal 1440x1130 (the node `1959575948` is pinned on) ·
`1:15355` Elemetal empty 1440x828 · `1:15379` Pool (Mobile) 390x1465 ·
`1:15521` Elemetal (Mobile) 390x1611 · `1:15606` Elemetal Lock ounces open 1440x1130 ·
`1:15648` Elemetal Lock ounces open (Mobile) 390x1611 · `1:15300` `Pool · note` 720x111.

**`PARKED · old Pool components` 1:15735** (Pool, @-750,14580, 2264x1522, 3 children) —
`1:705` SET `Pool Metal Card` 960x146 · `1:748` SET `Pool Ledger Row` 1416x172 ·
`1:769` COMPONENT `Pool Refiner Card` 1376x263.

#### Deletion set — the 14 non-base screens inside the three CURRENT bands

`CURRENT · Inventory › Lots` 28:12468 keeps `22:10623` `Admin / Inventory — Lots` and its
label `28:12463`; deleted `27:11402` 3 selected · `27:11884` mixed selection ·
`27:12411` empty · `28:11883` (Mobile), labels `28:12464`-`28:12467`.

`CURRENT · Inventory › Pool` 47:15003 keeps `42:13648` `Admin / Inventory — Pool` and
`47:15000`; deleted `47:14667` empty · `47:14026` (Mobile) · `54:14240` Pool › Elemetal ·
`56:14460` Elemetal Lock ounces open · `57:14712` Elemetal (Mobile) ·
`57:15463` Elemetal Lock ounces open (Mobile), labels `47:15001`, `47:15002`,
`57:16547`-`57:16550`.

`CURRENT · Inventory › On hand` 39:12757 keeps `35:12140` `Admin / Inventory — On hand`
and `39:12754`; deleted `37:12452` empty · `37:12914` (Mobile) · `49:14849` On hand › Gold ·
`52:12938` On hand › Gold (Mobile), labels `39:12755`, `39:12756`, `57:16545`, `57:16546`.

#### Containment re-check before deleting — both directions, 0 findings

- **33 component mains** live inside the deletion set. Every one was asked for its
  instances with `getInstancesAsync()` (walking `COMPONENT_SET` children, since a set has
  no such method): **0** have an instance outside the deletion set. Nothing in a CURRENT
  or COMPONENTS band is instanced from a doomed main.
- From the other direction, the three surviving base screens were walked for every
  `INSTANCE` and each main resolved: **28 distinct mains**, **0** of them doomed. 21 are
  library components (`Accordion`, `Badge`, `Button`, `Chip`, `Select`, `Admin Header`,
  `Breadcrumb`, `Header`, `Pagination`, `Radio Chip`, `Tab`, `Thumbnail` …) and 5 are my
  local ones that stay in the COMPONENTS bands — `Lots Row` 20:10607,
  `On Hand Metal Card` 34:13638, `Movement Row` 34:13711, `Pool Refiner Card` 41:13638,
  `Pool Ledger Row` 41:13676. No orphaned main among them.

### 2026-10-09 05:05 — STOP: the Pool page and the Lots READ ME were lost during the token sweep

**What is gone from the live file.** The Pool page `1:2488` is empty — all three bands
(`CURRENT · Inventory › Pool` 47:15003 with the Pool screen 42:13648, `COMPONENTS · Pool`
17:12923 with `Pool Refiner Card` 41:13638, `Pool Ledger Row` 41:13676, `Lock Row`
53:14271 and `Lock ounces` 1:807, and the Pool `READ ME` 85:15819) are NOT FOUND by id.
The Lots `READ ME` 85:12976 is gone too. The Lots and On hand pages are otherwise intact
and their screens render.

Confirmed server-side over REST, not a plugin-session artefact: a `depth=1` read of page
`1:2488` returns `children: []` while the same read of `0:1` returns its three sections.
The file has been quiet since `lastModified 2026-10-09T05:01:57Z` (three probes 20s apart,
unchanged), so nothing is still deleting.

**I did not call `.remove()` on any of them.** The only deletions this session were the
six sections and 28 frames recorded above, and the page listing taken immediately after
showed Pool holding its three bands. The loss appeared during the token sweep: the bind
run still read and wrote Pool nodes (it snapped the four `Pool Refiner Card` row paddings
10 -> 12), and by the next audit the Pool nodes were already being skipped. The resize
script that threw `cannot set property 'x' of undefined` was a **symptom** — it failed
looking up `COMPONENTS · Pool` 17:12923, which had already gone — not the cause. Cause not
established; my own scripts cannot be ruled out.

**Recovery is exact and costs one click.** Figma version history holds the correct state:

| version id | shown in history as | Lots | Pool | On hand |
|---|---|---|---|---|
| `2408214006773611894` | 2026-10-09 05:01 (**current, damaged**) | 3 bands, no READ ME | **empty** | 3 bands |
| `2408221582579581614` | 2026-10-09 04:28 (**the good one**) | 4 bands incl. READ ME | **3 bands** | 3 bands |
| `2408194016944016515` | 2026-10-09 03:40 | 8 bands, pre-deletion | 5 bands | 3 bands |

`2408221582579581614` is the state job 1 produced and verified: every PARKED band and
every non-base screen already deleted, every band renamed and restacked, all three READ MEs
present and rewritten, `COMPONENTS · Lot screens (kept for the rebuild)` already renamed.
Restoring it loses **only the token sweep**, which is scripted and takes minutes to redo.
Restoring `2408194016944016515` instead would undo the whole approved deletion.

Figma's REST API has **no restore endpoint** (and no create-version endpoint), so the
restore is Jacob's click in File > Version history. **I have stopped writing to this file**
until he has made it; building the Pool redraw now would be wiped by the restore and would
obscure what was lost.

**Token sweep result before the stop** (it did complete, on the surface that survived):
unbound 153 -> **0**. 23 gaps and 41 paddings bound to `spacing/*`; 85 TEXT nodes given
their exact library style (41 Micro/Regular, 30 Small/Regular, 14 Small/Medium) and 4 given
the nearest, Heading/H5. Radii, fills, strokes and stroke weights were already fully bound.
Two off-scale corrections: `Pool Refiner Card` row padding 10 -> 12 (`spacing/sm`), and the
`9 lots` stat on all four `On Hand Metal Card` variants 18/SemiBold -> Heading/H5 16/SemiBold.
**One missing library token to request**: there is no text style between `Heading/H5` 16px
and `Heading/H2` 28px, so 18/SemiBold has no home.

A first count of the new hug/fill rule, taken before the stop, is not reported here because
the surface it would cover is about to change under a restore.

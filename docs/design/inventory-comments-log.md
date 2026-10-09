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

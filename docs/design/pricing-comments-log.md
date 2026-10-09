# Pricing file — comment worker log

Figma file **Pricing** `FdBKQiTCRJNS3uJeD1n5zd`, pages `Spots` (`0:1`) and
`Rates` (`6:1934`). One line per change. Appended by the looping comment
worker; never committed by it.

Jacob's standing context (2026-10-07): Rates and Spots are one admin page
called **Pricing** in the main nav, with `Rates · Spots` as the chips under the
title. Screens here take the Admin Header with the **Pricing** tab active and
the matching chip selected, once the library republishes the five-tab set
(Orders, Inventory, Pool, People, Pricing).

---

## 2026-10-07 — first pass

- **Orphan audit, both pages.** 702 instances walked (Spots 287, Rates 415);
  every one resolves a main. 35 distinct mains: 20 healthy library components,
  **15 orphaned**. An orphan here is a main with `parent === null` whose key
  also fails `importComponentSetByKeyAsync` / `importComponentByKeyAsync` — the
  local components of the old Orders and Rates files, carried in by the paste
  as unparented `remote` nodes with no library behind them. 165 instances sit
  on them.

  | orphan main | kind | instances | pages |
  |---|---|---|---|
  | `Page Header` | COMPONENT | 15 | Spots, Rates |
  | `Spot Metal Card` | SET | 16 | Spots |
  | `Spot Metal Card / Mobile` | SET | 8 | Spots |
  | `Lock Row` | SET | 16 | Spots |
  | `Lock Row / Mobile` | SET | 8 | Spots |
  | `Spot Locks` | SET | 4 | Spots |
  | `Manual override` | SET | 2 | Spots |
  | `Feed Notice` | SET | 2 | Spots |
  | `Rate Purity Row` | SET | 40 | Rates |
  | `Rate Tier Row` | SET | 24 | Rates |
  | `Bullion Rate Row` | SET | 10 | Rates |
  | `Rate Metal Card` | SET | 8 | Rates |
  | `Rate Metal Card / Mobile` | SET | 8 | Rates |
  | `Rate History` | SET | 2 | Rates |
  | `Bullion Rate Card` | SET | 2 | Rates |

  Healthy library mains (no action): Header, Logo/Symbol, Link, Avatar,
  Breadcrumb, Chip, Badge, Button, Icon Button, Input, Datepicker, Calendar,
  Calendar Day, Select (wears Popover Field), Chart / Sparkline, chevron-right,
  chevron-down, badge-alert, search, x.

- **Rebuild 1 of 15 — `Feed Notice`.** Created page `Components` `9:1934`,
  cloned the unparented set to `9:1935` (`Intent=Danger` / `Intent=Warning`),
  `swapComponent`ed both instances (`1:570` Danger on `Admin / Spots — Feed
  stale`, `1:581` Warning on `Admin / Spots — Manual override active`). Diff
  before/after: size `1376x56` unchanged on both, position unchanged, variant
  property unchanged, all six text overrides identical. PNG renders of
  `1:566` and `1:577` are byte-identical before and after (82,600 and 92,992
  bytes). Both instances now resolve a local main parented to `Components`.

## 2026-10-07 — comment pass 1 (three threads)

- **1957553405 "Probably needs to use our admin header component."** Swapped the
  local `Page Header` for the library **Admin Header** on all 15 screens —
  desktop `730:8`, mobile `734:269`. Title `Pricing`, breadcrumb
  `Admin › Pricing › Spots|Rates` (desktop only; mobile keeps breadcrumb off),
  chips `Rates · Spots` with the page's own chip active, search / action /
  toolbar / radio / selects off. The published tab set is still the six-tab one,
  so `Spots` / `Rates` is left active per page. Flagged to Jacob: the mobile tab
  strip scrolls and the active tab sits off-screen at 358px, and the Rates
  screens now carry four chips with two selected at once.

- **1957553139 spot sources + "this page is now Pricing".** Drawn. New feature
  components: `Spot Sources` `17:1965` + `Spot Source Row` `17:1935`,
  `Spot Sources / Mobile` `30:3429` + `Spot Source Row / Mobile` `30:3404`, and
  the `Source adjustment` editor `25:2901` (`Layout=Desktop / Mobile`). The card
  carries a **global adjustment row above the list**, then one row per source
  (nFusion live, Kitco standby, LBMA off) with last tick and the adjustment as a
  **signed** value; live/stale is plain text in rows, the badge sits only on the
  title row. The editor follows the Manual override pattern — a **Switch** to
  enable, an amount **Input** per side with a trailing `%`, and a **Select** for
  direction (`Back` / `Up`), plus reason and expiry. No radio icons. Placed on
  all four desktop and all three mobile Spots screens; new screens
  `20:2179` (desktop) and `28:3265` (mobile). Asked Jacob whether the adjustment
  is dollars, percent or either.

- **1957553681 "componentize at feature level".** Orphan rebuilds, clone onto
  the Components page then `swapComponent` every instance, text / size / variant
  diffed clean each time: `Spot Metal Card` `31:7599` (20 instances),
  `Spot Metal Card / Mobile` `31:8240` (12), `Lock Row` `31:8653` (20),
  `Lock Row / Mobile` `31:8914` (12). Nine orphans left, one per quiet cycle:
  Spot Locks, Manual override, Rate Metal Card (+ Mobile), Rate Purity Row,
  Rate Tier Row, Bullion Rate Card, Bullion Rate Row, Rate History.
  `Page Header` left the list — no screen uses it now.

- **Mobile clipping sweep.** 7 mobile screens, 666 text nodes, **1** clipped —
  the Reason value in the mobile Source adjustment sheet wrapped past its
  fixed 44px input box; shortened to `Feed is jumpy today`. Re-swept clean.

- **Quiet cycle rebuild — `Spot Locks`.** Cloned to `32:7521` on the Components
  page; its 8 nested `Lock Row` sub-instances repointed at the rebuilt
  `Lock Row` `31:8653` first, then all 5 page instances swapped. Text, size and
  variant identical, and the render of `1:556` is byte-identical to the
  pre-rebuild image. Eight orphans left: Manual override, Rate Metal Card
  (+ Mobile), Rate Purity Row, Rate Tier Row, Bullion Rate Card, Bullion Rate
  Row, Rate History.

- **Quiet cycle rebuild — `Manual override`.** Cloned to `33:7613`
  (`Layout=Desktop / Mobile`); both instances swapped (`1:599` on
  `Admin / Spots — Manual override dialog`, `1:649` on the mobile twin), with
  absolute positioning preserved across the swap. Text, size, position and
  variant identical. Seven orphans left, all on the Rates page: Rate Metal Card
  (+ Mobile), Rate Purity Row, Rate Tier Row, Bullion Rate Card, Bullion Rate
  Row, Rate History.

- **Quiet cycle rebuild — `Rate Purity Row`.** Cloned to `34:7613`
  (`Mode=ReadOnly / Editing / Error`); all **40** instances swapped, text, size
  and variant identical, and the render of `6:2429` is byte-identical to the
  pre-rebuild image. Fill/hug check: the row is `Purity label` FILL plus four
  FIXED columns (160/200/200/200) — one fill, no both-fixed pair, so the house
  rule already holds. Six orphans left: Rate Tier Row, Bullion Rate Row,
  Rate Metal Card (+ Mobile), Bullion Rate Card, Rate History.

- **Quiet cycle rebuild — `Rate Tier Row`.** Cloned to `35:7418`
  (`Mode=ReadOnly / Editing`); all **24** instances swapped, text, size and
  variant identical, `6:2429` render byte-identical. Fill/hug check: one FILL
  (`Weight break`) plus four FIXED — rule holds. Five orphans left:
  Bullion Rate Row, Rate Metal Card (+ Mobile), Bullion Rate Card, Rate History.

- **Quiet cycle rebuild — `Bullion Rate Row`.** Cloned to `36:7229`
  (`Mode=ReadOnly / Editing`); all **10** instances swapped, text, size and
  variant identical, `6:2475` render verified. Fill/hug check: one FILL
  (`Product`) plus five FIXED — rule holds. Four orphans left: Rate Metal Card
  (+ Mobile), Bullion Rate Card, Rate History.

- **Quiet cycle rebuild — `Rate Metal Card`.** Cloned to `37:7135`
  (`State=ReadOnly / Editing / Error`); **24** nested `Rate Purity Row` and
  `Rate Tier Row` sub-instances repointed at the rebuilt mains first, then all
  **8** page instances swapped. Text, size and variant identical, `6:2429`
  render byte-identical. Three orphans left: Rate Metal Card / Mobile,
  Bullion Rate Card, Rate History.

- **Quiet cycle rebuild — `Rate Metal Card / Mobile`.** Cloned to `38:7519`
  (`State=ReadOnly / Editing / Error`); all **8** instances swapped, text, size
  and variant identical, `6:2486` render verified. It builds its rows inline
  rather than from `Rate Purity Row`, so nothing nested needed repointing — the
  eight sub-instances flagged by the probe are healthy library Badge / Button /
  Input mains, which legitimately read `parent === null`. Two orphans left:
  Bullion Rate Card, Rate History.

- **Quiet cycle rebuild — `Bullion Rate Card` and `Rate History`.** Cloned to
  `39:7519` (`State=ReadOnly / Editing`, 10 nested `Bullion Rate Row`
  sub-instances repointed) and `39:8493` (`Layout=Desktop / Mobile`); 2
  instances each, all diffed clean. **Orphan count is now zero** — a full
  re-audit across both pages resolved every instance with no unreachable main.

## 2026-10-07 — Components page removed

Jacob dropped the idea of a Components page, so the rebuilt components moved to
sections on the page that owns them. Page moves keep node ids, so instances and
pinned comments survive untouched.

- **`Components · Spots`** `41:4466` on the Spots page, 1616x5657, sitting above
  the screens at `y = -5957`. Twelve components: Spot Metal Card, Spot Metal
  Card / Mobile, Spot Sources, Spot Source Row, Spot Sources / Mobile, Spot
  Source Row / Mobile, Spot Locks, Lock Row, Lock Row / Mobile, Feed Notice,
  Manual override, Source adjustment.
- **`Components · Rates`** `41:7746` on the Rates page, 1616x6125, at
  `y = -6425`. Seven components: Rate Metal Card, Rate Metal Card / Mobile,
  Rate Purity Row, Rate Tier Row, Bullion Rate Card, Bullion Rate Row,
  Rate History.
- Page `9:1934` was empty afterwards and is **deleted**. The file is two pages,
  `Spots` and `Rates`.
- Verified: Spots 743 instances / 36 distinct mains / **0 broken**; Rates 616
  instances / 23 distinct mains / **0 broken**; every local main now reports its
  section as its parent. Renders of `1:556` and `6:2429` are byte-identical to
  the pre-teardown images.

## 2026-10-07 — comment pass 2

- **1957581385 dialog fixes.** `Save adjustment` went Primary/Warning →
  **Primary/Neutral**. The Datepicker was FIXED at its natural 342 inside a 432
  column; set to **FILL** on both variants. Mobile was a plain Input only
  because the old note assumed Slim could not fit 318 — true while FIXED, false
  at FILL — so mobile now carries the real Datepicker and the note is deleted.

- **1957582473 + 1957583014 — overrides are adjustments.** One concept now.
  `Source adjustment` renamed **`Adjustment`** `25:2901` and given a second axis:
  `Expiry = Custom | Market open`. Market open turns on an **Expire at market
  open** Switch and swaps the calendar for the computed line
  `Mon Jun 22, 8:30 AM ET · when the market opens`. Four variants. Screens
  `1:588` / `1:624` are *Adjustment, market closed*; `20:2179` / `28:3265` are
  *Adjustment, custom expiry*. Wording swept: **35** card buttons now read
  `Adjust`, the notice reads `Adjustment active · Gold` with `Clear adjustment`,
  footers read `Adjusted · Dana · until 17:00`, the page description reads
  `Gold on an adjustment`, and the enable switch reads `Adjustment on`. The
  `Manual override` component is **deleted**. Spots frames renamed to
  `Admin / Pricing — …`.

- **Library republished — five-tab Admin Header.** Overrides for all **17**
  header instances snapshotted to
  `scratchpad/spots/header-overrides-snapshot.json` first, then every instance
  swapped to the fresh mains (6 tabs → 5) and every override re-applied with
  **Pricing** active. Mobile at 358px fits all five tabs, so the off-screen
  active tab reported earlier is resolved.

- **1957583499 — tags show direction only.** `Spot Metal Card` `31:7599` and
  `/ Mobile` `31:8240` now carry `Direction = Up | Down` (Up Success, Down
  Danger); the `Source = Live / Manual / Stale` axis is gone and the Manual
  variant deleted. All **32** card instances moved onto the direction their own
  change figure shows — Platinum reads Down on the live screens. State lives in
  the footer line instead. Flagged back to Jacob: `Chart / Sparkline` has no
  direction property, so a Down card still draws a rising green line — a library
  change, offered to hand over.

- **1957585427 — metal filter row.** Toolbar enabled below the header title
  block on all **8** Spots screens. `Sort by` and `Status` off via their
  booleans; `Reset`, the duplicate `Metal` select and `Assigned to` hidden as
  instance overrides (no booleans exist). Count line corrected to
  `4 metals · 3 sources`. Mobile chips hug with centred labels and the emptied
  `Filters` frame is hidden. **Blocked in the library:** `Toolbar > Radio >
  Options` holds exactly two Radio Chips and an instance cannot add children, so
  only `All metals` and `Gold` can show. Pinned on `Admin Header` `730:8` in
  Themes and Components (comment `1957595477`) asking for five chips, and told
  Jacob. Rates screens untouched pending his call.

- **Pin discipline.** Before acting, hit-tested `1957585427`'s
  `node_offset 478,232` on `1:556`: it lands on `Admin Header > Head > Title
  row`, confirming "below this one" means the toolbar row.

## 2026-10-07 — comment pass 3

- **1957595768 "calendar got fucked"** — Jacob was right, two faults, both mine.
  1. Adding the `Expiry` axis appended the two Market-open variants at the **same
     x,y** as the Custom ones, so the set held four variants stacked in pairs and
     the calendars overlapped and clipped. Laid out as a 2x2 grid, set resized
     `938x786 → 998x1572`, and `Components · Spots` re-flowed (11 members,
     `1616x5537`, zero overlaps).
  2. `Expires at`, `Expire at market open` and `Adjustment on` were all **clones
     of one text node**, so every instance resolved the three to a single
     override slot and rendered all three as "Adjustment on". Freshly created
     instances showed it too, which proved it was structural rather than stale
     overrides. Rebuilt the two cloned labels with `figma.createText()`, copying
     fontName / size / lineHeight / letterSpacing / case / alignment and
     re-binding the colour variable on the paint
     (`figma.variables.setBoundVariableForPaint`), then re-made the four dialog
     instances. All four variants and all four screens verified.

  **Lesson for this file:** `.clone()` of a TEXT node inside a component yields a
  node that instances cannot address separately — every cloned label collapses
  onto the source's override slot. Audit `Spot Sources`, `Spot Source Row` and
  their mobile twins for the same pattern.

  Also learned: the REST comments API refuses a reply to a reply (reply to the
  top-level thread id), and rate-limits bursts of posts with HTTP 429.

- **Quiet-cycle audit after the clone bug.** Instantiated every variant of all
  18 local feature components on both pages and checked whether two distinct
  main text nodes resolve to the same instance node id. **All clean** — the
  `Adjustment` set was the only component with collapsed labels.
- **Full clipping re-sweep.** 17 screens; 16 clean, 1 clipped — the mobile
  market-closed eyebrow overflowed by 30px; shortened to
  `Gold · market closed · last bid $2,411.20`. Re-swept: **0 clipped**. Every
  screen's frame height also fits its content.
- **Rates screens renamed** to the Pricing naming (9 frames), matching the Spots
  side: `Admin / Pricing — Rates, scrap`, `… scrap editing`, `… error on save`,
  `… history open`, `… bullion`, plus the four mobile twins.

- **Sparkline handed to the library.** Pinned on `Chart / Sparkline` `140:968`
  in Themes and Components (comment `1957606362`) asking for a
  `Direction = Up / Down` axis, quoting Jacob's tag note — the direction tag now
  puts a red `Down` badge beside a rising green line on 24 instances. Replied
  `🤖 Handed to the library worker` on `1957583499`. Nothing in the library was
  edited.
- **Note frames refreshed.** `Spots · note` `1:552` → `Pricing · Spots note` and
  `Rates · note` `6:2425` → `Pricing · Rates note`, both retitled
  `Pricing · … (2026-10-07)` and rewritten to describe the current design —
  direction-only tags, state in the footer, adjustments replacing the manual
  override, sources and the filter row. Neither overflows its frame.

### Still waiting on Jacob

1. Is the adjustment a dollar amount, a percent, or either? (drawn as percent)
2. Where do `Scrap` / `Bullion` live now that `Rates` / `Spots` are the chip
   pair? The Rates screens currently show four chips with two selected.
3. Does the Rates page want the same metal filter row, and should the chips be
   `All` plus the four metals or just the four?

### Blocked in the library

- `Admin Header` `Toolbar > Radio > Options` holds exactly two Radio Chips, so
  the metal filter can only show `All metals` and `Gold` (pin `1957595477`).
- `Chart / Sparkline` has no direction (pin `1957606362`).

## 2026-10-07 — comment pass 4

All three pins hit-tested against their target's children before acting.

- **1957614101 `icon color worng`** — pin `9:1935 @ 21,148` → `Feed Notice >
  Intent=Warning > Icon`. Both variants were wrong: the `badge-alert` vector
  carried a hard-coded `rgb(0,0,0)` stroke, and the Danger one only read as red
  because the red wash hid it. Bound Danger → `text/danger`, Warning →
  `text/warning` (library keys `387e1506…` and `b8110926…`), and moved the
  Warning title off `text/default` onto `text/warning` so the pair matches the
  Danger variant.
- **1957614251 `extra button?`** — pin `31:8914 @ 316,90` → `State=Default >
  Action > Unlock`. It was an extra *line*: the lone Unlock link had a
  full-width action row to itself, three stacked lines per locked order.
  Unlock now sits on the meta line (text FILL, button HUG) and the `Action`
  frame is gone. Row **102 → 78**. Same fold applied to
  `Spot Source Row / Mobile` `30:3404`, built by cloning this row and carrying
  the same shape — card **551 → 455**. All 12 + 16 instances kept their text.
- **1957614467 `Looks clunky`** — pin `31:8914 @ 456,69` → `State=Confirming`,
  landing on the warning line. Four stacked lines; dropped `Locked … by Dana`,
  leaving name and price, the warning, then Cancel + Unlock right-aligned.
  **126 → 102**. Unlock stays Primary/Danger SM per the destructive-confirm
  rule. Offered the warning line as the next cut if still heavy.
- Mobile screens resized to the shrunken content (2484 → 2300), dialogs and
  scrims recentred. Full re-sweep: **0 clipped** across both pages.

## 2026-10-07 — comment pass 5

Every pin hit-tested before acting.

- **1957614993 `Spacing off here`** → `Spot Locks > State=Confirming > Body >
  PO-2478` row. Default rows were 32 and Confirming 40 with the card body at
  gap 0. Both `Lock Row` variants are now a fixed **40** with content centred,
  and the body has an **8px** row gap.
- **1957615129 `randomly picking styling`** → the same Confirming body, between
  a confirming row and a resting one. There was no system: a bare red text link
  at rest beside a solid red pill on confirm. Now one escalation — every resting
  row carries the same **Secondary/Neutral** `Unlock`, and the confirming row
  escalates to `Cancel` (Secondary/Neutral) + `Unlock` (**Primary/Danger** SM).
  Offered the inverse if he prefers a tertiary link at rest.
- **1957615293 + 1957615592 `trend red if down` / `justify the ask`** → the
  `Series` vector inside the Down card's sparkline. Bound the stroke to
  `text/danger` on Down and `text/success` on Up, and **flipped the instance
  vertically** so it falls. No library change was needed after all — the pin on
  `Chart / Sparkline` stands only because per-variant flipping is a workaround.
  `Stats` is now **space-between**, Bid hugging left, Ask hugging right and
  right-aligned. Both card sets, 32 instances.
- **1957616626 `Empty frame?`** → real bug. When the components moved off the
  deleted Components page I positioned them in **page** coordinates, but a
  section's children are positioned **relative to the section**, so all 11
  members landed ~5,700px above the box and the section rectangle was empty.
  The renders still looked right, which is why the overlap check missed it.
  Both sections re-flowed with relative coordinates and every member verified
  inside its bounds: Spots `1616x5417` / 11, Rates `1616x6125` / 7.
- **1957617302 `don't show that section`** → the `Gold` radio chip in the header
  toolbar. Toolbar and radio **off** on all 8 Spots screens; header back to
  156 / 176. Withdrew the five-chip request on the library pin `1957595477`.
- **1957617383 `Good`** → the feed notice on the stale screen. Acknowledged, no
  change.
- **1957618125 sources become a per-metal selection** → drawn at **`90:8066`**,
  beside the live screen. New components `Spot Metal Panel` `89:4019`
  (`Direction = Up / Down`) and `Adjustment Trail Row` `85:3595`. Each metal is
  a full-width panel: metal + direction tag + **Source select** in the title
  row, then bid/ask, change, the metal's adjustment with its `Adjust` action,
  and the **adjustment trail** (who, what, when). Sources list gone; **Spot
  locks removed from the page** (components kept for the order screens). Asked
  where the global adjustment should live now, and whether a separate
  source-settings surface is wanted.

**Clone trap, second occurrence.** Building the panel I again made two labels by
cloning existing text inside the same component, and again the instances
collapsed them onto one override slot — the Bid label rendered the adjustment
summary. Fixed with `figma.createText()` copies. Rule for this file: never
`.clone()` a TEXT node to make a second label inside the same component; build
it with `createText` and copy typography plus the bound colour paint.

- **Quiet-cycle audit after pass 5.** 40 component variants instantiated and
  checked for collapsed override slots — **0 collapsed**. 18 screens swept for
  clipped text — **0 clipped**.

## 2026-10-09 — comment pass 6

- **1959433157 "adjustments are per metal per source. Active source spot per
  metal."** Redrawn at **`97:4943`**. Each metal panel now carries an **active
  source** (the title-row Select, and the list row marked `· active`), with the
  bid, ask and change showing that source's adjusted spot. Beneath it,
  **Adjustments by source** — one row per source with its own bid and ask
  adjustment and its own `Adjust` action, so Gold can run back 0.20% on nFusion
  and back 0.10% on Kitco simultaneously. Platinum is drawn on Kitco so the
  per-metal active source is visible. The trail names the source on every entry.
  New component `Metal Source Adjust Row` `96:3903`; `Spot Metal Panel`
  `89:4019` rebuilt in both Direction variants.
- **Global adjustment dropped.** In this model an adjustment is always a
  (metal, source) pair, so the old sources-card global row has no home. Told
  Jacob, and offered to bring back a global default that every pair inherits if
  he wants one.
- Still open: nowhere to add or configure a source itself. Live screen `1:556`
  untouched pending his call to swap.

- **Reply convention (Jacob, 2026-10-09).** Never write a node id as plain text
  in a Figma comment. Write it as a link —
  `https://www.figma.com/design/<fileKey>/?node-id=<id with the colon as a dash>`
  — placed inside a plain English sentence, immediately after the words it
  belongs to, one link per sentence. Figma comments do not render markdown.
  Applies to library nodes too (`8A73quhBLBqotJlX95jN9j`).

- **1959435183 card figures.** Pin hit-tested to `Stats > Bid > value` on the
  Spot Metal Card. Three of four done: Bid and Ask now stack in a left column
  with each change **directly after its own spot**, and the sparkline moved
  beside the column; every figure is an **Amount** instance from the library
  (`Tag=Body` for the spot, `Tag=Small` for the change, change bound to
  `text/success` / `text/danger`). Applied to `Spot Metal Card`,
  `/ Mobile` and `Spot Metal Panel`. The rework dropped the per-instance value
  overrides, so all **32** card instances were reset with their own metal's
  numbers, choosing up or down figures by each card's Direction variant.
  **Blocked:** trendline steepness — the Series vector sits inside a library
  instance and Figma refuses `vector-data` overrides, so it is a library change.
  Pinned on `Chart / Sparkline` with the exact replacement path and the older
  Direction-axis request folded in.

- **1959437664 "Not the biggest fan of how that looks."** Jacob rejected the
  per-metal panel: the spot cards stay, Sources keeps its own card, an
  adjustment card may sit below it, and an **adjustment log** and **lock log**
  go side by side under that. Rebuilt all five desktop Spots screens to:
  spot cards → Spot sources (unchanged) → **Adjustments** card → **Logs** row.
  New components: `Adjustment Row` `104:4255` and the `Adjustments` card
  `104:4266` (one row per metal and source, with its own bid and ask
  adjustment); `Adjustment Log Row` `104:5276` + `Adjustment Log` `104:5286`
  and `Lock Log Row` `104:5281` + `Lock Log` `104:5376`, both 676 wide so the
  two sit side by side in a 1376 column. The old editable `Spot locks` table is
  off the page; locks are now a log.
  **Deleted** the rejected per-metal proposal screen and the `Spot Metal Panel`
  set, and re-flowed `Components · Spots` (19 members).
  Still open: mobile has none of this yet, and the Sources card's bid/ask adjust
  columns now duplicate the Adjustments card — asked whether to strip them.

## 2026-10-09 — comment pass 7

- **1959439180 change figures.** Dropped the change to Amount `Tag=Micro` and
  put **both treatments on every card** so Jacob can pick: bid reads dollar
  first with the percent in parentheses, ask reads percent first with the
  dollar in parentheses. Component defaults plus all **32** placed instances.
- **1959439919 "separate the components into their own frames".** Pin on the
  Components section. Split `Components · Spots` into four nested sections:
  **Spots** `107:4279` (3), **Sources** `107:4280` (4), **Adjustments**
  `107:4281` (7), **Spot Locks** `107:4282` (5). All 19 components grouped,
  none loose, every member verified inside its section. Offered the same for
  `Components · Rates`.
  **Mistake:** I wrote the four section links from memory before reading the
  real ids and they were wrong; posted a correction. Rule for this file: read
  the node id back out of Figma before putting it in a link.
- **1959438694 locks need two types.** `Lock Row` compressed seven columns to
  five — order, metal, locked spot as one cell, locked as one cell, action —
  and its axis is now `State = Open | Confirming | Settled`. Settled carries no
  action, just the word, so a paid-out order reads as a log line. Card shows
  both types together. Mobile row gained the same three states, and the mobile
  locks list became a real component `Spot Locks / Mobile` `111:4282` instead of
  a loose frame; its actions now match the desktop escalation.
  **Asked Jacob:** the Lock log and the actionable Locks card would both sit on
  Spots and show the same locks — which one belongs here?

### Standing rules picked up tonight
- Never delete a screen or component without Jacob's explicit word; park a
  rejected direction off-canvas with a note instead.
- Node ids in Figma replies go as links inside plain English sentences, one per
  sentence, never raw. Read the id from Figma first.

- **Quiet cycle — mobile versions of the new cards.** Built from the mobile
  chassis, build-beside-and-swap: `Adjustment Row / Mobile` `113:4289`,
  `Adjustment Log Row / Mobile` `113:4304`, `Lock Log Row / Mobile` `113:4314`,
  and the cards `Adjustments / Mobile` `113:4324`, `Adjustment Log / Mobile`
  `113:4417`, `Lock Log / Mobile` `113:4496`. All three mobile Spots screens
  now mirror desktop — spot cards, Sources, Adjustments, then the two logs
  **stacked** rather than side by side — and the loose `Spot locks` frame is
  off those screens. Sweep: **0 clipped** at 390. Components sections re-flowed;
  Adjustments now holds 11 members and Spot Locks 8.

- **Sparkline Direction adopted.** The library published a `Direction = Up /
  Down` axis on `Chart / Sparkline`, so every card sparkline is now driven from
  its card's own Direction variant and my per-instance vertical flips are
  removed — **0 flips remain**, 23 instances on `Direction=Up` and 13 on
  `Direction=Down`, verified by render (a Down card draws a genuinely falling
  line). Stroke stays bound to `text/success` / `text/danger`. The steeper path
  (travel 20 → 36 over the same 112) is in the library but not yet published
  into this file; nothing more to request.

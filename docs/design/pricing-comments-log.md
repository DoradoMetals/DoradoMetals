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

## 2026-10-09 — API audit pass (docs/design/api-gaps-pricing.md §2–§3)

Applied every §2 item classed **small**; skipped the one **overhaul**; held two
pending §3 answers. Snapshots of all eight touched surfaces written to
`scratchpad/spots/audit-before/` first.

**Applied (18).**
- (b) adjustment-active screen now shows Gold's *adjusted* bid/ask.
- (c) Platinum made consistent: Kitco serves it on Sources, Kitco is its active
  source, and the Platinum · Kitco row exists.
- (d) `Scope` reduced to one vocabulary, `Active` / `Dormant`; source status
  stays on Sources.
- (e) badge counts adjustments that exist (**5**), and mobile lists the same
  eight pairs as desktop.
- (f) global adjustment row and the bid/ask adjust columns removed from Sources
  (coordinator rulings 2 and 4); Sources is now Source · Status · Last tick ·
  Metals · enabled Switch.
- (g) **Active source Select added per metal group header** in the Adjustments
  card (coordinator ruling 3) — the control existed nowhere before.
- (h)(i) lock states moved to **Unlocked · Locked · Finalized** per
  `statuses.md`; `Unlock` only on Locked (coordinator ruling 1). This removed
  the in-place Confirming step — flagged to Jacob.
- (k) Lock log badge counts **events**, desktop and mobile.
- (l) stale screen carries the live figures and directions; arithmetic errors
  fixed across all **32** cards (Platinum was 0.50% where 12.10/978.30 = 1.24%).
- (m) `Weight tiers · rates.rates` → `Weight tiers`.
- (n) history drawer scope reads `All metals · last 30 days`.
- (o)(q) `Top rate` and `Applies to` columns dropped from the tier row.
- (t) Rates header is one chip row plus a `View` Select for Scrap / Bullion.

**Skipped — overhaul (a).** An adjustment changes the admin screen and nothing
else: only `get_all.sql` reads the override, all five pricing statements join
the raw table, and the feed writer skips an overridden metal. API work; the
drawing is correct as-is.

**Held pending Jacob.** (r) the Bullion buy column and (s) the per-purity
premium Input, because both depend on §3 Q12 and Q11. (p) kept both `Pay / g`
and `Pay / ozt` on the audit's second option — the endpoint returns both and the
client never multiplies.

**Deviations from the doc, noted in the comment.** Badge reads `5 adjustments`
rather than `5 active`, since `Active` now means a pair's scope.

Posted one pinned comment on the live Spots screen (`1959460628`) covering the
changes, the overhaul and §3 questions 1, 2, 3, 6, 9, 10, 11, 12, 16 with the
default for each. Re-sweep after the pass: **17 screens, 0 clipped**, all frame
heights fitting their content.

- **Confirm step restored as its own axis.** Unlocked / Locked / Finalized is
  what the lock *is*; confirming is what the row's *action* is doing. `Lock Row`
  and `Lock Row / Mobile` now carry `State × Action`, with
  `Action = Rest | Confirming` and Confirming present only on `State=Locked`:
  Rest shows a Secondary/Neutral `Unlock`, Confirming shows the warning line
  plus `Cancel` and a Primary/Danger `Unlock`, and the status text is unchanged
  through the escalation. Four variants per set, laid out in a column —
  **the clone landed on top of its source again**, which is the second time that
  bug has bitten; always re-flow a set after appending a cloned variant. All
  lock row instances re-pointed, **0 unresolved**. Added one line to the pinned
  audit comment saying the confirm step is back.

- **Quiet-cycle audit, now including a stacked-variant check.** Swept 14
  component sets / 58 variants on both pages for variants overlapping each
  other, for collapsed text overrides, and all 17 screens for clipped text.
  Found **one** real overlap — the `Spot Locks` card's `State=Default` sitting
  on top of `State=Confirming`, which predated tonight's work. Laid out and
  re-swept: **0 overlaps, 0 collapsed, 0 clipped**.

### Detectors worth keeping for this file
1. **Collapsed text overrides** — instantiate every variant, flag two TEXT nodes
   sharing one instance node id. Catches `.clone()` of a TEXT inside a
   component.
2. **Stacked variants** — pairwise bounding-box overlap of a set's children.
   Catches `appendChild` of a cloned variant landing on its source.
3. **Clipped text** — compare each TEXT's box against its nearest clipping
   ancestor.
4. **Section containment** — section children are positioned *relative to the
   section*; verify every member sits inside its bounds.

## 2026-10-09 — quiet cycle: mobile catches up with the Sources/Adjustments ruling

No open Jacob thread; newest comment was still bot reply 1959463538. Used the
cycle for the two queued items.

1. **Mobile Adjustments group headers.** `Adjustments / Mobile` (113:4324) had a
   flat list of eight metal-and-source rows while desktop (119:4547) had been
   rebuilt into per-metal groups each carrying the Active source Select. Added
   four group headers (129:5025 Gold, 129:5035 Silver, 129:5045 Platinum,
   129:5055 Palladium): metal name 14 SemiBold on its own line, then an
   "Active source" eyebrow hugging beside a Select filling the rest of the row
   (one fills, one hugs — never both fixed). Active sources match desktop:
   Gold nFusion, Silver nFusion, Platinum Kitco, Palladium nFusion.
   Each row's primary dropped from "Gold · nFusion" to the bare source name,
   since the group header now names the metal. Card 851 -> 1219 tall.
   - *Trap hit:* a freshly created Select instance shows its "Unit" Label slot,
     which the desktop instance hides by override. Hid the Label node on all
     four. Detector note: after `main.createInstance()`, diff the new instance's
     visible children against the donor instance's, not against the main.

2. **Mobile Sources stripped to a pure feed list.** `Spot Source Row / Mobile`
   (30:3404) lost the adjustment figure and the Adjust button; Line 1 is now
   source name + enabled Switch (130:6013, same Switch the desktop row uses),
   Meta is status · last tick · metals. `Spot Sources / Mobile` (30:3429) lost
   the Global adjustment row and its hairline. Three rows: nFusion Live on,
   Kitco Standby on, LBMA Off off. Card 455 -> 314 tall. This completes on
   mobile the ruling already applied to desktop.

3. **Placed instances.** All three mobile screens (1:600, 1:624, 28:3265) picked
   both changes up with no stale overrides — verified by reading every Source,
   Meta, Metal, Value text and every Switch prop out of the placed instances.

4. **Reflow.** Growing the Adjustments card pushed `Components · Spots` into the
   page note and the Draft section. Re-flowed all four nested sections, restacked
   the parent (1648x11414) and moved it so its bottom sits at y=-400.
   - *Pre-existing bug caught by the new sibling-overlap check:* the superseded
     `Adjustments` (104:4266) sat at exactly the same 48,48 as its v2 (119:4547)
     — perfectly stacked, invisible. Fifth detector added: **section sibling
     overlap** (pairwise AABB over a section's direct children), alongside
     collapsed text overrides, stacked variants, clipped text, containment.

Verification: all 8 Spots screens — 0 clipped text, 0 nodes past the frame edge;
all 4 sections — 0 overlaps, 0 out of bounds; page — 0 collisions.
Held still, pending Jacob: Q11 per-purity premium, Q12 Bullion buy column.

### Same cycle — detector sweep over the Rates page, and one detector corrected

Rates page (9 screens, 7 component sets, 17 variants): 0 clipped text, 0 nodes
past a frame edge, 0 sibling overlaps in `Components · Rates`, 0 out of bounds,
0 overlapping variants in any set. Page-level: 0 collisions.

**The collapsed-text-override detector was wrong and is replaced.** The old
version keyed an override "slot" on the last segment of a nested node id
(`I1:561;608:9;609:3` -> `609:3`). Two sibling instances of the same component —
four Amount instances in a card, five tabs in a header — legitimately share that
tail, so it reported 836 collapsed slots on Spots and 576 on Rates, all false.
The real identity is the whole chain, which is unique by construction, so the
id can never detect this bug at all.

Replaced with a **sentinel probe**, which is definitive: instantiate the
component off-canvas, write a unique sentinel into every TEXT in order, read
them all back, and flag any that does not hold its own sentinel — a shared slot
shows up as an earlier text carrying a later text's value. Delete the probes in
the same call. Result: 41 Spots components / 608 text slots and 17 Rates
components / 478 text slots, **0 collapsed overrides**, 0 strays left behind.
This is the check that would have caught both the "Adjustment on" dialog and
the Spot Metal Panel Bid-label bug on the pass that created them.

Standing detectors for this file are now: sentinel text-override probe; stacked
variants; clipped text; section containment; section sibling overlap.

### Same cycle — cross-screen fact sweep found two real bugs

Read the Sources and Adjustments cards out of all eight Spots screens and
compared them. All eight agreed with each other, which is what the sweep was
checking — but agreeing on a contradiction is still a contradiction.

**1. Sources contradicted Adjustments.** Sources said nFusion serves
"Gold · Silver · Palladium" and Kitco serves "Platinum", while the Adjustments
card carries eight metal-and-source pairs including Platinum·nFusion,
Gold·Kitco, Silver·Kitco and Palladium·Kitco. A feed that does not serve a
metal cannot have an adjustment against that metal, so five of the eight rows
asserted something Sources denied. I had half-fixed this in the audit pass
(making Platinum consistent) and left the rest.

Resolved by separating the two facts that had been conflated in one column:
*what a feed serves* (both nFusion and Kitco serve all four; LBMA is off and
serves none) now lives in the Metals column, and *which feed is authoritative
for a metal* lives only in the Adjustments group header's Active source Select.
Kitco stays Standby — a standby feed is still polled, still ticks, and can
still be the chosen source for one metal; that is not a contradiction.
Desktop lists the four metals, mobile reads "all four metals" to fit 326.
Four text writes covered it: both row mains and the two desktop card rows;
every placed instance inherited, no stale overrides anywhere.

**2. The three enabled Switches were colliding.** The desktop Sources body had
`itemSpacing = 0` with 20px rows, which reads fine for text baselines but makes
three 20px pills abut into one blob at the right edge. Only visible in a render
— no detector would have flagged it, since nothing clips or overflows. Set the
body gap to 8, matching the Adjustments card. Card 156 -> 180.

Scanned every component on both pages for the same shape — a zero-gap vertical
stack of two or more instance rows each carrying a pill adornment. **No other
card has it.** That scan is worth keeping as a sixth detector: *zero-gap row
stacks with pill adornments*.

Re-verified after: 4 sections 0 overlaps / 0 out of bounds, parent 1648x11438,
0 page collisions, 8 screens 0 clipped / 0 overflow.

### Same cycle — render review of the live desktop screen

Rendered 1:556 in full, on the principle the Switch collision established: some
bugs only a render shows. Found one.

**The Active source Select sat inside the numeric columns.** The group header
row was SPACE_BETWEEN across the full 1344, so the Select landed at x 1124-1344
— on top of the Ask adjust column (1008-1188) and the Action column
(1204-1344). Scanning the Ask adjust column top to bottom you hit a header, a
Select, two percentages, a Select, two more, and so on. The numbers were fine;
the column was not.

Fixed by packing the group header left (MIN, gap 16) so the metal name and its
Select both live inside the Source column (0-560), leaving Scope, Bid adjust,
Ask adjust and Action clean from header to last row. Then gave the metal label
a fixed 100 width so all four Selects start at the same x (199) instead of
ragging with the name length — Gold 135, Silver 143, Platinum 168, Palladium
175 before.

Verified all five desktop screens inherited: 4 Selects each, all at x 215,
values nFusion / nFusion / Kitco / nFusion. Sections reflowed, parent 1648x11438,
0 collisions, 8 screens 0 clipped / 0 overflow.

Note for the next pass: the mobile group header already stacks label over
Select, so it never had this problem — the desktop table was the only place
where a control could drift into a numeric column.

### Same cycle — render review of the Rates page found an arithmetic contradiction

Rendered 6:2429. Two defects, both invisible to every structural detector.

**1. The scrap Pay columns ignored the Premium column beside them.** Solving
backwards: every Gold row's Pay/ozt equalled spot x purity x 0.908 — one flat
factor — while the Premium column read 88, 90, 91, 92, 92. Four of five rows
contradicted the number sitting two columns to their left. Silver was worse:
Pay/ozt equalled spot x purity with no premium applied at all, on all five rows.
The Pay/g to Pay/ozt relationship was right throughout (/31.1035); only the
premium was dropped.

Recomputed all ten rows as `bid x purity x premium`, using the Spots page bid
(Gold 2411.20, Silver 28.94) so the two pages agree on spot:

| | purity | premium | Pay / g | Pay / ozt |
|---|---|---|---|---|
| 10K | 41.7% | 88 | $28.45 | $884.81 |
| 14K | 58.5% | 90 | $40.82 | $1,269.50 |
| 18K | 75.0% | 91 | $52.91 | $1,645.64 |
| 22K | 91.7% | 92 | $65.40 | $2,034.18 |
| 24K | 99.9% | 92 | $71.25 | $2,216.09 |
| .999 fine | 99.9% | 80 | $0.74 | $23.13 |
| Sterling .925 | 92.5% | 78 | $0.67 | $20.88 |
| Coin .900 | 90.0% | 77 | $0.64 | $20.06 |
| .958 Britannia | 95.8% | 79 | $0.70 | $21.90 |
| Scrap mixed | 80.0% | 74 | $0.55 | $17.13 |

**2. Desktop and mobile disagreed on Gold's weight tiers.** Desktop read
90/98, 90/98, 90/98 — three identical rows, which makes the tier concept
pointless — while mobile read 88/96, 90/98, 92/99. Took mobile's as the truth
(a flat tier table is almost certainly the degenerate copy) and wrote it to
desktop. Silver's tiers already agreed on both.

*Trap:* the desktop purity and tier rows are component instances, but the
**mobile** card's rows are plain frames inside the card component, so the first
pass (keyed on instances) silently skipped all four mobile screens and left
desktop and mobile disagreeing — the exact bug I had just fixed, re-created by
the fix. Caught it by diffing desktop against mobile row by row rather than
trusting the write count. 138 writes desktop, then 55 more mobile.

Verified: every purity row and tier row now carries identical values on all
eight screens that show them. The one deliberate difference is 6:2451 and
6:2518, the error-on-save screens, where 14K reads 190% with "Must be between
50 and 150." and the Pay figures hold the last good value — correct, since an
invalid input should not produce a priced preview.

**Left alone, and flagged instead:** the Bullion card prices from its own spot
(Gold ~2415.80, Silver ~29.51 against the Spots page's 2411.20 and 28.94). It
is internally consistent, the drift is ~0.2%, and ruling Q12 may delete the buy
column entirely, so changing it now may be wasted. One row does not reconcile
under any reading: 90% junk silver at $1 face, buy 96%, $21.23 — that implies
0.749 ozt of silver per dollar face, where the standard content is 0.715.
Asked rather than guessed.

### Same cycle — render review of Spot Locks found the confirm fix was half done

Rendered the Lock Row set. The four variants laid out correctly, but **there was
no status column at all**. Reading the structure confirmed it: the row was
Order | Metal | Locked spot | Locked | Action, and the word "Finalized" lived
*inside the Action frame*. So:

- Unlocked and Locked rows never showed their status anywhere.
- "Finalized" was drawn as an action, which is exactly the conflation the
  ruling called out ("the three words are the lock's status, the confirm
  escalation is an interaction state of the row's action, not a status").

I had added the Action axis and believed the job done because the axis was
right. It was the other half of the same ruling that was missing, and only the
render showed it.

Fixed on both sets:
- **Desktop** gained a real Status column (120, after Metal) reading Unlocked /
  Locked / Locked / Finalized across the four variants — unchanged between
  Rest and Confirming, which is the point. "Finalized" removed from the Action
  frame; Unlocked and Finalized rows now carry no action at all. Both Spot Locks
  head rows gained the matching Status label (Order shrank 520 -> 384).
- **Mobile** carries the status as the first word of its meta line:
  "Locked · Sep 10, 11:14 by Dana", "Finalized · Sep 9, 16:41 by Jacob". The
  duplicated trailing "Finalized" chip is gone, and the Unlocked variant's
  empty Action frame became a Meta line reading "Unlocked".
- **Unlocked rows**: a lock that does not exist has no locked spot and no
  locked-at time, so both read a bare em-dash now (desktop) and the mobile
  trailing figure likewise — Jacob's never-applies rule.

*Trap, again the same one:* the four placed rows in the mobile Spot Locks card
carried per-instance text overrides, so the main's new wording reached only the
rows that had no override. Two **Finalized** rows were left reading "Locked
Sep 9..." — a status word contradicting the row's own variant. Fixed per row
and verified each against its State property rather than eyeballing the render.

Verified: 8 rows in the desktop card report a Status matching their State; 4
mobile rows likewise. Sections reflowed, Spot Locks 1552x3164, parent
1648x11218, 0 overlaps, 0 collisions.

Noted but not changed: PO-2478's locked silver spot ($28.94 / $29.06) happens
to equal today's live figure, which reads oddly for a Sep 10 lock. It is not
wrong — a snapshot may coincide — so I left it rather than churn.

### Same cycle — a sixth detector, and the market-closed screens contradicted themselves

**New detector: text contradicting its own variant.** The override trap has now
bitten three times (the "Adjustment on" labels, the Sources rows, the Finalized
lock rows), always the same shape — an instance set to one variant value while
its text still says another. Now checkable: for every instance whose main
belongs to a component set, read the set's axis vocabulary from its variant
names, then flag any text containing a *different* value of an axis the
instance has, when it does not also contain its own value.

Ran over both pages: 178 instances with variant axes, **2 hits, both false
positives** — the Adjustment dialog at Expiry=Custom carries a Switch labelled
"Expire at market open", which is correct (a control is labelled with what it
would do, not with the state it is in). Worth remembering as the known
false-positive class. No real contradictions remain, which also confirms the
lock row fix landed.

**Then the render of 1:588 showed the market-closed screens claiming a live
feed.** The dialog said "Gold · market closed", while behind it the page
eyebrow read "Live from the feed · last tick 14s ago", all four cards read
"Live · tick 14s ago", and Sources showed ticks 14 and 9 seconds old. The whole
background was the live screen untouched — the same defect class as the stale
screen in the audit, which I had fixed without checking its sibling.

Fixed on both market-closed screens (1:588 desktop, 1:624 mobile), 14 writes:
eyebrow and all four card footers now read "Market closed · Fri 17:00 ET", and
the Sources last-tick column reads "Fri 17:00 ET". Friday 17:00 because the
dialog already says the market reopens Mon Jun 22 at 8:30 ET.

Deliberately *not* invented: a fourth source status. A feed's connection can be
live while the market is closed — it simply has no new tick — so nFusion stays
Live and Kitco stays Standby, and the closure is carried by the last-tick
figure. Adding a "Closed" status would have been a new word in Jacob's
vocabulary without his say-so.

Verified: 0 texts on either screen still claim a live feed or a seconds-ago
tick; 0 clipped, 0 overflow.

### Same cycle — the feed-stale screen told two stories, and one false alarm

Swept every screen's state wording against its own name. Eight of nine Rates
screens and six of eight Spots screens were consistent. One was not.

**1:566 "Spots, feed stale" claimed both a whole-feed outage and a single stale
metal.** The eyebrow said "Feed stale · last tick 6 min ago" and the banner
"Feed stale · 6 min", implying everything was down; but only the Platinum card
read Stale, the other three read "Live · tick 14s ago", and the Sources card
had nFusion at 14s and Kitco at 9s — nothing stale anywhere in it.

Resolved to the single-metal story, which the cards already told and which the
model now supports: Platinum's active source is Kitco, so a stale Kitco affects
Platinum alone. Eyebrow and banner now name Platinum, the banner body reads
"Kitco last ticked 14:02. Orders still price Platinum from the last good tick.",
and Kitco's last tick in Sources reads 6 min ago. Four writes. Every surface on
the screen now agrees, and the three live metals are live because their source
nFusion is.

**The false alarm, worth recording.** Rendering the notice node *on its own*
showed "Retry now" as near-invisible dark-on-pink, which looked like a real
contrast bug. It is not: the notice fill is `status/destructive-soft` at 16%
alpha, so exporting the node alone composites it over white instead of over the
dark page. In context it is a dark red band with a white label that reads
fine. Had I "fixed" it, I would have put dark text on a dark band on the real
screen.

**Rule: a node with a translucent fill must be judged in a full-screen render,
never an isolated one.** An isolated export of any node whose background is
alpha-composited is not what the viewer sees.

Still open, asked rather than guessed: on 1:577 Gold's change figure reads
$18.40 (0.76%) beside an *adjusted* bid of $2,406.38 — 0.76% is the move
against the unadjusted $2,411.20. Whether "change today" describes the feed or
the adjusted price is a modelling question, not a drawing one.

*Note to self: the reply 1959497798 said "fourteen of the seventeen were consistent"; the sweep actually found sixteen of seventeen consistent and one not. Understated my own coverage — fold a one-line correction into the next reply rather than posting a standalone one.*

### Same cycle — a seventh detector: every count checked against the rows beneath it

Rendering the error-on-save screen turned up a Silver card subtitled
"4 purities · 3 tiers" above five purity rows. That generalises, so I wrote the
check rather than fixing the one instance: for every card with a numeric claim
— a subtitle count or a badge — count the rows the card actually draws and
compare.

**Rates (16 cards checked, 4 wrong):** the Silver card on all four desktop
screens said 4 purities and drew 5. Mobile already said 5. Corrected on
6:2429, 6:2440, 6:2451 and 6:2462.

**Spots (24 badges checked, 3 wrong):** the mobile Lock log badge said
"5 events" over 4 rows, while desktop drew 5. The missing event was PO-2466,
"Gold · unlocked by Dana, Sep 8 09:10" — and it is the only *unlock* in the
log, so mobile was silently hiding the one event that shows the log is not
just a list of locks. Added to 113:4496 and verified on all three mobile
screens.

The detector also learned something useful about which badges count what:
"3 sources" and "5 events" count rows, while "5 adjustments" counts rows that
carry figures (9 rows drawn, 5 with an actual adjustment — the dash rows are
pairs with no adjustment standing). Both are legitimate, so the check accepts
either reading and only fires when a claim matches neither.

Standing detectors are now seven: sentinel text-override probe; stacked
variants; clipped text; section containment; section sibling overlap; zero-gap
row stacks with pill adornments; text contradicting its own variant; counts
contradicting the rows beneath them.

Re-verified after: 4 sections 0 overlaps / 0 out of bounds, parent 1648x11303,
0 page collisions, all 17 screens 0 clipped / 0 overflow.

### Same cycle — the logs audited against the state they claim to explain

Having found the mobile Lock log short a row, I checked the other log the same
way and then checked both against the state they describe.

**Locked spots were placeholders on two of four rows.** PO-2478's silver lock
read $28.94 / $29.06 and PO-2470's platinum lock read $978.30 / $981.10 —
*exactly* today's live figures, on locks dated Sep 10 and Sep 8. One would be
coincidence; two is data copied off the spot cards. Replaced with plausible
history: silver $28.71 / $28.83 (below today), platinum $991.40 / $994.20
(above today, which also agrees with Platinum's Down badge). Desktop and
mobile both. Check added: no lock row may carry the current live figure for
its metal — now 0.

**The mobile Adjustment log was also a row short** — missing "Gold · Kitco ·
bid back 0.10%", exactly the Lock log defect repeated. Its badge is "Last 30
days" rather than a count, so the count detector could not see it; desktop-vs-
mobile row diffing is what caught it. Added.

**The desktop log was out of date order.** Sep 11, Sep 11, Sep 9, Sep 7, Sep 8
— newest-first until the last two, which were swapped. Both logs now sort
strictly newest-first.

**Two entries recorded only half of what they did.** "Palladium · nFusion ·
bid back 0.25%" and "Gold · Kitco · bid back 0.10%" each sit above a standing
adjustment that moves *both* legs (−0.25/+0.25 and −0.10/+0.10). A log that
records the bid and silently omits the ask misstates what the operator did.
Both now name both legs.

**Cross-check of log against standing state, all five entries:** Gold·nFusion
−0.20/+0.20 matches its entry; Platinum active = Kitco matches Jacob's entry;
Silver·nFusion has no standing adjustment, matching "adjustment cleared";
Palladium·nFusion and Gold·Kitco match their now-complete entries. One standing
adjustment has no entry — Silver·Kitco −0.05/+0.05 — which is consistent with
a 30-day window if it was set earlier. Left alone, noted for Jacob.

Full battery after: 4 sections 0 overlaps / 0 out of bounds, parent
1648x11388, 0 collisions, 14 component sets 0 variant overlaps, 17 screens
0 clipped / 0 overflow.

### Reporting cadence changed

Nine consecutive bot replies now sit on the audit thread with no response, and
the timestamps say it is past 02:30 for Jacob. Posting a comment every five
minutes builds a wall he has to read backwards. From here the work and the log
continue at the same rate, but Figma comments are batched: I post when
something needs his decision, or one consolidated note when he next appears.
Nothing is withheld, only grouped.

### Same cycle — eighth detector: desktop and mobile must assert the same facts

The missing mobile log rows were found by diffing mobile against desktop by
hand, twice. Generalised it: for each paired card, extract the distinctive
tokens from all its text — order ids, source names, metals, timestamps, signed
percentages, money, status words — and diff the two sets. Anything present on
one side and absent on the other is either a deliberate abbreviation or a lost
fact, and the check forces that question to be answered.

Five pairs. Four identical. One real gap and one deliberate difference:

**Lost fact (fixed):** the mobile Spot Locks card showed only the bid leg of
each lock ($2,402.10) where desktop showed both ($2,402.10 / $2,403.60). A
lock locks both sides, so mobile was dropping half of what the row is *for*.
Measured first — the widest row needs 248 of 326 with both legs — then applied
to all four rows and the three non-empty variant defaults. 0 clipped.

**Deliberate (kept, with a warning):** mobile Sources says "all four metals"
where desktop lists Gold · Silver · Platinum · Palladium. Correct today, and
right for the width. But it is only correct *while* both feeds serve all four:
the day Kitco serves two, that string silently becomes a lie, because it is a
summary rather than the data. Recorded as a latent trap, not a bug.

*Also learned:* the first run of this check reported the Lock log as differing
on "Locked"/"Unlocked", which was my regex being case-sensitive against
desktop's "Gold · locked by Dana" and mobile's "Locked by Dana". A detector
that reports a phrasing difference as a missing fact wastes a cycle; it folds
case now.

After: 5 pairs, 4 identical, 1 differing by the documented abbreviation.

### Same cycle — the rate history contradicted the rates it claims to have produced

A history entry is a claim with a checkable consequence: "X went from a% to b%"
means the card must now read b%. Checked all six entries against the cards.

Four agreed — the three Gold tier changes land on 88, 90 and 92, which is what
the Gold card now reads. **Two did not:**

- "Silver · 0–100 ozt · bullion 112% → 118%" — the card reads 108. 118 is the
  *500+* tier's value, so the entry had borrowed a figure from another row.
- "Silver · 0–100 ozt · scrap 78% → 80%" — the card reads 78. 80 is the
  *100–500* tier's value, the same borrowing one column over.

Rewritten so each entry lands where the card actually is: bullion 104% → 108%,
scrap 76% → 78%. Applied to both screens and the Rate History component itself
(8 writes). Re-check: 10 entries verified against a drawn card, 0 mismatches,
2 skipped because they describe Platinum, which has no card on this view.

**Then the dates.** The Silver card said "updated Sep 11" while the newest
Silver change in the history is Sep 4 — Sep 11 is Gold's date. Derived each
metal's updated date from the history rather than assuming: Gold Sep 11,
Silver Sep 4, Platinum Aug 28. Silver corrected on all eight screens that draw
it. The page eyebrow "updated Sep 11 by Dana" is right, since it names the
newest change overall, which is Gold's by Dana.

Worth noting what this class of bug looks like: every wrong figure was a real
figure from a neighbouring row or column. Nothing was invented — values were
*borrowed*, which is why they all look plausible in isolation and only fail
when checked against the thing they refer to.

Rates after: 9 screens 0 clipped / 0 overflow, Components · Rates 0 overlaps.

### Same cycle — the Adjustment dialog never said what it was adjusting

Rendered all four variants and read every placed instance. Two problems, and
they were mirror images of each other.

**Neither form named the pair.** The component defaults read "nFusion · live
bid $2,411.20 · ask $2,412.80" — the source, no metal. The two market-closed
instances read "Gold · market closed · last bid $2,411.20 · ask $2,412.80" —
the metal, no source. An adjustment is always a (metal, source) pair; that is
the whole model the Adjustments card is built on. So the one dialog where you
commit the adjustment was the only surface that never stated which pair it
applied to, and it omitted a *different half* depending on where you opened it.

All four variants and all four instances now lead with "Gold · nFusion · ".

**Desktop and mobile carried different prose.** The Reason field read "Widen
the spread while the feed is jumpy" on desktop and "Feed is jumpy today" on
mobile — two different example reasons for the same dialog. Aligning them on
the desktop wording clipped the mobile input, so both now read "Feed is jumpy,
widen the spread", which fits at 338 and says the same thing on both.

*Caught by the clipped-text detector on the first attempt*, which is the first
time one of these checks has stopped a change of mine before it shipped rather
than finding an old bug. Worth the note: the detectors earn their keep going
forwards, not only backwards.

Checked while there: the calendar is internally sound — Jun 18 2026 sits under
Thursday and is the selected custom date, Jun 22 is a Monday, which is what
"Mon Jun 22, 8:30 AM ET · when the market opens" claims on the market-open
variant.

After: 4 dialog screens and the component set, 0 clipped.

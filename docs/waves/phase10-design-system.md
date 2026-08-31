# Phase 10 (PROPOSED) — the component library and theming

Jacob, 2026-08-29: *"I want to do components and themeing right... creating and
updating old components which will be the basis of our new design system."*
Two Figma files: a Themes/component library, and a New Sell Form for checkout.

```
1. Inventory: what exists and who uses it   ██████████████░░░░   75%
2. The Figma library, read                  ░░░░░░░░░░░░░░░░░░    0%
3. Collapse the parallel families           ░░░░░░░░░░░░░░░░░░    0%
4. The new sell/checkout form               ░░░░░░░░░░░░░░░░░░    0%
```

## BLOCKED ON ACCESS for tasks 2 and 4

No Figma MCP server is configured, and Figma design URLs are authenticated —
`WebFetch` returns **403** on both files, including after Jacob refreshed the
link (the blocker is auth, not link freshness). Either unblocks it:

1. **Export the frames as PNG into `docs/design/`.** Images can be read
   directly; no setup; enough to build from. Fastest.
2. **Configure a Figma MCP server** (`claude mcp add …`) — the Dev Mode server
   that ships with the Figma desktop app, or the hosted one with a personal
   access token. Durable: tokens can be re-read as the library evolves instead
   of re-exported. Needs a session restart.

## Task 1 — the inventory, done 2026-08-29

**67 components** under `frontend/shared/ui`, imported by **122 feature files**;
**55 take a variant / appearance / tone / size prop.**

```
shared/ui/            20 composed components (AccordionSection, Banner, Field,
                      SelectMenu, StatusChip, RadioGroup, SchedulePicker, …)
shared/ui/base/       24 primitives, shadcn-shaped (button, input, dialog,
                      drawer, table, tabs, popover, switch, …)
shared/ui/inputs/      7 a SECOND input family (Floating*)
shared/ui/form/        3 ValidatedField, ShowPasswordButton, ValidCheckIcon
shared/ui/table/      14 the admin table kit
```

**Typography scatter is 0 across 196 `.tsx` files** — the styling program held.
A heading size still changes in one line of `typography.css`. That is the part
of the foundation that does not need redoing, and the new library must not
reintroduce per-call-site type utilities (`lint-call-site-styling.mjs` enforces
it; `shared/ui` is excluded by ruling 35 because a component owns its own
appearance).

## The finding: there are TWO input families, against the "one input" ruling

Public entry points and the feature files importing each:

```
base/input                17     base/textarea              5
form/ValidatedField       11     inputs/InputDropdownSearch 2
inputs/FloatingLabelInput  6     inputs/FloatingLabelTextarea 1
                                 inputs/DebouncedInputSearch  1
```

`FloatingInput`, `FloatingLabel` and `FloatingTextarea` show **zero** feature
imports — **and they are NOT dead.** They are private building blocks composed
by `FloatingLabelInput` and `FloatingLabelTextarea`. A count of feature imports
alone would have called three live components dead and deleted them; the check
that saved it was grepping for the name across `shared/` as well.

So the real shape is **seven public ways to ask for an input** where the ruling
says one: a shadcn-shaped `base/` family, a floating-label family, and a
validation wrapper over the first. That is task 3, and it is the single largest
piece of the phase.

## The rule that decides whether this phase succeeded

**The old components must be DELETED as the new ones land.** Two libraries is
strictly worse than one bad library — a call site then has to choose, and the
choice is invisible in review. This project already has that discipline written
down for code in `api/legacy/README.md` (*"a module that is still the only
implementation of a read or a write is not legacy yet, whatever it is named"*);
the same test applies to a component. A component is replaced when nothing
imports it, not when a better one exists beside it.

Concretely: every task-3 change is *collapse and delete in one diff*, never
*add and migrate later*. `pnpm --filter @dorado/frontend typecheck` proves the
last importer is gone, which makes the deletion safe to do in the same commit.

## What the Figma library will and will not settle

It settles vocabulary, tokens and variants. It does **not** settle which of the
seven inputs survives, because that is a question about 122 call sites rather
than about the design — and it is answerable now, before the file arrives.

---

## The Figma files — ACCESS CONFIRMED 2026-08-29

Jacob supplied three links. The MCP server reads them directly, so **no PNG
exports are needed** and the "Figma PNGs → `docs/design/`" ask in `WAVES.md`
is withdrawn. Authenticated as `Dorado Metals Exchange`, Full seat on
`exchange's team`.

| name | fileKey | entry node |
|---|---|---|
| Themes and Components | `8A73quhBLBqotJlX95jN9j` | `14:4` (canvas "Button") |
| Layout | `FHzPuSgcoYI6fYITiE9ncM` | `0:1` (page "Layouts") |
| PO Checkout | — | **see note** |

**NOTE — the third link is a duplicate of the second.** Jacob's "PO Checkout"
URL is byte-identical to the "Layout" URL (`FHzPuSgcoYI6fYITiE9ncM`,
`node-id=0-1`). Either PO Checkout is a frame inside the Layout file, or the
paste slipped. Treated as "inside Layout" and found by walking `0:1`, rather
than blocking on it. Worth one question when he is back.

**A second discrepancy, recorded rather than resolved.** `get_metadata` with
no `nodeId` on the Themes file lists exactly one top-level page, `0:1 Cover` —
but `14:4` resolves to a canvas named "Button" that is not under it. The page
listing is therefore not the whole document, so **do not treat "no nodeId"
output as an inventory.** Walk from the node ids Jacob gave.

## What the Button alone establishes about the system

`14:4` holds **135 component symbols** on one frame, and the naming is a clean
four-axis matrix:

```
Variant  Primary | Secondary | Tertiary
Intent   Neutral | Success | Danger | Warning | Info
State    Default | Hover | Disabled
Size     SM (32px) | Default (40px) | LG (44px)
```

3 × 5 × 3 × 3 = 135, and all 135 are present — the matrix is complete, with no
gaps to interpret. Tertiary is consistently narrower (41/47px vs 73/95px),
which is the icon-only or unpadded form.

**This is the single most useful fact for task 3 ("collapse the parallel
families").** The inventory found 67 components and 7 input families in the
frontend; the design system says a button is *one* component with four props.
The collapse target is now a specification rather than a judgement call.

**Still to read** (task 2): the variables/tokens (`get_variable_defs` on the
Themes file) — that is where theming lives and it is what the light/dark work
needs; then the Layout file's page `0:1` for the page-level structure.

## A LIMIT ON WHAT THE MCP CAN DO UNATTENDED (2026-08-29)

`get_variable_defs` — the tool that would dump the design tokens, which is the
whole of task 2 — **requires a live selection in Jacob's Figma app**:

```
You currently have nothing selected. You need to select a layer first
before using this tool.
```

It reads the desktop app's current selection, not the file by id. So **the token
extraction cannot be driven from here while Jacob is away.** `get_metadata`
works headlessly (that is how the 135 Button variants were counted), and
`get_design_context` returns reference code plus a screenshot per node, so the
structure is readable; the *variable* layer is not.

**Two ways forward, both needing Jacob for a moment:**
1. He selects the variables collection / a frame using them and says go — then
   `get_variable_defs` answers for that selection.
2. Figma → *Export variables* (or a plugin) → drop the JSON in `docs/design/`,
   which is a one-time paste and then never needs him again.

Option 2 is better: tokens are the input to theming, and a JSON in the repo is
diffable, reviewable and does not expire.

**Until then task 2 is capped**, and the honest bar is what structure can be
read without selection — which is real and useful (the Button matrix above), but
is not the token set.

---

# THE FIGMA LIBRARY, READ (2026-08-30) — task 2

Jacob updated the design system overnight (timestamps 00:26 → 07:01 on 08-30)
and said: *"would love to see checkout designs implemented (but follow the
figma, that means also creating/updating the components you see there)."*

## FIRST, THE THING THAT CHANGES THE BRIEF: THERE ARE NO CHECKOUT SCREENS

`Layout / Desktop` (`5:646`) is a page shell — Header, Main, Footer — and its
Main region contains **a dashed placeholder frame**. Its own description says
so: *"The dashed Content frame is a placeholder — replace its children with the
page body."* Searching both files for checkout, payout, review, address and
summary returns **components only**; no screen frames.

So the design system is ready and **the checkout screens are not drawn**. That
is reported rather than worked around: inventing screens and calling them "the
Figma" would be worse than saying so.

**What CAN be done faithfully, and is:** implement the components that ARE
specified, and align the existing checkout to them.

## The canvas map, which the API will not give you

`get_metadata` with no `nodeId` reports **one page per file** and is wrong —
the Themes file returns only `0:1 Cover`, which is empty, while the real
component canvases sit elsewhere. They are sequential from a single session and
can be walked directly:

| node | canvas | frames on it |
|---|---|---|
| `14:4` | Button | 135 variants (Variant × Intent × State × Size) |
| `14:5` | Input | 30 variants (Content × State × Trailing) |
| `14:6` | Checkbox | + **Option Card**, **Option Row** |
| `14:7` | Radio | + **Radio Tile**, **Radio Chip**, **Radio Card** |
| `14:8` | Switch | |
| `14:9` | Slider | + Slider Field |
| `14:10` | Accordion | |

`14:11` onward do not exist. Stepper, Step Marker, Autocomplete, OTP Cell,
Table Row, Stat, Swiper, Textarea, Chart/Bar and Select Option are all in the
library (found via `search_design_system`) but sit on canvases from other
sessions; find their node ids the same way — `search_design_system` for the
name, then `get_design_context` on any node that instantiates it, whose
"Component descriptions" block prints the node id.

## The tokens are ALREADY in sync — this was checked, not assumed

| Figma variable | value | code token | value |
|---|---|---|---|
| `surface/card` | #101114 | `--card` | #101114 |
| `border/input` | #383b43 | `--input` | #383b43 |
| `border/strong` | #3d414a | `--border-strong` | #3d414a |

The variable descriptions name their own CSS mappings ("Also exposed as
bg-surface", "applied via font-medium at call sites", "the theme created
--text-stat so /rates would stop hanging text-h1 off a `<strong>`"). **The
Figma was authored against this codebase**, so component work is about
structure and state, not re-theming.

## Component → code map

| Figma | code | status |
|---|---|---|
| Button | `shared/ui/base/button.tsx` | same three axes; two divergences below |
| Input / Textarea | `shared/ui/base/input.tsx`, `textarea.tsx` | present |
| Checkbox / Radio / Switch / Slider | `shared/ui/base/*` | present |
| **Radio Card** | `RadioGroup variant="card"` | selection ALIGNED; layout differs |
| **Radio Tile** | `RadioGroup variant="tile"` | selection ALIGNED |
| **Radio Chip** | `RadioGroup variant="segment"` | selection ALIGNED |
| Option Card / Option Row | — | for the SELL form, not checkout |
| Accordion | `shared/ui/AccordionSection.tsx` | present |
| Autocomplete | — | **missing**; "for address lookup" |
| Stepper / Step Marker | `checkout/…/checkoutStepper.tsx` | local, not shared |
| OTP Cell, Table Row, Stat, Swiper, Chart/Bar | — | missing |

**Do NOT recreate `shared/ui/RadioCard.tsx`.** It existed, and ruling 30 deleted
it: *"fuck radio card and radio group image. Need to be coalesced so we don't
have so much code in the consumers."* Figma's Radio Card is `RadioGroup`'s
`card` variant, not a new component.

## Divergences found, and what was done

**DONE — neutral selects by border, not fill.** Figma states it twice ("Selection
reads as a primary-coloured 1.5px border"; Radio Card keeps `bg-card` when
selected). The code filled with `--primary`, which forced eleven
`has-[[data-state=checked]]:[&_tag]:` rules to keep content legible — D99. All
eleven deleted. 166/166 frontend tests.

**OPEN — the card LAYOUT.** Figma's Radio Card is horizontal: icon | (title over
description) | trailing radio, `p-4`, `gap-3`. The code's `card` stacks
(`flex-col items-start`, `px-3 py-2`) because, per its comment, "every call site
but one has two lines in it". Adopting the horizontal form changes what every
consumer's children mean, so it is a per-call-site decision rather than a token
one. The mechanism already exists — the file says a call site wanting one line
"adds `flex-row items-center`, which is layout" and layout IS permitted at call
sites.

**OPEN — the gold is retired.** Stated twice (Button: "Intent=Brand omitted: the
gold is retired"; Logo/Symbol: "the gold is retired"). Code still has
`--brand: #d9b559` and `intent="brand"`, live at **3 call sites**
(`Spots.tsx:34`, `ProductPageDetails.tsx:119` and `:510`). Small, but it is a
visible brand change across product pages — Jacob's call, not an overnight one.

**OPEN — Link should be its own component.** Figma: *"Separate component from
Button: a link navigates, a button acts."* Node `6:307`, with a precise spec
(no box, no padding, no radius, no border; `hover:underline` only). Code has it
as `variant="link"` on Button, **19 call sites**.

---

# THE LIBRARY GETS A HOME, AND THE FIRST COMPONENT MOVES IN (2026-08-30)

Jacob: *"pick a component, make sure it has all the best practice hallmarks...
then use the design to create/update our component. Although we should probably
make a packages/components instead for reusability. Should probably also move
our theme stuff to a package/theme."* Alphabetical order — Accordion first.

## The two packages

**`@dorado/theme`** — `theme.css` and `typography.css`, moved verbatim from
`app/styles/`. The tokens and the type ramp are the CSS half of the design
system the Figma file is the drawing of; `base.css` (document chrome,
scrollbars, autofill) stays in the app because it is about the DOCUMENT, not
the theme. `globals.css` now imports `@dorado/theme/theme.css`.

**`@dorado/components`** — ships **source, not a build**: the frontend lists it
in `transpilePackages` and typechecks it as part of its own program, so there
is no dist to drift (the `pinned-pool.d.ts` lesson, applied preemptively). Two
wiring facts that will bite anyone who forgets them:

- **Tailwind v4 only scans the app's own graph.** Without
  `@source '../../../packages/components/src'` in `globals.css`, the package's
  classes silently never generate — the component renders unstyled and nothing
  errors. This was verified from the BUILT CSS (`grid-template-rows` present in
  `.next/static/css/`), not assumed.
- The package carries its own `cn` so it depends on nothing of the app's.

## Accordion — the audit, then the build

**What the drawing says** (node 32:36): chevron **leading** (the old
AccordionSection trailed it), label Body/Medium at foreground, trailing amount
slot, header p-3 gap-2, body pl-4 pr-3 pb-3, `bg-card` separated by border.
"The Content frame is a slot."

**Hallmarks the drawing cannot express, now owned by the code**: a real
`<button>` header with `aria-expanded`/`aria-controls`; the body a labelled
`region`, **`inert` + `aria-hidden` while closed** so a collapsed panel leaves
the tab order instead of merely shrinking; the system's `focus-visible` ring
exactly as `button.tsx` spells it; motion via the CSS grid-rows trick
(`0fr → 1fr`, both directions, `motion-reduce` collapses it) — which let
**framer-motion leave the file**. Not Radix, deliberately: their Accordion
earns its weight on grouped exclusive-open state, which no call site has.

**FIGMA GAPS FOUND BY THE AUDIT — for Jacob, the design side of the contract:**

1. **Accordion has no State axis.** Button, Input, Checkbox, Radio and Switch
   all carry Default/Hover/Disabled (Input adds Focus/Success/Error); Accordion
   carries only Open. The code implemented focus and disabled from the
   SIBLINGS' language — the drawing should say so itself.
2. **No hover treatment** on the header row, where every other interactive
   surface in the file escalates on hover.

**Brand-refresh deltas applied**: chevron moved to leading; the `card`
variant's `eyebrow` label died (the drawing says Body/Medium); paddings took
the drawing's values. `AccordionSection` stayed as the app-side adapter — same
six call sites, same props, money (`total`/`negative` → PriceNumberFlow) kept
on the app's side of the line because the library takes a `trailing` slot and
knows nothing about money.

## The loop, for every component after this one

1. `get_design_context` on the component's variants; read its description.
2. Audit: does the drawing carry the state axes its siblings carry? What can
   it not express (aria, keyboard, motion) that the code must own?
3. Build it in `packages/components/src/`, one file, exported from `index.ts`.
4. The app adopts through a thin adapter where call sites already exist.
5. Record Figma-side gaps HERE; behaviour tests beside the adapter.

Next alphabetically: **Autocomplete** (missing from code entirely — "for
address lookup and any typeahead"), then Button (exists; two divergences
already recorded: the gold, and Link-as-variant).


---

# THE FIGMA GETS THE CODE'S CHANGES BACK (2026-08-30)

Jacob: *"we should probably ALSO update the figma if we make changes."* Done,
via `use_figma` — which, unlike `get_variable_defs`, needs NO live selection,
so the write half of the design contract is automatable after all.

**The Accordion set (32:36) went from 2 variants to 5:**

- `State` axis added — Default / **Hover** (fills with accent, the row
  language) / **Disabled** (opacity 50%, Button's language) — closing the gap
  this file recorded, where every sibling control had a State axis and
  Accordion had only Open.
- `Chevron` axis added — Leading (the drawn default) / **Trailing**, for
  informational accordions with nothing on the right; the trailing variant
  hides the Amount, because the point of it is a header with one right-edge
  occupant. Mirrors the code's `chevron` prop, which refuses the collision the
  same way.
- The set's **description now records the code contract**: built on Radix, the
  header IS the Button, closed content unmounted, motion-reduce honoured.

**Two observations for the design side:**
1. The hover fill had to be a RAW hex — `getLocalVariablesAsync("COLOR")`
   found no local variable matching `accent`, so either that token lives under
   another name or the library colours some things by style. Worth aligning:
   the code's hover is `--accent`.
2. `border/strong`'s variable DESCRIPTION still says `#3d414a` while its value
   resolves `#3f434b` — the code synced to the resolved value; the description
   is stale.


---

# THE ROLL (2026-08-30, overnight) — components landed so far

| component | drawing | code | adopted by | Figma write-back |
|---|---|---|---|---|
| Accordion | 32:36 | Radix + Button trigger, chevron position | AccordionSection (6 sites) | State + Chevron axes, description |
| Button | 25:510 | full three-axis rebuild | base/button.tsx doorway (~190 imports) | — (drawing was ahead of code) |
| Link | 6:307 | anchor + intents | verify-login, payout arrow, sales-tax "?", ProfileMenu ×3, Footer Instagram | — |
| Attachment | 40:54 | progressbar/remove/aria-live hallmarks | ImageUpload | — |
| Upload | **drawn tonight (117:28)** | label-wrapped real input, accept-filtered drops | ImageUpload | new page, 3 states, description |
| Autocomplete | 100:29 | combobox pattern, composed handlers | AddressSearchInput | — |
| Alert | 54:44 | role=alert/status split | checkout payment message | — |
| Avatar | 32:147 | Radix image lifecycle + initials fallback | base/avatar doorway (ProfileMenu) | — |
| Badge | 32:83 | two-axis cva + leading icon slot (Jacob) | — awaiting first adopter | — |
| Field chassis | Popover Field 106:213 | fieldTrigger/fieldPanel/fieldOption, one set of clothes | worn by Select + Autocomplete | description records the code |
| Select | 38:75 (trigger DEPRECATED) | Radix Select on the chassis | — awaiting first adopter | trigger set marked deprecated → Popover Field |
| Checkbox | 15:16 | Radix, hover border-strong added | base/checkbox doorway (8 importers) | — |
| Chip | 32:121 | real button, aria-pressed, dismiss is its own act | StatusChip mapping deferred (status vocabulary is app law) | — |
| Input | 26:391 | one trailing slot (the drawing's own argument), aria wiring | — the FloatingLabel→static-label sweep is its own slice | — |
| Textarea | 37:2 | Input's language + the counter row | same sweep | — |
| Switch | 17:14 | Radix, 36×20 drawn geometry | base/switch doorway | — |
| Skeleton | 32:155 | STATIC by design (shimmer retired) | base/skeleton doorway | — |
| Spinner | 32:191 | role=status + sr-only label, motion-reduce pulse | — awaiting adopter (Logo Loader is app chrome, not an atom) | — |
| Tooltip | 32:177 | Radix: focus opens it too; surface/highest, border not shadow | — awaiting adopter | — |
| Stat | 53:39 | tabular-nums owned by the component (the drawing's own ask) | — /rates is the natural adopter | — |
| Stepper | 54:74 | <ol>, aria-current=step, markers named "Step n of N" | checkout steppers are the adopters-in-waiting | — |
| OTPInput | 96:32 | ONE hidden input drawn as cells; one-time-code autofill | verify-login flow | — |
| Tabs | 39:23 | underline style; transparent-border height-jump fix | base/tabs doorway (4 importers restyled) | — |
| Slider | 31:115 | Radix; caller must label it | base/slider doorway | — |
| SliderField | 99:210 | one value, two editors; clamp on COMMIT not keystroke | custom-purity control is the adopter-in-waiting | — |
| List | 97:35 | real ul/ol under drawn markers; browser counts the numbers | help drawers' "Examples include" lists | — |
| Table | 56:82 | real <table>: the drawing's stated maintenance cost dissolves; aria-sort | base/table + the tanstack data-table system stay pending their own audit | — |

| Dialog | 41:55 | Radix: focus trap, Title/Description labelling; blur overlay kept | base/dialog stays pending its own audit (drawer composition uses low-level pieces) | — |

| Calendar | 49:100/47:21 | react-day-picker restyled; real ChevronLeft replaces the drawing's rotate-90 workaround | base/calendar doorway (SchedulePicker, pickupScheduler, ReviewsDrawer restyled) | — |

| TimePicker | 55:50/55:15 | radiogroup of real buttons; unavailable disabled, not hidden | SchedulePicker/pickup scheduling are the adopters-in-waiting | — |

| Swiper | 59:63 | CSS scroll-snap: native momentum, zero dependency; widening dot | product/category carousels are the adopters-in-waiting | — |

**Remaining on the shelf, with reasons**:
- **Chart (57:2)** — the code side is a charting-stack decision (a real chart
  library vs. drawn geometry), which is Jacob's to make with the dataviz rules
  in hand, not an unattended pick.
- **Header (51:2) / Footer (51:59)** — THE site chrome; adopting the drawn
  Linear pattern restyles every page's frame at once. Wants Jacob watching the
  first render.
- **Logo Loader (42:142)** — eight-frame brand animation, app chrome not a
  library atom.
- **The three adoption sweeps** — forms → drawn Input (every form's look),
  the tanstack data-grid → drawn Table, RadioGroup's card layout — each
  reshapes visible pages; the components are ready and waiting.

**The process, as Jacob corrected it**: adoption is part of the slice — a
package component replaces its app counterpart in the same pass, and buttons
that navigate become Links. Standing notes: Footer's Facebook and X buttons
have never had destinations (need URLs or deletion); the Alert drawing's own
description asks for muted status tokens instead of the 16% opacity trick.
Design decisions taken with Jacob live, both sides updated: **tertiary hover is
an accent fill** (outline rejected; underline is Link's move; px-2/-mx-2 keeps
bare-text alignment while giving the fill geometry) — 15 drawn variants
updated; **Upload** lost the icon box and the dashed border (solid now,
drag-over stays primary) and moved to alphabetical page order.

---

# THE GAP ANALYSIS (2026-08-30) — what the library is missing

Jacob: *"identify other components we'll need and create them in Figma. I would
look at other popular component libraries. Try to fill in all our gaps."*

Measured two ways: against shadcn/ui + Radix Themes (the file already links the
shadcn community kit), and against WHAT THIS APP ACTUALLY RENDERS — which is
the stronger signal, because several "missing" components already exist in
code with no drawing, meaning the drawing is what catches up.

## The gaps, ranked by how hard the app leans on them

| # | component | why it matters HERE | code today |
|---|---|---|---|
| 1 | **Drawer** | THE app pattern — every admin order surface is a drawer, checkout details are drawers | `base/drawer` + hand-styling, no drawing |
| 2 | **Menu** | the action menu SelectMenu / PopoverSelect / ProfileMenu each hand-roll — the deferred "Menu audit" exists because no drawing exists | 3 hand-rolls |
| 3 | **Toast** | transient outcomes ("Added to cart", "Saved") — Alert is inline and permanent; nothing transient is drawn | none |
| 4 | **Pagination** | order lists and admin tables page | `base/pagination` (imports buttonVariants), no drawing |
| 5 | **Empty State** | empty cart, no orders, no addresses — live everywhere | `shared/ui/EmptyState`, no drawing |
| 6 | **Quantity Stepper** | the cart's +/− is the busiest control in checkout | hand-rolled buttons in orderSummary |
| 7 | **Progress** | standalone bar — Attachment's rail, promoted to an atom | none |
| 8 | **Breadcrumb** | account/product navigation depth | `base/breadcrumb`, no drawing |
| 9 | **Banner** | the full-bleed page band (ruling-19 treatment already law in code) | `shared/ui/Banner`, no drawing |

**Considered and NOT drawn, with reasons**: Separator (the border language IS
the separator; a component would be ceremony), Card (bg-card + border is a
token pattern, not a component), Segmented Control (Radio Chip is the segment),
Command palette (a Menu with a Field on top — compose, don't draw), Hover Card
(Tooltip covers the app's need), Toggle Group (Radio Tile/Chip cover it),
Context Menu (no right-click surface in this product).

Each drawn component follows the file's conventions: its own page in
alphabetical order, one frame per set, variants on the 24px grid, the dark
ground, Geist styles, and a description carrying the contract.

## Drawn 2026-08-30 — all nine

| component | page | set node | notes |
|---|---|---|---|
| Banner | 125:2 | 125:4 | band w/ hairlines; action slot swaps for Button/Secondary |
| Breadcrumb | 126:2 | 126:16 | Depth=Full/Collapsed; crumbs wear Link's quiet state |
| Drawer | 127:2 | 127:32 | Side=Right/Bottom; highest + edge hairline; body is a slot |
| Empty State | 127:33 | 127:49 | Action=With/None; 44px secondary icon tile |
| Menu | 132:2 | 132:18 (item) + 132:19 (panel) | actions not values — no check |
| Pagination | 132:955 | 132:965 (item) + 132:966 (bar) | current = primary fill |
| Progress | 132:981 | 132:995 | 25/66/100/Indeterminate; rail may be a pill |
| Quantity Stepper | 132:996 | 132:1016 | Field-chassis language at 36px; AtMin disables |
| Toast | 132:1017 | 132:1041 | Neutral/Success/Danger; icon carries intent, surface never tints |

## The code halves (same day)

| component | code | adoption |
|---|---|---|
| Menu | `menu.tsx` — Radix DropdownMenu; accent highlight, danger intent, Micro-caps labels | see the refit analysis below — none of the three hand-rolls is an unattended refit |
| Progress | `progress.tsx` — Radix Progress; transform-moved indicator, sweep keyframe in theme.css | Attachment's rail can rebase later |
| Quantity Stepper | `quantity-stepper.tsx` — real input, blur clamps, AtMin disables | cart's +/− refit is a recorded sweep |
| Toast | `toaster.tsx` — SONNER, which sat in package.json imported by NOTHING; Toaster mounted in app/layout.tsx; house toast.error persists until dismissed | call sites arrive as flows adopt it |
| Pagination | existing base/pagination RESTYLED: current page = primary fill (was secondary outline) | live on both order tabs |
| Breadcrumb | existing base/breadcrumb RESTYLED off text-neutral-* onto the Link quiet state | live in LayoutProvider |
| Banner / Empty State / Drawer | drawings caught up with code; Drawer restyle stays an eyes-on sweep | — |

**The Menu refit analysis (2026-08-30, so the sweep is filed right):** the
three "hand-rolls" the gap analysis named each turn out to be something other
than a plain action menu on inspection. `SelectMenu` post-D95 is HALF FILTER
(it takes `value` and shows a check — Field language, and its search box has
no clean home in DropdownMenu); `PopoverSelect` IS a field and belongs to the
Field-chassis sweep; `ProfileMenu` is a rich card popover (header with
name/email, link body, footer) whose refit to Menu is a site-chrome redesign.
So the package Menu's first adopter will be a NEW surface (row-action menus in
the admin tables are the obvious one), and the three existing surfaces move
under eyes, not on loop.

Pinned by `shared/ui/base/gap-atoms.test.tsx` (10 assertions): progressbar
aria, sweep pauses under motion-reduce, indicator clamps out-of-range, AtMin
disables-never-removes, typing clamps on blur, garbage reverts, arrows step.

Figma-side notes: the drawn Button/Link stand-ins inside Banner, Drawer,
Empty State are plain frames NAMED for the component they should be
(instance-swap is a click with the libraries panel open; scripting instances
of another page's set was left for a human so the overrides read right).


---

# THE PACKAGE GROWS ITS OWN TEST LANE (2026-08-30, Jacob's ask)

**Folder per component**: `src/button.tsx` became `src/button/Button.tsx`, all
35 components, `git mv` so history follows. `cn.ts` stays at the root (it is
not a component); the root `index.ts` is still the only public surface, now
also exporting `cn`/`SEMANTIC_TEXT_SIZES`.

**Every component has a co-located test**: `src/<kebab>/<Pascal>.test.tsx`,
36 files, 88 assertions, run by the package's own vitest (jsdom + shims for
what jsdom lacks: ResizeObserver, matchMedia, scrollIntoView, pointer capture,
object URLs). `pnpm --filter @dorado/components test`, wired into `pnpm check`
between the frontend lint and typecheck. House style: plain DOM assertions, no
jest-dom.

**Accessibility is part of every test**: `src/test/axe.ts` runs axe-core on the
rendered output and returns violations as readable strings. Two rules are off,
each for a stated reason: `color-contrast` needs a layout engine jsdom lacks
(state-contrast.test.ts pins contrast against the theme tokens instead), and
`region` judges page-level landmark structure no component can satisfy.

**The move found two real bugs** - both shipped, neither visible:

1. **The package `cn` was STOCK twMerge.** Its comment claimed "same recipe as
   the app's shared/utils/cn"; it was not - the app's is TAUGHT the semantic
   type scale, and stock twMerge treats `text-small` as a colour and lets a
   later text-colour DELETE it. cva emits size before the colour compound, so
   every package component composing both was shipping DOM with no font-size
   class. Found the moment the Button law test was ported in and ran against
   the package's own cn instead of the frontend's. Fixed at the source; the
   frontend's cn is now a doorway re-export, so there is exactly one taught
   merge and one size list. Pinned both orders by `src/cn.test.tsx`.

2. **Slider's label landed on a div.** The component forwards props to the
   Radix Root, but `role="slider"` lives on the THUMB - so `aria-label` named
   a plain div and the actual slider read as "50" with no subject, exactly
   what the component's own header comment warns about. axe caught it
   (`aria-input-field-name`). The label now forwards to the thumb.

Two frontend test files moved in with their subject (ruling 31): the Button
law test and the gap-atoms tests, re-homed per component. Frontend suite
174, package 88, total 262.

---

# OVERNIGHT REVISION PASS (2026-08-30 night, Jacob's punch list)

All 28 component revisions applied in Figma + 4 new drawings. Decisions made
under the no-blocking grant, recorded in each component's description:

- **Tertiary hover = underline** (accent fill rejected twice); weight-on-hover
  refused for all three variants because hover must never reflow text.
- **Progress loses Indeterminate** - unknown duration is Spinner's job.
- **Menu stays the ACTION dropdown**; navigation is the Header's (Links).
  A nav dropdown, if ever needed, is its own future pattern.
- **Select's answer** (asked twice): it now WEARS Popover Field's chassis in
  the drawing; what it adds is form semantics (value, name, typeahead,
  disabled options, check-carries-selection). No longer deprecated.
- **Header Signed In=True**: auth CTAs leave, Avatar takes the slot; Product
  link removed everywhere.
- **The "diamond direction indicator"** was the Tooltip's rotated-square
  caret - now a real triangle arrow (4 replaced).
- **Chart stack: Chart.js** (Jacob's default, no counter-opinion) with Area/
  Donut/Sparkline added to Bar/Line.
- **Loader**: spec rewritten to a stroke-flow draw-on (tips -> swirl -> D
  ends), frames to be re-cut to sample that draw.
- New drawings: **Address Card** (163:32), **Hero** (163:35), **Marquee**
  (170:48), **Masked Field** (170:89) - each with the full contract in its
  description (the Masked Field one carries the never-log rule).


---

# PHASE C: ADOPTION + base/ CLEANUP (same night, Jacob's mid-turn grant)

Jacob: "start replacing components across the app with the new ones... I
think most of the components in base/ can be removed now that they've been
replaced."

**The eight doorways are GONE**: avatar, button, calendar, checkbox,
skeleton, slider, switch, tabs. 97 files' imports rewritten from
`@/shared/ui/base/<x>` to `@dorado/components`; the shim files deleted. A
doorway was scaffolding for the migration - once every importer names the
package, the shim is a hop with no information in it.

**What still lives in base/, and why** (16 files, each the LIVE
implementation of an unswept surface): breadcrumb + pagination (restyled to
their drawings tonight, no package counterpart / thin shell), command,
dialog + drawer (app-styled modals; Drawer's restyle is a recorded eyes-on
sweep), form + input + label + textarea (the FloatingLabel form system -
the forms sweep), lens, popover (SelectMenu/Field surfaces), radio-group
(card layout - eyes-on), rating, scroll-area, separator, table (tanstack
data-grid shell - now the DataTable adoption target).

**Adoptions deliberately NOT taken overnight, with reasons**:
- Cart quantity → QuantityStepper: the cart's +/- animates through
  NumberFlow, and that motion is load-bearing in the cart's feel. Checkout
  is also pre-overhaul. First adopter should be a form surface.
- shared/ui/EmptyState → package EmptyState: the app version ALREADY
  embodies the revised contract (bare big icon, one action as children) at
  page scale, with a badge slot the package one lacks; six callers, zero
  visual goal in swapping. Kept as the rich page-scale variant.
- Hero/Marquee/AddressCard/Chart/DataTable/Header/Footer: all reshape
  visible pages - the components sit ready, the first render wants eyes.


---

# ROUND 2 REVISIONS (2026-08-31, Jacob's second pass)

## The overall pass, done first as asked

1. **Components use components**: composition notes stamped on Autocomplete /
   Select / Masked Field (their boxes ARE Input, their panels ARE Popover);
   the drawn stand-in Buttons/Badges/Attachments are named for what to swap.
2. **Design tokens, no random hex**: the file already had a full Color
   collection + Scale + Typography variables. **353 paints bound** to
   variables and **133 text nodes** put on the shared text styles across
   every page I had drawn or touched - raw hex survives nowhere I wrote.
   Code side: Chart resolves tokens AT RUNTIME via getComputedStyle (hex
   remains only as the SSR/test fallback a canvas forces).
3. **Typography components**: every unstyled text node mapped to the file's
   text styles (Micro/Small/Body/H1-H6/Eyebrow, Regular/Medium).
4. **Icon library**: 14 new Icon/* components drawn in the existing lucide
   16x16 wrapper convention (trash, pencil, external-link, upload,
   circle-check, circle-alert, info, triangle-alert, plus, chevron-right,
   chevron-left, arrow-up-down, funnel, phone), strokes bound to
   text/default. High-value instances swapped in: Table sort/filter, Upload,
   Address Card actions, Link's external glyph.

## The individual items

| item | what changed |
|---|---|
| Button | **THE HOVER LAW IS OPACITY** - every variant at 85% of itself; every hover fill/dim/underline deleted, all 45 drawn Hover variants rebuilt as their Default at 85%. NO underline anywhere on Button (46 cleared). |
| Datepicker | Calendar RENAMED Datepicker; the Time Picker page MOVED INTO it; both layouts are ONE card (shared border, zero gap). Code: new `DatePicker` composes Calendar + optional time column; calendar/ and time-picker/ folders merged into date-picker/. |
| Dialog | Cancel far LEFT (footer is SPACE_BETWEEN), code + drawing. |
| Alert | X vertically centered; icon centered with the title line. |
| Address Card | Default badge top-right; optional phone (drawn + code). |
| Radio Card | ONE top row: icon + title + radio, all vertically centered. |
| Tooltip | The pointer is BACK - a filled triangle in the panel surface (Radix Arrow in code). |
| Upload | Uploaded state REDONE: the zone stays, and the files render as ATTACHMENT components below it (outside the label so clicking a file cannot open the picker). Icon slot is a library instance. |
| OTP | Title / cells / resend as a COLUMN. |
| Stat | Tracking up again; numeric values animate through NumberFlow in code. |
| Table | Sort = arrow-up-down/arrow; filter = funnel with aria-pressed, active fills. |
| Chip | Dismissible is a real BOOLEAN component property in Figma (it was already optional in code). |
| Empty State | Icon is an INSTANCE-SWAP property - pick any Icon/*. |
| Footer | Tagline between logo and quote Button; columns justify to the end. |
| Popover Field | RENAMED Popover. |
| Link | No trailing icon (stale node deleted from all 15 variants); external glyph is leading, an Icon/external-link instance, optional DEFAULT FALSE - which the code already was. |
| Header | Nothing was removed - all four original variants exist (renamed with `Signed In=False` when the axis landed) plus the new signed-in one. Five total. |
| Loader | Parked per Jacob - he'll draw the stroke-flow animation himself. |


## Post-round-2 fix (Jacob's screenshots, 2026-08-31)

Two defects from my Link edit, both mine: (1) the external-link icon went
into the component UNBOUND, so every Link instance rendered it - it now
binds to a new `External` BOOLEAN property, DEFAULT FALSE, present in all
15 variants; a stray per-instance "Show leading icon" override in the
Footer is cleared. (2) The footer's five link columns now cluster flush
RIGHT as one group on desktop - right edge on the legal row's line above
Privacy/Terms/Accessibility - with Brand alone on the left. (A collapsed
FILL-in-HUG squeeze and a stuck 60px label width surfaced while regrouping;
both fixed - "Company" wraps no more. MOBILE legal row mirrors the two-column
grid: (c) in the left cell, Privacy/Terms in a right cell whose left edge IS
the right column's left edge (both cells fixed at the columns' own 159px).)


## Footer round 3 (2026-08-31)

Social row (Icon/instagram, Icon/x-twitter, Icon/youtube - three new brand
glyphs in the library, strokes bound to tokens) sits above the legal row on
BOTH layouts, at subtlest, raising on hover. And the LINK DEFAULT IS
FOREGROUND again: the drawn Link set always said text/default - the muted
rest state was the CODE's own invention ("the nav/footer treatment") and it
dimmed every adopter. Code neutral is text-foreground now, `intent="muted"`
keeps the quiet treatment for surfaces that want it, and 44 footer link
instances had their overrides cleared to inherit the component.


## Footer round 4 (2026-08-31)

Jacob replaced my hand-drawn brand glyphs with his own Icon/instagram /
x-twitter / youtube components (203:*). His pasted vectors had all lost
their offsets (everything at 0,0 - instagram's lens in the corner), so the
artwork was re-placed on the 16-grid, sizes and paths untouched. The mobile
social row now instances HIS components at native 16 with subtlest strokes;
the DESKTOP footer carries no social row at all (mobile-only, his call).


## Footer round 5 (2026-08-31) - the real marks, and the mobile grid rebuilt

**The icons are Jacob's actual SVGs now**, imported from
`frontend/public/icons/social_media/white/` (the folder is the source of
truth): facebook, instagram, linkedin, x - scaled to the 16-grid, fills
bound to text/default. My hand-drawn glyphs are gone; there is no youtube
file so there is no youtube icon.

**The mobile Columns frame was the bug.** It had drifted into a GRID whose
cells nested categories inside each other (Product ended up INSIDE the
Legal column), so adding a fifth section exploded the layout. It is now a
plain WRAPPING row of five equal 159px category cells - Product, Metals,
Company, Connect, Legal - which means a sixth category just wraps onto the
next line and nothing nests. Privacy/Terms moved under the new Legal
heading; category headings are H6 at placeholder (they are labels, not
links, so the link-colour restore must not brighten them); the bottom row
justifies the copyright left against the social marks right. The mobile head is a
Brand row: logo left, tagline over the Get a Quote button right-aligned
beside it. The mobile tagline is a SHORTER sentence than desktop's ("Fast.
Insured. Paid on arrival.") - the long one wrapped to three ragged lines at
that width, and a wrap is not a layout.

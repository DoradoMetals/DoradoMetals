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

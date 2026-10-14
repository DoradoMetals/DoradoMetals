# Figma sync

The component library calls itself "the code half of the Figma 'Themes and
Components' file". Nothing checked the two halves still agreed. These scripts
do.

They found, on their first run: `--placeholder` one unit of green off its Figma
variable, Icon Button painting its glyph raw `#ffffff`/`#000000` instead of a
token, and 46 icons whose stroke weight does not match their size.

## The four commands

| command | asks |
|---|---|
| `pnpm figma:pull` | takes a capture and WRITES it: refreshes `snapshot.json`, then applies every mapped Figma value into `packages/theme`. The generator. |
| `pnpm figma:tokens` | does `packages/theme` still say what the Figma variables say - every colour, spacing step, radius and type step, units converted on both sides |
| `pnpm figma:inventory` | which drawings have code, which code has a drawing, and has the map gone stale |
| `pnpm figma:hygiene` | is drift inside the Figma file growing - unbound colours, unbound spacing, text with no style, icons at the wrong stroke weight |

`pnpm figma:check` runs the three checks. They are pure file reads: no database,
no network, ~100ms, and they run in `pnpm check`. `figma:pull` is NOT a gate
member - it writes, and it needs a capture to write from.

## Why there is a snapshot instead of an API call

The REST variables endpoint is the obvious answer and it does not work here.
`GET /v1/files/:key/variables/local` needs the `file_variables:read` scope,
which `FIGMA_TOKEN` does not carry, and an Enterprise plan besides - this
account is on Pro. The token reads files, nodes, images, components and
comments perfectly well; variables and text styles it cannot see at all.

So the variables and text styles come through the Figma MCP server, which
authenticates interactively and therefore only from inside an agent session.
The Figma state is **captured by an agent and committed**, and the checks are
deterministic diffs against that file. The consequence, stated plainly: **a
check is only as fresh as the last capture.** It cannot tell you the designer
changed something an hour ago. What it does catch, reliably, is the far
commoner direction - someone edits `theme.css`, renames a component directory,
or lands a component whose drawing was never made, and the committed snapshot
disagrees.

Re-capture whenever the Figma file changes. It is two tool calls and one
command.

## Re-capturing, and regenerating the theme

1. Open `capture.js`. It holds two scripts, `PART_1` and `PART_2`, with the
   reasoning for each.
2. Run `PART_1` through the Figma MCP `use_figma` tool against file key
   `8A73quhBLBqotJlX95jN9j`. Write its whole result to a JSON file.
3. Run `PART_2` the same way, into a second JSON file.
4. `pnpm figma:pull <part1.json> <part2.json>`. It writes `snapshot.json` and
   then patches `packages/theme`, and prints what it added and changed.
5. `pnpm figma:check` and deal with what it says.

`PART_2` sweeps every page in one call by using `page.loadAsync()` rather than
`setCurrentPageAsync` - it never changes the current page, so the
one-switch-per-call rule does not apply and a whole-file sweep is one call
instead of fifty.

**PART_1 captures alpha and rounds** (2026-09-06). Two things the first version
did not, and both showed up the moment the soft status tokens landed:

- A colour variable's alpha is captured as its own `opacity` field. The soft
  tints are the SAME hex as their solid siblings and differ only in alpha, so
  hex alone reported four duplicate colours and could never have caught a 16%
  that drifted.
- Floats are rounded to 4 places. Figma stores them as float32, so `0.045`
  reads back as `0.04500000178813934` and a re-capture diffs against itself on
  eighteen typography variables that nobody changed.

**PART_2 excludes a COMPONENT_SET's own gap and padding** (2026-10-10). An
auto-layout set container is how Figma arranges the variant grid, not a
drawing - the same reason its 5px corner was already excluded. Counting it
charged Chat 15, Headers 5 and Selection Bar 5 for nothing. The capture reports
`setChromeExcluded` so the number is visible rather than merely absent.

## What the generator writes, and what it refuses

`pull.mjs` is a patcher, not a code generator: it sets VALUES on the
declarations the map names, inserts the ones that do not exist yet into the
right block, and leaves everything else - the structure, the Tailwind pins that
are not derived, the animations, the rationale - exactly where it was. Running
it twice is a no-op, and `--check` says whether the committed files already
match a capture.

It owns:

- the `--spacing-*`, `--breakpoint-*` and `--max-width-*` runs in the plain
  `@theme` block, each sorted by value;
- every `--text-<step>` group, size in rem, line-height as a unitless ratio,
  letter-spacing in em and the weight taken from the step's CANONICAL text
  style;
- the whole `@media (width < Nrem)` ramp, regenerated from the Typography
  collection's Mobile mode - a step only appears there if it actually moves;
- the colour literals, the strokes, the opacities, the control ladder and the
  radius `calc()`s;
- `.eyebrow`'s letter-spacing and weight in `typography.css`, a `.stat-*`
  utility for every stat step, and - because the mailers cannot read a custom
  property - the one hardcoded `letterSpacing` inside `eyebrowType` in
  `packages/components/src/email/style.ts`. Those three are the same number in
  three places and the generator is what keeps them equal.

It refuses to run at all when Figma holds a variable or a text style that
`map.mjs` does not declare, and it names each one. **The generator never
invents a CSS name.** That is the whole reason the map exists, and it is why
adding `status/pending` to the library makes the tool stop rather than guess
`--status-pending`.

It also refuses when a new `--spacing-<key>` shadows a Tailwind container name
it has no pin for. Tailwind v4 resolves `max-w-<name>` through
`--max-width` then `--spacing` then `--container`, so `--spacing-4xl` silently
turned `max-w-4xl` from 56rem into 6rem until the matching `--max-width-4xl`
pin landed beside it. The generator emits that pin automatically from
`TAILWIND_CONTAINERS`; a colliding key with no entry there is an error, not a
guess. The trap cost a day in August - see `packages/theme/README.md`.

## A variant's `defaultValue` is grid order, not a design decision

Recorded because it was acted on and had to be reverted on 2026-10-10, across
four components in one pass.

`componentPropertyDefinitions[axis].defaultValue` in the REST payload is the
variant that happens to sit FIRST in the set's grid. It is not a statement
about what the component should do when a prop is omitted. Reading it as one
made `Text` default to Display, so a bare `<Text>` rendered at 64px; `Badge`
default to Solid, undoing an audited decision in favour of Soft; `Avatar`
default to XS; and `Thumbnail` default to SM. Every existing call site would
have silently restyled, and no Figma description asked for any of it.

The rule: a code default changes only when the component's Figma DESCRIPTION
says so, or Jacob does. The variant list, the option names, the sizes, the
states and the token bindings all come from the drawing. The default does not.

## The map is the point

`map.mjs` holds the correspondence, and it exists because the two sides share
no naming scheme: `surface/background` is `--background`, `text/muted` is
`--muted-foreground`. No string transformation derives one from the other, so
guessing would produce either false matches or a wall of noise.

That makes **an unmapped token a finding**, which is the behaviour worth having:
add `status/pending` to the library, design three screens against it, and
`figma:tokens` says the app has no such colour rather than quietly passing.

Every escape hatch needs a reason next to it - `COLOR_CSS_ONLY`, `PENDING`,
`NOT_A_COMPONENT`, `DIR_NOT_DRAWN`. The checks verify the hatches themselves are
still real: a `PENDING` page that has since been built, or an accepted exception
whose page was renamed, is a failure. That is what stops the list rotting into a
graveyard.

## The hygiene budget is a ratchet

`HYGIENE_BUDGET` in `map.mjs` is set to what was measured, not to zero. The
file has thousands of component nodes drawn over months and it had real drift;
failing on all of it would have got the check switched off in a day. Failing on
*growth* means the next component cannot add to the pile.

**Lower a budget when you fix something. Never raise one to make the gate
pass.**

That rule was broken once, deliberately and on the record, on 2026-10-10 — and
the record is the point. The library gained five pages in two days (Card,
Estimator, Item Details, Photo Viewer, Selection Bar) and consolidated three
headers, and the re-capture moved four categories up: colour 0 to 5, spacing 24
to 72, text style 93 to 95, icon weight 8 to 44. Every finding was inside the
Figma file and none was reachable from this repo, so there was nothing to fix
from the code side and nothing to lower. The choice was between a stale
snapshot that hid the drift and an honest one that raised the number, and the
honest one won, with `HYGIENE_NOTES` carrying the page-by-page hand-off.

The library worker cleared all of it within the hour. Colour, spacing, radius,
icon fill and icon weight are at **zero**, measured over 4287 nodes, which this
file has never managed before. So the episode reads the other way round from
how it looked at the time: **the raised number is what got it fixed.** If you
are about to do the same thing, that is the bar — the growth is somebody else's
file, the list is named and routed to whoever owns it, and the note says so. A
raise to spare yourself the work is still the thing the rule forbids.

`textStyle` followed on 2026-10-13: the library gained `Field/Regular` (16px
Regular on `size/field`, `line-height/field`, `letter-spacing/field`), every
field value took it, and the re-capture measured **all six categories at zero
over 4322 nodes**. Every budget is zero now; there is nothing left to ratchet
down, only growth to refuse.

## The scale-true stroke rule

Recorded here because it caused three rounds of rework and is invisible on
inspection: **the Icons library masters are 24px drawn at stroke weight 2, and
resizing an instance in Figma does not scale its stroke.** A 12px instance left
at weight 2 renders at double weight; a 28px one left at 1.333 renders far too
thin. The correct weight is always `2 x (size / 24)`. `figma:hygiene` counts
every violation.

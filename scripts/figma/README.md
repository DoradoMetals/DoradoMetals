# Figma sync

The component library calls itself "the code half of the Figma 'Themes and
Components' file". Nothing checked the two halves still agreed. These scripts
do.

They found, on their first run: `--placeholder` one unit of green off its Figma
variable, Icon Button painting its glyph raw `#ffffff`/`#000000` instead of a
token, and 46 icons whose stroke weight does not match their size.

## The three checks

| command | asks |
|---|---|
| `pnpm figma:tokens` | does `packages/theme` still say what the Figma variables say - every colour, spacing step, radius and type step, units converted on both sides |
| `pnpm figma:inventory` | which drawings have code, which code has a drawing, and has the map gone stale |
| `pnpm figma:hygiene` | is drift inside the Figma file growing - unbound colours, unbound spacing, text with no style, icons at the wrong stroke weight |

`pnpm figma:check` runs all three. They are pure file reads: no database, no
network, ~100ms, and they run in `pnpm check`.

## Why there is a snapshot instead of an API call

There is no Figma token in this repo. `.mcp.json` points at the hosted MCP
server (`https://mcp.figma.com/mcp`), which authenticates interactively - so
nothing runnable from a shell can reach the file. Reading variables over the
REST API needs an Enterprise plan besides.

So the Figma state is **captured into `snapshot.json` by an agent** and
committed, and the checks are deterministic diffs against that file. The
consequence, stated plainly: **a check is only as fresh as the last capture.**
It cannot tell you the designer changed something an hour ago. What it does
catch, reliably, is the far commoner direction - someone edits `theme.css`,
renames a component directory, or lands a component whose drawing was never
made, and the committed snapshot disagrees.

Re-capture whenever the Figma file changes. It is two tool calls.

## Re-capturing

1. Open `capture.js`. It holds two scripts, `PART_1` and `PART_2`, with the
   reasoning for each.
2. Run `PART_1` through the Figma MCP `use_figma` tool against file key
   `8A73quhBLBqotJlX95jN9j`. Write its `collections`, `textStyles` and `pages`
   into `snapshot.json`.
3. Run `PART_2` the same way. Write its result into `snapshot.json` as
   `hygiene`.
4. Update `capturedAt`.
5. Run `pnpm figma:check` and deal with what it says.

`PART_2` sweeps every page in one call by using `page.loadAsync()` rather than
`setCurrentPageAsync` - it never changes the current page, so the
one-switch-per-call rule does not apply and a whole-file sweep is one call
instead of fifty.

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

`HYGIENE_BUDGET` in `map.mjs` is set to what was measured on 2026-09-03, not to
zero. The file has 3911 component nodes drawn over months and it has real drift;
failing on all of it would get the check switched off in a day. Failing on
*growth* means the next component cannot add to the pile.

**Lower a budget when you fix something. Never raise one to make the gate pass.**

Two categories will never reach zero, and the notes in `map.mjs` say so:
pill and circle radii have no token and should not get one, and `INSTANCE_SWAP`
replaces a bound stroke with the swapped component's own raw paint, so a
swapped icon arrives untokenized until the Icons library binds its own strokes.

## The scale-true stroke rule

Recorded here because it caused three rounds of rework and is invisible on
inspection: **the Icons library masters are 24px drawn at stroke weight 2, and
resizing an instance in Figma does not scale its stroke.** A 12px instance left
at weight 2 renders at double weight; a 28px one left at 1.333 renders far too
thin. The correct weight is always `2 x (size / 24)`. `figma:hygiene` counts
every violation.

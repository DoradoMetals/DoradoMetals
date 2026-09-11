# Responsive typography, Figma first (ruling 103)

Ruling 102 left the ramp half built: `theme.css` carried a
`@media (width < 64rem)` block **whose every value repeated the Default**,
because Figma's Typography collection had one mode and nothing had been
decided. Ruling 103 is Jacob handing the decision over - *"You make the
decision"* - and ruling 96 decides the ORDER: the values went into the Figma
library first, then into code.

Worktree `type-lane`. `scripts/figma`, `packages/theme`, `packages/components`
and one frontend test. No API, no database, no component props moved.

## What went into Figma

`use_figma` wrote to the library "Themes and Components"
(`8A73quhBLBqotJlX95jN9j`) directly. Nothing was blocked: `whoami` reports a
Full seat on "exchange's team", both writes returned their own verification
dump, and the re-capture read them back.

**The file already works by variables, which is what made a mode the right
shape.** The READ pass established it before anything was written: all sixteen
text styles bind `fontSize`, `lineHeight`, `letterSpacing` AND `fontWeight` to
Typography variables (`Display` -> `size/display`, `line-height/display`,
`letter-spacing/display`, `weight/semibold`). So a second MODE on that
collection re-sizes every style at once, and no style had to be edited.

### 1. The five missing breakpoints (Scale collection)

`breakpoint/xs` 304 was the only one Figma had; `sm` 640, `md` 768, `lg` 1024,
`xl` 1280 and `2xl` 1536 are now beside it, FLOAT, `WIDTH_HEIGHT` scope, each
described as the Tailwind step it is. `figma:tokens` checks all six against
`--breakpoint-*` now, which is the direction
`frontend/shared/tests/theme-breakpoints.test.ts` could never check.

### 2. A second mode, `Mobile`, on Typography

Default is untouched. Fifteen of the collection's 39 variables move; the other
24 carry their Default value explicitly, so nothing resolves by accident.

| text style | Default | Mobile | why |
|---|---|---|---|
| `Display` | 64 / 67.2 | **32 / 38** | 64px cannot fit 390 |
| `Heading/H1` | 36 / 41.4 | **32 / 38** | the Hero's own Figma description says "Mobile: 32/38 headline" |
| `Heading/H2` | 28 / 34.16 | **22 / 26.84** | one ramp step down |
| `Stat/Default` | 36 / 39.6 | **30 / 33** | one ramp step down |
| `Stat/Small` | 30 / 34.5 | **28 / 32.2** | one ramp step down |
| everything else | — | = Default | already small enough; `map.mjs` `MOBILE_UNCHANGED` records the reason per step |

**The rule, and it is one rule rather than five judgements**: a Mobile step
takes the next smaller SIZE in the ramp and keeps its OWN line-height and
letter-spacing RATIOS. The CSS does that for free - line-height is unitless and
letter-spacing is em - so the only work was computing the px each ratio lands
on and writing those into the Figma mode, which is why the Mobile mode carries
its own `letter-spacing/*` values and not just sizes.

Display and H1 are the one exception, and they are not invented: the Hero's
description asks for 32/38, a pair the ramp does not otherwise have
(38 / 32 = 1.1875).

**`H2` and `H3` both render at 22px below md.** Recorded rather than patched
around: they stay apart by line-height (26.84 against 28.6) and by level, and
inventing a 24px step to separate them would be a ramp value the library does
not draw. If that reads wrong on a real screen, the fix is a decision in Figma,
not a nudge in CSS.

### 3. The capture

`capture.js` `PART_1` captured `modes[0]` and would have read the entire new
mode as absent. It reads `defaultModeId` now, and where a collection has more
than one mode every variable carries a `modeValues` map. **`value` still means
the DEFAULT mode**, so every check written against one mode reads exactly what
it read before. `PART_2` is unchanged and the sweep is identical - 3520 nodes,
`color 0 / spacing 24 / radius 0 / textStyle 93 / iconFill 0 / iconWeight 8`,
the committed budget to the unit. `capturedAt` is `2026-09-11`; pages stay at
61 and the Color collection is byte-identical.

## What went into code

### `packages/theme`

The ramp block is `@media (width < 48rem)` - **`--breakpoint-md`, not the 64rem
the shell lane guessed** - and carries only the five steps that change. The
seven it is silent about resolve to the base ramp on both sides, which is also
how `check-tokens` reads it, so a step cannot be listed in one place and
forgotten in the other.

The six `--breakpoint-*` moved from `@theme inline` into the plain `@theme`
block. **A variable declared inline is never emitted**, and the hook now reads
these off the root element. Tailwind inlines the value into its own `@media`
conditions either way, because a media query cannot read a custom property -
which is exactly why the 48rem in the ramp block is a literal, and why a test
pins that literal to the token.

### `useBreakpoint`

`breakpointPx(bp)` reads `--breakpoint-<name>` off `document.documentElement`,
parses rem (against the constant 16, which is what a media query resolves rem
against) or px, and falls back to the compiled `BREAKPOINTS` per step. It
caches, but **refuses to cache a read where nothing resolved at all** - a call
made before the stylesheet is applied would otherwise pin the fallbacks for the
life of the page. The server has no document, so the SSR snapshot is unchanged
and hydration still cannot mismatch.

`BREAKPOINTS` stays declared because a hook has to answer during server
rendering. It is the fallback now, not the answer.

### `Text` needed nothing, and that was verified rather than assumed

Every variant is a ramp token - `text-h1`, `.display`, `.stat`, `.stat-sm`,
`.micro`, `.eyebrow` - and the type ramp lives in a PLAIN `@theme` block, so
Tailwind's utilities reference `var(--text-h1)` instead of inlining `2.25rem`.
Redefining the variable in a media query is therefore the whole mechanism.
Measured in a real browser, not reasoned about: see Screenshots.

### `check-tokens` learned the second mode

A new section compares the Figma Mobile mode against the CSS block, per step,
on size AND line-height AND letter-spacing, all resolved to px. It also
compares the media query's literal against `--breakpoint-md`, and reports
either half of an asymmetry: Figma with a Mobile mode and no CSS block, or a
CSS block with no Figma mode - *"the code invented a ramp the library does not
draw"*.

**A latent bug in `lib.mjs` had to be fixed first, and it would have broken the
gate the moment this lane's values landed.** `readCssVars` was a flat scan over
the whole file, so a later declaration overwrote an earlier one - and the ramp
block sits between `@theme` and `:root`. It was harmless only while every value
in it repeated the Default; with `--text-h1: 2rem` below md, **every
Default-mode check would have compared Figma's 36px against the MOBILE 32px**
and reported the ramp broken. `loadTheme()` now cuts `@media` blocks out of the
base and hands the narrow-width one back separately.

Self-tested by breaking it on purpose: moving the block to 64rem and the
headline to 33px/1.2 produced four findings - the breakpoint mismatch and all
three of size, line-height and letter-spacing - and exit 1.

## Screenshots

`next dev` on **:3007** from this worktree, Chrome driven by Playwright,
stopped by pid afterwards. Under
`…/38d118cb-3136-4d6d-8b42-7b9dc267a5a7/scratchpad/shots/`:

```
home-390.png     home-1440.png
sign-in-390.png  sign-in-1440.png
```

Measured on the page, not in a stylesheet:

| page | width | `h1` | `--text-h1` | `--breakpoint-md` | h-scroll |
|---|---|---|---|---|---|
| `/` | 390 | **32px / 38px**, tracking −0.768px | `2rem` | `48rem` | none |
| `/` | 1440 | 36px / 41.4px, tracking −0.864px | `2.25rem` | `48rem` | none |
| `/auth/sign-in` | 390 | — | `2rem` | `48rem` | none |
| `/auth/sign-in` | 1440 | — | `2.25rem` | `48rem` | none |

Two things worth stating plainly. The 32/38 is the **computed** value on the
Hero's real headline, which proves the whole chain - Figma mode, CSS block,
Tailwind's `var()` reference, `Text`. And **`--breakpoint-md` resolves to
`48rem` in the browser**, which is the change that makes `breakpointPx`
meaningful; before this lane it read empty.

**`/auth/sign-in` has no `h1` at all.** Its only heading is an `h4` "Welcome
back" at 18/25.2 at both widths - H4 is one of the seven steps the Mobile mode
deliberately does not move. So the auth screen is unchanged by this lane, which
is the correct outcome and not a missing screenshot.

## Verification

| check | result |
|---|---|
| `pnpm figma:check` | **clean** - tokens (46 colour, 29 Scale incl. six breakpoints, 12 steps, both modes, 16 text styles), inventory, hygiene at budget |
| `@dorado/components typecheck` | 0 |
| `@dorado/components test` | 65 files, **399 tests** green (was 395) |
| `@dorado/frontend typecheck` | 0 |
| `@dorado/frontend test` | 8 files, **157 tests** green (was 154) |
| `pnpm check` | **CHECK_EXIT=0**, 44 members, 306s |

`pnpm check` on this branch does **not** carry a frontend group - its five
groups are api-lint, api-test, design, components and dev-db - so the two
frontend rows above were run directly and are not covered by the gate.

**Dev moved under this lane mid-gate, and it is worth recording because it is
what a shared dev database does.** A run at 23:20 was green; a run at 23:45 on
the same tree failed `contracts:verify:fresh` and `api:verify:genesis`, both
naming `media.emails` and four columns this lane never touched
(`delivered_at`, `bounced_at`, `bounce_reason`, `complained_at`, plus an index
on `to_address`) - another lane's migration against the shared dev Postgres.
The generated contract was regenerated to see the diff and then **reverted**:
absorbing it would have put columns on this branch that this branch's
migrations do not create. The third run, on the final tree, is green on both.
Nothing here was worked around.

## What this lane did NOT do

- **No component was re-drawn against the mobile ramp.** The `… / Mobile` card
  variants in the Orders file (`Lots`, `Spots`, `Charges`, `Payment`,
  `Shipment`, `Pickup`, `Order Header`) are still the per-card rebuild ruling
  102 named, and the Lots row is still a desktop table at 390.
- **No Mobile mode on the Color or Scale collections.** Spacing does not step
  down with width today; that is a separate decision and nobody has asked for
  it.
- **The library was not re-published.** The variables and the mode are in the
  file; pushing them to consuming files is a publish, and that is Jacob's.

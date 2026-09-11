# The app shell and the responsive type ramp (ruling 102)

Jacob, looking at the placeholder home page: *"the footer/header are both wrong.
Guess we probably need to do the app layout, eh? I want responsive design and
typography, just remember that part. Maybe we need a 'real' typography component
that calls like, a use breakpoints hook."*

Worktree `shell-lane`. `packages/components`, `packages/theme`, `frontend/` and
one line of `scripts/figma/map.mjs`. The API did not change.

## The black-on-black was a brand asset, not a palette

The report was "black on black with only the footer's link column visible: no
header, no hero". The palette was never wrong - `--background` is `#09090c`,
`--foreground` is `#f6f7f9`, and a Playwright probe measured exactly those on
`header`, `h1`, `main` and `footer` before anything was changed. What was
invisible was the **brand mark**, which is the only thing in the header besides
the sign-in link and the only thing in the footer's first column besides a
tagline the page was not passing. With the mark gone the header reads as an
empty bar and the footer reads as one stray link column.

**`frontend/public/icons/branding/symbol/white/symbol.svg` declared
`viewBox="0 0 117313.1 34472.979"` while its artwork's bounding box measured
`x=22.84 y=26.84 w=292.5 h=135.24`.** The drawing therefore occupied 0.25% of
the declared canvas: at the 104px the page asked for, the mark rendered
**0.26px wide**. The file loaded with a 200 and a `naturalWidth` of 117313, so
nothing anywhere reported a fault.

The cause is an Illustrator export that **squared each dimension**, and that is
provable rather than inferred: `sqrt(117313.1) = 342.51` and
`sqrt(34472.979) = 185.669`, which is *exactly* the viewBox of the uncoloured
sibling `symbol/symbol.svg` that was never broken. The same held for the other
two marks - `sqrt(708778.74) = 841.89` = `full/full.svg`, and
`sqrt(311443.23) = 558.071` = `name/name.svg`.

Six files were repaired by taking the square root of their `viewBox`, `width`
and `height`: `symbol`, `full` and `name`, each in `white/` and `black/`. The
three files not in a colour folder were already correct and were left alone.
No path data was touched.

The auth screens draw the same asset, so sign-in had an invisible logo too.
`AuthShell` also stretched it 10% horizontally by pinning both axes
(`h-[51px] w-[104px]` against a 1.845 aspect); it is height-plus-`w-auto` now.

**One more broken export is NOT fixed here, because it is out of this lane's
scope**: `packages/icons/src/GoogleLogo.tsx` carries `d="Frame"` - the Figma
export wrote the layer name where the path data belongs - and the browser logs
`<path> attribute d: Expected moveto path command ('M' or 'm'), "Frame"` on
every auth screen. It is one line in `packages/icons`.

## What Header, Footer and Hero got wrong against the drawings

Read from the library file `8A73quhBLBqotJlX95jN9j`: Header `51:2`, Footer
`51:59`, Hero `163:33`, plus `get_design_context` on the Hero master `163:35`
and the Header's Nav frame `51:10`.

| drawn | code was | now |
|---|---|---|
| Header mobile (`51:57`) is brand + hamburger, nothing else | the mobile group rendered `trailing` beside the toggle | mobile is brand + toggle; `trailing` is desktop-only |
| Header nav link (`51:10`) is **Small/Medium 13px, letter-spacing 0, sentence case, `text/muted`** | `.nav-link` was `letter-spacing: 0.1em; text-transform: uppercase` - the Eyebrow treatment borrowed onto a nav link | `.nav-link` is the drawn Small/Medium; the uppercase and the 0.1em are gone |
| Footer mobile (`76:176`) is a two-up grid of link columns | `flex-wrap` with `w-[150px]` children and `justify-center` | `grid-cols-2` below lg, the row from lg |
| Hero CTA row (`163:35`) is `spacing/xs` gap and `spacing/xs` top padding | `gap-2.5 pt-2` | `gap-xs pt-xs` |
| Hero frame padding is `spacing/3xl` | `px-6 py-16 sm:p-3xl` | `px-lg py-3xl sm:p-3xl` |

Confirmed correct and left alone: the header's 64px desktop / 72px mobile
heights, its 32px / 16px side padding, the 24px nav gap and the 20x1px divider;
the Hero's `text-h1` headline (resolved to Heading/H1 in Figma on 2026-09-03),
its Heading/H5 muted sub-line, its Micro/Regular trust line in
`foreground-placeholder`, and its `size="lg"` buttons at 44px.

## The layout

`frontend/app/layout.tsx` now wraps every route in `shared/ui/AppShell.tsx`,
inside the existing providers and inside `LayoutProvider` - the seam the nuke
left for exactly this. `AppShell` is a client component because it needs
`usePathname`, and it decides by prefix:

| route | chrome |
|---|---|
| `/auth/**` | **none.** `AuthShell` draws its own full-bleed panel, and the e2e spec "the auth surface carries no site nav or footer" pins it |
| `/admin/**` | Header, **no Footer** |
| everything else | Header, `main`, Footer |

**Admin gets no footer because the drawings say so.** Every frame in the Orders
file `ymmNlCDLVIfanpRQ7QHMIs` - Purchase Order, Sales Order (Refiner), Sales
Order (Admin), Purchase Order (Refiner), both drafts - is a Header instance at
`y=0, 1440x64` followed by Content at `y=64`, and not one carries a Footer.

**Header links are routes that exist, and nothing else.** Figma draws How It
Works / Pricing / About / Contact / Login and a Get a Quote button; five of
those six routes were deleted by the nuke, so the nav slot is empty and the
trailing slot carries a Sign in link when signed out, or the drawn Avatar with
a menu (Account, Admin for admins, Sign out) when signed in. On mobile the same
entries live in the Drawer behind the hamburger, which is where the drawn
`Drawer Open=True` variant points.

`app/page.tsx` is now the Hero alone.

## The admin screens were desktop-only

`AdminOrderScreen` and `AdminRefiningScreen` pinned `w-[400px] shrink-0` asides
beside a flexed main column with `p-xl` page padding, so at 390px the page
overflowed to 456px and the Order Header card's two halves overlapped. The
Orders file's mobile variants are drawn at **358 wide inside a 390 screen** -
16px padding, one column - so both screens are `p-md lg:p-xl`, both bodies are
`flex-col lg:flex-row`, and every aside is `w-full lg:w-[400px] lg:shrink-0`.
`OrderHeaderCard` stacks the same way, and the five fixed widths inside the
cards (`320`, `240`, `420`, `280`, `220`) are `w-full` below lg.

**Still not right at 390, and named rather than half-fixed**: the Lots row
remains a desktop table squeezed into 358px. The Orders file draws a
`Lots / Mobile` variant (`170:2421`) that reshapes the row into a stacked card,
and `Spots / Mobile`, `Charges / Mobile`, `Payment / Mobile`, `Shipment /
Mobile`, `Pickup / Mobile` and `Order Header / Mobile` exist beside it. Those
are per-card rebuilds against their own drawings, not a stacking pass.

## `Text`

`packages/components/src/text/Text.tsx`. One element, `variant` is the
Foundations ramp by the names the snapshot's `textStyles` carry, `as` picks the
tag, and the whole appearance is a ramp token - the test refuses any
`text-sm`/`leading-[…]`/`tracking-[…]` on the output.

| variant | Figma text style | default tag |
|---|---|---|
| `display` | Display 64/67.2 SemiBold | `h1` |
| `h1` … `h6` | Heading/H1 … Heading/H6 | `h1` … `h6` |
| `body` / `body-medium` | Body/Regular, Body/Medium 15/24 | `p` |
| `small` / `small-medium` | Small/Regular, Small/Medium 13/19.5 | `small` |
| `micro` / `micro-medium` | Micro/Regular, Micro/Medium 12/17.4 | `p` |
| `eyebrow` | Eyebrow 12/17.4 Geist Mono | `p` |
| `stat` | Stat/Default 36/39.6 | `p` |
| `stat-sm` | Stat/Small 30/34.5 | `p` |

Sixteen variants for the sixteen text styles. Colour is `emphasis`
(`default` / `subtle` / `subtlest`), which sets the existing `data-emphasis`
attribute rather than a colour class.

**The raw-utility sweep found almost nothing to do**: `packages/components` had
**zero** `text-sm`/`text-lg`-style utilities already, and `frontend/` had one -
`OrderHeaderCard`'s `font-mono text-micro uppercase tracking-[0.1em]`, which is
`.eyebrow` spelled out by hand. It is `<Text variant="eyebrow">` now. `Text` is
what the app uses for prose from here.

`Text` has no Figma page of its own and is recorded in `map.mjs`'s
`DIR_NOT_DRAWN` with the reason "the ramp is Foundations".

## Breakpoints, and the five Figma is missing

`useBreakpoint` lives in `packages/components/src/hooks/`. It is SSR-safe by
construction: `useSyncExternalStore`'s server snapshot is always `false`, so the
first client render matches the HTML and `matchMedia` is only read after mount.
It returns `{ breakpoint, mounted, isAbove, isBelow }`. `useMediaUp` answers one
query; `useMounted` is the mounted flag on its own.

**It is for LAYOUT.** `AppShell` uses it to close the mobile drawer when the
viewport crosses `lg`. Type is not its business.

| token | px | in Figma? |
|---|---|---|
| `--breakpoint-xs` | 304 | **yes** - Scale `breakpoint/xs` |
| `--breakpoint-sm` | 640 | no |
| `--breakpoint-md` | 768 | no |
| `--breakpoint-lg` | 1024 | no |
| `--breakpoint-xl` | 1280 | no |
| `--breakpoint-2xl` | 1536 | no |

**For Jacob to add to the Figma Scale collection**: `breakpoint/sm` 640,
`breakpoint/md` 768, `breakpoint/lg` 1024, `breakpoint/xl` 1280,
`breakpoint/2xl` 1536. They are Tailwind's own steps, which is what the library
has been drawn against implicitly all along - `lg:` is the switch every
component already uses, and the Figma frames are drawn at **390 (mobile)** and
**1440 (desktop)**, which sit either side of `lg`. Until they exist in Figma,
`figma:tokens` cannot check them, so `frontend/shared/tests/theme-breakpoints.
test.ts` checks the other direction instead: it parses
`packages/theme/theme.css` and fails if the hook's copy drifts from it, or if
the theme declares a breakpoint the hook does not know.

## Responsive type is CSS

`packages/theme/theme.css` carries a `@media (width < 64rem)` block that
redefines the `--text-*` ramp on `:root`. **Every value in it is today the same
value as the Default mode**, because Figma's Typography collection has exactly
one mode ("Default") - `docs/design/orders-notes-2026-09-05.md` section 2
records that a Mobile mode was trialled and removed, decision deferred. Nothing
was invented. The block exists so that a Mobile mode, when it is decided, is a
values change in one place and `text-h1` follows on its own, with no hook and no
hydration cost.

**The text styles that need a Mobile value decided in Figma**, and the evidence
that each one needs it:

| text style | why | what the drawing hints |
|---|---|---|
| `Display` 64 | 64px will not fit 390px | — |
| `Heading/H1` 36 | the Hero's own Figma description says **"Mobile: 32/38 headline"** - a size the ramp does not have (h1 36, h2 28) | 32/38 |
| `Heading/H2` 28 | the admin Order Header's mobile variant (`292:5098`) stacks into 358px | — |
| `Stat/Default` 36 | Totals and Profit Breakdown draw their money at Stat on a 400px aside; the mobile variants are 358 | — |
| `Stat/Small` 30 | same | — |

`Body`, `Small`, `Micro`, `Eyebrow` and `Heading/H3`-`H6` are already small
enough that a mobile step is a design choice rather than a fit problem; they are
listed here as "no change proposed" so the next session does not re-derive it.

There is a second, older ramp gap recorded in `map.mjs` and worth repeating
because it blocks 93 hygiene findings: **there is no 16px Regular text style.**
The ramp has Heading/H5 at 16 SemiBold and nothing else, so Input, Select and
Textarea type their value text raw.

## Screenshots

Playwright against a `next dev` from this worktree on `:3002`, talking to an API
started from this worktree on `:5055`, at 390 / 768 / 1440. Under
`…/38d118cb-3136-4d6d-8b42-7b9dc267a5a7/scratchpad/shots/`:

```
home-390.png          home-768.png          home-1440.png
sign-in-390.png       sign-in-768.png       sign-in-1440.png
admin-order-390.png   admin-order-768.png   admin-order-1440.png
```

Measured on every one of them: `header` computed `color` is `rgb(246,247,249)`
on `background-color: rgb(9,9,12)`, `h1` renders at 36px in the same
foreground, and no page scrolls horizontally. `home` carries a header at every
width (72px below lg, 64px from lg) and a footer; `sign-in` carries neither;
`admin-order` carries a header and no footer, and shows the signed-in Avatar at
1440.

## Verification

| check | result |
|---|---|
| `@dorado/components typecheck` | 0 |
| `@dorado/components test` | 65 files, **395 tests**, green (was 390) |
| `@dorado/frontend typecheck` | 0 |
| `@dorado/frontend test` | 8 files, 154 tests, green |
| `@dorado/frontend lint:call-site-styling` | green - 15 files import shared/ui, 0 call sites with a className |
| `pnpm figma:check` | green - tokens clean including the five new breakpoints, inventory clean once `text` was mapped, hygiene at budget |
| `pnpm --filter @dorado/frontend e2e` | **20 passed, 1 failed, 3 skipped** |

**The one e2e failure is not this lane's, and it is not flaky - it is stale dev
data.** `adminRefiningActions.e2e.ts:104` waits for an `Import` button on the
refiner order's Settlement row. The captured DOM shows that row already carrying
**Download Settlement** and **Delete Settlement**: a previous run imported one
and the spec never deletes it, so there is no Import affordance left to click.
It fails identically when run alone, and it touches nothing this lane changed.
The fix is to make the spec clean up after itself (or seed a fresh refiner
order), which is the same non-idempotency the address sweeper in
`auth.setup.ts` was written for.

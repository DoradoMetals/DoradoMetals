# Wave 4 — Lane B (styling)

Owner: lane B agent. Scope: `frontend/**` only (an API agent owns `api/**` and
`packages/contracts/**` concurrently).

```
B1. Shadows deleted, not tokenised          ██████████████████  100%
B2. One radio group, two components deleted ██████████████████  100%
B3. Orders tree typography (263 utilities)  ██████████████████  100%
B4. The D99 state-collapse audit            ██████████████████  100%
B5. Extract shared components; adopt existing ████████████████░░  90%
```

## Meters — both targets reached ZERO

| meter | baseline `a9b7dd61` | now |
|---|---:|---:|
| `lint:typography-scatter` | **306** utilities + 2 arbitrary, 62 files | **0**, 0 files |
| `lint:call-site-styling` | **122** (incl. 98-era contradicted) | **0** |
| — of which CONTRADICTED | 19 | 0 |
| `audit:state-collapse` (new) | 22 findings | **0** |
| retired classes still spelled | 20 names, ~300 sites | **0** |
| frontend tests | 122 | **155** (2 new files, 33 tests) |
| typecheck | clean | clean |
| `next build` | — | clean |

Per-directory scatter, all now 0: `features/orders` 231, `shared/ui` 34,
`features/payouts` 25, `features/shipping` 7, `shared/providers` 7,
`app/order-placed` 2, `features/stripe` 2.

## B2 — the number that matters is the CALL SITES (ruling 30)

Success is not "one component exists"; it is that the consumers got small.

| call site | before | after | |
|---|---:|---:|---|
| `purchase-order-checkout/shippingStep/serviceSelector.tsx` | 96 | **80** | −17% |
| `purchase-order-checkout/shippingStep/packageSelector.tsx` | 104 | **100** | −4% |
| `purchase-order-checkout/shippingStep/pickupSelector.tsx` | 45 | **31** | −31% |
| `sales-order-checkout/shipping/serviceSelector.tsx` | 62 | **44** | −29% |
| **the four** | **307** | **255** | **−17%** |
| (+`insuranceSelector.tsx`, same family) | 56 | 45 | −20% |

**Read those four honestly.** `git diff --stat` over the five is
**116 insertions / 188 deletions**, and the file totals understate the win
because two of the four are mostly non-radio logic: `packageSelector` is 60
lines of packaging-weight arithmetic and `serviceSelector` 30 lines of store
shape. Measured on the radio block alone the four go **139 → 68 lines, −51%**,
and every one of them stopped spelling `<label>`, `htmlFor`, an sr-only input,
a checked-state class string and a hit-area overlay.

Other consumers: `MetalStep` 69→43, `WeightStep` 100→69, `PurityStep` 105→86,
plus `achForm`, `BullionTab`, `PremiumControl`, `UsersDrawer`, `AddressSelect`,
`ProductCard`, `BullionCard`, `ProductPageDetails` (two pill blocks),
`createSalesOrderDrawer`, `CarrierServicesDrawer`, `CarrierServicesAdminTable`
and `AdminPreparing` (two). **`shared/ui/base/radio-group.tsx` now has exactly
one importer in the whole tree.** Five call sites also stopped importing
framer-motion.

DELETED: `shared/ui/RadioCard.tsx` (177 lines) and
`shared/ui/RadioGroupImage.tsx` (76). Not kept as variants. RadioGroupImage was
never a different control — it was this control with an `<Image>` in the
option, and content is children.

`shared/ui/RadioGroup.tsx` is ONE component with two entry points into ONE
option renderer: `<RadioGroup options getValue>{(o) => …}</RadioGroup>` for the
common case, and `<RadioOption>` for the four call sites whose options are
wrapped by something else (FloatingButtonItem ×2), animated per item
(AddressSelect) or hand-placed (PremiumControl) — a render prop cannot wrap the
label it is rendered inside. `options` takes an array OR a record keyed by
value, because half the call sites hold one and half the other.

KEPT FROM RADIOCARD, all pinned by `shared/ui/RadioGroup.test.tsx`: the
`relative` + `after:absolute after:inset-0` overlay that makes the whole option
the hit area (dropping it is a functional regression no screenshot and no other
test sees), the `htmlFor` four call sites never had, and the D99 fix where a
checked neutral card's `<strong>` went white-on-white — extended from
`strong`/`b`/`p`/`small` to `h1`–`h6` and `time`.

## B4 — the D99 audit, and what it found

**New tool: `pnpm --filter @dorado/frontend audit:state-collapse`.** Resolves
every colour token out of `theme.css`, then compares each element's REST
colours against its STATE colours (`hover:`, `data-[state=checked]:`,
`has-[[data-state=checked]]:`, `data-[state=active]:`, `group-hover:`,
`aria-selected:` …) and the two branches of `cond ? 'a' : 'b'`. A state that
moves every colour property it touches by less than 1.25:1 is a COLLAPSE. It
also flags **hover == selected**, separates a **no-op state** (identical token)
from a collapse, accepts a deliberate dim (`bg-X` → `bg-X/90`), and has a
second pass for a light ground under a self-colouring semantic tag.
`--self-test` proves it resolves ground→card as a selected state at 1.05:1.
**22 findings → 0.**

Pinned in `pnpm check` by `shared/ui/state-contrast.test.ts` (26 assertions):
every RadioOption variant×intent must move a colour by >1.25:1 when checked,
neutral must FILL rather than wash, and a filled neutral option must repaint
every tag that colours itself.

### Every collapse found

1. **`features/orders/ui/OrderStatusShared.tsx` — the status-filter dropdown
   row went WHITE ON WHITE when selected.** The row fills `bg-primary!` when
   selected, and the icon, the label and the tick were each pinned to
   `text-white` in that same branch. Choosing a status made the row you had
   just chosen unreadable. Live on both order lists.
2. **Same file, the mobile status pills — the icon vanished when selected.**
   `isSelected ? 'text-white' : …` on a `bg-primary` pill: 1.04:1.
3. **`viewProfitBreakdown.tsx` — no tab ever looked active.** Rest was
   `primary-on-glass`; active added `text-white` (#ffffff against #fafafa,
   1.04:1); and inactive's `bg-neutral-200` **never applied at all**, because
   `.primary-on-glass` lived in an UNLAYERED stylesheet and unlayered rules
   beat every cascade layer including `utilities`. All three triggers rendered
   the identical pill whichever was selected.
4. **`shared/ui/base/tabs.tsx` — the active tab's only non-text signal was
   `shadow-sm`,** which ruling 27 deletes. Active now recesses to the page
   ground inside the list's `bg-muted` bar.
5. **`features/payouts/ui/PayoutLandingSection.tsx` — white-on-white, live, and
   the comment above it claimed it had been fixed.** The card was `bg-primary
   text-primary-foreground` (D95's own remedy) — but `text-primary-foreground`
   is INHERITED and `typography.css` colours `h3`/`p` in `@layer base`, and a
   declared rule beats an inherited one. Every card on that section rendered a
   near-white heading and a grey paragraph on a near-white ground.
   **This is a fourth failure mode, distinct from D92/D95/D99**: the container
   WAS repainted and the repaint could not reach the children. The audit's
   second pass exists for it.
6. **`features/addresses/ui/AddressSelect.tsx` — hover was identical to
   selected.** Checked was `bg-card border-neutral-900`; hover was
   `hover:bg-card hover:border-neutral-900`, the same pair. Hovering any
   address made it look like the chosen one.
7. **`features/users/ui/UsersDrawer.tsx`** — the add/subtract/edit selector's
   checked state was `bg-primary/15 border-primary text-primary`: a 15% white
   wash on a near-black ground, plus #fafafa text against a #f6f7f9 rest.
8. **All five checkout selectors** marked selection with `bg-background` →
   `bg-card` and nothing else: **1.05:1**, no border and no text change.
9. **`features/media/ui/ImageUpload.tsx`** — the drop zone's hover was
   `bg-background` → `bg-muted`, 1.22:1, on the one affordance whose entire job
   is to say "you can drop here".
10. **`shared/ui/base/radio-group.tsx`** — the radio dot's checked state kept
    the same `border-neutral-800` and changed only the fill.
11. **`shared/ui/table/ColumnVisibility.tsx`** — `text-primary` and
    `data-[state=checked]:text-primary` on one checkbox: the checked state said
    nothing the rest state had not already said.
12. **`AdminReceived.tsx`** — a confirmed row was `bg-success/10
    hover:bg-success/10`, cancelling its own hover on a table that has one.
13. **`shared/ui/base/separator.tsx`** — `bg-neutral-300` (#3e4047), brighter
    than `--border` and than every other rule in the app. Now `bg-border`.
14. Self-cancelling states the tool also named and that are now gone:
    `hover:bg-card` on a `bg-card` element, `hover:text-white` on `text-white`
    (×4), `hover:bg-transparent` on `bg-transparent` (both action-button bars).

Four "light ground under a self-colouring tag" suspects remain in the report
and **all four were checked by hand and are false positives** — the light `bg-`
is on a sibling, not an ancestor. The heuristic reads lines, not the JSX tree,
and says so.

## B1 — the shadows are deleted, values included

Call sites: `.raised-off-page` 22 → 0, `.recessed-into-page` 1 → 0, and every
loose `shadow-sm/md/lg/xs/primary/2xl`, `drop-shadow-lg`, the two hand-written
inset bevels in `slider.tsx`, and the six `shadow-none` that existed only to
cancel them. Where the shadow did SEPARATION work it became a hairline
(`PayoutCard`, `OrderCardShell`, the popover, the sticky header, the drawer);
where it was decoration it became nothing (timeline dots, status pills, tabs,
the checkbox, the slider thumb).

Tokens: `--shadow-raised`, `--shadow-recessed` **and `--shadow-overlay`** are
deleted from `theme.css`, with a note in their place so nobody re-adds them.

**The judgement call ruling 27 left open is decided: `--shadow-overlay` goes
too.** Its only user was the drawer. A drop shadow works by darkening the
ground beneath it, and this ground is `#09090c` — black on black is not an
elevation cue, it is an unrendered declaration, which is exactly what the old
`drawer.css` comment was admitting when it said Tailwind's own `shadow-2xl`
"registers as nothing at all" here. The drawer separates by a hairline.

## Stylesheets deleted outright

- **`app/styles/glass.css` — deleted**, file and `globals.css` import. All
  five surviving classes reached zero call sites.
- **`app/styles/components.css` — reduced to two rules**: `.floating-label`
  plus its two peer selectors, and the `number-flow-react` part padding.
  Everything else (`.raised-off-page`, `.recessed-into-page`, `.checkbox-form`,
  `.section-label`) is gone with its call sites.
- `gradients.css` and `base.css`'s `bg-primary`+`text-white` bridge were
  already gone; both are now confirmed at zero.
- `DELETION-ORDER.md` and `RETIREMENT.md` are marked CLOSED / DISCHARGED with
  the new numbers, and kept as the record of what each retired class WAS.

## B5 — extracted and adopted

**Extracted**
- **`shared/ui/DetailRow.tsx`** (NEW). 59 hand-rolled label/value rows across
  18 files, each a `justify-between` box with a small muted label and a
  brighter value, spelled three different ways. `total` is a DEGREE (a prop
  axis), not a second component.

**Adopted — the reverse case, call sites re-implementing what `shared/ui` had**
- **`AccordionSection`**: four order-drawer footers and `viewProfitBreakdown`
  each carried a private ~45-line `Accordion`/`AccordionItem` copy. All five
  now use the shared one. Its `glass`/`raised` variants — named after a
  glassmorphism and a shadow that were both deleted — are now `plain`/`card`,
  and its header carries no type utilities.
- **`StatusChip`** where `success-on-glass`/`primary-on-glass`/
  `destructive-on-glass` pills were hand-rolled.
- **`TabsList`/`TabsTrigger variant="underline"`** in place of
  `primary-on-glass` + `raised-off-page` triggers.
- **`Separator`** in place of all 16 `.glass-divider` divs.
- **`Button` variants** for ~25 call sites that declared one variant and
  painted another; the two order action-button bars now map their three
  hand-painted looks onto the three emphasis steps (ruling 25).
- **`BlurredStagger as=`** — its `as` prop already existed, so the two call
  sites that were stuck on a wrapper `div` (with a comment saying they were
  blocked) became a real `<h2>`/`<p>`. That was the last type utility in the
  tree.

**Appearance-as-props deleted** (ruling 20): `TrackingEvents`'
`background_color` / `borderColor` / `useStatusColor` — all six call sites
resolved them to the same two values, two of them by assigning
`const baseBg = 'bg-primary'` a line above the call. `Table`'s `shadowClass`,
which no call site passed.

**Not done, deliberately (the 10%)**: 44 further label/value rows in
`ProductPageDetails` (16), `reviewStep`, `orderSummary`, `ProductCard` and
`BullionCard` match DetailRow's shape but are ALREADY semantic and layout-only
after earlier sweeps — adopting DetailRow there would change `<small>` labels
to `<p>` (13px → 15px) and flatten a deliberate `pl-4`/`pl-8` indent hierarchy,
for no movement in any metric. Left as a judgement call rather than churn.

## One defect neither typecheck nor the suite could see

`next build` caught a `'use client'` directive that had ended up on line 3 of
`AdminPaymentProcessing.tsx`, below two imports — a bulk import insertion put
it there. **`tsc --noEmit` was clean and all 155 tests passed with it broken**;
the file simply would not compile in Next, and `app/admin` with it. Worth
knowing for the rest of this wave: on this frontend the build is a gate the
other two are not, and it is cheap (~90s).

## Unverifiable — I have no browser

Nothing below has been seen rendered; there are no Playwright browsers cached.

- **Every fix in B4 is a colour judgement made from token arithmetic.** The
  ratios are computed from `theme.css`; whether the result *looks* right is not
  something a contrast number answers, and the D99 class of defect is precisely
  the one where the numbers were always fine.
- **The two Stripe wrappers and `StoreLocations.tsx` read CSS variables through
  `getComputedStyle` and hand them to an iframe / to Google Maps.** No CSS
  change can fix or break them and no unit test can see them. Still outstanding
  from `MANUAL-VERIFICATION.md` §1 and §5.4c.
- **The drawer's new hairline** is `border border-border` on `.drawer-layout`,
  which on a full-width mobile sheet puts a border on edges that are off-screen.
  Harmless in theory, unseen in practice.
- **`ShineBorder`'s gold gradient** survives with its (already no-op) animation
  removed; whether a static 300%-scaled radial gradient reads as intended is a
  visual call.
- **Spots.tsx's full-bleed `bg-brand` bar** is untouched and still collides
  with ruling 19 — flagged by P1, still Jacob's call.
- **`CartTabs`' two tabs still use different active treatments** (`underline`
  on Sell, `underlineSubtle` on Buy). Preserved exactly; it looks accidental
  and the call is Jacob's.

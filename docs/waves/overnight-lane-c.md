# Overnight — Lane C (shared components: hoist, generalise, adopt)

Jacob's priority: "keep hoisting components to shared and implementing them at
call sites… liberty converting 'similar' components that should be a standard
component to that standard component."

```
C1. Field - the labelled-control pattern     ██████████████████  100%
C2. One segmented control, two die           ██████████████████  100%
C3. SelectMenu adopted (it had 0 importers)  ██████████████████  100%
C4. Legacy Button variant names retired      ██████████████████  100%
C5. DetailRow, EmptyState, OrderDrawerHeader ██████████████████  100%
```

Started from `002c0f0f`. 54 files, **923 insertions / 1,596 deletions**
(excluding lane A's checkout files, lane B's tests and lane D's scripts).
Three new files, two deleted.

---

## The measure is the call sites (ruling 30)

| | before | after | |
|---|---:|---:|---|
| hand-rolled label-above-a-control blocks | **36** | **0** | |
| hand-rolled label/value rows | **47** | **7** | −85% |
| hand-rolled Popover+Command menus | **6** | **0** | |
| hand-rolled empty states | **8** | **1** | lane A owns the last |
| hand-rolled order drawer headers | **4** | **0** | |
| shared components implementing "one of N" | **3** | **1** | |
| appearance-as-props on shared components | **24** | **0** | |
| Button call sites on retired variant names | **28** | **0** | |
| `<DetailRow>` adoptions | 31 | **68** | |

**The files that hold those call sites**

| file | before | after | |
|---|---:|---:|---|
| `…adminPurchaseOrderDrawerContents/AdminReceived.tsx` | 940 | **804** | −14% |
| `features/products/ui/ProductPageDetails.tsx` | 848 | **799** | −6% |
| `features/carriers/ui/CarrierServicesDrawer.tsx` | 516 | **482** | −7% |
| `features/products/ui/ProductDrawer.tsx` | 432 | **380** | −12% |
| `features/leads/ui/LeadsDrawer.tsx` | 335 | **317** | −5% |
| `features/carriers/ui/CarriersDrawer.tsx` | 282 | **270** | −4% |
| `features/orders/ui/OrderStatusShared.tsx` | 199 | **135** | −32% |
| the four order drawer headers | 368 | **265** | −28% |
| **these ten** | **3,920** | **3,452** | **−12%** |

## Gates

| | baseline `002c0f0f` | now |
|---|---|---|
| `typecheck` | clean | clean |
| `test` | 163 pass | **163 pass** |
| `next build` | clean | **clean** |
| `lint:call-site-styling` | **6** † | **0** |
| `lint:typography-scatter` | **34** in 11 files † | **28** in 9 files |
| `audit:state-collapse` | 0 collapses, 5 suspects | 0 collapses, 5 suspects |
| both `--self-test`s | pass | pass |

† **Re-baselined, and this matters.** Lane D hardened both linters in this same
working tree while I worked: `--scatter` used to read `className="…"` literals
only and never saw the 205 call sites spelled `className={cn(…)}`. The 0 I
started against was "zero of the ones it could see". Running lane D's NEW
linter against a pristine `002c0f0f` (`git archive` into a scratch tree) gives
6 and 34 — so those are the honest baselines, and both numbers moved down.

---

## C1 — `Field`, the other half of `DetailRow`

`DetailRow` is a label beside a VALUE. Nothing owned a label above a CONTROL,
and it was hand-rolled **36 times**:

```tsx
<div className="flex flex-col gap-1">
  <Label htmlFor="name" className="pl-1">Product Name</Label>
  <Input id="name" ... />
</div>
```

33 in the four admin drawers, plus private copies inside `PopoverSelect`,
`DisplayToggle` and `DotSelect` — and those three spelled the label `<small>`
where the drawers spelled it `<Label>`, so **one drawer column showed two
different label sizes**. One component, one size. `Label` is no longer imported
by any feature file: every label now comes through `Field`, `ValidatedField`
or `FloatingLabel`.

Also adopted in `QuantityInput`, `PremiumControl`, `StateSelect` and
`AddressForm` (×2).

**Eight dead appearance props deleted from `QuantityInput`** —
`wrapperClassName`, `labelClassName`, `controlsClassName`, `inputClassName`,
`buttonClassName`, `decButtonClassName`, `incButtonClassName` — against one
call site, which passed none of them. `PremiumControl.inputClassName` was dead
the same way.

## C2 — one segmented control, and two components deleted

P1 called a segmented control "the clearest 3+ case in the app". The honest
finding was worse: **four implementations of one control**, two of them shared
components that had each grown a private option renderer.

DELETED: `shared/ui/DisplayToggle.tsx` (94 lines, private `SegBtn`) and
`shared/ui/DotSelect.tsx` (99, private `DotBtn`). They are **the same
component** — two cells over a boolean, N cells over a number. A different
COUNT and a different VALUE TYPE is content and a degree, never behaviour, so
under the meta-rule beneath ruling 30 they are one thing.

NEW: `shared/ui/SegmentedField.tsx` = `Field` + `RadioGroup variant="segment"`.
**It has no appearance of its own**; every pixel comes from the audited
`RadioOption`.

What the two were doing wrong beyond existing twice:

- **Eight appearance props** between them — `onClass`, `offClass`,
  `inactiveClass`, `buttonClass`, `checkedClass`, `defaultClass`,
  `groupClassName`, `seamFixClassName`. Ruling 20 forbids these outright.
- **`text-sm font-medium` inside `cn()`** — invisible to `--scatter` at the
  time, so both files reported clean at zero.
- **`role="radio"` on a plain `<button>`** with no keyboard handling at all
  (DisplayToggle), or a hand-rolled arrow-key handler (DotSelect). Radix
  already does this correctly inside `RadioGroup`.

15 call sites converted across five files. `RadioGroup`'s mapping form also
replaced `PremiumControl`'s hand-placed unit pair (23 → 11 lines) and **both
product-image pickers in `ProductPageDetails`** — the exact case ruling 30
deleted `RadioGroupImage` for, hand-rolled twice in one file, once per
breakpoint. Its DIRECTION pair stays on `RadioOption` for a real reason: its
two cells carry different intents, and `intent` is a property of the group.

**One bug caught on the way in.** `RadioOption` defaults its `id` to the
option's value, so index keying would have emitted `id="0"`/`id="1"` for every
segmented field on the page — three sit side by side in the leads drawer and
three in the product drawer — and every `<label htmlFor>` would have resolved
to the FIRST field. Keys are `useId()`-prefixed.

## C3 — `SelectMenu` had ZERO importers, and six copies of it in the tree

Built in D88, never adopted. Six hand-rolled Popover+Command menus stayed —
**five in one file** — and every one carried the D95 defect `SelectMenu`'s own
header describes: rows spelled `text-primary` over `hover:bg-primary`, and
BOTH tokens are near-white (`--primary` is `#fafafa`). **Hovering a row made
its label disappear.** Two of the five also said `group-hover:text-white` on
that same white fill. Live, on the admin purchase-order drawer.

Two props absorbed all six, and **both are degrees, not new components**:
`searchPlaceholder` (two needed a product search) and `value` (one is a filter
rather than an action, so it marks the current row and shows a tick). A menu
with a search box is the same menu.

The chosen row FILLS with `--primary` rather than re-using `--accent`, because
`--accent` is already the hover fill and re-using it would make hover and
chosen identical — the exact collapse wave 4 found in `AddressSelect`.

**Also: the mobile status pills** in `OrderStatusShared` declared the retired
`ghost` name and then painted themselves with eight appearance classes
including their own fill, border, radius and both hover colours — ruling 20's
"contradicted" shape. Selection is the emphasis axis now: `primary` when
chosen, `secondary` when not, and the radius is the house pill (ruling 19)
rather than `rounded-lg`.

## C4 — the Button back-compat shim is deleted

`shared/ui/base/button.tsx` carried `LEGACY_VARIANTS`, mapping seven retired
one-axis names onto the two axes "until every partition has swept". **28 call
sites across 15 files were still on them** — 24 `ghost`, 3 `default`, 1
`destructiveQuiet`, 1 `primaryQuiet`. All converted; the shim is gone.

Keeping it cost more than it saved: a legacy name TYPECHECKS, so nothing told
the next reader the vocabulary had changed. `EmptyState` is the proof — its
`buttonVariant` prop type still listed `default | outline | ghost |
destructive` and nothing had ever complained.

## C5 — `DetailRow`, `EmptyState`, `OrderDrawerHeader`

### The 44 deferred label/value rows: the deferral was half wrong

Wave 4 left them, reasoning they were "already semantic and layout-only" and
that converting would flatten a deliberate `pl-4`/`pl-8` indent. **The indent
is LAYOUT and `className` already carries layout**, so nothing was going to
flatten. And the sizes were not arbitrary: sorted, the 47 rows spell exactly
FOUR combinations forming a monotone ramp, each step making one of the two
elements heavier.

```
detail    <small> / <p>        a line inside a nested breakdown
subtotal  <small> / <strong>   that breakdown's own total
row       <p>     / <strong>   an ordinary summary line   (default)
total     <strong>/ <strong>   the grand total, tabular figures
```

So `total: boolean` became `variant`, which is **fewer concepts, not more** —
one axis of degree rather than four components or two booleans whose four
combinations include two nobody wants. 35 of the 47 converted; adoptions went
31 → 69.

**The 12 left, and why**, so the next pass does not re-litigate it: 6 in
`ProductPageDetails` (a spec list) and 4 drawer/summary rows put the HEAVIER
tag on the LABEL and the lighter one on the value. That inverts the ramp. A
fifth value for it would stop the axis being monotone and start it being a set
of fused names — the exact thing rulings 25/28/30 each rejected. They want a
decision about whether "Weight (troy oz): **1.0000**" or "**Weight (troy oz):**
1.0000" is right, and then they are a one-line change.

### The empty states: eight into one

Found by diffing className strings across the tree — `absolute -top-6 right-3.5
border … rounded-full w-10 h-10` appears in six files. All eight are: a large
outline icon, a small badge pinned to its corner, a heading, a line of copy,
and sometimes a button.

**They had already drifted, which is the argument for the component.** Four
spelled the badge `border-border` and two `border-border-strong` — the two
carrying a comment explaining why `--border-strong` is right. Headings were
`h2` at four and `h3` at two. Body copy was `<p>` at some and `<small>` at
others. Nobody chose any of that.

`EmptyState` now takes `icon`, `iconSize`, `badge` (a ReactNode: a `0`, a
`<SearchX/>`), `title`, `description` and `children` for the action. **Five
props became one child**: `buttonLabel`, `buttonIcon`, `buttonIconSize`,
`buttonVariant` and `buttonClassName` were `EmptyState` re-declaring Button's
API through a keyhole. Three more dead appearance props went with them
(`iconClassName`, `titleClassName`, `descriptionClassName`).

**It also proved the scatter linter's old blind spot**: it carried
`text-lg md:text-xl font-medium text-neutral-900` and `text-xs text-neutral-600
leading-relaxed` — seven type utilities — inside `cn()` calls, and reported
ZERO.

### `OrderDrawerHeader` — the same 34 lines, four times

Every order drawer opens with it, and the four copies had drifted the same way:
two drew a `<DownloadIcon>` beside the button and two did not, so **the same
action looked like two different actions depending on which drawer was open**.
The button className was `flex items-center justify-start gap-2 px-0` at two
and `px-0` at the other two. Two wrapped the status icon in
`className={`${'text-primary'}`}` — a template literal interpolating a constant.

Presentational by ruling 14: no hooks, no context, `statuses.includes(status)`
is a pure function of props.

### Two axes on `TableRow`, replacing four className strings

`intent` (the house axis, generated from one rule: a 10% tinted ground and a
20% hover) and `disabled` (`opacity-50 pointer-events-none` plus the
`aria-disabled` that had never been set). Only `success` has a caller today,
and that is exactly why it is not a `confirmed` boolean — the next one will be
a rejected line.

---

## Two live defects fixed on the way

1. **`AdminPreparing.tsx`, both action buttons.** The className read
   `cn('p-4 w-full', !selectedSupplier || (sendOrder.isPending && 'opacity-30'))`
   — a `||` between a boolean and a string. When no supplier is picked the
   expression is literally `true`, `cn(true)` contributes nothing, and **the
   dimming never applied in the state it was written for**. Harmless because
   the button already carries a correct `disabled` and Button's base handles
   `disabled:opacity-50` — which is the argument for deleting the class.
2. **The five `AdminReceived` menus**, above: `text-primary` over
   `hover:bg-primary`, both near-white. Live white-on-white on hover.

## FOR JACOB — one colour judgement, and one open question

- **The product-image picker is now `intent="brand"`** (a gold hairline and a
  15% gold wash) rather than the neutral fill. Neutral FILLS with `--primary`,
  which is near-white, and a white ground behind a product photograph is not a
  selection cue — it is a different photograph. Gold is ruling 19's one
  permitted hue and this is your own catalogue, but it is a colour decision and
  it is yours. `features/products/ui/ProductPageDetails.tsx`.
- **The 12 remaining label/value rows** need the emphasis decision described
  above before they can be converted.

## Left alone deliberately, with the reason

- **`lint:typography-scatter` still reads 28, all in `shared/ui`.** 13 of those
  are the SEMANTIC tokens (`text-small`, `text-micro`) used correctly inside
  `Table`, `Label` and `IconTile` — ruling 20 says appearance belongs in the
  component, so they are right and still counted. The other 15 are raw Tailwind
  sizes (`text-sm`, `text-lg`, `text-base`) in unswept base primitives —
  `dialog`, `command`, `form`, `popover`, `breadcrumb`. Converting them to the
  scale does not move the number and does change how they look, so it is a
  typography-foundation task rather than a hoisting one.
- **`Banner` has two adopters and there is no third.** Nothing else in the tree
  is a full-bleed band with hairlines; `PayoutLandingSection` and the rest are
  gutter sections. Forcing adoption would be inventing call sites.
- **`MobileProductCarousel`'s category row** is a single-select filter and
  therefore a radio group by another name — but its desktop half is text
  separated by left rules and its mobile half is 72px circles. Converting is a
  visual redesign, not a hoist.
- **`checkoutStepper.tsx`'s empty cart** is the eighth `EmptyState` and lane A
  owns the file. It is a five-line change: `icon={ShoppingCartIcon}
  iconSize={80} badge={0}` and the same title/description, exactly as
  `salesOrderCheckout.tsx` now reads.

## For lane B (tests)

Nothing needs updating — 163 pass unchanged, and
`CarriersDrawer.test.tsx`'s `getByRole('radio', { name: /no/i })` still passes
through `SegmentedField` (its comment names `DisplayToggle`, which no longer
exists). Two components are now worth a render test they do not have:
`SegmentedField` (the `useId` keying, and that a numeric option set selects `0`
rather than nothing) and `EmptyState` (that the action renders as a child).

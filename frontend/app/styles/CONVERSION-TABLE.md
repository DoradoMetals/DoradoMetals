# Conversion table — old className pattern → new variant

For the partition sweeps (P1 commerce, P2 checkout+identity, P3 shell+admin)
and for wave 3. **This is meant to be mechanical.** Where a row says "judgement",
it goes in `MANUAL-VERIFICATION.md` instead of being guessed at.

## The rule you are applying

Stated in full at the top of `shared/ui/base/button.tsx`:

> **ALLOWED at a call site** — flex/grid placement, gap, margin, `w-full`,
> `flex-1`, size/position, order, alignment, responsive **layout**.
>
> **NEVER at a call site** — `bg-*`, `text-<colour>`, `text-<size>`, `font-*`,
> `border-*`, `rounded-*`, `shadow-*`, opacity, transition, and any
> `hover:`/`focus:` appearance.
>
> **Padding is a size, not a layout override.** If a call site needs padding no
> size offers, the size set is incomplete — add the size, do not permit the
> override.
>
> **Hover and focus belong to the variant, always.**

Measure your progress with the coordinator's linter — the number must fall:

```bash
cd frontend && node scripts/lint-call-site-styling.mjs
```

---

## Button — `shared/ui/base/button.tsx`

**Two axes (ruling 25).** They are orthogonal and share no value names.

```
variant   primary | secondary | tertiary        EMPHASIS: filled -> outlined -> bare
intent    neutral | brand | success | danger | warning | info      MEANING
size      xs | sm | default | lg | xl | icon | iconSm | iconXs
```

`variant="tertiary" intent="danger"` is a bare red Delete; `variant="primary"
intent="danger"` is a filled one. That composition is what replaced the fused
`destructiveQuiet` name.

**The prop is `variant`, not `type`** — `<button type="submit">` is a native
attribute, and a prop named `type` shadows it. The failure mode is a form that
silently stops submitting. `ButtonProps` re-declares the native `type` so both
survive.

**`link` is a fourth `variant` value**, not a fourth emphasis: no box, no
padding, an underline. 21 call sites need it and the three-step axis cannot
express it. It takes its colour from `intent` and ignores the rest.

> ### ⚠ FIXED — `variant="link"` used to render as a 40px padded pill
>
> `cva` emits `size` AFTER `variant`, and `cn()` is twMerge, so the last class
> in the same group wins. `link` carried its own `h-auto p-0 rounded-none`, and
> the DEFAULT SIZE's `h-10 px-4 rounded-full` was emitted after it and beat it.
> A bare `<Button variant="link">` was a button-shaped box in the middle of a
> sentence, and the only thing hiding it was call sites re-spelling
> `p-0 h-auto` — **which the table below told you to delete as redundant.**
> Deleting it produced no type error and no test failure.
>
> The box reset now lives in a `compoundVariant` keyed on `variant: 'link'`
> alone, which cva emits after `size`, for every size. **`p-0 h-auto` at a
> `variant="link"` call site is now genuinely redundant and safe to delete** —
> including the two that are currently held deliberately with comments
> (`features/intake/ui/IntakeLandingSection.tsx`, plus P2's list). Pinned by
> `shared/ui/base/button.test.ts`.

> ### ⚠ FIXED — `cn()` was deleting the entire type scale
>
> tailwind-merge does not know `text-micro`/`text-small`/`text-body`/`text-h1..h6`/
> `text-display` are FONT SIZES — they are our tokens, not Tailwind's — so it
> classified them as COLOURS and let a later colour replace them:
>
> ```
> cn('text-small', 'text-primary-foreground')  ->  'text-primary-foreground'
> ```
>
> Every Button therefore lost its size variant's font-size and inherited its
> parent's, and every `text-sm` deleted from a call site on the promise that
> "the variant supplies the size" was being deleted into nothing. Fixed with
> `extendTailwindMerge` in `shared/utils/cn.ts`; pinned by
> `shared/utils/cn.test.ts`. **A new `--text-*` token must be added to
> `SEMANTIC_TEXT_SIZES` in that file or it will vanish the same way.**
>
> STILL OPEN, deliberately: the named SPACING scale (`p-md`, `gap-lg`, …) is
> not registered either. Its failure mode is milder — both classes survive and
> the stylesheet's emit order decides, so nothing is silently deleted — and
> registering it mid-sweep would change which of two paddings wins at call
> sites authored against today's behaviour. It needs a pass of its own.

### Hover: one rule, not eighteen states

**Hover escalates one step of emphasis.**

| variant | at rest | on hover |
|---|---|---|
| `tertiary` | bare text in the intent colour | **gains the outline** |
| `secondary` | outlined in the intent colour | **fills** |
| `primary` | filled | nothing above it — the fill dims |

Escalation is defined in terms of the intent's own colour, so each intent needs
three rows and no per-combination CSS. The base class always carries
`border border-transparent`, so a `tertiary` gaining an outline does not resize.

**One exception, deliberate and flagged rather than buried:** *neutral
secondary fills with `--accent`* (a raised neutral surface), not with
`--primary`. Every other intent fills with its own colour, but neutral's colour
is WHITE — a hairline-outlined button snapping to a white fill on hover jumps
from ~1.3:1 to 18:1 against the ground and reads as a different button, not as
a hover. Neutral escalates within the neutral ramp instead. **No other intent
needs an exception.**

### Defaults — measured

Of 193 call sites: 87 `ghost`, 31 no variant, 23 `default`, 21 `link`,
15 `outline`, 11 `secondary`, 2 `destructive`.

| candidate default | props it absorbs | unswept call sites it silently restyles |
|---|---:|---:|
| `variant="tertiary"` | **87** | **11** |
| `variant="primary"` | 54 | **0** |

`tertiary` absorbs more, and is **not** the default. Of the 31 call sites that
omit `variant` today, 11 paint nothing at all, so defaulting to `tertiary`
would silently turn 11 filled buttons quiet in files this pass does not own —
and `master` auto-deploys with no staging (D92). **Default is
`variant="primary" intent="neutral" size="default"`, which changes zero unswept
call sites.** Revisit once every partition has swept.

### Size matrix — size owns height, padding **and** type

| size | box | type |
|---|---|---|
| `xs` | `h-7 px-2.5` | `text-micro` |
| `sm` | `h-8 px-3` | `text-small` |
| `default` | `h-10 px-4` | `text-small` |
| `lg` | `h-11 px-6` | `text-small sm:text-body` ← the hand-rolled `text-sm sm:text-base` |
| `xl` | `h-12 px-10` | `text-body sm:text-h6` ← the hero CTA; absorbs `px-9`/`px-10`/`px-12` |
| `icon` / `iconSm` / `iconXs` | `size-10` / `size-8` / `size-7`, `p-0` | — |
| `iconInline` | `size-4`, `p-0` — an affordance sized to the TEXT beside it | — |

### Legacy names still resolve — but delete them as you sweep

A shim in `button.tsx` maps the retired one-axis names, so the ~140 unswept
call sites in `features/**` keep rendering rather than becoming type errors all
at once. **It is temporary; delete it when the table below is fully applied.**

| legacy | new |
|---|---|
| `variant="default"` | *(omit — it is the default)* |
| `variant="outline"` | `variant="secondary"` |
| `variant="ghost"` | `variant="tertiary"` |
| `variant="destructive"` | `intent="danger"` |
| `variant="destructiveQuiet"` | `variant="tertiary" intent="danger"` |
| `variant="primaryQuiet"` | `variant="secondary"` |
| `variant="brand"` | `intent="brand"` |

⚠ The shim only covers the **`<Button>` component**. Direct
`buttonVariants({ variant: 'ghost' })` calls bypass it and are a type error —
there were three, all in `shared/` (calendar ×2, pagination), all converted.

### Mechanical replacements

| delete this className | write this |
|---|---|
| `bg-primary text-white` / `text-primary-foreground` (± `hover:` twins) | *(nothing — it is the default)* |
| `bg-primary ... px-10` / `px-12` / `px-9` | `size="xl"` |
| `text-sm sm:text-base` / `text-sm md:text-base` | `size="lg"` |
| `text-xs` | `size="sm"` or `size="xs"` |
| `variant="ghost" className="hover:bg-card"` | `variant="tertiary"` *(the 24 `hover:bg-card` are absorbed)* |
| `variant="ghost"/"outline" className="bg-card"` | `variant="tertiary"` |
| `variant="ghost"/"outline"/"secondary" className="bg-primary ..."` | *(omit variant — primary is the default)* |
| `variant="outline" className="border-destructive text-destructive hover:bg-destructive"` | `variant="secondary" intent="danger"` |
| `className="text-destructive hover:text-destructive"` (no border) | `variant="tertiary" intent="danger"` |
| `className="primary-on-glass"` / `bg-primary/15 border-primary text-primary` | `variant="secondary"` |
| `variant="link" className="hover:bg-transparent p-0 h-auto"` | `variant="link"` |
| `hover:bg-X` where `bg-X` is already on the element | *(delete — it was cancelling a hover)* |
| `raised-off-page` | *(delete — nothing replaces it)* |
| `text-white` anywhere on a Button | *(delete — the variant owns text colour)* |
| `w-full`, `flex-1`, `ml-auto`, `mt-6`, grid placement | **KEEP** — legitimate layout |

---

## Other shared components

| component | delete this className | write this |
|---|---|---|
| `Label` | `text-xs text-neutral-700 font-medium` (37 sites, identical) | *(nothing — now the default)* |
| `Input` | `on-glass` (29) | *(nothing — it was the default)* |
| `Input` | `text-base` (12) | *(nothing — already the default, and it is the iOS zoom threshold; **do not** change it to `text-small`)* |
| `Input` / `Textarea` | `bg-highest border-1 border-border` (11, via `ValidatedField`) | `variant="filled"` |
| `Textarea` | `on-glass` (4), `shadow-xs` | `variant="default"` / *(nothing)* |
| `TableRow` | `hover:bg-transparent` (24) | *(nothing — the base row has **no** hover; all 24 were cancelling a hover that does not exist)* |
| `TableRow` (clickable) | `cursor-pointer hover:bg-*` | `interactive` |
| `Table` | `font-normal text-neutral-700` (14, identical) | *(nothing — now the default)* |
| `TableHead` | `text-xs text-neutral-600 md:text-sm` (6) | *(nothing — now the default)* |
| `TableHeader` | `text-xs text-neutral-700` (5) | *(nothing — now the default)* |
| `TableCell` | `text-xs md:text-sm text-neutral-800` (5) | *(nothing — now the default)* |
| `TableHead`/`TableCell` | `text-left` / `text-center` / `text-right` | **KEEP** — column alignment is layout, not typography (239 in the tree; deleting one silently re-aligns a numeric column) |
| `Command` / `CommandList` | `bg-card` / `bg-highest` (9) | `surface="card"` / `surface="highest"` |
| `StatusChip` | `className="text-sm"` / `"text-base"` / `"text-base h-fit"` / `"gap-1 text-sm"` (all 5) | `size="lg"` (keep `h-fit` — layout) |
| `StatusChip` | `glass` prop | *(deleted — the tinted pill it selected is now the default look)* |
| inline count badge (`rounded-full bg-primary px-1 text-[10px] ...`) | the whole span | `<CountBadge>` — **new component**, `shared/ui/CountBadge.tsx` |
| `PopoverContent` | `rounded-lg` | *(nothing — `--radius` is 8px now)* |

### Components that GAINED their variant — adopt these

All of the below now exist. The call sites are in other partitions; each row is
a mechanical replacement.

| component | delete this className | write this |
|---|---|---|
| `ValidatedField` | `bg-highest border-1 border-border` (9) | `variant="filled"` |
| `ValidatedField` | `border-none bg-card` (5, re-spelling the default) | *(nothing — `variant="card"` is the default, and `className` now **merges** instead of replacing)* |
| `TabsList` | `bg-transparent rounded-none px-0 h-auto` | `variant="underline"` |
| `TabsTrigger` | `tab-indicator-primary` | `variant="underline"` |
| `TabsTrigger` | `tab-indicator-secondary` | `variant="underlineSubtle"` |
| `RatingButton` | `text-primary transition-transform` (5) | *(nothing — now the default)* |
| `TableRow` (clickable, via `DataTable`) | `getRowClassName={() => 'cursor-pointer hover:bg-accent'}` (6) | *(nothing — `DataTable` derives `interactive` from `onRowClick`)* |
| `TableRow` | `border-none` / `border-b-0` | `borderless` |
| `TableHeader` | `bg-neutral-50` / any `bg-*` on a sticky header | `surface="card"` / `surface="highest"` |
| `Drawer` | `bg-highest border border-border`, `glass-panel` | *(nothing — `surface="highest"` is the default, and `className` now **merges**)* |
| `Drawer` (the cart sheet) | `bg-card` | `surface="card"` — **required**, see the note below |
| `PopoverSelect` | `triggerClass="border border-border"` | `variant="secondary"` |
| `SearchableDropdown` | `inputClassname="bg-highest border-1 border-border"` | `variant="filled"` |
| `ChipColumn`'s `getChip` | `className: 'bg-success/20 text-success border-success'` (4) | `tone: 'success'` — see the tone vocabulary below |
| `SelectMenu` | `itemClassName` / `contentClassName` carrying colour | *(nothing — they merge now and are LAYOUT ONLY)* |
| a `<Button variant="link">`'s `p-0 h-auto` | | *(nothing — genuinely redundant now; see the box above)* |

⚠ **`Drawer`'s `className` changed from REPLACE to MERGE.** Every caller passing
only a width or a position now correctly keeps the default surface. The one
caller that passed a *different* surface — `features/cart/ui/CartTabs.tsx:36`,
`bg-card border-t-1 border-border lg:border-none` — must add `surface="card"`
and drop `bg-card` in the same commit, or it renders `bg-card` inside the
default's full hairline instead of only a top edge.

### THE TONE VOCABULARY — one set of names, shared with `Button`'s `intent`

`StatusChip`'s `tone` and `ChipColumn`'s new `tone` both take
`neutral | brand | success | danger | warning | info` — the exact values
`Button` takes as `intent` (ruling 25). `positive`/`negative` survive as
aliases so existing `StatusChip` call sites keep compiling.

Hued tones tint (`bg-X/15`, `border-X`, `text-X`); **neutral fills** with
`--primary` instead, because a 15% white wash on a near-black ground is not a
state anybody can see. That is the same exception `Button` makes for
neutral-secondary's hover, for the same reason.

### NEW SHARED COMPONENTS — the 3+ rule (ruling 21)

| component | replaces | call sites it is for |
|---|---|---|
| `shared/ui/IconTile.tsx` | `<Button variant="secondary" className="w-20 h-18 flex flex-col">` | 5 in `features/navigation/ui/Sidebar.tsx`. **A Button here is wrong**: Buttons are pills, and a pill stretched over an 80×72 box is a lozenge. |
| `shared/ui/NavLink.tsx` | `<Link className={isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}>` + `uppercase tracking-widest` on the `<ul>` | Shell's desktop nav, Sidebar's mobile nav. Typography is the `.nav-link` utility; the active STATE is the component's. |
| `shared/ui/Banner.tsx` | `<section className="w-full bg-card border-y border-border py-2">` + a `mx-auto max-w-7xl` gutter | `app/page.tsx`'s SupportBanner, `features/reviews/ui/ReviewsLandingSection.tsx`. Both were white-on-white until D95. |
| `shared/ui/RadioCard.tsx` | `radio-group-buttons`, and every hand-rolled `<label><RadioGroupItem className="sr-only"/></label>` | 18: MetalStep, PurityStep, WeightStep, achForm, the insurance/package/pickup/service selectors ×2, AddressSelect rows, UsersDrawer's control, BullionTab's filter, PremiumControl's four pills. |

⚠ **`RadioCard` is a FUNCTIONAL replacement, not a cosmetic one.**
`radio-group-buttons` carried `relative`, and the hidden input carried
`after:absolute after:inset-0`. Together those make the whole card clickable
and give the absolute checkmark something to position against. Deleting the
class without adopting `RadioCard` produces a control that only responds within
the 16px radio — invisible in a screenshot, and not caught by any test.

### Utilities added to `typography.css`

| hand-rolled | write this |
|---|---|
| `text-h1` / `text-h2` on a `<strong>` to reach a big FIGURE | `.stat` / `.stat-sm` (adds `tabular-nums`, which animated `NumberFlow` figures need) |
| `uppercase tracking-widest` on a nav container | `.nav-link`, or just use `<NavLink>` |
| a footer link's size/colour | `<small>` inside the `<Link>` — the sanctioned idiom, documented in `typography.css` |

### Still needing a variant pass

| component | flagged | dominant override |
|---|---:|---|
| `PopoverContent` | 5 | `border-1 border-border bg-highest` — should be a `surface` prop like `Command` |
| `FloatingLabelInput` | 4 | `text-base`, `bg-highest` — same treatment as `Input` |
| `DialogTitle` | 2 | `text-xs text-neutral-600` — conflicts with its semantic role; **judgement** |
| `Button` — an **on-brand** treatment | 1 | A button sitting ON a `--brand` (gold) surface has no correct variant; `variant="primary" intent="brand"` is gold-on-gold. Ruling 19 says chrome carries no hue, so the likely answer is that nothing should paint a `bg-brand` panel. **Jacob's call** — left unexpressible rather than approximated. |

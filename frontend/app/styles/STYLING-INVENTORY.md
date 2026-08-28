# Styling Inventory

Read-only survey of the frontend styling surface, taken to plan Jacob's
eight-part styling program. Every number below is produced by a command that is
printed next to it, run from `frontend/` unless stated otherwise. Nothing in
this document edits code.

**Measured 2026-08-28** against a working tree that is actively being edited by
the wave-2 D87/D88 agents. Counts drift by ±1–2 while those agents run; three
of Jacob's top-line numbers already had by the time this was written. That
drift is itself the reason for the hot-file rules in the Partition section.

Scope: `frontend/app/**`, `frontend/features/**`, `frontend/shared/**`,
`.tsx` files only unless a metric says otherwise. 258 `.tsx`, 99 `.ts`.

---

## 0. Corrected top-line numbers

| metric | Jacob's number | measured | verdict |
|---|---|---|---|
| text-size utilities | 1082 in 169 files | **1083 in 169 files** | confirmed (±1 drift) |
| `p-`/`m-` utilities | 1080 | **1080** | exact |
| `<div>` | 1834 | **1834** | exact |
| `<h1>`–`<h6>` | 94 | **94** | exact |
| `rounded-*` | 276 | **292** | 276 is `rounded-<something>`; there are **16 more** bare `rounded` |
| files containing `glass` | 47 | **48** | 47 `.tsx` + 1 `.ts` (`features/orders/salesOrders/types.ts`) |
| `dark:` variants | 37 | **38** | confirmed; **29 of the 38 are in one file** (`features/navigation/ui/Footer.tsx`) |
| raw hex | 36 in 8 files | **62 occurrences on 40 lines in 8 files** | 36 is close to the 40-line count; occurrence count is 62 |
| `<section>` | 12 | **13** | drift |
| `<article>` | 3 | **3** | exact |
| `<header>` | 1 | **1** | exact |

Commands:

```bash
grep -roE '\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b' app features shared --include='*.tsx' | wc -l   # 1083
grep -rlE '\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b' app features shared --include='*.tsx' | wc -l   # 169
grep -roE '\b[pm][trblxy]?-[0-9]+(\.5)?\b'  app features shared --include='*.tsx' | wc -l   # 1080
grep -roE '<div\b'                          app features shared --include='*.tsx' | wc -l   # 1834
grep -roE '<h[1-6]\b'                       app features shared --include='*.tsx' | wc -l   # 94
grep -roE '\brounded(-[a-z0-9-]+)?\b'       app features shared --include='*.tsx' | wc -l   # 292
grep -roE '\brounded-[a-zA-Z0-9]+'          app features shared --include='*.tsx' | wc -l   # 269 (+ 7 arbitrary `rounded-[...]` = 276)
grep -rl  'glass'          app features shared --include='*.tsx' --include='*.ts' | wc -l   # 48
grep -roE '\bdark:'        app features shared --include='*.tsx' --include='*.ts' | wc -l   # 38
grep -rnoE '#[0-9a-fA-F]{3,8}\b' app features shared --include='*.tsx' --include='*.ts' | wc -l  # 62
```

### Three numbers that are missing from the plan and change its size

1. **Spacing is 1815, not 1080.** `gap-*` and `space-{x,y}-*` are 735 more
   spacing decisions and they dominate the flex layouts.
   `gap-1` (194) and `gap-2` (198) alone are 392. A spacing token pass that
   covers `p-`/`m-` but not `gap-` will leave the rhythm inconsistent in
   exactly the places most visible (card interiors, button rows).
   ```bash
   grep -roE '\b(gap|space-[xy])-[0-9.]+' app features shared --include='*.tsx' | wc -l   # 735
   ```
2. **`text-*` is 2816 occurrences, of which only 1083 are sizes.** 1473 are
   colors and **239 are alignment** (`text-left` 73, `text-center` 85,
   `text-right` 77, `text-end` 3, `text-ellipsis` 1). A sweep regex written as
   `text-` will silently destroy table column alignment. This is called out
   again in the runbook as hazard R1.
3. **`raised-off-page` is in 71 of the 258 files.** It is a single inset-shadow
   utility and it is the most-used custom class in the codebase, appearing in
   every partition. Removing it (workstream a) is not a localized change.

---

## 0.5 ⚠ MID-SURVEY CHANGE — the CSS layer moved under this document

**While this inventory was being written, a parallel agent rewrote all six CSS
files in `app/styles/`** (`git status` went from clean to
`M base.css M components.css M drawer.css M glass.css M gradients.css M theme.css`;
752 lines → 1161). Workstream (c) is **already executed on the CSS side**.
`§2a` and `§4a` below describe the *pre-change* CSS and are kept as the
before-picture; the numbers drawn from `.tsx` files are unaffected.

That agent independently reached the same neutral-ramp conclusion this survey
did, by the same method, and **has documented the decision in `theme.css`'s
header comment**. The ramp is now INVERTED (`--neutral-100` = closest to the
ground, `--neutral-900` = brightest) and the reasoning is 951-vs-34 call sites.
**Treat that as settled. Sweep agents must not re-litigate it.**

Two consequences that are NOT yet reflected in the `.tsx` tree:

### ⚠⚠ BLOCKER — `--primary` is now white, and 52 call sites paint white on white

```
theme.css:265   --primary: hsl(0, 0%, 98%);   /* was hsl(44,67%,61%) — gold */
theme.css:291   --brand:   hsl(43, 63%, 60%); /* the gold moved here */
```

`bg-primary` is used 116 times and `text-primary` 195 times. **52 call sites
across 39 files put `bg-primary` and `text-white` on the same element.** Those
now render white text on a white background — invisible, not merely ugly.

```bash
grep -rn 'bg-primary' app features shared --include='*.tsx' | grep 'text-white'   # 52
```

The affected set is not peripheral — it is the app's primary-action surface:

```
app/page.tsx:62                    the homepage hero CTA
app/order-placed/page.tsx:64       post-purchase "view your order"
app/account/page.tsx:52
features/auth/ui/SignInForm.tsx:100        every auth submit button
features/auth/ui/SignUpForm.tsx:143        (SignIn, SignUp, ForgotPassword,
features/auth/ui/ResetPasswordForm.tsx:91   ResetPassword, SetPassword)
features/auth/ui/SetPasswordForm.tsx:91
features/auth/ui/ForgotPasswordForm.tsx:65
features/cart/ui/Cart.tsx:55,150           both cart CTAs
features/cart/ui/SellCart.tsx:66,216
features/checkout/purchase-order-checkout/checkoutStepper.tsx:158,225
features/checkout/sales-order-checkout/salesOrderCheckout.tsx:145,180,188
features/checkout/purchase-order-checkout/reviewStep/reviewStep.tsx:131
features/products/ui/ProductCard.tsx:186,202,333    add-to-cart affordances
features/products/ui/ProductPageDetails.tsx:183,211,254,668,711
features/orders/ui/OrderStatusShared.tsx:71,72,128,129,171,172   ← HOT (P4)
shared/ui/DotSelect.tsx:11         `checkedClass` DEFAULT — every DotSelect
shared/ui/SidebarLayout.tsx:192    the nav unread-count badge
```

`shared/ui/DotSelect.tsx:11` is the worst of them because it is a **default prop
value**, so it applies everywhere `DotSelect` is used without anyone having
written `text-white` at the call site.

The fix is mechanical — `text-white` → `text-primary-foreground` (which is
`hsl(228,13%,6%)`, near-black) on these 52 — but it **must land in the same
change as the palette, not in a later sweep**, or `master` auto-deploys an
app whose every primary button is blank. Flag to Jacob before anything merges.

### The `dark:` variant is now ALWAYS ON

`theme.css` changed `@custom-variant dark (&:is(.dark *))` to
`&:is(:root, :root *)`. `app/layout.tsx:42` still says `defaultTheme="light"`,
so the `.dark` class was never on the document and **all 38 `dark:` utilities in
the `.tsx` tree were dead**. They are now live. Workstream (c) therefore
*inverted* for those 38: they are no longer cleanup, they are load-bearing, and
29 of them are in `features/navigation/ui/Footer.tsx` (P3).

Corollary: every screenshot of this app taken before today was of the **light**
palette. There is no "before" reference for the dark look.

### One pre-existing typo, found in passing

```
features/products/ui/ProductPageDetails.tsx:637
    ? 'bg-primarytext-white hover:text-white'
```
Missing space — `bg-primarytext-white` is not a class and never has been. That
selected-state background has never rendered.

### `theme.css` also fixed the surface-ladder inversion

The new ladder is `background 4% → card 8% → popover 11% → highest 13%`, so
`highest` is now genuinely the highest surface. The warning at the end of §5(g)
described the old palette and is resolved.

### Still outstanding on the .tsx side

- `app/layout.tsx:42` still `defaultTheme="light"`; `ThemeSwitcher.tsx` and
  `Shell.tsx:105` still offer a toggle that now does nothing.
- `RETIREMENT.md`, referenced twice from `theme.css`, **does not exist yet**.
- The two Stripe wrappers still branch on `isDark` (R12).

---

## 1. Per-directory master table

Weight = div + text-size + p/m + gap + rounded + border + custom-class. It is
a proxy for sweep effort, not a precise estimate.

| dir | .tsx | div | text | p/m | gap | rnd | bdr | custom | **weight** |
|---|---|---|---|---|---|---|---|---|---|
| features/orders | 57 | 515 | 230 | 204 | 171 | 34 | 63 | 107 | **1324** |
| features/products | 12 | 310 | 148 | 133 | 97 | 48 | 34 | 76 | **846** |
| shared | 69 | 143 | 119 | 173 | 73 | 66 | 85 | 45 | **704** |
| app | 24 | 147 | 165 | 135 | 76 | 12 | 11 | 34 | **580** |
| features/checkout | 21 | 182 | 86 | 96 | 66 | 21 | 41 | 45 | **537** |
| features/carriers | 5 | 81 | 25 | 22 | 45 | 27 | 9 | 79 | **288** |
| features/users | 6 | 44 | 52 | 39 | 21 | 5 | 18 | 24 | **203** |
| features/navigation | 8 | 58 | 39 | 47 | 28 | 11 | 7 | 12 | **202** |
| features/addresses | 8 | 46 | 33 | 45 | 22 | 7 | 36 | 4 | **193** |
| features/cart | 4 | 58 | 24 | 36 | 12 | 4 | 16 | 7 | **157** |
| features/rates | 4 | 38 | 39 | 35 | 12 | 5 | 4 | 7 | **140** |
| features/auth | 14 | 34 | 17 | 23 | 24 | 1 | 6 | 12 | **117** |
| features/leads | 3 | 31 | 11 | 11 | 20 | 7 | 5 | 29 | **114** |
| features/scrap | 6 | 48 | 20 | 8 | 19 | 3 | 2 | 13 | **113** |
| features/reviews | 3 | 35 | 19 | 16 | 15 | 4 | 2 | 10 | **101** |
| features/payouts | 2 | 12 | 20 | 26 | 11 | 3 | 1 | 2 | **75** |
| features/media | 2 | 10 | 12 | 10 | 7 | 9 | 6 | 5 | **59** |
| features/shipping | 1 | 20 | 7 | 8 | 3 | 2 | 7 | 1 | **48** |
| features/spots | 3 | 12 | 7 | 4 | 7 | 0 | 0 | 1 | **31** |
| features/intake | 1 | 5 | 8 | 7 | 6 | 0 | 0 | 0 | **26** |
| features/stripe | 4 | 4 | 2 | 2 | 0 | 0 | 12 | 0 | **20** |
| features/sales-tax | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | **1** |
| **total** | **258** | **1834** | **1083** | **1080** | **735** | **269** | **365** | **513** | **5879** |

Ten feature directories contain zero `.tsx` (`fulfillments`, `handoff`,
`insurance`, `packaging`, `pdfs`, `quotes`, `refiners`, `routes`, `service`) —
they are data/query layers only and are out of scope for every workstream.

Reproduce: `bash` loop in §Appendix A.

---

## 2. Workstream (a) — remove custom CSS and its call sites

### 2a. The CSS files

⚠ **Superseded — see §0.5.** This is the state *before* the parallel CSS
rewrite; it is kept as the before-picture. `app/styles/` was 752 lines across 8
files (now 1161), all imported by `globals.css`:

| file | lines | what it holds |
|---|---|---|
| `theme.css` | 138 | `@theme inline` token map, `:root` (light) and `.dark` palettes, `@keyframes shine` |
| `gradients.css` | 114 | `tab-indicator-primary/secondary`, `liquid-gold`, 2 keyframe animations |
| `icons.css` | 177 | 10 stroke-dash SVG animations (`handshake-1..5`, `scroll-1..5`) |
| `base.css` | 108 | element resets, scrollbar styling, autofill, `no-spinner` |
| `components.css` | 91 | the inset-shadow family + `section-label` + floating label |
| `globals.css` | 77 | imports + swiper fixes + a Tailwind cheat-sheet comment |
| `glass.css` | 32 | `glass-panel`, `glass-card`, the four `*-on-glass` pairs, `glass-divider` |
| `drawer.css` | 15 | `drawer-layout` |

### 2b. Call sites, by class

```bash
for c in raised-off-page on-glass glass-divider ... ; do
  echo "$c $(grep -roE "\b$c\b" app features shared --include='*.tsx' --include='*.ts' | wc -l)"
done
```

| class | kind | occurrences | files |
|---|---|---|---|
| `on-glass` | glassmorphism | 205 | 41 |
| `raised-off-page` | inset shadow | **126** | **71** |
| `glass-divider` | glassmorphism | 48 | 12 |
| `separator-inset` | inset shadow | 41 | 14 |
| `section-label` | typography | 40 | 12 |
| `no-spinner` | reset (keep) | 35 | 11 |
| `primary-on-glass` | glassmorphism | 25 | 12 |
| `destructive-on-glass` | glassmorphism | 22 | 9 |
| `success-on-glass` | glassmorphism | 21 | 8 |
| `floating-label` | form | 16 | 10 |
| `input-floating-label-form` | inset shadow | 14 | 8 |
| `glass-panel` | glassmorphism | 12 | 11 |
| `checkbox-form` | inset shadow | 6 | 5 |
| `radio-group-buttons` | inset shadow | 5 | 5 |
| `tab-indicator-primary` | gradient | 5 | 3 |
| `glass-card` | glassmorphism | 4 | 4 |
| `recessed-into-page` | inset shadow | 4 | 4 |
| `custom-scrollbar` | scrollbar | 4 | 4 |
| `tab-indicator-secondary` | gradient | 1 | 1 |
| `liquid-gold` | gradient + animation | 1 | 1 |
| `drawer-layout` | layout | 1 | 1 |
| `no-scrollbar` | reset (keep) | 1 | 1 |
| `secondary-on-glass` | glassmorphism | **0** | **0 — dead** |

`secondary-on-glass` is defined in `glass.css` and used nowhere. Delete for free.

### 2c. Two of these are component *defaults*, not call-site choices

- `shared/ui/base/drawer.tsx:40` — `className = 'glass-panel'` is the default prop.
- `shared/ui/table/Table.tsx:95` — `wrapperClassName = 'glass-card'` is the default prop.

Eight of the twelve `glass-panel` call sites and two of the four `glass-card`
call sites are re-passing the value the component already defaults to. Those
ten are pure noise and belong to workstream (h) as much as (a).

### 2d. Animation surface

| thing | count | note |
|---|---|---|
| files importing `framer-motion`/`motion` | **35** | `motion.*` used 117 times, `AnimatePresence` 76 times in 24 files |
| `animate-*` utilities | 11 | `animate-pulse` 3, `animate-in/out` 6, `animate-shine` 2 |
| `transition-*` utilities | 112 in 62 files | mostly `transition-colors` |
| `duration-*` | 37 in 21 files | |
| keyframe blocks in CSS | 14 | 1 in `theme.css`, 2 in `gradients.css`, 10 in `icons.css` +2 in `base.css`-adjacent |
| dedicated animation components | 4 | `features/orders/ui/{Confetti,ShineBorder,Animated}.tsx`, `shared/ui/BlurredStagger.tsx` |

`icons.css` (177 lines, 10 animations) drives `handshake-*` and `scroll-*` SVG
stroke reveals. Search for those class names in `.tsx` returns **0** — they are
applied inside SVG markup or are already dead. Verify before deleting:
```bash
grep -rn 'handshake-\|scroll-[1-5]' app features shared public --include='*.tsx' --include='*.svg'
```

`shared/ui/base/button.tsx` carries six `effect` variants that are entirely
gradient and animation (`shine`, `shineHover`, `gooeyRight`, `gooeyLeft`,
`underline`, `hoverUnderline`, `expandIcon`). Only **`expandIcon` is used, twice.**
The other six are dead code inside a live component — 8 lines of arbitrary
gradient strings each. Safe to delete once confirmed:
```bash
grep -rhoE "effect=[\"'{][a-zA-Z']+" app features shared --include='*.tsx' | sort | uniq -c
#   2 effect="expandIcon
```

---

## 3. Workstream (b) — centralize typography onto semantic tags

**931 JSX elements carry a text-size class** (1083 occurrences; the gap is
responsive pairs like `text-xs md:text-sm` on one element).

```bash
python3 scratchpad/typo.py   # see Appendix A
```

### Which element carries the styling

| element | count | can theme.css own it? |
|---|---|---|
| `div` | **419** | no — see split below |
| `p` | 107 | **yes** |
| `span` | 63 | no — inline, inside sentences |
| `h2` | 47 | **yes** |
| `Button` | 38 | no — component |
| `Label` | 37 | no — component |
| `Link` | 30 | **yes** (renders `<a>`) |
| `h3` | 25 | **yes** |
| `ul` | 16 | **yes** |
| `Input` | 14 | no — component |
| `label` | 11 | partially |
| `a` | 11 | **yes** |
| `h4` | 10 | **yes** |
| `FormField` | 10 | no — component |
| `NumberFlow` | 10 | no — third-party |
| `button` | 9 | no |
| `h1` | 8 | **yes** |
| `motion.div` | 7 | no |
| `TableHead` / `TableHeader` | 12 | no |
| `StatusChip` | 5 | no — see (h) |
| `TableCell` | 5 | no |
| `h5`/`h6`/`li`/`ol`/`dd`/`legend` | 8 | **yes** |

**Directly convertible (already on a semantic tag, class can move to theme.css): 262**
= p 107 + h1-h6 93 + `a` 11 + `Link` 30 + ul 16 + ol 1 + li 1 + dd 1 + legend 2.

**Requires manual judgment: 669.** That is the runbook in §6.

### The `<div>` split — measured, not guessed

Of the 419 divs carrying a text-size class, I parsed each element's body and
asked whether it contains any child JSX element:

| | count | meaning |
|---|---|---|
| **text leaf** (no child element) | **269** | genuinely a paragraph/label in a div. **Convertible** to `<p>`/`<span>`/`<h_>` |
| **wrapper** (has child elements) | **150** | the class is being *inherited* by descendants. A tag swap changes nothing and may break layout. **Runbook.** |

```bash
python3 scratchpad/divtext.py
```

Leaf examples (these are paragraphs):
```
app/sales-tax/page.tsx:19    body='Please select a state on the map or in the search below…'
app/rates/page.tsx:73        body='Loading current rates…'
app/verify-login/page.tsx:63 body='We suggest you set your password before doing anything else.'
```

Wrapper examples (these are not):
```
features/auth/ui/OrSeparator.tsx:5
  body='<div className="flex-grow"><Separator /></div><span className="px-4">or</span>…'
features/carriers/ui/CarrierServicesDrawer.tsx:519
  body='<span className="text-neutral-600">Created on</span>{" "}<span className="font-medium…'
```

### Size and weight distribution (what the semantic scale must cover)

```
text-sm 432   text-xs 270   text-base 167   text-lg 96   text-xl 55
text-2xl 47   text-3xl 10   text-4xl 4      text-6xl 1   text-5xl 1
font-medium 108   font-normal 65   font-semibold 55   font-light 2   font-bold 2
tracking-widest 39   tracking-wide 27   leading-relaxed 7
```

Two sizes carry 65% of the traffic. `text-sm` and `text-xs` are the real body
scale; `text-base` is used less than half as often as `text-sm`, which means
the browser default of 16px is *not* this app's body size. theme.css must set
`p { font-size: 0.875rem }` or the sweep will visibly enlarge every page.

---

## 4. Workstream (c) — remove light mode, tokens instead of hex

### 4a. The light-mode surface is five places, not one

⚠ **Partially executed — see §0.5.** The CSS half is done. The `.tsx` half
(rows 1, 4, 5, 6 below) is not.

| file:line | what |
|---|---|
| `app/layout.tsx:42` | `<ThemeProvider attribute="class" defaultTheme="light">` — **light is the default today** |
| `app/styles/theme.css:47-85` | the `:root` (light) palette |
| `app/styles/theme.css:1` | `@custom-variant dark (&:is(.dark *))` |
| `features/navigation/ui/ThemeSwitcher.tsx` | entire component becomes dead (23 lines) |
| `features/navigation/ui/Shell.tsx:105` | a **second**, inline theme toggle |
| `features/stripe/ui/StripeWrapper.tsx` + `AdminStripeWrapper.tsx` | `createStripeAppearance(theme)`, ~120 lines each, branch on `isDark` |

```bash
grep -rn "useTheme\|setTheme\|defaultTheme\|isDark" app features shared --include='*.tsx' --include='*.ts'
```

### 4b. The neutral scale is INVERTED between the two themes

⚠ **RESOLVED — see §0.5.** Kept for the reasoning and the 896-occurrence
measurement, which the resolution relies on. The decision is now recorded in
`theme.css`'s header. Do not reopen it.

```
:root  --neutral-100: hsl(0,0%,90%)   …   --neutral-900: hsl(0,0%,10%)
.dark  --neutral-100: hsl(0,0%,10%)   …   --neutral-900: hsl(0,0%,90%)
```

`neutral-*` is a **contrast scale, not a lightness scale**: `neutral-900` means
"maximum contrast against the ground" in both themes. In dark mode
`text-neutral-900` is near-white and `text-neutral-100` is near-black — the
opposite of the Tailwind convention the names imply.

**896 occurrences depend on this:**
```
text-neutral-700  306      text-neutral-800  224      text-neutral-600  222
text-neutral-900  144      text-neutral-500   55      text-neutral-200   26
```

This is the single biggest risk in the program. A sweep agent that reads
`text-neutral-700` as "dark gray" and "corrects" it to `text-neutral-300` for a
dark ground will invert the text color of the entire application, and the
change will *look* principled in the diff. **Jacob must decide before any sweep
starts** whether to (1) keep the inverted names and document them at the top of
`theme.css`, or (2) renumber the scale, which is a mechanical rewrite of all
896 references plus the 24 `bg-`/`border-neutral-*` uses and must be its own
commit with nothing else in it.

Related: `text-white` is used **179 times** and duplicates what `--foreground`
already means once light mode is gone. `bg-neutral-50` (2) and `bg-gray-200`
(1) reference tokens `theme.css` does not define at all — they resolve to
Tailwind defaults and will not track the theme.

### 4c. Raw hex — 62 occurrences, 40 lines, 8 files, and only ~15 are real work

```bash
grep -rnoE '#[0-9a-fA-F]{3,8}\b' app features shared --include='*.tsx' --include='*.ts' | awk -F: '{print $1}' | sort | uniq -c | sort -rn
```

| file | occ | verdict |
|---|---|---|
| `shared/ui/GoogleMapDisplay.tsx` | 17 | **not convertible** — Google Maps `styles` JSON, consumed by the Maps API, cannot read CSS vars |
| `.../salesOrderDrawer/drawerContents/Preparing.tsx` | 15 | brand gold, passed as JS arrays to Confetti/ShineBorder |
| `features/orders/ui/ShineBorder.tsx` | 6 | brand gold default |
| `features/sales-tax/ui/USMap.tsx` | 5 | SVG `<stop stopColor>` gradient def |
| `.../salesOrderDrawer/drawerContents/Pending.tsx` | 5 | brand gold |
| `.../purchase-order-checkout/checkoutStepper.tsx` | 5 | SVG `<stop stopColor>` gradient def |
| `app/order-placed/page.tsx` | 5 | brand gold confetti |
| `.../shippingStep/StoreLocations.tsx` | 4 | **not convertible** — Google Maps marker `fillColor`/`strokeColor` |

**The finding worth acting on:** the five-stop brand gold palette
`#ae8625 / #f5d67d / #d2ac47 / #edc967 / #ae8625` is written out **seven times**
— twice in `gradients.css` and five times in `.tsx` — with inconsistent casing
(`#AE8625` in `checkoutStepper.tsx` and `USMap.tsx`, lowercase everywhere else).
It should become five `--gold-*` custom properties in `theme.css`. The SVG
`<stop stopColor>` and JS-array sites can then read `var(--gold-1)`; the
Google Maps ones cannot and stay as literals with a comment saying why.

`features/sales-tax/ui/USMap.tsx` already does this correctly for its non-gold
colors (`.attr('stroke', () => 'var(--neutral-400)')`) — use it as the pattern.

### 4d. `dark:` variants — 38, and 29 are one file

```
features/navigation/ui/Footer.tsx        29
features/navigation/ui/Sidebar.tsx        2
.../drawerContents/Preparing.tsx          2
shared/ui/base/{switch,slider,scroll-area,checkbox}.tsx   1 each
```

Footer.tsx alone is 76% of workstream (c)'s `dark:` cleanup. It is in a cold
partition (P3) and can be done first as a proof of the approach.

Note `components.css` also carries five `dark:shadow-[…]` pairs inside
`@apply` — those are (a) and (c) at once.

---

## 5. Workstreams (d), (f), (g) — rounding, spacing, surfaces

### (d) Rounding and borders

`rounded-*` 292 total. The distribution is already close to standardized:
```
rounded-lg 105   rounded-md 38   rounded-full 38   rounded-r-lg 19   rounded-l-lg 19
rounded-none 18  rounded (bare) 16   rounded-xl 14   rounded-b-lg 5   rounded-sm 3
rounded-[inherit] 4   rounded-[100%] 2   rounded-[4px] 1   + 10 singletons
```
`rounded-lg` is 36% and `--radius: 0.35rem` is the single source. The real work
is the **16 bare `rounded`** (which resolve to `--radius-md`, not `lg`) and the
three arbitrary values. Small job.

Borders — 365 occurrences, and the color side is nearly clean already:
```
border (bare width) 142   border-border 76   border-1 27   border-primary 26
border-destructive 12   border-success 9   border-neutral-200 7   border-2 7
border-neutral-300 6   border-input 6   border-0 6   + 12 singletons
```
`border-1` (27) is not a Tailwind v3 class but is valid in v4. `border-border`
being the dominant color is good news: the border-color standardization is
mostly done. The 20-odd `border-neutral-*` are the exceptions to fix.

Per-directory: shared 85, orders 63, checkout 41, addresses 36, products 34.

### (f) Spacing

1080 `p-`/`m-` **plus 735 `gap-`/`space-`** = 1815.

```
value:  4→216  2→204  0→160  1→133  6→89  3→85  8→59  5→37  10→30  12→18
prefix: p 218  px 210  mb 152  py 122  mt 112  pl 84  pb 71  pt 33  pr 27  ml 23
gap:    gap-2 198  gap-1 194  gap-4 98  gap-3 90  gap-6 41  gap-5 13
```

Outliers off the standard scale (**36 occurrences**): `9`(11), `30`(3),
`2.5`(3), `1.5`(3), `0.5`(3), `7`(2), `50`(2), `3.5`(2), `14`(2), `44`, `34`,
`25`, `15`. Plus four arbitrary values (`mt-[11px]` ×2, `mt-[7px]`, `mt-[6px]`)
and 8 negative margins. `px-50` and `px-25` (in `app/page.tsx` and
`app/account/page.tsx`) are 200px and 100px of horizontal padding on buttons —
those are almost certainly mistakes for `px-5`/`px-2.5` worth eyeballing.

### (g) Surfaces

506 `bg-*`. Four ground levels exist and are used:
```
bg-card 121   bg-primary 116   bg-transparent 103   bg-highest 42   bg-background 30
bg-destructive 16   bg-success 14   bg-muted 13   bg-accent 5   bg-popover 2   bg-input 1
bg-neutral-* 23   bg-white 4   bg-black 2   bg-foreground 2   bg-border 4   bg-gray-200 1
```
Only **9 non-token backgrounds** (`bg-white` 4, `bg-black` 2, `bg-gray-200` 1,
`bg-neutral-50` 2) plus 6 arbitrary gradient/position values, 5 of which are in
`button.tsx`'s dead `effect` variants. The surface system is in better shape
than the rest — this is a small workstream.

~~The ladder in dark mode is `highest 10% → card 15% → background 20% →
popover 25% → border 30%`, i.e. `highest` is DARKER than `background`.~~
**Fixed by the parallel CSS rewrite** — the ladder now runs
`background 4% → card 8% → popover 11% → highest 13%`. See §0.5.

---

## 6. THE MANUAL-VERIFICATION RUNBOOK

Typography that **cannot** be converted to a semantic tag by a sweep. 669 cases in twelve categories. Each needs a human to look at the rendered result.

### R1 — HAZARD, read first: `text-*` is not all typography

239 occurrences of `text-left|center|right|justify|end|ellipsis` are **layout
alignment**, and 1473 are **color**. A regex written as `text-` matches 2816
things of which 1083 are sizes.

```
features/orders/purchaseOrders/admin/.../editActualValues.tsx:83
    <TableHead className="text-left">Scrap Item</TableHead>
features/orders/purchaseOrders/admin/.../editActualValues.tsx:84
    <TableHead className="text-center">Actual Purity</TableHead>
```
Deleting `text-center` here left-aligns a numeric column. Every sweep regex
must anchor on the size keywords explicitly.

### R2 — Wrapper divs styling by inheritance (150)

The class sits on a container so descendants inherit it. There is no tag to
swap to; the fix is to decide whether the descendants should carry their own
style or the container should stay.

```
features/carriers/ui/CarrierServicesDrawer.tsx:519
    <div className="text-xs ..."><span className="text-neutral-600">Created on</span>{' '}
      <span className="font-medium text-neutral-800">{formatted}</span></div>
features/auth/ui/OrSeparator.tsx:5
    <div className="...text-sm..."><div className="flex-grow"><Separator /></div>
      <span className="px-4">or</span>...</div>
```

### R3 — Styled spans inside sentences (63)

Inline emphasis. `<span>` is correct; the question is whether it should become
`<strong>`/`<em>` or lose the class entirely.

```
features/spots/ui/MobileSpots.tsx:46
    <span className="text-sm font-medium uppercase tracking-wide">{spot.name}:</span>
shared/ui/table/PopoverSelect.tsx:77
    {label && <span className="text-xs text-neutral-700 font-medium pl-1">{label}</span>}
features/checkout/.../StoreLocations.tsx:173
    <span className="text-sm text-neutral-800 whitespace-nowrap">
```

### R4 — Form labels (49: `Label` 37, `label` 11, `FormLabel` 1)

`<Label>` is a shadcn component wrapping `<label>`. theme.css cannot reach it
without styling bare `label`, which would also hit the 11 raw ones and any
label inside third-party markup.

```
features/addresses/ui/AddressForm.tsx:204
    <Label className="text-xs text-neutral-700">Find Address</Label>
features/carriers/ui/CarriersDrawer.tsx:97
    <Label htmlFor="carrier_name" className="text-xs pl-1 font-medium text-neutral-700">
shared/ui/table/CreateDialog.tsx:138
    <label htmlFor={fieldId} className="block text-xs text-neutral-600 mb-1">
```
All four `CreateDialog` labels are identical — a candidate for a single
`.form-label` or a `Label` default, not for theme.css.

### R5 — Buttons (47: `Button` 38, `button` 9)

`buttonVariants` already sets `text-sm font-medium` in its base. Every call
site passing a size is overriding that. Fixing this belongs to (h), not (b).

```
app/page.tsx:62
    className="bg-primary raised-off-page px-9 sm:px-10 py-6 sm:py-7 text-white text-lg sm:text-xl"
features/addresses/ui/AddressCard.tsx:155
    className="px-4 py-0 min-w-22 text-sm md:text-base"
```

### R6 — Table cells and headers (17)

Column-level typography. A `<td>` rule in theme.css would apply to every table
including the 9 admin data tables built by `shared/ui/table/`.

```
features/users/ui/ActiveDevices.tsx:66
    <TableCell className="text-xs md:text-sm text-neutral-800 text-center">
features/users/ui/ActiveDevices.tsx:31
    <TableHead className="text-xs md:text-sm text-neutral-600 text-center">
```

### R7 — Inputs (16+)

Input text size affects the iOS zoom-on-focus threshold (16px). Changing
`text-sm` to a theme default here has a mobile behavior consequence, not just a
visual one.

```
features/orders/purchaseOrders/admin/.../AdminReceived.tsx:112  <Input ... />
shared/ui/inputs/FloatingLabelInput.tsx  (7 call sites, all pass className)
```

### R8 — Badges / chips (5)

All five `StatusChip` call sites pass a different size. The component's own
comment admits it:
> `className` carries per-site size tweaks (text-sm/text-base, h-fit, gap-1)

```
features/carriers/ui/CarrierServicesDrawer.tsx:109  <StatusChip positive={active} className="text-base">
features/carriers/ui/CarriersDrawer.tsx:73          <StatusChip positive={active} className="text-base h-fit">
features/leads/ui/LeadsDrawer.tsx:68                <StatusChip positive={lead.converted} className="text-sm">
features/reviews/ui/ReviewsDrawer.tsx:54            <StatusChip positive={!review.hidden} className="gap-1 text-sm">
features/products/ui/ProductDrawer.tsx:72           <StatusChip positive={activeProduct} glass className="text-base">
```
Jacob picks one size, all five overrides delete. This is the cleanest (h) win
in the codebase.

### R9 — Numeric display components (12)

`NumberFlow`/`PriceNumberFlow` animate digits; the component measures glyph
widths, so a font-size change from a parent rule can produce layout jitter that
only shows during the animation. Verify these in motion, not in a screenshot.

```
features/users/ui/UsersDrawer.tsx:148
    <PriceNumberFlow value={user.dorado_funds} className="text-lg text-neutral-900 pr-3" />
features/products/ui/BullionCard.tsx:263
    <NumberFlow value={quantity} className="text-white text-lg font-semibold" trend={0} />
```

### R10 — Responsive size pairs (109 occurrences, 43 files)

An element with `text-xs md:text-sm` cannot collapse to one semantic rule
unless theme.css carries the same breakpoint. 24 `sm:text-sm`, 20
`sm:text-base`, 15 `md:text-sm` lead.

```
features/payouts/ui/PayoutCard.tsx:19
    <div className="mt-1 text-xs sm:text-sm text-neutral-600 flex flex-wrap gap-3">
features/addresses/ui/StateSelect.tsx:97
    'w-full bg-highest border-1 border-border ... max-h-9 text-sm md:text-base text-neutral-800 font-normal'
```

### R11 — Conditional / computed classes (62 lines)

The size is chosen at runtime. A static sweep cannot see both branches.

```
features/addresses/ui/AddressCard.tsx:110
    variant === 'default' ? 'text-xl md:text-2xl' : 'text-base md:text-lg'
features/addresses/ui/AddressCard.tsx:122
    variant === 'default' ? 'text-sm md:text-base mt-4' : 'text-xs mt-3'
features/navigation/ui/Sidebar.tsx:120
    <div className="text-sm text-primary">{type === 'Bid' ? 'Ask' : 'Bid'} Spots</div>
```

### R12 — Cross-origin surfaces that CSS cannot reach

`features/stripe/ui/StripeWrapper.tsx` and `AdminStripeWrapper.tsx` build a
Stripe Elements `Appearance` object. Stripe renders in an iframe on Stripe's
origin — it cannot see `theme.css`. The wrappers already do the right thing by
reading computed custom properties:
```js
const getColor = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim()
colorBackground: getColor('--background'),
colorText: getColor('--neutral-800'),
```
but they hardcode the inset box-shadow strings and `logoColor: isDark ? 'dark' : 'light'`.
When light mode goes, delete the `isDark` branches in both files — **and note
that these two files must be re-verified against a live Stripe checkout**, not
a unit test. They are on the money path.

Same class of problem: `shared/ui/GoogleMapDisplay.tsx` (17 hex values in a
Maps `styles` array) and `.../StoreLocations.tsx` (4 marker colors). The Maps
JS API takes literal colors only.

### Runbook summary

| category | count | |
|---|---|---|
| R2 wrapper divs (inheritance) | 150 | |
| R3 styled spans in sentences | 63 | |
| R4 form labels | 49 | |
| R5 buttons | 47 | overlaps (h) |
| R10 responsive pairs | 109 occ / 43 files | |
| R11 conditional classes | 62 lines | |
| R6 table cells/heads | 17 | |
| R7 inputs | 16 | mobile-behavior risk |
| R9 numeric display | 12 | verify in motion |
| R8 badges | 5 | easiest win |
| **total elements needing judgment** | **669** | |
| R12 cross-origin | 4 files | **money path — Stripe** |

---

## 7. THE DIV-SOUP TRIAGE (workstream e)

**Of 1834 divs, I believe 320 have a defensible semantic answer — 17%.
The other 1514 are legitimately generic layout boxes and should stay divs.**

How I determined it, per category — each is a parse, not an eyeball:

| # | category | count | how counted | target tag |
|---|---|---|---|---|
| 1 | text-leaf div (no child element, carries text styling) | **269** | parsed each `<div>`'s body, checked for `<[A-Za-z]` | `<p>` / `<span>` / `<h_>` |
| 2 | root element returned from a `.map()` callback | **30** | paren-matched every `.map(`, found the first tag after `=>` | `<li>` in a `<ul>`, or `<article>` |
| 3 | outermost element of a `page.tsx`/`layout.tsx` with no `<main>` in the file | **10** | matched first `return (<Tag` per page file | `<main>` |
| 4 | div with `onClick` and no `role`/`tabIndex` | **11** | parsed open-tag attributes | `<button>` |
| | **total with an answer** | **320** | | |
| | remainder | **1514** | flex/grid containers, spacers, positioning wrappers | **stay `<div>`** |

Category 1 overlaps §3 exactly (it is the same 269), so (b) and (e) should be
done **in the same pass per file** — converting a `text-sm` div to `<p>` is
one edit that serves both workstreams. Splitting them across agents means
touching the same lines twice.

```bash
python3 scratchpad/divs.py      # categories 3, 4
python3 scratchpad/maps.py      # category 2
python3 scratchpad/divtext.py   # category 1
```

### Category 2 detail — the list structures

118 `.map()` callbacks return JSX. Their root elements:
```
div 30   TableRow 13   CommandItem 10   li 9   label 9   motion.label 7
RatingButton 6   button 4   Button 4   TableCell 3   motion.div 2  ...
```
**Zero of the 30 div-rooted maps are inside a `<ul>` or `<ol>`.** Nine maps
already return `<li>` — those are in `Sidebar.tsx` and `Shell.tsx` and are the
existing correct pattern to copy.

```
features/addresses/ui/AddressList.tsx:92            (parent <div>)
features/cart/ui/Cart.tsx:65                        (parent <div>)
features/auth/ui/PasswordRequirements.tsx:40        (parent <div>)
app/rates/page.tsx:196                              (parent <div>)
features/payouts/ui/PayoutLandingSection.tsx:23     (parent <div>)
```
Per directory: orders 7, products 6, shared 4, rates 3, checkout 2, spots 2,
app/addresses/auth/cart/intake/payouts 1 each.

**Caution:** wrapping in `<ul>` adds `list-style` and default padding that
Tailwind Preflight removes, but it also changes the flex/grid parent-child
relationship — if the current container is `flex`, inserting a `<ul>` between
it and the items breaks the layout unless the `<ul>` inherits the flex classes.
Every one of these 30 needs a visual check. This is the category most likely to
produce a silent regression.

### Category 3 detail — the missing `<main>`

22 `page.tsx`/`layout.tsx` files. Only 4 `<main>` elements exist in the whole
codebase (`app/account/page.tsx:169`, `app/payout-options/page.tsx:8`,
`app/rates/page.tsx:53`, `shared/ui/SidebarLayout.tsx:227`).

These 10 pages open on a `<div>` and have no `<main>` anywhere:
```
app/page.tsx                      app/sell/page.tsx
app/buy/page.tsx                  app/sales-tax/page.tsx
app/buy/[slug]/page.tsx           app/order-placed/page.tsx
app/authentication/page.tsx       app/verify-login/page.tsx
app/privacy-policy/page.tsx       app/terms-and-conditions/page.tsx
```
`app/layout.tsx` wraps everything in providers with no landmark element at all —
`<body>` → `ThemeProvider` → … → `LayoutProvider` → `{children}`. Putting one
`<main>` in `LayoutProvider` would fix all ten at once and is a smaller,
safer change than ten separate edits. **Check first whether `SidebarLayout`
(which has its own `<main>`) wraps any of them, or you will nest two.**

### Existing semantic landmarks (the pattern to follow)

```
<section>  13   app/page.tsx ×2, app/payout-options ×2, app/rates ×2,
                features/{intake,payouts,rates,reviews}/ui/*LandingSection.tsx,
                features/users/ui/{UserForm ×2, PasswordAndSecurity}
<article>   3   app/rates/page.tsx:100, features/payouts/ui/PayoutCard.tsx:14,
                features/reviews/ui/ReviewsLandingSection.tsx:114
<nav>       5   navigation/Shell, navigation/Sidebar, SidebarLayout,
                base/breadcrumb, base/pagination
<main>      4   <footer> 2 (both in navigation/Footer.tsx)  <header> 1  <aside> 0
```

`features/payouts/ui/` is the best-formed feature in the codebase —
`<section>` + `<header>` + `<article>` + `<ul>` — and it is only 2 files and
75 weight. **Use it as the reference implementation** and as the shape the
other sweeps converge on.

### What should NOT be converted

- `<aside>` has 0 uses and there is no obvious complementary content — do not
  invent one.
- The 150 wrapper divs from §3 are styling containers; a semantic tag on them
  is worse, not better, because it asserts meaning that isn't there.
- Radix/shadcn primitives render their own elements. Do not wrap or replace
  them; `PopoverContent`, `DialogContent`, `Command*` all have ARIA roles
  already and a surrounding semantic tag can conflict with them.

---

## 8. Workstream (h) — shared component call sites

**153 files import from `shared/ui`. 1040 JSX call sites of imported
`shared/ui` components. 684 (65%) pass a `className`/`style`/`*ClassName`
override.**

```bash
python3 scratchpad/shared_calls.py
python3 scratchpad/classify.py
```

Splitting the 684 by what the override actually changes:

| | count |
|---|---|
| layout/positioning only (`w-`, `flex`, `gap-`, `items-`, `absolute`, `mt-`…) — **acceptable** | 262 |
| **appearance overrides — this is workstream (h)** | **422** |

What the 422 touch (a site can hit several):
```
text-color 197   padding 174   text-size 120   bg 107   glass 95
font 66   shadow 60   border 29   rounded 22
```

Per directory:
```
orders 113   products 54   shared 48   carriers 35   users 29   addresses 26
navigation 23   leads 16   auth 15   checkout 15   cart 14   app 10
reviews 7   rates 6   scrap 5   media 3   intake/payouts/spots 1 each
```

### Worst offenders by rate

| component | call sites | with override | |
|---|---|---|---|
| `Input` | 54 | 54 | **100%** |
| `Label` | 39 | 39 | **100%** |
| `TableHead` | 34 | 34 | **100%** |
| `Button` | **190** | **185** | **97%** |
| `RadioGroupItem` | 19 | 18 | 94% |
| `Table` | 17 | 16 | 94% |
| `TableRow` | 32 | 30 | 93% |
| `StatusChip` | 5 | 5 | **100%** |
| `SidebarLayout` | 4 | 4 | 100% |
| `TableCell` | 85 | 67 | 78% |

`Button` at 185/190 is the headline: the component defines six variants and
four sizes, and 97% of call sites override it anyway. Either the variants are
wrong or the call sites are. **That is a design question for Jacob, not a
sweep decision** — a sweep that deletes 185 classNames without adding the
right variants will flatten every button in the app to `bg-primary h-10 px-4`.

### The four new wave-2 components

| component | call sites | overrides | note |
|---|---|---|---|
| `AccordionSection` | 12 | **0** | clean — the model |
| `UpdatedByline` | 4 | **0** | clean |
| `StatusChip` | 5 | **5** | all five are size tweaks; see R8 |
| `SelectMenu` | **0** | — | **written but adopted nowhere** |

`SelectMenu` has zero call sites outside its own definition. CLAUDE.md records
a "deferred-adoption table for the orders tree" — that deferral is total. Worth
confirming with Jacob that it is intended and not a dropped stitch.

### Redundant defaults (free wins)

```
shared/ui/base/drawer.tsx:40    className = 'glass-panel'          ← default
shared/ui/table/Table.tsx:95    wrapperClassName = 'glass-card'    ← default
```
8 of 12 `glass-panel` and 2 of 4 `glass-card` call sites re-pass the default.
Deleting those 10 props is a no-op visually and shrinks (a) at the same time.

---

## 9. PROPOSED PARTITION

### The rule that makes it safe

Sweeps are **directory-disjoint**. No file appears in two partitions. But file
disjointness is not sufficient on its own — P0 must land *before* the others,
because (b), (g) and (h) all depend on what `theme.css` and the shared
components end up owning. An agent deleting `className="text-base"` from a
`StatusChip` call site while another agent changes `StatusChip`'s own default
produces two correct-looking diffs and one wrong chip.

### P0 — FOUNDATION (serial, alone, first)

`app/styles/**` + `shared/ui/**` — weight **704** + the CSS files.

⚠ **A parallel agent has already done the `app/styles/**` half** (§0.5). P0 is
now the `shared/ui/**` half plus one thing that cannot wait:

> **P0.0 — the white-on-white remediation (52 sites, 39 files).** This crosses
> every partition including the hot one, so it cannot be a partition's job. It
> must be one focused commit, done before any sweep and before anything reaches
> `master`. `shared/ui/DotSelect.tsx:11` and `shared/ui/SidebarLayout.tsx:192`
> are inside P0's tree; the other 37 files are not, so **the coordinator must
> run P0.0 as its own pass across all directories with the sweeps paused.**

Nothing else runs concurrently. Deliverables that the other partitions consume:
- the light-mode deletion and the neutral-scale decision (§4b)
- semantic tag rules in `theme.css` for `h1-h6, p, a, ul, ol, li`
- the spacing token set, **including `gap`**
- `--gold-1..5` tokens
- the `Button` variant/size decision (§8) — **the gating decision**
- `StatusChip` final size, `SelectMenu` adoption ruling
- `secondary-on-glass` and the six dead `Button` effects deleted

Note: `shared/` is 69 `.tsx` but only 704 weight — it is many small files, so
it parallelizes badly within itself. One agent, one pass.

### P1 — COMMERCE — weight 1201

```
features/products   846      features/cart      157
features/rates      140      features/spots      31
features/intake      26      features/sales-tax   1
```
Contains the second-densest directory (`products`: 310 divs in 12 files, and
`ProductPageDetails.tsx` alone carries 12 `AccordionSection` call sites and
three of the 11 clickable-div a11y cases).

### P2 — CHECKOUT & IDENTITY — weight 1183

```
features/checkout   537      features/users      203
features/addresses  193      features/auth       117
features/scrap      113      features/stripe      20
```
⚠ `features/stripe` is on the money path (R12). Its two files must be verified
against a live Stripe Elements render, not a unit test. Consider holding those
two files out of the sweep entirely and doing them as a separate reviewed change.

### P3 — SHELL & ADMIN-LITE — weight 1344

```
app                 580      features/carriers   288
features/navigation 202      features/leads      114
features/reviews    101      features/media       59
```
Highest-value partition to run first among P1-P3: contains Footer.tsx (29 of
the 38 `dark:` variants), all 10 missing-`<main>` pages, and both live theme
toggles.

### P4 — HELD BACK (do not schedule)

```
features/orders    1324      features/payouts     75
features/shipping    48      features/refiners     0 (.tsx)
features/fulfillments 0 (.tsx, untracked)
```
Weight 1447 — 25% of the total — and **every file in it is hot.**

### HOT FILES — currently modified in the working tree

From `git status --short` (worktree column, i.e. unstaged in-flight edits):

```
features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminPaymentProcessing.tsx
features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/AdminReceived.tsx
features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/editActualValues.tsx
features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerContents/editRefinerValues.tsx
features/orders/purchaseOrders/admin/adminPurchaseOrderDrawer/adminPurchaseOrderDrawerHeader.tsx
features/orders/purchaseOrders/users/purchaseOrderCard.tsx
features/orders/purchaseOrders/users/purchaseOrderDrawer/purchaseOrderDrawerHeader.tsx
features/orders/salesOrders/admin/adminSalesOrderDrawer/adminSalesOrderDrawerHeader.tsx
features/orders/salesOrders/users/salesOrderCard.tsx
features/orders/salesOrders/users/salesOrderDrawer/salesOrderDrawerHeader.tsx
features/orders/ui/Animated.tsx
features/orders/ui/Confetti.tsx
features/orders/{invalidation,spots}.ts   features/orders/purchaseOrders/{admin,users}/queries.ts
features/orders/salesOrders/users/queries.ts   features/orders/purchaseOrders/types.ts
features/payouts/queries.ts   features/pdfs/queries.ts   features/refiners/queries.ts
shared/queries/keys.ts        (MM — staged AND unstaged)
features/fulfillments/        (?? — untracked, brand new)
D features/orders/fulfillment.ts   D features/orders/ui/CountdownRing.tsx
```

Plus 32 frontend files with staged-only changes and all of `api/**`.

**`shared/queries/keys.ts` is `MM` — modified in both index and worktree. It is
in P0's directory tree.** It carries no styling (it is a query-key module) so
P0 will not touch it, but the coordinator should confirm P0's agent is scoped
to `shared/ui/**` and `app/styles/**` only, not all of `shared/**`.

### Seams to review after the sweeps

`app/` pages compose feature components across partitions:

| page | pulls from |
|---|---|
| `app/admin/page.tsx` | carriers, leads, orders, products, rates, reviews, users — **P1+P3+P4** |
| `app/account/page.tsx` | addresses, auth, orders, users — **P2+P4** |
| `app/page.tsx` | intake, payouts, rates, reviews — **P1+P3+P4** |
| `app/sell/page.tsx` | products, scrap — **P1+P2** |
| `app/checkout/page.tsx` | auth, checkout — P2 |

No file conflict, but padding applied in a page wrapper (P3) and inside a card
(P1) can double up. Screenshot these five pages before and after.

---

## Appendix A — scripts

Written to
`/tmp/claude-1000/-home-jtj60-dorado-exchange/1390bbda-539d-4100-9058-350dfe458b13/scratchpad/`
(session-scoped; regenerate from the descriptions below if gone):

- `tally.sh <label> <regex>` — per-directory occurrence counts
- `shared_calls.py` — resolves `shared/ui` imports per file, paren-matches every
  JSX open tag of an imported component, records whether a className-family prop
  is present → `overrides.json`
- `classify.py` — splits `overrides.json` into layout-only vs appearance
- `typo.py` — per-element text-size attribution
- `divtext.py` — text-leaf vs wrapper split of text-styled divs
- `divs.py` — clickable divs, page roots, role= divs, form groups
- `maps.py` — `.map()` callback root elements

Per-directory weight table:
```bash
cd frontend
for d in app shared $(ls -d features/*/ | sed 's|/$||'); do
  f=$(find $d -name '*.tsx' | wc -l); [ "$f" = 0 ] && continue
  dv=$(grep -roE '<div\b' $d --include='*.tsx'|wc -l)
  tx=$(grep -roE '\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b' $d --include='*.tsx'|wc -l)
  pm=$(grep -roE '\b[pm][trblxy]?-[0-9]+(\.5)?\b' $d --include='*.tsx'|wc -l)
  gp=$(grep -roE '\b(gap|space-[xy])-[0-9.]+' $d --include='*.tsx'|wc -l)
  rd=$(grep -roE '\brounded-[a-zA-Z0-9]+' $d --include='*.tsx'|wc -l)
  bd=$(grep -roE '\bborder[a-z0-9-]*' $d --include='*.tsx'|wc -l)
  cu=$(grep -roE '\b(raised-off-page|recessed-into-page|[a-z-]*on-glass|glass-(panel|card|divider)|separator-inset|section-label|input-floating-label-form|checkbox-form|radio-group-buttons|tab-indicator-[a-z]+|liquid-gold|drawer-layout)\b' $d --include='*.tsx'|wc -l)
  echo "$d $f $dv $tx $pm $gp $rd $bd $cu $((dv+tx+pm+gp+rd+bd+cu))"
done | sort -k10 -rn
```

⚠ The `\b` before `[pm]` is load-bearing: without it, `gap-2` matches `p-2` and
every spacing count inflates by roughly the gap count.

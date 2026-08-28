# Style retirement manifest

What the CSS foundation pass (dark-only rebrand) **neutered but did not delete**,
and what the `.tsx` sweep has to finish. Nothing in this list is gone: every
class name still resolves, so the app renders sanely while the sweep proceeds
feature by feature.

The foundation pass could not edit a single `.tsx` file, so everything below is
a call site it could see but not touch. **All counts are `grep` over
`frontend/**` `.tsx` + `.ts`, taken 2026-08-28.** Re-run the command in each
section to confirm an item is dead before deleting its CSS.

---

## 0. READ THIS FIRST — what will look wrong until swept

### 0.1 `bg-primary` + `text-white` is white-on-white (52 lines)

`--primary` is now **white** (Jacob: *"we just need to change bg-primary to be
white"*). 52 of the 105 `bg-primary` lines also carry `text-white`.

**`app/styles/base.css` carries a temporary bridge that already repaints them**,
so the app does NOT currently render blank primary buttons. The bridge matches
`.bg-primary.text-white` plus its `!`, `hover:` and `has-[]` spellings and sets
`color: var(--primary-foreground)`. It lives in `@layer utilities` — the same
layer as `.text-white` — and wins on specificity `(0,2,0)` vs `(0,1,0)`.
**It is a crutch, not the design.**

Coverage was measured, not assumed, by extracting every quoted class string in
the tree and checking whether one string holds both classes:

| | count |
|---|---:|
| lines with both `bg-primary` and `text-white` | 52 |
| both in **one** class string (same element) → bridge applies | 50 |
| `has-[[data-state=checked]]:` pair (`ProductCard.tsx:202`) → bridge applies | 1 |
| `ProductPageDetails.tsx:637` `'bg-primarytext-white'` — **pre-existing typo**, missing space, never was a class, never rendered | 1 |

**51 of 52 covered; the 52nd was already broken before this pass.**

Sweep: replace `text-white` → `text-primary-foreground` on those 51 (safer than
deleting it — half are `<span>`/`<label>` elements that would otherwise fall back
to an inherited colour rather than to the `Button` cva's own
`text-primary-foreground`), fix the typo on line 637, then delete the bridge
block from `base.css`.

```
grep -rn "bg-primary" --include=*.tsx . | grep "text-white"     # expect 0
```

### 0.2 `shared/ui/base/button.tsx` ghost variant is invisible

```
ghost: 'bg-transparent hover:bg-transparent text-primary-foreground hover:text-accent-foreground'
```

`--primary-foreground` is now **near-black** (it is the text that sits *on* a
white primary button). The ghost variant uses it as if it meant "body text", so
ghost buttons render near-black on a near-black ground. It was legible only
because the old light theme happened to make `--primary-foreground` dark-on-light.

**This is the one genuinely broken thing the foundation pass could not fix**, and
it is not covered by any bridge — the selector is indistinguishable from a
legitimate `text-primary-foreground` use. Fix: `text-primary-foreground` →
`text-foreground` on that variant only.

### 0.3 Stripe Elements will render in LIGHT appearance on a dark page

`features/stripe/ui/StripeWrapper.tsx:119` and `AdminStripeWrapper.tsx:119`:

```js
const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
```

`app/layout.tsx` still says `<ThemeProvider attribute="class" defaultTheme="light">`,
so the `.dark` class is **not** on the document and this evaluates to `'light'` —
a light Stripe payment form embedded in a dark checkout.

The CSS no longer depends on that class (see §1), but this JS does. Fix either
by flipping `defaultTheme` to `"dark"` (and dropping the toggle in
`features/navigation/ui/ThemeSwitcher.tsx` + `Shell.tsx:105`), or by hardcoding
`'dark'` at both call sites. **On the checkout path — worth doing early.**

### 0.4 COMPLETE low-contrast checklist (every pairing, not just primary)

Do not assume `bg-primary`/`text-white` was the only inversion — it was not, but
it is 42 of the 48. Produced by resolving each element's effective background
and text colour **with `dark:` overrides applied** (a `dark:` utility now wins,
so `bg-neutral-800 dark:bg-highest` resolves to `bg-highest`), then computing
the real sRGB contrast ratio. Anything under 3.0:1 is listed.

| # | Effective pairing | Ratio | Bridge? | Sweep action |
|---:|---|---:|:---:|---|
| 42 | `bg-primary` + `text-white` | 1.04:1 | **yes** | → `text-primary-foreground` |
| 4 | page ground + `text-neutral-300` | 1.98:1 | no | 6px decorative `CircleIcon` bullets ×3 + one stepper rule. → `text-neutral-500` |
| 1 | page ground + `text-primary-foreground` | 1.03:1 | **no** | `button.tsx:15` ghost variant — see §0.2. → `text-foreground` |
| 1 | `bg-destructive` + `text-white` | 3.54:1 | no | `shared/ui/DisplayToggle.tsx:44`. Legible but under AA for body text. → `text-destructive-foreground` (5.45:1) |

**48 sites total.** A further ~10 of the 52 in §0.1 collide only in a `hover:` or
`has-[checked]:` state rather than at rest; the bridge covers those too.

Two more that the raw grep flags but which are **NOT defects** — do not "fix"
them:

- `shared/ui/base/input.tsx:11` pairs `selection:bg-primary` with
  `selection:text-primary-foreground`. Correct already; a naive grep pairs the
  `selection:` background with the element's ordinary `text-neutral-800`.
- `features/navigation/ui/Footer.tsx` — see §0.5. It resolves correctly.

### 0.5 The Footer is the always-on `dark:` variant's biggest win

`theme.css` made the `dark` variant always match (§1). 38 previously-DEAD `dark:`
utilities went live, and **29 of them are in `features/navigation/ui/Footer.tsx`**.

Visually this is a fix, not a regression, and it is worth understanding because
it is the clearest example of what the variant change does:

```
<footer className="... bg-neutral-800 dark:bg-highest text-white ...">
  <Link className="text-xs text-neutral-200 dark:text-neutral-700">
```

The footer was **fully authored for dark mode and never once got to show it** —
`defaultTheme="light"` meant `.dark` was never on the document. Had the `dark:`
half stayed dead, the ramp inversion would have turned `bg-neutral-800` into an
87%-lightness near-WHITE band across the bottom of a black app, with 75% grey
links on it. Instead `dark:bg-highest` now wins and the footer resolves to:

| Element | Resolves to | Contrast |
|---|---|---:|
| footer ground | `--highest` `#1e2024` | — |
| body text (`text-white`) | white | 16.31:1 |
| nav links (`dark:text-neutral-700`) | `#babec5` | 8.75:1 |
| reCAPTCHA links (`dark:text-neutral-600`) | `#9a9ea7` | 6.08:1 |

All three clear AA comfortably. The same mechanism resolves `Sidebar.tsx:136`.

**Corollary for whoever reviews this visually:** every screenshot of this app
taken before today is of the *light* palette. There is no "before" reference for
the dark look.
---

## 1. Light mode / the `.dark` class

`theme.css` no longer defines a `.dark` block; `:root` **is** the dark palette.

The `dark` variant was redefined so it is **always on**:

```css
@custom-variant dark (&:is(:root, :root *));
```

Rationale and the specificity argument are in the `theme.css` header. Net effect:
the 38 `dark:` utilities across 7 `.tsx` files, and every `dark:` inset shadow
that used to live in `components.css`, now resolve to their dark half with no
`.tsx` edits — and 30 of the 34 `text-neutral-{100,200,300}` call sites that the
ramp inversion would otherwise have broken are **fixed** by it, because they were
already written as `text-neutral-200 dark:text-neutral-700` pairs.

| Item | Count | Sweep action |
|---|---:|---|
| `dark:` utilities in `.tsx` | 38 (7 files) | Collapse each `X dark:Y` pair to `Y`; then the `@custom-variant` line can go back to being unnecessary |
| `ThemeSwitcher.tsx` | 1 file | Delete the component and its 2 call sites |
| `Shell.tsx:105` toggle | 1 | Delete |
| `useTheme` imports | 2 files | Delete |

```
grep -rn "dark:" --include=*.tsx --include=*.ts . | grep -v "dark:.*dark:" | wc -l
```

**Residual 6** light-end neutral sites with no `dark:` companion, which the
inversion flips and which want a human eye:

| File:line | Class | Note |
|---|---|---|
| `features/checkout/purchase-order-checkout/checkoutStepper.tsx:264` | `text-neutral-300` | dim, decorative |
| `features/checkout/purchase-order-checkout/payoutStep/payoutStep.tsx:180` | `text-neutral-300` | 6px `CircleIcon` bullet |
| `features/products/ui/ProductPageDetails.tsx:492` | `text-neutral-300` | 6px bullet |
| `features/products/ui/ProductPageDetails.tsx:931` | `text-neutral-300` | 6px bullet |
| `features/addresses/ui/AddressCard.tsx:170` | `hover:text-neutral-100` | hover inverts — now reads as black-on-white, arguably correct |
| `shared/ui/base/button.tsx:14` | `text-neutral-100 bg-neutral-800` | secondary variant — now black-on-white. Probably what you want on dark; confirm |

Four of the six are 6px decorative dots at 1.92:1. None is a text-legibility bug.

---

## 2. `glass.css` — glassmorphism, NEUTERED

Kill list item. **227 occurrences across 47 files**, so the names stay. Every
class is now a flat, token-based surface: no `backdrop-blur`, no translucent
`/65` grounds, no `shadow-2xl`/`shadow-md`/`shadow-lg`.

| Class | Occurrences | Files | Was | Is now | Sweep should use |
|---|---:|---:|---|---|---|
| `.on-glass` | **137** | 40 | `bg-transparent border-neutral-400 text-neutral-900` | `bg-transparent border-border text-foreground` | delete the class; it is now a no-op over inherited colour + a hairline |
| `.glass-divider` | 48 | 12 | `h-[2px] bg-border` | `h-px bg-border` | `<Separator />` or `border-t border-border` |
| `.primary-on-glass` | 25 | 12 | `bg-primary/10 border-primary shadow-lg text-primary` | `bg-primary/15 border-primary text-primary` | a `StatusChip` variant |
| `.destructive-on-glass` | 22 | 9 | `bg-destructive/10 … shadow-lg` | `bg-destructive/15 border text-destructive` | `StatusChip` variant |
| `.success-on-glass` | 21 | 8 | `bg-success/10 … shadow-lg` | `bg-success/15 border text-success` | `StatusChip` variant |
| `.glass-panel` | 12 | 11 | `bg-highest/65 backdrop-blur-sm shadow-2xl` | `bg-highest border border-border` | `bg-highest border border-border` |
| `.glass-card` | 4 | 4 | `bg-highest/65 backdrop-blur-sm shadow-md` | `bg-card border border-border` | `bg-card border border-border` |
| `.secondary-on-glass` | **0** | 0 | — | kept for symmetry | **delete now** — no call sites |

The tint went from `/10` to `/15` because a 10% tint over a near-black ground is
invisible where it used to sit over a light one.

**Precedence caveat.** `globals.css` imports `glass.css` *without* a `layer()`,
so these rules are **unlayered** and therefore beat **every** cascade layer,
`utilities` included. `<div className="on-glass text-neutral-600">` takes
`on-glass`'s colour, not `text-neutral-600`. That is pre-existing behaviour and
was deliberately **left alone** — changing precedence and colour in the same pass
makes the diff unreviewable. **The sweep should move this file into
`@layer components`**, which will let utilities override it, and re-check the 40
files at that point.

```
grep -rnE "(^|[^a-zA-Z0-9-])(on-glass|glass-panel|glass-card|glass-divider)\b" --include=*.tsx .
```

---

## 3. `gradients.css` — gold gradients, NEUTERED

Kill list item. 7 occurrences. Zero gradient literals remain in the compiled CSS.

| Class | Occ | Files | Was | Is now |
|---|---:|---:|---|---|
| `.tab-indicator-primary` | 5 | 3 | 5-stop gold gradient underline, `h-[3px]` | `h-px`, solid `var(--primary)` |
| `.tab-indicator-secondary` | 1 | 1 | 7-stop near-black gradient | `h-px`, solid `var(--border-strong)` |
| `.liquid-gold` | 1 | 1 | animated gold gradient + radial shine on `::before` | flat `var(--brand)`; `::before` emptied, not removed |

`::before` is kept as an empty positioned box so nothing that measures or
positions against it reflows. The sweep can delete it with the class.

---

## 4. Animations — kept as no-ops

Names kept so `animation:` references and the `--animate-shine` theme entry stay
valid. All three now animate from a value to the same value.

| Keyframes | Where | Call sites | Status |
|---|---|---:|---|
| `shine` | `theme.css` | `animate-shine` ×2 (2 files) | no-op |
| `backgroundShift` | `gradients.css` | via `.liquid-gold` | no-op |
| `shineMove` | `gradients.css` | via `.liquid-gold::before` | no-op |

`--animate-shine: shine var(--duration) infinite linear` is retained in `@theme
inline`. Note `var(--duration)` was never defined anywhere in the codebase, so
this animation had **no valid duration even before this pass**.

`icons.css` (177 lines of `stroke-dasharray` handshake/scroll animations) is
**untouched** — it is pure geometry, contains no colour, and is not decoration in
the sense Jacob means.

```
grep -rn "animate-shine\|liquid-gold" --include=*.tsx .
```

---

## 5. `components.css` — light/dark shadow pairs COLLAPSED

Light mode is gone, so every `shadow-[…] dark:shadow-[…]` pair collapsed to its
dark half and moved onto three tokens in `theme.css`: `--shadow-raised`,
`--shadow-recessed`, `--shadow-overlay`.

This mattered: the light halves were **1px pure-white inset highlights**
(`hsla(0,0%,99%,1)`). On a near-black ground those render as bright wires across
every raised surface — and `.raised-off-page` alone has **126 occurrences across
71 files**, the most-used class in the codebase.

| Class | Occ | Files | Change |
|---|---:|---:|---|
| `.raised-off-page` | 126 | 71 | → `var(--shadow-raised)` |
| `.separator-inset` | 41 | 14 | `h-[3px]` bevel → `h-px` solid `var(--border)` |
| `.section-label` | 40 | 12 | unchanged (`text-neutral-600` = 7.41:1, fine) |
| `.floating-label` | 16 | 10 | unchanged; `text-primary` on focus is now white |
| `.input-floating-label-form` | 14 | 8 | → `var(--shadow-recessed)` |
| `.checkbox-form` | 6 | 5 | → `var(--shadow-recessed)` |
| `.radio-group-buttons` | 5 | 5 | → `var(--shadow-raised)` |
| `.recessed-into-page` | 4 | 4 | → `var(--shadow-recessed)` |
| `.drawer-layout` (`drawer.css`) | 1 | 1 | `shadow-2xl` → `var(--shadow-overlay)` |

These are skeuomorphic bevels and **not** on Jacob's explicit kill list, so they
were retuned rather than removed. If flat-everything is the goal, point all three
tokens at `none` in `theme.css` — one edit, no `.tsx` churn.

### `.shadow` name collision

`components.css` defines a class literally named `.shadow`, which collides with
Tailwind's own `shadow` utility — and because the file is unlayered, **the custom
rule wins**. Only 2 bare `shadow` spellings exist in the tree so it is not biting
today, but it is a trap. Rename to `.drop-shadow-hard` and update those 2.

---

## 6. Loose ends the sweep should pick up

| Thing | Count | Note |
|---|---:|---|
| `text-white` | 179 | On a dark theme this is usually "primary text" and should be `text-foreground`. 52 are the `bg-primary` collision in §0.1 |
| `bg-white` | 4 | Almost certainly wrong on dark |
| Raw gold hex (`#ae8625` `#f5d67d` `#d2ac47` `#edc967`) | 35 in 5 files | Now have a token: `--brand` / `bg-brand` / `text-brand`. Includes Google Maps style JSON, which legitimately needs literals |
| `backdrop-blur*` | 4 | Glassmorphism leftovers outside `glass.css` |
| `shadow-2xl` | 2 | → `shadow-overlay` token |
| Ad-hoc `p-*`/`m-*` | 765 / 315 | → named scale, §7 |
| `gap-*` | 674 | → named scale |
| `text-<size>` | 1083 | → semantic tags, or `text-h1`/`text-body`/`text-small` |
| `font-<weight>` | 232 | mostly redundant once tags carry weight |

---

## 7. What replaced them — the tokens now available

Full documentation is in the `theme.css` header. Summary:

**Spacing** (`--spacing-*`, auto-generates `p-md px-lg py-sm mt-xl gap-md
space-y-lg w-md …`):
`3xs` 2px · `2xs` 4px · `xs` 8px · `sm` 12px · `md` 16px · `lg` 24px · `xl` 32px ·
`2xl` 48px · `3xl` 64px.
The numeric scale (`p-4`) still works — named and numbered are visually distinct
in a diff on purpose, so a half-finished sweep is visible.

**Type** (`--text-*`, auto-generates `text-h1 … text-micro` carrying size +
line-height + letter-spacing + weight):
`display` · `h1`–`h6` · `body` 15px · `small` 13px · `micro` 12px.
**These are already applied to `h1`–`h6`, `p`, `small`, `strong`, `em`, `li`,
`blockquote`, `code` in `base.css`** — semantic markup needs no classes.

**Surfaces**: `background` (ground) → `card` → `popover` → `highest`, each one
step lighter. Plus aliases `bg-surface` / `bg-surface-raised` /
`bg-surface-overlay`.

**Borders**: `--border` (hairline, 1.48:1) and `--border-strong` (deliberate
edge). `border-border-strong` is a new utility.

**Brand**: `--brand` holds the Dorado gold that `--primary` used to be.

**Elevation**: `--shadow-raised` / `--shadow-recessed` / `--shadow-overlay`.

### `ul` / `ol` are deliberately NOT styled

Preflight resets lists to `list-style: none; margin: 0; padding: 0` and this
codebase **relies** on that. Of 19 `<ul>` in `.tsx` only 13 are prose lists
(privacy-policy, terms-and-conditions, sales-tax) and every one of those already
spells `list-disc ml-6` for itself. The other six are structure: the Shell
navbar, the Sidebar, the images grid, and `shared/ui/base/pagination.tsx`.
Styling `ul` in `@layer base` would put bullets and an indent in the navigation
bar. **Prose lists opt in with `list-disc`. Do not "fix" this.**

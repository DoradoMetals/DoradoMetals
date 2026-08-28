# Manual-verification runbook

Everything the styling program cannot decide mechanically, with `file:line` and
the reason. Jacob asked for this explicitly.

**I have no browser.** Playwright browsers are not cached in this environment
and I did not download them, so **nothing below has been visually verified** —
and neither has anything I changed. Contrast ratios are computed from the token
values; layout and legibility are not. Every item here needs a human looking at
a rendered page.

Sorted by risk, not by category.

---

## 1. MONEY PATH — Stripe Elements

**R12. `features/stripe/ui/StripeWrapper.tsx:119` and `AdminStripeWrapper.tsx:119` — FIXED, NEEDS LIVE VERIFICATION.**

Both files had:

```js
const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
```

Light mode is gone and no `.dark` class is on the document, so this evaluated to
`'light'` — **a light Stripe payment form embedded in a near-black checkout**.
I changed both to `const theme = 'dark' as const`.

Stripe Elements renders **in an iframe on Stripe's origin**. It cannot see
`theme.css`; this JS `Appearance` object is the only way the palette reaches it,
so no CSS change can fix or break it. That also means:

- **A unit test cannot verify this.** It must be checked against a live Stripe
  render on a real checkout.
- The wrappers read `--background`, `--neutral-800` etc. via
  `getComputedStyle(document.documentElement)`. **I changed several of those
  token values** (surfaces darkened, `--secondary`/`--accent` de-hued,
  `--radius` 5.6px → 8px). The Stripe form's colours therefore moved with them,
  in a surface I cannot see.
- The `boxShadow` strings in both files are still hardcoded inset shadows from
  the light era (4 `isDark ?` ternaries each, now always taking the dark
  branch). They were not part of the fix. Ruling 16 deletes the shadow family;
  these two files are the last place inset shadows survive, and they are on the
  money path — **deliberately left for a human.**

**Verify: a real card entry on a real checkout, both the customer and admin
wrappers.**

---

## 2. Deleting a class is not always a no-op — the precedence trap

`glass.css` and `components.css` are **unlayered**, so their rules beat every
cascade layer including `utilities`. `<div className="on-glass text-neutral-600">`
renders `on-glass`'s colour **today**. Delete `on-glass` and `text-neutral-600`
becomes live for the first time.

Full explanation and the two `shared/` cases I resolved are in
`DELETION-ORDER.md`. **Every partition must check its own pairs.** 178 `on-glass`
occurrences across 28 files remain.

---

## 3. Things I changed that alter appearance beyond my scope

These are deliberate, follow Jacob's rulings, and are **not visually verified**.

| # | change | who feels it |
|---|---|---|
| 3.1 | **Body copy is now muted** — `p` resolves to `--muted-foreground` (`#9499a4`, 6.96:1) instead of `--neutral-800` (`#dadde2`, 14.60:1). Ruling 19 calls this the single biggest lever on the reference look. | **every paragraph in the app** |
| 3.2 | **`--radius` 0.35rem → 0.5rem.** `rounded-lg` is 36% of all rounding (105 sites) and every one got 2.4px rounder. | every container |
| 3.3 | **Buttons are pills** (`rounded-full`), and every Button's type now comes from its size variant. | all 193 Button call sites |
| 3.4 | **`--secondary` and `--accent` de-hued** from saturated blue to a neutral raised surface. Every `accent` use is chrome (button/calendar/nav hover), so this is right per ruling 19 — but 4 call sites use `text-secondary`/`border-secondary` as a decorative accent and I re-pointed them (see 5.2). | ghost/outline hover, calendar, NavIcon |
| 3.5 | **Surface ladder tightened** — card 8%→7%, popover 11%→9%, highest 13%→11%. Panels are meant to separate by *border*, not fill. If panels now read as too flat, this is the knob. | every card, popover, drawer |
| 3.6 | **`ul`/`ol` are styled** (see §4). | prose and structural lists |
| 3.7 | **Prose links** (`p a`, `li a`, `blockquote a`, `td a`, `dd a`) get `--foreground` + a subtle underline. Navbar/sidebar/card links are untouched **by construction** — they are not inside a `<p>`. | prose pages |
| 3.8 | **`::selection`** was `--secondary` (a blue that is now a dark neutral surface, which would have made selected text nearly invisible). Now `--neutral-800` on `--background`. | text selection everywhere |

---

## 4. `ul`/`ol` — the three lists my reset does NOT reach

Jacob overruled the foundation's decision to leave lists unstyled. They are now
prose by default in `typography.css`, with structural lists reset by semantic
selector (`nav ul`, ARIA roles, `[cmdk-list]`) plus a layout-intent selector
(`ul[class*='flex']:not([class*='list-'])`, same for `grid`/`space-y`).

Verified reachable: Shell navbar, Sidebar, breadcrumb, pagination (all four sit
inside a real `<nav>`), the images grid, `PasswordRequirements`, `PayoutCard`.

**NOT reachable — these will get disc/decimal markers and a 24px indent:**

| file:line | element | fix |
|---|---|---|
| `features/orders/purchaseOrders/users/purchaseOrderDrawer/drawerContents/InTransit.tsx:95` | `<ol className="relative">` | **wave 3** — a custom timeline. Needs `list-none` or a role. |
| `features/shipping/ui/TrackingEvents.tsx:81` | `<ol className="relative ml-4">` | **wave 3** — same |
| `features/shipping/ui/TrackingEvents.tsx:111` | `<ol className="relative ml-4">` | **wave 3** — same |

All three are in wave-3 files I may not touch. **This is a visible regression
until they are fixed.**

Also unverified: the 13 prose lists still spell `list-disc ml-6` themselves.
That is now redundant, but **five of them in `terms-and-conditions/page.tsx`
are `flex flex-col`**, and my layout-intent selector would reset them if their
`list-disc` were removed. The `:not([class*='list-'])` guard is what keeps them
working today. If a sweep strips `list-disc` from a `flex` list, it must also
drop the `flex`.

---

## 5. Judgement calls I made that a human should confirm

### 5.1 `bg-success` + `text-white` — an inversion RETIREMENT.md §0.4 missed

§0.4 listed `bg-destructive` + `text-white` at 3.54:1 and did **not** list
`bg-success` + `text-white`, which computes to **2.07:1** — worse than the one
it caught. Both were default props in `shared/ui/DisplayToggle.tsx:43-44`.
There was no `--success-foreground` token to convert to, so **I added one**
(`hsl(228,13%,6%)`, 9.33:1 on success). Confirm the green toggle reads.

### 5.2 Call sites re-pointed because `--secondary` stopped being a hue

| file:line | was | now | note |
|---|---|---|---|
| `app/privacy-policy/page.tsx:105,117` | `text-secondary` | *(unchanged — flagged)* | prose links; now covered by the `p a` rule if they sit in a `<p>`. **Check.** |
| `features/cart/ui/Cart.tsx:39` | `border-secondary text-secondary` | *(unchanged — flagged)* | a decorative count circle. Should probably become `<CountBadge>`. **P1's call.** |
| `features/products/ui/MobileProductCarousel.tsx:104` | `border-secondary border-2 shadow-md` | *(unchanged — flagged)* | selected-thumbnail ring. `border-primary` is the monochrome answer. **P1's call.** |

I did **not** convert these four — they are appearance decisions inside other
partitions, and `--secondary` is now a dark neutral surface, so
`text-secondary` on them will read as **dark grey on dark**. **This is a live
low-contrast issue in three files.** Listed rather than guessed at.

### 5.3 Two conflicting-utility lines I resolved by deletion

| file:line | what | what I did |
|---|---|---|
| `features/rates/ui/RatesLandingSection.tsx:63` | had **both** `text-white` and `text-primary` at rest on `bg-highest`, plus a `hover:bg-primary`/`hover:text-white` pair | dropped the redundant `text-white` (both are ~98% white), converted the hover to `hover:text-primary-foreground`. Kills a bridge match. |
| `features/addresses/ui/AddressList.tsx:118` | had **both** `hover:text-neutral-900` and `hover:text-white` on a `hover:bg-primary` | dropped `hover:text-neutral-900` (a light-theme leftover — `neutral-900` is now near-*white*, so it fought the intent), kept `hover:text-primary-foreground` |

In both cases two utilities set the same property and emit order decided the
winner. Worth a glance.

### 5.4b Four states the palette flip COLLAPSED, found by the shared/** cross-element scan

D95's lesson generalised further than D95 stated it. Its scan looked for a
light BACKGROUND paired with a light FOREGROUND across elements. Two of the
four below are that; the other two are a **STATE token and a REST token that
became the same colour**, which no white-on-white scan of any kind would find.
All four are fixed; none is visually verified.

| file:line | what it was | what it is now |
|---|---|---|
| `shared/ui/SidebarLayout.tsx:144` | a `bg-primary` tile whose icons resolved to `text-white` through a `cn()` fallback — white icon, white tile. The `roleIconClassName` escape hatch that fed it was **used by neither call site**. | `text-primary-foreground`; the prop is deleted (ruling 20) |
| `shared/ui/ReviewInput.tsx` | `buttonColor`/`headerColor`/`titleTextColor`/`subtitleTextcolor` **default props** — a white gradient band with white title and subtitle. Neither call site passed any of the six. | all six props deleted; flat `bg-highest` band with a hairline |
| `shared/ui/SelectMenu.tsx` | `text-primary` **and** `hover:bg-primary` on the same row — the label vanished under the cursor | `text-foreground hover:bg-accent` |
| `shared/ui/base/calendar.tsx` | the SELECTED day was `bg-transparent text-primary` against a rest state of `text-foreground` — #fafafa vs #f6f7f9, i.e. **you could not see which date you had picked**. Its hover was also dead: `hover:bg-transparent` sat after `hover:bg-accent` and cancelled it. | selected fills with `--primary`; hover keeps the accent fill |

Also found in the same pass and fixed: `shared/ui/inputs/InputDropdownSearch.tsx`
highlighted its active row with `bg-neutral-700`, which after the ramp inversion
is a **light** grey band under light text. Now `bg-accent`.

**Still outstanding, and NOT in my scope to fix — the same failure mode reached
through JavaScript.** `features/checkout/purchase-order-checkout/shippingStep/StoreLocations.tsx:65`
reads `--secondary` with `getComputedStyle` and hands it to Google Maps as the
**default (unselected) map pin's fill**. `--secondary` was a saturated blue and
is now `hsl(225,9%,15%)`, a near-black dot on a light map. Line 73 does the same
with `--primary` for the selected pin, which is now near-white with a
near-white `--neutral-900` stroke, so the selected pin has lost its ring.
This is the Stripe-iframe class of problem (§1): JS reading CSS variables is
invisible to CSS review, and no stylesheet change can fix or break it. The
only other JS reads of tokens in the tree are the two Stripe wrappers, already
covered in §1. **Verify against a real FedEx-location map.**

### 5.4 `ProductPageDetails.tsx:637` — the pre-existing typo

`'bg-primarytext-white hover:text-white'` — a missing space, so
`bg-primarytext-white` was never a class and **that selected-state background
has never rendered in production**. I fixed it to mirror line 183:
`'bg-primary text-primary-foreground hover:text-primary-foreground'`.

**This makes a background appear that no one has ever seen.** It is almost
certainly what the author intended, but it is a genuine visual change, not a
no-op. P1 should eyeball the selected product-option state.

### 5.4c Two silent, tree-wide defects in the composition machinery

Neither is a stylesheet decision, but both changed how every component in the
app renders and neither produced an error of any kind.

- **`cn()` was deleting the semantic type scale.** tailwind-merge classified
  `text-small`/`text-h1`/… as COLOURS (they are our tokens, not Tailwind's), so
  a colour merged after a size REPLACED it. Every Button had lost its size
  variant's font-size and was inheriting its parent's, while three sweeps were
  deleting ~700 `text-sm` call-site utilities on the promise that the variant
  supplies the size. Fixed in `shared/utils/cn.ts`, pinned by `cn.test.ts`.
  **Every rendered font size in the app moved when this landed** — that is the
  fix, not a regression, but it is the single largest visual change in this
  pass and nothing has been seen rendered.
- **`<Button variant="link">` rendered as a 40px padded pill.** `cva` emits
  `size` after `variant`, so the default size beat `link`'s own box reset.
  Fixed with a compound variant; pinned by `button.test.ts`. **21 link call
  sites change appearance when this lands**, from a box back to a link.

### 5.5 Variant names kept that no longer describe their look

- `Button` `outline` and `secondary` are now **identical** (both the Linear
  secondary). Kept as separate names only so ~120 call sites in other
  partitions do not become type errors at once. Collapse once swept.
- `AccordionSection`'s variants are still named `glass` and `raised` (12 call
  sites) after their glass and shadow were removed. Rename once swept.

---

## 6. Typography that cannot be converted mechanically

Carried forward from `STYLING-INVENTORY.md` §6, still open, now with the
`shared/**` half resolved. **669 elements need a human.**

| id | category | count | why |
|---|---|---:|---|
| R1 | **HAZARD** `text-*` is not all typography | 239 alignment + 1473 colour | `text-left/center/right` is layout. A `text-` regex matches 2816 things of which only 1083 are sizes. Deleting `text-center` on a `TableHead` re-aligns a numeric column. |
| R2 | wrapper divs styling by inheritance | 150 | the class sits on a container so descendants inherit; there is no tag to swap to |
| R10 | responsive size pairs | 109 occ / 43 files | `text-xs md:text-sm` cannot collapse to one semantic rule |
| R3 | styled spans inside sentences | 63 | ruling 22 case 2 — `<strong>`/`<em>`/`<time>`, or a bare span carrying no typography. **Never `<span><p>`, which is invalid HTML.** |
| R11 | runtime-conditional classes | 62 lines | the size is chosen at runtime; a static sweep sees one branch |
| R4 | form labels | 49 | **partly resolved** — `Label`'s default now carries the 37 identical ones. The 11 raw `<label>` and 1 `FormLabel` remain. |
| R5 | buttons | 47 | **resolved** — absorbed by the size variants. See `CONVERSION-TABLE.md`. |
| R6 | table cells and headers | 17 | **resolved** — absorbed by the table defaults. Alignment stays (R1). |
| R7 | inputs | 16 | **partly resolved.** `text-base` is 16px and is the **iOS zoom-on-focus threshold** — a mobile *behaviour*, not a look. Do not sweep it into `text-small`. |
| R9 | numeric display (`NumberFlow`) | 12 | the component measures glyph widths; a font-size change from a parent rule can cause jitter **during the animation only**. Verify in motion, not in a screenshot. |
| R8 | badges | 5 | **resolved** — `StatusChip` `size` variant. |

### Div soup (workstream e), unchanged and not started

320 of 1834 divs have a semantic answer (17%); the other 1514 stay divs.
269 text-leaf divs (ruling 22 case 1), 30 `.map()` roots, 10 pages missing
`<main>`, 11 clickable divs with no `role`/`tabIndex`.

**The 269 are the same elements as workstream (b)'s convertible divs**, so (b)
and (e) must run in the **same pass per file** (D93) or the same lines get
touched twice.

**Caution on the 30 `.map()` roots:** none of them is currently inside a
`<ul>`/`<ol>`. Wrapping them adds a list, and if the current container is
`flex`, inserting a `<ul>` between it and the items breaks the layout unless
the `<ul>` inherits the flex classes. **This is the category most likely to
produce a silent regression** — and it now also interacts with the new list
styling in §4.

---

## 7. Not verified, not attempted

- **Nothing has been seen rendered.** No Playwright browsers cached; I did not
  download any.
- **The five composite pages** (`app/admin`, `app/account`, `app/page`,
  `app/sell`, `app/checkout`) pull components across partition boundaries.
  Padding applied in a page wrapper and inside a card can double up.
  Screenshot these five before and after the sweeps.
- **There is no "before" reference for the dark look.** Every screenshot of
  this app taken before 2026-08-28 is of the light palette.
- `app/layout.tsx:42` still says `defaultTheme="light"`, and
  `ThemeSwitcher.tsx` + `Shell.tsx:105` still offer a toggle that now does
  nothing. Out of my scope (P3). The CSS no longer depends on it, and the
  Stripe JS that did is fixed (§1), so this is now cosmetic — but the dead
  toggle should go.

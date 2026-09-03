# @dorado/theme

The design tokens and the type ramp: the CSS half of the design system the
Figma "Themes and Components" file is the drawing of. Dark only, `:root` is
the palette.

The stylesheets themselves carry no comments (Jacob, 2026-09-03). Everything
they used to explain is collected here, because several of these notes record
bugs that were expensive to find and are invisible in the CSS itself.


## Notes recovered from `theme.css`

- ============================================================================
  THEME — dark only.
  ----------------------------------------------------------------------------
  Light mode is gone. There is one palette and it lives on :root. The former
  `.dark` block has been folded into :root; the `.dark` class no longer gates
  anything.
  
    ---------------------------------------------------------------------------
  THE NEUTRAL RAMP IS RETIRED (Jacob, 2026-08-31).
  ---------------------------------------------------------------------------
  `--neutral-100..900` and their `--color-neutral-*` aliases are GONE, in the
  theme and in the Figma library both. They were primitives leaking into call
  sites: a component asking for `text-neutral-700` was naming a POSITION on a
  ramp, not a ROLE, so nothing about the class said what it meant and the
  inversion story below had to exist at all.
  
    Every use now names a role instead. The mapping applied to 141 call sites
  (113 utilities + 28 raw `var(--neutral-*)` reads for canvas, maps and the
  Stripe elements theme):
  
    neutral-900, -800  ->  foreground
  neutral-700        ->  subtle            (added here for this; Figma
  already had text/subtle)
  neutral-600        ->  muted-foreground
  neutral-500, -400  ->  placeholder
  neutral-300        ->  border-strong
  neutral-200, -100  ->  border / muted
  
    The one behavioural change: the selected Chip's `hover:bg-neutral-800` was
  a hand-picked dim of primary, and the hover law is opacity now, so it is
  `hover:opacity-85` like every other control.
  
    ---------------------------------------------------------------------------
  THE `dark:` VARIANT IS NOW ALWAYS ON.
  ---------------------------------------------------------------------------
  app/layout.tsx sets `<ThemeProvider attribute="class" defaultTheme="light">`,
  so the `.dark` class is NOT on the document, and the old
  `&:is(.dark *)` variant matched nothing. 38 `dark:` utilities across 7 .tsx
  files plus every inset shadow in components.css would have been dead — and
  dead in the direction that leaves white 1px highlights on a black page.
  
    `&:is(:root, :root *)` always matches, and `:is(:root, ...)` carries the
  specificity of `:root` (0,1,0), so a `dark:` utility scores (0,2,0) and beats
  its own unprefixed base (0,1,0) regardless of emit order. Every `dark:` pair
  in the tree now resolves to its dark half with no .tsx edits.
  ============================================================================

- One family since the Geist refresh: headings and body are both Geist,
  weight doing the separating (600 headings, 500 chrome, 400 body). The
  --font-header hook survives for typography.css but resolves to the same
  face.

- Eyebrow labels are monospace (ruling 19). No webfont is loaded for this —
  the system mono stack is deliberate: it costs nothing and the eyebrow is
  always uppercase and letter-spaced, where stack differences barely read.

- Surface aliases — see SURFACES below. Additive; nothing used these before.

- The Dorado gold. `--primary` is no longer gold (it is white, per Jacob),
  so the brand colour needs a home of its own. 28 raw hex spellings of this
  gold live in .tsx today — see RETIREMENT.md.

- --- THE RAISED-SURFACE RADIUS (added 2026-09-03) ------------------------
  10px, and it had no step: the size scale runs 4/6/8/12 and the drawings
  kept asking for the value between the last two. Three separate components
  had each reached the same arbitrary `rounded-[10px]` independently - the
  Menu popover, the Address Card and the Toast - and three call sites
  agreeing on a number no token carries is the definition of a missing
  token.
  
    NAMED FOR WHAT IT MEANS, not for where it sits in the ramp. Inserting an
  `--radius-lg-plus` between lg and xl would be a size name nobody could
  order from memory; every one of the three is a surface that FLOATS above
  the page, and that is the thing they have in common. Controls keep
  rounded-lg.

- ============================================================================
  SCALES — spacing, radius, type.
  Declared in a NON-inline @theme so they are emitted as real custom properties
  on :root and can be read with var() from base.css and from call sites.
  
    Tailwind v4 generates the whole utility family from these namespaces
  automatically (verified by compiling them):
  --spacing-*  ->  p-md px-md py-lg pt-md m-md mt-lg gap-md space-y-md w-md ...
  --text-*     ->  text-h1 (size + line-height + letter-spacing + weight)
  --radius-*   ->  rounded-md ...
  The numeric scale (p-4, gap-2) is untouched and still works — it comes from
  the separate `--spacing` multiplier.
  ============================================================================

- --- SPACING -------------------------------------------------------------
  A 7-step named scale. Named rather than numbered because the numbered
  scale already exists and still works: `p-4` and `p-md` must be visually
  distinguishable in a diff, or a half-finished sweep is invisible.
  765 ad-hoc p-*, 315 m-*, 674 gap-* call sites converge here.
  Steps are the values the codebase already clusters on (4/8/12/16/24/32).

- --- THE NAMED STEPS ABOVE SHADOW THE CONTAINER SCALE -------------------
  Every spacing name (3xs..3xl) is also a Tailwind container-scale name,
  and `max-w` resolves `--max-width -> --spacing -> --container` - so the
  steps above shadowed `--container-*` and `max-w-3xl` silently became
  64px, collapsing every page shell built on a named max-width. These pin
  the container meaning back via the namespace that outranks spacing;
  values are Tailwind's own, verbatim. The spacing meaning stays for
  p-/m-/gap-. `max-w-4xl` and up never collided - the spacing scale stops
  at 3xl, and must keep stopping there or its new steps need pinning too.

- --- TYPE ----------------------------------------------------------------
  One scale, driving both the semantic tag rules in base.css and the
  `text-h1`-style utilities. 15px body: Linear's, and denser than the 16px
  browser default without going small.

- --- DISPLAY NUMERALS ----------------------------------------------------
  A HEADING SIZE IS NOT A NUMBER SIZE, which is the gap this fills. `/rates`
  shows percentages at 36px and 30px, and the only tags that reach those
  sizes are `<h1>` and `<h2>` — so the sweep had to hang `text-h1` off a
  `<strong>` purely for the size, and that was the last remaining piece of
  type scatter in P3's whole partition.
  
    Two sizes because the page needs two: the desktop grid cell and the mobile
  pair row. They are DELIBERATELY not `--text-h1`/`--text-h2` values reused
  under another name — a stat is a different thing from a heading and should
  be free to move without dragging every `<h1>` in the app with it.
  
    Use the `.stat` / `.stat-sm` utilities in typography.css rather than
  `text-stat` directly: a figure that animates (`NumberFlow`, 12 sites) also
  needs `tabular-nums` or it jitters mid-transition, and the utility carries
  both halves so they cannot be spelled apart.

- ============================================================================
  PALETTE
  ============================================================================

- --- NEUTRAL RAMP --------------------------------------------------------
  Inverted (see header). 100 sits on the ground, 900 is the brightest text.
  Slight cool cast (hue ~216-225) rather than pure grey — the Linear look.
  Contrast against --background:
  500 4.76:1 | 600 7.41:1 | 700 10.66:1 | 800 14.60:1 | 900 18.08:1
  The four shades carrying 896 of the 992 text call sites (600/700/800/900)
  all clear WCAG AA for normal text; 500 clears it at 4.76:1.

- --- SURFACES ------------------------------------------------------------
  Four steps, and elevation makes a surface LIGHTER — which is what the old
  light palette did (background 92% -> card 97% -> highest 100%) and what
  Linear does. The old `.dark` block had inverted this so that an elevated
  card was DARKER than the page; that reading is dropped, because the light
  palette is the one the 121 bg-card / 42 bg-highest call sites were
  actually authored against.
  
    background  the page ground, the darkest thing on screen
  card        the default panel/row surface
  popover     menus, dropdowns, tooltips — one step off the card
  highest     modals, drawers, the top of the stack
  
    None is pure #000: true black is reserved for the page ground's own
  backdrop and for nothing else, so surfaces always have somewhere to sit.

- --- BORDERS -------------------------------------------------------------
  Hairlines. 1.48:1 against the ground — visible as separation, not as a
  glowing line. --border-strong is for the rare case that needs to read as
  a deliberate edge (active field, selected row).

- #3f434b - synced to the Figma
  variables 2026-08-30; the drawing resolves border/strong to this, one
  step off the #3d414a its own description still says (stale description,
  noted in phase10-design-system.md).

- --- TEXT ----------------------------------------------------------------

- The fourth text level, added 2026-08-31 when the neutral primitives were
  retired: Figma has text/subtle and the code had no equivalent, so
  text-neutral-700 had nowhere semantic to land.

- #787c87  4.76:1 - the Figma
  text/placeholder variable ("input placeholders and empty-state prompts;
  clears AA for normal text, unlike text/disabled"), synced 2026-08-30.

- --- PRIMARY -------------------------------------------------------------
  WHITE, per Jacob: "we just need to change bg-primary to be white".
  `bg-primary` is now a white button and `--primary-foreground` is the
  near-black that sits on it (18.49:1).
  
    THIS IS THE ONE CHANGE THAT BREAKS CALL SITES: 52 of the 105 `bg-primary`
  lines also say `text-white`, which would be white-on-white. base.css
  carries a temporary bridge rule that repaints 51 of those 52 (the 52nd,
  ProductPageDetails.tsx:637, is a PRE-EXISTING typo — `bg-primarytext-white`
  with a missing space, never a valid class, never rendered; the sweep did
  not introduce it).
  
    THE SWEEP RULE, mechanical, no per-site design judgement:
  
    bg-primary + text-white   ->   bg-primary + text-primary-foreground
  
    `text-primary-foreground`, NOT `text-background`. Both are dark and the
  two are visually indistinguishable here (18.49:1 vs 19.05:1 on --primary),
  so the choice is about meaning, not appearance:
  
    - `--primary-foreground` is DEFINED as "the text that sits on primary".
  It is the token that tracks --primary if --primary ever moves.
  - `--background` means "the page ground". Coupling button text to the
  page ground is a coincidence that holds today and breaks the moment
  the ground and the primary surface diverge.
  - shadcn's own primitives ALREADY pair them this way —
  shared/ui/base/button.tsx:11 (`bg-primary text-primary-foreground`),
  checkbox.tsx:17, input.tsx:11. Sweeping to `text-primary-foreground`
  makes the 51 hand-written call sites agree with the primitives instead
  of diverging from them; sweeping to `text-background` would make them
  the only places in the app using `text-background`.
  
    Yes, Linear's primary button is a light ground with dark text, and that is
  exactly what `bg-primary` + `--primary-foreground` now produces. Reserve
  `bg-brand` / `text-brand` (the gold) for genuine brand moments.
  
    Full checklist of every residual low-contrast pairing is in
  RETIREMENT.md section 0.4.

- --- ACCENT / SECONDARY — DE-HUED (ruling 19) -----------------------------
  The foundation pass lifted both to a saturated blue (hsl(203,89%,56%))
  because the old hsl(200,95%,30%) was invisible on a dark ground. That
  reasoning was right about the LIGHTNESS and wrong about the HUE, and I am
  overriding it deliberately — see the note at the top of this section.
  
    Measured: every one of the 7 `accent` call sites is CHROME, not status —
  button.tsx ghost hover, calendar.tsx day hover, NavIcon.tsx hover. A
  saturated blue there is precisely the "structural element carrying a hue"
  the reference forbids. Both are now neutral raised surfaces, which is also
  what shadcn's own semantics mean by them: `bg-secondary` /
  `bg-accent` are SURFACES, and `--*-foreground` is the text that sits on
  them. Hue survives only in --success / --destructive (status) and --brand
  (the one sanctioned hue, gold, used sparingly).

- #23252a  the hover fill for quiet chrome

- #a7b0be  9.09:1  focus ring — light, not blue

- --- STATUS --------------------------------------------------------------
  Semantics unchanged, both lifted for a dark ground.

- sits ON success. RETIREMENT.md
  section 0.4 listed `bg-destructive`+`text-white` (3.54:1) but MISSED
  `bg-success`+`text-white`, which is 2.07:1 — worse than the one it caught.
  Both were defaults in shared/ui/DisplayToggle.tsx. There was no
  --success-foreground to convert to, so this token is new.

- #fafafa - sits ON destructive.
  Was near-black; the drawing puts LIGHT text on the red fill (Button
  Primary/Danger, 25:229 resolves destructive-foreground to #fafafa), and
  #fafafa on #ec5165 is what every danger button in the library shows.

- WARNING and INFO are new, added for the Button `intent` axis (ruling 25).
  Both are STATUS semantics, which is the one place ruling 19 permits hue —
  they must never become chrome. `--info` deliberately reuses the blue that
  `--secondary`/`--accent` carried before they were de-hued: that hue was
  always saying "informational", it was just being used as button chrome.

- #f6ae31  10.86:1 vs ground - matches the
  Figma Color collection exactly (verified 2026-09-03). The old #f5a831 in
  this comment was hsl(36, 91%, 58%) and never the declared value.

- --- BRAND ---------------------------------------------------------------
  The Dorado gold that `--primary` used to hold. Nothing references
  `--color-brand` yet; it exists so the 28 raw gold hex literals in .tsx and
  the gradients have a token to converge on.

- --- ELEVATION: THERE IS NONE. ------------------------------------------
  `--shadow-raised`, `--shadow-recessed` and `--shadow-overlay` are DELETED,
  and this note is here so nobody re-adds them thinking the omission was an
  oversight.
  
    Jacob, ruling 27: "We no longer want those crazy ass shadows.
  (recessed/raised) so those need to go away everywhere." An earlier pass
  had collapsed each `X dark:X` pair onto these three tokens, which
  PRESERVED the shadows in tidier form - the opposite of the instruction,
  and the reason the ruling had to be written twice.
  
    THE REPLACEMENT IS NOT A SOFTER SHADOW. Ruling 19: panels read as
  separated by BORDER, not by fill and not by elevation, so a shadow that
  was doing separation work became `border border-border` and a shadow that
  was decoration became nothing at all.
  
    `--shadow-overlay` was the one judgement call the ruling left open, for
  "something genuinely floating". Its only user was the drawer, and a drop
  shadow works by darkening the ground beneath it - this ground is #09090c.
  Black on black is not an elevation cue; it is an unrendered declaration.
  See the note in drawer.css.

- Containers and thumbnails sit at 8px — small and restrained (ruling 19).
  Pills (`rounded-full`) are for buttons and chips ONLY, and are carried by
  the Button/StatusChip variants rather than spelled at call sites.
  Was 0.35rem (5.6px).

- The shine animation is retired. The keyframes are kept so `animate-shine`
  (2 call sites) and `--animate-shine` stay valid, but they now do nothing.
  See RETIREMENT.md.

- ============================================================================
  MOTION - the accordion's open/close, driven by Radix's measured height.
  Registered here as Tailwind v4 theme values so `animate-accordion-down`
  exists as a utility wherever @dorado/components is used. motion-reduce is
  the component's job (it adds motion-reduce:animate-none).
  ============================================================================


## Notes recovered from `typography.css`

- ============================================================================
  TYPOGRAPHY — every semantic tag, styled.
  ----------------------------------------------------------------------------
  Jacob, verbatim: "All semantic html tags should have styling. Anywhere that
  currently calls typography should have semantic tags. Plain and simple.
  We're going for uniformity."
  
    Split out of base.css so the type system is one file you can read top to
  bottom. base.css keeps element RESETS (box model, scrollbars, autofill,
  form quirks); this file owns everything that decides how text LOOKS.
  
    THE THREE-STEP HIERARCHY the dark palette is built around:
  headings   --foreground  brightest
  emphasis   --foreground  via <strong>
  body       --muted-foreground   mid-grey, 6.96:1
  
    Body copy is MUTED, not near-white. In the reference, near-white is reserved
  for headings, active navigation and deliberate emphasis; paragraphs, nav
  links, footer links and card descriptions are all mid-grey. That single
  choice does more to produce the intended look than any other rule here.
  
    TRACKING: negative at display sizes, neutral at body sizes. Tight tracking
  on large text and normal tracking on small text is the whole trick — see the
  --text-* scale in theme.css, which carries size + line-height + tracking +
  weight together so a tag and its utility twin can never disagree.
  
    WEIGHT: 600 across the headings. Medium/semibold, never bold or black.
  
    CASCADE — why these rules beat preflight but still lose to utilities.
  Verified by compiling with tailwindcss 4.2.4 and reading the emitted output:
  1. `@import 'tailwindcss'` emits `@layer theme, base, components, utilities`
  as its first rule, fixing the layer ORDER up front.
  2. Preflight lands in `base` near the top.
  3. This file's `@layer base` block lands in `base` at the BOTTOM (globals
  imports it after tailwind) -> same layer, later source order, equal
  specificity, so it beats preflight.
  4. Utilities land in the LATER `utilities` layer, and layer order outranks
  both specificity and source order -> a utility always wins.
  That is why `<h2 className="text-sm">` still gets 14px, and why the 1083
  `text-<size>` utilities still in the tree can be swept off gradually rather
  than all at once.
  ============================================================================

- --- HEADINGS -----------------------------------------------------------
  On --font-sans, which IS Geist since the refresh - the Figma library draws
  every style in Geist, and theme.css maps --font-heading to the same face.
  Poppins and Montserrat are the old brand and load nowhere; this comment
  still named them long after layout.tsx stopped loading them (corrected
  2026-09-03). Headings and body separate by WEIGHT, not by family.
  
    Weights are 600 across the board. Tighter tracking as size goes up is what
  keeps large text from looking loose — the negative letter-spacing is doing
  as much work here as the size ramp.

- --- BODY ---------------------------------------------------------------
  MUTED, not near-white (ruling 19). In the reference, near-white is reserved
  for headings, active nav and deliberate emphasis; paragraphs, nav links,
  footer links and card descriptions are all mid-grey. This is the single
  change that does most to produce the reference look.
  
    Was the retired `neutral-800` (#dadde2, 14.60:1). Now `--muted-foreground`
  (#9499a4, 6.96:1) — comfortably above AA for body text, and a full step
  below the headings, which is the point.
  
    Emphasis inside a paragraph climbs back up via `<strong>` (below), which
  is `--foreground`. That is the three-step hierarchy: heading brightest,
  emphasis next, body muted.

- --- LINKS ---------------------------------------------------------------
  THE BARE `a` STAYS NEUTRAL, AND PROSE LINKS ARE REACHED BY CONTEXT.
  
    `<Link>` renders an `<a>`, and this app uses Link for navbar items,
  sidebar rows, whole card surfaces and buttons. A global
  underline-on-hover rule would fire on every one of them, which is why the
  bare element inherits and decorates nothing.
  
    But the fix for that is NOT "prose links opt in with `underline`" — that
  puts an appearance class at the call site, which is exactly what the
  call-site rule forbids (see shared/ui/base/button.tsx). Instead the
  CONTEXT decides, the same move `nav ul` makes for lists: a link inside a
  paragraph, list item, blockquote, table cell, definition, label or
  `<small>` IS prose; one inside a nav or a menu is not.
  
    ⚠ "UNTOUCHED BY CONSTRUCTION" WAS FALSE, AND IT SHIPPED. The paragraph
  above used to claim navbar and sidebar links were unreachable because they
  are not inside a `<p>`. They are inside a `<li>`, and `nav ul li a`
  matches `li a` — so this rule underlined EVERY primary nav link, every
  sidebar row, every breadcrumb and every pagination link. Three sweep
  agents hit it independently.
  
    THE GUARD IS ONE MECHANISM, NOT A SECOND COMPETING RULE. The list reset
  lower down already enumerates every structural context by semantic
  selector; `:not(:where(<those>) *)` reuses exactly that vocabulary to mean
  "not inside one of them". `:where()` contributes ZERO specificity, so
  these rules still score (0,0,2) — identical to the `li a` they replace —
  and a utility still wins. Do NOT also add `text-decoration: none` to the
  nav reset: two mechanisms for one decision is how this drifts back.
  
    `label a` and `small a` are in the list because two real links live there
  and had no affordance at all: the terms-and-conditions link inside the
  sign-up checkbox's `<label>`, and the store phone number inside a
  `<small>`. Both call sites were hand-rolling `text-primary underline`.
  
    COLOUR: monochrome (ruling 19). The reference reserves hue for status and
  `--brand` gold for genuine brand moments — neither of those describes
  "this is a link". A prose link is therefore `--foreground`, one step
  BRIGHTER than the muted body text around it, plus an underline. The
  underline is not decoration: colour alone must never be the only cue that
  something is a link, and here the colour difference is deliberately
  subtle.

- `<small>` IS THE FOOTER-LINK IDIOM, AND THAT IS INTENDED — the question
  P3 raised, answered here so the next sweep does not re-litigate it.
  
    A footer link is secondary navigation: 13px, muted, one step below body.
  That is exactly what `<small>` means ("side comments, small print") and
  exactly what this rule renders, so `<Link><small>Privacy Policy</small></Link>`
  is the sanctioned spelling and needs no class. The alternative — a
  `.footer-link` utility — would be a second name for a thing the type scale
  already has, and ruling 23's target is ZERO type utilities, not one more.
  
    It looks heavy because there are 24 of them in Footer.tsx. That is the
  wrapper being repeated, not a decision being repeated: if Footer's links
  ever become a component, the `<small>` moves inside it and the call sites
  lose it. The tag stays either way.

- --- LISTS ---------------------------------------------------------------
  Prose lists by default; structural lists reset by SEMANTIC SELECTOR.
  
    Every list in this codebase is one of two things:
  PROSE      13 of 23 — privacy-policy, terms-and-conditions, sales-tax.
  Wants markers, an indent and body colour.
  STRUCTURE  10 of 23 — the Shell navbar, the Sidebar, breadcrumb,
  pagination, the images grid, a password checklist, a payout
  summary and three order timelines. Correctly `<ul><li>` for
  a11y; emphatically not prose.
  
    The reset below reaches the structural ones two ways, and NEITHER is a
  `list-none` utility at the call site — sprinkling those is the per-call-site
  override pattern that ruling (h) exists to end.
  
    (a) BY ROLE. `nav ul` covers all four navigation lists (verified: Shell,
  Sidebar, breadcrumb and pagination each sit inside a real `<nav>`).
  The explicit ARIA roles cover menus, listboxes, tablists and the
  cmdk command palette.
  (b) BY LAYOUT INTENT. A list that is a flex/grid/space-y container is
  arranging boxes, not setting prose. `:not([class*='list-'])` keeps
  this off any list that has spelled its own `list-disc`/`list-decimal`
  — which matters, because five of the terms-and-conditions prose
  lists ARE `flex flex-col` and must keep their markers.
  
    Selector (b) is a substring match on the class attribute, which is a proxy
  rather than a semantic fact, and it is deliberate: it is grep-able, it
  requires no call-site edits, and it fails SAFE (a missed list gets bullets,
  which is visible, not silent). THE THREE LISTS IT DOES NOT REACH are the
  `<ol className="relative">` order timelines in features/orders and
  features/shipping — wave-3 files this pass may not touch. They are named in
  MANUAL-VERIFICATION.md and need `list-none` or a role.

- `--secondary` was a saturated blue when this rule was written and is now a
  dark neutral surface (see theme.css), which would have made selected text
  nearly invisible. Selection is a light wash with dark text — monochrome,
  and the same shape as the primary button.

- ============================================================================
  TYPOGRAPHIC UTILITIES — the two reference moves that need a class.
  ----------------------------------------------------------------------------
  Both are in `@layer utilities` so an ordinary utility can still override
  them, and both exist so call sites STOP HAND-ROLLING these patterns. They
  are the sanctioned spelling; there is no other.
  ============================================================================

- THE TWO-TONE HEADING. A heading whose opening sentence is `--foreground`
  and whose continuation drops to `--muted-foreground` AT THE SAME SIZE AND
  WEIGHT — the reference's signature move. The heading tag supplies size,
  weight and tracking; this class changes colour and nothing else, so it
  cannot drift from the heading it sits in.
  
    <h1>A new species of product tool.
  <span class="heading-continuation">Built for the way you work.</span>
  </h1>

- THE MONOSPACE EYEBROW. Uppercase, letter-spaced, small, muted, monospace —
  "POWERING THE COMPANIES BUILDING THE FUTURE", "FIG 0.1". Cheap and
  distinctive. Use on the element itself, not on a wrapper.

- THE DISPLAY NUMERAL. A big figure — a rate, a percentage, a total — which
  is NOT a heading and had no size in the scale, so `/rates` was putting
  `text-h1` on a `<strong>` to reach 36px.
  
    Put it on the element that IS the number (`<strong>`, `<dd>`, the
  NumberFlow wrapper), never on a container: `tabular-nums` is the reason
  this is a utility rather than a bare `text-stat`, and it only does its job
  on the element rendering the glyphs. Twelve `NumberFlow` figures animate
  between values, and proportional digits make them jitter mid-transition
  (MANUAL-VERIFICATION.md R9).
  
    Colour comes from `<strong>`'s own rule (--foreground) when the number
  sits in a `<strong>`, which is the intended spelling; the class sets no
  colour of its own so a status tint can still be applied beside it.

- PRIMARY NAVIGATION TYPOGRAPHY. Uppercase, wide tracking, small.
  
    It had no home: Shell put `uppercase tracking-widest` on the `<ul>` and
  let it inherit, the mobile Sidebar did not have it at all, and the two
  disagreed silently because nothing named the idiom. Both now go through
  `shared/ui/NavLink.tsx`, which spells this class and owns the active/rest
  colours — so the transform lives in ONE place and the two navigations
  cannot drift apart again.
  
    Colour is deliberately NOT set here. Nav colour is a STATE (active is
  --foreground, rest is --muted-foreground, ruling 19), and a state belongs
  to the component, not to a typography utility.

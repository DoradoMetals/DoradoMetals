// The mapping tables. Figma and the CSS do NOT share a naming scheme, and
// pretending they do is how a sync check turns into noise: `surface/background`
// is `--background`, `text/muted` is `--muted-foreground`, and no amount of
// string munging derives one from the other. So the correspondence is declared
// here, once, and the checks are pure comparisons over it.
//
// Adding a token to Figma without adding it here makes `figma:tokens` report it
// as unmapped, which is the point - a new variable nobody wired into the CSS is
// exactly the drift this exists to catch.

// ---------------------------------------------------------------------------
// Colour: Figma variable name -> the CSS custom property that carries it.
// ---------------------------------------------------------------------------
export const COLOR = {
  'surface/background': '--background',
  'surface/card': '--card',
  'surface/popover': '--popover',
  'surface/highest': '--highest',
  'surface/muted': '--muted',

  'border/default': '--border',
  'border/strong': '--border-strong',
  'border/input': '--input',

  'text/default': '--foreground',
  'text/muted': '--muted-foreground',
  'text/subtle': '--subtle',
  'text/placeholder': '--placeholder',
  'text/disabled': '--foreground-disabled',

  'primary/default': '--primary',
  'primary/foreground': '--primary-foreground',
  'secondary/default': '--secondary',
  'secondary/foreground': '--secondary-foreground',
  'accent/default': '--accent',
  'accent/foreground': '--accent-foreground',
  'focus/ring': '--ring',

  'status/success': '--success',
  'status/success-foreground': '--success-foreground',
  'status/success-muted': '--success-muted',
  'status/destructive': '--destructive',
  'status/destructive-foreground': '--destructive-foreground',
  'status/destructive-muted': '--destructive-muted',
  'status/warning': '--warning',
  'status/warning-foreground': '--warning-foreground',
  'status/warning-muted': '--warning-muted',
  'status/info': '--info',
  'status/info-foreground': '--info-foreground',
  'status/info-muted': '--info-muted',

  // The soft tints, added to the library 2026-09-04. Each is the SAME rgb as
  // its solid sibling at opacity/soft (16%) - so the check compares alpha too,
  // or all five read as duplicates of colours it already knows.
  'status/success-soft': '--success-soft',
  'status/destructive-soft': '--destructive-soft',
  'status/warning-soft': '--warning-soft',
  'status/info-soft': '--info-soft',
  'surface/soft': '--surface-soft',

  'brand/default': '--brand',
  'shadow/floating': '--floating-shadow',
}

// Figma variables that are aliases of another variable. They carry no value of
// their own, so there is nothing to compare - but they must still be listed, or
// the unmapped sweep reports them. The value is the variable they alias.
export const COLOR_ALIASES = {
  'surface/default': 'surface/card',
  'surface/raised': 'surface/popover',
  'surface/overlay': 'surface/highest',
  'text/inverse': 'primary/foreground',
  'text/danger': 'status/destructive',
  'text/success': 'status/success',
  'text/warning': 'status/warning',
  'text/info': 'status/info',
  'chart/series-1': 'primary/default',
  'chart/series-2': 'brand/default',
}

// CSS colour properties with no Figma variable, and why that is allowed.
export const COLOR_CSS_ONLY = {
  '--card-foreground':
    'shadcn holdover; always equals --foreground. Figma has one text/default and does not model per-surface text.',
  '--popover-foreground': 'same as --card-foreground.',
}

// ---------------------------------------------------------------------------
// Scale: Figma variable -> CSS property. Radii are calc() off --radius and are
// resolved by lib.evalRadius before comparing.
// ---------------------------------------------------------------------------
// The half-steps carry a `+` in the Figma name, which is not a legal CSS
// identifier character, so the CSS spells it `-plus`. Added to the library
// 2026-10-10: each is the MIDPOINT of two existing steps and is named for the
// step below, so the scale stays a scale and nothing was renamed.
export const SCALE = {
  'spacing/3xs': '--spacing-3xs',
  'spacing/2xs': '--spacing-2xs',
  'spacing/2xs+': '--spacing-2xs-plus',
  'spacing/xs': '--spacing-xs',
  'spacing/xs+': '--spacing-xs-plus',
  'spacing/sm': '--spacing-sm',
  'spacing/sm+': '--spacing-sm-plus',
  'spacing/md': '--spacing-md',
  'spacing/md+': '--spacing-md-plus',
  'spacing/lg': '--spacing-lg',
  'spacing/xl': '--spacing-xl',
  'spacing/2xl': '--spacing-2xl',
  'spacing/3xl': '--spacing-3xl',
  'spacing/4xl': '--spacing-4xl',
  'radius/base': '--radius',
  'radius/sm': '--radius-sm',
  'radius/md': '--radius-md',
  'radius/xl': '--radius-xl',
  'radius/full': '--radius-full',
  // The control height ladder, added 2026-10-10 for Button and Icon Button and
  // widened to six steps the same day as the library's hug-and-fill pass moved
  // ten more controls onto it. Not a Tailwind namespace, so these are plain
  // custom properties a component reads with min-h-(--control-md) rather than a
  // generated utility - and min-h, never h: a fixed height is what collapses a
  // hugging control, which is the whole reason the ladder exists.
  'control/xs': '--control-xs',
  'control/sm': '--control-sm',
  'control/sm+': '--control-sm-plus',
  'control/md': '--control-md',
  'control/lg': '--control-lg',
  'control/xl': '--control-xl',
  // Print geometry, its own family. The letter-page margin a document is laid
  // out on; nothing on screen reads it.
  'page/margin-letter': '--page-margin-letter',
  'page/max-width': '--page-max-width',
  'chart/axis-y': '--chart-axis-y',
  'stroke/hairline': '--stroke-hairline',
  'stroke/emphasis': '--stroke-emphasis',
  'stroke/heavy': '--stroke-heavy',
  'opacity/disabled': '--opacity-disabled',
  'opacity/muted': '--opacity-muted',
  'opacity/hover': '--opacity-hover',
  'opacity/scrim': '--opacity-scrim',
  'opacity/soft': '--opacity-soft',
  // All six since 2026-09-11. Figma carried only breakpoint/xs before, so the
  // other five were checked from the code side alone by
  // frontend/shared/tests/theme-breakpoints.test.ts; they are Figma's now and
  // figma:tokens owns them.
  'breakpoint/xs': '--breakpoint-xs',
  'breakpoint/sm': '--breakpoint-sm',
  'breakpoint/md': '--breakpoint-md',
  'breakpoint/lg': '--breakpoint-lg',
  'breakpoint/xl': '--breakpoint-xl',
  'breakpoint/2xl': '--breakpoint-2xl',
  'blur/scrim': '--blur-scrim',
  'drawer/sm': '--drawer-sm',
  'drawer/md': '--drawer-md',
  'drawer/lg': '--drawer-lg',
  'shadow/floating-blur': '--floating-blur',
  'shadow/floating-y': '--floating-y',
}

export const SCALE_ALIASES = {
  'radius/lg': 'radius/base',
}

// Figma variables stored on a 0-100 PERCENT scale where the CSS carries a
// 0-1 ratio. Divide the Figma value by 100 before comparing.
//
// ALL FIVE ARE PERCENT SINCE 2026-10-10, and that closed a real rendering bug.
// Figma's opacity binding reads the variable as a percentage, so a variable
// holding 0.85 rendered at 0.0085 - 0.85% - which is why every Button and Icon
// Button Hover variant measured op=0.0085 on the canvas. disabled and muted had
// already been fixed ("someone entered 0.5 meaning 50%", recorded in Button's
// own description); hover, scrim and soft were corrected to 85, 70 and 16 in
// the same pass that added the control ladder. The CSS keeps the ratios.
export const SCALE_PERCENT = {
  'opacity/disabled': 'Figma 50 = 0.5. Correct for a Figma opacity binding.',
  'opacity/muted': 'Figma 40 = 0.4. Correct for a Figma opacity binding.',
  'opacity/hover': 'Figma 85 = 0.85. Corrected from 0.85 on 2026-10-10.',
  'opacity/scrim': 'Figma 70 = 0.7. Corrected from 0.7 on 2026-10-10.',
  'opacity/soft': 'Figma 16 = 0.16. Corrected from 0.16 on 2026-10-10.',
}

// ---------------------------------------------------------------------------
// Typography. Figma keeps size/line-height/letter-spacing as three separate
// variables per step, all in PX. Tailwind's @theme keeps them as one --text-*
// family where line-height is a UNITLESS RATIO and letter-spacing is in em, so
// both are relative to the step's own font size. The check multiplies through.
// ---------------------------------------------------------------------------
export const TYPE_STEPS = [
  'display',
  'stat-lg',
  'stat',
  'stat-sm',
  'stat-xs',
  'stat-2xs',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'body',
  'field',
  'small',
  'micro',
]

// Figma text style -> the ramp step it draws, and whether it is the step's
// CANONICAL weight (the one --text-<step>--font-weight declares). A step can
// have several styles - Body/Regular and Body/Medium are the same size at two
// weights - and only the canonical one is weight-checked.
export const TEXT_STYLES = {
  Display: { step: 'display', canonical: true },
  'Stat/Default': { step: 'stat', canonical: true },
  'Stat/Large': { step: 'stat-lg', canonical: true },
  'Stat/Small': { step: 'stat-sm', canonical: true },
  'Stat/XSmall': { step: 'stat-xs', canonical: true },
  'Stat/2XSmall': { step: 'stat-2xs', canonical: true },
  'Heading/H1': { step: 'h1', canonical: true },
  'Heading/H2': { step: 'h2', canonical: true },
  'Heading/H3': { step: 'h3', canonical: true },
  'Heading/H4': { step: 'h4', canonical: true },
  'Heading/H5': { step: 'h5', canonical: true },
  'Heading/H6': { step: 'h6', canonical: true },
  'Body/Regular': { step: 'body', canonical: true },
  'Body/Medium': { step: 'body', canonical: false },
  'Field/Regular': { step: 'field', canonical: true },
  'Small/Regular': { step: 'small', canonical: true },
  'Small/Medium': { step: 'small', canonical: false },
  'Micro/Regular': { step: 'micro', canonical: true },
  'Micro/Medium': { step: 'micro', canonical: false },
  // Eyebrow is its own thing: Geist Mono, and typography.css hard-codes its
  // 0.1em tracking and 500 weight in the .eyebrow rule rather than the ramp.
  Eyebrow: { step: 'micro', canonical: false, family: 'Geist Mono' },
}

export const FONT_WEIGHT = { Regular: 400, Medium: 500, SemiBold: 600, Bold: 700 }

// The Typography collection's SECOND MODE, added 2026-09-11 (ruling 103 -
// Jacob delegated the decision, and ruling 96 put the values into Figma
// first). The code half is the `@media (width < 48rem)` block in theme.css.
//
// check-tokens compares the two mode by mode: Figma keeps size, line-height
// and letter-spacing as three px variables per step, the CSS keeps a rem size
// with a unitless ratio and an em tracking, and both must land on the same
// pixel at the mobile size as well as the default one.
export const TYPE_MODES = { default: 'Default', mobile: 'Mobile' }

// The breakpoint the mobile ramp switches at. A media query cannot read a
// custom property, so theme.css writes the literal; this is what pins the
// literal to the token.
export const MOBILE_RAMP_BREAKPOINT = '--breakpoint-md'

// Steps whose Mobile value deliberately equals their Default, with the reason.
// A step missing from BOTH this list and the media block is not a finding -
// the ramp simply does not move it - but recording the five that were
// considered and declined keeps the next session from re-deriving them.
export const MOBILE_UNCHANGED = {
  h3: 'already 22px; below H2 there is no fit problem at 390',
  h4: 'already 18px',
  h5: 'already 16px, and it is the field-value size',
  h6: 'already 14px',
  'stat-2xs': 'already 20px; the floor of the Amount ladder, and it fits at 390',
  body: '15px is the reading size at every width',
  field: '16px at every width; below 16 iOS zooms the page on focus',
  small: 'already 13px',
  micro: 'already 12px, the floor of the ramp',
}

// ---------------------------------------------------------------------------
// Pages. A component page in Figma should have a directory in
// packages/components/src. Most map by kebab-casing the page name; the ones
// that do not are declared, and so is everything that is deliberately not a
// component.
// ---------------------------------------------------------------------------
export const PAGE_TO_DIR = {
  Datepicker: 'date-picker',
  Loader: 'spinner',
  OTP: 'otp-input',
  'Masked Field (deprecated)': 'masked-field',
  // The PAGE is still called Paperwork; the component set on it was renamed
  // Documents on 2026-09-05 and the header label says Documents. The code
  // followed the component, not the page.
  Paperwork: 'documents',
  // One code component covers both drawings: Button's size="iconXs|iconSm|icon"
  // is the Icon Button page. Ruling: an icon button is a Button with no label,
  // not a second component.
  'Icon Button': 'button',
  // The page was called Header until 2026-10-09, when Admin Header, Header and
  // Entity Header were consolidated onto one page and it was renamed. The code
  // directory followed the component it builds, Header, not the page.
  Headers: 'header',
}

// Figma pages that are not components and never will be.
//
// Header and Footer USED to be here as "an app surface, composed in
// frontend/features/navigation". Both are library components now
// (src/header, src/footer) and index.ts exports them, so the exception was
// stale in the direction that hides work rather than the one that reports it.
export const NOT_A_COMPONENT = {
  Cover: 'file cover',
  Foundations: 'the token drawings themselves',
  Logo: 'brand asset',
  'Brand Logos': 'third-party marks',
  Icons: 'the lucide set, shipped as @dorado/icons',
  '———  COMPONENTS  ———': 'a divider page',
  Typography: 'the type ramp drawing; the code half is packages/theme/typography.css',
}

// Drawn in Figma, not built in packages/components yet. Each needs a reason so
// the list stays a queue rather than a graveyard.
export const PENDING = {}

// Directories in packages/components/src with no page of their own, and the
// page that actually draws them.
export const DIR_TO_PAGE = {
  'data-table': 'Table',
  'slider-field': 'Slider',
  field: 'Input',
  chart: 'Chart',
  'admin-header': 'Headers',
  'entity-header': 'Headers',
}

// Component directories with no Figma drawing at all, and why.
// Empty today: `toaster` lived here until it was removed from the library
// entirely (commit 7506b405, "Toaster removed"), which this check caught as a
// stale entry the next time it ran.
export const DIR_NOT_DRAWN = {
  form: 'a react-hook-form binding, not a drawing - Field and Input are what it renders',
  hooks: 'useFocusTrap, useDebounce and useBreakpoint; behaviour, nothing to draw',
  text: 'the ramp is Foundations - Text renders the 16 text styles and adds no drawing of its own',
  rating: 'star rating lifted from the app 2026-09; no page has been drawn for it yet',
  email:
    'drawn in the Media file, not this library - the Mailers page (0:1) holds Email Header, Email Footer, Email Code, Email Row and Email Card, and this directory is those five as table-based, inline-styled React',
  document:
    'drawn in the Media file, not this library - the Documents page (31:212) holds Header, Footer, Hero, Table, Summary, Shipping, Payment, Pickup and Appointment, and this directory is those nine as print React',
}

// ---------------------------------------------------------------------------
// Hygiene budgets. `figma:hygiene` is a RATCHET, not pass/fail: the file has
// real drift in it and fixing all of it is a wave of its own. The budget is the
// measured number, so the check fails the moment a category GROWS - and every
// fix that lands must lower the number here, which is what stops the list
// rotting into a graveyard.
//
// Measured 2026-09-06 over 3520 nodes, re-captured after Jacob's 2026-09-04/05
// tokenisation pass. EVERY category fell, four of them to zero:
//
//     color        4 -> 0      spacing    695 -> 24
//     radius     766 -> 0      textStyle  172 -> 93
//     iconFill     0 -> 0      iconWeight  31 -> 8
//
// The 2026-09-03 note said pill and circle radii "will never reach zero" and
// that Button alone was 135 of spacing and 135 of textStyle. Both are now
// wrong, and in the good direction: the radii got bound and Button's gap and
// Label were fixed at the master. What is left is a short, named list, so the
// budget is the measurement again.
//
// Lower these when you fix something. Never raise one to make the gate pass.
export const HYGIENE_BUDGET = {
  // A visible solid fill or stroke with no bound Color variable.
  color: 0,
  // itemSpacing or padding on an auto-layout frame with no bound Scale
  // variable. A COMPONENT_SET's own gap and padding are excluded, the same way
  // its corner radius already was: an auto-layout set container is how Figma
  // arranges the variant grid, not a drawing. 35 are skipped that way, and the
  // capture reports the number as setChromeExcluded so it stays visible.
  spacing: 0,
  // A corner radius with no bound Scale variable.
  radius: 0,
  // A TEXT node with raw font properties instead of a text style. The last
  // category off zero, and it is one pending decision - see the notes.
  textStyle: 0,
  // An icon instance carrying its own background fill.
  iconFill: 0,
  // An icon whose vector stroke is not 2 x (size/24).
  iconWeight: 0,
}

// Things the hygiene sweep cannot fix from inside a component, recorded so the
// number is understood rather than merely tracked.
export const HYGIENE_NOTES = [
  'ALL SIX CATEGORIES ARE AT ZERO as of 2026-10-13, over 4322 component nodes. textStyle went 94 -> 0 when Field/Regular (16 / 23.2 Regular, on size/field, line-height/field and letter-spacing/field) landed and every Input, Select and Textarea value took it, and the Admin Header / Mobile title was bound. Every budget is now zero, so any unbound value a new drawing adds fails the gate.',
  'The CODE half of the field value is --text-field (text-field), generated from Field/Regular. Fields read text-field rather than text-h5 pinned font-normal.',
  'OPACITY, FIXED 2026-10-10: hover, scrim and soft were holding 0.85, 0.7 and 0.16, which a Figma opacity binding reads as fractions of a percent - 0.85% - which is why every Button and Icon Button Hover variant measured op=0.0085. All five opacity variables are on the 0-100 scale now and SCALE_PERCENT divides all five.',
  "Chat's Call button is drawn on primary/default (a Primary Button) while the component description says Secondary. Resolved in favour of the frame, which is the house rule for this file.",
]

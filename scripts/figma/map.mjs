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
export const SCALE = {
  'spacing/3xs': '--spacing-3xs',
  'spacing/2xs': '--spacing-2xs',
  'spacing/xs': '--spacing-xs',
  'spacing/sm': '--spacing-sm',
  'spacing/md': '--spacing-md',
  'spacing/lg': '--spacing-lg',
  'spacing/xl': '--spacing-xl',
  'spacing/2xl': '--spacing-2xl',
  'spacing/3xl': '--spacing-3xl',
  'radius/base': '--radius',
  'radius/sm': '--radius-sm',
  'radius/md': '--radius-md',
  'radius/xl': '--radius-xl',
  'radius/full': '--radius-full',
  'stroke/hairline': '--stroke-hairline',
  'stroke/emphasis': '--stroke-emphasis',
  'stroke/heavy': '--stroke-heavy',
  'opacity/disabled': '--opacity-disabled',
  'opacity/muted': '--opacity-muted',
  'opacity/hover': '--opacity-hover',
  'opacity/scrim': '--opacity-scrim',
  'opacity/soft': '--opacity-soft',
  'breakpoint/xs': '--breakpoint-xs',
}

export const SCALE_ALIASES = { 'radius/lg': 'radius/base' }

// Figma variables stored on a 0-100 PERCENT scale where the CSS carries a
// 0-1 ratio. Divide the Figma value by 100 before comparing.
//
// THE LIBRARY IS INCONSISTENT ABOUT THIS AND IT IS NOT COSMETIC. Figma's
// opacity binding reads the variable as a percentage, so `opacity/disabled`
// = 50 renders at 0.5 (right) while `opacity/hover` = 0.85 renders at
// 0.0085 - 0.85% - which is why every Button and Icon Button Hover variant
// measures op=0.0085 on the canvas. Button's own description records the
// identical bug being fixed on the Disabled variants ("someone entered 0.5
// meaning 50%"); the hover half was never fixed. The CSS keeps the INTENDED
// ratios, because 0.85% is not a hover state anybody drew on purpose.
export const SCALE_PERCENT = {
  'opacity/disabled': 'Figma 50 = 0.5. Correct for a Figma opacity binding.',
  'opacity/muted': 'Figma 40 = 0.4. Correct for a Figma opacity binding.',
}

// ---------------------------------------------------------------------------
// Typography. Figma keeps size/line-height/letter-spacing as three separate
// variables per step, all in PX. Tailwind's @theme keeps them as one --text-*
// family where line-height is a UNITLESS RATIO and letter-spacing is in em, so
// both are relative to the step's own font size. The check multiplies through.
// ---------------------------------------------------------------------------
export const TYPE_STEPS = [
  'display',
  'stat',
  'stat-sm',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'body',
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
  'Stat/Small': { step: 'stat-sm', canonical: true },
  'Heading/H1': { step: 'h1', canonical: true },
  'Heading/H2': { step: 'h2', canonical: true },
  'Heading/H3': { step: 'h3', canonical: true },
  'Heading/H4': { step: 'h4', canonical: true },
  'Heading/H5': { step: 'h5', canonical: true },
  'Heading/H6': { step: 'h6', canonical: true },
  'Body/Regular': { step: 'body', canonical: true },
  'Body/Medium': { step: 'body', canonical: false },
  'Small/Regular': { step: 'small', canonical: true },
  'Small/Medium': { step: 'small', canonical: false },
  'Micro/Regular': { step: 'micro', canonical: true },
  'Micro/Medium': { step: 'micro', canonical: false },
  // Eyebrow is its own thing: Geist Mono, and typography.css hard-codes its
  // 0.1em tracking and 500 weight in the .eyebrow rule rather than the ramp.
  Eyebrow: { step: 'micro', canonical: false, family: 'Geist Mono' },
}

export const FONT_WEIGHT = { Regular: 400, Medium: 500, SemiBold: 600, Bold: 700 }

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
export const PENDING = {
  Breadcrumb: 'drawn 126:16; no code counterpart anywhere in the repo (see README)',
  Popover: 'drawn 106:213; Field wears the same box, but the panel itself is not lifted',
}

// Directories in packages/components/src with no page of their own, and the
// page that actually draws them.
export const DIR_TO_PAGE = {
  'data-table': 'Table',
  'slider-field': 'Slider',
  field: 'Input',
  chart: 'Chart',
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
  // variable. All 24 are new work: Chat's three frames (15), Thumbnail's (5)
  // and four one-off Footer gaps (90/378/64/16) that are layout arithmetic
  // rather than steps of the scale.
  spacing: 24,
  // A corner radius with no bound Scale variable. Zero, and radius/full (9999)
  // is why - the pills that used to make this unreachable now have a token.
  radius: 0,
  // A TEXT node with raw font properties instead of a text style. All 93 are
  // the field components: Input 72, Select 11, Textarea 10. They are the
  // 16px field-value change of 2026-09-04 typed as raw size/h5 rather than
  // put on a ramp style, because no 16px Regular text style exists - the ramp
  // has Heading/H5 at 16 SemiBold and nothing else. Fixing it means adding a
  // style, which is Jacob's.
  textStyle: 93,
  // An icon instance carrying its own background fill.
  iconFill: 0,
  // An icon whose vector stroke is not 2 x (size/24). All 8 are new: Chat's
  // four Call Event glyphs and Thumbnail's four, each a 16px instance left at
  // the master's weight 2 instead of 1.333.
  iconWeight: 8,
}

// Things the hygiene sweep cannot fix from inside a component, recorded so the
// number is understood rather than merely tracked.
export const HYGIENE_NOTES = [
  'The 2026-09-04/05 pass drove color and radius to zero and took spacing from 695 to 24. Nothing here is now structural: every remaining finding is a named component that has not had the pass applied.',
  "textStyle's 93 are Input, Select and Textarea, and they are the 16px field-value decision: the ramp has no 16px Regular style, only Heading/H5 at 16 SemiBold, so the value text was typed raw. Adding one text style clears all 93 - and the CODE has the mirror of this defect, since Tailwind's text-h5 carries --text-h5--font-weight: 600 and the field value is drawn Regular. The code pins font-normal; Figma still wants the style.",
  "OPACITY VARIABLES ARE ON TWO DIFFERENT SCALES AND ONE OF THEM RENDERS WRONG. Figma reads an opacity binding as a percentage: opacity/disabled = 50 gives 0.5 (right), but opacity/hover = 0.85 gives 0.0085 - 0.85% - so every Button and Icon Button Hover variant measures op=0.0085 on the canvas. Button's own description records this exact bug being fixed on the Disabled variants ('someone entered 0.5 meaning 50%'); the hover half was missed. opacity/scrim (0.7) and opacity/soft (0.16) have the same shape. Not a hygiene category, so nothing counts it - recorded here so it is not rediscovered.",
  "Chat's Call button is drawn on primary/default (a Primary Button) while the component description says Secondary. Resolved in favour of the frame, which is the house rule for this file.",
]

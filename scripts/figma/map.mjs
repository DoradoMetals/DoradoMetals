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
  "surface/background": "--background",
  "surface/card": "--card",
  "surface/popover": "--popover",
  "surface/highest": "--highest",
  "surface/muted": "--muted",

  "border/default": "--border",
  "border/strong": "--border-strong",
  "border/input": "--input",

  "text/default": "--foreground",
  "text/muted": "--muted-foreground",
  "text/subtle": "--subtle",
  "text/placeholder": "--placeholder",
  "text/disabled": "--foreground-disabled",

  "primary/default": "--primary",
  "primary/foreground": "--primary-foreground",
  "secondary/default": "--secondary",
  "secondary/foreground": "--secondary-foreground",
  "accent/default": "--accent",
  "accent/foreground": "--accent-foreground",
  "focus/ring": "--ring",

  "status/success": "--success",
  "status/success-foreground": "--success-foreground",
  "status/success-muted": "--success-muted",
  "status/destructive": "--destructive",
  "status/destructive-foreground": "--destructive-foreground",
  "status/destructive-muted": "--destructive-muted",
  "status/warning": "--warning",
  "status/warning-foreground": "--warning-foreground",
  "status/warning-muted": "--warning-muted",
  "status/info": "--info",
  "status/info-foreground": "--info-foreground",
  "status/info-muted": "--info-muted",

  "brand/default": "--brand",
};

// Figma variables that are aliases of another variable. They carry no value of
// their own, so there is nothing to compare - but they must still be listed, or
// the unmapped sweep reports them. The value is the variable they alias.
export const COLOR_ALIASES = {
  "surface/default": "surface/card",
  "surface/raised": "surface/popover",
  "surface/overlay": "surface/highest",
  "text/inverse": "primary/foreground",
  "text/danger": "status/destructive",
  "text/success": "status/success",
  "text/warning": "status/warning",
  "text/info": "status/info",
};

// CSS colour properties with no Figma variable, and why that is allowed.
export const COLOR_CSS_ONLY = {
  "--card-foreground": "shadcn holdover; always equals --foreground. Figma has one text/default and does not model per-surface text.",
  "--popover-foreground": "same as --card-foreground.",
};

// ---------------------------------------------------------------------------
// Scale: Figma variable -> CSS property. Radii are calc() off --radius and are
// resolved by lib.evalRadius before comparing.
// ---------------------------------------------------------------------------
export const SCALE = {
  "spacing/3xs": "--spacing-3xs",
  "spacing/2xs": "--spacing-2xs",
  "spacing/xs": "--spacing-xs",
  "spacing/sm": "--spacing-sm",
  "spacing/md": "--spacing-md",
  "spacing/lg": "--spacing-lg",
  "spacing/xl": "--spacing-xl",
  "spacing/2xl": "--spacing-2xl",
  "spacing/3xl": "--spacing-3xl",
  "radius/base": "--radius",
  "radius/sm": "--radius-sm",
  "radius/md": "--radius-md",
  "radius/xl": "--radius-xl",
  "breakpoint/xs": "--breakpoint-xs",
};

export const SCALE_ALIASES = { "radius/lg": "radius/base" };

// ---------------------------------------------------------------------------
// Typography. Figma keeps size/line-height/letter-spacing as three separate
// variables per step, all in PX. Tailwind's @theme keeps them as one --text-*
// family where line-height is a UNITLESS RATIO and letter-spacing is in em, so
// both are relative to the step's own font size. The check multiplies through.
// ---------------------------------------------------------------------------
export const TYPE_STEPS = [
  "display", "stat", "stat-sm", "h1", "h2", "h3", "h4", "h5", "h6", "body", "small", "micro",
];

// Figma text style -> the ramp step it draws, and whether it is the step's
// CANONICAL weight (the one --text-<step>--font-weight declares). A step can
// have several styles - Body/Regular and Body/Medium are the same size at two
// weights - and only the canonical one is weight-checked.
export const TEXT_STYLES = {
  "Display": { step: "display", canonical: true },
  "Stat/Default": { step: "stat", canonical: true },
  "Stat/Small": { step: "stat-sm", canonical: true },
  "Heading/H1": { step: "h1", canonical: true },
  "Heading/H2": { step: "h2", canonical: true },
  "Heading/H3": { step: "h3", canonical: true },
  "Heading/H4": { step: "h4", canonical: true },
  "Heading/H5": { step: "h5", canonical: true },
  "Heading/H6": { step: "h6", canonical: true },
  "Body/Regular": { step: "body", canonical: true },
  "Body/Medium": { step: "body", canonical: false },
  "Small/Regular": { step: "small", canonical: true },
  "Small/Medium": { step: "small", canonical: false },
  "Micro/Regular": { step: "micro", canonical: true },
  "Micro/Medium": { step: "micro", canonical: false },
  // Eyebrow is its own thing: Geist Mono, and typography.css hard-codes its
  // 0.1em tracking and 500 weight in the .eyebrow rule rather than the ramp.
  "Eyebrow": { step: "micro", canonical: false, family: "Geist Mono" },
};

export const FONT_WEIGHT = { Regular: 400, Medium: 500, SemiBold: 600, Bold: 700 };

// ---------------------------------------------------------------------------
// Pages. A component page in Figma should have a directory in
// packages/components/src. Most map by kebab-casing the page name; the ones
// that do not are declared, and so is everything that is deliberately not a
// component.
// ---------------------------------------------------------------------------
export const PAGE_TO_DIR = {
  "Datepicker": "date-picker",
  "Loader": "spinner",
  "OTP": "otp-input",
  "Masked Field (deprecated)": "masked-field",
  // One code component covers both drawings: Button's size="iconXs|iconSm|icon"
  // is the Icon Button page. Ruling: an icon button is a Button with no label,
  // not a second component.
  "Icon Button": "button",
};

// Figma pages that are not components and never will be.
export const NOT_A_COMPONENT = {
  "Cover": "file cover",
  "Foundations": "the token drawings themselves",
  "Logo": "brand asset",
  "Brand Logos": "third-party marks",
  "Icons": "the lucide set, shipped as @dorado/icons",
  "———  COMPONENTS  ———": "a divider page",
  "Typography": "the type ramp drawing; the code half is packages/theme/typography.css",
  "Header": "an app surface, composed in frontend/features/navigation",
  "Footer": "an app surface, composed in frontend/features/navigation",
};

// Drawn in Figma, not built in packages/components yet. Each needs a reason so
// the list stays a queue rather than a graveyard.
export const PENDING = {
  "Banner": "drawn 2026-08; no code counterpart yet",
  "Breadcrumb": "code lives at frontend/shared/ui/base/breadcrumb, not yet lifted into @dorado/components",
  "Divider": "drawn; trivial enough that no one has lifted it",
  "Drawer": "code lives in frontend/shared/ui, not yet lifted",
  "Pagination": "drawn; no code counterpart yet",
  "Popover": "code lives at frontend/shared/ui/base/popover, not yet lifted",
  "Radio": "drawn; no code counterpart yet",
};

// Directories in packages/components/src with no page of their own, and the
// page that actually draws them.
export const DIR_TO_PAGE = {
  "data-table": "Table",
  "slider-field": "Slider",
  "field": "Input",
  "chart": "Chart",
};

// Component directories with no Figma drawing at all, and why.
// Empty today: `toaster` lived here until it was removed from the library
// entirely (commit 7506b405, "Toaster removed"), which this check caught as a
// stale entry the next time it ran.
export const DIR_NOT_DRAWN = {};

// ---------------------------------------------------------------------------
// Hygiene budgets. `figma:hygiene` is a RATCHET, not pass/fail: the file has
// real drift in it and fixing all of it is a wave of its own. The budget is the
// measured number, so the check fails the moment a category GROWS - and every
// fix that lands must lower the number here, which is what stops the list
// rotting into a graveyard.
//
// Measured 2026-09-03 over 3153 nodes on 44 component pages, with the
// overrides-aware sweep (see capture.js PART_2). The first measurement walked
// through instances and charged every page for the internals of whatever
// components it used - Attachment reported 46 findings of which 40 were
// Button's. These numbers are per-page responsibility, so they are actionable.
//
// Lower these when you fix something. Never raise one to make the gate pass.
export const HYGIENE_BUDGET = {
  // A visible solid fill or stroke with no bound Color variable.
  color: 4,
  // itemSpacing or padding on an auto-layout frame with no bound Scale
  // variable. 135 of these are Button's single unbound gap, counted once per
  // variant - one fix, not 135.
  spacing: 695,
  // A corner radius with no bound Scale variable. A large share is legitimate:
  // pills (999) and circles have no token and never will, so this will never
  // reach zero. It still ratchets - a NEW unbound radius is a regression.
  radius: 766,
  // A TEXT node with raw font properties instead of a text style. Again 135 are
  // Button's one Label. Hero's 1 is its deliberate 44px off-ramp headline.
  textStyle: 172,
  // An icon instance carrying its own background fill. Driven to zero on
  // 2026-09-03 (Button, Icon Button); it must stay there.
  iconFill: 0,
  // An icon whose vector stroke is not 2 x (size/24). The Icons masters are
  // 24px at weight 2 and Figma does NOT scale strokes on resize, so a resized
  // instance is wrong in one direction or the other. Alert's 28px icons and
  // Chip's 14px dismiss are too THIN; Button's 14px arrows are too heavy.
  iconWeight: 31,
};

// Things the hygiene sweep cannot fix from inside a component, recorded so the
// number is understood rather than merely tracked.
export const HYGIENE_NOTES = [
  "INSTANCE_SWAP does not carry a token: swapping an icon into Icon Button replaces the bound stroke with the swapped component's own raw paint, and the swapped icon keeps its 24px-master stroke weight. That is Paperwork's 4 iconWeight findings. The durable fix is binding the strokes in the Icons library itself; until then a consumer must tint and re-weight at the instance.",
  "Pill and circle radii (999, or half the height) have no Scale token and should not get one, so `radius` will never reach zero.",
  "Button alone accounts for 135 of `spacing` and 135 of `textStyle` - one unbound gap and one unstyled Label, counted once per variant. Fixing those two things on the main components would take the file's two largest numbers down by 270 in one pass.",
];

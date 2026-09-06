# Library refresh from Figma, 2026-09-06

Ruling 101 ("might need to refresh the component library from figma as well")
against the "Themes and Components" library, file `8A73quhBLBqotJlX95jN9j`.
Ruling 96 governs the direction: the Figma file is the source and the code
follows it. Worktree `library-lane`; `packages/components`, `packages/theme`,
`packages/icons` and `scripts/figma` only.

`pnpm figma:check` had been red for a week as "Jacob's". It is green, and green
because the disagreements were fixed rather than because the map was widened.

## Capture path

**`mcp__figma__use_figma`, both parts, no fallback needed.** `capture.js`'s
`PART_1` and `PART_2` were run verbatim against the library file and their
results written into `scripts/figma/snapshot.json` with `capturedAt`
`2026-09-06`. `whoami` reports the file is reachable on the "exchange's team"
plan with a Full seat; nothing was refused and `get_metadata` /
`get_design_context` were used only to READ the new pages, never as a
substitute for the sweep.

Two changes to `PART_1` itself, both forced by what came back:

- **It captures alpha now.** The five soft tokens are the same hex as their
  solid siblings and differ only in the 16% alpha. Captured as hex alone they
  read as four duplicate colours, and a 16% that drifted to 20% would never
  have been visible. `snapshot.json` colour entries carry an `opacity` field.
- **It rounds floats to 4 places.** Figma stores floats as float32, so `0.045`
  reads back as `0.04500000178813934`. Without rounding, a re-capture diffs
  against itself on eighteen typography variables nobody touched.

`PART_2` is unchanged.

## What the capture found

**Four new pages**: Chat (619:2), Thumbnail (698:2), Amount (609:2), Carousel
(59:2). None removed. 57 pages -> 61.

**Fourteen new variables**, none removed, none changed in value:

| Collection | Added |
|---|---|
| Color | `status/success-soft`, `status/destructive-soft`, `status/warning-soft`, `status/info-soft`, `surface/soft` - each its solid sibling at 16% alpha |
| Scale | `opacity/disabled` 50, `opacity/muted` 40, `opacity/hover` 0.85, `opacity/scrim` 0.7, `opacity/soft` 0.16, `radius/full` 9999, `stroke/hairline` 1, `stroke/emphasis` 1.5, `stroke/heavy` 2 |

Text styles and the type ramp are untouched: 16 styles, 39 typography
variables, all still clean.

**Hygiene fell in every category.** Jacob's 2026-09-04/05 tokenisation pass is
visible in the numbers, and four categories are now zero:

| | 2026-09-03 | 2026-09-06 |
|---|---|---|
| color | 4 | **0** |
| spacing | 695 | **24** |
| radius | 766 | **0** |
| textStyle | 172 | **93** |
| iconFill | 0 | 0 |
| iconWeight | 31 | **8** |

`HYGIENE_BUDGET` was lowered to the new measurement, which the check requires -
a budget above the measurement fails as a slack ratchet. The old note claiming
radius "will never reach zero" is now wrong in the good direction: `radius/full`
gave the pills a token.

## Token diffs (`packages/theme`)

`figma:tokens` reported all fourteen as unmapped, which is the case the check
exists for. All fourteen are now in `theme.css` and `map.mjs`:

- `--success-soft`, `--destructive-soft`, `--warning-soft`, `--info-soft`,
  `--surface-soft` in `:root` as `hsl(h s% l% / 0.16)`, with `--color-*-soft`
  aliases in `@theme inline` so Badge can say `bg-success-soft`.
- `--radius-full: 9999px` in `:root`, deliberately NOT in `@theme` - Tailwind
  ships a static `rounded-full` and declaring the variable inside `@theme`
  would generate a competing utility.
- `--stroke-hairline` / `--stroke-emphasis` / `--stroke-heavy`.
- `--opacity-disabled` 0.5, `--opacity-muted` 0.4, `--opacity-hover` 0.85,
  `--opacity-scrim` 0.7, `--opacity-soft` 0.16, as CSS ratios.

Two checks were taught something to make that honest, rather than being
loosened:

- `lib.mjs` gained `toColor()`, which parses `hsl(h s% l% / a)`, the comma
  form, `#rrggbb` and `#rrggbbaa` and returns `{ hex, alpha }`.
  `check-tokens.mjs` compares **both halves**, so a soft token whose alpha
  drifts is a finding.
- `map.mjs` gained `SCALE_PERCENT`, naming the two Figma variables stored on a
  0-100 scale where the CSS carries a 0-1 ratio. The check divides by 100 for
  those two only, and prints which ones it did that for.

## THE OPACITY VARIABLES ARE ON TWO SCALES AND ONE OF THEM RENDERS WRONG

Measured, not inferred. Figma reads an opacity binding as a PERCENTAGE:

- `opacity/disabled` = 50 renders at **0.5**. Correct.
- `opacity/hover` = 0.85 renders at **0.0085** - 0.85%.

Every `State=Hover` variant of Button and Icon Button measures `op=0.0085` on
the canvas today; that is 45 Button variants and 6 Icon Button ones. Button's
own description records this exact bug being found and fixed on the DISABLED
variants ("FIXED 2026-09-04: every State=Disabled variant was sitting at 0.5%
layer opacity - someone entered 0.5 meaning 50%"). The hover half was never
fixed, and `opacity/scrim` (0.7) and `opacity/soft` (0.16) have the same shape
wherever they are bound to a node's opacity.

**Nothing counts this**: it is not a hygiene category, and `figma:tokens`
compares values rather than renders. It is a Figma edit, not a code one - the
code has always used `hover:opacity-85`, which is the intent. Recorded in
`map.mjs` `HYGIENE_NOTES`, in `packages/theme/README.md`, and in FOLLOWUPS.

## Components added

Every one built from `get_design_context` / a live property dump on its own
page, not from memory.

| Component | Figma | Props |
|---|---|---|
| `Documents` (was `Paperwork`) | 549:63 | `documents`, `open`, `onToggle`, `defaultOpen`, `className` |
| `DocumentRow` (type) | 548:41 | `id`, `name: DocumentName`, `meta`, `state`, `showSend` (true), `showDelete` (true), `showImport` (false), `showGenerate` (false), `onDownload`, `onSend`, `onDelete`, `onImport`, `onGenerate` |
| `Chat` | 649:101 | `phone`, `view`, `defaultView`, `onViewChange`, `messages`, `calls`, `dayLabel`, `placeholder`, `draft`, `onDraftChange`, `onSend`, `onAttach`, `onCall`, `open`, `onToggle`, `defaultOpen` |
| `Message` | 619:19 | `direction`, `status`, `time`, `children` |
| `CallEvent` | 624:64 | `kind`, `detail`, `time` |
| `Thumbnail` | 698:29 | `src`, `alt`, `size`, `showGlyph`, plus every button attribute |

Notes on each:

- **Documents.** The Figma PAGE is still called `Paperwork`; only the component
  set was renamed, so `map.mjs` declares `Paperwork -> documents` rather than
  the code pretending the page moved. `DOCUMENT_NAMES` is the ten canonical
  names as a typed union, in the Media file's order: Invoice, Packing List,
  Return Packing List, Shipping Instructions, Pickup Manifest, Pickup
  Instructions, Intake Receipt, Appointment Instructions, Settlement, Lot
  Manifest. Available rows carry Send · Download · Delete; Unavailable rows can
  carry Generate (file-plus, for documents WE produce) and Import (upload, for
  a counterparty's settlement or assay). Generating keeps its disabled
  Download and carries no Send - there is nothing to send until it exists.
- **Chat.** One card per phone number, two views behind an Icon Button pair,
  the title IS the view and the phone number is the Accordion's trailing
  amount. Messages: day label, thread, composer (Attach · field on the Input
  box tokens · Send). Calls: `CallEvent` rows with hairlines, and one
  full-width Call button where the composer would be. Empty keeps the composer
  or the Call button, per the drawing - an empty thread is the one you start.
- **Message.** Inbound left on `surface/muted`, outbound right on
  `primary/default`, bubble capped at 296px on `radius/xl`. Status is
  outbound-only; Failed goes `text/danger` and reads "Not delivered, tap to
  retry".
- **CallEvent.** Missed goes destructive in both the glyph and the label and
  hides the duration. No answer is an OUTGOING call whose detail is the static
  words "No answer", not a duration - the drawing is explicit about this and it
  is the easy thing to get wrong.
- **Thumbnail.** `secondary/default` on `radius/sm`, SM 32 / MD 40, image fill
  or a placeholder glyph, and a hover scrim with a centred Download. The whole
  tile is a button.

`@dorado/icons` gained nine lucide re-exports for these: `FilePlus`,
`ImageIcon`, `MessageSquare`, `Paperclip`, `PhoneIncoming`, `PhoneMissed`,
`PhoneOutgoing`, `Send`, `Upload`.

## Components changed

- **`Input` — `State=ReadOnly`.** New `readOnly` prop. Per the drawing it is
  visually IDENTICAL to Default: same box, same border, full-contrast text.
  The difference is behavioural - focusable, selectable, `cursor: default`, no
  edits - which is why the variant exists on the canvas at all. A
  `data-readonly` hook is on the wrapper.
- **The disabled convention: normal chrome at 50%.** Measured off every
  variant. `fieldTrigger`, `Input`, `Textarea`, `Select`, `Checkbox` and
  `Radio` no longer swap to `bg-muted` when disabled; they keep `bg-card` and
  fade. `Switch` gains the drawn ON-disabled treatment (pill to
  `border-strong`, thumb to the ground). `OTPInput` keeps its drawn muted cell
  AND fades - its own variant does both, so the code does too. Button and Icon
  Button already faded.
- **16px field text.** Already `text-h5` everywhere from the 2026-09-04 pass —
  but **Tailwind v4's `text-h5` also applies `--text-h5--font-weight: 600`**
  and Figma draws the field value **Regular**. Every field value in this
  package was rendering semibold. `font-normal` is pinned beside `text-h5` in
  `fieldTrigger`, `fieldOption`, `Input` and `Textarea`, and the tests assert
  both halves.
- **Badge.** Soft stops guessing with a `/15` opacity modifier and names the
  tokens: `bg-success-soft`, `bg-destructive-soft`, `bg-warning-soft`,
  `bg-info-soft`, `bg-surface-soft`. Gap and padding are the Scale steps the
  drawing binds — `gap-2xs`, `px-xs`, `py-3xs`.
- **Button.** The icon gap is `spacing/xs` on **every** variant and size.
  Tertiary's 4/5/6 tightening is deleted: Jacob raised the gap to 8 across all
  135 variants on 2026-09-05 ("at 4 the glyph read as part of the word").
  Horizontal padding moved onto tokens too (`px-sm` / `px-md`).
- **`DatePicker` — `Layout=Slim`.** New `layout` prop:
  `'stacked' | 'sideBySide' | 'slim'`, default `sideBySide` (the old
  behaviour). Slim is the admin shape: the calendar with one Time `Select`
  beneath it instead of the slot grid, and no time groups means no Select.
  Stacked puts the grid under the calendar 3-across, which `TimePicker` now
  supports via an optional `columns?: 2 | 3`.
- **`Hero` — no route is baked in.** `primaryAction` and optional
  `secondaryAction`, each `{ href, label }`. The hardcoded `/sell` and `/buy`
  died with the frontend nuke; `frontend/app/page.tsx` passes
  `/auth/sign-in`. The drawn visual is unchanged.
- **`MaskedField` — deprecated, not deleted.** Nothing in the repo imports it.
  Figma keeps the page on purpose ("deleting a published component detaches
  every instance of it in every file that consumes this library"), so the code
  keeps the directory and carries `@deprecated` JSDoc pointing at `Input`.
  Delete both halves together, on Jacob's word.

## Components verified unchanged

- **`Accordion`** — the 2026-09-05 repair added the missing
  `Open=False, State=Default, Chevron=Leading` variant and removed a Content
  block cloned from Disabled. Both are canvas-only; the code was already right.
- **`Tracker`** — rebuilt in Figma 2026-09-04 and the code was rebuilt with it
  the same day: `orientation`, the `exception` state and the "Pending"
  location are all present. A four-tab test was added to `Tabs`.
- **`Tab Bar`'s fourth tab** is a fourth child, not a prop: `TabsList` takes
  children. Pinned by a test rather than by new API.
- **`Empty State`** — unchanged, as briefed.

## Map and check changes (`scripts/figma`)

- `PENDING` lost five stale entries — Banner, Divider, Drawer, Pagination and
  Radio are all built and exported. Breadcrumb and Popover remain.
- `NOT_A_COMPONENT` lost Header and Footer. They were excused as "an app
  surface, composed in frontend/features/navigation" and are library
  components with their own directories now — the exception was stale in the
  direction that HIDES work.
- `DIR_NOT_DRAWN` gained `form`, `hooks` and `rating`, each with its reason.
- `PAGE_TO_DIR` gained `Paperwork -> documents`.
- `HYGIENE_BUDGET` lowered in five of six categories; `HYGIENE_NOTES` rewritten
  (the Button-accounts-for-135 and radius-never-reaches-zero notes were both
  overtaken by the tokenisation pass).

## Breaking prop changes

Three, all in the library's public surface:

1. **`Paperwork` -> `Documents`.** The component, its types
   (`PaperworkProps` -> `DocumentsProps`, `PaperworkDocument` ->
   `DocumentRow`, `PaperworkDocumentState` -> `DocumentState`) and the
   directory. `name` is now the `DocumentName` union rather than a
   `ReactNode`. **Nothing outside the package imported it**, checked across
   `frontend/` and `api/`.
2. **`Hero` requires `primaryAction`.** `sellerCount` alone no longer
   type-checks. One call site, `frontend/app/page.tsx`, updated.
3. **`DatePicker`'s default layout is named.** No behaviour change —
   `sideBySide` is what the component already did — but `layout` now appears
   in the props and `data-layout` on the root element.

The auth screens' components — Form, Field, Input, OtpInput, Button, Link,
Alert, Divider, Tabs, Badge, Spinner, Header, Footer — keep every public prop.
`Input` only gained `readOnly`; the rest changed classNames, not signatures.

## Anything in Figma that could not be read

Nothing was refused and no node failed to resolve. Three things the file says
that the code did NOT follow, each resolved in favour of the frame per this
package's standing rule:

- **Chat's Call button** is drawn on `primary/default` — a Primary Button —
  while the component description calls it Secondary. Code follows the frame.
- **Chat's description** describes a bare composer field "on Input box
  tokens"; the frame confirms it (`surface/card`, `border/default`,
  `radius/base`, 40 tall), so the code reuses `fieldTrigger()` at `h-10`.
- **The `Paperwork` page name** contradicts the `Documents` component name on
  it. Both recorded; `map.mjs` carries the mapping.

One thing the file cannot express and the code supplies anyway, per the
house rule: focus-visible rings and keyboard handling on `Thumbnail`,
`Chat`'s switcher and every `Documents` row action. A drawing showing no focus
ring is not permission to delete one.

## Gates

| Gate | Result |
|---|---|
| `pnpm figma:check` | green — tokens, inventory, hygiene, all three |
| `pnpm --filter @dorado/components typecheck` | green |
| `pnpm --filter @dorado/components test` | green — 359 tests, 63 files |
| `pnpm check:fast` (repo root) | **PASS**, 27 fast members |
| `pnpm --filter @dorado/frontend typecheck` | **green, 0 errors** |

**The auth screens still compile.** The frontend is not a gate member and it
was typechecked anyway, on the coordinator's brief. One caveat worth recording
because it wasted a cycle here: run it AFTER `contracts:build`. Against a
missing `@dorado/contracts` dist the frontend reports 157 errors — one real
`TS2307` and 156 implicit-`any` cascades — and not one of them mentions this
package. With contracts built it is zero.

Twelve tests changed rather than being deleted, each to the new truth: the
seven `disabled reads as a muted fill` assertions now assert the 50% fade AND
that `bg-muted` is gone, Badge's default padding is the Scale steps, Button's
gap tier is one value, and Hero's CTA test asserts that the caller's hrefs
arrive rather than that `/sell` does. `not.toContain` guards were kept on both
sides so neither convention can drift back in silently.

# The documents wear the design system (ruling 110, 2026-09-11)

Jacob: *"is there no way to use our themes/components in the mailers/pdfs?"* and
*"the top area should be sectioned off from the main body with the same border
the footer uses."*

There was. The mailers and the PDFs each carried a hand-copied palette in
`api/src/domains/documents/theme.ts` — seven hex values and a type ramp typed
out from the Figma variables in August. It was right on the day it was written
and had no way of staying right. That file is gone. Both documents read
`packages/theme/theme.css` now, which is the same file the browser loads.

## The token reader

`packages/theme/tokens.ts` parses `theme.css` off disk at import. It is a reader,
not a copy: there is no generated artefact to drift and no second place a colour
is written down.

- `tokens` — every custom property the file declares, with `var()`, `calc()` and
  `hsl()` resolved. `--radius-sm: calc(var(--radius) - 4px)` comes back `4px`;
  `--background: hsl(228, 13%, 4%)` comes back `#09090c`.
- `color(name)` / `px(name)` / `text(step)` / `space` / `radius` / `stroke` —
  hex and px, because **a mail client resolves no custom property**. `text('micro')`
  is `{size:'12px', lineHeight:'17.4px', letterSpacing:'0.048px', weight:'400'}`,
  which is the Figma Micro/Regular style exactly.
- `themeCss()` — the same file with Tailwind's `@theme` blocks renamed `:root`,
  because Chromium drops an at-rule it does not know and every declaration
  inside it with it. This is what gets inlined into the page a PDF is rendered
  from, so a PDF is styled by the app's own stylesheet rather than by a copy of it.
- `fontStack` / `monoStack` are unquoted on purpose: they land in a style
  ATTRIBUTE, where React escapes an apostrophe to `&#x27;`, and an unquoted
  family sequence is valid CSS.

Three blocks are read: `:root`, `@theme` and `@theme inline`, in document order
so the later wins the way the cascade does. The `@media (width < 48rem)` mobile
mode is a second mode of the ramp, not a token, and is carried through
`themeCss()` untouched but never resolved into `tokens`.

`packages/theme` gained `"./tokens"` in its exports map and `"type": "module"`.
**It is Node-only** — `readFileSync` — and nothing in the frontend imports it.

`packages/components/src/email/tokens.test.ts` pins the claim: every colour and
every ramp step is asserted against a value read off a drawing, and two
assertions fail the build if any resolved token still carries `hsl(`, `calc(` or
`var(`.

### What the reader found

`theme.ts`'s **paper palette was wrong**, and nothing could have noticed.
It declared `#ffffff / #fbfbfc / #dfe1e6 / #111318 / #5c6270`. The Figma
Documents page binds `--primary / --primary-foreground / --subtle / --placeholder`,
which are `#fafafa / #0d0e11 / #babec5 / #787c87`. The screen palette was
byte-identical to the theme's dark tokens; the paper one was invented. It is the
theme's now.

## Part A — the header rule, drawn first

Figma Media file `WkbKhVaAYmxKTsbmAQEwmk`, page `0:1` "Mailers".

The `Email Footer` symbol (`4:873`) opens with a `Divider` instance — a 1px
`Rule` bound to `border/default`, 536 wide inside the symbol's 32px gutters.
The `Email Header` symbol (`4:810`) drew nothing.

**Written through `mcp__figma__use_figma`**: the footer's own Divider instance
was CLONED onto the header as its last child, set to fill, and the header's item
spacing set to 16. Cloning rather than drawing a rectangle is what keeps the two
in step — it is the same component, the same variant and the same variable
binding, so moving `border/default` moves both. The header went from 111 tall to
**128** (32 + 47 logo + 16 + 1 + 32), which is the footer's rhythm mirrored: the
footer has 32 above its rule and 16 below, the header has 16 above and 32 below.
The symbol's description records the decision.

The code follows exactly. `Header` in `packages/components/src/email/components.ts`
is two rows now — the logo cell at `32px 32px 16px 32px`, then a rule cell at
`0 32px 32px 32px` carrying the identical 1px `--border` cell the footer draws.
One `Rule` component serves both, so the header and the footer cannot diverge in
code either.

## Part B — the email component set

`packages/components/src/email/`, exported as `@dorado/components/email`:
`Layout` / `renderMailer`, `Header`, `Footer`, `Card`, `Row`, `Rule`, `Code`,
`Stat`, `Button`, `Text` (eyebrow | heading | lede | note), plus `screen` and
`paper` palettes and the `type()` / `eyebrowType()` style helpers.

Table-based, inline styles resolved from the tokens at render, `color-scheme`
and `supported-color-schemes` declared, every coloured cell carrying a `bgcolor`
ATTRIBUTE beside its inline style, no flex and no grid, images by absolute URL.
The `<style>` block still carries the mobile breakpoint and nothing a mailer
needs to be correct, because Gmail strips it.

The thirteen mailers plus `voicemail_received` render through
`renderToStaticMarkup`. `emails/render/parts.ts` and `emails/render/base.ts` are
gone, and so is `esc()` — **React escapes text by construction**, which is a
smaller surface than a hand-rolled escaper, and the "a row value carrying markup
is escaped rather than rendered" test still passes.

### Three things the React renderer changed in the markup

- **`&middot;` and `&rsquo;` are real characters now** (`·`, `’`). A string
  literal passed as a child is escaped, so an entity would have shipped as
  `&amp;middot;`. The page declares UTF-8 and every client honours it.
- **Attribute casing**: React emits `cellPadding` / `colSpan`, not `cellpadding`
  / `colspan`. HTML attribute names are case-insensitive in every parser,
  Outlook's Word engine included.
- **`loading="lazy"` on every image**, which is not a preference: React 19 emits
  a `<link rel="preload" as="image">` into the head for an eager image, and an
  email does not want four of those.

The non-breaking space is `NBSP`, a named export, rather than a literal U+00A0
sitting invisibly in the source.

## Part C — the PDFs, from the Figma Documents page

Page `31:212`, drawn at **Letter, 816 x 1056**, gutter 72, band padding 12,
header and footer padding 24. Nine symbols: Header `62:258`, Footer `63:261`,
Table `71:257`, Hero `85:249`, Summary `85:269`, Shipping `96:297`, Payment
`112:736`, Pickup `210:1631`, Appointment `210:1684`.

`packages/components/src/document/` (`@dorado/components/document`) is those nine
as print React: `Page` / `renderDocument`, `Header`, `Footer`, `Hero`, `Table`,
`Summary`, `Pair`, `Instructions`, plus `Line`, `Eyebrow`, `Rule`, `Dotted`.

`Pair` is one component because Shipping, Payment, Pickup and Appointment are one
drawing: cap and the soft facts above a rule, two labelled columns beneath. Only
the connector between the columns differs, and that is a prop.

`renderDocument` inlines `themeCss()` — the real file — so the type ramp and the
palette a PDF prints are the app's, not a transcription of them. `puppeteer.ts`
prints at the drawn size with zero margins; the Footer component draws
"Page 1 of 1" itself, so Chromium's own header/footer templates are off.

### Why not `@dorado/components`' own components

Two hard blockers, both worth writing down so the question is not reopened:

1. **The library ships `.tsx`, and Node cannot run JSX.** The API runs `.ts`
   natively through type stripping; `packages/components` has no build step by
   design (*"ships SOURCE, not a build"*). Every file in `email/` and `document/`
   is therefore plain `.ts` using `createElement`, which typechecks in the same
   program and runs unmodified in Node, in vitest and under Chromium.
2. **The library is Tailwind-utility-classed.** `Text`, `Table` and `Badge`
   render `text-h4`, `bg-card`, `px-sm` — utilities the frontend's Tailwind build
   generates. Rendering one in the API would need Tailwind, Radix, lucide and
   `@number-flow/react` (a browser Web Component) pulled into a PDF path, to
   arrive at the same pixels the token reader gives directly.

So the sharing happens one level down, at the tokens, and the two subsets live in
the components package beside the rest of the library rather than in the API.
`scripts/figma/map.mjs` records both in `DIR_NOT_DRAWN` with the reason: they are
drawn in the **Media** file, which is not the library file `figma:check` reads.

### The kinds

| kind | Figma frame | read | card name |
|---|---|---|---|
| `invoice` | `97:308` Document · Invoice, direction-aware | `invoiceInputs` | Invoice |
| `packing_list` | `99:468` Document · Shipment Manifest | `packingListInputs` | Shipment Manifest |
| `return_packing_list` | `99:468`, return variant | `returnPackingListInputs` | Return Shipment Manifest |
| `shipping_instructions` | `120:759` | order + reference | Shipping Instructions |
| `pickup_manifest` | `201:1510` | `packingListInputs` | Pickup Manifest |
| `pickup_instructions` | `208:1516` | order + reference | Pickup Instructions |
| `intake_receipt` | `201:1711` Document · Appointment Manifest | `packingListInputs` | Intake Receipt |
| `appointment_instructions` | `208:1616` | order + reference | Appointment Instructions |
| `rate_sheet` | `129:752` | `rateSheet()` | Rate Sheet |
| `assay_results` | **`225:2270`** Document · Assay Results | `assayResults(order_id)` | Assay Results |

**The kind name already matched the drawing.** The frame is called "Document ·
Appointment Manifest" but its printed eyebrow reads `INTAKE RECEIPT`, which is
the kind's own name and the Documents card's. The layer name is the odd one out;
nothing was renamed.

`sales_order_invoice` is no longer a separate document: the Invoice is
direction-aware, the way the Order received mailer is. Its enum label stays.

### Settlement and Lot Manifest are gone, and their enum labels are not

Jacob: *"Not sure we need either."* Both are out of `BY_CATEGORY`, out of
`refining/rules.ts`, out of `DOCUMENT_NAMES`, and neither has a renderer.

**The `media.pdf_kind` labels stay, and that is not caution for its own sake:
dev holds 2 `media.pdfs` rows using them.** Dropping an enum label means
rewriting every row that carries one. The column keeps its vocabulary; the
business's list is what shrank. The DROPOFF category is now Invoice plus Assay
Results.

### Assay Results, drawn first

Jacob asked for a per-lot assay breakdown and then narrowed it: *"NOT the payable
or any money on the lines. Money stays on the invoice; this document is the assay
breakdown only."*

Composed in Figma before a line of it was written — `Document · Assay Results`,
**`225:2270`** on page `31:212` — by cloning `Document · Invoice`, dropping its
Payment band and re-texting Header, Hero, Table and Summary. Only the existing
symbols and the drawn spacing; nothing invented beyond the columns. **Jacob
reviews it there.**

Each lot carries its gross weight in all three units the business quotes in,
its purity as a percentage AND as the closest standard label for its metal, and
the fine content that weight and purity produce — in troy ounces, grams and
pennyweight. The Summary totals fine content **by metal**, because the question
the page answers is how much metal arrived, not what it was worth.

**The conversion is not re-derived.** `metals.fine_content(weight, unit, purity)`
is the one definition (genesis, line 328); the read calls it with `purity := 1`
to get gross troy ounces and multiplies by the same constants the function uses.

**The purity labels are rows, not code** — migration 175 creates
`metals.purity_labels` (metal_id, label, purity, sort_order) and seeds thirteen:
Gold 24K/22K/18K/14K/10K, Silver .999/.925/.900/.800, Platinum .950/.900,
Palladium .950/.500.

**"Closest" needed a BOUND, and the first version did not have one.** An
unbounded `ORDER BY abs(p.purity - $x) LIMIT 1` is not a lookup, it is a nearest
neighbour, and on scrap it lies: 0.059 silver came back `.800` and 0.011
platinum came back `.900`. A label names a STANDARD and only applies within
reach of the standard it names, so migration **176** adds a `tolerance` column —
half the distance to that metal's next standard, capped at 0.02 — and the
lateral filters `abs(p.purity - lot.purity) <= p.tolerance`. The bound is per
label because the standards are not evenly spaced: everything is 0.02 except
Silver's `.925` and `.900`, which sit 0.025 apart and reach 0.0125 each. 14K
therefore covers 0.5633 to 0.6033, the karat band a refiner would recognise.
**Outside every band there is no label and the percentage stands alone** — the
label fact is omitted from the row rather than printed empty.

Verified on dev: `.583` Gold → `14K`, `.9999` → `24K`, `.75` → `18K`, `.925`
Silver → `.925`, `.999` → `.999`; and `0.059` Silver, `0.011` Platinum, `0.65`
Gold (between 18K and 14K) and `0.72` Palladium all get **no label at all**.

Availability is `rules.isFinalized(view)`, which is the assay gate as well as the
pricing one: `finalizeBlockedBy` refuses until every lot is confirmed and every
lot has a fine weight.

### The Rate Sheet, and its route

A public document off `rates.rates`. The bands and percentages come from the one
read; the Fulfilment, Fees and Note copy is the drawing's and lives in the
renderer, the way a mailer's copy lives in its template.

**IT ADDS AN UNGUARDED ROUTE**, and this paragraph is the noting of it:
`GET /api/rates/sheet.pdf`, declared in `pricing/rates/routes.ts` because that
feature owns the table (ruling 13), handler in `documents/pdfs/controller.ts`.
It exposes nothing `GET /api/rates` does not already serve unguarded to anyone —
the same rows, rendered. If that is the wrong call it is one line to put
`requireUser` in front of.

### Voicemail received

The one mailer wearing the plain base layout because nothing was drawn.
Composed in Figma first — `Mailer · Voicemail received`, **`224:956`** on page
`0:1` — from `Mailer · Document sent`'s own shape: eyebrow, heading, lede, a
three-row Email Card, a Button and a closing note. **Jacob reviews it there.**

The Email Card symbol draws exactly three rows, so the four facts are three rows:
`From`, `Number`, and `Received` carrying the timestamp and the duration on one
line. The number is MASKED, by the auth mailers' rule — an employee notice still
travels by email.

## Migrations

- **174** `two_more_documents.sql` — `ALTER TYPE media.pdf_kind ADD VALUE IF NOT
  EXISTS` for `rate_sheet` and `assay_results`. Additive; no table touched.
- **176** `a_label_only_reaches_so_far.sql` — the `tolerance` column, its
  `CHECK (tolerance > 0 AND tolerance <= 0.05)`, and the two Silver rows that
  are not 0.02. Additive, on a reference table this chain created one migration
  earlier.
- **175** `a_purity_has_a_standard_name.sql` — `metals.purity_labels`, its
  primary key, its `metals.metals` foreign key with `ON UPDATE CASCADE`
  (ruling 79 — the metal is its name), a `purity > 0 AND purity <= 1` check, a
  unique index on (metal_id, label), a seek index on (metal_id, purity), and the
  thirteen seed rows guarded by `NOT EXISTS` so it is idempotent.

- The new reference table is declared in `verify-backfill.mjs`'s `NOT_REBUILT`:
  `exchange` never recorded a purity label, so there is nothing to rebuild from
  — the migration IS the source, and it is idempotent.

All three **applied to dev only**. `lint:migrations` green. `exchange` is neither read
nor written by either.

`packages/contracts/src/media/enums.ts` is a GENERATED file and its two new
`PdfKind` labels were added **by hand**, the way migration 141 added twelve email
labels: dev has moved under other lanes, and a full `dump:schema` + `generate`
here would have pulled their schema changes into this branch's diff.

## What is not drawn, and what is truncated

- **Settlement and Lot Manifest have no drawing** and are no longer offered, so
  the `available: false` placeholder they used to occupy is gone with them.
- **Appointment Instructions' last Arrival stage is truncated in Figma itself.**
  The node holds `You confirm our quote pending final assay b`. The renderer
  completes it as `You confirm our quote pending final assay before you leave.`
  Every other sentence on all three instruction documents is the drawing's,
  verbatim. **Fix the Figma text and the code should follow it, not the reverse.**
- **The face is still Poppins.** The mailers name Geist and let the client fall
  back; a PDF renders here and needs the file, and no Geist woff2 is in this
  repo. Dropping a weight pair into `api/src/shared/assets/fonts` and changing
  the `@font-face` family is the whole job.
- **No mailer has been looked at in a real client.** The design's own note says
  every one must be before it ships. `color-scheme`, the `bgcolor` attributes and
  the table layout are a mitigation, not a proof.

## What the gate says

`pnpm check` ends **CHECK_EXIT=1**, with exactly one failing member —
`api:verify:backfill` — and the failure is **not this lane's**. It reports 5
`lots.items` rows differing on `content_snapshot`, a column this lane never
touches. `content_snapshot` belongs to the 161-fix lane: it corrected
`161_backfill_lots_from_order_items.sql` and landed
`173_a_settled_lot_keeps_what_was_paid.sql` on dev, so dev now holds the
corrected values while this branch still replays the old 161.

Measured, not assumed: dropping that lane's corrected 161 and its 173 into this
worktree makes all 5 DIFFs disappear, and the only finding left was this lane's
own — `metals.purity_labels` undeclared — which is now fixed. The experiment was
reverted; this branch carries neither of their files. **The failure resolves on
merge with that lane and needs nothing here.**

Every other member is green: 21 API lints, typecheck, 1859 tests with the
domain coverage floor met, `figma:tokens` / `figma:inventory` / `figma:hygiene`,
icons / components / client, and the rest of the dev-database group including
`verify:genesis` and `validate:wire`.

### The rendered PDFs

One per kind, under the session scratchpad, all `%PDF-` and Letter-sized:

`invoice.pdf` (52,021 B) · `invoice_sale.pdf` (50,927) ·
`packing_list.pdf` (56,923) · `return_packing_list.pdf` (56,821) ·
`pickup_manifest.pdf` (54,735) · `intake_receipt.pdf` (55,216) ·
`shipping_instructions.pdf` (60,538) · `pickup_instructions.pdf` (59,685) ·
`appointment_instructions.pdf` (60,801) · `rate_sheet.pdf` (71,645) ·
`assay_results.pdf` (43,540).

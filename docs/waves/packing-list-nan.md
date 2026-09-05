# Packing list "NaN" (2026-09-05) - not a numeric bug

`docs/waves/production-chain.md` (~line 380) recorded a real test failure
against a rebuilt production-shaped copy: `media/pdfs/tests/service.test.ts`
found `NaN` in the rendered packing list for purchase orders 259, 272 and 328,
and guessed the cause was null `pre_melt`/`post_melt`/`purity`/`content`/
`quantity` on old scrap lines - "this wants its own lane."

## The cause

It is not a null column. Verified against the rebuilt production copy
(`chain6`, 127.0.0.1:5544), rendering all 72 purchase orders' packing lists:

- Exactly orders 259, 272, 328 contain the substring `NaN` - 3 of 72, one
  occurrence each.
- Every occurrence sits inside the `<img src="data:image/png;base64,...">`
  tag that embeds the order's real FedEx shipping label (a PNG, confirmed by
  the `iVBORw0KGgoAAAANSUhE` signature at the start of the base64). None is in
  rendered text.
- Base64 is a 64-character alphabet; a ~13-14KB label has good odds of
  containing the 3-character sequence "NaN" purely by chance. Order 259's
  scrap line does have a NULL `quantity` (12 orders do), but `quantity` is
  never read by a scrap row - it explains nothing. 272 and 328 have no null
  columns on their scrap lines at all.
- Direct render of `buildPackingScrapRows`/`buildInvoiceScrapRows` with an
  entirely-null scrap line (pre_melt/post_melt/purity/content/premium/quantity
  all null) already produced no `NaN` before this fix - `pct()`/`oz()`/
  `?? "-"` were already guarding those cells.

The real defect was the TEST: `html.includes("NaN")` scans the whole document,
including the opaque base64 image payload, so it cannot tell a coincidental
byte match from a broken number. It is invisible on dev because dev's test
orders carry no real FedEx label bytes.

## What was a real (separate, smaller) hole

Four cells were unguarded and printed the literal word "null" for a null
column, rather than a dash - not `NaN`, but the same class of bug and the same
business rule:

- `buildInvoiceScrapRows`: `pre_melt`/`post_melt` (unguarded; `buildPackingScrapRows`
  already guarded these).
- `buildPackingBullionRows`, `buildInvoiceBullionRows`, and the sales-order
  invoice's bullion row in `service.ts`: `quantity` (unguarded).

## The rule

A line declared without a weight, purity, content or quantity shows what it
has and no computed total. It never shows `NaN`, and it never shows the word
`null` - a dash (`-`) or `&mdash;`, matching the pattern the rest of the
renderer already used.

## The fix

- `api/media/pdfs/render/sections.ts`: added `qty()` (mirrors `pct()`/`oz()`),
  used it in `buildPackingBullionRows` and `buildInvoiceBullionRows`; guarded
  `pre_melt`/`post_melt` in `buildInvoiceScrapRows` with `?? "-"` to match the
  packing list. No SQL change - `db/orders/sql/view.sql` and
  `db/pricing/sql/order_pricing.sql` already `COALESCE` everything a total
  needs and pass nulls through everywhere else; the columns were never the
  problem.
- `api/media/pdfs/service.ts`: `qty()` in the sales-order invoice's bullion row.
- `api/media/pdfs/tests/service.test.ts`: added `hasNaN(html)` - strips
  `<img ...>` tags before matching "NaN" - and used it everywhere the suite
  checks a packing or return-packing list (which carry real label bytes);
  left the sales invoice's raw `.includes("NaN")` alone since it embeds no
  image. Two new tests: a harness-built order with a scrap line in the exact
  259/272/328 null shape, asserting no `NaN`/`null` on all three documents;
  and a direct test of `hasNaN` proving it ignores a coincidental "NaN" inside
  a fabricated base64 `<img>` while still catching one in real text.

## Verification

All 30 tests in `media/pdfs` and `db/media/pdfs` pass. Orders 259, 272 and 328
re-rendered against `chain6`: the raw byte coincidence remains in the label
image (expected, harmless, invisible to a customer), and `hasNaN()` reports
clean on packing list, invoice and return packing list for all three.
`pnpm check:fast`: green except the pre-existing `figma:inventory` (Jacob's).

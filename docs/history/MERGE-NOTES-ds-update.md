# ds/ds-update - merge notes

Branch: `done/ds-update`. Base: `dev` at `ea7f1cba`.
DO NOT fast-forward. `dev` has moved 8 commits since the base, including the
orders lane, the checkout lane and anonymous checkout.

## Merge in this order, and drop rather than fight

The commits are split by AREA on purpose. Each is self-contained, and every
frontend change is a mechanical import-and-prop swap, so a commit whose files
have been rewritten underneath it can be DROPPED and replayed from this table
rather than resolved hunk by hunk.

| order | commit | risk |
|---|---|---|
| 1 | `feat(components)` Field composite, Breadcrumb deleted | none, library only |
| 2 | `feat(components)` Badge sizes, EmptyState slots, Divider/Pagination/Banner/Radio | none, library only |
| 3 | `feat(components)` Drawer and Rating lifted | none, library only |
| 4 | `feat(components)` focus trap hook | none, library only |
| 5 | `refactor(theme)` size and colour become independent axes | none, theme only |
| 6 | `fix(theme)` data-emphasis paints its own element | none, theme only |
| 7 | `refactor(shared)` local UI sits on the library | low |
| 8 | `refactor(frontend)` remaining call sites | low |
| 9 | `refactor(frontend)` prose becomes semantic HTML | low |
| 10 | `fix(frontend)` phantom error token, fake headings | low |
| 11 | **`refactor(orders)`** call sites onto the library | HIGH - orders lane |
| 12 | **`refactor(checkout)`** call sites, ItemAccordion dies | HIGH - checkout lane |

## What the two high-risk commits actually do

Both are the same mechanical swaps. If the lane has rewritten the file, apply
these by hand instead of merging:

- `Separator` -> `Divider` from `@dorado/components`
- `base/drawer` default import -> `Drawer` named import
- `base/pagination` composition -> `Pagination` with `page`/`pageCount`/`onPageChange`
- `base/input` -> `Input`; drop `no-spinner` and any `inputMode="decimal"` on a
  `type="number"` field, the library does both; height and alignment move from
  `className` to `inputClassName`
- `StatusChip` -> `Badge`, `tone` -> `intent`, brand becomes neutral
- `EmptyState`: icon becomes a NODE not a component, `iconSize` is gone,
  the action moves from `children` to `action`
- `RadioGroup` render-prop -> explicit `.map` of `RadioOption`
- `Field` wrapping an `Input` -> delete the wrapper, pass `label` to the Input
- checkout only: `ItemAccordion` (hand-rolled, no `aria-expanded`) -> `Accordion`

## Behaviour changes, all approved

- Status labels are rounded rectangles, not pills. The drawing says pills belong
  to buttons and chips.
- Three checkout empty-state icons shrink from 80px to the drawn 64px.
- The premium control's over/under buttons lose their green and red tint; the
  library's Radio has no intent axis.
- The product drawer's four pickers and the sales-tax state picker go from
  click-to-open to type-to-filter. Text matching nothing can no longer commit.
- Six product prices grow from 22px to 30px; they were `h3` purely for size and
  are now `strong.stat-sm`.

## Known-good state on this branch

components 246 tests / 54 files, frontend 205 tests / 37 files, both typechecks
clean, production build succeeds.

## Deferred, not attempted

Table and DataTable, pending the TanStack rebuild. Every `shared/ui/base/table`
and `shared/ui/table/*` import is untouched on purpose.

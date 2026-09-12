# Frontend sync for the lot model

The lot model (`docs/waves/lot-model.md` §5) and the write fold
(`docs/waves/write-fold.md` §4) changed the wire under the admin order and
refining screens. This pass brings `pnpm --filter @dorado/frontend typecheck`
from 21 errors to 0 and keeps both screens rendering the same information off
the new shapes. No new component, no Figma draft, no `batch`/`adopt` wiring.

## What changed

| file | change |
|---|---|
| `frontend/app/admin/_src_/orders/LotsCard.tsx` | `lot.premium` read from `lot.lot.premium` — `OrderLotView` lost its own `premium`; it lives on the lot now. Both scrap and bullion rows fixed. |
| `frontend/app/admin/_src_/orders/RefiningItemsCard.tsx` | `content`, `pre_melt`/`post_melt`, `purity`, `premium` all read from `lot.lot.*` instead of the (now bare-link) `RefiningLotView` top level. |
| `frontend/app/admin/refining/[id]/_src_/AdminRefiningScreen.tsx` | `SpotsCard` still takes `{ metal_id, bid }` (it's shared with the purchase/sale screen, which still gets that shape from `OrderSpot`). `RefiningSpot` renamed `bid` to `spot`, so the call site maps `{ metal_id: row.metal_id, bid: row.spot }` before handing rows to the card. Same mapping applied in the GAP 7 unit test. |
| `frontend/app/admin/_src_/orders/tests/fixtures.ts` | `aLot`'s nested `lot` drops `split_from_id`/`combined_into_id`, gains `premium`, `sales_tax_rate`, `confirmed_at`, `settled_at`, `settled_spot`, `source`; the old top-level `premium`/`sales_tax_charged`/`confirmed` on `OrderLotView` moved down with it. `aRefiningLot` drops its own weight/premium/settled_at fields (now bare link + `lot: LotView` + `sources: []`). `aRefiningOrder` gets explicit `settlement_type: 'pooled'` and `linked_orders: []` so they're present rather than riding an optional `...over` spread. `aRefiningSpot` rebuilt to `{ metal_id, spot, lots, settled_lots }`. Also fixed two unrelated drift errors blocking 0: `anAdmin` (AdminUser gained `assigned_to_id`/`notes`/`banned`/`ban_reason`/`ban_expires`/`orders_count`/`open_orders_count`/`last_contact`) and `aMessage` (`SmsMessage` gained `read_at`). |
| `frontend/app/admin/_src_/orders/tests/cards.test.tsx` | GAP 7 test (`SpotsCard` fed a refiner order's own spots) updated with the same `spot` → `bid` mapping as the screen. |
| `packages/client/src/orders/queries.ts` | `usePatchOrderLot` return type is `OrderLotView \| Lot` — `orders.service.editLot` now answers a bare `Lot` when the target is a refiner lot. Neither screen reads the mutation's `.data`, so no discriminating code was needed at the call site; the type now just tells the truth. |
| `packages/client/src/refining/queries.ts` | `usePatchRefiningLot` return type changed `RefiningLot` → `Lot` — `refining.service.recordAssay` has always returned the underlying `Lot`, and `RefiningLot` is now a bare link that never carried those fields anyway. |

## What was dropped

Nothing rendered was dropped. Every value the two screens showed before
(quantity, pre/post melt, purity, premium, price, customer premium, spot bid)
still has a source on the new shapes — it just moved from the link row to the
lot, or from a stored column to a derived field the API already computes
(`price`, `line_total`, `settled`). No cell was removed for lack of a home.

## Not done, on purpose

- `useAssignRefiningLots`, `useCreateOrderLot` bodies were left as they are.
  Their endpoints gained new capabilities (`{ order_ids }` batching, `{ lot_id
  }` sale-lot minting) that neither screen calls today; widening the hook
  types would wire in surface the screens don't use, which the brief excludes.
- `RefiningOrderView.pool: PoolBalance[]` and the new pool endpoints
  (`GET /refining/pool`, `POST /refining/pool/locks`) are untouched — no
  existing client hook or screen reads pool balances yet.
- `SpotsCard` itself (`frontend/app/admin/_src_/orders/SpotsCard.tsx`) was left
  alone: it's shared with the purchase/sale order screen, which still feeds it
  real `OrderSpot` rows, so the shape it accepts didn't need to change — only
  the refining screen's call site, which now adapts `RefiningSpot` to it.

## Verification

- `pnpm --filter @dorado/frontend typecheck` — 0 errors (was 21).
- `pnpm --filter @dorado/frontend test` — 191 passed, 12 files, including
  `cards.test.tsx`, `orderScreen.test.tsx`, `refiningScreen.test.tsx`.
- `pnpm --filter @dorado/client typecheck` — 0 errors.
- `pnpm --filter @dorado/client test` — no test files in this package
  (`--passWithNoTests`).

Gate not run (frontend/client are not gate members per ruling 55); this pass
touches only `frontend/` and `packages/client/`.

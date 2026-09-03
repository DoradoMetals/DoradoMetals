-- Ruling 51: a bullion line snapshots its product on create and prices from
-- itself, never the catalogue. 24 of dev's 68 bullion `orders.items` rows (and
-- 1 of checkout's 1) predate that snapshot and hold NULL content/pre_melt/
-- post_melt/purity - written back when checkout only synced bullion_id,
-- metal_id, quantity and premium. Measured 2026-09-03: every one of those 24
-- (and the 1) still resolves a `products.bullion` row by id; metal_id was
-- never null on either table.
--
-- Same FLOWS mapping `domain/checkout/rules.ts` snapshot() uses today:
-- gross -> pre_melt, content -> post_melt AND content, purity -> purity,
-- metal_id -> metal_id. `coalesce` only fills a NULL column - a line that
-- already has a value (every non-bullion line, and any bullion line already
-- snapshotted) is untouched.
--
-- `checkout.items` is disposable device-sync (CLAUDE.md "not all data is
-- equally precious"), not a ledger - its stale bullion row is DELETED rather
-- than repaired, and the basket re-syncs from the live product on next load.

UPDATE orders.items oi
SET
  metal_id = coalesce(oi.metal_id, b.metal_id),
  pre_melt = coalesce(oi.pre_melt, b.gross),
  post_melt = coalesce(oi.post_melt, b.content),
  purity = coalesce(oi.purity, b.purity),
  content = coalesce(oi.content, b.content)
FROM products.bullion b
WHERE oi.bullion_id = b.id
  AND (
    oi.metal_id IS NULL OR oi.pre_melt IS NULL OR oi.post_melt IS NULL
    OR oi.purity IS NULL OR oi.content IS NULL
  );

DELETE FROM checkout.items
WHERE bullion_id IS NOT NULL AND content IS NULL;

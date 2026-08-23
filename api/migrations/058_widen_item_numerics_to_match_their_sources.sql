-- orders.items rounded values on the way in.
--
-- exchange.products declares content, gross, purity, premium and quantity as
-- unconstrained numeric. orders.items declared purity numeric(4,3) and the
-- weights numeric(20,3), so anything arriving from the product side was rounded
-- as it was stored. A .9999 fine gold coin was recorded at purity 1.000 - a
-- purity that does not exist - on three order lines in dev, and eighteen
-- products in production would do the same on their next order.
--
-- Nothing caught it, and the reasons are worth writing down:
--
--   verify:parity does not cover orders at all, because orders.items is a merge
--   of two exchange tables rather than a one-to-one pair.
--
--   audit:coverage found a target column of the right name and passed. It asks
--   whether a column has somewhere to go, not whether what it lands in can hold
--   the value.
--
--   the scrap side agrees exactly - exchange.scrap declares the same
--   numeric(20,3) and numeric(4,3) - so the one pair anyone had reason to
--   compare was the one that was already fine. The product side feeds
--   orders.items through `coalesce(s.purity, pr.purity)` in 031, which is a
--   value flow and not an ownership mapping, so it appeared in no map.
--
-- scripts/audit-precision.mjs now checks this directly, by casting every source
-- value to the type of the column it lands in and counting what changes. It
-- fails on exactly this, and it is declared against production, where dev's
-- three rows would have understated it.
--
-- Widening only: no value can fail to fit a wider type, so this cannot lose
-- data, and exchange is not touched. It is reversible - narrowing again would
-- restore the rounding, which is the point.

ALTER TABLE orders.items
  ALTER COLUMN pre_melt  TYPE numeric,
  ALTER COLUMN post_melt TYPE numeric,
  ALTER COLUMN content   TYPE numeric,
  ALTER COLUMN purity    TYPE numeric,
  ALTER COLUMN premium   TYPE numeric,
  ALTER COLUMN quantity  TYPE numeric;

-- checkout.items has the same columns, the same sources and the same defect,
-- and is still empty. Fixing it now costs nothing; leaving it means finding the
-- identical bug the day the cart is migrated, with rows in the table.
ALTER TABLE checkout.items
  ALTER COLUMN pre_melt  TYPE numeric,
  ALTER COLUMN post_melt TYPE numeric,
  ALTER COLUMN purity    TYPE numeric,
  ALTER COLUMN premium   TYPE numeric,
  ALTER COLUMN quantity  TYPE numeric;

-- Restore what the narrow columns already rounded.
--
-- Safe because exchange is still authoritative: ORDERS_SOURCE has not been
-- promoted, so nothing has ever been written to orders.items that exchange does
-- not also hold. The expressions are 031_backfill_orders.sql's, so this
-- converges on exactly what a fresh build now produces.

UPDATE orders.items i
SET pre_melt  = coalesce(s.pre_melt,  pr.gross),
    post_melt = coalesce(s.post_melt, pr.content),
    purity    = coalesce(s.purity,    pr.purity),
    content   = coalesce(s.content,   pr.content),
    premium   = poi.premium,
    quantity  = poi.quantity
FROM exchange.purchase_order_items poi
LEFT JOIN exchange.scrap s     ON s.id  = poi.scrap_id
LEFT JOIN exchange.products pr ON pr.id = poi.product_id
WHERE poi.id = i.id
  AND (i.pre_melt  IS DISTINCT FROM coalesce(s.pre_melt,  pr.gross)
    OR i.post_melt IS DISTINCT FROM coalesce(s.post_melt, pr.content)
    OR i.purity    IS DISTINCT FROM coalesce(s.purity,    pr.purity)
    OR i.content   IS DISTINCT FROM coalesce(s.content,   pr.content)
    OR i.premium   IS DISTINCT FROM poi.premium
    OR i.quantity  IS DISTINCT FROM poi.quantity);

UPDATE orders.items i
SET pre_melt  = pr.gross,
    post_melt = pr.content,
    purity    = pr.purity,
    content   = pr.content,
    premium   = soi.premium,
    quantity  = soi.quantity
FROM exchange.sales_order_items soi
JOIN exchange.products pr ON pr.id = soi.product_id
WHERE soi.id = i.id
  AND (i.pre_melt  IS DISTINCT FROM pr.gross
    OR i.post_melt IS DISTINCT FROM pr.content
    OR i.purity    IS DISTINCT FROM pr.purity
    OR i.content   IS DISTINCT FROM pr.content
    OR i.premium   IS DISTINCT FROM soi.premium
    OR i.quantity  IS DISTINCT FROM soi.quantity);

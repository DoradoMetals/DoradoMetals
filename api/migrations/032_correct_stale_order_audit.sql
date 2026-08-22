-- The rest of order 239's drift.
--
-- 030 corrected the status. The same row is stale on updated_by and updated_at
-- as well: exchange records Jacob Johnson at 2026-08-13, the new schema still
-- has Dorado Metals Exchange at 2025-12-28. That is the edit which moved the
-- order to Received, and the copy caught none of it.
--
-- The offer row attached to it is stale in the same way and for the same
-- reason, so it is corrected from the same source.
--
-- I initially read this the wrong way round - assumed the new schema had been
-- written to by something and exchange was behind. It is the other way about,
-- which is the expected direction: exchange takes live traffic and the new
-- schema has taken none, so every difference between them is the copy falling
-- behind, never the copy moving ahead. That is exactly what the backfill guards
-- assert, and it holds.
--
-- Set-based, so it closes the drift wherever it is rather than at one id, and
-- a no-op once there is none. Only correct while exchange is authoritative.
--
-- exchange is untouched.

UPDATE orders.orders o
SET updated_by = p.updated_by,
    updated_at = p.updated_at AT TIME ZONE 'UTC',
    created_by = p.created_by,
    created_at = p.created_at AT TIME ZONE 'UTC'
FROM exchange.purchase_orders p
WHERE p.id = o.id
  AND o.direction = 'purchase'
  AND (o.updated_by IS DISTINCT FROM p.updated_by
    OR o.updated_at IS DISTINCT FROM (p.updated_at AT TIME ZONE 'UTC')
    OR o.created_by IS DISTINCT FROM p.created_by
    OR o.created_at IS DISTINCT FROM (p.created_at AT TIME ZONE 'UTC'));

UPDATE orders.orders o
SET updated_by = s.updated_by,
    updated_at = s.updated_at AT TIME ZONE 'UTC',
    created_by = s.created_by,
    created_at = s.created_at AT TIME ZONE 'UTC'
FROM exchange.sales_orders s
WHERE s.id = o.id
  AND o.direction = 'sale'
  AND (o.updated_by IS DISTINCT FROM s.updated_by
    OR o.updated_at IS DISTINCT FROM (s.updated_at AT TIME ZONE 'UTC')
    OR o.created_by IS DISTINCT FROM s.created_by
    OR o.created_at IS DISTINCT FROM (s.created_at AT TIME ZONE 'UTC'));

UPDATE orders.offers f
SET updated_by = p.updated_by,
    updated_at = p.updated_at AT TIME ZONE 'UTC'
FROM exchange.purchase_orders p
WHERE p.id = f.order_id
  AND (f.updated_by IS DISTINCT FROM p.updated_by
    OR f.updated_at IS DISTINCT FROM (p.updated_at AT TIME ZONE 'UTC'));

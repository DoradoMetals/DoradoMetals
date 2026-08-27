-- allow-destructive: offers are removed everywhere.
--
-- Jacob, 2026-08-27: "I thought I told you we were removing offers everywhere?
-- We don't need them and they add unnecessary complexity and don't store any
-- real value. Add a migration to remove it from exchange and new schemas, and
-- then remove all associated api and frontend code. The only column we need to
-- keep is spots_locked, you can decide which table that gets moved to."
--
-- spots_locked GOES TO orders.orders. It is a property of the order - whether
-- its metal prices are pinned - not of a negotiation that no longer exists.
-- exchange.purchase_orders already has its own spots_locked column and keeps
-- it; this migration does not touch it.
--
-- WHAT IS BEING DESTROYED, stated rather than glossed. Production carries these
-- on 62 purchase orders: offer_status 62, num_rejections 62, offer_sent_at 57,
-- offer_expires_at 57, offer_notes 2. They are not recoverable from anywhere
-- else once dropped. Backup: ~/dorado-prod-20260825.dump, taken 25 Aug.
--
-- The order of operations matters: spots_locked is carried across BEFORE
-- orders.offers is dropped, so the value survives the table that held it.

-- 1. The one column worth keeping, on the table that should own it.
ALTER TABLE orders.orders
  ADD COLUMN IF NOT EXISTS spots_locked boolean NOT NULL DEFAULT false;

-- 2. Carry the existing values across. Idempotent: re-running sets the same
--    values from the same source, and once orders.offers is gone the UPDATE
--    below is skipped entirely by the guard.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'orders' AND table_name = 'offers'
  ) THEN
    UPDATE orders.orders o
       SET spots_locked = COALESCE(f.spots_locked, false)
      FROM orders.offers f
     WHERE f.order_id = o.id;
  END IF;
END $$;

-- 3. The new-schema table goes.
DROP TABLE IF EXISTS orders.offers;

-- 4. The exchange columns go, except spots_locked which stays where it is.
ALTER TABLE exchange.purchase_orders
  DROP COLUMN IF EXISTS offer_status,
  DROP COLUMN IF EXISTS offer_notes,
  DROP COLUMN IF EXISTS offer_sent_at,
  DROP COLUMN IF EXISTS offer_expires_at,
  DROP COLUMN IF EXISTS num_rejections;

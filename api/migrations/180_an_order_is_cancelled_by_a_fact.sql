-- `orders.orders.status` is free text and, of its nine values, exactly one
-- drives anything: `'Cancelled'`, read by `actionsFor` and `assertReopenable`
-- (`docs/design/statuses.md` §Q1). Every other value is a projection of payment,
-- fulfillment and lot facts that already exist elsewhere.
--
-- Cancelling is a DECISION no other row records, so it becomes a fact of its
-- own - a timestamp, like `refining.orders.cancelled_at`, which the refiner
-- order's derived `state` already reads. `reopen` clears it.
--
-- 181 drops `status`. This migration is separate so the fact exists and is
-- filled BEFORE the column that carried it goes.
--
-- `updated_at` is the honest backfill value: nothing recorded when a
-- cancellation happened, and the last write to a cancelled order is the write
-- that cancelled it in every path that sets the status (`transactions/sweeps.ts`
-- and the admin PATCH).
--
-- Additive and idempotent. `exchange` is neither read nor written.

ALTER TABLE orders.orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS orders_cancelled_at_idx
  ON orders.orders (cancelled_at)
  WHERE cancelled_at IS NOT NULL;

-- Guarded on the column's existence, not on the database's age: 181 drops
-- `status`, so a build from nothing reaches this file with the column already
-- gone and 030/031 having written `cancelled_at` directly.

DO $$
DECLARE
  stamped bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'orders' AND table_name = 'orders'
                AND column_name = 'status') THEN
    EXECUTE $q$
      UPDATE orders.orders
         SET cancelled_at = COALESCE(updated_at, created_at, now())
       WHERE cancelled_at IS NULL
         AND status = 'Cancelled'
    $q$;
  END IF;

  SELECT count(*) FILTER (WHERE cancelled_at IS NOT NULL) INTO stamped FROM orders.orders;
  RAISE NOTICE 'orders: % order(s) carry cancelled_at', stamped;
END $$;

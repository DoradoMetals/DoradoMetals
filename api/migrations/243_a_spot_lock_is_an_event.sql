-- A LOCK AND AN UNLOCK ARE EVENTS, APPENDED, NEVER OVERWRITTEN.
--
-- docs/waves/pricing-resolver.md item 4, from the Pricing audit
-- (docs/design/api-gaps-pricing.md section 1 rows 18, 21). The Lock log draws
-- `PO-2466 . Gold . unlocked by Dana`, and an unlocked order could never
-- appear: GET /api/spots/locks read `WHERE o.spots_locked = true`, and an
-- unlock CLEARS orders.spots.bid and .ask in place, so the lock it replaced
-- was gone.
--
-- AN EVENT TABLE, NOT THREE MORE COLUMNS ON orders.spots. The wave doc said to
-- check whether a lock can happen more than once per order and choose: it can.
-- PUT /api/orders/:id/spots takes `lock` either way and an admin may lock,
-- unlock and lock again, so locked_by_id / unlocked_at / unlocked_by_id on
-- orders.spots would hold only the last pair of a longer history.
--
-- THE AUDIT COLUMNS ARE THE EVENT. created_at is when it happened and
-- created_by_id who did it; public.audit_stamp writes both and code writes
-- neither. There is no occurred_at and no actor argument.
--
-- bid AND ask ARE WHAT WAS IN FORCE at the event: the values just frozen for a
-- lock, the values about to be released for an unlock. orders/spots/service.ts
-- records in that order for exactly that reason.
--
-- THE BACKFILL gives the eight already-locked orders on dev a first event each,
-- dated from the frozen row's own updated_at and attributed to whoever last
-- touched the order, so the log is not empty for orders that were locked
-- before this table existed. It is guarded by NOT EXISTS, so a re-run adds
-- nothing.
--
-- `exchange` is neither read nor written.

CREATE TABLE IF NOT EXISTS orders.spot_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders.orders(id) ON DELETE CASCADE,
  metal_id text NOT NULL REFERENCES metals.metals(id) ON UPDATE CASCADE,
  action text NOT NULL,
  bid numeric,
  ask numeric,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by text DEFAULT '' NOT NULL,
  updated_by text DEFAULT '' NOT NULL,
  created_by_id uuid REFERENCES auth.users(id),
  updated_by_id uuid REFERENCES auth.users(id),
  CONSTRAINT spot_locks_action CHECK (action IN ('lock', 'unlock'))
);

CREATE INDEX IF NOT EXISTS spot_locks_order_id_idx ON orders.spot_locks (order_id);
CREATE INDEX IF NOT EXISTS spot_locks_created_at_idx ON orders.spot_locks (created_at DESC);

CREATE OR REPLACE TRIGGER audit_stamp BEFORE INSERT OR UPDATE ON orders.spot_locks
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();

INSERT INTO orders.spot_locks (order_id, metal_id, action, bid, ask,
                               created_at, updated_at, created_by, created_by_id)
SELECT os.order_id, os.metal_id, 'lock', os.bid, os.ask,
       COALESCE(os.updated_at, o.updated_at, now()),
       COALESCE(os.updated_at, o.updated_at, now()),
       COALESCE(o.updated_by, ''), o.updated_by_id
  FROM orders.spots os
  JOIN orders.orders o ON o.id = os.order_id
 WHERE o.spots_locked = true
   AND NOT EXISTS (SELECT 1 FROM orders.spot_locks el
                    WHERE el.order_id = os.order_id
                      AND el.metal_id = os.metal_id);

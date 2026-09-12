-- The purchase-order lifecycle loses its offer-era statuses.
--
-- Jacob, 28 August 2026, two rulings in one day. First: "The stages don't
-- really matter for admins... They shouldn't be driving logic AT ALL" - a
-- status is a label an admin sets, never a trigger. 'Accepted' only ever
-- existed as the label the accept pipeline wrote as a side effect; with that
-- pipeline now the explicit finalize_pricing operation, the label has no
-- writer and leaves the lifecycle. Second: "we're removing ANYTHING related
-- to offers" - 'Offer Sent' and 'Rejected' are offer-era states of a flow 086
-- already dismantled, and they leave with it.
--
-- The remappings, applied to BOTH schemas so verify:parity keeps holding:
--
--   'Accepted'   -> 'Payment Processing'  a priced order awaiting payout was
--                                         exactly what Accepted meant
--   'Offer Sent' -> 'Received'            post-offers this only ever meant:
--                                         metal received, pricing in progress
--   'Rejected'   -> 'Cancelled'           a rejected offer ended the order
--
-- Counted before writing: dev holds 1 'Accepted' row in each schema and zero
-- of the other two; production holds ZERO rows in any of the three, so this
-- is a dev-only rewrite today and an idempotent no-op wherever it runs twice.
--
-- The media.email_kind rename rides along: the invoice mail that went out on
-- acceptance is the pricing-finalized mail now. RENAME VALUE rewrites the
-- label in place - existing rows follow it - and media.emails has no
-- production rows (the paper trail starts at go-live), so nothing is
-- reinterpreted retroactively.

-- allow-destructive: rewrites exchange.purchase_orders.purchase_order_status
-- for three retired labels only, WHERE-guarded and idempotent. Verified before
-- writing: 1 dev row ('Accepted'), 0 production rows. Production backup:
-- ~/dorado-prod-20260825.dump; dev is rebuildable from prod + genesis.
UPDATE exchange.purchase_orders
   SET purchase_order_status = 'Payment Processing'
 WHERE purchase_order_status = 'Accepted';

-- allow-destructive: same rewrite, second retired label. 0 rows in dev and
-- production today; the guard makes it a no-op wherever that stays true.
-- Backup: ~/dorado-prod-20260825.dump.
UPDATE exchange.purchase_orders
   SET purchase_order_status = 'Received'
 WHERE purchase_order_status = 'Offer Sent';

-- allow-destructive: same rewrite, third retired label. 0 rows in dev and
-- production today. Backup: ~/dorado-prod-20260825.dump.
UPDATE exchange.purchase_orders
   SET purchase_order_status = 'Cancelled'
 WHERE purchase_order_status = 'Rejected';

-- EDITED 2026-09-12 (ruling 112, facts lane). `orders.orders.status` is gone -
-- 181 dropped it, and the lifecycle it recorded is derived now, never stored -
-- so a build from nothing reaches this file with the column already gone.
-- Guarded rather than rewritten like 030 and 180: unlike 030's `cancelled_at`,
-- none of these three retired labels has a surviving fact column to write
-- instead. 'Payment Processing' and 'Received' are projections of payment,
-- fulfillment and lot facts with no column of their own to backfill, and
-- 'Rejected' -> 'Cancelled' duplicates what 180 already stamped onto
-- `cancelled_at` for any row this would have touched. A no-op wherever
-- `status` is already gone, exactly like 030 and 180.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'orders' AND table_name = 'orders'
                AND column_name = 'status') THEN
    UPDATE orders.orders
       SET status = 'Payment Processing'
     WHERE status = 'Accepted' AND direction = 'purchase';

    UPDATE orders.orders
       SET status = 'Received'
     WHERE status = 'Offer Sent' AND direction = 'purchase';

    UPDATE orders.orders
       SET status = 'Cancelled'
     WHERE status = 'Rejected' AND direction = 'purchase';
  END IF;
END $$;

-- The mail the accept pipeline sent becomes the pricing-finalized mail.
-- Rename rather than add-and-retire: the kind's meaning is unchanged - the
-- invoice mail a customer gets when their order is priced - only the
-- offer-era name dies.
-- 2026-09-06: guarded. On a genesis build the enum is already the post-092
-- one, and RENAME VALUE has no IF EXISTS.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'media' AND t.typname = 'email_kind'
      AND e.enumlabel = 'purchase_order_accepted'
  ) THEN
    ALTER TYPE media.email_kind
      RENAME VALUE 'purchase_order_accepted' TO 'purchase_order_priced';
  END IF;
END $$;

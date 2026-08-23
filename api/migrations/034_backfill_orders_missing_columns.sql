-- Fill the columns 033 added.
--
-- Two parts. The columns that belong to rows already backfilled are updated in
-- place - they were null because there was nowhere to put them, not because
-- the value was absent. And purchase orders gain a transactions row, which they
-- have never had: their fees had no home until 033, so there was nothing to
-- put in one.
--
-- The updates are conditional on the value actually differing, so re-running
-- changes nothing, and they only touch rows whose source still exists in
-- exchange. Same guard as the other backfills: correct only while exchange is
-- authoritative.
--
-- exchange is only ever read.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM orders.orders n
    WHERE NOT EXISTS (SELECT 1 FROM exchange.purchase_orders e WHERE e.id = n.id)
      AND NOT EXISTS (SELECT 1 FROM exchange.sales_orders e WHERE e.id = n.id)
  ) THEN
    RAISE EXCEPTION
      'refusing to backfill: orders.orders holds rows exchange does not, so exchange is no longer authoritative.';
  END IF;
END $$;

-- The offer's send time.

UPDATE orders.offers f
SET offer_sent_at = p.offer_sent_at
FROM exchange.purchase_orders p
WHERE p.id = f.order_id
  AND f.offer_sent_at IS DISTINCT FROM p.offer_sent_at;

-- Order-level workflow flags, sales side.

UPDATE orders.orders o
SET order_sent = s.order_sent,
    tracking_updated = s.tracking_updated
FROM exchange.sales_orders s
WHERE s.id = o.id
  AND o.direction = 'sale'
  AND (o.order_sent IS DISTINCT FROM s.order_sent
    OR o.tracking_updated IS DISTINCT FROM s.tracking_updated);

-- The sales totals that had no column.

UPDATE orders.transactions t
SET base_total = s.base_total,
    post_charges_amount = s.post_charges_amount,
    subject_to_charges_amount = s.subject_to_charges_amount,
    used_funds = s.used_funds
FROM exchange.sales_orders s
WHERE s.id = t.order_id
  AND (t.base_total IS DISTINCT FROM s.base_total
    OR t.post_charges_amount IS DISTINCT FROM s.post_charges_amount
    OR t.subject_to_charges_amount IS DISTINCT FROM s.subject_to_charges_amount
    OR t.used_funds IS DISTINCT FROM s.used_funds);

-- Purchase orders get a transactions row. They had none: every column it would
-- have held - the fees, the pool adjustments - only exists as of 033.
--
-- The money columns a purchase order has no equivalent for stay null rather
-- than zero. A purchase order has no sales tax and no item total in the sense a
-- sales order does, and null says that where 0 would assert a figure.

INSERT INTO orders.transactions (
  order_id, refiner_fee, waive_shipping_fee, waive_payout_fee, shipping_paid,
  shipping_fee_actual, pool_remediation, pool_oz_deducted, total,
  created_by, updated_by, created_at, updated_at
)
SELECT
  p.id, p.refiner_fee, p.waive_shipping_fee, p.waive_payout_fee, p.shipping_paid,
  p.shipping_fee_actual, p.pool_remediation, p.pool_oz_deducted, p.total_price,
  p.created_by, p.updated_by,
  p.created_at AT TIME ZONE 'UTC', p.updated_at AT TIME ZONE 'UTC'
FROM exchange.purchase_orders p
WHERE NOT EXISTS (SELECT 1 FROM orders.transactions t WHERE t.order_id = p.id);

-- And keep them current if 033 arrived after the row already existed.

UPDATE orders.transactions t
SET refiner_fee = p.refiner_fee,
    waive_shipping_fee = p.waive_shipping_fee,
    waive_payout_fee = p.waive_payout_fee,
    shipping_paid = p.shipping_paid,
    shipping_fee_actual = p.shipping_fee_actual,
    pool_remediation = p.pool_remediation,
    pool_oz_deducted = p.pool_oz_deducted
FROM exchange.purchase_orders p
WHERE p.id = t.order_id
  AND (t.refiner_fee IS DISTINCT FROM p.refiner_fee
    OR t.waive_shipping_fee IS DISTINCT FROM p.waive_shipping_fee
    OR t.waive_payout_fee IS DISTINCT FROM p.waive_payout_fee
    OR t.shipping_paid IS DISTINCT FROM p.shipping_paid
    OR t.shipping_fee_actual IS DISTINCT FROM p.shipping_fee_actual
    OR t.pool_remediation IS DISTINCT FROM p.pool_remediation
    OR t.pool_oz_deducted IS DISTINCT FROM p.pool_oz_deducted);

-- Per-line pricing, and the scrap row's own premium.
--
-- The assay figures used to be set here too - refiner_premium, purity_actual,
-- post_melt_actual and content_actual - and 065 removed those columns from
-- orders.items. They belong on the refiner's line, which 066 derives.
--
-- bid_premium stays. An earlier edit dropped it along with the four, which
-- verify:backfill caught immediately: a rebuild produced null where dev held
-- 0.75 on twenty rows.

UPDATE orders.items i
SET price = poi.price,
    bid_premium = s.bid_premium
FROM exchange.purchase_order_items poi
LEFT JOIN exchange.scrap s ON s.id = poi.scrap_id
WHERE poi.id = i.id
  AND (i.price IS DISTINCT FROM poi.price
    OR i.bid_premium IS DISTINCT FROM s.bid_premium);

UPDATE orders.items i
SET price = soi.price
FROM exchange.sales_order_items soi
WHERE soi.id = i.id
  AND i.price IS DISTINCT FROM soi.price;

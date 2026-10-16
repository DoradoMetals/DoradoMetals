-- A REFINER ORDER KEEPS ITS LOTS, ITS DISPUTE AND A DOCUMENT SET PER DIRECTION.
--
-- refining.lots.released_at and returned_at (rulings 144, 145). Cancelling a
-- refiner order, or taking one lot off it, used to DELETE the link, so a
-- cancelled order listed nothing and nothing said which lots it had held. Now
-- the link is stamped `released_at` and kept; every read that asks where a lot
-- is reads a released link as gone, so the customer lot is back on hand and can
-- be batched again. `returned_at` is stamped beside it when the metal had
-- already reached the refiner, and only then. `a_lot_goes_to_one_refiner`
-- stays unique on lot_id: lot_id is the MINTED refiner copy (ruling 120), and a
-- re-batch mints a new one, so a released link never blocks a later one.
--
-- refining.orders.dispute_note: the reason an assay is disputed, written with
-- disputed_at.
--
-- refining.documents.direction (ruling 136). Each order kind has a fixed set:
-- sell is the invoice we render, the lot manifest and the refiner's settlement;
-- buy is the refiner's invoice and packing list, both imported. The two unique
-- indexes become unique per direction. `shipping_instructions` is in neither
-- set; its row is kept with no direction, so it is offered on no order and a
-- file stored under that kind is not lost.
--
-- refining.order_money: a released link is not on the order, so its lot is out
-- of the settlement sum. A POOLED sell's total is dollars only - the fee, the
-- payment charge and the carriage owed on the order - and a pool lock is not
-- attributed to it (ruling 135); its ounces are read from the pool.
--
-- refining_orders_number_prefix serves the header search on RS-/RP- numbers.
--
-- Nothing is deleted. `exchange` is neither read nor written.

ALTER TABLE refining.lots ADD COLUMN IF NOT EXISTS released_at timestamp with time zone;
ALTER TABLE refining.lots ADD COLUMN IF NOT EXISTS returned_at timestamp with time zone;
ALTER TABLE refining.orders ADD COLUMN IF NOT EXISTS dispute_note text;
ALTER TABLE refining.documents ADD COLUMN IF NOT EXISTS direction refining.direction;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'a_return_is_a_release') THEN
    ALTER TABLE refining.lots ADD CONSTRAINT a_return_is_a_release
      CHECK (returned_at IS NULL OR released_at IS NOT NULL);
  END IF;
END $$;

DROP INDEX IF EXISTS refining.refining_documents_kind;
DROP INDEX IF EXISTS refining.refining_documents_order;
CREATE UNIQUE INDEX IF NOT EXISTS refining_documents_direction_kind
  ON refining.documents (direction, kind);
CREATE UNIQUE INDEX IF NOT EXISTS refining_documents_direction_order
  ON refining.documents (direction, sort_order);

CREATE INDEX IF NOT EXISTS refining_orders_number_prefix
  ON refining.orders (((number)::text) text_pattern_ops);

UPDATE refining.documents
   SET direction = 'sell', sort_order = 1
 WHERE direction IS NULL AND kind = 'invoice'
   AND NOT EXISTS (SELECT 1 FROM refining.documents d
                    WHERE d.direction = 'sell' AND d.kind = 'invoice');

UPDATE refining.documents
   SET direction = 'sell', sort_order = 3
 WHERE direction IS NULL AND kind = 'settlement'
   AND NOT EXISTS (SELECT 1 FROM refining.documents d
                    WHERE d.direction = 'sell' AND d.kind = 'settlement');

UPDATE refining.documents
   SET direction = 'buy', sort_order = 2
 WHERE direction IS NULL AND kind = 'packing_list'
   AND NOT EXISTS (SELECT 1 FROM refining.documents d
                    WHERE d.direction = 'buy' AND d.kind = 'packing_list');

INSERT INTO refining.documents (direction, kind, name, renderable, sort_order)
SELECT v.direction::refining.direction, v.kind::media.pdf_kind, v.name, v.renderable, v.sort_order
  FROM (VALUES
    ('sell', 'invoice',      'Refiner Invoice', true,  1),
    ('sell', 'lot_manifest', 'Lot Manifest',    false, 2),
    ('sell', 'settlement',   'Settlement',      false, 3),
    ('buy',  'invoice',      'Refiner Invoice', false, 1),
    ('buy',  'packing_list', 'Packing List',    false, 2)
  ) AS v(direction, kind, name, renderable, sort_order)
 WHERE NOT EXISTS (SELECT 1 FROM refining.documents d
                    WHERE d.direction = v.direction::refining.direction
                      AND d.kind = v.kind::media.pdf_kind);

CREATE OR REPLACE VIEW refining.order_money AS
SELECT ro.id AS refining_order_id,
       settle.money AS expected_settlement,
       ro.fee,
       rem.remediation AS pool_remediation,
       chg.charge AS payment_charge,
       (CASE
          WHEN ro.direction = 'sell'::refining.direction
               AND ro.settlement_type = 'pooled'::refining.settlement_type
            THEN - COALESCE(ro.fee, 0::numeric)
                 - COALESCE(chg.charge, 0::numeric)
                 - COALESCE(frt.carriage, 0::numeric)
          WHEN ro.direction = 'sell'::refining.direction
            THEN COALESCE(settle.money, 0::numeric)
                 - COALESCE(ro.fee, 0::numeric)
                 - COALESCE(rem.remediation, 0::numeric)
                 - COALESCE(chg.charge, 0::numeric)
                 - COALESCE(frt.carriage, 0::numeric)
          ELSE COALESCE(settle.money, 0::numeric)
               + COALESCE(ro.fee, 0::numeric)
               + COALESCE(chg.charge, 0::numeric)
               + COALESCE(frt.carriage, 0::numeric)
        END) AS total,
       frt.carriage AS shipping,
       rem.oz AS pool_oz_remediated
  FROM refining.orders ro
  LEFT JOIN LATERAL (
         SELECT sum(rlot.content * rlot.quantity
                    * COALESCE(rlot.premium, src.premium, 1::numeric)
                    * COALESCE(rlot.settled_spot, sp.bid, sp.ask)) AS money
           FROM refining.lots rl
           JOIN inventory.lots rlot ON rlot.id = rl.lot_id
           LEFT JOIN LATERAL (
                  SELECT s.premium
                    FROM inventory.lot_sources e
                    JOIN inventory.lots s ON s.id = e.source_lot_id
                   WHERE e.lot_id = rlot.id
                     AND e.kind = 'batch'::inventory.lot_source_kind
                   ORDER BY e.created_at, e.id
                   LIMIT 1
                ) src ON true
           LEFT JOIN spots.spots sp ON sp.metal_id = rlot.metal_id
          WHERE rl.refining_order_id = ro.id
            AND rl.released_at IS NULL
            AND (ro.direction <> 'sell'::refining.direction
                 OR ro.settlement_type = 'paid'::refining.settlement_type)
       ) settle ON true
  LEFT JOIN LATERAL (
         SELECT - sum(p.troy_oz * p.lock_price) AS remediation,
                sum(p.troy_oz) AS oz
           FROM inventory.pool p
          WHERE p.refining_order_id = ro.id
            AND p.entry = 'lock'::inventory.pool_entry
            AND p.lock_price IS NOT NULL
       ) rem ON true
  LEFT JOIN LATERAL (
         SELECT max(m.flat_fee) AS charge
           FROM payments.transfers t
           JOIN payments.methods m ON m.type = t.rail::text AND m.enabled
          WHERE t.refining_order_id = ro.id
            AND t.state <> 'Failed'::payments.transfer_state
       ) chg ON true
  LEFT JOIN LATERAL (
         SELECT sh.cost AS carriage
           FROM fulfillments.fulfillments f
           JOIN fulfillments.shipments fs ON fs.fulfillment_id = f.id
           JOIN shipping.shipments sh ON sh.id = fs.shipment_id
          WHERE f.refining_order_id = ro.id
            AND sh.direction <> 'Return'::shipping.direction
          ORDER BY sh.created_at ASC, sh.id ASC
          LIMIT 1
       ) frt ON true;

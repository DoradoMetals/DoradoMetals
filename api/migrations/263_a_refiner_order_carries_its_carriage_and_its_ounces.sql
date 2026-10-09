-- A REFINER ORDER'S MONEY CARRIES ITS CARRIAGE, AND ITS OUNCES BESIDE ITS
-- DOLLARS.
--
-- Two gaps the refiner screens draw and `refining.order_money` (169/190) does
-- not hold:
--
--   `Charges - Shipping Charge $24.00` had no term at all, so `total` could
--   not reconcile with the card above it. It is the refiner leg's own parcel -
--   the first non-return shipment on the fulfillment pointing at this refining
--   order. A `sell` leg is metal we ship out and the carriage comes off what
--   the order yields; a `buy` leg is metal we bring in and the carriage adds
--   to what we pay.
--
--   `Pool Oz Remediated 0.003 oz` drew ounces from a dollar column.
--   `pool_remediation` is dollars; the ounces are the same locks' signed
--   `troy_oz`, which the `rem` lateral already visits.
--
-- Column order is preserved and the two new columns are appended, so
-- CREATE OR REPLACE is enough. `exchange` is neither read nor written.

CREATE OR REPLACE VIEW refining.order_money AS
SELECT ro.id AS refining_order_id,
       settle.money AS expected_settlement,
       ro.fee,
       rem.remediation AS pool_remediation,
       chg.charge AS payment_charge,
       (CASE
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

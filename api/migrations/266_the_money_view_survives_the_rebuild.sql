-- runs-even-under-a-baseline: 190 carries rows, so a baseline replays its DDL
--   too, and that DDL drops and recreates refining.order_money with the six
--   columns 169 gave it - undoing the eight columns 263 gave it and genesis
--   already holds. This restates the view after it and must never be stamped.
--
-- THE MONEY VIEW SURVIVES THE REBUILD.
--
-- A baseline supersedes shape, and the runner's split is per FILE: a covered
-- migration whose statements are all DDL is recorded as done, and one that
-- carries rows RUNS - its own ALTERs included, because a backfill's ALTERs are
-- part of how it writes its rows (233 disables the audit trigger around its
-- UPDATE). 190 is the one covered migration that both carries rows and rewrites
-- an object genesis holds in a later form, so on a from-the-dump rebuild the
-- chain ends with the six-column view and the Charges card loses its Shipping
-- Charge and its Pool Oz Remediated.
--
-- The definition below is genesis's own, character for character, so the two
-- cannot drift. CREATE OR REPLACE appends the two columns back on a rebuilt
-- database and is a no-op on dev, where the view is already this.
--
-- No table is altered, no row written, `exchange` neither read nor written.

CREATE OR REPLACE VIEW refining.order_money AS
 SELECT ro.id AS refining_order_id,
    settle.money AS expected_settlement,
    ro.fee,
    rem.remediation AS pool_remediation,
    chg.charge AS payment_charge,
        CASE
            WHEN ro.direction = 'sell'::refining.direction THEN COALESCE(settle.money, 0::numeric) - COALESCE(ro.fee, 0::numeric) - COALESCE(rem.remediation, 0::numeric) - COALESCE(chg.charge, 0::numeric) - COALESCE(frt.carriage, 0::numeric)
            ELSE COALESCE(settle.money, 0::numeric) + COALESCE(ro.fee, 0::numeric) + COALESCE(chg.charge, 0::numeric) + COALESCE(frt.carriage, 0::numeric)
        END AS total,
    frt.carriage AS shipping,
    rem.oz AS pool_oz_remediated
   FROM refining.orders ro
     LEFT JOIN LATERAL ( SELECT sum(rlot.content * rlot.quantity * COALESCE(rlot.premium, src.premium, 1::numeric) * COALESCE(rlot.settled_spot, sp.bid, sp.ask)) AS money
           FROM refining.lots rl
             JOIN inventory.lots rlot ON rlot.id = rl.lot_id
             LEFT JOIN LATERAL ( SELECT s.premium
                   FROM inventory.lot_sources e
                     JOIN inventory.lots s ON s.id = e.source_lot_id
                  WHERE e.lot_id = rlot.id AND e.kind = 'batch'::inventory.lot_source_kind
                  ORDER BY e.created_at, e.id
                 LIMIT 1) src ON true
             LEFT JOIN spots.spots sp ON sp.metal_id = rlot.metal_id
          WHERE rl.refining_order_id = ro.id AND (ro.direction <> 'sell'::refining.direction OR ro.settlement_type = 'paid'::refining.settlement_type)) settle ON true
     LEFT JOIN LATERAL ( SELECT - sum(p.troy_oz * p.lock_price) AS remediation,
            sum(p.troy_oz) AS oz
           FROM inventory.pool p
          WHERE p.refining_order_id = ro.id AND p.entry = 'lock'::inventory.pool_entry AND p.lock_price IS NOT NULL) rem ON true
     LEFT JOIN LATERAL ( SELECT max(m.flat_fee) AS charge
           FROM payments.transfers t
             JOIN payments.methods m ON m.type = t.rail::text AND m.enabled
          WHERE t.refining_order_id = ro.id AND t.state <> 'Failed'::payments.transfer_state) chg ON true
     LEFT JOIN LATERAL ( SELECT sh.cost AS carriage
           FROM fulfillments.fulfillments f
             JOIN fulfillments.shipments fs ON fs.fulfillment_id = f.id
             JOIN shipping.shipments sh ON sh.id = fs.shipment_id
          WHERE f.refining_order_id = ro.id AND sh.direction <> 'Return'::shipping.direction
          ORDER BY sh.created_at, sh.id
         LIMIT 1) frt ON true;

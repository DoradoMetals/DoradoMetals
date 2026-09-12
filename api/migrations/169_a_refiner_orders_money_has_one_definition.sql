-- GAP 11 and GAP 13: a refiner order's Charges and Totals cards, and the
-- Settlement card's big figure.
--
-- A refiner order has no `orders.transactions` row and should not grow one. Its
-- money is four numbers derived from rows it already has: the metal the refiner
-- owes (content x premium, the same arithmetic the pool credit writes, valued at
-- the refiner's own feed), its fee column, the cash value of the pool locks
-- citing it, and what the rail its transfer moves on costs.
--
-- It is a VIEW rather than an expression copied into three reads - the order
-- view, the order list and the Payment card all want the same total, and three
-- copies of a money expression is three chances for them to disagree.
--
-- Additive: one view over existing tables. No table is altered, no row written,
-- `exchange` neither read nor written.

CREATE OR REPLACE VIEW refining.order_money AS
SELECT ro.id AS refining_order_id,
       settle.money AS expected_settlement,
       ro.fee,
       rem.remediation AS pool_remediation,
       chg.charge AS payment_charge,
       CASE WHEN ro.direction = 'sell'
            THEN COALESCE(settle.money, 0) - COALESCE(ro.fee, 0)
                 - COALESCE(rem.remediation, 0) - COALESCE(chg.charge, 0)
            ELSE COALESCE(settle.money, 0) + COALESCE(ro.fee, 0)
                 + COALESCE(chg.charge, 0) END AS total
  FROM refining.orders ro
  LEFT JOIN LATERAL (
         SELECT sum(owed.oz * COALESCE(pl.lock_price, sp.bid, sp.ask)) AS money
           FROM (SELECT li.metal_id,
                        sum(COALESCE(rl.content, li.content)
                            * COALESCE(rl.premium, ol.premium) * li.quantity) AS oz
                   FROM refining.lots rl
                   JOIN inventory.lots li ON li.id = rl.lot_id
                   LEFT JOIN orders.lots ol ON ol.lot_id = rl.lot_id
                  WHERE rl.refining_order_id = ro.id
                  GROUP BY li.metal_id) owed
           LEFT JOIN spots.spots sp ON sp.metal_id = owed.metal_id
           LEFT JOIN LATERAL (
                  SELECT p.lock_price FROM inventory.pool p
                   WHERE p.refiner_id = ro.refiner_id
                     AND p.metal_id = owed.metal_id
                     AND p.entry = 'lock'
                     AND p.occurred_at <= COALESCE(ro.settled_at, now())
                   ORDER BY p.occurred_at DESC, p.id DESC LIMIT 1) pl ON TRUE
       ) settle ON TRUE
  LEFT JOIN LATERAL (
         SELECT -sum(p.troy_oz * p.lock_price) AS remediation
           FROM inventory.pool p
          WHERE p.refining_order_id = ro.id AND p.entry = 'lock'
            AND p.lock_price IS NOT NULL
       ) rem ON TRUE
  LEFT JOIN LATERAL (
         SELECT max(m.flat_fee) AS charge
           FROM payments.transfers t
           JOIN payments.methods m ON m.type = t.rail::text AND m.enabled
          WHERE t.refining_order_id = ro.id AND t.state <> 'Failed'
       ) chg ON TRUE;

-- THE REFINER ORDER'S MONEY, per lot and in total. $1 = refining_order_id.
--
-- The Settlement table draws a `Price` per lot and the Totals card draws the
-- order's five terms; ruling 75 says both come from pricing, not from the
-- browser and not from the refining view. Each line is the same product
-- `refining.order_money` sums - content x quantity x premium x the spot that
-- lot was priced at - so the lines add up to `expected_settlement` by
-- construction rather than by agreement.
--
-- The premium is the refiner lot's own, falling back to the premium on the
-- customer lot it was minted from (the first `batch` edge by created_at, id -
-- the tie-break `order_money` already uses). The spot is the lot's stamped
-- `settled_spot` once Record settlement wrote one and the live feed until
-- then; `settled_spot` and `settled_at` come back beside the price so a
-- pending row can print a dash without the client deciding what pending
-- means.
--
-- A `pooled` sell order has no cash settlement at all: what it yields is
-- ounces, priced later by a pool lock, so every price on it is NULL - the
-- same withholding `order_money` already applies to `expected_settlement`.
WITH ord AS (
  SELECT ro.id, ro.direction, ro.number, ro.settlement_type
    FROM refining.orders ro
   WHERE ro.id = $1::uuid
),
lines AS (
  SELECT rl.id,
         rl.lot_id,
         li.metal_id,
         li.content,
         li.quantity,
         li.settled_spot,
         li.settled_at,
         li.line_reference,
         b.name AS product_name,
         COALESCE(b.type, 'Scrap') AS form,
         COALESCE(li.premium, src.premium) AS premium,
         (CASE ord.direction WHEN 'buy' THEN 'RP-' ELSE 'RS-' END)
           || ord.number || '-' || chr(64 + rseat.n::int) AS reference,
         CASE WHEN ord.direction = 'sell' AND ord.settlement_type = 'pooled' THEN NULL
              ELSE li.content * li.quantity
                   * COALESCE(li.premium, src.premium, 1)
                   * COALESCE(li.settled_spot, sp.bid, sp.ask) END AS price
    FROM ord
    JOIN refining.lots rl ON rl.refining_order_id = ord.id
    JOIN inventory.lots li ON li.id = rl.lot_id
    LEFT JOIN products.bullion b ON b.id = li.bullion_id
    LEFT JOIN spots.spots sp ON sp.metal_id = li.metal_id
    LEFT JOIN LATERAL (
           SELECT s.premium
             FROM inventory.lot_sources e
             JOIN inventory.lots s ON s.id = e.source_lot_id
            WHERE e.lot_id = li.id AND e.kind = 'batch'
            ORDER BY e.created_at, e.id
            LIMIT 1
         ) src ON TRUE
    LEFT JOIN LATERAL (
           SELECT count(*) AS n
             FROM refining.lots rpeer
            WHERE rpeer.refining_order_id = rl.refining_order_id
              AND (rpeer.created_at, rpeer.id) <= (rl.created_at, rl.id)
         ) rseat ON TRUE
)
SELECT jsonb_build_object(
         'refining_order_id', ord.id,
         'direction', ord.direction::text,
         'settlement_type', ord.settlement_type::text,
         'spots_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'lots', COALESCE(
           (SELECT jsonb_agg(
                     jsonb_build_object(
                       'lot_id', l.lot_id,
                       'reference', l.reference,
                       'product_name', l.product_name,
                       'form', l.form,
                       'metal_id', l.metal_id,
                       'line_reference', l.line_reference,
                       'content', l.content,
                       'quantity', l.quantity,
                       'premium', l.premium,
                       'settled_spot', l.settled_spot,
                       'settled_at', to_char(l.settled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                       'price', l.price)
                     ORDER BY l.reference ASC)
              FROM lines l),
           '[]'::jsonb),
         'expected_settlement', money.expected_settlement,
         'fee', money.fee,
         'shipping', money.shipping,
         'payment_charge', money.payment_charge,
         'pool_remediation', money.pool_remediation,
         'pool_oz_remediated', money.pool_oz_remediated,
         'total', money.total
       ) AS pricing
  FROM ord
  LEFT JOIN refining.order_money money ON money.refining_order_id = ord.id

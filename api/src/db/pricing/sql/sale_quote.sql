WITH checkout AS (
  SELECT c.id, c.user_id, c.payment_method_id, c.recipient_address_id, c.fulfillment_id
    FROM checkout.checkouts c
   WHERE c.id = $1::uuid
     AND c.direction = 'sale'
),
delivery AS (
  SELECT a.state
    FROM checkout
    LEFT JOIN places.addresses a ON a.id = checkout.recipient_address_id
),
carriage AS (
  SELECT sv.name, sv.price
    FROM checkout
    JOIN fulfillments.shipments fs ON fs.fulfillment_id = checkout.fulfillment_id
    JOIN shipping.shipments sh ON sh.id = fs.shipment_id
    JOIN shipping.services sv ON sv.id = sh.carrier_service_id
   ORDER BY fs.id ASC
   LIMIT 1
),
settlement AS (
  SELECT COALESCE(pm.surcharge_percent, 0.029) AS surcharge_percent,
         COALESCE(u.dorado_funds, 0) AS balance
    FROM checkout
    -- Only a method that can actually TAKE the charge sets its surcharge
    -- (MP F2). The customer names this column, and the surcharge was read off
    -- whatever they named: CREDIT settles from the balance the quote has
    -- already applied as pre_charges_amount and carries surcharge 0, so naming
    -- it took $254 off an $8,762 basket while payment_surface stayed 'card' and
    -- Stripe still charged the card. A row that is not an enabled sale method
    -- of an external provider falls through to the COALESCE default.
    LEFT JOIN payments.methods pm ON pm.id = checkout.payment_method_id
                                 AND pm.enabled
                                 AND pm.direction = 'sale'
                                 AND pm.provider IS DISTINCT FROM 'internal'
    LEFT JOIN auth.users u ON u.id = checkout.user_id
),
lines AS (
  SELECT ci.id,
         ci.bullion_id,
         ci.metal_id,
         COALESCE(ci.quantity, 1) AS quantity,
         ci.content,
         ci.purity,
         ci.pre_melt,
         b.id AS product_id,
         b.type AS product_type,
         b.ask_premium,
         b.legal_tender,
         b.domestic_tender,
         COALESCE(ci.content, 0) * (COALESCE(s.ask, 0) * COALESCE(b.ask_premium, 0)) AS unit_ask
    FROM checkout.items ci
    JOIN checkout ON checkout.id = ci.checkout_id
    LEFT JOIN products.bullion b ON b.id = ci.bullion_id
    LEFT JOIN spots.spots s ON s.metal_id = ci.metal_id
),
aggregate AS (
  SELECT COALESCE(sum(l.unit_ask * l.quantity), 0) AS item_total FROM lines l
),
taxed AS (
  SELECT l.*,
         CASE WHEN $2::boolean
                   AND delivery.state IS NOT NULL
                   AND NOT COALESCE((SELECT st.reached_nexus
                                       FROM tax.sales_tax st
                                      WHERE st.state::text = delivery.state), false)
              THEN 0
              ELSE COALESCE(rule.tax_rate, 0) END AS sales_tax_rate
    FROM lines l
   CROSS JOIN delivery
   CROSS JOIN aggregate
    LEFT JOIN LATERAL (
           SELECT r.tax_rate
             FROM tax.sales_tax_rules r
            WHERE delivery.state IS NOT NULL
              AND r.state_code::text = delivery.state
              AND (r.metal_category::text = 'All'
                   OR (l.metal_id IS NOT NULL AND r.metal_category::text = l.metal_id))
              AND (r.product_type::text = 'All'
                   OR (l.product_type IS NOT NULL AND r.product_type::text = l.product_type))
              AND l.unit_ask BETWEEN r.min_price AND r.max_price
              AND COALESCE(l.purity, 0) BETWEEN r.purity_min AND r.purity_max
              AND aggregate.item_total BETWEEN r.aggregate_min AND r.aggregate_max
              AND COALESCE(l.pre_melt, 0) BETWEEN r.weight_min AND r.weight_max
              AND (r.is_domestic IS NULL OR r.is_domestic = l.domestic_tender)
              AND (r.is_legal_tender IS NULL OR r.is_legal_tender = l.legal_tender)
            ORDER BY (r.metal_category::text <> 'All') DESC,
                     (r.product_type::text <> 'All') DESC,
                     (r.is_domestic IS NOT NULL) DESC,
                     (r.is_legal_tender IS NOT NULL) DESC,
                     (r.min_price <> 0 OR r.max_price <> 1e12) DESC,
                     (r.purity_min <> 0 OR r.purity_max <> 1) DESC,
                     (r.aggregate_min <> 0 OR r.aggregate_max <> 1e12) DESC,
                     r.id ASC
            LIMIT 1
         ) rule ON TRUE
),
money AS (
  SELECT aggregate.item_total,
         carriage.name AS shipping_service,
         CASE WHEN aggregate.item_total > 1000 THEN 0
              ELSE COALESCE(carriage.price, 0) END AS shipping_charge,
         COALESCE((SELECT sum(t.unit_ask * t.quantity * t.sales_tax_rate) FROM taxed t), 0)
           AS sales_tax,
         delivery.state AS sales_tax_state,
         settlement.balance,
         settlement.surcharge_percent
    FROM aggregate, delivery, settlement
    LEFT JOIN carriage ON TRUE
),
settled AS (
  SELECT money.*,
         money.item_total + money.shipping_charge + money.sales_tax AS base_total
    FROM money
),
applied AS (
  SELECT settled.*,
         CASE WHEN settled.base_total - LEAST(settled.balance, settled.base_total) > 0
                   AND settled.base_total - LEAST(settled.balance, settled.base_total) < 0.5
              THEN GREATEST(0, settled.base_total - 0.5)
              ELSE LEAST(settled.balance, settled.base_total) END AS pre_charges_amount
    FROM settled
),
charged AS (
  SELECT applied.*,
         applied.base_total - applied.pre_charges_amount AS subject_to_charges_amount,
         CASE WHEN applied.base_total - applied.pre_charges_amount > 0
              THEN (applied.base_total - applied.pre_charges_amount) * applied.surcharge_percent
              ELSE 0 END AS charges_amount
    FROM applied
)
SELECT jsonb_build_object(
         'direction', 'sale',
         'checkout_id', checkout.id,
         'spots_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'items', COALESCE(
           (SELECT jsonb_agg(
                     jsonb_build_object(
                       'id', t.id,
                       'kind', 'product',
                       'bullion_id', t.bullion_id,
                       'metal_id', t.metal_id,
                       'content', COALESCE(t.content, 0),
                       'quantity', t.quantity,
                       'premium', COALESCE(t.ask_premium, 0),
                       'unit_ask', t.unit_ask,
                       'line_total', t.unit_ask * t.quantity,
                       'sales_tax_rate', t.sales_tax_rate,
                       'sales_tax', t.unit_ask * t.quantity * t.sales_tax_rate)
                     ORDER BY t.id ASC)
              FROM taxed t),
           '[]'::jsonb),
         'unpriceable', COALESCE(
           (SELECT jsonb_agg(t.id ORDER BY t.id ASC)
              FROM taxed t
             WHERE t.product_id IS NULL OR t.content IS NULL),
           '[]'::jsonb),
         'item_total', charged.item_total,
         'shipping_charge', charged.shipping_charge,
         'shipping_service', charged.shipping_service,
         'sales_tax', charged.sales_tax,
         'sales_tax_state', charged.sales_tax_state,
         'base_total', charged.base_total,
         'beginning_funds', charged.balance,
         'ending_funds', charged.balance - charged.pre_charges_amount,
         'pre_charges_amount', charged.pre_charges_amount,
         'subject_to_charges_amount', charged.subject_to_charges_amount,
         'charges_amount', charged.charges_amount,
         'post_charges_amount', charged.subject_to_charges_amount + charged.charges_amount,
         'order_total', charged.pre_charges_amount
                        + charged.subject_to_charges_amount + charged.charges_amount,
         'payment_surface',
         CASE WHEN round((charged.subject_to_charges_amount + charged.charges_amount) * 100) >= 50
              THEN 'card' ELSE 'credit' END
       ) AS quote
  FROM checkout, charged

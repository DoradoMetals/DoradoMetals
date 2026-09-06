-- Payout sent (Figma 6:260). What was paid, how, and to which account - the
-- account is named by its last four only, which is the only part of it any
-- document may carry.
WITH ord AS (
  SELECT o.id, o.number, o.direction, o.user_id
    FROM orders.orders o
   WHERE o.id = $1
),
money AS (
  SELECT COALESCE(t.base_total, t.items)                            AS metal,
         COALESCE(t.refiner_fee, 0) + COALESCE(t.payout_fee, 0)     AS fees,
         t.total                                                    AS paid,
         d.last_four                                                AS last_four,
         m.type                                                     AS method
    FROM ord
    LEFT JOIN orders.transactions t ON t.order_id = ord.id
    LEFT JOIN payments.details d ON d.id = t.payout_details_id
    LEFT JOIN payments.methods m ON m.id = d.method_id
)
SELECT jsonb_build_object(
         'order_id', ord.id,
         'user_id', u.id,
         'email', u.email,
         'name', u.name,
         'order_number', ord.number,
         'method', money.method,
         'account_last4', money.last_four,
         'amount', COALESCE('$' || to_char(money.paid, 'FM999,999,990.00'), '-'),
         'rows', jsonb_build_array(
                   jsonb_build_object(
                     'label', 'Metal value',
                     'value', COALESCE('$' || to_char(money.metal, 'FM999,999,990.00'), '-')),
                   jsonb_build_object(
                     'label', 'Fees',
                     'value', CASE WHEN COALESCE(money.fees, 0) = 0 THEN '$0.00'
                                   ELSE '-$' || to_char(money.fees, 'FM999,999,990.00') END),
                   jsonb_build_object(
                     'label', 'Paid',
                     'value', COALESCE('$' || to_char(money.paid, 'FM999,999,990.00'), '-')))
       ) AS content
  FROM ord
  JOIN auth.users u ON u.id = ord.user_id
  CROSS JOIN money

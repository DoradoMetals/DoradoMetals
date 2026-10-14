-- Payout sent (Figma 257:2159). What was paid, how, and to which account - the
-- account is named by its last four only, which is the only part of it any
-- document may carry.
WITH ord AS (
  SELECT o.id, o.number, o.direction, o.user_id
    FROM orders.orders o
   WHERE o.id = $1
),
money AS (
  SELECT t.total                                                    AS paid,
         d.last_four                                                AS last_four,
         m.type                                                     AS method,
         m.label                                                    AS method_label,
         m.time_delay                                               AS time_delay
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
                     'label', 'Method',
                     'value', COALESCE(money.method_label, '-')),
                   jsonb_build_object(
                     'label', 'Processing time',
                     'value', COALESCE(money.time_delay, '-')))
       ) AS content
  FROM ord
  JOIN auth.users u ON u.id = ord.user_id
  CROSS JOIN money

WITH subject AS (
  SELECT o.id,
         o.number,
         o.direction,
         CASE WHEN o.direction = 'sale' THEN t.post_charges_amount ELSE t.total END AS due,
         u.name AS customer
    FROM orders.orders o
    LEFT JOIN orders.transactions t ON t.order_id = o.id
    LEFT JOIN auth.users u ON u.id = o.user_id
   WHERE o.id = $1
),
rungs AS (
  SELECT i.id,
         i.source,
         i.amount,
         to_char(i.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS occurred_at,
         i.counterparty_name,
         i.memo,
         i.account_ref,
         CASE
           WHEN $2::text IS NOT NULL AND i.account_ref = $2::text THEN 'account'
           WHEN i.memo IS NOT NULL
                AND i.memo ILIKE '%'
                    || CASE WHEN s.direction = 'sale' THEN 'SO-' ELSE 'PO-' END
                    || s.number::text || '%' THEN 'reference'
           WHEN s.due IS NOT NULL
                AND abs(i.amount - s.due) <= 0.50
                AND s.customer IS NOT NULL
                AND i.counterparty_name ILIKE '%' || s.customer || '%' THEN 'heuristic'
           ELSE 'manual'
         END AS rung,
         COALESCE(i.amount - s.due, i.amount) AS amount_delta
    FROM payments.inbound_transactions i
    CROSS JOIN subject s
   WHERE i.state = 'Unmatched'
)
SELECT * FROM rungs
 ORDER BY CASE rung WHEN 'account' THEN 0 WHEN 'reference' THEN 1
                    WHEN 'heuristic' THEN 2 ELSE 3 END,
          abs(amount_delta),
          occurred_at DESC
 LIMIT 25

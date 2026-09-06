-- The pooling mechanic: lots accumulate onto the one open sell order per
-- refiner until it is sent. `one_open_sell_order_per_refiner` is what makes
-- this read single-valued.
SELECT id, number, direction, refiner_id, assigned_to_id,
       to_char(sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS sent_at,
       to_char(settled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS settled_at,
       to_char(disputed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS disputed_at,
       to_char(expected_settlement_on, 'YYYY-MM-DD') AS expected_settlement_on,
       assay_lab, fee, statement_reference,
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       created_by_id, updated_by_id
  FROM refining.orders
 WHERE refiner_id = $1 AND direction = 'sell' AND sent_at IS NULL

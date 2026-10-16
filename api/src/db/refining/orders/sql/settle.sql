-- Ruling 146: a refiner order stays open until every held lot has settled.
-- The lots this call names are written first, in the same transaction, so the
-- stamp lands on the call that settles the last one and on no earlier call.
-- The fee and the statement reference are written on every call.
UPDATE refining.orders
   SET settled_at = CASE
         WHEN NOT EXISTS (SELECT 1
                            FROM refining.lots rl
                            JOIN inventory.lots li ON li.id = rl.lot_id
                           WHERE rl.refining_order_id = $1
                             AND rl.released_at IS NULL
                             AND li.settled_at IS NULL)
           THEN COALESCE(settled_at, now())
         ELSE settled_at END,
       fee = COALESCE($2::numeric, fee),
       statement_reference = COALESCE($3::text, statement_reference)
 WHERE id = $1 AND sent_at IS NOT NULL
RETURNING id, number, direction, refiner_id, assigned_to_id,
       to_char(sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS sent_at,
       to_char(settled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS settled_at,
       to_char(disputed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS disputed_at,
       to_char(expected_settlement_on, 'YYYY-MM-DD') AS expected_settlement_on,
       location_id,
       to_char(cancelled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS cancelled_at,
       assay_lab, fee, statement_reference,
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       created_by_id, updated_by_id, settlement_type, dispute_note

WITH made AS (
  INSERT INTO shipping.claims (shipment_id, kind, amount, carrier_claim_number, note)
  VALUES ($1, $2, $3, $4, $5)
  RETURNING *
)
SELECT c.id, c.shipment_id, c.kind, c.amount, c.carrier_claim_number, c.status, c.paid_amount, c.note,
       to_char(c.resolved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS resolved_at,
       to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(c.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       c.created_by_id, c.updated_by_id FROM made c

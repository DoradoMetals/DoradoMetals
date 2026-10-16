SELECT c.id, c.shipment_id, c.kind, c.amount, c.carrier_claim_number, c.status, c.paid_amount, c.note,
       to_char(c.resolved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS resolved_at,
       to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(c.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       c.created_by_id, c.updated_by_id
  FROM shipping.claims c
  JOIN fulfillments.shipments fs ON fs.shipment_id = c.shipment_id
  JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
 WHERE f.order_id = $1
 ORDER BY c.created_at, c.id

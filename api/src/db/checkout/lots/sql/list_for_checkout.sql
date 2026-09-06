SELECT li.id, li.bullion_id, li.metal_id, li.unit, li.quantity, li.pre_melt,
       li.post_melt, li.purity, li.content_snapshot, li.content, li.image_id,
       li.split_from_id,
       to_char(li.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(li.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       li.created_by_id, li.updated_by_id
  FROM checkout.lots cl
  JOIN lots.items li ON li.id = cl.lot_id
 WHERE cl.checkout_id = $1
 ORDER BY cl.created_at ASC, cl.id ASC

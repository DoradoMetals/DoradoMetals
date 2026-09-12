SELECT li.id, li.bullion_id, li.metal_id, li.unit, li.quantity, li.pre_melt,
       li.post_melt, li.purity, li.content_snapshot, li.content, li.image_id,
       to_char(li.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(li.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       li.created_by_id, li.updated_by_id,
       li.declared_unit, li.declared_quantity, li.declared_pre_melt, li.declared_post_melt,
       li.declared_purity, li.declared_content,
       to_char(li.assayed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS assayed_at,
       li.premium, li.sales_tax_rate,
       to_char(li.confirmed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS confirmed_at,
       to_char(li.settled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS settled_at,
       li.settled_spot, li.source::text AS source
  FROM checkout.lots cl
  JOIN inventory.lots li ON li.id = cl.lot_id
 WHERE cl.checkout_id = $1
 ORDER BY cl.created_at ASC, cl.id ASC

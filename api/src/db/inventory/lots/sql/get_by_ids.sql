SELECT id, bullion_id, metal_id, unit, quantity, pre_melt, post_melt, purity,
       content_snapshot, content, image_id,
       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
       to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
       created_by_id, updated_by_id,
       declared_unit, declared_quantity, declared_pre_melt, declared_post_melt,
       declared_purity, declared_content,
       to_char(assayed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS assayed_at,
       premium, sales_tax_rate,
       to_char(confirmed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS confirmed_at,
       to_char(settled_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS settled_at,
       settled_spot, source::text AS source
  FROM inventory.lots
 WHERE id = ANY($1::uuid[])
 ORDER BY id ASC

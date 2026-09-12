-- A split mints children and leaves the parent alone. The children inherit the
-- parent's metal and its product; each declares its own weights.
INSERT INTO lots.items
       (bullion_id, metal_id, unit, quantity, pre_melt, post_melt, purity,
        content_snapshot, split_from_id)
SELECT p.bullion_id, p.metal_id, COALESCE(part.unit, p.unit),
       COALESCE(part.quantity, 1), part.pre_melt,
       CASE WHEN p.bullion_id IS NULL THEN part.post_melt END,
       COALESCE(part.purity, p.purity),
       CASE WHEN p.bullion_id IS NOT NULL THEN p.content_snapshot END,
       p.id
  FROM lots.items p
  JOIN unnest($2::numeric[], $3::numeric[], $4::numeric[], $5::text[], $6::numeric[])
       AS part(pre_melt, post_melt, purity, unit, quantity) ON TRUE
 WHERE p.id = $1
RETURNING id, bullion_id, metal_id, unit, quantity, pre_melt, post_melt, purity,
          content_snapshot, content, image_id, split_from_id,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at,
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at,
          created_by_id, updated_by_id,
          declared_unit, declared_quantity, declared_pre_melt, declared_post_melt,
          declared_purity, declared_content,
          to_char(assayed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS assayed_at,
          combined_into_id

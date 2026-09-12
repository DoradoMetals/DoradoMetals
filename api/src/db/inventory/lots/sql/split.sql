-- A split mints children and leaves the parent alone. The children inherit
-- the parent's metal and its product; each declares its own weights. A
-- data-modifying CTE writes the lineage in the same statement: one `split`
-- edge per child, pointing at the parent - a data-modifying CTE always runs
-- to completion even though the final SELECT never reads its rows.
WITH children AS (
  INSERT INTO inventory.lots
         (bullion_id, metal_id, unit, quantity, pre_melt, post_melt, purity, content_snapshot)
  SELECT p.bullion_id, p.metal_id, COALESCE(part.unit, p.unit),
         COALESCE(part.quantity, 1), part.pre_melt,
         CASE WHEN p.bullion_id IS NULL THEN part.post_melt END,
         COALESCE(part.purity, p.purity),
         CASE WHEN p.bullion_id IS NOT NULL THEN p.content_snapshot END
    FROM inventory.lots p
    JOIN unnest($2::numeric[], $3::numeric[], $4::numeric[], $5::text[], $6::numeric[])
         AS part(pre_melt, post_melt, purity, unit, quantity) ON TRUE
   WHERE p.id = $1
  RETURNING id, bullion_id, metal_id, unit, quantity, pre_melt, post_melt, purity,
            content_snapshot, content, image_id, created_at, updated_at,
            created_by_id, updated_by_id, declared_unit, declared_quantity,
            declared_pre_melt, declared_post_melt, declared_purity, declared_content,
            assayed_at, premium, sales_tax_rate, confirmed_at, settled_at, settled_spot, source
), edges AS (
  INSERT INTO inventory.lot_sources (lot_id, source_lot_id, kind)
  SELECT id, $1, 'split' FROM children
  RETURNING id
)
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
  FROM children
 ORDER BY created_at ASC, id ASC

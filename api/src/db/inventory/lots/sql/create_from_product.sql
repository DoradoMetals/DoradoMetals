-- A catalogue lot snapshots the product once (ruling 51) and never reprices.
-- `content_snapshot` takes the product's ADVERTISED FINE content, which is what
-- `content` then generates from; `post_melt` stays NULL because a coin is not
-- melted, and a fine weight in a gross-weight column is what made a derived
-- content apply purity twice.
--
-- $3 is whether the caller is BUYING from the catalogue. `display` gates the
-- buy side only (ruling 49), so a hidden product still reaches a sell basket
-- and an admin's order line.
INSERT INTO inventory.lots
       (bullion_id, metal_id, unit, quantity, pre_melt, post_melt, purity, content_snapshot)
SELECT b.id, b.metal_id, 't oz', COALESCE($2::numeric, 1), b.gross, NULL, b.purity, b.content
  FROM products.bullion b
 WHERE b.id = $1
   AND (NOT $3::boolean OR b.display = true)
RETURNING id, bullion_id, metal_id, unit, quantity, pre_melt, post_melt, purity,
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
          settled_spot, source::text AS source, line_reference

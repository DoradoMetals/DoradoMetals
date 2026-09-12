-- Mints the merged lot. Content is conserved exactly: `operative_weight` is
-- the sum of each parent's OWN operative weight (the same COALESCE(post_melt,
-- pre_melt) the generated `content` column already applies per row), and
-- `purity` is set to content_sum / metals.fine_content(operative_weight,
-- unit, 1) - the content-weighted average that makes
-- metals.fine_content(operative_weight, unit, purity) reproduce content_sum
-- to the cent, whatever mix of assayed and unassayed parents went in. A
-- bullion combine (rules.ts already refused a mix of two different
-- catalogue products, or a catalogue lot with a scrap one) instead merges
-- quantity and keeps the shared content_snapshot and purity untouched, since
-- content there is a per-unit fact the weight columns do not drive.
--
-- The `combine` lot_sources edges (one per parent, pointing at this result)
-- are written separately by combine_parents.sql, once the caller has this
-- lot's id.
WITH parents AS (
  SELECT * FROM inventory.lots WHERE id = ANY($1::uuid[])
), agg AS (
  SELECT
    bool_and(bullion_id IS NULL) AS all_scrap,
    (array_agg(bullion_id))[1] AS bullion_id,
    min(metal_id) AS metal_id,
    min(unit) AS unit,
    sum(quantity) AS quantity_sum,
    sum(COALESCE(post_melt, pre_melt)) AS operative_weight,
    (count(*) FILTER (WHERE post_melt IS NULL)) = 0 AS all_post_melt,
    sum(content) AS content_sum,
    min(purity) AS bullion_purity,
    min(content_snapshot) AS bullion_content_snapshot
  FROM parents
)
INSERT INTO inventory.lots (bullion_id, metal_id, unit, quantity, pre_melt, post_melt, purity,
                         content_snapshot)
SELECT
  agg.bullion_id,
  agg.metal_id,
  agg.unit,
  CASE WHEN agg.all_scrap THEN 1 ELSE agg.quantity_sum END,
  CASE WHEN agg.all_scrap THEN agg.operative_weight ELSE NULL END,
  CASE WHEN agg.all_scrap AND agg.all_post_melt THEN agg.operative_weight ELSE NULL END,
  CASE WHEN agg.all_scrap
       THEN agg.content_sum / metals.fine_content(agg.operative_weight, agg.unit, 1)
       ELSE agg.bullion_purity END,
  CASE WHEN agg.all_scrap THEN NULL ELSE agg.bullion_content_snapshot END
  FROM agg
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
          settled_spot, source::text AS source

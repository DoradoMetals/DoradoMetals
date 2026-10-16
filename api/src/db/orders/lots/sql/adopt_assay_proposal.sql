-- The adopt-assay proposal (ruling 121): for each of this order's lots that
-- has been batched to a refiner (inventory.lot_sources, kind = 'batch'), what
-- the refiner reported, this lot's SHARE of that report - pro rata by
-- DECLARED content when the refiner melted several of the order's lots
-- together - and the figures adopting that share would write onto OUR lot.
-- Customer payout is always priced on OUR figures (never the refiner's), so
-- nothing here writes anything: POST /api/orders/:id/adopt_assay takes the
-- figures an employee confirms, never a recomputation of this read.
--
-- `product_name`, `form`, `metal_id`, `name` and `reference` are derived the
-- same way view.sql derives them, so the dialog names a lot exactly as the
-- order screen does ("Lot 2481-A", "14K Gold"; R-4), and `line_reference` is
-- the refiner's own line ("ELM-88433").
WITH seated AS (
  SELECT l.*,
         row_number() OVER (PARTITION BY l.order_id ORDER BY l.created_at ASC, l.id ASC) AS seat
    FROM orders.lots l
   WHERE l.order_id = $1
),
batched AS (
  SELECT ol.id, ol.lot_id, ol.seat, li.declared_content, ls.lot_id AS refiner_lot_id
    FROM seated ol
    JOIN inventory.lots li ON li.id = ol.lot_id
    JOIN inventory.lot_sources ls ON ls.source_lot_id = ol.lot_id AND ls.kind = 'batch'
),
grouped AS (
  SELECT refiner_lot_id, sum(COALESCE(declared_content, 0)) AS total_declared, count(*) AS n
    FROM batched
   GROUP BY refiner_lot_id
),
shared AS (
  SELECT b.id, b.lot_id, b.seat, b.refiner_lot_id,
         CASE WHEN g.total_declared > 0
              THEN COALESCE(b.declared_content, 0) / g.total_declared
              ELSE 1.0 / g.n END AS share
    FROM batched b
    JOIN grouped g ON g.refiner_lot_id = b.refiner_lot_id
)
SELECT jsonb_build_object(
         'lots', COALESCE(
           (SELECT jsonb_agg(
                     jsonb_build_object(
                       'id', s.id,
                       'lot_id', s.lot_id,
                       'current', jsonb_build_object(
                         'pre_melt', li.pre_melt, 'post_melt', li.post_melt,
                         'purity', li.purity, 'unit', li.unit, 'premium', li.premium),
                       'refiner', jsonb_build_object(
                         'pre_melt', rl.pre_melt, 'post_melt', rl.post_melt,
                         'purity', rl.purity, 'unit', rl.unit, 'premium', rl.premium),
                       'reference', 'Lot ' || o.number || '-' || chr(64 + s.seat::int),
                       'name', COALESCE(b.name,
                                     (SELECT p.label || ' ' || li.metal_id
                                        FROM metals.purity_labels p
                                       WHERE p.metal_id = li.metal_id
                                         AND abs(p.purity - li.purity) <= p.tolerance
                                       ORDER BY abs(p.purity - li.purity)
                                       LIMIT 1),
                                     li.metal_id),
                       'line_reference', rl.line_reference,
                       'product_name', b.name,
                       'form', COALESCE(b.type, 'Scrap'),
                       'metal_id', li.metal_id,
                       'share', s.share,
                       'proposed', jsonb_build_object(
                         'pre_melt', CASE WHEN rl.pre_melt IS NULL THEN NULL
                                          ELSE rl.pre_melt * s.share END,
                         'post_melt', CASE WHEN rl.post_melt IS NULL THEN NULL
                                           ELSE rl.post_melt * s.share END,
                         'purity', rl.purity,
                         'unit', COALESCE(rl.unit, li.unit),
                         'premium', li.premium))
                     ORDER BY s.id ASC)
              FROM shared s
              JOIN inventory.lots li ON li.id = s.lot_id
              JOIN inventory.lots rl ON rl.id = s.refiner_lot_id
              JOIN orders.orders o ON o.id = $1
              LEFT JOIN products.bullion b ON b.id = li.bullion_id),
           '[]'::jsonb)
       ) AS proposal

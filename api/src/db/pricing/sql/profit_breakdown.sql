-- The admin margin report for one order, in one read.  $1 = order_id.
--
-- Three parties own the fine metal in a purchase order, and TWO spot feeds
-- price it: the customer was paid at the order's own frozen bid
-- (orders.spots), while Dorado and the refiner settle against the refiner's
-- (refiners.spots). The gap between those two feeds, over the ounces the
-- customer was paid for, is Dorado's spot_net.
--
-- The split itself is two premiums:
--   d = what Dorado paid the customer, as a fraction of spot
--   r = what the refiner pays Dorado, as a fraction of spot
-- Either one standing alone fills in for the other; neither means both are 1
-- (the customer takes it all). Clamped into [0,1], the three shares are
--   customer = d,  dorado = max(r - d, 0),  refiner = 1 - max(d, r)
-- which always sums to exactly 1. The old TypeScript reached the same three
-- numbers by computing customer/dorado/refiner and then renormalising when
-- they missed 1 by more than 1e-9; the renormalisation only ever fired for
-- r < d, and this is its closed form.
--
-- Dorado's and the refiner's ounces come off the refiner's ASSAY where there
-- is one (refiners.items), because that is the metal that actually arrived;
-- the customer was paid on the declared weight either way.
WITH ord AS (
  SELECT o.id FROM orders.orders o WHERE o.id = $1::uuid
),
order_spot AS (
  SELECT DISTINCT ON (s.metal_id) s.metal_id, s.bid
    FROM orders.spots s
   WHERE s.order_id = $1::uuid
   ORDER BY s.metal_id, s.id
),
refiner_spot AS (
  SELECT DISTINCT ON (s.metal_id) s.metal_id, s.bid
    FROM refiners.spots s
   WHERE s.order_id = $1::uuid
   ORDER BY s.metal_id, s.id
),
assay AS (
  SELECT DISTINCT ON (ri.order_item_id)
         ri.order_item_id, ri.content, ri.post_melt, ri.purity, ri.premium
    FROM refiners.items ri
    JOIN orders.items oi ON oi.id = ri.order_item_id
   WHERE oi.order_id = $1::uuid
   ORDER BY ri.order_item_id, ri.id
),
-- A line's declared content: scrap is weighed once, a product is per-unit.
-- The join to metals.metals is what used to be a hardcoded four-name list.
lines AS (
  SELECT oi.id,
         oi.metal_id,
         (oi.bullion_id IS NULL) AS is_scrap,
         CASE WHEN oi.bullion_id IS NULL THEN COALESCE(oi.content, 0)
              ELSE COALESCE(oi.content, 0) * COALESCE(oi.quantity, 1) END
           AS base_content,
         oi.premium AS dorado_premium,
         a.premium  AS refiner_premium,
         CASE WHEN oi.bullion_id IS NULL
              THEN COALESCE(a.content, a.post_melt * a.purity) END AS assayed_content
    FROM orders.items oi
    JOIN ord ON ord.id = oi.order_id
    JOIN metals.metals m ON m.id = oi.metal_id
    LEFT JOIN assay a ON a.order_item_id = oi.id
),
-- The rate band is earned by the WHOLE order's scrap ounces in that metal,
-- counted before the empty lines are dropped.
scrap_oz AS (
  SELECT l.metal_id, sum(l.base_content) AS total
    FROM lines l WHERE l.is_scrap GROUP BY l.metal_id
),
banded AS (
  SELECT l.*, band.scrap_pct AS band_premium
    FROM lines l
    LEFT JOIN scrap_oz z ON z.metal_id = l.metal_id
    LEFT JOIN LATERAL (
           SELECT r.scrap_pct
             FROM rates.rates r
            WHERE l.is_scrap
              AND r.metal_id = l.metal_id
            ORDER BY (COALESCE(z.total, 0) >= r.min_qty
                      AND (r.max_qty IS NULL OR COALESCE(z.total, 0) <= r.max_qty)) DESC,
                     CASE WHEN COALESCE(z.total, 0) >= r.min_qty
                               AND (r.max_qty IS NULL OR COALESCE(z.total, 0) <= r.max_qty)
                          THEN r.min_qty END ASC NULLS LAST,
                     CASE WHEN COALESCE(z.total, 0) < (SELECT min(r2.min_qty)
                                                         FROM rates.rates r2
                                                        WHERE r2.metal_id = l.metal_id)
                          THEN r.min_qty END ASC NULLS LAST,
                     r.min_qty DESC,
                     r.id ASC
            LIMIT 1
         ) band ON TRUE
   WHERE l.base_content <> 0
),
split AS (
  SELECT b.id, b.metal_id, b.is_scrap, b.base_content,
         LEAST(GREATEST(
           COALESCE(b.dorado_premium, b.band_premium, b.refiner_premium, 1), 0), 1) AS d,
         LEAST(GREATEST(
           COALESCE(b.refiner_premium, b.dorado_premium, b.band_premium, 1), 0), 1) AS r,
         CASE WHEN b.is_scrap THEN COALESCE(b.assayed_content, b.base_content)
              ELSE b.base_content END AS basis
    FROM banded b
),
owned AS (
  SELECT s.metal_id, s.is_scrap,
         s.base_content * s.d                       AS customer_content,
         s.basis * (1 - GREATEST(s.d, s.r))         AS refiner_content,
         s.basis - s.base_content * s.d - s.basis * (1 - GREATEST(s.d, s.r))
                                                    AS dorado_content
    FROM split s
),
per_metal AS (
  SELECT c.category, o.metal_id,
         sum(o.customer_content) AS customer_content,
         sum(o.dorado_content)   AS dorado_content,
         sum(o.refiner_content)  AS refiner_content
    FROM (VALUES ('scrap'), ('bullion'), ('total')) AS c(category)
    JOIN owned o
      ON c.category = 'total'
      OR (c.category = 'scrap' AND o.is_scrap)
      OR (c.category = 'bullion' AND NOT o.is_scrap)
   GROUP BY c.category, o.metal_id
),
shares AS (
  SELECT p.category, x.party, p.metal_id, x.content,
         CASE WHEN p.customer_content + p.dorado_content + p.refiner_content = 0 THEN 0
              ELSE x.content
                   / (p.customer_content + p.dorado_content + p.refiner_content) * 100
         END AS percentage,
         x.content * x.bid AS profit
    FROM per_metal p
    LEFT JOIN order_spot   os ON os.metal_id = p.metal_id
    LEFT JOIN refiner_spot rs ON rs.metal_id = p.metal_id
   CROSS JOIN LATERAL (VALUES
           ('customer', p.customer_content, COALESCE(os.bid, 0)),
           ('dorado',   p.dorado_content,   COALESCE(rs.bid, 0)),
           ('refiner',  p.refiner_content,  COALESCE(rs.bid, 0))
         ) AS x(party, content, bid)
),
-- Dorado keeps the difference between the two feeds on every ounce the
-- customer was paid for. A metal with only one of the two feeds priced earns
-- nothing here rather than being valued at zero.
spot_net AS (
  SELECT COALESCE(sum(p.customer_content * (rs.bid - os.bid)), 0) AS dorado
    FROM per_metal p
    JOIN order_spot   os ON os.metal_id = p.metal_id AND os.bid IS NOT NULL
    JOIN refiner_spot rs ON rs.metal_id = p.metal_id AND rs.bid IS NOT NULL
   WHERE p.category = 'total' AND p.customer_content <> 0
),
fees AS (
  SELECT COALESCE((SELECT COALESCE(t.shipping_fee_actual, 0)
                     FROM orders.transactions t WHERE t.order_id = $1::uuid), 0)
           AS dorado_shipping,
         COALESCE((SELECT COALESCE(sh.cost, 0)
                     FROM shipping.shipments sh
                     JOIN fulfillments.shipments fs ON fs.shipment_id = sh.id
                     JOIN fulfillments.fulfillments f ON f.id = fs.fulfillment_id
                    WHERE f.order_id = $1::uuid AND sh.direction <> 'Return'
                    ORDER BY sh.created_at ASC, sh.id ASC
                    LIMIT 1), 0)
           AS customer_shipping,
         COALESCE((SELECT COALESCE(t.refiner_fee, 0)
                     FROM orders.transactions t WHERE t.order_id = $1::uuid), 0)
           AS refiner_fee,
         COALESCE((SELECT CASE WHEN t.waive_payout_fee = true THEN 0
                               ELSE COALESCE(t.payout_fee, 0) END
                     FROM orders.transactions t
                     JOIN payments.details d ON d.id = t.payout_details_id
                    WHERE t.order_id = $1::uuid), 0)
           AS payout_fee
),
metals_profit AS (
  SELECT s.party, sum(s.profit) AS profit
    FROM shares s WHERE s.category = 'total' GROUP BY s.party
),
parties AS (
  SELECT w.party,
         COALESCE(mp.profit, 0) AS metals_profit,
         CASE w.party WHEN 'refiner' THEN 0
                      WHEN 'dorado'  THEN f.customer_shipping - f.dorado_shipping
                      ELSE                f.dorado_shipping - f.customer_shipping
         END AS shipping_net,
         CASE w.party WHEN 'refiner' THEN 0
                      WHEN 'dorado'  THEN -abs(f.refiner_fee)
                      ELSE                -abs(f.payout_fee)
         END AS refiner_fee_net,
         CASE WHEN w.party = 'dorado' THEN sn.dorado ELSE 0 END AS spot_net,
         CASE w.party
           WHEN 'refiner' THEN COALESCE(mp.profit, 0)
           WHEN 'dorado'  THEN COALESCE(mp.profit, 0) + sn.dorado
                               - (f.dorado_shipping - f.customer_shipping)
                               - f.refiner_fee
           ELSE                COALESCE(mp.profit, 0)
                               - f.customer_shipping - f.payout_fee
         END AS total_profit
    FROM (VALUES ('customer'), ('dorado'), ('refiner')) AS w(party)
   CROSS JOIN fees f
   CROSS JOIN spot_net sn
    LEFT JOIN metals_profit mp ON mp.party = w.party
)
SELECT jsonb_build_object(
         'order_id', ord.id,
         'spots_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'shares', COALESCE(
           (SELECT jsonb_agg(
                     jsonb_build_object(
                       'party', s.party,
                       'category', s.category,
                       'metal_id', s.metal_id,
                       'content', s.content,
                       'percentage', s.percentage,
                       'profit', s.profit)
                     ORDER BY s.category, s.party, s.metal_id)
              FROM shares s),
           '[]'::jsonb),
         'parties', (SELECT jsonb_agg(
                       jsonb_build_object(
                         'party', p.party,
                         'metals_profit', p.metals_profit,
                         'shipping_net', p.shipping_net,
                         'refiner_fee_net', p.refiner_fee_net,
                         'spot_net', p.spot_net,
                         'total_profit', p.total_profit)
                       ORDER BY p.party)
                       FROM parties p)
       ) AS breakdown
  FROM ord

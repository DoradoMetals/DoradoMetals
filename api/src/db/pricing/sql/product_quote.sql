SELECT jsonb_build_object(
         'bullion_id', b.id,
         'side', $2::text,
         'spots_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'quantity', $3::numeric,
         'metal_id', b.metal_id,
         'content', b.content,
         'premium', premium,
         'unit_price', unit_price,
         'line_total', unit_price * $3::numeric
       ) AS quote
  FROM products.bullion b
  JOIN spots.resolved s ON s.metal_id = b.metal_id
 CROSS JOIN LATERAL (
         SELECT CASE WHEN $2::text = 'ask' THEN b.ask_premium ELSE b.bid_premium END AS premium,
                CASE WHEN $2::text = 'ask' THEN s.ask ELSE s.bid END AS spot
       ) side
 CROSS JOIN LATERAL (SELECT b.content * (side.spot * side.premium) AS unit_price) priced
 WHERE b.id = $1::uuid
   AND ($2::text <> 'ask' OR b.display = true)
   AND side.spot IS NOT NULL

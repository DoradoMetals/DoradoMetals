SELECT s.metal_id AS id,
       COALESCE(ov.ask, s.ask) AS ask,
       COALESCE(ov.bid, s.bid) AS bid,
       s.percent_change, s.dollar_change, s.updated_at,
       CASE
         WHEN ov.metal_id IS NOT NULL THEN 'manual'
         WHEN s.updated_at < now() - make_interval(secs =>
                (SELECT st.stale_after_seconds FROM spots.settings st LIMIT 1))
           THEN 'stale'
         ELSE 'live'
       END AS source
  FROM spots.spots s
  LEFT JOIN spots.overrides ov
         ON ov.metal_id = s.metal_id
        AND (ov.expires_at IS NULL OR ov.expires_at > now())
 ORDER BY array_position(ARRAY['Gold','Silver','Platinum','Palladium'], s.metal_id)
            NULLS LAST,
          s.metal_id ASC

SELECT s.metal_id AS id, s.ask, s.bid, s.percent_change, s.dollar_change
  FROM spots.spots s
 ORDER BY array_position(ARRAY['Gold','Silver','Platinum','Palladium'], s.metal_id)
            NULLS LAST,
          s.metal_id ASC

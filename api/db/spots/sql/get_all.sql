SELECT m.id, m.name, s.ask, s.bid, s.percent_change, s.dollar_change
  FROM spots.spots s
  JOIN metals.metals m ON m.id = s.metal_id
 ORDER BY array_position(ARRAY['Gold','Silver','Platinum','Palladium'], m.name)
            NULLS LAST,
          m.id ASC

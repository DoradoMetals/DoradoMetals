-- Every live quote, one per metal, in the order the ticker prints them.
-- The metal is JOINED here rather than composed in JS: four rows, one index
-- lookup, and `id` is the METAL's id because a quote has no life apart from
-- the metal it prices.
SELECT m.id, m.name, s.ask, s.bid, s.percent_change, s.dollar_change
  FROM spots.spots s
  JOIN metals.metals m ON m.id = s.metal_id
 ORDER BY array_position(ARRAY['Gold','Silver','Platinum','Palladium'], m.name)
            NULLS LAST,
          m.id ASC

-- Every live quote, one row per metal.
--
-- NO JOIN. The implementation this replaces joined metals.metals for the name
-- and ordered by it; the name is attached in compose.ts from one read of four
-- rows, and the ordering goes with it.
SELECT metal_id, ask, bid, percent_change, dollar_change, updated_at
  FROM spots.spots

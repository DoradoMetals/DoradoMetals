-- One live quote for one metal, keyed on metal_id (the service resolves the name to id).
-- COALESCE, not assignment: a metal missing from the feed arrives null and keeps its previous price - a blank spot would price every scrap line at zero.
INSERT INTO spots.spots (metal_id, ask, bid, dollar_change, percent_change)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (metal_id) DO UPDATE SET
  ask            = COALESCE(EXCLUDED.ask,            spots.spots.ask),
  bid            = COALESCE(EXCLUDED.bid,            spots.spots.bid),
  dollar_change  = COALESCE(EXCLUDED.dollar_change,  spots.spots.dollar_change),
  percent_change = COALESCE(EXCLUDED.percent_change, spots.spots.percent_change)

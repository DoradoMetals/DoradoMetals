-- One live quote for one metal.
--
-- KEYED ON metal_id, not on the metal's NAME. The implementation this replaces
-- joined metals.metals inside the INSERT to turn a name into an id, which put a
-- second table inside a write to this one. The service resolves the name now.
--
-- COALESCE, not assignment: a metal missing from the feed arrives as null and
-- keeps its previous price rather than having it blanked. That is the behaviour
-- that matters most here - a blank spot prices every scrap line at zero.
INSERT INTO spots.spots (metal_id, ask, bid, dollar_change, percent_change)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (metal_id) DO UPDATE SET
  ask            = COALESCE(EXCLUDED.ask,            spots.spots.ask),
  bid            = COALESCE(EXCLUDED.bid,            spots.spots.bid),
  dollar_change  = COALESCE(EXCLUDED.dollar_change,  spots.spots.dollar_change),
  percent_change = COALESCE(EXCLUDED.percent_change, spots.spots.percent_change)

-- One live quote for one metal - the writer reads spots.spots first and only
-- calls this for a metal_id with no row yet.
INSERT INTO spots.spots (metal_id, ask, bid, dollar_change, percent_change)
VALUES ($1, $2, $3, $4, $5)

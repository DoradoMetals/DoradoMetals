-- One tick, one statement. The per-side change pair is derived HERE and not in
-- TypeScript: the provider sends one dollar move for the metal, both sides
-- move by it, and the percent differs because each side's base differs.
INSERT INTO spots.spots (metal_id, ask, bid, dollar_change, percent_change,
                         bid_dollar_change, bid_percent_change,
                         ask_dollar_change, ask_percent_change)
SELECT $1, $2::numeric, $3::numeric, $4::numeric, $5::numeric,
       $4::numeric,
       CASE WHEN $3::numeric IS NULL OR $4::numeric IS NULL
                 OR $3::numeric - $4::numeric = 0 THEN NULL
            ELSE $4::numeric / ($3::numeric - $4::numeric) * 100 END,
       $4::numeric,
       CASE WHEN $2::numeric IS NULL OR $4::numeric IS NULL
                 OR $2::numeric - $4::numeric = 0 THEN NULL
            ELSE $4::numeric / ($2::numeric - $4::numeric) * 100 END
ON CONFLICT (metal_id) DO UPDATE
   SET ask = EXCLUDED.ask,
       bid = EXCLUDED.bid,
       dollar_change = EXCLUDED.dollar_change,
       percent_change = EXCLUDED.percent_change,
       bid_dollar_change = EXCLUDED.bid_dollar_change,
       bid_percent_change = EXCLUDED.bid_percent_change,
       ask_dollar_change = EXCLUDED.ask_dollar_change,
       ask_percent_change = EXCLUDED.ask_percent_change
RETURNING metal_id

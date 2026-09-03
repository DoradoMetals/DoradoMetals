-- Every live quote, one row per metal. NO JOIN - the metal name is attached in compose.ts instead.
SELECT metal_id, ask, bid, percent_change, dollar_change, updated_at
  FROM spots.spots

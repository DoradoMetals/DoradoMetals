-- The same quote against the schema still serving as record of truth.
--
-- exchange.metals carries the quote on the metal's own row and keys on its
-- NAME (the `type` column), so this takes the name where the new schema takes
-- an id. Same COALESCE, same reason.
UPDATE exchange.metals
   SET ask_spot       = COALESCE($2::numeric, ask_spot),
       bid_spot       = COALESCE($3::numeric, bid_spot),
       dollar_change  = COALESCE($4::numeric, dollar_change),
       percent_change = COALESCE($5::numeric, percent_change)
 WHERE type = $1

-- The same pickup in the schema still serving as record of truth, which hangs it
-- off an ORDER and names the carrier inline.
--
-- THE DATE AND TIME ARE COMBINED IN POSTGRES, not in JavaScript. The caller
-- passes them separately because that is what the FedEx call takes, and
-- `pickup_requested_at` is `timestamp WITHOUT time zone` - building a JS Date
-- from them would carry the process timezone into a column that has none.
--
-- A ready-made pickup_requested_at wins if one is given; otherwise the pair is
-- combined, and a missing time means midnight.
--
-- IT RETURNS THE TIMESTAMP IT COMPUTED, and that is what the new schema is
-- given. Recomputing `date + time` in JavaScript would reintroduce the process
-- timezone this statement exists to keep out, and reading it back afterwards
-- would be a READ in a repo that only writes.
INSERT INTO exchange.carrier_pickups (
  id, user_id, order_id, carrier, pickup_requested_at, pickup_status,
  confirmation_number, location
)
VALUES ($1, $2, $3, $7,
  COALESCE(
    $4::timestamp,
    CASE WHEN $5::text IS NOT NULL
         THEN $5::date + COALESCE($6::time, '00:00'::time)
    END
  ),
        $8, $9, $10)
RETURNING id, pickup_requested_at

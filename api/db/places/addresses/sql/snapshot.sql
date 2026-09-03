-- A frozen copy of an address as it is NOW - what an order records so that
-- editing or deleting the book row later cannot rewrite where a parcel went.
-- The same shape 031_backfill_orders.sql produced for the historical orders.
INSERT INTO places.addresses (
  line_1, line_2, city, state, country, zip,
  country_code, phone_number, created_at, updated_at, is_valid, is_residential
)
SELECT a.line_1, a.line_2, a.city, a.state, a.country, a.zip,
       a.country_code, a.phone_number, a.created_at, a.updated_at,
       a.is_valid, coalesce(a.is_residential, false)
  FROM places.addresses a WHERE a.id = $1
RETURNING id

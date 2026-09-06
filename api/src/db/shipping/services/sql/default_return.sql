-- The service a return label is bought on when the caller names none. Defaults
-- live in the database (ruling 76), so the choice is an ORDER BY rather than a
-- code spelled in TypeScript: a return-capable service first, then the carrier's
-- own display order. No row carries supports_returns today, which is why it
-- orders rather than filters - the day one does, it wins without a code change.
SELECT
       id, carrier_id, name, description, code, provider_code,
       supports_pickups  AS supports_pickup,
       supports_dropoffs AS supports_dropoff,
       supports_returns, supports_insurance,
       is_international, is_residential, is_active,
       max_weight_lb     AS max_weight_lbs,
       max_length_in, max_width_in, max_height_in, max_declared_value,
       min_transit_days, max_transit_days, display_order,
       created_by, updated_by, created_at, updated_at
  FROM shipping.services
 WHERE carrier_id IS NOT NULL AND is_active
 ORDER BY supports_returns DESC, display_order ASC NULLS LAST, name ASC, id ASC
 LIMIT 1

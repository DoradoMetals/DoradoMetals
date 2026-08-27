-- THREE COLUMNS ARE ALIASED BACK, AND THAT IS NOT TIDINESS.
--
-- The new layout renamed them; the wire shape must not change during a schema
-- migration, and the admin table and drawer in frontend/features/carriers read
-- the old names:
--
--   supports_pickups  -> supports_pickup
--   supports_dropoffs -> supports_dropoff
--   max_weight_lb     -> max_weight_lbs
--
-- created_by_id and updated_by_id are new here and are deliberately NOT
-- projected - exchange.carrier_services has no equivalent, so returning them
-- would be a wire change.
--
-- exchange ordered by name alone. Ties are real - 'Free', 'Overnight' and
-- 'Standard' each exist for both carriers - so id breaks them, or the same rows
-- come back in a different order run to run.
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
 ORDER BY name ASC, id ASC

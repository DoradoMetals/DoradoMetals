-- Three columns alias back to the names the wire still uses (supports_pickups/dropoffs, max_weight_lb) - the wire shape must not change during migration.
-- created_by_id/updated_by_id stay unprojected for the same reason. Ordered by name then id - ties are real ('Free', 'Overnight', 'Standard' exist per carrier), so id keeps the order stable.
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
 -- The carrier-agnostic sale rows are NOT this wire's - this is the admin
 -- per-carrier screen; see get_sale_options.sql for those.
 WHERE carrier_id IS NOT NULL
 ORDER BY name ASC, id ASC
